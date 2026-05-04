# API Layer — Indonesian Cabinet AI System
#
# OpenCode exposes all agents via HTTP using `opencode serve`.
# This provides an ACP-compatible API for external integrations.
#
# Endpoints (after running start-api.ps1):
#   POST http://localhost:4321/api/session     — create new session
#   POST http://localhost:4321/api/message     — send message to agent
#   GET  http://localhost:4321/api/session/:id — get session state
#
# Agent routing via HTTP:
#   { "agent": "prabowo-orchestrator", "message": "your request" }
#
# All agents are accessible. Prabowo is the recommended entry point.

# HOW TO START THE API:
#   powershell -ExecutionPolicy Bypass -File start-api.ps1
#
# HOW TO CALL IT (PowerShell):
#   $body = @{ message = "Build a weather app" } | ConvertTo-Json
#   Invoke-RestMethod -Uri "http://localhost:4321/api/message" -Method POST -Body $body -ContentType "application/json"

Write-Host "Starting Indonesian Cabinet AI Agent API..." -ForegroundColor Green
Write-Host "Entry point: prabowo-orchestrator (primary)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Available agents:" -ForegroundColor Yellow
Write-Host "  prabowo-orchestrator  — Presidential Orchestrator (main entry)"
Write-Host "  gibran-task-planner   — Multi-step planner"
Write-Host "  suharso-executor      — Step-by-step executor"
Write-Host "  dudung-chief-of-staff — Tool coordinator"
Write-Host "  mahfud-oracle         — Strategic reasoning"
Write-Host "  hasan-nasbi-memory    — Memory manager"
Write-Host "  bakom-filesystem      — File handler"
Write-Host "  andi-arief-logger     — Database logger"
Write-Host "  sri-mulyani-buffer    — Session buffer"
Write-Host ""
Write-Host "API will be available at: http://localhost:4321" -ForegroundColor Green
Write-Host ""

# Start OpenCode in server mode
# Use --agent flag to set default agent, override per-request via API body
opencode serve --port 4321 --agent prabowo-orchestrator
