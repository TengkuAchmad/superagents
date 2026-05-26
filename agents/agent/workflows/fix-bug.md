# Workflow: fix-bug

**Trigger intents**: "bug: <description>", "broken: <symptom>", "this doesn't work",
"error when I <X>", "X is not displaying / saving / loading", "fix <thing>".
Existing code, regression or defect.

## Flow diagram

```
USER prompt with bug report
   ↓
[ORCHESTRATOR] receive + classify → fix-bug
   ↓
[QA ENG.] reproduce + isolate scope (which files, which input)
   ↓
[LIBRARIAN] read relevant files + their tests
   ↓
   ↓ (if root cause unclear)
[ORACLE] root cause analysis after 2+ failed reproduce attempts            [Opus]
   ↓
[<relevant-engineer>] implement fix (smallest viable change)
   ↓
[QA ENG.] verify fix + regression test against existing behavior
   ↓
[CODE REVIEWER] PR review of the fix
   ↓
[MEMORY KEEPER] save lesson (root cause + fix pattern)
   ↓
DELIVERY
```

## When to use

- User reports symptom of broken behavior
- Existing functionality stopped working / never worked correctly
- Scope is bounded (specific bug, not "make it better")

## When NOT to use

- New feature → add-feature
- Performance issue → dynamic (likely performance-engineer)
- Vague complaints → ask user for repro steps first

## Orchestrator pseudocode

```
on user_prompt matching fix-bug:
  log_action(start, 'workflow: fix-bug, symptom: <X>')

  log_action(route, '→ qa-engineer (reproduce)')
  repro = task(qa-engineer, 'reproduce: <symptom>, identify failing input + affected code')
  log_action(complete, 'reproduced: <yes/no>, root area: <files>')

  if !repro.reproduced:
    # Cannot reproduce → ask user for more info
    return_to_user('Cannot reproduce. Need: <steps to reproduce, expected vs actual, env>')

  log_action(route, '→ librarian')
  context = task(librarian, 'read <files> + their tests')
  log_action(complete, 'context: <N> files')

  # Determine which engineer based on affected area
  fixer = match repro.area:
    if frontend → 'frontend-engineer'
    if backend  → 'backend-engineer'
    if db       → 'data-engineer'
    else        → 'integration-engineer'  # fallback

  attempts = 0
  while attempts < 2:
    log_action(route, f'→ {fixer}')
    fix_result = task(fixer, <repro details + context>)
    log_action(complete, 'fix attempt')

    log_action(route, '→ qa-engineer (verify)')
    verify = task(qa-engineer, 'verify fix + regression test', <test plan>)
    log_action(complete, 'verify: <pass/fail>')

    if verify.fixed AND verify.no_regression:
      break
    attempts++

  if attempts == 2 AND NOT verify.fixed:
    log_action(route, '→ oracle (escalate)')
    diagnosis = task(oracle, 'fix failed twice for <symptom>, root cause analysis')
    log_action(complete, 'oracle: <diagnosis>')

    log_action(route, f'→ {fixer} (with oracle guidance)')
    task(fixer, <oracle diagnosis + retry>)

  log_action(route, '→ code-reviewer')
  review = task(code-reviewer, <fix diff>)
  log_action(complete, 'review: <verdict>')

  log_action(route, '→ memory-keeper')
  task(memory-keeper, '''
    save bug + fix:
    - symptom: <X>
    - root cause: <Y>
    - fix: <Z>
    - tags: lesson:<rule>, avoid_next_time, type:bug
  ''')
  log_action(complete, 'lesson saved')

  return_to_user('Bug fixed. Root cause: <Y>. Verify: <command>.')
```

## Reproducibility gate

If QA cannot reproduce the bug, **STOP and ask user for**:
- Exact steps (clicks / commands)
- Expected vs actual behavior
- Environment (browser / OS / Node version / etc.)
- Screenshot or log output

Do not attempt a fix without reproduction. You're guessing otherwise.

## Loop safety

- Maximum 2 fix attempts before escalating to oracle
- After oracle diagnosis, 1 more attempt
- If still failing after 3 total: report to user with diagnosis + suggested manual investigation

## Skip rules

- **Skip ui-designer**: bugs don't need UI redesign
- **Skip security-engineer**: unless bug IS a security issue (then it's audit-existing or critical bug treatment)
- **Skip devops/tech-writer/business-analyst**: not relevant to bug-fix loop

## Memory tag pattern

Always tag the lesson with `avoid_next_time` so future planner avoids this:
```
tags: ['lesson:<rule>', 'avoid_next_time', 'type:bug',
       'project:<id>', 'root-cause:<category>']
```
