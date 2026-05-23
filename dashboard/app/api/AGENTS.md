# DASHBOARD API ROUTES

## OVERVIEW
11 Next.js App Router route handlers. All GET-only. Each reads `agent-data/agent.db` via `../../lib/db.ts` (better-sqlite3, synchronous). Read-only mirror of the SQLite audit trail — agents write, dashboard reads.

## ROUTES
| Route dir | SQLite Table(s) | Purpose |
|-----------|----------------|---------|
| `agent-graph/` | agent_log | Routing edges for ReactFlow graph |
| `agent-log/` | agent_log | All agent actions + status |
| `analytics/stats/` | agent_log, tool_calls | Summary counts |
| `analytics/memory-breakdown/` | memory_updates | Memory usage by agent |
| `analytics/tool-breakdown/` | tool_calls | Tool call frequency |
| `events/` | — | SSE stream for live dashboard updates |
| `memory-updates/` | memory_updates | Memory write history |
| `observations/` | observations | claude-mem observation log |
| `planning-log/` | planning_log | Planner task decompositions |
| `projects/` | project_registry | Registered projects |
| `tool-calls/` | tool_calls | Tool call audit log |

## CONVENTIONS
- Pattern: `import { getDb } from '../../lib/db'` → `db.prepare(SQL).all()` → `NextResponse.json(rows)`
- No async DB calls — `better-sqlite3` is synchronous; never `await` a query
- `events/route.ts` uses SSE (Server-Sent Events) for live polling — not WebSocket
- `agent-graph/` parses `"Routing to <role>"` strings from agent_log to build graph edges

## ANTI-PATTERNS
- Never add POST/PUT/DELETE endpoints — mutations go through agent MCP tools only
- Never add middleware auth — localhost-only by design
- Never abstract into a service layer — direct db.prepare() per route is the pattern
