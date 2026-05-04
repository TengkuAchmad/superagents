'use client';

import { useEffect, useState, useCallback } from 'react';
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
  Trash2,
  type LucideIcon,
} from 'lucide-react';

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

type Tab = 'overview' | 'agent-log' | 'tool-calls' | 'memory' | 'planning' | 'projects';

interface MCPStatus {
  name: string;
  label: string;
  status: 'ok' | 'error';
  latency_ms: number;
  detail: string;
}

// ── Agent Icon Map ────────────────────────────────────────────────────────────
const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  prabowo: Monitor,
  gibran: BarChart3,
  suharso: Wrench,
  dudung: Activity,
  mahfud: Brain,
  'hasan-nasbi': Brain,
  bakom: FolderOpen,
  'andi-arief': Database,
  'sri-mulyani': BookOpen,
};

function AgentIcon({ name, className }: Readonly<{ name: string; className?: string }>) {
  const key = Object.keys(AGENT_ICON_MAP).find((k) =>
    name?.toLowerCase().includes(k),
  );
  const Icon: LucideIcon = key ? AGENT_ICON_MAP[key] : Bot;
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
  logs, stats,
}: Readonly<{ logs: AgentLog[]; stats: AnalyticsStats | null }>) {
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
                  <span className="latest-name">{latest.agent_name}</span>
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
                  <p className="agent-name">{name}</p>
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

// ── Memory Tab ────────────────────────────────────────────────────────────────
function MemoryTab({
  breakdown,
  graph,
  onDeleteRecord,
}: Readonly<{
  breakdown: MemoryBreakdown | null;
  graph: MemoryGraph | null;
  onDeleteRecord: (id: number) => void;
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
                  label={a.source_agent}
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
                        {r.source_agent}
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
function AgentLogTab({ logs, onDeleteRecord }: Readonly<{ logs: AgentLog[]; onDeleteRecord: (id: number) => void }>) {
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
                        {log.agent_name}
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
function ToolCallsTab({ breakdown, onDeleteRecord }: Readonly<{ breakdown: ToolBreakdown | null; onDeleteRecord: (id: number) => void }>) {
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
                  label={a.agent_name}
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
                        {r.agent_name}
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
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [planningLogs, setPlanningLogs] = useState<PlanningLog[]>([]);
  const [projects, setProjects] = useState<ProjectRegistry[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [toolBreakdown, setToolBreakdown] = useState<ToolBreakdown | null>(null);
  const [memoryBreakdown, setMemoryBreakdown] = useState<MemoryBreakdown | null>(null);
  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph | null>(null);
  const [mcpHealth, setMcpHealth] = useState<MCPStatus[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const projectFilter = selectedProject === 'all' ? '' : `&project_id=${selectedProject}`;
    try {
      const [al, pl, pr, st, tb, mb, mg, mh] = await Promise.all([
        fetch(`/api/agent-log?limit=100${projectFilter}`).then((r) => r.json()),
        fetch(`/api/planning-log?limit=100${projectFilter}`).then((r) => r.json()),
        fetch('/api/projects').then((r) => r.json()),
        fetch(`/api/analytics/stats${projectFilter ? '?' + projectFilter.slice(1) : ''}`).then((r) => r.json()),
        fetch(`/api/analytics/tool-breakdown${projectFilter ? '?' + projectFilter.slice(1) : ''}`).then((r) => r.json()),
        fetch(`/api/analytics/memory-breakdown${projectFilter ? '?' + projectFilter.slice(1) : ''}`).then((r) => r.json()),
        fetch(`/api/memory-graph${projectFilter ? '?' + projectFilter.slice(1) : ''}`).then((r) => r.json()),
        fetch('/api/mcp-health').then((r) => r.json()),
      ]);
      setAgentLogs(al.data ?? []);
      setPlanningLogs(pl.data ?? []);
      setProjects(pr.data ?? []);
      if (!st.error) setStats(st);
      if (!tb.error) setToolBreakdown(tb);
      if (!mb.error) setMemoryBreakdown(mb);
      if (!mg.error) setMemoryGraph(mg);
      if (mh.mcps) setMcpHealth(mh.mcps);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
  };

  const handleDeleteProject = async (type: 'agent-log' | 'tool-calls' | 'memory' | 'planning') => {
    if (selectedProject === 'all') {
      alert('Please select a specific project first');
      return;
    }
    if (!confirm(`Delete all ${type} data for this project?`)) return;

    try {
      const endpointMap = {
        'agent-log': '/api/agent-log',
        'tool-calls': '/api/tool-calls',
        'memory': '/api/memory-updates',
        'planning': '/api/planning-log',
      } as const;
      const endpoint = endpointMap[type];

      const res = await fetch(`${endpoint}?project_id=${selectedProject}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`Deleted ${data.deleted} records`);
        fetchAll();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleDeleteRecord = async (type: 'agent-log' | 'tool-calls' | 'memory' | 'planning', id: number) => {
    if (!confirm(`Delete this record (ID: ${id})?`)) return;

    try {
      const endpointMap = {
        'agent-log': '/api/agent-log',
        'tool-calls': '/api/tool-calls',
        'memory': '/api/memory-updates',
        'planning': '/api/planning-log',
      } as const;
      const endpoint = endpointMap[type];

      const res = await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchAll();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3, count: undefined },
    { id: 'agent-log', label: 'Agent Log', icon: Activity, count: agentLogs.length },
    { id: 'tool-calls', label: 'Tool Calls', icon: Wrench, count: stats?.tools.total },
    { id: 'memory', label: 'Memory', icon: Brain, count: (stats?.memory.total ?? 0) + (memoryGraph?.total_entities ?? 0) },
    { id: 'planning', label: 'Planning', icon: BookOpen, count: planningLogs.length },
    { id: 'projects', label: 'Projects', icon: FolderOpen, count: projects.length },
  ];

  return (
    <div>
      <MCPHealthBar mcps={mcpHealth} />
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
          <OverviewTab logs={agentLogs} stats={stats} />
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
          <AgentLogTab logs={agentLogs} onDeleteRecord={(id) => handleDeleteRecord('agent-log', id)} />
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
          <ToolCallsTab breakdown={toolBreakdown} onDeleteRecord={(id) => handleDeleteRecord('tool-calls', id)} />
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
          <MemoryTab breakdown={memoryBreakdown} graph={memoryGraph} onDeleteRecord={(id) => handleDeleteRecord('memory', id)} />
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
      </div>
    </div>
  );
}
