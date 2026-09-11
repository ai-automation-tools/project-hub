<h1 align="center">Example Workspace</h1>

<p align="center">
  <em>Product apps, the shared tooling behind them, and the delivery notes that keep the two honest.</em>
</p>

---

Four repos ship from here. `atlas-web` and `signal-api` are the product; `studio-kit`
is the component library both of them pull from; `pulse-digest` is still a draft and
has no remote yet.

## Live sites

| App | Subdomain | Status | Stack |
|:---|:---|:---|:---|
| Atlas | [atlas.example.dev](https://atlas.example.dev) | live | Next.js · Vercel |
| Signal API | [api.example.dev](https://api.example.dev) | live | Node · Fly.io |
| Studio Kit docs | [kit.example.dev](https://kit.example.dev) | preview | Astro · Pages |

## Working here

Read the repo's own `CLAUDE.md` before changing anything under `Repos/`. Drafts under
`Repos/Draft/` are deliberately un-versioned — promote one by giving it a remote, not
by copying it somewhere else.

## Layout

| Folder | What lives there |
|:---|:---|
| `Agents/` | Per-workspace CLI runtime config — skills, commands, sub-agents, MCP servers |
| `Repos/Live_Apps/` | Anything with a production URL |
| `Repos/Tools/` | Libraries and generators the apps consume |
| `Repos/Draft/` | Pre-repo R&D. No `.git`, no remote, no promises |
| `Docs/` | Architecture notes, release process, decision records |
