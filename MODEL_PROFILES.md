# Model Profile Cheatsheet

Profile-profile yang bisa Anda copy-paste ke `oh-my-openagent.json` saat ingin ganti strategi model untuk project tertentu.

---

## Profile 1: GOOGLE-FIRST (recommended untuk hemat token Claude)

Primary: Gemini 2.5 Flash (gratis, cepat, 1M context).
Fallback: Gemini lain → opencode free models.

```jsonc
"agents": {
  "atlas": {
    "model": "google/gemini-2.5-flash",
    "fallback_models": [
      { "model": "google/gemini-2.0-flash" },
      { "model": "google/gemini-1.5-flash" },
      { "model": "opencode/deepseek-v4-flash-free" },
      { "model": "opencode/nemotron-3-super-free" }
    ]
  }
  // ulang struktur yang sama untuk prometheus, sisyphus, oracle, dst.
}
```

**Free tier Gemini per project Google Cloud:**
- gemini-2.5-flash: ~10 RPM, ~250 RPD
- gemini-2.0-flash: ~15 RPM, ~1,500 RPD
- gemini-1.5-flash: ~15 RPM, ~1,500 RPD

Total: ~3,250 request/hari gratis sebelum jatuh ke opencode free models.

---

## Profile 2: BIG-TASK (kualitas tinggi, untuk task kompleks)

Primary: Claude Sonnet 4.6 untuk Oracle (keputusan arsitektur).
Lain pakai Gemini.

```jsonc
"oracle": {
  "model": "anthropic/claude-sonnet-4-6",
  "fallback_models": [
    { "model": "google/gemini-2.5-flash" },
    { "model": "google/gemini-2.0-flash" }
  ]
},
// agent lain (atlas, prometheus, sisyphus, dst.) pakai Profile 1
```

---

## Profile 3: ULTRA-HEMAT (full free, kualitas lebih rendah)

Primary: opencode free models. Tidak pakai Claude/Gemini sama sekali.

```jsonc
"model": "opencode/deepseek-v4-flash-free",
"fallback_models": [
  { "model": "opencode/nemotron-3-super-free" },
  { "model": "google/gemini-2.5-flash" }
]
```

---

## Cara apply: edit `oh-my-openagent.json` per project

Sayang banget kalau ganti default global cuma untuk satu project. Pilihan lebih bersih:

1. **Backup config asli:**
   ```bash
   cp ~/.config/opencode/oh-my-openagent.json ~/.config/opencode/oh-my-openagent.json.bak-$(date +%Y%m%d)
   ```

2. **Edit langsung** field `model` dan `fallback_models` di tiap agent (atlas, prometheus, sisyphus, sisyphus-junior, oracle, metis, momus, librarian, analyst, init-project).

3. **Restart opencode** (Ctrl-C, lalu `opencode` lagi) — config di-reload.

4. **Verify**: `opencode mcp list` lalu di TUI ketik task simpel, lihat output `model: google/gemini-...`

5. **Rollback kalau ada masalah:**
   ```bash
   cp ~/.config/opencode/oh-my-openagent.json.bak-* ~/.config/opencode/oh-my-openagent.json
   ```

---

## Pengamatan jujur

- Gemini 2.5 Flash **sangat bagus** untuk task coding biasa. Mengalahkan claude-haiku, hampir setara claude-sonnet untuk task < 50k token.
- Tapi **lebih lemah** dari Sonnet untuk task arsitektur kompleks atau reasoning panjang.
- Kalau project critical, biarkan **oracle** pakai Claude (Profile 2), agent lain pakai Gemini.
- Gemini punya 1M context — bisa lebih efektif untuk read-heavy task daripada Claude (200k context).
- Fallback chain auto-trigger saat rate-limit hit (429 error). Tidak perlu manual.
