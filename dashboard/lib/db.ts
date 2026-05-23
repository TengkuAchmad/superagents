import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'agent-data', 'agent.db'
);

let db: Database.Database | null = null;

export function getDb(readonly = false): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, readonly ? { readonly: true } : undefined);
    if (!readonly) {
      initSchema(db);
    }
  }
  return db;
}

function addColumnIfMissing(db: Database.Database, table: string, col: string, type: string): void {
  const cols = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT UNIQUE NOT NULL,
      project_name TEXT NOT NULL,
      repo_path TEXT,
      description TEXT,
      tech_stack TEXT,
      conventions TEXT,
      directory_tree TEXT,
      key_files TEXT,
      commands TEXT,
      environment_vars TEXT,
      git_info TEXT,
      agent_files TEXT,
      dependencies TEXT,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent_name TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      status TEXT,
      result TEXT,
      duration_ms INTEGER,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent_name TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      parameters TEXT,
      result TEXT,
      status TEXT,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      entity_name TEXT,
      entity_type TEXT,
      observation TEXT,
      source_agent TEXT,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS planning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      plan_id TEXT,
      task TEXT,
      subtasks TEXT,
      status TEXT,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      content TEXT,
      kind TEXT,
      project_id TEXT,
      metadata TEXT
    );
  `);

  // Migrate existing project_registry: add new columns if missing
  for (const col of ['directory_tree', 'key_files', 'commands', 'environment_vars', 'git_info', 'agent_files', 'dependencies']) {
    addColumnIfMissing(db, 'project_registry', col, 'TEXT');
  }

  // Ensure project_id exists in tables that were added later
  addColumnIfMissing(db, 'memory_updates', 'project_id', 'TEXT');
  addColumnIfMissing(db, 'tool_calls', 'project_id', 'TEXT');
  addColumnIfMissing(db, 'planning_log', 'project_id', 'TEXT');
}
