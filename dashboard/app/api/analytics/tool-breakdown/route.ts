import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ToolRow { tool_name: string; total: number; success: number; failed: number; last_used: string; }
interface AgentRow { agent_name: string; total: number; }
interface RecentRow { id: number; tool_name: string; agent_name: string; status: string; timestamp: string; }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const db = getDb();

    const toolParams = projectId ? [projectId] : [];

    const byTool = (db.prepare(`
      SELECT
        tool_name,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status IN ('error','failed') THEN 1 ELSE 0 END) as failed,
        MAX(timestamp) as last_used
      FROM tool_calls
      ${projectId ? 'WHERE project_id = ?' : ''}
      GROUP BY tool_name
      ORDER BY total DESC
      LIMIT 50
    `).all(...toolParams) as ToolRow[]) ?? [];

    const byAgent = (db.prepare(`
      SELECT
        agent_name,
        COUNT(*) as total
      FROM tool_calls
      ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} agent_name IS NOT NULL
      GROUP BY agent_name
      ORDER BY total DESC
    `).all(...toolParams) as AgentRow[]) ?? [];

    const recent = (db.prepare(`
      SELECT * FROM tool_calls
      ${projectId ? 'WHERE project_id = ?' : ''}
      ORDER BY id DESC LIMIT 20
    `).all(...toolParams) as RecentRow[]) ?? [];

    const total_calls = (db.prepare(`SELECT COUNT(*) as cnt FROM tool_calls ${projectId ? 'WHERE project_id = ?' : ''}`).get(...toolParams) as { cnt: number })?.cnt ?? 0;
    const failed_calls = (db.prepare(`SELECT COUNT(*) as cnt FROM tool_calls WHERE status IN ('error','failed') ${projectId ? 'AND project_id = ?' : ''}`).get(...toolParams) as { cnt: number })?.cnt ?? 0;

    const topTools = byTool.slice(0, 10).map((t) => ({
      tool_name: t.tool_name,
      total: t.total,
      last_called: t.last_used,
    }));

    return NextResponse.json({
      byTool,
      byAgent,
      topTools,
      recent,
      total_calls,
      failed_calls,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
