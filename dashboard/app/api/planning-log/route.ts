import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface PlanningLogRow {
  id: number;
  plan_id: string;
  stage: string;
  summary: string;
  created_at: string;
  project_id: string | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb(true);
    const pf = projectId ? 'AND project_id = ?' : '';
    const a = projectId ? [projectId] : [];
    const rows = db.prepare(`
      SELECT id, plan_id, stage, summary, created_at, project_id
      FROM planning_log
      WHERE 1=1 ${pf}
      ORDER BY created_at DESC
      LIMIT 1000
    `).all(...a) as PlanningLogRow[];

    return NextResponse.json({ logs: rows });
  } catch (error) {
    console.error('Failed to fetch planning logs:', error);
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const db = getDb(false);
    if (id) {
      db.prepare('DELETE FROM planning_log WHERE id = ?').run(Number(id));
      return NextResponse.json({ deleted: 1 });
    } else if (projectId) {
      const r = db.prepare('DELETE FROM planning_log WHERE project_id = ?').run(projectId);
      return NextResponse.json({ deleted: r.changes });
    }
    return NextResponse.json({ error: 'Provide id or project_id' }, { status: 400 });
  } catch (error) {
    console.error('Failed to delete planning log:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
