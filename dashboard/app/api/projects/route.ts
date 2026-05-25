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

/**
 * Auto-register any project_id we've seen in agent_log but is missing from
 * project_registry. Means: as soon as any agent logs activity with a new
 * project_id, that project shows up in the dropdown — zero friction, no
 * explicit "register me" step required.
 *
 * Stub rows use project_id as project_name. The init-project agent (or a
 * future MCP `register_project` call) can later UPDATE with rich metadata
 * like tech stack + repo path.
 */
function autoRegisterFromActivity(db: ReturnType<typeof getDb>): number {
  const orphans = db.prepare(`
    SELECT DISTINCT project_id
    FROM agent_log
    WHERE project_id IS NOT NULL
      AND project_id != ''
      AND project_id NOT IN (SELECT project_id FROM project_registry)
  `).all() as Array<{ project_id: string }>;

  if (orphans.length === 0) return 0;

  const ins = db.prepare(`
    INSERT INTO project_registry (project_id, project_name, description, registered_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const txn = db.transaction((rows: Array<{ project_id: string }>) => {
    for (const r of rows) {
      ins.run(r.project_id, r.project_id, 'auto-registered from activity');
    }
  });
  txn(orphans);
  return orphans.length;
}

export async function GET() {
  try {
    const db = getDb();
    autoRegisterFromActivity(db);

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
