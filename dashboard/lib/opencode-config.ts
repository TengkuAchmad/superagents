import fs from 'node:fs';
import path from 'node:path';

export interface AgentModelInfo {
  model: string;
  fallback_models: string[];
  description?: string;
}

interface CachedConfig {
  data: Record<string, AgentModelInfo>;
  mtimeMs: number;
  path: string;
}

let cache: CachedConfig | null = null;

function resolveConfigPath(): string | null {
  const candidates = [
    process.env.SUPERAGENTS_CONFIG,
    process.env.SUPERAGENTS_ROOT
      ? path.join(process.env.SUPERAGENTS_ROOT, 'oh-my-openagent.json')
      : null,
    path.join(process.cwd(), '..', 'oh-my-openagent.json'),
    path.join(process.cwd(), 'oh-my-openagent.json'),
  ].filter((p): p is string => !!p);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadFromDisk(filePath: string): Record<string, AgentModelInfo> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as {
    agents?: Record<string, {
      model?: string;
      fallback_models?: Array<{ model?: string } | string>;
      description?: string;
    }>;
  };
  const out: Record<string, AgentModelInfo> = {};
  for (const [key, agent] of Object.entries(parsed.agents ?? {})) {
    const fallbacks = (agent.fallback_models ?? [])
      .map(f => (typeof f === 'string' ? f : f.model))
      .filter((m): m is string => !!m);
    out[key.toLowerCase()] = {
      model: agent.model ?? '',
      fallback_models: fallbacks,
      description: agent.description,
    };
  }
  return out;
}

export function loadOpencodeAgentsConfig(): Record<string, AgentModelInfo> {
  const filePath = resolveConfigPath();
  if (!filePath) {
    if (cache) return cache.data;
    return {};
  }

  try {
    const stat = fs.statSync(filePath);
    if (cache && cache.path === filePath && cache.mtimeMs === stat.mtimeMs) {
      return cache.data;
    }
    const data = loadFromDisk(filePath);
    cache = { data, mtimeMs: stat.mtimeMs, path: filePath };
    return data;
  } catch {
    return cache?.data ?? {};
  }
}

/** Look up model info by either opencode_key (e.g. "atlas") or any variant the caller knows. */
export function getModelInfoForKey(opencodeKey: string | null | undefined): AgentModelInfo | null {
  if (!opencodeKey) return null;
  const cfg = loadOpencodeAgentsConfig();
  return cfg[opencodeKey.toLowerCase()] ?? null;
}
