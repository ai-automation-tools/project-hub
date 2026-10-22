<h1 align="center">🌐 Reach it from your phone <sub>(optional)</sub></h1>

<p align="center"><em>Open your own Project Hub from a phone or another laptop, over a private
Tailscale network, with nothing on the public internet.</em></p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-Documentation-6B7280?style=for-the-badge" alt="Back to Documentation"></a>
</p>

---

The hub binds `127.0.0.1` and has no login. This guide does **not** change that. It puts
the loopback port on your own [Tailscale](https://tailscale.com) network with
`tailscale serve`, so every device signed into your tailnet can open it and nothing else
can. One command on the Tailscale side, one config line on the hub side.

> [!IMPORTANT]
> **The network is the login.** Whoever reaches the page can read every document under
> every mounted root, including the **Documents** and **Pictures** shared roots. The
> launch actions in the context menu (open in VS Code, reveal in Explorer) still run on
> the **PC**, not on the phone. On a personal tailnet that is you and your devices. Never
> put the port on a public interface, a LAN you don't control, or a `tailscale funnel`.

## What you get

```
   phone / laptop                       your PC
   ┌───────────┐                        ┌───────────────────────────────────┐
   │  browser  │ ── WireGuard ────────► │ tailscale serve  :4273 (tailnet)  │
   └───────────┘    tailnet only        │        │ loopback, Host preserved │
                                        │        ▼                          │
                                        │ hub.mjs  127.0.0.1:4273           │
                                        └───────────────────────────────────┘
```

Every request the page makes is same-origin (relative `fetch` and the `/api/events`
stream), so the one URL works wherever it is served from. The layout already collapses to
phone width.

## Prerequisites

- The hub running at `http://127.0.0.1:4273/` on the PC ([user manual](../project-hub/README.md#run-it)).
- Tailscale installed and signed in to the **same account** on the PC and the phone
  (`winget install Tailscale.Tailscale` on Windows; the app store on the phone).

## Setup

**1. Find the PC's tailnet name.**

```powershell
tailscale status --json | ConvertFrom-Json | % { $_.Self.DNSName }
# my-pc.tailnet-name.ts.net.
```

**2. Let the hub answer to that name.** Add `allowedHosts` to the server config
(`project-hub/hub.config.json`) — the full MagicDNS name and the short one, lowercase, no
port, no trailing dot:

```json
"allowedHosts": ["my-pc", "my-pc.tailnet-name.ts.net"]
```

Then restart: `./Project-Hub/Start-Hub.ps1 -Restart -NoBrowser`.

Why this step exists: the hub refuses any request whose `Host` header is not loopback,
which is what stops DNS-rebinding attacks. `tailscale serve` forwards the browser's
`Host` unchanged, so without this line every tailnet request gets
`403 unexpected Host header`. The list takes exact names only — a wildcard or a port is
rejected at startup — so the guard stays as tight as it was.

**3. Publish the port on the tailnet.**

```powershell
tailscale serve --bg --http=4273 http://127.0.0.1:4273
tailscale serve status
```

The config persists in `tailscaled` across reboots.

> [!IMPORTANT]
> **Use `--http=`, not the short form.** `tailscale serve --bg 4273` implies TLS, and on a
> tailnet without HTTPS certificates it **hangs forever** instead of failing. Plain HTTP
> here is still WireGuard-encrypted device to device; the browser just can't tell, so it
> says "Not secure".

**4. Disable key expiry for the PC.** [Admin → Machines](https://login.tailscale.com/admin/machines)
→ the PC → **Disable key expiry**. Node keys expire after 180 days by default, and when the
PC's does, the URL silently stops answering.

**5. Open it on the phone:** `http://my-pc.tailnet-name.ts.net:4273`. Add it to the home
screen.

> [!NOTE]
> **`serve`, not `funnel`.** `serve` publishes to your tailnet; `funnel` publishes to the
> **public internet** — a page with no login over your files. Don't.

## Keeping it up

- **Nothing to re-run after a reboot.** The serve entry persists, and the
  [watchdog](../project-hub/README.md#health-and-the-watchdog) restarts a dead hub within
  15 minutes. Tailscale forwards to whatever is listening on loopback.
- **`Start-Hub.ps1` ignores the tailnet listener.** `tailscaled` holds the same port
  number on the tailnet addresses; the launcher only treats a loopback listener as the
  hub or a squatter.
- **Several apps on one PC** each get their own port. `tailscale serve status` lists them.
- **To turn it off:** `tailscale serve --http=4273 off`, and remove `allowedHosts`.

## Optional: HTTPS

Enable **HTTPS Certificates** under [Admin → DNS](https://login.tailscale.com/admin/dns),
then re-publish on the same port:

```powershell
tailscale serve --http=4273 off
tailscale serve --bg --https=4273 http://127.0.0.1:4273
```

`allowedHosts` needs no change — the Host is the same name. The trade-off: issuing a
certificate publishes the machine name to public Certificate Transparency logs.

## Troubleshooting

| Symptom | Cause / fix |
|:---|:---|
| `unexpected Host header "…" - this hub only answers to loopback` | That name is missing from `allowedHosts`, or the hub was not restarted after adding it. The message prints the exact name to add (without the `:port`). |
| `404 page not found`, plain text | `tailscale serve` itself: you opened the tailnet **IP**. Use the MagicDNS name. |
| `502`, empty body | Serve is fine, the hub is down. `curl http://127.0.0.1:4273/api/health` on the PC, then `Start-Hub.ps1`. |
| Hub fails to start: `allowedHosts must be lowercase hostnames…` | An entry has a port, wildcard, capital letter or trailing dot. |
| Works on the PC, not on the phone | `tailscale status` on the PC: the phone reads `offline` when its client is asleep. Open the Tailscale app once. A `curl` on the PC proves nothing. |
| Worked for months, then stopped | Node key expiry. Re-authenticate the PC and disable expiry. |
| The URL changed by itself | The device name follows the OS hostname. Renaming the PC renames the URL — update `allowedHosts` too, or pin the name in the admin console. |

## Security checklist

- [ ] The hub still binds `127.0.0.1`. Nothing was changed to `0.0.0.0` "to make it work".
- [ ] `allowedHosts` holds only your own tailnet names.
- [ ] The port is published with `serve`, never `funnel`.
- [ ] You know a lost phone stays on the tailnet until you remove it in Admin → Machines.
- [ ] Nobody else is on the tailnet — or you accept they can read every mounted root.

---

<p align="center"><a href="README.md">← Documentation</a> · <a href="../project-hub/README.md">User manual →</a></p>
