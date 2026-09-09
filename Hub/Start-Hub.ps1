<#
.SYNOPSIS
    Starts a Project Hub server and opens it in the default browser.

.DESCRIPTION
    The launcher for the one Project Hub server. The port, page title and favicon come
    from the hub.config.json in -ConfigDir (normally ..\Project-Hub); which projects it
    mounts comes from ..\Projects\<name>\hub.config.json, discovered at startup. This
    script and ..\Hub\hub.mjs are shared; the config folder keeps a small shim that calls
    this with its own directory, so the VS Code folderOpen tasks are unchanged.

    If the port is already in use by this same server the existing process is reused
    (the browser just opens) unless -Restart is passed. If the port is held by anything
    else, this refuses rather than killing it.

.EXAMPLE
    .\Start-Hub.ps1 -ConfigDir ..\Project-Hub
.EXAMPLE
    .\Start-Hub.ps1 -ConfigDir ..\Project-Hub -Restart -NoBrowser
#>
[CmdletBinding()]
param(
    # Folder holding hub.config.json. Its logs and scan.json are written there too.
    [Parameter(Mandatory)]
    [string] $ConfigDir,

    # Overrides the port in hub.config.json. 0 means "use the configured one".
    [ValidateRange(0, 65535)]
    [int] $Port = 0,

    # Kill the existing hub on this port before starting. Refuses if it is not a hub.
    [switch] $Restart,

    # Start the server but don't open a browser window.
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
$here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$hubScript = Join-Path $here 'hub.mjs'

function Get-PortOwner {
    param([int] $Port)
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

# Whoever holds the port, and what kind of thing it is. -Restart used to Stop-Process
# any listener on sight: when a Vite dev server squatted 4173 in August that would have
# force-killed it instead of reporting the collision.
#
# Three outcomes. 'this' is this exact shared hub.mjs. 'other' is a hub.mjs somewhere
# else -- a pre-migration copy, or a second checkout -- which is still safe to restart,
# but worth naming so the surprise is explained rather than silent. Anything else,
# including a PID whose command line cannot be read, is foreign and never killed.
function Get-PortOwnerInfo {
    param([int] $Port, [string] $ScriptPath)
    $want = $ScriptPath.Replace('\', '/')
    foreach ($procId in (Get-PortOwner -Port $Port)) {
        $cmd = $null
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction Stop).CommandLine
        }
        catch { $cmd = $null }
        $norm = if ($cmd) { $cmd.Replace('\', '/') } else { '' }
        $kind = if ($norm -like "*$want*") { 'this' }
                elseif ($norm -match '(?i)\bnode(\.exe)?\b.*/hub\.mjs\b') { 'other' }
                else { 'foreign' }
        [pscustomobject]@{
            Id          = $procId
            CommandLine = if ($cmd) { $cmd } else { '(command line unavailable)' }
            Kind        = $kind
            IsHub       = ($kind -ne 'foreign')
        }
    }
}

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "node is not on PATH. Install Node 18+ and try again."
    }

    $ConfigDir = (Resolve-Path -LiteralPath $ConfigDir).Path
    $configFile = Join-Path $ConfigDir 'hub.config.json'
    if (-not (Test-Path -LiteralPath $configFile)) {
        throw "No hub.config.json in $ConfigDir. It needs {port, title, favicon} -- see ..\Project-Hub\hub.config.json. To mount a project, add a config under ..\Projects\<name>\ instead, not here."
    }

    $config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
    if ($Port -eq 0) { $Port = [int] $config.port }
    if ($Port -lt 1024) { throw "$configFile has no usable 'port' (got '$($config.port)')." }
    $url = "http://127.0.0.1:$Port"

    $owners  = @(Get-PortOwnerInfo -Port $Port -ScriptPath $hubScript)
    $foreign = @($owners | Where-Object { -not $_.IsHub })
    if ($foreign.Count -gt 0) {
        $who = ($foreign | ForEach-Object { "PID $($_.Id): $($_.CommandLine)" }) -join "`n  "
        throw "Port $Port is held by something that is not a hub:`n  $who`nStop it yourself, or start on another port with -Port <n>."
    }

    if ($owners.Count -gt 0) {
        $elsewhere = @($owners | Where-Object { $_.Kind -eq 'other' })
        if ($elsewhere.Count -gt 0) {
            Write-Host "Note: port $Port is held by a hub running from another location:" -ForegroundColor Yellow
            $elsewhere | ForEach-Object { Write-Host "  PID $($_.Id): $($_.CommandLine)" -ForegroundColor DarkYellow }
            Write-Host "  (expected right after the move to the shared ..\Hub source; -Restart replaces it)" -ForegroundColor DarkYellow
        }
        if ($Restart) {
            Write-Host "Stopping existing hub (PID $($owners.Id -join ', '))..." -ForegroundColor Yellow
            $owners | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
            Start-Sleep -Seconds 2
        }
        else {
            Write-Host "Hub already running at $url - reusing it. Use -Restart to reload code changes." -ForegroundColor Cyan
            if (-not $NoBrowser) { Start-Process $url }
            return
        }
    }

    Write-Host "Starting Project Hub ($($config.name)) on $url ..." -ForegroundColor Green
    $log = Join-Path $ConfigDir 'hub.log'

    # Both logs are append-only and nothing ever trimmed them; HUB_DEBUG=1 writes a line
    # per request, so they can run away. Keep one previous copy and start clean.
    foreach ($f in @($log, (Join-Path $ConfigDir 'hub.err.log'))) {
        if ((Test-Path -LiteralPath $f) -and ((Get-Item -LiteralPath $f).Length -gt 1MB)) {
            Move-Item -LiteralPath $f -Destination "$f.1" -Force
        }
    }
    $proc = Start-Process -FilePath 'node' `
        -ArgumentList @($hubScript, '--config', $configFile, '--port', $Port) `
        -WorkingDirectory $ConfigDir `
        -RedirectStandardOutput $log `
        -RedirectStandardError (Join-Path $ConfigDir 'hub.err.log') `
        -WindowStyle Hidden -PassThru

    # The first scan walks ~15k paths and shells out to git for every repo.
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($proc.HasExited) { throw "Hub exited immediately. See $log and $(Join-Path $ConfigDir 'hub.err.log')" }
        if (Get-PortOwner -Port $Port) { break }
    }

    if (-not (Get-PortOwner -Port $Port)) { throw "Hub did not start listening on $Port. See $log" }

    Write-Host "Ready: $url  (PID $($proc.Id), log: $log)" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $url }
}
catch {
    Write-Error $_
    exit 1
}
