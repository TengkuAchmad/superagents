import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface TaskDetail {
  id: string;
  session_id: string | null;
  project_id: string | null;
  title: string | null;
  summary: string | null;
  status: string;
  origin_prompt: string | null;
  started_at: string;
  ended_at: string | null;
  total_duration_ms: number;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const task = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskDetail | undefined;
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 });

  const agentLog = db.prepare(`
    SELECT id, timestamp, agent_name, action, description, status, result, duration_ms, model,
           usage_input_tokens, usage_output_tokens
    FROM agent_log
    WHERE task_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const toolCalls = db.prepare(`
    SELECT id, timestamp, agent_name, tool_name, parameters, result, status
    FROM tool_calls
    WHERE task_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const memoryUpdates = db.prepare(`
    SELECT id, timestamp, entity_name, entity_type, observation, source_agent
    FROM memory_updates
    WHERE task_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  const positions = db.prepare(`
    SELECT node_id, x, y FROM task_node_positions WHERE task_id = ?
  `).all(id);

  const agentSet = new Set<string>();
  for (const r of agentLog as Array<{ agent_name: string }>) agentSet.add(r.agent_name);

  return NextResponse.json({
    task,
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
    INSERT INTO task_node_positions (task_id, node_id, x, y, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(task_id, node_id) DO UPDATE SET
      x = excluded.x, y = excluded.y, updated_at = CURRENT_TIMESTAMP
  `);
  const txn = db.transaction((rows: PositionsBody['positions']) => {
    for (const p of rows) upsert.run(id, p.node_id, p.x, p.y);
  });
  txn(body.positions);

  return NextResponse.json({ saved: body.positions.length });
}

// Reset node layout for a task — clears saved positions so the next graph
// render falls back to dagre auto-layout. Scoped strictly to UI state.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const res = db.prepare(`DELETE FROM task_node_positions WHERE task_id = ?`).run(id);
  return NextResponse.json({ deleted: res.changes });
}
