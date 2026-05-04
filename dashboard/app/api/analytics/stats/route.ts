import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const db = getDb();

    const filterParams = projectId ? [projectId] : [];

    const agentCount   = (db.prepare(`SELECT COUNT(DISTINCT agent_name) as n FROM agent_log ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const actionCount  = (db.prepare(`SELECT COUNT(*) as n FROM agent_log ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const completed    = (db.prepare(`SELECT COUNT(*) as n FROM agent_log ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} status IN ('completed','success')`).get(...filterParams) as { n: number }).n;
    const failed       = (db.prepare(`SELECT COUNT(*) as n FROM agent_log ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} status IN ('failed','error')`).get(...filterParams) as { n: number }).n;
    const toolTotal    = (db.prepare(`SELECT COUNT(*) as n FROM tool_calls ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const toolSuccess  = (db.prepare(`SELECT COUNT(*) as n FROM tool_calls ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} status IN ('success','completed')`).get(...filterParams) as { n: number }).n;
    const toolFailed   = (db.prepare(`SELECT COUNT(*) as n FROM tool_calls ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} status IN ('error','failed')`).get(...filterParams) as { n: number }).n;
    const memTotal     = (db.prepare(`SELECT COUNT(*) as n FROM memory_updates ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const memEntities  = (db.prepare(`SELECT COUNT(DISTINCT entity_name) as n FROM memory_updates ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const planCount    = (db.prepare(`SELECT COUNT(*) as n FROM planning_log ${projectId ? 'WHERE project_id = ?' : ''}`).get(...filterParams) as { n: number }).n;
    const projectCount = (db.prepare(`SELECT COUNT(*) as n FROM project_registry`).get() as { n: number }).n;

    const avgDuration = (db.prepare(
      `SELECT AVG(duration_ms) as avg FROM agent_log ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} duration_ms IS NOT NULL`
    ).get(...filterParams) as { avg: number | null }).avg;

    const last24hActions = (db.prepare(
      `SELECT COUNT(*) as n FROM agent_log ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} timestamp >= datetime('now', '-24 hours')`
    ).get(...filterParams) as { n: number }).n;

    const last24hTools = (db.prepare(
      `SELECT COUNT(*) as n FROM tool_calls ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} timestamp >= datetime('now', '-24 hours')`
    ).get(...filterParams) as { n: number }).n;

    return NextResponse.json({
      agents:         { count: agentCount },
      actions:        { total: actionCount, completed, failed, last24h: last24hActions },
      tools:          { total: toolTotal, success: toolSuccess, failed: toolFailed, last24h: last24hTools },
      memory:         { total: memTotal, uniqueEntities: memEntities },
      planning:       { total: planCount },
      projects:       { total: projectCount },
      performance:    { avgDurationMs: avgDuration ? Math.round(avgDuration) : null },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
