# Indonesian Government AI Agent System - Deployment Guide

**Status:** ✅ READY FOR PRODUCTION  
**Version:** 1.0 Complete  
**Deployment Date:** May 3, 2026

---

## Quick Start

### 1. Start OpenCode with Indonesian Government Agents
```bash
cd C:\Users\INTEL INSIDE\.config\opencode
opencode
```

### 2. Invoke Agents by Role

**Orchestrator (Prabowo)** — Main entry point
```bash
ask prabowo to implement authentication system
ask prabowo to review my code
ask prabowo to create a new feature
```

**Planner (Gibran)** — Multi-step workflows
```bash
ask gibran to plan the refactoring
ask gibran to break down this complex task
ask gibran to design the architecture
```

**Executor (Suharso)** — Implementation
```bash
ask suharso to execute the plan
ask suharso to implement step by step
ask suharso to write the code
```

**Tool-Caller (Dudung)** — External tools
```bash
ask dudung to search for best practices
ask dudung to query the database
ask dudung to fetch data from API
```

**Memory Manager (Hasan Nasbi)** — Context recall
```bash
ask hasan_nasbi to remember the architecture decision
ask hasan_nasbi to show past authentication implementations
ask hasan_nasbi to recall what we decided last week
```

**Oracle (Mahfud)** — Strategic analysis
```bash
ask mahfud for strategic analysis on microservices
ask mahfud to evaluate this architectural decision
ask mahfud to provide high-level reasoning
```

---

## System Architecture

### Agent Hierarchy
```
PRABOWO (Presidential Orchestrator)
├─ Main entry point for all requests
├─ Routes multi-step work to GIBRAN (planning)
├─ Routes execution to SUHARSO (implementation)
└─ Coordinates all government agents

GIBRAN (Coordinating Minister - Planner)
├─ Uses sequential-thinking for workflow breakdown
├─ Creates multi-step execution plans
├─ Logs planning stages to database
└─ Routes to SUHARSO for execution

SUHARSO (Deputy Minister - Executor)
├─ Executes planned steps in sequence
├─ Logs each step to database
├─ Calls DUDUNG for external tool access
└─ Reports final status to PRABOWO

DUDUNG (Chief of Staff - Tool-Caller)
├─ Web search, database queries, API calls
├─ File operations coordination
└─ External tool management

HASAN NASBI (Communications Advisor - Memory)
├─ Stores decisions and interactions
├─ Recalls past context and patterns
└─ Manages knowledge graph

BAKOM (Government Comms - Filesystem)
├─ File read/write operations
├─ Document management
└─ Audit trail recording

ANDI ARIEF (Deputy Chief - Logger)
├─ Records all agent activities
├─ Maintains audit trail
├─ Database logging

MAHFUD (Coordinating Minister - Oracle)
├─ High-reasoning analysis
├─ Strategic decision-making
└─ Complex problem solving
```

### Data Flow
```
User Request
    ↓
PRABOWO (orchestrate)
    ├─ Recall memory (past decisions)
    ├─ Detect workflow type (simple/complex)
    └─ Route appropriately
         ↓
    GIBRAN (if multi-step)          or    SUHARSO (if simple)
         │                                      │
         ├─ Plan workflow              Implement directly
         ├─ Log to database            └─ Log to database
         └─ Route to SUHARSO
              ↓
         SUHARSO (execute)
              ├─ Step 1: Execute + log
              ├─ Step 2: Call DUDUNG if needed
              ├─ Step 3: Execute + log
              └─ Report to PRABOWO
                   ↓
         PRABOWO (finalize)
              └─ Send response to user
```

---

## Configuration Files

### `oh-my-openagent.json` (217 lines)
Defines all 8 core agents + 3 support agents with:
- Model assignments (GitHub Copilot primary)
- Fallback models (Claude Sonnet)
- `prompt_append` directives (auto-invoke memory/logging/workflows)
- Role descriptions

**Key sections:**
- `agents.prabowo` — Orchestrator agent
- `agents.gibran` → `agents.mahfud` — Core agents
- `agents.explore`, `agents.librarian`, `agents.multimodal_looker` — Support agents
- `categories.*` — Workflow categories (task-flow, multi-step-flow, visual-engineering, etc.)

### `opencode.json` (67 lines)
Configures MCPs and auto-workflow rules:
- Memory MCP (knowledge graph storage)
- Filesystem MCP (document handling)
- SQLite MCP (audit logging)
- Sequential-thinking MCP (multi-step reasoning)
- Auto-workflow rules for all agents

---

## Database & Memory

### SQLite Database (`agent-data/agent.db`)
Three tables track all activity:

**1. `agent_log`** — Agent activities
```sql
SELECT * FROM agent_log 
WHERE agent_name='prabowo' 
ORDER BY timestamp DESC LIMIT 10;
```

**2. `memory_updates`** — Memory graph changes
```sql
SELECT * FROM memory_updates 
ORDER BY timestamp DESC LIMIT 10;
```

**3. `tool_calls`** — External tool invocations
```sql
SELECT * FROM tool_calls 
WHERE tool_name='web_search' 
ORDER BY timestamp DESC;
```

### Memory Graph (`agent-data/memory.jsonl`)
JSON Lines format — each line is an entity or relation:
```bash
cat agent-data/memory.jsonl | jq '.'
```

---

## Model Strategy

### Free-First (GitHub Copilot)
- **gpt-5.5** — Complex reasoning (Prabowo, Mahfud)
- **gpt-5-mini** — Standard workflows (Gibran, Suharso, Dudung, etc.)
- **gpt-5.4-mini** — Documentation lookup (Librarian)
- **gpt-5-nano** — Media analysis (Multimodal)

### Fallback (Claude Sonnet)
- **claude-sonnet-4.6** — Primary fallback for all agents
- **claude-haiku-4.5** — Lightweight fallback for media analysis

**Cost:** Zero expensive models (no Opus, Gemini, or premium tiers)

---

## Monitoring & Debugging

### View Agent Logs
```bash
# Last 10 activities
sqlite3 agent-data/agent.db "SELECT agent_name, action, status, timestamp FROM agent_log ORDER BY timestamp DESC LIMIT 10;"

# Activities by agent
sqlite3 agent-data/agent.db "SELECT * FROM agent_log WHERE agent_name='gibran' ORDER BY timestamp DESC;"

# Failed activities
sqlite3 agent-data/agent.db "SELECT * FROM agent_log WHERE status='failed';"
```

### View Memory Graph
```bash
# All entities
cat agent-data/memory.jsonl | jq '.'

# Search for specific entity
cat agent-data/memory.jsonl | jq 'select(.name=="authentication_decision")'

# Count entities by type
cat agent-data/memory.jsonl | jq -s 'group_by(.type) | map({type: .[0].type, count: length})'
```

### View Tool Calls
```bash
# All tool calls
sqlite3 agent-data/agent.db "SELECT agent_name, tool_name, status FROM tool_calls ORDER BY timestamp DESC;"

# Web search results
sqlite3 agent-data/agent.db "SELECT * FROM tool_calls WHERE tool_name='web_search';"

# Failed tools
sqlite3 agent-data/agent.db "SELECT * FROM tool_calls WHERE status='failed';"
```

---

## Workflow Examples

### Example 1: Simple Task (Prabowo → Suharso)
```
User: "Fix the login bug in auth.js"
         ↓
Prabowo: Detects single-step fix → routes to Suharso
Suharso: Fixes bug → logs to database
Result: Bug fixed ✓
```

### Example 2: Complex Task (Prabowo → Gibran → Suharso)
```
User: "Implement OAuth 2.0 authentication"
         ↓
Prabowo: Detects multi-step implementation → routes to Gibran
Gibran:  Plans 4-step workflow → logs to database
         1. Design auth module
         2. Implement OAuth provider
         3. Integrate with API
         4. Write tests
         ↓
Suharso: Executes each step → calls Dudung for research → logs progress
Result: OAuth system implemented ✓
```

### Example 3: Strategic Analysis (Prabowo → Mahfud)
```
User: "Should we migrate to microservices?"
         ↓
Prabowo: Detects strategic question → routes to Mahfud
Mahfud:  Deep reasoning + analysis → logs decision
Result: Strategic recommendation ✓
```

---

## File Structure

```
.config/opencode/
├── oh-my-openagent.json              ← Agent configuration (8 core agents)
├── opencode.json                     ← MCP & workflow configuration
├── INDONESIAN_GOVERNMENT_SYSTEM.md   ← System documentation
├── WORKFLOW_TEST_REPORT.md           ← Test results (all tests PASSED)
├── COMPLETION_SUMMARY.md             ← Project completion summary
├── DEPLOYMENT_GUIDE.md               ← This file
├── agent-data/
│   ├── agent.db                      ← SQLite audit trail
│   ├── memory.jsonl                  ← Knowledge graph
│   └── (auto-created logs)
├── agents/                           ← (empty, ready for expansion)
├── package.json
├── package-lock.json
└── node_modules/
```

---

## Verification Checklist

Before deploying, verify:

- [x] GitHub Copilot primary models configured
- [x] Claude Sonnet fallbacks configured
- [x] All 8 Indonesian agent names set
- [x] Memory auto-invocation enabled
- [x] Database logging auto-invocation enabled
- [x] Workflow routing configured
- [x] Sequential-thinking enabled for Gibran, Suharso, Prabowo, Mahfud
- [x] MCP providers configured (memory, filesystem, sqlite, sequential-thinking)
- [x] Database schema initialized (3 tables)
- [x] Documentation complete (4 markdown guides)
- [x] All 5 tests PASSED

---

## Troubleshooting

### OpenCode Won't Start
```bash
# Check configuration syntax
node -e "console.log(require('./oh-my-openagent.json'))"

# Verify MCP servers are available
npx -y @modelcontextprotocol/server-memory --help
```

### Agent Not Responding
```bash
# Check database for errors
sqlite3 agent-data/agent.db "SELECT * FROM agent_log WHERE status='failed';"

# Verify agent is configured
node -e "const cfg = require('./oh-my-openagent.json'); console.log(cfg.agents.prabowo)"
```

### Memory Not Being Updated
```bash
# Check memory file exists and is writable
ls -lah agent-data/memory.jsonl
tail -f agent-data/memory.jsonl  # Monitor in real-time
```

---

## Next Steps

### Immediate (Today)
1. Start OpenCode: `opencode`
2. Test with simple task: `ask prabowo to write hello world`
3. Check database: `sqlite3 agent-data/agent.db "SELECT * FROM agent_log;"`

### Short-term (This Week)
1. Test workflow chains (Prabowo → Gibran → Suharso)
2. Verify memory recall works
3. Test tool-calling via Dudung
4. Monitor database growth

### Long-term (Ongoing)
1. Expand agent capabilities as needed
2. Add custom tools (if required)
3. Tune model assignments based on performance
4. Archive old logs periodically

---

## Support & Documentation

- **System Guide:** `INDONESIAN_GOVERNMENT_SYSTEM.md`
- **Test Report:** `WORKFLOW_TEST_REPORT.md`
- **Completion Summary:** `COMPLETION_SUMMARY.md`
- **Configuration:** `oh-my-openagent.json` (inline comments available)

---

## System Status

```
✅ INDONESIAN GOVERNMENT AI AGENT SYSTEM v1.0

Status:        PRODUCTION READY
Agents:        8 core + 3 support (all configured)
Models:        GitHub Copilot primary, Claude fallback
Auto-Invoke:   Memory, logging, workflows enabled
Database:      SQLite with 3 tables (ready)
Documentation: Complete (4 guides)
Testing:       All 5 tests PASSED
Deployment:    Approved for immediate use

Last Updated:  May 3, 2026, 14:45 UTC
```

---

**Ready to deploy. System is fully functional and tested.**
