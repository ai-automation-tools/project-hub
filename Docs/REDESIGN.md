<a id="redesign-top"></a>

<h1 align="center">🎨 Redesign — "obsidian"</h1>

<p align="center"><em>Shipped 2026-10-05. The explorer restyled in the landing page's idiom, as a new default scheme the other eight share their shapes with.</em></p>

<p align="center">
  <a href="https://project-hub.ai-automation-tools.dev"><img src="https://img.shields.io/badge/see_it-project--hub.ai--automation--tools.dev-38bdf8?style=for-the-badge" alt="Live demo"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/↩-Documentation-6B7280?style=for-the-badge" alt="Back to Documentation"></a>
</p>

---

## What it is

The landing page at [ai-automation-tools.dev](https://ai-automation-tools.dev) was rebuilt on
2026-10-05 around a `#060606` ground, zinc surfaces, one sky-blue accent, Inter and JetBrains
Mono, rounded cards with a cursor-tracked glow, and a single soft light behind the top of the
page. This brings the hub's explorer in line with it, so the demo linked from that page and
the page itself read as one family.

It was first proposed on the hosted demo as a demo-only scheme, and adopted the same day. The
proposal stage is in history; this file records what is in `Hub/index.html` now.

## What changed

| Area | Before | Now |
|:---|:---|:---|
| Default scheme | `midnight`, terminal green on `#0a0c0e` | `obsidian`, sky `#38bdf8` on `#060606` with a faint 24px dot grid behind the content column and one sky glow at the top. `midnight` and the other seven remain in Settings |
| Type | IBM Plex Mono for nearly everything | Inter for headings, buttons, card titles and prose; JetBrains Mono for paths, the tree, tables and eyebrows |
| Corners | Square | 6px controls, 8px inputs and search hits, 12px cards and panels |
| Cards | Border lightens on hover | 2px lift, accent border, and a cursor-tracked ring and wash in the accent |
| Stat tiles | One strip divided by hairlines | Separate 10px-radius tiles with a 10px gap |
| Repo table | Bordered rows | One rounded block: tinted header, hover-lit rows |
| Filter chips | Square, accent outline when on | Pills; the active one inverts |
| Sidebar | Left accent bar on the selected row, underlined activity tab | Rounded selection pill in a translucent accent, rounded activity tabs, a filled accent `/` mark |
| Header | 42px, square search box | 48px, rounded search with a keycap-style `Ctrl+K` |
| Reader | Mono headings, square code blocks | Inter headings with a rule under `h2`, 8px code blocks, rounded inline code and tables |
| Toast, context menu, hub tabs | Square, accent border | Pill toast, 10px-radius menu with a deep shadow, rounded tab buttons |
| State colour | `--green` was both the accent and the clean / live / connected colour | `--ok` carries state; `--green` is the accent. The two differ only in `obsidian` |

Not changed: layout, the views, every control and its behaviour, the `--zoom` knob, the reader
settings, keyboard handling, and the print stylesheet.

## How the schemes share it

The shapes, type and hover treatments are written once, against tokens. Every scheme block
sets its palette as before, and `:root` derives the tokens the restyle introduced from it:

| Token | Derived as | Used for |
|:---|:---|:---|
| `--surface`, `--surface-2` | `--card`, `--card-hi` | Cards, tiles, inputs, hover fills |
| `--line-a`, `--line-b` | `--line-soft`, `--line` | Hairlines and control borders |
| `--ink` | `--bg` | Text on a filled accent (solid buttons, the `/` mark, the badge) |
| `--ok` | `--green` | Clean repo, live site, connected dot |
| `--glow`, `--grid` | 9% of `--green`, 4% of `--fg` | The glow and the dot grid behind the content |
| `--r-sm`, `--r-md`, `--r-lg`, `--ease` | fixed | Radii and the hover curve |

`obsidian` overrides the first five with translucent zinc surfaces and a separate emerald for
`--ok`; the two light schemes set `--glow` to transparent. A new scheme still needs only a
copied block, an `<option>` and a name in `THEMES`.

## Moving everyone onto the new default

The page stores the chosen scheme on every load, so every existing viewer already held
`midnight` without having picked it. The pre-paint script moves a viewer onto `obsidian`
once and records that in `hub.design`; whatever they pick after that stands, `midnight`
included.

## Deliberately left out

- **A command palette, a sticky scroll-spy nav and the constellation** from the landing page.
  The hub already has a search box, a tree and breadcrumbs doing those jobs.
- **Any change to the views or the layout.** P9-37 to P9-42 cover those.
- **New screenshots.** `Images/Public/` still shows the old design; its captions say so.
- **The scaffold skill's design-system reference** (`Skills/project-hub-scaffold-mfs/`) is a
  travel copy of `agent-skills` and still lists IBM Plex and eight schemes. It is updated there
  first, then copied here.

## Seen along the way

Two things the comparison screenshots showed that are not part of this change:

- In a current Chromium (headless 140) the page ends about 15% short of the window at the
  default 115% size, leaving a black band under the sidebar and content.
  `#app{height:calc(100vh / var(--zoom))}` divides the zoom out of `100vh`, which was right
  when that comment was written; since Chrome standardised CSS `zoom` the viewport units
  already account for it, so the division now happens twice. `height:100vh` closes the gap in
  that build. Worth checking in the browsers actually in use before changing it.
- A skill's own `SKILL.md` is not captured by the demo build (the reader shows "could not read
  this file"), because the entity node carries no child for it. Unrelated to design.

---

<p align="center"><a href="README.md">← Documentation</a> · <a href="../Demo/README.md">Demo site →</a></p>
