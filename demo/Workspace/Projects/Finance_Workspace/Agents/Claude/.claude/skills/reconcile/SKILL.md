---
name: reconcile
description: Compare a window from the system of record against the secondary source, quarantine anything unmatched, and report both directions of drift.
---

# Reconcile

Run both pulls for the same window before comparing anything. A window that only exists
on one side is the bug, not a mismatch.

## Report both directions

Rows in the primary with no match, and rows in the secondary with no match. The second
list is the one people forget and the one that catches late arrivals.

## Never

Do not correct. Do not round to make a comparison pass. Do not widen the window to make
an unmatched row disappear — that is how a late feed becomes a silent hole.
