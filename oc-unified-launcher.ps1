# oc-unified-launcher.ps1
# Unified launcher: Claude Memory + Dashboard + OpenCode (Windows Terminal new tab)
# Meridian Proxy auto-starts inside OpenCode - no separate shell spawned
# Ctrl+C caught by try/finally - shows Y/N confirmation before cleanup

param(
  [string]$CallerDir = (Get-Location).Path
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'

# Disable mouse reporting (prevents ANSI escape garbage on exit)
[Console]::Write([char]27 + '[?1000l')
[Console]::Write([char]27 + '[?1002l')
[Console]::Write([char]27 + '[?1003l')
[Console]::Write([char]27 + '[?1006l')
[Console]::Out.Flush()

# ===================================================================
# CONFIGURATION
# ===================================================================

$configPaths = @{
  dashboardPath = 'C:\Users\INTEL INSIDE\.config\opencode\dashboard'
  claudeMemPath = 'C:\Users\INTEL INSIDE\.claude\plugins\marketplaces\thedotmack\plugin\scripts'
  opencodeDir   = 'C:\Users\INTEL INSIDE\.config\opencode'
}

$urls = @{
  dashboard = 'http://localhost:3000'
  claudeMem = 'http://localhost:37777'
}

$nextCmd = $configPaths.dashboardPath + '\node_modules\.bin\next.cmd'

$global:workerJob        = $null
$global:serviceWorkerJob = $null
$global:dashJob          = $null
$global:browserPids      = @()
$global:ocTabPid         = $null

# ===================================================================
# HELPERS
# ===================================================================

function Write-Status {
  param([string]$Service, [string]$Message, [string]$State = 'Running')
  $ts     = Get-Date -Format 'HH:mm:ss'
  $colors = @{ Starting='Yellow'; Running='Cyan'; Ready='Green'; Failed='Red'; Stopped='Gray' }
  $syms   = @{ Starting='(*)'; Running='(+)'; Ready='(OK)'; Failed='(X)'; Stopped='(-)' }
  Write-Host ('[' + $ts + '] ' + $syms[$State] + ' ' + $Service + ' - ' + $Message) -ForegroundColor $colors[$State]
}

function Test-PortOpen {
  param([int]$Port)
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', $Port)
    $tcp.Close()
    return $true
  } catch { return $false }
}

# ===================================================================
# CLEANUP
# ===================================================================

function Invoke-Cleanup {
  # Disable mouse reporting again before printing anything
  [Console]::Write([char]27 + '[?1000l')
  [Console]::Write([char]27 + '[?1002l')
  [Console]::Write([char]27 + '[?1003l')
  [Console]::Write([char]27 + '[?1006l')
  [Console]::Out.Flush()

  Write-Host ''
  Write-Host '=====================================================================' -ForegroundColor Red
  Write-Host '  SHUTTING DOWN ALL SERVICES' -ForegroundColor Red
  Write-Host '=====================================================================' -ForegroundColor Red
  Write-Host ''

  foreach ($entry in @(
    @{ Job = $global:workerJob;        Name = 'Claude Memory Worker' },
    @{ Job = $global:serviceWorkerJob; Name = 'Service Worker' },
    @{ Job = $global:dashJob;          Name = 'SuperAgents Dashboard' }
  )) {
    if ($entry.Job -and -not $entry.Job.HasExited) {
      Stop-Process -Id $entry.Job.Id -Force -ErrorAction SilentlyContinue
      Write-Status $entry.Name 'Stopped' 'Stopped'
    }
  }

  Write-Host ''
  foreach ($port in @(3000, 3456, 37777)) {
    $lines = netstat -ano 2>$null | Select-String (':' + $port + '\s')
    foreach ($line in $lines) {
      $procId = ($line -split '\s+')[-1]
      if ($procId -match '^\d+$') {
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
        Write-Status ('Port ' + $port) ('Killed PID ' + $procId) 'Stopped'
      }
    }
  }

  Get-Process -Name 'opencode' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  # Hard-close the OpenCode Windows Terminal tab by title
  if ($global:ocTabPid) {
    Stop-Process -Id $global:ocTabPid -Force -ErrorAction SilentlyContinue
    Write-Status 'OpenCode Tab' ('Closed PID ' + $global:ocTabPid) 'Stopped'
  }
  # Force-close the tab via wt CLI (handles closeOnExit:never setting)
  Start-Sleep -Milliseconds 500
  wt.exe -w 0 close-tab --title 'OpenCode' 2>$null

  Write-Host ''
  foreach ($bPid in $global:browserPids) {
    if (Get-Process -Id $bPid -ErrorAction SilentlyContinue) {
      Stop-Process -Id $bPid -Force -ErrorAction SilentlyContinue
      Write-Status 'Browser tab' ('Closed PID ' + $bPid) 'Stopped'
    }
  }

  Write-Host ''
  Write-Host '=====================================================================' -ForegroundColor Green
  Write-Host '  ALL SERVICES CLEANED UP' -ForegroundColor Green
  Write-Host '=====================================================================' -ForegroundColor Green
  Write-Host ''
}

# ===================================================================
# STARTUP
# ===================================================================

Clear-Host

Write-Host ''
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host '  KABINET AI: UNIFIED LAUNCHER' -ForegroundColor Cyan
Write-Host '  Claude Memory + Dashboard + Meridian Proxy + OpenCode' -ForegroundColor Cyan
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host ''

Write-Status 'Claude Memory Worker' 'Starting...' 'Starting'
$global:workerJob = Start-Process -FilePath 'bun' `
  -ArgumentList 'worker-service.cjs' `
  -WorkingDirectory $configPaths.claudeMemPath `
  -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
if ($global:workerJob) {
  Write-Status 'Claude Memory Worker' ('Running PID ' + $global:workerJob.Id) 'Running'
} else {
  Write-Status 'Claude Memory Worker' 'Failed to start' 'Failed'
}

Start-Sleep -Milliseconds 500

Write-Status 'Service Worker' 'Starting...' 'Starting'
$global:serviceWorkerJob = Start-Process -FilePath 'bun' `
  -ArgumentList 'worker-service.cjs' `
  -WorkingDirectory $configPaths.claudeMemPath `
  -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
if ($global:serviceWorkerJob) {
  Write-Status 'Service Worker' ('Running PID ' + $global:serviceWorkerJob.Id) 'Running'
} else {
  Write-Status 'Service Worker' 'Failed to start' 'Failed'
}

Start-Sleep -Milliseconds 500

Write-Status 'SuperAgents Dashboard' 'Starting...' 'Starting'
$global:dashJob = Start-Process -FilePath $nextCmd `
  -ArgumentList 'start' `
  -WorkingDirectory $configPaths.dashboardPath `
  -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
if ($global:dashJob) {
  Write-Status 'SuperAgents Dashboard' ('Running PID ' + $global:dashJob.Id) 'Running'
} else {
  Write-Status 'SuperAgents Dashboard' 'Failed to start' 'Failed'
}

Write-Host ''
Write-Host 'Waiting for dashboard on port 3000...' -ForegroundColor Yellow
$elapsed = 0; $dashboardReady = $false
while ($elapsed -lt 40) {
  if (Test-PortOpen 3000) { $dashboardReady = $true; break }
  Start-Sleep -Seconds 1; $elapsed++
  if ($elapsed % 5 -eq 0) { Write-Host ('  Still waiting... (' + $elapsed + '/40s)') -ForegroundColor Gray }
}
if ($dashboardReady) {
  Write-Status 'SuperAgents Dashboard' 'Ready on port 3000' 'Ready'
} else {
  Write-Status 'SuperAgents Dashboard' 'Timeout after 40s' 'Failed'
}

Write-Host ''
$b1 = Start-Process $urls.dashboard -PassThru -ErrorAction SilentlyContinue
$b2 = Start-Process $urls.claudeMem -PassThru -ErrorAction SilentlyContinue
if ($b1) { $global:browserPids += $b1.Id }
if ($b2) { $global:browserPids += $b2.Id }
Write-Status 'Browser' 'Dashboard + Claude Memory opened' 'Ready'
Write-Host ''

# ===================================================================
# LAUNCH OPENCODE IN WINDOWS TERMINAL (NEW TAB)
# ===================================================================

$tempDir    = $env:TEMP
$tempScript = Join-Path $tempDir 'oc-opencode-tab.ps1'
$stopFile   = Join-Path $tempDir 'oc-stop'

if (Test-Path $stopFile) { Remove-Item $stopFile -Force }

@"
`$host.ui.RawUI.WindowTitle = 'OpenCode'
Set-Location -LiteralPath '$CallerDir'
Write-Host ''
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host '  OpenCode  (Meridian Proxy auto-starts inside OpenCode)' -ForegroundColor Cyan
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host ''
opencode
`$null | Set-Content -LiteralPath '$stopFile'
Write-Host ''
Write-Host 'OpenCode exited. Stopping all services...' -ForegroundColor Yellow
Start-Sleep -Seconds 3
"@ | Set-Content -LiteralPath $tempScript -Encoding UTF8

Write-Host '=====================================================================' -ForegroundColor Yellow
Write-Host '  LAUNCHING OPENCODE IN WINDOWS TERMINAL (NEW TAB)' -ForegroundColor Yellow
Write-Host '=====================================================================' -ForegroundColor Yellow
Write-Host ''

wt.exe -w 0 nt -d $CallerDir powershell -NoExit -File $tempScript

# Wait for WT to spawn the powershell process, then track its PID
# Killing this powershell PID closes just that WT tab (not the whole window)
Start-Sleep -Milliseconds 2000
$global:ocTabPid = $null
$candidates = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like ('*oc-opencode-tab*') }
if ($candidates) {
  $global:ocTabPid = ($candidates | Select-Object -First 1).ProcessId
  Write-Status 'OpenCode Tab' ('Tracked PID ' + $global:ocTabPid) 'Running'
} else {
  Write-Status 'OpenCode Tab' 'Could not track PID (tab will stay open on exit)' 'Failed'
}

Write-Status 'Windows Terminal' 'New tab launched' 'Ready'
Write-Host ''

# ===================================================================
# MONITORING LOOP
# Ctrl+C is caught by try/finally - no raw console mode needed.
# ===================================================================

Write-Host '=====================================================================' -ForegroundColor Green
Write-Host '  ALL SERVICES STARTED  -  Press Ctrl+C to exit' -ForegroundColor Green
Write-Host '=====================================================================' -ForegroundColor Green
Write-Host '  (+) Claude Memory Worker' -ForegroundColor Green
Write-Host '  (+) Service Worker' -ForegroundColor Green
Write-Host '  (+) Dashboard      -> http://localhost:3000' -ForegroundColor Green
Write-Host '  (+) OpenCode       -> Windows Terminal new tab' -ForegroundColor Green
Write-Host '  (~) Meridian Proxy -> auto-starts inside OpenCode on port 3456' -ForegroundColor Cyan
Write-Host '=====================================================================' -ForegroundColor Green
Write-Host ''

$continueLoop = $true
try {
  while ($continueLoop) {
    if (Test-Path $stopFile) {
      Remove-Item $stopFile -Force -ErrorAction SilentlyContinue
      Write-Host ''
      Write-Host 'OpenCode exited - stopping all services...' -ForegroundColor Yellow
      Invoke-Cleanup
      $continueLoop = $false
      break
    }

    $ts         = Get-Date -Format 'HH:mm:ss'
    $workerOk   = $global:workerJob        -and -not $global:workerJob.HasExited
    $serviceOk  = $global:serviceWorkerJob -and -not $global:serviceWorkerJob.HasExited
    $dashOk     = $global:dashJob          -and -not $global:dashJob.HasExited
    $meridianOk = Test-PortOpen 3456

    $wSym  = if ($workerOk)   { '(+) Memory' }    else { '(X) Memory' }
    $sSym  = if ($serviceOk)  { '(+) Service' }   else { '(X) Service' }
    $dSym  = if ($dashOk)     { '(+) Dashboard' } else { '(X) Dashboard' }
    $mSym  = if ($meridianOk) { '(OK) Meridian' } else { '(~) Meridian' }
    $color = if ($meridianOk) { 'Green' } elseif ($dashOk -and $workerOk) { 'Cyan' } else { 'Yellow' }

    Write-Host ('[' + $ts + ']  ' + $wSym + '  ' + $sSym + '  ' + $dSym + '  ' + $mSym) -ForegroundColor $color

    Start-Sleep -Seconds 3
  }
} finally {
  if ($continueLoop) {
    # Disable mouse reporting before any output
    [Console]::Write([char]27 + '[?1000l')
    [Console]::Write([char]27 + '[?1002l')
    [Console]::Write([char]27 + '[?1003l')
    [Console]::Write([char]27 + '[?1006l')
    [Console]::Out.Flush()

    Write-Host ''
    Write-Host '=====================================================================' -ForegroundColor Yellow
    Write-Host '  EXIT CONFIRMATION' -ForegroundColor Yellow
    Write-Host '=====================================================================' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Stop all services and exit?' -ForegroundColor Yellow
    Write-Host '  Stops: Claude Memory Worker, Service Worker, Dashboard' -ForegroundColor DarkGray
    Write-Host '  Kills: ports 3000 / 3456 / 37777, OpenCode process' -ForegroundColor DarkGray
    Write-Host ''
    $r = Read-Host 'Confirm [Y/N]'
    if ($r -match '^[Yy]$') {
      Invoke-Cleanup
    } else {
      Write-Host 'Services still running. Rerun oc to resume monitoring.' -ForegroundColor Cyan
    }
  }
}
