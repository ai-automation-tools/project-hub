# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through
GitHub's [private vulnerability reporting](https://github.com/ai-automation-tools/project-hub/security/advisories/new)
on this repo. Include what you found, how to reproduce it, and the commit you tested.

You'll get an acknowledgement within a week. Once a fix is out, the advisory is published
with credit to you unless you'd rather stay anonymous.

## Supported versions

Project Hub has no releases. Only the latest commit on `main` gets security fixes.

## What's in scope

Project Hub is a local server: it binds to `127.0.0.1` and serves the documents under the
folders its config names to a browser on the same machine. There is no login, so the
loopback boundary and the checks below are the whole defence. Reports that matter most:

- reading a file outside the configured roots, or one the deny list keeps out (folders
  such as `secrets` or `.ssh`, key and certificate files), through any `/api/*` route
- markdown, HTML or a filename in a scanned document that runs script in the hub page,
  past the sanitizer, the CSP nonce or the HTML preview sandbox
- another website, or a page opened in a hub tab, driving the hub: a request that gets past
  the Host and Origin checks, or reaches `/api/open` and launches something
- anything that makes the server answer beyond loopback, or to a Host name that isn't
  loopback or listed in `allowedHosts`

The hosted demo is static files with no server behind it, so it has no paths to reach.
[Public release notes](docs/PUBLIC-RELEASE.md) say what the demo publishes.

## Not in scope

- What someone with your user account can already do. The hub reads what you can read.
- Exposing the hub to a network on purpose. [Remote access](docs/REMOTE-ACCESS.md) covers
  the supported way, over Tailscale.
- Personal references in early commits. They predate the public cleanup and are a known,
  accepted caveat; see [public release notes](docs/PUBLIC-RELEASE.md).

## Secrets

Nothing in Project Hub needs a key. Configs, scans and logs are gitignored. On 2026-10-27 a
full-history scan (gitleaks 8.30.1 over all 100 commits on every branch, plus a pattern
search of every commit's tree) found no credentials.
