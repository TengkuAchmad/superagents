'use client';

/**
 * Floating inspector overlay shown when a node is clicked in the task graph.
 *
 * Sits in the top-right of the graph viewport. All data is derived locally
 * from the TaskBundle the parent already has — no extra fetch.
 */

import {
  X, Clock, Cpu, Wrench, FileEdit, Activity, AlertCircle, Coins, DollarSign,
  Play, Zap, CheckCircle2, XCircle, Send, Inbox, Ban, Dot, type LucideIcon,
} from 'lucide-react';
import { deriveAgentStats, type RawLogRow, type RawToolCall } from '@/lib/task-derive';
import { formatTokens, formatUsd } from '@/lib/model-costs';
import { META_BY_ID, displayAgent } from '@/lib/agent-registry';
import { normalizeEvent, EVENT_VISUAL, type LifecycleEventType } from '@/lib/lifecycle-events';
import { AGENT_REGISTRY } from '@/lib/agent-registry';
import { cn } from '@/lib/utils';

function shortModel(model: string | null): string {
  if (!model) return '—';
  return model.replace(/^(anthropic|github-copilot|opencode)\//, '');
}

// Variant matching: a node id like "orchestrator" should accept logs whose
// agent_name is "atlas", "prabowo", etc. (any registered variant).
const VARIANTS_BY_ID = new Map<string, Set<string>>();
for (const a of AGENT_REGISTRY) {
  VARIANTS_BY_ID.set(
    a.canonical_id,
    new Set([a.canonical_id, a.opencode_key, ...(a.variants ?? [])].map((s) => s.toLowerCase())),
  );
}
function logBelongsToAgent(rowAgent: string, nodeId: string): boolean {
  const accept = VARIANTS_BY_ID.get(nodeId.toLowerCase()) ?? new Set([nodeId.toLowerCase()]);
  return accept.has(rowAgent.toLowerCase());
}

const EVENT_ICON: Record<LifecycleEventType, LucideIcon> = {
  start: Play, progress: Zap, complete: CheckCircle2, failed: XCircle,
  assign: Send, assigned: Inbox, abandon: Ban, log: Dot,
};

function timeOnly(ts: string): string {
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function NodeInspector({
  agentName,
  logs,
  toolCalls,
  onClose,
}: {
  agentName: string;
  logs: RawLogRow[];
  toolCalls: RawToolCall[];
  onClose: () => void;
}) {
  const stats = deriveAgentStats(agentName, logs, toolCalls);
  const id = agentName.toLowerCase();
  const meta = META_BY_ID[id];
  const disp = displayAgent(agentName);
  const color = meta?.color ?? '#64748b';
  const isFailed = stats.last_status === 'failed';
  const isRunning = stats.last_status === 'started' || stats.last_status === 'in_progress';

  return (
    <div
      className="agn-inspector absolute top-3 right-3 z-20 w-[260px] max-h-[calc(100%-24px)] overflow-y-auto rounded-lg border bg-zinc-950/95 backdrop-blur-md shadow-2xl text-zinc-100"
      style={{ borderColor: `${color}40` }}
      role="dialog"
      aria-label={`Inspector: ${disp.identity}`}
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-2.5 py-2 border-b" style={{ borderColor: `${color}30` }}>
        <span
          className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-sm"
          style={{ background: `${color}25`, color }}
          aria-hidden
        >
          {meta?.icon ?? '🤖'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight" style={{ color }}>{disp.identity}</div>
          <div className="text-[9px] text-zinc-400 leading-tight">{meta?.role ?? agentName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded p-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Status strip */}
      <div className="px-2.5 py-1.5 border-b border-zinc-800/80 text-[10px]">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={cn('inline-block h-1.5 w-1.5 rounded-full', isRunning && 'animate-pulse')}
            style={{ background: isFailed ? '#ef4444' : isRunning ? color : '#52525b' }}
          />
          <span className="font-medium" style={{ color: isFailed ? '#ef4444' : isRunning ? color : '#a1a1aa' }}>
            {stats.last_status ?? 'idle'}
          </span>
          {stats.last_action && (
            <span className="text-zinc-500">· {stats.last_action}</span>
          )}
        </div>
        {stats.last_description && (
          <p className="text-zinc-400 leading-snug line-clamp-2" title={stats.last_description}>
            {stats.last_description}
          </p>
        )}
      </div>

      {/* Numeric stats */}
      <dl className="grid grid-cols-2 gap-px bg-zinc-800/80 text-[10px]">
        <Cell icon={Activity} label="actions">{stats.log_count}</Cell>
        <Cell icon={Clock}    label="duration">{formatMs(stats.total_duration_ms)}</Cell>
        <Cell icon={Wrench}   label="tools">{stats.tool_call_count}</Cell>
        <Cell icon={Cpu}      label="model">
          <span className="font-mono">{shortModel(stats.last_model)}</span>
        </Cell>
        <Cell icon={Coins} label="tokens">
          <span>
            {formatTokens(stats.cost.total_tokens)}
            {stats.cost.estimated && (
              <span className="ml-1 text-[8px] px-1 rounded bg-amber-500/15 text-amber-400" title="Estimated">
                est.
              </span>
            )}
          </span>
        </Cell>
        <Cell icon={DollarSign} label="list-cost">
          <span title="Equivalent at public API list price. Real cost on Claude Max ≈ $0 marginal.">
            {formatUsd(stats.cost.cost_usd)}
          </span>
        </Cell>
      </dl>

      {/* Tools breakdown */}
      {stats.tools.length > 0 && (
        <Section title="Tools used">
          <ul className="space-y-0.5">
            {stats.tools.slice(0, 6).map((t) => (
              <li key={t.tool_name} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-300 truncate">{t.tool_name}</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {t.count}
                  {t.failed > 0 && (
                    <span className="ml-1 text-red-400">({t.failed} fail)</span>
                  )}
                </span>
              </li>
            ))}
            {stats.tools.length > 6 && (
              <li className="text-[10px] text-zinc-500">+{stats.tools.length - 6} more</li>
            )}
          </ul>
        </Section>
      )}

      {/* Files modified */}
      {stats.files_modified.length > 0 && (
        <Section title={`Files modified (${stats.files_modified.length})`} icon={FileEdit}>
          <ul className="space-y-0.5">
            {stats.files_modified.slice(0, 8).map((f) => (
              <li key={f} className="font-mono text-[10px] text-zinc-300 truncate" title={f}>
                {f.replace(/^.*\/([^/]+\/[^/]+)$/, '…/$1')}
              </li>
            ))}
            {stats.files_modified.length > 8 && (
              <li className="text-[10px] text-zinc-500">+{stats.files_modified.length - 8} more</li>
            )}
          </ul>
        </Section>
      )}

      {/* Activity timeline — scrollable per-agent chronological list */}
      {stats.log_count > 0 && (
        <ActivityList agentName={agentName} logs={logs} accentColor={color} />
      )}

      {/* Empty state */}
      {stats.log_count === 0 && (
        <div className="px-3 py-4 text-[11px] text-zinc-500 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          No activity for this agent in the current session.
        </div>
      )}
    </div>
  );
}

function ActivityList({
  agentName, logs, accentColor,
}: {
  agentName: string;
  logs: RawLogRow[];
  accentColor: string;
}) {
  const mine = logs.filter((l) => logBelongsToAgent(l.agent_name, agentName));
  return (
    <div className="border-t border-zinc-800/80">
      <div className="flex items-center justify-between px-2.5 py-1.5 text-[9px] uppercase tracking-wide text-zinc-500 sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
        <span className="inline-flex items-center gap-1">
          <Activity className="h-2.5 w-2.5" />
          Activity ({mine.length})
        </span>
      </div>
      {/* Capped max-height + thin custom scrollbar */}
      <ol className="agn-thin-scroll relative max-h-[220px] overflow-y-auto px-2.5 py-1.5 text-[10px]">
        <div className="absolute left-[12px] top-2 bottom-2 w-px bg-zinc-800/80" aria-hidden />
        {mine.map((l) => {
          const event = normalizeEvent(l);
          const visual = EVENT_VISUAL[event.type];
          const Icon = EVENT_ICON[event.type];
          const isFailed = event.type === 'failed';
          return (
            <li key={l.id} className="relative pl-5 py-1">
              <span
                className={cn(
                  'absolute left-[6px] top-1.5 inline-flex h-2.5 w-2.5 items-center justify-center rounded-full ring-2 ring-zinc-950',
                  isFailed && 'animate-pulse',
                )}
                style={{ background: visual.bg, color: visual.tone }}
                title={event.type}
              >
                <Icon className="h-1.5 w-1.5" />
              </span>
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="text-zinc-400 font-mono tabular-nums text-[9px]">{timeOnly(l.timestamp)}</span>
                <span
                  className="text-[8px] uppercase tracking-wide px-1 rounded font-mono"
                  style={{ background: visual.bg, color: visual.tone }}
                >
                  {event.type}
                </span>
                {event.delegateTarget && (
                  <span className="text-zinc-500">→ <span style={{ color: accentColor }}>{event.delegateTarget}</span></span>
                )}
              </div>
              {l.description && (
                <p className="text-zinc-300 leading-snug mt-0.5 break-words">
                  {l.description}
                </p>
              )}
              {l.result && (
                <p className="text-zinc-500 leading-snug mt-0.5 break-words italic">
                  → {l.result.length > 120 ? l.result.slice(0, 120) + '…' : l.result}
                </p>
              )}
              {(l.duration_ms != null && l.duration_ms > 0) && (
                <span className="text-[9px] text-zinc-500 font-mono">{(l.duration_ms / 1000).toFixed(2)}s</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Cell({
  icon: Icon, label, children,
}: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 px-2 py-1.5 flex items-center gap-1">
      <Icon className="h-2.5 w-2.5 text-zinc-500 shrink-0" />
      <span className="text-zinc-500">{label}</span>
      <span className="ml-auto text-zinc-100 font-medium">{children}</span>
    </div>
  );
}

function Section({
  title, icon: Icon, children,
}: { title: string; icon?: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 border-t border-zinc-800/80">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-zinc-500 mb-1">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
