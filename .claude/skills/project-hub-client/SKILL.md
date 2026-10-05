---
name: project-hub-client
description: >-
  Work on Project Hub's interface — the single-file client in `Hub/index.html`: the
  `renderPage()` kind→view dispatch, the nine `data-theme` blocks and the CSS-variable
  contract every surface colour comes from, the `S` state object and `reindex()`, hash
  routes via `navigation.mjs`, the localStorage keys, and the `%TITLE%`/`%FAVICON%`/
  `%PORT%`/`%NONCE%` placeholders the server fills per request. Use for "add a view / a
  page / a panel", "add a colour scheme or theme", "restyle the explorer", "the page is
  blank / stuck on scanning", "deep links or the back button are broken", "bookmarks and
  recents", "the activity bar, Settings, Favorites or hub tabs", "the reader, outline or
  view-source toggle", "a button does nothing after a rescan", "CSP blocked my script", and
  any edit to index.html, navigation.mjs, pictures-client.mjs or favorites.mjs.
---

# Working in index.html

**The interface is one 3,700-line file on purpose and it stays that way.** No build step, no
bundler, no framework — the hub's whole promise is `node hub.mjs` and a browser. An edit
that needs a toolchain is the wrong edit.

Only genuinely reusable, genuinely testable logic leaves the file, and only into a plain
ES module the Node test suite can import: `navigation.mjs` (routes, bookmarks, recents,
path resolution), `pictures-client.mjs`, `favorites.mjs` (favorites tree edits and the
bookmarks-file format), `reports.mjs`. That is the bar — **"it would be
tidier in its own file" is not.**

---

## 1. Adding a view

`renderPage()` is the whole router, in order:

```js
if (S.query)                                   return viewSearch(page);
const n = S.byId.get(S.sel) || S.byId.get(defaultRootId());
if (n.kind === 'projects')                     return viewPortfolio(page, n);
if (n.docFirst && n.doc && !S.docOff.has(n.id)) return viewDocFirst(page, n);   // opens on the README
if (n.kind === 'root')                         return viewOverview(page, n);
if (n.kind === 'cli')                          return viewCli(page, n);
if (n.kind === 'repo')                         return viewRepo(page, n);
if (ENTITY.has(n.kind))                        return viewEntity(page, n);
if (n.kind === 'image')                        return viewImage(page, n);
if (['md','config','file','html','pdf'].includes(n.kind)) return viewFile(page, n);
return viewFolder(page, n);                     // the fallthrough, and usually the right answer
```

**Order matters.** `docFirst` sits above every kind branch, so anything that documents
itself opens on its README; roots and CLI runtimes never set the flag because their own
pages are the reason to click them. A kind with no branch lands in `viewFolder` and renders
fine — reach for a new view only when the folder listing is actually wrong.

A new `kind` needs the five client tables kept in step: `TINT`, `ROUND`, `DIRISH`,
`ENTITY`, `KIND_LABEL` — plus the server-side `TINT` in `hub.mjs`. See the
[`project-hub-scan`](../project-hub-scan/SKILL.md) skill.

Every view takes `(page, n)` and appends to `page`. Build with `el(tag, cls, txt)` and
`$(sel)`; use `activate(node, handler, role)` for anything clickable so keyboard and ARIA
come with it. **Never `innerHTML` with scan data** — `textContent`, or `md2html` output
from `/api/file`, which is the only sanitised path.

## 2. Colours are variables, never literals

Nine schemes — `obsidian` (the default since 2026-10-05) `midnight oxide cobalt paper plum
nord sepia mono` — each one block of CSS variables under `html[data-theme="…"]`. The
comment at the top of the sheet is the contract:

> Every surface, text and accent color in the sheet comes from one of these blocks. Adding a
> scheme = copy a block, change the values, add an `<option>` to `#theme`. Nothing else.

So a hard-coded `#38bdf8` anywhere in a rule is a bug in eight themes. Server-side `TINT`
values are `var(--green)`-style strings for exactly this reason: the scan ships variable
names, not colours, and the theme resolves them.

The schemes set colours only. Radii (`--r-sm/md/lg`), the hover curve (`--ease`) and the
derived surface tokens (`--surface`, `--surface-2`, `--line-a`, `--line-b`, `--ink`, `--ok`,
`--glow`, `--grid`) live on `:root`, derived from each scheme's own palette, so a new scheme
gets the shapes for free and overrides a derived token only when it wants to (`obsidian`
makes its surfaces translucent and gives `--ok` its own emerald). **`--green` is the accent;
`--ok` is state** (a clean repo, a live site, the connected dot). Don't colour a state with
the accent.

Two light themes exist (`paper`, `sepia`). **Check both** — a contrast that works on
near-black frequently vanishes on warm white.

> [!TIP]
> The pre-paint `<script nonce="%NONCE%">` in `<head>` reads `hub.theme` before first paint
> so a non-default scheme does not flash the default. It also moves a viewer onto `obsidian`
> once (`hub.design`), because the page stores the scheme on every load and a stored
> `midnight` was never a choice. Anything that must beat first paint goes there and nowhere
> else.

## 3. State, reindex, and why your button stopped working

`S` holds everything: `data`, `byId`, `parent`, `index`, `sel`, `open`, `query`, `sig`.
`reindex(data)` rebuilds the maps; **it runs only when `data.sig !== S.sig`**, and when it
does, every DOM node the previous render produced is discarded.

Consequences, all of which show up as "it worked until the page refreshed itself":

- A closure holding a node object from before a reindex is stale. Hold the **`id`**.
- `doLoad()` returns early when `sig` is unchanged — repainting on every watcher tick would
  blow away scroll and selection for no reason. Pass `{ force: true }` when you genuinely
  changed something locally that the payload does not describe.
- Anything appended asynchronously must re-check `host.isConnected` before touching the DOM.
  The folder list view does this; copy it.
- View-local UI state that must survive a repaint belongs on `S` (`S.mdMode`, `S.htmlMode`,
  `S.repoFilter`, `S.docOff`, `S.hitLimit`), not in a local.

## 4. Routes and per-viewer state

Hash routes come from `navigation.mjs` — `routeHash(id, heading)` / `parseRoute`,
`searchHash` / `parseSearch`. **`go()` writes the hash itself**, so the `hashchange`
listener guards by comparing to `S.sel` rather than tracking a flag. A search URL restores
the query, scope, limit and the root/type chips, not just a document — that is why `syncSearchRoute(replace)`
exists and why `restoredInitialRoute` fires once.

Per-viewer preferences are localStorage, never the scan payload:

| Key | Holds |
|:---|:---|
| `hub.theme` `hub.design` `hub.rail` `hub.sbw` | scheme, the one-time move onto `obsidian`, collapsed sidebar, sidebar width |
| `hub.collapsed` `hub.folderview` `hub.reader` | collapsed sections, grid/list, reader settings |
| `hub.side` `hub.websrc` | active activity-bar view, chosen browser profile for Favorites |
| `hub.zoom` `hub.links` `hub.favsource` | interface size (also read by the pre-paint script), hub tabs on/off, manual or synced favorites |
| `hub.bookmarks` `hub.recent` | paths only — via `navigation.mjs`, which is where the list logic is tested |

Every read and write is wrapped in `try/catch`. Private windows throw on access, and a
throwing preference read must not take the page down.

## 5. The server contract

Four placeholders are substituted per request, and `index.html` is the **only** file served
non-verbatim: `%TITLE%`, `%FAVICON%`, `%PORT%`, and `%NONCE%` (twice). The nonce is why
**every `<script>` in the file must carry `nonce="%NONCE%"`** — CSP is `script-src 'self'
'nonce-…'`, so an inline handler attribute or a new unnonced script is silently dead.
Styles are `'unsafe-inline'`; scripts are not.

`HUB_PORT` is compared against `location.port` before opening the EventSource, so the page
does not try to stream from a static host. On reconnect the client **refetches** rather than
waiting for a `change` event: reconnecting means the server restarted, which is exactly when
the payload changed and no event will ever describe it.

Opening `index.html` over `file://` or a static preview serves the shell but not the API —
`showFatal()` names that case specifically instead of spinning forever. Keep that path
working; it is the first thing a new user hits.

> [!WARNING]
> **`Demo/build-demo.mjs` rewrites exact string literals in this file** and asserts the
> match count. Editing the `/api/raw?path=` / `/api/preview?path=` call sites, the
> `<script type="module">` tag or a placeholder will fail the demo build in CI — which is
> the point. Fix the `sub()` call in the same commit; see the `project-hub-demo` skill.

---

## 6. Checklist

1. **Does the fallthrough already work?** `viewFolder` handles more than you think.
2. New kind → five client tables + server `TINT` + one `renderPage()` branch.
3. Colours from variables only; check `paper` and `sepia`.
4. Clickable → `activate()`. Text → `textContent`. Never `innerHTML` on scan data.
5. Hold ids, not nodes. Durable UI state on `S`. Async appends check `isConnected`.
6. New `<script>` → `nonce="%NONCE%"`.
7. Touched a literal the demo rewrites → update `sub()` in `Demo/build-demo.mjs`.
8. `npm test` from `Hub/` — the byte-level control-character test covers `index.html`, and
   it exists because scripted edits corrupted this file three times.
9. Load the page, rescan, resize the sidebar, follow a deep link, hit back.

## 7. Anti-patterns

- **Adding a build step, a framework or an npm dependency.** Zero dependencies is the product.
- **Splitting index.html "for tidiness."** Extract only what the Node tests will import.
- **A literal colour in a CSS rule.** Seven themes break silently.
- **`innerHTML` with anything from the scan.** `md2html`/`sanitizeHtml` is the only sanitised path.
- **A new inline script without the nonce.** CSP drops it with no visible error.
- **Repainting on every watcher tick.** The `sig` comparison exists to protect scroll and selection.
- **Preferences in the scan payload.** They are per-viewer; they live in localStorage.

---

## Related

| For | See |
|:---|:---|
| Layout, view-by-view notes, keyboard map, extraction rules | [`references/client-map.md`](references/client-map.md) |
| Where a new `kind` comes from, and the API it arrives on | the `project-hub-scan` skill |
| The literals the demo build rewrites in this file | the `project-hub-demo` skill |
