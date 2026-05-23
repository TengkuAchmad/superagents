import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb(true);
    const pf = projectId ? 'AND project_id = ?' : '';
    const wf = projectId ? 'WHERE project_id = ?' : '';
    const a = projectId ? [projectId] : [];

    const byTool = db.prepare(`
      SELECT tool_name, COUNT(*) AS total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
        MAX(timestamp) AS last_used
      FROM tool_calls WHERE 1=1 ${pf}
      GROUP BY tool_name ORDER BY total DESC
    `).all(...a);

    const byAgent = db.prepare(`
      SELECT agent_name, COUNT(*) AS total
      FROM tool_calls WHERE 1=1 ${pf}
      GROUP BY agent_name ORDER BY total DESC
    `).all(...a);

    const topTools = db.prepare(`
      SELECT tool_name, COUNT(*) AS total, MAX(timestamp) AS last_called
      FROM tool_calls WHERE 1=1 ${pf}
      GROUP BY tool_name ORDER BY total DESC LIMIT 10
    `).all(...a);

    const recent = db.prepare(`
      SELECT id, timestamp, agent_name, tool_name, parameters, result, status, project_id
      FROM tool_calls ${wf} ORDER BY timestamp DESC LIMIT 100
    `).all(...a);

    const totalRow  = db.prepare(`SELECT COUNT(*) AS v FROM tool_calls WHERE 1=1 ${pf}`).get(...a) as { v: number };
    const failedRow = db.prepare(`SELECT COUNT(*) AS v FROM tool_calls WHERE status='failed' ${pf}`).get(...a) as { v: number };

    return NextResponse.json({ byTool, byAgent, topTools, recent, total_calls: totalRow.v ?? 0, failed_calls: failedRow.v ?? 0 });
  } catch (error) {
    console.error('analytics/tool-breakdown error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
