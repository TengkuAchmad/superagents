'use client';

import { useCallback, useEffect, useState } from 'react';
import { displayAgent } from '@/lib/agent-registry';

interface Subtask {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  agent?: string;
}

interface PlanRow {
  id: number;
  plan_id: string;
  agent_name: string | null;
  title: string | null;
  subtasks: Subtask[];
  status: string;
  progress_pct: number;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface PlansResponse {
  logs: PlanRow[];
  error?: string;
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function PlansPanel({ projectFilter = '' }: { projectFilter?: string }) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [active, setActive] = useState<PlanRow | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const qs = projectFilter ? `?project_id=${projectFilter}` : '';
      const res = await fetch(`/api/planning-log${qs}`);
      const data: PlansResponse = await res.json();
      setPlans(data.logs ?? []);
      setError(data.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    }
  }, [projectFilter]);

  useEffect(() => {
    fetchPlans();
    const id = setInterval(fetchPlans, 5000);
    return () => clearInterval(id);
  }, [fetchPlans]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

  const activeCount = plans.filter(p => p.status !== 'done').length;
  const doneCount = plans.filter(p => p.status === 'done').length;

  return (
    <div className="plans-panel">
      <div className="plans-panel-header">
        <span>Plans &amp; Todos</span>
        <span style={{ color: '#52525b' }}>{activeCount} active · {doneCount} done · {plans.length} total</span>
        {error && <span style={{ color: '#ef4444' }}>⚠ {error}</span>}
        <button className="plans-panel-toggle" onClick={() => setExpanded(v => !v)}>
          {expanded ? '▾ collapse' : '▸ expand'}
        </button>
      </div>

      {expanded && (
        <>
          {plans.length === 0 ? (
            <div className="plans-empty">
              No plans yet. Planner / executor agents log here via POST /api/planning-log.
            </div>
          ) : (
            <div className="plans-strip">
              {plans.map(plan => {
                const disp = displayAgent(plan.agent_name);
                const done = plan.subtasks.filter(s => s.status === 'done').length;
                return (
                  <div key={plan.id} className="plan-card" onClick={() => setActive(plan)}>
                    <div className="plan-card-head">
                      <span className="plan-card-dot" style={{
                        width: 8, height: 8, borderRadius: '50%', background: disp.color, flexShrink: 0,
                      }} />
                      <span className="plan-card-agent">{disp.identity}</span>
                      <span className="plan-card-status">{plan.status}</span>
                    </div>
                    <div className="plan-card-title">{plan.title ?? plan.plan_id}</div>
                    <div className="plan-card-progress">
                      <div className="plan-card-progress-fill" style={{
                        width: `${Math.min(100, Math.max(0, plan.progress_pct))}%`,
                        background: plan.status === 'failed' ? '#ef4444' : plan.status === 'done' ? '#4ade80' : disp.color,
                      }} />
                    </div>
                    <div className="plan-card-footer">
                      <span>{done}/{plan.subtasks.length} done</span>
                      <span>{formatRelative(plan.updated_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {active && (
        <div className="plan-dialog-backdrop" onClick={() => setActive(null)}>
          <div className="plan-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="plan-dialog-head">
              <span className="plan-dialog-title">{active.title ?? active.plan_id}</span>
              <button className="plan-dialog-close" onClick={() => setActive(null)}>✕</button>
            </div>
            <div className="plan-dialog-body">
              <div className="plan-meta-row">
                <span><strong>Agent:</strong> {displayAgent(active.agent_name).identity}</span>
                <span><strong>Status:</strong> {active.status}</span>
                <span><strong>Progress:</strong> {Math.round(active.progress_pct)}%</span>
              </div>
              <div className="plan-meta-row">
                <span><strong>Plan ID:</strong> {active.plan_id}</span>
                <span><strong>Created:</strong> {formatRelative(active.created_at)}</span>
                <span><strong>Updated:</strong> {formatRelative(active.updated_at)}</span>
              </div>
              {active.subtasks.length === 0 ? (
                <div style={{ fontSize: 11, color: '#52525b' }}>No subtasks recorded for this plan.</div>
              ) : (
                <ul className="subtask-list">
                  {active.subtasks.map((s, i) => (
                    <li key={s.id ?? i} className={`subtask-item subtask-item--${s.status}`}>
                      <span>{s.status === 'done' ? '✓' : s.status === 'in_progress' ? '◐' : s.status === 'failed' ? '✕' : '○'}</span>
                      <span style={{ flex: 1 }}>{s.text}</span>
                      {s.agent && <span style={{ fontSize: 9, color: '#71717a' }}>→ {displayAgent(s.agent).identity}</span>}
                      <span className={`subtask-status subtask-status--${s.status}`}>{s.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
