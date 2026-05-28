# Cara Ganti Model Profile

Cheatsheet untuk switch antar model profile di setup opencode + multi-agent kami.

## Profile yang Tersedia

| Profile | Default Model | Source | Need API Key |
|---|---|---|---|
| `claude-max-team` | Claude Sonnet 4.6 + Opus 4.6 (overrides untuk Oracle, Security, Code-reviewer) + Haiku 4.5 (overrides untuk Tech-writer, Librarian, Task-runner) | Anthropic via Claude Max proxy (port 3456) | Claude Max subscription |
| `claude-max` | Claude Sonnet 4.6 untuk semua agent (no overrides) | Anthropic | Claude Max subscription |
| `copilot-only` | Claude Sonnet 4.5 + Haiku 4.5 + GPT-4.1 fallback | GitHub Copilot | Copilot subscription aktif |
| `google-first` | Gemini 2.5 Flash + Gemini 2.0/1.5 Flash fallback | Google AI Studio | `GEMINI_API_KEY` (free tier rate-limited) |
| `groq-free` | Llama 3.3 70B + Qwen 2.5 32B (coding) + DeepSeek R1 (reasoning) + Gemma2 9B (lightweight) | Groq | `GROQ_API_KEY` (free tier — 30 RPM, 500k token/day) |
| `ultra-hemat` | DeepSeek V4 Flash + Nemotron 3 Super fallback | opencode built-in provider | ❌ Tidak perlu (100% gratis) |

## Cara Ganti Profile

Jalankan dari terminal (di luar TUI opencode):

```bash
node /Users/masjayz/.config/opencode/scripts/apply-profile.mjs <profile-name>
```

Contoh:

```bash
# Quality tertinggi (perlu Claude Max sub)
node scripts/apply-profile.mjs claude-max-team

# Free tier paling capable
node scripts/apply-profile.mjs groq-free

# Pakai Gemini
node scripts/apply-profile.mjs google-first

# 100% gratis tanpa API key
node scripts/apply-profile.mjs ultra-hemat

# Pakai Copilot subscription
node scripts/apply-profile.mjs copilot-only
```

**WAJIB:** Setelah apply, restart TUI (`exit` di TUI, lalu `opencode` lagi) supaya model baru ter-load.

## Cara Cek Profile yang Aktif

Cek model frontmatter di salah satu agent spec:

```bash
grep "^model:" /Users/masjayz/.config/opencode/agents/agent/orchestrator.md
```

Atau di TUI session baru, tanya Atlas:

```
What model are you currently using? Respond JSON only:
{model: "...", provider: "..."}.
Don't call any tool.
```

## Rekomendasi Pemilihan

| Situasi | Pakai |
|---|---|
| Quality maksimal, ada Claude Max | `claude-max-team` |
| Punya Copilot subscription | `copilot-only` (worth it — sudah bayar) |
| Free + capable + speed cepat | `groq-free` |
| Free + butuh multimodal (image input) | `google-first` |
| Free + tidak ingin setup API key | `ultra-hemat` |
| Task simple (rename, format kecil) | `ultra-hemat` (hemat resource) |
| Task kompleks (Three.js, arsitektur, audit) | `claude-max-team` atau `groq-free` |

## Detail Model Assignment per Profile

### claude-max-team

```
Default:                       claude-sonnet-4-6
Oracle:                        claude-opus-4-6
Security-engineer:             claude-opus-4-6
Code-reviewer:                 claude-opus-4-6
Tech-writer, Librarian,
Task-runner, Sisyphus-junior:  claude-haiku-4.5
```

### groq-free

```
Default:                       llama-3.3-70b-versatile
Frontend-engineer,
Backend-engineer, Executor:    qwen-2.5-32b      (coding specialist)
Oracle, Planner,
Code-reviewer, Security:       deepseek-r1-distill-llama-70b  (reasoning)
Tech-writer, Librarian,
Task-runner:                   gemma2-9b-it      (lightweight)
```

### google-first

```
Default:                       gemini-2.5-flash
Oracle:                        gemini-2.5-flash  (no demotion for arch decisions)
Sisyphus-junior:               gemini-1.5-flash
Fallback chain:                2.5 → 2.0 → 1.5 → deepseek free → nemotron free
```

### ultra-hemat

```
Default:                       opencode/deepseek-v4-flash-free
Fallback:                      opencode/nemotron-3-super-free
No per-agent overrides
```

## Buat Profile Custom Sendiri

Bikin file baru di `model-profiles/<nama>.json`. Struktur:

```json
{
  "$schema": "Deskripsi profile ini",
  "default": {
    "model": "provider/model-id",
    "fallback_models": [
      { "model": "provider/fallback-1" },
      { "model": "provider/fallback-2" }
    ]
  },
  "overrides": {
    "frontend-engineer": {
      "model": "provider/coding-specialist",
      "_note": "alasan kenapa pakai model ini"
    },
    "oracle": {
      "model": "provider/reasoning-model",
      "_note": "alasan"
    }
  }
}
```

Override key pakai **nama spec** (file basename di `agents/agent/`):

`orchestrator`, `oracle`, `planner`, `frontend-engineer`, `backend-engineer`, `qa-engineer`, `security-engineer`, `tech-writer`, `librarian`, `executor`, `task-runner`, `code-reviewer`, `business-analyst`, `ui-designer`, `chronicler`, `analyst`, `memory-keeper`, `data-engineer`, `devops-engineer`, `performance-engineer`, `integration-engineer`, `sre`, `init-project`

Lalu apply:

```bash
node scripts/apply-profile.mjs <nama>
```

## Model Provider yang Sudah Dikonfigurasi

| Provider | Prefix | Auth Method |
|---|---|---|
| Anthropic (via Claude Max proxy) | `anthropic/*` | localhost:3456 proxy, perlu Claude Max |
| Google AI Studio | `google/*` | `GEMINI_API_KEY` env var |
| Groq | `groq/*` | `GROQ_API_KEY` env var |
| GitHub Copilot | `github-copilot/*` | Copilot CLI auth (`gh auth`) |
| opencode built-in | `opencode/*` | Tidak perlu key (free models) |

Provider lain bisa di-add ke `opencode.json` `provider` block kalau perlu:

- OpenAI (`openai/*`) — perlu `OPENAI_API_KEY`
- OpenRouter (`openrouter/*`) — perlu `OPENROUTER_API_KEY`
- Mistral, Cohere, Together AI, Anthropic direct API — dst.

## Setup API Key

Tambahkan ke `~/.zshrc` (bukan di file project supaya tidak ke-commit):

```bash
# Groq (free tier capable)
export GROQ_API_KEY="gsk_..."

# Google AI Studio
export GEMINI_API_KEY="..."

# OpenAI (opsional)
# export OPENAI_API_KEY="sk-..."
```

Setelah edit `.zshrc`, run `source ~/.zshrc` atau buka terminal baru supaya env var ter-load.

## Cara Dapat API Key Gratis

| Provider | Sign Up | Free Tier |
|---|---|---|
| Groq | https://console.groq.com/keys | 30 RPM, 500k token/day, multiple models |
| Google AI Studio | https://aistudio.google.com/apikey | Rate-limited, share quota dengan Gemini |
| GitHub Copilot | https://github.com/features/copilot | Trial 30 hari, lalu berbayar |

## Troubleshooting

**Profile sudah di-apply tapi model belum berubah:**
- Restart TUI (`exit` → `opencode` lagi)
- Cek `grep "^model:" agents/agent/orchestrator.md`

**Error "API key not set":**
- Cek env var: `echo $GROQ_API_KEY` (atau key lain)
- Restart shell setelah edit `.zshrc`

**Error rate-limit (Groq / Gemini):**
- Tunggu 1 menit, retry
- Atau switch ke profile lain sementara
- Cek dashboard quota provider

**Model fallback chain tidak jalan:**
- Pastikan fallback model juga punya provider yang sudah configured
- Cek log opencode: `tail -50 ~/.local/share/opencode/log/$(ls -t ~/.local/share/opencode/log/ | head -1)`

## File Penting

| File | Fungsi |
|---|---|
| `model-profiles/*.json` | Definisi profile |
| `scripts/apply-profile.mjs` | Script yang patch model frontmatter ke 23 spec |
| `agents/agent/<name>.md` | Spec masing-masing agent (frontmatter `model:` di-update oleh script) |
| `opencode.json` | Provider config + plugin + MCP |
| `oh-my-openagent.json` | Legacy plugin config (masih di-update script untuk backward compat, tapi plugin sudah tidak di-load) |
