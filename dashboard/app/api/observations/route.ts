import Database from 'better-sqlite3';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DB_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude-mem', 'claude-mem.db',
);

interface ObsRow {
  id: number;
  project: string | null;
  text: string | null;
  narrative: string | null;
  type: string | null;
  title: string | null;
  subtitle: string | null;
  concepts: string | null;
  metadata: string | null;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || null;

    const db = new Database(DB_PATH, { readonly: true });

    const wf = projectId ? 'WHERE project = ?' : '';
    const a = projectId ? [projectId] : [];

    const rows = db.prepare(`
      SELECT id, project, text, narrative, type, title, subtitle, concepts, metadata, created_at
      FROM observations ${wf}
      ORDER BY created_at_epoch DESC
      LIMIT 200
    `).all(...a) as ObsRow[];

    db.close();

    // Map to the Observation interface shape expected by page.tsx
    const observations = rows.map((r) => ({
      id: String(r.id),
      created_at: r.created_at,
      document: r.narrative ?? r.text ?? r.title ?? '',
      type: r.type ?? null,
      category: r.subtitle ?? null,
      project_id: r.project ?? null,
      tags: r.concepts ?? null,
    }));

    return NextResponse.json({ observations });
  } catch (error) {
    console.error('observations error:', error);
    return NextResponse.json({ observations: [], error: String(error) }, { status: 500 });
  }
}
