# Memory Tag Taxonomy

> Standardized tag vocabulary for `observation_add` calls to claude-mem.
> Without consistent tags, `memory_search` returns noise. With them, every
> project's lessons feed every future project — the "satu otak tim" vision.

## Why tags matter

`mcp-search.observation_add(content=..., tags=[...])` stores tags alongside
content. `memory_search` can filter by tag → narrow recall to relevant past
work. Inconsistent tagging (`type:plan` vs `category:planning` vs `plan-type`)
makes search nearly useless. Pick from this list. Don't invent new top-level
prefixes without updating this doc.

## Tag categories (prefixes)

Tags are `<prefix>:<value>` (one colon). Prefixes are FIXED — see below.
Values are open but should be lowercase-kebab-case.

### 1. `type:<what>` — what kind of observation is this

| Tag | When to use | Who writes it |
|---|---|---|
| `type:spec` | Structured spec (problem, users, AC, scope) | business-analyst |
| `type:plan` | Decomposition / subtask list | planner |
| `type:decision` | Architectural / strategic decision with rationale | oracle, orchestrator |
| `type:design` | UI/UX design spec, wireframe, design system | ui-designer |
| `type:schema` | DB schema decision (tables, columns, relations) | backend-engineer, data-engineer |
| `type:implementation` | Code completed, summarized approach | frontend/backend/integration |
| `type:integration` | Wiring between services / 3rd-party | integration-engineer |
| `type:test` | Test plan or test results | qa-engineer |
| `type:bug` | Bug filed with reproduction steps | qa-engineer |
| `type:security` | Security audit findings | security-engineer |
| `type:code-review` | PR-style review verdict | code-reviewer |
| `type:perf` | Performance work (benchmark + fix + delta) | performance-engineer |
| `type:devops` | Deploy / CI / infra config | devops-engineer |
| `type:runbook` | Operational procedure | sre |
| `type:slo` | Service-level objective definition | sre |
| `type:incident` | Production incident record | sre |
| `type:postmortem` | Blameless incident analysis | sre |
| `type:docs` | Documentation written | tech-writer |
| `type:query` | SQL / analytics query design | data-engineer |
| `type:lesson` | Generalized rule learned ("always do X") | any |
| `type:retrospective` | End-of-task self-review | orchestrator, oracle |
| `type:knowledge` | External knowledge fetched (lib docs, articles) | orchestrator |

### 2. `project:<id>` — which project this concerns

ALWAYS include if applicable. Use the canonical project_id (slug, lowercase-kebab).
Example: `project:absensi-web`, `project:test-todo-cli`.

Cross-project lessons get the special value `project:cross` (i.e. broadly applicable).

### 3. `agent:<name>` — which agent wrote this

Use canonical agent id from `agents/agent/<name>.md`. Example:
`agent:backend-engineer`, `agent:security-engineer`.

### 4. `tech:<stack>` — which technology this is about

Example: `tech:nextjs`, `tech:prisma`, `tech:postgres`, `tech:tailwind`,
`tech:react-hook-form`.

For multi-tech observations, add multiple `tech:*` tags.

### 5. `pattern:<name>` — reusable design pattern

Example: `pattern:server-action-form`, `pattern:oauth-pkce`,
`pattern:soft-delete`, `pattern:webhook-handler`.

When future planner sees same problem → memory_search matching pattern →
proven approach available.

### 6. `outcome:<result>` — did this succeed?

| Tag | When |
|---|---|
| `outcome:success` | Task completed, working in production |
| `outcome:failure` | Approach didn't work — record what failed |
| `outcome:partial` | Some parts work, some don't |
| `outcome:abandoned` | Decided not to pursue (scope change, infeasible) |

### 7. `severity:<level>` — for findings (security, code-review, bugs)

`severity:critical`, `severity:high`, `severity:medium`, `severity:low`.
Critical = blocks deploy.

### 8. `lesson:<rule>` — short rule learned

The VALUE here is the lesson itself, as a short rule. Used together with
`avoid_next_time` to make future planners avoid this approach.

Example: `lesson:dont-use-string-uuid-for-pk` (PK should be int or proper uuid type).

### 9. `avoid_next_time` — boolean flag

Just `avoid_next_time` (no colon). Add to any observation that documents
something to NOT repeat. Planner queries `tag='avoid_next_time'` before
decomposing.

### 10. `rule_for_next_time` — boolean flag

Opposite of avoid_next_time. "Always do X for Y problem". Planner queries
this too for positive examples.

### 11. `service:<name>` — external service involved

Example: `service:stripe`, `service:github-oauth`, `service:sentry`.

### 12. `domain:<area>` — business domain

Example: `domain:attendance`, `domain:e-commerce`, `domain:crm`, `domain:saas`.

### 13. `audience:<who>` — for docs

`audience:user`, `audience:contributor`, `audience:integrator`, `audience:maintainer`.

## Examples — well-tagged observations

### A successful build

```
observation_add(
  content='Built absensi-web: Next.js 15 + Prisma + SQLite + Tailwind v3. Auth deferred (MVP). Check-in via employee_code, admin sees daily report. CSV export works.',
  tags=[
    'type:implementation', 'outcome:success',
    'project:absensi-web', 'agent:orchestrator',
    'tech:nextjs', 'tech:prisma', 'tech:sqlite', 'tech:tailwind',
    'pattern:simple-crud-no-auth', 'domain:attendance', 'mvp-day-1',
  ]
)
```

### A failure to learn from

```
observation_add(
  content='Tried using Tailwind v4 alpha — caused build issues + missing variant utilities. Reverted to v3.',
  tags=[
    'type:lesson', 'outcome:failure', 'avoid_next_time',
    'project:absensi-web', 'agent:frontend-engineer',
    'tech:tailwind', 'lesson:stick-with-tailwind-v3-until-v4-stable',
  ]
)
```

### A reusable pattern

```
observation_add(
  content='Server actions with zod validation: form → action → zod.parse → DB → revalidate. Type-safe end-to-end. Works great for CRUD.',
  tags=[
    'type:pattern', 'outcome:success', 'rule_for_next_time',
    'project:cross', 'agent:backend-engineer',
    'tech:nextjs', 'tech:zod', 'pattern:server-action-form',
  ]
)
```

### An audit finding

```
observation_add(
  content='Missing rate limiting on /api/login — allows brute force. Add express-rate-limit (5 attempts / 15 min).',
  tags=[
    'type:security', 'severity:high', 'outcome:partial',
    'project:absensi-web', 'agent:security-engineer',
    'category:auth', 'avoid_next_time',
    'lesson:always-rate-limit-auth-endpoints',
  ]
)
```

## How to USE the taxonomy when retrieving

Before starting any non-trivial task, memory-search with relevant tags:

```
# At start of new build, recall lessons
memory_search(query='<new feature>', tag='avoid_next_time', limit=5)
memory_search(query='<tech-stack>', tag='rule_for_next_time', limit=5)

# Before architecting, recall past decisions on same domain
memory_search(query='<domain>', tag='type:decision', limit=10)

# Before implementing pattern, see if we have it
memory_search(query='<feature>', tag='type:pattern', limit=5)

# When facing problem similar to past bug
memory_search(query='<symptom>', tag='type:bug', limit=5)
```

Disciplined tagging + disciplined searching = AI that genuinely learns.

## Don't do

- ❌ Don't invent new top-level prefixes — extend this doc first
- ❌ Don't use CamelCase or spaces in tag values
- ❌ Don't tag everything as `type:lesson` — be specific
- ❌ Don't skip `project:<id>` when project-specific (memory becomes generic-only)
- ❌ Don't tag without content — content is the actual lesson, tags are search keys
