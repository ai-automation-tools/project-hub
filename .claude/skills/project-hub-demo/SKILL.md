---
name: project-hub-demo
description: >-
  Work on Project Hub's hosted demo at project-hub.ai-automation-tools.dev — the capture
  build in `Demo/build-demo.mjs` that stands the real hub up against the `Demo/Workspace`
  fixture, crawls every response and writes flat files into `Demo/site`, plus the
  `Demo/static/demo.js` fetch shim, the `sub()` literal assertions against `Hub/index.html`,
  and the Pages workflow. Use for "the demo build failed with expected 1x … found 0", "add a
  workspace / repo / document to the fixture", "the demo shows a stale tree", "an image or
  PDF 404s on the demo but works locally", "slug collision", "the demo deploy / CNAME /
  GitHub Pages", "captured N API responses is too low in CI", and any edit to Demo/ or
  .github/workflows/demo.yml.
---

# The hosted demo

**Nothing in `Demo/` reimplements the hub.** The build runs the real `Hub/hub.mjs` against a
fictional workspace, crawls every response it produces, and writes those out beside an
unmodified copy of `Hub/index.html`. That is the entire design, and the property worth
protecting: **if the scanner changes, the demo changes with it, or the build fails loudly.**

Which is why the demo build is wired into `test.yml` as an integration test, not just into
the deploy. A red demo build usually means the interface moved, not that the demo broke.

```sh
node Demo/build-demo.mjs          # Node 18.17+ and Git. --keep leaves Demo/.build to inspect
```

Both `Demo/.build` and `Demo/site` are gitignored. Nothing generated is committed.

---

## 1. The five phases

| | Phase | Output |
|:-:|:---|:---|
| 1 | Stage `Workspace/` and `Home/` into `.build`, write the hub configs | `.build/workspace`, `.build/home`, `.build/hub` |
| 2 | `git init` every entry in `REPOS`, each with a **bare origin** | real branch / state / last-commit columns |
| 3 | Spawn the real hub on port 4399 with `HOME`/`USERPROFILE` pointed at the fixture | a live hub |
| 4 | Crawl `/api/scan`, `/api/health`, then every node | `site/api/NNNN.json` + `api/manifest.json` + `site/files/` |
| 5 | Copy the modules and `demo.js`, rewrite `index.html` literals | `site/index.html` |

Two details in phase 1-3 that are load-bearing:

- The configs are **written at build time**, never committed, so no config in the repo
  carries a path that is only true on one machine.
- `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` point at an empty file and `GIT_AUTHOR_*` is
  fixture-wide. The fixture repos cannot pick up the build machine's identity, signing keys
  or hooks, and **no commit in the demo carries a real person's name or address.**
- `HOME`/`USERPROFILE` are overridden because the scanner reads `os.homedir()` for the user
  CLI roots. Without it the published demo would show the build machine's skills.

## 2. The literal contract with index.html

Phase 5 rewrites `Hub/index.html` through `sub(find, replace, expected)`, which **throws if
the match count is not exactly `expected`**:

| Literal | × | Why |
|:---|:-:|:---|
| `%TITLE%` `%FAVICON%` `%PORT%` | 1 | Server-side template values. `%PORT%` keeps the real default on purpose — the page compares it to `location.port` and so never opens an event stream on a static host |
| ` nonce="%NONCE%"` | 2 | No server, no per-request nonce |
| `download.href = '/api/raw?path=' + …&download=1';` | 1 | Whole statement, replaced with `DEMO_ASSET(n.id)` |
| `'/api/raw?path=' + encodeURIComponent(` | 4 | Prefix only, so the call's own closing paren still closes it |
| `'/api/preview?path=' + encodeURIComponent(` | 1 | Same |
| `<script type="module">` | 1 | `demo.js` is injected ahead of it |

> [!IMPORTANT]
> **`expected 4x "…" found 3` is not a demo bug.** It means someone changed an asset URL in
> `index.html`, and the assertion caught it before it shipped a demo that half works. Fix the
> `sub()` call in the same commit as the interface change. See the
> [`project-hub-client`](../project-hub-client/SKILL.md) skill.

Asset URLs cannot go through the shim because they are **element attributes, not fetches** —
an `<img src>` never reaches patched `fetch`. They are rewritten to `DEMO_ASSET(id)`, whose
slug rule (`[^A-Za-z0-9._-]` → `_`) is implemented **twice**, in `slug()` in the build and in
`assetPath()` in `demo.js`, because an `<img src>` cannot wait for a manifest to load. Change
one and you must change the other; the build throws on a slug collision rather than
silently overwriting a captured file.

## 3. What the shim answers, and what it refuses

`demo.js` is a classic script loaded **before** the app module, so `fetch` is already patched
by the time the first request runs. It intercepts same-origin `/api/*` only, keyed by
`keyOf(url)` — the same key the build recorded, with `fresh` and `download` dropped because
neither changes the bytes.

Two endpoints answer honestly rather than failing:

- `/api/open` → **501** with a sentence saying opening files needs a local hub. A hosted page
  has no filesystem, and a status nobody can read is worse than a plain refusal.
- `/api/pictures` → **404**, because no Pictures root is configured in the fixture.

Keep that pattern for anything new: **say what is absent, do not let it look broken.** The
demo README's "what is real, and what is not" table is part of the deliverable — update it
whenever this changes.

## 4. Changing the fixture

Ordinary markdown and config under `Demo/Workspace/` and `Demo/Home/`, read by the same
scanner that reads a user's. Rebuild to see it.

- **New workspace** → a folder under `Workspace/Projects/` **plus** an entry in
  `PROJECT_CONFIGS`. There are three on purpose — one server mounting several workspaces is
  a thing worth showing, and one scopes by `groups` while two scope by `pathPrefix` so both
  forms are exercised.
- **New repo** → the folder **plus** a row in `REPOS` (`dir`, `branch`, `state`, `author`,
  `commit`). `state` is genuinely produced: `ahead` is an extra local commit, `behind` pushes
  one then resets back off it, `dirty` writes an uncommitted file. **The mix is deliberate —
  a table where every row says `clean` demonstrates nothing.**
- `Repos/Private/Draft/` has no `.git` by convention, so drafts are correctly absent from `REPOS`.
- Everything invented: every workspace, repo, person and domain is fictional, and commits use
  `team@example.dev`. Keep it that way.

## 5. Publishing

`.github/workflows/demo.yml` runs the same command on any push to `main` touching `Hub/` or
`Demo/`, and deploys `Demo/site` to Pages (`concurrency: pages`, a queued run supersedes an
older one). The domain comes from `Demo/static/CNAME`; **Pages must be set to "GitHub
Actions" as its source** in repo settings or the workflow has nowhere to publish.
`.nojekyll` is written because Jekyll would drop underscore-prefixed paths and add nothing.

`test.yml`'s `demo-build` job additionally asserts the capture is not empty and holds **more
than 100 API responses** — the failure a green build would otherwise miss is a build that
happily writes an empty site because the fixture stopped being found.

---

## 6. Checklist

1. `node Demo/build-demo.mjs` locally before pushing anything that touches `Hub/` or `Demo/`.
2. A `sub()` failure → fix the `sub()` call, not the assertion count alone; confirm the
   rewritten interface still works.
3. New file extension in the fixture → `TEXT`/`BINARY` in the build **and** `DOC_FILE` /
   `kindOfFile()` in `hub.mjs`, or the node captures nothing.
4. New workspace or repo → the folder **and** its `PROJECT_CONFIGS` / `REPOS` row.
5. Serve `Demo/site` with a static server to check it — `file://` cannot work, the shim
   answers root-relative paths.
6. `--keep` to inspect `.build` when the capture looks wrong.
7. Changed what the demo can or cannot do → update the table in `Demo/README.md`.

## 7. Anti-patterns

- **Hand-editing anything in `Demo/site`.** It is generated and gitignored; fix the build.
- **Faking a response the hub never produced.** The capture's whole value is that it came
  from the real scanner.
- **Loosening a `sub()` count to make the build pass.** That assertion is the regression test.
- **Letting a missing capability fail silently.** 501/404 with a sentence, like `/api/open`.
- **Real names, real domains, or a real person's commits in the fixture.**
- **Committing a config with an absolute path.** Phase 1 writes them for a reason.

---

## Related

| For | See |
|:---|:---|
| Phase-by-phase notes, the manifest format, failure messages | [`references/build-and-capture.md`](references/build-and-capture.md) |
| The literals this build rewrites, and who owns them | the `project-hub-client` skill |
| `DOC_FILE` / `kindOfFile` — what is capturable at all | the `project-hub-scan` skill |
| What the demo claims to be | `Demo/README.md` |
