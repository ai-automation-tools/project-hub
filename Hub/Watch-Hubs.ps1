<#
.SYNOPSIS
    Checks every Project Hub is answering, and restarts any that is not.

.DESCRIPTION
    On 2026-08-31 the AI Lab hub died of a file-descriptor leak after four days up. The
    only trace was one line in hub.err.log, and nobody noticed until a browser tab
    answered ERR_CONNECTION_REFUSED hours later. Nothing was watching. This is.

    For each hub folder it pings http://127.0.0.1:<port>/api/health and treats the hub
    as unhealthy when the request fails, the status is not 200, or the payload reports
    ok:false (which the server sets when readErrors climbs -- the fingerprint of that
    same leak). Unhealthy hubs are restarted through Start-Hub.ps1, which means the
    port-owner checks still apply: it will not kill something that is not a hub.

    Exit code is 0 when everything was already healthy, 1 when anything needed a restart
    or could not be fixed, so a scheduled task can alert on it.

.PARAMETER Hubs
    Hub folders to check. Defaults to every sibling folder holding a hub.config.json.

.PARAMETER Restart
    Actually restart unhealthy hubs. Without it this only reports.

.EXAMPLE
    .\Watch-Hubs.ps1
.EXAMPLE
    .\Watch-Hubs.ps1 -Restart -Quiet
.EXAMPLE
    # Optional: configure Task Scheduler to run wscript.exe with the absolute path
    # to run-watchdog-hidden.vbs in this folder. Requires PowerShell 7 on PATH.
#>
[CmdletBinding()]
param(
    [string[]] $Hubs,

    # Restart anything unhealthy. Report-only without it.
    [switch] $Restart,

    # Print only problems - what you want from a scheduled task.
    [switch] $Quiet
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here

if (-not $Hubs) {
    $Hubs = Get-ChildItem -Path $root -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'hub.config.json') } |
        Select-Object -ExpandProperty FullName
}

# A scheduled task's console output goes nowhere, so a watchdog that only writes to the
# host is invisible exactly when you need its history. One line per run, plus detail when
# something was wrong; trimmed so it cannot become the next thing that fills the disk.
$logFile = Join-Path $here 'watchdog.log'
$logLines = [System.Collections.Generic.List[string]]::new()
function Write-Log {
    param([string] $Text)
    $logLines.Add(('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text))
}

$problems = 0

foreach ($dir in $Hubs) {
    $configFile = Join-Path $dir 'hub.config.json'
    if (-not (Test-Path -LiteralPath $configFile)) {
        Write-Warning "no hub.config.json in $dir - skipping"
        continue
    }
    $config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
    $name = $config.name
    $port = [int] $config.port

    $health = $null
    $reason = $null
    try {
        # -TimeoutSec covers a hung process as well as a dead one: a hub mid-scan blocks
        # its event loop, so allow more than a moment before calling it down.
        # -SkipHttpErrorCheck so an unhealthy 503 still hands over its body -- "the hub
        # says it is sick, and here is why" is a different problem from "nothing answered".
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 30 -SkipHttpErrorCheck
        $health = $res.Content | ConvertFrom-Json
        if (-not $health.ok) {
            $reason = "reports $($health.state) (readErrors recent=$($health.readErrorsRecent) total=$($health.readErrors), scans=$($health.scans))"
        }
    }
    catch {
        $reason = "no answer on $port - $($_.Exception.Message)"
    }

    if (-not $reason) {
        Write-Log ("OK   {0} port {1} up {2}s scans {3} lastScan {4}ms readErrors {5} recent" -f `
            $name, $port, $health.uptimeSec, $health.scans, $health.lastScan.ms, $health.readErrorsRecent)
        if (-not $Quiet) {
            $last = $health.lastScan
            Write-Host ("OK   {0,-14} port {1}  up {2,6}s  pid {3,-6} scans {4,-4} lastScan {5}ms/{6}s ago  {7}MB gzip  readErrors {8} recent / {9} total" -f `
                $name, $port, $health.uptimeSec, $health.pid, $health.scans, $last.ms, $last.ageSec, $last.gzipMb, $health.readErrorsRecent, $health.readErrors) -ForegroundColor Green
        }
        continue
    }

    $problems++
    Write-Log "DOWN $name (port $port): $reason"
    Write-Warning "DOWN $name (port $port): $reason"

    if (-not $Restart) {
        Write-Host "     re-run with -Restart to bring it back" -ForegroundColor DarkYellow
        continue
    }

    Write-Host "     restarting..." -ForegroundColor Yellow
    try {
        # Start-Hub.ps1 owns the port-identity checks; going through it means the
        # watchdog can never kill something that merely happens to hold the port.
        & (Join-Path $here 'Start-Hub.ps1') -ConfigDir $dir -Restart -NoBrowser | Out-Null
        Start-Sleep -Seconds 2
        $after = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 60
        if ($after.ok) {
            Write-Log "     restarted OK (pid $($after.pid))"
            Write-Host "     back up (pid $($after.pid))" -ForegroundColor Green
        }
        else {
            Write-Log "     restarted but still unhealthy"
            Write-Warning "     restarted but still unhealthy"
        }
    }
    catch {
        Write-Log "     restart failed: $($_.Exception.Message)"
        Write-Warning "     restart failed: $($_.Exception.Message)"
    }
}

# Healthy runs are the overwhelming majority, so keep them to one line and only write the
# per-hub detail when something was actually wrong.
try {
    if ($problems -eq 0) {
        $summary = '{0}  all {1} hub(s) healthy' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), @($Hubs).Count
        Add-Content -LiteralPath $logFile -Value $summary
    }
    else {
        Add-Content -LiteralPath $logFile -Value $logLines
    }
    # Keep the tail rather than rotating: this file is a history, not a transcript.
    if ((Test-Path -LiteralPath $logFile) -and ((Get-Item -LiteralPath $logFile).Length -gt 512KB)) {
        $keep = Get-Content -LiteralPath $logFile -Tail 2000
        Set-Content -LiteralPath $logFile -Value $keep
    }
}
catch {
    Write-Warning "could not write $logFile - $($_.Exception.Message)"
}

if ($problems -gt 0) { exit 1 }
exit 0
