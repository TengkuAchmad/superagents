#!/usr/bin/env node
/**
 * Cross-OS health check for Oh My OpenAgent.
 *
 *   node scripts/status.mjs
 *
 * Reports:
 *   - Node, npm, opencode versions
 *   - Whether the dashboard port is responding
 *   - Whether the Meridian proxy port (3456) is responding
 *   - Whether the agent-data SQLite file exists and is non-empty
 *   - Counts of sessions / tasks / agent_log
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform as osPlatform } from 'node:os';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const IS_WIN = osPlatform() === 'win32';
const DB_PATH = join(REPO_ROOT, 'agent-data', 'agent.db');

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function checkVersion(bin) {
  const cmd = IS_WIN && !bin.endsWith('.cmd') ? `${bin}.cmd` : bin;
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: IS_WIN });
  if (res.status !== 0) return null;
  return (res.stdout || res.stderr || '').trim().split('\n')[0];
}

async function probePort(port, path = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 1500 }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
}

function checkDb() {
  if (!existsSync(DB_PATH)) return { ok: false, reason: 'file missing' };
  const size = statSync(DB_PATH).size;
  if (size === 0) return { ok: false, reason: 'empty' };

  try {
    const require_ = createRequire(join(REPO_ROOT, 'dashboard/package.json'));
    const Database = require_('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true });
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
    const has = (t) => tables.includes(t);
    const count = (t) => has(t) ? db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c : null;
    const out = {
      ok: true,
      size,
      tables: tables.length,
      sessions: count('sessions'),
      tasks: count('tasks'),
      agent_log: count('agent_log'),
      tool_calls: count('tool_calls'),
    };
    db.close();
    return out;
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function row(label, value, ok) {
  const dot = ok ? c.green('●') : c.red('●');
  process.stdout.write(`  ${dot} ${label.padEnd(22)} ${value ?? c.gray('(missing)')}\n`);
}

async function main() {
  process.stdout.write(c.cyan('Oh My OpenAgent — status\n'));
  process.stdout.write(c.gray(`  repo: ${REPO_ROOT}\n`));
  process.stdout.write(c.gray(`  os:   ${osPlatform()}\n\n`));

  process.stdout.write(c.cyan('Toolchain\n'));
  const node = checkVersion('node');     row('node',     node,     !!node);
  const npm  = checkVersion('npm');      row('npm',      npm,      !!npm);
  const oc   = checkVersion('opencode'); row('opencode', oc,       !!oc);
  process.stdout.write('\n');

  process.stdout.write(c.cyan('Live ports\n'));
  for (const port of [3000, 3001, 3010]) {
    const r = await probePort(port);
    row(`localhost:${port}`, r.ok ? `HTTP ${r.status}` : 'not listening', r.ok);
  }
  const proxy = await probePort(3456, '/health');
  row('meridian:3456', proxy.ok ? `HTTP ${proxy.status}` : 'not listening', proxy.ok);
  process.stdout.write('\n');

  process.stdout.write(c.cyan('SQLite\n'));
  const db = checkDb();
  if (!db.ok) {
    row('agent-data/agent.db', c.red(db.reason), false);
  } else {
    row('agent-data/agent.db', `${(db.size / 1024).toFixed(1)} KB`, true);
    row('tables', String(db.tables), true);
    row('sessions', String(db.sessions ?? 0), db.sessions != null);
    row('tasks', String(db.tasks ?? 0), db.tasks != null);
    row('agent_log rows', String(db.agent_log ?? 0), db.agent_log != null);
    row('tool_calls rows', String(db.tool_calls ?? 0), db.tool_calls != null);
  }
}

main();
