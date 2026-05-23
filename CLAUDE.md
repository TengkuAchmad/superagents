# opencode-superagents — Workspace Instructions

## Memory and Context Persistence

**This workspace uses SQLite as the canonical context store.** The file-based auto-memory system (`memory/*.md` files) is DISABLED for all agent/project context in this workspace.

### What to use instead

The `sqlite` MCP is available. Use it for all persistent context writes and reads:

**Write memory** — INSERT into the `observations` table:
```sql
INSERT INTO observations (content, kind, project_id, metadata)
VALUES ('<content>', '<kind>', 'opencode-superagents', '<json-metadata>');
```

**Read memory** — SELECT from `observations`:
```sql
SELECT content, kind, metadata, timestamp
FROM observations
WHERE project_id = 'opencode-superagents'
ORDER BY timestamp DESC
LIMIT 20;
```

**Log agent actions** — use `activity-logger` MCP (`log_agent_activity`, `log_tool_call`) — already wired to SQLite via the chronicler. Do NOT duplicate these into markdown.

### Rules

1. Do NOT write `memory/user.md`, `memory/feedback.md`, `memory/project.md`, or any `memory/*.md` files for agent, project, or session context. If the auto-memory system attempts to create these, redirect to SQLite instead.
2. Do NOT write `MEMORY.md` index files for project context — the dashboard reads from `agent.db`, not markdown.
3. All project context, session observations, and agent decisions belong in the `observations` table or via the `activity-logger` MCP.
4. claude-mem (`mcp-search`, `observation_add`) remains the primary semantic search layer. SQLite is the audit + dashboard layer. Write to both; read from either.

### Why

The monitoring dashboard at `localhost:3000` reads from `agent-data/agent.db`. Markdown memory files are invisible to it and create drift between what agents remember and what the system tracks. SQLite is the single source of truth.

### Available tables in agent.db

| Table | Use for |
|-------|---------|
| `observations` | General content, decisions, context (read/write via sqlite MCP) |
| `memory_updates` | Observation audit log (written by chronicler) |
| `agent_log` | Agent action audit trail (written via activity-logger) |
| `tool_calls` | Tool invocation log (written via activity-logger) |
| `project_registry` | Project metadata (written by init-project) |
| `planning_log` | Plan decomposition records (written by planner) |
