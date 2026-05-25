/**
 * Single source of truth for agent identity across:
 *   - oh-my-openagent.json keys  (opencode_key)
 *   - SQLite agent_name values   (canonical_id — what agents MUST log)
 *   - Dashboard display          (label, role, icon, color)
 *
 * canonical_id  = role-based short name, lowercase-hyphen
 * variants      = every alias ever seen (old Cabinet names kept for DB backward compat)
 */

export interface AgentMeta {
  canonical_id: string;
  opencode_key: string;
  /** Optional override; defaults to capitalised opencode_key (e.g. "atlas" → "Atlas"). */
  named_identity?: string;
  label: string;
  role: string;
  icon: string;
  color: string;
  variants: string[];
  /** Skill access metadata */
  skills?: {
    claudeMemPrefix: string;
    universalAccess: boolean;
    availableSkillCount: number;
  };
}

export const AGENT_REGISTRY: AgentMeta[] = [
  {
    canonical_id: 'orchestrator',
    opencode_key: 'atlas',
    label: 'Orchestrator',
    role: 'Entry Point',
    icon: '🏛️',
    color: '#6366f1',
    variants: ['orchestrator', 'atlas', 'prabowo', 'prabowo-orchestrator'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'planner',
    opencode_key: 'prometheus',
    label: 'Planner',
    role: 'Task Decomposition',
    icon: '📋',
    color: '#8b5cf6',
    variants: ['planner', 'prometheus', 'gibran', 'gibran-task-planner'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'executor',
    opencode_key: 'sisyphus',
    label: 'Executor',
    role: 'Implementation',
    icon: '⚡',
    color: '#06b6d4',
    variants: ['executor', 'sisyphus', 'suharso', 'suharso-executor', 'task-logger-executor'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'task-runner',
    opencode_key: 'sisyphus-junior',
    label: 'Task Runner',
    role: 'Single-Step Ops',
    icon: '🔧',
    color: '#0ea5e9',
    variants: ['task-runner', 'sisyphus-junior', 'dudung', 'dudung-chief-of-staff'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'oracle',
    opencode_key: 'oracle',
    label: 'Oracle',
    role: 'Deep Reasoning',
    icon: '🧠',
    color: '#f59e0b',
    variants: ['oracle', 'mahfud', 'mahfud-oracle', 'mahfud-md'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'memory-keeper',
    opencode_key: 'metis',
    label: 'Memory Keeper',
    role: 'Institutional Memory',
    icon: '💾',
    color: '#10b981',
    variants: ['memory-keeper', 'metis', 'hasan', 'hasan-nasbi', 'hasan-nasbi-memory'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'chronicler',
    opencode_key: 'momus',
    label: 'Chronicler',
    role: 'Session Logger',
    icon: '📝',
    color: '#f43f5e',
    variants: ['chronicler', 'momus', 'andi', 'andi-arief', 'andi-arief-logger'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'librarian',
    opencode_key: 'librarian',
    label: 'Librarian',
    role: 'Docs & Files',
    icon: '📁',
    color: '#84cc16',
    variants: ['librarian', 'bakom', 'bakom-filesystem'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'explorer',
    opencode_key: 'explore',
    label: 'Explorer',
    role: 'Codebase Search',
    icon: '🔍',
    color: '#64748b',
    variants: ['explorer', 'explore', 'pattern-explorer'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'analyst',
    opencode_key: 'multimodal-looker',
    label: 'Analyst',
    role: 'Multimodal',
    icon: '🖼️',
    color: '#a78bfa',
    variants: ['analyst', 'multimodal-looker', 'looker', 'media-analyst'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
  {
    canonical_id: 'init',
    opencode_key: 'init-project',
    label: 'Init',
    role: 'Context Registrar',
    icon: '🚀',
    color: '#fb923c',
    variants: ['init', 'init-project'],
    skills: {
      claudeMemPrefix: '/claude-mem:',
      universalAccess: true,
      availableSkillCount: 15,
    },
  },
];

/** variant (any case) → canonical_id */
export const VARIANT_TO_ID: Record<string, string> = Object.fromEntries(
  AGENT_REGISTRY.flatMap((a) => a.variants.map((v) => [v.toLowerCase(), a.canonical_id]))
);

/** canonical_id → AgentMeta */
export const META_BY_ID: Record<string, AgentMeta> = Object.fromEntries(
  AGENT_REGISTRY.map((a) => [a.canonical_id, a])
);

/** opencode_key → canonical_id */
export const KEY_TO_ID: Record<string, string> = Object.fromEntries(
  AGENT_REGISTRY.map((a) => [a.opencode_key.toLowerCase(), a.canonical_id])
);

/** Normalize any variant → canonical_id */
export function normalizeAgent(raw: string): string {
  if (!raw) return 'unknown';
  const key = raw.toLowerCase().trim();
  return VARIANT_TO_ID[key] ?? key.split('-')[0] ?? key;
}

/** "atlas" → "Atlas", "sisyphus-junior" → "Sisyphus Junior" */
function titleize(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Named identity (e.g. "Atlas") for a registry entry, derived from opencode_key. */
export function namedIdentityOf(meta: AgentMeta): string {
  return meta.named_identity ?? titleize(meta.opencode_key);
}

export interface DisplayAgent {
  /** Big bold name shown to the user (e.g. "Atlas") */
  identity: string;
  /** Subtitle / role label (e.g. "Orchestrator") */
  role: string;
  /** Canonical id for lookups (e.g. "orchestrator") */
  canonical_id: string;
  /** opencode key for model lookup (e.g. "atlas") */
  opencode_key: string;
  icon: string;
  color: string;
  /** True if the agent could not be resolved against the registry */
  unknown: boolean;
}

/** Resolve any raw agent_name string to a display-ready bundle. */
export function displayAgent(raw: string | null | undefined): DisplayAgent {
  if (!raw) {
    return {
      identity: 'Unknown',
      role: 'Agent',
      canonical_id: 'unknown',
      opencode_key: '',
      icon: '🤖',
      color: '#64748b',
      unknown: true,
    };
  }
  const id = normalizeAgent(raw);
  const meta = META_BY_ID[id];
  if (!meta) {
    return {
      identity: titleize(raw),
      role: 'Agent',
      canonical_id: id,
      opencode_key: raw.toLowerCase(),
      icon: '🤖',
      color: '#64748b',
      unknown: true,
    };
  }
  return {
    identity: namedIdentityOf(meta),
    role: meta.label,
    canonical_id: meta.canonical_id,
    opencode_key: meta.opencode_key,
    icon: meta.icon,
    color: meta.color,
    unknown: false,
  };
}
