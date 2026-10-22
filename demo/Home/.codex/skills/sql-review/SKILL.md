---
name: sql-review
description: Review a SQL change for index coverage, lock behaviour and reversibility, using the query plan rather than the column names.
---

# SQL review

Three checks, and the first one is the one people skip.

1. **Plan, not names.** A column being indexed does not mean this query uses the index.
   Read the plan.
2. **Locks.** What does this take, for how long, on a table of production size? "It ran
   fast locally" describes a table with a thousand rows.
3. **Down.** Has the reverse migration actually been run, once, by a human?
