<a id="html-design-top"></a>

<h1 align="center">🖥️ HTML Project Design</h1>

<p align="center">
  <em>Markdown is what the agents read. This folder is about what I read.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-1_hub_3_projects-2ea44f?style=for-the-badge" alt="Status: 1 hub, 3 projects">
  <img src="https://img.shields.io/badge/source-Claude_Design-8B5CF6?style=for-the-badge" alt="Source: Claude Design">
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-My_AI_Tools-6B7280?style=for-the-badge" alt="My AI Tools"></a>
</p>

---

## 🌐 Project Hub

One console, one port, three project workspaces nested under one **Projects** folder in the sidebar:

| | |
| :--- | :--- |
| **Local URL** | [`http://127.0.0.1:4273`](http://127.0.0.1:4273) |
| **Projects mounted** | `Mikes_AI_Lab`, `Mike_IAM`, `Mike_Finance`, nested under one **Projects** folder — plus `Documents`, `My Custom Skills`, `Pictures`, `Automations`, `Links` and User CLIs (`~`), shared by all three |
| **Quick start** | [`Start-Hub.ps1`](./Project-Hub/Start-Hub.ps1) |
| **Landing page** | The **Projects** folder's own view — combined stats and a repos table across all three projects. Click a project (its card, or in the sidebar) to see it scoped on its own. |
| **Sidebar** | Collapsed by default. Opening a link to a project (including each VS Code workspace's own deep link) expands only the Projects folder and that one project — nothing else. **Bookmarks** and **Recent** sit above the tree, also collapsed — see [`Docs/BOOKMARKS.md`](Docs/BOOKMARKS.md). |

> [!NOTE]
> **Merged from three separate processes on 2026-09-07.** Before this, `Project-Hub`,
> `Project-Hub-IAM`, and `Project-Hub-Finance` ran as three ports (4273/4274/4275), each
> independently re-scanning the same Documents/Skills/Pictures/Automations content. Now
> one process scans the shared roots once and mounts all three projects under one
> **Projects** folder in the tree. See [`Docs/ROADMAP.md`](Docs/ROADMAP.md) for what moved
> and why.
>
> The hubs moved from **4173/4174/4175 to 4273/4274/4275 on 2026-08-27** — `4173` is
> Vite's default preview port and the `Gods-Eye-View` clone under `Repos/Tools/` owns it
> now. Ports 4274 and 4275 are free again since the merge.

---

A CLI agent project is a folder tree, and a folder tree is a bad way to see one. Twenty repos across four groups, four agent runtimes, and the skills, commands, sub-agents, hooks, scheduled routines, and MCP servers they each carry — none of that is visible from `ls`, and reading it out of `CLAUDE.md` means trusting a file that goes stale. Worse, since the 2026-08-23 consolidation most of those artifacts don't live in the project at all: they sit in `~/.claude`, `~/.codex`, and friends, invisible to anything that only walks the repo.

So the hub scans the shared document roots once, loads `Pictures` on demand, nests each project workspace under its own **Projects** folder, and splits runtimes into two named categories: **Project CLIs** (a workspace's own `Agents/`) and **User CLIs** (`~`, shared by every repo on the machine).

The idea here is to keep every durable fact in Markdown where Claude Code and Codex can search and diff it, and put a browsable HTML layer on top for the human. This folder holds three stages of that: the research that framed it, the Claude Design artifacts that gave it a look, and the one build that actually runs.

## 🔧 Setup

Node 18.17+ and nothing else — no dependencies, no build step. **Both real configs are
gitignored** because they hold absolute paths into one machine, so a fresh clone needs two
copies before it will start:

```powershell
cd Project-Hub
Copy-Item hub.config.example.json hub.config.json      # set "base" + "sharedRoots"

cd ..\Projects
New-Item -ItemType Directory My_Workspace
Copy-Item _example\hub.config.json.example My_Workspace\hub.config.json   # set "dir"

cd ..\Project-Hub
.\Start-Hub.ps1
```

`base` is the drive root every id in the tree is relative to; `sharedRoots` are the folders
mounted next to every project (`Documents`, `Pictures`, …). Both are documented in
[`Hub/README.md`](Hub/README.md#the-config). Run the tests with `npm test` in [`Hub/`](Hub).

## 📂 What's in here

| Folder | What's inside |
| :--- | :--- |
| [**⚙️ Hub**](Hub/README.md) | **The program.** Scanner, server, markdown renderer, watcher, UI and tests — one copy. Zero dependencies, no build step. Edit here; the hub picks it up at its next restart. |
| [**🚀 Project-Hub**](Project-Hub/README.md) | The one running instance: a slim `hub.config.json` (port, title, favicon) plus the [`Projects/`](Projects) folder it discovers its mounted workspaces from. Served at [`http://127.0.0.1:4273`](http://127.0.0.1:4273), re-rendering on its own when you add a skill, a routine, or a repo. **Start here if you want to use something rather than read about it.** |
| [**📁 Projects**](Projects) | One subfolder per mounted project — `Mikes_AI_Lab/`, `Mike_IAM/`, `Mike_Finance/` — each holding a small `hub.config.json` (`name`, `dir`, `repoScope`). Adding a fourth project is a new subfolder here, nothing else. |
| [**🎨 Src**](Src/README.md) | The Claude Design exports — a generic first pass and the version tailored to the real AI Lab. `Project Hub v2.dc.html` is the one Project Hub was built from. |
| [**🖼️ Images**](Images/README.md) | Screenshots of both designs, plus the VS Code folder tree that was pasted in as the design brief. |
| [**📄 Docs**](Docs/ChatGPT-HTML-Design.md) | [`ChatGPT-HTML-Design.md`](Docs/ChatGPT-HTML-Design.md) — the research write-up that started this: where the Markdown/HTML line should fall, a recommended project layout, and six existing HTML-artifact skills weighed up with a verdict on each. [`ROADMAP.md`](Docs/ROADMAP.md) — the defect audits, the backlog, and what has shipped, including the 2026-09-07 merge into one process. [`BOOKMARKS.md`](Docs/BOOKMARKS.md) — how to use the sidebar's Bookmarks and Recent lists. |
| [**📦 Zip**](Zip) | The raw `.zip` downloads from Claude Design, kept as-is. `Src/` is these unpacked — there's nothing in one that isn't in the other. |

## 🧭 How the pieces relate

```text
Docs/ChatGPT-HTML-Design.md     the argument: Markdown for agents, HTML for humans
        ↓
Images/Screenshots/             the brief: a VS Code capture of the real folder tree
        ↓
Src/Claude-Design-Doc-Hub/      first pass, generic — a made-up "My-Library" repo
        ↓
Src/…_AI-Lab/Project Hub v2     same design, real repo names and real structure
        ↓
Hub/                            one program: scanner, server, renderer, watcher, UI, tests
        ↓
Project-Hub/                    the one running instance — port, title, favicon
        ↓
Projects/Mikes_AI_Lab/          a config naming that project's dir + repoScope
Projects/Mike_IAM/              same, for Mike_IAM
Projects/Mike_Finance/          same, for Mike_Finance
```

The Claude Design files are static mockups with invented data. Project Hub is the same design wired to the filesystem, so the repo count, the git state, and the skill descriptions are read fresh each time rather than typed in.

## What shipped — September 9

Six items from the [roadmap](Docs/ROADMAP.md#p7-review) landed in one day, which closes everything numbered P7-01 to P7-16 except the narrow-pane work:

| | |
| :--- | :--- |
| **Bookmarks & Recent** | Two lists above the tree. Pin with `☆ bookmark`, `Ctrl+D`, or right-click; drag to reorder, double-click to rename. A pinned file that moves or vanishes goes dim rather than disappearing, usually with a one-click relink. Stored in your browser, paths only — [how to use them](Docs/BOOKMARKS.md). |
| **Folder list view** | A `☰ list` beside the cards: name, type, modified, size, sortable. Modification times are fetched for the folder you are looking at rather than scanned into every payload, so September 8's size savings stand. |
| **Reader tools** | Heading outline, rendered/source toggle, copy buttons on code blocks, adjustable reading width and text size, and a print stylesheet that prints the document alone. |
| **Image browsing** | Thumbnails on image cards, loaded only as you scroll to them — a 1,250-image folder fetches about forty. Opening one gives fit/100%/zoom, real pixel dimensions, prev-next through the folder, and arrow keys. |
| **Scan status detail** | The `● scanned` line in the footer is now clickable: last scan and duration, where the time went, and the **paths** that failed to read rather than just a count. A green status used to sit on top of read errors without a word. |
| **Search accessibility** | The search box is a real combobox, so a screen reader is told which result is highlighted instead of the highlight being purely visual. |

Two things worth calling out. The image work **uncovered a day-old bug** that had been silently blanking every SVG preview and every SVG embedded in a document — the security sandbox added on September 8 also stops a browser decoding an SVG inside `<img>`, with no error to catch. It is fixed, and the sandbox still applies everywhere it should. And the "only docs and config are indexed" wording is gone; it predated PDF, report and image support, and now links to a panel that lists what actually gets indexed.

Refresh an already-open hub tab to pick all of this up.

## Pictures performance update — September 8

Pictures is now loaded on demand: opening a folder fetches its children, and picture search uses a separate metadata index. Project scans no longer walk or transmit the photo library. The ordinary payload dropped from roughly 118,000 to 40,000 nodes (45% fewer gzip bytes); Git remains a variable part of total scan time. Report previews, PDF search/viewing, heading links, and refresh recovery also shipped. A browser verification pass then confirmed nine of these in Chrome and fixed the defect it found — Back from a search result now returns to the results, because searches have their own URLs. See the [P7 shipping record](Docs/ROADMAP.md#p7-review) for measurements, tests, and what is still unverified. Refresh an already-open hub tab to load the new interface.

## 🚀 Run the hub

```powershell
cd Project-Hub
.\Start-Hub.ps1          # scans every mounted project + the shared roots, opens http://127.0.0.1:4273
```

Startup duration varies with Git: the normal scan now covers roughly 40,000 nodes and omits Pictures. Cached API responses are much smaller than a fresh scan; Pictures folders and its search index load separately when requested. Full detail in the [Project Hub README](Project-Hub/README.md).

`Start-Hub.ps1` is a three-line shim over the shared [`Hub/Start-Hub.ps1`](Hub/README.md); everything that differs between projects lives in that project's own `Projects/<name>/hub.config.json`.

> [!NOTE]
> **The hub watches itself.** [`Hub/Watch-Hubs.ps1`](Hub/README.md#the-watchdog) pings its `/api/health` every 15 minutes as the scheduled task `\AI-Maintenance\Project Hub Watchdog (15 min)`, and restarts it if it's down or reporting trouble. It exists because the AI Lab hub died of a file-descriptor leak on 2026-08-31 and nothing noticed for hours. A side effect worth knowing: **a hub you stop on purpose comes back within 15 minutes** unless you disable the task first. The watchdog itself needed no change for the merge — it already discovers hubs by walking for `hub.config.json` siblings, and now finds one instead of three.

The hub opens on the **Projects** folder's own landing page — combined stats and a repos table across all three projects — and each project gets the same overview scoped to just itself, laid out top to bottom as *what you have → what you ship → what explains it → what builds it*:

| Section | Anchor | What's in it |
| :--- | :--- | :--- |
| **Stat strip** | — | Runtimes, repos, skills, commands, sub-agents, MCP servers, uncommitted — each noting the user-scope share. Doubles as the page's table of contents: **every tile is clickable** and jumps to its section. |
| **Repos** | `#sec-repos` | The repo table with live git state — branch, dirty/ahead/behind, last commit. Scoped to the current project; the Projects landing page's table covers all three at once with a project chip per row. |
| **Readmes** | `#sec-docs` | The root `README.md` of the current project, plus its agent config doc if it has one. |
| **Project CLIs** | `#sec-project-clis` | The current project's own runtimes under `Agents/`. |
| **User CLIs** | `#sec-user-clis` | `~/.claude`, `~/.codex`, `~/.gemini`, `~/.agents`, `~/.config/opencode` — identical for every project. |

The runtime cards go last because that block is the tallest and the one you scroll *into* rather than past. Full detail — including why the jump is instant rather than smooth — is under [Page order](Project-Hub/README.md#page-order).

Each project also starts the hub from its own VS Code workspace — `Mikes-AI-Lab.code-workspace`, `Mike_IAM.code-workspace`, and `Mike_Finance.code-workspace` all carry a `folderOpen` task that ensures the one shared server is running (`-NoBrowser`), plus an `auto-run-command` rule that opens Simple Browser straight at that workspace's own project root (`http://127.0.0.1:4273/#Projects/<Name>`) — landing there with the Projects folder expanded to that one project and nothing else, rather than the collapsed default the combined view opens to. All three also set `workbench.startupEditor` to `"none"` — it was `"readme"`, which meant the workspace root's `README.md` popped open alongside the hub every single time. The hub page should be the only thing that opens itself.

A fourth workspace, `Projects.code-workspace`, bundles all three projects at once — it opens the whole `D:/AI_Agents/Projects` folder rather than one project's own root, so there's no single project to deep-link into. It carries the same `folderOpen` task and `workbench.startupEditor: "none"`, but its `auto-run-command` rule points at the bare `http://127.0.0.1:4273` — the same combined Projects landing page (stats + repos table across all three) the hash-scoped links land on when scoped to nothing in particular, sidebar collapsed to its default state rather than expanded to one project.

> [!NOTE]
> The design canvas this came from is at [claude.ai/design](https://claude.ai/design/p/f739c025-7a8e-4887-b51f-469969dd236c?file=Project+Hub+v2.dc.html). The `.dc.html` files here are exports of it, not something you can edit locally — they use Claude Design's own template syntax and need `support.js` to render.

> [!TIP]
> **Three processes became one on 2026-09-07.** Three separate hubs on three ports each
> re-scanned the same Documents/Skills/Pictures/Automations content — the shared roots
> were walked and held in memory three times over for content that never differed. Now
> one process scans them once and nests each project workspace under a real **Projects**
> folder node in the tree (not just a UI grouping — it collapses and expands like any
> other folder). `Project-Hub-IAM/` and `Project-Hub-Finance/` are retired; each project's
> `dir`/`repoScope` now lives in its own `Projects/<name>/hub.config.json` instead.
> **Adding a fourth project is a new folder
> under `Projects/` — nothing else.**

---

<p align="center">
  HTML project design · <a href="../README.md">← My AI Tools</a> ·
  <a href="../../README.md">My Documents</a> ·
  <a href="Project-Hub/README.md">Project Hub →</a>
</p>

<p align="right"><sub><a href="#html-design-top">back to top</a></sub></p>
