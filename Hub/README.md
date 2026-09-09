---
title: Hub (shared source)
type: doc
area: My-IT-Tools/HTML-Project-Design
tags:
  - html
  - project-hub
  - source
summary: The one Project Hub program. Scanner, server, markdown renderer, watcher and UI, run as one process that nests every project under Projects/ inside one Projects folder in the tree. Bookmarks, recents and the search combobox shipped 2026-09-09.
updated: 2026-09-09
---

<a id="hub-top"></a>

<h1 align="center">⚙️ Hub — shared source</h1>

<p align="center">
  <em>One program. The workspaces are configuration.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/deps-0-2ea44f?style=for-the-badge" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/node-≥18.17-339933?style=for-the-badge" alt="Node 18.17+">
  <img src="https://img.shields.io/badge/tests-node--test-8B5CF6?style=for-the-badge" alt="node --test">
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-HTML_Project_Design-6B7280?style=for-the-badge" alt="HTML Project Design"></a>
</p>

---

Until 2026-08-31 this program existed three times, once per workspace, differing in four
values. Every fix had to land three times — and when one bad edit corrupted a regex, it
broke all three servers at once and nobody noticed for weeks. That got the program down
to one copy with three config folders (one process each). Since 2026-09-07 it's one
process, period — `../Project-Hub` holds the server's own config, and each project it
mounts gets a config folder of its own under `../Projects/`. See
[`../Docs/ROADMAP.md`](../Docs/ROADMAP.md) for both stories.

## Files

| File | What it is |
|:---|:---|
| `hub.mjs` | Scanner, static server, markdown renderer, filesystem watcher, config loader. Zero dependencies. |
| `index.html` | The whole UI — vanilla JS, no framework, no build. Carries `%TITLE%`, `%FAVICON%`, `%PORT%` and `%NONCE%` placeholders the server fills per request. |
| `pictures.mjs` | Independent asynchronous Pictures browse/search cache; project scans never walk this root. |
| `pictures-client.mjs` | Attaches only requested Pictures nodes to the client tree and retains them across project refreshes. |
| `pictures.test.mjs` | Lazy browse/search, cache invalidation, depth-limit, traversal, and watcher-noise regressions. |
| `reports.mjs` | PDF delivery and signed directory routes for sandboxed HTML reports and their companion assets. |
| `navigation.mjs` | Shared route helpers: heading routes, search routes, document links, search inclusion — plus the bookmark/recent list logic, kept pure so it is testable without a DOM. |
| `open-native.mjs` | Validated native launch requests; paths are environment data, not shell command text. |
| `reports.test.mjs` | Report HTTP, navigation, revision, refresh/recovery, and native-launch regression tests. |
| `Start-Hub.ps1` | The real launcher. Takes `-ConfigDir`; reads the port from that folder's config, and rotates the logs when they pass 1MB. |
| `Watch-Hubs.ps1` | Pings every hub's `/api/health` and restarts anything unwell, through `Start-Hub.ps1` so the port-identity rules still hold. Runs every 15 minutes as a scheduled task. |
| `run-watchdog-hidden.vbs` | Launches `Watch-Hubs.ps1` with no console window (see below) — this, not the script directly, is what the scheduled task's action points at. |
| `watchdog.log` | One line per watchdog run, detail when something was wrong (generated). |
| `hub.test.mjs` | `npm test` — markdown renderer, config validation, and a byte-level control-character scan. |
| `package.json` | Manifest, `engines.node`, scripts. No dependencies to install. |

## Running one

Normally you don't — each hub folder's `Start-Hub.ps1` shim does it for you. Directly:

```powershell
.\Start-Hub.ps1 -ConfigDir ..\Project-Hub
node hub.mjs --config ..\Project-Hub\hub.config.json
node hub.mjs --config ..\Project-Hub\hub.config.json --scan   # writes scan.json into that folder
```

`--port` overrides the configured port. Requires Node 18.17+ and `git` on PATH.
`open in VS Code` additionally wants `code` on PATH.

## Endpoints

| Path | What it does |
|:---|:---|
| `/api/scan` | Project/document tree, stats, repos, runtimes, root docs. Pictures is a metadata-only root. Gzipped. |
| `/api/stat` | Modification times for one folder's immediate children, keyed by name. On demand, for the list view. |
| `/api/file?raw=1` | The same document as escaped source instead of rendered markdown — the view-source toggle. |
| `/api/health` | Adds `readErrorPaths` — the last twelve failing paths and their errno, for the status panel. |
| `/api/pictures?path=` | Immediate children of a Pictures folder, or a file and its ancestor path. |
| `/api/pictures?action=search&q=&kind=&offset=&limit=` | Separate cached metadata search, up to 200 hits per page. Built only when requested. |
| `/api/pictures?action=status` | Pictures cache/index version and read/build metrics. |
| `/api/file?path=` | One text document, rendered to HTML. PDF/image input returns 415. |
| `/api/raw?path=` | File bytes, including PDF MIME and byte ranges; `&download=1` requests attachment delivery. HTML redirects to the contained preview route. |
| `/api/preview?path=` | Redirects an HTML report to its signed directory URL. |
| `/api/artifact/<signed-directory>/<relative-path>` | Report and companion assets, contained to the report directory after resolving junctions/symlinks. HTML/SVG carry a response-level sandbox. |
| `/api/open?path=` | Opens a path with PowerShell `Start-Process`; add `&in=code` for VS Code, or `&reveal=1` to select it in its parent Explorer window (`explorer /select,`) instead of opening it. Same-origin only. |
| `/api/events` | Server-sent events; one `change` per settled watcher burst. |

The watcher ignores three kinds of noise, all of which were measured driving real
rescans: build output and git internals, the hub's own logs (`hub.log`, `watchdog.log`,
`scan.json` all live inside a scanned root), and bare **directory** events — Windows
reports the parent directory alongside every file, and a directory name says nothing a
file event has not already said. That last one alone had the hub rescanning every ~8
seconds forever, because one repo rewrites a state file twice a second. The rule lives in
`ignoreWatchEvent()` and is covered by tests. Its one cost: a newly created *empty*
directory does not appear until something else triggers a scan.
| `/api/health` | Uptime, scan history, `readErrors`, `state`. 503 when unwell. |

Every response carries a Content-Security-Policy and is refused unless the `Host` header
is loopback.

## Sidebar context menu

Right-click any row in the tree — folder or file — for copy and launch actions (updated 2026-09-09). The same menu is on the sidebar's **Bookmarks** and **Recent** rows:

| Action | What it does |
|:---|:---|
| Add / Remove Bookmark | Pins the row, or unpins it. The label reflects the current state; same action as the header's `☆ bookmark` button and `Ctrl+D`. See [Bookmarks and recents](#bookmarks-and-recents). |
| Rename Bookmark | Bookmark rows only. Opens the same in-place editor as double-clicking the label, which is otherwise undiscoverable. |
| Copy Path | Absolute Windows path, backslashes. |
| Copy Relative Path | The tree id itself (drive-relative, `~/...` for user scope). |
| Copy Hub Link | Stable Hub URL for this item. The document header also preserves the current heading. |
| Copy as Markdown Link | Escaped `[name](<Hub URL>)`, including safe spaces and brackets. |
| Open / Open File | Same as the header button: PowerShell `Start-Process` on the path — browses into a folder, launches a file with its default app. |
| Reveal in Explorer | Reveals the row *selected* in its parent Explorer window (`/api/open?...&reveal=1`), rather than opening it. This is the one destination "Open" doesn't cover: a file's own containing folder. |
| Open in VS Code | `/api/open?in=code&path=...`. |

The menu distinguishes two kinds of absence. The synthetic Projects node has no path at all, so its path copies and launch actions are both disabled; it can still be bookmarked like any other row. A **pinned row whose file has gone missing** keeps its copy actions — the last known path is the useful thing when hunting for where a file went — and loses only the launch actions (`opts.missing` → `unlaunchable`, distinct from `virtual`). A pin the scan cannot describe gets a node synthesized from what the pin itself stores, so the menu never depends on the file still existing. Launch requests report invalid paths, missing files, and process failures; a successful response acknowledges the request, not a visually verified open application.

Originally implemented client-side as one `showCtxMenu()` in `index.html` (a `contextmenu` listener
on `#tree`, positioned/clamped to the viewport, closed on outside click/scroll/Escape) —
launch actions now use `open-native.mjs`, with paths passed through an environment variable to a fixed PowerShell command. `/api/open` returns 403/404/400 for invalid requests and 502 for launch failures.

## Pictures on demand

Pictures is a lightweight root in `/api/scan`. Expanding or opening a folder loads only its immediate children; following a picture deep link fetches that file and the ancestor path. Previously loaded folders are retained across ordinary project refreshes. Raw image delivery still uses `/api/raw`.

A search that includes Pictures gets a separate results section. Its metadata index is built asynchronously on the first relevant query and reused, with up to 200 results per page. Project-only searches and repo/skill/CLI queries do not build it. Search preserves the former scan depth limit of seven recursive levels; deeper folders are still browsable, and the UI explains the search boundary. Unreadable folders are disclosed rather than silently counted as complete coverage.

The Pictures watcher invalidates only Pictures and emits a `pictures` SSE event. Directory metadata `change` notifications are ignored; file changes and directory `rename` events invalidate the cache, so new empty folders appear too. `/api/health` reports `pictures.state`, version, cache counts, read errors, and search build duration. The main scan's node count now excludes the lazy subtree; Pictures counts live in the separate status data once indexed.

Measured on September 8: the ordinary payload fell from 118,220 to 40,191 nodes and from 1,675,465 to 921,701 gzip bytes. Fresh-scan directory walks fell from about 6.1 to 2.0 seconds; total scan time still varied with Git. The first image search on the final build took 1.384 seconds, with no image content read. See [P7 measurements and limits](../Docs/ROADMAP.md#p7-review). Refresh an existing browser tab to load this client change.

## Report browsing and recovery

PDF and HTML files have their own searchable types. Use `pdf:`, `html:`, or `image:` to narrow filenames; search shows the actual match total, a path for every result, and Load 200 More. Fuzzy matching and document-content search remain backlog items.

PDFs use the browser's native iframe viewer, with Open and Download when the browser cannot render them. HTML previews resolve companion files through a signed directory route; nested `charts/`, scripts, styles, fonts, and JSON work within that directory. Parent-directory escapes and root-relative assets are not supported. HTML/SVG responses enforce a sandbox even when opened directly; signed preview URLs expire on server restart, so bookmark the stable Hub link instead.

Document links retain heading fragments, and Copy Hub Link preserves the selected heading. Old `#Projects/...` links still work; section destinations use `#<encoded-file-id>?heading=<encoded-heading>`.

A search has its own route too, so Back returns to the results you came from rather than the
document you were on before them. Searching sets `#?q=<encoded-query>`, adding `scoped=1` when the
project-scope chip is on and `limit=<n>` once Load 200 More has been used; both are omitted at their
defaults to keep the URL short. Entering a search pushes one history entry and refining the query
replaces it, so typing does not add an entry per keystroke. A `limit` outside 200-20000 is clamped
rather than honoured. Because the query lives in the URL, a set of results is now a link you can
share or bookmark.

A failed refresh leaves the current page visible with a stale-data message and Retry. SSE reconnects also retry after a startup failure. File modification times now participate in the change signature, including same-size edits. `/api/health` exposes walk/Git/assembly/serialization/gzip timing fields under `lastScan.timings`.

The September 8 work passed 52 tests plus 11 live HTTP checks and a browser verification pass that confirmed nine acceptance criteria in Chrome. Narrow-pane layout and connection recovery are still unverified. See [the P7 shipping record](../Docs/ROADMAP.md#p7-review) for exact coverage and remaining work.

## Bookmarks and recents

**How to use them: [`../Docs/BOOKMARKS.md`](../Docs/BOOKMARKS.md).** What follows is how they work.

`#pins` sits between the Explorer header and the tree, holding two lists — manually pinned **Bookmarks** and an automatic 20-item **Recent**. Both start collapsed on every load; that state is deliberately not persisted, so a stored pin cannot make the startup sidebar noisier than it was before the feature existed.

The list logic is pure and lives in `navigation.mjs` (`parseList`, `toggleBookmark`, `renameBookmark`, `moveBookmark`, `pushRecent`, `resolveBookmarks`) so it is tested without a DOM; `index.html` owns the sidebar and the wiring. Three entry points — the document header's star button, the tree context menu, and `Ctrl+D` — all route through one `togglePin()`, so the button's `aria-pressed`, the menu label, and the sidebar cannot disagree. `Ctrl+D` prefers the tree's keyboard cursor over the open document.

`#pins` has its own `contextmenu` listener reusing `showCtxMenu()`, so pinned rows offer the same actions as tree rows. Rename dispatches a `dblclick` at the row's label rather than growing a second editor.

Storage is `localStorage`, two keys, `{path, label, addedAt}` and nothing else — no server component, no per-user server state, and no document contents. `parseList()` distrusts what it reads: a corrupted or older-format value returns an empty list rather than throwing, and duplicate paths collapse to one row.

Every scan re-resolves bookmarks against `S.byId`. A missing path is dimmed and kept, never dropped, because a temporarily unreadable folder must not silently eat pins; where exactly one node in the same root shares the basename, a single relink offer appears, and nothing is repointed automatically. `pinExists()` also asks `pictureNodes.owns()`, so a bookmarked photo that is legitimately unloaded is not called a dead link, and nothing is marked missing before the first scan lands.

Recent excludes `DIRISH` kinds, so folders you pass through do not fill it.

Rows are disambiguated in two tiers. `pinContext()` climbs the parent chain and stops at the first `repo` **or** scope-root ancestor, so one walk yields both cases: a file deep in a repo reports its repo, anything else reports its project or shared root. It renders right-aligned and dim, and is suppressed when it merely repeats the label. A path the scan does not hold — unresolved, or a Pictures node not yet loaded — has only its own parent folder to offer, so it falls back to that. Only when label *and* context still collide does the name itself pick up its parent folder, which is the two-READMEs-in-one-repo case; three `Agents` rows in three projects need no such help. That replaced an earlier collision-only rule that qualified names the context already distinguished, and it avoids keeping a hardcoded list of generic filenames.

Renaming swaps the label for an input in place rather than calling `prompt()`, which would block the whole page.

The search box is also a proper combobox as of the same day: `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`, and one `syncCombobox()` that assigns row ids at sync time so the arrow keys walk the document and Pictures listboxes as one contiguous sequence.

Together the September 8–9 work passes **64 tests** plus the live HTTP and browser checks recorded in [the P7 shipping record](../Docs/ROADMAP.md#p7-review).

## Folder list view

`viewFolder()` renders either cards or a four-column list — name, type, modified, size — chosen by a toggle in the folder header and remembered per browser in `hub.folderview`. Cards stay the default and are unchanged; the list is flat by design, since splitting it into titled groups is what the card view is for.

Columns sort by click, and **folders come first only for the name and type sorts**. Sorting by modified or size means the key *is* the question, and burying the file you edited a minute ago under seven month-old folders is the opposite of the answer. A folder's size column shows its child count, or `unopened` for a lazy Pictures node whose children have not been fetched.

**Modified times are fetched per folder, not scanned into the payload.** `mtime` is deliberately non-enumerable on scanned nodes (`stampNode`), because a timestamp on all ~40,000 of them is exactly the weight the Pictures pass spent itself removing. `folderStamps()` reads one directory's immediate children — no recursion, no file contents — and `/api/stat` returns it keyed by **name**, since the client already holds the ids and repeating the folder prefix per row is the same waste at a smaller scale. The endpoint goes through the same `resolveId()` gate as every other path-addressed route: 403 outside the roots or inside a secret directory, 404 for anything that is not a readable directory.

The client caches one response per folder and invalidates the whole cache when a new scan lands, so a timestamp can never outlive the scan it was read under; a reply arriving after that invalidation is dropped rather than repopulating it, the same rule the Pictures cache follows. Measured on a 1,250-entry folder: **39 ms and 47 KB** for the stat call, **zero long tasks and 0 ms total blocking** for the render.

## Reader tools

A long README is a document, not just a file. `viewFile()` gives markdown five things, all in the panel header except print, which is a document-level action and lives with the header buttons.

| Tool | How it works |
|:---|:---|
| **Outline** | Built from the headings that actually rendered, so it can never disagree with the document. Clicking one scrolls and writes the same `?heading=` route a cross-document link would reach, so the two cannot drift. |
| **rendered / source** | Mirrors the HTML preview tabs. Source is `?raw=1` on `/api/file`, honouring the note left when `raw` was removed from every reply — it was 44% of the bytes of a large README. Session state, like `S.htmlMode`. |
| **Copy buttons** | One per `pre.code`, appended to the rendered block so it copies exactly what is on screen. Hidden until hover or focus. |
| **Width and size** | `↔` cycles full → 82ch → 64ch, `A` cycles 100 → 112 → 125 → 90%. Both set CSS variables on the `.md` container. The measure is a `ch` unit, so it tracks the text size rather than fighting it. |
| **Print** | A `@media print` block that hides every bit of chrome and prints the document in black on white. |

Two placement details. The measure applies to `.md > *`, not `.md`: the panel chrome stays full width, and a wide table or code block is held to the measure and scrolls inside it — both already carry `overflow-x`, so nothing is clipped. And width and size persist (one `hub.reader` key holding two **names**, not indexes, so a stored value cannot silently mean something else when either list changes), while the source toggle and the outline are per-session — the same split the HTML preview tabs already use.

## Image browsing

Image cards carry a thumbnail, and the viewer has real controls: **fit / 100% / − / +** zoom, the image's natural dimensions, **prev / next** through the images in the same folder with a `3 of 1250` counter, and left/right arrow keys.

Thumbnails are `loading="lazy"` and `decoding="async"` — native lazy loading is the whole mechanism, so there is no observer to write or get wrong. Measured on a 1,250-image folder: **40 fetched, 32 KB, zero blocking**. They use `object-fit:contain`, because these folders hold as many icons and diagrams as photos and a thumbnail that crops the subject out of frame is worse than one with space around it.

> **ponytail:** the browser downscales the full file rather than a generated thumbnail. A real thumbnail cache needs an image decoder, which this zero-dependency server has not got. Revisit only if a folder of very large originals actually feels slow.

Zoom is session state shared across images, so flipping through a folder at 100% stays at 100%; `null` means fit, which is what the viewer has always done. Arrow keys only apply while an image is open and neither the tree nor the search box has focus — both already own the arrow keys — and `Alt`+arrow stays Back/Forward.

### The SVG sandbox, and why images were blank

Building this surfaced a **pre-existing defect from P7-06** (2026-09-08). SVG is active content, so `/api/raw` gave it the report sandbox CSP — but a `sandbox` directive puts the response in an opaque origin, and Chrome then refuses to decode it inside an `<img>` at all: a blank box, `naturalWidth === 0`, and **no error event to catch it**. That silently broke every SVG preview and every SVG embedded in a markdown document for a day, and it is why the first thumbnail pass rendered 1,250 empty frames.

The fix negotiates on `Sec-Fetch-Dest`, which the browser sets and page script cannot forge: a request whose destination is `image` gets the hub's ordinary strict CSP, because the HTML spec already disables scripting for SVG loaded as an image, so the sandbox buys nothing there. **Every other destination — document, iframe, object, empty, or absent — keeps the sandbox**, which is the case P7-06 was actually about. Failing closed on a missing header keeps a non-browser client sandboxed. A regression covers all six destinations.

## Scan status detail

`● scanned 09:32` was the whole story, and a green `ready` sat on top of nineteen read errors without a word. Clicking the status line (or pressing Enter on it — it is a real button) opens a panel with the numbers behind it: last successful scan and its age, duration, node count and gzipped payload, the walk/git/assemble/serialize/gzip split from `lastScan.timings`, the mounted projects, the Pictures state, and the read errors.

**The read errors are the point.** A count is not actionable, so `noteReadError()` keeps the last twelve failing paths with their errno — bounded, deduplicated by path, and paths only, never content. `/api/health` exposes them as `readErrorPaths` with relative ids, and any that is still in the tree is clickable straight to the document. `readErrors++` now exists in exactly one place, which a regression pins so a future call site cannot go back to a bare increment. On this workspace the panel immediately named what the count had been hiding: `EISDIR` and `ENOENT` under `~/.gemini/skills/`.

The panel reuses the context menu's floating layer wholesale — same element bookkeeping, same dismissal on Escape, outside click, scroll, resize and blur — so there is only ever one floating layer, and opening a tree context menu replaces it.

**The indexing text was also wrong.** "only docs and config are indexed" predated PDF, HTML-report and image support and understated `DOC_FILE` badly. Folder pages now say *"N other files here that the index skips — see what's indexed"*, and that phrase opens the panel's **What gets indexed** section rather than pointing nowhere. A regression asserts the panel's file-type list still matches `DOC_FILE`, so the replacement cannot rot into a new lie.

## The watchdog

The AI Lab hub died of a file-descriptor leak on 2026-08-31 and nobody noticed for hours,
because nothing was checking. `Watch-Hubs.ps1` is what checks now, registered as a
scheduled task on the same day:

| | |
|:---|:---|
| Task | `\AI-Maintenance\Project Hub Watchdog (15 min)` |
| Runs | every 15 minutes, as `mikes`, through `run-watchdog-hidden.vbs` → `pwsh -NoProfile -ExecutionPolicy Bypass -File Watch-Hubs.ps1 -Restart -Quiet` |
| Log | `watchdog.log` beside this file — one line per run, trimmed at 512KB |
| Exit code | `0` all healthy, `1` something needed attention |

> [!WARNING]
> **The task's action must stay pointed at `run-watchdog-hidden.vbs`, not `pwsh.exe`
> directly.** It originally ran `pwsh.exe -NoProfile ... -File Watch-Hubs.ps1` straight
> from Task Scheduler, which popped a visible PowerShell window every 15 minutes —
> noticed 2026-09-07. `-WindowStyle Hidden` alone doesn't reliably fix this: it only
> hides the console *after* Windows creates it, and with Windows Terminal as the
> default terminal application the window can still surface visibly (same trap as
> DeepSeek Harness's `run-hidden.vbs`, 2026-08-24). The VBS wrapper's
> `WScript.Shell.Run(cmd, 0, True)` creates the process hidden from the start and waits
> for it, so `Last Result` in Task Scheduler still reflects the script's real exit code
> — verified via a manual `schtasks /Run` after the fix (`Last Result: 0`, log line
> written normally, no window).

It restarts through `Start-Hub.ps1`, so a process that merely happens to hold the port is
still never killed. Verified by killing a hub outright: detected and back up in seven
seconds, with the whole thing in the log.

```powershell
.\Watch-Hubs.ps1                      # report only
.\Watch-Hubs.ps1 -Restart             # what the scheduled task runs
schtasks /Change /TN "\AI-Maintenance\Monitoring\Project Hub Watchdog (15 min)" /DISABLE
```

**A hub you stop on purpose comes back within 15 minutes.** Disable the task first if
that is not what you want.

## The config

Since 2026-09-07 there are two config shapes, not one — the server's own (port, title,
favicon: there's only one process now) and one small config per project it mounts.

**The server config** (e.g. `../Project-Hub/hub.config.json`):

```json
{
  "name": "Portfolio",
  "port": 4273,
  "title": "Project Hub",
  "base": "D:/AI_Agents",
  "favicon": { "glyph": "/", "ink": "#5fe3a1", "line": "#2f6b52" },
  "sharedRoots": [
    { "name": "Documents", "dir": "D:/AI_Agents/Documents", "tint": "var(--red)" },
    { "name": "Pictures", "dir": "C:/Users/you/OneDrive/Pictures", "tint": "var(--orange)" }
  ]
}
```

| Key | Required | What it does |
|:---|:---:|:---|
| `port` | ✅ | Integer 1024–65535. |
| `base` | ✅ | The workspace drive root. Every id in the tree is a path relative to this, and `/api/*` refuses anything that resolves outside the mounted roots. |
| `name` | | Cosmetic — the startup log line and `/api/health`'s `workspace` field fall back to it when no project is discovered. Defaults to `Portfolio`. |
| `title` | | Browser tab title. Defaults to `Project Hub — <name>`. |
| `favicon` | | `{ glyph, ink, line }` — one or two characters and two hex colors. The SVG is built server-side. There is exactly one favicon per process; it is not per-project. |
| `sharedRoots` | | `[{ name, dir, tint }]` — folders mounted next to every project. `tint` is any theme colour var and defaults to `var(--dimmer)`. A root named **`Pictures`** additionally turns on the picture library; without one those endpoints are inert. |

> [!NOTE]
> **`base` and `sharedRoots` are the only machine-specific values in the codebase.** They
> used to be `const`s in `hub.mjs`, which meant a checkout on another disk was a source
> edit. Both real configs are gitignored — copy `hub.config.example.json` and
> `../Projects/_example/hub.config.json.example` and point them at your own paths.

The config folder is also the server's own directory — `hub.log`, `hub.err.log` and
`scan.json` are written there.

**A project config** (e.g. `../Projects/Mikes_AI_Lab/hub.config.json`):

```json
{
  "name": "Mikes_AI_Lab",
  "dir": "D:/AI_Agents/Projects/Mikes_AI_Lab",
  "repoScope": { "groups": ["Live_Apps", "Other_Apps", "Tools", "Draft"] }
}
```

| Key | Required | What it does |
|:---|:---:|:---|
| `name` | ✅ | Display name of the project root, and the label on the tree's top node. |
| `dir` | ✅ | Absolute path to the workspace. Backslashes and a trailing slash are normalised. |
| `repoScope` | | Which of *this project's* repos reach its overview table: `groups` for a `Repos/<group>/` tier, `pathPrefix` for a flat `Repos/`, neither for all. Setting both is rejected. |

`loadConfig()` validates the server config (`port` required); `loadProjectConfig()`
validates a project one (`name`+`dir` required, no `port`) — both share the same
dir-normalization and `repoScope` XOR-checking helpers, so the two validation paths can't
quietly drift apart.

`discoverProjects()` finds every `Projects/<name>/hub.config.json` at startup (sorted
alphabetically by folder name) and builds one node per project — but instead of putting
those at the top level, `scanTree()` nests them all under one synthetic `@projects` node
(`kind: 'projects'`) so the tree shows a single **Projects** folder rather than three more
top-level roots next to Documents. `SHARED_ROOTS` (whatever `sharedRoots` names — here
`Documents`, `My Custom Skills`, `Pictures`, `Automations`, `Links`) stay top-level, and
— along with `USER_RUNTIMES`
(`~/.claude`, `~/.codex`, `~/.gemini`, `~/.agents`, `~/.config/opencode`) — are identical
regardless of which projects are mounted, so they stay hardcoded in `hub.mjs` and are
scanned exactly once no matter how many projects there are — before the merge, running
three hubs meant scanning this same content three times over.

Shared roots — and every ordinary directory the walker visits — carry `docFirst: true` whenever
they hold a `README.md` (or `index.md`/`INDEX.md`). The flag is the whole mechanism behind the
README-first landing view: `renderPage()` checks `docFirst && doc` before it dispatches on
`kind`, so such a node reaches `viewDocFirst()` instead of `viewOverview()`/`viewFolder()`.

What does **not** get the flag is the interesting half, and it is decided at the point the node
is built rather than by a name check in the client:

- **Project roots.** `SHARED_ROOTS.map()` passes `shared` explicitly; `PROJECTS.map()` is
  arrow-wrapped so `Array.map`'s index argument cannot become a truthy `shared` for every
  project after the first. (It did, once. The symptom is silent and looks like a scan bug.)
- **CLI runtimes** (`kind === 'cli'`), which have `viewCli()` — a real page, not a fallback.
- **Repos, and bucket entities** (skills, commands, sub-agents, routines, styles, hooks), which
  are built in their own branches of `walk()` and already render their document beside the git
  box or the metadata box.

The net effect on this machine is roughly 1,600 folders opening on their own README, and
every purpose-built page untouched.

A shared root may nest inside another one — `Links` is `Documents/Links`, mounted separately
because it is a destination in its own right rather than a branch of the docs tree. `MOUNTED_ROOTS`
(every root's dir, lowercased) is checked in `walk()` beside the `SKIP_DIRS` and dot-dir rules, so
the `Documents` walk stops at that folder instead of indexing the same subtree a second time
under a second parent with the same node ids.

The `@projects` node has no filesystem path of its own — nothing to `git`, copy, or open
— so it gets its own client-side view (`viewPortfolio()`, unchanged name) instead of
falling through to the generic folder view that would try to build "open"/"copy path"
buttons from a path that doesn't exist. Client-side, `topAncestorOf(id)` (used
everywhere a repo/runtime/search hit needs to know which project it belongs to) stops
climbing at the nearest `root`/`docroot`/`userroot` ancestor rather than climbing all
the way to "no parent" — otherwise, with projects nested one level deeper now, it would
climb straight past the project and land on the Projects folder itself.

`My Custom Skills` is `Documents/Agent-Resources/Skills/.My-Custom-Skills` — already
inside the `Documents` root, but dot-prefixed to keep Obsidian from indexing it, which
also puts it behind the walker's dot-directory rule. Mounting it as its own root shows it
at the top of the tree instead of three levels down, and leaves `DOT_OK` alone.

`Pictures` is `C:/Users/<you>/OneDrive/Pictures` — outside `D:/AI_Agents` entirely, so it
gets its own root rather than a spot under an existing one. Image files anywhere in any
root (not just this one) render as `kind: 'image'`: `kindOfFile()` recognizes
`png/jpg/jpeg/gif/svg/webp/avif/bmp/ico`, and the UI shows them inline via `/api/raw`
instead of trying to load them as text.

## Adding a project

1. Make a folder under `../Projects/`, named after the project.
2. Write a `hub.config.json` in it — `name`, `dir`, and `repoScope` if it needs one. No
   port, no favicon — those belong to the one server config, not to a project.
3. `npm test` — the suite checks the new config parses and its `dir` exists.
4. `.\Start-Hub.ps1 -Restart` from `../Project-Hub` (the server reads `Projects/` once at
   startup, so a new project needs a restart to be picked up — same as any other
   `hub.mjs` change).

There is no longer a per-project port, favicon, or `Start-Hub.ps1` shim to copy — those
belonged to the old one-process-per-project design. Adding a *server* (a genuinely
separate instance, its own port) is the old procedure: a sibling folder next to
`Project-Hub`, a server-shaped `hub.config.json`, a copy of `Start-Hub.ps1` — but that's
now a rare thing to want, since mounting another project inside the existing one is
almost always the right move instead.

## Tests

```powershell
npm test          # node --test hub.test.mjs reports.test.mjs pictures.test.mjs
```

Sixty-four tests, no framework or dependencies to install. Report and stat tests create and clean isolated temporary fixtures, including a junction-escape check.

The September 9 additions are mostly of two shapes. **Pure logic**, testable with no DOM: the bookmark list (storage round-trips with junk and duplicate input, Recent's ordering, deduplication and cap, an unresolved entry surviving a scan and recovering when its file returns) and `folderStamps` (names not ids, immediate children only, `null` for a non-directory). **Wiring checks over `index.html` and `hub.mjs`**, which catch the thing a unit test cannot: that `/api/stat` still goes through `resolveId`, that a new scan still invalidates the timestamp cache, that `readErrors++` still has exactly one call site, that source view is still gated behind an explicit `raw=1`, that thumbnails are still lazy, that the arrow keys still yield to the tree and to text fields, and that no `localStorage` key outside the known set is ever written. Plus one HTTP test covering the SVG sandbox across all six fetch destinations.

The one that matters most is the least interesting to read — `no stray control bytes in
any source file`. Both production defects found in the August audit were invisible
characters written by a careless patch script.

The next most valuable are the eight around `sanitizeHtml()`. Raw HTML in a README is
passed through so house-style headers keep their logo hero and badge rows, and the filter
that used to guard it was defeated two ways during the audit. It now tokenises each tag
and **rebuilds** it: a tag has to be on the allowlist to survive, an attribute has to be
on its tag's list to exist, `href`/`src` are scheme-checked, and every value is re-quoted
and re-escaped. Raw HTML is buffered across lines too, so a tag split over several lines
is filtered as one tag rather than in halves.

That filter and the Content-Security-Policy are not redundant. The CSP is what makes a
bypass harmless; the filter is what stops there being one.

---

<p align="center">
  <a href="../README.md">← HTML Project Design</a> ·
  <a href="../Docs/ROADMAP.md">Roadmap</a> ·
  <a href="../Project-Hub/README.md">Project Hub →</a>
</p>

<p align="right"><sub><a href="#hub-top">back to top</a></sub></p>
