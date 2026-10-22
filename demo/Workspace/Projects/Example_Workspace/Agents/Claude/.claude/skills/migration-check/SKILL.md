---
name: migration-check
description: Verify a pending migration is reversible, non-blocking on a table of production size, and not editing anything already pushed.
---

# Migration check

Three questions, in order. Stop at the first no.

1. **Is it new?** Anything already on `main` is frozen. Adding a column is a new file.
2. **Does it block?** Adding a column with a default rewrites the table on older
   Postgres. Add nullable, backfill in batches, then set the default.
3. **Can it come back?** Every `up` needs a `down` that has actually been run once locally.

## Sizes that matter

`events` is the only table where a rewrite is a visible outage. Anything touching it
gets the batched treatment regardless of how small the change looks.
