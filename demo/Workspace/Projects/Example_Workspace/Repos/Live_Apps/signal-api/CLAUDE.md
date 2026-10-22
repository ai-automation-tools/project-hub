# signal-api

- Hand-written SQL only. No ORM, no query builder.
- Migrations are frozen once pushed. Add a new one.
- The export pool size is a config value, not a constant. Do not inline it.
- `npm test` before reporting done. The suite needs a live Postgres and that is fine.
