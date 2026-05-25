#!/usr/bin/env node
/**
 * Cross-OS launcher for Oh My OpenAgent.
 * Replaces opencode-start.ps1 / opencode-start.sh — works on macOS, Windows, Linux.
 *
 * Usage:
 *   node scripts/start.mjs              # full system: dashboard + opencode TUI
 *   node scripts/start.mjs --no-dash    # opencode TUI only
 *   node scripts/start.mjs --no-tui     # dashboard only (no opencode)
 *   node scripts/start.mjs --no-open    # don't auto-open browser
 *   node scripts/start.mjs --port 3010  # dashboard port (default 3000)
 *
 * Design choices:
 *   - Pure Node, no shell dependency. Same script works in PowerShell, cmd,
 *     bash, zsh, fish.
 *   - Dashboard is spawned with stdio piped to a log file, not the terminal —
 *     keeps the opencode TUI clean.
 *   - SIGINT / SIGTERM tear down the dashboard before exit.
 *   - claude-mem worker is intentionally NOT started here. The plugin handles
 *     its own lifecycle; the old PS1 starting it twice was a bug.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, platform as osPlatform, homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const DASHBOARD_PATH = join(REPO_ROOT, 'dashboard');
const IS_WIN = osPlatform() === 'win32';

// ── arg parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const argVal = (f) => {
  const i = args.indexOf(f);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const startDash = !hasFlag('--no-dash');
const startTui  = !hasFlag('--no-tui');
const openBrowser = !hasFlag('--no-open');
const dashPort = parseInt(argVal('--port') ?? process.env.DASH_PORT ?? '3000', 10);

// ── pretty logging ──────────────────────────────────────────────────────────
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};
const log = (msg) => process.stdout.write(`${msg}\n`);

// ── child process bookkeeping ───────────────────────────────────────────────
let dashChild = null;
let tuiChild = null;
let cleanedUp = false;

function cleanup(reason = 'exit') {
  if (cleanedUp) return;
  cleanedUp = true;
  log('');
  log(c.gray(`Stopping (${reason})…`));
  for (const child of [dashChild, tuiChild]) {
    if (child && !child.killed) {
      try {
        // On Windows, child.kill() doesn't tear down npm → next; spawn a kill.
        if (IS_WIN) {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
          setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 1500);
        }
      } catch { /* ignore */ }
    }
  }
  log(c.gray('Done.'));
}

process.on('SIGINT',  () => { cleanup('SIGINT');  process.exit(130); });
process.on('SIGTERM', () => { cleanup('SIGTERM'); process.exit(143); });
process.on('exit',    () => cleanup('exit'));

// ── helpers ─────────────────────────────────────────────────────────────────
async function waitForPort(port, timeoutMs = 40_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

function openInBrowser(url) {
  const cmd = IS_WIN ? 'cmd' : osPlatform() === 'darwin' ? 'open' : 'xdg-open';
  const args = IS_WIN ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch { /* ignore */ }
}

function npmBin() {
  return IS_WIN ? 'npm.cmd' : 'npm';
}

function opencodeBin() {
  return IS_WIN ? 'opencode.cmd' : 'opencode';
}

// ── apply model profile if OC_PROFILE is set ────────────────────────────────
// Lets each developer pick a model strategy (claude-max / google-first /
// copilot-only / ultra-hemat) per machine without editing oh-my-openagent.json
// by hand. Profile-less starts are silent — falls through to whatever the
// committed config already says.
function applyProfileIfSet() {
  const profile = process.env.OC_PROFILE;
  if (!profile) return;
  log(c.cyan(`Applying model profile: ${profile}`));
  const res = spawnSync(
    process.execPath, // current node binary
    [join(__dirname, 'apply-profile.mjs'), profile],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) {
    log(c.red(`profile apply failed (exit ${res.status}); refusing to launch`));
    process.exit(res.status ?? 1);
  }
}

// ── preflight ──────────────────────────────────────────────────────────────
function preflight() {
  const issues = [];
  if (startDash && !existsSync(join(DASHBOARD_PATH, 'package.json'))) {
    issues.push(`dashboard/package.json missing at ${DASHBOARD_PATH}`);
  }
  if (startDash && !existsSync(join(DASHBOARD_PATH, 'node_modules'))) {
    issues.push(`dashboard deps not installed — run: cd dashboard && npm install`);
  }
  if (issues.length) {
    log(c.red('Preflight failed:'));
    for (const i of issues) log(c.red(`  • ${i}`));
    process.exit(1);
  }

  // Soft warnings — don't block startup.
  const meridianCfg = join(homedir(), '.config', 'meridian', 'settings.json');
  if (!existsSync(meridianCfg)) {
    log(c.yellow(`  ⚠ ${meridianCfg} not found — Meridian proxy may use defaults`));
  }
}

// ── start dashboard ─────────────────────────────────────────────────────────
async function startDashboard() {
  log(c.cyan('Starting SuperAgents Dashboard…'));
  const logFile = join(tmpdir(), `superagents-dashboard-${dashPort}.log`);
  log(c.gray(`  logs → ${logFile}`));

  const env = { ...process.env, SUPERAGENTS_ROOT: REPO_ROOT, PORT: String(dashPort) };
  // `npm run dev -- -p <port>` overrides next.js default port.
  dashChild = spawn(
    npmBin(),
    ['run', 'dev', '--', '-p', String(dashPort)],
    {
      cwd: DASHBOARD_PATH,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: IS_WIN, // .cmd on Windows needs the shell
    },
  );

  // Pipe to log file so the parent terminal stays clean for the TUI.
  const { createWriteStream } = await import('node:fs');
  const out = createWriteStream(logFile, { flags: 'a' });
  dashChild.stdout?.pipe(out);
  dashChild.stderr?.pipe(out);

  dashChild.on('exit', (code) => {
    if (!cleanedUp) log(c.red(`Dashboard exited with code ${code} (see ${logFile})`));
  });

  log(c.gray(`  waiting for http://localhost:${dashPort} …`));
  const ready = await waitForPort(dashPort, 40_000);
  if (ready) {
    log(c.green(`  dashboard ready at http://localhost:${dashPort}`));
    if (openBrowser) openInBrowser(`http://localhost:${dashPort}`);
  } else {
    log(c.yellow(`  dashboard did not respond in 40s — check ${logFile}`));
  }
}

// ── start opencode TUI ──────────────────────────────────────────────────────
function startOpencodeTui() {
  log('');
  log(c.cyan('Launching OpenCode TUI…'));
  log(c.gray('  (Ctrl-C to exit — dashboard will be torn down automatically)'));
  tuiChild = spawn(opencodeBin(), [], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: IS_WIN,
  });
  tuiChild.on('exit', (code) => {
    log(c.gray(`OpenCode exited with code ${code ?? 0}`));
    // Emit a session-end marker so the dashboard knows this session is closed
    // for sure (not just idle). The activity-logger MCP isn't reachable from
    // here, so we write directly via better-sqlite3.
    void emitSessionEndMarker();
    cleanup('opencode exit');
    process.exit(code ?? 0);
  });
}

async function emitSessionEndMarker() {
  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(join(REPO_ROOT, 'dashboard/package.json'));
    const Database = require_('better-sqlite3');
    const dbPath = process.env.SUPERAGENTS_DB ?? join(REPO_ROOT, 'agent-data', 'agent.db');
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO agent_log (agent_name, action, status, description, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('launcher', 'session_end', 'completed', 'opencode TUI exited — session closed by launcher', null);
    db.close();
    log(c.gray('  session-end marker written'));
  } catch (err) {
    log(c.yellow(`  could not write session-end marker: ${err?.message ?? err}`));
  }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  log(c.cyan('Oh My OpenAgent — launcher'));
  log(c.gray(`  repo:  ${REPO_ROOT}`));
  log(c.gray(`  os:    ${osPlatform()}`));
  log('');

  preflight();
  applyProfileIfSet();
  if (startDash) await startDashboard();
  if (startTui) {
    startOpencodeTui();
  } else {
    log(c.cyan('TUI disabled (--no-tui). Press Ctrl-C to stop the dashboard.'));
    // Keep process alive so cleanup runs on SIGINT.
    await new Promise(() => { /* never resolves */ });
  }
}

main().catch((err) => {
  log(c.red(`Launcher error: ${err?.message ?? err}`));
  cleanup('error');
  process.exit(1);
});
