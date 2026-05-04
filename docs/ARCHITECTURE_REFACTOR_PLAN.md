# Architecture Refactor Plan (Spec-Aligned)

Date: 2026-05-03  
Scope: `c:\Users\INTEL INSIDE\.config\opencode`

This plan converts the current prompt-centric setup into a modular architecture aligned with the image spec:
- `agent/core`
- `tools`
- `prompts/templates`
- `workflows`
- `llm/providers`
- `memory/{short_term,long_term,vector_store}`
- `api/{routes,controllers}`
- `config`

## 1) Target Structure

```text
ai-agent-system/
  agent/
    core/
      orchestrator.ts
      planner.ts
      executor.ts
      memory-manager.ts
      decision-engine.ts
  tools/
    sqlite-logger.ts
    memory-client.ts
    vector-memory-client.ts
    filesystem-client.ts
    sequential-thinking-client.ts
    health-check.ts
  prompts/
    templates/
      system_prompt.txt
      task_prompt.txt
      mcp_retry_logic.txt
  workflows/
    task-flow.ts
    multi-step-flow.ts
    escalation-flow.ts
    init-project-flow.ts
  llm/
    providers/
      copilot-provider.ts
      anthropic-provider.ts
      provider-factory.ts
  memory/
    short_term/
      session-buffer.json
    long_term/
      memory.jsonl
    vector_store/
      chroma.sqlite3
  api/
    routes/
      agent-routes.ts
      analytics-routes.ts
      health-routes.ts
    controllers/
      agent-controller.ts
      analytics-controller.ts
      health-controller.ts
    server.ts
  config/
    opencode.json
    oh-my-openagent.json
    workflow-rules.md
  dashboard/
    ... (existing Next.js app)
```

## 2) Current → Target Mapping (File-by-File)

### Core agent logic
- `agents/agent/prabowo-orchestrator.md` → split into:
  - `agent/core/orchestrator.ts` (routing + guardrails)
  - `workflows/escalation-flow.ts` (retry/escalate policy)
  - keep policy text in `prompts/templates/system_prompt.txt`
- `agents/agent/gibran-task-planner.md` →
  - `agent/core/planner.ts`
  - `workflows/multi-step-flow.ts`
- `agents/agent/suharso-executor.md` →
  - `agent/core/executor.ts`
  - `workflows/task-flow.ts`
- `agents/agent/hasan-nasbi-memory.md` →
  - `agent/core/memory-manager.ts`
  - `tools/memory-client.ts`
- `agents/agent/mahfud-oracle.md` →
  - `agent/core/decision-engine.ts`
  - `workflows/escalation-flow.ts` (decision fallback)

### Tools and adapters
- Inline SQL logging instructions in `agents/agent/*.md` →
  - `tools/sqlite-logger.ts`
- Memory MCP usage in prompts/docs →
  - `tools/memory-client.ts`
- Vector/chroma usage currently in config and APIs →
  - `tools/vector-memory-client.ts`
- Filesystem MCP usage currently in config/prompts →
  - `tools/filesystem-client.ts`
- Sequential-thinking references currently in prompts →
  - `tools/sequential-thinking-client.ts`
- MCP health logic currently in `dashboard/app/api/mcp-health/route.ts` →
  - reusable `tools/health-check.ts`

### Prompt templates
- Keep and normalize existing files:
  - `agents/prompts/templates/system_prompt.txt` → `prompts/templates/system_prompt.txt`
  - `agents/prompts/templates/task_prompt.txt` → `prompts/templates/task_prompt.txt`
  - `agents/prompts/templates/mcp_retry_logic.txt` → `prompts/templates/mcp_retry_logic.txt`

### Workflows
- Prompt-embedded workflow rules (multiple `agents/agent/*.md`) →
  - `workflows/task-flow.ts`
  - `workflows/multi-step-flow.ts`
  - `workflows/escalation-flow.ts`
  - `workflows/init-project-flow.ts` (from `agents/agent/init-project.md`)

### LLM provider abstraction
- Provider references currently in `oh-my-openagent.json` →
  - `llm/providers/copilot-provider.ts`
  - `llm/providers/anthropic-provider.ts`
  - `llm/providers/provider-factory.ts`

### Memory layout
- `agent-data/memory.jsonl` → mirror/symlink semantics under `memory/long_term/memory.jsonl`
- `dashboard/session-buffer.json` and any runtime session buffering → `memory/short_term/session-buffer.json`
- `agent-data/vector-store/chroma.sqlite3` → `memory/vector_store/chroma.sqlite3` (or keep existing and mount path alias)

### API layer (agent runtime, not dashboard-only)
- Existing dashboard API routes stay as telemetry UI endpoints.
- Add runtime API facade:
  - `api/routes/agent-routes.ts`
  - `api/controllers/agent-controller.ts`
  - `api/server.ts`
- Wrap current analytics/health query logic from `dashboard/app/api/*` into shared controllers where possible.

### Config
- Keep canonical config but centralize physically:
  - `opencode.json` → `config/opencode.json`
  - `oh-my-openagent.json` → `config/oh-my-openagent.json`
  - `AUTO_WORKFLOW_RULES.md` → `config/workflow-rules.md`

## 3) Phased Migration Plan

## Phase 0 — Stabilize Baseline (No behavior changes)
- Freeze schema/docs mismatch by documenting actual tables/columns (including `project_id`, `planning_log`, `project_registry`).
- Declare current files as source of truth until each module is promoted.

Acceptance:
- Dashboard APIs still return same payloads.
- No config keys changed in active root files.

## Phase 1 — Scaffold Target Folders and Interfaces
- Create empty modules/interfaces in `agent/core`, `tools`, `workflows`, `llm/providers`, `api`.
- Add types for:
  - `ProjectContext`
  - `WorkflowStep`
  - `ExecutionResult`
  - `LogEntry`

Acceptance:
- TypeScript build passes in `dashboard` unchanged.
- New scaffolding compiles independently (if added as separate package/folder).

## Phase 2 — Extract Shared Tool Adapters
- Implement `tools/sqlite-logger.ts`, `tools/memory-client.ts`, `tools/health-check.ts` first.
- Refactor duplicated SQL snippets in prompt docs into references to these adapters.

Acceptance:
- Existing `mcp-health` endpoint can call shared `health-check` logic.
- Logging path is centralized.

## Phase 3 — Extract Workflows from Prompts
- Convert long imperative prompt instructions into workflow functions.
- Keep prompts concise: role + constraints + “call workflow X”.

Acceptance:
- Orchestration rules are executable/testable in code.
- Prompt files shrink substantially and stop carrying SQL-heavy procedures.

## Phase 4 — Introduce Provider Layer
- Implement provider factory that reads model preference/fallback from config.
- Migrate direct provider strings to typed provider config.

Acceptance:
- Same runtime model behavior as today, but selected through provider layer.

## Phase 5 — Runtime API Surface
- Add `api/server.ts` and route/controller split for runtime agent operations.
- Keep `dashboard/app/api/*` for UI queries, but move core business logic into shared controllers.

Acceptance:
- UI continues to work.
- New runtime endpoints available for non-dashboard clients.

## Phase 6 — Decommission Legacy Prompt-Only Paths
- Mark `agents/agent/*.md` as policy-only docs or retire them once parity confirmed.
- Update docs to match actual architecture and model strings.

Acceptance:
- Architecture docs and code layout match 1:1.

## 4) Priority Backlog (Top 12 Tasks)

1. Add `config/` folder and mirror active config files.
2. Create `tools/sqlite-logger.ts` with standardized inserts.
3. Create `tools/health-check.ts` and reuse from `dashboard/app/api/mcp-health/route.ts`.
4. Create `agent/core/orchestrator.ts` with route matrix.
5. Create `workflows/multi-step-flow.ts` with decomposition policy.
6. Create `workflows/task-flow.ts` with executor contract.
7. Create `agent/core/memory-manager.ts` with project-scoped recall.
8. Create `llm/providers/provider-factory.ts` and typed provider configs.
9. Add `api/controllers/agent-controller.ts` as runtime facade.
10. Add `api/routes/agent-routes.ts` + minimal `api/server.ts`.
11. Update docs to remove model/version mismatches.
12. Exclude generated artifacts (`dashboard/.next`) from architecture audits.

## 5) Rollback and Safety

- Keep root `opencode.json` and `oh-my-openagent.json` active until final cutover.
- Use additive migration first (copy/extract), then switch references, then remove deprecated files.
- Preserve DB schema and table names; avoid destructive migrations during refactor.

## 6) Suggested PowerShell Commands (Scaffold Only)

```powershell
New-Item -ItemType Directory -Force -Path ".\agent\core"
New-Item -ItemType Directory -Force -Path ".\tools"
New-Item -ItemType Directory -Force -Path ".\prompts\templates"
New-Item -ItemType Directory -Force -Path ".\workflows"
New-Item -ItemType Directory -Force -Path ".\llm\providers"
New-Item -ItemType Directory -Force -Path ".\memory\short_term"
New-Item -ItemType Directory -Force -Path ".\memory\long_term"
New-Item -ItemType Directory -Force -Path ".\memory\vector_store"
New-Item -ItemType Directory -Force -Path ".\api\routes"
New-Item -ItemType Directory -Force -Path ".\api\controllers"
New-Item -ItemType Directory -Force -Path ".\config"
```

## 7) Definition of Done

- Folder tree matches spec categories.
- Core orchestration/planning/execution logic exists in code modules, not only prompt prose.
- Tool adapters are centralized and reused.
- Provider selection is abstracted.
- Runtime API split into routes/controllers exists.
- Docs reflect actual models, schema, and architecture.

## 8) Phase 2 Execution Note (2026-05-03)

- Implemented shared adapters in `tools/`:
  - `tools/health-check.ts` (shared MCP health probing API shape)
  - `tools/sqlite-logger.ts` (centralized logging adapter with buffered fallback)
  - `tools/memory-client.ts` (centralized memory query adapter contract)
- Integrated `dashboard/app/api/mcp-health/route.ts` to consume `tools/health-check.ts`.
- Kept strict OpenCode compatibility:
  - Active runtime config remains root `opencode.json` and root `oh-my-openagent.json`.
  - No cutover of config source-of-truth to `config/` yet.

## 9) Phase 3 Execution Note (2026-05-03)

- Extracted concrete workflow policies into code:
  - `workflows/route-policy.ts` for route classification (strategic, memory-centric, large-task, scoped-task).
  - `workflows/multi-step-flow.ts` now includes:
    - task-size assessment (`assessTaskSize`)
    - atomic decomposition (`decomposeIntoAtomicSteps`)
    - summary generation based on large/scoped policy.
- Wired core modules to workflows:
  - `agent/core/orchestrator.ts` now delegates route decisions to `decideRouteFromPolicy`.
  - `agent/core/planner.ts` now delegates planning to `runMultiStepFlow`.
- Added contract support in `agent/types/contracts.ts`:
  - `PlanRequest.estimatedFiles`, `PlanRequest.domains`
  - `TaskSizeAssessment`.

## 10) Phase 4 Execution Note (2026-05-03)

- Implemented provider-layer resolution in `llm/providers/provider-factory.ts`:
  - Reads model and fallback data from root `oh-my-openagent.json`.
  - Resolves a typed `ProviderSelection` per agent.
  - Includes resilient fallback when config/agent entries are missing.
- Updated provider adapters:
  - `copilot-provider.ts` now exposes fallback model accessor.
  - `anthropic-provider.ts` now exposes primary model accessor.
- Wired `agent/core/orchestrator.ts` to provider layer:
  - `resolveProviderForAgent(agentName)`
  - `resolveProviderForRoute(routeDecision)` with route→agent mapping.
- Strict compatibility preserved:
  - Runtime source-of-truth remains root `oh-my-openagent.json`.
  - No config relocation or write-back mutation performed.

## 11) Phase 5 Execution Note (2026-05-03)

- Implemented runtime API response flow for route + provider selection:
  - `api/controllers/agent-controller.ts`
    - added `resolveRuntime(request)`
    - returns route decision + resolved provider + plan preview.
  - `api/routes/agent-routes.ts`
    - added `postResolve(payload)` endpoint method.
- Added shared response contracts in `types/contracts.ts`:
  - `RuntimeProviderSelection`
  - `RuntimeRouteResolution`
- Strict OpenCode compatibility kept:
  - no mutation of root config files.
  - provider resolution remains read-only against root `oh-my-openagent.json`.

## 12) Phase 5B Execution Note (2026-05-03)

- Added concrete dashboard endpoint:
  - `dashboard/app/api/agent-resolve/route.ts`
  - Method: `POST`
  - Purpose: return runtime route decision + provider selection + plan preview.
- Endpoint delegates to runtime facade:
  - `AgentApiServer.agent.postResolve(payload)`.
- Added payload validation:
  - requires `projectId` and `goal` (non-empty strings).
- Compatibility posture unchanged:
  - endpoint is additive only.
  - root config files remain active source-of-truth.

## 13) Phase 6 Execution Note (2026-05-03)

- Added lightweight prompt hardening references in core agent docs:
  - `agents/agent/prabowo-orchestrator.md`
  - `agents/agent/gibran-task-planner.md`
  - `agents/agent/suharso-executor.md`
  - `agents/agent/mahfud-oracle.md`
- Each now includes a **Canonical Workflow Source** block that points to extracted code modules in `workflows/` and `agent/core/`.
- Added migration map doc:
  - `PROMPT_TO_CODE_MIGRATION.md`
  - maps legacy procedural prompt sections to canonical implementation modules.
- Behavior preservation:
  - no runtime prompt removal in this phase.
  - prompts remain active, with code modules treated as implementation source-of-truth when divergence occurs.

## 14) Integration Assurance Note (2026-05-03)

- Cross-layer integration verified for `agent` ↔ `api` ↔ `dashboard` runtime path:
  - `dashboard/app/api/agent-resolve/route.ts`
    -> `api/server.ts`
    -> `api/routes/agent-routes.ts`
    -> `api/controllers/agent-controller.ts`
    -> `agent/core/orchestrator.ts` + `agent/core/planner.ts`
    -> `workflows/*` + `llm/providers/provider-factory.ts`.
- Contract drift removed:
  - `agent/types/contracts.ts` now re-exports from `types/contracts.ts`.
  - `types/contracts.ts` is canonical shared contract source.
- Compatibility constraints preserved:
  - Root `opencode.json` and root `oh-my-openagent.json` remain active source-of-truth.
  - Provider resolution remains read-only against root config.
