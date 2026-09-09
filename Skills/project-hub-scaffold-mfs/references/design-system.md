# Design system — extracted from a reference `Hub/index.html`

Everything here is pulled from the live source of the reference `Hub/index.html` this
skill scaffolds against. If you're touching Mode A or B, you don't need this file — you're
reusing the file directly. This is for Mode C (visual-language-only match) and for
understanding what you're looking at when you do touch the shared source.

## Typography

- **Mono:** `IBM Plex Mono` (weights 400/500/600), `ui-monospace, Consolas, monospace`
  fallback. Used for nearly everything: tree rows, badges, breadcrumbs, code, tags,
  section captions.
- **Sans:** `IBM Plex Sans` (400/500/600), `ui-sans-serif, system-ui, sans-serif`
  fallback. Used for body text (`.md p`, card descriptions) only.
- Loaded via Google Fonts `preconnect` + a single combined stylesheet request.
- Base body font size `13px`. Section captions (`.cap`) are `9.5px`, uppercase,
  `letter-spacing: .13em` — the smallest, most label-like text on the page.

## The zoom knob

The whole UI is sized in `px` off one CSS variable: `--zoom: 1.15` on `:root`, applied via
`html{zoom:var(--zoom)}`. Changing that one value rescales everything together. `#app`
divides `100vh` back out of it (`height:calc(100vh / var(--zoom))`) because Chrome does
**not** shrink the initial containing block to match a root `zoom`, so without that
correction the page runs ~15% past the bottom of the viewport. Reproduce both halves
together if you borrow this pattern — the zoom alone, without the height correction,
breaks scrolling.

## Color schemes (CSS custom properties)

Four schemes, selected by `html[data-theme="…"]`, applied before first paint via an
inline `<script>` reading `localStorage.getItem('hub.theme')` so there's no theme flash.
Every color on the page resolves from one of these four blocks — there is no color
hardcoded outside them. Adding a fifth scheme is: copy a block, change the hex values,
add an `<option>` to `#theme`.

| Token | midnight (default) | oxide (warm) | cobalt (cool) | paper (light) |
|:---|:---|:---|:---|:---|
| `--bg` | `#0a0c0e` | `#0f0d0a` | `#080d14` | `#f7f6f3` |
| `--panel` | `#0c0f12` | `#13100c` | `#0a1018` | `#efeeea` |
| `--card` | `#0e1114` | `#17130e` | `#0c131d` | `#ffffff` |
| `--fg` | `#dbe1e8` | `#e8ded0` | `#d4e0ef` | `#2b2f33` |
| `--fg-max` | `#f0f4f8` | `#fbf4ea` | `#f1f6fc` | `#0f1215` |
| `--dim` | `#79838f` | `#8e806d` | `#70859e` | `#6d757d` |
| `--green` (accent) | `#5fe3a1` | `#e8b04b` | `#4fd6e8` | `#0f7a4e` |
| `--line` (borders) | `#22272e` | `#332a20` | `#1e2c40` | `#d4d2cb` |
| `--orange` | `#e0a458` | `#e07b4a` | `#f0b45c` | `#a2670c` |
| `--purple` | `#b48ce8` | `#c99ae0` | `#a99bf5` | `#6d4bb0` |
| `--blue` | `#6aa9f0` | `#7fb3a8` | `#5b9df5` | `#1a5fb4` |
| `--red` | `#e06c75` | `#e0605a` | `#f0707f` | `#b3261e` |
| `--magenta` | `#d16ba5` | `#d98ba0` | `#e07ac4` | `#a3358a` |

Each theme also defines `--card-hi`, `--row-hi`, `--sel`, `--sunken`, `--line-soft`,
`--line-faint`, `--fg-hi`, `--fg-mid`, `--dimmer`, `--dimmest`, `--green-hi`,
`--green-line`, `--accent-bg`, `--accent-line`, `--blue-bg`, `--blue-line` — read the
live `<style>` block in `index.html` for exact values if you need a token not tabled
here; every one of them follows the same "accent tinted, background near-black/near-white"
formula per theme.

`--green` is the accent used for links, the selected tree row's left border, focus rings,
badges, and the terminal-green identity of the default theme — despite the variable name,
each theme repoints it to that theme's own accent hue (amber for oxide, cyan for cobalt,
a dark forest green for paper).

## Layout shell

```
#app (flex row, full viewport height / --zoom)
├── aside            284px fixed, collapses to 0 via #app.rail (Ctrl+B / the «/» toggle)
│   ├── .ex-head       glyph + "Explorer" label + "collapse all"
│   ├── #pins          collapsed Bookmarks and Recent lists
│   ├── #tree          the scrollable node tree (role="tree")
│   └── .ex-foot       current file + live/scanning status dot
└── main (flex column, fills remaining width)
    ├── header         42px, fixed height
    │     sidetoggle · back/forward · breadcrumbs · search · theme · rescan
    └── #view          the scrollable content pane — everything else renders here
```

- The sidebar toggle lives in the **header**, not the sidebar itself, so it stays in a
  fixed spot regardless of collapsed state, and stays clear of the explorer's own
  "collapse all" (which folds tree nodes, a different action from hiding the panel).
- The header's control order, left to right: sidebar toggle → **Back/Forward** →
  breadcrumbs → (grow) → search →
  theme picker → rescan button.
- `#view` is the only scrolling container for content; `.page` inside it caps at
  `max-width: 1200px`, centered, with `22px 24px 48px` padding.

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
renders as a **square** dot. Directory-ish kinds (`root`, `docroot`, `userroot`, `repo`,
`cli`, `group`, `section`, `folder`) get a trailing chevron in the tree when they have
children.

## Markdown rendering rules

- Rendered server-side (`md2html()` in `hub.mjs`) and served as HTML via `/api/file`.
- Headings get GitHub-style slug `id`s so in-document anchors (`#some-heading`) resolve.
- YAML frontmatter is parsed for metadata and stripped from the rendered body.
- Fenced code is escaped, never interpreted; inline code and code blocks use the mono
  font at `11.5px`.
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

- **Stat strip** (`.stats`) — a responsive grid of tiles (runtimes / repos / skills /
  commands / sub-agents / MCP servers / uncommitted). Each tile with a `link` is
  clickable and scrolls to + flashes the matching section heading (`jumpTo()`), so the
  strip doubles as a table of contents.
- **Cards** (`.card`, `.cards`) — used for Live Sites and root-doc listings. Fixed
  min-width grid (`repeat(auto-fill, minmax(272px,1fr))` or `minmax(340px,1fr)` for the
  two-column variant), a header row with a colored dot, and a 4-line-clamped description.
- **Repo table** — sortable columns, filter chips (`all` / `needs attention (N)` / one
  chip per group), grid layout `1.5fr .8fr .7fr .7fr 1.6fr`.
- **Foldable sections** — every major page section is a native `<details>` (`.fold`),
  remembered open/closed by heading text in `localStorage.hub.collapsed`, so keyboard
  users and find-in-page get folding for free without custom JS disclosure logic.

Reuse these primitives rather than inventing new card/table shapes — a new section that
doesn't fit `.card`/`.trow`/`.stat` patterns will look like it belongs to a different
product.

## Updates through 2026-09-09

The default landing page combines mounted Projects; each project shows stats,
repos, Readmes, Project CLIs, then User CLIs. Header hub switching is retired.
`Ctrl+D` toggles bookmarks; missing pins retain copy actions and disable launch.
Heading routes use `#<encoded-id>?heading=<heading>`; search uses `#?q=<query>` with
optional `scoped=1` and `limit=`. Back restores search results. Reader tools include
outline, source view, copy-code buttons, width/font controls and print. Folder views
switch between cards and sortable lists. HTML/PDF use dedicated previews; Pictures
loads lazily. See [current features](current-features.md) before changing these flows.
