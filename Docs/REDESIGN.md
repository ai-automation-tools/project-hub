<a id="redesign-top"></a>

<h1 align="center">🎨 Redesign proposal — "obsidian"</h1>

<p align="center"><em>A sleek, dark restyle of the explorer, shown on the hosted demo only. Nothing in <code>Hub/</code> has changed.</em></p>

<p align="center">
  <a href="https://project-hub.ai-automation-tools.dev"><img src="https://img.shields.io/badge/see_it-project--hub.ai--automation--tools.dev-38bdf8?style=for-the-badge" alt="Live demo"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/↩-Documentation-6B7280?style=for-the-badge" alt="Back to Documentation"></a>
</p>

---

## What it is

The landing page at [ai-automation-tools.dev](https://ai-automation-tools.dev) was rebuilt on
2026-10-05 around a `#060606` ground, zinc surfaces, one sky-blue accent, Inter and JetBrains
Mono, rounded cards with a cursor-tracked glow, and a single soft light behind the top of the
page. This proposal brings the hub's explorer in line with it, so the demo linked from that
page and the page itself read as one family.

It ships as a **ninth colour scheme, `obsidian`**, that the demo opens on. Every rule is scoped
to `html[data-theme="obsidian"]`, so **Settings › Color scheme** switches between the proposal
and the current design on the same page, with the same data. Pick `midnight` to see today's
hub; pick `obsidian` to see the proposal. The other seven schemes are untouched.

## What changes

| Area | Today (`midnight`) | Proposed (`obsidian`) |
|:---|:---|:---|
| Ground and surfaces | `#0a0c0e`, flat panels, hairline grid for stat tiles | `#060606` with a faint 24px dot grid behind the content column, one sky glow at the top, translucent zinc surfaces |
| Accent | Terminal green `#5fe3a1` | Sky `#38bdf8`, the colour the landing page already gives project-hub |
| Type | IBM Plex Mono for nearly everything | Inter for headings, buttons, card titles and prose; JetBrains Mono kept for paths, the tree, tables and eyebrows |
| Corners | Square | 6px controls, 8px inputs and search hits, 12px cards and panels |
| Cards | Border lightens on hover | 2px lift, accent border, and a cursor-tracked ring and wash in the accent (the landing page's spotlight) |
| Stat tiles | One strip divided by hairlines | Separate 10px-radius tiles with a 10px gap |
| Repo table | Bordered rows | One rounded block: tinted header, hover-lit rows |
| Filter chips | Square, green outline when on | Pills; the active one inverts to white on black |
| Sidebar | Left accent bar on the selected row, underlined activity tab | Rounded selection pill in a translucent accent, rounded activity tabs, a filled sky `/` mark |
| Header | 42px, square search box | 48px, rounded search with a keycap-style `Ctrl+K`, pill `rescan` |
| Reader | Mono headings, square code blocks | Inter headings with a rule under `h2`, 8px code blocks on `#09090b`, rounded inline code and tables |
| Toast, context menu, hub tabs | Square, green border | Pill toast, 10px-radius menu with a deep shadow, rounded tab buttons |

Not changed: layout, the views, every control and its behaviour, the eight existing schemes, the
`--zoom` knob, the reader settings, keyboard handling, and the print stylesheet.

## Where it lives

| File | Role |
|:---|:---|
| `Demo/static/redesign.css` | The whole proposal: a token block for `obsidian` plus the structural rules, all under `html[data-theme="obsidian"]` |
| `Demo/build-demo.mjs` | Links the Inter and JetBrains Mono fonts and the sheet after the interface's own `<style>`, adds `obsidian` to `THEMES` and the `#theme` select, makes it the default, and nudges a returning visitor onto it once (the page stores its scheme on every load, so without that nudge nobody who had visited before would see it) |
| `Demo/static/demo.js` | Feeds the card spotlight the pointer position as a percentage of the card (zoom-proof); the banner now takes its colours from the active scheme and says which design is showing |

The sheet wins by source order, not by `!important`: its selectors carry the `html[data-theme]`
prefix, which also makes them more specific than anything in the base sheet except the few
rules keyed on an id, and those are restated with the id.

## Adopting it

If the proposal is accepted, porting it into `Hub/index.html` is mechanical:

1. **Tokens.** The `html[data-theme="obsidian"]` block at the top of `redesign.css` becomes a
   ninth block beside the eight in `index.html`, with an `<option>` in `#theme` and an entry in
   `THEMES`. The sheet introduces a handful of tokens the base sheet does not have (`--ok`,
   `--ink`, `--surface`, `--surface-2`, `--line-a`, `--line-b`, `--r-*`, `--ease`, `--glow`); the
   other eight blocks need values for them, or the structural rules need a fallback.
2. **Structure.** Drop the `html[data-theme="obsidian"]` prefix and merge each rule into the
   base rule it overrides. Radii, the Inter/JetBrains Mono pairing and the hover treatments
   then apply to every scheme, which is the intent: the schemes differ in colour, not in shape.
3. **Fonts.** Swap the Google Fonts link from IBM Plex to Inter + JetBrains Mono, and change
   `--mono`/`--sans` in `:root`.
4. **Spotlight.** Move the `pointermove` listener from `demo.js` into the page's module and
   drop the demo-only `sub()` calls from the build. The `sub()` for `</head>`, `THEMES`, the
   pre-paint default and the `#theme` option go away with it.
5. **Scaffold and demo copy lists** are unaffected: nothing new is imported by the page.

Deciding whether `obsidian` replaces `midnight` as the default, or sits beside it, is part of
that step. The accent question is the one real trade-off: `--green` is both the accent and the
"clean / live" state colour in the base sheet, so under `obsidian` a clean repo reads sky-blue.
The landing page keeps a separate `--ok` emerald for that; the port should split the two
tokens in the base sheet.

## Deliberately left out

- **A command palette, a sticky scroll-spy nav and the constellation** from the landing page.
  Those belong to a one-page marketing site; the hub already has a search box, a tree and
  breadcrumbs doing those jobs.
- **Any change to the views or the layout.** P9-37 to P9-42 cover those; a restyle that also
  moved things around would be two proposals in one.
- **Light-scheme variants.** `paper` and `sepia` keep the current shape until the structural
  rules are ported and can be checked on a light ground.

## Seen along the way

Two things the screenshots showed that are not part of the proposal:

- In a current Chromium (headless 140, used for the comparison shots) the page ends about 15%
  short of the window at the default 115% size, leaving a black band under the sidebar and
  content. `#app{height:calc(100vh / var(--zoom))}` divides the zoom out of `100vh`, which was
  right when that comment was written; since Chrome standardised CSS `zoom` the viewport
  units already account for it, so the division now happens twice. `height:100vh` closes the
  gap in that build. Worth checking in the browsers actually in use before changing it.
- A skill's own `SKILL.md` is not captured by the demo build (the reader shows "could not read
  this file"), because the entity node carries no child for it. Unrelated to design.

---

<p align="center"><a href="README.md">← Documentation</a> · <a href="../Demo/README.md">Demo site →</a></p>
