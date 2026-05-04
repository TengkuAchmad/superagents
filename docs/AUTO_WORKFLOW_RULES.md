# Indonesian Government AI Agent Auto-Workflow Rules

## Overview
These rules define the automatic behavior for all Indonesian government AI agents. Since OpenCode doesn't support a `rules` configuration field, these behaviors are embedded in each agent's `prompt_append` directives in `oh-my-openagent.json`.

## Auto-Workflow Rules (invoke all MCPs on every interaction)

### For ALL agents:
1. **Memory First** — Before any work, recall context: Use memory tool to search for relevant past decisions
2. **Log All Actions** — After any significant action, record to database: INSERT into agent_log (agent_name, action, timestamp, result)
3. **Skills Auto-Load** — If git operations needed, auto-load git-master skill
4. **Database Audit Trail** — Every major decision goes to SQLite via andi_arief agent

## Agent-Specific Auto-Workflows

### Prabowo (Orchestrator):
- Routes all requests
- Recalls memory for past decisions
- Logs routing decision to database
- Delegates to appropriate minister
- Uses git-master skill for code decisions

### Gibran (Planner):
- Uses sequential-thinking tool to break down complex tasks
- Logs each planning step to database
- Stores plan in memory for team recall
- Recalls similar past plans for patterns

### Suharso (Executor):
- Executes plans step-by-step
- Logs each step completion to database
- Updates memory with progress
- Reports back to Prabowo when complete

### Dudung (Tool-caller):
- Calls all tools: web_search_exa, sqlite queries, filesystem operations
- Logs every tool call to database
- Stores tool results in memory
- Notifies Suharso of tool results

### Hasan Nasbi (Memory Manager):
- Creates entities for decisions: agent, date, outcome
- Updates memory graph with learnings
- Recalls context automatically
- Ensures all state is persistent

### BAKOM (Filesystem Handler):
- Handles all file operations
- Logs file access to audit trail
- Records file changes to memory

### Andi Arief (Database/Logging):
- Logs ALL government activities
- Maintains audit trail
- Records workflow progress
- Queries database for reporting

### Mahfud (Oracle):
- High-reasoning analysis for complex problems
- Consults memory for full context
- Uses sequential-thinking for deep analysis
- Logs conclusions to database as final decisions

## Implementation
These rules are implemented through:
1. **prompt_append directives** in each agent configuration
2. **MCP auto-invocation** (memory, filesystem, sqlite, sequential-thinking)
3. **Auto-workflow detection** in agent prompts
4. **Database logging** built into every agent's behavior

## Verification
To verify auto-workflows are working:
1. Check `agent_log` table: `sqlite3 agent-data/agent.db "SELECT * FROM agent_log;"`
2. Check memory updates: `cat agent-data/memory.jsonl`
3. Monitor agent behavior for automatic tool invocation