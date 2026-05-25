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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;
    const db = getDb();
    const pf = projectId ? 'AND project_id = ?' : '';
    const a = projectId ? [projectId] : [];
    const rows = db.prepare(`
      SELECT id, timestamp, agent_name, tool_name, parameters, result, status, project_id
      FROM tool_calls
      WHERE 1=1 ${pf}
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all(...a) as ToolCallRow[];

    return NextResponse.json({ calls: rows });
  } catch (error) {
    console.error('Failed to fetch tool calls:', error);
    return NextResponse.json({ calls: [], error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const db = getDb();
    if (id) {
      db.prepare('DELETE FROM tool_calls WHERE id = ?').run(Number(id));
      return NextResponse.json({ deleted: 1 });
    } else if (projectId) {
      const r = db.prepare('DELETE FROM tool_calls WHERE project_id = ?').run(projectId);
      return NextResponse.json({ deleted: r.changes });
    }
    return NextResponse.json({ error: 'Provide id or project_id' }, { status: 400 });
  } catch (error) {
    console.error('Failed to delete tool call:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
