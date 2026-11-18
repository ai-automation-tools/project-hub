# Open questions

## Open

### Should the demo redeploy on every push to `main`, so its build stamp stays `current`?
- Asked: 2026-11-17 by project-hub-roadmap
- Context: The demo page now carries `<meta name="build" content="<sha>">`, and the org's `Get-SurfaceDrift.py` reads it as `current` only when that SHA is `main`'s head. `demo.yml` deploys only on pushes touching `hub/`, `demo/` or `demo.yml`, so every docs, skill-sync or diagram merge leaves it "N commits behind" with an identical page. Options: (a) drop the `paths` filter so every push to `main` rebuilds and redeploys (about a minute of Actions and one Pages deploy per merge); (b) keep the filter, and have the drift check compare against the last commit touching `hub/` or `demo/` (a change in the routines repo, not here); (c) leave it, and read "behind" as "maybe stale". I recommend (a): it is a one-line change and makes the stamp mean what it says. Not done in the run because it changes when the site publishes.
- Answer:

## Answered

### The release gate wants a full-history secret scan that "comes back clean". Should the history be cleaned, or the gate reworded?
- Asked: 2026-10-20 by project-hub-roadmap
- Context: `docs/PUBLIC-RELEASE.md` says early commits still hold the original design files and personal references, and that no history rewrite is planned. A full-history scan will find those, so a run can write `SECURITY.md` and run the scan, but it can't make the result clean. The options: (a) the gate means *no credentials* in history, and personal references are the accepted caveat already written up; (b) rewrite history, or republish from a clean snapshot, which needs a private backup and a force-push only you can do; (c) leave the gate open. I recommend (a): a run writes `SECURITY.md`, scans every commit for credential-shaped tokens, and records what it finds, and the existing caveat stays.
- Answer: (a), Mike, 2026-10-22. The gate means no credentials anywhere in history. Personal references in early commits stay the accepted caveat in `docs/PUBLIC-RELEASE.md`; no history rewrite.
- Applied: 2026-10-27 by project-hub-roadmap
