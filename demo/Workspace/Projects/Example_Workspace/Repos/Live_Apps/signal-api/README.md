# signal-api

One Node service behind the app. Reads, writes, and the export worker pool — see
`Docs/decisions/0001-single-service.md` in the workspace for why those are not three
services.

## Run it

```sh
npm install
npm run db:migrate
npm start
```

Postgres 16 on `localhost:5432`. No Docker Compose file: one dependency does not need
an orchestrator.

## Layout

| Folder | Contents |
|:---|:---|
| `routes/` | HTTP surface, one file per resource |
| `db/queries/` | Hand-written SQL, one file per query, plan pasted in a comment |
| `db/migrations/` | Numbered, frozen once pushed |
| `workers/` | The export pool and nothing else |
