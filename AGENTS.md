# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-23  
**Commit:** 45c6eb6  
**Branch:** main  
**Project ID:** `opencode-superagents`

## OVERVIEW
Oh My OpenAgent — 10-agent orchestration platform on OpenCode. Cabinet-style hierarchy: orchestrator routes every request to specialist sub-agents. Most "code" lives in `.md` agent specs and `oh-my-openagent.json`, not TypeScript.

## STRUCTURE
```
.
├── agents/agent/        Agent behavior specs (*.md) — functional source code
├── dashboard/           Next.js 15 monitoring UI (separate npm workspace)
├── agent-data/          Runtime-only (gitignored): agent.db, session-buffer.json, vector-store/
├── agent/core/          skills-registry.ts — claude-mem skill catalog
├── plugins/             claude-mem.js OpenCode plugin entry point
├── docs/                Architecture + troubleshooting guides
├── oh-my-openagent.json Agent identities, models, prompt_append directives
├── opencode.json        Plugin list + Anthropic proxy config + MCP servers
└── opencode-start.ps1   System launcher (invoked as `oc` PowerShell alias)
```

> `workflows/`, `config/`, `llm/`, `memory/`, `prompts/`, `tools/`, `types/` appear in README but **do not exist on disk**.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Change agent behavior | `agents/agent/<name>.md` | Prompt spec, not compiled code |
| Add/rename agent | `oh-my-openagent.json` | Model, fallback, prompt_append |
| Add MCP server | `opencode.json` → `mcp{}` | shadcn is only manually-configured MCP |
| View live activity | `dashboard/` at localhost:3000 | Reads `agent-data/agent.db` directly |
| SQLite schema | `dashboard/lib/db.ts` | Tables: agent_log, tool_calls, memory_updates, project_registry |
| Skills catalog | `agent/core/skills-registry.ts` | All /claude-mem:* skills, universal access |
| System startup | `opencode-start.ps1` | Proxy → worker → dashboard → TUI |
| Troubleshoot MCPs | `docs/MCP_TROUBLESHOOTING.md` | |
| Proxy config | `~/.config/meridian/settings.json` | Outside this repo |

## AGENT ROSTER
| Canonical ID | Name | Role | Model |
|---|---|---|---|
| orchestrator | atlas | Single entry point, routes all requests | claude-sonnet-4-5 |
| planner | prometheus | Decomposes large tasks into atomic subtasks | claude-sonnet-4-5 |
| executor | sisyphus | Executes atomic subtasks step-by-step | claude-sonnet-4-5 |
| task-runner | sisyphus-junior | Single-tool quick operations | claude-sonnet-4-5 |
| oracle | oracle | Architecture decisions, retrospectives | claude-sonnet-4-6 |
| memory-keeper | metis | claude-mem read/write | claude-sonnet-4-5 |
| chronicler | momus | SQLite audit logging only | claude-sonnet-4-5 |
| librarian | librarian | Token-efficient file system ops | claude-sonnet-4-5 |
| analyst | analyst | Short-term session buffer | claude-sonnet-4-5 |
| init-project | init-project | One-time project registration | claude-sonnet-4-5 |

**Model note:** `oh-my-openagent.json` has all agents on `anthropic/claude-sonnet-4-5`; README says `gpt-4.1`. **JSON is authoritative.**

## CONVENTIONS
- `project_id = 'opencode-superagents'` — hardcoded in every agent prompt; must be passed in every `task()` call
- Agent behavior = `.md` files, not TypeScript — edit `agents/agent/<name>.md` to change how an agent thinks
- Dashboard is a separate npm workspace — always `cd dashboard` before `npm install` or `npm run dev`
- Meridian proxy (`opencode-with-claude`) starts automatically via plugin; listens on `http://127.0.0.1:3456`

## ANTI-PATTERNS
- Never bypass orchestrator — all requests must route through `atlas`
- Never call `task()` with `run_in_background=true` — all delegation is blocking
- Never omit `project_id` from sub-agent prompts — causes "project_id required" runtime error
- Never route 5+ file / 2+ domain tasks directly to executor — must decompose via planner first
- Never commit `agent-data/` — gitignored, runtime-only
- Never reference `workflows/route-policy.ts` as if it exists — file not yet created; `orchestrator.md` is source of truth

## COMMANDS
```powershell
# Start full system
oc                            # PowerShell alias → opencode-start.ps1

# Dashboard only
cd dashboard; npm run dev     # localhost:3000, Turbopack

# Health check
opencode mcp list
claude auth status
```

## NOTES
- `opencode-start.ps1` starts the claude-mem worker twice (lines 18–30 are duplicate) — known bug
- `jwt-decode` in dashboard deps is dead code — auth was removed; safe to remove
- No CI/CD, no tests anywhere — all verification is manual

<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and the user's question, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and the user's full question (not single words)
4. Answer using the fetched docs
<!-- context7 -->
