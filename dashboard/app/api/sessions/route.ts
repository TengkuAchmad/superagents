import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runTaskInference, closeIdleTasks } from '@/lib/task-inference';

export const dynamic = 'force-dynamic';

interface SessionRow {
  id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  label: string | null;
  task_count: number;
  total_duration_ms: number;
}

export async function GET(request: Request) {
  runTaskInference();
  closeIdleTasks();

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  const db = getDb();
  const where = projectId ? 'WHERE s.project_id = ?' : '';
  const args = projectId ? [projectId] : [];

  const rows = db.prepare(`
    SELECT
      s.id, s.project_id, s.started_at, s.ended_at, s.label,
      COUNT(t.id) AS task_count,
      COALESCE(SUM(t.total_duration_ms), 0) AS total_duration_ms
    FROM sessions s
    LEFT JOIN tasks t ON t.session_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${limit}
  `).all(...args) as SessionRow[];

  return NextResponse.json({ sessions: rows });
}
