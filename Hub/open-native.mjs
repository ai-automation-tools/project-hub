import { execFile } from 'node:child_process';

// Paths travel as data in the child environment, never as cmd.exe command text.
export function launchNative(file, mode, execute = execFile) {
  const scripts = {
    code: "& code --goto $env:HUB_OPEN_PATH; if ($LASTEXITCODE) { exit $LASTEXITCODE }",
    reveal: "Start-Process -FilePath explorer.exe -ArgumentList ('/select,\"' + $env:HUB_OPEN_PATH + '\"') -ErrorAction Stop",
    default: 'Start-Process -FilePath $env:HUB_OPEN_PATH -ErrorAction Stop',
  };
  if (!Object.hasOwn(scripts, mode)) return Promise.reject(new Error('unsupported destination'));
  const command = "$ErrorActionPreference = 'Stop'; " + scripts[mode];
  return new Promise((resolve, reject) => {
    execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30000, env: { ...process.env, HUB_OPEN_PATH: file } },
      (err) => err ? reject(new Error('The launch request failed. Check the file association or that VS Code is installed on PATH.')) : resolve());
  });
}
