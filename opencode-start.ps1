# opencode-start.ps1
# Launches OpenCode TUI + Kabinet AI Monitor dashboard simultaneously.
# Saves as UTF-8 with BOM so PowerShell reads emoji correctly.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$dashboardPath = "C:\Users\INTEL INSIDE\.config\opencode\dashboard"
$nextCmd       = "$dashboardPath\node_modules\.bin\next.cmd"
$dashboardPort = 3000
$dashboardUrl  = "http://localhost:$dashboardPort"

# ── 1. Start dashboard production server in background ─────────────────────
Write-Host "Starting SuperAgents Monitor..." -ForegroundColor Cyan

$dashJob = Start-Process -FilePath $nextCmd `
  -ArgumentList "start" `
  -WorkingDirectory $dashboardPath `
  -WindowStyle Hidden `
  -PassThru

# ── 2. Wait until Next.js is ready (poll /api/agent-log) ─────────────────────
Write-Host "   Waiting for dashboard to be ready..." -ForegroundColor Gray
$ready = $false
$tries = 0
while (-not $ready -and $tries -lt 40) {
  Start-Sleep -Seconds 1
  $tries++
  try {
    $resp = Invoke-WebRequest -Uri "$dashboardUrl/api/agent-log" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { $ready = $true }
  } catch { }
}

# ── 3. Open browser ───────────────────────────────────────────────────────────
if ($ready) {
  Write-Host "   Dashboard ready: $dashboardUrl" -ForegroundColor Green
  Start-Process $dashboardUrl
} else {
  Write-Host "   Dashboard did not respond in 40s. Open manually: $dashboardUrl" -ForegroundColor Yellow
}

# ── 4. Launch OpenCode TUI (foreground) ──────────────────────────────────────
Write-Host ""
Write-Host "Launching OpenCode..." -ForegroundColor Cyan
opencode

# ── 5. Cleanup: kill dashboard when OpenCode exits ───────────────────────────
Write-Host ""
Write-Host "OpenCode exited. Stopping dashboard..." -ForegroundColor Gray
if ($dashJob -and -not $dashJob.HasExited) {
  Stop-Process -Id $dashJob.Id -Force -ErrorAction SilentlyContinue
}
$portProc = Get-NetTCPConnection -LocalPort $dashboardPort -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($portProc) {
  Stop-Process -Id $portProc -Force -ErrorAction SilentlyContinue
}
Write-Host "Done." -ForegroundColor Gray
