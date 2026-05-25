import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface PlanRow {
  id: number;
  plan_id: string;
  agent_name: string | null;
  title: string | null;
  subtasks: string | null;
  status: string | null;
  progress_pct: number | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface Subtask {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  agent?: string;
}

function parseSubtasks(raw: string | null): Subtask[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function computeProgress(subtasks: Subtask[]): number {
  if (!subtasks.length) return 0;
  const done = subtasks.filter(s => s.status === 'done').length;
  return Math.round((done / subtasks.length) * 1000) / 10;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb();
    const pf = projectId ? 'AND project_id = ?' : '';
    const a = projectId ? [projectId] : [];
    const rows = db.prepare(`
      SELECT id, plan_id, agent_name, title, subtasks, status, progress_pct,
             project_id, created_at, updated_at, completed_at
      FROM planning_log
      WHERE 1=1 ${pf}
      ORDER BY updated_at DESC
      LIMIT 1000
    `).all(...a) as PlanRow[];

    const logs = rows.map(r => {
      const subtasks = parseSubtasks(r.subtasks);
      return {
        id: r.id,
        plan_id: r.plan_id,
        agent_name: r.agent_name,
        title: r.title,
        subtasks,
        status: r.status ?? 'pending',
        progress_pct: r.progress_pct ?? computeProgress(subtasks),
        project_id: r.project_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        completed_at: r.completed_at,
      };
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Failed to fetch planning logs:', error);
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      plan_id,
      agent_name = null,
      title = null,
      subtasks = [],
      status = null,
      project_id = null,
    } = body ?? {};

    if (!plan_id) {
      return NextResponse.json({ error: 'plan_id required' }, { status: 400 });
    }

    const subtaskList: Subtask[] = Array.isArray(subtasks) ? subtasks : [];
    const pct = computeProgress(subtaskList);
    const resolvedStatus =
      status ?? (pct >= 100 ? 'done' : subtaskList.some(s => s.status === 'in_progress') ? 'in_progress' : 'pending');
    const completed = resolvedStatus === 'done' ? new Date().toISOString() : null;

    const db = getDb();
    db.prepare(`
      INSERT INTO planning_log (plan_id, agent_name, title, subtasks, status, progress_pct, project_id, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(plan_id) DO UPDATE SET
        agent_name   = COALESCE(excluded.agent_name, planning_log.agent_name),
        title        = COALESCE(excluded.title, planning_log.title),
        subtasks     = excluded.subtasks,
        status       = excluded.status,
        progress_pct = excluded.progress_pct,
        project_id   = COALESCE(excluded.project_id, planning_log.project_id),
        completed_at = excluded.completed_at,
        updated_at   = CURRENT_TIMESTAMP
    `).run(
      plan_id,
      agent_name,
      title,
      JSON.stringify(subtaskList),
      resolvedStatus,
      pct,
      project_id,
      completed,
    );

    return NextResponse.json({ ok: true, plan_id, progress_pct: pct, status: resolvedStatus });
  } catch (error) {
    console.error('Failed to upsert planning log:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const db = getDb();
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
