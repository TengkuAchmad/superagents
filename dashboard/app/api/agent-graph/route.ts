import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface AgentStatsRow {
  id: string;
  label: string;
  role: string;
  count: number;
  status: string;
  action: string;
  last_seen: string;
}

interface GraphEdge {
  source: string;
  target: string;
  action: string;
  count: number;
  status: string;
}

interface CountResult {
  count: number | null;
}

export async function GET() {
  try {
    const db = getDb(true);

    const agentStats = db.prepare(`
      SELECT 
        agent_name as id,
        agent_name as label,
        'Agent' as role,
        COUNT(*) as count,
        CASE 
          WHEN MAX(timestamp) > datetime('now', '-5 minutes') THEN 'started'
          WHEN MAX(status) = 'completed' THEN 'completed'
          WHEN MAX(status) = 'failed' THEN 'failed'
          ELSE 'idle'
        END as status,
        COALESCE(MAX(action), '') as action,
        datetime('now') as last_seen
      FROM agent_log
      GROUP BY agent_name
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `).all() as AgentStatsRow[];

    const edges: GraphEdge[] = [];
    // Build a simple edge structure (each agent points to next in order)
    for (let i = 0; i < agentStats.length - 1; i++) {
      edges.push({
        source: agentStats[i].id,
        target: agentStats[i + 1].id,
        action: 'delegated',
        count: 1,
        status: 'completed'
      });
    }

    const totalActions = db.prepare(`
      SELECT COUNT(*) as count FROM agent_log
    `).get() as CountResult;

    return NextResponse.json({
      nodes: agentStats,
      edges,
      last_updated: new Date().toISOString(),
      total_actions: totalActions.count || 0
    });
  } catch (error) {
    console.error('Failed to fetch agent graph:', error);
    return NextResponse.json({
      nodes: [],
      edges: [],
      last_updated: new Date().toISOString(),
      total_actions: 0,
      error: String(error)
    }, { status: 500 });
  }
}
