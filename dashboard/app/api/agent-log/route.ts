import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '50');
    const agent = searchParams.get('agent');
    const projectId = searchParams.get('project_id');

    const db = getDb(true);
    let rows;

    if (projectId && agent) {
      rows = db.prepare(
        `SELECT * FROM agent_log WHERE project_id = ? AND agent_name = ? ORDER BY id DESC LIMIT ?`
      ).all(projectId, agent, limit);
    } else if (projectId) {
      rows = db.prepare(
        `SELECT * FROM agent_log WHERE project_id = ? ORDER BY id DESC LIMIT ?`
      ).all(projectId, limit);
    } else if (agent) {
      rows = db.prepare(
        `SELECT * FROM agent_log WHERE agent_name = ? ORDER BY id DESC LIMIT ?`
      ).all(agent, limit);
    } else {
      rows = db.prepare(
        `SELECT * FROM agent_log ORDER BY id DESC LIMIT ?`
      ).all(limit);
    }
    return NextResponse.json({ data: rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');

    const db = getDb(false);

    if (id) {
      // Delete single record
      const result = db.prepare('DELETE FROM agent_log WHERE id = ?').run(id);
      if (result.changes === 0) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, deleted: 1 });
    } else if (projectId) {
      // Delete all records for a project
      const result = db.prepare('DELETE FROM agent_log WHERE project_id = ?').run(projectId);
      return NextResponse.json({ success: true, deleted: result.changes });
    } else {
      return NextResponse.json({ error: 'Either id or project_id is required' }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}