/**
 * Pure helpers that derive per-agent and per-task stats from a TaskBundle.
 * No I/O — used by NodeInspector and TaskWorkspace.
 *
 * Important: `agent_name` in the log can be any of an agent's known variants
 * (e.g. an Atlas/orchestrator entry may be logged as "atlas", "prabowo",
 * "orchestrator"). We resolve via the registry so a canonical id like
 * "orchestrator" matches all of its variants.
 */

import { AGENT_REGISTRY } from './agent-registry';
import { calcCost, sumCosts, type CostBreakdown } from './model-costs';
import { estimateRowTokens } from './token-estimator';

const VARIANTS_BY_ID = new Map<string, Set<string>>();
for (const a of AGENT_REGISTRY) {
  const set = new Set<string>([a.canonical_id, a.opencode_key, ...(a.variants ?? [])].map((s) => s.toLowerCase()));
  VARIANTS_BY_ID.set(a.canonical_id, set);
}

function namesFor(agentIdOrName: string): Set<string> {
  const key = agentIdOrName.toLowerCase();
  const direct = VARIANTS_BY_ID.get(key);
  if (direct) return direct;
  // Unknown id (e.g. raw log value not yet in registry) — match by itself.
  return new Set([key]);
}

function nameMatches(rowName: string | null, accept: Set<string>): boolean {
  return rowName ? accept.has(rowName.toLowerCase()) : false;
}

export interface RawLogRow {
  id: number;
  timestamp: string;
  agent_name: string;
  action: string | null;
  description: string | null;
  result: string | null;
  status: string | null;
  duration_ms: number | null;
  model: string | null;
  // Populated by agents when their MCP returns usage data. Null = use the
  // heuristic estimator in token-estimator.ts.
  usage_input_tokens: number | null;
  usage_output_tokens: number | null;
}

export interface RawToolCall {
  id: number;
  timestamp: string;
  agent_name: string | null;
  tool_name: string | null;
  parameters: string | null;
  status: string | null;
}

export interface AgentStats {
  agent_name: string;
  log_count: number;
  total_duration_ms: number;
  last_action: string | null;
  last_description: string | null;
  last_status: string | null;
  last_timestamp: string | null;
  last_model: string | null;
  tools: Array<{ tool_name: string; count: number; failed: number }>;
  tool_call_count: number;
  files_modified: string[]; // deduped, in first-seen order
  cost: CostBreakdown;
}

const FILE_TOOLS = new Set([
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
  // claude-mem & opencode variants
  'opencode__edit', 'opencode__write', 'opencode__patch',
]);

function extractFilePath(parameters: string | null): string[] {
  if (!parameters) return [];
  try {
    const p = JSON.parse(parameters) as Record<string, unknown>;
    const single = p.file_path ?? p.filePath ?? p.path ?? p.notebook_path;
    if (typeof single === 'string') return [single];
    if (Array.isArray(p.edits)) {
      // MultiEdit pattern: edits is array of {file_path,...} OR contains file_path on parent
      const out: string[] = [];
      if (typeof single === 'string') out.push(single);
      for (const e of p.edits as Array<Record<string, unknown>>) {
        if (e && typeof e.file_path === 'string') out.push(e.file_path);
      }
      return out;
    }
  } catch { /* malformed parameters — ignore */ }
  return [];
}

export function deriveAgentStats(
  agentName: string,
  logs: RawLogRow[],
  toolCalls: RawToolCall[],
): AgentStats {
  const accept = namesFor(agentName);
  const myLogs = logs.filter((l) => nameMatches(l.agent_name, accept));
  const myTools = toolCalls.filter((t) => nameMatches(t.agent_name, accept));

  // Latest log (logs come in ASC order from API).
  const last = myLogs.at(-1) ?? null;

  // Tool aggregation.
  const toolMap = new Map<string, { count: number; failed: number }>();
  for (const t of myTools) {
    const name = t.tool_name ?? '(unknown)';
    const cur = toolMap.get(name) ?? { count: 0, failed: 0 };
    cur.count++;
    if (t.status === 'failed') cur.failed++;
    toolMap.set(name, cur);
  }
  const tools = Array.from(toolMap.entries())
    .map(([tool_name, v]) => ({ tool_name, count: v.count, failed: v.failed }))
    .sort((a, b) => b.count - a.count);

  // Files modified — only from known editing tools, deduped in first-seen order.
  const seen = new Set<string>();
  const files: string[] = [];
  for (const t of myTools) {
    if (!t.tool_name || !FILE_TOOLS.has(t.tool_name)) continue;
    for (const path of extractFilePath(t.parameters)) {
      if (!seen.has(path)) {
        seen.add(path);
        files.push(path);
      }
    }
  }

  // Last model the agent actually used — fall back to most recent non-null.
  let lastModel: string | null = null;
  for (let i = myLogs.length - 1; i >= 0; i--) {
    if (myLogs[i].model) { lastModel = myLogs[i].model; break; }
  }

  const total_duration_ms = myLogs.reduce((s, l) => s + (l.duration_ms ?? 0), 0);

  // Cost: prefer real usage when present, fall back to char-based estimate.
  // Each row gets its own model used at the time — important when an agent
  // switches between Sonnet and Haiku across the task.
  const perRow: CostBreakdown[] = myLogs.map((l) => {
    const hasReal = l.usage_input_tokens != null || l.usage_output_tokens != null;
    if (hasReal) {
      return calcCost(l.model, l.usage_input_tokens ?? 0, l.usage_output_tokens ?? 0, false);
    }
    const est = estimateRowTokens(l);
    return calcCost(l.model, est.input, est.output, true);
  });
  const cost = sumCosts(perRow);

  return {
    agent_name: agentName,
    log_count: myLogs.length,
    total_duration_ms,
    last_action: last?.action ?? null,
    last_description: last?.description ?? null,
    last_status: last?.status ?? null,
    last_timestamp: last?.timestamp ?? null,
    last_model: lastModel,
    tools,
    tool_call_count: myTools.length,
    files_modified: files,
    cost,
  };
}

/** Total cost across the whole task — sums every log row regardless of agent. */
export function deriveTaskCost(logs: RawLogRow[]): CostBreakdown {
  const parts = logs.map((l) => {
    const hasReal = l.usage_input_tokens != null || l.usage_output_tokens != null;
    if (hasReal) {
      return calcCost(l.model, l.usage_input_tokens ?? 0, l.usage_output_tokens ?? 0, false);
    }
    const est = estimateRowTokens(l);
    return calcCost(l.model, est.input, est.output, true);
  });
  return sumCosts(parts);
}
