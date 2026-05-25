# Model Profiles

Each developer picks ONE profile via env var — no manual file editing required.

```bash
# Sekali set, semua agent ngikut
export OC_PROFILE=google-first
npm start
```

| Profile | Untuk siapa | Butuh |
|---|---|---|
| `claude-max` | Tim dengan Claude Max + Copilot subscription | Login Claude + Copilot |
| `google-first` | Tim hemat / hobby / starter | `GEMINI_API_KEY` env |
| `copilot-only` | Tim dengan Copilot saja | Login Copilot |
| `ultra-hemat` | Belajar tanpa subscription apa-apa | Nothing |

## Struktur tiap profile

```jsonc
{
  "default": {
    "model": "...",
    "fallback_models": [{ "model": "..." }, ...]
  },
  "overrides": {
    "<agent-name>": {
      "model": "..."          // optional, falls back to default
    }
  }
}
```

`default` apply ke semua 10 agent. `overrides` per-agent jadi Anda bisa fine-tune (mis. oracle pakai model lebih kuat, task-runner pakai yang lebih cepat).

## Cara apply

`scripts/apply-profile.mjs <profile-name>` dipanggil otomatis oleh `npm start` via env `OC_PROFILE`. Atau manual:

```bash
node scripts/apply-profile.mjs google-first
```

Skrip akan:
1. Baca `oh-my-openagent.json` (preserve prompt + descriptions)
2. Replace `model` + `fallback_models` setiap agent sesuai profile
3. Write kembali

## Tambah profile baru

1. Bikin `model-profiles/<my-profile>.json` (copy struktur dari profile lain)
2. `OC_PROFILE=my-profile npm start`
3. Done

## Rollback

Backup otomatis dibuat di `oh-my-openagent.json.bak-<timestamp>` setiap apply. Restore:

```bash
ls -lt oh-my-openagent.json.bak-* | head -1   # cari yang terbaru
cp oh-my-openagent.json.bak-XXXX oh-my-openagent.json
```
