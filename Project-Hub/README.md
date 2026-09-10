# 🚀 Project Hub

A local navigation UI for your project workspaces, shared documents, pictures, and user-scope agent configuration. Configure the roots on your machine using the [setup guide](../README.md#-setup).

The [project-hub-scaffold-mfs skill](../Skills/project-hub-scaffold-mfs/SKILL.md) adds workspaces to this server or creates a portable installation.

Nothing is hard-coded. Every repo, runtime, skill, command, sub-agent, hook, MCP server,
and doc on the page comes from a live filesystem scan, and the page re-renders on its
own when anything changes.

**One process, any number of project roots.** Until 2026-09-07 each workspace ran its own hub on
its own port, independently re-scanning the same Documents/Skills/Pictures/Automations
content. Now one process scans the shared roots once and nests each project workspace
under one **Projects** folder in the tree — click a project to see it scoped on its own,
or click **Projects** itself (the default landing page) for the combined picture across
all mounted workspaces. The sidebar opens collapsed except the path to whatever you're currently
looking at. See [Changing what this hub scans](#changing-what-this-hub-scans) for how a
project is configured now, and [`../Docs/ROADMAP.md`](../Docs/ROADMAP.md) for the merge
itself.

Since the 2026-08-23 consolidation most of the generic skills and sub-agents live in
`~/.claude` rather than in any one repo, so a hub that only looked at the project tree
showed a small fraction of the real setup. Runtimes are therefore split into two named
categories everywhere they're listed — **Project CLIs** (a workspace's own `Agents/`) and
**User CLIs** (`~`) — and the second is a root of its own in the tree. That gap closes — see [User CLIs](#user-clis).

## Run it

```powershell
.\Start-Hub.ps1              # starts the server and opens http://127.0.0.1:4273
.\Start-Hub.ps1 -Restart     # pick up code changes to ..\Hub\hub.mjs
.\Start-Hub.ps1 -Port 5000
```

Or directly:

```powershell
node ..\Hub\hub.mjs --config .\hub.config.json                # serve on 4273
node ..\Hub\hub.mjs --config .\hub.config.json --port 5000
node ..\Hub\hub.mjs --config .\hub.config.json --scan         # write scan.json and exit
```

Requires Node 18+ and `git` on PATH. No dependencies, no build step.

## What you get

| View | Shows |
|:---|:---|
| **Projects** (landing page) | The Projects folder's own view — combined stats and a repos table across all mounted workspaces projects, each row tagged with which one it belongs to. Click a project (card or sidebar) to see it scoped on its own. |
| **Overview** | One project, scoped: a stat strip that doubles as the table of contents, then the three sections it points at, in order: **Repos** (that project's own, with live git state), **Readmes** (its root docs), and its agent runtimes last in two labelled groups — **Project CLIs** and **User CLIs**. |
| **Stat strip** | Runtimes / repos / skills / commands / sub-agents / MCP servers / uncommitted, each noting the user-scope share. Every tile is a link: clicking one scrolls to its section and flashes the heading. Repo counts jump to **Repos**, artifact counts to the agents block. |
| **CLI runtime** | A `project scope` / `user scope` tag matching its category, config file chips (`CLAUDE.md`, `.mcp.json`, `.env`…), then a masonry column per bucket — skills, commands, sub-agents, hooks, output styles, routines, MCP servers, and (user-scope Claude Code) installed plugins — so expanding one long panel only pushes what's below it in its own column, not every panel beside it. A project CLI (Claude/Codex/Gemini/Antigravity/OpenCode) that matches a user-scope runtime gets a second, clearly labeled **Inherited from user scope** block below its own, with a link to the full user-CLI page — see [Inherited artifacts](#inherited-artifacts). Each file-backed item is titled from its frontmatter `name` and blurbed from its `description`; MCP servers and plugins are read out of config instead. |
| **Repo** | Rendered `README.md`, a git panel (branch, state, ahead/behind, remote), the latest commit, a link to the repo's `CLAUDE.md`/`AGENTS.md`, and its top-level files. |
| **Folder** | A card per child, with the child's own README blurb. A folder that holds CLI runtimes (`Agents/`, the `User CLIs` root) leads with them under their category heading and its artifact counts, then everything else under **Folders & docs**. |
| **Skill / command / sub-agent / hook** | The rendered doc. Its YAML frontmatter is read for the title and blurb, not shown in the body. |
| **File** | Markdown rendered; HTML preview/source; PDF preview with Open/Download fallback; other text as source. |
| **Search** | `⌘K` / `Ctrl+K`. Ranks by kind — runtimes and repos above folders and docs. |

Two chrome controls sit outside the views:

| Control | Does |
|:---|:---|
| **Sidebar** | The `«` / `»` button at the left of the breadcrumb bar (or `⌘B` / `Ctrl+B`) folds the panel away and back. It lives in the header rather than the panel so it stays put in both states — and stays clear of the explorer's own `collapse all` link, which is a different thing: that one closes every open tree node without hiding anything. |
| **Back / Forward** | The `‹` / `›` buttons next to the sidebar toggle walk the hash history — same effect as the browser's own Back/Forward, just reachable when that chrome isn't (VS Code's Simple Browser keeps its arrows on the tab toolbar, above the page). `Alt+←` / `Alt+→` do the same from anywhere on the page. |
| **README as the landing view** | **Any folder that documents itself opens on its own README** — the shared roots (`Documents`, `Links`, `Automations`) and every sub-folder down the tree, rather than on a card grid or a stats overview. A folder with no `README.md` (or `index.md`/`INDEX.md`) skips all of this and behaves exactly as before. One button in the header — `⊞ folder`, or `⊞ overview` on a root — drops to the view it would otherwise have had, and `☰ readme` comes back; the switch is per-folder and lasts the session, so a fresh open always lands on the README. **Project roots, CLI runtimes, repos, skills, commands, sub-agents and routines are excluded** — each has a purpose-built page, and the repo and entity pages already render their document beside it. |
| **Color scheme** | The picker beside **rescan**, eight schemes — six dark: `midnight` (default, terminal green), `oxide` (warm amber), `cobalt` (blue/cyan), `plum` (violet on aubergine), `nord` (muted arctic blue-grey), `mono` (pure greyscale, no hue); and two light: `paper` (ink on warm white) and `sepia` (brown ink on aged cream). Every color in the UI resolves from one block of CSS variables, so a new scheme is a copied block, an `<option>`, and a name in the `THEMES` array. |

Both remember themselves in `localStorage`, and the scheme is applied before first
paint so a non-default one doesn't flash midnight on load.

The whole UI is sized in px off one knob — `--zoom` on `:root`, currently `1.15`.
Change that single value to scale everything together. (`#app` divides it back out
of its `100vh`; Chrome doesn't shrink the containing block to match a root `zoom`,
so without that the page would run 15% past the bottom of the screen.)

**Pictures performance update:** Pictures now loads one folder at a time, with deep links resolved on demand and a separate, paginated metadata-search section. Ordinary project scans never walk the photo tree. The initial scan payload is about 45% smaller over the wire; see [P7 measurements](../Docs/ROADMAP.md#p7-review). Picture search retains the previous depth limit, while deeper folders remain browsable. Reload this tab to use the updated interface.

**September 8 update:** PDF and HTML reports now appear in filename search (`pdf:` / `html:`), with accurate total counts and Load 200 More. HTML companion assets resolve within the report directory, and previews have response-level isolation. Document links preserve heading destinations; **Copy Hub Link** captures a reopenable URL. Failed refreshes keep the current page visible with Retry. A browser pass later that day confirmed all of this in Chrome and fixed the one defect it found: Back from a search result now returns to the results. Reload an existing tab to load these changes. See [P7 status and verification](../Docs/ROADMAP.md#p7-review) for delivered work and what is still unverified.

Markdown renders with the repo's own HTML header blocks intact (logo heroes, badge
rows, centred titles), relative images resolved through the server, and relative links
wired to jump inside the hub. YAML frontmatter is stripped before rendering — it is
vault metadata for Obsidian and the agents, so every doc opens on its real first line
rather than a block of `title:` / `tags:` / `updated:`. The scanner still parses it for
the `name` and `description` it uses as titles and blurbs.

## Page order

The overview reads top to bottom as *what you have → what you ship → what explains it →
what builds it*:

1. **Stat strip** — the counts, and the page's own table of contents.
2. **Repos** (`#sec-repos`) — the table, with live git state.
3. **Readmes** (`#sec-docs`) — the root docs for each scanned root.
4. **Project CLIs** (`#sec-project-clis`) and **User CLIs** (`#sec-user-clis`) — the
   runtime cards, last because that block is the tallest and the one you scroll into
   rather than past.

The stat tiles carry a `link` field naming the heading id they scroll to, set server-side
in `../Hub/hub.mjs` alongside the count itself, so a new stat wires its own jump. Two notes on
the scroll:

- `#view` is the scroll container, not the window — the page body never scrolls, so an
  ordinary `href="#id"` anchor would do nothing. `jumpTo()` moves `#view.scrollTop` by
  hand.
- `scrollIntoView({behavior:'smooth'})` is a **silent no-op** under the `zoom` on
  `:root`; it resolves without moving anything. The jump is deliberately instant, and the
  landed-on heading flashes for 1.4s so you can see where you ended up.

## User CLIs

Three roots, not two. The third is the home directory, and it holds the runtimes that
apply to every repo on the machine rather than to one project:

| Runtime | Directory | Walked | Hooks config |
|:---|:---|:---|:---|
| **Claude Code** | `~/.claude` | `skills/`, `agents/`, `commands/`, `output-styles/`, `hooks/`, `rules/`, `routines/` | `settings.json` → `hooks.*` (JSON) |
| **Codex** | `~/.codex` | `skills/`, `rules/`, `prompts/`, `plugins/` | `config.toml` → `[[hooks.*]]` (TOML) |
| **Gemini** | `~/.gemini` | `skills/`, `extensions/`, `commands/` | `settings.json` → `hooks.*` (same JSON shape as Claude Code) |
| **Agents (shared)** | `~/.agents` | `skills/` | — |
| **OpenCode** | `~/.config/opencode` | `skill/`, `command/`, `agent/` | — (hooks are JS/TS plugin exports, nothing declarative to read) |
| **Antigravity** | `~/.gemini/antigravity-cli` | `builtin/skills/` | `~/.gemini/config/hooks.json` — a sibling folder, not under the CLI root above |

Each becomes an ordinary `cli` node, so the runtime page, the counts, the tree, and
search all work on it unchanged. The two category labels live in one `SCOPE` table in
`index.html`; the overview, the folder pages, and the runtime tag all read from it, so
renaming a category is a one-line edit. Only the declared sub-dirs are walked — `~/.claude`
also carries sessions, caches, and a few hundred megabytes of plugin checkouts.

### Routines

`routines/` is walked differently from the buckets above, because a routine is not a
file. These are not a Claude feature -- every one of them is a **Windows Task Scheduler
job** that shells out to headless Claude Code, and `~/.claude/routines/` is just where
their definitions, prompts and logs happen to live. Eight carry a `routine.json` and
were registered by `bin/Register-Routine.ps1`; three carry a `job.json` and wrap an
AI-Maintenance task that already existed in Task Scheduler before any of this. Each job
folder holds that JSON plus some of `prompt.md`, a `README.md`, and a `logs/` directory. Handing that to the generic walker gets it wrong twice: every job
comes back as a plain folder, and `bin/` is on the prune list so the runner scripts
disappear. So `buildRoutines()` reads the JSON instead and emits one `routine` node per
job, carrying its schedule, Task Scheduler name, runner script, target repo, branch
prefix, and — from the log directory, the only record that any of this actually fires —
how many runs it has and when the last one was.

The entity page swaps the usual Meta box for a **Schedule** box with those fields, and
adds chips through to `prompt.md`, the JSON, and the newest log. The seven roadmap jobs
ship no README, so their page body and description come from `prompt.md`; the three
`job.json` wrappers have neither, and fall back to the JSON itself.

### Hooks

A `hooks/` directory walk (the bucket Claude Code's table row lists above) only ever
covered a **folder of scripts**. Real lifecycle hooks — run this command on this event —
are declared in config instead, and the shape is different per vendor, confirmed against
each CLI's own docs (2026-09) rather than assumed from Claude Code's:

- **Claude Code** and **Gemini** both use the *same* `settings.json` JSON shape:
  `hooks.EventName[]` → `{matcher, hooks:[{type:"command", command}]}`. One parser,
  `readHooksJson()`, covers both.
- **Codex** declares hooks in `config.toml` as TOML array-of-tables —
  `[[hooks.EventName]]` (+ an optional `matcher` line) followed by one or more
  `[[hooks.EventName.hooks]]` command tables. `readHooksToml()` line-scans for these
  rather than pulling in a TOML dependency the rest of the hub doesn't need.
- **Antigravity** keeps hooks in a wholly separate `hooks.json`, nested
  `hookName → event → {matcher, hooks:[...]}`. That file lives at
  `~/.gemini/config/hooks.json` — a **sibling** of `~/.gemini/antigravity-cli/`
  (Antigravity's own root above), not inside it, so `SERVE_DIRS` explicitly adds that
  folder alongside the runtime directories. `readHooksAntigravity()` parses it.
- **OpenCode** has nothing to read here: its hooks are JS/TS functions a plugin module
  exports, not a config key `opencode.jsonc` declares.

Each project CLI's own scope gets the same treatment one level under its
`Agents/<vendor>/` root — `PROJECT_HOOK_SOURCES` maps the vendor folder name to its
config path(s): `.claude/settings.json` + `.claude/settings.local.json` for Claude,
`.codex/config.toml` for Codex, `.agents/hooks.json` for Antigravity. A project's hooks
count toward its own `counts.hook`, exactly like the routine or MCP-server counts above.

Every hook row's `id` points at the config file it came from — there's no separate file
per hook to open, so clicking one opens that file. `bucketGrid()` on the client merges
these config-derived rows into the same "Hooks" panel as any real `hooks/` script files,
so a runtime with both kinds shows one combined list rather than two panels with the
same label.

MCP servers are the one artifact with no file of its own, so they're lifted out of
config: `mcpServers` from `~/.claude.json`, `~/.gemini/settings.json` and each repo's
`.mcp.json`, and `[mcp_servers.*]` tables from `~/.codex/config.toml`. User-scope
plugin installs come from `~/.claude/plugins/installed_plugins.json` the same way.

Two deliberate limits:

- **`extensions/` doesn't count toward the totals.** Gemini's `google-workspace-cli`
  extension alone ships ~95 skills; counting a vendor's library as part of the portfolio
  turned "53 skills" into "148". The folder is still browsable — its contents just don't
  roll up.
- **`~/.claude.json` is never served.** It is 320KB of session telemetry, and the only
  part the hub needs (the MCP server names) is already in the scan payload. Every other
  `/api/*` path is checked against the roots, the six runtime directories above, and
  `~/.gemini/config` (Antigravity's hooks.json folder, per Hooks above).

User-scope ids carry a `~/` prefix (`~/.claude/agents/api-designer.md`) rather than
being drive-relative; `resolveId()` on the server and `absOf()` on the client both
understand the two forms.

## Inherited artifacts

A project CLI's own page only ever showed what lives in its own `Agents/<vendor>/`
folder — but the runtime actually running there also picks up everything in the
matching user-scope config, and that other half was invisible unless you separately
opened the **User CLIs** page and remembered which one to compare it to.

`hub.mjs` closes that gap with one small join: after both trees are built, every
`project`-scope runtime is matched to a `user`-scope one by name (`VENDOR_ALIAS` —
Claude → Claude Code, Codex → Codex, Gemini → Gemini, Antigravity → Antigravity,
OpenCode → OpenCode) and stamped with `userCli`, the matched node's id. A project
runtime with no user-scope counterpart (`Other/KiloCLI`, `Other/Kimi`,
`Specialized`) just has no match and its page looks like it always did.

`viewCli()` in `index.html` renders the project runtime's own bucket grid first,
then — only when `userCli` resolves — a second, separately headed **Inherited from
user scope** grid built from the matched runtime, plus a jump link to its full page.
Both grids come from one `bucketGrid(node, keyPrefix)` helper; `keyPrefix` namespaces
each panel's fold-open/closed memory (`localStorage`) so collapsing "Skills" in the
project block doesn't also collapse it in the inherited one.

Each grid itself lays its panels out as a **CSS multi-column masonry**
(`.buckets{columns:300px 3}`, each `.panel{break-inside:avoid}`) rather than a grid —
panels stack top-to-bottom within a column in source order, so expanding a long one
(Skills, usually) only pushes what's below it in that same column, instead of
stranding Commands/Hooks in a mostly-empty grid row the way `display:grid` did before.

## Auto-detection

The server watches the two project roots recursively, plus each user-scope artifact
sub-dir individually — watching `~/.claude` wholesale would fire on every session write. On any change outside the ignore list it
pushes an SSE event; the page rescans and repaints — **no reload, no rescan click.**
Add a skill to `Agents/Claude/.claude/skills/` and it appears in the Claude runtime
column within a second or two, with the counts updated.

Repaints are skipped when a rescan produces an identical tree, so background churn in
some unrelated folder doesn't throw away your scroll position or selection.

## How the scan decides what things are

| Rule | Result |
|:---|:---|
| `Agents/<name>/` containing `CLAUDE.md` or `AGENTS.md` | **CLI runtime** — even if it's also a git repo (Codex is both). |
| `Repos/<group>/` | **Group** (`Live_Apps`, `Other_Apps`, `Tools`, `Draft`). |
| Any directory containing `.git` | **Repo** — and the walk continues into it, so every folder and doc inside is in the tree, the breadcrumbs, and search. Files are doc-filtered (see below). |
| `skills/`, `commands/`, `agents/`, `hooks/`, `output-styles/` inside a config dir (`.claude`, `.codex`, `.agents`, …) | **Artifact bucket** — each entry becomes a skill / command / sub-agent / hook / output style. |
| `~/.claude/routines/jobs/<job>/` holding `routine.json` or `job.json` | **Routine** — one scheduled job, read from its JSON rather than walked. See [Routines](#routines). |
| `~/.claude`, `~/.codex`, `~/.gemini`, `~/.agents`, `~/.config/opencode` | **CLI runtime, user scope** — grouped as **User CLIs**, see [User CLIs](#user-clis). |
| Everything else | Folder, markdown doc, config file, or plain file. |

Pruned so the scan stays fast: `node_modules`, `.venv`, `__pycache__`, `dist`,
`build`, `.next`, `target`, `coverage`, and every dot-directory except the config
dirs above. Depth caps at 7.

**Inside a repo, files are filtered to documents and deliverables.** Repos are walked for
what you can read or view — `.md`, `.txt`, `.json`, `.ya?ml`, `.toml`, `LICENSE`,
`Dockerfile` and the like, plus (since 2026-09-07) `.pdf`, `.html`/`.htm`, and common
image extensions — a report folder's rendered export, PDF, and chart PNGs are exactly the
kind of thing this is meant to show, the same as a repo's own README. Everything else —
source code — is counted but not indexed: showing all of it was measured at **+116,000
files** across the three mounted projects (mostly vendored/dependency trees nobody
browses file by file), which would roughly double the whole hub's payload. Nothing is
hidden silently: each folder reports the count, so a `screenshots/` folder of some other
file type reads *"9 other files here that the index skips — see what's indexed. Use open
folder."* — and **see what's indexed** opens the
[scan status panel](#what-the-scan-is-doing), which lists the types that do make it in.

An `.html` file used to need a parent folder literally named `artifacts`, `dashboards`,
or `prototypes` to survive this filter at all (see [#31](../Docs/ROADMAP.md#31-dual-mode-html-viewer--artifacts-shelf)).
That folder-name check still decides whether an `.html` file *additionally* gets
collected onto the overview's Artifacts shelf — a curated surface for interactive
dashboards specifically — but no longer decides whether it's visible in the tree at all.

**Credential stores are skipped outright.** Walking into repos put things like
Edge-Radar's gitignored `keys/` in reach, and a `.txt` in there matches the doc filter.
Directories named `keys`, `secrets`, `credentials`, `certs`, `.ssh`, `.gnupg` are pruned
inside repos, along with files whose names read as secrets. `/api/file` is addressed by
path rather than by index, so it enforces the same rule again on the way out — a
hand-typed request for `…/keys/kalshi_private.key` gets a 403. `.env` on a CLI runtime
page still opens; that was always visible and is left alone.

Git state costs more than the walk (two `git` calls per repo, throttled to six at a
time — 40 concurrent spawns all time out on Windows). The whole payload is built once,
gzipped once (10.2MB → ~1.1MB, up from 5.1MB → 0.6MB before repos were walked; a warm
request serves in ~270ms), cached, and rebuilt only when the watcher fires. A
request never waits on a scan; the **rescan** button is the one caller that does.

Set `HUB_DEBUG=1` for per-request timing in `hub.log`.

## Files

Since **2026-08-31** the program lives once, in [`../Hub`](../Hub/README.md). This folder
holds only what makes this hub *this* hub.

| File | Where | What it is |
|:---|:---|:---|
| `hub.config.json` | here | The whole difference between hubs: name, root dir, port, title, favicon, repo-table scope. |
| `Start-Hub.ps1` | here | Three-line shim so the VS Code `folderOpen` task keeps its path; the logic is in `../Hub`. |
| `hub.log` / `hub.err.log` | here | Server output (generated). |
| `scan.json` | here | Only written by `--scan` (generated). |
| `hub.mjs` | `../Hub` | Scanner, static server, markdown renderer, filesystem watcher. Zero deps. |
| `index.html` | `../Hub` | The whole UI — vanilla JS, no framework, no build. |
| `hub.test.mjs` | `../Hub` | `node --test hub.test.mjs`. Covers the markdown renderer, config validation, and a byte-level scan for the control-character corruption that broke gzip in August. |

## Changing what this hub scans

Since 2026-09-07 this config folder holds only the *server's own* settings — port,
title, favicon:

```json
{
  "name": "Portfolio",
  "port": 4273,
  "title": "Project Hub",
  "favicon": { "glyph": "/", "ink": "#5fe3a1", "line": "#2f6b52" }
}
```

**Each project it mounts gets its own small config** under [`../Projects/`](../Projects),
one subfolder per project:

```json
// ../Projects/Example_Workspace/hub.config.json
{
  "name": "Example_Workspace",
  "dir": "D:/Work/Projects/Example_Workspace",
  "repoScope": { "groups": ["Live_Apps", "Other_Apps", "Tools", "Draft"] }
}
```

`hub.mjs` discovers every `Projects/<name>/hub.config.json` at startup and nests each
under one **Projects** folder in the tree — the same "a new one is just a folder"
property the old three-hubs-one-codebase design already had, just one config file
smaller now that a project no longer needs its own port. `repoScope` decides which of
*that project's own*
repos reach its overview table — `groups` for a workspace with a `Repos/<group>/` tier,
`pathPrefix` for a flat one, neither for all of them. Set one or the other, not both; the
config loader rejects that and every other malformed shape at startup rather than
halfway through a scan.

The shared roots — `Documents`, `Pictures`, `Automations`, `Links` and whatever else you
configure — and the six user-scope runtimes are the same for every project, so they stay in
[`../Hub/hub.mjs`](../Hub/hub.mjs) (`SHARED_ROOTS` and `USER_RUNTIMES`) and are scanned once
for all mounted workspaces rather than once per hub. Two rules decide whether a folder deserves
its own root. A folder the walker cannot otherwise reach needs one: a dot-prefixed directory,
hidden from an editor's indexer, is pruned by the dot-directory rule and would never appear.
A folder outside every other root needs one too — `Pictures` at `C:/Users/<you>/OneDrive/Pictures`
sits outside `Documents` entirely. `Links` (`Documents/Links`) is the interesting case: it does
sit inside another root, and is mounted separately anyway because it is a destination in its own
right. The walker prunes it from the `Documents` walk (`MOUNTED_ROOTS`) rather than indexing the
same subtree twice under two parents with colliding ids.

**Adding a fourth project** is a new folder under `Projects/` and a `hub.config.json` —
nothing else in this repo needs touching.

> [!NOTE]
> **`Project-Hub-IAM` and `Project-Hub-Finance` are retired.** Until 2026-09-07 they ran
> the same code from [`../Hub`](../Hub/README.md) as separate processes on 4274/4275.
> Before that, until 2026-08-31, all mounted workspaces were literal copies of the whole program and a
> fix had to land three times — which is how one bad edit left gzip broken in all mounted workspaces
> at once. Splitting the config out to `hub.config.json` per folder fixed the
> triplication; mounting all mounted workspaces inside one process removes the "per hub" framing
> entirely. Ports 4274 and 4275 are free.

## Health and the watchdog

Every hub answers `GET /api/health` — uptime, scan history, payload size, SSE clients,
`readErrors`, and a `state` of `warming`, `ready` or `stalled`. It returns **503** when
it is genuinely unwell, so a check can be one HTTP call:

```powershell
curl http://127.0.0.1:4273/api/health
```

`readErrors` is the one to watch. It counts head reads that failed, which is the
fingerprint of the file-descriptor leak that killed the AI Lab hub on 2026-08-31 — that
outage left no other trace, because every failure was swallowed by a `catch`. A handful
is normal (files being written while the scan walks past them); hundreds is not.

[`..\Hub\Watch-Hubs.ps1`](../Hub/Watch-Hubs.ps1) checks every hub and restarts any that
is unwell, going through `Start-Hub.ps1` so the port-identity rules still apply — it will
never kill something that merely happens to hold the port:

```powershell
..\Hub\Watch-Hubs.ps1              # report only
..\Hub\Watch-Hubs.ps1 -Restart     # bring back anything that is down
```

It exits non-zero if anything needed attention, and appends to `..\Hub\watchdog.log`.

**It runs on a schedule.** Registered 2026-08-31 as
`\AI-Maintenance\Project Hub Watchdog (15 min)`, every 15 minutes as the configured local user, with
`-Restart -Quiet`. Check it, or turn it off, with:

```powershell
schtasks /Query  /TN "\AI-Maintenance\Project Hub Watchdog (15 min)" /FO LIST /V
schtasks /Run    /TN "\AI-Maintenance\Project Hub Watchdog (15 min)"
schtasks /Change /TN "\AI-Maintenance\Project Hub Watchdog (15 min)" /DISABLE
```

Because it restarts what it finds down, a hub you stopped on purpose comes back within
15 minutes. Disable the task first if that is not what you want.

## Keyboard

The whole UI is reachable without a mouse as of 2026-08-31 — before that it was 21 click
handlers on plain `div`s with not one `tabindex` between them.

| Key | Does |
|:---|:---|
| `Ctrl+K` | Focus the search box |
| `Ctrl+B` | Show / hide the sidebar |
| `Ctrl+D` | Bookmark (or unbookmark) the row the tree cursor is on, or the open document — see [Bookmarks and recents](#bookmarks-and-recents) |
| `Alt+←` / `Alt+→` | Back / Forward through the hash history |
| `Tab` | Move between controls; the focused one shows a green ring |
| `Enter` / `Space` | Open whatever is focused — a card, a table row, a stat tile, a search hit |
| `Esc` | Clear the search |

In the **tree**, once a row has focus:

| Key | Does |
|:---|:---|
| `↑` `↓` | Move between visible rows |
| `→` | Expand a folder, or step into it if already open |
| `←` | Collapse a folder, or step out to its parent |
| `Home` / `End` | First / last visible row |
| `Enter` | Open the row |

In **search results**, `↑` `↓` move the highlight and `Enter` opens it, without leaving the
search box. As of 2026-09-09 the box is a proper combobox, so a screen reader is told which
result is highlighted rather than the highlight being purely visual; the arrows walk the
document results and the Pictures section as one sequence. Prefix a query with a kind to narrow it — `skill:kalshi`, `repo:edge`,
`cmd:deploy`, `agent:`, `routine:`, `doc:`, `mcp:`, and `pdf:`, `html:`, `image:` for
deliverables. Matches are highlighted in the results.

Opening a result and pressing **Back returns you to those results** — the query, the
project-scope chip, and any extra pages you loaded all come back. That was not true before
2026-09-08: opening a result cleared the search, and Back landed on whatever document you
had been reading before it.

## Cards or list

Every folder page has a `⊞ cards` / `☰ list` toggle beside `copy path`. Cards are the
default and are good at a dozen things with descriptions; the list is the other half —
**name, type, modified, size**, sortable by clicking a column, which is what you want at
eighty files.

Folders come first when you sort by name or type. They deliberately **don't** when you
sort by modified or size, because that is when you are asking a question the grouping would
get in the way of. A folder's size column shows how many items are in it, or `unopened` for
a Pictures folder whose contents have not been loaded yet.

Which view you get is remembered per browser. Modification times are fetched for the folder
you are looking at rather than shipped with every scan, so they appear a beat after the rows
do on a folder you have not opened before.

## Reading a document

Markdown documents get a row of reader tools in the panel header, and a `print` button up
with the other document actions:

| Control | Does |
| :--- | :--- |
| `☰ outline` | A collapsible list of the document's headings. Click one to jump; the address bar follows, so the link you copy points at that section. |
| `rendered` / `source` | Read the rendered document, or the raw markdown behind it. |
| `↔ full` | Cycles the reading width — full, 82 characters, 64 characters. Long lines are hard to read; this is the fix. |
| `A 100%` | Cycles the text size — 100%, 112%, 125%, 90%. |
| `print` | Prints the document alone: no sidebar, no header, no buttons, black on white. |

Hovering a code block shows a **copy** button in its corner.

Width and text size are remembered per browser. The outline and the source toggle reset each
session, so a new tab always opens on the rendered document with the outline closed.

## Looking at images

Image cards show a thumbnail, loaded only as you scroll to it — a folder of 1,250 icons
fetches about forty of them, not all of them.

Opening one gives you a viewer with:

| Control | Does |
| :--- | :--- |
| `fit` / `100%` | Fit the pane, or show actual pixels |
| `−` / `+` | Zoom out and in through 25 / 50 / 100 / 200 / 400% |
| dimensions | The image's real size, e.g. `2552 × 7913`, next to the zoom |
| `‹ prev` / `next ›` | Step through the images in the same folder, with a `3 of 1250` counter |
| `←` / `→` | The same, from the keyboard |

The zoom you pick sticks while you flip through a folder, and resets to fit in a new
session. Arrow keys only move between images when the tree and the search box don't have
the keyboard — they own the arrows first — and `Alt`+arrow is still Back/Forward.

## Bookmarks and recents

Two lists sit above the tree, both collapsed on every load so the startup sidebar stays as
quiet as it was before they existed:

| | |
| :--- | :--- |
| **Bookmarks** | Pinned by hand. Drag to reorder, double-click a label to rename, `×` to remove. Any row the tree can select qualifies — a document, a folder, a repo, a whole project. |
| **Recent** | The last 20 documents you opened, newest first, deduplicated. Automatic; folders you pass through don't count. |

Pin something three ways, whichever is nearest: the `☆ bookmark` button beside `copy Hub
link` in the document header, right-click → **Add Bookmark** in the tree, or `Ctrl+D` —
which pins the row under the tree cursor, so you can pin a file without opening it.

Each row says in small dim text **what it belongs to** — its repo if it is inside one,
otherwise its project or shared root — so three folders all called `Agents` read as
`Finance_Workspace`, `Identity_Workspace` and `Example_Workspace` without opening anything. Two documents with
the same name inside the *same* repo additionally pick up their parent folder
(`setup/README.md`, `design/README.md`).

**Right-click a pinned row** for the same menu the tree offers — the copy actions, Open,
Reveal in Explorer, Open in VS Code — plus **Remove Bookmark**, and **Rename Bookmark** on a
bookmark. Right-clicking a **Recent** row offers **Add Bookmark**, which is the quickest way
to promote something you keep going back to.

A pinned file that gets **moved or deleted** goes dim and struck through after the next scan
rather than silently disappearing, and a move usually brings a one-click **relink** offer
naming where it went. Nothing is ever repointed for you. Its launch actions grey out, but the
copy actions stay live — the last known path is what you want when you go looking.

Both lists live in `localStorage` in this browser, hold **paths and labels only**, and
survive restarting the browser and the hub. They do not sync between browsers or machines —
copy a Hub link for that. Full how-to: [`../Docs/BOOKMARKS.md`](../Docs/BOOKMARKS.md).

## What the scan is doing

The `● scanned 09:32` line in the sidebar footer is a button. Click it (or tab to it and press
Enter) for the detail behind it:

- **Last successful scan** — when it finished, how old it is, how long it took, how many nodes
  it indexed and how big the payload was.
- **Where the time went** — walking folders, reading git, assembling, serializing, compressing.
  Git is usually the slow one.
- **Roots** — the mounted projects, and whether Pictures has been loaded or searched yet.
- **Read errors** — not just the count. The actual paths that failed and why, newest first,
  clickable if they are still in the tree. A green status used to sit on top of these silently.
- **What gets indexed** — which file types make it into the tree and which are skipped.

A folder that holds files the index skips says so, and *"see what's indexed"* opens that last
section. Anything skipped is still there on disk — **open folder** always shows everything.

## Links and state

Every node has a URL: selecting one writes `#<id>` to the address bar, so a skill, repo or
document can be bookmarked or pasted to someone, and **Back / Forward walk your history**
— via the browser's own controls, the `‹`/`›` pair in the header, or `Alt+←`/`Alt+→`.
Opening the hub on a link restores that node.

**Searches have URLs too**, as of 2026-09-08: a query writes `#?q=<query>`, picking up
`scoped=1` when the project-scope chip is on and `limit=<n>` once you have used Load 200
More. So a set of results is as shareable and bookmarkable as a document, and reopening one
restores the query and how much of it you had loaded. Refining a query replaces its entry
rather than adding one, so a long query does not fill your history with a step per
keystroke — one Back leaves the results, a second leaves the search.

**Tree expansion is no longer remembered across a reload** — since 2026-09-07 it's
computed fresh from the link every time instead: collapsed, except the path down to
whichever project (or nothing, on the bare URL) the hash points at. A remembered
"Documents was left open last time" is exactly what the old `localStorage`-backed
behavior produced and this replaces. The theme, sidebar rail, and folded sections are
unrelated features and still persist in `localStorage` as before, joined on 2026-09-09 by
the bookmark and recent lists.

## Viewing it inside VS Code

Use **Simple Browser**, not a file preview:

```
Ctrl+Shift+P  ->  Simple Browser: Show  ->  http://127.0.0.1:4273
```

Live Preview, Live Server, and opening `index.html` off disk all serve the HTML from
their own origin, where `/api/scan` and the rest do not exist. You get the chrome and
nothing else. The page detects this now and says so rather than sitting on a spinner,
but the fix is always the same: point a real browser view at the running server.

### Starting it with the workspace

For optional VS Code integration, a local `.code-workspace` file can carry a `folderOpen` task that runs `Start-Hub.ps1
-NoBrowser` when the workspace opens, so the server is up before you look at it.
`Restart Project Hub` is there too, for after an edit to `../Hub/hub.mjs` or `../Hub/index.html`
(`Ctrl+Shift+P` -> `Tasks: Run Task`).

The Simple Browser tab opens itself too. A second rule in the workspace settings uses
the [`gabrielgrinberg.auto-run-command`](https://marketplace.visualstudio.com/items?itemName=gabrielgrinberg.auto-run-command)
extension to fire `simpleBrowser.show` against the hub URL on every window open, with a
`#Projects/<Name>` hash so each single-project workspace deep-links straight into its own
project root, with just that project's path expanded in the sidebar, instead of landing on
the collapsed combined view every other entry point opens to:

```json
"auto-run-command.rules": [
  {
    "condition": "always",
    "command": "simpleBrowser.show http://127.0.0.1:4273/#Projects/Example_Workspace",
    "message": "Opening Project Hub — Example_Workspace (4273)"
  }
]
```

Other workspace files can carry the identical rule with
their own project name in the hash — same port, same shared server, different landing spot.

A combined workspace, `Projects.code-workspace`, opens the whole `D:/Work/Projects`
folder — Example_Workspace, Identity_Workspace, and Finance_Workspace all at once — rather than one project's
own root, so there's no single project to hash-deep-link into. It carries the same
`folderOpen` task, but its rule points at the bare URL instead:

```json
"auto-run-command.rules": [
  {
    "condition": "always",
    "command": "simpleBrowser.show http://127.0.0.1:4273",
    "message": "Opening Project Hub — combined Projects view (4273)"
  }
]
```

No hash means it lands on the same collapsed combined Projects view (stats + repos table
across all mounted workspaces) the bare URL always has — the one landing spot that actually matches
what this workspace has open.

The URL belongs **inside the command string**, not in a separate `args` array. The
extension does `command.split(" ")` and spreads the tail into `executeCommand`, and it
ignores any key it doesn't know — so an `args` array reads as valid JSON, gets dropped,
and `simpleBrowser.show` runs with no URL and sits there prompting for one.

Before this rule the tab came back only through editor restore, which replays whatever
was open when the window last closed. That worked until you closed the tab, and left a
brand-new workspace with nothing to restore. The rule doesn't care either way.

The hub page should be the only thing that opens itself, so the workspace also sets:

```json
"workbench.startupEditor": "none"
```

It was `"readme"`, which is what made the workspace root's `README.md` open in a tab
beside the hub on every window open. `none` stops that. It does not touch restored
editors -- VS Code replays whatever was open when the window last closed, so a README
tab left open from before will keep coming back until you close it once.

Commands fire on a 5s delay hard-coded in the extension, which waits for other
extensions to register theirs. The `folderOpen` task has normally had the server up
long before that.

> [!NOTE]
> `Start-Hub.ps1` launches node detached, so the hub keeps running after VS Code
> closes. That is what makes the restored tab work on the next open -- the server is
> usually already up before the task even runs. To stop it, kill the node process
> holding port 4273.

## Things that bit during the build

Worth knowing before changing any of it.

| Trap | What happens |
|:---|:---|
| Spawning `git` for every repo at once | All 40 processes time out on Windows and half the repos come back with no branch. The pool caps at six. |
| Node's default `keepAliveTimeout` | It's 5s. Browsers reuse a socket for longer, and a request onto one the server just closed vanishes — the page sits on "scanning…" while `curl` works fine. Raised to 65s. |
| Rescanning per request | The walk is synchronous, so a background refresh blocks the very response it's meant to speed up. The watcher owns rescans; requests only ever read the cache. |
| Editing `../Hub/hub.mjs` and just refreshing the browser | Nothing changes. The server reads its own source once at process start, so a renderer fix only lands after `.\Start-Hub.ps1 -Restart` — plain `Start-Hub.ps1` reuses the running process on purpose. `../Hub/index.html` is served from disk per request, so that one really does just need a refresh. **And it reaches every mounted project at once**, since there is only the one process now. |
| Shipping the payload uncompressed | 5.1MB of repeated path strings took seconds to move even over loopback. Gzipped once per scan, it's 0.6MB. |
| Another server squatting the port | `Start-Hub.ps1` treats any listener on the port as "the hub is already up" and skips starting. When a Vite dev server held `4173` bound to `::1` only, the launcher reused nothing and `http://127.0.0.1:4173` answered `ERR_CONNECTION_REFUSED` with no error logged anywhere. Hubs moved to the `42xx` block on 2026-08-27 to stay clear of Vite's `4173`/`5173` defaults. |
| A `try` that closes a file handle on the happy path only | `readHead()` opened an fd, read, then closed — with the close *after* the line that throws. Every failed read stranded a descriptor, the watcher calls it thousands of times a day, and four days later the process died on `EMFILE`. Closing in a `finally` is the fix; see below. |


### 2026-08-31 — the hub died of a file-descriptor leak

The AI Lab hub had been up since **2026-08-27 19:13**. At **10:07** on the 31st it
exited, and the workspace's Simple Browser tab started answering
`ERR_CONNECTION_REFUSED` on `4273`. The only trace was `hub.err.log`:

```text
Error: EMFILE: too many open files, open '...\Project-Hub\index.html'
    at Server.<anonymous> (.../hub.mjs:865:14)
```

The stack points at the static-file handler, which is misleading — serving
`index.html` is just the request that happened to need the descriptor that was no
longer there. The leak was upstream, in `readHead()`:

```js
const fd = fs.openSync(file, 'r');
const buf = Buffer.alloc(bytes);
const n = fs.readSync(fd, buf, 0, bytes, 0);   // throws → jumps to catch
fs.closeSync(fd);                              // never reached
return buf.subarray(0, n).toString('utf8');
```

The outer `catch { return ''; }` made every failure silent. `describe()` calls
`readHead()` for each `SKILL.md` / `AGENT.md` / `README.md` in the tree, and the
watcher re-runs the whole scan on any change across 13 recursive roots, so a read
that loses a race with a file being written or deleted is not rare — it just has to
happen a few thousand times. The fd table filled up over roughly four days and the
next page load was the one that couldn't open anything.

The fix moves the close into a `finally`:

```js
let fd;
try {
  fd = fs.openSync(file, 'r');
  ...
} catch { return ''; }
finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
```

Applied to all mounted workspaces hubs on 2026-08-31 — the IAM and Finance copies carried the
same code. **AI Lab hit it first because it watches the most paths**; a hub over a
smaller root leaks the same way, just slower.

Two things are worth carrying forward from this one:

- **A crashed hub looks exactly like a port conflict from the browser.** Both give
  you `ERR_CONNECTION_REFUSED` and nothing else. Read `hub.err.log` before assuming
  anything about ports — it is the only place the reason is written down.
- **The Simple Browser can lose a cold start.** `auto-run-command` fires
  `simpleBrowser.show` on a hard-coded 5s delay, but `Start-Hub.ps1` waits up to 20s
  for the first scan. When the hub is genuinely down at workspace open, the tab loads
  before the server is listening and stays broken until you reload it. Normally the
  server is already running from the last session and the race never shows up.

---

<p align="center">
  <a href="../README.md">← HTML Project Design</a> ·
  <a href="../Src/README.md">Src</a> ·
  <a href="../Images/README.md">Images</a>
</p>
