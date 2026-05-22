/**
 * skills-registry.ts  —  Universal claude-mem Skill & MCP Registry
 *
 * Single source of truth that:
 *   1. Lists ALL /claude-mem:* skills available to agents
 *   2. Provides a runtime check of whether a given agent can access a skill
 *   3. Auto-discovers new skills matching the /claude-mem:* prefix
 *   4. Fuels the dashboard agent-registry and any future permission system
 *
 * All agents in this system have UNIVERSAL access (no restrictions).
 * This file exists for documentation, discovery, and future permission refinement.
 *
 * @see ../docs/CLAUDE_MEM_UNIVERSAL_SKILLS.md for the human-readable reference.
 */

export interface SkillEntry {
  command: string;         // e.g. "/claude-mem:make-plan"
  name: string;            // e.g. "make-plan"
  category: 'core' | 'planning' | 'analysis' | 'code-review' | 'utility';
  description: string;
}

/** ALL registered /claude-mem:* skills — add new entries here when claude-mem adds skills */
export const CLAUDE_MEM_SKILLS: SkillEntry[] = [
  // Core
  { command: '/claude-mem:mem-search',         name: 'mem-search',         category: 'core',       description: 'Search persistent cross-session memory' },
  { command: '/claude-mem:how-it-works',       name: 'how-it-works',       category: 'core',       description: 'Understand claude-mem architecture' },

  // Planning & Execution
  { command: '/claude-mem:make-plan',          name: 'make-plan',          category: 'planning',   description: 'Create detailed phased implementation plans' },
  { command: '/claude-mem:do',                 name: 'do',                 category: 'planning',   description: 'Execute phased implementation plans' },

  // Analysis
  { command: '/claude-mem:design-is',          name: 'design-is',          category: 'analysis',   description: 'Audit design against Dieter Rams principles' },
  { command: '/claude-mem:pathfinder',         name: 'pathfinder',         category: 'analysis',   description: 'Map codebase flowcharts and unify architecture' },
  { command: '/claude-mem:oh-my-issues',       name: 'oh-my-issues',       category: 'analysis',   description: 'Cluster and triage GitHub issue backlogs' },
  { command: '/claude-mem:timeline-report',    name: 'timeline-report',    category: 'analysis',   description: 'Generate narrative project history reports' },
  { command: '/claude-mem:weekly-digests',     name: 'weekly-digests',     category: 'analysis',   description: 'Serial week-by-week narrative digests' },

  // Code & Review
  { command: '/claude-mem:learn-codebase',     name: 'learn-codebase',     category: 'code-review', description: 'Prime by reading full source tree' },
  { command: '/claude-mem:smart-explore',      name: 'smart-explore',      category: 'code-review', description: 'Token-optimized structural code search via tree-sitter AST' },
  { command: '/claude-mem:babysit',            name: 'babysit',            category: 'code-review', description: 'Monitor PRs until ready to merge' },
  { command: '/claude-mem:claude-code-plugin-release', name: 'claude-code-plugin-release', category: 'code-review', description: 'Automated semantic versioning + release workflow' },

  // Utility
  { command: '/claude-mem:knowledge-agent',    name: 'knowledge-agent',    category: 'utility',    description: 'Build and query AI knowledge bases from observations' },
  { command: '/claude-mem:wowerpoint',         name: 'wowerpoint',         category: 'utility',    description: 'Turn documents into slide-deck PDFs' },
];

/** The prefix that identifies claude-mem commands */
export const CLAUDE_MEM_PREFIX = '/claude-mem:';

/**
 * Check whether a given command is a recognized claude-mem skill.
 * All agents have universal access — this returns true for ALL /claude-mem:* commands.
 */
export function isClaudeMemSkill(command: string): boolean {
  return command.startsWith(CLAUDE_MEM_PREFIX);
}

/**
 * Get the SkillEntry for a command if it's a known claude-mem skill.
 */
export function getClaudeMemSkill(command: string): SkillEntry | undefined {
  return CLAUDE_MEM_SKILLS.find(s => s.command === command);
}

/**
 * Get all skills in a given category.
 */
export function getSkillsByCategory(category: SkillEntry['category']): SkillEntry[] {
  return CLAUDE_MEM_SKILLS.filter(s => s.category === category);
}

/**
 * Get the total count of registered claude-mem skills.
 */
export function getClaudeMemSkillCount(): number {
  return CLAUDE_MEM_SKILLS.length;
}

/**
 * Universal access check — currently returns true for ALL agents.
 * Designed for future permission refinement without changing consumption code.
 * @param _agentCanonicalId — ignored; all agents have universal access
 * @param command — skill command to check
 */
export function agentCanUseSkill(_agentCanonicalId: string, command: string): boolean {
  return isClaudeMemSkill(command);
}

export default {
  CLAUDE_MEM_SKILLS,
  CLAUDE_MEM_PREFIX,
  isClaudeMemSkill,
  getClaudeMemSkill,
  getSkillsByCategory,
  getClaudeMemSkillCount,
  agentCanUseSkill,
};
