' run-watchdog-hidden.vbs - run Watch-Hubs.ps1 with NO console window at all.
'
' Why this exists: the Project Hub Watchdog task ran pwsh.exe directly, with no
' -WindowStyle flag, so Task Scheduler popped a visible PowerShell window every
' 15 minutes. Even -WindowStyle Hidden only hides the window AFTER Windows has
' already created the console host, and with Windows Terminal set as the
' default terminal application that console can still surface as a real,
' visible window (see Deepseek-Harness\run-hidden.vbs, same trap, 2026-08-24).
'
' WScript.Shell.Run(cmd, 0, True) creates the process with window style 0
' (SW_HIDE) from the start, and wscript.exe is itself a windowless host, so
' there is no window for anyone to see or close. The third argument (True)
' waits for the script to finish and returns its exit code, so Task
' Scheduler's "Last Result" still reflects whether hubs were healthy (0) or
' something needed a restart / could not be fixed (1) -- exactly like running
' Watch-Hubs.ps1 directly, just invisibly.
'
' Usage (from the scheduled task's action):
'   Execute:   C:\Windows\System32\wscript.exe
'   Argument:  "<...>\run-watchdog-hidden.vbs"

Option Explicit

Dim shell, cmd, rc
Set shell = CreateObject("WScript.Shell")

shell.CurrentDirectory = "D:\AI_Agents\Documents\My-Documents\My-IT-Tools\HTML-Project-Design\Hub"
cmd = """C:\Program Files\PowerShell\7\pwsh.exe"" -NoProfile -ExecutionPolicy Bypass -File ""D:\AI_Agents\Documents\My-Documents\My-IT-Tools\HTML-Project-Design\Hub\Watch-Hubs.ps1"" -Restart -Quiet"

' 0 = hidden window (created hidden, never shown); True = wait and return the exit code.
rc = shell.Run(cmd, 0, True)
WScript.Quit(rc)
