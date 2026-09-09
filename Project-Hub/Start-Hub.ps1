<#
.SYNOPSIS
    Starts this hub. Thin shim over the shared launcher in ..\Hub.

.DESCRIPTION
    Everything specific to this hub lives in hub.config.json beside this file; the
    logic is in ..\Hub\Start-Hub.ps1 so a fix lands once instead of three times. This
    shim exists so the VS Code folderOpen task keeps pointing at a path in this folder.

.EXAMPLE
    .\Start-Hub.ps1
.EXAMPLE
    .\Start-Hub.ps1 -Restart -NoBrowser
#>
[CmdletBinding()]
param(
    [ValidateRange(0, 65535)]
    [int] $Port = 0,
    [switch] $Restart,
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot '..\Hub\Start-Hub.ps1') -ConfigDir $PSScriptRoot @PSBoundParameters
exit $LASTEXITCODE
