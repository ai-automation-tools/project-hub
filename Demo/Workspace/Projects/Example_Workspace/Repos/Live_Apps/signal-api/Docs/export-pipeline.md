# Export pipeline

Four stages. Each one writes something a human can find afterwards, which is the whole
design.

1. **Enqueue** — a row in `export_jobs`, status `pending`. Synchronous, inside the
   request. If this fails the caller hears about it immediately.
2. **Lease** — a worker claims the row. The lease has a deadline; an expired lease is
   reclaimed rather than retried blindly.
3. **Write** — the artifact goes to object storage under a job-scoped prefix.
4. **Finish** — status `done` and `finished_at`, in the same transaction as the row that
   records the object key.

## Where it actually breaks

Almost always stage 2. The pool is sized for the common case and a single very large
export holds a worker long enough that everything behind it looks stuck. The symptom is
a queue that drains in bursts.

## What we are not doing

No retry-with-backoff on the whole job. A failed export is cheaper to re-request than to
resume, and resume logic is where the interesting bugs live.
