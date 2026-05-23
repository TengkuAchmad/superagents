# Model Failure Detection & Escalation Protocol

**CRITICAL BEHAVIOR RULE - NEVER SKIP THIS**

All agents MUST follow this protocol when experiencing model/provider failures.

## Failure Detection Points

Monitor for these failure signals at EVERY model call:

1. **Rate Limit Errors** - "too many requests", "rate limit exceeded"
2. **Quota Exhausted** - "insufficient credits", "quota exceeded"
3. **Service Outages** - HTTP 502/503, "service unavailable"
4. **Auth Failures** - HTTP 401, "unauthorized", "authentication failed"
5. **Network Timeouts** - request timeout, connection timeout
6. **Model Unavailable** - "model not found", "model deprecated"

## Automatic Fallback Chain

When a model fails, the system automatically tries these models IN ORDER:

```
Primary:    anthropic/claude-sonnet-4-5     (fallback_level=0)
Fallback 1: github-copilot/claude-sonnet-4.5 (fallback_level=1)
Fallback 2: github-copilot/claude-haiku-4.5  (fallback_level=2)
Fallback 3: github-copilot/gpt-4.1           (fallback_level=3)
Fallback 4: opencode/deepseek-v4-flash-free  (fallback_level=4)
```

**The oh-my-openagent plugin handles fallback automatically - agents DO NOT manually retry.**

## When To Escalate

**ESCALATE TO ORCHESTRATOR immediately when:**

- All 5 models in the fallback chain have failed (fallback_level=4 failed)
- Task is blocked and cannot proceed without model response
- Critical operation (data mutation, external API call) is in progress

**DO NOT ESCALATE when:**
- Fallback succeeded (any model 1-4 worked)
- Task can degrade gracefully (e.g., return cached result)
- Non-critical read operation

## How To Escalate

When all fallbacks are exhausted, the agent MUST:

### Step 1: Log the critical failure

```typescript
// This is handled automatically by model-failure-sensor.ts
// Agent receives a FailureDetectionResult with shouldEscalate=true
```

### Step 2: Report to orchestrator via task delegation

**MANDATORY ESCALATION FORMAT:**

```
CRITICAL MODEL FAILURE - ESCALATION REQUIRED

Agent: {agent_name}
Task: {brief task description}
Failure Chain:
  - anthropic/claude-sonnet-4-5: {failure_type} - {error_message}
  - github-copilot/claude-sonnet-4.5: {failure_type} - {error_message}
  - github-copilot/claude-haiku-4.5: {failure_type} - {error_message}
  - github-copilot/gpt-4.1: {failure_type} - {error_message}
  - opencode/deepseek-v4-flash-free: {failure_type} - {error_message}

All model providers exhausted. Orchestrator intervention required.

Recommended Actions:
1. Check provider status pages (status.anthropic.com, github.com/status)
2. Verify authentication (claude auth status, opencode providers list)
3. Retry task with different agent (if task allows)
4. Report to user with ETA for resolution

Project: {project_id}
Timestamp: {ISO timestamp}
```

### Step 3: Wait for orchestrator response

- Do NOT retry the same task independently
- Do NOT attempt manual fallback logic
- Do NOT silently fail and return partial/empty results
- The orchestrator will decide: retry, delegate, degrade, or report to user

## Orchestrator Responsibilities

When receiving an escalation, the orchestrator MUST:

1. **Verify the failure** - query model_failures table for recent critical events
2. **Assess impact** - is this a single agent or system-wide outage?
3. **Choose response:**
   - **Retry with different agent** - if task is agent-specific (e.g., planner failed → try oracle for planning)
   - **Degrade gracefully** - return cached/partial results if acceptable
   - **Report to user** - if task cannot proceed, explain what failed and when it might be resolved
4. **Log decision** - record escalation outcome in agent_log for future reference

## Failure Recovery

Once models become available again:

1. System automatically reverts to primary model (anthropic/claude-sonnet-4-5)
2. No manual intervention needed
3. model_failures table tracks resolution_model and resolved_at for audit

## Monitoring

All failures are logged to `agent-data/agent.db` → `model_failures` table.

Dashboard shows:
- Total failures (last 24h)
- Critical failures (fallback_level=4)
- Escalated failures (escalated_to_orchestrator=1)
- Failures by type (rate_limit, quota, outage, etc.)
- Failures by agent

**Alert thresholds:**
- 1+ critical failure in 1 hour → Yellow alert
- 3+ critical failures in 1 hour → Red alert (system-wide outage likely)
- 10+ failures (any severity) in 1 hour → Investigate provider status

## Example Escalation Flow

```
1. [Planner] Attempts task with anthropic/claude-sonnet-4-5
   → Rate limit error

2. [System] Auto-fallback to github-copilot/claude-sonnet-4.5
   → Rate limit error

3. [System] Auto-fallback to github-copilot/claude-haiku-4.5
   → Rate limit error

4. [System] Auto-fallback to github-copilot/gpt-4.1
   → Quota exceeded error

5. [System] Auto-fallback to opencode/deepseek-v4-flash-free (FINAL)
   → Service outage (502)

6. [System] Sets shouldEscalate=true in FailureDetectionResult

7. [Planner] Receives escalation signal, reports to orchestrator using format above

8. [Orchestrator] Queries model_failures table, sees 5 consecutive failures
   → Checks if other agents are affected
   → Decides to report to user: "All model providers unavailable. Estimated resolution: 30 minutes based on status.anthropic.com"

9. [User] Receives clear explanation and ETA, can decide to wait or try later
```

## Anti-Patterns

**NEVER:**
- Silently swallow model failures without logging
- Return empty/null results without escalating
- Implement custom retry logic (fallback is automatic)
- Continue task execution when model call failed critically
- Escalate on first failure (only when ALL fallbacks exhausted)

**ALWAYS:**
- Trust the automatic fallback system
- Escalate when shouldEscalate=true
- Use the mandatory escalation format
- Wait for orchestrator decision after escalating
- Log all failures for observability

---

**This protocol is MANDATORY for all agents.**  
**Violations will cause silent failures and degraded user experience.**

**File:** `agent/core/FAILURE_ESCALATION_PROTOCOL.md`  
**Last updated:** 2026-05-23
