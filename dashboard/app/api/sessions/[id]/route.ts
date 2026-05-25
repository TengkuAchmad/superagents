import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SessionDetail {
  id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  label: string | null;
}

interface TaskRow {
  id: string;
  title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionDetail | undefined;
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  // All tasks in this session — useful for future drill-down.
  const tasks = db.prepare(`
    SELECT id, title, status, started_at, ended_at
    FROM tasks
    WHERE session_id = ?
    ORDER BY started_at ASC
  `).all(id) as TaskRow[];

  // All events in this session (flattened — session is the whole work block).
  const agentLog = db.prepare(`
    SELECT id, timestamp, agent_name, action, description, status, result, duration_ms, model,
           usage_input_tokens, usage_output_tokens, task_id
    FROM agent_log
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const toolCalls = db.prepare(`
    SELECT id, timestamp, agent_name, tool_name, parameters, result, status, task_id
    FROM tool_calls
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const memoryUpdates = db.prepare(`
    SELECT id, timestamp, entity_name, entity_type, observation, source_agent, task_id
    FROM memory_updates
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const positions = db.prepare(`
    SELECT node_id, x, y FROM session_node_positions WHERE session_id = ?
  `).all(id);

  const agentSet = new Set<string>();
  for (const r of agentLog as Array<{ agent_name: string }>) agentSet.add(r.agent_name);

  return NextResponse.json({
    session,
    tasks,
    agent_log: agentLog,
    tool_calls: toolCalls,
    memory_updates: memoryUpdates,
    node_positions: positions,
    agents_involved: Array.from(agentSet),
  });
}

interface PositionsBody {
  positions: Array<{ node_id: string; x: number; y: number }>;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as PositionsBody;
  if (!Array.isArray(body.positions)) {
    return NextResponse.json({ error: 'positions array required' }, { status: 400 });
  }
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO session_node_positions (session_id, node_id, x, y, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id, node_id) DO UPDATE SET
      x = excluded.x, y = excluded.y, updated_at = CURRENT_TIMESTAMP
  `);
  const txn = db.transaction((rows: PositionsBody['positions']) => {
    for (const p of rows) upsert.run(id, p.node_id, p.x, p.y);
  });
  txn(body.positions);
  return NextResponse.json({ saved: body.positions.length });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const res = db.prepare(`DELETE FROM session_node_positions WHERE session_id = ?`).run(id);
  return NextResponse.json({ deleted: res.changes });
}
