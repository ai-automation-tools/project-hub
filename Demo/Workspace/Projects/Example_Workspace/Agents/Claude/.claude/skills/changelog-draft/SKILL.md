---
name: changelog-draft
description: Turn the commit range since the last tag into changelog lines a user could read, dropping anything that only matters to the people who wrote it.
---

# Changelog draft

A commit log is not a changelog. Most of it is internal.

## Keep

Behaviour a user can observe: a new capability, a changed default, a fixed bug they
could have hit, a removed feature.

## Drop

Refactors, test changes, dependency bumps with no user-visible effect, CI edits,
and anything whose subject line starts with `chore`.

## Shape

One line per change, present tense, leading with the thing that changed rather than the
verb. Group under Added / Changed / Fixed / Removed. No commit hashes — nobody clicks them.
