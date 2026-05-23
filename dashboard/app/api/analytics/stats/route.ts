import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

type Row = Record<string, number | null>;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb(true);
    const pf = projectId ? 'AND project_id = ?' : '';
    const a = projectId ? [projectId] : [];

    const q = (sql: string): Row => db.prepare(sql).get(...a) as Row;

    const actRow  = q(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, COUNT(DISTINCT agent_name) AS agents FROM agent_log WHERE 1=1 ${pf}`);
    const act24h  = q(`SELECT COUNT(*) AS v FROM agent_log WHERE timestamp > datetime('now','-24 hours') ${pf}`);
    const toolRow = q(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM tool_calls WHERE 1=1 ${pf}`);
    const tool24h = q(`SELECT COUNT(*) AS v FROM tool_calls WHERE timestamp > datetime('now','-24 hours') ${pf}`);
    const memRow  = q(`SELECT COUNT(*) AS total, COUNT(DISTINCT entity_name) AS uniq FROM memory_updates WHERE 1=1 ${pf}`);
    const planRow = q(`SELECT COUNT(*) AS total FROM planning_log WHERE 1=1 ${pf}`);
    const projRow = (db.prepare(`SELECT COUNT(*) AS total FROM project_registry`).get() as Row);
    const durRow  = q(`SELECT ROUND(AVG(duration_ms)) AS avg FROM agent_log WHERE duration_ms IS NOT NULL ${pf}`);

    return NextResponse.json({
      agents:      { count: actRow.agents ?? 0 },
      actions:     { total: actRow.total ?? 0, completed: actRow.completed ?? 0, failed: actRow.failed ?? 0, last24h: act24h.v ?? 0 },
      tools:       { total: toolRow.total ?? 0, success: toolRow.success ?? 0, failed: toolRow.failed ?? 0, last24h: tool24h.v ?? 0 },
      memory:      { total: memRow.total ?? 0, uniqueEntities: memRow.uniq ?? 0 },
      planning:    { total: planRow.total ?? 0 },
      projects:    { total: projRow.total ?? 0 },
      performance: { avgDurationMs: durRow.avg ?? null },
    });
  } catch (error) {
    console.error('analytics/stats error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
