import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const CHROMA_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'agent-data', 'vector-store', 'chroma.sqlite3'
);

export interface Observation {
  id: string;
  created_at: string;
  document: string;
  type: string | null;
  category: string | null;
  project_id: string | null;
  tags: string | null;
}

export interface ObservationsResponse {
  data: Observation[];
  total: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const projectId = searchParams.get('project_id');
    const search = searchParams.get('search') || '';

    const db = new Database(CHROMA_PATH, { readonly: true });

    // Pull each metadata key as a separate column via conditional aggregation
    const rows = db.prepare(`
      SELECT
        e.embedding_id AS id,
        e.created_at,
        MAX(CASE WHEN em.key = 'chroma:document' THEN em.string_value END) AS document,
        MAX(CASE WHEN em.key = 'type'            THEN em.string_value END) AS type,
        MAX(CASE WHEN em.key = 'category'        THEN em.string_value END) AS category,
        MAX(CASE WHEN em.key = 'project_id'      THEN em.string_value END) AS project_id,
        MAX(CASE WHEN em.key = 'tags'            THEN em.string_value END) AS tags
      FROM embeddings e
      JOIN embedding_metadata em ON e.id = em.id
      WHERE e.segment_id IN (
        SELECT id FROM segments WHERE scope = 'METADATA'
      )
      GROUP BY e.id
      HAVING document IS NOT NULL
      ORDER BY e.created_at DESC
    `).all() as Observation[];

    db.close();

    let filtered = rows;

    // Filter by project_id
    if (projectId) {
      filtered = filtered.filter(
        (r) => r.project_id === projectId || r.id.startsWith(projectId)
      );
    }

    // Filter by search text
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.document?.toLowerCase().includes(q) ||
          r.type?.toLowerCase().includes(q) ||
          r.tags?.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const data = filtered.slice(0, limit);

    return NextResponse.json<ObservationsResponse>({ data, total });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
