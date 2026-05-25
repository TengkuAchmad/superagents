#!/usr/bin/env node
/**
 * Minimal local MCP server that lets any agent log to `agent-data/agent.db`.
 * Replaces the missing `claude-mem:activity-logger` MCP that the old README
 * assumed but the current claude-mem (13.3.0) does not ship.
 *
 * Protocol: JSON-RPC 2.0 over stdio (line-delimited), MCP 2024-11-05.
 *
 * Tools exposed:
 *   - log_action(agent_name, action, status?, description?, result?,
 *                project_id?, duration_ms?, model?, usage_input_tokens?,
 *                usage_output_tokens?)
 *       → INSERT INTO agent_log
 *
 *   - log_tool_call(agent_name, tool_name, parameters?, result?, status?, project_id?)
 *       → INSERT INTO tool_calls
 *
 *   - log_memory_update(entity_name?, entity_type?, observation, source_agent, project_id?)
 *       → INSERT INTO memory_updates
 *
 * task_id/session_id are intentionally NOT accepted from agents — those are
 * inferred server-side by dashboard/lib/task-inference.ts. Agents only need
 * to log what happened; the dashboard figures out which task it belongs to.
 *
 * Run standalone for smoke test:
 *   node scripts/activity-logger-mcp.mjs <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
 */

import readline from 'node:readline';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.SUPERAGENTS_ROOT ?? dirname(__dirname);
const DB_PATH = process.env.SUPERAGENTS_DB ?? join(REPO_ROOT, 'agent-data', 'agent.db');

// better-sqlite3 lives in dashboard's node_modules — we don't want to require
// users to install it at the repo root.
const require_ = createRequire(join(REPO_ROOT, 'dashboard/package.json'));
const Database = require_('better-sqlite3');

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

// Defensive: ensure the tables we write to exist. If the dashboard hasn't
// initialized the DB yet, we create the minimum needed columns.
db.exec(`
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
    project_id TEXT,
    usage_input_tokens INTEGER,
    usage_output_tokens INTEGER
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
  CREATE TABLE IF NOT EXISTS project_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    repo_path TEXT,
    description TEXT,
    tech_stack TEXT,
    conventions TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertAgentLog = db.prepare(`
  INSERT INTO agent_log (agent_name, action, description, status, result, duration_ms, model, project_id, usage_input_tokens, usage_output_tokens)
  VALUES (@agent_name, @action, @description, @status, @result, @duration_ms, @model, @project_id, @usage_input_tokens, @usage_output_tokens)
`);

const insertToolCall = db.prepare(`
  INSERT INTO tool_calls (agent_name, tool_name, parameters, result, status, project_id)
  VALUES (@agent_name, @tool_name, @parameters, @result, @status, @project_id)
`);

const insertMemoryUpdate = db.prepare(`
  INSERT INTO memory_updates (entity_name, entity_type, observation, source_agent, project_id)
  VALUES (@entity_name, @entity_type, @observation, @source_agent, @project_id)
`);

const upsertProject = db.prepare(`
  INSERT INTO project_registry (project_id, project_name, repo_path, description, tech_stack, conventions, registered_at, updated_at)
  VALUES (@project_id, @project_name, @repo_path, @description, @tech_stack, @conventions, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(project_id) DO UPDATE SET
    project_name = COALESCE(excluded.project_name, project_name),
    repo_path    = COALESCE(excluded.repo_path,    repo_path),
    description  = COALESCE(excluded.description,  description),
    tech_stack   = COALESCE(excluded.tech_stack,   tech_stack),
    conventions  = COALESCE(excluded.conventions,  conventions),
    updated_at   = CURRENT_TIMESTAMP
`);

// ── Tool definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'log_action',
    description: 'Record one lifecycle event for an agent. Follow LIFECYCLE_PROTOCOL.md for valid action/status values.',
    inputSchema: {
      type: 'object',
      required: ['agent_name', 'action'],
      properties: {
        agent_name:           { type: 'string', description: 'Canonical agent id, e.g. "orchestrator", "planner", "executor".' },
        action:               { type: 'string', description: 'Lifecycle action: start | progress | complete | route | delegate | decompose | receive | abandon | fail.' },
        status:               { type: 'string', description: 'started | in_progress | completed | failed | abandoned' },
        description:          { type: 'string', description: 'Short human-readable. For "route"/"delegate" mention target agent (e.g. "→ executor") so the dashboard can draw the edge.' },
        result:               { type: 'string', description: 'Outcome summary (optional).' },
        project_id:           { type: 'string', description: 'REQUIRED for task grouping. Use the project id from /init-project.' },
        duration_ms:          { type: 'number' },
        model:                { type: 'string', description: 'Model id used, e.g. "claude-sonnet-4-5".' },
        usage_input_tokens:   { type: 'number', description: 'When the SDK returns usage data, pass it through.' },
        usage_output_tokens:  { type: 'number' },
      },
    },
  },
  {
    name: 'log_tool_call',
    description: 'Record a single tool invocation by an agent (Edit, Write, Read, Bash, etc.).',
    inputSchema: {
      type: 'object',
      required: ['agent_name', 'tool_name'],
      properties: {
        agent_name:  { type: 'string' },
        tool_name:   { type: 'string', description: 'e.g. "Edit", "Write", "MultiEdit", "Read", "Bash"' },
        parameters:  { type: 'string', description: 'JSON-stringified parameters. For Edit/Write, include "file_path" so the dashboard can list files modified.' },
        result:      { type: 'string' },
        status:      { type: 'string' },
        project_id:  { type: 'string' },
      },
    },
  },
  {
    name: 'log_memory_update',
    description: 'Record a write to claude-mem-style memory (entity/observation).',
    inputSchema: {
      type: 'object',
      required: ['observation', 'source_agent'],
      properties: {
        entity_name:  { type: 'string' },
        entity_type:  { type: 'string' },
        observation:  { type: 'string' },
        source_agent: { type: 'string' },
        project_id:   { type: 'string' },
      },
    },
  },
  {
    name: 'register_project',
    description: 'Upsert a project into the registry so it appears in the dashboard project dropdown. Call this once at the start of any new project (e.g. from the init-project agent). project_id should be a short slug (e.g. "test-todo-cli"); project_name is the human-readable label.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'project_name'],
      properties: {
        project_id:   { type: 'string', description: 'Short slug, used everywhere as the scope key (e.g. "test-todo-cli").' },
        project_name: { type: 'string', description: 'Human-readable name shown in the dashboard ("Test Todo CLI").' },
        repo_path:    { type: 'string', description: 'Absolute path on disk.' },
        description:  { type: 'string', description: 'One-line summary of what the project is.' },
        tech_stack:   { type: 'string', description: 'Comma-separated stack (e.g. "Node.js, CommonJS").' },
        conventions:  { type: 'string', description: 'Short list of project conventions or rules.' },
      },
    },
  },
];

const REQUIRED_FIELDS = {
  log_action: ['agent_name', 'action'],
  log_tool_call: ['agent_name', 'tool_name'],
  log_memory_update: ['observation', 'source_agent'],
  register_project: ['project_id', 'project_name'],
};

function defaults(args, name) {
  if (name === 'log_action') {
    return {
      agent_name: args.agent_name, action: args.action,
      description: args.description ?? null, status: args.status ?? null,
      result: args.result ?? null, duration_ms: args.duration_ms ?? null,
      model: args.model ?? null, project_id: args.project_id ?? null,
      usage_input_tokens: args.usage_input_tokens ?? null,
      usage_output_tokens: args.usage_output_tokens ?? null,
    };
  }
  if (name === 'log_tool_call') {
    return {
      agent_name: args.agent_name, tool_name: args.tool_name,
      parameters: args.parameters ?? null, result: args.result ?? null,
      status: args.status ?? null, project_id: args.project_id ?? null,
    };
  }
  if (name === 'log_memory_update') {
    return {
      entity_name: args.entity_name ?? null, entity_type: args.entity_type ?? null,
      observation: args.observation, source_agent: args.source_agent,
      project_id: args.project_id ?? null,
    };
  }
  // register_project
  return {
    project_id: args.project_id, project_name: args.project_name,
    repo_path: args.repo_path ?? null, description: args.description ?? null,
    tech_stack: args.tech_stack ?? null, conventions: args.conventions ?? null,
  };
}

function callTool(name, args) {
  for (const f of REQUIRED_FIELDS[name] ?? []) {
    if (args?.[f] == null) throw new Error(`missing required field: ${f}`);
  }
  const row = defaults(args, name);
  let id;
  if (name === 'log_action')             id = insertAgentLog.run(row).lastInsertRowid;
  else if (name === 'log_tool_call')     id = insertToolCall.run(row).lastInsertRowid;
  else if (name === 'log_memory_update') id = insertMemoryUpdate.run(row).lastInsertRowid;
  else if (name === 'register_project')  { upsertProject.run(row); id = row.project_id; }
  else throw new Error(`unknown tool: ${name}`);
  return { content: [{ type: 'text', text: `${name} ok (id=${id})` }] };
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────────
function dispatch(req) {
  switch (req.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'activity-logger', version: '0.1.0' },
        capabilities: { tools: {} },
      };
    case 'notifications/initialized':
      return null; // notifications have no response
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return callTool(req.params?.name, req.params?.arguments ?? {});
    case 'ping':
      return {};
    default:
      throw Object.assign(new Error(`method not found: ${req.method}`), { code: -32601 });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try { req = JSON.parse(trimmed); }
  catch { return; /* not JSON — ignore */ }
  try {
    const result = dispatch(req);
    if (result == null) return; // notification, no reply
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: err.code ?? -32000, message: err.message ?? 'internal error' },
    }) + '\n');
  }
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { db.close(); process.exit(0); });
}
