import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface ToolCallRow {
  id: number;
  timestamp: string;
  agent_name: string | null;
  tool_name: string;
  parameters: string | null;
  result: string | null;
  status: string | null;
  project_id: string | null;
}

export async function GET() {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT id, timestamp, agent_name, tool_name, parameters, result, status, project_id
      FROM tool_calls
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all() as ToolCallRow[];

    return NextResponse.json({ calls: rows });
  } catch (error) {
    console.error('Failed to fetch tool calls:', error);
    return NextResponse.json({ calls: [], error: String(error) }, { status: 500 });
  }
}
