#!/usr/bin/env bash
# opencode-start.sh — macOS launcher for OpenCode TUI + dashboard.
# Equivalent to opencode-start.ps1.

set -u

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DASHBOARD_PATH="$SCRIPT_DIR/dashboard"
DASHBOARD_PORT=3000
DASHBOARD_URL="http://localhost:$DASHBOARD_PORT"

C_CYAN=$'\033[36m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_GRAY=$'\033[90m'
C_RESET=$'\033[0m'

DASH_PID=""

cleanup() {
  echo ""
  echo "${C_GRAY}Stopping dashboard...${C_RESET}"
  if [ -n "$DASH_PID" ] && kill -0 "$DASH_PID" 2>/dev/null; then
    kill "$DASH_PID" 2>/dev/null
    sleep 1
    kill -9 "$DASH_PID" 2>/dev/null
  fi
  # Belt and suspenders: kill anything left on dashboard port
  local pid
  pid=$(lsof -ti tcp:$DASHBOARD_PORT 2>/dev/null || true)
  if [ -n "$pid" ]; then kill -9 $pid 2>/dev/null || true; fi
  echo "${C_GRAY}Done.${C_RESET}"
}
trap cleanup EXIT INT TERM

# 1. Start dashboard (pass project root so DB & oh-my-openagent.json resolve)
echo "${C_CYAN}Starting SuperAgents Dashboard...${C_RESET}"
export SUPERAGENTS_ROOT="$SCRIPT_DIR"
export SUPERAGENTS_CONFIG="$SCRIPT_DIR/oh-my-openagent.json"
(cd "$DASHBOARD_PATH" && SUPERAGENTS_ROOT="$SCRIPT_DIR" SUPERAGENTS_CONFIG="$SCRIPT_DIR/oh-my-openagent.json" npm run start >/tmp/superagents-dashboard.log 2>&1) &
DASH_PID=$!

# 2. Wait for it
echo "${C_GRAY}   Waiting for dashboard on port $DASHBOARD_PORT...${C_RESET}"
ready=0
for i in {1..40}; do
  if curl -s -o /dev/null --max-time 2 "$DASHBOARD_URL" 2>/dev/null; then
    ready=1; break
  fi
  sleep 1
done

if [ "$ready" -eq 1 ]; then
  echo "${C_GREEN}   Dashboard ready: $DASHBOARD_URL${C_RESET}"
  open "$DASHBOARD_URL" >/dev/null 2>&1 || true
else
  echo "${C_YELLOW}   Dashboard did not respond in 40s. Log: /tmp/superagents-dashboard.log${C_RESET}"
fi

# 3. Launch OpenCode (foreground)
echo ""
echo "${C_CYAN}Launching OpenCode...${C_RESET}"
cd "$SCRIPT_DIR"
opencode

# Cleanup runs via trap on exit.
