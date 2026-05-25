/**
 * Task & Session inference.
 *
 * Source data: agent_log rows written by the chronicler agent.
 * Output: rows in `sessions` and `tasks` tables + back-references on every
 * event-bearing table (agent_log, tool_calls, memory_updates, observations,
 * model_failures, planning_log).
 *
 * Heuristics (Phase 1 — intentionally simple, easy to revisit):
 *
 *   SESSION boundary:
 *     - Gap > SESSION_GAP_MS between consecutive logs ⇒ start new session.
 *     - First ever log starts session 1.
 *
 *   TASK boundary (within a session):
 *     - An orchestrator entry whose action ∈ ORCHESTRATOR_ENTRY_ACTIONS
 *       AND time since previous orchestrator-entry > TASK_RELEVANCE_MS
 *       ⇒ start new task.
 *     - First orchestrator entry in a session starts task 1.
 *     - If two orchestrator entries happen within TASK_RELEVANCE_MS we treat
 *       them as continuation of the same task (user is iterating).
 *
 * The inference is **idempotent and resumable**: it only processes log rows
 * whose task_id is still NULL, and it derives the "anchor" from existing
 * task/session rows so a partially-tagged DB converges to a fully-tagged one.
 */

import type Database from 'better-sqlite3';
import { getDb } from './db';

const SESSION_GAP_MS = 30 * 60 * 1000;       // 30 minutes idle ⇒ new session
const TASK_RELEVANCE_MS = 5 * 60 * 1000;     // < 5 min between orch entries ⇒ same task

const ORCHESTRATOR_ALIASES = new Set([
  'orchestrator', 'atlas', 'prabowo',
  'prabowo-orchestrator', 'atlas-orchestrator',
]);

const ORCHESTRATOR_ENTRY_ACTIONS = new Set([
  'route', 'receive', 'classify', 'delegate', 'decompose',
]);

interface LogRow {
  id: number;
  timestamp: string;
  agent_name: string;
  action: string | null;
  description: string | null;
  project_id: string | null;
  duration_ms: number | null;
}

function parseTs(ts: string): number {
  return new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z').getTime();
}

function isOrchestrator(agent: string): boolean {
  return ORCHESTRATOR_ALIASES.has(agent.toLowerCase().trim());
}

function isTaskEntryAction(action: string | null): boolean {
  if (!action) return false;
  return ORCHESTRATOR_ENTRY_ACTIONS.has(action.toLowerCase().trim());
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turn a free-form orchestrator description into a short session label.
 * Strips routing/scaffolding suffixes so "Build todo CLI: routing to planner
 * for decomposition" becomes "Build todo CLI". Best-effort, no LLM call.
 */
function summarizeForLabel(description: string): string {
  let s = description.trim();
  // Cut at the first natural breakpoint that introduces routing prose.
  const breaks = [
    /\s*[:—-]\s+routing\b/i,
    /\s*[:—-]\s+delegating\b/i,
    /\s*[:—-]\s+decomposing\b/i,
    /\s*[:—-]\s+reading\b/i,
    /\s*[—-]\s+/, // "— anything"
    /\s+then\s+/i,
    /\s+→\s+/,
  ];
  for (const re of breaks) {
    const m = s.match(re);
    if (m && m.index != null && m.index > 8) {
      s = s.slice(0, m.index);
      break;
    }
  }
  s = s.replace(/[.,;:!?]+$/, '').trim();
  return s.length > 72 ? s.slice(0, 72).trim() + '…' : s;
}

interface InferState {
  sessionId: string | null;
  sessionLastTs: number;
  sessionProjectId: string | null;
  taskId: string | null;
  taskLastOrchTs: number;
  taskProjectId: string | null;
}

function loadResumeAnchor(db: Database.Database): InferState {
  // Last fully-tagged log row defines where we resume.
  const row = db.prepare(`
    SELECT id, timestamp, session_id, task_id, project_id
    FROM agent_log
    WHERE task_id IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `).get() as { id: number; timestamp: string; session_id: string; task_id: string; project_id: string | null } | undefined;

  if (!row) {
    return {
      sessionId: null, sessionLastTs: 0, sessionProjectId: null,
      taskId: null, taskLastOrchTs: 0, taskProjectId: null,
    };
  }
  const ts = parseTs(row.timestamp);
  return {
    sessionId: row.session_id,
    sessionLastTs: ts,
    sessionProjectId: row.project_id,
    taskId: row.task_id,
    taskLastOrchTs: ts,
    taskProjectId: row.project_id,
  };
}

/**
 * Process every agent_log row whose task_id is NULL.
 * Creates session / task rows as needed and back-fills the task_id column
 * across all event-bearing tables.
 */
export function runTaskInference(): { sessionsCreated: number; tasksCreated: number; rowsTagged: number } {
  const db = getDb();
  const state = loadResumeAnchor(db);

  let sessionsCreated = 0;
  let tasksCreated = 0;
  let rowsTagged = 0;

  const pending = db.prepare(`
    SELECT id, timestamp, agent_name, action, description, project_id, duration_ms
    FROM agent_log
    WHERE task_id IS NULL
    ORDER BY id ASC
  `).all() as LogRow[];

  if (pending.length === 0) {
    // Still run label back-fill for old sessions that never got one.
    backfillSessionLabels(db);
    return { sessionsCreated, tasksCreated, rowsTagged };
  }

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, project_id, started_at, first_log_id, last_log_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const touchSession = db.prepare(`
    UPDATE sessions SET ended_at = ?, last_log_id = ? WHERE id = ?
  `);
  // Auto-label a session as soon as the first meaningful description lands —
  // gives tabs a human-readable title without an extra LLM call.
  const setSessionLabel = db.prepare(`
    UPDATE sessions SET label = ? WHERE id = ? AND (label IS NULL OR label = '')
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, session_id, project_id, title, status, origin_prompt, started_at, first_log_id, last_log_id)
    VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)
  `);
  const touchTask = db.prepare(`
    UPDATE tasks
    SET last_log_id = ?,
        total_duration_ms = total_duration_ms + ?,
        ended_at = ?
    WHERE id = ?
  `);
  // Upgrade a "Session bootstrap" placeholder once a real description shows up.
  const upgradeBootstrapTitle = db.prepare(`
    UPDATE tasks
    SET title = ?, origin_prompt = COALESCE(origin_prompt, ?)
    WHERE id = ? AND title = 'Session bootstrap'
  `);

  const tagLog = db.prepare(`
    UPDATE agent_log SET session_id = ?, task_id = ? WHERE id = ?
  `);

  const txn = db.transaction((rows: LogRow[]) => {
    for (const row of rows) {
      const ts = parseTs(row.timestamp);

      // Explicit session-end marker (written by the launcher when the TUI
      // exits) forces the NEXT row to start a fresh session, regardless of
      // how short the gap is.
      const isExplicitEnd = row.agent_name === 'launcher' && row.action === 'session_end';

      // Session boundary?
      if (!state.sessionId || ts - state.sessionLastTs > SESSION_GAP_MS) {
        state.sessionId = newId('sess');
        state.sessionProjectId = row.project_id;
        insertSession.run(state.sessionId, row.project_id, row.timestamp, row.id, row.id);
        sessionsCreated++;
        // A new session always starts a new task on its first orchestrator entry,
        // so reset the task anchor too.
        state.taskId = null;
        state.taskLastOrchTs = 0;
      }

      // Task boundary?
      const orchEntry = isOrchestrator(row.agent_name) && isTaskEntryAction(row.action);
      if (!state.taskId) {
        // First log of a session may not be an orchestrator entry (e.g. memory-keeper
        // boot). Open a "bootstrap" task so we never drop logs.
        state.taskId = newId('task');
        state.taskProjectId = row.project_id;
        state.taskLastOrchTs = orchEntry ? ts : 0;
        insertTask.run(
          state.taskId,
          state.sessionId,
          row.project_id,
          orchEntry ? (row.description?.slice(0, 80) ?? 'Task') : 'Session bootstrap',
          orchEntry ? row.description : null,
          row.timestamp,
          row.id,
          row.id,
        );
        tasksCreated++;
      } else if (orchEntry && ts - state.taskLastOrchTs > TASK_RELEVANCE_MS) {
        state.taskId = newId('task');
        state.taskProjectId = row.project_id;
        state.taskLastOrchTs = ts;
        insertTask.run(
          state.taskId,
          state.sessionId,
          row.project_id,
          row.description?.slice(0, 80) ?? 'Task',
          row.description,
          row.timestamp,
          row.id,
          row.id,
        );
        tasksCreated++;
      } else if (orchEntry) {
        state.taskLastOrchTs = ts;
      }

      tagLog.run(state.sessionId, state.taskId, row.id);
      touchSession.run(row.timestamp, row.id, state.sessionId);

      // After tagging, an explicit session-end marker forces the NEXT row to
      // start fresh. We mark the current session ended and reset the anchor.
      if (isExplicitEnd) {
        state.sessionId = null;
        state.sessionLastTs = 0;
        state.taskId = null;
        state.taskLastOrchTs = 0;
      }
      touchTask.run(row.id, row.duration_ms ?? 0, row.timestamp, state.taskId);
      // First meaningful description becomes the task title.
      if (row.description && row.description.trim()) {
        upgradeBootstrapTitle.run(
          row.description.slice(0, 80),
          row.description,
          state.taskId,
        );
        // Same description, lightly cleaned, becomes the session label —
        // "Build todo CLI: routing to planner..." → "Build todo CLI".
        if (isOrchestrator(row.agent_name) && row.action !== 'route') {
          setSessionLabel.run(summarizeForLabel(row.description), state.sessionId);
        }
      }
      state.sessionLastTs = ts;
      rowsTagged++;
    }
  });

  txn(pending);

  // Back-fill task_id / session_id on sibling tables by timestamp proximity.
  // Each sibling row gets the task whose [started_at, last touched] window covers it.
  backfillSiblings(db);

  // Back-fill session.label for any session still missing one — covers
  // sessions created by older runs before the label-derivation existed.
  backfillSessionLabels(db);

  return { sessionsCreated, tasksCreated, rowsTagged };
}

function backfillSessionLabels(db: Database.Database): void {
  // For each session without a label, find the earliest orchestrator log row
  // in that session that is NOT a delegation, and use its description.
  const orchAliases = "('orchestrator','atlas','prabowo','prabowo-orchestrator','atlas-orchestrator')";
  const rows = db.prepare(`
    SELECT s.id AS session_id,
           (SELECT description FROM agent_log
            WHERE session_id = s.id
              AND agent_name IN ${orchAliases}
              AND COALESCE(action, '') NOT IN ('route', 'delegate')
              AND description IS NOT NULL AND TRIM(description) != ''
            ORDER BY timestamp ASC LIMIT 1) AS first_desc
    FROM sessions s
    WHERE s.label IS NULL OR s.label = ''
  `).all() as Array<{ session_id: string; first_desc: string | null }>;

  const upd = db.prepare(`UPDATE sessions SET label = ? WHERE id = ?`);
  for (const r of rows) {
    if (!r.first_desc) continue;
    upd.run(summarizeForLabel(r.first_desc), r.session_id);
  }
}

function backfillSiblings(db: Database.Database): void {
  const tables = ['tool_calls', 'memory_updates', 'observations', 'model_failures'];
  for (const table of tables) {
    db.exec(`
      UPDATE ${table}
      SET (task_id, session_id) = (
        SELECT task_id, session_id FROM agent_log
        WHERE agent_log.timestamp <= ${table}.timestamp
          AND agent_log.task_id IS NOT NULL
          AND (
            ${table}.project_id IS NULL
            OR agent_log.project_id IS NULL
            OR agent_log.project_id = ${table}.project_id
          )
        ORDER BY agent_log.timestamp DESC
        LIMIT 1
      )
      WHERE task_id IS NULL;
    `);
  }

  // planning_log is special — match on agent_name + timestamp window if present.
  try {
    db.exec(`
      UPDATE planning_log
      SET (task_id, session_id) = (
        SELECT task_id, session_id FROM agent_log
        WHERE agent_log.timestamp <= planning_log.updated_at
          AND agent_log.task_id IS NOT NULL
        ORDER BY agent_log.timestamp DESC
        LIMIT 1
      )
      WHERE task_id IS NULL;
    `);
  } catch { /* planning_log may use different column name in old DBs */ }
}

/**
 * Mark tasks idle for > TASK_IDLE_CLOSE_MS as completed. Cheap to call
 * before every read; keeps the "running" badge honest.
 */
export function closeIdleTasks(idleMs = 10 * 60 * 1000): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - idleMs).toISOString().replace('T', ' ').slice(0, 19);
  const res = db.prepare(`
    UPDATE tasks
    SET status = 'completed', ended_at = COALESCE(ended_at, ?)
    WHERE status = 'running' AND COALESCE(ended_at, started_at) < ?
  `).run(cutoff, cutoff);
  return res.changes;
}
