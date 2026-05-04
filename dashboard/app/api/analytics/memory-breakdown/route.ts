import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface EntityTypeRow { entity_type: string; count: number; }
interface AgentRow { source_agent: string; count: number; }
interface EntityRow { entity_name: string; entity_type: string; updates: number; last_updated: string; }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const db = getDb();

    const filterParams = projectId ? [projectId] : [];

    const byEntityType = db.prepare(`
      SELECT entity_type, COUNT(*) as count
      FROM memory_updates
      ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} entity_type IS NOT NULL
      GROUP BY entity_type
      ORDER BY count DESC
    `).all(...filterParams) as EntityTypeRow[];

    const byAgent = db.prepare(`
      SELECT source_agent, COUNT(*) as count
      FROM memory_updates
      ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'} source_agent IS NOT NULL
      GROUP BY source_agent
      ORDER BY count DESC
    `).all(...filterParams) as AgentRow[];

    const topEntities = db.prepare(`
      SELECT entity_name, entity_type, COUNT(*) as updates, MAX(timestamp) as last_updated
      FROM memory_updates
      ${projectId ? 'WHERE project_id = ?' : ''}
      GROUP BY entity_name
      ORDER BY updates DESC
      LIMIT 20
    `).all(...filterParams) as EntityRow[];

    const recent = (db.prepare(`
      SELECT * FROM memory_updates
      ${projectId ? 'WHERE project_id = ?' : ''}
      ORDER BY id DESC LIMIT 20
    `).all(...filterParams) || []) as Record<string, unknown>[];

    return NextResponse.json({ byEntityType, byAgent, topEntities, recent });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
