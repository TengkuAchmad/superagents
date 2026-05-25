#!/usr/bin/env node
/**
 * Apply a model profile to oh-my-openagent.json — non-destructive.
 *
 * Preserves all agent prompts, descriptions, and categories. Only replaces
 * the `model` and `fallback_models` fields of every agent based on the
 * selected profile. Per-agent overrides win over the profile's `default`.
 *
 * Usage:
 *   node scripts/apply-profile.mjs <profile-name>
 *   OC_PROFILE=<profile-name> node scripts/apply-profile.mjs
 *
 * Profiles live in `model-profiles/<name>.json` (see model-profiles/README.md).
 *
 * Safe-by-default: writes a timestamped backup before each apply.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const CONFIG_PATH = join(REPO_ROOT, 'oh-my-openagent.json');
const PROFILES_DIR = join(REPO_ROOT, 'model-profiles');
const SPECS_DIR = join(REPO_ROOT, 'agents', 'agent');

// Map .md filename → JSON agent key. The .md filename is the canonical role
// (orchestrator.md), the JSON key is the opencode_key (atlas). Keep this list
// in sync with agent-registry.ts.
//
// New specialists (ui-designer, frontend-engineer, ...) don't have separate
// JSON entries — they use their own canonical id as both spec and JSON key.
// applyToAgent() will look up profile.overrides[<name>] first, fall back to
// profile.default.
const SPEC_TO_JSON_AGENT = {
  // Senior's original 10 (different JSON keys)
  'orchestrator':         'atlas',
  'planner':              'prometheus',
  'executor':             'sisyphus',
  'task-runner':          'sisyphus-junior',
  'oracle':               'oracle',
  'memory-keeper':        'metis',
  'chronicler':           'momus',
  'librarian':            'librarian',
  'analyst':              'multimodal-looker',
  'init-project':         'init-project',

  // New 9 specialists (spec name == JSON key, no aliasing needed)
  'ui-designer':          'ui-designer',
  'frontend-engineer':    'frontend-engineer',
  'backend-engineer':     'backend-engineer',
  'integration-engineer': 'integration-engineer',
  'security-engineer':    'security-engineer',
  'devops-engineer':      'devops-engineer',
  'data-engineer':        'data-engineer',
  'qa-engineer':          'qa-engineer',
  'performance-engineer': 'performance-engineer',
  'tech-writer':          'tech-writer',
};

const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};
const log = (m) => process.stdout.write(m + '\n');

function listProfiles() {
  const { readdirSync } = require('node:fs');
  try {
    return readdirSync(PROFILES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch { return []; }
}

const profileName = process.argv[2] ?? process.env.OC_PROFILE;
if (!profileName) {
  log(c.red('error: no profile specified'));
  log('');
  log('Usage:');
  log('  node scripts/apply-profile.mjs <profile-name>');
  log('  OC_PROFILE=<profile-name> node scripts/apply-profile.mjs');
  log('');
  log('Available profiles:');
  for (const p of listProfiles()) log(c.gray(`  - ${p}`));
  process.exit(1);
}

const profilePath = join(PROFILES_DIR, `${profileName}.json`);
if (!existsSync(profilePath)) {
  log(c.red(`error: profile "${profileName}" not found at ${profilePath}`));
  process.exit(1);
}
if (!existsSync(CONFIG_PATH)) {
  log(c.red(`error: ${CONFIG_PATH} missing`));
  process.exit(1);
}

const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

if (!profile.default?.model) {
  log(c.red(`error: profile "${profileName}" is missing "default.model"`));
  process.exit(1);
}

// Backup before write.
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${CONFIG_PATH}.bak-${ts}`;
copyFileSync(CONFIG_PATH, backupPath);

// Helper — only override the two fields we care about.
function applyToAgent(agentName, agentCfg) {
  const override = profile.overrides?.[agentName] ?? {};
  agentCfg.model = override.model ?? profile.default.model;
  // fallback_models: prefer override list, else profile default. We deep-copy
  // to avoid sharing references between agents.
  const fb = override.fallback_models ?? profile.default.fallback_models ?? [];
  agentCfg.fallback_models = fb.map((m) => ({ ...m }));
}

let count = 0;
for (const [name, cfg] of Object.entries(config.agents ?? {})) {
  applyToAgent(name, cfg);
  count++;
}

writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

log(c.cyan(`Applied profile "${profileName}" to ${count} agents in oh-my-openagent.json`));
log(c.gray(`  backup: ${backupPath}`));

// ── Also patch frontmatter `model:` in agents/agent/*.md ───────────────────
// Opencode TUI invokes agents from .md specs first; if the spec has a
// hardcoded `model:` field, that wins over the JSON config. Without this
// step, profile changes only affect delegated subagents, not the entry
// point (e.g. agent/Orchestrator stays on whatever the .md said).
let specCount = 0;
const specFiles = existsSync(SPECS_DIR)
  ? readdirSync(SPECS_DIR).filter((f) => f.endsWith('.md'))
  : [];

for (const file of specFiles) {
  const specName = file.replace(/\.md$/, '');
  const jsonAgentKey = SPEC_TO_JSON_AGENT[specName];
  if (!jsonAgentKey) continue; // skip AGENTS.md / LIFECYCLE_PROTOCOL.md / unknown

  // Model selection priority:
  //   1. profile.overrides[<specName>].model — explicit per-spec override
  //   2. config.agents[<jsonAgentKey>].model — JSON config (legacy agents)
  //   3. profile.default.model — fallback
  // New specialists (ui-designer, etc.) only live in spec files, so they
  // resolve via #1 or #3.
  const targetModel =
    profile.overrides?.[specName]?.model ??
    config.agents?.[jsonAgentKey]?.model ??
    profile.default.model;
  const specPath = join(SPECS_DIR, file);
  const content = readFileSync(specPath, 'utf8');

  if (!/^---\n/.test(content)) continue; // no frontmatter — skip

  let updated;
  if (/^model:\s*\S+/m.test(content)) {
    // Replace existing model line.
    updated = content.replace(/^model:\s*\S+.*$/m, `model: ${targetModel}`);
  } else {
    // Insert model line just before the closing `---` of the frontmatter.
    updated = content.replace(/^---\n([\s\S]*?)\n---/, (_m, fm) => `---\n${fm}\nmodel: ${targetModel}\n---`);
  }

  if (updated !== content) {
    writeFileSync(specPath, updated);
    specCount++;
  }
}
log(c.cyan(`Patched ${specCount} agent .md spec frontmatter(s)`));
log('');
log('Active models:');
for (const [name, cfg] of Object.entries(config.agents)) {
  log(c.gray(`  ${name.padEnd(20)} ${cfg.model}`));
}
log('');
log(c.yellow('Restart opencode (Ctrl-C in TUI, then `opencode` again) for changes to take effect.'));
