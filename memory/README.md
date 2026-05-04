# Memory

Active runtime memory locations:

| Path | Purpose |
|------|---------|
| `agent-data/memory.jsonl` | Long-term memory (append-only JSONL) |
| `agent-data/vector-store/chroma.sqlite3` | Vector / semantic memory store |
| `dashboard/session-buffer.json` | Short-term session buffer (SQLite fallback) |
