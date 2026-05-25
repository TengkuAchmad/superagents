'use client';

/**
 * Browser-style task tabs.
 *
 * Each running / recent task = one tab. Active tab is reflected in the URL
 * (`?task_id=…`) so it survives reload and can be shared. Clicking "All" clears
 * the task_id, returning the dashboard to its global view.
 *
 * Data source: GET /api/tasks. Refresh on a slow interval (10s) because tasks
 * appear/disappear at user pace, not real-time pace.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TaskTab {
  id: string;
  title: string | null;
  status: 'running' | 'completed' | 'failed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  total_duration_ms: number;
  agent_count: number;
  tool_call_count: number;
  session_id: string | null;
}

interface TasksResponse { tasks: TaskTab[] }

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
  abandoned: AlertCircle,
} as const;

const STATUS_TONE = {
  running: 'text-blue-500 bg-blue-500/10 border-blue-500/40',
  completed: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/40',
  failed: 'text-red-500 bg-red-500/10 border-red-500/40',
  abandoned: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/40',
} as const;

function shortTitle(t: TaskTab): string {
  if (t.title && t.title !== 'Session bootstrap') return t.title.slice(0, 40);
  return `Task ${t.id.slice(-4)}`;
}

export function TaskTabBar({
  projectId,
  activeTaskId,
  onSelect,
  maxTabs = 8,
}: {
  projectId: string | null;
  activeTaskId: string | null;
  onSelect: (taskId: string | null) => void;
  maxTabs?: number;
}) {
  const [tasks, setTasks] = useState<TaskTab[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`/api/tasks${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as TasksResponse;
      setTasks(data.tasks ?? []);
    } catch {
      /* keep last value */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 10_000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  // Show running tasks first, then the most recent completed ones.
  const visible = [
    ...tasks.filter((t) => t.status === 'running'),
    ...tasks.filter((t) => t.status !== 'running'),
  ].slice(0, maxTabs);

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="flex items-stretch overflow-x-auto">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-xs font-medium border-r border-zinc-200 dark:border-zinc-800 whitespace-nowrap transition-colors',
            activeTaskId === null
              ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 border-b-2 border-b-blue-500'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>All</span>
        </button>

        {loading && visible.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading tasks…
          </div>
        )}

        {visible.map((t) => {
          const Icon = STATUS_ICON[t.status];
          const isActive = activeTaskId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              title={t.title ?? t.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-2 text-xs font-medium border-r border-zinc-200 dark:border-zinc-800 whitespace-nowrap transition-colors max-w-[240px]',
                isActive
                  ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 border-b-2 border-b-blue-500'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full border',
                  STATUS_TONE[t.status],
                )}
              >
                <Icon className={cn('h-2.5 w-2.5', t.status === 'running' && 'animate-spin')} />
              </span>
              <span className="truncate">{shortTitle(t)}</span>
              <span className="text-[10px] text-zinc-400 tabular-nums">{t.agent_count}a</span>
            </button>
          );
        })}

        {tasks.length > maxTabs && (
          <div className="flex items-center px-3 py-2 text-[10px] text-zinc-400">
            +{tasks.length - maxTabs} more
          </div>
        )}
      </div>
    </div>
  );
}
