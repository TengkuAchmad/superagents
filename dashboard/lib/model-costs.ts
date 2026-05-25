/**
 * Model price table (USD per 1M tokens, list/API price).
 *
 * IMPORTANT CONTEXT FOR THIS PROJECT:
 *   Most agents here route through Meridian → Claude Max subscription. Marginal
 *   per-request cost is effectively $0 — the subscription is flat-rate.
 *
 *   So "cost" in this dashboard is a **list-price equivalent** — it tells you
 *   "if you were billed at the public API rate, this task would cost X". That
 *   number is useful for:
 *     - comparing relative cost between tasks / agents
 *     - estimating cost if you ever move off Claude Max
 *     - spotting agents that consume disproportionate subscription value
 *
 *   Real billed cost on Claude Max ≈ $0 marginal. Don't quote these numbers
 *   to finance as actual spend.
 *
 * Prices last reviewed: 2026-05. Edit when Anthropic / OpenAI update pricing.
 */

interface ModelRate {
  /** USD per 1M input tokens (list price). */
  input: number;
  /** USD per 1M output tokens (list price). */
  output: number;
}

// Keyed by a normalized model id (lowercase, no provider prefix).
const RATES: Record<string, ModelRate> = {
  // Anthropic Claude
  'claude-opus-4-7':       { input: 15.00, output: 75.00 },
  'claude-opus-4-6':       { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':     { input:  3.00, output: 15.00 },
  'claude-sonnet-4-5':     { input:  3.00, output: 15.00 },
  'claude-haiku-4-5':      { input:  0.80, output:  4.00 },
  // OpenAI / GitHub Copilot
  'gpt-4.1':               { input:  2.00, output:  8.00 },
  'gpt-4.1-mini':          { input:  0.40, output:  1.60 },
  'gpt-4.1-nano':          { input:  0.10, output:  0.40 },
  // Fallback for unknown models — visible in UI as "?"
  unknown:                 { input:  0.00, output:  0.00 },
};

function normalizeModel(model: string | null | undefined): string {
  if (!model) return 'unknown';
  const stripped = model
    .replace(/^(anthropic|github-copilot|opencode)\//, '')
    .replace(/\[.*?\]$/, '')              // strip "[1m]" context suffix
    .replace(/-\d{6,}$/, '')              // strip date suffix "-20251001"
    .toLowerCase()
    .trim();
  return RATES[stripped] ? stripped : 'unknown';
}

export interface CostBreakdown {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  /** True when the cost was computed using a heuristic estimate of token count. */
  estimated: boolean;
  /** True when the model is unknown and rate=0 (cost will be 0 regardless of tokens). */
  unknown_model: boolean;
}

/** Per-call cost from real or estimated tokens. */
export function calcCost(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  estimated: boolean,
): CostBreakdown {
  const key = normalizeModel(model);
  const rate = RATES[key];
  const cost_usd =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_usd,
    estimated,
    unknown_model: key === 'unknown',
  };
}

/** Sum a list of breakdowns. Marks aggregate `estimated` if ANY part was. */
export function sumCosts(parts: CostBreakdown[]): CostBreakdown {
  let i = 0, o = 0, c = 0, estimated = false, unknown_model = false;
  for (const p of parts) {
    i += p.input_tokens;
    o += p.output_tokens;
    c += p.cost_usd;
    estimated = estimated || p.estimated;
    unknown_model = unknown_model || p.unknown_model;
  }
  return {
    input_tokens: i, output_tokens: o, total_tokens: i + o,
    cost_usd: c, estimated, unknown_model,
  };
}

/** Pretty USD — keeps small numbers readable: $0.0042, $1.23, $124.5 */
export function formatUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1)    return `$${n.toFixed(3)}`;
  if (n < 100)  return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
}

/** Pretty token count: 1.2k / 34.5k / 1.2M */
export function formatTokens(n: number): string {
  if (n < 1000)       return String(n);
  if (n < 1_000_000)  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
