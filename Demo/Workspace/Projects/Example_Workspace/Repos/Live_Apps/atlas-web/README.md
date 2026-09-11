# atlas-web

The customer-facing app. Next.js, deployed to Vercel on every tag.

Everything visible to a user is rendered here; nothing is computed here. If you find
yourself writing business logic in a route handler, it belongs in `signal-api`.

## Run it

```sh
npm install
npm run dev
```

Point `SIGNAL_API_URL` at a local `signal-api` or at staging. There is no mock server —
a mock that drifts is worse than a slow network call.

## Tests

`npm test` runs unit and component tests. `npm run e2e` needs a running API and is not
part of the default suite on purpose.
