# Setup Ringkas — Replikasi Multi-Agent System Ini

Panduan untuk reproduce setup di mesin lain (developer baru / senior review).

> **Catatan**: README.md masih reference `oh-my-openagent` plugin di beberapa tempat — itu **outdated**. Setup terbaru di file ini.

## Prerequisites

- macOS atau Linux (Windows belum di-test setelah migrasi)
- Node.js 20+ + npm
- `uvx` (Python tool): `pip install uv` lalu `uv --version`
- opencode CLI 1.15+: `npm i -g opencode-ai`
- git + akses ke repo ini (`TengkuAchmad/superagents`)

## Step 1 — Clone & Place

Repo ini di-clone ke `~/.config/opencode/`:

```bash
cd ~/.config
git clone https://github.com/TengkuAchmad/superagents.git opencode
cd opencode
git checkout feat/dashboard-task-centric
```

## Step 2 — Set API Keys (sesuai profile yang akan dipakai)

Edit `~/.zshrc` (atau `~/.bashrc`):

```bash
# WAJIB kalau pakai groq-free
export GROQ_API_KEY="gsk_..."        # dapat dari https://console.groq.com/keys

# WAJIB kalau pakai google-first
export GEMINI_API_KEY="..."          # dapat dari https://aistudio.google.com/apikey

# WAJIB kalau pakai context7 MCP dengan rate limit lebih tinggi
export CONTEXT7_API_KEY="ctx7sk-..." # dapat dari https://context7.com/dashboard

# claude-max-team & copilot-only tidak perlu API key di sini —
# yang penting Claude Max subscription / Copilot subscription aktif
# (auth via login terpisah)
```

Lalu reload: `source ~/.zshrc`

## Step 3 — Pilih & Apply Model Profile

Lihat profile yang tersedia di `model-profiles/`:

```
claude-max-team.json   ← punya Claude Max (kualitas tertinggi)
claude-max.json        ← Claude Max sederhana
copilot-only.json      ← punya Copilot subscription
google-first.json      ← Gemini free tier
groq-free.json         ← Groq free tier (RECOMMENDED untuk free)
ultra-hemat.json       ← 100% gratis tanpa API key
```

Apply:

```bash
node scripts/apply-profile.mjs groq-free   # atau profile lain
```

Verifikasi:

```bash
grep "^model:" agents/agent/orchestrator.md
```

Detail tiap profile + cara buat profile custom → baca `CARA_GANTI_MODEL.md`.

## Step 4 — Start opencode TUI

Dari folder ini:

```bash
opencode
```

Atau pakai launcher cross-OS:

```bash
./opencode-start.sh        # macOS / Linux
./opencode-start.ps1       # Windows PowerShell
```

## Step 5 — Test Real Delegation

Di TUI, pilih agent `Orchestrator`, paste prompt test:

```
Test real delegation. Call mcp__oc__task ONCE with:
  subagent_type="agent/business-analyst"
  description="Test BA"
  prompt="Tulis satu kalimat tentang aplikasi catat air galon."
After it returns, log_action complete with the result.
```

**Yang harus terjadi:**
- Tool `mcp__oc__task` ter-invoke real (bukan role-play)
- Muncul child session label `Agent/Business-Analyst Task`
- Sebuah kalimat balasan dari sub-agent
- Bisa lihat child session via `Ctrl+X` lalu `Down`

**Verifikasi di DB:**

```bash
sqlite3 ~/.local/share/opencode/opencode.db \
  "SELECT agent, substr(title,1,50) FROM session
   WHERE parent_id IS NOT NULL
   AND time_created > strftime('%s','now')*1000 - 300000
   ORDER BY time_created DESC LIMIT 5;"
```

Harus muncul row dengan `agent='agent/business-analyst'` dan parent_id non-null.

## Step 6 — Optional: Start Dashboard

Untuk monitor multi-agent secara visual:

```bash
cd dashboard
npm install
npm run dev
```

Buka `http://localhost:3000` di browser.

## File Penting yang Perlu Diketahui

| File | Fungsi |
|---|---|
| `opencode.json` | Provider + plugin + MCP config |
| `tui.json` | Keybindings (`ctrl+x down` untuk lihat sub-agent) |
| `agents/agent/<name>.md` | 23 spec agent — orchestrator + 22 specialist |
| `agents/agent/workflows/*.md` | 6 workflow template (build, refactor, fix-bug, dll) |
| `model-profiles/*.json` | Profile model |
| `scripts/apply-profile.mjs` | Script switch profile |
| `scripts/validate-agents.mjs` | Validator 5-point sync check |
| `scripts/activity-logger-mcp.mjs` | MCP server untuk dashboard logging |
| `CARA_GANTI_MODEL.md` | Cheatsheet ganti profile lengkap |

## Plugin & MCP yang Sudah Konfigurasi

**Plugins (5):**
- `opencode-with-claude` — proxy Claude Max
- `claude-mem` — cross-session memory + 16 skills
- `agent-memory` — per-agent memory
- `background-agents` — background task execution
- `dynamic-context-pruning` — auto context optimization

**MCPs (7):**
- `shadcn` — UI component registry
- `activity-logger` — dashboard logging
- `sequential-thinking` — multi-step reasoning
- `sqlite` — direct query agent.db
- `filesystem` — sandboxed file ops di `~/.config/opencode` + `~/projects`
- `context7` — library docs terbaru (React, Three.js, dll)
- `playwright` — browser automation untuk QA

**Skills (di `~/.agents/skills/`):**
- `frontend-design` (Anthropic) — design hierarchy + a11y
- `senior-frontend` (alirezarezvani) — React/Next.js senior patterns
- `vercel-react-best-practices` — Vercel guidance
- `gemini-api-dev` — Gemini SDK guide
- `context7-mcp` — Context7 usage guide
- Plus bonus skills dari ctx7

## Cara Delegate Sub-Agent (Penting!)

Orchestrator (Atlas) panggil sub-agent via tool `mcp__oc__task` dengan parameter:

```
subagent_type: "agent/<nama-spec>"   ← WAJIB ada prefix "agent/"
description:   "Label singkat"
prompt:        "Brief lengkap untuk sub-agent (self-contained, tidak akses ke history Atlas)"
```

23 nama valid: `agent/orchestrator`, `agent/business-analyst`, `agent/planner`, `agent/oracle`, `agent/ui-designer`, `agent/backend-engineer`, `agent/frontend-engineer`, `agent/qa-engineer`, `agent/security-engineer`, `agent/tech-writer`, `agent/code-reviewer`, `agent/librarian`, `agent/executor`, `agent/task-runner`, `agent/integration-engineer`, `agent/data-engineer`, `agent/devops-engineer`, `agent/performance-engineer`, `agent/sre`, `agent/memory-keeper`, `agent/chronicler`, `agent/analyst`, `agent/init-project`

**Penting:** Tanpa prefix `agent/`, runtime return "Unknown agent type". Built-in opencode types (`general`, `build`, `plan`, `explore`) tidak pakai prefix.

## Sejarah Keputusan Penting

**Kenapa tidak pakai `oh-my-openagent` plugin lagi?**

Plugin tersebut override native `task` tool dengan `call_omo_agent` yang ber-enum hardcoded `["explore", "librarian"]`. Akibatnya 21 dari 23 custom agent tidak invocable. Setelah dihapus, native `task` tool kembali → semua 23 agent bisa di-delegate.

Detail: lihat commit `2a311f5` dan branch history.

## Troubleshooting

**"Unknown agent type: agent/X":**
- Pastikan file `agents/agent/X.md` ada
- Pastikan frontmatter punya `mode: subagent` (atau `primary` untuk orchestrator)
- Restart TUI

**"No task tool":**
- Pastikan `oh-my-openagent` TIDAK ada di plugin array `opencode.json`
- Restart TUI

**Rate limit error (Groq / Gemini):**
- Tunggu 1 menit
- Atau switch profile sementara: `node scripts/apply-profile.mjs ultra-hemat`

**Sub-agent claim "done" tapi file tidak ke-create:**
- Indikator model lemah (DeepSeek free / Gemma 9B) untuk task complex
- Upgrade ke `groq-free` atau `claude-max-team`

**Dashboard tidak muncul agent baru:**
- Run `node scripts/validate-agents.mjs` — harus `✓ All 23 agent(s) fully synced`
- Restart `dashboard/` Next.js dev server

## Kontak / Issue

Repo: https://github.com/TengkuAchmad/superagents
Branch aktif: `feat/dashboard-task-centric`
