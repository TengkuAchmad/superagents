# Workflow: refactor

**Trigger intents**: "refactor <module>", "clean up <code>", "improve architecture",
"reorganize <thing>", "make this more maintainable". Existing code, improving structure
without changing behavior.

## Flow diagram

```
USER prompt
   ↓
[ORCHESTRATOR] receive + classify → refactor
   ↓
[LIBRARIAN] read affected files + dependencies
   ↓
[ORACLE] analyze current structure → propose new structure + risks         [Opus]
   ↓
[PLANNER] decompose refactor into safe atomic steps (each independently testable)
   ↓
[QA ENG.] establish baseline behavior tests (before changing anything)
   ↓
[BACKEND / FRONTEND / INTEGRATION] execute each refactor step
   ↓     ↓ (after each step, run baseline tests)
[CODE REVIEWER] verify quality improvement vs baseline                     [Opus optional]
   ↓
[QA ENG.] re-run baseline → behavior unchanged?
   ↓
[MEMORY KEEPER] save refactor pattern + lessons
   ↓
DELIVERY
```

## When to use

- Existing code works but structure / readability is poor
- User explicitly says "refactor" / "reorganize" / "clean up"
- NOT adding features (use add-feature for that)
- NOT fixing bugs (use fix-bug for that)
- Behavior should be PRESERVED post-refactor

## When NOT to use

- "Add X feature" → use add-feature
- "Bug: <symptom>" → use fix-bug
- "Audit / review" → use audit-existing (read-only)

## Orchestrator pseudocode

```
on user_prompt matching refactor:
  log_action(start, 'workflow: refactor, scope: <X>')

  log_action(route, '→ librarian')
  context = task(librarian, 'read all affected files + their callers for project=<id>')
  log_action(complete, 'context loaded')

  log_action(route, '→ oracle')
  proposal = task(oracle, <context + refactor goal>)
  log_action(complete, 'oracle proposed: <new structure>')

  log_action(route, '→ planner')
  plan = task(planner, <oracle proposal>, instruction='each step must be independently revertable')
  log_action(complete, 'plan: <N> atomic steps')

  log_action(route, '→ qa-engineer')
  baseline = task(qa-engineer, 'write/run baseline tests covering current behavior of <module>')
  log_action(complete, 'baseline: <N> tests, all pass')

  # Execute each step + verify after
  for step in plan.steps:
    log_action(route, '→ <relevant-engineer>')
    task(<engineer-for-domain>, <step>)
    log_action(complete, 'step done')

    log_action(route, '→ qa-engineer (verify)')
    verify = task(qa-engineer, 'rerun baseline')
    log_action(complete, 'baseline still passes: <yes/no>')

    if !verify.all_pass:
      # Revert this step + escalate
      log_action(fail, 'baseline broken on step <N> — reverting + escalating')
      task(oracle, 'baseline broken on step <N>: <details>. Recommend approach?')

  log_action(route, '→ code-reviewer')
  review = task(code-reviewer, <full diff>)
  log_action(complete, 'review: <verdict>')

  log_action(route, '→ qa-engineer (final)')
  task(qa-engineer, 'final regression + new edge cases on refactored code')
  log_action(complete, 'final QA passed')

  log_action(route, '→ memory-keeper')
  task(memory-keeper, 'save refactor pattern + before/after metrics')
  log_action(complete, 'done')

  return_to_user('Refactor complete. <N> steps, all baseline tests pass.')
```

## Quality gates

| Gate | Condition |
|---|---|
| Baseline tests | Established BEFORE any code change |
| Per-step verification | Baseline still passes after each step |
| Final code review | Reviewer approves quality improvement |
| Final QA | New edge cases + baseline both pass |

## Critical rule

**Baseline first.** If you don't have tests covering current behavior, you have
no way to know the refactor preserved behavior. The first QA invocation is to
establish that safety net.

## Skip rules

- **Skip ui-designer**: refactors rarely touch UX
- **Skip security-engineer**: unless refactor touches auth/data flow
- **Skip devops/tech-writer**: existing infra/docs usually still apply

## Loop / iteration

This workflow has loops by design (per-step verify, possible revert+oracle).
The dashboard will show multiple QA invocations — that's correct, not noise.
