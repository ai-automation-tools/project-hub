# index.html — the map

Roughly 3,700 lines, in this order. Section banners are `// ── name ───` comments; find your
way by those rather than by line number, which moves.

| Region | Holds |
|:---|:---|
| `<head>` | Placeholders, the pre-paint theme script (with the one-time `hub.design` move), Inter + JetBrains Mono from Google Fonts |
| `<style>` | `:root` radii, easing and derived tokens, nine `data-theme` variable blocks, then explorer, then main. Nothing else defines a colour |
| helpers | `$`, `el`, `activate`, `mark`, `tintOf`, `fmtSize`, `fmtAgo`, `toast` |
| data | `reindex`, `load`/`doLoad`, `showFatal` |
| bookmarks | `pins`, `savePins`, `togglePin`, `pinSection`, `renderPins` — list logic in `navigation.mjs` |
| activity bar | `SIDE_VIEWS`, `sideView`, `setSideView` — `#app[data-side]` picks Explorer (`#tree`), Bookmarks / Recent (`#pins`), Favorites (`#webmarks`) or Settings (`#settings`) |
| settings | `prefs`, `renderSettings`, the `#set-*` handlers, import/export via `favorites.mjs` |
| favorites | `web` (sync), `fav` (manual), `loadWebmarks`, `ensureFavorites`, `saveFavoriteList`, `renderWebmarks`, `editable`, `favForm`, `favIcon` + `iconFallback`, `followLink` — tree logic in `favorites.mjs` |
| hub tabs | `tabs`, `openSite`, `activateTab`, `closeTab`, `renderTabs` — `#tabs` strip, `#frames` host, `/api/frameable` first |
| embed labels | `checkFrameable` (queue of 4, urgent jumps it), `watchEmbed` + `embedObserver`, `placeLabel` — **↗ browser** on favorites and Live Sites cards |
| sidebar | `renderTree`, `focusNode`, context menu, `showStatusPanel` |
| header | `renderCrumbs`, the search box, rail + width + theme controls, keyboard handlers |
| views | `renderView` → `renderPage` → one `view*` per kind |
| reader | `READ_WIDTHS`, `READ_SCALES`, outline, `loadDoc` |
| images | `viewImage`, `imageSiblings`, zoom |
| search | `viewSearch`, `syncCombobox` |
| live | `watch()` — EventSource, `change` and `pictures` events |

## The views

| Function | Draws |
|:---|:---|
| `viewPortfolio` | The multi-workspace landing page |
| `viewOverview` | A project root: repo table with git state, stat strip, artifact shelves, drafts |
| `viewCli` | One agent runtime — project scope and the user scope it inherits, side by side |
| `viewRepo` | A repo card: README, agent doc, git state, children |
| `viewEntity` | One skill / command / agent / hook / style / routine |
| `viewFolder` | The fallthrough. Grid or list (`hub.folderview`), mtimes from `/api/stat` |
| `viewDocFirst` | A node's README, with a "show the folder instead" escape that sets `S.docOff` |
| `viewFile` | md (rendered/source), config, plain file, html (preview/source), pdf |
| `viewImage` | One image, zoom levels, arrow-key stepping through siblings |
| `viewSearch` | Hits over `S.index`, scoped or global, `hitLimit` paging, Pictures appended async |

## Keyboard

| Keys | Does | Guard |
|:---|:---|:---|
| `Alt`+`←`/`→` | Back / forward | — |
| `←`/`→` | Previous / next image | Only with an image open, and not while the tree or an input has focus |
| `↑`/`↓`, `Enter` | Walk and open search hits | In `#q`; the pair is a real combobox (`aria-activedescendant`) |
| `Esc` | Clear the search, close the context menu | — |
| `Ctrl`/`Cmd`+`D` | Pin the tree cursor, else the open document | Overrides the browser's own bookmark dialog |
| Arrows in `#tree` | Tree navigation | `#tree` has its own handler |

Any new global key handler must bail on `INPUT`/`TEXTAREA`/`SELECT` and on `#tree` focus.
The image handler is the worked example.

## Framed content

`/api/preview` (HTML reports) is framed with `sandbox="allow-scripts allow-forms
allow-modals allow-popups"` and **no `allow-same-origin`** — an opaque origin, no access to
the hub's DOM, cookies or storage whatever the artifact's own script attempts. The matching
`REPORT_CSP` is in `reports.mjs`. Assets relative to the report are served through
`/api/artifact/<hmac-token>/…`, a capability scoped to that one directory and invalidated
at every server restart. **Do not add `allow-same-origin` to make a report "work better."**

## Persisted-preference rule

A stored preference records a **name**, not an index — `hub.reader` holds `{width:'normal',
scale:'112%'}`. A stored index silently means something else the moment either list changes.
Follow that shape for anything new.

## What may leave the file

Only a plain ES module the Node suite imports directly:

- `navigation.mjs` — `routeHash`/`parseRoute`, `searchHash`/`parseSearch`, `filterSearchPool` (the root and type chips), `documentTarget`,
  `markdownLink`, `includeInSearch`, `absolutePath`, and the bookmark/recent list logic
  (`parseList`, `toggleBookmark`, `renameBookmark`, `moveBookmark`, `pushRecent`,
  `resolveBookmarks`, `RECENT_MAX`).
- `pictures-client.mjs` — `PictureNodes`, the async Pictures branch.
- `reports.mjs` — server-side, but the other half of the framing contract above.
- `favorites.mjs` — pure tree edits and the bookmarks HTML format, imported by the page and by `favorites.test.mjs`. It must stay in `build-demo.mjs`'s copy list. A name the page imports must not also be declared in the page (a test checks this; `folderList` is imported as `favoriteFolders`).

If the extraction would not gain a test, it does not gain anything.
