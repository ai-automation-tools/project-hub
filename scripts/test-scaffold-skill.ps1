#requires -Version 7
<#
.SYNOPSIS
    Tests for the scaffold skill's helper, skills/project-hub-scaffold/scripts/scaffold-hub.ps1.

.DESCRIPTION
    Runs the helper against a fake project-hub checkout built in a temp directory: adds
    a workspace, writes its hub.config.json, refuses a duplicate name or directory,
    rejects bad parameter mixes, and lays down a standalone install with its server
    config and .gitignore. The standalone engine list below must match the helper's
    $engineFiles.

    Moved here from agent-skills (scripts/test-skill-scripts.ps1) on 2026-11-27 with the
    skill itself. Touches nothing outside the temp directory. Exits 1 on the first failed
    assertion. CI runs it in test.yml (scaffold skill job).

.EXAMPLE
    pwsh -NoProfile -File scripts/test-scaffold-skill.ps1
#>
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Scaffold = Join-Path $RepoRoot 'skills/project-hub-scaffold/scripts/scaffold-hub.ps1'
$Tmp      = Join-Path ([IO.Path]::GetTempPath()) "scaffold-skill-test-$([guid]::NewGuid().ToString('N'))"

function Assert([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    Write-Host "ok   $Message"
}

# Runs a script block and returns the error message it threw, or $null.
function Get-Thrown([scriptblock] $Block) {
    try { & $Block *> $null; return $null } catch { return $_.Exception.Message }
}

function New-File([string] $Path, [string] $Value = '') {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    Set-Content -LiteralPath $Path -Value $Value
}

try {
    New-Item -ItemType Directory -Path $Tmp | Out-Null

    $hub = Join-Path $Tmp 'project-hub'
    New-File (Join-Path $hub 'hub/hub.mjs')
    New-File (Join-Path $hub 'project-hub/Start-Hub.ps1')
    $ws1 = Join-Path $Tmp 'workspace-one'; $ws2 = Join-Path $Tmp 'workspace-two'
    New-Item -ItemType Directory -Path $ws1, $ws2 | Out-Null

    $err = Get-Thrown { & $Scaffold -Name Docs -Dir $ws1 -HubDesignRoot $hub }
    Assert ($err -match 'Configure project-hub/hub.config.json first') 'scaffold: refuses a hub with no server config'

    New-File (Join-Path $hub 'project-hub/hub.config.json') '{}'
    & $Scaffold -Name Docs -Dir $ws1 -HubDesignRoot $hub -RepoScopePathPrefix 'docs\guides' *> $null
    $cfgFile = Join-Path $hub 'projects/Docs/hub.config.json'
    Assert (Test-Path $cfgFile) 'scaffold: writes projects/<Name>/hub.config.json'
    $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json
    $wsPath = (Resolve-Path $ws1).Path.Replace('\', '/')
    Assert ($cfg.name -eq 'Docs' -and $cfg.dir -eq $wsPath) 'scaffold: config holds the name and a forward-slash dir'
    Assert ($cfg.repoScope.pathPrefix -eq 'docs/guides/') 'scaffold: pathPrefix is normalized to forward slashes and a trailing /'
    Assert ([IO.File]::ReadAllBytes($cfgFile)[0] -ne 0xEF) 'scaffold: config is written without a BOM'

    $err = Get-Thrown { & $Scaffold -Name Docs -Dir $ws2 -HubDesignRoot $hub }
    Assert ($err -match 'Project destination already exists') 'scaffold: refuses a name that is already a project folder'
    $err = Get-Thrown { & $Scaffold -Name Other -Dir $ws1 -HubDesignRoot $hub }
    Assert ($err -match 'already mounted') 'scaffold: refuses a directory another workspace already mounts'
    $err = Get-Thrown { & $Scaffold -Name Both -Dir $ws2 -HubDesignRoot $hub -RepoScopeGroups a -RepoScopePathPrefix b }
    Assert ($err -match 'not both') 'scaffold: refuses groups and pathPrefix together'
    $err = Get-Thrown { & $Scaffold -Name PortOnly -Dir $ws2 -HubDesignRoot $hub -Port 5000 }
    Assert ($err -match 'applies only to -Standalone') 'scaffold: refuses standalone-only parameters without -Standalone'
    $err = Get-Thrown { & $Scaffold -Name '../escape' -Dir $ws2 -HubDesignRoot $hub }
    Assert ($null -ne $err -and -not (Test-Path (Join-Path $hub 'escape'))) 'scaffold: refuses a name that is not a plain identifier'
    $err = Get-Thrown { & $Scaffold -Name Gone -Dir (Join-Path $Tmp 'missing') -HubDesignRoot $hub }
    Assert ($err -match 'Workspace directory does not exist') 'scaffold: refuses a missing workspace directory'

    & $Scaffold -Name Groups -Dir $ws2 -HubDesignRoot $hub -RepoScopeGroups 'Tools', 'Apps' *> $null
    $groups = (Get-Content (Join-Path $hub 'projects/Groups/hub.config.json') -Raw | ConvertFrom-Json).repoScope.groups
    Assert (($groups -join ',') -eq 'Tools,Apps') 'scaffold: repoScope groups are written in order'

    # Standalone: every engine file must exist in the source.
    $engine = 'hub.mjs', 'scan.mjs', 'markdown.mjs', 'index.html', 'navigation.mjs', 'open-native.mjs',
        'reports.mjs', 'webmarks.mjs', 'favorites.mjs', 'hub.test.mjs', 'reports.test.mjs',
        'webmarks.test.mjs', 'favorites.test.mjs', 'package.json', 'Start-Hub.ps1', 'Watch-Hubs.ps1', 'run-watchdog-hidden.vbs'
    $target = Join-Path $Tmp 'standalone'
    $err = Get-Thrown { & $Scaffold -Name Solo -Dir $ws1 -HubDesignRoot $hub -Standalone -TargetDir $target -Base $Tmp }
    Assert ($err -match 'Missing source: hub/') 'scaffold: standalone refuses a source missing engine files'
    foreach ($f in $engine) { New-File (Join-Path $hub "hub/$f") $f }
    foreach ($f in 'LICENSE', 'project-hub/hub.config.example.json', 'projects/_example/hub.config.json.example') { New-File (Join-Path $hub $f) }

    $err = Get-Thrown { & $Scaffold -Name Solo -Dir $ws1 -HubDesignRoot $hub -Standalone }
    Assert ($err -match 'requires -TargetDir and -Base') 'scaffold: standalone requires -TargetDir and -Base'
    & $Scaffold -Name Solo -Dir $ws1 -HubDesignRoot $hub -Standalone -TargetDir $target -Base $Tmp -Port 4999 -Title 'Test Hub' *> $null
    $copied = @($engine | Where-Object { Test-Path (Join-Path $target "hub/$_") })
    Assert ($copied.Count -eq $engine.Count) "scaffold: standalone copies all $($engine.Count) engine files"
    $server = Get-Content (Join-Path $target 'project-hub/hub.config.json') -Raw | ConvertFrom-Json
    Assert ($server.port -eq 4999 -and $server.title -eq 'Test Hub' -and $server.base -eq (Resolve-Path $Tmp).Path.Replace('\', '/').TrimEnd('/')) 'scaffold: standalone server config carries port, title and base'
    Assert (Test-Path (Join-Path $target 'projects/Solo/hub.config.json')) 'scaffold: standalone mounts the workspace'
    Assert ((Get-Content (Join-Path $target '.gitignore')) -contains 'hub.config.json') 'scaffold: standalone .gitignore keeps the local config out of git'
    $err = Get-Thrown { & $Scaffold -Name Again -Dir $ws2 -HubDesignRoot $hub -Standalone -TargetDir $target -Base $Tmp }
    Assert ($err -match 'Standalone destination already exists') 'scaffold: standalone refuses an existing destination'

    Write-Host 'All scaffold skill checks passed.' -ForegroundColor Green
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
