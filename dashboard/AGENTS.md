# DASHBOARD

## OVERVIEW
Next.js 15 App Router monitoring UI. Reads `../agent-data/agent.db` via `better-sqlite3` (synchronous). No auth. Dev: `npm run dev` (Turbopack, localhost:3000).

## STRUCTURE
```
dashboard/
├── app/
│   ├── page.tsx          Main dashboard UI entry
│   ├── layout.tsx        Root layout (Geist font)
│   ├── globals.css       Tailwind base
│   └── api/              11 read-only API routes → SQLite (see app/api/AGENTS.md)
├── components/
│   ├── ui/               4 shadcn primitives: badge, button, card, input
│   └── *.tsx             Feature components (AgentGraphPanel, etc.)
├── lib/
│   ├── db.ts             SQLite connection + query helpers
│   ├── agent-registry.ts Agent canonical ID → display name/color map
│   └── utils.ts          cn() and shared utilities
└── public/               Static assets
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| DB connection + table queries | `lib/db.ts` |
| Agent name / color / role mapping | `lib/agent-registry.ts` |
| Main page layout | `app/page.tsx` |
| Add shadcn component | Run `npx shadcn@latest add <name>` from inside `dashboard/` |
| Add API route | `app/api/<name>/route.ts` — follow existing pattern |
| API route inventory | `app/api/AGENTS.md` |

## CONVENTIONS
- Path alias `@/*` maps to `dashboard/` root (not `src/`) — set in `tsconfig.json`
- All DB calls use `better-sqlite3` (synchronous) — no `await` on DB reads
- SQLite file: `../agent-data/agent.db` relative to dashboard root
- shadcn components → `components/ui/`; feature components → `components/`
- Tailwind v3 (not v4) — config at `tailwind.config.ts`
- `--turbopack` on dev is intentional — stable since Next.js 15

## ANTI-PATTERNS
- No API abstraction layer — routes query SQLite directly; keep it that way (no ORM, no repository pattern)
- No auth — removed intentionally; do not re-add JWT/session logic (`jwt-decode` dep is dead, remove it)
- Never run `npm install` from repo root for dashboard deps — use `cd dashboard && npm install`
- Never import from `../agent-data/` in components — always go through `app/api/` routes
- Mutations on agent-produced data (agent_log, tool_calls, memory_updates, observations) MUST stay agent-only. Dashboard PUT/POST is allowed ONLY for dashboard-owned UI state (e.g. `task_node_positions`).

## TASK / SESSION MODEL (Phase 1)
- A **session** = one opencode TUI run. Detected by `agent_log` gap > 30 min.
- A **task** = a coherent unit of work inside a session. Detected by orchestrator entry actions (`route|receive|classify|delegate|decompose`) > 5 min apart.
- `lib/task-inference.ts` runs lazily inside `/api/sessions` and `/api/tasks` reads. Idempotent + resumable.
- Every event-bearing table (`agent_log`, `tool_calls`, `memory_updates`, `observations`, `model_failures`, `planning_log`) carries `task_id` and `session_id`. Always filter by `task_id` when rendering task-scoped UI.
- `task_node_positions` is dashboard-owned UI state; safe to write via `PUT /api/tasks/[id]`.

## COMMANDS
```bash
cd dashboard
npm run dev      # localhost:3000, Turbopack
npm run build    # production build
npm run lint     # eslint flat config (eslint.config.mjs)
```
