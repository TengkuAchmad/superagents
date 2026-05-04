# Prompt-to-Code Migration Map (Phase 6)

This document marks heavy procedural prompt sections as legacy guidance and maps them to canonical code modules.

## Scope

Active behavioral prompts are still used by agents in runtime.
The migration objective is to avoid duplicating executable logic across prompt prose and code.

## Canonical Mapping

- `agents/agent/prabowo-orchestrator.md`
  - Legacy procedural areas: routing matrix, large-task split rules
  - Canonical code: `workflows/route-policy.ts`, `workflows/multi-step-flow.ts`, `agent/core/orchestrator.ts`

- `agents/agent/gibran-task-planner.md`
  - Legacy procedural areas: complexity guard and decomposition instructions
  - Canonical code: `workflows/multi-step-flow.ts`, `agent/core/planner.ts`

- `agents/agent/suharso-executor.md`
  - Legacy procedural areas: execution protocol and logging SQL examples
  - Canonical code: `workflows/task-flow.ts`, `agent/core/executor.ts`, `tools/sqlite-logger.ts`

- `agents/agent/mahfud-oracle.md`
  - Legacy procedural areas: escalation and strategic analysis flow
  - Canonical code: `workflows/escalation-flow.ts`, `agent/core/decision-engine.ts`

## Rule of Precedence

When prompt prose and code behavior differ:
1. Treat code modules in `agent/core` and `workflows` as implementation source-of-truth.
2. Update prompts to align with code behavior in the next prompt revision.
3. Keep root runtime config unchanged (`opencode.json`, `oh-my-openagent.json`).

## Non-Goals

- No removal of existing prompts in this phase.
- No relocation of root config files.
- No destructive DB or MCP changes.
