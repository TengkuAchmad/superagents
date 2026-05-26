'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  Monitor,
  Bot,
  Activity,
  Wrench,
  Brain,
  BookOpen,
  FolderOpen,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Database,
  Cpu,
  XCircle,
  TrendingUp,
  Network,
  Trash2,
  Users,
  Check,
  // Icons for specialist agents
  Palette,
  Globe,
  Server,
  Plug,
  Shield,
  Ship,
  TestTube,
  Gauge,
  FileText,
  type LucideIcon,
} from 'lucide-react';

import { AgentGraphPanel } from '@/components/AgentGraphPanel';
import { PlansPanel } from '@/components/PlansPanel';
import { SessionTabBar } from '@/components/SessionTabBar';
import { SessionWorkspace } from '@/components/SessionWorkspace';
import { AGENT_REGISTRY, VARIANT_TO_ID, displayAgent, namedIdentityOf } from '@/lib/agent-registry';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AgentLog {
  id: number;
  timestamp: string;
  agent_name: string;
  action: string;
  description: string;
  status: string;
  result: string | null;
  duration_ms: number | null;
  project_id: string | null;
}

interface ToolCall {
  id: number;
  timestamp: string;
  agent_name: string | null;
  tool_name: string | null;
  parameters: string | null;
  result: string | null;
  status: string | null;
  project_id: string | null;
}

interface MemoryUpdate {
  id: number;
  timestamp: string;
  entity_name: string | null;
  entity_type: string | null;
  observation: string | null;
  source_agent: string | null;
  project_id: string | null;
}

interface PlanningLog {
  id: number;
  plan_id: string;
  stage: string;
  summary: string;
  created_at: string;
  project_id: string | null;
}

interface ProjectRegistry {
  id: number;
  project_id: string;
  project_name: string;
  repo_path: string | null;
  description: string | null;
  tech_stack: string | null;
  conventions: string | null;
  registered_at: string;
  updated_at: string;
}

interface MemoryGraphEntity {
  name: string;
  entityType: string;
  observations: string[];
}

interface MemoryGraphRelation {
  from: string;
  to: string;
  relationType: string;
}

interface MemoryGraph {
  entities: MemoryGraphEntity[];
  relations: MemoryGraphRelation[];
  total_entities: number;
  total_relations: number;
  entity_types: { type: string; count: number }[];
}

interface Observation {
  id: string;
  created_at: string;
  document: string;
  type: string | null;
  category: string | null;
  project_id: string | null;
  tags: string | null;
}

interface AnalyticsStats {
  agents: { count: number };
  actions: { total: number; completed: number; failed: number; last24h: number };
  tools: { total: number; success: number; failed: number; last24h: number };
  memory: { total: number; uniqueEntities: number };
  planning: { total: number };
  projects: { total: number };
  performance: { avgDurationMs: number | null };
}

interface ToolBreakdown {
  byTool: { tool_name: string; total: number; success: number; failed: number; last_used: string }[];
  byAgent: { agent_name: string; total: number }[];
  topTools: { tool_name: string; total: number; last_called: string }[];
  recent: ToolCall[];
  total_calls: number;
  failed_calls: number;
}

interface MemoryBreakdown {
  byEntityType: { entity_type: string; count: number }[];
  byAgent: { source_agent: string; count: number }[];
  topEntities: { entity_name: string; entity_type: string; updates: number; last_updated: string }[];
  recent: MemoryUpdate[];
}

type Tab = 'overview' | 'agent-log' | 'tool-calls' | 'memory' | 'planning' | 'projects' | 'agents' | 'graph';

interface MCPStatus {
  name: string;
  label: string;
  status: 'ok' | 'error';
  latency_ms: number;
  detail: string;
}

// ── Agent Icon Map (keyed by canonical_id from agent-registry.ts) ─────────────
const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  // Senior's original 10
  orchestrator: Monitor,
  planner: BarChart3,
  executor: Wrench,
  'task-runner': Activity,
  oracle: Brain,
  'memory-keeper': Database,
  chronicler: BookOpen,
  librarian: FolderOpen,
  explorer: Bot,
  analyst: Bot,
  init: Cpu,
  // New 10 specialists
  'ui-designer': Palette,
  'frontend-engineer': Globe,
  'backend-engineer': Server,
  'integration-engineer': Plug,
  'security-engineer': Shield,
  'devops-engineer': Ship,
  'data-engineer': Database,
  'qa-engineer': TestTube,
  'performance-engineer': Gauge,
  'tech-writer': FileText,
};

const DEFAULT_AGENT_NAMES: Record<string, string> = Object.fromEntries(
  AGENT_REGISTRY.map((a) => [a.canonical_id, namedIdentityOf(a)])
);

interface AgentMeta {
  internalKey: string;
  role: string;
  description: string;
  skills: string[];
  model: string;
  fallback: string;
}

const AGENT_METADATA: Record<string, AgentMeta> = {
  orchestrator: {
    internalKey: 'atlas',
    role: 'Orchestrator',
    description: 'Single entry point for ALL requests. Never answers directly — classifies then routes each task to the right specialist. Uses past success patterns from memory to pick the optimal agent. Escalates failures up the chain.',
    skills: ['routing', 'delegation', 'memory search', 'failure escalation', 'activity logging'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  planner: {
    internalKey: 'prometheus',
    role: 'Planner',
    description: 'Breaks complex tasks into ordered, unambiguous steps via sequential thinking. Retrieves lessons from previous plans before decomposing, then delegates each step to the Executor.',
    skills: ['sequential thinking', 'task decomposition', 'lesson retrieval', 'workflow planning'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  executor: {
    internalKey: 'sisyphus',
    role: 'Executor',
    description: 'Implements planned actions with precision. Checks prior failed attempts before starting, logs each significant tool call to the dashboard, and tags outcomes for the few-shot learning library.',
    skills: ['code editing', 'file ops', 'bash', 'tool logging', 'outcome tagging'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  'task-runner': {
    internalKey: 'sisyphus-junior',
    role: 'Task Runner',
    description: 'Handles ONE focused task at a time — fast, direct, no preamble. Picks the right tool immediately and tries one alternative before reporting failure. Never scope-creeps.',
    skills: ['bash', 'web search', 'file read', 'grep', 'glob'],
    model: 'Claude Haiku 4.5',
    fallback: 'Claude Sonnet 4.6',
  },
  oracle: {
    internalKey: 'oracle',
    role: 'Oracle',
    description: 'Read-only analyst and decision engine. Standard mode: structured recommendations with tradeoffs, risks, and next steps. Retrospective mode: produces structured lessons tagged for the institutional memory library.',
    skills: ['reasoning', 'risk analysis', 'retrospectives', 'lesson generation', 'sequential thinking'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  'memory-keeper': {
    internalKey: 'metis',
    role: 'Memory Keeper',
    description: 'Custodian of institutional knowledge. Searches with multiple keyword angles, stores observations with full context, and synthesizes coherent summaries without fabricating missing data.',
    skills: ['memory search', 'observation storage', 'context synthesis', 'deduplication'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  chronicler: {
    internalKey: 'momus',
    role: 'Chronicler',
    description: 'Captures and preserves structured session summaries — agents involved, tasks, decisions, tools, outcomes, unresolved issues. Append-only: never overwrites prior observations.',
    skills: ['session logging', 'chronicle keeping', 'memory append', 'structured summaries'],
    model: 'Claude Sonnet 4.6',
    fallback: 'GPT-4.1',
  },
  librarian: {
    internalKey: 'librarian',
    role: 'Librarian',
    description: 'Retrieves documentation, external references, and file system content. Checks the memory cache first before fetching externally, then stores key findings for future reuse.',
    skills: ['web search', 'documentation lookup', 'file retrieval', 'external knowledge'],
    model: 'Claude Haiku 4.5',
    fallback: 'Claude Sonnet 4.6',
  },
  explorer: {
    internalKey: 'explore',
    role: 'Explorer',
    description: 'Exhaustively searches codebases and GitHub using multiple search strategies. Checks memory before searching to avoid redundant work, saves significant findings for others to recall.',
    skills: ['grep', 'glob', 'ast-grep', 'codebase search', 'multi-angle search'],
    model: 'Claude Haiku 4.5',
    fallback: 'Claude Sonnet 4.6',
  },
  analyst: {
    internalKey: 'multimodal-looker',
    role: 'Analyst',
    description: 'Analyzes images, PDFs, and documents thoroughly. Stores extracted key information in memory so the team can reference it without re-analyzing the same file.',
    skills: ['image analysis', 'PDF reading', 'document extraction', 'structured reports'],
    model: 'Claude Haiku 4.5',
    fallback: 'Claude Sonnet 4.6',
  },
  // ── New 10 specialists ─────────────────────────────────────────────────────
  'ui-designer': {
    internalKey: 'ui-designer',
    role: 'UI/UX Designer',
    description: 'Designs user flows, visual hierarchy, accessibility, and design systems. Produces specs that frontend-engineer implements — never writes UI code directly.',
    skills: ['user flows', 'wireframes', 'accessibility audit', 'design system', 'shadcn/ui'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'frontend-engineer': {
    internalKey: 'frontend-engineer',
    role: 'Frontend Engineer',
    description: 'Implements UI components, client-side state, routing, and frontend integration per the ui-designer spec. Component-first, accessibility-in-code.',
    skills: ['React/Next.js', 'state management', 'routing', 'Tailwind', 'shadcn/ui', 'forms'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'backend-engineer': {
    internalKey: 'backend-engineer',
    role: 'Backend Engineer',
    description: 'Owns DB schema, API endpoints, business logic, and data validation. Schema-first, every external input validated, migrations are forever.',
    skills: ['Prisma/Drizzle', 'API design', 'SQL', 'zod validation', 'migrations'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'integration-engineer': {
    internalKey: 'integration-engineer',
    role: 'Integration Engineer',
    description: 'Wires backend ↔ frontend, integrates third-party services, builds e2e flows. Also serves as generalist fallback when task does not fit a single specialist.',
    skills: ['e2e wiring', 'OAuth', 'webhooks', 'API clients', 'react-query/SWR'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'security-engineer': {
    internalKey: 'security-engineer',
    role: 'Security Engineer',
    description: 'Adversarial mindset — runs OWASP-style audits, threat models, secret reviews. Gates deploys with severity-rated findings. Uses Opus for careful reasoning.',
    skills: ['OWASP top 10', 'threat modeling', 'auth audit', 'secrets', 'dependency CVE'],
    model: 'Claude Opus 4.6',
    fallback: 'Claude Sonnet 4.6',
  },
  'devops-engineer': {
    internalKey: 'devops-engineer',
    role: 'DevOps Engineer',
    description: 'Owns CI/CD pipelines, Docker, deploy targets, env management, monitoring. Reproducible, fast feedback, secrets never in repo.',
    skills: ['GitHub Actions', 'Docker', 'Vercel/Fly/Railway', 'env management', 'monitoring'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'data-engineer': {
    internalKey: 'data-engineer',
    role: 'Data Engineer',
    description: 'Owns analytics queries, ETL pipelines, query optimization, data modeling. Measure first via EXPLAIN ANALYZE, idempotent backfills, justify every index.',
    skills: ['SQL aggregation', 'EXPLAIN ANALYZE', 'ETL', 'indexes', 'DuckDB/Postgres'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'qa-engineer': {
    internalKey: 'qa-engineer',
    role: 'QA Engineer',
    description: 'Adversarial about user behavior — writes test plans, runs functional + regression tests, gates releases. Test pyramid awareness, every bug is reproducible.',
    skills: ['Vitest/Jest', 'Playwright', 'edge cases', 'test plans', 'bug filing'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'performance-engineer': {
    internalKey: 'performance-engineer',
    role: 'Performance Engineer',
    description: 'Measures first, optimizes the right axis (wallclock/CPU/memory/bundle/network). 80/20 hot path focus, every optimization tracked vs baseline.',
    skills: ['Lighthouse', 'DevTools profiling', 'bundle analysis', 'load testing', 'optimization'],
    model: 'Claude Sonnet 4.6',
    fallback: 'Gemini 2.5 Flash',
  },
  'tech-writer': {
    internalKey: 'tech-writer',
    role: 'Tech Writer',
    description: 'Translates technical reality into clear documentation — README, API ref, user guides, changelog. Reader-first, every example copy-paste runnable.',
    skills: ['README', 'API reference', 'user guides', 'changelogs', 'docs maintenance'],
    model: 'Claude Haiku 4.5',
    fallback: 'Claude Sonnet 4.6',
  },
};

function resolveAgentName(raw: string | null | undefined, names: Record<string, string>): string {
  if (!raw) return '—';
  // Prefer the named identity from oh-my-openagent.json (Atlas, Prometheus, …).
  const d = displayAgent(raw);
  if (!d.unknown) return d.identity;
  // Fall back to any user-edited override or the raw value.
  const key = raw.toLowerCase().trim();
  const canonId = VARIANT_TO_ID[key] ?? key;
  return names[canonId] ?? names[key] ?? raw;
}

function AgentIcon({ name, className }: Readonly<{ name: string; className?: string }>) {
  const key = (name ?? '').toLowerCase().trim();
  const canonId = VARIANT_TO_ID[key] ?? key;
  const Icon: LucideIcon = AGENT_ICON_MAP[canonId] ?? Bot;
  return <Icon className={cn('shrink-0', className)} aria-hidden="true" />;
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function statusVariant(s: string): BadgeVariant {
  const v = s?.toLowerCase();
  if (v === 'completed' || v === 'success') return 'success';
  if (v === 'running' || v === 'in_progress') return 'warning';
  if (v === 'failed' || v === 'error') return 'destructive';
  return 'default';
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const variant = statusVariant(status);
  const iconMap: Partial<Record<BadgeVariant, LucideIcon>> = {
    success: CheckCircle2,
    warning: Clock,
    destructive: AlertCircle,
  };
  const Icon: LucideIcon = iconMap[variant] ?? Clock;
  return (
    <Badge variant={variant}>
      <Icon size={10} aria-hidden="true" />
      {status}
    </Badge>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(ts: string): string {
  if (!ts) return '—';
  const normalized = ts.includes('Z') || ts.includes('+') ? ts : ts.replace(' ', 'T') + 'Z';
  const diff = Date.now() - new Date(normalized).getTime();
  if (Number.isNaN(diff)) return ts;
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(normalized).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent,
}: Readonly<{ label: string; value: string | number; sub?: string; accent?: boolean }>) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="stat-label">{label}</p>
        <p className={cn('stat-value', accent && 'text-[hsl(var(--warning))]')}>{value}</p>
        {sub && <p className="stat-sub">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Breakdown Bar ─────────────────────────────────────────────────────────────
function BreakdownBar({ label, value, max, className }: Readonly<{ label: string; value: number; max: number; className?: string }>) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="breakdown-row">
      <span className="breakdown-label">{label}</span>
      <div className="breakdown-track">
        <div className={cn('breakdown-fill', className)} style={{ width: `${pct}%` }} />
      </div>
      <span className="breakdown-count">{value}</span>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({
  logs, stats, agentNames,
}: Readonly<{ logs: AgentLog[]; stats: AnalyticsStats | null; agentNames: Record<string, string> }>) {
  const agents = Array.from(new Set(logs.map((l) => l.agent_name)));
  const latest = logs[0];

  const agentStats = agents.map((a) => {
    const al = logs.filter((l) => l.agent_name === a);
    return { name: a, total: al.length, last: al[0] };
  });

  return (
    <div className="space-y-5">
      <div className="stat-grid">
        <StatCard label="Agent Actions" value={stats?.actions.total ?? logs.length} sub="all time" />
        <StatCard label="Tool Calls" value={stats?.tools.total ?? 0} sub={`${stats?.tools.last24h ?? 0} last 24h`} />
        <StatCard label="Memory Updates" value={stats?.memory.total ?? 0} sub={`${stats?.memory.uniqueEntities ?? 0} unique entities`} />
        <StatCard label="Errors" value={(stats?.actions.failed ?? 0) + (stats?.tools.failed ?? 0)}
          sub={(stats?.actions.failed ?? 0) + (stats?.tools.failed ?? 0) > 0 ? 'check logs' : 'none'}
          accent={(stats?.actions.failed ?? 0) + (stats?.tools.failed ?? 0) > 0} />
      </div>

      <div className="stat-grid">
        <StatCard label="Active Agents" value={stats?.agents.count ?? agents.length} />
        <StatCard label="Completed" value={stats?.actions.completed ?? 0} sub="agent actions" />
        <StatCard label="Avg Duration" value={stats?.performance.avgDurationMs == null ? '—' : `${stats.performance.avgDurationMs}ms`} />
        <StatCard label="Projects" value={stats?.projects.total ?? 0} />
      </div>

      {latest && (
        <Card>
          <CardHeader><CardTitle>Latest Agent Action</CardTitle></CardHeader>
          <CardContent>
            <div className="latest-row">
              <AgentIcon name={latest.agent_name} className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="latest-body">
                <div className="latest-meta">
                  <span className="latest-name">{resolveAgentName(latest.agent_name, agentNames)}</span>
                  <Badge>{latest.action}</Badge>
                  <StatusBadge status={latest.status} />
                  <span className="latest-time">{relativeTime(latest.timestamp)}</span>
                </div>
                <p className="latest-desc">{latest.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <p className="agent-grid-title">Agent Activity</p>
        <div className="agent-grid">
          {agentStats.map(({ name, total, last }) => (
            <Card key={name}>
              <CardContent className="p-4 flex items-start gap-3">
                <AgentIcon name={name} className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="agent-info">
                  <p className="agent-name">{resolveAgentName(name, agentNames)}</p>
                  {AGENT_METADATA[name] && (
                    <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{AGENT_METADATA[name].role}</p>
                  )}
                  <p className="agent-count">{total} action{total === 1 ? '' : 's'}</p>
                  {last && (
                    <p className="agent-last">
                      Last: <span>{last.status}</span>{' · '}{relativeTime(last.timestamp)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Knowledge Graph Section ───────────────────────────────────────────────────
function KnowledgeGraphSection({ graph }: Readonly<{ graph: MemoryGraph | null }>) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!graph) return null;

  const { entities, relations, entity_types } = graph;

  const filtered = filter
    ? entities.filter(
      (e) =>
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.entityType.toLowerCase().includes(filter.toLowerCase()) ||
        e.observations.some((o) => o.toLowerCase().includes(filter.toLowerCase())),
    )
    : entities;

  const maxType = entity_types[0]?.count ?? 1;

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="stat-grid">
        <StatCard label="Entities" value={graph.total_entities} sub="in knowledge graph" />
        <StatCard label="Relations" value={graph.total_relations} sub="entity links" />
        <StatCard label="Entity Types" value={entity_types.length} />
        <StatCard
          label="Observations"
          value={entities.reduce((s, e) => s + e.observations.length, 0)}
          sub="total stored"
        />
      </div>

      {/* Entity type breakdown */}
      {entity_types.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu size={14} />By Entity Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entity_types.map((t) => (
              <BreakdownBar
                key={t.type}
                label={t.type}
                value={t.count}
                max={maxType}
                className="bg-[hsl(var(--warning))]"
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Relations */}
      {relations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={14} />Relations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>From</th><th>Relation</th><th>To</th></tr>
                </thead>
                <tbody>
                  {relations.map((r) => (
                    <tr key={`${r.from}__${r.relationType}__${r.to}`}>
                      <td className="font-medium">{r.from}</td>
                      <td><Badge variant="blue">{r.relationType}</Badge></td>
                      <td className="font-medium">{r.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entity list */}
      <div className="space-y-2">
        <Input
          placeholder="Filter entities by name, type, or observation..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filtered.length === 0 && (
          <div className="empty">No entities found.</div>
        )}
        {filtered.map((entity) => (
          <Card key={entity.name}>
            <CardContent
              className="p-4 cursor-pointer select-none"
              onClick={() => toggle(entity.name)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Brain size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{entity.name}</span>
                  <Badge variant="warning">{entity.entityType}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {entity.observations.length} obs.
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {expanded.has(entity.name) ? '▲' : '▼'}
                  </span>
                </div>
              </div>
              {expanded.has(entity.name) && entity.observations.length > 0 && (
                <ul className="mt-3 space-y-1 pl-6 border-l border-[hsl(var(--border))]">
                  {entity.observations.map((obs) => (
                    <li key={obs} className="text-[12px] text-muted-foreground leading-relaxed">
                      {obs}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Observations Section (claude-mem) ────────────────────────────────────────
function ObservationsSection({ observations }: Readonly<{ observations: Observation[] }>) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = filter
    ? observations.filter(
        (o) =>
          o.document?.toLowerCase().includes(filter.toLowerCase()) ||
          o.type?.toLowerCase().includes(filter.toLowerCase()) ||
          o.tags?.toLowerCase().includes(filter.toLowerCase()),
      )
    : observations;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="stat-grid">
        <StatCard label="Observations" value={observations.length} sub="stored in claude-mem" />
        <StatCard
          label="Types"
          value={Array.from(new Set(observations.map((o) => o.type).filter(Boolean))).length}
        />
        <StatCard
          label="Projects"
          value={Array.from(new Set(observations.map((o) => o.project_id).filter(Boolean))).length}
        />
        <StatCard
          label="Latest"
          value={observations[0] ? relativeTime(observations[0].created_at) : '—'}
        />
      </div>
      <Input
        placeholder="Filter observations by content, type, or tags..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filtered.length === 0 && <div className="empty">No observations found.</div>}
      {filtered.map((obs) => (
        <Card key={obs.id}>
          <CardContent
            className="p-4 cursor-pointer select-none"
            onClick={() => toggle(obs.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <Brain size={13} className="text-muted-foreground shrink-0" />
                {obs.type && <Badge variant="warning">{obs.type}</Badge>}
                {obs.category && <Badge variant="blue">{obs.category}</Badge>}
                {obs.project_id && (
                  <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {obs.project_id}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{relativeTime(obs.created_at)}</span>
              </div>
              <span className="text-muted-foreground text-xs shrink-0">
                {expanded.has(obs.id) ? '▲' : '▼'}
              </span>
            </div>
            <p className={cn(
              'mt-2 text-[12px] text-muted-foreground leading-relaxed',
              !expanded.has(obs.id) && 'line-clamp-2',
            )}>
              {obs.document}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Memory Tab ────────────────────────────────────────────────────────────────
function MemoryTab({
  breakdown,
  graph,
  observations,
  onDeleteRecord,
  agentNames,
}: Readonly<{
  breakdown: MemoryBreakdown | null;
  graph: MemoryGraph | null;
  observations: Observation[];
  onDeleteRecord: (id: number) => void;
  agentNames: Record<string, string>;
}>) {
  const [filter, setFilter] = useState('');

  if (!breakdown) return <div className="empty">Loading memory analytics…</div>;

  const byEntityType = breakdown.byEntityType ?? [];
  const byAgent = breakdown.byAgent ?? [];
  const topEntities = breakdown.topEntities ?? [];
  const recent = breakdown.recent ?? [];

  const maxType = byEntityType[0]?.count ?? 1;
  const maxAgent = byAgent[0]?.count ?? 1;

  const filteredRecent = filter
    ? recent.filter(
      (r) =>
        r.entity_name?.toLowerCase().includes(filter.toLowerCase()) ||
        r.entity_type?.toLowerCase().includes(filter.toLowerCase()) ||
        r.source_agent?.toLowerCase().includes(filter.toLowerCase()),
    )
    : recent;

  return (
    <div className="space-y-5">
      {/* ── Knowledge Graph (memory.jsonl) ── */}
      <div>
        <p className="agent-grid-title flex items-center gap-2">
          <Brain size={13} className="text-muted-foreground" />
          Knowledge Graph <span className="text-muted-foreground font-normal">(memory.jsonl)</span>
        </p>
        {(!graph || graph.total_entities === 0) ? (
          <div className="empty">No knowledge graph entities yet.</div>
        ) : (
          <KnowledgeGraphSection graph={graph} />
        )}
      </div>

      {/* ── Claude-Mem Observations ── */}
      <div>
        <p className="agent-grid-title flex items-center gap-2">
          <Database size={13} className="text-muted-foreground" />
          Claude-Mem Observations <span className="text-muted-foreground font-normal">(vector store)</span>
        </p>
        {observations.length === 0 ? (
          <div className="empty">No claude-mem observations yet. Agents will save observations here as they work.</div>
        ) : (
          <ObservationsSection observations={observations} />
        )}
      </div>

      {/* ── Memory Updates (SQLite) ── */}
      <div className="breakdown-grid">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cpu size={14} />By Entity Type</CardTitle></CardHeader>
          <CardContent>
            {byEntityType.length === 0
              ? <p className="text-muted-foreground text-sm">No memory updates yet.</p>
              : byEntityType.map((t) => (
                <BreakdownBar
                  key={t.entity_type}
                  label={t.entity_type}
                  value={t.count}
                  max={maxType}
                  className="bg-[hsl(var(--warning))]"
                />
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot size={14} />By Agent</CardTitle></CardHeader>
          <CardContent>
            {byAgent.length === 0
              ? <p className="text-muted-foreground text-sm">No memory updates yet.</p>
              : byAgent.map((a) => (
                <BreakdownBar
                  key={a.source_agent}
                  label={resolveAgentName(a.source_agent, agentNames)}
                  value={a.count}
                  max={maxAgent}
                  className="bg-[hsl(var(--primary))]"
                />
              ))
            }
          </CardContent>
        </Card>
      </div>

      {topEntities.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Brain size={14} />Top Entities</CardTitle></CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Entity</th><th>Type</th><th>Updates</th><th>Last Updated</th></tr>
                </thead>
                <tbody>
                  {topEntities.map((e) => (
                    <tr key={`${e.entity_name}__${e.entity_type}`}>
                      <td className="font-medium">{e.entity_name}</td>
                      <td><Badge variant="warning">{e.entity_type}</Badge></td>
                      <td className="td-mono">{e.updates}</td>
                      <td className="td-mono">{relativeTime(e.last_updated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Input
          placeholder="Filter by entity, type, or agent..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Entity</th><th>Type</th>
                <th>Observation</th><th>Source Agent</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecent.length === 0 && (
                <tr className="empty-row"><td colSpan={6}>No memory updates found.</td></tr>
              )}
              {filteredRecent.map((r) => (
                <tr key={r.id}>
                  <td className="td-mono">{relativeTime(r.timestamp)}</td>
                  <td className="font-medium">{r.entity_name ?? '—'}</td>
                  <td>{r.entity_type ? <Badge variant="warning">{r.entity_type}</Badge> : '—'}</td>
                  <td className="truncate">{truncate(r.observation, 80)}</td>
                  <td className="td-agent">
                    {r.source_agent ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AgentIcon name={r.source_agent} className="w-3.5 h-3.5 text-muted-foreground" />
                        {resolveAgentName(r.source_agent, agentNames)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => onDeleteRecord(r.id)}
                      className="p-1 hover:bg-destructive/20 rounded text-destructive"
                      title="Delete record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Agent Log Tab ───────────────────────────────────────────────────────────────
function AgentLogTab({ logs, onDeleteRecord, agentNames }: Readonly<{ logs: AgentLog[]; onDeleteRecord: (id: number) => void; agentNames: Record<string, string> }>) {
  const [filter, setFilter] = useState('');
  const filtered = filter
    ? logs.filter(
      (l) =>
        l.agent_name?.toLowerCase().includes(filter.toLowerCase()) ||
        l.action?.toLowerCase().includes(filter.toLowerCase()) ||
        l.description?.toLowerCase().includes(filter.toLowerCase()),
    )
    : logs;
  const agents = Array.from(new Set(logs.map((l) => l.agent_name).filter(Boolean)));

  if (logs.length === 0) return <div className="empty">No agent logs yet.</div>;
  return (
    <div className="space-y-5">
      <div className="stat-grid">
        <StatCard label="Total Actions" value={logs.length} sub="all time" />
        <StatCard label="Active Agents" value={agents.length} />
        <StatCard label="Completed" value={logs.filter((l) => l.status === 'completed').length} />
        <StatCard label="Failed" value={logs.filter((l) => l.status === 'failed').length} accent />
      </div>
      <div className="space-y-2">
        <Input
          placeholder="Filter logs by agent, action, or description..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Agent</th><th>Action</th><th>Description</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr className="empty-row"><td colSpan={6}>No logs found.</td></tr>
              )}
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td className="td-mono">{relativeTime(log.timestamp)}</td>
                  <td className="td-agent">
                    {log.agent_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AgentIcon name={log.agent_name} className="w-3.5 h-3.5 text-muted-foreground" />
                        {resolveAgentName(log.agent_name, agentNames)}
                      </span>
                    ) : '—'}
                  </td>
                  <td><Badge variant="blue">{log.action ?? '—'}</Badge></td>
                  <td className="truncate">{truncate(log.description, 80)}</td>
                  <td>{log.status ? <StatusBadge status={log.status} /> : '—'}</td>
                  <td>
                    <button
                      onClick={() => onDeleteRecord(log.id)}
                      className="p-1 hover:bg-destructive/20 rounded text-destructive"
                      title="Delete record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tool Calls Tab ──────────────────────────────────────────────────────────────
function ToolCallsTab({ breakdown, onDeleteRecord, agentNames }: Readonly<{ breakdown: ToolBreakdown | null; onDeleteRecord: (id: number) => void; agentNames: Record<string, string> }>) {
  const [filter, setFilter] = useState('');

  if (!breakdown) return <div className="empty">Loading tool analytics…</div>;

  const byTool = breakdown.byTool ?? [];
  const byAgent = breakdown.byAgent ?? [];
  const topTools = breakdown.topTools ?? [];
  const recent = breakdown.recent ?? [];
  const total_calls = breakdown.total_calls ?? 0;
  const failed_calls = breakdown.failed_calls ?? 0;

  const maxTool = byTool[0]?.total ?? 1;
  const maxAgent = byAgent[0]?.total ?? 1;

  const filteredRecent = filter
    ? recent.filter(
      (r) =>
        r.tool_name?.toLowerCase().includes(filter.toLowerCase()) ||
        r.agent_name?.toLowerCase().includes(filter.toLowerCase()),
    )
    : recent;

  return (
    <div className="space-y-5">
      <div className="stat-grid">
        <StatCard label="Total Calls" value={total_calls} sub="all time" />
        <StatCard label="Unique Tools" value={byTool.length} />
        <StatCard label="Unique Agents" value={byAgent.length} />
        <StatCard label="Failed Calls" value={failed_calls} accent={failed_calls > 0} />
      </div>

      <div className="breakdown-grid">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wrench size={14} />By Tool</CardTitle></CardHeader>
          <CardContent>
            {byTool.length === 0
              ? <p className="text-muted-foreground text-sm">No tool calls yet.</p>
              : byTool.map((t) => (
                <BreakdownBar
                  key={t.tool_name}
                  label={t.tool_name}
                  value={t.total}
                  max={maxTool}
                />
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot size={14} />By Agent</CardTitle></CardHeader>
          <CardContent>
            {byAgent.length === 0
              ? <p className="text-muted-foreground text-sm">No tool calls yet.</p>
              : byAgent.map((a) => (
                <BreakdownBar
                  key={a.agent_name}
                  label={resolveAgentName(a.agent_name, agentNames)}
                  value={a.total}
                  max={maxAgent}
                  className="bg-[hsl(var(--primary))]"
                />
              ))
            }
          </CardContent>
        </Card>
      </div>

      {topTools.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp size={14} />Top Tools</CardTitle></CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tool</th><th>Total Calls</th><th>Last Called</th></tr>
                </thead>
                <tbody>
                  {topTools.map((t) => (
                    <tr key={t.tool_name}>
                      <td className="font-medium">{t.tool_name}</td>
                      <td className="td-mono">{t.total}</td>
                      <td className="td-mono">{relativeTime(t.last_called)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Input
          placeholder="Filter by tool or agent..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Agent</th><th>Tool</th><th>Parameters</th><th>Result</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecent.length === 0 && (
                <tr className="empty-row"><td colSpan={7}>No tool calls found.</td></tr>
              )}
              {filteredRecent.map((r) => (
                <tr key={r.id}>
                  <td className="td-mono">{relativeTime(r.timestamp)}</td>
                  <td className="td-agent">
                    {r.agent_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AgentIcon name={r.agent_name} className="w-3.5 h-3.5 text-muted-foreground" />
                        {resolveAgentName(r.agent_name, agentNames)}
                      </span>
                    ) : '—'}
                  </td>
                  <td><Badge variant="blue">{r.tool_name ?? '—'}</Badge></td>
                  <td className="td-mono truncate">{truncate(r.parameters, 60)}</td>
                  <td className="truncate">{truncate(r.result, 60)}</td>
                  <td>{r.status ? <StatusBadge status={r.status} /> : '—'}</td>
                  <td>
                    <button
                      onClick={() => onDeleteRecord(r.id)}
                      className="p-1 hover:bg-destructive/20 rounded text-destructive"
                      title="Delete record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Planning Tab ──────────────────────────────────────────────────────────────
function PlanningTab({ logs, onDeleteRecord }: Readonly<{ logs: PlanningLog[]; onDeleteRecord: (id: number) => void }>) {
  if (logs.length === 0)
    return <div className="empty">No planning logs yet.</div>;
  return (
    <div className="plan-list">
      {logs.map((log) => (
        <Card key={log.id}>
          <CardContent className="p-4">
            <div className="plan-meta">
              <Badge variant="blue">{log.plan_id}</Badge>
              <Badge variant="warning">{log.stage}</Badge>
              <span className="plan-time">{relativeTime(log.created_at)}</span>
              <button
                onClick={() => onDeleteRecord(log.id)}
                className="ml-auto p-1 hover:bg-destructive/20 rounded text-destructive"
                title="Delete record"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <p className="plan-summary">{log.summary}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ projects }: Readonly<{ projects: ProjectRegistry[] }>) {
  if (projects.length === 0)
    return (
      <div className="empty">
        No projects registered yet. Type{' '}
        <code>/init-project</code> in OpenCode to register one.
      </div>
    );
  return (
    <div className="project-list">
      {projects.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-5">
            <div className="project-header">
              <FolderOpen className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
              <div className="project-meta">
                <div className="project-name-row">
                  <span className="project-name">{p.project_name}</span>
                  <Badge variant="blue">{p.project_id}</Badge>
                  <span className="project-time">{relativeTime(p.updated_at)}</span>
                </div>
                {p.repo_path && <p className="project-path">{p.repo_path}</p>}
              </div>
            </div>
            {p.description && <p className="project-desc">{p.description}</p>}
            <div className="project-detail-grid">
              {p.tech_stack && (
                <div className="project-detail">
                  <p className="project-detail-label">Tech Stack</p>
                  <p className="project-detail-val">{p.tech_stack}</p>
                </div>
              )}
              {p.conventions && (
                <div className="project-detail">
                  <p className="project-detail-label">Conventions</p>
                  <p className="project-detail-val">{p.conventions}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Agents Tab ────────────────────────────────────────────────────────────────
function AgentsTab({
  names,
  onRename,
}: Readonly<{
  names: Record<string, string>;
  onRename: (updated: Record<string, string>) => Promise<void>;
}>) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ({ ...names }));
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  const save = async (key: string) => {
    setSaving(key);
    await onRename({ ...names, [key]: drafts[key] ?? names[key] });
    setSaving(null);
    setConfirmed((p) => new Set(p).add(key));
    setTimeout(() => setConfirmed((p) => { const n = new Set(p); n.delete(key); return n; }), 2000);
  };

  const reset = (key: string) => {
    setDrafts((p) => ({ ...p, [key]: DEFAULT_AGENT_NAMES[key] ?? key }));
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground mb-1">
        Cabinet roster — {Object.keys(names).length} agents. Rename display labels below; internal keys are unchanged.
      </p>
      {Object.entries(names).map(([key, display]) => {
        const meta = AGENT_METADATA[key];
        const currentName = drafts[key] ?? display;
        let saveLabel: ReactNode = 'Save';
        if (saving === key) {
          saveLabel = <Loader2 size={11} className="animate-spin" />;
        } else if (confirmed.has(key)) {
          saveLabel = <Check size={11} className="text-[hsl(var(--success))]" />;
        }

        return (
          <Card key={key}>
            <CardContent className="p-5 space-y-3">

              {/* ── Identity row ── */}
              <div className="flex items-start gap-3">
                <AgentIcon name={key} className="w-6 h-6 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px] leading-none">{currentName}</span>
                    {meta && (
                      <Badge variant="warning">{meta.role}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {meta?.internalKey ?? key}
                    </span>
                    {meta && (
                      <>
                        <span className="text-[10px] font-mono text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] px-1.5 py-0.5 rounded border border-[hsl(var(--primary)/0.2)]">
                          {meta.model}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ↳ {meta.fallback}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Description ── */}
              {meta && (
                <p className="text-[12px] text-muted-foreground leading-relaxed pl-9 border-l-2 border-[hsl(var(--border))] ml-1">
                  {meta.description}
                </p>
              )}

              {/* ── Skills ── */}
              {meta && meta.skills.length > 0 && (
                <div className="pl-9 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.skills.map((skill) => (
                      <span
                        key={skill}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.15)]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Rename row ── */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[hsl(var(--border))]">
                <span className="text-[11px] text-muted-foreground shrink-0">Display name</span>
                <Button
                  variant="outline"
                  className="h-7 px-2.5 text-[11px] shrink-0 min-w-[52px]"
                  onClick={() => void save(key)}
                  disabled={saving === key}
                >
                  {saveLabel}
                </Button>
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
                  onClick={() => reset(key)}
                  title="Reset to default"
                >
                  Reset
                </button>
              </div>

            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── MCP Health Bar ────────────────────────────────────────────────────────────
function MCPHealthBar({ mcps }: Readonly<{ mcps: MCPStatus[] }>) {
  if (mcps.length === 0) return null;
  const allOk = mcps.every((m) => m.status === 'ok');

  return (
    <div className={cn('mcp-health-bar', allOk ? 'mcp-health-ok' : 'mcp-health-degraded')}>
      <span className="mcp-health-label">MCP</span>
      {mcps.map((m) => (
        <div key={m.name} className="mcp-pill" title={m.detail}>
          {m.status === 'ok'
            ? <CheckCircle2 size={10} className="text-[hsl(var(--success))]" aria-hidden="true" />
            : <XCircle size={10} className="text-[hsl(var(--destructive))]" aria-hidden="true" />
          }
          <span className={cn('mcp-pill-name', m.status === 'error' && 'text-[hsl(var(--destructive))]')}>
            {m.label}
          </span>
          {m.status === 'ok' && (
            <span className="mcp-pill-latency">{m.latency_ms}ms</span>
          )}
          {m.status === 'error' && (
            <span className="mcp-pill-error" title={m.detail}>failed</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab Config ────────────────────────────────────────────────────────────────
interface TabConfig {
  id: Tab;
  label: string;
  icon: LucideIcon;
  count?: number;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  // Default to 'all' so sessions from any registered project show up. Users
  // narrow down via the dropdown in the tabs-right area.
  const [selectedProject, setSelectedProject] = useState<string>('all');
  // Active SESSION scope — URL-synced so a tab survives reload and can be
  // shared. Initialized to null on both server + first client render to avoid
  // hydration mismatch (URL unknown during SSR); promoted after mount.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('session_id') ?? params.get('task_id'); // back-compat
    if (fromUrl) {
      setActiveSessionId(fromUrl);
      setTab('graph');
    }
  }, []);

  const handleSessionSelect = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set('session_id', sessionId);
    else url.searchParams.delete('session_id');
    url.searchParams.delete('task_id'); // drop legacy param
    window.history.replaceState({}, '', url.toString());
    if (sessionId) setTab('graph');
  }, []);

  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [planningLogs, setPlanningLogs] = useState<PlanningLog[]>([]);
  const [projects, setProjects] = useState<ProjectRegistry[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [toolBreakdown, setToolBreakdown] = useState<ToolBreakdown | null>(null);
  const [memoryBreakdown, setMemoryBreakdown] = useState<MemoryBreakdown | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [mcpHealth, setMcpHealth] = useState<MCPStatus[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>(DEFAULT_AGENT_NAMES);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const qs = selectedProject !== 'all' ? `?project_id=${encodeURIComponent(selectedProject)}` : '';
      // Fetch real data from SQLite database via API routes
      const [logsRes, planRes, projRes, statsRes, toolRes, memRes, graphRes, obsRes] = await Promise.all([
        fetch(`/api/agent-log${qs}`),
        fetch(`/api/planning-log${qs}`),
        fetch('/api/projects'),
        fetch(`/api/analytics/stats${qs}`),
        fetch(`/api/analytics/tool-breakdown${qs}`),
        fetch(`/api/analytics/memory-breakdown${qs}`),
        fetch(`/api/agent-graph${qs}`),
        fetch(`/api/observations${qs}`),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setAgentLogs(data.logs || []);
      }
      if (planRes.ok) {
        const data = await planRes.json();
        setPlanningLogs(data.logs || []);
      }
      if (projRes.ok) {
        const data = await projRes.json();
        setProjects(data.projects || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (toolRes.ok) {
        const data = await toolRes.json();
        setToolBreakdown(data);
      }
      if (memRes.ok) {
        const data = await memRes.json();
        setMemoryBreakdown(data);
      }
      if (graphRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _data = await graphRes.json();
      }

      if (obsRes.ok) {
        const data = await obsRes.json();
        setObservations(data.observations || []);
      }
      setMcpHealth([]);
      setAgentNames(DEFAULT_AGENT_NAMES);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchAll();
    const qs = selectedProject !== 'all' ? `?project_id=${encodeURIComponent(selectedProject)}` : '';
    let es: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;

    try {
      es = new EventSource(`/api/events${qs}`);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as { type: string };
          if (data.type === 'update') void fetchAll();
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        fallback = setInterval(() => void fetchAll(), 8000);
      };
    } catch {
      fallback = setInterval(() => void fetchAll(), 8000);
    }

    return () => {
      es?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [fetchAll, selectedProject]);

  const handleRename = async (updated: Record<string, string>) => {
    try {
      // API server has been removed. Rename is no longer persisted.
      setAgentNames(updated);
    } catch (e) {
      console.error('Rename error:', e);
    }
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
  };

  const handleDeleteProject = async (tab?: string) => {
    if (selectedProject === 'all') return;
    const routeMap: Record<string, string> = {
      'agent-log': 'agent-log', 'tool-calls': 'tool-calls',
      'memory': 'memory-updates', 'planning': 'planning-log',
    };
    const route = tab ? routeMap[tab] : null;
    if (!route) return;
    await fetch(`/api/${route}?project_id=${encodeURIComponent(selectedProject)}`, { method: 'DELETE' });
    void fetchAll();
  };

  const handleDeleteRecord = async (type: string, id: number) => {
    const routeMap: Record<string, string> = {
      'agent-log': 'agent-log', 'tool-calls': 'tool-calls',
      'memory': 'memory-updates', 'planning': 'planning-log',
    };
    const route = routeMap[type];
    if (!route) return;
    await fetch(`/api/${route}?id=${id}`, { method: 'DELETE' });
    void fetchAll();
  };

  const TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3, count: undefined },
    { id: 'agent-log', label: 'Agent Log', icon: Activity, count: agentLogs.length },
    { id: 'tool-calls', label: 'Tool Calls', icon: Wrench, count: stats?.tools.total },
    { id: 'memory', label: 'Memory', icon: Brain, count: (stats?.memory.total ?? 0) + (memoryGraph?.total_entities ?? 0) + observations.length },
    { id: 'planning', label: 'Planning', icon: BookOpen, count: planningLogs.length },
    { id: 'projects', label: 'Projects', icon: FolderOpen, count: projects.length },
    { id: 'agents', label: 'Agents', icon: Users, count: undefined },
    { id: 'graph',  label: 'Graph',  icon: Network, count: undefined },
  ];

  return (
    <div>
      <MCPHealthBar mcps={mcpHealth} />
      <SessionTabBar
        projectId={selectedProject === 'all' ? null : selectedProject}
        activeSessionId={activeSessionId}
        onSelect={handleSessionSelect}
      />
      <div className="tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map(({ id, label, icon: Icon, count }) => (
          <Button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            variant={tab === id ? 'tab-active' : 'tab'}
            onClick={() => setTab(id)}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
            {count != null && count > 0 && (
              <span className="tab-badge">{count}</span>
            )}
          </Button>
        ))}

        <div className="tabs-right">
          <select
            value={selectedProject}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="h-7 px-2 text-[12px] font-mono bg-background border border-input rounded-md"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.project_id}>
                {p.project_name}
              </option>
            ))}
          </select>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[hsl(var(--warning))]">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              loading
            </span>
          )}
          {lastRefresh && !loading && (
            <span className="text-[12px] text-muted-foreground font-mono">
              {lastRefresh.toLocaleTimeString('id-ID', {
                timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </span>
          )}
          <Button
            variant="outline"
            onClick={fetchAll}
            className="h-7 px-2 text-[12px] font-mono"
            aria-label="Refresh data"
          >
            <RefreshCw size={11} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="tab-content">
        <div id="panel-overview" role="tabpanel" hidden={tab !== 'overview'}>
          <OverviewTab logs={agentLogs} stats={stats} agentNames={agentNames} />
        </div>
        <div id="panel-agent-log" role="tabpanel" hidden={tab !== 'agent-log'}>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteProject('agent-log')}
              disabled={selectedProject === 'all'}
            >
              <Trash2 size={14} className="mr-1" />
              Delete All for Project
            </Button>
          </div>
          <AgentLogTab logs={agentLogs} onDeleteRecord={(id) => handleDeleteRecord('agent-log', id)} agentNames={agentNames} />
        </div>
        <div id="panel-tool-calls" role="tabpanel" hidden={tab !== 'tool-calls'}>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteProject('tool-calls')}
              disabled={selectedProject === 'all'}
            >
              <Trash2 size={14} className="mr-1" />
              Delete All for Project
            </Button>
          </div>
          <ToolCallsTab breakdown={toolBreakdown} onDeleteRecord={(id) => handleDeleteRecord('tool-calls', id)} agentNames={agentNames} />
        </div>
        <div id="panel-memory" role="tabpanel" hidden={tab !== 'memory'}>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteProject('memory')}
              disabled={selectedProject === 'all'}
            >
              <Trash2 size={14} className="mr-1" />
              Delete All for Project
            </Button>
          </div>
          <MemoryTab breakdown={memoryBreakdown} graph={memoryGraph} observations={observations} onDeleteRecord={(id) => handleDeleteRecord('memory', id)} agentNames={agentNames} />
        </div>
        <div id="panel-planning" role="tabpanel" hidden={tab !== 'planning'}>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteProject('planning')}
              disabled={selectedProject === 'all'}
            >
              <Trash2 size={14} className="mr-1" />
              Delete All for Project
            </Button>
          </div>
          <PlanningTab logs={planningLogs} onDeleteRecord={(id) => handleDeleteRecord('planning', id)} />
        </div>
        <div id="panel-projects" role="tabpanel" hidden={tab !== 'projects'}>
          <ProjectsTab projects={projects} />
        </div>
        <div id="panel-agents" role="tabpanel" hidden={tab !== 'agents'}>
          <AgentsTab names={agentNames} onRename={handleRename} />
        </div>
        <div id="panel-graph" role="tabpanel" hidden={tab !== 'graph'}>
          {activeSessionId ? (
            <SessionWorkspace
              sessionId={activeSessionId}
              projectId={selectedProject === 'all' ? null : selectedProject}
              onClear={() => handleSessionSelect(null)}
            />
          ) : (
            <>
              <AgentGraphPanel
                projectFilter={selectedProject === 'all' ? '' : selectedProject}
                taskId={null}
              />
              <PlansPanel projectFilter={selectedProject === 'all' ? '' : selectedProject} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
