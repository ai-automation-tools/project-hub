---
name: project-hub-scaffold-mfs
description: >-
  Add a workspace to an existing Project Hub, scaffold a portable installation of
  its zero-dependency Node server and HTML explorer, or match its visual design.
  Use when asked to add a project hub, scaffold a document browser, or give a
  workspace the same live browsable console as an existing Hub installation.
---

# Project Hub scaffold

Reuse an existing Project Hub engine: a local filesystem scanner and vanilla-JS
explorer. Find the checkout containing `Hub/hub.mjs` and `Hub/index.html` from the
user's context; ask for its location only if it cannot be found. Do not reconstruct
the engine from screenshots. Read its README and [config reference](references/config-schema.md).
The engine is the source of truth if this reference has drifted.

## Choose the mode

- **A — add a workspace (default).** Add `Projects/<Name>/hub.config.json` to the
  existing installation. One server scans all projects and shared roots. No new
  port, launcher, engine copy, or hub-switcher entry is needed.
- **B — portable installation.** Use when the project must carry its own engine.
  Copy the complete runtime and tests into `Hub/`, the launcher and example into
  `Project-Hub/`, and create `Projects/<Name>/`. Each machine supplies its own
  ignored configs. Independent copies need their own future engine updates.
- **C — visual match.** For an explicitly static page, read the
  [design system](references/design-system.md) and reuse the actual theme and
  layout from `Hub/index.html`. Explain that scanning, native launch actions,
  previews, and server-backed search require A or B.

## Workflow

1. Inspect the existing server config, project configs, and target folder. Preserve
   existing work. Project display names and folders must be unique; `dir` must
   exist. Choose either repo groups or a path prefix ending in `/`, or omit scope.
2. Run [scripts/scaffold-hub.ps1](scripts/scaffold-hub.ps1) for A or B. It refuses
   existing destinations. A writes only a project config. B copies an allowlist of
   engine files, license, launchers and examples; it never copies scan output,
   credentials, personal configs, screenshots, or design archives.
3. In B, select an available port and `base`; shared roots default to empty. Verify
   the configured port is free before starting. Roots come from configuration and
   user runtimes use the current home directory: do not edit source constants for
   machine paths. The runtime scans supported user-scope agent folders as well as
   configured roots; disclose that scope to the user.
4. Run `npm test` from `Hub/`. Fresh clones validate example shapes without needing
   personal configs; installed configs are checked when present. Separately check
   all configured directories exist. Tests do not prove a port is free or a page works.
5. New project configs are discovered at **startup**. Restart the existing server
   through `Project-Hub/Start-Hub.ps1 -Restart -NoBrowser` when authorized by the
   setup task, then check `/api/health` and `/api/scan`. Use the configured port.
   Never terminate a foreign process to claim a port.
6. Verify the Projects landing page, target workspace, sidebar, search, a rendered
   document, and Back/Forward in a browser. Use a temporary fixture installation
   for script validation; do not start a second scanner over real private roots.
7. Link the skill and setup instructions from the project's README. Keep personal
   roots, ports in instance inventories, and editor wiring in ignored local files.
   Scheduled tasks and workspace auto-start are optional integrations, not actions
   every scaffold should install. Public source publication is separate from
   exposing the local server over a network.

## Helper usage

PowerShell 7; use paths appropriate to the user's machine:

```powershell
# A: mount another workspace in the shared process
./scripts/scaffold-hub.ps1 -HubDesignRoot C:/Tools/ProjectHub `
  -Name Demo -Dir C:/Work/Projects/Demo -RepoScopePathPrefix Repos/

# B: new standalone installation (destination must not exist)
./scripts/scaffold-hub.ps1 -HubDesignRoot C:/Tools/ProjectHub `
  -Name Demo -Dir C:/Work/Projects/Demo -Standalone `
  -TargetDir C:/Tools/DemoHub -Base C:/Work -Port 4400
```

## Current behavior to preserve

Read [current features](references/current-features.md) when extending or checking
an installation. It covers the shared Projects landing page, lazy Pictures,
sandboxed HTML/PDF report reading, search and heading routes, bookmarks and Recent,
folder sorting, Markdown reader tools, help panels, and watchdog behavior.
Read the design reference only for UI work; adding a workspace needs no UI edit.

## Avoid

- Creating `Project-Hub-<Name>` and a separate server per workspace: that is the retired layout.
- Copying only `hub.mjs` and `index.html`: the runtime imports other modules.
- Hardcoding an owner's drive, user profile, scheduled-task name, or project list.
- Committing `hub.config.json`, `scan.json`, logs, or private design exports.
- Claiming current-file sanitization also removes Git history or hosted attachments.
- Claiming browser checks, native launches, or scheduled tasks passed without executing them.
