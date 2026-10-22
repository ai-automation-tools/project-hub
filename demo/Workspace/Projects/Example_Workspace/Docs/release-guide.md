# Release guide

A release is a tag on `main` and nothing else. There is no release branch.

## Before you tag

- [ ] `npm test` green in `atlas-web` and `signal-api`
- [ ] Migrations reviewed by someone who did not write them
- [ ] `CHANGELOG.md` updated with the user-visible lines only
- [ ] Staging smoke check passed against the build you are about to promote

## Tagging

```sh
git switch main && git pull
git tag -a v1.4.0 -m "Export scheduling"
git push origin v1.4.0
```

CI builds the tag, runs the suite again, and promotes on green. Nothing promotes on a
branch build, ever.

## Rolling back

Re-promote the previous tag. Do not revert commits on `main` to undo a bad release —
that mixes the history of what was written with the history of what was deployed, and
the second one is what you need at 3am.

## After

Post the tag and the one-line summary in the team channel. If the release changed a
migration, say so explicitly — that is the line people search for later.
