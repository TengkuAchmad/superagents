# Workflow: build-new-app

**Trigger intents**: "build me a <thing>", "buat aplikasi X", "create a tool for Y",
"saya ingin aplikasi Z", "make a SaaS for ...", any request for a NEW application
that doesn't have existing code.

## Flow diagram

```
USER prompt
   ↓
[ORCHESTRATOR] receive + classify → pick build-new-app workflow
   ↓
[BUSINESS ANALYST] vague intent → structured spec (problem, users, AC, scope)
   ↓
[ORACLE] tech stack decision + system design + trade-offs                  [Opus]
   ↓
[PLANNER] decompose into atomic subtasks per discipline
   ↓
[UI DESIGNER] visual hierarchy + user flows + accessibility spec
   ↓
   ┌──────────────────┬──────────────────┐
   ↓                  ↓                  ↓
[BACKEND ENG.]    [DATA ENG.]       (sequential, log each)
   ↓                  ↓
[FRONTEND ENG.] ←────┘
   ↓
[INTEGRATION ENG.] wire backend ↔ frontend
   ↓
[CODE REVIEWER] PR-style review                                            [Opus optional]
   ↓        ↓ (if changes required, loop back to relevant engineer)
[QA ENG.]   functional + edge cases
   ↓
[SECURITY ENG.] OWASP audit (GATE: BLOCK if critical)                      [Opus]
   ↓
[DEVOPS ENG.] containerize + CI + deploy config
   ↓
[TECH WRITER] README + API docs + user guide                               [Haiku]
   ↓
[MEMORY KEEPER] save lessons + decisions for cross-project reuse
   ↓
FINAL DELIVERY to user
```

## Orchestrator pseudocode

```
on user_prompt matching build-new-app:
  log_action(start, 'workflow: build-new-app, prompt: <prompt>')

  spec = task(business-analyst, <prompt + project_id>)
  log_action(complete, 'BA done: <spec summary>')
  log_action(route, '→ oracle')

  arch = task(oracle, <spec + project_id>)
  log_action(complete, 'arch decided: <stack>')
  log_action(route, '→ planner')

  plan = task(planner, <spec + arch + project_id>)
  log_action(complete, 'plan: <N> subtasks')
  log_action(route, '→ ui-designer')

  design = task(ui-designer, <spec + plan + project_id>)
  log_action(complete, 'design ready')
  log_action(route, '→ backend-engineer')

  backend_result = task(backend-engineer, <plan + design + project_id>)
  log_action(complete, 'backend ready')

  # If data-heavy (analytics, reporting):
  if spec.needs_analytics:
    data_result = task(data-engineer, <plan + backend_result>)
    log_action(complete, 'data layer ready')

  log_action(route, '→ frontend-engineer')
  frontend_result = task(frontend-engineer, <plan + design + backend_contract>)
  log_action(complete, 'frontend ready')

  log_action(route, '→ integration-engineer')
  integration_result = task(integration-engineer, <backend + frontend>)
  log_action(complete, 'integration done')

  log_action(route, '→ code-reviewer')
  review = task(code-reviewer, <all changed files>)
  log_action(complete, 'review: <verdict>')

  if review.verdict == 'request-changes':
    # Loop back to fix
    for change in review.required_changes:
      task(<relevant-engineer>, <change>)
    review = task(code-reviewer, <re-review>)

  log_action(route, '→ qa-engineer')
  qa_result = task(qa-engineer, <feature spec + AC>)
  log_action(complete, 'QA: <pass/fail>')

  if qa_result.has_blocking_bugs:
    # Loop back to fix
    task(<relevant-engineer>, <bug list>)
    qa_result = task(qa-engineer, <re-test>)

  log_action(route, '→ security-engineer')
  security_result = task(security-engineer, <changed files>)
  log_action(complete, 'security: <verdict>')

  # GATE: BLOCK deploy if critical security finding
  if security_result.has_critical:
    return_to_user('BLOCKED by security audit: <details>')

  log_action(route, '→ devops-engineer')
  task(devops-engineer, <project + deploy preference>)
  log_action(complete, 'deploy config ready')

  log_action(route, '→ tech-writer')
  task(tech-writer, <project + AC>)
  log_action(complete, 'docs done')

  log_action(route, '→ memory-keeper')
  task(memory-keeper, 'save lessons + decisions for project=<id>')
  log_action(complete, 'memory saved')

  log_action(complete, 'workflow done — app delivered', status='completed')
  return_to_user('App ready. <summary>. Test it with: <commands>')
```

## Quality gates

| Gate | Condition | Action if failed |
|---|---|---|
| Code review | reviewer verdict = approve | Loop back to relevant engineer with fix list |
| QA | no blocking bugs (severity ≥ high) | Loop back to engineer |
| Security | no CRITICAL findings | **STOP — report to user, do not deploy** |

## Expected dashboard graph

A wheel with orchestrator at center, edges radiating to all specialists,
return edges (emerald dashed) closing each cycle. Timeline shows ~30-50
events depending on loops. Token cost distributed: ~40% Sonnet, ~25% Opus
(oracle + security + reviewer), ~10% Haiku (tech-writer), ~25% misc.

## Conditional branches

- **Skip data-engineer**: if spec has no analytics / reports / aggregations
- **Skip ui-designer**: if app is API-only (no UI)
- **Skip frontend-engineer**: if API-only
- **Skip mobile-engineer**: always (we don't have mobile-engineer yet — skip mention if user asks)
