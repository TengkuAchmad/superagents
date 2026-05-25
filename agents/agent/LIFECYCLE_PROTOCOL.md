# Lifecycle Event Protocol

> **Audience:** every sub-agent in `agents/agent/*.md`.
> **Purpose:** standardize how agents emit activity log entries so the dashboard
> can render a coherent task graph + timeline ("Must Team Workflow") without
> per-agent special-casing.

## Reality check: REAL vs VISUAL delegation

The opencode + oh-my-openagent plugin currently exposes only **two** callable
sub-agents via `call_omo_agent`: `librarian` and `explore`. There is **no
`task()` tool** for invoking planner / executor / oracle / memory-keeper as
separate model calls.

This means delegation in this system comes in two flavors:

| Flavor | What happens | When to use |
|---|---|---|
| **REAL** — `call_omo_agent('librarian'\|'explore', ...)` or `skill('/claude-mem:make-plan'\|'/do'\|'/pathfinder'\|...)` | A separate model call is spawned with isolated context. Token + cost are tracked per-call. True parallelism / context isolation. | Heavy work: multi-file plans, big refactors, architecture reasoning. |
| **VISUAL** — `activity-logger.log_action(action='route', description='→ <agent>')` | Atlas (or any agent) emits a log row that the dashboard reads as a delegation edge in the graph. No new model call — the same agent keeps working. | Documenting WORKFLOW PHASES (plan→execute→review) for human readability and audit trails, even when one agent does all the work. |

**Both are legitimate.** Use REAL when you need actual parallelism / context
isolation. Use VISUAL when you just want the graph to show the logical flow.

Mix them: log VISUAL "→ planner" before calling REAL `skill('/claude-mem:make-plan')`,
so the graph shows the edge AND the work happens in an isolated call.

The dashboard's interpreter lives in `dashboard/lib/lifecycle-events.ts` and
maps your raw log values into a fixed vocabulary. As long as your `action` and
`status` values follow the table below, you will show up correctly in:

- the per-task **timeline** (chronological list with event-specific icons)
- the per-task **graph** (animated edges for `assign`)
- the **inspector** (when a node is clicked, shows tools used + files modified)

You call the **`activity-logger` MCP** (registered in `opencode.json`). Four
tools are exposed:

```
log_action(agent_name, action, status?, description?, result?,
           project_id?, duration_ms?, model?, usage_input_tokens?, usage_output_tokens?)

log_tool_call(agent_name, tool_name, parameters?, result?, status?, project_id?)

log_memory_update(observation, source_agent, entity_name?, entity_type?, project_id?)

register_project(project_id, project_name, repo_path?, description?,
                 tech_stack?, conventions?)
```

`register_project` is **idempotent** (upserts) — call it at the start of any
new project so the dashboard project dropdown picks it up immediately. Even
without it, the dashboard auto-registers stub rows from agent_log activity,
but explicit `register_project` gives you a proper human-readable name +
metadata instead of "project_id" as the label.

**Minimum every agent should call on each unit of work:**

1. `log_action(action="start", status="started", description="<what you're about to do>")` when you begin.
2. `log_action(action="complete", status="completed", description="<short result>", duration_ms=<N>)` when you finish.
3. For delegations: `log_action(action="route", status="started", description="→ <target-agent-canonical-id>")` so the dashboard draws the edge.

Do **not** pass `task_id` or `session_id` — those are inferred automatically by
the dashboard. Just keep `project_id` consistent (it groups tasks per repo).

---

## Event vocabulary

| Lifecycle event | When to emit | Suggested `action` | Suggested `status` |
|---|---|---|---|
| **start**     | The moment you begin work on a task or subtask | `start` (or `begin`) | `started` |
| **progress**  | An intermediate update — step N of M, heartbeat, partial result | `progress` (or `step`, `update`) | `in_progress` |
| **complete**  | You finished successfully and have a result | `complete` (or `done`, `finish`) | `completed` |
| **failed**    | You stopped because of an error you cannot recover from | any | `failed` |
| **assign**    | You handed work off to another agent | `route`, `delegate`, `decompose`, or `execute_plan` | `started` |
| **assigned**  | You received work from another agent | `receive` | `started` |
| **abandon**   | A task you were going to do was cancelled or dropped | `abandon` (or `cancel`) | `abandoned` |
| _(anything else)_ | Random info worth logging that isn't a lifecycle moment | anything | anything |

The interpreter is forgiving — unknown action/status values are classified as
`log` and still show up in the timeline (just with a neutral icon).

## Rules

1. **Always log a `start` and a matching `complete` / `failed`** for any unit
   of work — even quick ones. Without this pair, the graph can't compute
   per-agent duration accurately and the running halo never extinguishes.

2. **For `assign`, mention the target agent's canonical id** in the
   `description` or `result` field. Any of these phrasings work:

   ```
   description: "Routing to executor"
   description: "Delegated to oracle"
   description: "→ planner"
   result:      "routed_to: librarian"
   ```

   The interpreter extracts the target via a small regex set. Stick to the
   canonical id (`orchestrator`, `planner`, `executor`, `task-runner`,
   `oracle`, `memory-keeper`, `chronicler`, `librarian`, `analyst`, `init`)
   rather than the named identity (`atlas`, `prometheus`, …) so dashboards
   built off either spelling stay consistent.

3. **`project_id` is mandatory** on every log row. The task inference engine
   uses it to scope sessions per project. Skipping it silently dumps your
   work into a project-less "bootstrap" bucket and breaks the task tab UX.

4. **Don't invent new action names where one exists.** If you wrote your own
   "delegate_to_executor" action, the interpreter will fall through to `log`
   and you'll lose the animated assign arrow on the graph. Use the suggested
   values above.

5. **Keep `description` short.** It feeds the timeline body and the inspector
   preview; both clamp at ~80 characters. Long context belongs in
   `claude-mem` observations, not in chronicler descriptions.

## What dashboards do with each event

| Event | Timeline icon | Graph effect | Inspector |
|---|---|---|---|
| start    | Play (blue)        | Node enters `started` halo state | Counts toward `actions` |
| progress | Zap (sky)          | Refreshes `last_seen` (halo stays on) | Counts toward `actions` |
| complete | CheckCircle (green) | Halo fades after 2 min idle | Counts toward `actions` |
| failed   | XCircle (red, pulsing) | Node turns red, halo pulsing | Highlighted in tools-failed |
| assign   | Send (purple) + `→ target` arrow | Edge animates with flowing glow | Shows in target's tool list |
| assigned | Inbox (purple)     | (Currently same as start) | — |
| abandon  | Ban (gray)         | Node returns to idle | — |

## Token usage (optional but valuable)

The `agent_log` table now has two nullable columns: `usage_input_tokens` and
`usage_output_tokens`. When your MCP call returns usage data (Anthropic + most
OpenAI SDKs do — look for a `usage` object in the response), pass those
counts to the chronicler so the dashboard can show **real** token consumption
instead of the rough char-based estimate.

Suggested payload extension:

```json
{
  "agent_name": "executor",
  "action": "complete",
  "status": "completed",
  "description": "Implemented model fallback in opencode-config.ts",
  "result": "All tests pass",
  "duration_ms": 12450,
  "model": "claude-sonnet-4-5",
  "usage_input_tokens": 8214,
  "usage_output_tokens": 1903
}
```

If you omit the usage fields, the dashboard estimates them from
`description` + `result` length (~3.5 chars/token) and tags the figure with
an "est." badge. Estimates are useful for relative comparison but not for
real accounting.

**Why it matters here:** most agents in this stack route through Meridian to
the Claude Max subscription, so marginal $ cost is ≈ $0. But the dashboard's
list-price equivalent number (USD) is still the cleanest way to spot
agents that consume disproportionate tokens — exactly the optimization
target the project was built around.

## Migration note

Older log rows (before this protocol existed) used freeform action names. The
interpreter handles the common variants automatically (`route` → assign,
`completed` status → complete, etc.) so historical data stays readable. New
log entries should follow the table above to get the full visual treatment.

## See also

- `dashboard/lib/lifecycle-events.ts` — the interpreter implementation
- `dashboard/lib/task-inference.ts` — how sessions and tasks are derived
- `dashboard/components/TaskWorkspace.tsx` — where events get rendered
