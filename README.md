# Oh My OpenAgent

A production-ready, multi-agent orchestration platform built on OpenCode with Model Context Protocol (MCP) integrations. It structures autonomous AI agents into a collaborative cabinet hierarchy — enabling intelligent task decomposition, persistent cross-session memory, strategic reasoning, token-efficient file access, and a full auditable decision trail.

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
- A REST API layer and Next.js monitoring dashboard
- Self-learning routing via a few-shot observation library

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

**Named agents** (from `oh-my-openagent.json`):

| Agent Name | Role | Model |
|---|---|---|
| `atlas` | Orchestrator | gpt-4.1 |
| `prometheus` | Planner | gpt-4.1 |
| `sisyphus` | Executor | gpt-4.1 |
| `sisyphus-junior` | Task Runner | gpt-4.1-mini |
| `oracle` | Oracle | claude-sonnet-4.6 |
| `metis` | Memory Keeper | gpt-4.1 |
| `momus` | Chronicler | gpt-4.1 |
| `librarian` | Librarian | gpt-4.1-mini |
| `explore` | Explorer | gpt-4.1-mini |
| `multimodal-looker` | Media Analyst | gpt-4.1-mini |

---

## Features

- **Cabinet-style multi-agent hierarchy** — strict role separation, all work delegated through the orchestrator
- **claude-mem as primary memory layer** — persistent cross-session knowledge, few-shot routing, knowledge corpora
- **Token-efficient file reading** — 7-step tool ladder (smart_search → distill → read) saves 80-98% tokens
- **Self-learning routing** — every outcome is stored as a tagged observation; future requests use it as routing hints
- **Full audit trail** — every agent action, tool call, and memory update logged to SQLite
- **Three-tier memory** — short-term session buffer, long-term claude-mem observations, semantic vector store
- **Automatic project registration** — `/init-project` crawls your repo and stores context for all agents
- **Next.js monitoring dashboard** — live view of agent activity, routing edges, and workflow state
- **Express REST API** — agent, analytics, and health endpoints
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
| Python | 3.9+ | uvx-based MCPs (optional) |
| `uvx` | any recent | SQLite and ChromaDB MCP servers (optional) |
| GitHub Copilot | active subscription | Model access (gpt-4.1, claude-sonnet-4.6) |

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

### Step 5 — Install Python MCP dependencies (Optional)

```bash
# Install uv/uvx (optional, used for SQLite and ChromaDB MCP servers)
pip install uv
```

> Note: Python dependencies are optional. Core functionality uses built-in distill token compression.

### Step 6 — Verify all external dependencies

```bash
# OpenCode
opencode --version

# npx (for shadcn MCP)
npx --version

# Python (optional, for uvx-based MCPs)
python --version
```

### Step 7 — Configure paths in `opencode.json`

Open `opencode.json` and verify the MCP server configuration matches your environment. The `shadcn` and `distill` MCPs auto-resolve — no path changes needed.

If you use SQLite or ChromaDB MCPs, update their `--db-path` and `--data-dir` arguments to absolute paths on your machine.

### Step 8 — Initialize agent data directory

The `agent-data/` directory is created automatically on first run. It stores:
- `agent.db` — SQLite audit database
- `session-buffer.json` — active session state
- `vector-store/` — ChromaDB persistent storage (if enabled)

No manual setup needed.

### Step 9 — Start OpenCode

```powershell
# Windows (full system — OpenCode + API + dashboard)
.\opencode-start.ps1

# Or launch OpenCode only
opencode
```

---

## Configuration

### `opencode.json`

Primary config. Defines the active plugin and all manually-configured MCP servers.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-openagent@latest"],
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  },
  "experimental": {
    "preemptive_compaction_threshold": 0.75,
    "dcp_for_compaction": true
  }
}
```

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

```
/init-project
```

The orchestrator auto-detects your working directory, reads `package.json` / `README.md` / config files, and stores structured context in claude-mem. After this, all agents know your project's tech stack, conventions, and structure without re-reading files every session.

### Start the agent system

```bash
opencode
```

OpenCode loads the plugin, connects all MCP servers, and makes all agents available.

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

# Register a new project
/init-project
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

### Start the API server

```powershell
.\start-api.ps1
```

API endpoints available at `http://localhost:3001`:
- `GET /health` — system health check
- `GET /api/agents` — list all agents and status
- `GET /api/analytics` — session statistics

### Start everything at once

```powershell
.\opencode-start.ps1
```

---

## Directory Structure

```
.
├── agent/                  Core orchestration logic (TypeScript)
│   └── core/               orchestrator.ts, planner.ts, executor.ts
├── agent-data/             Runtime data — gitignored, auto-created
│   ├── agent.db            SQLite audit database
│   ├── session-buffer.json Active session state
│   └── vector-store/       ChromaDB persistent storage
├── agents/
│   └── agent/              Agent behavior spec files (*.md)
│       ├── orchestrator.md
│       ├── planner.md
│       ├── executor.md
│       ├── task-runner.md
│       ├── oracle.md
│       ├── memory-keeper.md
│       ├── chronicler.md
│       ├── librarian.md
│       ├── analyst.md
│       └── init-project.md
├── api/                    Express REST API
│   ├── routes/
│   ├── controllers/
│   └── server.ts
├── config/                 Shared configuration modules
├── dashboard/              Next.js monitoring dashboard
│   ├── app/
│   ├── components/
│   └── lib/
├── docs/                   Architecture and troubleshooting guides
├── llm/                    LLM provider abstractions
├── memory/                 Memory layer implementations
├── plugins/                OpenCode plugin definitions
├── prompts/                System and task prompt templates
├── tools/                  MCP client wrappers
├── types/                  Shared TypeScript type definitions
├── workflows/              Workflow definitions and execution flows
├── oh-my-openagent.json    Agent identities, models, and prompt directives
├── opencode.json           OpenCode plugin and MCP server config
├── opencode-start.ps1      Full system launcher (PowerShell)
├── start-api.ps1           API server launcher
└── start-dashboard.ps1     Dashboard launcher
```

---

## Troubleshooting

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

Run `/init-project` in your workspace first. This registers the project in SQLite and claude-mem so all agents can find it.

### Models not found error

This system requires GitHub Copilot access for:
- `github-copilot/gpt-4.1`
- `github-copilot/gpt-4.1-mini`
- `github-copilot/claude-sonnet-4.6`

Ensure your GitHub Copilot subscription is active and OpenCode is authenticated.

---

## Documentation

| Document | Description |
|---|---|
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
