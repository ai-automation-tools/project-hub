---
description: Review the current diff for correctness first, then for anything that could be deleted.
---

Two passes over the current diff.

**Correctness.** What breaks, with the input that breaks it. Nothing speculative — if you
cannot name the failing case, it is not a finding.

**Deletion.** What in this diff does not need to exist: an abstraction with one caller, a
config value that never changes, a helper the standard library already provides.

Report findings ranked by severity. Say so plainly if there are none.
