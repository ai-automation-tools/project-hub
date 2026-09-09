' Launch the watchdog hidden, relative to this wrapper; preserve its exit code.
Option Explicit
Dim shell, fso, here, cmd, rc
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = here
cmd = "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & fso.BuildPath(here, "Watch-Hubs.ps1") & Chr(34) & " -Restart -Quiet"
rc = shell.Run(cmd, 0, True)
WScript.Quit(rc)
