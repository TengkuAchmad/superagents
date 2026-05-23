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

export async function GET() {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT id, plan_id, stage, summary, created_at, project_id
      FROM planning_log
      ORDER BY created_at DESC
      LIMIT 1000
    `).all() as PlanningLogRow[];

    return NextResponse.json({ logs: rows });
  } catch (error) {
    console.error('Failed to fetch planning logs:', error);
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}
