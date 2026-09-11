---
description: Find the slowest query on a path and produce a tuned replacement with its query plan.
---

Given a code path, find every query it issues, time them against the dev database, and
report the slowest one with its analysed query plan.

Then propose one replacement. One — if two changes are both needed, say so and pick the
one to do first rather than bundling them.
