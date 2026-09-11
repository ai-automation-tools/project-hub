---
name: schema-diff
description: Diff the migration directory against the live schema and report drift in both directions.
---

# Schema diff

Two failure modes, and they need different fixes.

**Migration not applied** — the file exists, the column does not. Apply it.

**Schema change with no migration** — the column exists, no file creates it. Someone
changed production by hand. Write the migration that reproduces it, then verify the
reproduction is byte-identical before you trust it.
