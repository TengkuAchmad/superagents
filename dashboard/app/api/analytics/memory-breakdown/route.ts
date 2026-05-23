import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface MemoryBreakdownItem {
  entity_type?: string;
  source_agent?: string;
  count: number;
}

interface MemoryCountResult {
  count: number | null;
}

export async function GET() {
  try {
    const db = getDb(true);

    const byType = db.prepare(`
      SELECT entity_type, COUNT(*) as count
      FROM memory_updates
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 20
    `).all() as MemoryBreakdownItem[];

    const byAgent = db.prepare(`
      SELECT source_agent, COUNT(*) as count
      FROM memory_updates
      GROUP BY source_agent
      ORDER BY count DESC
      LIMIT 20
    `).all() as MemoryBreakdownItem[];

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM memory_updates
    `).get() as MemoryCountResult;

    const unique = db.prepare(`
      SELECT COUNT(DISTINCT entity_name) as count FROM memory_updates
    `).get() as MemoryCountResult;

    return NextResponse.json({
      total: total.count || 0,
      uniqueEntities: unique.count || 0,
      byType,
      byAgent
    });
  } catch (error) {
    console.error('Failed to fetch memory breakdown:', error);
    return NextResponse.json({ total: 0, uniqueEntities: 0, byType: [], byAgent: [] }, { status: 500 });
  }
}
