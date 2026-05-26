# Workflow: dynamic (smart router)

**Use when**: user prompt does NOT cleanly match any fixed template
(`build-new-app`, `add-feature`, `audit-existing`, `refactor`, `fix-bug`).
Orchestrator REASONS about which specialists to invoke based on prompt
analysis + memory recall.

## How to pick a workflow

The orchestrator runs this decision process on EVERY user message:

```
1. Match prompt against intent classifier (below)
2. If matches a fixed template → use it
3. If ambiguous → use this dynamic mode
4. Always log the chosen path
```

## Intent classifier (regex-style, in order)

Apply these tests in order. First match wins.

| # | Intent signal | Workflow |
|---|---|---|
| 1 | Prompt mentions "bug", "broken", "error", "doesn't work", "tidak jalan" + describes symptom | `fix-bug` |
| 2 | Prompt says "audit", "review for", "is this safe", "check for issues", "production-ready" | `audit-existing` |
| 3 | Prompt says "refactor", "clean up", "reorganize", "improve structure", "make maintainable" | `refactor` |
| 4 | Prompt says "add", "tambahkan", "extend", "implement <X> in" + existing project context | `add-feature` |
| 5 | Prompt says "build", "create", "buat", "make me a" + NEW app context | `build-new-app` |
| 6 | None of the above OR ambiguous | `dynamic` (this file) |

## Dynamic routing — when intent doesn't fit

When orchestrator falls into dynamic mode, follow these rules:

### A. ASK or INFER

If the prompt is genuinely ambiguous ("improve the app", "make it better"):
- Try memory_search first — maybe past observations hint at what user means
- If still unclear → invoke **business-analyst** to ask for / infer scope
- After business-analyst returns, re-classify the now-explicit intent

### B. SINGLE-SPECIALIST shortcuts

Some prompts map to ONE specialist, no full workflow:

| Prompt pattern | Single specialist |
|---|---|
| "how should we architect X?" / strategic question | `oracle` |
| "is X secure?" / security-specific question | `security-engineer` |
| "is X slow?" / perf-specific question | `performance-engineer` |
| "document X" / "write README for Y" | `tech-writer` |
| "explain this code" / "what does X do?" | `librarian` (read + summarize) |
| "find all usages of X" / codebase search | `librarian` or `task-runner` |
| "what did we decide about X last time?" | `memory-keeper` |
| "register this project" / setup | `init-project` |

For these, orchestrator just routes once, awaits result, returns to user.

### C. COMPOSITE on-the-fly

For mixed intents ("audit the auth flow and fix any critical findings"):
1. Run audit-existing FIRST (security + code-reviewer)
2. IF critical findings → automatically branch to fix-bug for each
3. Final report = audit summary + fixes applied

For mixed intents that don't match any single composite:
- Decompose mentally into 2-3 specialist invocations
- Sequence them with quality gates between
- Always log the plan before executing

### D. UNKNOWN scope, large

When prompt is large AND vague ("make this enterprise-ready"):
- Don't try to do everything
- Call business-analyst → product-planner to break into prioritized chunks
- Return prioritized list to user — ask them to pick top 1-3 to start

## Orchestrator pseudocode

```
on user_prompt:
  log_action(start, 'received: <prompt summary>')

  workflow = classify(prompt)
  log_action(decide, 'classified as <workflow>')

  if workflow == 'dynamic':
    # Reason about it
    if prompt is_single_specialist_match:
      specialist = pick_specialist(prompt)
      log_action(route, '→ ' + specialist)
      result = task(specialist, <prompt + project_id>)
      log_action(complete, '<specialist> done')

    elif prompt is_composite:
      plan = decompose_into_phases(prompt)
      log_action(decide, 'composite: <N> phases planned')
      for phase in plan:
        log_action(route, '→ ' + phase.agent)
        result = task(phase.agent, phase.task)
        log_action(complete, '<agent> done')

    elif prompt is_unknown_large_scope:
      log_action(route, '→ business-analyst')
      spec = task(business-analyst, 'expand vague intent: <prompt>')
      log_action(complete, 'spec ready')
      log_action(route, '→ product-planner')  # if it exists, else planner
      priorities = task(planner, <spec> + 'instruction: prioritize MVP slice')
      log_action(complete, 'priorities ready')
      return_to_user('Scope too large for one pass. Top priorities: <list>. Pick 1-3 to start.')

  else:
    # Fixed workflow — delegate to that workflow file
    follow_workflow(workflow)

  log_action(complete, 'task done', status='completed')
  return_to_user(<final result>)
```

## Rules

1. **Always classify before working** — log the classification decision
2. **Default to dynamic if uncertain** — better than picking wrong fixed workflow
3. **Single specialist shortcuts MUST log** route + complete — even for trivial requests
4. **For composite, log the plan first** as `action='decide', description='<plan>'`
5. **For unknown large scope, return scope-narrowing question to user** — don't try to do everything

## Examples worked out

**Example 1**: "build me a todo app with auth"
- Match #5 → `build-new-app`

**Example 2**: "the login button is broken"
- Match #1 → `fix-bug`

**Example 3**: "is the auth flow secure and also fast?"
- Composite (no single template) → dynamic
- Run: security-engineer + performance-engineer concurrently (logged sequentially)
- Combine reports

**Example 4**: "what stack should I use for an attendance app?"
- Single-specialist (strategic question) → oracle

**Example 5**: "make this app better"
- Unknown large scope → business-analyst (to extract what "better" means)
- Then product-planner (or planner) to prioritize
- Return options to user
