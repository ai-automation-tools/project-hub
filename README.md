<a id="html-design-top"></a>

<h1 align="center">🖥️ Project Hub</h1>

<p align="center">
  <em>Markdown is what the agents read. This is the layer for the human.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node_18.17+-339933?style=for-the-badge" alt="Node 18.17+">
  <img src="https://img.shields.io/badge/dependencies-none-2ea44f?style=for-the-badge" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/tests-65_passing-2ea44f?style=for-the-badge" alt="65 tests passing">
  <img src="https://img.shields.io/badge/license-MIT-6B7280?style=for-the-badge" alt="MIT license">
</p>

---

A CLI-agent project is a folder tree, and a folder tree is a bad way to see one. Twenty
repos across four groups, four agent runtimes, and the skills, commands, sub-agents, hooks,
scheduled routines and MCP servers they each carry — none of that is visible from `ls`, and
reading it out of `CLAUDE.md` means trusting a file that goes stale. Worse, most of those
artifacts don't live in the project at all: they sit in `~/.claude`, `~/.codex` and friends,
invisible to anything that only walks the repo.

**Project Hub** is one Node process that scans the whole picture — every mounted workspace,
the document roots they share, and the user-scope agent config — and serves it as a
browsable HTML console at `http://127.0.0.1:<port>`. It re-renders on its own when you add
a skill, a routine or a repo. No dependencies, no build step, nothing leaves the machine.

The idea is to keep every durable fact in Markdown where the agents can search and diff it,
and put a browsable layer on top for the human. This repo holds three stages of that: the
research that framed it, the [Claude Design](https://claude.ai/design) artifacts that gave
it a look, and the one build that actually runs.

## 🔧 Setup

Node 18.17+ and nothing else. **The real configs are gitignored** — they hold absolute
paths into one machine — so a fresh clone needs two copies before it will start:

```powershell
cd Project-Hub
Copy-Item hub.config.example.json hub.config.json       # set "base" + "sharedRoots"

cd ..\Projects
New-Item -ItemType Directory My_Workspace
Copy-Item _example\hub.config.json.example My_Workspace\hub.config.json    # set "dir"

cd ..\Project-Hub
.\Start-Hub.ps1
```

| Key | Where | What it is |
| :--- | :--- | :--- |
| `base` | server config | The drive root every id in the tree is relative to. `/api/*` refuses anything resolving outside the mounted roots. |
| `sharedRoots` | server config | Folders mounted next to *every* project — `Documents`, `Pictures`, whatever else. A root named `Pictures` also turns on the picture library. |
| `dir` | project config | Absolute path to one workspace. One folder per project under `Projects/`. |
| `repoScope` | project config | Which of that project's repos reach its overview table: `groups` for a `Repos/<group>/` tier, `pathPrefix` for a flat one, neither for all. |

Both shapes are documented in full under [Hub/README.md → The config](Hub/README.md#the-config).
Run the tests with `npm test` in [`Hub/`](Hub).

## 📂 What's in here

| Folder | What's inside |
| :--- | :--- |
| [**⚙️ Hub**](Hub/README.md) | **The program.** Scanner, server, markdown renderer, watcher, UI and tests — one copy, shared by every instance. Edit here; the hub picks it up at its next restart. |
| [**🚀 Project-Hub**](Project-Hub/README.md) | **The running instance** — its `hub.config.json` (port, title, favicon, base, shared roots) and the launcher. Also the full user manual: page order, keyboard map, reading and image tools, health and the watchdog. **Start here if you want to use something rather than read about it.** |
| [**📁 Projects**](Projects) | One subfolder per mounted workspace, each holding a small `hub.config.json`. Adding a project is a new subfolder here, nothing else. Contents are local to your machine and gitignored — see [`_example/`](Projects/_example) for the shape. |
| [**🎨 Src**](Src/README.md) | The Claude Design exports the interface came from — a generic first pass and a version tailored to a real workspace. `Project Hub v2.dc.html` is the one this was built from. |
| [**🖼️ Images**](Images/README.md) | Screenshots of both designs, plus the VS Code folder tree that was pasted in as the design brief. |
| [**📄 Docs**](Docs) | [`ChatGPT-HTML-Design.md`](Docs/ChatGPT-HTML-Design.md) — the research write-up that started this: where the Markdown/HTML line should fall, and six existing HTML-artifact skills weighed up with a verdict on each. [`ROADMAP.md`](Docs/ROADMAP.md) — the defect audits, the backlog, and the full shipping record. [`BOOKMARKS.md`](Docs/BOOKMARKS.md) — how to use the sidebar's Bookmarks and Recent lists. |
| [**📦 Zip**](Zip) | The raw `.zip` downloads from Claude Design, kept as-is. `Src/` is these unpacked — there's nothing in one that isn't in the other. |

## 🧭 How the pieces relate

```text
Docs/ChatGPT-HTML-Design.md     the argument: Markdown for agents, HTML for humans
        ↓
Images/Screenshots/             the brief: a VS Code capture of a real folder tree
        ↓
Src/Claude-Design-Doc-Hub/      first pass, generic — a made-up "My-Library" repo
        ↓
Src/…/Project Hub v2            same design, real repo names and real structure
        ↓
Hub/                            one program: scanner, server, renderer, watcher, UI, tests
        ↓
Project-Hub/                    the running instance — port, title, favicon, base, roots
        ↓
Projects/<Name>/                a config naming that workspace's dir + repoScope
```

The Claude Design files are static mockups with invented data. Project Hub is the same
design wired to the filesystem, so the repo count, the git state and the skill descriptions
are read fresh each time rather than typed in.

## 🚀 Run the hub

```powershell
cd Project-Hub
.\Start-Hub.ps1          # scans every mounted project + the shared roots, then opens a browser
```

`Start-Hub.ps1` is a three-line shim over the shared [`Hub/Start-Hub.ps1`](Hub/README.md);
everything that differs between instances lives in config. Startup duration varies mostly
with Git — the scan shells out per repo. Cached API responses are much smaller than a fresh
scan, and Pictures folders and their search index load separately, on request.

The hub opens on the **Projects** folder's own landing page — combined stats and a repos
table across every mounted workspace — and each project gets the same overview scoped to
just itself, laid out top to bottom as *what you have → what you ship → what explains it →
what builds it*:

| Section | Anchor | What's in it |
| :--- | :--- | :--- |
| **Stat strip** | — | Runtimes, repos, skills, commands, sub-agents, MCP servers, uncommitted — each noting the user-scope share. Doubles as the page's table of contents: **every tile is clickable** and jumps to its section. |
| **Repos** | `#sec-repos` | The repo table with live git state — branch, dirty/ahead/behind, last commit. Scoped to the current project; the Projects landing page's table covers them all at once with a project chip per row. |
| **Readmes** | `#sec-docs` | The root `README.md` of the current project, plus its agent config doc if it has one. |
| **Project CLIs** | `#sec-project-clis` | The current project's own runtimes under `Agents/`. |
| **User CLIs** | `#sec-user-clis` | `~/.claude`, `~/.codex`, `~/.gemini`, `~/.agents`, `~/.config/opencode` — identical for every project. |

The runtime cards go last because that block is the tallest and the one you scroll *into*
rather than past. Full detail — including why the jump is instant rather than smooth — is
under [Page order](Project-Hub/README.md#page-order).

> [!NOTE]
> **The hub can watch itself.** [`Hub/Watch-Hubs.ps1`](Hub/README.md#the-watchdog) pings
> `/api/health` on a schedule and restarts the hub if it's down or reporting trouble. It
> exists because a hub once died of a file-descriptor leak and nothing noticed for hours.
> A side effect worth knowing: **a hub you stop on purpose comes back** on the next tick
> unless you disable the scheduled task first.

> [!TIP]
> **Adding a workspace is a new folder under `Projects/` — nothing else.** Earlier versions
> ran one process per workspace on its own port, each independently re-scanning the same
> shared document roots. One process now scans them once and nests every workspace under a
> real **Projects** folder node in the tree — not a UI grouping; it collapses and expands
> like any other folder.

> [!NOTE]
> The `.dc.html` files under `Src/` are Claude Design exports, not something you can edit
> locally — they use Claude Design's own template syntax and need `support.js` to render.

---

<p align="center">
  <a href="Hub/README.md">⚙️ The program</a> ·
  <a href="Project-Hub/README.md">🚀 The manual</a> ·
  <a href="Docs/ROADMAP.md">📄 Roadmap</a>
</p>

<p align="right"><sub><a href="#html-design-top">back to top</a></sub></p>
