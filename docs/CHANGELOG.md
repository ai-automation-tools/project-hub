<a id="changelog-top"></a>

<h1 align="center">📝 Changelog</h1>

<p align="center"><em>What changed, newest first, one line per meaningful change.</em></p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-Documentation-6B7280?style=for-the-badge" alt="Back to Documentation"></a>
</p>

---

Why each change was made, and how it was measured, lives in the [roadmap](ROADMAP.md).
This file is the short version. Every item ticked in [P9](ROADMAP.md#remaining) adds a line here
in the same commit, tagged *(roadmap: P9-NN)*.

## 2026-10-22

- **Layout**: Adopt the org folder layout. `Demo/`, `Hub/`, `Images/`, `Project-Hub/`, `Projects/`, `Skills/` and `Src/` are now lowercase, and `CLAUDE.md` became `AGENTS.md`, which every agent CLI reads; the new `CLAUDE.md` imports it and keeps only the Claude Code notes. The hub mounts projects from `projects/` and still falls back to `Projects/`, so an existing install on a case-sensitive filesystem keeps working. Links, CI paths, the demo build, the scaffold script and the architecture diagram's citations follow the new names. Paths inside the demo fixture and the hub's own `#Projects/...` routes are unchanged.
- **CI**: A `scaffold copy` job fails when `Skills/project-hub-scaffold/` drifts from the canonical copy on `agent-skills`' `main`. #25's bookmark-groups text had reached only this copy; `agent-skills` #59 brought canonical up to date first.
- **Docs**: Rename the top-level `Docs/` folder to `docs/`, the org layout standard. GitHub paths are case-sensitive, so links written as `docs/...` used to 404. Links in the READMEs and `CLAUDE.md`, the `.gitignore` rules, the CI comments, `scripts/build-diagram.mjs` and the diagram's spec and receipt now point at `docs/`. Mentions of `Docs` folders in scanned workspaces, test fixtures and the demo are unchanged.
- **Docs**: Verify the README quick start from a clean clone, and document what it turned up missing: the `/api/scan-settings` endpoint, the server config's `maxDepth`, and that `npm test` checks that a copied workspace config's `dir` exists. Test counts brought to 96 *(roadmap: Public release)*

## 2026-10-19

- **Docs**: Add a code-pinned [architecture diagram](diagrams/README.md) (Archify): server, scan payload, scanner, `resolveId()` gate, config loader, watcher, native launch, watchdog and demo build, each linked to the lines it describes. `scripts/build-diagram.mjs` builds it, copies it to `project-hub-site` for the homepage's new Architecture section, and `--check` reports drift; CI warns on it.
- Group bookmarks: **+ new group** at the bottom of the Bookmarks sidebar creates one (it stays, empty, until you fill it), or right-click a bookmark → **Move to New Group…** / **Move to ‹group›** / **Remove from Group**, or drag it onto a group. Group headers fold, rename on double-click and ungroup with `×`. A group is an optional `group` name on each stored bookmark, so existing bookmarks load unchanged.
- Fix **Reveal in Explorer** opening Explorer's default folder instead of the row's own: hub paths use forward slashes, which `explorer /select,` ignores, so native launches now get a backslashed Windows path.
- **Docs**: The live demo moves to `project-hub-demo.ai-automation-tools.dev`; `project-hub.ai-automation-tools.dev` is now the project homepage (served from `project-hub-site`). Old demo deep links redirect.
- **Docs**: Move `Docs/ROADMAP.md` onto the lab roadmap standard. Phases 0–4 and P5–P8 are done phases at the top, then a `## 🚦 Public release` gate phase (CI, MIT licence and the live demo ticked; a README check from a clean clone and `SECURITY.md` with a secret scan open), then `## After public release` with the P9 backlog as one checklist, shipped items first and every open item on one line. The audit and shipping record stays at the end of the file under *The record*, one heading level down, so every existing anchor still resolves; its P9 entries are plain ✅ bullets now, so each item is counted once. No items added or dropped beyond the two release gates.
- Allow a workspace to set `maxDepth` (1–32, default 10) for deeply nested documents and images. Increasing one workspace's depth leaves other workspaces, shared libraries and file/security filters unchanged.

## 2026-10-13

- Open the sidebar's context menu from the keyboard: the **ContextMenu** key or **Shift+F10** on a focused tree, bookmark or recent row opens it under the row with focus on the first item. Arrows, Home and End walk the items, Tab closes the menu, and Escape closes it and returns focus to the row. The menu now carries `role="menu"` / `menuitem` for screen readers. *(roadmap: P9-05)*
- Add folders to the sidebar from **Settings → Folders** (or **+ folder** in the Explorer header): paste a path, optionally name it, and it mounts at once next to Projects, with no JSON edit and no restart; ✕ removes one. A new `/api/roots` endpoint applies the change live and writes `sharedRoots` back to `hub.config.json`. It only answers a loopback `Host`, so a phone on the tailnet can browse folders but not add them.
- Phone polish, all below 600px or on touch screens only, so the desktop layout is untouched: the sidebar is a drawer over the page (tap the dimmed page to close it; opening a document closes it, a folder keeps it open), tree rows grow to 36px with a tighter indent, the search box uses 16px text so iOS stops zooming in on focus, repo and folder tables keep two columns and search hits wrap, card grids and the search header no longer push the page sideways, controls that waited for a hover are always shown on touch, and the app height follows the visible viewport (`dvh`) so a mobile URL bar no longer hides the bottom.
- Cap the sidebar at half the page width, so on a phone it no longer covers most of the screen. Measured as `%` of the layout, not `vw`, which the interface-size zoom inflates. Below 600px the activity icons tighten to fit.
- Reach the hub from a phone over Tailscale: a new optional `allowedHosts` config key lets the Host check accept exact tailnet names behind `tailscale serve` (patterns and ports are refused at startup; the bind stays loopback). `Start-Hub.ps1` now ignores `tailscaled`'s tailnet-address listener on the same port, and waits for the port to free on `-Restart` instead of a fixed 2 s sleep. Setup guide in [REMOTE-ACCESS.md](REMOTE-ACCESS.md).

## 2026-10-06

- Search inside documents, opt-in: an **inside documents** chip beside the result count lists the Markdown and text files containing the query, ranked by occurrences, each with a snippet. The server builds the index on the first such query, never during a scan, caps it at 64 KB per file and 64 MB in total, and keeps it as raw bytes, so the heap cost is about the index size (51.5 MB for a 7,752-doc tree). New endpoint `/api/content`. *(roadmap: P9-04)*

## 2026-10-05

- Add a Light / Dark switch at the right end of the header (Light = `paper`, Dark = `obsidian`, the same `hub.theme` key as Settings, so a visitor who never clicks it sees no change). `paper` and `sepia` now declare `color-scheme: light`, so their scrollbars and form controls stop rendering dark, and their orange, faintest-text tier and (in `paper`) green are darkened to clear WCAG AA. At phone width the header drops the crumbs and the rescan label so the search and the switch stay on screen.
- Recapture the two public screenshots in the new design from a real hub over the demo fixture, and re-sync the scaffold skill's travel copy and the three maintainer-skill overlays from `agent-skills` (the travel copy had missed the rename to `project-hub-scaffold`).
- Bring the roadmap up to date with the redesign: P7-14's table row no longer says "Blocked" (it shipped as P9-24), the redesign's follow-ups are their own queued items (P9-46 scaffold reference and screenshots, P9-47 the `100vh` / zoom gap, P9-48 a skill's `SKILL.md` in the demo), the never-clicked native-launch check is P9-49 (🔒 Needs Mike), and P9-08, P9-23 and P9-41 describe what is actually in the code today.
- Redesign the explorer in the landing page's idiom: a new default scheme, `obsidian` (near-black ground with a faint dot grid and one sky glow, zinc surfaces, a sky accent), Inter for headings and controls with JetBrains Mono for paths and tables, 6/8/12px radii, stat tiles as separate cards, a rounded repo table, pill filter chips, and cards that lift with a cursor-tracked ring on hover. The eight existing schemes keep their colours and take the new shapes. A clean repo and a live site now use a separate `--ok` green rather than the accent. Everyone is moved onto `obsidian` once (`hub.design`); any scheme picked after that stands. Written up in [`REDESIGN.md`](REDESIGN.md). *(roadmap: P9-45)*

## 2026-10-04

- Find a document despite a typo: when nothing matches a search, results within one or two edits of the name, its stem or one of its words are shown instead, labelled "close to … (no exact match)". Real matches rank exactly as before. *(roadmap: P9-03)*

## 2026-10-03

- Fit windows under 1024px: the sidebar starts on the rail, the search field shrinks, breadcrumbs ellipsize and the document toolbar wraps. *(roadmap: P9-24)*
- Raise dim text to WCAG AA in every theme, cut the type scale to five sizes, let a leftover stat tile fill its row, and default documents to the 82ch reading width.
- Tidy the roadmap: point every older "still open" list at P9 instead of repeating it, drop the stale P7-14 blocker text and the duplicate badges a merge left behind, make the connection-recovery check (P9-25) automatable, and queue the rest of the UI review as P9-37–44. Bring the user manual, engine README and scaffold references in line with the new type scale, contrast tokens, reading width and narrow layout.

## 2026-09-29

- Narrow a search by root and by type: chips for each top-level root and for DOC / HTML / PDF / IMAGE sit under the result count, and ride in the search URL so Back restores them. *(roadmap: P9-02)*
- Bring the docs in line with the new sidebar: the scaffold's layout reference, the privacy notes (browser profiles, favicon and embed requests, `favorites.json`), and what the demo does with Settings, Favorites and hub tabs.

- Pin both new settings to opt-in with a test: links open in a browser tab and Favorites is the hub's own list until a viewer switches them.

- Label favorites and Live Sites cards that can't be shown in a hub tab with **↗ browser**, checked as they scroll into view while hub tabs are on.

- Fix hub tabs sending some embeddable-looking sites to a blank frame: a doubled `X-Frame-Options` header now counts, and error or bot-challenge responses no longer vouch for a site. Name the site in the fallback note, keep it on screen longer, and mark known browser-only favorites with ↗.

- Add a Settings view (gear icon) with the color scheme, interface size, a hub-tabs switch and the favorites source. *(roadmap: P9-32)*
- Make Favorites the hub's own editable list by default, with add, edit, delete, drag, undo, bookmarks-file import and export, and one-time import from a browser profile. Browser sync becomes a setting. *(roadmap: P9-28, P9-33)*
- Open websites in tabs inside the hub when that setting is on, with an embed check that sends sites refusing to be framed to a browser tab. *(roadmap: P9-34)*
- Replace the sidebar's collapsible Bookmarks and Recent lists with a VS Code-style activity bar: Explorer, Bookmarks and Recent become separate views. *(roadmap: P9-26)*
- Add a Favorites view that reads Edge, Chrome and Brave favorites live from the browser profile, with server-resolved favicons. *(roadmap: P9-27)*
- Add `CLAUDE.md` and a committed `.claude/` setup: the three maintainer skills, a `hub-reviewer` agent, a `/check` command and shared permissions.
- Bring the scaffold skill's travel copy back in line with `agent-skills`, and have the scaffold copy `webmarks.mjs`.

## 2026-09-22

- Start this changelog, seeded from merged PRs #1–#5 and the phases in the roadmap. *(roadmap: P9-01)*
- Add P9 to the roadmap: every open item as one weekly checklist.
- Read an owner tier above the `Repos/` groups, so `Repos/<owner>/<group>/<repo>` keeps its group and draft cards. (#5)

## 2026-09-21

- Move the demo's source link into a bar across the top of the page. (#4)

## 2026-09-20

- Keep a repo link on the demo after its intro banner is dismissed. (#3)

## 2026-09-18

- Put the consent banner on the hosted demo, injected at build time, and keep it out of the hub. (#2)

## 2026-09-15

- Link the three maintainer skills that cover this codebase from the README. (#1)

## 2026-09-11

- Run the tests in CI.
- Add a hosted demo at `project-hub.ai-automation-tools.dev`, built from a fixture workspace.

## 2026-09-10

- Rename the repo to `project-hub` and prepare it for a public audience.

## 2026-09-09

- Publish Project Hub as its own repo, with a styled README and demo screenshots.
- Add a fifth shared root, `Links`. *(P8)*
- Land a folder that has a README on that README. *(P8)*
- Add four more color schemes, eight in all. *(P8)*
- Add a sortable folder list view beside the cards. *(P7-09)*
- Add Bookmarks and Recent above the tree. *(P7-10)*
- Add a heading outline, a rendered/source toggle, code copy buttons, reading width and text size, and a print stylesheet. *(P7-12)*
- Add image thumbnails and a real image viewer, and stop the SVG sandbox blanking SVG previews. *(P7-13, P7-06)*
- Make the search box a proper combobox for screen readers. *(P7-15)*
- Open a scan detail panel from the status line, listing the paths behind the read-error count. *(P7-16)*

## 2026-09-08

- Keep Pictures out of the project scans and browse it from its own cache. *(P7-01)*
- View PDFs and HTML files in the pane, and find them with `pdf:` and `html:`. *(P7-02)*
- Repaint an open document when a same-size edit changes it. *(P7-03)*
- Link across documents to headings, and copy a hub URL for any page. *(P7-04)*
- Load an HTML report's sibling images, styles, and scripts. *(P7-05)*
- Sandbox HTML and SVG previews in an opaque origin. *(P7-06)*
- Show accurate search totals, Load 200 More, and a path on every result. *(P7-07, in part)*
- Return clear errors from the open-in-app actions. *(P7-08)*
- Give a search its own route, so Back returns to the results. *(P7-11)*

## 2026-09-07

- Run every project workspace from one process on one port, with a Portfolio landing view. *(P6)*

## 2026-09-03

- Fix four defects from a second audit: wrong root blurbs, the featured-doc list, dead in-page anchor links, and a missing agent runtime. *(P5)*
- Add the HTML viewer and Artifacts shelf, Draft cards, live sites, in-page Back/Forward, and alert callouts. *(P5)*

## 2026-08-31

- Add `/api/health`, a watchdog that restarts a dead hub, sortable repo tables, open in VS Code, and log rotation. *(Phase 4)*
- Build the search index in the browser instead of shipping it, which cut the payload by 43%. *(Phase 4)*
- Make the UI keyboard-navigable, with real URLs, persisted tree state, and better search. *(Phase 3)*
- Rebuild the markdown sanitizer on an allowlist, and add Host and Origin checks. *(Phase 2)*
- Merge three copies of the program into one `Hub/` folder with a config file per hub, and add tests. *(Phase 1)*
- Fix gzip, add a CSP with per-request nonces, and stop the launcher killing a stranger's process. *(Phase 0)*

---

<p align="center"><a href="README.md">← Documentation</a> · <a href="ROADMAP.md">Roadmap →</a></p>

<p align="right"><sub><a href="#changelog-top">back to top</a></sub></p>
