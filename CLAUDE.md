# CLAUDE.md — Project Hub

Zero-dependency Node server + single-file vanilla-JS explorer that turns a folder of
workspaces into a browsable document console on loopback. Repo: `ai-automation-tools/project-hub`
(the folder name `HTML-Project-Design` predates the rename). **Public, MIT** — everything
committed here, this file included, is published.

## Layout

| Path | What it is |
|:---|:---|
| `Hub/hub.mjs` | Scanner, static server, markdown renderer + sanitizer, watcher, config loader (~1,900 lines) |
| `Hub/index.html` | The entire UI — no framework, no build. Server fills `%TITLE%` `%FAVICON%` `%PORT%` `%NONCE%` per request |
| `Hub/{navigation,pictures,pictures-client,reports,open-native,webmarks,favorites}.mjs` | Route/bookmark logic (pure), lazy Pictures cache, signed report routes, native launch, favorites storage + favicons + embed check (server), favorites tree + bookmarks-file format (client, pure) |
| `Hub/*.test.mjs` | `node --test`, 82 tests, no framework |
| `Hub/Start-Hub.ps1`, `Watch-Hubs.ps1`, `run-watchdog-hidden.vbs` | Launcher, health watchdog, hidden-window wrapper for its scheduled task |
| `Project-Hub/` | Server config folder + launcher shim. Real `hub.config.json` is gitignored |
| `Projects/<Name>/hub.config.json` | One per mounted workspace. Only `Projects/_example/` is tracked |
| `Demo/` | Fixture workspace + `build-demo.mjs` → static capture published to project-hub.ai-automation-tools.dev |
| `Skills/project-hub-scaffold-mfs/` | **Travel copy** of the scaffold skill — canonical in `agent-skills`, keep byte-identical |
| `Docs/` | `ROADMAP.md` (P9 is the live work queue), `CHANGELOG.md`, user/engine docs |

Deep reference: `Hub/README.md` (engine, endpoints, config), `Project-Hub/README.md` (user manual),
`Demo/README.md` (demo build).

## Commands

```sh
cd Hub && npm test                                   # 82 tests; must stay green
node Demo/build-demo.mjs                             # from repo root; also an integration test
node Hub/hub.mjs --config Project-Hub/hub.config.json          # run (http://127.0.0.1:4273)
node Hub/hub.mjs --config Project-Hub/hub.config.json --scan   # write scan.json only
```

```powershell
./Project-Hub/Start-Hub.ps1 -Restart -NoBrowser      # restart the running hub after hub.mjs changes
```

CI (`.github/workflows/test.yml`) runs `npm test` on Node 18.17 and 22, plus the demo build
with a >100-captured-responses check. `demo.yml` deploys the demo on push to `main` touching `Hub/` or `Demo/`.

## Hard rules

- **Zero dependencies.** No `npm install`, no lockfile, no bundler, no framework. Node ≥18.17 stdlib only — CI tests 18.17, so don't use newer APIs.
- **No build step for the UI.** `Hub/index.html` is served as-is.
- **Every path-addressed endpoint goes through `resolveId()`** (roots + `SECRET_DIRS` + `CREDENTIAL_FILE` deny gate). A new `/api/*` route that reads a path without it is a vulnerability. Tests pin several of these wirings.
- **Loopback only.** Host-header check and CSP on every response; `/api/open` is same-origin only. Never bind `0.0.0.0`.
- **Inline scripts need the `%NONCE%`.** The CSP rejects anything else.
- **`sanitizeHtml()` rebuilds tags from an allowlist** — extend the allowlist, never loosen it to pass-through.
- **No stray control bytes.** A test scans every source file; two past production defects were invisible bytes from a patch script. Prefer the Edit tool over scripted rewrites; re-run `npm test` after any scripted edit.
- **Client modules the page imports** must be in `build-demo.mjs`'s copy list and the scaffold's `$engineFiles`, or the demo and scaffolded hubs fail to load.
- **Demo literals.** `build-demo.mjs` asserts exact string literals in `index.html` (placeholders, asset URLs). Moving them breaks the demo build — update both together.
- **Public repo hygiene.** No personal names, emails, hostnames, or machine paths in tracked files — use `D:/Work`, `C:/Users/you`, `Example_Workspace`. Real configs, `scan.json`, logs, `Src/`, most of `Images/` are gitignored; keep it that way.
- **Line endings** per `.gitattributes`: LF for js/mjs/json/md/html, CRLF for `.ps1`/`.vbs`. A `.ps1` with non-ASCII must be UTF-8 **with BOM**.
- **Scaffold skill changes land in `agent-skills` first**, then copy here byte-identical.

## Workflow

- **Single branch `main`** — no `mike_desktop`. Small direct commits are fine; roadmap-routine work arrives as PRs.
- Imperative-mood subjects, no Conventional Commits prefix (match `git log`).
- Ticking a P9 roadmap item adds a line to `Docs/CHANGELOG.md` tagged *(roadmap: P9-NN)* in the same commit.
- `hub.mjs` changes need a hub restart to take effect; `index.html` changes need only a browser refresh.
- The watchdog restarts a stopped hub within 15 minutes — disable its task first if you mean to keep it down.

## Skills & agents

- `.claude/skills/project-hub-{scan,client,demo}` — maintainer skills, **overlay installed from `agent-skills`** (`Skills/Projects/project-hub/`). Edit them there and reinstall with `pwsh scripts/install-skills.ps1 -Project project-hub -Destination <this-clone>/.claude/skills` — don't edit the copies here.
- `.claude/agents/hub-reviewer.md` — reviews a diff against the rules above.
- `/check` — tests + demo build + public-hygiene grep, before committing.
