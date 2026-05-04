# Indonesian Government AI Agent System

## Overview

The AI agent framework is now structured as the **Indonesian Presidential Cabinet** (Kabinet Indonesia Maju):

```
┌─────────────────────────────────────────────────────────────┐
│                    PRABOWO (President)                      │
│              Presidential Orchestrator                       │
│         Routes all requests through the cabinet              │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐    ┌──────▼──────┐   ┌──────▼──────┐
    │  GIBRAN  │    │  SUHARSO    │   │   DUDUNG    │
    │ Planner  │    │  Executor   │   │ Tool-Caller │
    │(Minister)│    │  (Deputy)   │   │   (CoS)     │
    └──────────┘    └─────────────┘   └─────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐    ┌──────▼──────┐   ┌──────▼──────┐
    │ HASAN   │    │    BAKOM    │   │  ANDI ARIEF │
    │ NASBI   │    │ Filesystem  │   │  Database   │
    │ Memory  │    │   Handler   │   │   Logger    │
    └────┬────┘    └─────────────┘   └─────────────┘
         │
    ┌────▼────────────────────┐
    │      MAHFUD MD          │
    │  Oracle (High Reasoning)│
    └─────────────────────────┘
```

## Agent Details

### 1. **Prabowo** (Presidential Orchestrator)
- **Role**: Main entry point for all requests
- **Function**: Routes to appropriate minister based on task type
- **Auto-invokes**: Memory (recall context), database logging, git-master skill
- **Model**: GitHub Copilot GPT-5.5 (medium), fallback to Sonnet
- **Example**: `ask prabowo to implement a new feature` → routes to Gibran (planning) → Suharso (execution)

### 2. **Gibran** (Coordinating Minister - Planner)
- **Role**: Multi-step workflow planner
- **Function**: Breaks down complex tasks, creates execution plans
- **Auto-invokes**: Sequential-thinking tool, memory recall, database logging
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: `ask gibran to plan the refactoring` → creates step-by-step plan → logs to database

### 3. **Suharso** (Deputy Coordinating Minister - Executor)
- **Role**: Action executor
- **Function**: Implements planned tasks step-by-step
- **Auto-invokes**: Database logging per step, memory updates, progress reporting
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: `ask suharso to execute the plan` → runs each step → logs completion → reports to Prabowo

### 4. **Dudung** (Presidential Chief of Staff - Tool-Caller)
- **Role**: External tool coordinator
- **Function**: Web search, database queries, API calls
- **Auto-invokes**: Tool call logging, result storage in memory
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: `ask dudung to search for X` → calls web_search_exa → logs query to database

### 5. **Hasan Nasbi** (Communications Advisor - Memory Manager)
- **Role**: Context and knowledge management
- **Function**: Maintains knowledge graph, recalls past decisions, stores learnings
- **Auto-invokes**: Entity creation, memory graph updates, context retrieval
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: `ask hasan to remember decision X` → stores as entity → recalls when needed

### 6. **BAKOM** (Government Comms Agency - Filesystem Handler)
- **Role**: File operations coordinator
- **Function**: Read/write documents, manage files
- **Auto-invokes**: File access logging, audit trail recording
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: `ask bakom to read config.json` → reads file → logs access

### 7. **Andi Arief** (Deputy Chief of Staff - Database Logger)
- **Role**: Audit and record management
- **Function**: Logs all government activities, maintains audit trail
- **Auto-invokes**: INSERT operations for every major action
- **Model**: GitHub Copilot GPT-5-mini, fallback to Sonnet
- **Example**: Automatically called by all agents to log decisions

### 8. **Mahfud MD** (Coordinating Minister - Oracle)
- **Role**: High-level strategic decisions
- **Function**: Complex reasoning, architecture decisions, multi-system analysis
- **Auto-invokes**: Memory consultation, sequential-thinking for deep analysis, database logging
- **Model**: GitHub Copilot GPT-5.5 (high), fallback to Sonnet (medium)
- **Example**: `ask mahfud for strategic analysis` → deep thinking → logs final decision

## Model Strategy: Free-First, Sonnet Fallback

All agents use **GitHub Copilot models first** (free for most users), with **Anthropic Claude Sonnet as fallback** for advanced capabilities:

| Task Complexity | Primary Model | Fallback |
|---|---|---|
| Simple (quick) | GPT-5-mini | Claude Haiku |
| Standard (task-flow) | GPT-5-mini | Claude Sonnet |
| Complex (multi-step-flow) | GPT-5.5 (medium) | Claude Sonnet (medium) |
| Hard reasoning (ultrabrain) | GPT-5.5 (high) | Claude Sonnet (medium) |
| Strategic decisions (mahfud) | GPT-5.5 (high) | Claude Sonnet (medium) |

**Why this approach?**
- GitHub Copilot models are **free or low-cost** for most users
- Claude Sonnet provides **reliable fallback** if Copilot is unavailable
- No expensive Claude Opus or Gemini Pro required
- Cost-optimized while maintaining quality

## Auto-Workflow Invocation

Every agent interaction **automatically**:

1. ✅ **Recalls Memory** — Searches past interactions for context
2. ✅ **Logs to Database** — Records decision + timestamp + result
3. ✅ **Uses Sequential-Thinking** — For complex tasks requiring multi-step reasoning
4. ✅ **Loads Skills** — Auto-loads git-master for code work, playwright for browser work
5. ✅ **Updates Memory Graph** — Creates/updates entities for decisions and learnings
6. ✅ **Maintains Audit Trail** — Full record of all actions in SQLite

**Example flow for "implement a new feature":**

```
USER: "Implement a new feature to handle authentication"
         ↓
    PRABOWO (orchestrator)
    - Recalls memory: "past auth decisions?"
    - Routes: "Multi-step work → Gibran (planner)"
         ↓
    GIBRAN (planner)
    - Uses sequential-thinking: "Break down auth feature into steps"
    - Logs to database: "Planning initiated for auth feature"
    - Stores plan in memory: "Step 1: Create auth module, Step 2: ..."
    - Routes: "Execute plan → Suharso (executor)"
         ↓
    SUHARSO (executor)
    - Recalls memory: "Previous auth patterns?"
    - Executes step 1: "Create auth module"
    - Logs to database: "Step 1 completed, duration: 5min"
    - Updates memory: "Auth module created, status: success"
    - Executes step 2: "Integrate with API"
    - Calls tool via DUDUNG: "Search for OAuth best practices"
    - DUDUNG logs search to database, stores results in memory
    - Logs completion to database
    - Reports to PRABOWO: "Feature complete ✓"
         ↓
    PRABOWO (final response)
    - Recalls full workflow from memory
    - Logs final decision to database
    - Reports to user: "Feature implemented successfully"
```

## Database Schema

All activities logged to SQLite (`agent-data/agent.db`):

```sql
CREATE TABLE agent_log (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  agent_name TEXT NOT NULL,           -- 'prabowo', 'gibran', etc.
  action TEXT NOT NULL,               -- 'route', 'plan', 'execute', etc.
  description TEXT,
  status TEXT,                        -- 'started', 'completed', 'failed'
  result TEXT,                        -- JSON serialized result
  duration_ms INTEGER
);

CREATE TABLE memory_updates (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_name TEXT,
  entity_type TEXT,
  observation TEXT,
  source_agent TEXT
);

CREATE TABLE tool_calls (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  agent_name TEXT,
  tool_name TEXT,                     -- 'web_search', 'sqlite', etc.
  parameters TEXT,                    -- JSON
  result TEXT,                        -- JSON
  status TEXT
);
```

## Usage Examples

### Example 1: Simple Task (Quick)
```
me: analyze this error and fix it
prabowo: recalls memory, logs to database, auto-routes to suharso
suharso: loads git-master skill, fixes error, logs completion
```

### Example 2: Complex Task (Multi-step)
```
me: refactor the authentication system
prabowo: routes to gibran (planner)
gibran: uses sequential-thinking, creates 5-step plan, logs to database
prabowo: routes to suharso (executor)
suharso: executes each step, calls dudung for web searches, logs progress
```

### Example 3: Strategic Decision (Oracle)
```
me: should we migrate to microservices?
prabowo: this requires mahfud's strategic analysis
mahfud: deep reasoning, sequential thinking, recalls past decisions
mahfud: logs final recommendation to database
```

### Example 4: Memory Recall
```
me: remind me of the auth decision we made last week
prabowo: routes to hasan_nasbi (memory manager)
hasan_nasbi: searches memory graph for auth-related entities
hasan_nasbi: returns past decision + context
```

## Configuration Files

### `oh-my-openagent.json`
Defines all Indonesian government agents with:
- Model assignments (Copilot first, Sonnet fallback)
- Auto-prompt appending (memory, logging, skills)
- Descriptions and roles

### `opencode.json`
Configures MCPs and auto-workflow rules:
- Memory MCP (knowledge graph persistence)
- Filesystem MCP (document handling)
- SQLite MCP (audit logging)
- Sequential-thinking MCP (multi-step reasoning)
- Rules section with auto-invocation policies

### `agent-data/` Directory
- `memory.jsonl` — Persistent knowledge graph
- `agent.db` — SQLite audit trail and logs
- All file operations tracked and versioned

## Commands

### Query Database
```bash
# See all logged activities
sqlite3 "agent-data/agent.db" "SELECT * FROM agent_log ORDER BY timestamp DESC LIMIT 10;"

# See memory updates
sqlite3 "agent-data/agent.db" "SELECT * FROM memory_updates ORDER BY timestamp DESC LIMIT 10;"

# See tool calls
sqlite3 "agent-data/agent.db" "SELECT * FROM tool_calls ORDER BY timestamp DESC LIMIT 10;"
```

### Check Memory
```bash
# View knowledge graph
cat agent-data/memory.jsonl | jq '.'
```

### Test MCPs
```bash
# Memory server
npx -y @modelcontextprotocol/server-memory

# Filesystem server
npx -y @modelcontextprotocol/server-filesystem "C:\Users\INTEL INSIDE\.config\opencode\agent-data"

# SQLite server
uvx mcp-server-sqlite --db-path "C:\Users\INTEL INSIDE\.config\opencode\agent-data\agent.db"

# Sequential-thinking server
npx -y @modelcontextprotocol/server-sequential-thinking
```

## Cost Optimization

| Scenario | Model Used | Cost |
|---|---|---|
| Quick fix | GPT-5-mini | Free/Low |
| Complex planning | GPT-5.5 medium | Free/Low |
| Strategic decision | GPT-5.5 high OR Sonnet | Low-Medium |
| Fallback (Copilot down) | Claude Sonnet | Medium |

**No expensive models required.** All work completes with free/low-cost Copilot models. Sonnet only used as fallback.

## Next Steps

1. Start OpenCode: `opencode` in your terminal
2. Try delegating to agents: `ask prabowo to...`, `ask gibran to plan...`
3. Monitor activities: `sqlite3 agent-data/agent.db "SELECT * FROM agent_log;"`
4. Check memory: `cat agent-data/memory.jsonl | jq '.'`
5. All interactions are automatically logged and remembered!
