# Roadmap

What's left before the export pipeline can take the large-account traffic. Ticked items
shipped; the rest are in rough order.

## Export pipeline

- [x] Job-scoped object prefixes, so a failed write never clobbers a finished one
- [x] Lease deadlines, with expired leases reclaimed instead of retried blindly
- [x] `finished_at` written in the same transaction as the object key
- [x] Bound the worker pool from config
- [ ] Split exports over 50,000 rows into chunks so one job can't hold a worker for minutes
- [ ] Show queue depth and the oldest pending job on the status page

## Rate limits

- [x] Per-key fixed window on `GET /signals`
- [ ] Sliding window for the export endpoints, where bursts are the normal case
- [ ] Return `Retry-After` on every 429, not only on the export routes

## Docs

- [x] Export pipeline write-up
- [ ] Runbook for a stuck queue: what to look at first, and what not to restart
