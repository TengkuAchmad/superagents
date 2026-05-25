/**
 * Lifecycle event interpretation layer.
 *
 * The chronicler writes raw `agent_log` rows with free-form `action` and
 * `status` fields. The dashboard normalizes those into a small, fixed event
 * vocabulary so the UI (timeline, graph, inspector) can render consistent
 * iconography regardless of whatever phrasing an individual agent .md spec
 * uses today.
 *
 * Single source of truth for what agents SHOULD emit:
 *   agents/agent/LIFECYCLE_PROTOCOL.md
 *
 * This module is purely interpretive — it never asks an agent to do anything.
 * As long as agents log SOMETHING with reasonable action/status values, the
 * dashboard degrades gracefully.
 */

export type LifecycleEventType =
  | 'start'      // agent began work on a task / subtask
  | 'progress'   // intermediate update (heartbeat, step N of M)
  | 'complete'   // agent finished successfully
  | 'failed'     // agent stopped with an error
  | 'assign'     // agent delegated work to another agent (outgoing)
  | 'assigned'   // agent received work from another agent (incoming)
  | 'abandon'    // task / subtask was dropped or cancelled
  | 'log';       // anything else worth showing but not a lifecycle moment

export interface NormalizedEvent {
  type: LifecycleEventType;
  /** When this is `assign`, the canonical id of the agent we delegated TO. */
  delegateTarget: string | null;
  /** Pretty label suitable for short timeline entries. */
  label: string;
}

const TYPE_BY_ACTION: Record<string, LifecycleEventType> = {
  // start signals
  start: 'start',
  begin: 'start',
  receive: 'assigned',
  // routing / delegation
  route: 'assign',
  delegate: 'assign',
  decompose: 'assign',
  execute_plan: 'assign',
  // completion
  complete: 'complete',
  done: 'complete',
  finish: 'complete',
  // progress
  progress: 'progress',
  step: 'progress',
  update: 'progress',
  // abandon / failure
  abandon: 'abandon',
  cancel: 'abandon',
  fail: 'failed',
};

const TYPE_BY_STATUS: Record<string, LifecycleEventType> = {
  started: 'start',
  in_progress: 'progress',
  completed: 'complete',
  failed: 'failed',
  abandoned: 'abandon',
};

// Common ways agents describe delegation in their `description` / `result`.
// Kept loose on purpose — we'd rather miss a tag than misclassify.
const DELEGATE_PATTERNS: RegExp[] = [
  /rout(?:ed|ing)?\s+to\s+([a-z][\w-]*)/i,
  /delegat\w*\s+to\s+([a-z][\w-]*)/i,
  /assign(?:ed)?\s+to\s+([a-z][\w-]*)/i,
  /handed?\s+off\s+to\s+([a-z][\w-]*)/i,
  /→\s*([a-z][\w-]*)/i,
  /routed_to[:\s]+([a-z][\w-]*)/i,
];

function extractDelegateTarget(description: string | null, result: string | null): string | null {
  const text = `${description ?? ''}\n${result ?? ''}`;
  for (const re of DELEGATE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export function normalizeEvent(row: {
  action: string | null;
  status: string | null;
  description: string | null;
  result?: string | null;
}): NormalizedEvent {
  const actionKey = (row.action ?? '').toLowerCase().trim();
  const statusKey = (row.status ?? '').toLowerCase().trim();

  // Action wins normally — it carries the specific intent ("route",
  // "complete"). Status only wins for terminal signals (failed/completed/
  // abandoned) — a "route + started" row is a delegation, not a generic
  // start.
  const TERMINAL_STATUSES = new Set(['failed', 'completed', 'abandoned']);
  let type: LifecycleEventType =
    TYPE_BY_ACTION[actionKey] ??
    TYPE_BY_STATUS[statusKey] ??
    'log';
  if (TERMINAL_STATUSES.has(statusKey)) {
    type = TYPE_BY_STATUS[statusKey] ?? type;
  }
  // Failure always wins.
  if (statusKey === 'failed') type = 'failed';

  const delegateTarget = type === 'assign'
    ? extractDelegateTarget(row.description, row.result ?? null)
    : null;

  const label = type === 'assign' && delegateTarget
    ? `→ ${delegateTarget}`
    : actionKey || statusKey || 'activity';

  return { type, delegateTarget, label };
}

/** Tiny visual descriptor — the UI maps these to lucide icons + tailwind tones. */
export const EVENT_VISUAL: Record<LifecycleEventType, { tone: string; bg: string }> = {
  start:    { tone: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  progress: { tone: '#0ea5e9', bg: 'rgba(14,165,233,0.10)'  },
  complete: { tone: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  failed:   { tone: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  assign:   { tone: '#8b5cf6', bg: 'rgba(139,92,246,0.10)'  },
  assigned: { tone: '#a855f7', bg: 'rgba(168,85,247,0.10)'  },
  abandon:  { tone: '#71717a', bg: 'rgba(113,113,122,0.10)' },
  log:      { tone: '#52525b', bg: 'rgba(82,82,91,0.08)'    },
};
