<#
.SYNOPSIS
    Add a workspace to one shared Project Hub or create a portable installation.
.DESCRIPTION
    PowerShell 7. Refuses existing destinations. Does not start servers.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]*$')] [string] $Name,
    [Parameter(Mandatory)] [string] $Dir,
    [Parameter(Mandatory)] [string] $HubDesignRoot,
    [string[]] $RepoScopeGroups,
    [string] $RepoScopePathPrefix,
    [switch] $Standalone,
    [string] $TargetDir,
    [string] $Base,
    [ValidateRange(1024,65535)] [int] $Port = 4273,
    [string] $Title = 'Project Hub',
    [string] $Glyph = '/',
    [string] $Ink = '#5fe3a1',
    [string] $Line = '#2f6b52'
)
$ErrorActionPreference = 'Stop'
if ($RepoScopeGroups -and $RepoScopePathPrefix) { throw 'Choose groups or pathPrefix, not both.' }
if (-not (Test-Path -LiteralPath $Dir -PathType Container)) { throw 'Workspace directory does not exist.' }
$workspace = (Resolve-Path -LiteralPath $Dir).Path.Replace('\','/').TrimEnd('/')
$source = (Resolve-Path -LiteralPath $HubDesignRoot).Path
$engineFiles = @('hub.mjs','index.html','navigation.mjs','open-native.mjs','pictures.mjs',
    'pictures-client.mjs','reports.mjs','hub.test.mjs','pictures.test.mjs','reports.test.mjs',
    'package.json','Start-Hub.ps1','Watch-Hubs.ps1','run-watchdog-hidden.vbs')
$required = @('Hub/hub.mjs', 'Project-Hub/Start-Hub.ps1')
if ($Standalone) {
    $required = @($engineFiles | ForEach-Object { 'Hub/' + $_ }) + @('LICENSE',
        'Project-Hub/Start-Hub.ps1','Project-Hub/hub.config.example.json','Projects/_example/hub.config.json.example')
}
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw "Missing source: $file" }
}
if ($Standalone) {
    if (-not $TargetDir -or -not $Base) { throw 'Standalone requires -TargetDir and -Base.' }
    if (-not (Test-Path -LiteralPath $Base -PathType Container)) { throw 'Base directory does not exist.' }
    $destination = [IO.Path]::GetFullPath($TargetDir)
    if (Test-Path -LiteralPath $destination) { throw 'Standalone destination already exists.' }
} else {
    foreach ($key in 'TargetDir','Base','Port','Title','Glyph','Ink','Line') {
        if ($PSBoundParameters.ContainsKey($key)) { throw "$key applies only to -Standalone." }
    }
    $serverConfig = Join-Path $source 'Project-Hub/hub.config.json'
    if (-not (Test-Path -LiteralPath $serverConfig)) { throw 'Configure Project-Hub/hub.config.json first.' }
    $null = Get-Content -LiteralPath $serverConfig -Raw | ConvertFrom-Json
    $destination = $source
}
$projectDir = Join-Path $destination "Projects/$Name"
if (Test-Path -LiteralPath $projectDir) { throw 'Project destination already exists.' }
$projectsRoot = Join-Path $destination 'Projects'
if (Test-Path -LiteralPath $projectsRoot) {
    foreach ($folder in Get-ChildItem -LiteralPath $projectsRoot -Directory) {
        $file = Join-Path $folder.FullName 'hub.config.json'
        if (-not (Test-Path -LiteralPath $file)) { continue }
        $existing = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        if ($existing.name -eq $Name -or $existing.dir.Replace('\','/').TrimEnd('/') -eq $workspace) {
            throw 'Workspace name or directory is already mounted.'
        }
    }
}
$config = [ordered]@{ name = $Name; dir = $workspace }
if ($RepoScopeGroups) { $config.repoScope = @{ groups = $RepoScopeGroups } }
if ($RepoScopePathPrefix) { $config.repoScope = @{ pathPrefix = $RepoScopePathPrefix.Replace('\','/').TrimEnd('/') + '/' } }
if ($Standalone) {
    foreach ($file in $required) {
        $target = Join-Path $destination $file
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath (Join-Path $source $file) -Destination $target
    }
    $server = [ordered]@{ name = 'Portfolio'; port = $Port; title = $Title
        base = (Resolve-Path -LiteralPath $Base).Path.Replace('\','/').TrimEnd('/')
        sharedRoots = @(); favicon = @{ glyph=$Glyph; ink=$Ink; line=$Line } }
    $server | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'Project-Hub/hub.config.json') -Encoding utf8NoBOM
    @('hub.config.json','scan.json','*.log','*.log.*','node_modules/','.env','.env.*','!.env.example',
      '*.key','*.pem','.vscode/','*.code-workspace') |
        Set-Content -LiteralPath (Join-Path $destination '.gitignore') -Encoding utf8NoBOM
}
New-Item -ItemType Directory -Force -Path $projectDir | Out-Null
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $projectDir 'hub.config.json') -Encoding utf8NoBOM
Write-Host "Workspace configured: $projectDir"
Write-Host "Run npm test in $destination/Hub, then restart $destination/Project-Hub/Start-Hub.ps1 and verify health and the browser."
