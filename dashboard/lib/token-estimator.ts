/**
 * Heuristic token estimator — used when the chronicler did NOT log real usage
 * counts (which is the case for most legacy log rows today, since the plugin
 * hasn't been extended to capture MCP token data yet).
 *
 * Rule of thumb: ~4 characters per token for English/Indonesian prose, ~3 for
 * compressed code. We bias to ~3.5 to compromise. This is intentionally rough
 * — the UI marks any value derived from this estimator with an "est." badge so
 * users know not to take it as exact.
 */

const CHARS_PER_TOKEN = 3.5;

/** Estimate tokens from a text blob. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate input + output tokens for a single agent_log row.
 * - Input ≈ description (the prompt the agent received / the request it logged)
 * - Output ≈ result (whatever the agent wrote back, if anything)
 *
 * When the chronicler eventually logs real `usage_input_tokens` /
 * `usage_output_tokens`, we skip this estimator entirely (see task-derive.ts).
 */
export function estimateRowTokens(row: {
  description: string | null;
  result: string | null;
}): { input: number; output: number } {
  return {
    input: estimateTokens(row.description),
    output: estimateTokens(row.result),
  };
}
