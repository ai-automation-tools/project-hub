# The demo build, phase by phase

`Demo/build-demo.mjs`, ~340 lines, no dependencies. `PORT` is 4399 so it never collides with
a hub running on 4273. Everything below is in that file unless noted.

## Layout

| Path | Committed | What |
|:---|:-:|:---|
| `Demo/Workspace/` | yes | The scanned base — 3 workspaces, 2 shared roots (`Documents`, `Automations`) |
| `Demo/Home/` | yes | A fictional user home, so **User CLIs** shows demo skills |
| `Demo/static/demo.js` | yes | The fetch shim |
| `Demo/static/CNAME` | yes | The custom domain, copied into the site |
| `Demo/.build/` | no | Staging: `workspace/`, `home/`, `hub/`, `origins/`, `gitconfig` |
| `Demo/site/` | no | The published output |

## Captured output

| File | Contents |
|:---|:---|
| `site/api/NNNN.json` | One recorded response, numbered in crawl order |
| `site/api/manifest.json` | `keyOf(pathname, params)` → file. The shim's whole index |
| `site/files/<slug>` | Binary assets, named by `slug(id)` |
| `site/index.html` | `Hub/index.html` after the `sub()` rewrites |
| `site/navigation.mjs`, `site/pictures-client.mjs` | Copied byte-for-byte from `Hub/` |
| `site/demo.js`, `site/CNAME`, `site/.nojekyll` | The shim, the domain, the Jekyll opt-out |

## The crawl

Walks the scan tree depth-first, `stat()`ing each id to let the **filesystem** answer "file
or folder" rather than guessing from `kind`:

- **directory** → `/api/stat?path=` (folder mtimes)
- **matches `TEXT`** → `/api/file` **twice**, with and without `raw=1`. Both bodies are small,
  so prebaking the view-source toggle is cheaper than predicting which the visitor wants
- **matches `BINARY`** → `/api/raw`, written to `files/<slug>`

`TEXT` and `BINARY` are the build's own regexes. `TEXT` is **wider** than `DOC_FILE` — it
includes `.mjs`, `.js`, `.ps1`, `.sh`, `.vbs` — because a fixture may show source files the
repo doc-filter would drop from a repo interior.

Absolute paths are scrubbed from the scan payload before recording: the build machine's
workspace becomes `D:/Work` and its home becomes `C:/Users/demo`, matching the examples used
everywhere else in the repo. Ids stay relative, so only the displayed string changes.
`/api/health` has its `pid` deleted.

## Error messages you will see

| Message | Means |
|:---|:---|
| `expected 4x "…" in index.html, found 3` | The interface moved a literal. Update the `sub()` call |
| `slug collision: <a> and <b>` | Two ids slug to one filename. Rename a fixture file |
| `/api/scan answered 500` | The real hub failed against the fixture — a scanner bug, reproduced |
| `hub did not come up on http://127.0.0.1:4399` | 30s of `/api/health` polling failed. Run with `--keep` and start the hub on the staged config by hand |
| CI: `captured N` with `test "$captured" -gt 100` failing | The fixture was not found; the site is empty |

`clear()` empties `Demo/site` rather than removing it — a shell or editor sitting in the
output folder holds a handle on the directory and `rm` then fails with `EPERM`.

## Local preview

```sh
node Demo/build-demo.mjs
npx serve Demo/site        # any static server; file:// cannot work
```

The shim answers root-relative paths, so the site must be served from a root.
