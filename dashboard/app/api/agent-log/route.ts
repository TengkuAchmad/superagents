import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface AgentLogRow {
  id: number;
  timestamp: string;
  agent_name: string;
  action: string;
  description: string | null;
  status: string | null;
  result: string | null;
  duration_ms: number | null;
  project_id: string | null;
}

export async function GET() {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT id, timestamp, agent_name, action, description, status, result, duration_ms, project_id
      FROM agent_log
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all() as AgentLogRow[];

    return NextResponse.json({ logs: rows });
  } catch (error) {
    console.error('Failed to fetch agent logs:', error);
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}
