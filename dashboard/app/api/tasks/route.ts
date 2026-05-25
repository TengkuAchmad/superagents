import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runTaskInference, closeIdleTasks } from '@/lib/task-inference';

export const dynamic = 'force-dynamic';

interface TaskRow {
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
  agent_count: number;
  tool_call_count: number;
}

export async function GET(request: Request) {
  runTaskInference();
  closeIdleTasks();

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id');
  const sessionId = searchParams.get('session_id');
  const status = searchParams.get('status'); // running | completed | failed | abandoned
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

  const clauses: string[] = [];
  const args: string[] = [];
  if (projectId) { clauses.push('t.project_id = ?'); args.push(projectId); }
  if (sessionId) { clauses.push('t.session_id = ?'); args.push(sessionId); }
  if (status)    { clauses.push('t.status = ?');     args.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const db = getDb();
  const rows = db.prepare(`
    SELECT
      t.id, t.session_id, t.project_id, t.title, t.summary, t.status,
      t.origin_prompt, t.started_at, t.ended_at, t.total_duration_ms,
      (SELECT COUNT(DISTINCT agent_name) FROM agent_log WHERE task_id = t.id) AS agent_count,
      (SELECT COUNT(*) FROM tool_calls WHERE task_id = t.id) AS tool_call_count
    FROM tasks t
    ${where}
    ORDER BY t.started_at DESC
    LIMIT ${limit}
  `).all(...args) as TaskRow[];

  return NextResponse.json({ tasks: rows });
}
