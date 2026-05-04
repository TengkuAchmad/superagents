# MCP Troubleshooting Guide
## Indonesian Cabinet AI Agent System

### Symptoms: "vector-memory Operation timed out after 30000ms"

**Cause**: ChromaDB MCP server takes longer than 30s to initialize, especially on first run.

**Solutions:**

#### 1. Pre-warm ChromaDB (Recommended)
Before starting OpenCode, manually start the ChromaDB server:
```powershell
uvx chroma-mcp --client-type persistent --data-dir "C:\Users\INTEL INSIDE\.config\opencode\agent-data\vector-store"
```
Wait for "Server ready" message, then start OpenCode in a new terminal. The MCP will connect instantly.

#### 2. Disable vector-memory temporarily
Edit `opencode.json`:
```json
"vector-memory": {
  "enabled": false
}
```
Semantic memory search won't work, but all other features remain functional.

#### 3. Use ephemeral mode (faster startup)
Edit `opencode.json`, change ChromaDB to ephemeral:
```json
"vector-memory": {
  "command": ["uvx", "chroma-mcp", "--client-type", "ephemeral"]
}
```
⚠️ Memory won't persist between sessions.

---

### Check MCP Status
```powershell
opencode mcp list
```
Look for "Connected" status. If any show "Operation timed out", restart OpenCode.

---

### Agent Auto-Retry Behavior

All agents now automatically retry MCP operations with exponential backoff:
- Attempt 1: immediate
- Attempt 2: +2s delay
- Attempt 3: +5s delay  
- Attempt 4: +10s delay

**If all retries fail**, agents degrade gracefully:
- **Memory tools** → continue without context, warn user
- **SQLite logging** → buffer logs in `session-buffer.json`
- **Filesystem** → halt and report error
- **Sequential-thinking** → fall back to native reasoning

You'll see warnings like:
```
⚠️ Note: vector-memory temporarily unavailable. Proceeding without semantic search.
```

This ensures the system never crashes due to MCP timeouts.

---

### Manual Recovery

If MCPs remain stuck:
1. Close OpenCode
2. Kill orphaned MCP processes:
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -match "mcp|chroma|npx"} | Stop-Process -Force
   ```
3. Restart OpenCode

---

### Persistent Issues?

Check MCP server logs:
```powershell
opencode --log-level DEBUG
```
Look for connection errors in the output.
