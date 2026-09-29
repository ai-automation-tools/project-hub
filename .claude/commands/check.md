---
description: Pre-commit gate — tests, demo build, and a public-hygiene scan of the diff
allowed-tools: Bash(npm test), Bash(node Demo/build-demo.mjs), Bash(git diff *), Bash(git status *)
---

Run from the repo root, stop at the first failure and report it:

1. `cd Hub && npm test` — all tests must pass.
2. `node Demo/build-demo.mjs` — must finish without an `expected Nx … found M` assertion; report the captured-response count (CI requires > 100).
3. `git diff HEAD` and `git status --short` — flag any added line containing a real machine path, personal name, email, hostname, or credential-shaped token (this repo is public), any new file under `Projects/` other than `_example/`, and any new dependency in `Hub/package.json`.

End with one line: `ready to commit` or what blocks it.
