# Workflow: add-feature

**Trigger intents**: "add <feature> to <project>", "tambahkan fitur X", "implement Y in
existing app", "extend with Z". Existing project, NEW capability.

## Flow diagram

```
USER prompt
   ↓
[ORCHESTRATOR] receive + classify → pick add-feature
   ↓
[PLANNER] decompose feature into subtasks
   ↓
[UI DESIGNER]   (only if feature has UI)
   ↓
   ┌────────────────┬────────────────┐
   ↓                ↓
[BACKEND ENG.]   [FRONTEND ENG.]
   ↓                ↓
[INTEGRATION ENG.] wire if both touched
   ↓
[CODE REVIEWER] PR review
   ↓
[QA ENG.] functional + edge cases
   ↓
[MEMORY KEEPER] save lessons
   ↓
DELIVERY
```

## When to use

- Existing codebase, user wants to add capability
- Scope is bounded ("add login", "add export to CSV", not "make it better")
- No big architectural change needed (if needed → use refactor workflow)

## When NOT to use

- Vague intent → use build-new-app (or business-analyst first via dynamic)
- Bug report → use fix-bug
- Performance issue → use dynamic (likely performance-engineer-led)
- Big refactor → use refactor

## Orchestrator pseudocode

```
on user_prompt matching add-feature:
  log_action(start, 'workflow: add-feature, feature: <X>')

  # Skip business-analyst if intent is clear (it usually is for add-feature)
  log_action(route, '→ planner')
  plan = task(planner, <feature + project_id>)
  log_action(complete, 'plan: <N> subtasks')

  if feature.has_ui:
    log_action(route, '→ ui-designer')
    design = task(ui-designer, <plan>)
    log_action(complete, 'design ready')

  if feature.has_backend:
    log_action(route, '→ backend-engineer')
    task(backend-engineer, <plan + design>)
    log_action(complete, 'backend ready')

  if feature.has_ui:
    log_action(route, '→ frontend-engineer')
    task(frontend-engineer, <plan + design + backend_contract>)
    log_action(complete, 'frontend ready')

  if feature.has_backend AND feature.has_ui:
    log_action(route, '→ integration-engineer')
    task(integration-engineer, <backend + frontend>)
    log_action(complete, 'integration done')

  log_action(route, '→ code-reviewer')
  review = task(code-reviewer, <diff>)
  log_action(complete, 'review: <verdict>')
  # loop if changes required

  log_action(route, '→ qa-engineer')
  qa = task(qa-engineer, <feature AC>)
  log_action(complete, 'QA: <pass/fail>')
  # loop if bugs found

  # Security only if feature touches auth/data
  if feature.touches_auth_or_pii:
    log_action(route, '→ security-engineer')
    task(security-engineer, <diff>)
    log_action(complete, 'security: <verdict>')
    # gate: stop if critical

  log_action(route, '→ memory-keeper')
  task(memory-keeper, 'save feature pattern + decisions')
  log_action(complete, 'done')

  return_to_user('Feature <X> ready. Test: <command>.')
```

## Skip rules

- **Skip business-analyst**: feature scope usually clear from "add X" prompt
- **Skip oracle**: existing arch, no new tech decision
- **Skip ui-designer**: backend-only features
- **Skip security-engineer**: feature doesn't touch auth/payments/PII/files
- **Skip tech-writer**: small feature; only if user explicitly asks
- **Skip devops-engineer**: no infra change

## Quality gates

Same as build-new-app:
- Code review must approve
- QA must pass
- Security must approve (when invoked)
