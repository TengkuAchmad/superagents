'use client';

/**
 * Browser-style SESSION tabs (one opencode run = one tab).
 *
 * Source: GET /api/sessions. Refresh every 10s.
 *
 * URL is reflected via the parent — this component is pure UI + onSelect.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SessionTab {
  id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  label: string | null;
  task_count: number;
  total_duration_ms: number;
}

interface SessionsResponse { sessions: SessionTab[] }

function shortLabel(s: SessionTab): string {
  if (s.label) return s.label.length > 38 ? s.label.slice(0, 38) + '…' : s.label;
  // Fallback when no AI-derived label yet (session just started): date + time.
  const d = new Date(s.started_at.includes('T') ? s.started_at : s.started_at.replace(' ', 'T') + 'Z');
  const time = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

function isLive(s: SessionTab): boolean {
  if (s.ended_at == null) return true;
  // Treat sessions touched in last 10 min as still live.
  const end = new Date(s.ended_at.includes('T') ? s.ended_at : s.ended_at.replace(' ', 'T') + 'Z').getTime();
  return Date.now() - end < 10 * 60 * 1000;
}

export function SessionTabBar({
  projectId,
  activeSessionId,
  onSelect,
  maxTabs = 8,
}: {
  projectId: string | null;
  activeSessionId: string | null;
  onSelect: (sessionId: string | null) => void;
  maxTabs?: number;
}) {
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`/api/sessions${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as SessionsResponse;
      setSessions(data.sessions ?? []);
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 10_000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  const visible = sessions.slice(0, maxTabs);

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="flex items-stretch overflow-x-auto">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-xs font-medium border-r border-zinc-200 dark:border-zinc-800 whitespace-nowrap transition-colors',
            activeSessionId === null
              ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 border-b-2 border-b-blue-500'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>All sessions</span>
        </button>

        {loading && visible.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading sessions…
          </div>
        )}

        {visible.map((s) => {
          const live = isLive(s);
          const Icon = live ? Loader2 : CheckCircle2;
          const tone = live
            ? 'text-blue-500 bg-blue-500/10 border-blue-500/40'
            : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/40';
          const isActive = activeSessionId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              title={`Session ${s.id} · ${s.task_count} task(s)`}
              className={cn(
                'group flex items-center gap-2 px-3 py-2 text-xs font-medium border-r border-zinc-200 dark:border-zinc-800 whitespace-nowrap transition-colors max-w-[240px]',
                isActive
                  ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 border-b-2 border-b-blue-500'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50',
              )}
            >
              <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full border', tone)}>
                <Icon className={cn('h-2.5 w-2.5', live && 'animate-spin')} />
              </span>
              <span className="truncate">{shortLabel(s)}</span>
              <span className="text-[10px] text-zinc-400 tabular-nums">{s.task_count}t</span>
            </button>
          );
        })}

        {sessions.length > maxTabs && (
          <div className="flex items-center px-3 py-2 text-[10px] text-zinc-400">
            +{sessions.length - maxTabs} more
          </div>
        )}
      </div>
    </div>
  );
}
