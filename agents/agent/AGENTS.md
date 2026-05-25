# AGENT BEHAVIOR SPECS

## OVERVIEW
10 `.md` files = the functional source code of Oh My OpenAgent. Each defines one agent's role boundary, step-by-step workflow, MCP tool usage, logging protocol, and hard NEVER/ALWAYS rules.

## FILES
| File | Canonical ID | Name | Role |
|------|-------------|------|------|
| `orchestrator.md` | orchestrator | atlas | Single entry point, routes everything |
| `planner.md` | planner | prometheus | Decomposes large tasks into atomic subtasks |
| `executor.md` | executor | sisyphus | Executes one atomic subtask at a time |
| `task-runner.md` | task-runner | sisyphus-junior | One task, one tool operation |
| `oracle.md` | oracle | oracle | Deep reasoning, architecture, retrospectives |
| `memory-keeper.md` | memory-keeper | metis | claude-mem read/write exclusively |
| `chronicler.md` | chronicler | momus | SQLite INSERT/UPDATE/SELECT only |
| `librarian.md` | librarian | librarian | Token-efficient file system ops |
| `analyst.md` | analyst | analyst | Short-term session buffer |
| `init-project.md` | init-project | init-project | One-time project registration |

## CONVENTIONS
- YAML frontmatter per file: `description`, `mode`, `model` — consumed by `oh-my-openagent.json`
- All agents share 3 mandatory steps: (1) recall claude-mem → (2) do work → (3) log to SQLite + claude-mem
- Role boundaries are hard — an agent that executes code cannot manage memory; an agent that logs cannot write files
- `project_id = 'opencode-superagents'` referenced in every agent prompt

## ANTI-PATTERNS
- Never assign cross-role work — each spec has explicit NEVER rules; honor them
- Never skip the claude-mem recall step — feeds the self-learning routing system
- Planner: never pass all files/steps in one giant prompt to Executor
- Oracle: never write vague lessons ("be more careful") — must name exact condition + action
- Oracle: never skip `observation_add` — lesson only persists if stored

## WHERE TO LOOK
| Need | Action |
|------|--------|
| Add new agent | 1. Create `<name>.md` here; 2. Add entry to `../../oh-my-openagent.json` |
| Change routing table | `orchestrator.md` Step 2 |
| Change large-task thresholds | `orchestrator.md` Step 0A |
| Change lesson format | `oracle.md` |
| Change memory search behavior | `memory-keeper.md` |
| Change SQLite logging schema | `chronicler.md` + `../../dashboard/lib/db.ts` |
