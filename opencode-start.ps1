# opencode-start.ps1
# Launches OpenCode TUI + AI Monitor dashboard simultaneously.
# Saves as UTF-8 with BOM so PowerShell reads emoji correctly.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$dashboardPath  = "C:\Users\INTEL INSIDE\.config\opencode\dashboard"
$claudeMemPath  = "C:\Users\INTEL INSIDE\.claude\plugins\marketplaces\thedotmack\plugin\scripts"
$nextCmd        = "$dashboardPath\node_modules\.bin\next.cmd"
$dashboardPort  = 3000
$dashboardUrl   = "http://localhost:$dashboardPort"
$claudeMemPort  = 37777
$claudeMemUrl   = "http://localhost:$claudeMemPort"

# ── 0. Start Claude Memory worker in background ────────────────────────────
Write-Host "Starting Claude Memory..." -ForegroundColor Cyan
$workerJob = Start-Process -FilePath "bun" `
  -ArgumentList "worker-service.cjs" `
  -WorkingDirectory $claudeMemPath `
  -WindowStyle Hidden `
  -PassThru

# ── 0b. Start service-worker in background ─────────────────────────────────
Write-Host "Starting Service Worker..." -ForegroundColor Cyan
$serviceWorkerJob = Start-Process -FilePath "bun" `
  -ArgumentList "worker-service.cjs" `
  -WorkingDirectory $claudeMemPath `
  -WindowStyle Hidden `
  -PassThru

# ── 0c. Launch Claude Memory dashboard ────────────────────────────────────
Write-Host "   Launching Claude Memory: $claudeMemUrl" -ForegroundColor Green
Start-Process $claudeMemUrl

# ── 1. Start SuperAgents Monitor in background ─────────────────────────────
Write-Host "Starting SuperAgents Monitor..." -ForegroundColor Cyan
$dashJob = Start-Process -FilePath $nextCmd `
  -ArgumentList "start" `
  -WorkingDirectory $dashboardPath `
  -WindowStyle Hidden `
  -PassThru

# ── 2. Wait until Next.js is ready (poll /api/agent-log) ──────────────────
Write-Host "   Waiting for dashboard to be ready..." -ForegroundColor Gray
$ready = $false
$tries = 0
while (-not $ready -and $tries -lt 40) {
  Start-Sleep -Seconds 1
  $tries++
  try {
    $resp = Invoke-WebRequest -Uri "$dashboardUrl" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { $ready = $true }
  } catch { }
}

# ── 3. Open browser ────────────────────────────────────────────────────────
if ($ready) {
  Write-Host "   Dashboard SuperAgents ready: $dashboardUrl" -ForegroundColor Green
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
if ($workerJob -and -not $workerJob.HasExited) {
  Stop-Process -Id $workerJob.Id -Force -ErrorAction SilentlyContinue
}
if ($serviceWorkerJob -and -not $serviceWorkerJob.HasExited) {
  Stop-Process -Id $serviceWorkerJob.Id -Force -ErrorAction SilentlyContinue
}
$portProc = Get-NetTCPConnection -LocalPort $dashboardPort -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($portProc) {
  Stop-Process -Id $portProc -Force -ErrorAction SilentlyContinue
}
Write-Host "Done." -ForegroundColor Gray
