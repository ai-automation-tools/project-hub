# Current engine features

Reference snapshot: 2026-09-09. The source checkout `Hub/README.md` remains authoritative.

## Sidebar context menu

Right-click any row in the tree — folder or file — for copy and launch actions (updated 2026-09-09). The same menu is on the sidebar's **Bookmarks** and **Recent** rows:

| Action | What it does |
|:---|:---|
| Add / Remove Bookmark | Pins the row, or unpins it. The label reflects the current state; same action as the header's `☆ bookmark` button and `Ctrl+D`. See [Bookmarks and recents](#bookmarks-and-recents). |
| Rename Bookmark | Bookmark rows only. Opens the same in-place editor as double-clicking the label, which is otherwise undiscoverable. |
| Copy Path | Absolute Windows path, backslashes. |
| Copy Relative Path | The tree id itself (drive-relative, `~/...` for user scope). |
| Copy Hub Link | Stable Hub URL for this item. The document header also preserves the current heading. |
| Copy as Markdown Link | Escaped `[name](<Hub URL>)`, including safe spaces and brackets. |
| Open / Open File | Same as the header button: PowerShell `Start-Process` on the path — browses into a folder, launches a file with its default app. |
| Reveal in Explorer | Reveals the row *selected* in its parent Explorer window (`/api/open?...&reveal=1`), rather than opening it. This is the one destination "Open" doesn't cover: a file's own containing folder. |
| Open in VS Code | `/api/open?in=code&path=...`. |

The menu distinguishes two kinds of absence. The synthetic Projects node has no path at all, so its path copies and launch actions are both disabled; it can still be bookmarked like any other row. A **pinned row whose file has gone missing** keeps its copy actions — the last known path is the useful thing when hunting for where a file went — and loses only the launch actions (`opts.missing` → `unlaunchable`, distinct from `virtual`). A pin the scan cannot describe gets a node synthesized from what the pin itself stores, so the menu never depends on the file still existing. Launch requests report invalid paths, missing files, and process failures; a successful response acknowledges the request, not a visually verified open application.

Originally implemented client-side as one `showCtxMenu()` in `index.html` (a `contextmenu` listener
on `#tree`, positioned/clamped to the viewport, closed on outside click/scroll/Escape) —
launch actions now use `open-native.mjs`, with paths passed through an environment variable to a fixed PowerShell command. `/api/open` returns 403/404/400 for invalid requests and 502 for launch failures.

## Pictures on demand

Pictures is a lightweight root in `/api/scan`. Expanding or opening a folder loads only its immediate children; following a picture deep link fetches that file and the ancestor path. Previously loaded folders are retained across ordinary project refreshes. Raw image delivery still uses `/api/raw`.

A search that includes Pictures gets a separate results section. Its metadata index is built asynchronously on the first relevant query and reused, with up to 200 results per page. Project-only searches and repo/skill/CLI queries do not build it. Search preserves the former scan depth limit of seven recursive levels; deeper folders are still browsable, and the UI explains the search boundary. Unreadable folders are disclosed rather than silently counted as complete coverage.

The Pictures watcher invalidates only Pictures and emits a `pictures` SSE event. Directory metadata `change` notifications are ignored; file changes and directory `rename` events invalidate the cache, so new empty folders appear too. `/api/health` reports `pictures.state`, version, cache counts, read errors, and search build duration. The main scan's node count now excludes the lazy subtree; Pictures counts live in the separate status data once indexed.

Measured on September 8: the ordinary payload fell from 118,220 to 40,191 nodes and from 1,675,465 to 921,701 gzip bytes. Fresh-scan directory walks fell from about 6.1 to 2.0 seconds; total scan time still varied with Git. The first image search on the final build took 1.384 seconds, with no image content read. See P7 measurements and limits (see the source checkout Docs/). Refresh an existing browser tab to load this client change.

## Report browsing and recovery

PDF and HTML files have their own searchable types. Use `pdf:`, `html:`, or `image:` to narrow filenames; search shows the actual match total, a path for every result, and Load 200 More. Fuzzy matching and document-content search remain backlog items.

PDFs use the browser's native iframe viewer, with Open and Download when the browser cannot render them. HTML previews resolve companion files through a signed directory route; nested `charts/`, scripts, styles, fonts, and JSON work within that directory. Parent-directory escapes and root-relative assets are not supported. HTML/SVG responses enforce a sandbox even when opened directly; signed preview URLs expire on server restart, so bookmark the stable Hub link instead.

Document links retain heading fragments, and Copy Hub Link preserves the selected heading. Old `#Projects/...` links still work; section destinations use `#<encoded-file-id>?heading=<encoded-heading>`.

A search has its own route too, so Back returns to the results you came from rather than the
document you were on before them. Searching sets `#?q=<encoded-query>`, adding `scoped=1` when the
project-scope chip is on and `limit=<n>` once Load 200 More has been used; both are omitted at their
defaults to keep the URL short. Entering a search pushes one history entry and refining the query
replaces it, so typing does not add an entry per keystroke. A `limit` outside 200-20000 is clamped
rather than honoured. Because the query lives in the URL, a set of results is now a link you can
share or bookmark.

A failed refresh leaves the current page visible with a stale-data message and Retry. SSE reconnects also retry after a startup failure. File modification times now participate in the change signature, including same-size edits. `/api/health` exposes walk/Git/assembly/serialization/gzip timing fields under `lastScan.timings`.

The September 8 work passed 52 tests plus 11 live HTTP checks and a browser verification pass that confirmed nine acceptance criteria in Chrome. Narrow-pane layout and connection recovery are still unverified. See the P7 shipping record (see the source checkout Docs/) for exact coverage and remaining work.

## Bookmarks and recents

**How to use them: `../Docs/BOOKMARKS.md` (see the source checkout Docs/).** What follows is how they work.

`#pins` sits between the Explorer header and the tree, holding two lists — manually pinned **Bookmarks** and an automatic 20-item **Recent**. Both start collapsed on every load; that state is deliberately not persisted, so a stored pin cannot make the startup sidebar noisier than it was before the feature existed.

The list logic is pure and lives in `navigation.mjs` (`parseList`, `toggleBookmark`, `renameBookmark`, `moveBookmark`, `pushRecent`, `resolveBookmarks`) so it is tested without a DOM; `index.html` owns the sidebar and the wiring. Three entry points — the document header's star button, the tree context menu, and `Ctrl+D` — all route through one `togglePin()`, so the button's `aria-pressed`, the menu label, and the sidebar cannot disagree. `Ctrl+D` prefers the tree's keyboard cursor over the open document.

`#pins` has its own `contextmenu` listener reusing `showCtxMenu()`, so pinned rows offer the same actions as tree rows. Rename dispatches a `dblclick` at the row's label rather than growing a second editor.

Storage is `localStorage`, two keys, `{path, label, addedAt}` and nothing else — no server component, no per-user server state, and no document contents. `parseList()` distrusts what it reads: a corrupted or older-format value returns an empty list rather than throwing, and duplicate paths collapse to one row.

Every scan re-resolves bookmarks against `S.byId`. A missing path is dimmed and kept, never dropped, because a temporarily unreadable folder must not silently eat pins; where exactly one node in the same root shares the basename, a single relink offer appears, and nothing is repointed automatically. `pinExists()` also asks `pictureNodes.owns()`, so a bookmarked photo that is legitimately unloaded is not called a dead link, and nothing is marked missing before the first scan lands.

Recent excludes `DIRISH` kinds, so folders you pass through do not fill it.

Rows are disambiguated in two tiers. `pinContext()` climbs the parent chain and stops at the first `repo` **or** scope-root ancestor, so one walk yields both cases: a file deep in a repo reports its repo, anything else reports its project or shared root. It renders right-aligned and dim, and is suppressed when it merely repeats the label. A path the scan does not hold — unresolved, or a Pictures node not yet loaded — has only its own parent folder to offer, so it falls back to that. Only when label *and* context still collide does the name itself pick up its parent folder, which is the two-READMEs-in-one-repo case; three `Agents` rows in three projects need no such help. That replaced an earlier collision-only rule that qualified names the context already distinguished, and it avoids keeping a hardcoded list of generic filenames.

Renaming swaps the label for an input in place rather than calling `prompt()`, which would block the whole page.

The search box is also a proper combobox as of the same day: `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`, and one `syncCombobox()` that assigns row ids at sync time so the arrow keys walk the document and Pictures listboxes as one contiguous sequence.

Together the September 8–9 work passes **64 tests** plus the live HTTP and browser checks recorded in the P7 shipping record (see the source checkout Docs/).

## Folder list view

`viewFolder()` renders either cards or a four-column list — name, type, modified, size — chosen by a toggle in the folder header and remembered per browser in `hub.folderview`. Cards stay the default and are unchanged; the list is flat by design, since splitting it into titled groups is what the card view is for.

Columns sort by click, and **folders come first only for the name and type sorts**. Sorting by modified or size means the key *is* the question, and burying the file you edited a minute ago under seven month-old folders is the opposite of the answer. A folder's size column shows its child count, or `unopened` for a lazy Pictures node whose children have not been fetched.

**Modified times are fetched per folder, not scanned into the payload.** `mtime` is deliberately non-enumerable on scanned nodes (`stampNode`), because a timestamp on all ~40,000 of them is exactly the weight the Pictures pass spent itself removing. `folderStamps()` reads one directory's immediate children — no recursion, no file contents — and `/api/stat` returns it keyed by **name**, since the client already holds the ids and repeating the folder prefix per row is the same waste at a smaller scale. The endpoint goes through the same `resolveId()` gate as every other path-addressed route: 403 outside the roots or inside a secret directory, 404 for anything that is not a readable directory.

The client caches one response per folder and invalidates the whole cache when a new scan lands, so a timestamp can never outlive the scan it was read under; a reply arriving after that invalidation is dropped rather than repopulating it, the same rule the Pictures cache follows. Measured on a 1,250-entry folder: **39 ms and 47 KB** for the stat call, **zero long tasks and 0 ms total blocking** for the render.

## Reader tools

A long README is a document, not just a file. `viewFile()` gives markdown five things, all in the panel header except print, which is a document-level action and lives with the header buttons.

| Tool | How it works |
|:---|:---|
| **Outline** | Built from the headings that actually rendered, so it can never disagree with the document. Clicking one scrolls and writes the same `?heading=` route a cross-document link would reach, so the two cannot drift. |
| **rendered / source** | Mirrors the HTML preview tabs. Source is `?raw=1` on `/api/file`, honouring the note left when `raw` was removed from every reply — it was 44% of the bytes of a large README. Session state, like `S.htmlMode`. |
| **Copy buttons** | One per `pre.code`, appended to the rendered block so it copies exactly what is on screen. Hidden until hover or focus. |
| **Width and size** | `↔` cycles full → 82ch → 64ch, `A` cycles 100 → 112 → 125 → 90%. Both set CSS variables on the `.md` container. The measure is a `ch` unit, so it tracks the text size rather than fighting it. |
| **Print** | A `@media print` block that hides every bit of chrome and prints the document in black on white. |

Two placement details. The measure applies to `.md > *`, not `.md`: the panel chrome stays full width, and a wide table or code block is held to the measure and scrolls inside it — both already carry `overflow-x`, so nothing is clipped. And width and size persist (one `hub.reader` key holding two **names**, not indexes, so a stored value cannot silently mean something else when either list changes), while the source toggle and the outline are per-session — the same split the HTML preview tabs already use.

## Image browsing

Image cards carry a thumbnail, and the viewer has real controls: **fit / 100% / − / +** zoom, the image's natural dimensions, **prev / next** through the images in the same folder with a `3 of 1250` counter, and left/right arrow keys.

Thumbnails are `loading="lazy"` and `decoding="async"` — native lazy loading is the whole mechanism, so there is no observer to write or get wrong. Measured on a 1,250-image folder: **40 fetched, 32 KB, zero blocking**. They use `object-fit:contain`, because these folders hold as many icons and diagrams as photos and a thumbnail that crops the subject out of frame is worse than one with space around it.

> **ponytail:** the browser downscales the full file rather than a generated thumbnail. A real thumbnail cache needs an image decoder, which this zero-dependency server has not got. Revisit only if a folder of very large originals actually feels slow.

Zoom is session state shared across images, so flipping through a folder at 100% stays at 100%; `null` means fit, which is what the viewer has always done. Arrow keys only apply while an image is open and neither the tree nor the search box has focus — both already own the arrow keys — and `Alt`+arrow stays Back/Forward.

### The SVG sandbox, and why images were blank

Building this surfaced a **pre-existing defect from P7-06** (2026-09-08). SVG is active content, so `/api/raw` gave it the report sandbox CSP — but a `sandbox` directive puts the response in an opaque origin, and Chrome then refuses to decode it inside an `<img>` at all: a blank box, `naturalWidth === 0`, and **no error event to catch it**. That silently broke every SVG preview and every SVG embedded in a markdown document for a day, and it is why the first thumbnail pass rendered 1,250 empty frames.

The fix negotiates on `Sec-Fetch-Dest`, which the browser sets and page script cannot forge: a request whose destination is `image` gets the hub's ordinary strict CSP, because the HTML spec already disables scripting for SVG loaded as an image, so the sandbox buys nothing there. **Every other destination — document, iframe, object, empty, or absent — keeps the sandbox**, which is the case P7-06 was actually about. Failing closed on a missing header keeps a non-browser client sandboxed. A regression covers all six destinations.

## Scan status detail

`● scanned 09:32` was the whole story, and a green `ready` sat on top of nineteen read errors without a word. Clicking the status line (or pressing Enter on it — it is a real button) opens a panel with the numbers behind it: last successful scan and its age, duration, node count and gzipped payload, the walk/git/assemble/serialize/gzip split from `lastScan.timings`, the mounted projects, the Pictures state, and the read errors.

**The read errors are the point.** A count is not actionable, so `noteReadError()` keeps the last twelve failing paths with their errno — bounded, deduplicated by path, and paths only, never content. `/api/health` exposes them as `readErrorPaths` with relative ids, and any that is still in the tree is clickable straight to the document. `readErrors++` now exists in exactly one place, which a regression pins so a future call site cannot go back to a bare increment. On this workspace the panel immediately named what the count had been hiding: `EISDIR` and `ENOENT` under `~/.gemini/skills/`.

The panel reuses the context menu's floating layer wholesale — same element bookkeeping, same dismissal on Escape, outside click, scroll, resize and blur — so there is only ever one floating layer, and opening a tree context menu replaces it.

**The indexing text was also wrong.** "only docs and config are indexed" predated PDF, HTML-report and image support and understated `DOC_FILE` badly. Folder pages now say *"N other files here that the index skips — see what's indexed"*, and that phrase opens the panel's **What gets indexed** section rather than pointing nowhere. A regression asserts the panel's file-type list still matches `DOC_FILE`, so the replacement cannot rot into a new lie.
