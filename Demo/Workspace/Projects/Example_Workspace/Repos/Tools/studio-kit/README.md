# studio-kit

The component library both apps consume. Tokens, primitives, and nothing that knows what
a customer is.

## Rules

- A component that needs to know about an API response does not belong here.
- Every colour is a token. There are no hex values in component source.
- A variant is cheaper than a fork. If an app needs a different look, add the variant.

## Build

```sh
npm install
npm test
npm run build
```

The build emits ESM only. There is no CJS output and there will not be one.
