# Demo site

<p>
  <a href="https://project-hub.ai-automation-tools.dev"><img src="https://img.shields.io/badge/live-project--hub.ai--automation--tools.dev-5fd6a1?style=for-the-badge" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/hosting-GitHub%20Pages-0078D4?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Pages">
  <img src="https://img.shields.io/badge/build-no%20dependencies-6B7280?style=for-the-badge" alt="No build dependencies">
</p>

A hosted, read-only Project Hub over a **fictional** workspace, at
**[project-hub.ai-automation-tools.dev](https://project-hub.ai-automation-tools.dev)**.

Project Hub reads a real filesystem on loopback, so it cannot simply be put on a server.
This is the next closest thing, and the distinction matters: the build stands the **actual
hub** up against the fixture workspace below, crawls every response it produces, and writes
those out as flat files next to an unmodified copy of the interface. Nothing here
reimplements the scanner — if the scanner changes, the demo changes with it, or the build
fails loudly.

## What is real, and what is not

| | |
|:---|:---|
| The interface | The real `Hub/index.html`, byte-for-byte apart from asset URLs the build rewrites |
| The scan payload | Produced by the real `Hub/hub.mjs` against the fixture |
| Git state | Real repositories, initialised at build time — the `clean`/`dirty`/`ahead`/`behind` column is genuine `git status` output |
| The content | Invented. Every workspace, repo, person and domain in it is fictional |
| Live updates | Absent. There is no server to stream changes from, so the event stream is never opened |
| Opening files | Absent. A hosted page has no filesystem to open; the button says so |
| Pictures | Not configured in the fixture |
| The `/` mark | Links home, to the site root. Inert in a local hub — a deep-linked visitor here needs a way back to the top |

## The fixture

| Path | What it is |
|:---|:---|
| `Workspace/` | The scanned base — three project workspaces plus two shared roots |
| `Home/` | A fictional user home, so the **User CLIs** branch shows demo skills rather than the build machine's |
| `static/demo.js` | The shim that answers `/api/*` from the captured files |
| `static/CNAME` | The custom domain, copied into the published site |
| `build-demo.mjs` | The whole build |

Three workspaces on purpose, because one of the things worth showing is that a single
server mounts several: `Example_Workspace` scopes its repos by group, the other two by
path prefix. The repo states are deliberately mixed — one dirty, one ahead, one behind —
since a table where every row says `clean` demonstrates nothing.

## Build it

```sh
node Demo/build-demo.mjs
```

Needs Node 18.17+ and Git. It stages the fixture in `Demo/.build`, initialises the
fixture repositories, starts the hub on port 4399, crawls it, and writes `Demo/site`.
Both folders are ignored; nothing generated is committed. Pass `--keep` to leave
`Demo/.build` behind when you want to inspect what was scanned.

To look at the result before pushing, serve `Demo/site` with any static server — opening
`index.html` over `file://` will not work, because the shim answers root-relative paths.

## Publishing

`.github/workflows/demo.yml` runs the same command on every push to `main` that touches
`Hub/` or `Demo/`, and deploys `Demo/site` to GitHub Pages. The domain is set by
`static/CNAME`; Pages must be set to **GitHub Actions** as its source in the repository
settings for the workflow to have anywhere to publish.

## Changing the fixture

Edit the files under `Workspace/` and `Home/` and rebuild — they are ordinary markdown and
config, read by the same scanner that reads yours. To add a workspace, add a folder under
`Workspace/Projects/` and an entry to `PROJECT_CONFIGS` in `build-demo.mjs`. To add a repo,
add the folder and a row in `REPOS`, which is also where its branch, author, commit subject
and git state are set.

The build rewrites a handful of exact string literals in `index.html` (the two template
placeholders and the asset URLs). Each replacement asserts how many times it expects to
match, so a change to the interface that moves them fails the build rather than shipping a
demo that half works.

---

<p align="center"><a href="../README.md">← Project Hub</a></p>
