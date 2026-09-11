---
name: export-audit
description: Trace one export job end to end — queue entry, worker lease, object-storage write, and the row that says it finished — and report where it actually stopped.
---

# Export audit

Exports fail quietly more often than they fail loudly. This walks the four places an
export leaves a trace and tells you which one it never reached.

## Steps

1. Read the row in `export_jobs`. If `leased_at` is null the worker never picked it up,
   and the problem is the pool, not the job.
2. Check the worker log for the lease id. No line means the process died mid-lease.
3. List the object-storage prefix. A zero-byte object is a half-written export.
4. Compare `finished_at` against the object mtime. More than a few seconds apart means
   the write and the row are not in the same transaction, which they should be.

## What this does not do

It does not retry anything. Read first, then decide.
