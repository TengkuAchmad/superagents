# claude-mem Universal Skill Access

> **Policy:** Every agent in the OpenAgent system has **universal, unrestricted access** to ALL `/claude-mem:*` skill commands and ALL claude-mem MCP tools.

---

## How It Works

The claude-mem plugin registers skill commands (via the `oh-my-openagent` plugin system) and MCP tools (via the `opencode.json` MCP server config). These are available at runtime to every agent through:

1. **`skill()` tool** — Load any `/claude-mem:*` command: `skill(name='/claude-mem:mem-search')`
2. **Direct MCP tool calls** — Use claude-mem MCP tools directly (e.g., `observation_add`, `observation_search`, `log_agent_activity`)

No per-agent permission configuration is needed. All agents share universal access.

---

## Complete Skill Inventory

| Category | Command | Description |
|---|---|---|
| **Core** | `/claude-mem:mem-search` | Search persistent cross-session memory |
| **Core** | `/claude-mem:how-it-works` | Explain claude-mem architecture |
| **Planning** | `/claude-mem:make-plan` | Create detailed phased implementation plans |
| **Planning** | `/claude-mem:do` | Execute phased implementation plans |
| **Analysis** | `/claude-mem:design-is` | Audit design against Dieter Rams principles |
| **Analysis** | `/claude-mem:pathfinder` | Map codebase flowcharts and unify architecture |
| **Analysis** | `/claude-mem:oh-my-issues` | Cluster and triage GitHub issue backlogs |
| **Analysis** | `/claude-mem:timeline-report` | Generate narrative project history reports |
| **Analysis** | `/claude-mem:weekly-digests` | Serial week-by-week narrative digests |
| **Code & Review** | `/claude-mem:learn-codebase` | Prime by reading full source tree |
| **Code & Review** | `/claude-mem:smart-explore` | Token-optimized structural code search |
| **Code & Review** | `/claude-mem:babysit` | Monitor PRs until ready to merge |
| **Code & Review** | `/claude-mem:claude-code-plugin-release` | Automated semantic versioning + release |
| **Utility** | `/claude-mem:knowledge-agent` | Build and query AI knowledge bases |
| **Utility** | `/claude-mem:wowerpoint` | Turn documents into slide-deck PDFs |

---

## Invocation

```typescript
// Via skill() tool — returns detailed instructions for that skill
skill(name='/claude-mem:mem-search', user_message='search for past auth decisions')

// Skill commands accept an optional user_message parameter for context
skill(name='/claude-mem:make-plan', user_message='build a dark mode feature')
```

---

## Future-Proofing Guarantee

Any new `/claude-mem:*` skill added by the claude-mem plugin is **automatically available** to all agents at runtime — no configuration changes, registry updates, or deploy steps needed.

The `skill()` tool dynamically enumerates all registered commands. If a command matches the `/claude-mem:*` prefix, it's invocable.

For documentation parity, update these files when new skills are added:

| File | Action |
|---|---|
| `agent/core/skills-registry.ts` | Add new `SkillEntry` to `CLAUDE_MEM_SKILLS` array |
| `dashboard/lib/agent-registry.ts` | Increment `availableSkillCount` in each entry |
| `docs/CLAUDE_MEM_UNIVERSAL_SKILLS.md` | Add row to skill table |

---

## MCP Tools Reference

In addition to skill commands, all agents have access to these claude-mem MCP tools:

| Tool | Purpose |
|---|---|
| `mcp-search` tools | `observation_add`, `observation_search`, `observation_context`, `list_corpora`, `query_corpus`, `build_corpus`, `smart_search`, `smart_outline`, `smart_unfold` |
| `activity-logger` tools | `log_agent_activity`, `log_tool_call` |

These MCP tools are available directly (no `skill()` wrapper needed) and are the primary interface for most agent operations.

---

## Architecture

```
claude-mem plugin (plugins/claude-mem.js)
  │
  ├── Registers /claude-mem:* skills ──→ skill() tool ──→ Any agent can invoke
  │
  └── Registers MCP servers ──→ mcp-search, activity-logger ──→ Direct tool calls
                                    │
                                    └── Used by agents for memory operations

Universal access enforced by:
  - oh-my-openagent.json prompt_append directives (all agents)
  - agents/agent/*.md Skills & Commands sections (all 10 agents)
  - agent/core/skills-registry.ts (code-level registry)
  - dashboard/lib/agent-registry.ts (UI display)
```
