# Workflow: audit-existing

**Trigger intents**: "audit <project>", "review for security", "check code quality",
"performance audit", "is this production-ready?". Read-only mode, no code changes.

## Flow diagram

```
USER prompt
   ↓
[ORCHESTRATOR] receive + classify → audit
   ↓
[LIBRARIAN] read project structure + key files
   ↓
   ┌────────────────┬────────────────┬────────────────┐
   ↓                ↓                ↓
[SECURITY ENG.]  [CODE REVIEWER]   [PERFORMANCE ENG.]   (concurrent reviews)
   ↓                ↓                ↓
   └────────────────┴────────────────┘
   ↓
[QA ENG.] (optional — if requested or if user mentioned bugs)
   ↓
[ORCHESTRATOR] synthesize all findings → unified report
   ↓
[MEMORY KEEPER] save audit findings as project state
   ↓
REPORT to user
```

## When to use

- User says "audit", "review", "check for issues", "is this ready"
- Existing project, no implementation work needed
- Output is REPORT, not code changes

## Orchestrator pseudocode

```
on user_prompt matching audit-existing:
  log_action(start, 'workflow: audit-existing, scope: <X>')

  log_action(route, '→ librarian')
  context = task(librarian, 'map project structure + read key files for project=<id>')
  log_action(complete, 'librarian done')

  # Run 3 specialists conceptually-parallel (sequential in opencode but
  # each given the same context, results combined at end)
  log_action(route, '→ security-engineer')
  sec = task(security-engineer, <context + audit scope>)
  log_action(complete, 'security: <N> findings')

  log_action(route, '→ code-reviewer')
  rev = task(code-reviewer, <context + audit scope>)
  log_action(complete, 'code: <verdict>')

  log_action(route, '→ performance-engineer')
  perf = task(performance-engineer, <context + perf focus areas>)
  log_action(complete, 'perf: <findings>')

  if user_mentioned_bugs:
    log_action(route, '→ qa-engineer')
    qa = task(qa-engineer, <reported symptoms>)
    log_action(complete, 'QA: <findings>')

  log_action(route, '→ memory-keeper')
  task(memory-keeper, 'save audit findings: project=<id>, severity=<max>')
  log_action(complete, 'saved')

  # Orchestrator synthesizes
  log_action(complete, 'audit done', status='completed',
             result='Critical: <count>, High: <count>, Medium: <count>')

  return_to_user('Audit report:\n<combined findings prioritized by severity>')
```

## Output format

Synthesized report from all reviewers, sorted by severity:

```markdown
# Audit Report: <project>

## Summary
- **Verdict**: SAFE TO DEPLOY / CHANGES REQUIRED / BLOCKING ISSUES
- Critical: <N>
- High: <M>
- Medium: <K>
- Low: <L>

## Critical findings (must fix before any further deploy)
[from security-engineer]
1. ...

## High findings
[mixed from security + code-reviewer + performance]
1. ...

## Medium / Low
...

## Recommendations
1. Fix critical items immediately
2. Schedule high items for next sprint
3. Track medium/low as backlog
```

## Skip rules

- **Skip** any specialist not relevant (e.g. data-engineer if no analytics)
- **Skip QA** if user didn't mention bugs

## Time / token estimate

- Read-only, no writes
- Smaller token cost than build-new-app (no code generation)
- ~10-20 actions total
- Mostly Opus (security + code-reviewer) — careful reasoning
