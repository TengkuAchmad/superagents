import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb();
    const pf = projectId ? 'AND project_id = ?' : '';
    const wf = projectId ? 'WHERE project_id = ?' : '';
    const a = projectId ? [projectId] : [];

    const byEntityType = db.prepare(`
      SELECT entity_type, COUNT(*) AS count
      FROM memory_updates WHERE 1=1 ${pf}
      GROUP BY entity_type ORDER BY count DESC
    `).all(...a);

    const byAgent = db.prepare(`
      SELECT source_agent, COUNT(*) AS count
      FROM memory_updates WHERE 1=1 ${pf}
      GROUP BY source_agent ORDER BY count DESC
    `).all(...a);

    const topEntities = db.prepare(`
      SELECT entity_name, entity_type, COUNT(*) AS updates, MAX(timestamp) AS last_updated
      FROM memory_updates WHERE 1=1 ${pf}
      GROUP BY entity_name, entity_type ORDER BY updates DESC LIMIT 20
    `).all(...a);

    const recent = db.prepare(`
      SELECT id, timestamp, entity_name, entity_type, observation, source_agent, project_id
      FROM memory_updates ${wf} ORDER BY timestamp DESC LIMIT 100
    `).all(...a);

    return NextResponse.json({ byEntityType, byAgent, topEntities, recent });
  } catch (error) {
    console.error('analytics/memory-breakdown error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
