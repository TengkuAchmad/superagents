import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface AgentStats {
  total: number | null;
  completed: number | null;
  failed: number | null;
  agent_count: number | null;
  avg_duration_ms: number | null;
}

interface CountResult {
  count: number | null;
}

interface AgentBreakdownItem {
  agent_name: string;
  count: number;
}

export async function GET() {
  try {
    const db = getDb(true);

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT agent_name) as agent_count,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE NULL END) as avg_duration_ms
      FROM agent_log
    `).get() as AgentStats;

    const last24h = db.prepare(`
      SELECT COUNT(*) as count
      FROM agent_log
      WHERE timestamp > datetime('now', '-24 hours')
    `).get() as CountResult;

    const byAgent = db.prepare(`
      SELECT agent_name, COUNT(*) as count
      FROM agent_log
      GROUP BY agent_name
      ORDER BY count DESC
      LIMIT 20
    `).all() as AgentBreakdownItem[];

    return NextResponse.json({
      actions: {
        total: stats.total || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
        last24h: last24h.count || 0
      },
      agents: {
        count: stats.agent_count || 0
      },
      performance: {
        avgDurationMs: Math.round(stats.avg_duration_ms || 0)
      },
      projects: {
        total: 0
      },
      tools: {
        total: 0,
        last24h: 0,
        failed: 0
      },
      memory: {
        total: 0,
        uniqueEntities: 0
      },
      byAgent
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({
      actions: { total: 0, completed: 0, failed: 0, last24h: 0 },
      agents: { count: 0 },
      performance: { avgDurationMs: 0 },
      projects: { total: 0 },
      tools: { total: 0, last24h: 0, failed: 0 },
      memory: { total: 0, uniqueEntities: 0 },
      byAgent: []
    }, { status: 500 });
  }
}
