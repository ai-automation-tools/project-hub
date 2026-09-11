# rate-watch

Polls three rate providers, stores every response, and alerts when they disagree by more
than a threshold.

It does not pick a winner. Disagreement is the output — a service that silently chose one
provider would hide exactly the event this exists to catch.

```sh
npm install
npm start
```
