import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import {
  VARIANT_TO_ID,
  META_BY_ID,
  displayAgent,
  namedIdentityOf,
} from '@/lib/agent-registry';
import { getModelInfoForKey } from '@/lib/opencode-config';

export const dynamic = 'force-dynamic';

// ── Types ────────────────────────────────────────────────────────────────────

interface AggRow {
  agent_name: string;
  count: number;
  last_seen: string;
  last_model: string | null;
}

interface LatestRow {
  action: string | null;
  description: string | null;
  status: string | null;
  duration_ms: number | null;
}

interface RoutingRow {
  agent_name: string;
  description: string | null;
  result: string | null;
  status: string | null;
  duration_ms: number | null;
  timestamp: string;
}

interface CountRow { count: number }

interface PlanRow {
  plan_id: string;
  agent_name: string | null;
  title: string | null;
  progress_pct: number | null;
  status: string | null;
  updated_at: string;
}

// ── Role alias map (all spellings → canonical_id) ────────────────────────────

const ROLE_CANON: Record<string, string> = {
  orchestrator: 'orchestrator', atlas: 'orchestrator', prabowo: 'orchestrator',
  'prabowo-orchestrator': 'orchestrator', 'atlas-orchestrator': 'orchestrator',
  planner: 'planner', prometheus: 'planner', gibran: 'planner',
  'gibran-task-planner': 'planner', 'prometheus-planner': 'planner',
  executor: 'executor', sisyphus: 'executor', suharso: 'executor',
  'suharso-executor': 'executor', 'sisyphus-executor': 'executor',
  'task-runner': 'task-runner', 'task runner': 'task-runner',
  'sisyphus-junior': 'task-runner', dudung: 'task-runner',
  'dudung-task-runner': 'task-runner', 'task-runner-agent': 'task-runner',
  oracle: 'oracle', mahfud: 'oracle',
  'memory-keeper': 'memory-keeper', metis: 'memory-keeper', 'hasan-nasbi': 'memory-keeper',
  'metis-memory': 'memory-keeper', 'memory keeper': 'memory-keeper',
  chronicler: 'chronicler', momus: 'chronicler', 'andi-arief': 'chronicler',
  librarian: 'librarian', bakom: 'librarian',
  analyst: 'analyst', 'multimodal-looker': 'analyst',
  'init-project': 'init', init: 'init',
};

function resolveId(raw: string): string {
  const key = raw.toLowerCase().trim();
  return ROLE_CANON[key] ?? VARIANT_TO_ID[key] ?? key;
}

// ── Edge extraction ──────────────────────────────────────────────────────────

function extractTarget(description: string | null, result: string | null): string | null {
  const text = `${description ?? ''} ${result ?? ''}`.toLowerCase();
  // Order matters — more specific patterns first.
  const patterns: RegExp[] = [
    /rout(?:ed|ing)?\s+to\s+([a-z][\w-]*)/,
    /delegat\w*\s+to\s+([a-z][\w-]*)/,
    /assign(?:ed)?\s+to\s+([a-z][\w-]*)/,
    /handed?\s+off\s+to\s+([a-z][\w-]*)/,
    // `→ executor: …` — the colon/space terminator was a bug; the old `$`
    // anchor never matched real-world logs.
    /→\s*([a-z][\w-]*)/,
    /routed_to[:\s]+([a-z][\w-]*)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return ROLE_CANON[m[1]] ?? VARIANT_TO_ID[m[1]] ?? null;
  }
  return null;
}

function classifyEdge(action: string | null, status: string | null): 'delegate' | 'complete' | 'failed' {
  if (status === 'failed') return 'failed';
  if (action === 'complete' || status === 'completed') return 'complete';
  return 'delegate';
}

function parseTimestamp(ts: string): number {
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const taskId = searchParams.get('task_id') || null;
    const sessionId = searchParams.get('session_id') || null;

    const db = getDb();
    // Precedence: task > session > project. Task is most specific, then session,
    // then project. UI may pass either depending on the tab model in use.
    const scopeCol: 'task_id' | 'session_id' | 'project_id' | null =
      taskId ? 'task_id' :
      sessionId ? 'session_id' :
      projectId ? 'project_id' : null;
    const scopeVal: string | null = taskId ?? sessionId ?? projectId;
    const projectFilter = scopeCol ? `AND ${scopeCol} = ?` : '';
    const args: string[] = scopeVal ? [scopeVal] : [];

    // 1. Per-agent aggregates (incl. last logged model)
    const aggRows = db.prepare(`
      SELECT agent_name, COUNT(*) AS count, MAX(timestamp) AS last_seen,
             (
               SELECT model FROM agent_log a2
               WHERE a2.agent_name = agent_log.agent_name
                 ${scopeCol ? `AND a2.${scopeCol} = ?` : ''}
                 AND a2.model IS NOT NULL AND a2.model != ''
               ORDER BY a2.timestamp DESC LIMIT 1
             ) AS last_model
      FROM agent_log
      WHERE 1=1 ${projectFilter}
      GROUP BY agent_name
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `).all(...(scopeVal ? [scopeVal, scopeVal] : [])) as AggRow[];

    // 2. Latest log entry per agent
    const latestStmt = db.prepare(
      scopeCol
        ? `SELECT action, description, status, duration_ms FROM agent_log WHERE agent_name = ? AND ${scopeCol} = ? ORDER BY timestamp DESC LIMIT 1`
        : `SELECT action, description, status, duration_ms FROM agent_log WHERE agent_name = ? ORDER BY timestamp DESC LIMIT 1`,
    );

    // 3. Active plans (for progress ring)
    let activePlans: PlanRow[] = [];
    try {
      activePlans = db.prepare(`
        SELECT plan_id, agent_name, title, progress_pct, status, updated_at
        FROM planning_log
        WHERE status != 'done' ${projectFilter}
        ORDER BY updated_at DESC
      `).all(...args) as PlanRow[];
    } catch { /* table might be brand new */ }

    const planByAgent = new Map<string, PlanRow>();
    for (const p of activePlans) {
      if (!p.agent_name) continue;
      const id = resolveId(p.agent_name);
      if (!planByAgent.has(id)) planByAgent.set(id, p);
    }

    // 4. Build nodes
    const now = Date.now();
    const nodes = aggRows.map((row) => {
      const latest = (
        scopeVal ? latestStmt.get(row.agent_name, scopeVal) : latestStmt.get(row.agent_name)
      ) as LatestRow | undefined;

      const canonId = resolveId(row.agent_name);
      const meta = META_BY_ID[canonId];
      const disp = displayAgent(row.agent_name);

      const ageMin = (now - parseTimestamp(row.last_seen)) / 60_000;
      let status: string;
      if (ageMin < 2) status = 'started';
      else if (latest?.status === 'failed') status = 'failed';
      else if (latest?.status === 'completed') status = 'completed';
      else status = 'idle';

      const modelInfo = meta ? getModelInfoForKey(meta.opencode_key) : null;
      const model = row.last_model || modelInfo?.model || '';
      const fallbackModels = modelInfo?.fallback_models ?? [];

      const activePlan = planByAgent.get(canonId);

      return {
        id: canonId,
        label: meta?.label ?? row.agent_name,
        named_identity: disp.identity,
        role_label: meta?.label ?? 'Agent',
        role: meta?.role ?? 'Agent',
        icon: meta?.icon ?? '🤖',
        color: meta?.color ?? '#64748b',
        count: row.count,
        status,
        action: latest?.action ?? '',
        description: latest?.description ? latest.description.slice(0, 60) : '',
        last_seen: row.last_seen,
        last_duration_ms: latest?.duration_ms ?? null,
        model,
        fallback_models: fallbackModels,
        config_model: modelInfo?.model ?? null,
        active_plan: activePlan
          ? {
              plan_id: activePlan.plan_id,
              title: activePlan.title,
              pct: activePlan.progress_pct ?? 0,
              status: activePlan.status,
            }
          : null,
      };
    });

    // 5. Edges
    const routingRows = db.prepare(`
      SELECT agent_name, description, result, status, duration_ms, timestamp
      FROM agent_log
      WHERE (
        action IN ('route', 'complete', 'delegate', 'decompose', 'execute_plan')
        OR description LIKE '%→%'
        OR description LIKE '%routing to%'
        OR description LIKE '%routed to%'
        OR description LIKE '%delegat%'
      )
      AND timestamp > datetime('now', '-24 hours')
      ${projectFilter}
      ORDER BY timestamp DESC
      LIMIT 500
    `).all(...args) as RoutingRow[];

    interface EdgeAgg {
      count: number;
      status: string;
      action: string;
      route_type: 'delegate' | 'complete' | 'failed';
      total_duration_ms: number;
      duration_samples: number;
      last_ts: string;
    }
    const edgeMap = new Map<string, EdgeAgg>();
    for (const r of routingRows) {
      const srcId = resolveId(r.agent_name);
      const tgtId = extractTarget(r.description, r.result);
      if (!tgtId || tgtId === srcId) continue;

      const key = `${srcId}→${tgtId}`;
      const rt = classifyEdge(null, r.status);
      const dur = r.duration_ms ?? 0;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.count++;
        if (dur > 0) { existing.total_duration_ms += dur; existing.duration_samples++; }
        if (r.status === 'started' || r.status === 'in_progress') existing.status = 'started';
        if (rt === 'failed') existing.route_type = 'failed';
        if (r.timestamp > existing.last_ts) existing.last_ts = r.timestamp;
      } else {
        edgeMap.set(key, {
          count: 1,
          status: r.status === 'started' ? 'started' : 'completed',
          action: r.description?.slice(0, 40) ?? 'route',
          route_type: rt,
          total_duration_ms: dur,
          duration_samples: dur > 0 ? 1 : 0,
          last_ts: r.timestamp,
        });
      }
    }

    const edges = Array.from(edgeMap.entries()).map(([key, val]) => {
      const [source, target] = key.split('→');
      const avg = val.duration_samples > 0 ? Math.round(val.total_duration_ms / val.duration_samples) : null;
      return {
        source, target,
        action: val.action,
        count: val.count,
        status: val.status,
        route_type: val.route_type,
        avg_duration_ms: avg,
        last_ts: val.last_ts,
      };
    });

    // 6. Total action count
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS count FROM agent_log WHERE 1=1 ${projectFilter}`,
    ).get(...args) as CountRow;

    // 7. Deduplicate canonical ids
    const nodeMap = new Map<string, typeof nodes[0]>();
    for (const node of nodes) {
      const existing = nodeMap.get(node.id);
      if (!existing) {
        nodeMap.set(node.id, node);
      } else {
        existing.count += node.count;
        if (node.last_seen > existing.last_seen) {
          existing.last_seen = node.last_seen;
          existing.status = node.status;
          existing.action = node.action;
          existing.description = node.description;
          if (node.model) existing.model = node.model;
        }
      }
    }

    // 8. Static workflow edges (overlay) — derived from oh-my-openagent.json roles
    const staticEdges = [
      { source: 'orchestrator', target: 'planner' },
      { source: 'orchestrator', target: 'executor' },
      { source: 'orchestrator', target: 'task-runner' },
      { source: 'orchestrator', target: 'oracle' },
      { source: 'orchestrator', target: 'memory-keeper' },
      { source: 'orchestrator', target: 'librarian' },
      { source: 'planner', target: 'executor' },
      { source: 'executor', target: 'librarian' },
      { source: 'executor', target: 'memory-keeper' },
    ];

    // include named identities for the agent registry so static workflow overlay can render even with no logs yet
    const allKnownAgents = Object.values(META_BY_ID).map(m => ({
      id: m.canonical_id,
      label: m.label,
      named_identity: namedIdentityOf(m),
      role: m.role,
      icon: m.icon,
      color: m.color,
      opencode_key: m.opencode_key,
      config_model: getModelInfoForKey(m.opencode_key)?.model ?? null,
      fallback_models: getModelInfoForKey(m.opencode_key)?.fallback_models ?? [],
    }));

    return NextResponse.json({
      nodes: Array.from(nodeMap.values()),
      edges,
      static_edges: staticEdges,
      registry: allKnownAgents,
      last_updated: new Date().toISOString(),
      total_actions: totalRow.count ?? 0,
    });
  } catch (error) {
    console.error('agent-graph error:', error);
    return NextResponse.json(
      { nodes: [], edges: [], static_edges: [], registry: [], last_updated: new Date().toISOString(), total_actions: 0, error: String(error) },
      { status: 500 },
    );
  }
}
