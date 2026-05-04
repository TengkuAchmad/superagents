# Oh My OpenAgent

A production-ready, multi-agent orchestration platform built on OpenCode with Model Context Protocol (MCP) integrations. This project structures autonomous AI agents into a collaborative cabinet hierarchy, enabling advanced task decomposition, persistent memory, strategic reasoning, and auditable decision trails — designed for complex, multi-step software engineering and operational workflows.

---

## Overview

Oh My OpenAgent implements an agent ecosystem structured as a government cabinet. Each agent occupies a distinct role with defined responsibilities, model assignments, fallback policies, and behavioral rules. Agents collaborate through task delegation, shared memory, and a central SQLite audit trail.

The system is built on top of [OpenCode](https://opencode.ai) and the [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) plugin, extended with custom agent definitions, MCP server configurations, a REST API layer, and a Next.js dashboard.

---

## Agent Hierarchy

```
PRABOWO (Presidential Orchestrator)
 Routes all requests through the cabinet
 |
 |-- GIBRAN (Coordinating Minister - Planner)
 |    Decomposes complex tasks into sequential workflows
 |
 |-- SUHARSO (Deputy Coordinating Minister - Executor)
 |    Implements plans step-by-step with full logging
 |
 |-- DUDUNG (Chief of Staff - Tool Caller)
 |    Handles focused single-tool and data operations
 |
 |-- HASAN NASBI (Communications Advisor - Memory Manager)
 |    Maintains the persistent knowledge graph
 |
 |-- ANDI ARIEF (Deputy Chief of Staff - Database Logger)
 |    Logs all agent actions, tool calls, and decisions to SQLite
 |
 |-- BAKOM (Government Communications Agency - Filesystem)
 |    Handles file operations and documentation retrieval
 |
 |-- MAHFUD MD (Senior Coordinating Minister - Oracle)
      High-IQ reasoning, strategic analysis, and arbitration
```

---

## Features

- **Cabinet-style multi-agent hierarchy** with strict role separation and task delegation
- **Automatic MCP server orchestration** for memory, vector storage, filesystem, SQLite, and sequential thinking
- **Three-tier persistent memory**: short-term session buffer, long-term knowledge graph, and semantic vector store (ChromaDB)
- **Full audit trail**: every agent action, tool call, and memory update is logged to SQLite
- **Workflow categories** tuned to task type: `task-flow`, `multi-step-flow`, `visual-engineering`, `ultrabrain`, `deep`, `quick`, and more
- **Next.js dashboard** for monitoring agent activity and workflow state
- **Express REST API** with agent, analytics, and health endpoints
- **Sequential thinking** for structured multi-step reasoning
- **AST-aware code search**, LSP diagnostics, and session management tooling
- **Automatic MCP retry** with exponential backoff and graceful degradation

---

## Requirements

- **Node.js** 18.x or higher
- **npm** (or yarn / pnpm / bun)
- **Python** environment with `uvx` available (for MCP SQLite and ChromaDB servers)
- **OpenCode CLI** installed globally
- **GitHub Copilot** access (models: `gpt-4.1`, `gpt-4.1-mini`, `claude-sonnet-4.6`)

---

## Installation

### 1. Clone the repository

```bash
git clone <repo-url>
cd <repo-root>
```

### 2. Install root dependencies

```bash
npm install
```

This installs the `@opencode-ai/plugin` dependency required by OpenCode.

### 3. Install dashboard dependencies

```bash
cd dashboard
npm install
```

### 4. Verify external dependencies

Ensure the following are available in your PATH:

```bash
# Check OpenCode
opencode --version

# Check uvx (used for SQLite and ChromaDB MCP servers)
uvx --version

# Check npx (used for memory, filesystem, and sequential-thinking MCP servers)
npx --version
```

---

## Configuration

### `opencode.json`

The primary configuration file. Defines the active plugin and all MCP server connections.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-openagent@latest"],
  "mcp": {
    "memory":             { "command": ["npx", "-y", "@modelcontextprotocol/server-memory"] },
    "filesystem":         { "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "<paths>"] },
    "sqlite":             { "command": ["uvx", "mcp-server-sqlite", "--db-path", "<path-to-agent.db>"] },
    "sequential-thinking":{ "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"] },
    "vector-memory":      { "command": ["uvx", "chroma-mcp", "--client-type", "persistent", "--data-dir", "<path>"] }
  }
}
```

Update all file paths in `opencode.json` to match your local environment before running.

### `oh-my-openagent.json`

Defines all agent identities, assigned models, fallback models, and behavioral prompt directives. Edit this file to customize agent behavior, swap models, or add new agents.

### `agent-data/`

Runtime data directory. Contains:
- `agent.db` — SQLite database for all agent logs, tool calls, and audit records
- `memory.jsonl` — Knowledge graph for long-term memory
- `vector-store/` — ChromaDB persistent vector storage

This directory is excluded from version control. It is created automatically on first run.

---

## Getting Started

### Start the agent system

```bash
opencode
```

OpenCode will load the plugin, connect all configured MCP servers, and make all agents available for interaction.

### Interact with agents by role

**Route all work through the orchestrator (recommended):**
```
ask prabowo to implement an authentication system
ask prabowo to review my code and suggest improvements
ask prabowo to refactor the API layer
```

**Invoke specialists directly:**
```
ask gibran to plan the database migration
ask suharso to execute the migration plan
ask dudung to query the agent database for recent errors
ask mahfud to analyze whether to use microservices or a monolith
ask hasan_nasbi to recall past decisions on authentication
```

### Start the dashboard

```bash
cd dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### Start the API server

```powershell
.\start-api.ps1
```

Or, for the dashboard separately:

```powershell
.\start-dashboard.ps1
```

---

## Directory Structure

```
.
|-- agent/                  Core agent definitions and orchestration logic
|-- agent-data/             Runtime data: SQLite DB, memory, vector store (gitignored)
|-- agents/                 Agent prompt and configuration files
|-- api/                    Express REST API (routes, controllers)
|   |-- routes/
|   |-- controllers/
|   `-- server.ts
|-- config/                 Shared configuration modules
|-- dashboard/              Next.js monitoring dashboard
|   |-- app/
|   |-- components/
|   `-- lib/
|-- docs/                   Architecture, deployment, and troubleshooting guides
|-- llm/                    LLM provider abstractions
|-- memory/                 Memory layer implementations (short-term, long-term, vector)
|-- prompts/                System and task prompt templates
|-- tools/                  MCP client wrappers and utility tools
|-- types/                  Shared TypeScript type definitions
|-- workflows/              Workflow definitions and execution flows
|-- oh-my-openagent.json    Agent definitions and model assignments
|-- opencode.json           OpenCode plugin and MCP server configuration
|-- opencode-start.ps1      PowerShell launcher for the full system
|-- start-api.ps1           PowerShell launcher for the API server
`-- start-dashboard.ps1     PowerShell launcher for the dashboard
```

---

## Troubleshooting

### ChromaDB / vector-memory timeout on startup

ChromaDB takes time to initialize on first run. Pre-warm it before starting OpenCode:

```powershell
uvx chroma-mcp --client-type persistent --data-dir ".\agent-data\vector-store"
```

Wait for the server-ready message, then launch OpenCode in a separate terminal.

To disable vector memory temporarily, set `"enabled": false` on the `vector-memory` block in `opencode.json`.

### MCP connection failures

Check MCP server status:

```bash
opencode mcp list
```

All servers should report `Connected`. If any show a timeout, restart OpenCode. Agents automatically retry with exponential backoff (2s, 5s, 10s delays) before degrading gracefully.

Detailed troubleshooting steps are available in `docs/MCP_TROUBLESHOOTING.md`.

---

## Documentation

| Document | Description |
|---|---|
| `docs/INDONESIAN_GOVERNMENT_SYSTEM.md` | Full agent role matrix, hierarchy, and behavioral specifications |
| `docs/AUTO_WORKFLOW_RULES.md` | Per-agent auto-workflow rules and MCP invocation policies |
| `docs/ARCHITECTURE_REFACTOR_PLAN.md` | Planned modular architecture and migration roadmap |
| `docs/DEPLOYMENT_GUIDE.md` | Production deployment and usage reference |
| `docs/MCP_TROUBLESHOOTING.md` | MCP server failure diagnosis and remediation |
| `docs/PROMPT_TO_CODE_MIGRATION.md` | Migration guide from prompt-centric to code-driven configuration |

---

## Contributing

Open an issue before submitting pull requests for significant changes. Bug fixes and documentation improvements are welcome without prior discussion.

---

## License

MIT License. See `LICENSE` for details.
