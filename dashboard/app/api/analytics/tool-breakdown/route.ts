import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface ToolStats {
  total: number | null;
  success: number | null;
  failed: number | null;
  days_active: number | null;
}

interface ToolBreakdownItem {
  tool_name: string;
  count: number;
}

export async function GET() {
  try {
    const db = getDb(true);

    const toolStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT DATE(timestamp)) as days_active
      FROM tool_calls
    `).get() as ToolStats;

    const breakdown = db.prepare(`
      SELECT tool_name, COUNT(*) as count
      FROM tool_calls
      GROUP BY tool_name
      ORDER BY count DESC
      LIMIT 20
    `).all() as ToolBreakdownItem[];

    return NextResponse.json({ 
      total: toolStats.total || 0,
      success: toolStats.success || 0,
      failed: toolStats.failed || 0,
      daysActive: toolStats.days_active || 0,
      breakdown 
    });
  } catch (error) {
    console.error('Failed to fetch tool breakdown:', error);
    return NextResponse.json({ total: 0, success: 0, failed: 0, daysActive: 0, breakdown: [] }, { status: 500 });
  }
}
