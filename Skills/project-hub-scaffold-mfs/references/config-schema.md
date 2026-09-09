# Configuration and architecture

Updated against the shared engine on 2026-09-09. Consult `Hub/README.md` and
`loadConfig()` / `loadProjectConfig()` when making schema changes.

## Layout

```text
<installation>/
  Hub/                       complete runtime, launcher and tests
  Project-Hub/               server config, example and launcher shim
  Projects/<Name>/           one workspace config per folder
  Projects/_example/         hub.config.json.example (not loaded as a project)
```

The server discovers `Projects/` next to its config folder at startup. Restart after
adding/removing projects or editing config. File watching refreshes content, not
that startup project list. The old `/api/hubs` and hub-switcher model is retired.

## Server config: Project-Hub/hub.config.json

```json
{
  "name": "Portfolio",
  "port": 4273,
  "title": "Project Hub",
  "base": "D:/Work",
  "favicon": { "glyph": "/", "ink": "#5fe3a1", "line": "#2f6b52" },
  "sharedRoots": [
    { "name": "Documents", "dir": "D:/Work/Documents", "tint": "var(--red)" },
    { "name": "Pictures", "dir": "C:/Users/you/Pictures", "tint": "var(--orange)" }
  ]
}
```

`port` is required, integer 1024–65535. `base` is required and supplies the base for
filesystem IDs. `sharedRoots` defaults to an empty array; entries need `name` and
`dir`, with optional `tint`. A root named `Pictures` activates lazy image browsing.
`name`, `title`, and favicon properties have defaults. All configured directories
must be checked for existence by the scaffold; the loader does not check them all.
Nested mounted roots are pruned from their parent walks to avoid duplicate IDs.
Mount a dot-prefixed skills folder explicitly because ordinary walking skips dot dirs.

## Workspace config: Projects/<Name>/hub.config.json

```json
{
  "name": "Demo",
  "dir": "D:/Work/Projects/Demo",
  "repoScope": { "pathPrefix": "Repos/" }
}
```

`name` and `dir` are required. `repoScope` can contain `groups` matching the
`Repos/<group>/` tier, or `pathPrefix`, never both. End a prefix with `/` to avoid
matching similarly named siblings. Omit scope for every repository under the root.
Do not place a port, favicon, shared roots, or server settings in workspace configs.

IDs are relative to `base`; user-home paths use `~/`. Cross-drive paths may be
absolute. The scanner supplies `base` and `home` to the client for copied paths.
User runtimes resolve from `os.homedir()` and are shared across project overviews.

## API

| Route | Purpose |
|:---|:---|
| `/api/scan` | Cached project/document tree and metadata; `?fresh=1` rescans. Pictures is metadata-only. |
| `/api/stat?path=` | Immediate child modification times for folder lists. |
| `/api/file?path=` | Rendered text; `raw=1` returns escaped source. Images/PDF return 415. |
| `/api/raw?path=` | Bytes, PDF ranges, images; `download=1` attachment. HTML redirects to preview. |
| `/api/preview?path=` | Redirect to signed report directory. |
| `/api/artifact/<signature>/<relative-path>` | Sandboxed HTML/SVG and contained companion assets. |
| `/api/pictures?path=` | Lazy folder children or file plus ancestor path. |
| `/api/pictures?action=search&q=&kind=&offset=&limit=` | Separate metadata index, up to 200 results per page. |
| `/api/pictures?action=status` | Picture cache/index state and metrics. |
| `/api/open?path=` | Native opening; `in=code` or `reveal=1`. Origin and path validation apply. |
| `/api/events` | SSE `change` and separate `pictures` invalidations. |
| `/api/health` | Scan timings, errors and Pictures state; 503 when unhealthy. |

The server binds loopback and validates request hosts, origins and filesystem
containment. HTML report directories remain contained after resolving links; signed
URLs expire on restart. Share stable Hub routes, not signed preview URLs. Browser
sandbox/CSP and secret-path filtering must remain intact. This is a local tool,
not an authenticated public hosting service.

## Running and verification

Requires Node 18.17+ and Git; Windows launchers require PowerShell 7. No npm install
is needed. `npm test` in `Hub/` runs all three test files. `npm start` uses the sibling
server config. `npm run scan` writes an ignored filesystem index into that config
folder. Windows launch: `Project-Hub/Start-Hub.ps1`; use `-Restart -NoBrowser` for
an intentional restart. Optional `Watch-Hubs.ps1` checks health; `-Restart` enables
recovery. The VBS wrapper runs it hidden from its own directory using `pwsh` on PATH.

Ignore real configs, the Projects instance inventory, scans, logs, caches, secrets,
editor wiring and private assets. Publish config examples and the complete skill.
Review prior Git history separately before making an existing private repo public.
