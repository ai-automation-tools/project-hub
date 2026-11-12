# Demo site

<p>
  <a href="https://project-hub-demo.ai-automation-tools.dev"><img src="https://img.shields.io/badge/live-project--hub.ai--automation--tools.dev-5fd6a1?style=for-the-badge" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/hosting-GitHub%20Pages-0078D4?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Pages">
  <img src="https://img.shields.io/badge/build-no%20dependencies-6B7280?style=for-the-badge" alt="No build dependencies">
</p>

A hosted, read-only Project Hub over a **fictional** workspace, at
**[project-hub-demo.ai-automation-tools.dev](https://project-hub-demo.ai-automation-tools.dev)**.

Project Hub reads a real filesystem on loopback, so it cannot simply be put on a server.
This is the next closest thing, and the distinction matters: the build stands the **actual
hub** up against the fixture workspace below, crawls every response it produces, and writes
those out as flat files next to an unmodified copy of the interface. Nothing here
reimplements the scanner — if the scanner changes, the demo changes with it, or the build
fails loudly.

## What is real, and what is not

| | |
|:---|:---|
| The interface | The real `hub/index.html`, byte-for-byte apart from asset URLs the build rewrites |
| The scan payload | Produced by the real `hub/hub.mjs` against the fixture |
| Git state | Real repositories, initialised at build time — the `clean`/`dirty`/`ahead`/`behind` column is genuine `git status` output |
| The content | Invented. Every workspace, repo, person and domain in it is fictional |
| Live updates | Absent. There is no server to stream changes from, so the event stream is never opened |
| Opening files | Absent. A hosted page has no filesystem to open; the button says so |
| Uncommitted changes | Real. The build captures each dirty fixture repo's change list and the diff of every changed file |
| Content search | Absent, except the fixture's `tag:` searches, which the build captures ahead of time. Any other query needs the server's index |
| Link check | Absent. It reads every document under a folder on request, so there is no fixed answer to capture |
| Settings | Real, and remembered per browser like the local hub's |
| Favorites | Absent. Both sources are served by the local server, so the view says the server is needed |
| Hub tabs | The switch works, but with no server to ask whether a site can be embedded, every site opens in a browser tab |
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

The same reasoning applies to the rest. Each shipped feature has fixture content that
shows it doing something:

| To see | Try |
|:---|:---|
| Root and type chips | Search `e`, then pick **PDF** (2), **Image** (3) or **HTML** (3), or a root |
| Typo fallback | Search `maintainance`, `dependancy` or `accesibility`: no exact match, one close one |
| Changed this week | The Projects page: click the folded heading. The build ages the fixture a month, then brings eight files back into the week |
| Routine pass/fail | **User CLIs → Claude Code → routines**: `docs-sweep` passed, `link-audit` failed. Its chips show the JSON and latest log |
| Uncommitted changes | `atlas-web`, the dirty repo |
| Roadmap progress | `signal-api` (6/11) |
| Tags | `signal-api/Docs/export-pipeline.md` and `rate-limits.md` |
| Images in a document | `atlas-web/Docs/routing.md`, `studio-kit/Docs/tokens.md` |

The routine run logs are the only `.log` files the repo tracks; `.gitignore` makes an
exception for them.

## Build it

```sh
node demo/build-demo.mjs
```

Needs Node 18.17+ and Git. It stages the fixture in `demo/.build`, initialises the
fixture repositories, starts the hub on port 4399, crawls it, and writes `demo/site`.
Both folders are ignored; nothing generated is committed. Pass `--keep` to leave
`demo/.build` behind when you want to inspect what was scanned.

To look at the result before pushing, serve `demo/site` with any static server — opening
`index.html` over `file://` will not work, because the shim answers root-relative paths.

## Publishing

`.github/workflows/demo.yml` runs the same command on every push to `main` that touches
`hub/` or `demo/`, and deploys `demo/site` to GitHub Pages. The domain is set by
`static/CNAME`; Pages must be set to **GitHub Actions** as its source in the repository
settings for the workflow to have anywhere to publish.

## Changing the fixture

Edit the files under `Workspace/` and `Home/` and rebuild — they are ordinary markdown and
config, read by the same scanner that reads yours. To add a workspace, add a folder under
`Workspace/Projects/` and an entry to `PROJECT_CONFIGS` in `build-demo.mjs`. To add a repo,
add the folder and a row in `REPOS`, which is also where its branch, author, commit subject
and git state are set. A file that should appear under "Changed this week" goes in `RECENT`,
with how many hours old to make it.

The build rewrites a handful of exact string literals in `index.html` (the two template
placeholders and the asset URLs). Each replacement asserts how many times it expects to
match, so a change to the interface that moves them fails the build rather than shipping a
demo that half works.


---

<p align="center"><a href="../README.md">← Project Hub</a></p>
