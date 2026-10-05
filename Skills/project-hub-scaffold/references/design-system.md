# Design system — extracted from a reference `Hub/index.html`

Everything here is pulled from the live source of the reference `Hub/index.html` this
skill scaffolds against. If you're touching Mode A or B, you don't need this file — you're
reusing the file directly. This is for Mode C (visual-language-only match) and for
understanding what you're looking at when you do touch the shared source.

## Typography

- **Sans:** `Inter` (weights 400/500/600/700), `ui-sans-serif, system-ui, -apple-system,
  'Segoe UI', sans-serif` fallback. Used for page headings (`h1.t`, 26px/650), buttons,
  card titles, repo names in the table, search-hit names, the Settings rows, prose
  (`.md`, 13.5px/1.7) and the reader's headings.
- **Mono:** `JetBrains Mono` (400/500/600), `ui-monospace, 'SFMono-Regular', Menlo,
  Consolas, monospace` fallback. Used for paths, the tree rows, breadcrumbs, badges,
  table cells, tags, code and the uppercase section eyebrows (`h2.sec`, `.cap`).
- Loaded via Google Fonts `preconnect` + a single combined stylesheet request.
- Base body font size `13px`, line-height `1.5`. Section eyebrows are `11px`, uppercase,
  `letter-spacing: .14em` — the smallest, most label-like text on the page; nothing renders
  below `10.5px`.
- Common sizes: `10.5` / `11` / `11.5` / `12` / `12.5` / `13` / `13.5` / `14.5px`, `18px` for
  reader `h2`, `24px` for reader `h1` and stat values, `26px` for the page title. Pick from
  these rather than adding a size.

## Shapes

Radii come from three tokens on `:root`: `--r-sm: 6px` (buttons, tree and list rows,
activity tabs, hub tabs, inputs), `--r-md: 8px` (the search box, search hits, code blocks,
markdown tables and images), `--r-lg: 12px` (cards, panels, boxes). Stat tiles and the repo
table use `10px`; filter chips and the toast are pills (`999px`). `--ease:
cubic-bezier(.2,.7,.2,1)` is the one hover curve. Cards lift `2px` on hover and show a
cursor-tracked ring and wash in the accent (`.card::before` / `::after`, fed `--mx`/`--my` as
percentages by one delegated `pointermove` listener).

## The zoom knob

The whole UI is sized in `px` off one CSS variable: `--zoom: 1.15` on `:root`, applied via
`html{zoom:var(--zoom)}`. Changing that one value rescales everything together. `#app` is
`height:100vh`: since Chrome 128 standardised CSS `zoom` (and in Firefox and Safari), the
viewport units already account for a root zoom, so no correction is needed. The hub used
to divide the zoom back out of `100vh` for older Chrome, which in a current browser left a
band of empty page under the content; that division was dropped on 2026-10-05.

## Color schemes (CSS custom properties)

Nine schemes, selected by `html[data-theme="…"]`, applied before first paint via an
inline `<script>` reading `localStorage.getItem('hub.theme')` so there's no theme flash.
Every color on the page resolves from one of these nine blocks — there is no color
hardcoded outside them. Adding a scheme is: copy a block, change the hex values,
add an `<option>` to `#theme`, add the name to `THEMES`. The schemes differ in colour
only; the shapes, type and hover treatments above are shared.

`obsidian` is the default since 2026-10-05: the ai-automation-tools.dev landing page's
idiom (a `#060606` ground with a faint dot grid and one sky glow, zinc surfaces, sky as
the accent). `midnight` is the previous default, terminal green on near-black.

| Token | obsidian (default) | midnight (dark) | oxide (warm) | cobalt (cool) | paper (light) | plum (dark) | nord (dark) | sepia (light) | mono (dark) |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| `--bg` | `#060606` | `#0a0c0e` | `#0f0d0a` | `#080d14` | `#f7f6f3` | `#0d0912` | `#20242c` | `#f4ecdd` | `#0b0b0b` |
| `--panel` | `#0a0a0c` | `#0c0f12` | `#13100c` | `#0a1018` | `#efeeea` | `#110c17` | `#252a33` | `#ece2d0` | `#101010` |
| `--card` | `#0e0e11` | `#0e1114` | `#17130e` | `#0c131d` | `#ffffff` | `#150f1c` | `#2a303a` | `#fbf5e9` | `#141414` |
| `--fg` | `#e4e4e7` | `#dbe1e8` | `#e8ded0` | `#d4e0ef` | `#2b2f33` | `#e2d9ee` | `#d8dee9` | `#3b3227` | `#dcdcdc` |
| `--fg-max` | `#fafafa` | `#f0f4f8` | `#fbf4ea` | `#f1f6fc` | `#0f1215` | `#f6f2fb` | `#eceff4` | `#1a1510` | `#f7f7f7` |
| `--dim` | `#a1a1aa` | `#8a939e` | `#9f9280` | `#8295ad` | `#565c63` | `#998cb2` | `#afb7c5` | `#5e5344` | `#959595` |
| `--dimmer` | `#8e8e98` | `#7a828c` | `#8c8071` | `#738498` | `#656b72` | `#877b9d` | `#9ca3b0` | `#6c6252` | `#848484` |
| `--green` (accent) | `#38bdf8` | `#5fe3a1` | `#e8b04b` | `#4fd6e8` | `#0f7a4e` | `#c48cf0` | `#8fbcbb` | `#5c6b2f` | `#e0e0e0` |
| `--ok` (state) | `#34d399` | = `--green` | = `--green` | = `--green` | = `--green` | = `--green` | = `--green` | = `--green` | = `--green` |
| `--line` (borders) | `#27272a` | `#22272e` | `#332a20` | `#1e2c40` | `#d4d2cb` | `#2e2340` | `#3c4350` | `#d2c4a8` | `#2b2b2b` |
| `--orange` | `#fbbf24` | `#e0a458` | `#e07b4a` | `#f0b45c` | `#a2670c` | `#f0a06c` | `#d08770` | `#a05a12` | `#b8b8b8` |
| `--purple` | `#a78bfa` | `#b48ce8` | `#c99ae0` | `#a99bf5` | `#6d4bb0` | `#9b8cf5` | `#b48ead` | `#6b4a8c` | `#c9c9c9` |
| `--blue` | `#60a5fa` | `#6aa9f0` | `#7fb3a8` | `#5b9df5` | `#1a5fb4` | `#6fa8e8` | `#81a1c1` | `#2a5f8f` | `#9e9e9e` |
| `--red` | `#f87171` | `#e06c75` | `#e0605a` | `#f0707f` | `#b3261e` | `#ec6f8e` | `#bf616a` | `#a33326` | `#d4d4d4` |
| `--magenta` | `#f472b6` | `#d16ba5` | `#d98ba0` | `#e07ac4` | `#a3358a` | `#f07ad0` | `#c98cb8` | `#93356f` | `#aeaeae` |

Each theme also defines `--card-hi`, `--row-hi`, `--sel`, `--sunken`, `--line-soft`,
`--line-faint`, `--fg-hi`, `--fg-mid`, `--dimmest`, `--green-hi`,
`--green-line`, `--accent-bg`, `--accent-line`, `--blue-bg`, `--blue-line` — read the
live `<style>` block in `index.html` for exact values if you need a token not tabled
here; every one of them follows the same "accent tinted, background near-black/near-white"
formula per theme.

**Derived tokens.** `:root` derives a second set from each scheme's palette, so a scheme
block only sets them when it wants something the derivation can't give: `--surface` /
`--surface-2` (from `--card` / `--card-hi`; card, tile, input and hover fills), `--line-a` /
`--line-b` (from `--line-soft` / `--line`; hairlines and control borders), `--ink` (from
`--bg`; text on a filled accent), `--ok` (from `--green`; the clean repo, live site and
connected-dot colour), `--glow` and `--grid` (9% of `--green`, 4% of `--fg`; the glow and
dot grid behind the content column). `obsidian` overrides the surfaces with translucent
zinc (`rgba(24,24,27,.45)` / `.8`), the lines with `rgba(63,63,70,.55)` / `.85`, `--ink`
with `#09090b` and `--ok` with emerald; `paper` and `sepia` set `--glow` to transparent.

**Text contrast.** `--dim` sits near 5.8:1 and `--dimmer` at 4.6:1 or better against `--bg`,
`--panel`, `--card` and `--card-hi` in every theme, so both pass WCAG AA for text.
`--dimmest` does not, and is for borders, scrollbars and disabled controls only. A new
theme has to clear the same bar.

`--green` is the accent used for links, the selected tree row's translucent pill, focus
rings, badges, solid buttons and the `/` mark — despite the variable name, each theme
repoints it to that theme's own accent hue (sky for obsidian, terminal green for midnight,
amber for oxide, cyan for cobalt, a dark forest green for paper, violet for plum, muted
teal for nord, olive for sepia, and plain white-on-grey for mono). State is `--ok`, not
the accent: a clean repo's dot, a live site's dot and the sidebar's connected dot. The
server's `DOT.clean` ships `var(--ok)` for this reason.

## Layout shell

```
#app (flex row, full viewport height / --zoom)
├── aside            --sbw wide (284px default, drag to resize); folds to a 34px rail via
│   │                #app.rail (Ctrl+B, the «/» toggle, or clicking the active view icon)
│   ├── #activity      VS Code-style view icons: Explorer · Bookmarks · Recent · Favorites,
│   │                  then the Settings gear at the right end; stacks vertically on the rail
│   ├── .ex-head       glyph + view title + "collapse all" (Explorer only) + «/» toggle
│   ├── #pins          Bookmarks or Recent, whichever view is active
│   ├── #webmarks      Favorites: the hub's own list or a synced browser profile
│   ├── #settings      Settings: theme, interface size, hub tabs, favorites source, tools
│   ├── #tree          the scrollable node tree (role="tree") — the Explorer view
│   └── .ex-foot       current file + live/scanning status dot
└── main (flex column, fills remaining width)
    ├── header         48px, fixed height
    │     back/forward · breadcrumbs · search · rescan
    ├── #tabs          hub-tab strip, shown only while a website is open in a hub tab
    ├── #view          the scrollable content pane — everything else renders here
    └── #frames        the hub tabs' iframes, shown in place of #view when one is active
```

- `#app[data-side]` names the active sidebar view, and CSS shows only the matching host,
  so switching views never re-renders the tree.
- The «/» sidebar toggle sits at the right end of `.ex-head`, the one strip the rail keeps,
  so it is always reachable. It stays clear of "collapse all", which folds tree nodes, a
  different action from hiding the panel.
- The header's control order, left to right: **Back/Forward** → breadcrumbs → (grow) →
  search → rescan button. The theme picker moved into the Settings view on 2026-09-29.
- `#view` is the only scrolling container for content; `.page` inside it caps at
  `max-width: 1320px`, centered, with `28px 28px 64px` padding.
- Below `1024px` (`matchMedia`, so root zoom doesn't move it) the sidebar starts on the rail
  without overwriting the stored `hub.rail` choice, the search field shrinks to a `150px`
  floor, breadcrumb ancestors ellipsize ahead of the current page, the document toolbar
  wraps, and `.page` padding drops to `16px 14px 40px`.

## Navigation & history

- Every node has a URL: selecting one writes `#<id>` to the address bar (`location.hash`),
  so any skill/repo/doc is bookmarkable and shareable, and a reload restores it.
- A `hashchange` listener re-renders on Back/Forward, paste, or a hand-edited hash.
- **In-page Back/Forward buttons** (`‹`/`›`) sit in the header next to the sidebar
  toggle, wired to `history.back()`/`history.forward()` — added specifically because the
  browser's own chrome isn't always visible (e.g. VS Code's Simple Browser tab keeps its
  arrows on the *tab* toolbar, above the page). `Alt+←`/`Alt+→` do the same from anywhere
  on the page.
- Breadcrumbs (`#crumbs`) show the current node's ancestor chain; each segment is
  clickable and jumps straight to that ancestor.
- The tree's open branches, the theme, the sidebar collapsed state, and folded `<details>`
  sections all persist in `localStorage` (`hub.open`, `hub.theme`, `hub.rail`,
  `hub.collapsed`) — none of it round-trips through the server.

## Keyboard shortcuts

| Key | Does |
|:---|:---|
| `Ctrl+K` / `⌘K` | Focus the search box |
| `Ctrl+B` / `⌘B` | Show / hide the sidebar |
| `Alt+←` / `Alt+→` | Back / Forward through the hash history |
| `Tab` | Move between focusable controls (roving tabindex in the tree — exactly one row is ever a tab stop) |
| `Enter` / `Space` | Activate whatever is focused |
| `Esc` | Clear the search box |
| `↑` `↓` (tree) | Move between visible rows |
| `→` (tree) | Expand a folder, or step into it if already open |
| `←` (tree) | Collapse a folder, or step out to its parent |
| `Home` / `End` (tree) | First / last visible row |
| `↑` `↓` (search results) | Move the highlighted hit |
| `Enter` (search results) | Open the highlighted hit |

Every clickable element is a real focus target — see the `activate()` helper in
`index.html`, which sets `tabIndex`, a `role`, and the click handler in one place rather
than repeating it at 20+ call sites. `:focus-visible` gets a 2px accent outline. Don't add
a new clickable `<div>` without running it through `activate()`.

## Content kinds and their tint colors

Every tree node and card carries a `kind`, which drives both its dot/badge color (`TINT`)
and its label (`KIND_LABEL`):

| Kind | Tint | Label | Kind | Tint | Label |
|:---|:---|:---|:---|:---|:---|
| `root` | green | (root name) | `skill` | green | SKILL |
| `docroot` | red | (doc root name) | `command` | orange | COMMAND |
| `section` | magenta | SECTION | `agent` | purple | SUB-AGENT |
| `cli` | green | CLI | `hook` | blue | HOOK |
| `group` | blue | GROUP | `style` | magenta | OUTPUT STYLE |
| `repo` | purple | REPO | `mcp` | magenta | MCP |
| `folder` | blue | FOLDER | `userroot` | blue | USER CLIS |
| `routine` | red | ROUTINE | `md` | orange | DOC |
| `config` | blue | CONFIG | `file` | dimmer (gray) | FILE |

`root`, `docroot`, `userroot`, and `repo` render as **round** dots; every other kind
renders as a **rounded-square** dot (6px, 2px radius). Directory-ish kinds (`root`, `docroot`, `userroot`, `repo`,
`cli`, `group`, `section`, `folder`) get a trailing chevron in the tree when they have
children.

## Markdown rendering rules

- Rendered server-side (`md2html()` in `hub.mjs`) and served as HTML via `/api/file`.
- Headings get GitHub-style slug `id`s so in-document anchors (`#some-heading`) resolve.
- YAML frontmatter is parsed for metadata and stripped from the rendered body.
- Fenced code is escaped, never interpreted; inline code is the mono font at `.9em` in an
  accent-tinted 4px-radius chip, code blocks are `12px` on `--sunken` with an 8px radius.
- Raw HTML embedded in a doc (house-style logo heroes, badge rows) is passed through, but
  only after `sanitizeHtml()` tokenizes and rebuilds it against an allowlist — a tag
  survives only if it's on the tag allowlist, an attribute only if it's on that tag's
  attribute list, and every `href`/`src` is scheme-checked (`http`, `https`, `mailto`,
  relative only). This is what lets a README's own logo-hero header render with images
  and centered `<p align="center">` blocks intact, without opening an XSS hole — see
  `references/config-schema.md` for the security model this pairs with.
- Tables render with `display:block; overflow-x:auto` so a wide table scrolls inside
  itself instead of blowing out the page width.
- GitHub-style NOTE/TIP/WARNING callouts render as styled alert boxes; preserve the renderer and theme styles together.

## Cards, tables, and the stat strip

- **Stat strip** (`.stats`) — a wrapping flex row of separate 10px-radius tiles with a
  10px gap (`flex:1 1 140px`, so a leftover tile fills its row) (runtimes / repos / skills /
  commands / sub-agents / MCP servers / uncommitted). Each tile with a `link` is
  clickable and scrolls to + flashes the matching section heading (`jumpTo()`), so the
  strip doubles as a table of contents.
- **Cards** (`.card`, `.cards`) — used for Live Sites and root-doc listings. Fixed
  min-width grid (`repeat(auto-fill, minmax(272px,1fr))` or `minmax(340px,1fr)` for the
  two-column variant), 12px radius on `--surface`, a header row with a colored dot and an
  Inter title, a 4-line-clamped description, and the spotlight hover described under Shapes.
- **Repo table** — one rounded block: a tinted `.thead` with the top corners rounded, rows
  that light on hover, the last row rounding the bottom. Sortable columns, pill filter chips
  (`all` / `needs attention (N)` / one chip per group; the active one inverts to `--fg-max`
  on `--ink`), grid layout `1.5fr .8fr .7fr .7fr 1.6fr`.
- **Foldable sections** — every major page section is a native `<details>` (`.fold`),
  remembered open/closed by heading text in `localStorage.hub.collapsed`, so keyboard
  users and find-in-page get folding for free without custom JS disclosure logic.

Reuse these primitives rather than inventing new card/table shapes — a new section that
doesn't fit `.card`/`.trow`/`.stat` patterns will look like it belongs to a different
product.

## Updates through 2026-10-05

The 2026-10-05 restyle (`obsidian`) changed shapes, type and the default scheme, not
layout or behaviour; see Typography, Shapes and Color schemes above, and the
`project-hub` repo's `Docs/REDESIGN.md` for the full record. The accent and the state
colour are separate tokens since then. The hub moves every viewer onto `obsidian` once on
first load after the change (`hub.design` in `localStorage`); any scheme picked after that
stands.

## Updates through 2026-09-09

The default landing page combines mounted Projects; each project shows stats,
repos, Readmes, Project CLIs, then User CLIs. Header hub switching is retired.
`Ctrl+D` toggles bookmarks; missing pins retain copy actions and disable launch.
Heading routes use `#<encoded-id>?heading=<heading>`; search uses `#?q=<query>` with
optional `scoped=1` and `limit=`. Back restores search results. Reader tools include
outline, source view, copy-code buttons, width/font controls and print. Folder views
switch between cards and sortable lists. HTML/PDF use dedicated previews; Pictures
loads lazily. See [current features](current-features.md) before changing these flows.
