import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/model-failures
 * 
 * Returns model failure statistics and recent critical failures
 * for the monitoring dashboard.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    const db = getDb(true);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Overall statistics
    const totalFailures = db.prepare(`
      SELECT COUNT(*) as count FROM model_failures WHERE timestamp > ?
    `).get(since) as { count: number };

    const criticalFailures = db.prepare(`
      SELECT COUNT(*) as count FROM model_failures 
      WHERE timestamp > ? AND severity = 'critical'
    `).get(since) as { count: number };

    const escalatedFailures = db.prepare(`
      SELECT COUNT(*) as count FROM model_failures 
      WHERE timestamp > ? AND escalated_to_orchestrator = 1
    `).get(since) as { count: number };

    const unresolvedCritical = db.prepare(`
      SELECT COUNT(*) as count FROM model_failures 
      WHERE severity = 'critical' AND resolved_at IS NULL
    `).get() as { count: number };

    // Failures by type
    const byType = db.prepare(`
      SELECT failure_type, COUNT(*) as count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY failure_type
      ORDER BY count DESC
    `).all(since) as Array<{ failure_type: string; count: number }>;

    // Failures by agent
    const byAgent = db.prepare(`
      SELECT agent_name, COUNT(*) as count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY agent_name
      ORDER BY count DESC
    `).all(since) as Array<{ agent_name: string; count: number }>;

    // Failures by model
    const byModel = db.prepare(`
      SELECT model_attempted, COUNT(*) as count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY model_attempted
      ORDER BY count DESC
    `).all(since) as Array<{ model_attempted: string; count: number }>;

    // Recent critical failures
    const recentCritical = db.prepare(`
      SELECT 
        id,
        timestamp,
        agent_name,
        model_attempted,
        fallback_level,
        failure_type,
        severity,
        error_message,
        escalated_to_orchestrator,
        project_id,
        resolved_at,
        resolution_model
      FROM model_failures
      WHERE severity = 'critical'
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);

    // Recent all failures
    const recentAll = db.prepare(`
      SELECT 
        id,
        timestamp,
        agent_name,
        model_attempted,
        fallback_level,
        failure_type,
        severity,
        error_message,
        escalated_to_orchestrator,
        project_id,
        resolved_at,
        resolution_model
      FROM model_failures
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(since, limit);

    // Failure timeline (hourly buckets)
    const timeline = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY hour
      ORDER BY hour ASC
    `).all(since) as Array<{ hour: string; count: number; critical_count: number }>;

    // Alert level calculation
    let alertLevel: 'none' | 'yellow' | 'red' = 'none';
    if (unresolvedCritical.count >= 3) {
      alertLevel = 'red'; // System-wide outage likely
    } else if (unresolvedCritical.count >= 1) {
      alertLevel = 'yellow'; // Single critical failure
    }

    return NextResponse.json({
      stats: {
        totalFailures: totalFailures.count,
        criticalFailures: criticalFailures.count,
        escalatedFailures: escalatedFailures.count,
        unresolvedCritical: unresolvedCritical.count,
        alertLevel
      },
      breakdowns: {
        byType: Object.fromEntries(byType.map(r => [r.failure_type, r.count])),
        byAgent: Object.fromEntries(byAgent.map(r => [r.agent_name, r.count])),
        byModel: Object.fromEntries(byModel.map(r => [r.model_attempted, r.count]))
      },
      recentCritical,
      recentAll,
      timeline,
      period: {
        hours,
        since,
        until: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to fetch model failures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model failure data' },
      { status: 500 }
    );
  }
}
