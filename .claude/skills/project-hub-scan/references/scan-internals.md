# Scan internals — the tables you will have to edit

Everything below is in `Hub/hub.mjs` unless noted.

## The endpoints

| Path | Takes | Gate | Notes |
|:---|:---|:---|:---|
| `/api/scan` | `fresh=1` | — | Serves the cached gzip. `fresh` is the only caller that waits for a walk |
| `/api/health` | — | — | Uptime, `scanLog` (last 10 scans), watcher ticks, read errors **per scan** |
| `/api/file` | `path`, `raw=1` | `resolveId` | JSON `{html}`. `md` → `md2html`, anything else → escaped `<pre>`. 415 on pdf/image |
| `/api/stat` | `path` | `resolveId` | `folderStamps()` — mtimes of one folder's children, keyed by name |
| `/api/raw`, `/api/preview`, `/api/artifact/<token>/…` | `path` | `resolveId` | `reports.mjs`. Sandboxed CSP, HMAC-signed directory capability, key rotates at restart |
| `/api/pictures` | — | — | `pictures.mjs`. Inert when no `Pictures` shared root is configured |
| `/api/open` | `path`, `in=code`, `reveal=1` | `resolveId` **+ `sameOrigin`** | The only endpoint with an effect outside the browser. Windows-specific |
| `/api/events` | — | — | SSE, 25s heartbeat |
| `/api/webmarks` | `source` | `sameOrigin`; id matched against discovered profiles, never a path | `webmarks.mjs`. Edge/Chrome/Brave `Bookmarks` JSON read live, `http(s)` links only |
| `/api/favorites` | GET, or PUT `{roots}` as `application/json` | `sameOrigin` | `webmarks.mjs` `cleanTree()` / `saveFavorites()` → `favorites.json` beside the config (gitignored), tmp + rename, 5 MB cap |
| `/api/frameable` | `url` (http/https) | `sameOrigin` | `webmarks.mjs` `createFrameCheck()`. `X-Frame-Options` / `frame-ancestors`, cached per URL, unreachable = false |
| `/api/favicon` | `url` (http/https) | `sameOrigin` | `webmarks.mjs` `createFavicons()`. Page `<link rel=icon>` then `/favicon.ico`, bytes sniffed, one result per origin cached, script-free CSP |

Two request gates apply to **every** response, set before routing:

- **Host check** — `HOSTS_OK` is loopback only. Defeats DNS rebinding: a rebound request
  still carries the attacker's hostname.
- **CSP with a per-request nonce**, plus `nosniff` and `no-referrer`.

`sameOrigin(req)` reads `sec-fetch-site` and accepts `same-origin`, `none`, or absent.
`/api/open` needs it because a `<img src="…:4273/api/open?path=…">` on a foreign page would
fire a GET with a side effect without ever reading the response.

## Node kinds

| Kind | Made by | Client view |
|:---|:---|:---|
| `root` | a mounted project root | `viewOverview` |
| `docroot` `userroot` | a shared root / a user-scope runtime | `viewDocFirst` when it has a README, else `viewFolder` |
| `projects` | the portfolio node | `viewPortfolio` |
| `section` `group` `folder` | plain directories | `viewFolder` |
| `repo` | a directory containing `.git` | `viewRepo` |
| `draft` | `Repos/Private/Draft/*` at depth 2 — pre-repo R&D, doc-filtered like a repo | `viewFolder` |
| `cli` | `Agents/<vendor>/` at depth 1 with a `CLAUDE.md`/`AGENTS.md` | `viewCli` |
| `skill` `command` `agent` `hook` `style` `routine` | `BUCKETS`, inside a `CONFIG_DIRS` folder | `viewEntity` |
| `md` `config` `html` `pdf` `file` | `kindOfFile()` | `viewFile` |
| `image` | `kindOfFile()` | `viewImage` |

A CLI runtime **wins over** the repo short-circuit — Codex is both. Inside a repo, `section`
is cleared so the depth-1 group/CLI rules cannot fire again deeper in the tree.

## Node fields worth knowing

| Field | Meaning |
|:---|:---|
| `id` | Path relative to `base`, or `~/`-prefixed for user scope. Both forms understood everywhere |
| `desc` | First real line of the node's doc, via `describe()` → `blurb()`/`frontmatter()`. LRU-capped at 20,000 |
| `doc` | Id of the README/SKILL.md that documents this node |
| `docFirst` | Open on the doc instead of the folder listing. Roots and CLI pages never set it |
| `more` | Count of files the doc-filter dropped — "+N other files" instead of "empty folder" |
| `badge` | Child count |
| `abs`, `mtime` | **Non-enumerable.** Never on the wire; `scanSignature` reads `mtime` locally |

## Hook formats

`readHooksFrom(file, format)` dispatches on three: `json` (Claude, Gemini),
`toml` (Codex), `antigravity`. OpenCode has none — its hooks are JS/TS plugin exports, so
its `USER_RUNTIMES` entry deliberately omits `hooksFile` rather than guessing. Project-scope
equivalents live in `PROJECT_HOOK_SOURCES`, keyed by lowercased vendor.

## Markdown

`md2html()` is server-side and its output goes straight into the page, so it is the only
place near-untrusted input is parsed — which is why it carries the most tests.
`sanitizeHtml()` is an **allowlist**: `HTML_TAGS`, `GLOBAL_ATTRS`, `TAG_ATTRS`,
`URL_ATTRS` + `safeUrl()`. Add a tag to the allowlist, never a blocklist entry.
`slugifyHeading(text, seen)` is what makes `#heading` deep links stable, and both the
outline and `routeHash()` depend on it agreeing with itself across renders.
