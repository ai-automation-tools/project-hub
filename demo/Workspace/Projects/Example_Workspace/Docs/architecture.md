# Architecture notes

Atlas is a Next.js front end talking to one Node service. There is no message queue,
no cache tier and no second database, and that is a deliberate position rather than a
gap in the diagram.

## Shape

```
atlas-web  ──HTTPS──▶  signal-api  ──▶  Postgres
     │                      │
     └── studio-kit         └── object storage (exports only)
```

## Why one service

Two services would need a contract, a deploy order and a story for partial failure.
One service needs none of those. The moment a second team owns part of this, split it —
until then the seam costs more than it returns.

## What would change the call

- Sustained write volume past roughly 400 req/s on the export path.
- A second consumer of `signal-api` that is not `atlas-web`.
- Any requirement that exports survive an API deploy mid-flight.

## Storage

Postgres 16, one database, migrations in `signal-api/db/`. Object storage holds export
artifacts only — nothing in it is a source of truth, and the bucket can be emptied
without a restore.
