# AGENTS.md — Project Hub

Zero-dependency Node server + single-file vanilla-JS explorer that turns a folder of
workspaces into a browsable document console on loopback. Repo: `ai-automation-tools/project-hub`
(the folder name `HTML-Project-Design` predates the rename). **Public, MIT** — everything
committed here, this file included, is published.

## Layout

| Path | What it is |
|:---|:---|
| `hub/hub.mjs` | Scanner, static server, markdown renderer + sanitizer, watcher, config loader (~1,900 lines) |
| `hub/index.html` | The entire UI — no framework, no build. Server fills `%TITLE%` `%FAVICON%` `%PORT%` `%NONCE%` per request |
| `hub/{navigation,pictures,pictures-client,reports,open-native,webmarks,favorites}.mjs` | Route/bookmark logic (pure), lazy Pictures cache, signed report routes, native launch, favorites storage + favicons + embed check (server), favorites tree + bookmarks-file format (client, pure) |
| `hub/*.test.mjs` | `node --test`, 97 tests, no framework |
| `hub/Start-Hub.ps1`, `Watch-Hubs.ps1`, `run-watchdog-hidden.vbs` | Launcher, health watchdog, hidden-window wrapper for its scheduled task |
| `project-hub/` | Server config folder + launcher shim. Real `hub.config.json` is gitignored |
| `projects/<Name>/hub.config.json` | One per mounted workspace. Only `projects/_example/` is tracked |
| `demo/` | Fixture workspace + `build-demo.mjs` → static capture published to project-hub-demo.ai-automation-tools.dev |
| `skills/project-hub-scaffold/` | **Travel copy** of the scaffold skill — canonical in `agent-skills`; CI's `scaffold copy` job fails if it drifts, so edit there first and copy here |
| `docs/` | `ROADMAP.md` (P9 is the live work queue), `CHANGELOG.md`, user/engine docs |
| `docs/diagrams/` + `scripts/build-diagram.mjs` | Code-pinned Archify architecture diagram, embedded on the homepage (`project-hub-site`). Edit only the `.json`; rebuild with `node scripts/build-diagram.mjs --pin-head`, `--check` reports drift. Procedure: `docs/diagrams/README.md` |

Deep reference: `hub/README.md` (engine, endpoints, config), `project-hub/README.md` (user manual),
`demo/README.md` (demo build).

## Commands

```sh
cd Hub && npm test                                   # 97 tests; must stay green
node demo/build-demo.mjs                             # from repo root; also an integration test
node hub/hub.mjs --config project-hub/hub.config.json          # run (http://127.0.0.1:4273)
node hub/hub.mjs --config project-hub/hub.config.json --scan   # write scan.json only
```

```powershell
./project-hub/Start-Hub.ps1 -Restart -NoBrowser      # restart the running hub after hub.mjs changes
```

CI (`.github/workflows/test.yml`) runs `npm test` on Node 18.17 and 22, plus the demo build
with a >100-captured-responses check. `demo.yml` deploys the demo on push to `main` touching `hub/` or `demo/`.

## Hard rules

- **Zero dependencies.** No `npm install`, no lockfile, no bundler, no framework. Node ≥18.17 stdlib only — CI tests 18.17, so don't use newer APIs.
- **No build step for the UI.** `hub/index.html` is served as-is.
- **Every path-addressed endpoint goes through `resolveId()`** (roots + `SECRET_DIRS` + `CREDENTIAL_FILE` deny gate). A new `/api/*` route that reads a path without it is a vulnerability. Tests pin several of these wirings.
- **Loopback only.** Host-header check and CSP on every response; `/api/open` is same-origin only. Never bind `0.0.0.0`.
- **Inline scripts need the `%NONCE%`.** The CSP rejects anything else.
- **`sanitizeHtml()` rebuilds tags from an allowlist** — extend the allowlist, never loosen it to pass-through.
- **No stray control bytes.** A test scans every source file; two past production defects were invisible bytes from a patch script. Prefer the Edit tool over scripted rewrites; re-run `npm test` after any scripted edit.
- **Client modules the page imports** must be in `build-demo.mjs`'s copy list and the scaffold's `$engineFiles`, or the demo and scaffolded hubs fail to load.
- **Demo literals.** `build-demo.mjs` asserts exact string literals in `index.html` (placeholders, asset URLs). Moving them breaks the demo build — update both together.
- **Public repo hygiene.** No personal names, emails, hostnames, or machine paths in tracked files — use `D:/Work`, `C:/Users/you`, `Example_Workspace`. Real configs, `scan.json`, logs, `src/`, most of `images/` are gitignored; keep it that way.
- **Line endings** per `.gitattributes`: LF for js/mjs/json/md/html, CRLF for `.ps1`/`.vbs`. A `.ps1` with non-ASCII must be UTF-8 **with BOM**.
- **Scaffold skill changes land in `agent-skills` first**, then copy here byte-identical.

## Workflow

- **Single branch `main`** — no `mike_desktop`. Small direct commits are fine; roadmap-routine work arrives as PRs.
- Imperative-mood subjects, no Conventional Commits prefix (match `git log`).
- Ticking a P9 roadmap item adds a line to `docs/CHANGELOG.md` tagged *(roadmap: P9-NN)* in the same commit.
- `hub.mjs` changes need a hub restart to take effect; `index.html` changes need only a browser refresh.
- The watchdog restarts a stopped hub within 15 minutes — disable its task first if you mean to keep it down.
