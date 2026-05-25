import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbPath(): string {
  if (process.env.SUPERAGENTS_DB) return process.env.SUPERAGENTS_DB;

  const fromRoot = process.env.SUPERAGENTS_ROOT
    ? path.join(process.env.SUPERAGENTS_ROOT, 'agent-data', 'agent.db')
    : null;
  if (fromRoot && fs.existsSync(path.dirname(fromRoot))) return fromRoot;

  // When dashboard runs from <project>/dashboard, agent-data is one level up.
  const relativeToCwd = path.join(process.cwd(), '..', 'agent-data', 'agent.db');
  if (fs.existsSync(path.dirname(relativeToCwd))) return relativeToCwd;

  // Legacy Windows location (kept for backward compatibility).
  return path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.config', 'opencode', 'agent-data', 'agent.db',
  );
}

const DB_PATH = resolveDbPath();

let db: Database.Database | null = null;

export function getDbPath(): string {
  return DB_PATH;
}

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
}

function addColumnIfMissing(db: Database.Database, table: string, col: string, type: string): void {
  const cols = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name);
  return cols.includes(col);
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
      model TEXT,
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

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      content TEXT,
      kind TEXT,
      project_id TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS model_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent_name TEXT NOT NULL,
      model_attempted TEXT,
      fallback_level INTEGER DEFAULT 0,
      failure_type TEXT,
      severity TEXT DEFAULT 'normal',
      error_message TEXT,
      escalated_to_orchestrator INTEGER DEFAULT 0,
      project_id TEXT,
      resolved_at DATETIME,
      resolution_model TEXT
    );
  `);

  // Migrate planning_log to the richer schema (preserve old rows if columns exist).
  const planningExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='planning_log'`,
  ).get();

  const needsRebuild = planningExists && !hasColumn(db, 'planning_log', 'agent_name');
  if (needsRebuild) {
    db.exec(`ALTER TABLE planning_log RENAME TO planning_log_legacy`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS planning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT UNIQUE,
      agent_name TEXT,
      title TEXT,
      subtasks TEXT,                       -- JSON array of {id,text,status,agent}
      status TEXT DEFAULT 'pending',       -- pending | in_progress | done | failed
      progress_pct REAL DEFAULT 0,
      project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
  `);

  // Best-effort backfill from the legacy table (column names: plan_id, task, subtasks, status, project_id, timestamp).
  if (needsRebuild) {
    try {
      db.exec(`
        INSERT OR IGNORE INTO planning_log (plan_id, title, subtasks, status, project_id, created_at, updated_at)
        SELECT
          COALESCE(plan_id, 'legacy-' || id),
          task,
          CASE
            WHEN subtasks IS NULL OR subtasks = '' THEN '[]'
            WHEN substr(subtasks, 1, 1) = '[' THEN subtasks
            ELSE '[]'
          END,
          COALESCE(status, 'pending'),
          project_id,
          timestamp,
          timestamp
        FROM planning_log_legacy;
      `);
    } catch { /* ignore */ }
  }

  // Idempotent migrations for older databases.
  for (const col of ['directory_tree', 'key_files', 'commands', 'environment_vars', 'git_info', 'agent_files', 'dependencies']) {
    addColumnIfMissing(db, 'project_registry', col, 'TEXT');
  }
  addColumnIfMissing(db, 'memory_updates', 'project_id', 'TEXT');
  addColumnIfMissing(db, 'tool_calls', 'project_id', 'TEXT');
  addColumnIfMissing(db, 'agent_log', 'model', 'TEXT');

  // ── Task & Session model (Phase 1) ─────────────────────────────────────────
  // A session is one opencode TUI run (oc start → oc exit).
  // A task is a coherent unit of work inside a session; one session may host many.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      label TEXT,
      first_log_id INTEGER,
      last_log_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      project_id TEXT,
      title TEXT,
      summary TEXT,
      status TEXT DEFAULT 'running',          -- running | completed | failed | abandoned
      origin_prompt TEXT,                     -- first user prompt that opened the task
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      total_tokens INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      first_log_id INTEGER,
      last_log_id INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS task_node_positions (
      task_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, node_id)
    );

    -- Session-scoped node positions for the session-tab UX.
    CREATE TABLE IF NOT EXISTS session_node_positions (
      session_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, node_id)
    );
  `);

  // Attach task_id / session_id to every event-bearing table.
  for (const table of ['agent_log', 'tool_calls', 'memory_updates', 'observations', 'model_failures', 'planning_log']) {
    addColumnIfMissing(db, table, 'task_id', 'TEXT');
    addColumnIfMissing(db, table, 'session_id', 'TEXT');
  }

  // Token-usage tracking. Agents populate these when their MCP returns usage
  // data; the dashboard falls back to heuristic estimation when null.
  addColumnIfMissing(db, 'agent_log', 'usage_input_tokens', 'INTEGER');
  addColumnIfMissing(db, 'agent_log', 'usage_output_tokens', 'INTEGER');
  addColumnIfMissing(db, 'tasks', 'total_input_tokens', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'tasks', 'total_output_tokens', 'INTEGER DEFAULT 0');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_log_task ON agent_log(task_id);
    CREATE INDEX IF NOT EXISTS idx_agent_log_session ON agent_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
  `);
}
