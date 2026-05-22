import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'agent-data', 'agent.db'
);

let db: Database.Database | null = null;

export function getDb(readonly = false): Database.Database {
  return (db ??= new Database(DB_PATH, { readonly }));
}
