# Reconciliation

Every number that enters this workspace is checked against a second source before it is
treated as true. There are no exceptions, including for sources that have never been
wrong.

## The shape

1. Pull from the system of record.
2. Pull the same window from the secondary source.
3. Compare on the natural key, not on the row count.
4. Anything unmatched is quarantined and reported. It is never dropped, and it is never
   silently corrected.

## Why not just trust the primary

Because the failure is not the primary being wrong — it is the primary being *late*.
A window that looks complete and is not produces a clean reconciliation against nothing,
which is the one failure mode that never raises an alert.
