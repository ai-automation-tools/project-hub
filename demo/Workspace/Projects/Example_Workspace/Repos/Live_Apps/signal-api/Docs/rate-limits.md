# Rate limits

Enforced in the service, per API key, in a fixed window.

| Path | Limit | Window |
|:---|:---|:---|
| `GET /signals` | 600 | 1 min |
| `POST /exports` | 10 | 1 min |
| everything else | 120 | 1 min |

## The honest caveat

The window is per process. With two instances a client gets double the stated limit.
Nobody has hit that in practice, so it stays a known approximation rather than a shared
counter — writing the shared counter means adding Redis, and that is a bigger change
than the problem.
