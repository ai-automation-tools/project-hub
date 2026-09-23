<a id="changelog-top"></a>

<h1 align="center">📝 Changelog</h1>

<p align="center"><em>What changed, newest first, one line per meaningful change.</em></p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-Documentation-6B7280?style=for-the-badge" alt="Back to Documentation"></a>
</p>

---

Why each change was made, and how it was measured, lives in the [roadmap](ROADMAP.md).
This file is the short version. Every item ticked in [P9](ROADMAP.md#p9) adds a line here
in the same commit, tagged *(roadmap: P9-NN)*.

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
