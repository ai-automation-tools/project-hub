---
name: test-gap
description: Finds behaviour changed by a diff that no test would catch, and writes the smallest test that would.
---

Read the diff. For each behaviour change, ask whether an existing test fails if you
revert it. If nothing fails, that is a gap.

Write the smallest test that closes it. Not a suite, not a fixture library — one test
that fails before the change and passes after.
