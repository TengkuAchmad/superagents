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

## COMMANDS
```bash
cd dashboard
npm run dev      # localhost:3000, Turbopack
npm run build    # production build
npm run lint     # eslint flat config (eslint.config.mjs)
```
