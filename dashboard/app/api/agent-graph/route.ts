import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { VARIANT_TO_ID, META_BY_ID } from '@/lib/agent-registry';

// ── Types ────────────────────────────────────────────────────────────────────

interface AggRow {
  agent_name: string;
  count: number;
  last_seen: string;
}

interface LatestRow {
  action: string | null;
  description: string | null;
  status: string | null;
}

interface RoutingRow {
  agent_name: string;
  description: string | null;
  result: string | null;
  status: string | null;
}

interface CountRow {
  count: number;
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

// ── Edge extraction from routing log entries ─────────────────────────────────

function extractTarget(description: string | null, result: string | null): string | null {
  const text = `${description ?? ''} ${result ?? ''}`.toLowerCase();

  // "Routing to planner", "routed to oracle"
  const m1 = text.match(/rout(?:ed|ing)?\s+to\s+([a-z-]+)/);
  if (m1) return ROLE_CANON[m1[1]] ?? VARIANT_TO_ID[m1[1]] ?? null;

  // "summary → executor" at end
  const m2 = text.match(/→\s*([a-z-]+)\s*$/);
  if (m2) return ROLE_CANON[m2[1]] ?? VARIANT_TO_ID[m2[1]] ?? null;

  // "routed_to: planner" in result JSON
  const m3 = text.match(/routed_to[:\s]+([a-z-]+)/);
  if (m3) return ROLE_CANON[m3[1]] ?? VARIANT_TO_ID[m3[1]] ?? null;

  return null;
}

function parseTimestamp(ts: string): number {
  // SQLite stores "YYYY-MM-DD HH:MM:SS" without Z
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;

    const db = getDb(true);
    const projectFilter = projectId ? 'AND project_id = ?' : '';
    const args: string[] = projectId ? [projectId] : [];

    // 1. Per-agent aggregates
    const aggRows = db.prepare(`
      SELECT agent_name, COUNT(*) AS count, MAX(timestamp) AS last_seen
      FROM agent_log
      WHERE 1=1 ${projectFilter}
      GROUP BY agent_name
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `).all(...args) as AggRow[];

    // 2. Latest log entry per agent (separate stmt to avoid N+1 complexity)
    const latestStmt = db.prepare(
      projectId
        ? `SELECT action, description, status FROM agent_log WHERE agent_name = ? AND project_id = ? ORDER BY timestamp DESC LIMIT 1`
        : `SELECT action, description, status FROM agent_log WHERE agent_name = ? ORDER BY timestamp DESC LIMIT 1`
    );

    // 3. Build nodes
    const now = Date.now();
    const nodes = aggRows.map((row) => {
      const latest = (
        projectId ? latestStmt.get(row.agent_name, projectId) : latestStmt.get(row.agent_name)
      ) as LatestRow | undefined;

      const canonId = resolveId(row.agent_name);
      const meta = META_BY_ID[canonId];

      // Active if last seen < 2 minutes ago
      const ageMin = (now - parseTimestamp(row.last_seen)) / 60_000;
      let status: string;
      if (ageMin < 2) {
        status = 'started';
      } else if (latest?.status === 'failed') {
        status = 'failed';
      } else if (latest?.status === 'completed') {
        status = 'completed';
      } else {
        status = 'idle';
      }

      return {
        id: canonId,
        label: meta?.label ?? row.agent_name,
        role: meta?.role ?? 'Agent',
        icon: meta?.icon ?? '🤖',
        color: meta?.color ?? '#64748b',
        count: row.count,
        status,
        action: latest?.action ?? '',
        description: latest?.description ? latest.description.slice(0, 60) : '',
        last_seen: row.last_seen,
      };
    });

    // 4. Routing edges — parse delegation logs from last 24 hours
    const routingRows = db.prepare(`
      SELECT agent_name, description, result, status
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

    const edgeMap = new Map<string, { count: number; status: string; action: string }>();
    for (const r of routingRows) {
      const srcId = resolveId(r.agent_name);
      const tgtId = extractTarget(r.description, r.result);
      if (!tgtId || tgtId === srcId) continue;

      const key = `${srcId}→${tgtId}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.count++;
        if (r.status === 'started' || r.status === 'in_progress') existing.status = 'started';
      } else {
        edgeMap.set(key, {
          count: 1,
          status: r.status === 'started' ? 'started' : 'completed',
          action: r.description?.slice(0, 40) ?? 'route',
        });
      }
    }

    const edges = Array.from(edgeMap.entries()).map(([key, val]) => {
      const [source, target] = key.split('→');
      return { source, target, action: val.action, count: val.count, status: val.status };
    });

    // 5. Total action count
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS count FROM agent_log WHERE 1=1 ${projectFilter}`
    ).get(...args) as CountRow;

    // Deduplicate: multiple agent_name variants may resolve to same canonical_id
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
        }
      }
    }

    return NextResponse.json({
      nodes: Array.from(nodeMap.values()),
      edges,
      last_updated: new Date().toISOString(),
      total_actions: totalRow.count ?? 0,
    });
  } catch (error) {
    console.error('agent-graph error:', error);
    return NextResponse.json(
      { nodes: [], edges: [], last_updated: new Date().toISOString(), total_actions: 0, error: String(error) },
      { status: 500 }
    );
  }
}
