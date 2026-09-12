<a id="roadmap-top"></a>

<h1 align="center">🗺️ Project Hub Roadmap</h1>

<p align="center">
  <em>What the hub gets wrong, what it's missing, and the order to fix it in.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/reviewed-2026--09--09-2ea44f?style=for-the-badge" alt="Reviewed 2026-09-09">
  <img src="https://img.shields.io/badge/phases_0--4-shipped-2ea44f?style=for-the-badge" alt="Phases 0 to 4 shipped">
  <img src="https://img.shields.io/badge/P5-9_of_10_fixed-2ea44f?style=for-the-badge" alt="P5: 9 of 10 items fixed 2026-09-03">
  <img src="https://img.shields.io/badge/P6-merged_to_1_process-2ea44f?style=for-the-badge" alt="P6: merged to one process 2026-09-07">
  <img src="https://img.shields.io/badge/P7--01–16-all_shipped-2ea44f?style=for-the-badge" alt="P7-01 to P7-16 all shipped">
  <img src="https://img.shields.io/badge/P8-Links_root_%2B_README_landing_%2B_8_themes-2ea44f?style=for-the-badge" alt="P8: Links root, README-first landing views, and eight color schemes">
  <img src="https://img.shields.io/badge/SVG_sandbox-regression_fixed-e0a458?style=for-the-badge" alt="SVG sandbox regression fixed">
  <img src="https://img.shields.io/badge/P7--14-blocked_on_a_viewport-e0a458?style=for-the-badge" alt="P7-14 blocked on reaching a narrow viewport">
  <img src="https://img.shields.io/badge/tests-64_passing-8B5CF6?style=for-the-badge" alt="64 tests passing">
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-Project_Hub-6B7280?style=for-the-badge" alt="Back to Project Hub"></a>
</p>

---

> [!NOTE]
> **All five phases shipped 2026-08-31.** Every P0 defect is closed, the three hubs are one
> codebase plus a config file each, the UI is keyboard-navigable with real URLs, and the
> hubs report their own health. What is left is deliberately unbuilt — see
> [Still open](#still-open). Detail per phase: [0](#phase-0--what-shipped),
> [1](#phase-1--what-shipped), [2](#phase-2--what-shipped), [3](#phase-3--what-shipped),
> [4](#phase-4--what-shipped). A second, independent audit on 2026-09-03 found four more
> defects — all fixed same day — plus six enhancement ideas, five of which are also now
> fixed. See [P5](#p5--2026-09-03-antigravity-audit). **On 2026-09-07 the three hubs
> became one** — see [P6](#p6--2026-09-07-one-process-not-three).
> **Current next steps:** every numbered item in [P7](#p7-review) has shipped except **P7-14**, which is *blocked rather than deferred* — no genuine 640–1024px viewport has ever been reached with the available tooling, so nothing about the layout at that width is measured and building to a guess would just ship a second wrong layout. After that: the remaining third of **P7-07** (root/type filters, typo tolerance, opt-in content search), the remaining third of **P7-15** (keyboard access to context menus and the sidebar divider), and the optional **P7-17–21**. One thing was found rather than planned — the `EISDIR`/`ENOENT` read errors under `~/.gemini/skills/` that P7-16's status panel made visible, still unexamined. Connection recovery and any clipboard write remain unverified; see [Verification still needed](#verification-still-needed). Three requested additions shipped the same day — the `Links` root, README-first landing views for every folder that has one, and four more color schemes; see [P8](#p8--2026-09-09-the-links-root-readme-landing-views-and-four-more-color-schemes).

## What was audited

All three builds — [`Project-Hub`](../Project-Hub/README.md) (4273), `Project-Hub-IAM`
(4274), `Project-Hub-Finance` (4275, both retired 2026-09-07 — see
[P6](#p6--2026-09-07-one-process-not-three)) — at roughly 2,100 lines each: `hub.mjs`
(927), `index.html` (1,150), `Start-Hub.ps1` (80).

Everything in the P0 table below was **reproduced against the running servers**, not
inferred from reading. Where a number appears, it was measured. The method is recorded
in each finding so a fix can be checked the same way.

| Measured | Value |
|:---|:---|
| Scan payload, AI Lab hub (uncompressed, as actually served) | **10,737,482 bytes** |
| Same payload gzipped (computed every scan, never sent) | **1.08 MB** |
| Tree nodes / search-index entries | 30,042 / 25,724 |
| Warm scan time | 3.7–4.4 s |
| Click handlers on non-interactive elements | 21 |
| `role` / `aria-*` / `tabindex` attributes in the whole UI | **0** |
| Automated tests, lint configs, `package.json` | **0 / 0 / 0** |

---

## P0 — Verified defects

**All closed as of 2026-08-31**, across [phase 0](#phase-0--what-shipped) and
[phase 2](#phase-2--what-shipped). Kept in full because the reproductions are the record
of what was actually wrong, and because the last column is the only honest way to show
which fix was cheap and which was not.

| # | Defect | Where | Impact | Status |
|:--:|:---|:---|:---|:---|
| 1 | Gzip is computed but never sent | all 3 `hub.mjs` | 10.2 MB per load instead of 1.08 MB | ✅ fixed |
| 2 | Markdown sanitizer bypass → executing XSS | `Hub/hub.mjs` | Any `.md` under a scanned root can run script | ✅ fixed — CSP, then the filter rebuilt |
| 3 | `-Restart` kills whatever owns the port | all 3 `Start-Hub.ps1` | Can kill an unrelated dev server | ✅ fixed |
| 4 | Change-signature ignores content | `Hub/hub.mjs` | Editing a doc never refreshes the open view | ✅ fixed |
| 5 | `/api/file` ships the file twice | `Hub/hub.mjs` | ~44 % of every document response is unread | ✅ fixed |
| 6 | No `Host`/`Origin` check on side-effecting GETs | `Hub/hub.mjs` | Any web page can drive `/api/open` | ✅ fixed |
| 7b | Mangled CSS escape broke the stat-tile arrow | all 3 `index.html` | Hover showed `93` instead of `↓` | ✅ fixed |

### 1. Gzip is computed on every scan and then thrown away

`hub.mjs:807` reads:

```js
const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
```

Those are not word boundaries. The file contains two literal **`0x08` backspace bytes**
where `\b` was meant — the signature of a scripted edit that wrote `'\b'` in a language
where it is an escape (Python, a PowerShell here-string) rather than regex source. The
pattern is `/‹BS›gzip‹BS›/`, which matches nothing, so `wantsGzip` is always `false`.

Verified three ways: a raw `http.get` with an explicit `accept-encoding: gzip` header, a
browser `fetch` (`encodedBodySize === decodedBodySize === 10737482`, no `content-encoding`),
and `od -c` on the line itself. `hub.log` confirms the compression *is* being done —
`warm: 10.2MB → 1.08MB gzip` — the result is just never served.

All three hubs carry the same two bytes. The waste per hub, per page load and per
watcher-driven rescan:

| Hub | Served today | Should be |
|:---|---:|---:|
| AI Lab | 10.2 MB | 1.08 MB |
| IAM | 4.2 MB | 0.51 MB |
| Finance | 3.5 MB | 0.47 MB |

**Fixed 2026-08-31.** Retyped as `/gzip/` — word boundaries buy nothing here, no other
encoding token contains the substring. Measured after restart:

| Hub | Before | After | Saving |
|:---|---:|---:|---:|
| AI Lab | 10.24 MB | 1.08 MB | 89.5 % |
| IAM | 4.21 MB | 0.51 MB | 87.8 % |
| Finance | 3.49 MB | 0.47 MB | 86.4 % |

> Worth a guard rather than just a fix: add a control-byte check to whatever lints these
> files. This class of corruption is invisible in an editor, survived three copy-ports —
> and running that check during the fix immediately turned up **a second instance**
> (#7b below), so it is not a one-off.

### 2. The markdown sanitizer is bypassable, and the bypass executes

`md2html()` passes block-level HTML through so house-style READMEs keep their logo hero
and badge rows, running each line through a regex `sanitize()` first. Two defeats,
both reproduced:

**Whitespace-anchored handler stripping.** The strip pattern is
`/\son\w+\s*=\s*(...)/gi` — it requires whitespace before the handler. HTML also accepts
`/` as an attribute separator:

```html
<img/onerror="…"/src=notfound.png>
```

survives `sanitize()` untouched, and assigning it through `innerHTML` — exactly what
`loadDoc()` does — produces an `<img>` with a live `onerror` that **fires**. Confirmed in
the running hub: attributes came back as `["onerror=…", "src=notfound.png"]` and the
handler ran.

**Line-based scanning vs. multi-line tags.** `sanitize()` sees one line at a time, so a
tag split across lines has only its first line filtered; the rest is escaped into a
`<p>` and swallowed as attributes of the still-open tag. That one did not execute in
testing, but it corrupts the rendering of any legitimate multi-line HTML block.

This is not purely theoretical content. `Repos/Tools/` holds three third-party clones
(`odysseus`, `Deepseek-Harness`, `Gods-Eye-View`) whose READMEs come from GitHub and are
rendered by the hub, and the same origin serves `/api/file`, `/api/raw` and `/api/open`
over the whole vault — so an executing handler can read and exfiltrate anything under a
scanned root.

**Fix, in order of laziness:**
1. ✅ **Done 2026-08-31.** A CSP on every response, with a per-request nonce on the two inline scripts — `'unsafe-inline'` would have left inline handlers working, which is exactly the hole. This kills the whole class in one header, including bypasses nobody has found yet. The `<img/onerror>` payload that executed during the audit now does nothing; the app still boots, fonts load, and README badges render, with no CSP violations in the console.
2. ✅ **Done 2026-08-31.** `sanitizeHtml()` replaces the regex filter. There is no DOM in Node, so rather than parse into a detached element it tokenises each tag and **rebuilds it**: a tag has to be on the allowlist to survive, an attribute has to be on its tag's list to exist, `href`/`src`/`srcset` values are scheme-checked, and every value is re-quoted and re-escaped. Nothing of the original text is carried through for a trick to hide in. Raw HTML is also now buffered across lines, so a tag split over several lines is filtered as one tag — which fixes the rendering half of the bug too.
3. ✅ **Done 2026-08-31.** Eight tests in `Hub/hub.test.mjs` cover the filter, including both original bypasses.

**Checked against real content, not just fixtures.** Both renderers were run over all
**374** markdown files the hubs can reach: **358 byte-identical**, and all 16 differences
were the new filter being stricter in the right direction — 15 files where `&` in a badge
URL is now correctly written `&amp;`, and one where a literal `<` inside an attribute
value is now `&lt;`. Browsers decode both back to the original, and the house-style
headers render unchanged — confirmed in the browser, badges and all.

### 3. `Start-Hub.ps1 -Restart` kills by port, not by identity

```powershell
$owner = Get-PortOwner -Port $Port
… $owner | ForEach-Object { Stop-Process -Id $_ -Force }
```

Nothing checks that the PID is a `node` process running `hub.mjs`. The hubs already
lost a day to a Vite dev server squatting `4173` — under that exact scenario, `-Restart`
would have force-killed the Vite server instead of reporting the collision.

**Fixed 2026-08-31.** `Get-PortOwnerInfo` resolves each listener's command line and only
stops it when it matches this folder's `hub.mjs`; anything else — including a PID whose
command line cannot be read — counts as foreign and aborts with the owner named.
Rehearsed against a decoy process holding a spare port:

```text
Port 4276 is held by something that is not this hub:
  PID 45892: "C:\Program Files\nodejs\node.exe" squatter.mjs
Stop it yourself, or start on another port with -Port <n>.
```

The decoy was still listening afterwards. The old code would have killed it.

### 4. The change-signature ignores content, so doc edits never repaint

`sig` is built from every node `id` plus each repo's git state:

```js
for (const n of flat) mix(n.id);
for (const r of repos) mix(`${r.branch}${r.state}${r.commit}${r.ahead}${r.behind}`);
```

Editing a file's *contents* changes neither. The watcher fires, `load()` runs, `sig`
compares equal, and `doLoad()` returns at `if (same && !force) return;` without
re-rendering — so the document you are reading, and the card blurb derived from its
first sentence, both stay stale until you navigate away and back. The live-reload
promise in the README ("re-renders on its own when you add a skill, a routine, or a
repo") holds for *adding* things and not for *editing* them.

**Fixed 2026-08-31.** The signature now mixes `desc` and `size` alongside `id`:

```js
for (const n of flat) mix(`${n.id}|${n.desc || ''}|${n.size || 0}`);
```

Size moves on essentially any real edit and costs nothing extra — the scan already stats
every file. Verified end to end: editing this very document changed the signature from
`1871111510` to a different value on the next scan, where before it would not have moved
at all. An edit that preserves the byte count exactly *and* leaves the first sentence
alone still slips through; the code says where to add an `mtime` if that ever matters.

### 5. `/api/file` returns every document twice

The endpoint answers `{ html, raw }`. Nothing in `index.html` ever reads `.raw` —
grepped, zero hits. On the AI Lab root README that is 27,475 unread bytes in a 63,001-byte
response: **44 % waste on every document view**, on top of finding #1.

**Fixed 2026-08-31.** `raw` is gone from the payload. The same request measured after:
**63,001 → 35,722 bytes, a 43 % cut**, and the response now has one key. A view-source
toggle, if it is ever wanted, belongs behind `?raw=1` rather than in every reply.

### 6. Any web page can drive the hub

The server binds `127.0.0.1` only and `resolveId()` has a sound allow-list plus a
credential deny-list — that part is well done. What is missing is any check on *who is
asking*: no `Host` validation, no `Origin`/`Sec-Fetch-Site` check, no CSRF token.

Two consequences. First, `/api/open` is a **state-changing GET** that shells out to
`cmd /c start` — a simple cross-origin `<img src="http://127.0.0.1:4273/api/open?path=…">`
from any page you have open fires it, no preflight, no CORS needed, because the attacker
never has to read the response. Second, without a `Host` check the hub is exposed to
DNS rebinding: an attacker's domain re-resolved to `127.0.0.1` becomes same-origin, and
`/api/file` will then hand over any file under `Documents` or the project roots.

**Fixed 2026-08-31.** Two checks, both measured against the running server:

| Request | Before | After |
|:---|:---|:---|
| `Host: 127.0.0.1:4273` / `localhost:4273` | 200 | 200 |
| `Host: evil.example.com` (the rebinding shape) | 200, full payload | **403** |
| `/api/open` with `Sec-Fetch-Site: same-origin` / `none` / absent | 204 | 204 |
| `/api/open` with `Sec-Fetch-Site: cross-site` / `same-site` | 204, **command ran** | **403** |

The `Host` check closes DNS rebinding: a rebound request still carries the attacker's
hostname. The `Sec-Fetch-Site` gate closes the CSRF path on the one endpoint with a side
effect outside the browser — a foreign page's `<img src=".../api/open?path=...">` now
gets a 403 instead of launching a program. Non-browser clients send no such header and
are unaffected.

### 7b. A second mangled escape, found by the check this audit recommended

Scanning for the control bytes behind #1 turned up one more, in all three `index.html`:

```css
.stat.jump .cap::after{content:' ␑93';…}   /* 0x11, then the characters 9 and 3 */
```

The source was meant to be `content:' \2193'` — the CSS escape for **↓**. A Python
patch script read `\219` as an octal escape (`\21` = `0x11`) and left `3` behind, so the
hover affordance on every stat tile rendered as an invisible control character followed
by a literal `93`.

Same root cause as #1, same three files, and it had been shipping unnoticed. **Fixed
2026-08-31** — the arrow now computes as `" ↓"` in all three hubs, and all six files are
control-byte clean.

This is the second defect this audit found from one class of bad edit, which is the
argument for #8's control-byte lint being worth the ten lines it costs.

---

## P1 — Structural

### 7. Three copies of one program

~6,500 lines across three folders, differing in **four values**: `ROOTS`, the port, the
repo-table scope, and the page title. The root README already calls this out and says to
fix it before a fourth hub. Two events since have priced it:

- The favicon + collapsible-sections work (2026-08-31) had to be written once and ported twice.
- **The gzip bug in #1 exists in triplicate.** One bad edit, three broken servers, and the fix has to land three times.

**Fixed 2026-08-31.** The program moved to [`../Hub`](../Hub/README.md); each hub folder
keeps a `hub.config.json` and a three-line `Start-Hub.ps1` shim, so the VS Code
`folderOpen` tasks did not have to change. Config carries `name`, `dir`, `port`, `title`,
`favicon` and `repoScope`, validated at startup rather than failing halfway through a
scan. **~6,500 lines of near-duplicate source down to ~2,500.**

Proved behaviour-preserving rather than assumed: each hub's payload was fingerprinted
before and after — `stats`, `repos`, `runtimes`, `rootDocs`, `roots`, `topLevel`, `title`
and `faviconHref` came back identical on all three, and comparing the node-id sets of the
old and new servers showed **0 added, 0 removed**.

Adding a fourth hub is now a folder, a config file, and a copy of the shim.

### 8. No tests, no lint, no `package.json`

Zero test files, zero lint configs, no manifest — so no `engines` field recording the
Node floor the README claims, and nothing that would have caught #1 or #2.

**Fixed 2026-08-31.** `Hub/hub.test.mjs` — 16 tests, `node --test`, no framework, no
fixtures, no dependencies. `Hub/package.json` records `engines.node: >=18.17` and an
`npm test` script. To make the module importable, the server, watcher and `--scan` are
now guarded behind an `IS_MAIN` check, and `md2html`, `frontmatter`, `blurb` and
`loadConfig` are exported.

| Test | Catches |
|:---|:---|
| Control-byte scan across every `.mjs` / `.html` / `.json` / `.ps1` | The class of corruption behind #1 and #7b |
| The `wantsGzip` literal is `/gzip/`, and matches a real header | #1 regressing |
| 8 markdown tests — escaping, fences, tables, frontmatter, handler stripping | Renderer regressions |
| Config validation: missing keys, bad ports, conflicting scope, bad JSON | Misconfiguration reaching a scan |
| Every hub config parses, its `dir` exists, its port is unique | A fourth hub added wrong |
| `index.html` has every placeholder, and no placeholder the server cannot fill | A templating slip shipping `%TITLE%` to the page |

Two tests are marked `todo` on purpose: they describe the sanitizer bypass in #2 that the
CSP already makes inert, and they turn green when the filter is replaced. The suite exits
0 today, and finishing #2 step 2 is the only thing that clears them.

### 9. Dead code and stale artifacts

**Fixed 2026-08-31**, all three removed.

| Item | Status |
|:---|:---|
| `Project-Hub/hub.mjs.bak` | ✅ deleted — was 13 lines adrift from the live file |
| `function section(title)` (`index.html`) | ✅ deleted — never called |
| `window.go = go` | ✅ deleted — leftover debug hook |

---

## P2 — Usability

### 10. The UI is unusable without a mouse

21 click handlers sit on `div`s. There are **zero** `role`, `aria-*` or `tabindex`
attributes in the entire client, and no `:focus-visible` styling anywhere. The sidebar
tree cannot be walked with arrow keys, cards and table rows cannot be reached by Tab or
activated by Enter, and there is no visible focus ring to say where you are. The one
keyboard-reachable control set is the collapsible sections added on 2026-08-31, and only
because `<details>` gives that away for free.

For a tool whose whole job is fast navigation, this is the largest UX gap in the audit —
and it is not primarily an accessibility-checkbox argument: an explorer you can drive
from the keyboard is simply faster than one you cannot.

**Fixed 2026-08-31**, all four.

1. An `activate(node, handler)` helper sets the click, `tabindex="0"` and a role; one delegated `keydown` turns Enter and Space into a click for anything it marked. Sixteen call sites converted, one behaviour.
2. A `:focus-visible` ring in the accent green, so a keyboard user can see where they are.
3. The tree is a real tree widget: `role="tree"`/`treeitem`, `aria-level`, `aria-expanded`, `aria-selected`, and a **roving tabindex** so it is one tab stop rather than 60. `↑↓` move, `→` expands then steps in, `←` collapses then steps out to the parent, `Home`/`End` jump, `Enter` opens.
4. `aria-label` on the search box, naming the kind-prefix syntax.

Measured on the live page: **0 → 66** `role` / `aria-*` / `tabindex` attributes, 39
focusable controls in the main pane, and exactly one tab stop in a 22-row tree. The
arrow-key walk was driven end to end — expand, step in, step out, collapse, `Home`,
`End`, `Enter` — and the tab stop stayed at one throughout.

### 11. No deep links, no back button

Selection lives in memory. There is no URL hash, no `pushState`, so a node cannot be
bookmarked, shared, or returned to with Back — and a reload always lands on the overview.

**Fixed 2026-08-31.** `go()` writes `#<id>`; a `hashchange` listener routes back through
`go()`, guarded by comparing against the current selection rather than a flag. On load, a
hash naming a known node opens it.

Verified in the browser: `history.back()` moved from Edge-Radar to the workspace root and
re-rendered, `history.forward()` returned, and a reload on a deep link restored both the
selection and the page.

### 12. Sidebar expansion state is not persisted

**Fixed 2026-08-31.** `hub.open` in `localStorage`, written from `renderTree()` so every
path that changes the tree saves through one place. Verified: 63 visible rows and 7 open
branches before a reload, the same after.

### 13. Search is thinner than the index behind it

**Mostly fixed 2026-08-31.** Kind scoping (`skill:kalshi`, `repo:edge`, `cmd:deploy` —
plurals and short forms map too), the matched run wrapped in `<mark>`, and `↑↓` + `Enter`
over the results without leaving the search box. A bare `skill:` lists everything of that
kind. Verified live: `skill:kalshi` returned 4 hits, all of kind SKILL; `edge` highlighted
83 matches; arrow keys moved the cursor and Enter opened the one under it.

**Still open:** fuzzy matching. `score()` is substring-only, so a typo finds nothing. That
is a real gap but a different piece of work, and the index is small enough that scoping
plus prefix matching covers most of it.

### 14. The repo table does not sort or filter

**Fixed 2026-08-31.** Click any of the first four column headers to sort, click again to
reverse; a chip row filters by group or to **needs attention** (anything not clean). The
`uncommitted` stat tile now applies that filter on its way to the table rather than just
scrolling to it.

Verified live: chips read `all / needs attention (9) / Live_Apps / Other_Apps / Tools`,
the filter cut 20 rows to 9 (all `dirty` or `ahead`), the heading changed to `9 of 20`,
and header clicks reordered and reversed the table.

### 15. "Open" only means Explorer

**Fixed 2026-08-31.** `/api/open?...&in=code` runs `code -g <path>`, and an **open in VS
Code** button sits next to *open folder* on every page that has one. `start` stays the
default for folders.

"Open a terminal here" is still unbuilt — it is a third shell-out for a case that has not
actually come up yet.

---

## P3 — Performance and operations

### 16. The whole tree is re-sent and re-indexed on every scan

30,042 nodes, 10.7 MB, rebuilt into a 30k-entry `Map` client-side each time the watcher
fires. Fixing #1 addresses the wire cost; the parse and re-index cost stays.

**Fixed 2026-08-31, and none of those was the answer.** Profiling the payload first
showed where the weight actually was:

| Part | Size | Share |
|:---|---:|---:|
| `tree` | 5.80 MB | 56.7 % |
| **`index`** | **4.42 MB** | **43.2 %** |
| everything else | ~4 KB | 0 % |

The search index was a second copy of the tree — 25,731 entries whose every field
(`id`, `name`, `kind`, `desc`) already existed on the node it was copied from, 2.47 MB of
duplicated id strings alone. And `tint` was on every entry despite never being set.

The client already walks the whole tree into a `Map` on arrival, so it now builds the
index in that same pass, pushing node references rather than copies. Six lines deleted
from the server, four added to the client:

| | Before | After |
|:---|---:|---:|
| Payload | 10.23 MB | **5.81 MB** (−43 %) |
| On the wire (gzip) | 1.08 MB | **0.68 MB** (−37 %) |

A test asserts the payload literal has no `index` again, because this is the kind of win
that gets quietly undone.

### 17. The scan blocks the event loop

**Not done, and now better understood.** Measured scan times from `/api/health`:

| Scan kind | Time |
|:---|:---|
| Watcher-driven (git cache warm) — the common case | **1.8–3.0 s** |
| `?fresh=1` from the rescan button (git cache bypassed) | **7.4–10.2 s** |

The split is git, exactly as the original code comment claimed: two `git` spawns per repo
across 32 repos dominate everything else. The directory walk is **471 ms**, and reading
the heads of the 2,270 doc-named files is **466 ms** cold, 25 ms with the cache added in
#18.

So a worker thread would move a 2-second stall off the event loop but not shorten it, and
the real lever — if this ever becomes annoying — is git: a longer TTL, or invalidating on
`.git` mtime rather than on a timer. Left alone deliberately.

> A correction worth recording: an earlier pass measured "~10 s of file reads across 12k
> files" and concluded reads were the scan. That measured *every* `.md` file, cold.
> `describe()` only reads the ~2,270 doc-named ones, and warm that costs 466 ms. The fix
> in #18 is still worth having, but it is not what the first number implied.

### 18. Any change triggers a full re-walk

**Partly fixed 2026-08-31.** `describe()` is memoised on `path|mtime|size`, so a rescan
re-reads only files that actually changed: **466 ms → 25 ms**, a 95 % cut on that
component, and 2,270 fewer file opens per scan — which also shrinks the exposure that
caused the descriptor leak in the first place.

The tree is still re-walked in full. That walk is 471 ms, so subtree invalidation would
buy less than the complexity costs; see #17 for where the time actually goes.

### 19. Nothing notices when a hub dies

The 2026-08-31 `EMFILE` death was found by a human hitting a dead tab, hours later. There
is no `/api/health`, no version endpoint, no restart-on-exit.

**Fixed 2026-08-31.** `/api/health` reports uptime, scan count and history, last scan
duration and payload size, SSE clients, memory, cache size, and a `state` of `warming`,
`ready` or `stalled`. It answers **503** when unwell so a check needs no parsing.

Open-fd count is not readable portably on Windows, so the endpoint reports **`readErrors`**
instead — head reads that failed. That is a better signal anyway: it is the *cause* of the
August death rather than a symptom, and it was previously swallowed silently by a `catch`.

[`Hub/Watch-Hubs.ps1`](../Hub/Watch-Hubs.ps1) pings every hub and restarts the unwell ones
through `Start-Hub.ps1`, so the port-identity rules from #3 still apply and it can never
kill a bystander. Report-only by default, `-Restart` to act, non-zero exit when something
needed attention.

Three bugs of my own surfaced while running it, which is rather the point of running it:

- A hub still finishing its first scan reported 503. A warming hub is not a sick one, so there is now a `state` of `warming` and `ok` tolerates it.
- `readHead` returned `''` for both an empty file and a failed read, so every empty markdown file counted as an error. It returns `null` only on a real failure now.
- `readErrors` was a lifetime counter against a fixed threshold — which means *any* long-running hub eventually crosses it and reports sick forever, and a watchdog that cries wolf is a watchdog you stop reading. `ok` now judges `readErrorsRecent`, the failures across the last three scans. A handful per scan is ordinary churn (files written as the walk passes); a leak shows up as a climbing rate.

**Registered 2026-08-31** as `\AI-Maintenance\Project Hub Watchdog (15 min)`, on the
user's say-so, matching the conventions of the nine jobs already in that folder: PowerShell 7,
`-NoProfile -ExecutionPolicy Bypass -File`, interactive token as the configured local user, start-when-available,
`IgnoreNew` for overlapping runs, ten-minute execution limit. It runs `-Restart -Quiet`
every 15 minutes and appends to `Hub/watchdog.log`.

Proved on the failure path rather than the happy one — the Finance hub was killed outright
to reproduce the August shape:

```text
13:57:59  DOWN Finance_Workspace (port 4275): no answer on 4275 - target machine actively refused it
13:58:04       restarted OK (pid 17344)
```

Seven seconds from dead to serving, task exit code 1 so a monitor can alert on it. The
same event in August took hours to notice.

One consequence worth stating: a hub stopped on purpose now comes back within 15 minutes.
Disable the task first if that is not wanted.

### 20. Logs are never rotated

**Fixed 2026-08-31.** `Start-Hub.ps1` moves either log to `.1` when it passes 1 MB before
starting, so one previous copy is kept and each run begins clean.

---

## P4 — Ideas worth considering

| # | Idea | Why |
|:--:|:---|:---|
| 21 | A `new-hub` generator once #7 lands | Adding a fourth workspace becomes a config file, not a copy-port |
| 22 | One page, three workspaces | The user-scope half is byte-identical in all three; only the project root differs |
| 23 | Dirty-file detail in the repo view | `dirtyCount` is already computed and thrown away — the file list is one `git status` away |
| 24 | Routine pass/fail, not just run count | `runs` and `lastRun` come from log filenames; reading the last line would show whether it *worked* |
| 25 | A layout that survives a phone | The stated goal elsewhere in the portfolio is phone-drivable ops; the hub is fixed at 1200px with a 200px rail |

---

## Suggested sequence

| Phase | Contents | Rough size |
|:---|:---|:---|
| ~~**0 — Stop the bleeding**~~ | ~~#1 gzip regex, #2 step 1 (CSP header), #3 identity check before kill~~ — plus #7b | ✅ **shipped 2026-08-31** |
| ~~**1 — One codebase**~~ | ~~#7 `hub.config.json`, #9 delete dead code, #8 `package.json` + `node --test`~~ | ✅ **shipped 2026-08-31** |
| ~~**2 — Correctness**~~ | ~~#2 step 2 (parse-then-allowlist), #4 signature, #5 drop `raw`, #6 Host/Origin checks~~ | ✅ **shipped 2026-08-31** |
| ~~**3 — Navigation**~~ | ~~#10 keyboard + focus, #11 deep links, #12 tree state, #13 search interaction~~ | ✅ **shipped 2026-08-31** (fuzzy search still open) |
| ~~**4 — Scale and ops**~~ | ~~#16 payload, #18 rescan cost, #19 health + watchdog, #14/#15 table and actions~~, plus #20 log rotation | ✅ **shipped 2026-08-31** (#17 measured and declined) |

Everything sequenced above is done.

## Still open

The current implementation priorities are in [P7 — September 8 review](#p7-review). Its overlap table carries earlier search, performance, navigation, and responsive-layout work forward without duplicating the backlog. The table below records earlier decisions; the new performance measurements warrant revisiting the prior deferrals.

Deliberate rather than forgotten:

| # | What | Why it was left |
|:--:|:---|:---|
| 13 | Fuzzy search — `score()` needs a substring hit, so a typo finds nothing | Kind scoping plus prefix matching covers most of it on an index this size |
| 17 | Moving the scan off the event loop | Measured: the stall is ~2 s and it is git, not the walk. A worker moves it without shortening it |
| 21–25 | The P4 ideas | Speculative until one of them is actually wanted |
| ~~26~~ | ~~Directory-level watcher events cause near-continuous rescans~~ | ✅ **fixed 2026-08-31** — see below |
| ~~31~~ | ~~HTML artifact preview — sandboxed iframe viewer + an Artifacts shelf~~ | ✅ **fixed 2026-09-03** — see [P5](#31-dual-mode-html-viewer--artifacts-shelf) |
| ~~34~~ | ~~Surface `Repos/Draft/` initiatives as a `kind: 'draft'` card cluster~~ | ✅ **fixed 2026-09-03** — see [P5](#34-draft-initiatives-card-cluster) |
| ~~35~~ | ~~GitHub-style alert callouts + light code syntax highlighting~~ | ✅ **fixed 2026-09-03** — see below |
| 36 | Git-mtime cache invalidation to skip unneeded `git status`/`git log` spawns | Extends #17/#18, which were already measured and left alone for the same reason |

### 26. The watcher is woken by directory events it cannot interpret

Found while checking that the new `watchdog.log` was not creating a feedback loop. It was
not — but something else is. Twenty seconds of a completely idle machine, watching the
same roots the hub watches:

```text
12x  Example_Workspace :: Repos/Live_Apps/Agent-Chat/db/.sync-state.json.tmp
 8x  Example_Workspace :: Repos/Live_Apps/Agent-Chat/db/.sync-state.json
 8x  Example_Workspace :: Repos/Live_Apps/Agent-Chat/db          <-- this one gets through
 3x  Example_Workspace :: Repos/Live_Apps/example.github.io/.git
 2x  ... .git/index.lock  (x6 repos)
```

Agent-Chat's database sync rewrites `.sync-state.json` constantly. The dot-prefix rule
already drops the two file-named events — but Windows also reports the *parent directory*
as changed, and `db` has no dot, no skip-list entry, and nothing else to mark it as noise.
So the hub sees a change every couple of seconds and rescans on the 2.5s debounce,
essentially forever. Measured: **one full rescan roughly every 8 seconds while idle**,
each costing 2–3 seconds of blocked event loop.

The 2026-08-31 fix for this file's own logs (`NOISE_FILE`) does not help, because the
event names a directory, not a file.

**Fixed 2026-08-31.** Watcher events whose named path is an existing directory are
dropped, because on Windows a real file change always fires a file-named event as well.
One `statSync` per raw event, and the whole filter moved out of the callback into an
exported `ignoreWatchEvent()` so it could be tested rather than reasoned about.

| Idle machine, 90s | Rescans |
|:---|---:|
| Before | ~11 (one every ~8s) |
| After | **0** |

Real changes still get through, checked in all four shapes plus the browser:

| Action | Result |
|:---|:---|
| Edit a `.md` | rescan fired |
| Revert that edit | rescan fired |
| Create a file | rescan fired |
| Delete a file | rescan fired |
| End to end in the page | `● changed — rescanning` → `● scanned 14:17`, new file present in the search index |

The trade-off stands and is deliberate: **creating a completely empty directory no longer
shows up until something else triggers a scan.** A directory with anything in it fires
events for its contents and appears normally, and a *deleted* directory still reports,
because the stat fails rather than answering "directory".

The watchdog is now registered and running — see [#19](#19-nothing-notices-when-a-hub-dies).

---

## P5 — 2026-09-03 Antigravity audit

A second pass over the shared `Hub/` engine, run by Antigravity rather than Claude, against
the AI Lab hub at `127.0.0.1:4273`. Full writeup:
`Example_Workspace/Agents/Antigravity/.agents/temp/project-hub-enhancements-and-recommendations.md`.

**All four defects fixed and verified 2026-09-03** (by Claude, against the reported
locations — not independently re-derived by a third audit). Of the six ideas, five are
also fixed (#31, #32, #33, #34, #35); #36 is still open — see [Still open](#still-open).

### New defects — fixed

| # | Defect | Where | Impact | Status |
|:--:|:---|:---|:---|:---|
| 27 | `blurb()` skipped every line starting with `<`, so house-style READMEs (`<h1>` + badge row, real summary inside a plain `<p><em>…</em></p>`) fell through to the first *unwrapped* prose line further down | `Hub/hub.mjs` `blurb()` | Root card and search showed `example.github.io`'s sub-repo blurb as the description for all of `Example_Workspace` | ✅ fixed |
| 28 | `rootDocs` hardcoded `Agents/Claude/CLAUDE.md` as the 4th featured doc | `Hub/hub.mjs` (`rootDocs` construction) | Ignored `Agents/README.md`, the file the repo itself names as the vendor-neutral source of truth | ✅ fixed |
| 29 | `href="#anchor"` links inside rendered markdown called `preventDefault()` and stopped, with no scroll-to-target handler — and headings had no `id` to scroll to even if it had | `Hub/hub.mjs` `md2html()`, `Hub/index.html` `loadDoc()` | Every in-page table of contents (this file's included) was dead | ✅ fixed |
| 30 | Antigravity had no entry in `USER_RUNTIMES`, unlike Claude/Codex/Gemini/OpenCode | `Hub/hub.mjs` `USER_RUNTIMES` | User-scope Antigravity config (`~/.gemini/antigravity-cli`) never appeared in the hub | ✅ fixed |

### 27. `blurb()` returned the wrong app's description for the workspace root

Fixed by making the `<`-prefixed branch strip tags and use what's left, instead of
unconditionally skipping the line — an `<h1>`/`<h2>`…`<h6>` tag is still skipped (that
text belongs to the title, not the blurb) and a pure-markup line (a lone `<p align="center">`,
a badge row) still falls through to the next line, exactly as before. Verified against the
running hub: `rootDocs[0].desc` for `Example_Workspace/README.md` now reads *"Workspace for the
apps that ship under example.com — plus a couple of internal tools."* — the file's own
summary — where it previously read a description belonging to
`example.github.io/`. A regression test (`blurb reads text out of house-style HTML
wrapper tags`) pins the exact shape that broke it.

> Not part of this fix, but noticed while verifying it: `Documents/README.md` carries the
> *identical* `<em>` summary line, word for word — reads as a stale copy-paste (the page's
> own `<h1>` says "AI Document Library"), not a hub bug. Left alone; worth a one-line edit
> to that file separately.

### 28. `rootDocs` featured Claude's instruction file on every hub, not the shared contract

Fixed by locating `Agents/README.md` under the hub's own project root (`ROOTS[0].dir`)
instead of regex-matching `/Agents/Claude/CLAUDE\.md$/` across every node. Degrades to "no
4th doc" on a hub with no `Agents/README.md`, rather than the old regex's behaviour of
either wrongly matching something on that hub or silently finding nothing. Verified: the
overview's 4th featured doc is now `Projects/Example_Workspace/Agents/README.md`.

### 29. In-document anchor links were dead — and had nowhere to land anyway

Two bugs stacked: the click handler suppressed the `#` navigation with no scroll logic,
*and* `md2html()` never gave headings an `id` in the first place, so a fix to the handler
alone would still have found nothing to scroll to.

Fixed both. `slugifyHeading()` reproduces GitHub's algorithm closely enough to match every
anchor already written in this repo's docs assuming GitHub rendering: lowercase, strip
markdown/HTML markup down to plain text, drop anything that isn't a letter/digit/space/
hyphen/underscore, then turn *each* space into its own hyphen (not a collapsed run — that
distinction is what makes `"Phase 0 — what shipped"` slug to `phase-0--what-shipped` with
the double hyphen this file's own TOC already uses, since the em dash is removed but both
flanking spaces survive). Repeated heading text gets GitHub's `-1`, `-2`, … suffix. The
click handler now resolves `#id` against the rendered document and calls
`scrollIntoView({ behavior: 'smooth', block: 'start' })`, or toasts `anchor not found`
rather than failing silently.

Verified against the running hub: fetching this very file through `/api/file` and rendering
it produced 38 heading ids, including `phase-0--what-shipped` and the new
`p5--2026-09-03-antigravity-audit-new-unverified` section below — both used by real links
in this document.

### 30. Antigravity was invisible at user scope

`~/.gemini/antigravity-cli` is mostly session state — `brain/`, `conversations/`,
`presence/`, `cache/`, `log/` — the same shape `~/.claude.json` was already excluded for.
Only `builtin/skills` (the shipped skill set) and `mcp_config.json` are worth walking;
`plugins/` holds whole vendor repos (`google-workspace-cli`) and is left as a browsable
folder rather than counted, the same call already made for Gemini's `extensions/`.

Because the real skill folder is nested at `builtin/skills` rather than a top-level
`skills/`, the `USER_RUNTIMES` dir-walking loop's bucket classification and display name
were generalised to key off `path.basename(sub)` instead of `sub` — every existing
single-segment entry (`'skills'`, `'agents'`, …) is unaffected since its basename is
itself.

Verified against the running hub: `~/.gemini/antigravity-cli` now appears as a `scope:
'user'` runtime alongside the existing project-scope `Agents/Antigravity` entry, with 5
skills and 4 MCP servers (`playwright`, `github`, `serper`, plus one more) counted from
`mcp_config.json`.

Test suite: **27 tests, 27 passing** (2 new: the blurb wrapper-tag fix, the heading-slug /
duplicate-id behaviour).

### New ideas

| # | Idea | Why | Status |
|:--:|:---|:---|:---|
| 31 | Dual-mode `.html` viewer — sandboxed iframe preview alongside the existing source view, plus an "Artifacts" shelf for `artifacts/`/`dashboards/`/`prototypes/` folders | Right now every `.html` file, including interactive dashboards, is dumped as escaped text in a `<pre>` — the exact thing `ChatGPT-HTML-Design.md` says artifacts are for goes unrendered | ✅ fixed |
| 32 | Multi-hub workspace switcher in the header, polling each hub's `/api/health` for a status dot | AI Lab (4273), IAM (4274) and Finance (4275) run side by side with no link between them — switching means retyping the port | ✅ fixed |
| 33 | "Live Sites & Deployments" block on the overview | The hub's whole subject is the portfolio that ships to `example.com`, but it has zero awareness of the 10 live subdomains or their hosts | ✅ fixed |
| 34 | Surface `Repos/Draft/` initiatives (AI Whisper Clone, AI Voice Cloning, Hotel Loyalty Club, etc.) as a `kind: 'draft'` card cluster | `isRepo` requires `.git`, so pre-repo R&D with real content just disappears from the tree | ✅ fixed |
| 35 | GitHub-style alert callouts (`[!NOTE]`/`[!TIP]`/`[!WARNING]`/etc.) rendered as styled boxes, plus light keyword/string/comment highlighting on code blocks | `md2html()` currently renders callout blockquotes as plain quotes and code as unstyled `<pre>` | ✅ fixed |
| 36 | Skip the `git status`/`git log` spawns entirely when a repo's `.git/index` and `.git/refs/heads` mtimes haven't moved since the last scan | Extends [#17](#17-the-scan-blocks-the-event-loop) / [#18](#18-any-change-triggers-a-full-re-walk) rather than replacing them — the reported 8.5–23.7s scans line up with the same git-spawn cost already identified there | open |
| 37 | In-page `‹`/`›` Back/Forward buttons in the header, next to the sidebar toggle | #11 already wired `history.back()`/`forward()` up to real work via the hash trail, but nothing on the page exposed it — a user hopping README → linked README had only the browser's own chrome to fall back on, invisible in embeds like VS Code's Simple Browser tab | ✅ fixed |

### 31. Dual-mode `.html` viewer + Artifacts shelf

Two changes, one in the scanner and one in the UI, because the scanner was hiding the
files before the UI ever got a chance to render them.

**The scanner.** `DOC_FILE` has no `.html`/`.htm` in it by design (§2 comment: "repos are
walked for their docs, not their source"), so any `.html` file inside a `.git` repo was
dropped by the doc-only filter before it ever reached the tree — not rendered badly,
*absent*. A new `ARTIFACT_DIRS` set (`artifacts`, `dashboards`, `prototypes`) carves out
an exception: a `.html` file whose immediate parent folder has one of those three names
now survives the filter regardless of `ctx.repo`, and is also collected into a new
`artifacts` array on the scan payload (`id`, `name`, `folder`, `size`, `repoName`).
Everywhere else in a repo, `.html` is still source and still hidden — this is narrowly an
artifact-folder exception, not a blanket policy change.

**The viewer.** `viewFile()` now renders two tabs — `preview` and `source` — for any
`.html`/`.htm` node, defaulting to `preview`. Source is unchanged (still the escaped
`<pre>` from `/api/file`). Preview is a real `<iframe sandbox="allow-scripts allow-forms
allow-modals allow-popups">` pointed at `/api/raw?path=…`, so the file actually renders
and its scripts actually run. Deliberately **no** `allow-same-origin` on the sandbox: the
framed document gets an opaque, unique origin with no access to this page's DOM, cookies,
or storage, whatever the artifact's own script tries — the strong boundary is the
browser-enforced sandbox attribute, not a CSP trick. `/api/raw` overrides the response's
CSP for `.html`/`.htm` specifically (`writeHead()`'s headers win over the per-request
`res.setHeader()` call, verified with a standalone Node check before relying on it) —
without the override, the page's own `script-src 'nonce-…'` would block the artifact's
inline scripts and `frame-ancestors 'none'` would refuse to let the hub frame it at all.
The override is narrow: `frame-ancestors 'self'` only, so a foreign site still can't iframe
a local file through this endpoint for its own purposes.

**The shelf.** The overview grows an "Artifacts" card section (same pattern as Live
Sites — a `<div class="cards">` grid, hidden entirely when the list is empty) between
Live Sites and the repo table. Each card names the file, its size, and its repo/folder;
clicking one calls `go(id)` with the preview tab pre-selected, so there's no detour
through the repo folder first.

Verified against a throwaway fixture repo (a `.git` folder plus an `artifacts/*.html`
with an inline `<script>`) confirming the doc-filter bypass, the `/api/raw` header
override (`curl -D-` showing `content-security-policy: frame-ancestors 'self'` and
`content-type: text/html`), and the rendered preview actually executing its script — then
again against the **real** hub: `Agents/Specialized/Codex-HTML/artifacts/` turned out to
already hold five real `.html` exports (an artifact catalog page, several converted
reports) that were already in the tree — that folder sits outside any `.git` repo, so the
doc-only filter never touched them — but had only ever rendered as escaped source text,
exactly the "goes unrendered" this item names. All five appeared on the restarted AI Lab
hub's new Artifacts shelf and the catalog page rendered live with working internal links.
`npm test`: 28/28 both before and after.

### 34. Draft Initiatives card cluster

`Repos/Draft/` is pre-repo R&D by the workspace's own convention (its `CLAUDE.md`: "most
are not git repos... an initiative graduates by getting its own remote and moving into
`Live_Apps/` or `Other_Apps/`"), so `isRepo`'s `.git` check never fires for any of them.
Before this fix that meant two separate problems, not one: the folder was invisible to
the Repos table and the "repos" stat (only the `isRepo` branch pushes to `repos[]`), *and*
its subtree was walked with no doc-only filtering at all — that filter is gated on
`ctx.repo`, which only a real repo sets — so every source file underneath was included,
unlike a real repo's docs-only view.

Fixed with one new branch in `scanTree()`'s `walk()`, keyed on `ctx.group === 'Draft' &&
depth === 2` (true only for entries directly inside `Repos/Draft/`): give the entry its
own `kind: 'draft'`, grab its README the same way a repo card does, and recurse with
`ctx.repo` set so it gets the exact same doc-only filtering real repos get, reusing that
logic rather than duplicating it. Collected into a new `drafts` array on the scan
payload, kept separate from `repos[]` since a draft has no git state to show. `index.html`
gets a new "Draft Initiatives" card cluster on the overview (same pattern as Live Sites
and Artifacts — a `<div class="cards">` grid, absent entirely when the list is empty)
between the Repos table and the Readmes section, plus `draft` entries in `TINT` (amber,
matching the "not shipped yet" read), `ROUND`, `DIRISH`, and `KIND_LABEL`. A draft card's
click-through needs no dedicated view function — `kind: 'draft'` isn't `repo`, isn't in
`ENTITY`, isn't `md`/`config`/`file`, so `renderView()`'s existing fallback to
`viewFolder()` already does the right thing.

Verified against the running AI Lab hub, which has genuinely un-committed real content —
no synthetic fixture needed: `/api/scan` returned all four current `Repos/Draft/` folders
(`AI-Artifact-Playground`, `AI-Voice-Cloning`, `Enterprise-Network`, `Hotel-Loyalty-Club`)
as `drafts`, with `AI-Voice-Cloning` and `Hotel-Loyalty-Club` carrying their README blurb
and the other two correctly blank (no top-level README); `repos.filter(r => r.group ===
'Draft')` stayed at `0`, confirming they still don't leak into the Repos table. Clicking
through to `AI-Voice-Cloning` showed only its `README.md` plus folder-level children
(`incoming-samples/`, `podcast-voices/`, `repo-deliverable-voice-poc/`, `tts-engine/`) —
not the raw sample-audio tree underneath — confirming the doc-only filter is actually
active on a draft's subtree, not just inherited in name. `npm test`: 28/28 before and
after; IAM and Finance (neither has a `Repos/Draft/`, so the new branch's condition never
matches there) restarted clean with `drafts: []`.

### 32. Multi-hub workspace switcher

A browser fetch to another hub's port would be blocked outright by this page's CSP
(`connect-src 'self'`), so the check happens server-side instead: `discoverHubs()` walks
`HUB_DIR`'s parent for sibling folders carrying a `hub.config.json` (the same "a new hub
is just a folder" property #7 already bought), and the new `/api/hubs` route pings each
one's `/api/health` in parallel and hands back a same-origin JSON list. The header's
`<select id="hubswitch">` stays hidden with one hub and only appears once a sibling is
found — populated with a 🟢/🔴 status dot per hub, `location.href` on change.

Verified live across all three: `/api/hubs` hit on each of 4273/4274/4275 correctly
reports itself as `self: true` and the other two as `ok: true`, discovered without any
hub knowing the others' names in advance.

### 33. Live Sites & Deployments dashboard

Rather than a second, hand-maintained list (which is exactly how `docs/LINKS.md` and the
root README's own table were found to disagree with each other during this pass —
different entry counts, different app names — while checking what to source from),
`parseLiveSites()` reads the root README's *own* "Live sites" table fresh on every scan:
find the heading matching `/live sites/i`, take the first markdown table under it, map
columns by header name (`app`, `subdomain`/`url`, `status`, `stack`). It can never drift
from the doc a human actually edits when a subdomain changes, and it disappears entirely
on a hub whose workspace has no such table — confirmed empty on Identity_Workspace, 10 rows on
Example_Workspace. Rendered as a card grid under the stats strip; a card opens its live URL in
a new tab.

Test suite: **28 tests, 28 passing** (2 more: `parseLiveSites`'s column-mapping and
missing-section cases).

### 37. In-page Back/Forward buttons

`history.back()`/`forward()` already worked with no button at all once #11 put a hash on
the address bar — but a `Codex` → linked `Claude` doc hop had nothing on the page that
said so, only the browser's own back arrow, which some embeds hide entirely (VS Code's
Simple Browser puts its back/forward pair on the *tab's* toolbar, above the page, easy to
miss when the sidebar is wide). Two buttons (`‹`/`›`) went into the header next to the
sidebar toggle, wired straight to `history.back()`/`history.forward()`, plus `Alt+←` /
`Alt+→` as a page-level shortcut for the same pair. No new state: the hash trail #11
already writes is what both buttons walk.

Verified in the browser: select `Agents` → `Codex`, click `‹` → hash reverts to `Agents`
and the page re-renders it, click `›` → back to `Codex`.

### 35. Alert callouts + light code highlighting

Two independent changes to `md2html()`, both scoped to what the item asked for — no new
markdown syntax invented, no per-language grammar.

**Alert callouts.** Blockquote lines were rendered one `<blockquote>` per source line, so a
multi-line `> [!NOTE] ...` block came out as a stack of separate boxes instead of one.
Consecutive `>` lines are now buffered (mirroring how list items already accumulate) and
flushed as a single block wherever a blockquote could previously end — heading, list, table,
rule, blank line, block HTML, code fence, or end of document. If the first buffered line is
`[!NOTE]`/`[!TIP]`/`[!IMPORTANT]`/`[!WARNING]`/`[!CAUTION]` (GitHub's five kinds, matched
case-insensitively), the block renders as `<div class="alert alert-{kind}">` with a colored
left border and label instead of a plain `<blockquote>`; anything else still renders as one
merged blockquote (lines joined with `<br>`, where before each line was its own indented box).

**Code highlighting.** A single shared token regex — not a per-language lexer — runs over
each already-escaped line inside a fenced code block, wrapping `//`/`#` comments, quoted
strings, a small cross-language keyword list (JS/Python/PowerShell/Bash), and bare numbers in
`<span class="tok-c/tok-s/tok-k/tok-n">`. Escaping first and matching second means the token
regex's delimiters (`"`, `'`, `#`, word boundaries) survive escaping untouched and nothing in
the callback needs re-escaping. Deliberately line-scoped: a `/* block comment */` or a
triple-quoted string that spans lines will not be recognised as one token — marked with a
`ponytail:` comment rather than solved, since the roadmap item itself asked for "light"
highlighting, not a real lexer.

Verified against this file's own `[!NOTE]` block (renders as one `alert-note` div, not four
stacked quotes) and two new regression tests (`hub.test.mjs`) covering a `[!WARNING]` block,
a plain multi-line quote staying a plain quote, and a fenced block asserting all three token
classes appear. `npm test`: **30/30**, 2 new.

---

## P6 — 2026-09-07: one process, not three

Not a defect audit — a structural request: stop running `Project-Hub`, `Project-Hub-IAM`
and `Project-Hub-Finance` as three separate processes on three ports (4273/4274/4275),
each independently re-scanning the identical `Documents`/`My Custom Skills`/`Pictures`/
`Automations` content. One process now mounts all three project workspaces as sibling
roots — the same mechanism that already let `Documents` and `Pictures` sit next to the
project root in the tree — plus a combined **Portfolio** view as the new landing page.

### What changed

| Area | Before | After |
|:---|:---|:---|
| Processes / ports | 3 (`4273`/`4274`/`4275`) | 1 (`4273`) |
| Config shape | One `hub.config.json` per hub: `{name, dir, port, title, favicon, repoScope}` | Split: the server's own `{port, title, favicon}` in `Project-Hub/hub.config.json`, plus one `{name, dir, repoScope}` per project under `Projects/<name>/` |
| Discovery | None — each hub only knew its own config | `discoverProjects()` scans `Projects/*/hub.config.json` at startup, adapted from the (now-removed) `discoverHubs()` cross-hub-switcher scan |
| Sidebar | One project root + the shared roots | Three project roots + the shared roots, plus a synthetic `Portfolio` node first |
| Repo scoping | One global `repoScope` filter over one hub's `repos[]` | Each project's own repos filtered by its own dir-prefix *then* its own `repoScope` (order matters — see below), unioned into one payload |
| Cross-hub switcher | `<select id="hubswitch">`, `/api/hubs`, `discoverHubs()` — pinged sibling ports' `/api/health` | Removed entirely — dead once there's one process to be in |
| VS Code workspaces | Each ran its own hub, own port | All three ensure the same shared server, and deep-link via `#Projects/<Name>` instead of landing on Portfolio |

### Two bugs this surfaced that a single-project hub could never trigger

1. **`ROOTS[0]`-only reads.** `agentsReadme` (the featured 4th root doc) and `liveSites`
   (the "Live Sites" cards) both only ever read the *first* root's `Agents/README.md` and
   root `README.md`. Invisible with one project — `ROOTS[0]` was the only project there
   was. Fixed by iterating every mounted project instead of index `0`.
2. **`viewOverview()` never actually scoped by root.** `S.data.stats`/`repos`/`runtimes`
   were global blocks, unfiltered by the `root` parameter the function was handed —
   meaning clicking `Documents` or `Pictures` in the sidebar *already* showed the whole
   project's repo table before this merge, not just after mounting three projects. Fixed
   with one `topAncestorOf(id)` helper (walks the existing `S.parent` chain to a node's
   top-level root) reused to scope repos, runtimes, root docs, and live sites — verified
   live against `Automations` (a shared root): "0 project CLIs, 0 application repos, no
   repos match that filter" and only its own README, where it previously showed all 25
   repos across every project.

### Repo-scoping order, and why it's now load-bearing

`scopeRepos(repos, projects)` filters each project's own dir-prefix *before* applying that
project's `repoScope` — not after. With three projects' repos sharing one flat pool, doing
it the other order risks one project's `repoScope.groups` matching a same-named
`Repos/<group>/` folder that actually belongs to a *different* project (Identity_Workspace and
Finance_Workspace both default their flat repos to a group literally named `Repos`). Covered by
a regression test (`scopeRepos filters each project to its own dir before applying its
repoScope`) using two fixture projects that intentionally share a group name.

### Search and the "only <project>" toggle

Search was already global (one client-side index over the whole tree) — the "combined
across all three projects" half needed no new code. Added: a "this project only" toggle,
shown only when the current selection is inside a project, filtering the same index by
`topAncestorOf(hit.id) === project`. Verified live: searching `agent` from inside
`Finance_Workspace` showed 200 combined matches; toggling narrowed it to 90, every one under
`Projects/Finance_Workspace/`.

### Verified

- `npm test`: **34/34** (4 new: split config validation, the `scopeRepos` collision test).
- Live scan against the merged config: 3 project roots + 4 shared roots + Portfolio node,
  repos correctly split **19 / 5 / 1** across Example_Workspace / Finance_Workspace / Identity_Workspace,
  `rootDocs` and `liveSites` covering all three projects (not just one).
- Per-project overview scoping confirmed live for `Finance_Workspace` (stats, repos table,
  readmes, and the `Finance_Workspace/Agents` CLI-scope label all correctly narrowed) and for
  `Automations` (a shared root, previously unscoped — now correctly empty).
- Portfolio view: project cards with correct per-project repo counts, combined stats
  strip, combined repos table with a per-project chip facet.
- All three `.code-workspace` files updated and re-read for valid JSON; `Project-Hub-IAM`
  and `Project-Hub-Finance` folders deleted, ports 4274/4275 confirmed free
  (`Get-NetTCPConnection`).
- `Watch-Hubs.ps1` needed no code change — it already discovers hubs by walking for
  `hub.config.json` siblings one level above `Projects/`, so it now finds one folder
  instead of three, and the nested `Projects/*/hub.config.json` files are correctly
  invisible to it.

### Not done

Project-scoped stats/repos are computed **client-side** by filtering the full payload
(`topAncestorOf`), not server-side per-project blocks. Simpler, and the payload was never
the bottleneck this session — but if a project's tree grows large enough that shipping the
whole combined payload to render one scoped view becomes the cost center, that's the first
place to look. Left alone deliberately, same reasoning as [#17](#17-the-scan-blocks-the-event-loop):
solve it when it's measured, not before.

### Same-day follow-up: nest under a Projects folder, and stop force-expanding the tree

Two refinements, requested right after the merge landed.

**The three projects moved one level deeper.** They were sibling top-level roots next to
Documents/Skills/Pictures/Automations (and a synthetic `@portfolio` landing node ahead of
them). Now `scanTree()` builds project nodes exactly as before but nests them under one
real `@projects` node (`kind: 'projects'`, real `children`, no filesystem path of its own)
instead of pushing them to the top level — `@portfolio` is gone, and `@projects` is both
the folder you expand to reach a project and the click target for the combined view
(`viewPortfolio()`, kept its name). Project ids are unchanged (`rel()` is path-derived,
independent of tree position), so nothing that links to `#Projects/<Name>` needed to know
about the nesting.

This broke `topAncestorOf()`, and it's worth recording why: the helper walked `S.parent`
until it ran out of ancestors, which used to land exactly on a project (top-level, no
parent). With projects nested, the same walk now climbed straight past the project and
landed on `@projects` instead — silently breaking every consumer (`viewOverview()`'s
root-scoping, the search "only \<project\>" toggle, the Portfolio repos table's
per-project filter) because every repo and runtime in every project would suddenly report
its "root" as the Projects folder. Fixed by stopping the climb at the nearest ancestor
whose *own* kind is `root`/`docroot`/`userroot` (`SCOPE_ROOT_KINDS`), rather than climbing
until there's no parent left at all. Caught by re-testing the already-verified per-project
scoping live rather than assuming the nesting change was purely cosmetic.

**The sidebar no longer force-opens on load.** Two behaviors stacked: `hub.open` in
`localStorage` restored whatever was expanded last time (Phase 3 #12, 2026-08-31), and the
init block then force-added *every* top-level root to `S.open` regardless, so a fresh load
always showed everything expanded. Both removed. The default now: nothing expanded on the
bare URL; opening a link to a project expands only the Projects folder and that project,
because `go()` already walked `S.parent` to open every ancestor of the linked node (plus
the node itself, if it has children) — a case that already existed for deep-linking, just
never exercised as "the whole default expansion story" until the force-expand was deleted.
No new expansion logic was needed, only removing what was overriding it. Each VS Code
workspace's `#Projects/<Name>` link benefits the same way: opening the workspace now shows
only that one project's path in the tree, not every root at once.

Verified live: the bare URL shows all six top-level rows (Projects, Documents, My Custom
Skills, Pictures, Automations, User CLIs) collapsed with the Projects-folder view as the
main pane; `#Projects/Example_Workspace` shows Projects → Example_Workspace expanded (revealing its
Agents/Repos/Resources children) with the other two projects and all shared roots
collapsed; the search "only Example_Workspace" toggle still resolves correctly through the
fixed `topAncestorOf()`. `npm test`: 34/34 unchanged (no test asserted the old flat
sibling-root shape or the removed persistence).

### Second same-day follow-up: report deliverables weren't visible either

Found by using it: a `PortfolioPilot` report folder (`Reports/My-Reports/Weekly-Household-Review/2026-09-06/`)
held a rendered `.html`, a `.pdf` export, a `charts/` folder of `.png` chart images, and
a `.md` summary — only the `.md` showed up in the tree. `DOC_FILE` (what counts as
"visible" once you're inside a git repo — every project here is one) never included
`.html`, `.pdf`, or image extensions; `.html` had a narrow exception only when its parent
folder was literally named `artifacts`/`dashboards`/`prototypes` ([#31](#31-dual-mode-html-viewer--artifacts-shelf)),
and `.pdf`/images had no exception at all, ever. A folder whose only children are hidden
files (like `charts/`, all four PNGs) still appears as a row, but with no expand arrow —
easy to mistake for not being there.

**Considered and rejected: show every file, everywhere.** Measured first rather than
assumed — removing the repo doc-filter entirely, keeping only the existing
`node_modules`/`.venv`/build-output pruning:

| Project | Visible today | Would newly appear |
|:---|---:|---:|
| Example_Workspace | 20,938 | **+95,507** |
| Identity_Workspace | 336 | **+20,602** (mostly a vendored SailPoint SDK tree) |
| Finance_Workspace | 581 | **+489** |
| **Total** | 21,855 | **+116,598** |

Roughly doubling the whole hub's payload to make actual source code (`.ts`/`.py`/vendor
trees) browsable file-by-file is the opposite of what this tool is for. Rejected in favor
of widening the *recognized* set instead of removing the filter.

**Shipped:** `DOC_FILE` now also matches `pdf`, `html`/`htm`, and
`png/jpe?g/gif/svg/webp/avif/bmp/ico` — a report's own deliverables are visible the same
way its README always was, without opening the filter to source code. This makes the
`artifacts`/`dashboards`/`prototypes` folder-name check (`isArtifactHtml`) redundant for
*visibility* — `.html` is visible everywhere now — but it still decides whether an
`.html` file additionally gets collected onto the overview's Artifacts shelf, a curated
surface for interactive dashboards specifically, not every report export. That
distinction is now the comment on `isArtifactHtml`, not an assumption.

Verified: `DOC_FILE` exported and covered by a new test (`DOC_FILE recognizes report
deliverables (html/pdf/images) alongside docs, not source`) asserting both directions —
`report.pdf`/`chart.png`/`page.html` visible, `app.ts`/`binary.exe` still hidden. Live
against the real folder that surfaced this: all four previously-hidden items (the `.html`,
the `.pdf`, and all four chart PNGs under `charts/`) now appear, `more` is gone from both
folder nodes, and the `.html` file opens straight into its sandboxed preview tab (the
[#31](#31-dual-mode-html-viewer--artifacts-shelf) viewer) automatically — that capability
already existed, it just never had a chance to run on a plain report folder before.
`npm test`: 35/35 (1 new).

---

<a id="p7-review"></a>

## P7 — 2026-09-08 Codex review: document browsing and scale

**Status: P7-01 through P7-16 have all shipped.** The report/reliability and Pictures passes landed 2026-09-08 along with the browser verification pass (see [Browser verification pass](#browser-verification-pass--2026-09-08)); the daily-usability half — P7-09, P7-10, P7-12, P7-13, P7-15 and P7-16 — landed 2026-09-09, and P7-13 uncovered and fixed a P7-06 regression on the way. **What is left:** P7-14, blocked on reaching a real narrow viewport; the remaining thirds of P7-07 and P7-15; and the optional P7-17–21. This section incorporates all 21 recommendations from the September 8 suggestions document. P7-01–21 are scoped identifiers so the original audit's #1–37 retain their meanings. The implementation sequence below is the current recommendation; earlier phase sequences remain the historical record.

### Current implementation status — September 9

Every one of P7-01 through P7-16 has shipped. P7-14 is the only one of them carrying an open
caveat, and it is a verification gap rather than missing work. P7-17–21 remain optional and
unstarted by choice.

| Item | Status | Delivered / remaining |
|:---|:---|:---|
| P7-01 | **Shipped; browser-verified** | Project scans and initial payloads omit the Pictures subtree. Folder browsing, deep-link hydration, and paginated metadata search use a separate asynchronous cache and watcher events. Profiling remains available; Git latency and other roots are future performance targets. A very large individual folder was suspected of stalling the tab; that finding was measured again and **withdrawn** — see P7-22. |
| P7-02 | **Shipped; browser-verified** | Dedicated PDF/HTML kinds enter filename search. PDF iframe with Open/Download fallback; correct MIME, byte ranges, and rejection by the text endpoint. Browser pass: `pdf:` returns 540 matches, `html:` returns 787, and a PDF renders its pages in the pane. |
| P7-03 | **Shipped; browser-verified** | Same-size edits change the signature, including bucket entry docs. Failed refreshes preserve the current view with Retry. Startup failures can recover through SSE/retry, and queued refreshes retain force/fresh options. Browser pass: a 31-byte → 31-byte edit repainted the open document with no manual reload. |
| P7-04 | **Shipped; browser-verified; one follow-up open** | Cross-document headings and copyable Hub URLs, including old-hash compatibility and safe Markdown link formatting. A choice of document-relative Markdown destination remains open. |
| P7-05 | **Shipped; browser-verified** | Signed directory routes resolve nested images, CSS, JS, modules, and JSON relative to the report. Junction escapes, forged directory tokens, and unsupported assets are rejected. Browser pass: a report with sibling `icons/` and `logos/` folders rendered all twelve companion images. |
| P7-06 | **Shipped; browser-verified — then corrected on September 9** | Response-level CSP sandbox for HTML and SVG, including direct navigation; no `allow-same-origin`, CORS limited to the signed report directory. Browser pass: direct navigation lands in an opaque origin. **The SVG half was too broad**: a `sandbox` CSP also stops `<img>` decoding an SVG, which silently blanked every SVG preview and embedded diagram for a day. Now negotiated on `Sec-Fetch-Dest` — see [the SVG sandbox](#the-svg-sandbox--a-p7-06-defect-this-surfaced). |
| P7-07 | **Partly shipped** | Accurate total counts, Load 200 More, paths on every result, and `pdf:`, `html:`, `image:` prefixes. **Still open:** global root/type filter controls, typo tolerance, and opt-in document-content search. The largest remaining item in P7-01–16. |
| P7-08 | **Shipped; UI browser-verified, positive launch still unchecked** | Invalid/missing paths return errors; launch failures return 502. Paths are passed as environment data to fixed PowerShell commands. The synthetic Projects node has no filesystem actions; the reveal action is named Reveal in Explorer. **Still unverified:** no action was clicked through to a running application. |
| P7-09 | **Shipped 2026-09-09; browser-verified** | Folder list view beside cards: name, type, modified, size, sortable, folders first only for name and type. Timestamps come from `/api/stat` per folder rather than the scan payload. See [P7-09 shipped](#p7-09-shipped--a-list-that-does-not-cost-a-payload). |
| P7-10 | **Shipped 2026-09-09; browser-verified** | Bookmarks and Recent above the tree, three ways to pin, drag-reorder, in-place rename, unresolved entries with a relink offer, plus a context menu on pinned rows. `localStorage`, paths only. See [P7-10 shipped](#p7-10-shipped--two-lists-above-the-tree) and [`BOOKMARKS.md`](./BOOKMARKS.md). |
| P7-11 | **Shipped 2026-09-08; browser-verified** | A search has its own route, so Back returns to the results. Result-list scroll and per-document reading positions were deliberately left out. See [P7-11 fixed](#p7-11-fixed--a-search-is-now-a-route). |
| P7-12 | **Shipped 2026-09-09; browser-verified** | Heading outline, rendered/source toggle behind `?raw=1`, copy buttons on code blocks, reading width and text size, and a print stylesheet. See [P7-12 shipped](#p7-12-shipped--five-small-things-that-make-a-file-a-document). |
| P7-13 | **Shipped 2026-09-09; browser-verified** | Lazy thumbnails on image cards, and a viewer with fit/100%/zoom, natural dimensions, prev-next and arrow keys. Uncovered and fixed the P7-06 SVG regression. See [P7-13 shipped](#p7-13-shipped--thumbnails-a-real-viewer-and-the-svg-bug-it-uncovered). |
| P7-14 | **Not started — blocked on verification** | Narrow embedded panes. `resize_window` reports success but `innerWidth` never left 1549, so **no genuine 640–1024px viewport has ever been reached** and no claim is made about the layout there. Planning this needs a real narrow viewport first, not more source reading. |
| P7-15 | **Shipped 2026-09-09; browser-verified; partly open** | The search box is a real combobox with `aria-expanded`, `aria-controls` and `aria-activedescendant` across both listboxes. `Ctrl+K` and announced toasts shipped earlier. **Still open:** keyboard focus entry/return for context menus, and keyboard resizing for the mouse-only sidebar divider. See [P7-15 fixed](#p7-15s-combobox-fixed--one-sync-point-not-four). |
| P7-16 | **Shipped 2026-09-09; browser-verified** | The scan status line opens a detail panel: last scan, duration, timing split, roots, and the **paths** behind the read-error count. The understated "only docs and config" wording is replaced and linked to the explanation. See [P7-16 shipped](#p7-16-shipped--the-number-and-then-the-paths-behind-it). |
| P7-17–21 | **Optional; not started** | Related report files, repo-changes drilldown, document link checking, saved views, and copy-context-for-an-agent. Deliberately unbuilt — pick from them based on actual use. |
| P7-22 | **Withdrawn** | The large-folder tab stall was a measurement artifact of a hidden tab, not a defect. Kept as a record so the same wrong conclusion is not reached twice. |

### Browser verification pass — 2026-09-08

**The browser pass that the three previous passes could not run has now been run.** Every earlier
September 8 entry recorded "browser discovery returned no available browser"; this session drove the
live hub on port **4273** in Chrome. Nine acceptance criteria passed and two known-open items were
confirmed as real defects rather than source-derived guesses. A tenth finding — a suspected
large-folder tab freeze — was filed as P7-22, then **re-measured and withdrawn**; that entry now
records why the original evidence was wrong.

#### Confirmed working

| Item | What was checked in the browser | Result |
|:---|:---|:---|
| P7-02 | `pdf:` and `html:` prefix searches; opening a PDF | 540 PDFs and 787 HTML files enter search. `sector-analysis-report.pdf` renders its actual pages in the pane after roughly five to nine seconds, with the Open/Download bar visible the whole time. |
| P7-05 | An HTML report with companion folders | `PortfolioPilot-Images/preview.html`, which pulls from sibling `icons/` and `logos/` folders, rendered **all twelve** companion images. This is the strongest available case for the route, not a self-contained file. |
| P7-06 | Isolation, embedded and directly navigated | Embedded: `sandbox="allow-scripts allow-forms allow-modals allow-popups"`, no `allow-same-origin`, and `iframe.contentDocument` is `null`. Direct navigation to the signed `/api/artifact/<token>/preview.html` URL runs in an **opaque origin** — `document.cookie` and `localStorage` both throw `SecurityError`, and `fetch('/api/health')` throws. `/api/raw` on an HTML file returns an opaque redirect to the signed route. Companion images still load. |
| P7-07 | A broad query | "readme" reports **Showing 200 of 2173**, every row carries its root and relative path, **Load 200 more** sits at the end of the list, and Pictures appears as its own section with an independent count and a visible depth-limit note. |
| P7-03 | Same-length edit | A probe file was written at 31 bytes, opened in the hub, then rewritten at exactly 31 bytes with different content. The open document repainted from the old marker to the new one **without a manual reload**. |
| P7-04 | Cross-document heading links | The heading destination is a separate `?heading=` route field, so it does not collide with the file hash. A **cold** deep link to `ROADMAP.md?heading=p5--2026-09-03-antigravity-audit` — loaded from a different page, not an in-document click — landed with that heading at the top of the pane. |
| P7-01 | Pictures on demand | The Pictures root opens showing six immediate children and "Open to load folder" text; a folder fetch through `/api/pictures` returned in **47 ms**. |
| P7-08 | Context menus | Right-clicking the synthetic **Projects** node opens **no menu at all**, which is the intended behavior. Right-clicking a real node offers Copy Hub Link, Copy Path, Copy Relative Path, Copy as Markdown Link, Open, **Reveal in Explorer**, and Open in VS Code. |
| #10 / P7-15 | Keyboard-only search | Focus the search field, type, arrow down, Enter — the document opens and the sidebar expands to the selected path. The end-to-end path works with no mouse. |

#### P7-22. A large image folder stalls the browser tab — **investigated and withdrawn 2026-09-08**

**Not a defect. This entry is kept as a record so the same wrong conclusion is not reached twice.**

It was originally filed as a confirmed tab-freezing defect on the strength of two observations:
`Page.captureScreenshot` and `Runtime.evaluate` timing out at 30 and 45 seconds while
`/api/health` stayed idle and responsive, and a `setInterval(100 ms)` firing only 4 times in 4.4
seconds while `~/OneDrive/Pictures/Icons/Icons_AI-Library/SVG/material-icons` (about 2,100 files)
rendered. Both observations were real. **The conclusion drawn from them was not.**

Re-measured with `PerformanceObserver({entryTypes:['longtask']})`, which records actual main-thread
blocking and is unaffected by timer policy, the same navigation produces:

| Measurement | Result |
|:---|---:|
| Long tasks during the render | **0** |
| Total blocking time | **0 ms** |
| Elements built | 7,511 |
| Page height | 24,225 px |

**What went wrong with the original evidence.** The MCP-driven tab reports
`document.visibilityState === "hidden"`. Chrome clamps `setInterval` to one tick per second in a
hidden tab, which is exactly the "one-second stalls" that were measured — an artifact of the
instrument, not the application. The CDP timeouts have the same root: Chrome does not paint a hidden
tab, so `captureScreenshot` must force a paint of a 24,000-pixel page on demand, which is slow and
times out. None of it was the hub blocking its own main thread.

**A fix was written and reverted.** `content-visibility:auto` with `contain-intrinsic-size` was added
to `.card` and measured: it changed nothing, because there was no blocking to remove. It was backed
out rather than left in as unearned complexity — the file is byte-identical to before the attempt.

**What is actually true.** `viewFolder()` does build one card per child with no upper bound, and a
2,100-item folder does produce 7,511 elements over a 24,000-pixel page. That is worth knowing, and it
is the reason P7-09's list view is still worth building. But it costs zero measured blocking time
today, so **windowing is a design preference here, not a performance fix, and must not be justified
by this entry.**

**The one thing still unmeasured** is paint cost in a genuinely visible tab, which this tooling
cannot produce. If large folders ever feel slow in normal use, re-measure with the tab in the
foreground before changing any code.

#### Confirmed still broken

- ~~**P7-11 — reading and search context is lost.**~~ **Fixed 2026-09-08, see below.** Browser-confirmed
  before the fix: opening a result from a "readme" search and pressing Back landed on `#@projects`
  with the query cleared and the 200-plus result list gone.
- ~~**P7-15 — the search combobox has no ARIA state.**~~ **Fixed 2026-09-09, see below.**
  Browser-confirmed before the fix: the input carried no `role`, no `aria-activedescendant`, no
  `aria-expanded`, and no `aria-controls`; arrowing through results changed only a visual class, so
  a screen reader was never told which result was highlighted. Exactly one `aria-live` region
  existed, which is the announced-toast work that had already shipped.

#### P7-15's combobox fixed — one sync point, not four

**Shipped 2026-09-09.** The rows were already `role="option"` inside a `role="listbox"`; what was
missing was every piece of state that connects them to the input. The input is now
`role="combobox"` with `aria-autocomplete="list"`, `aria-expanded`, and
`aria-controls="search-results pictures-results"`, and a single `syncCombobox(active)` owns the
per-row `id`, `aria-selected`, and the `.cur` class, plus the input's `aria-expanded` and
`aria-activedescendant`.

**Why one function rather than setting attributes where the rows are built.** Pictures results
append asynchronously, after the main list is already on the page, and the arrow keys walk both
lists as one sequence. Ids assigned at build time would restart at zero in the second list, so
`aria-activedescendant` would point at the wrong row the moment a Pictures result was highlighted.
Assigning them at sync time keeps one contiguous sequence across both listboxes.

`renderView()` was split into a two-line wrapper over the existing body (`renderPage()`) so every
repaint — search, document, folder — re-syncs without touching the view dispatch chain. The other
two call sites are the arrow-key handler and the Pictures render.

Verified in the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| Before searching | `aria-expanded="false"`, no `aria-activedescendant` |
| Type "readme" | `aria-expanded="true"`, 200 rows, listbox `search-results` |
| Arrow down, down, up | `aria-activedescendant` walks `hit-0` → `hit-1` → `hit-0`, each target resolving to a real element with `aria-selected="true"` |
| Selected rows at any time | Exactly **1** |
| Escape | Back to the document route, `aria-expanded="false"`, descendant cleared |
| "icon" — 200 documents + 200 Pictures | Ids `hit-0`…`hit-399` with **no duplicates and no gaps** across both listboxes |
| Arrow into the Pictures section | `hit-204` resolves inside `#pictures-results`, still exactly one selected row |

`npm test` is **53/53** (52 before, plus one regression pinning the four wiring pieces: the input's
combobox attributes, that every id named in `aria-controls` is actually built, and that
`syncCombobox` is defined and called from all three paths). There is no DOM in the test runner, so
that test pins the wiring rather than the behaviour; the table above is the behavioural evidence.

**Still open in P7-15:** keyboard focus entry and return for context menus, and keyboard resizing
for the mouse-only sidebar divider. The `⌘K`/`Ctrl+K` half was already shipped.

#### Still unverified after this pass

- **P7-14, narrow panes.** `resize_window` reported success but `innerWidth` stayed at 1549, so no
  genuine 640–1024px viewport was ever reached. **No claim is made about narrow-pane layout.** At the
  full width tested there was no horizontal overflow and the search field measured 242px.
- **Connection interruption and recovery.** Testing it means stopping the live hub the user is
  running; it was deliberately not done. The same-length-edit half of P7-03 is verified, the
  failure-recovery half is not.
- **The positive native-launch path.** Rejections were covered by the earlier HTTP checks and the
  menu wiring is confirmed, but no action was clicked through to a running application.

#### P7-11 fixed — a search is now a route

**Shipped 2026-09-08.** Root cause: a search was the one view with no address of its own. `S.query`
lived only in memory, and `go()` cleared it before pushing the document's hash, so the results were
not merely forgotten — they were never recorded anywhere the Back button could reach.

The fix gives the search a route (`#?q=…`, plus `scoped=1` and `limit=` only when they differ from
their defaults) and lets the browser's own history do the restoring. **No new state store, no "Back
to results" button, and no scroll bookkeeping** — entering a search pushes one history entry,
refining the query replaces it so typing does not bury the history one entry per keystroke, and
opening a result pushes on top.

Changed `navigation.mjs` (added `searchHash` and `parseSearch`, leaving `parseRoute` untouched so
existing tests keep their contract) and five small call sites in `index.html`: the query input, the
scope chip, Load 200 more, the Escape handler, and the initial-route restore.

Verified in the browser against the exact failing case:

| Behaviour | Result |
|:---|:---|
| Type a search | URL becomes `#?q=readme` |
| Open a result, press Back | Query, search box, and all 200 results restored |
| Press Back again | Returns to `#@projects`, search cleared |
| Three query refinements | Zero extra history entries |
| Load 200 more | `limit=400` in the URL; reload restores 400 rows and the "Showing 400 of …" header |
| Project scope chip | `scoped=1` in the URL |
| Escape | Returns to the document route with the box cleared |

`npm test` is **52/52** (50 before, plus two regressions: search-route round-tripping including
Unicode and punctuation, document and search routes never being mistaken for one another, and a
hand-edited `limit` being clamped rather than becoming an unbounded render).

**A side effect worth noting:** search results are now shareable and bookmarkable URLs, which is
free groundwork for P7-10 and most of P7-20.

**Deliberately not done:** scroll position within the result list, and per-document reading
positions. Both are in P7-11's original description; neither is needed to make Back work, and both
want a place to store per-entry state that this change does not introduce. Add them if returning to
a long result list at the top actually proves annoying in use.

Method note: the probe file used for the P7-03 test was created inside the existing
`Agents/Codex/temp/p7-smoke/` fixture folder and deleted afterward. No user documents or pictures
were modified.

### Pictures performance pass — shipped September 8

Pictures no longer participates in the normal project scan. Its initial tree row is metadata only; opening a folder fetches its immediate children, and a deep link fetches the selected file plus its ancestor path. Loaded folders survive ordinary project refreshes. A separate server-side metadata index is built only when a search needs Pictures; results appear in a labeled Pictures section with independent totals and 200-result paging. Project-only and incompatible kind searches do not trigger that index.

Pictures has its own cache version and `pictures` SSE event. Picture changes invalidate only that cache; normal document/project edits do not walk or retransmit Pictures. Reconnecting invalidates the browser's Pictures cache so signed report/navigation and file state can recover after a restart. Late responses from an older cache generation do not repopulate it.

Live verification caught directory metadata notifications interrupting the first index build. The watcher now ignores directory `change` notifications while retaining file changes and directory `rename` events, including newly created empty folders. Search also retains the existing scanner's `MAX_DEPTH = 7` boundary; deeper folders remain directly browsable. The UI discloses this limit and unreadable-folder counts. Metadata enumeration uses batches of eight directories and does not read image contents.

| Measurement | Before | After |
|:---|---:|---:|
| Nodes in ordinary scan payload | 118,220 | 40,191 (**66% fewer**) |
| Gzip payload, actual response bytes | 1,675,465 | 921,701 (**45% smaller**) |
| Filesystem walk, two fresh-scan samples | 6.171 / 6.072 s | 2.103 / 1.974 s (**about 67% less**) |
| Cached scan HTTP request, one sample | 391 ms | 164 ms |
| Total scan time, two fresh-scan samples | 16.642 / 10.342 s | 10.571 / 20.596 s |

**The total-scan row is intentionally retained:** Git took 7.255 and 17.338 seconds in the after samples, so these measurements support a smaller payload and faster directory walk, not a consistent end-to-end scan speedup. This is a live workstation comparison with two fresh scans per version and one cached request; filesystem caches, concurrent activity, and Git load were not controlled. Browser paint/parse time was not measured.

On the final build, startup and ordinary scans performed **zero Pictures directory reads**. Opening the Pictures root returned six immediate children in **4 ms**. An initial metadata search found **54,405 images** in **1,384 ms**, a cached query took **41 ms**, and resolving a search hit's deep link took **3 ms**. A concurrent health request completed in **1 ms**; these are individual samples, not latency guarantees.

**Validation:** `npm test` passed **50/50** (eight new Pictures regressions). **10 live checks passed**, covering untouched startup, shallow browsing, deferred search indexing, paging, deep links, cache reuse, empty-directory invalidation, and isolation from project watcher ticks. The live watcher test created one empty, uniquely named folder under Pictures and removed it with non-recursive cleanup. No user pictures were edited. Browser control remained unavailable; sidebar interactions, history, and visual behavior still need the browser pass already listed below.

New modules: `Hub/pictures.mjs` (asynchronous browse/search cache), `Hub/pictures-client.mjs` (loaded-node cache), and `Hub/pictures.test.mjs`. Updated `Hub/hub.mjs`, `Hub/index.html`, test wiring, and the refresh test's UI ports. The identified local hub was restarted on **4273**. Reload an existing tab to use the new client.

Evidence is saved under `D:\Work\Projects\Example_Workspace\Agents\Codex\temp\`: `pictures-performance-before.json`, `pictures-performance-after.json`, and `pictures-live-checks.json`. Source snapshots are in `project-hub-before-lazy-pictures/`.

**Remaining limits:** the first Pictures search after startup or a real change rebuilds the metadata index. Extremely active photo writes can require retrying a search; one automatic conflict retry and a visible Retry action are provided. A single very large folder still returns its immediate children as one list. Full-content search, thumbnail galleries, and virtualized rows remain separate work. The depth limit matches the former scan rather than silently expanding the indexed photo library.

### First report/reliability pass — what shipped and how it was checked

Changed `Hub/hub.mjs`, `Hub/index.html`, and the test command in `Hub/package.json`. Added `Hub/reports.mjs` (report delivery), `Hub/navigation.mjs` (route/link helpers), `Hub/open-native.mjs` (native launch requests), and `Hub/reports.test.mjs`. No dependencies or build step were added. The launcher restarted the identified hub process on port **4273**, and live health returned **ready**. Reload an already-open hub tab to load the updated interface.

- **42/42 tests passed** with `npm test`: the original 35 plus seven regression tests covering report search classification, heading routes and malformed links, same-length edits, safe native launch arguments and failures, frontend syntax, refresh/recovery behavior, and report HTTP delivery/isolation.
- **11 live HTTP checks passed**: HTML redirect and sandbox response, three relative assets (CSS/JS/SVG), PDF MIME/ranges, binary text-view rejection, invalid and missing native-action paths, module MIME, and the live scan's PDF/HTML classifications.
- HTTP tests also checked signed-token forgery, encoded directory traversal, a junction escape, PDF downloads, HEAD requests, invalid ranges, and CORS boundaries. These test the delivery boundary; they are not browser execution tests.
- A live scan measured **11.811 s**: **6.229 s walk**, **3.263 s Git**, **2.319 s assembly**, plus **131 ms serialization** and **258 ms gzip**. An earlier post-restart scan measured 23.256 s. These are diagnostic samples, not a controlled speedup comparison. The payload remained about **19.36 MiB / 1.60 MiB gzip**; revision timestamps are used internally without adding a field to every transmitted node.
- Browser discovery still returned no available browser. Visual PDF rendering, chart execution, focus/scroll behavior, and browser-enforced sandbox isolation remain to be checked. Positive OS app launches were mocked in tests; live native-action checks exercised rejection paths only. Recent read errors persisted (11 across three scans in the recorded sample); the cause remains open.

Live check output is saved at `D:\Work\Projects\Example_Workspace\Agents\Codex\temp\p7-live-checks.json`. Reusable, non-sensitive report fixtures are in the adjacent `p7-smoke/` folder. Pre-change source snapshots are in `temp/project-hub-before-p7/`.

**Preview limits:** companion assets must stay inside the report's directory (nested folders work). Parent-directory escapes and root-relative project assets are not supported by this route. Existing external dependencies still depend on network availability. Signed preview URLs expire on server restart; reopen the report through its stable Hub link. Restricted capabilities such as origin storage remain unavailable in sandboxed reports. PDF availability depends on the browser's built-in viewer, with Open/Download provided as the fallback.

The detailed findings below retain the original review's evidence and acceptance criteria. Use this status table for current delivery state rather than interpreting the original descriptions as unfixed in their entirety.

### Relationship to the existing backlog

| Existing item | September 8 follow-up | How to track it |
|:---|:---|:---|
| #4 — refresh signature | P7-03 | Complete the documented same-size-edit edge case and add recovery behavior; preserve the original fix record. |
| #10 — keyboard support | P7-15 | Extend existing accessibility to context menus, resizing, search state, and announcements. |
| #11 / #29 — navigation and anchors | P7-04, P7-11 | Add cross-document heading destinations and restore reading/search context. |
| #13 — search | P7-02, P7-07 | Carry fuzzy matching forward here with accurate counts, report types, and root filters. |
| #15 — native open actions | P7-08 | Add error reporting and correct synthetic-node actions. |
| #16–18 / #36 — scan performance | P7-01 | Re-profile using the larger current tree before selecting an optimization. |
| #19 — health visibility | P7-16 | Surface diagnostics in the UI; keep the existing watchdog. |
| #23 — dirty-file detail | P7-18 | Same backlog item, expanded to include on-demand read-only diffs; not a second feature. |
| #25 — responsive layout | P7-14 | Prioritize narrow VS Code panes; phone layout remains optional. |
| #31 / September 7 report visibility | P7-02, P7-05, P7-06, P7-13, P7-17 | Build on shipped previews and file visibility; add missing search/viewer behavior, asset resolution, isolation, and report grouping. |

Other open ideas, including #24 routine pass/fail, remain open. The September 7 collapsed-sidebar default remains intentional. Earlier completed work is not reopened wholesale by these follow-ups.

The strongest next step is to make this a faster, more complete document and artifact browser. Keep the current project overview, restrained visual style, and Markdown-first storage model. Prioritize finding and reading files, preserving your place, and explaining freshness before adding more dashboard sections.

### Review coverage

- Read the project documentation, existing roadmap, frontend, and relevant scanner/server code.
- Checked the running home page, `/api/health`, and `/api/scan` through HTTP. The home page returned 200 with template placeholders substituted; health reported `ready`.
- Ran `node --test hub.test.mjs` from `Hub`: **35 passed, 0 failed**.
- Browser runtime discovery returned no available browsers. Consequently, this is a **source and live-data review, not a completed visual or interactive browser audit**. Layout, keyboard, and preview observations below identify code-level gaps or verification targets; they are not claims of observed screenshots or clicked workflows.
- At review time no application changes were made. The subsequent first implementation pass and its validation are recorded above.

Evidence references below use paths relative to the project folder and line numbers from the September 8 source snapshot; those line numbers may move as fixes land.

### What is already working in the design

Preserve these existing capabilities rather than rebuilding them:

- One process for all three projects, with shared roots scanned once.
- A collapsed starting tree that expands only the selected path. This is an intentional recent change; do not automatically restore every previously expanded folder.
- Hash deep links, Back/Forward controls, keyboard tree navigation, visible focus styles, and scoped search.
- Sortable/filterable repo tables, project and user CLI separation, Draft cards, Live Sites, and the Artifacts shelf.
- Four themes, adjustable/collapsible sidebar, rendered Markdown, HTML preview/source switching, and image previews.
- Existing sanitizer, response security headers, watchdog, scan compression, and automated tests.

### Live measurements change the priorities

One health snapshot reported:

| Measurement | Observed value |
|---|---:|
| Indexed nodes | 118,193 |
| Scan payload | 19.36 MiB uncompressed / 1.60 MiB gzip |
| Most recent scan | 20.26 seconds |
| Last ten scan durations | 11.10–39.00 seconds |
| Server resident memory | 813 MiB |
| Recent read errors | 6 over the last three scans |

A following scan payload contained 118,194 tree nodes, showing normal small changes between requests:

| Root | Nodes |
|---|---:|
| Projects | 30,801 |
| Documents | 8,684 |
| My Custom Skills | 210 |
| Pictures | 78,038 |
| Automations | 18 |
| User CLIs | 443 |

**Pictures accounts for about 66% of the tree.** The roadmap's earlier measurements of roughly two-second common scans and a 471 ms directory walk should not determine today's priorities. These new measurements do not establish which phase is slow, prove a memory leak, or measure browser rendering time; they establish that profiling is worth doing again.

### First fixes and improvements

Priority labels here are independent of the historical P0–P7 section names. **Next** = next implementation pass; **Following** = following usability pass; **Optional** = optional expansion. Effort is relative: S = localized, M = several connected changes, L = architectural work.

#### P7-01. Profile the current scan and load Pictures on demand

**Next · M–L · Live evidence**

Instrument directory enumeration, metadata reads, Git work, JSON serialization, compression, and client indexing separately. Then give large shared roots, especially Pictures, their own loading and refresh boundary. Opening the Projects landing page should not require transferring every photo's metadata.

Start with cached root summaries and children fetched when a folder is opened. Keep cross-root search available through a separate metadata index. Do not delete Pictures or hide all photos simply to improve the numbers.

**Success:** record cold/warm load and scan timings before and after, using the same roots. Verify that an ordinary project-document edit does not require a complete Pictures transfer. Consider workers or virtualized rows only where measured timings support them.

Evidence: live measurements above; `Hub/index.html:441` (`reindex`), `Hub/hub.mjs:571` (`scanTree`). Extends existing roadmap #16–18 with current evidence.

#### P7-02. Make PDF and HTML deliverables searchable, and give PDFs a real viewer

**Next · M · Source-confirmed gap**

PDF and HTML files are now visible in the tree, but `kindOfFile()` classifies both as ordinary `file`, and `reindex()` excludes every `file` from search. A report can therefore be browsable but absent when searched by its filename.

PDFs also fall into the generic text viewer: `/api/file` reads them as UTF-8, and `/api/raw` has no PDF MIME mapping. Add explicit document types, search their filenames, and provide a PDF preview with an Open/Download fallback. Avoid sending binary contents through the text renderer.

**Success:** a known PDF and HTML report both appear in filename search; PDF selection shows pages or a useful fallback rather than encoded binary text.

Evidence: `Hub/hub.mjs:563`, `Hub/index.html:441`, `Hub/index.html:1661`, `Hub/hub.mjs:1578` onward.

#### P7-03. Make live refresh notice same-size edits and preserve readable content

**Next · M · Source-confirmed gap**

The scan signature uses ID, description, and size. An edit that changes a value without changing byte count or the description can be missed. Include file modification time or a document revision marker; use content hashing selectively if timestamp behavior requires it.

Separately, a failed background scan calls `showFatal()`, clearing the current document and tree. Keep the last good view visible with a stale-data banner, last-success timestamp, and Retry. Reserve the full startup error page for a session with no usable data. Ensure recovery works after an initial connection failure too.

**Success:** same-length edits refresh an open document; a temporary connection failure preserves the document and reading position, then recovers without a manual page reload.

Evidence: `Hub/hub.mjs:1119`, `Hub/index.html:497`, `Hub/index.html:535`, initialization near `Hub/index.html:1880`. Same-size freshness extends roadmap #4.

#### P7-04. Support links to headings in other documents

**Next · S–M · Source-confirmed gap**

Same-document anchors already work. Cross-document links such as `README.md#installation` explicitly discard the fragment before navigation. Preserve the target heading, wait for rendering, and scroll to it. Add a separate route field for document headings so they do not conflict with the file-selection hash.

Add **Copy Hub Link** beside Copy Path. Offer document-relative Markdown links where appropriate; the current Markdown copy action always creates a machine-specific `file:///` link and does not escape labels or destinations.

**Success:** a cross-document section link lands on the section; copying a Hub link and reopening it restores the same document and heading.

Evidence: `Hub/index.html:1729` (`loadDoc`), `Hub/index.html:715` (`showCtxMenu`).

#### P7-05. Resolve supporting assets in HTML report previews

**Next · M · Source-derived behavior; browser verification needed**

An HTML report is served at `/api/raw?path=...`. A relative image such as `charts/revenue.png` resolves against that endpoint URL, not the report's filesystem folder. The HTML preview path does not apply the relative-asset rewriting that Markdown images receive.

Provide a contained artifact route that preserves the report directory structure for images, CSS, and scripts, with path checks on every asset. Test both self-contained reports and reports with companion folders. Include a visible fallback for scripts or assets that cannot run under the sandbox.

**Success:** an existing report with a sibling `charts/` folder renders its charts while preserving preview isolation.

Evidence: `Hub/index.html:1690`, `Hub/hub.mjs:1593`; the roadmap's September 7 report-deliverables example makes this a relevant workflow.

#### P7-06. Enforce HTML preview isolation on the response as well as the iframe

**Next · M · Source-confirmed boundary gap; no exploit attempted**

The embedded viewer uses an iframe sandbox without `allow-same-origin`, which is useful protection. However, raw HTML responses replace the normal policy with only `frame-ancestors 'self'`. Direct navigation to that URL does not inherit the parent iframe's sandbox, so active HTML can run in the hub origin.

Use a response-level CSP sandbox or a separate preview origin with suitably restricted access to the hub API. Design this together with relative-asset support rather than loosening the hub's main policy.

**Success:** verify both embedded and directly opened previews cannot read the hub's DOM or privileged API responses, while supported charts still work. Add a targeted browser regression check when browser tooling is available.

Evidence: `Hub/hub.mjs:1607–1617`, `Hub/index.html:1693–1698`. This finding is about the current HTML route, not a claim that the previously fixed Markdown sanitizer defect has returned.

#### P7-07. Make search results accurate and easier to narrow

**Next · M · Source-confirmed gap plus enhancement**

Search truncates to 200 results before producing the count, so “200 matches” may mean many more. Show “Showing 200 of N,” with Load More or paging. Always show the root and relative path; currently the description replaces the path when present, making duplicate README or SKILL names harder to distinguish.

Add visible filters for root/project and type, including PDF, HTML, and image. Keep the existing kind prefixes. Add typo tolerance as a fallback after exact/prefix matches, and later offer explicit opt-in document-content search with snippets. Do not silently imply that current metadata search searches entire documents.

**Success:** broad searches disclose the actual count, duplicate names are distinguishable, and a user can search only Documents or only Pictures without first navigating into a project.

Evidence: `Hub/index.html:1800–1864`. Fuzzy matching is already an open roadmap item (#13).

#### P7-08. Make native actions report what happened

**Next · S–M · Source-confirmed gap**

Open buttons ignore response failures, and the server discards process errors and returns 204 even for an unresolved path. Report rejected paths and launch failures; show “opening” while the request is in progress, then report whether the launch request succeeded. Do not claim an application is visibly open merely because its process was started.

Disable filesystem actions for the synthetic Projects node: its regular page correctly has no filesystem buttons, but the generic tree context menu still offers them. Rename the context action “Open Folder” to **Reveal in Explorer** to distinguish selecting an item in its parent from entering the folder.

Evidence: `Hub/index.html:715`, `Hub/index.html:945`, `/api/open` in `Hub/hub.mjs:1623` onward.

### Everyday browsing improvements

| # | Priority / effort | Suggestion | Concrete benefit and scope |
|---|---|---|---|
| P7-09 | **Shipped 2026-09-09** | ~~**List view alongside cards**~~ | Built — see [P7-09 shipped](#p7-09-shipped--a-list-that-does-not-cost-a-payload). Four sortable columns, folder counts, a remembered toggle, and timestamps fetched per folder rather than scanned into every payload. |
| P7-10 | **Shipped 2026-09-09** | ~~**Bookmarks, favorites and recent documents**~~ | Built to the spec below — see [P7-10 shipped](#p7-10-shipped--two-lists-above-the-tree). Pinned items plus an automatic 20-document Recent list, `localStorage`, paths only, both sections collapsed at startup. |
| P7-11 | **Fixed 2026-09-08** | ~~**Restore reading and search context**~~ | Back now recovers the query, the scope filter, and how many results were loaded, because the search has its own route — see [P7-11 fixed](#p7-11-fixed--a-search-is-now-a-route). Result-list scroll and per-document reading positions were deliberately left out. |
| P7-12 | **Shipped 2026-09-09** | ~~**Reader tools**~~ | All five built — see [P7-12 shipped](#p7-12-shipped--five-small-things-that-make-a-file-a-document). Outline, rendered/source, copy-code, width/size, and a print stylesheet. |
| P7-13 | **Shipped 2026-09-09** | ~~**Image browsing controls**~~ | Built — see [P7-13 shipped](#p7-13-shipped--thumbnails-a-real-viewer-and-the-svg-bug-it-uncovered). Lazy thumbnails, fit/100%/zoom, dimensions, prev-next and arrow keys — plus the [SVG sandbox fix](#the-svg-sandbox--a-p7-06-defect-this-surfaced) it turned up. |
| P7-14 | **Blocked on verification** | **Adapt to narrow VS Code panes** | The header has a 290px search field, fixed-height layout, and root zoom of 1.15; only the detail split has a width breakpoint. Prioritize 640–1024px embedded panes: collapse secondary actions, make search flexible, and offer compact density. **No genuine narrow viewport has ever been reached** — `resize_window` reports success while `innerWidth` stays at 1549 — so nothing here is measured, and building to a guess is how you ship a second layout that is also wrong. Needs a real narrow window first. |
| P7-15 | Following / S | **Finish keyboard and status accessibility** — *combobox ARIA fixed 2026-09-09* | Keep the existing tree work. ~~Search arrows update a visual class; connect the active option with appropriate ARIA state.~~ Done, see [P7-15's combobox fixed](#p7-15s-combobox-fixed--one-sync-point-not-four). ~~Announced toast/status messages~~ and ~~`Ctrl+K` on Windows~~ also shipped. **Remaining:** keyboard focus entry/return for context menus, and keyboard resizing for the mouse-only divider. |
| P7-16 | **Shipped 2026-09-09** | ~~**Explain freshness and indexing**~~ | Built — see [P7-16 shipped](#p7-16-shipped--the-number-and-then-the-paths-behind-it). The status line opens a detail panel, read errors now carry their paths, and the understated indexing text is replaced and linked to the explanation. |

#### P7-10. Bookmarks, favorites and recent documents

**Following · S–M · Requested 2026-09-08**

Explicitly requested as a bookmark/favorites feature, and deliberately **not** top priority — P7-11
comes first. It was already on the backlog as "Pinned locations and recent documents"; this
is that item specified properly rather than a second entry for the same thing.

**What it is.** Two lists that sit above the tree in the sidebar, both collapsed by default so the
starting view stays as quiet as it is today:

- **Bookmarks** — items the user pinned by hand. Any node the tree can select qualifies: a document,
  a folder, a repo, a project, or a saved search once P7-20 exists. Manually ordered, drag to
  reorder, rename allowed so a pin can read "Hub roadmap" instead of `ROADMAP.md`.
- **Recent** — the last 20 documents opened, newest first, maintained automatically, with no way to
  reorder it. Deduplicated by path so reopening a file moves it rather than adding a second row.

**How it is added and removed.** A star or bookmark control beside `copy Hub link` in the document
header, mirrored as **Add Bookmark** / **Remove Bookmark** in the existing tree context menu, which
already carries Copy Hub Link and Reveal in Explorer. `Ctrl+D` toggles the bookmark for whatever is
selected, overriding the browser default. The control shows filled or empty so the current state is
always visible without opening a menu.

**Storage.** `localStorage`, one key per list, holding an array of `{path, label, addedAt}` and
nothing else. Store **paths only, never document contents** — the same rule the original backlog
entry set, and it matters more here because bookmarks persist across sessions while a rendered
document does not. The hub already has no per-user server state and this feature must not introduce
any; the whole point is that it survives a restart of the process without the process knowing about
it.

**The stale-entry problem, which is the real design work.** Bookmarks outlive the files they point
at. Files get renamed, moved between projects, and deleted, and the hub already rescans constantly
and knows exactly which paths exist. On each scan, mark any bookmark whose path is missing as
**unresolved** — dim it, keep it in the list, and offer Remove. Do not silently drop it: a pin that
vanishes because a rescan hit a temporarily unreadable folder is worse than a dim one, and the
health endpoint already reports read errors on every scan. Where exactly one file with the same
basename appeared elsewhere in the same root since the last scan, offer it as a suggested
relink rather than repointing anything automatically.

**Scope boundaries.** No sync, no server component, no export/import, no folders-inside-bookmarks,
and no tags — those are P7-20 territory if they are ever wanted. Recent is capped at 20 and needs no
settings. If the two lists together take more than a small localized change plus a sidebar section,
the design has grown past what was asked for.

**Success:** pinning a document and restarting the browser brings the pin back; opening five
documents fills Recent in the right order with no duplicates; renaming a bookmarked file leaves a
visibly unresolved entry rather than a dead link or a silent disappearance; and the startup tree is
still collapsed with both lists closed.

**Test:** one regression covering add/remove/reorder round-tripping through `localStorage`, Recent's
20-item cap and deduplication, and an unresolved entry surviving a scan in which its path is absent.

#### P7-10 shipped — two lists above the tree

**Shipped 2026-09-09.** Built to the spec above. `#pins` sits between the Explorer header and
the tree, holding **Bookmarks** (manual, drag-ordered, renameable) and **Recent** (automatic,
newest first, capped at 20, deduplicated by path). Both start collapsed on every load — the
open/closed state is deliberately *not* persisted, so a fresh tab looks exactly as quiet as it did
before the feature existed, which was the point of the collapsed-tree startup.

**Three ways to pin, one state.** A `☆ / ★ bookmark` button beside `copy Hub link` in the document
header, **Add Bookmark / Remove Bookmark** as the first item of the tree context menu, and `Ctrl+D`.
All three route through one `togglePin()`, so the button's `aria-pressed`, the menu's label, and
the sidebar can never disagree. `Ctrl+D` prefers the tree's keyboard cursor over the open document,
because arrowing to a row and pinning it without opening it is the obvious thing to expect; it
overrides the browser's own bookmark dialog, which would only ever bookmark the hub itself.

**Storage** is `localStorage`, two keys, `{path, label, addedAt}` and nothing else. `parseList()`
distrusts what it reads — a corrupted or older-format value reads back as an empty list rather than
throwing, and duplicate paths collapse to one row. There is no server component and no per-user
server state, which is what lets the lists survive a restart of the process without the process
knowing they exist.

**The stale-entry work, which was the real design task.** Every scan re-resolves the bookmarks
against `S.byId`. A missing path is dimmed, struck through, and kept — never dropped — and its
tooltip says *not found in the last scan*. Where exactly one node in the same root has the same
basename, one **relink** offer appears under the row; clicking it repoints the entry, and nothing
is ever repointed automatically. Two deliberate details: Pictures nodes load on demand, so a
bookmarked photo absent from `S.byId` is **not** called dead (`pinExists()` also asks
`pictureNodes.owns()`), and before the first scan lands nothing is marked missing at all.

**Two things the spec did not anticipate, found by using it.** Five pinned READMEs all rendered as
`README.md`, which is not a list. And renaming had to happen without `prompt()`, which blocks the
whole page: double-clicking a pin swaps the label for an input, committing on Enter or blur and
cancelling on Escape.

**Right-click on pinned rows, added 2026-09-09 after use.** The `contextmenu` listener was on
`#tree` only, so pinned rows had no menu at all — the one place you most want Copy Hub Link.
`#pins` now has its own listener reusing `showCtxMenu()`, with two additions: an optional
**Rename Bookmark** that dispatches a `dblclick` at the label rather than growing a second
editor, and a split of the old `virtual` flag into `virtual` (no path exists — the synthetic
Projects node) and `unlaunchable` (path known, file gone). A missing pin therefore keeps its
copy actions, which is the case where the last known path matters most. A pin the scan cannot
describe gets a node synthesized from what the pin stores, so the menu never depends on the
file still existing.

**Row context, added 2026-09-09 after use.** The first fix for the duplicate-name problem qualified
any colliding label with its parent folder. Real use showed that was the wrong axis: three pins all
named `Agents`, one per project, are told apart by *what they belong to*, not by a repeated folder
name. `pinContext()` now climbs the parent chain and stops at the first `repo` **or** scope-root
ancestor, so one walk covers both cases — a file inside a repo reports its repo, anything else
reports its project or shared root — and renders right-aligned and dim, suppressed when it only
repeats the label. The parent-folder qualifier survives as the second tier, applied only when label
*and* context still collide, which is two READMEs inside one repo. A path the scan does not hold
falls back to its own parent folder, which is all an unresolved pin has.

Verified against the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| Fresh tab, nothing stored | Both sections present, both `aria-expanded="false"`, zero rows drawn |
| Fresh tab **with** a stored pin and a recent | Still both collapsed; counts show `1` and `1` without expanding |
| Open five documents, reopen the first | Recent holds 5 rows, the reopened one moves to the top, **no duplicates** |
| Reload | Recent restored from `localStorage` in the same order |
| Colliding labels | Five `README.md` rows render as `skills/README.md`, `setup/README.md`, `design/README.md`, … |
| Header star | `☆ bookmark` / `aria-pressed="false"` → `★ bookmark` / `aria-pressed="true"` |
| `Ctrl+D` on a focused tree row | Pins that row, not the open document |
| Context menu | First item reads **Add Bookmark**, and **Remove Bookmark** when reopened on the same row |
| Drag row 0 onto row 2 | Order becomes `b, c, a`, persisted |
| Double-click rename | Label becomes `Hub design notes`; the stored **path is unchanged** |
| The `×` control | Removes the row and does **not** navigate to it |
| Bookmarked file **moved** to a sibling folder | Row goes dim and struck through, one relink offer naming the new path; clicking it repoints the entry, which then opens the moved file |
| Bookmarked file **deleted** | Row goes dim, entry **still stored**, and no relink offer — there is no candidate |
| Collapsed rail (`Ctrl+B`) | `#pins` is `display:none`, like the tree |

`npm test` is **57/57** (53 before, plus four: storage round-tripping with junk and duplicate input,
Recent's ordering/dedup/cap, an unresolved entry surviving a scan with one relink candidate and
recovering when the file returns, and a sidebar-wiring check that also asserts no `localStorage`
key outside the known set is ever written).

**Deliberately not built, per the spec's own boundaries:** no sync, no server component, no
export/import, no nesting inside bookmarks, no tags. Saved searches stay P7-20, even though
P7-11's search route already made them addressable.

Method note: the relink and deleted-file cases used two throwaway probe files created under
`Repos/Tools/Repo-Clones/`, the workspace's documented scratch folder, and deleted afterwards; the
folder is empty again. Test bookmarks and recents were cleared from the browser at the end. No user
documents were modified.

#### P7-09 shipped — a list that does not cost a payload

**Shipped 2026-09-09.** `viewFolder()` now renders either cards or a four-column list — **name,
type, modified, size** — chosen by a toggle in the folder header and remembered per browser in
`hub.folderview`. Cards remain the default and are untouched. The list is flat on purpose: splitting
it into titled groups is what the card view already does, and one sortable sequence is the entire
point of a list.

**The design question was the Modified column.** `mtime` is deliberately non-enumerable on scanned
nodes — `stampNode()` says so in a comment — because a timestamp on all ~40,000 of them is exactly
the weight [the Pictures pass](#pictures-performance-pass--shipped-september-8) spent itself
removing. So it is fetched, not scanned: `folderStamps()` reads one directory's immediate children
with no recursion and no file contents, and `/api/stat` returns it keyed by **name**, because the
client already holds the ids and repeating the folder prefix per row is the same waste at smaller
scale. The endpoint goes through the same `resolveId()` gate as every other path-addressed route.

**Folders come first only for the name and type sorts.** The first implementation grouped them
always, which is what every file explorer does — and the browser check immediately showed why it is
wrong here: sorting by *modified* buried a README edited fourteen minutes ago beneath seven day-old
folders. When the sort key is the question, grouping is the thing standing in front of the answer.

The client caches one response per folder and drops the whole cache when a scan lands, so a
timestamp can never outlive the scan it was read under; a reply arriving after that invalidation is
discarded rather than repopulating it, the same generation rule the Pictures cache follows.

Verified against the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| `/api/stat` on a real folder | 200 with `{name: mtimeMs}` for immediate children only |
| Outside the roots · inside a secret directory · missing | **403 · 403 · 404** |
| Toggle | `⊞ cards` / `☰ list` with `aria-pressed`; choice restored from `localStorage` after a reload |
| Four column sorts | name, type, modified, size all sort and reverse on a second click |
| Sort by modified | A README edited 15 minutes ago sorts **above** day-old folders — the fix above |
| Sort by name or type | Folders still group first |
| Folder rows | Show a child count (`16 items`), or `unopened` for a lazy Pictures node |
| In-flight vs. failed stats | `…` while fetching, `—` when a folder has no usable time — never a stuck `…` |
| **1,250-entry folder** | Stat call **39 ms / 47 KB**; render produced **0 long tasks and 0 ms total blocking** |
| Cards mode | Unchanged, including the titled Project CLIs group on an `Agents/` folder |

`npm test` is **59/59** (57 before, plus two: `folderStamps` returning names not ids for immediate
children only — with a nested file asserted absent — and returning `null` for a non-directory; and a
wiring check that `/api/stat` resolves through `resolveId`, that the list view's four entry points
exist, and that a new scan invalidates the timestamp cache).

**Still card-only, deliberately:** image thumbnails. The roadmap asked to keep them, and a list row
is the wrong place for one — P7-13's image browsing controls are where that belongs.

Method note: the hub process was restarted once to load the new endpoint, since `hub.mjs` is read at
process start while `index.html` is read per request. No user documents were modified, and the test
`hub.folderview` preference was cleared from the browser afterwards.

#### P7-12 shipped — five small things that make a file a document

**Shipped 2026-09-09.** All five parts of the item, in `viewFile()`. Four live in the panel header
next to the document name; **print** is a document-level action, so it sits with the header buttons
instead.

| Tool | What it does |
|:---|:---|
| **Outline** | A collapsible list of the document's headings, built from what actually rendered — so it can never disagree with the page. Clicking one scrolls and writes the same `?heading=` route a cross-document link reaches, so the outline and the address bar cannot drift apart. |
| **rendered / source** | Same shape as the HTML preview tabs. Markdown is the one kind where both halves earn their place: the render to read, the source to copy or diff. |
| **Copy on code blocks** | One button per `pre.code`, appended to the rendered block so it copies exactly what is on screen. Hidden until hover or keyboard focus. |
| **Width and size** | `↔` cycles full → 82ch → 64ch; `A` cycles 100 → 112 → 125 → 90%. The measure is in `ch`, so it tracks the text size rather than fighting it. |
| **Print** | A `@media print` block that hides every piece of chrome and prints the document in black on white. |

**Source is `?raw=1`, not a second field.** When `raw` was removed from `/api/file` it left a note:
it had been 44% of the bytes of a large README and no client read it, so a view-source toggle "if
it is ever wanted, belongs behind `?raw=1` rather than in every reply." That is exactly what this
does, and a regression now pins it so the field cannot quietly come back.

**Two placement decisions.** The measure applies to `.md > *`, not `.md`: panel chrome stays full
width, and a wide table or code block is held to the measure and scrolls inside it — both already
carry `overflow-x`, so nothing is ever clipped. And width and size persist under **one** key holding
two *names* rather than indexes (a stored index would silently mean something else the moment either
list changed), while the outline and the source toggle are per-session, matching the HTML tabs.
Index 0 of both lists is today's appearance, so nobody's existing view changes until they ask.

Verified against the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| `/api/file` with and without `raw=1` | Rendered HTML vs. escaped `<pre>` source starting at the frontmatter |
| Outline on the roadmap itself | **89** entries across h1–h4, correctly indented |
| Clicking an outline entry | Scrolls, and the hash becomes `…ROADMAP.md?heading=p7-10-bookmarks-favorites-and-recent-documents` |
| Width cycle | `none` → `82ch` (630px measured) → `64ch` (492px); label and `solid` state follow |
| Size cycle | 12.8px → 14.34px, and the `ch` measure grows with it (492px → 550px) |
| Both after a reload | Restored from `hub.reader`; the outline and source toggle correctly reset to their defaults |
| Source view | `<pre>` only, zero headings, outline hidden, tabs flip |
| Copy buttons | **9 of 9** code blocks wired, `opacity:0` until hover, copying the block's own `<code>` text |
| Print stylesheet | **21 rules parsed into the CSSOM** — a source-file check cannot catch a typo that silently drops one; hides `aside`/`header`/`.ph`/`.outline`/`.copycode` and drops the measure |

`npm test` is **60/60** (59 before, plus one: that `/api/file` gates source on an explicit `raw=1`
and never ships raw text alongside the render, that all five client entry points exist, and that the
print block hides each piece of chrome and drops the reading measure).

**What could not be verified, and why it is not a defect.** No clipboard write is testable through
this tooling: the MCP-driven tab is never focused, so `navigator.clipboard.writeText` throws
`NotAllowedError: Document is not focused` and `navigator.userActivation.isActive` is `false`. The
**pre-existing** `copy path` button — code this change never touched — fails identically under the
same synthetic click, which is what identifies it as the instrument rather than the feature. A
`readText()` probe then hung `Runtime.evaluate` for 45 seconds in the hidden tab; per
[P7-22](#p7-22-a-large-image-folder-stalls-the-browser-tab--investigated-and-withdrawn-2026-09-08) that
is a known property of a hidden tab and not evidence of a frozen page — the tab answered normally
immediately afterwards. What *is* verified is that every block has a button wired to that block's
own `<code>` text.

Method note: the hub was restarted once for the `raw=1` change, since `hub.mjs` is read at process
start. The test `hub.reader` and `hub.folderview` preferences were cleared from the browser
afterwards. No user documents were modified.

#### P7-16 shipped — the number, and then the paths behind it

**Shipped 2026-09-09.** This item had a confirmed defect inside it rather than only an enhancement:
`/api/health` reported nineteen read errors while the footer showed a green `● scanned 09:25`, and
nothing anywhere said which files had failed. A count you cannot act on is barely better than no
count.

**The server now records what failed.** `noteReadError()` keeps the last twelve failing paths with
their errno — bounded, deduplicated by path (a repeat failure moves the entry rather than adding a
second), and **paths only, never content**; storing any part of a file that could not be read would
be both useless and a leak. `readHead()` returns `null` for every failure alike, so the reason is
stashed in a single slot for the caller that records it. `readErrors++` now exists in exactly one
place, and a regression pins that so a future call site cannot quietly go back to a bare increment.
`/api/health` exposes the list as `readErrorPaths` with relative ids, so the UI can link them.

**The status line is now a button.** Clicking `● scanned …` — or tabbing to it and pressing Enter,
since it goes through `activate()` — opens a panel with the last successful scan and its age, the
duration, the node count and gzipped payload, the walk/git/assemble/serialize/gzip split already
present in `lastScan.timings`, the mounted projects, the Pictures state including its unreadable and
depth-limited counts, and the read errors: recent and lifetime counts, then the actual paths newest
first, each clickable to its document when it is still in the tree.

It reuses the context menu's floating layer wholesale — same element bookkeeping, same dismissal on
Escape, outside click, scroll, resize and blur. There should only ever be one floating layer, and a
tree context menu correctly replaces it.

**What it found on the first run.** The nineteen errors the roadmap called invisible are `EISDIR`
and `ENOENT` under `~/.gemini/skills/` and a Gemini CLI backup folder — the scanner reading a
directory where it expected a file, and a dangling entry. Surfacing them was this item; deciding
what to do about them is not, and they are left as they are.

**The indexing text was also simply wrong.** "only docs and config are indexed" predated PDF,
HTML-report and image support and understated `DOC_FILE` badly. Folder pages now read *"N other
files here that the index skips — see what's indexed"*, and that phrase **opens the panel's What
gets indexed section**: a sentence that says "see what's indexed" and links nowhere is the same dead
end as a count with no paths behind it. Three separate literal notes collapsed into one
`skippedNote()`. A regression asserts the panel's file-type list still matches `DOC_FILE`, so the
replacement cannot rot into a new lie for an old one.

Verified against the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| `/api/health` after a restart | `readErrorPaths` holds **7 of 7** errors with `EISDIR`/`ENOENT` and relative paths |
| Status line | `role="button"`, `tabIndex 0`, titled; opens on click **and** on Enter |
| Panel contents | All five sections; 14 rows including `duration: 21.2s`, `reading git: 16.4s`, `indexed: 40,330 nodes` |
| Read-error count row | Rendered in the warning colour when non-zero, plain when not |
| Error rows | Clickable through to the document when the path is still in the tree |
| Dismissal | Escape ✅ · outside click ✅ · a tree context menu replaces it, never two layers ✅ |
| Placement | Above the footer, clamped on screen |
| Folder note | "17 other files here that the index skips — see what's indexed. Use open folder." |
| That phrase | A real button, tabbable, and it opens the **What gets indexed** section |
| Old wording | Gone from every one of the three sites |

`npm test` is **62/62** (60 before, plus two: that `noteReadError` is bounded, deduplicating and
content-free, that `readErrors++` has exactly one call site and `readErrorPaths` ships relative
paths; and that the understated wording is gone, the panel is wired to the status line, all five
sections exist, and its file-type list still matches `DOC_FILE`).

**Not captured: a screenshot of the open panel.** It dismisses on window blur, like the context menu
it shares its layer with, and a CDP screen capture blurs the window — so every capture attempt
photographed the panel already closed. That is the instrument, not a defect, and the behaviour is
correct for a dismissible floating layer. Everything above was verified through the DOM instead.

Method note: the hub was restarted once to load the read-error tracking. No user documents were
modified, and nothing was written to the browser's storage by this change.

#### P7-13 shipped — thumbnails, a real viewer, and the SVG bug it uncovered

**Shipped 2026-09-09.** Both halves of the item, plus a defect this work exposed that had nothing
to do with it.

**Thumbnails, loaded on demand.** Image cards carry one. `loading="lazy"` plus
`decoding="async"` is the entire mechanism — native lazy loading means there is no
IntersectionObserver to write and none to get wrong. Measured on the 1,250-image folder that
[P7-22](#p7-22-a-large-image-folder-stalls-the-browser-tab--investigated-and-withdrawn-2026-09-08)
used: **40 images fetched, 32 KB, zero long tasks, 0 ms blocking**. They render `object-fit:contain`
rather than `cover` — the first pass used `cover` and the browser check showed it cropping the
subject clean out of icon after icon. A thumbnail with space around it beats one that lies about
what the file contains.

> **ponytail:** the browser downscales the full file, not a generated thumbnail. A real thumbnail
> cache needs an image decoder, which this zero-dependency server has not got. Revisit only if a
> folder of very large originals actually feels slow.

**A viewer instead of a fixed-size preview.** `fit` / `100%` / `−` / `+` across 25–400%, the image's
natural dimensions beside the current zoom, `‹ prev` / `next ›` through the images in the same
folder with a `3 of 1250` counter, and left/right arrow keys. Zoom is session state shared across
images, so flipping through a folder at 100% stays at 100%; `null` means fit, which is what the
preview always did, so nothing changed for anyone who never touches the controls.

The arrow keys were the one place worth being careful. They apply only while an image is open and
neither the tree nor a text field has focus — both already own the arrow keys — and `Alt`+arrow
stays Back/Forward. All four cases are pinned by a regression, because a shortcut that quietly
steals a key from an existing control is the kind of thing nobody reports and everyone works around.

#### The SVG sandbox — a P7-06 defect this surfaced

**Not part of P7-13, found by it, fixed here.** The first thumbnail pass rendered 1,250 blank
frames. The cause was a day old: [P7-06](#p7-06-enforce-html-preview-isolation-on-the-response-as-well-as-the-iframe)
correctly treats SVG as active content and gave it the report sandbox CSP — but a `sandbox`
directive puts the response in an opaque origin, and **Chrome then refuses to decode it inside an
`<img>` at all**. No error event fires, so `img.onerror` never ran: just `naturalWidth === 0` and an
empty box.

That had been silently breaking **every SVG preview and every SVG embedded in a markdown document**
since 2026-09-08, not only the new thumbnails. Nothing in the browser pass that day would have
caught it — it checked HTML report isolation, which is exactly what P7-06 was about.

The fix negotiates on `Sec-Fetch-Dest`, a header the browser sets and page script cannot forge. A
request whose destination is `image` gets the hub's ordinary strict CSP, because the HTML spec
already disables scripting for SVG loaded as an image and the sandbox buys nothing in that context.
**Every other destination — `document`, `iframe`, `object`, `empty`, or the header absent
entirely — keeps the sandbox**, which is the case P7-06 was actually about; failing closed on a
missing header keeps a non-browser client sandboxed. HTML is untouched and still redirects to the
signed route regardless of what destination is claimed.

Verified against the live hub on port 4273:

| Behaviour | Result |
|:---|:---|
| 1,250-image folder | 1,250 cards, all `loading="lazy"`; **40 fetched, 32 KB**, 0 long tasks, 0 ms blocking |
| Thumbnails decode | `naturalWidth` 150 after the SVG fix — 0 before it |
| `/api/raw` on an SVG, `Sec-Fetch-Dest: image` | Ordinary hub CSP, `content-type: image/svg+xml`, decodes |
| Same file, `document` / `iframe` / `object` / `empty` / no header | Sandbox CSP retained, all five |
| Viewer controls | `fit*` → `100%*` with `zoom:1`, `+` twice → 400%, dimensions read `150 × 150 · 400%` |
| Raster image | A 2.9 MB PNG loads and reports `2552 × 7913` |
| prev / next | `2 of 1250` → `3 of 1250`, zoom carried across; the first image correctly shows only `next ›` |
| `←` / `→` | Step images; `Alt`+arrow still Back/Forward; tree and search box keep their own arrows |

`npm test` is **64/64** (62 before, plus two: thumbnails stay lazy, decode async and remove
themselves on error, the viewer's controls exist and zoom defaults to fit, and the arrow keys yield
to the tree, to text fields and to Alt; and an HTTP test covering the SVG sandbox across all six
destinations plus HTML's unconditional redirect).

**Not built:** a generated thumbnail cache, per the ponytail note above; and thumbnails in the list
view, which is text by design — cards are where images belong, exactly as P7-09 said.

Method note: the hub was restarted once for the SVG fix. Two blank screenshots during this pass were
the hidden-tab paint artifact from P7-22, not a rendering failure — the DOM measurement taken
immediately afterwards showed the images loaded. No user documents were modified.

### Optional enhancements worth keeping on the backlog

| # | Priority / effort | Enhancement | Why it fits |
|---|---|---|---|
| P7-17 | Optional / M | **Related report files** | Group a report's Markdown, HTML, PDF, and charts into one report entry with format buttons. Start with filename/directory relationships; use an optional small manifest only when inference becomes ambiguous. |
| P7-18 | Optional / M | **Repo changes detail** | Let “uncommitted” drill into changed filenames and an on-demand read-only diff. Already suggested in roadmap #23; a natural completion of the current Git overview. |
| P7-19 | Optional / M | **Document link checks** | Add an on-demand check for broken relative links, missing images, and missing heading targets. Link each finding back to its source document. Keep this separate from every routine filesystem scan. |
| P7-20 | Optional / M | **Saved views** | Save combinations such as Finance HTML reports or IAM docs. Reuse search/filter state and offer a Hub link to the view. This becomes more useful after search types and navigation restoration are fixed. |
| P7-21 | Optional / S–M | **Copy context for an agent** | Let you select a few files and copy a compact list of titles, relative paths, and Hub links. Make content inclusion explicit and bounded. This connects the human browsing layer to CLI work without adding an embedded chatbot. |

### Suggested implementation sequence

**Superseded by events — kept as the record of the order it was actually done in.** Fifteen of the
sixteen numbered items shipped across two days, in roughly the order recommended below.

| # | Step | Outcome |
|---|:---|:---|
| 1 | Reliability and completeness: P7-02–08 | Shipped 2026-09-08, browser-verified. P7-07 kept a third open (filters, typo tolerance, content search). |
| 2 | Scale: separate Pictures from ordinary project loading | Shipped 2026-09-08, browser-verified. |
| 3 | Restore context: P7-11 | Shipped 2026-09-08. With P7-22 withdrawn, no confirmed defect was left outstanding. |
| 4 | P7-09's list view | Shipped 2026-09-09. It stayed a usability change: measured blocking time is zero either way. |
| 5 | Daily usability: the rest of P7-09–16 | P7-10, P7-12, P7-13, P7-15 and P7-16 all shipped 2026-09-09. P7-13 uncovered and fixed a P7-06 regression on the way. |
| 6 | Optional workflow features: P7-17–21 | Not started, by choice. |

**What is actually left, in the order it is worth doing:**

1. **P7-14, narrow panes — blocked, not deferred.** Every attempt to reach a 640–1024px viewport
   with this tooling failed: `resize_window` reports success and `innerWidth` stays at 1549. Nothing
   about the layout at that width has been measured, and building to a guess is how you ship a
   second layout that is also wrong. It needs a real narrow window, which is a person dragging one.
2. **The rest of P7-07** — global root/type filters, typo tolerance, opt-in document-content search.
   The largest genuinely-unbuilt piece of P7-01–16, and the one most likely to be missed in use.
3. **The rest of P7-15** — keyboard entry and return for context menus, and keyboard resizing of the
   sidebar divider. Small, and the only remaining places the UI is mouse-only.
4. **P7-17–21**, chosen from based on actual use rather than in order.

Also open, found rather than planned: the `EISDIR`/`ENOENT` read errors under `~/.gemini/skills/`
that [P7-16's status panel](#p7-16-shipped--the-number-and-then-the-paths-behind-it) made visible.
Surfacing them was the item; deciding whether the scanner should stop trying to read those paths is
not, and has not been done.

Keep the existing no-build architecture unless a particular change earns extra tooling. A framework rewrite, editable filesystem operations, and a general AI assistant are not prerequisites for these improvements.

### Verification still needed

The suite grew with the work: 35 tests at the original review, 42 after the report/reliability pass
plus 11 live HTTP checks, 50 after the Pictures pass plus 10 live checks, then 52 (P7-11), 53
(P7-15), 57 (P7-10), 59 (P7-09), 60 (P7-12), 62 (P7-16) and **64** (P7-13). Every number below was
measured in Chrome against the live hub on port 4273, not read out of the source.

**Covered.**

| What | Where |
|:---|:---|
| Projects landing page, deep links, wide widths | [Browser pass](#browser-verification-pass--2026-09-08) |
| Search → document, >200 results, duplicate names, keyboard-only | Browser pass |
| Search → document → **Back** | Was failing; fixed and re-verified — [P7-11](#p7-11-fixed--a-search-is-now-a-route) |
| PDF, HTML with companion assets, preview isolation | Browser pass |
| A 1,250-image folder | No measured blocking — see the withdrawn [P7-22](#p7-22-a-large-image-folder-stalls-the-browser-tab--investigated-and-withdrawn-2026-09-08) |
| Cross-document anchors · same-size edits | Browser pass |
| Search combobox ARIA, across both listboxes | [P7-15](#p7-15s-combobox-fixed--one-sync-point-not-four) |
| Bookmarks and recents, including a moved and a deleted pin | [P7-10](#p7-10-shipped--two-lists-above-the-tree) |
| Folder list view, four sorts, 1,250 entries | [P7-09](#p7-09-shipped--a-list-that-does-not-cost-a-payload) |
| Reader tools: outline, source toggle, width/size, print CSSOM | [P7-12](#p7-12-shipped--five-small-things-that-make-a-file-a-document) |
| Scan status panel, read-error paths, indexing wording | [P7-16](#p7-16-shipped--the-number-and-then-the-paths-behind-it) |
| Lazy thumbnails, viewer controls, arrow-key yielding | [P7-13](#p7-13-shipped--thumbnails-a-real-viewer-and-the-svg-bug-it-uncovered) |
| SVG to `<img>` vs. every other fetch destination | A P7-06 regression, found and fixed |

**Still open, and why.**

| What | Why it is still open |
|:---|:---|
| **Narrow desktop widths (640–1024px)** | `resize_window` reports success while `innerWidth` stays at 1549. No genuine narrow viewport has ever been reached, so **no claim is made** about the layout there. This is what blocks P7-14. |
| **Connection interruption and recovery** | Testing it means stopping the live hub the user is running. Deliberately not done. The same-length-edit half of P7-03 is verified; the failure-recovery half is not. |
| **Focus and scroll survival across a refresh** | Never exercised. |
| **Malformed/missing heading destinations; copy-link output containing spaces** | Never exercised. |
| **The positive native-launch path** | Rejections are covered by HTTP checks and the menu wiring is confirmed, but no action was clicked through to a running application. |
| **Any clipboard write, anywhere in the app** | Not verifiable with this tooling. The MCP tab is never focused, so `writeText` throws `NotAllowedError` for **every** copy button, the pre-existing ones included; a `readText` probe hangs the evaluator. What is verified is that each button is wired to the right source text. |

No contrast measurements or accessibility-audit-tool results are claimed anywhere in this document.
Screenshots taken during these passes confirmed the behaviours listed above and nothing broader; two
blank captures during the P7-13 pass were the hidden-tab paint artifact from P7-22, not rendering
failures.

---

## P8 — 2026-09-09: the Links root, README landing views, and four more color schemes

Three small additions, all requested directly rather than found by an audit.

### A fifth shared root: `Links`

`D:/Work/Documents/Links` is now mounted as its own top-level root
(`SHARED_ROOTS`, tinted purple) rather than being reached three clicks deep inside
`Documents`. It is a link library — a destination people go to on purpose, not a
branch of the docs tree — and the sidebar now reflects that.

It is the first root that **nests inside another root**, which needed a guard the
walker never had. Mounted naively, its subtree would be indexed twice — once under
`Documents/Links`, once as its own root — with the *same* node ids in both copies,
which duplicates every hit in the search index. So `walk()` now checks
`MOUNTED_ROOTS` (every root's dir, lowercased) alongside the existing `SKIP_DIRS`,
dot-dir, and secret-dir prunes, and the `Documents` walk stops at that folder.
The check is general, so any future nested root behaves the same way with no
further code.

Verified on a scratch instance before restarting the live hub: `Links` appears once
as a top-level node with its six children, and no longer appears among the
`Documents` children.

### Every folder that documents itself lands on its README

Clicking `Documents`, `Links`, `Automations`, or `My Custom Skills` in the sidebar used
to land on whatever their `kind` dispatched to — a stats overview built for a project
workspace (`Automations` read "0 project CLIs, 0 application repos, no repos match that
filter") or a grid of folder cards. None of that is why you open a reference folder. The
same was true one level down, and two, and three: a folder whose README *is* its index
still opened as a wall of cards restating the file names beside it.

Both now open on their own `README.md`. Shipped in two passes the same day — the shared
roots first, then, once the shape held, every ordinary folder in the tree.

The flag is set server-side. `buildRootNode(r, shared)` adds `docFirst: true` when a
shared root has a README; `walk()` adds it to any directory node whose `README.md` /
`index.md` / `INDEX.md` it already reads for the folder blurb. Client-side `renderPage()`
checks `docFirst && doc` *before* it dispatches on `kind`, routing to `viewDocFirst()`.
Three properties fall out of putting the test there rather than inside each view:

- **A folder with no README is untouched.** `Pictures`, `User CLIs`, and every scratch
  directory keep exactly the view they had — which is also the answer to "what if a
  README is deleted later".
- **Purpose-built pages are excluded by construction, not by a name check.** Project roots
  never get the flag, so they keep the overview that is the reason to click them; nor does
  `kind === 'cli'`, which has `viewCli()`; nor repos and bucket entities (skills, commands,
  sub-agents, routines), which are built in their own branches of `walk()` and already
  render their document beside the git box or the metadata box. On this machine that lands
  the flag on 1,635 folders and on none of the 36 repos, 1 CLI runtime, or 491 entities that have
  a `doc` of their own.
- **The round trip is one button.** `⊞ folder` — `⊞ overview` on a root — in the
  header drops to the view the node would otherwise have had, and `☰ readme` (rendered
  only in that state) comes back. The switch lives in a session `Set` keyed by node id, not
  in `localStorage`: opening the hub fresh should always land on the README.

One bug found while building it, worth recording because it is silent and the symptom
looks like a server-side race: `PROJECTS.map(buildRootNode)` hands `Array.map`'s **index**
in as `shared`, so every project root except the first (index `0`, falsy) was flagged
README-first. Arrow-wrapping the call fixes it. Any helper that grows an optional second
parameter while being passed bare to `.map()` has the same trap waiting.

Verified in the browser against the live hub, both passes: `Automations` and `Links`
render their READMEs and `⊞ overview` reaches the old view with a `☰ readme` button on
it; `Documents` (a `docroot`, so the `⊞ folder` label) does the same; `Links/Dev`
confirms it at sub-folder depth, and its `⊞ folder` returns the card grid with `☰
readme` beside the cards/list toggle; `Agents/Claude` still renders the full CLI runtime
page despite having a README; `Agents/Claude/temp`, which has none, still renders cards;
and `Example_Workspace` still shows its stats strip and 20-repo table with no README button
anywhere.

### Eight color schemes, up from four

Four schemes were added to the picker beside **rescan** — the sheet's own
"copy a block, change the values, add an `<option>`" contract held, with the name
also added to the `THEMES` array in the client:

| Scheme | |
|:---|:---|
| `plum` | dark — violet/magenta on aubergine |
| `nord` | dark — muted arctic blue-grey |
| `sepia` | light — brown ink on aged cream, a second light option beside `paper` |
| `mono` | dark — pure greyscale, no hue anywhere |

No `TINT` changes were needed: node tints resolve from the same
`--green`/`--blue`/`--purple` variables each block redefines, so every new scheme
recolored the tree for free.

---

## Phase 0 — what shipped

Applied to all three hubs on **2026-08-31** and verified against the running servers.

| Change | Files | Verified by |
|:---|:---|:---|
| gzip regex retyped, `0x08` bytes removed | 3 × `hub.mjs` | `content-encoding: gzip`, 10.24 MB → 1.08 MB on the wire |
| CSP + `nosniff` + `no-referrer` on every response, per-request nonce on the two inline scripts | 3 × `hub.mjs`, 3 × `index.html` | Both `<script>` nonces match the header and change per request; `<img/onerror>` no longer executes; app boots, fonts and badges load, console clean |
| Port owner identified before `-Restart` kills it | 3 × `Start-Hub.ps1` | Decoy process on a spare port refused and survived |
| Stat-tile arrow escape restored | 3 × `index.html` | `::after` content computes as `" ↓"`; all six files control-byte clean |

Nothing here changes behaviour the page depends on, so no rollback plan beyond the
usual: `.\Start-Hub.ps1 -Restart` after any edit, because the server reads its source
once at process start.

---

## Phase 1 — what shipped

Applied **2026-08-31**. The three hub folders now hold a config file, a launcher shim,
their logs and their README — nothing else.

| Change | Result |
|:---|:---|
| Program moved to [`../Hub`](../Hub/README.md) | One `hub.mjs`, one `index.html`, one `Start-Hub.ps1` |
| `hub.config.json` per hub | `name`, `dir`, `port`, `title`, `favicon`, `repoScope` — validated at startup |
| `index.html` templated | `%TITLE%`, `%FAVICON%`, `%PORT%` filled per request beside the existing `%NONCE%` |
| `Start-Hub.ps1` shims | Three lines each; the VS Code `folderOpen` tasks are unchanged |
| Launcher owner check refined | Tells *this* hub, *another* hub and foreign apart — only foreign refuses |
| Tests + manifest | `npm test`, 16 tests, `engines.node >= 18.17` |
| Dead code removed | `hub.mjs.bak`, `section()`, `window.go` |

**Lines of source: ~6,500 → ~2,500.**

Verification: payload fingerprints for all three hubs before and after — `stats`,
`repos`, `runtimes`, `rootDocs`, `roots`, `topLevel`, `title` and `faviconHref` identical;
node-id sets identical (0 added, 0 removed); gzip still negotiated on all three; no
leftover placeholders in the served HTML; the page boots, renders a README with images,
and folds sections.

One migration wrinkle worth knowing: the first `-Restart` after the move refused, because
the running servers had been started from the now-deleted per-folder `hub.mjs` and the
launcher correctly did not recognise them. That is why it now names *which* kind of
process holds the port rather than only whether it is this exact script.

---

## Phase 2 — what shipped

Applied **2026-08-31**, once each, in the shared source.

| Finding | Change | Measured |
|:---|:---|:---|
| #2 step 2 | `sanitizeHtml()` — tokenise and rebuild from an allowlist; raw HTML buffered across lines | 374 real docs re-rendered, 358 identical, 16 stricter-and-correct |
| #4 | Signature mixes `desc` and `size` | A content edit now moves the signature; before it did not |
| #5 | `raw` dropped from `/api/file` | 63,001 → 35,722 bytes on the root README (−43 %) |
| #6 | `Host` allowlist on every request; `Sec-Fetch-Site` gate on `/api/open` | Foreign `Host` → 403; cross-site `/api/open` → 403 |

Test suite: **22 tests, 22 passing, 0 todo** — the two placeholders left by phase 1 now
pass, which was their whole purpose.

A note on what the sanitizer rewrite is *not*: it does not make the CSP redundant. The
CSP is what makes a bypass harmless; the filter is what stops there being one. Keeping
both is the point — either alone would have left the August payload working or the page
one regex away from it.

---

## Phase 3 — what shipped

Applied **2026-08-31** to `Hub/index.html` — one file, which is what phase 1 bought.

| Finding | Change | Measured on the live page |
|:---|:---|:---|
| #10 | `activate()` helper + delegated Enter/Space; `:focus-visible` ring; tree as a real tree widget with a roving tabindex; `aria-label` on search | 0 → **66** role/aria/tabindex attributes; 39 focusable controls; 1 tab stop in a 22-row tree |
| #11 | `#<id>` in the address bar, `hashchange` routing, deep link honoured on load | Back and Forward both re-render the right node; a reload on a link restores it |
| #12 | `hub.open` in `localStorage`, saved from `renderTree()` | 63 rows / 7 open branches, identical across a reload |
| #13 | Kind scoping, `<mark>` highlighting, `↑↓` + `Enter` over results | `skill:kalshi` → 4 hits all SKILL; `edge` → 83 highlighted; Enter opened the cursor's hit |

The tree walk was driven key by key rather than eyeballed: focus the root, `↓↓`, `→` to
expand (`aria-expanded` flips to `true`), `↓` into the children, `←` back to the parent,
`←` again to collapse, `End`, `Home`, `Enter` to open — with the tab stop staying at
exactly one the whole way. No console errors.

What this does not include is fuzzy search (#13's remainder): `score()` still needs a
substring hit, so a typo finds nothing.

---

## Phase 4 — what shipped

Applied **2026-08-31**. Measured before deciding, which changed two of the four plans.

| Finding | Change | Measured |
|:---|:---|:---|
| #16 | Search index built client-side instead of shipped | Payload **10.23 → 5.81 MB** (−43 %), gzip **1.08 → 0.68 MB** |
| #18 | `describe()` memoised on `path\|mtime\|size` | Head reads **466 → 25 ms** (−95 %), 2,270 fewer file opens per scan |
| #19 | `/api/health` + `Watch-Hubs.ps1`, registered as a 15-minute scheduled task | Killed a hub: detected and restarted in 7s; three of my own bugs found and fixed by running it |
| #14 | Sortable columns + group / needs-attention filters | 20 rows → 9 on filter, heading `9 of 20`, sort and reverse both work |
| #15 | `open in VS Code` action (`?in=code`) | Button present on every page with actions |
| #20 | Log rotation at 1 MB in `Start-Hub.ps1` | — |

Two plans did not survive contact with the numbers, and both are recorded above rather
than quietly changed: #16 was expected to need lazy children or a diff protocol, and
instead needed one duplicated array deleted; #18 was expected to need incremental subtree
invalidation, and the walk turned out to be 471 ms of a 2-second scan that is really git.

Test suite: **24 tests, 24 passing**, including a guard against the index reappearing in
the payload and a check that the health fields the watchdog reads still exist.

---

<p align="center">
  <a href="../README.md">← Project Hub</a> ·
  <a href="ChatGPT-HTML-Design.md">ChatGPT HTML Design</a> ·
  <a href="../Hub/README.md">Hub source</a> ·
  <a href="../Project-Hub/README.md">Project Hub →</a>
</p>

<p align="right"><sub><a href="#roadmap-top">back to top</a></sub></p>
