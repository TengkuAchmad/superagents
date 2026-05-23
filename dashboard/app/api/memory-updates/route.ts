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

export async function GET() {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT id, timestamp, entity_name, entity_type, observation, source_agent, project_id
      FROM memory_updates
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all() as MemoryUpdateRow[];

    return NextResponse.json({ updates: rows });
  } catch (error) {
    console.error('Failed to fetch memory updates:', error);
    return NextResponse.json({ updates: [], error: String(error) }, { status: 500 });
  }
}
