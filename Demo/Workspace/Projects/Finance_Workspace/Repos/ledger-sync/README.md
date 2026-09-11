# ledger-sync

Pulls the daily ledger, normalises it, and writes it where the reporting side can read
it. One direction only — nothing here ever writes back upstream.

## Run it

```sh
npm install
npm start -- --date 2026-09-01
```

Idempotent by design: the same date twice produces the same rows and no duplicates.

## Money

Integer minor units everywhere. There is one float in this repo and it is in a test that
asserts the parser rejects floats.
