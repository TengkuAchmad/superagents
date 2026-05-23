import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

interface ProjectRow {
  id: number;
  project_id: string;
  project_name: string;
  repo_path: string | null;
  description: string | null;
  tech_stack: string | null;
  conventions: string | null;
  directory_tree: string | null;
  key_files: string | null;
  commands: string | null;
  environment_vars: string | null;
  git_info: string | null;
  agent_files: string | null;
  dependencies: string | null;
  registered_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT
        id, project_id, project_name, repo_path, description,
        tech_stack, conventions, directory_tree, key_files,
        commands, environment_vars, git_info, agent_files, dependencies,
        registered_at, updated_at
      FROM project_registry
      ORDER BY updated_at DESC
      LIMIT 100
    `).all() as ProjectRow[];

    return NextResponse.json({ projects: rows });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json({ projects: [], error: String(error) }, { status: 500 });
  }
}
