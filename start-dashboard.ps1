$dashboardPath = "C:\Users\INTEL INSIDE\.config\opencode\dashboard"

Write-Host "Starting Opencode Dashboard" -ForegroundColor Cyan
Write-Host "   Dashboard: http://localhost:3000" -ForegroundColor Green
Write-Host "   Data source: agent-data/agent.db" -ForegroundColor Gray
Write-Host "   Auto-refresh: every 5 seconds" -ForegroundColor Gray
Write-Host ""

Set-Location $dashboardPath
npm run dev
