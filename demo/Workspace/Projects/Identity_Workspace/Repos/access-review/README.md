# access-review

Reads group membership from the directory, joins it against the grant log, and reports
what has no live justification.

```sh
npm install
npm start -- --scope production
```

Read-only against every system it touches. It has no credential that can change anything,
by design — the report is the product.
