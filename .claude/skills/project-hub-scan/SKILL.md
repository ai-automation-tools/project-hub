---
name: project-hub-scan
description: >-
  Change what Project Hub's scanner walks, indexes or serves — the filter chain in
  `Hub/hub.mjs` (SKIP_DIRS / DOT_OK / DOC_FILE / SECRET_DIRS), the node `kind` vocabulary,
  the `BUCKETS` and `USER_RUNTIMES` tables behind the CLI pages, and the second deny gate in
  `resolveId()` that every `/api/*` path check goes through. Use for "a folder is missing
  from the tree", "my new agent runtime doesn't show up", "add a file type to the scan",
  "add a node kind", "the scan is slow / the payload is huge", "the page won't refresh after
  I edit a file", "repoScope / hub.config.json", "a repo is missing from the overview
  table", and anything touching scanTree, scan(), the watcher, /api/scan, /api/file,
  /api/stat or /api/health.
---

# Changing what the hub sees

**A node is only in the tree if it survived four filters, and it is only readable if
`resolveId()` agrees a second time.** Most "why isn't this showing up" bugs are one filter,
and most "why can I read that" bugs are the second gate missing.

All commands run from **`Hub/`**, not the repo root. `npm test` is 66 Node tests over
`hub.mjs`, `reports.mjs` and `pictures.mjs`.

---

## 1. The filter chain

In `walk()` inside `scanTree()`, in this order. A directory must pass all four:

| Filter | Rejects | Where |
|:---|:---|:---|
| `SKIP_DIRS` | `node_modules`, `dist`, `.venv`, `target`, `vendor`, … | by exact name |
| `.`-prefix unless `DOT_OK` | every dot-dir except `.claude .codex .opencode .agents .antigravity .gemini .github .cursor` | by name |
| `SECRET_DIRS` | `keys secrets .secrets credentials certs .ssh .gnupg` — **only inside a repo** (`ctx.repo`) | lowercased name |
| `MOUNTED_ROOTS` | a directory that is already mounted as its own root, so a subtree is never indexed twice under two parents with the same ids | absolute path |

Files inside a repo pass only `DOC_FILE` — markdown, config, csv, pdf, html, images, plus
`LICENSE`/`NOTICE`/`Dockerfile`/`Makefile`/`CNAME`. **Repos are walked for docs and
deliverables, not source.** The comment above `DOC_FILE` measures the alternative at
~117,000 extra files on the author's machine. Whatever it drops is still counted as the
folder's `more` badge, so the fix for "my `.py` is missing" is almost never widening
`DOC_FILE` — it is `open folder`.

`MAX_DEPTH` is 7. `NOISE_FILE` hides the hub's own `hub.log` / `scan.json` so a log write
does not read as a library change.

> [!WARNING]
> **Adding an extension to `DOC_FILE` is not free and not local.** `Demo/build-demo.mjs`
> has its own `TEXT` and `BINARY` regexes that decide whether a captured node is fetched
> as `/api/file` or `/api/raw`; `kindOfFile()` decides which view the client opens. A new
> extension in one and not the others gives you a node that renders as an empty page.
> Change all three or none. See the [`project-hub-demo`](../project-hub-demo/SKILL.md) skill.

## 2. Secrets are pruned twice, deliberately

`SECRET_DIRS` / `SECRET_FILE` keep credential stores **out of the scan**. That is not
enough: `/api/file?path=…` is addressed by path, not by index, so a hand-typed URL would
still read a file the tree never listed. `resolveId()` re-checks:

```js
// hub.mjs — every /api/* path check calls this, no exceptions
const ok = SERVE_DIRS.some((d) => lo === d || lo.startsWith(d + '/'));   // inside a served root
if (segs.some((s) => SECRET_DIRS.has(s.toLowerCase()))) return null;     // same deny-list, at the exit
if (CREDENTIAL_FILE.test(path.basename(abs))) return null;               // key material by extension
```

The serve layer uses the narrower `CREDENTIAL_FILE` (extensions only), not `SECRET_FILE`,
so a doc honestly named `secret-scanner.md` stays readable. **Any new endpoint that takes a
`path` calls `resolveId()` first and 403s on null** — that is the whole boundary.

## 3. Node kinds and the CLI tables

`kind` is the tree's vocabulary; the client dispatches views off it (see the
[`project-hub-client`](../project-hub-client/SKILL.md) skill). Adding one means **three
places**: the `TINT` map in `hub.mjs`, the `TINT` / `ROUND` / `DIRISH` / `ENTITY` /
`KIND_LABEL` sets in `index.html`, and a branch in `renderPage()`. Reuse a kind before
adding one — `folder` is the fallthrough and is usually right.

Agent tooling is two tables, not code:

- **`BUCKETS`** maps a directory name under a `CONFIG_DIRS` folder to an entity kind —
  `skills→skill`, `commands→command`, `prompts→command`, `output-styles→style`. A new
  vendor that calls its folder `recipes/` needs one row here, nothing else.
- **`USER_RUNTIMES`** is the user-scope side (`~/.claude`, `~/.codex`, …). Each entry names
  only the sub-dirs worth walking, on purpose: `~/.claude` also holds sessions, caches and
  400MB of plugin checkouts. A new runtime needs `dir`, `dirs`, `files`, optionally `mcp`
  and `hooksFile`+`hooksFormat` (`json` | `toml` | `antigravity`), and — if its config
  lives outside its own folder, as Antigravity's hooks do — an entry in `SERVE_DIRS`.
- **`VENDOR_ALIAS`** joins a project's `Agents/<vendor>/` folder to its user-scope runtime
  so one page shows both. No alias = project-only page, which is fine.

## 4. Scan cost, caching and the watcher

One scan at a time, its **serialised JSON reused** until the watcher says the library moved.
The walk is synchronous — a ~15k-path walk plus ~1300 doc reads blocks the event loop, so a
per-request scan serialises every request into a queue that never drains.

- `/api/scan` always serves `cached`; only the rescan button (`fresh=1`) waits for a walk.
- Gzip happens **once per scan**, not per request — 5.1MB → ~0.6MB.
- `scanSignature(flat, repos)` is what tells the client the payload actually changed. It
  mixes `id|desc|size|mtime` per node plus each repo's git state. **`mtime` and `abs` are
  non-enumerable on purpose** — a timestamp on 40,000 nodes is the payload weight the
  Pictures pass spent itself removing. The folder list view fetches `/api/stat` for one
  open folder instead.
- `ignoreWatchEvent(dir, name)` is exported and tested; a file the hub writes itself must be
  ignored there or the hub rescans forever.
- Git state is cached 15s (`GIT_TTL`) behind a 6-slot queue (`GIT_CONCURRENCY`).

If a change makes the scan slower, `/api/health` carries the rolling `scanLog` — ten
entries of `ms`, `bytes`, `gzip`, `nodes`, `errs` and per-phase timings. **Read errors are
counted per scan, not since boot**: a lifetime counter with a fixed threshold turns every
long-running hub unhealthy eventually.

## 5. Config is the machine-specific half

Nothing machine-specific belongs in `hub.mjs`. `loadConfig()` validates the server file
(`port` 1024-65535 and `base` are required; `sharedRoots[]` needs `name`+`dir`);
`loadProjectConfig()` validates one workspace (`name`+`dir` required, `repoScope.groups`
and `repoScope.pathPrefix` mutually exclusive — `validateRepoScope` throws on both).

`scopeRepos()` is pure and exported, which is why "a repo is missing from the overview
table" has a unit test rather than a debugging session. A repo missing from the **table**
but present in the **tree** is a `repoScope` problem, not a scanner problem.

---

## 6. Checklist

1. **Which filter?** Walk §1 in order before editing anything.
2. **New extension** → `DOC_FILE`, `kindOfFile()`, and the demo build's `TEXT`/`BINARY`.
3. **New kind** → server `TINT`, client's five sets, a `renderPage()` branch.
4. **New endpoint taking a path** → `resolveId()` first, 403 on null.
5. **New file the hub writes** → `NOISE_FILE` + `ignoreWatchEvent`.
6. `npm test` from `Hub/`. Pure helpers are exported precisely so they are testable —
   add the export and the test, don't test through the server.
7. `npm run scan` writes `scan.json` without starting a server — the fastest way to see
   what the tree now contains. `HUB_DEBUG=1 node hub.mjs` adds per-request timing.

## 7. Anti-patterns

- **Widening `DOC_FILE` to surface one file.** It multiplies the payload for every repo.
- **A path check that skips `resolveId()`.** The tree filter is not a security boundary.
- **Putting a machine path in `hub.mjs`.** `base`, `sharedRoots` and workspace `dir`s are config.
- **Making every node carry `mtime`.** Fetch `/api/stat` for the folder that needs it.
- **Kicking off a scan inside a request handler.** It blocks the response it is serving.
- **Walking a whole `~/.<vendor>` folder.** Name the sub-dirs in `USER_RUNTIMES`.

---

## Related

| For | See |
|:---|:---|
| Filter-chain order, kind vocabulary, endpoint table | [`references/scan-internals.md`](references/scan-internals.md) |
| Views, themes, routes — the client side of a new `kind` | the `project-hub-client` skill |
| The fixture and the capture that mirror these rules | the `project-hub-demo` skill |
| Config keys as a user sees them | `Hub/README.md`, `Project-Hub/README.md` |
