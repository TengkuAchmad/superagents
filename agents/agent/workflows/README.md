# Workflow Templates

Pre-defined sequences of specialist invocations for common user intents. The
**orchestrator** picks one of these templates based on the user's prompt, or
falls back to `dynamic.md` for ambiguous / one-off requests.

## How orchestrator picks a template

When a user message arrives, orchestrator:

1. Reads the user prompt
2. Matches against the routing table in `dynamic.md` (the smart router)
3. Adopts the chosen template's flow
4. Logs `action='start', description='workflow: <template-name>'`
5. Executes each phase via `task(<agent>, ...)` per the template
6. Logs route + complete around each phase

## Templates

| Template | Trigger intent | Phases | Typical token cost |
|---|---|---|---|
| [`build-new-app.md`](./build-new-app.md) | "build me a <thing>", "buat aplikasi X" | 12-15 | High (full team) |
| [`add-feature.md`](./add-feature.md) | "add <feature> to <project>" | 5-7 | Medium |
| [`audit-existing.md`](./audit-existing.md) | "audit <project>", "review for security" | 3-5 | Low (read-only mostly) |
| [`refactor.md`](./refactor.md) | "refactor <module>", "clean up <code>" | 6-8 | Medium |
| [`fix-bug.md`](./fix-bug.md) | "bug: <description>", "broken: <symptom>" | 3-5 | Low-medium |
| [`dynamic.md`](./dynamic.md) | Anything that doesn't match above | Variable | Variable |

## Common rules across all templates

- Every phase logs `action='start'` (sub-agent's spec handles this)
- Every phase logs `action='complete'` (sub-agent's spec handles this)
- **Orchestrator logs route BEFORE each task() AND complete AFTER each task()** (see `orchestrator.md` rules)
- After workflow done, orchestrator calls `task('memory-keeper', ...)` for save
- Quality gates: security MUST approve before devops, code-reviewer MUST approve before QA

## Picking models

The current profile (set via `OC_PROFILE` env) determines which model each
agent uses. Workflows are model-agnostic — they describe the agent sequence,
not the model. To optimize cost, route oracle + security + code-reviewer to
Opus (in profile), keep others on Sonnet, and Haiku for tech-writer.

## Adding a new workflow

1. Create `<workflow-name>.md` in this directory using existing as template
2. Add to the table above
3. Add a routing rule in `dynamic.md` for when to pick this workflow
