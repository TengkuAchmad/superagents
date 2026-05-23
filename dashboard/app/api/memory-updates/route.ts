import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface MemoryUpdateRow {
  id: number;
  timestamp: string;
  entity_name: string | null;
  entity_type: string | null;
  observation: string | null;
  source_agent: string | null;
  project_id: string | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb(true);
    const pf = projectId ? 'AND project_id = ?' : '';
    const a = projectId ? [projectId] : [];
    const rows = db.prepare(`
      SELECT id, timestamp, entity_name, entity_type, observation, source_agent, project_id
      FROM memory_updates
      WHERE 1=1 ${pf}
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all(...a) as MemoryUpdateRow[];

    return NextResponse.json({ updates: rows });
  } catch (error) {
    console.error('Failed to fetch memory updates:', error);
    return NextResponse.json({ updates: [], error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const db = getDb(false);
    if (id) {
      db.prepare('DELETE FROM memory_updates WHERE id = ?').run(Number(id));
      return NextResponse.json({ deleted: 1 });
    } else if (projectId) {
      const r = db.prepare('DELETE FROM memory_updates WHERE project_id = ?').run(projectId);
      return NextResponse.json({ deleted: r.changes });
    }
    return NextResponse.json({ error: 'Provide id or project_id' }, { status: 400 });
  } catch (error) {
    console.error('Failed to delete memory update:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
