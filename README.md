# Oh My OpenAgent

A production-ready, multi-agent orchestration platform built on OpenCode with Model Context Protocol (MCP) integrations. It structures autonomous AI agents into a collaborative cabinet hierarchy — enabling intelligent task decomposition, persistent cross-session memory, strategic reasoning, token-efficient file access, and a full auditable decision trail.

> **Mau replikasi setup ini di mesin lain?** → Baca **[SETUP.md](SETUP.md)** untuk panduan ringkas 6-step (clone, API key, profile, start TUI, test delegation, dashboard).
>
> **Mau ganti model profile?** → Baca **[CARA_GANTI_MODEL.md](CARA_GANTI_MODEL.md)** untuk cheatsheet lengkap.
>
> **CATATAN PENTING:** Section di README ini yang mention `oh-my-openagent` plugin **sudah outdated** sejak commit `2a311f5` (2026-05-27). Plugin tersebut dihapus karena memblok native `task` tool. Sumber kebenaran sekarang ada di `SETUP.md`. Sub-agent dipanggil via `mcp__oc__task` dengan `subagent_type="agent/<nama>"` (wajib prefix `agent/`).

---

## Table of Contents

- [Overview](#overview)
- [Agent Hierarchy](#agent-hierarchy)
- [Features](#features)
- [MCP Servers](#mcp-servers)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Model Profiles](#model-profiles--picking-provider-per-developer)
- [Task-Centric Dashboard](#task-centric-dashboard)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Oh My OpenAgent implements an agent ecosystem structured as a government cabinet. Each agent occupies a distinct role with defined responsibilities, model assignments, fallback policies, and behavioral rules. Agents collaborate through task delegation, shared persistent memory (via the `claude-mem` plugin), and a central SQLite audit trail.

The system is built on top of [OpenCode](https://opencode.ai) and the [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) plugin, extended with:

- Custom 10-agent definitions with strict role boundaries
- 7 active MCP servers (memory, token compression, UI registry, docs, search)
- A Next.js monitoring dashboard
- Self-learning routing via a few-shot observation library
- **`opencode-with-claude` plugin** — routes all Claude model calls through your Claude Max subscription via a local Meridian proxy (no API key billing)

---

## Agent Hierarchy

```
orchestrator  (primary — single entry point, routes ALL requests)
│
├── planner       Decomposes complex tasks into atomic subtasks
├── executor      Implements plans step-by-step with full logging
├── task-runner   Handles focused single-tool operations (fast)
├── oracle        Deep reasoning, architecture decisions, retrospectives
├── memory-keeper Manages cross-session knowledge via claude-mem
├── chronicler    Logs all actions and tool calls to SQLite
├── librarian     File system operations with token-efficient reading
├── analyst       Short-term session buffer and context bridging
└── init-project  Registers new projects into MCP memory (one-time setup)
```

### How delegation works

opencode 1.15+ has a native `task` tool. Every agent under `agents/agent/*.md` with `mode: subagent` is automatically callable from a primary agent (orchestrator, init-project) via:

```
task(<agent-name>, '<task description with full context + project_id>')
```

Each `task()` call spawns a **real separate model invocation** with the sub-agent's own model, tools, and isolated context. The result returns when complete. This is true delegation, not role-switching.

Around every `task()` call, the caller logs the routing intent so the dashboard draws the edge. The sub-agent logs its own start + complete (per the lifecycle protocol). Result: 4 log rows per delegation that build a proper graph + timeline.

See [`agents/agent/LIFECYCLE_PROTOCOL.md`](agents/agent/LIFECYCLE_PROTOCOL.md) for the canonical reference, and [`agents/agent/orchestrator.md`](agents/agent/orchestrator.md) "Specialist Routing Map" for the decision matrix (which specialist for which user intent).

**Named agents** (from `oh-my-openagent.json` — that file is authoritative):

| Agent Name | Role | Model (current) |
|---|---|---|
| `atlas` | Orchestrator | claude-sonnet-4-5 |
| `prometheus` | Planner | claude-sonnet-4-5 |
| `sisyphus` | Executor | claude-sonnet-4-5 |
| `sisyphus-junior` | Task Runner | claude-sonnet-4-5 |
| `oracle` | Oracle | claude-sonnet-4-6 |
| `metis` | Memory Keeper | claude-sonnet-4-5 |
| `momus` | Chronicler | claude-sonnet-4-5 |
| `librarian` | Librarian | claude-sonnet-4-5 |
| `analyst` | Analyst | claude-sonnet-4-5 |
| `init-project` | Project Init | claude-sonnet-4-5 |

> Edit `oh-my-openagent.json` to swap models per agent — the README is a snapshot, the JSON is authoritative.

---

## Features

- **Cabinet-style multi-agent hierarchy** — strict role separation, all work delegated through the orchestrator
- **claude-mem as primary memory layer** — persistent cross-session knowledge, few-shot routing, knowledge corpora
- **Token-efficient file reading** — 7-step tool ladder (smart_search → distill → read) saves 80-98% tokens
- **Self-learning routing** — every outcome is stored as a tagged observation; future requests use it as routing hints
- **Full audit trail** — every agent action, tool call, and memory update logged to SQLite
- **Three-tier memory** — short-term session buffer, long-term claude-mem observations, semantic vector store
- **Automatic project registration** — ask the orchestrator to "init-project" and it routes to the init-project agent which crawls your repo and stores context for all agents
- **Next.js Task-Centric Dashboard** — browser-style task tabs, per-task workspace (header + graph + timeline + clickable node inspector), n8n-style glow edges, drag-drop node positions persisted per task
- **Lifecycle event vocabulary** — agents emit standardized `start | progress | complete | assign | assigned | failed | abandon` events; dashboard renders matching icons + animated delegation arrows (see `agents/agent/LIFECYCLE_PROTOCOL.md`)
- **Cross-OS launcher** — `npm start` works on macOS, Windows, Linux (replaces PowerShell-only `opencode-start.ps1`)
- **MCP retry with exponential backoff** — 2s, 5s, 10s delays before graceful degradation

---

## MCP Servers

### Auto-loaded via `oh-my-openagent@latest` plugin

| MCP | Purpose |
|---|---|
| `claude-mem:mcp-search` | 3-layer memory search (search → timeline → get_observations) |
| `claude-mem:activity-logger` | Agent activity + tool call logging (cross-session) |
| `context7` | Up-to-date library documentation lookup |
| `grep_app` | Real-world GitHub code examples search |
| `websearch` | Live web search |

### Manually configured in `opencode.json`

| MCP | Purpose | Install |
|---|---|---|
| `shadcn` | shadcn/ui component registry, docs, and code examples | Auto via `npx shadcn@latest mcp` |
| `distill` | Token compression — auto-optimize code, logs, diffs, configs | Auto via `opencode` |

**Total active MCPs: 6**

---

## Requirements

| Dependency | Version | Purpose |
|---|---|---|
| [OpenCode CLI](https://opencode.ai) | latest | Runtime host |
| Node.js | 18.x or higher | npm, npx, dashboard |
| `@anthropic-ai/claude-code` | latest | Claude Code CLI — provides OAuth auth for Claude Max |
| Claude Max | active subscription | Model access for all Claude agents (via Meridian proxy) |
| Python | 3.9+ | uvx-based MCPs (optional) |
| `uvx` | any recent | SQLite and ChromaDB MCP servers (optional) |
| GitHub Copilot | active subscription | Model access for GPT-4.1 agents (optional if using Claude only) |

---

## Installation

### Step 1 — Install OpenCode

```bash
npm install -g opencode-ai
```

Verify:
```bash
opencode --version
```

### Step 2 — Clone this repository

```bash
git clone <repo-url>
cd <repo-root>
```

### Step 3 — Install Node dependencies

```bash
npm install
```

This installs the `@opencode-ai/plugin` package required by OpenCode.

### Step 4 — Install dashboard dependencies

```bash
cd dashboard
npm install
cd ..
```

### Step 5 — Install Claude Code CLI and opencode-with-claude plugin

```bash
npm install -g @anthropic-ai/claude-code@latest
npm install -g opencode-with-claude
```

Verify:
```bash
claude --version
opencode-with-claude --version
```

### Step 6 — Authenticate with Claude Max

```bash
claude login
```

This opens a browser for OAuth login. An active **Claude Max subscription** is required. Authentication is stored by the Claude Code CLI and reused automatically — no API key needed.

Verify authentication:
```bash
claude auth status
```

### Step 7 — Create Meridian configuration files

Create `~/.config/meridian/settings.json`:
```json
{
  "sdk_features_enabled": true,
  "client_prompt_passthrough": true
}
```

Create `~/.config/meridian/sdk-features.json`:
```json
{
  "opencode": {
    "memory": true,
    "thinking": "enabled",
    "maxBudgetUsd": 0.5
  }
}
```

These enable extended thinking, memory features, and set a $0.50 per-request budget cap.

### Step 8 — Verify `opencode.json` includes both plugins

Confirm `opencode.json` contains:
```json
{
  "plugin": ["oh-my-openagent@latest", "opencode-with-claude"],
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "http://127.0.0.1:3456",
        "apiKey": "dummy"
      }
    }
  }
}
```

The `baseURL` points to the local Meridian proxy that `opencode-with-claude` starts automatically. The dummy API key is required by the provider schema but not used — OAuth handles auth.

### Step 9 — Install Python MCP dependencies (Optional)

```bash
# Install uv/uvx (optional, used for SQLite and ChromaDB MCP servers)
pip install uv
```

> Note: Python dependencies are optional. Core functionality uses built-in distill token compression.

### Step 10 — Verify all external dependencies

```bash
# OpenCode
opencode --version

# Claude Code CLI
claude --version

# Claude authentication
claude auth status

# npx (for shadcn MCP)
npx --version

# Python (optional, for uvx-based MCPs)
python --version
```

### Step 11 — Initialize agent data directory

The `agent-data/` directory is created automatically on first run. It stores:
- `agent.db` — SQLite audit database
- `session-buffer.json` — active session state
- `vector-store/` — ChromaDB persistent storage (if enabled)

No manual setup needed.

### Step 12 — Start the system

Cross-OS launcher (Node — works on macOS, Windows, Linux):

```bash
# Full system — dashboard + opencode TUI
npm start

# Dashboard only (no opencode TUI)
npm run start:no-tui

# Health check — verify Node, npm, opencode, ports, SQLite
npm run status
```

On startup you should see `dashboard ready at http://localhost:3000` followed by the OpenCode TUI in your terminal. Ctrl-C in the TUI tears down the dashboard automatically.

`opencode-start.ps1` and `opencode-start.sh` are kept as legacy fallbacks; new users should prefer `npm start`.

---

## Configuration

### `opencode.json`

Primary config. Defines active plugins, the Anthropic provider proxy, and manually-configured MCP servers.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oh-my-openagent@latest",
    "opencode-with-claude"
  ],
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "http://127.0.0.1:3456",
        "apiKey": "dummy"
      }
    }
  },
  "mcp": {
    "shadcn": {
      "type": "local",
      "command": ["npx", "shadcn@latest", "mcp"]
    }
  }
}
```

**Key fields:**
- `plugin[1]` — `opencode-with-claude` starts the Meridian proxy automatically and manages its lifecycle
- `provider.anthropic.baseURL` — all Claude API calls go to the local proxy instead of api.anthropic.com
- `apiKey: "dummy"` — required by schema but unused; OAuth from `claude login` handles auth

### `~/.config/meridian/settings.json`

Controls Meridian proxy behavior:

```json
{
  "sdk_features_enabled": true,
  "client_prompt_passthrough": true
}
```

### `~/.config/meridian/sdk-features.json`

SDK feature toggles — reloaded per request (no restart needed):

```json
{
  "opencode": {
    "memory": true,
    "thinking": "enabled",
    "maxBudgetUsd": 0.5
  }
}
```

Adjust `maxBudgetUsd` to control per-request spending. Set `"thinking": "disabled"` to turn off extended thinking.

### `oh-my-openagent.json`

Defines all agent identities, assigned models, fallback models, and `prompt_append` directives. Edit this file to:
- Swap models per agent
- Add new named agents
- Tune per-agent behavior via `prompt_append`
- Adjust workflow categories (`task-flow`, `multi-step-flow`, `visual-engineering`, etc.)

### `agents/agent/*.md`

Full agent behavior specs. Each file defines:
- Role boundary (what the agent must and must not do)
- Step-by-step workflow
- MCP tool usage (claude-mem, distill, shadcn, etc.)
- Logging protocol (SQLite + claude-mem dual-layer)
- Output format

Edit these to change how each agent thinks and acts.

### `agent-data/`

Runtime data directory (gitignored). Created automatically on first run:

| File | Description |
|---|---|
| `agent.db` | SQLite database — all agent logs, tool calls, audit records |
| `session-buffer.json` | Current session state managed by the Analyst agent |
| `vector-store/` | ChromaDB persistent storage (if enabled) |

---

## Getting Started

### Register your project (recommended first step)

In the OpenCode TUI, send a natural-language prompt:

```
Initialize this project for the agent system. Read package.json and README.md, identify the tech stack and conventions, then register it via the init-project agent so all other agents have context.
```

The orchestrator routes this to the `init-project` agent, which reads your working directory, extracts structured context, and stores it in claude-mem so future agents don't have to re-read files every session.

> Older docs mentioned `/init-project` as a slash command — that was a planning artifact. There is no such slash command; the system uses agent routing instead.

### Start the agent system

```powershell
# Full system (recommended) — OpenCode + Meridian proxy + Claude Memory + dashboard
oc

# OpenCode + Meridian proxy only (fast, no dashboard)
oc opencode

# Health check — verify all components before starting
oc status
```

On startup, watch for `Claude Max Proxy listening on http://127.0.0.1:3456` — this confirms the proxy is running and all Claude agent calls will route through your Claude Max subscription.

### Interact via the orchestrator

All requests should go through the orchestrator — it classifies, routes, delegates, and returns results:

```
# New feature
build a dark mode toggle for the settings page

# Architecture question
should we use Redis or Memcached for caching?

# Code refactor
refactor the authentication module to use JWT

# Quick lookup
what's the latest version of Next.js?

# shadcn UI component
show me how to use the shadcn Dialog component

# Register a new project (natural-language, NOT a slash command)
Initialize this project for the agent system — read package.json and README.md, identify tech stack/conventions, register via init-project agent.
```

### Invoke specialist agents directly (advanced)

```
ask prometheus to plan the database migration
ask sisyphus to execute step 2 of the auth refactor
ask oracle to analyze whether to use microservices
ask metis to recall past decisions on authentication
ask librarian to read the opencode.json config
```

### Start the monitoring dashboard

```bash
cd dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view live agent activity, routing edges, and workflow state.

### Start everything at once

```powershell
# Via the oc command (recommended — uses your PowerShell profile)
oc

# Or directly via the launcher script
.\opencode-start.ps1
```

---

## Directory Structure

```
.
├── agent-data/             Runtime data — gitignored, auto-created
│   ├── agent.db            SQLite audit database (now also: sessions, tasks, task_node_positions)
│   └── memory.jsonl        Short-term session memory (managed by analyst)
├── agent/
│   └── core/               skills-registry.ts (claude-mem skill catalog)
├── agents/
│   └── agent/              Agent behavior spec files (*.md) — the real "source code"
│       ├── orchestrator.md, planner.md, executor.md, task-runner.md,
│       ├── oracle.md, memory-keeper.md, chronicler.md,
│       ├── librarian.md, analyst.md, init-project.md
│       └── LIFECYCLE_PROTOCOL.md   ← single source of truth for event vocab
├── dashboard/              Next.js 15 task-centric dashboard
│   ├── app/
│   │   ├── page.tsx        Main dashboard entry (mounts TaskTabBar + workspace)
│   │   └── api/            14 GET routes + PUT/DELETE for task_node_positions
│   ├── components/
│   │   ├── TaskTabBar.tsx           Browser-style task tabs
│   │   ├── TaskWorkspace.tsx        Header + graph + timeline + reset
│   │   ├── NodeInspector.tsx        Floating per-node detail overlay
│   │   ├── AgentGraphPanel.tsx      ReactFlow graph with glow + drag-persist
│   │   ├── PlansPanel.tsx           Plan progress (legacy)
│   │   └── ModelFailurePanel.tsx
│   └── lib/
│       ├── db.ts                    SQLite + idempotent migrations
│       ├── task-inference.ts        sessions/tasks heuristic
│       ├── task-derive.ts           per-agent stats + files-modified extractor
│       ├── lifecycle-events.ts      raw log → normalized event interpreter
│       ├── agent-registry.ts        canonical id / variants / display
│       └── opencode-config.ts
├── docs/                   Architecture and troubleshooting guides
├── plugins/                claude-mem.js (OpenCode plugin entry point)
├── scripts/                Cross-OS launcher (start.mjs) + health check (status.mjs)
├── oh-my-openagent.json    Agent identities, models, prompt directives (authoritative)
├── opencode.json           OpenCode plugin + MCP server config
├── opencode-start.ps1      Legacy PowerShell launcher (kept as fallback)
├── opencode-start.sh       Legacy bash launcher (kept as fallback)
└── package.json            Root npm scripts: start, start:no-tui, status
```

> Folders not listed (`workflows/`, `config/`, `llm/`, `memory/`, `prompts/`, `tools/`, `types/`) appeared in older READMEs but never landed on disk — the actual source is in `agents/agent/*.md` prompt specs.

---

## Troubleshooting

### Proxy failed to start

```powershell
# 1. Check Claude authentication
claude auth status

# 2. Check if port 3456 is already in use
netstat -ano | findstr :3456

# 3. Re-authenticate if needed
claude login
```

Each OpenCode instance auto-assigns a port (3456, 3457, 3458…). Check the startup log for the actual port if multiple instances are running.

### Claude Code CLI not found

```powershell
npm install -g @anthropic-ai/claude-code@latest
```

Then verify: `claude --version`

### Claude not authenticated

```powershell
claude login
```

Opens a browser for OAuth login. Requires an active Claude Max subscription. After login, verify with `claude auth status`.

### SDK features not applying

Edit `~/.config/meridian/sdk-features.json` — changes take effect on the next request, no restart needed.

### shadcn MCP not connecting

Run the init command to pre-cache the package:

```bash
npx shadcn@latest mcp
```

### ChromaDB / vector-memory timeout on startup

ChromaDB initializes slowly on first run. Pre-warm it before starting OpenCode:

```powershell
uvx chroma-mcp --client-type persistent --data-dir ".\agent-data\vector-store"
```

Wait for the server-ready message, then launch OpenCode in a separate terminal.

### MCP connection failures

Check all MCP server statuses:

```bash
opencode mcp list
```

All servers should show `Connected`. If any show a timeout:
1. Restart OpenCode to reset all MCP connections
2. Check that `npx`, `python`, and `uvx` are all in your PATH
3. Run `opencode mcp list` again to confirm

Agents automatically retry with exponential backoff (2s, 5s, 10s) before degrading gracefully. Detailed steps in `docs/MCP_TROUBLESHOOTING.md`.

### Agent returns "project_id required" error

Ask the orchestrator (in natural language) to initialize the project first — e.g. *"register this project via the init-project agent"*. This puts a row in `project_registry` so subsequent agents have context.

### Models not found error (Claude agents)

Claude model calls (`claude-sonnet-4-6`, etc.) route through the Meridian proxy using your Claude Max subscription. If they fail:

1. Confirm proxy is running: look for `Claude Max Proxy listening on http://127.0.0.1:3456` in startup logs
2. Check auth: `claude auth status`
3. Confirm `opencode.json` has the `provider.anthropic.baseURL` set to `http://127.0.0.1:3456`

### Models not found error (GPT agents)

GPT-4.1 agents (`atlas`, `prometheus`, `sisyphus`, etc.) require GitHub Copilot:
- `github-copilot/gpt-4.1`
- `github-copilot/gpt-4.1-mini`

Ensure your GitHub Copilot subscription is active and OpenCode is authenticated with GitHub.

---

## Model Profiles — picking provider per developer

Different team members have different subscriptions (Claude Max, Copilot, Gemini, or just free models). Instead of editing `oh-my-openagent.json` by hand, each developer picks a profile via an env var:

```bash
# Set once in ~/.zshrc (or equivalent shell rc)
export OC_PROFILE=google-first    # then `npm start` auto-applies it
```

Available profiles (in `model-profiles/`):

| Profile | Requires | When to use |
|---|---|---|
| `claude-max`   | Claude Max + Copilot login   | Best quality, highest cost when off-Max |
| `google-first` | `GEMINI_API_KEY` env         | Generous free tier, ~3k req/day |
| `copilot-only` | GitHub Copilot subscription  | Single subscription only |
| `ultra-hemat`  | Nothing                      | Learn/experiment without paying |

Each profile defines a `default` model + fallback chain, plus per-agent `overrides`. Apply manually any time:

```bash
npm run profile google-first
# patches both oh-my-openagent.json AND agents/agent/*.md frontmatter,
# writes a timestamped backup, prints the new model map
```

The launcher runs the apply step automatically when `OC_PROFILE` is set. See `model-profiles/README.md` for the file format and how to add new profiles.

> **Why both JSON + .md must be patched:** opencode TUI reads `model:` from each agent's `.md` frontmatter first; that wins over `oh-my-openagent.json`. The profile applier keeps both in sync so the entry-point agent (`agent/Orchestrator`) and all delegated sub-agents end up on the same provider.

---

## Task-Centric Dashboard

The dashboard is built around **sessions** (one opencode run = one tab). Inside each session, the underlying task model is still inferred from agent_log (see `dashboard/lib/task-inference.ts`) and exposed as optional drill-down chips at the top of the timeline — but the primary tab unit is the session.

### What you get per session

- **Browser-style tab** in the top bar (live sessions shown first with spinner, ended sessions show check)
- **URL-synced state** — `?session_id=…` survives reload and can be shared (legacy `?task_id=` also accepted for back-compat)
- **Per-session workspace** — context header (start time, duration, agent chips), graph (filtered to this session), timeline (chronological lifecycle events across the whole session)
- **Task drill-down chips** — when a session contains multiple tasks, chips appear at the top of the workspace; click one to narrow graph + timeline to that task only
- **Clickable graph nodes** open a **floating inspector** showing: status, last action, tools used + counts, files modified (extracted from `Edit/Write/MultiEdit` tool calls), model, total duration, prompt preview
- **Drag-drop node positions** — your layout is saved per task in SQLite (`task_node_positions`); "Reset layout" button clears it and re-applies auto-layout
- **Glow flowing edges** (n8n-style) on active routes — color matches the route's own status (failed → red, active → indigo)
- **Pulse halo** on currently-running nodes — visible in under a second

### Lifecycle event vocabulary

Agents log activity via the chronicler MCP. To get full visual treatment in the dashboard (icons, animated delegation arrows, etc.) agents follow the vocabulary in [`agents/agent/LIFECYCLE_PROTOCOL.md`](agents/agent/LIFECYCLE_PROTOCOL.md):

| Event | When | Sample action/status |
|---|---|---|
| `start`    | Agent began work | `action: start`, `status: started` |
| `progress` | Intermediate update | `action: progress`, `status: in_progress` |
| `complete` | Done successfully | `action: complete`, `status: completed` |
| `failed`   | Errored out | `status: failed` |
| `assign`   | Delegated to another agent | `action: route` / `delegate` (mention target id in description) |
| `assigned` | Received delegation | `action: receive`, `status: started` |
| `abandon`  | Task dropped | `action: abandon`, `status: abandoned` |

The interpreter (`dashboard/lib/lifecycle-events.ts`) is tolerant — unknown values fall back to a generic `log` event so historical data still renders.

---

## Documentation

| Document | Description |
|---|---|
| `agents/agent/LIFECYCLE_PROTOCOL.md` | Event vocabulary every agent should emit |
| `model-profiles/README.md` | Profile system: format, switching, adding new profiles |
| `MODEL_PROFILES.md` | Pre-baked profile cheatsheet (Google-first, Big-task, Ultra-hemat) |
| `docs/INDONESIAN_GOVERNMENT_SYSTEM.md` | Full agent role matrix, hierarchy, and behavioral specs |
| `docs/AUTO_WORKFLOW_RULES.md` | Per-agent auto-workflow rules and MCP invocation policies |
| `docs/ARCHITECTURE_REFACTOR_PLAN.md` | Planned modular architecture and migration roadmap |
| `docs/DEPLOYMENT_GUIDE.md` | Production deployment and usage reference |
| `docs/MCP_TROUBLESHOOTING.md` | MCP server failure diagnosis and remediation |
| `docs/PROMPT_TO_CODE_MIGRATION.md` | Migration guide from prompt-centric to code-driven config |

---

## Contributing

Open an issue before submitting pull requests for significant changes. Bug fixes and documentation improvements are welcome without prior discussion.

---

## License

MIT License. See `LICENSE` for details.
