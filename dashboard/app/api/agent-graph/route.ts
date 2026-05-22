import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { AGENT_REGISTRY, META_BY_ID, normalizeAgent } from '@/lib/agent-registry';

interface LogRow {
  agent_name: string;
  action: string;
  description: string;
  result: string;
  status: string;
  timestamp: string;
}

/** Map any status variant to the 4 canonical values */
function normalizeStatus(s: string): 'started' | 'completed' | 'failed' | 'idle' {
  if (!s) return 'idle';
  const v = s.toLowerCase();
  if (v === 'started' || v === 'in_progress' || v === 'running' || v === 'partial') return 'started';
  if (v === 'completed' || v === 'success' || v === 'done') return 'completed';
  if (v === 'failed' || v === 'error') return 'failed';
  return 'idle';
}

/**
 * Extract routing target from a log row using multiple patterns:
 * 1. "routing to gibran"  /  "routed to suharso"
 * 2. "→ gibran-task-planner" at end of description
 * 3. "routed_to: suharso" in result field
 * 4. Action-based inference (decompose → gibran, delegate → suharso)
 */
function extractTarget(row: LogRow, sourceId: string): string | null {
  const desc = row.description ?? '';
  const result = row.result ?? '';
  const action = (row.action ?? '').toLowerCase();

  // Pattern 1: "routing to X" / "routed to X" / "delegated to X"
  const p1 = desc.match(/(?:routing|routed|delegating|delegated|dispatch(?:ing|ed)?)\s+to\s+([\w-]+)/i)?.[1];
  if (p1) return normalizeAgent(p1);

  // Pattern 2: "→ X" at end of description
  const p2 = desc.match(/→\s*([\w-]+)\s*$/)?.[1];
  if (p2) {
    const t = normalizeAgent(p2);
    // Skip if the arrow points at a project path, not an agent
    if (META_BY_ID[t]) return t;
  }

  // Pattern 3: result contains "routed_to: X"
  const p3 = result.match(/routed_to:\s*([\w-]+)/i)?.[1];
  if (p3) return normalizeAgent(p3);

  // Pattern 4: action-based inference for prabowo
  if (sourceId === 'prabowo') {
    if (action === 'decompose' || action === 'plan' || action.includes('plan')) return 'gibran';
    if (action === 'delegate' || action === 'execute_plan') return 'suharso';
    if (action === 'escalation' || action === 'retry') return 'mahfud';
  }

  // Pattern 5: gibran delegates execution to suharso
  if (sourceId === 'gibran' && (action.includes('complete') || action.includes('delegate'))) {
    return 'suharso';
  }

  return null;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id');
  const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
  const dbPath = path.join(home, '.config', 'opencode', 'agent-data', 'agent.db');

  // ── Seed all known agents as idle nodes ──────────────────────────────────────
  const nodeMap = new Map(
    AGENT_REGISTRY.map((a) => [
      a.canonical_id,
      {
        id: a.canonical_id,
        label: a.label,
        role: a.role,
        color: a.color,
        icon: a.icon,
        status: 'idle' as string,
        action: '',
        count: 0,
        last_seen: '',
      },
    ])
  );

  const edgeMap = new Map<string, {
    source: string; target: string; action: string; count: number; status: string;
  }>();

  let totalActions = 0;

  try {
    const db = new Database(dbPath, { readonly: true });

    const sql = projectId
      ? `SELECT agent_name, action, description, result, status, timestamp
         FROM agent_log WHERE project_id = ? ORDER BY timestamp DESC LIMIT 300`
      : `SELECT agent_name, action, description, result, status, timestamp
         FROM agent_log ORDER BY timestamp DESC LIMIT 300`;

    const rows = (projectId ? db.prepare(sql).all(projectId) : db.prepare(sql).all()) as LogRow[];
    db.close();
    totalActions = rows.length;

    for (const row of rows) {
      const agentId = normalizeAgent(row.agent_name);
      const status = normalizeStatus(row.status);
      const node = nodeMap.get(agentId);

      if (node) {
        node.count++;
        // Keep the most-recent status (rows are DESC so first hit = most recent)
        if (!node.last_seen || row.timestamp > node.last_seen) {
          node.status = status;
          node.action = row.action ?? '';
          node.last_seen = row.timestamp;
        }
      } else {
        // Unknown agent — add dynamically with fallback meta
        nodeMap.set(agentId, {
          id: agentId,
          label: agentId,
          role: 'Agent',
          color: '#475569',
          icon: '🤖',
          status,
          action: row.action ?? '',
          count: 1,
          last_seen: row.timestamp,
        });
      }

      // Build routing edges
      const targetId = extractTarget(row, agentId);
      if (targetId && targetId !== agentId) {
        const edgeKey = `${agentId}→${targetId}`;
        const ex = edgeMap.get(edgeKey);
        if (!ex) {
          edgeMap.set(edgeKey, {
            source: agentId,
            target: targetId,
            action: row.action ?? 'route',
            count: 1,
            status,
          });
        } else {
          ex.count++;
          // Escalate edge status if this row is more recent
          if (status === 'started') ex.status = 'started';
          else if (status === 'failed' && ex.status !== 'started') ex.status = 'failed';
        }

        // Ensure target node exists (may be seeded as idle already)
        if (!nodeMap.has(targetId)) {
          const meta = META_BY_ID[targetId];
          nodeMap.set(targetId, {
            id: targetId,
            label: meta?.label ?? targetId,
            role: meta?.role ?? 'Agent',
            color: meta?.color ?? '#475569',
            icon: meta?.icon ?? '🤖',
            status: 'idle',
            action: '',
            count: 0,
            last_seen: '',
          });
        }
      }
    }
  } catch {
    // DB unavailable — still return seeded idle nodes
  }

  return NextResponse.json({
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    last_updated: new Date().toISOString(),
    total_actions: totalActions,
  });
}
