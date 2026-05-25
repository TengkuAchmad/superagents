'use client';

/**
 * Task-centric workspace: header (context summary) + graph (primary view) +
 * timeline (chronological agent activity) for a single task.
 *
 * Mounted by app/page.tsx whenever a task is active in the URL.
 *
 * Data flow:
 *   - One slow fetch (every 5s) of `/api/tasks/[id]` for header + timeline.
 *   - Graph keeps its own fast (2.5s) fetch lifecycle, driven by the taskId prop.
 *
 * Two independent loops keep the timeline calm even when the graph animates fast.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Clock, Cpu, Loader2, CheckCircle2, AlertCircle, Layers, Activity, Wrench, Brain, RotateCcw,
  Play, Zap, XCircle, Send, Inbox, Ban, Dot, Coins, DollarSign, type LucideIcon,
} from 'lucide-react';
import { AgentGraphPanel } from '@/components/AgentGraphPanel';
import { NodeInspector } from '@/components/NodeInspector';
import { META_BY_ID, displayAgent } from '@/lib/agent-registry';
import { normalizeEvent, EVENT_VISUAL, type LifecycleEventType } from '@/lib/lifecycle-events';
import { deriveTaskCost } from '@/lib/task-derive';
import { formatTokens, formatUsd } from '@/lib/model-costs';
import { cn } from '@/lib/utils';

interface TaskAgentLog {
  id: number;
  timestamp: string;
  agent_name: string;
  action: string | null;
  description: string | null;
  status: string | null;
  result: string | null;
  duration_ms: number | null;
  model: string | null;
  usage_input_tokens: number | null;
  usage_output_tokens: number | null;
}

interface TaskToolCall {
  id: number;
  timestamp: string;
  agent_name: string | null;
  tool_name: string | null;
  parameters: string | null;
  status: string | null;
}

interface TaskBundle {
  task: {
    id: string;
    session_id: string | null;
    project_id: string | null;
    title: string | null;
    summary: string | null;
    status: 'running' | 'completed' | 'failed' | 'abandoned';
    origin_prompt: string | null;
    started_at: string;
    ended_at: string | null;
    total_duration_ms: number;
  };
  agent_log: TaskAgentLog[];
  tool_calls: TaskToolCall[];
  agents_involved: string[];
}

const STATUS_TONE: Record<TaskBundle['task']['status'], string> = {
  running: 'text-blue-500 bg-blue-500/10 border-blue-500/40',
  completed: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/40',
  failed: 'text-red-500 bg-red-500/10 border-red-500/40',
  abandoned: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/40',
};

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
  abandoned: AlertCircle,
} as const;

function formatDuration(ms: number, fallbackStart: string, fallbackEnd: string | null): string {
  // Prefer wall-clock span if log-summed duration is missing (it often is — the
  // chronicler only records duration on completed agent actions).
  let span = ms;
  if (!span || span === 0) {
    const start = new Date(fallbackStart.includes('T') ? fallbackStart : fallbackStart.replace(' ', 'T') + 'Z').getTime();
    const end = fallbackEnd
      ? new Date(fallbackEnd.includes('T') ? fallbackEnd : fallbackEnd.replace(' ', 'T') + 'Z').getTime()
      : Date.now();
    span = Math.max(0, end - start);
  }
  const s = Math.floor(span / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function timeOnly(ts: string): string {
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TaskWorkspace({
  taskId,
  projectId,
  onClear,
}: {
  taskId: string;
  projectId: string | null;
  onClear: () => void;
}) {
  const [bundle, setBundle] = useState<TaskBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [positionsVersion, setPositionsVersion] = useState(0);

  const fetchBundle = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as TaskBundle;
      setBundle(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch error');
    }
  }, [taskId]);

  useEffect(() => {
    setBundle(null);
    setSelectedNode(null);
    fetchBundle();
    const id = setInterval(fetchBundle, 5000);
    return () => clearInterval(id);
  }, [fetchBundle]);

  const resetPositions = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
      // Bumping the version forces AgentGraphPanel to re-fetch positions
      // (which are now empty) and re-apply dagre auto-layout.
      setPositionsVersion((v) => v + 1);
    } finally {
      setResetting(false);
    }
  }, [taskId, resetting]);

  const headerStats = useMemo(() => {
    if (!bundle) return null;
    const t = bundle.task;
    const cost = deriveTaskCost(bundle.agent_log);
    return {
      status: t.status,
      duration: formatDuration(t.total_duration_ms, t.started_at, t.ended_at),
      startedAt: timeOnly(t.started_at),
      agentCount: bundle.agents_involved.length,
      logCount: bundle.agent_log.length,
      toolCount: bundle.tool_calls.length,
      cost,
    };
  }, [bundle]);

  if (!bundle && !error) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-xs text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading task workspace…
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <div className="px-4 py-6 text-xs text-red-500">
        Failed to load task {taskId}: {error}
      </div>
    );
  }

  const t = bundle!.task;
  const StatusIcon = STATUS_ICON[t.status];

  return (
    <div className="flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-50/60 to-transparent dark:from-zinc-900/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className={cn('mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border', STATUS_TONE[t.status])}>
            <StatusIcon className={cn('h-3.5 w-3.5', t.status === 'running' && 'animate-spin')} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                {t.title ?? `Task ${t.id.slice(-6)}`}
              </h2>
              <span className={cn('text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-mono border', STATUS_TONE[t.status])}>
                {t.status}
              </span>
              <code className="text-[10px] text-zinc-400 font-mono">{t.id}</code>
            </div>
            {t.origin_prompt && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                <span className="text-zinc-400">prompt:</span> {t.origin_prompt}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={resetPositions}
              disabled={resetting}
              title="Clear saved node positions for this task and re-apply auto-layout"
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 disabled:opacity-40"
            >
              <RotateCcw className={cn('h-3 w-3', resetting && 'animate-spin')} />
              Reset layout
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] text-blue-500 hover:underline whitespace-nowrap"
            >
              ← Back to all
            </button>
          </div>
        </div>

        {/* Stats strip */}
        {headerStats && (
          <div className="mt-3 flex items-center gap-4 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 flex-wrap">
            <Stat icon={Clock} label="started">{headerStats.startedAt}</Stat>
            <Stat icon={Cpu} label="duration">{headerStats.duration}</Stat>
            <Stat icon={Layers} label="agents">{headerStats.agentCount}</Stat>
            <Stat icon={Activity} label="actions">{headerStats.logCount}</Stat>
            <Stat icon={Wrench} label="tools">{headerStats.toolCount}</Stat>
            <Stat icon={Coins} label="tokens">
              {formatTokens(headerStats.cost.total_tokens)}
              {headerStats.cost.estimated && (
                <span
                  className="ml-1 text-[9px] px-1 rounded bg-amber-500/15 text-amber-500 align-middle"
                  title="Estimated from text length — chronicler MCP has not logged real usage yet"
                >
                  est.
                </span>
              )}
            </Stat>
            <Stat icon={DollarSign} label="list-cost">
              <span
                title={`Equivalent at public API list price. Real cost on Claude Max ≈ $0 marginal.${
                  headerStats.cost.unknown_model ? '\nWarning: unknown model — cost = 0.' : ''
                }`}
              >
                {formatUsd(headerStats.cost.cost_usd)}
              </span>
            </Stat>
            {t.project_id && <Stat icon={Brain} label="project">{t.project_id}</Stat>}
          </div>
        )}

        {/* Agent chips */}
        {bundle!.agents_involved.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {bundle!.agents_involved.map((a) => {
              const id = a.toLowerCase();
              const meta = META_BY_ID[id];
              const disp = displayAgent(a);
              const color = meta?.color ?? '#64748b';
              return (
                <span
                  key={a}
                  title={`${disp.identity} · ${meta?.role ?? a}`}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
                  style={{ borderColor: `${color}40`, background: `${color}10`, color }}
                >
                  <span aria-hidden>{meta?.icon ?? '🤖'}</span>
                  {disp.identity}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Body: graph + timeline ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
        <div className="min-w-0 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800">
          <AgentGraphPanel
            projectFilter={projectId ?? ''}
            taskId={taskId}
            positionsVersion={positionsVersion}
            onNodeClick={setSelectedNode}
            inspectorOverlay={
              selectedNode && bundle
                ? (
                  <NodeInspector
                    agentName={selectedNode}
                    logs={bundle.agent_log}
                    toolCalls={bundle.tool_calls}
                    onClose={() => setSelectedNode(null)}
                  />
                )
                : null
            }
          />
        </div>
        <div className="min-w-0 lg:max-h-[calc(100vh-220px)] overflow-y-auto">
          <Timeline logs={bundle!.agent_log} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, children,
}: {
  icon: typeof Clock; label: string; children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3 w-3 opacity-60" />
      <span className="opacity-60">{label}</span>
      <span className="text-zinc-900 dark:text-zinc-50">{children}</span>
    </span>
  );
}

const EVENT_ICON: Record<LifecycleEventType, LucideIcon> = {
  start: Play,
  progress: Zap,
  complete: CheckCircle2,
  failed: XCircle,
  assign: Send,
  assigned: Inbox,
  abandon: Ban,
  log: Dot,
};

function Timeline({ logs }: { logs: TaskAgentLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="p-4 text-[11px] text-zinc-400">
        No activity yet for this task.
      </div>
    );
  }
  return (
    <ol className="relative px-3 py-3 text-[11px]">
      <div className="absolute left-[18px] top-3 bottom-3 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
      {logs.map((l) => {
        const id = l.agent_name.toLowerCase();
        const meta = META_BY_ID[id];
        const disp = displayAgent(l.agent_name);
        const color = meta?.color ?? '#64748b';
        const event = normalizeEvent(l);
        const eventVisual = EVENT_VISUAL[event.type];
        const EventIcon = EVENT_ICON[event.type];
        const targetMeta = event.delegateTarget ? META_BY_ID[event.delegateTarget] : null;
        const isFailed = event.type === 'failed';

        return (
          <li key={l.id} className="relative pl-7 py-1.5">
            <span
              className={cn(
                'absolute left-[11px] top-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-zinc-50 dark:ring-zinc-950',
                isFailed && 'animate-pulse',
              )}
              style={{ background: eventVisual.bg, color: eventVisual.tone }}
              aria-hidden
              title={event.type}
            >
              <EventIcon className="h-2 w-2" />
            </span>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-zinc-400 font-mono tabular-nums">{timeOnly(l.timestamp)}</span>
              <span className="font-semibold" style={{ color }}>{disp.identity}</span>
              <span
                className="text-[9px] uppercase tracking-wide px-1 py-0 rounded font-mono"
                style={{ background: eventVisual.bg, color: eventVisual.tone }}
              >
                {event.type}
              </span>
              {event.type === 'assign' && targetMeta && (
                <span className="text-zinc-500 inline-flex items-center gap-1">
                  <ArrowRight className="h-2.5 w-2.5 opacity-50" />
                  <span style={{ color: targetMeta.color }}>{targetMeta.label}</span>
                </span>
              )}
              {event.type === 'assign' && !targetMeta && event.delegateTarget && (
                <span className="text-zinc-500">→ {event.delegateTarget}</span>
              )}
              {l.action && event.type === 'log' && (
                <span className="text-zinc-500">· {l.action}</span>
              )}
            </div>
            {l.description && (
              <p className="ml-0 text-zinc-600 dark:text-zinc-400 line-clamp-2">{l.description}</p>
            )}
            {l.duration_ms != null && l.duration_ms > 0 && (
              <span className="text-[10px] text-zinc-400 font-mono">{(l.duration_ms / 1000).toFixed(2)}s</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
