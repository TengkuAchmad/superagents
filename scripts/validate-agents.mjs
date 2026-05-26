#!/usr/bin/env node
/**
 * Validate that every `agents/agent/*.md` spec has the metadata it needs
 * across the dashboard + tooling, so the dashboard doesn't render new
 * agents as "Unknown" and `npm run profile` correctly patches their
 * frontmatter.
 *
 * Checks 5 sync points per agent:
 *   1. dashboard/lib/agent-registry.ts        — AGENT_REGISTRY canonical_id entry
 *   2. dashboard/app/page.tsx                 — AGENT_ICON_MAP key
 *   3. dashboard/app/page.tsx                 — AGENT_METADATA key
 *   4. dashboard/app/api/agent-graph/route.ts — ROLE_CANON canonical key (for "→ <agent>" parsing)
 *   5. scripts/apply-profile.mjs              — SPEC_TO_JSON_AGENT key (for profile apply)
 *
 * Usage:
 *   node scripts/validate-agents.mjs           # report only
 *   node scripts/validate-agents.mjs --strict  # exit 1 on any missing entry
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const SPECS_DIR = join(REPO_ROOT, 'agents', 'agent');

const FILES = {
  registry: join(REPO_ROOT, 'dashboard', 'lib', 'agent-registry.ts'),
  page:     join(REPO_ROOT, 'dashboard', 'app', 'page.tsx'),
  route:    join(REPO_ROOT, 'dashboard', 'app', 'api', 'agent-graph', 'route.ts'),
  apply:    join(REPO_ROOT, 'scripts', 'apply-profile.mjs'),
};

const SKIP_SPEC = new Set([
  'AGENTS.md',
  'LIFECYCLE_PROTOCOL.md',
  'MEMORY_TAGS.md',
]);

/** Spec filename → canonical_id alias (when they differ).
 *  Most agents have spec name == canonical_id. The exceptions are listed here
 *  to keep validation honest without polluting the data files with redundant
 *  aliases. */
const SPEC_TO_CANONICAL_ALIAS = {
  'init-project': 'init',
};
function canonicalFor(specName) {
  return SPEC_TO_CANONICAL_ALIAS[specName] ?? specName;
}
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  gray:  (s) => `\x1b[90m${s}\x1b[0m`,
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Load files ────────────────────────────────────────────────────────────
function readSafe(path) {
  try { return readFileSync(path, 'utf8'); }
  catch { return ''; }
}
const sources = {
  registry: readSafe(FILES.registry),
  page:     readSafe(FILES.page),
  route:    readSafe(FILES.route),
  apply:    readSafe(FILES.apply),
};

// ── Specs to validate ─────────────────────────────────────────────────────
const specs = readdirSync(SPECS_DIR)
  .filter((f) => f.endsWith('.md') && !SKIP_SPEC.has(f))
  // workflows/ directory is recursed by readdirSync if encountered, but it's
  // a subdir not a file so the extension filter excludes it anyway.
  .map((f) => f.replace(/\.md$/, ''));

// ── Check helpers ─────────────────────────────────────────────────────────
function inRegistry(specName) {
  const cn = canonicalFor(specName);
  return new RegExp(`canonical_id:\\s*['"]${escape(cn)}['"]`).test(sources.registry);
}
function inIconMap(specName) {
  const cn = canonicalFor(specName);
  const block = extractBlock(sources.page, 'AGENT_ICON_MAP');
  return block ? new RegExp(`(?:^|[\\s{,])(?:['"]?${escape(cn)}['"]?)\\s*:\\s*\\w`, 'm').test(block) : false;
}
function inMetadata(specName) {
  const cn = canonicalFor(specName);
  const block = extractBlock(sources.page, 'AGENT_METADATA');
  return block ? new RegExp(`(?:^|[\\s{,])(?:['"]?${escape(cn)}['"]?)\\s*:\\s*\\{`, 'm').test(block) : false;
}
function inRoleCanon(specName) {
  // ROLE_CANON uses spec name as key (e.g. 'init-project': 'init').
  const block = extractBlock(sources.route, 'ROLE_CANON');
  return block ? new RegExp(`(?:^|[\\s{,])(?:['"]?${escape(specName)}['"]?)\\s*:\\s*['"]`, 'm').test(block) : false;
}
function inApplyMap(specName) {
  // apply-profile SPEC_TO_JSON_AGENT uses spec name as key.
  const block = extractBlock(sources.apply, 'SPEC_TO_JSON_AGENT');
  return block ? new RegExp(`(?:^|[\\s{,])(?:['"]?${escape(specName)}['"]?)\\s*:\\s*['"]`, 'm').test(block) : false;
}

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Extract the {...} body that follows `<identifierName>` in a TS/JS source. */
function extractBlock(source, identifier) {
  const re = new RegExp(`${identifier}\\s*(?::[^=]*)?=\\s*\\{`);
  const m = source.match(re);
  if (!m || m.index === undefined) return null;
  let depth = 0;
  const start = m.index + m[0].length - 1; // points at the opening `{`
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

// ── Report ────────────────────────────────────────────────────────────────
const COLUMNS = [
  { label: 'registry', check: inRegistry },
  { label: 'iconmap',  check: inIconMap  },
  { label: 'metadata', check: inMetadata },
  { label: 'rolecanon',check: inRoleCanon },
  { label: 'applymap', check: inApplyMap  },
];

const NAME_W = Math.max(...specs.map((n) => n.length), 12);
const COL_W = 10;

console.log(c.cyan(c.bold('Agent sync validation')));
console.log(c.gray(`  scanning ${specs.length} agent spec(s) across ${COLUMNS.length} sync points`));
console.log('');

// Header
let header = 'agent'.padEnd(NAME_W) + '   ';
for (const col of COLUMNS) header += col.label.padEnd(COL_W);
console.log(c.bold(header));
console.log(c.gray('─'.repeat(NAME_W + 3 + COLUMNS.length * COL_W)));

let missing = 0;
let perAgentMissing = 0;
for (const name of specs) {
  let row = name.padEnd(NAME_W) + '   ';
  let agentMissing = 0;
  for (const col of COLUMNS) {
    const ok = col.check(name);
    if (!ok) { missing++; agentMissing++; }
    row += (ok ? c.green('✓') : c.red('✗')).padEnd(COL_W + 9);
  }
  if (agentMissing > 0) perAgentMissing++;
  console.log(row);
}

console.log(c.gray('─'.repeat(NAME_W + 3 + COLUMNS.length * COL_W)));

if (missing === 0) {
  console.log(c.green(`✓ All ${specs.length} agent(s) fully synced.`));
  process.exit(0);
} else {
  console.log(c.red(`✗ ${missing} missing entries across ${perAgentMissing}/${specs.length} agent(s).`));
  console.log('');
  console.log(c.gray('Fix locations:'));
  console.log(c.gray(`  registry  → ${FILES.registry}`));
  console.log(c.gray(`  iconmap   → ${FILES.page} (AGENT_ICON_MAP)`));
  console.log(c.gray(`  metadata  → ${FILES.page} (AGENT_METADATA)`));
  console.log(c.gray(`  rolecanon → ${FILES.route} (ROLE_CANON)`));
  console.log(c.gray(`  applymap  → ${FILES.apply} (SPEC_TO_JSON_AGENT)`));
  process.exit(process.argv.includes('--strict') ? 1 : 0);
}
