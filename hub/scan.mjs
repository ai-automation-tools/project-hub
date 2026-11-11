// Project Hub — configuration and the scanner: which roots are mounted, the deny lists,
// resolveId(), the tree walk, git state, and the scan payload. hub.mjs imports it for the
// server; a scan worker thread loads it on its own (see rescan() in hub.mjs), which keeps
// the server, its routes and its watchers off that thread entirely.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { PictureLibrary } from './pictures.mjs';
import { frontmatter, blurb, parseLiveSites } from './markdown.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── configuration ──────────────────────────────────────────────────────────
// Before 2026-08-31 this was three copies of the file differing in four values, which
// meant every fix landed three times -- and a bad edit broke three servers at once.
// Before 2026-09-07 it was one process per project workspace; now it's one process for
// all of them, so the config that used to name ONE project (`dir`/`repoScope`) has split
// in two: this file's own hub.config.json is now just the server's own settings (port,
// title, favicon), and each project it mounts gets its own small config under `projects/`
// (see loadProjectConfig below).
const CONFIG_DEFAULTS = {
  maxDepth: 10,
  name: 'Portfolio', port: 4273, title: '',
  // The workspace drive root. Every id in the tree is a path relative to this, so it is
  // the one value that has to match the machine — it lives in config, not in this file.
  base: '',
  // Roots every project shares (Documents, Pictures, …). Machine-specific: config too.
  sharedRoots: [],
  favicon: { glyph: '/', ink: '#5fe3a1', line: '#2f6b52' },
  // Extra Host names the hub answers to, besides loopback — e.g. the MagicDNS name a
  // `tailscale serve` proxy forwards with. Exact names only; the bind stays 127.0.0.1.
  allowedHosts: [],
  // Icons for the Explorer's top-level folders, set in Settings: { "<node id>": "<icon>" }.
  // Icon names are the hub's built-in folder set (FOLDER_ICONS in index.html).
  folderIcons: {},
};
const PROJECT_DEFAULTS = {
  name: '', dir: '',
  maxDepth: null,
  // Which repos reach that project's overview table. `groups` matches Repos/<group>/
  // names; `pathPrefix` matches the id, for workspaces with no group tier. Neither = all.
  repoScope: {},
};

/** Drive-relative `dir` values, backslashes and all, normalized to one shape. */
function normalizeDir(dir) {
  return dir.replace(/\\/g, '/').replace(/\/$/, '');
}

/** `repoScope.groups` and `repoScope.pathPrefix` are mutually exclusive. */
function validateRepoScope(file, scope) {
  if (scope.groups && scope.pathPrefix) {
    throw new Error(`${file}: set repoScope.groups or repoScope.pathPrefix, not both`);
  }
  return scope;
}

function readConfigJson(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { throw new Error(`cannot read config: ${file}`); }
  try { return JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch (e) { throw new Error(`${file} is not valid JSON — ${e.message}`); }
}

/** Read and validate the server's own hub.config.json (port/title/favicon only). */
export function loadConfig(file) {
  const j = readConfigJson(file);
  if (j.maxDepth !== undefined) validateScanDepth(j.maxDepth);
  if (!j.port) throw new Error(`${file} is missing required key "port"`);
  if (!Number.isInteger(j.port) || j.port < 1024 || j.port > 65535) {
    throw new Error(`${file}: "port" must be an integer 1024-65535, got ${JSON.stringify(j.port)}`);
  }
  if (!j.base) throw new Error(`${file} is missing required key "base" (the workspace drive root, e.g. "D:/Work")`);
  const hosts = j.allowedHosts || [];
  if (!Array.isArray(hosts) || hosts.some((h) => typeof h !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h))) {
    throw new Error(`${file}: "allowedHosts" must be lowercase hostnames without port or wildcard, got ${JSON.stringify(hosts)}`);
  }
  const cfg = {
    ...CONFIG_DEFAULTS, ...j,
    base: normalizeDir(j.base),
    sharedRoots: (j.sharedRoots || []).map((r, i) => {
      if (!r.name || !r.dir) throw new Error(`${file}: sharedRoots[${i}] needs both "name" and "dir"`);
      return { tint: 'var(--dimmer)', ...r, dir: normalizeDir(r.dir) };
    }),
    favicon: { ...CONFIG_DEFAULTS.favicon, ...(j.favicon || {}) },
    // A hand-edited entry the UI couldn't have written is dropped, not fatal: an icon is
    // never worth refusing to start over.
    folderIcons: Object.fromEntries(Object.entries(j.folderIcons && typeof j.folderIcons === 'object' ? j.folderIcons : {})
      .filter(([id, icon]) => { try { validateFolderIcon(id, icon); return icon !== null; } catch { return false; } })
      .slice(0, FOLDER_ICONS_MAX)),
  };
  if (!cfg.title) cfg.title = `Project Hub — ${cfg.name}`;
  return cfg;
}

/** Read and validate one project's hub.config.json under `projects/<name>/`. */
export function loadProjectConfig(file) {
  const j = readConfigJson(file);
  for (const k of ['name', 'dir']) {
    if (!j[k]) throw new Error(`${file} is missing required key "${k}"`);
  }
  if (j.maxDepth !== undefined) validateScanDepth(j.maxDepth);
  return {
    ...PROJECT_DEFAULTS, ...j,
    dir: normalizeDir(j.dir),
    repoScope: validateRepoScope(file, j.repoScope || {}),
  };
}

// ── folders added from Settings ────────────────────────────────────────────
// A root added in the UI is a sharedRoots entry like any other: validated here, written
// back to the config file, and mounted live by the server. Tints come from a fixed list
// because the value reaches a style attribute.
export const ROOT_TINTS = ['var(--blue)', 'var(--purple)', 'var(--magenta)', 'var(--orange)', 'var(--red)', 'var(--green)', 'var(--dimmer)'];

/** Check a folder someone asked to mount. Returns `{ name, dir, tint }` or throws a readable reason. */
export function validateNewRoot(input, roots, isDir) {
  const name = String(input?.name ?? '').trim();
  // Explorer's "Copy as path" wraps the path in quotes.
  const raw = String(input?.dir ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!name || name.length > 40 || /[\\/]/.test(name)) throw new Error('Name must be 1–40 characters, without slashes.');
  if (!raw || !path.isAbsolute(raw)) throw new Error('Give the full path to the folder, e.g. D:/Work/Notes.');
  const dir = normalizeDir(path.resolve(raw));
  // Mounting a whole drive would walk all of it on every scan.
  if (!dir || /^[a-z]:$/i.test(dir)) throw new Error('A whole drive is too much to scan. Pick a folder on it.');
  if (dir.split('/').some((s) => SECRET_DIRS.has(s.toLowerCase()))) throw new Error('That folder is on the hub’s deny-list for credentials.');
  if (!isDir(dir)) throw new Error(`No folder at ${dir}.`);
  if (roots.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new Error(`The sidebar already has a folder called ${name}.`);
  if (roots.some((r) => r.dir.toLowerCase() === dir.toLowerCase())) throw new Error('That folder is already in the sidebar.');
  return { name, dir, tint: ROOT_TINTS.includes(input?.tint) ? input.tint : 'var(--blue)' };
}

/** Rewrite only `sharedRoots` in the config file, keeping every other key; atomic. */
export function writeSharedRoots(file, roots) {
  const j = readConfigJson(file);
  j.sharedRoots = roots.map(({ name, dir, tint }) => ({ name, dir, tint }));
  fs.writeFileSync(file + '.tmp', JSON.stringify(j, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

export function validateScanDepth(value) {
  if (!Number.isInteger(value) || value < 1 || value > 32) {
    throw new Error('maxDepth must be an integer 1–32.');
  }
  return value;
}

// ── folder icons set from Settings ─────────────────────────────────────────
// The id is only ever a key in this map -- nothing reads a path from it -- and the icon is
// a name the page looks up in its own built-in set, so neither reaches the filesystem or
// the DOM as markup.
export const FOLDER_ICONS_MAX = 100;

/** Check one `{ id, icon }` change. `icon: null` clears the folder's icon. */
export function validateFolderIcon(id, icon) {
  if (typeof id !== 'string' || !id || id.length > 300 || /[\u0000-\u001f\u007f]/.test(id)) throw new Error('Unknown folder.');
  if (icon !== null && (typeof icon !== 'string' || !/^[a-z0-9-]{1,40}$/.test(icon))) throw new Error('Unknown icon.');
  return { id, icon };
}

/** Rewrite only `folderIcons` in the config file, keeping every other key; atomic. */
export function writeFolderIcons(file, icons) {
  const config = readConfigJson(file);
  if (Object.keys(icons).length) config.folderIcons = icons;
  else delete config.folderIcons;
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

/** Null removes a workspace override; preserve every other config field. */
export function writeScanDepth(file, value) {
  if (value !== null) validateScanDepth(value);
  const config = readConfigJson(file);
  if (value === null) delete config.maxDepth;
  else config.maxDepth = value;
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : null; };

// The config file's own folder is the hub's directory: scan.json is written there, and
// Start-Hub.ps1 already points its logs at it.
const CONFIG_FILE = path.resolve(argOf('--config') || path.join(HERE, 'hub.config.json'));

// Running hub.mjs as a program without a config is a hard error -- that is the
// misconfiguration worth shouting about. Importing it (hub.test.mjs does) gets inert
// defaults instead, so the pure functions can be tested without a workspace.
// A worker thread sees the parent's argv[1], so it would pass the URL check too.
export const IS_MAIN = isMainThread && Boolean(process.argv[1]) && new URL('./hub.mjs', import.meta.url).href === pathToFileURL(process.argv[1]).href;
// This module, loaded on its own on a worker thread to run scans (see rescan() in hub.mjs).
// It needs the config and projects; the server and watchers live in hub.mjs.
const SCAN_WORKER = !isMainThread && workerData?.hubScanWorker === true;
const CONFIG = (IS_MAIN || fs.existsSync(CONFIG_FILE))
  ? loadConfig(CONFIG_FILE)
  : { ...CONFIG_DEFAULTS, name: '(not configured)' };
const HUB_DIR = path.dirname(CONFIG_FILE);

/**
 * Every project this hub mounts, found by scanning `projects/<name>/hub.config.json`
 * next to this hub's own config folder -- adding a project is a folder and a config,
 * the same property the old three-hubs-one-codebase design already relied on, just
 * redirected at a project config (no port: it names a root this ONE process mounts,
 * not another process to reach) rather than another whole hub instance.
 */
export function projectsDir(root) {
  // `Projects/` was the folder's name before 2026-10-22; installs on a case-sensitive
  // filesystem may still use it.
  const dir = path.join(root, 'projects');
  return fs.existsSync(dir) ? dir : path.join(root, 'Projects');
}

function discoverProjects() {
  const dir = projectsDir(path.dirname(HUB_DIR));
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const cfgFile = path.join(dir, e.name, 'hub.config.json');
    if (!fs.existsSync(cfgFile)) continue;
    const project = loadProjectConfig(cfgFile);
    Object.defineProperty(project, 'configFile', { value: cfgFile });
    out.push(project);
  }
  return out;
}
const PROJECTS = IS_MAIN || SCAN_WORKER ? discoverProjects() : [];

// Every project workspace gets its own root; Documents, Pictures and the rest are shared
// by all of them. They are machine paths, so they come from `sharedRoots` in the hub's
// config rather than being listed here — see project-hub/hub.config.example.json.
//
// A shared root may sit physically inside another one (Links inside Documents): mount it
// anyway, MOUNTED_ROOTS below prunes it from the parent's walk so it appears once rather
// than twice with colliding ids. A dot-prefixed dir (one hidden from an editor's
// indexer, say) likewise has to be its own root — the walker skips dot-dirs.
const SHARED_ROOTS = CONFIG.sharedRoots;
const BASE = CONFIG.base;
const ROOTS = [
  ...PROJECTS.map((p) => ({ name: p.name, dir: p.dir, repoScope: p.repoScope, tint: 'var(--green)' })),
  ...SHARED_ROOTS,
];
// Any root that nests inside another root: the walker must not descend into it, or the
// subtree is indexed twice under two different parents with the same ids.
const MOUNTED_ROOTS = new Set(ROOTS.map((r) => r.dir.toLowerCase())); // dirs are already forward-slash (normalizeDir)

// User-scope agent config. These live outside the project roots but hold most of the
// shared skills/agents/commands since the 2026-08-23 consolidation, so the hub is
// blind to the real setup without them. Each runtime declares only the sub-dirs worth
// walking — `~/.claude` also holds sessions, caches and 400MB of plugin checkouts.
const HOME = os.homedir().replace(/\\/g, '/');
const USER_RUNTIMES = [
  {
    name: 'Claude Code', dir: `${HOME}/.claude`,
    dirs: ['skills', 'agents', 'commands', 'output-styles', 'hooks', 'rules', 'routines'],
    files: ['README.md', 'settings.json', 'statusline.mjs'],
    mcp: `${HOME}/.claude.json`, plugins: `${HOME}/.claude/plugins/installed_plugins.json`,
    hooksFile: `${HOME}/.claude/settings.json`, hooksFormat: 'json',
    note: 'User-scope Claude Code config — skills, sub-agents, commands and MCP servers shared by every project on this machine.',
  },
  {
    name: 'Codex', dir: `${HOME}/.codex`,
    dirs: ['skills', 'rules', 'prompts', 'plugins'],
    files: ['AGENTS.md', 'config.toml'], mcp: `${HOME}/.codex/config.toml`,
    hooksFile: `${HOME}/.codex/config.toml`, hooksFormat: 'toml',
    note: 'User-scope Codex CLI config — global AGENTS.md, skills, rules and MCP servers from config.toml.',
  },
  {
    name: 'Gemini', dir: `${HOME}/.gemini`,
    dirs: ['skills', 'extensions', 'commands'],
    files: ['GEMINI.md', 'settings.json'], mcp: `${HOME}/.gemini/settings.json`,
    hooksFile: `${HOME}/.gemini/settings.json`, hooksFormat: 'json',
    note: 'User-scope Gemini CLI config — global GEMINI.md, skills and extensions.',
  },
  {
    name: 'Agents (shared)', dir: `${HOME}/.agents`, dirs: ['skills'], files: [],
    note: 'Vendor-neutral ~/.agents skills — the cross-runtime pile any AGENTS.md-aware CLI can read.',
  },
  {
    name: 'OpenCode', dir: `${HOME}/.config/opencode`,
    dirs: ['skill', 'command', 'agent'], files: ['opencode.jsonc'],
    mcp: `${HOME}/.config/opencode/opencode.jsonc`,
    // No hooksFile: OpenCode hooks are JS/TS plugin exports, nothing declarative in
    // opencode.jsonc to read -- see the note above readHooksJson.
    note: 'User-scope OpenCode config.',
  },
  {
    // `~/.gemini/antigravity-cli` is mostly session state -- brain/, conversations/,
    // presence/, cache/, log/ -- the same shape ~/.claude.json was excluded for above.
    // Only builtin/skills (the shipped skill set) and mcp_config.json are worth walking;
    // `plugins/` holds whole vendor repos (google-workspace-cli) and is left as a folder
    // rather than counted, same call already made for Gemini's `extensions/`.
    name: 'Antigravity', dir: `${HOME}/.gemini/antigravity-cli`,
    dirs: ['builtin/skills'], files: ['settings.json'],
    mcp: `${HOME}/.gemini/antigravity-cli/mcp_config.json`,
    // The global hook file is a SIBLING of antigravity-cli/, not inside it --
    // ~/.gemini/config/hooks.json per antigravity.google/docs/hooks. Doesn't exist on
    // this machine yet; SERVE_DIRS below adds that folder so it's servable once it does.
    hooksFile: `${HOME}/.gemini/config/hooks.json`, hooksFormat: 'antigravity',
    note: 'User-scope Antigravity CLI config — built-in skills and MCP servers from mcp_config.json.',
  },
];

// Maps a project CLI folder name (Agents/Claude, Agents/Codex, …) to the user-scope
// runtime it inherits from, so the CLI page can show both. Vendors with no user-scope
// entry (Other/KiloCLI, Specialized) simply have no match and the page shows project only.
const VENDOR_ALIAS = { claude: 'claude code', codex: 'codex', gemini: 'gemini', antigravity: 'antigravity', opencode: 'opencode' };

// Where a project CLI's own lifecycle-hook config lives, one level under its
// Agents/<vendor>/ root -- same per-vendor formats as the user-scope hooksFile/
// hooksFormat above. Gemini's project-scope equivalent isn't confirmed, and OpenCode
// has none, so both are absent rather than guessed.
const PROJECT_HOOK_SOURCES = {
  claude: [
    { rel: '.claude/settings.json', format: 'json' },
    { rel: '.claude/settings.local.json', format: 'json' },
  ],
  codex: [{ rel: '.codex/config.toml', format: 'toml' }],
  antigravity: [{ rel: '.agents/hooks.json', format: 'antigravity' }],
};

const SKIP_DIRS = new Set([
  'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next',
  'target', '.cache', '.pytest_cache', '.ruff_cache', '.turbo', 'coverage',
  '.playwright-mcp', '.svelte-kit', 'vendor', '.gradle', 'bin', 'obj',
]);
// Dot-directories worth walking into; every other dot-dir is pruned.
const DOT_OK = new Set(['.claude', '.codex', '.opencode', '.agents', '.antigravity', '.gemini', '.github', '.cursor']);
const CONFIG_DIRS = new Set(['.claude', '.codex', '.opencode', '.agents', '.antigravity', '.gemini']);
const BUCKETS = { skills: 'skill', commands: 'command', agents: 'agent', hooks: 'hook', 'sub-agents': 'agent',
  skill: 'skill', command: 'command', agent: 'agent', prompts: 'command', 'output-styles': 'style' };
const DOC_NAMES = /^(README|CLAUDE|AGENTS|SKILL|GEMINI|CONTRIBUTING|INDEX)\.md$/i;
// What counts as a document once we are inside a repo. Repos are walked for their
// docs and deliverables, not their source: keeping all 100k+ source files across every
// mounted project would multiply the payload for nodes the search index discards
// anyway (it drops `kind: 'file'') -- measured, on this machine, at ~117,000 additional
// files. Whatever this misses is still counted per folder as `more` and reachable via
// `open folder`. Report outputs (a rendered .html, a .pdf export, chart .pngs sitting
// next to a markdown summary) are exactly what this is meant to show, same as a repo's
// own README -- html/pdf/image extensions are recognized everywhere, not only under an
// artifacts/dashboards/prototypes folder as they were before #31.
export const DOC_FILE = /\.(md|mdx|markdown|txt|rst|adoc|json|jsonc|ya?ml|toml|ini|cfg|conf|csv|pdf|html?|png|jpe?g|gif|svg|webp|avif|bmp|ico)$|^(LICENSE|NOTICE|Dockerfile|Makefile|CNAME)/i;
// Walking repos put real credential stores in reach — Edge-Radar keeps gitignored
// Kalshi keys in `keys/`, and a `.txt`/`.toml` in there matches DOC_FILE. Anything
// indexed is also readable through /api/file, so secrets are pruned by name before
// they can reach the payload. Scoped to repo interiors, which is the reach this
// change added; the rest of the tree keeps the behaviour it always had.
// Files this hub writes itself. They sit inside a scanned root, so without this a log
// line is indistinguishable from a real change to the library. Other tools' logs and the
// temp files an atomic write passes through (`x.md.tmp.36184.2ae4…`) are the same noise:
// on 2026-10-26 they were most of what woke the watcher. The rename that finishes an
// atomic write still fires under the real name.
const NOISE_FILE = /^(hub\.log|hub\.err\.log|watchdog\.log|scan\.json)(\.\d+)?$|\.log(\.\d+)?$|\.tmp(\.[\w.-]+)?$|~$/i;

const SECRET_DIRS = new Set(['keys', 'secrets', '.secrets', 'credentials', 'certs', '.ssh', '.gnupg']);
const SECRET_FILE = /(^|[._-])(secret|secrets|credential|credentials|apikey|api[_-]?keys?)|\.(key|pem|pfx|p12|crt|cer|keystore|jks|asc|ppk)$|^\.env/i;
// The serve-layer subset: key material only, by extension. The name-pattern half of
// SECRET_FILE is fine for pruning a scan but would refuse an innocent doc called
// `secret-scanner.md`, and `.env` has always been viewable from a CLI runtime page.
const CREDENTIAL_FILE = /\.(key|pem|pfx|p12|crt|cer|keystore|jks|asc|ppk)$/i;

const TINT = {
  root: 'var(--green)', docroot: 'var(--red)', section: 'var(--magenta)', cli: 'var(--green)',
  group: 'var(--blue)', repo: 'var(--purple)', folder: 'var(--blue)',
  skill: 'var(--green)', command: 'var(--orange)', agent: 'var(--purple)', hook: 'var(--blue)',
  style: 'var(--magenta)', mcp: 'var(--magenta)', userroot: 'var(--blue)', routine: 'var(--red)',
  md: 'var(--orange)', config: 'var(--blue)', file: 'var(--dimmer)',
};

// ── helpers ────────────────────────────────────────────────────────────────
const posix = (p) => p.replace(/\\/g, '/');
// Ids are relative to the configured workspace base, except user-scope paths which get a
// `~/` prefix — the client and every /api/* path check understand both forms.
const rel = (p) => {
  const q = posix(p);
  if (q.toLowerCase() === HOME.toLowerCase()) return '~';
  if (q.toLowerCase().startsWith(HOME.toLowerCase() + '/')) return '~/' + q.slice(HOME.length + 1);
  return posix(path.relative(BASE, p));
};

/** Absolute path for an id, or null when it points outside anything we serve. */
// ~/.claude.json is deliberately absent: it is 320KB of session telemetry and the MCP
// server names the hub needs are already lifted into the scan payload.
// P9-50: a runtime is served only where the scan walks it -- its declared dirs and files.
// Serving the whole `rt.dir` re-exposed what the walk skips on purpose: ~/.claude/projects,
// ~/.codex/sessions, antigravity-cli/brain. The runtime folder itself stays reachable as
// an exact path (its CLI page opens it and lists its stamps), never as a prefix.
export function runtimeServePaths(runtimes) {
  return {
    dirs: runtimes.flatMap((rt) => [...rt.dirs, ...rt.files].map((p) => `${rt.dir}/${p}`)),
    exact: runtimes.map((rt) => rt.dir),
  };
}
const RUNTIME_SERVE = runtimeServePaths(USER_RUNTIMES);
const SERVE_DIRS = [
  ...ROOTS.map((r) => r.dir),
  ...RUNTIME_SERVE.dirs,
  `${HOME}/.gemini/config`, // Antigravity's global hooks.json -- a sibling of antigravity-cli/
];
// `serveDirs` is read on every call, so roots added or removed in Settings take effect live.
export function createResolveId({ serveDirs, serveExact = [], base, home }) {
  const within = (lo, d) => lo === d.toLowerCase() || lo.startsWith(d.toLowerCase() + '/');
  // The scanner already keeps credential stores out of the tree, but this endpoint is
  // addressed by path rather than by index — a hand-typed /api/file?path=…/keys/… would
  // still read the file. Same deny-list, enforced where the bytes actually leave.
  const denied = (relPath, abs) => posix(relPath).split('/').some((s) => SECRET_DIRS.has(s.toLowerCase()))
    || CREDENTIAL_FILE.test(path.basename(abs));
  function resolveId(id) {
    const abs = posix(id.startsWith('~/') ? path.resolve(home, id.slice(2)) : path.resolve(base, id));
    const lo = abs.toLowerCase();
    if (!serveExact.some((d) => lo === d.toLowerCase()) && !serveDirs.some((d) => within(lo, d))) return null;
    return denied(path.relative(base, abs), abs) ? null : abs;
  }
  // P9-52: resolveId() judges the name it was given; a junction named `notes.md` inside a
  // root can point anywhere. `real()` follows links and judges the target too -- against
  // the lexical roots, or against a root's own real path, so a root that is itself a
  // junction keeps working. A path that doesn't exist comes back as-is for the caller's 404.
  resolveId.real = (id) => {
    const abs = resolveId(id);
    if (!abs) return null;
    let real;
    try { real = posix(fs.realpathSync.native(abs)); } catch { return abs; }
    if (resolveId(real)) return real;
    const lo = real.toLowerCase();
    for (const d of serveDirs) {
      let r;
      try { r = posix(fs.realpathSync.native(d)); } catch { continue; }
      if (within(lo, r)) return denied(path.relative(r, real), real) ? null : real;
    }
    return null;
  };
  return resolveId;
}
const resolveId = createResolveId({ serveDirs: SERVE_DIRS, serveExact: RUNTIME_SERVE.exact, base: BASE, home: HOME });

/** MCP server names out of a Claude/Gemini/OpenCode JSON config or a Codex config.toml. */
function readMcp(file) {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (/\.toml$/i.test(file)) {
      // `[mcp_servers.foo]` / `[mcp_servers."foo-bar"]` — sub-tables like `.env` never match.
      return [...text.matchAll(/^\[mcp_servers\.(?:"([^"]+)"|([\w-]+))\]\s*$/gm)].map((m) => ({ name: m[1] || m[2], detail: '' }));
    }
    // opencode.jsonc allows comments; strip the line ones before parsing.
    const j = JSON.parse(/\.jsonc$/i.test(file) ? text.replace(/^\s*\/\/.*$/gm, '') : text);
    const src = j.mcpServers || j.mcp || {};
    return Object.entries(src).map(([name, v]) => ({
      name,
      detail: v && (v.url || (v.command ? [v.command, ...(v.args || []).slice(0, 1)].join(' ') : v.type)) || '',
    }));
  } catch { return []; }
}

/** User-scope plugin installs from ~/.claude/plugins/installed_plugins.json. */
function readPlugins(file) {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Object.entries(j.plugins || {}).flatMap(([key, list]) => {
      const installs = Array.isArray(list) ? list : [list];
      if (!installs.some((i) => i.scope === 'user')) return [];
      const [name, market] = key.split('@');
      return [{ name, detail: market || '' }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

// Lifecycle hooks (run-a-command-on-event) are declared in config, not as loose
// scripts in a hooks/ folder, so a directory walk alone always misses them --
// confirmed per-vendor 2026-09 against each CLI's own docs, not assumed from
// Claude Code's shape:
//   - Claude Code (developers.anthropic.com)  and
//   - Gemini CLI  (github.com/google-gemini/gemini-cli/docs/hooks/reference.md)
//     both use the SAME settings.json JSON shape: `hooks.EventName[]` ->
//     `{matcher, hooks:[{type:"command", command}]}` -- readHooksJson covers both.
//   - Codex CLI (developers.openai.com/codex/hooks) uses TOML array-of-tables in
//     config.toml: `[[hooks.EventName]]` (+ optional matcher) followed by one or
//     more `[[hooks.EventName.hooks]]` command tables -- readHooksToml.
//   - Antigravity CLI (antigravity.google/docs/hooks) uses a SEPARATE hooks.json,
//     nested hookName -> event -> {matcher, hooks:[...]} -- readHooksAntigravity.
//   - OpenCode has no config-driven hooks at all: its hooks are JS/TS plugin
//     exports (opencode.ai/docs/plugins), nothing in opencode.jsonc to enumerate.
//     There is deliberately no reader for it.

// Two hooks legitimately share one event+matcher (e.g. a secret-leak guard and a
// third-party-push block both on PreToolUse/Bash) -- without a per-hook name they'd
// render as identical rows, indistinguishable except for a description line easy to
// miss. Pull a short label from the command instead: the script it runs, if any.
function hookShortLabel(cmd) {
  const m = cmd.match(/[\\/]([\w.-]+?)\.(ps1|sh|py|mjs|js)\b/i);
  if (m) return m[1];
  const first = cmd.trim().split(/\s+/)[0] || '';
  return first.length > 24 ? first.slice(0, 24) + '…' : first;
}

/** Claude Code / Gemini CLI: settings.json's `hooks.EventName[]` -> {matcher, hooks:[{command}]}. */
function readHooksJson(file) {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = [];
    for (const [event, groups] of Object.entries(cfg.hooks || {})) {
      for (const g of groups || []) {
        const multi = (g.hooks || []).length > 1;
        for (const h of g.hooks || []) {
          const cmd = String(h.command || '').replace(/\s+/g, ' ').trim();
          const base = g.matcher ? `${event} · ${g.matcher}` : event;
          const name = multi ? `${base} — ${hookShortLabel(cmd)}` : base;
          out.push({ id: rel(file), name, desc: cmd });
        }
      }
    }
    return out;
  } catch { return []; }
}

/** Codex CLI: config.toml's `[[hooks.Event]]` (+ matcher) / `[[hooks.Event.hooks]]` (+ command)
 * table pairs. A line-scan rather than a full TOML parser -- this codebase has no TOML
 * dependency and the shape is simple array-of-tables; a multi-line command string won't
 * match, which just means that one row is skipped, not a crash. */
function readHooksToml(file) {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const out = [];
    let event = '', matcher = '', cmdEvent = '';
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^\[\[hooks\.([\w-]+)\.hooks\]\]$/))) { cmdEvent = m[1]; continue; }
      if ((m = line.match(/^\[\[hooks\.([\w-]+)\]\]$/))) { event = m[1]; matcher = ''; cmdEvent = ''; continue; }
      if (cmdEvent) {
        if ((m = line.match(/^command\s*=\s*(['"])((?:(?!\1).)*)\1/))) {
          out.push({ id: rel(file), name: matcher ? `${cmdEvent} · ${matcher}` : cmdEvent, desc: m[2].trim() });
        }
      } else if (event && (m = line.match(/^matcher\s*=\s*"((?:[^"\\]|\\.)*)"/))) {
        matcher = m[1];
      }
    }
    return out;
  } catch { return []; }
}

/** Antigravity CLI: hooks.json's `hookName -> event -> {matcher, hooks:[{command}]}`. */
function readHooksAntigravity(file) {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = [];
    for (const [hookName, events] of Object.entries(cfg || {})) {
      for (const [event, def] of Object.entries(events || {})) {
        for (const h of (def && def.hooks) || []) {
          const cmd = String(h.command || '').replace(/\s+/g, ' ').trim();
          const tag = def.matcher ? `${event} · ${def.matcher}` : event;
          out.push({ id: rel(file), name: `${hookName} · ${tag}`, desc: cmd });
        }
      }
    }
    return out;
  } catch { return []; }
}

function readHooksFrom(file, format) {
  if (format === 'toml') return readHooksToml(file);
  if (format === 'antigravity') return readHooksAntigravity(file);
  return readHooksJson(file);
}

// readHead returns null for every failure alike, so the reason has to be stashed here for
// the caller that records it. Single-threaded and read immediately, so one slot is enough.
let lastReadHeadError = null;
function readHead(file, bytes = 4096, encoding = 'utf8') {
  // The fd must close in a finally: a readSync that throws (file locked, or deleted
  // mid-scan) used to strand it, and the watcher calls this thousands of times a day.
  // That leak is what killed the AI Lab hub with EMFILE after four days up on 2026-08-31.
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString(encoding);
  } catch (err) { lastReadHeadError = err; return null; }   // null = could not read; '' = read fine, file is empty
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

/** The last `bytes` of a file, or null when it can't be read. */
function readTail(file, bytes = 16384) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, n = Math.min(size, bytes);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } catch { return null; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// P9-12: a routine log's last line is usually the email or feedback notice, so the
// result comes from the runner's own markers in the tail. Any [ERROR] means the run
// failed; a [DONE] or a "completed"/exit-0 line means it finished; anything else
// (a cleanup-only run, one still going, an unfamiliar runner) is unknown.
export function routineStatus(tail) {
  if (!tail) return 'unknown';
  if (/^\[[\d:]+\] \[ERROR\]/m.test(tail)) return 'failed';
  if (/^\[[\d:]+\] (\[DONE\]|\[INFO\] (completed (cleanly|with)|exit code: 0\b|Claude exited with code 0\.))/m.test(tail)) return 'ok';
  return 'unknown';
}

/** readHead without holding the event loop: the content index reads ~11k files in one go. */
async function readHeadAsync(file, bytes = 4096, encoding = 'utf8') {
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString(encoding);
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}


// Reading the head of every doc is the dominant cost of a scan -- measured at ~10s over
// ~12k files, against 471ms for the directory walk itself. On a watcher tick essentially
// none of them have changed, so the result is keyed on the file's identity and the read
// is skipped. A changed file gets a new key, so this cannot go stale.
const descCache = new Map();
const DESC_CACHE_MAX = 20000;
// How often a head read failed. The 2026-08-31 EMFILE death showed up here first and
// nowhere else -- every failure was swallowed by readHead's catch. /api/health surfaces it.
let readErrors = 0;
// A count alone is not actionable: "19 read errors" behind a green `ready` tells you
// something is wrong and nothing about what. Keep the most recent handful of paths and
// their errno so the status panel can name them. Bounded, deduplicated by path, and it
// holds paths only -- never file contents.
const READ_ERROR_MAX = 12;
const readErrorLog = new Map();
function noteReadError(file, err) {
  readErrors++;
  const code = err?.code || 'unknown';
  readErrorLog.delete(file);
  readErrorLog.set(file, { code, at: Date.now() });
  if (readErrorLog.size > READ_ERROR_MAX) readErrorLog.delete(readErrorLog.keys().next().value);
}

function describe(file, name) {
  let st;
  try { st = fs.statSync(file); }
  catch (err) { noteReadError(file, err); return { desc: '', fmName: null, fm: {} }; }
  const key = `${file}|${st.mtimeMs}|${st.size}`;
  const hit = descCache.get(key);
  if (hit) return hit;

  const text = readHead(file);
  if (text === null) noteReadError(file, lastReadHeadError);
  const fm = frontmatter(text || '');
  const val = { desc: (fm.description || blurb(text || '') || '').trim(), fmName: fm.name || null, fm };
  // Entries are keyed by mtime, so an actively edited file leaves its old keys behind.
  // Nothing here is worth a real eviction policy; start over when it gets silly.
  if (descCache.size >= DESC_CACHE_MAX) descCache.clear();
  descCache.set(key, val);
  return val;
}

export function kindOfFile(name) {
  if (/\.md$/i.test(name)) return 'md';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.html?$/i.test(name)) return 'html';
  if (/\.(json|ya?ml|toml|ini|env|lock)$/i.test(name) || name.startsWith('.env')) return 'config';
  if (/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(name)) return 'image';
  return 'file';
}

// Pictures is an optional shared root. Without one the library still constructs but is
// never reached: no root means no 'Pictures' node in the tree and no watcher match.
const pictureRoot = SHARED_ROOTS.find((r) => r.name === 'Pictures') || { dir: '' };
const pictures = new PictureLibrary({
  maxDepth: CONFIG.maxDepth,
  dir: pictureRoot.dir, id: pictureRoot.dir ? rel(pictureRoot.dir) : 'Pictures', classify: kindOfFile,
  allow: (name, directory) => directory
    ? !SKIP_DIRS.has(name) && !SECRET_DIRS.has(name.toLowerCase()) && (!name.startsWith('.') || DOT_OK.has(name))
    : !CREDENTIAL_FILE.test(name) && !/^\.env(?:$|\.)/i.test(name),
});

// ── scan ───────────────────────────────────────────────────────────────────
export function scanTree({ projects = PROJECTS, sharedRoots = SHARED_ROOTS, userRuntimes = USER_RUNTIMES } = {}) {
  const repos = [];
  const runtimes = [];
  const flat = [];
  const drafts = [];

  function walk(dir, depth, ctx) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }

    const names = new Set(ents.map((e) => e.name));
    const out = [];
    // Source files skipped by the repo doc-filter, reported to the caller on the
    // returned array so a folder can say "+N other files" instead of "empty folder".
    let hidden = 0;

    for (const e of ents.sort(cmpEnt)) {
      const full = path.join(dir, e.name);
      const id = rel(full);

      // P9-07: a link (a junction too, on Windows) is neither a file nor a directory to
      // readdir. A skill linked in from ~/.agents was walked as a file and read as one
      // (EISDIR), and a dangling link failed its read (ENOENT), once per scan. Follow a
      // link only into a bucket item, which reads one level and stops, so no cycle is
      // possible; a link to a folder anywhere else is left out rather than walked, and a
      // dangling one has nothing to show.
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory() && !ctx.bucket) continue;
        isDir = st.isDirectory();
      }

      if (isDir) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.') && !DOT_OK.has(e.name)) continue;
        if (ctx.repo && SECRET_DIRS.has(e.name.toLowerCase())) continue;
        if (MOUNTED_ROOTS.has(posix(full).toLowerCase())) continue; // mounted as its own root

        let childNames;
        try { childNames = fs.readdirSync(full); } catch { continue; }
        const isRepo = childNames.includes('.git');

        // Bucket item that happens to be a directory (skills/my-skill/SKILL.md)
        if (ctx.bucket) {
          const doc = ['SKILL.md', 'AGENT.md', 'README.md', `${e.name}.md`].find((f) => childNames.includes(f));
          const info = doc ? describe(path.join(full, doc), e.name) : { desc: '' };
          const node = leaf(id, e.name, ctx.bucket, full, info.desc);
          if (info.fmName) node.title = info.fmName;
          if (doc) { node.doc = rel(path.join(full, doc)); stampNode(node, path.join(full, doc)); }
          node.cli = ctx.cli;
          out.push(node); flat.push(node);
          continue;
        }

        // A CLI runtime wins over the repo short-circuit — Codex is both.
        const isCli = ctx.section === 'Agents' && depth === 1
          && ['CLAUDE.md', 'AGENTS.md'].some((f) => childNames.includes(f));

        if (isRepo && !isCli) {
          const node = leaf(id, e.name, 'repo', full, '');
          node.group = ctx.group || path.basename(dir);
          const readme = childNames.find((n) => /^readme\.md$/i.test(n));
          if (readme) {
            const d = describe(path.join(full, readme), e.name).desc;
            if (d) node.desc = d;
            node.doc = rel(path.join(full, readme));
          }
          const claude = childNames.find((n) => /^(CLAUDE|AGENTS)\.md$/i.test(n));
          if (claude) node.agentDoc = rel(path.join(full, claude));
          // Walk into the repo so its docs are browsable in the tree and searchable,
          // rather than stopping at the repo card. `section` is cleared so the
          // depth-1 group/CLI rules can't fire again on a folder deep inside a repo,
          // and `repo` marks the subtree for the doc-only file filter in walk().
          // Use the workspace's bounded scan depth, including its wrapper folders.
          node.children = depth < (ctx.maxDepth ?? CONFIG_DEFAULTS.maxDepth) ? walk(full, depth + 1, {
            ...ctx, section: null, bucket: null, repo: id, group: node.group,
          }) : [];
          if (node.children.more) node.more = node.children.more;
          if (node.children.length) node.badge = node.children.length; else delete node.children;
          repos.push(node);
          out.push(node); flat.push(node);
          continue;
        }

        // Repos/Private/Draft/ is pre-repo R&D by convention (see the workspace's own CLAUDE.md)
        // -- no `.git`, so `isRepo` above never fires, and it would otherwise fall through
        // to a plain, unfiltered `folder` walk: every source file included, invisible to
        // the Repos table and its git-state stats, and absent from the overview entirely
        // (#34). Giving it its own kind and the same doc-only filtering a real repo gets
        // is the fix -- collected into `drafts` for a dedicated overview card cluster.
        // Matched on the parent folder's name, not a fixed depth, so it holds whether Draft/
        // sits directly under Repos/ or under an owner tier (Repos/Private/Draft/).
        if (!isCli && ctx.group === 'Draft' && path.basename(dir) === 'Draft') {
          const node = leaf(id, e.name, 'draft', full, '');
          const readme = childNames.find((n) => /^readme\.md$/i.test(n));
          if (readme) {
            const d = describe(path.join(full, readme), e.name).desc;
            if (d) node.desc = d;
            node.doc = rel(path.join(full, readme));
            node.docFirst = true;   // a draft renders through viewFolder, so the same rule applies
          }
          node.children = depth < (ctx.maxDepth ?? CONFIG_DEFAULTS.maxDepth) ? walk(full, depth + 1, {
            ...ctx, section: null, bucket: null, repo: id,
          }) : [];
          if (node.children.more) node.more = node.children.more;
          if (node.children.length) node.badge = node.children.length; else delete node.children;
          drafts.push(node);
          out.push(node); flat.push(node);
          continue;
        }

        // Classify the directory itself
        let kind = 'folder';
        const nextCtx = { ...ctx, bucket: null };

        if (depth === 0 && dir === ctx.rootDir && (e.name === 'Agents' || e.name === 'Repos')) kind = 'section';
        // Repos/ may carry an owner tier above the groups (Repos/<owner>/<group>/<repo>), so
        // the group is the innermost non-repo folder of the first two levels: a repo's
        // `group` stays Live_Apps / Tools / Draft / … either way, and repoScope.groups keeps
        // matching. Repos found at depth 1 short-circuit above and never reach this.
        else if (ctx.section === 'Repos' && depth <= 2) { kind = 'group'; nextCtx.group = e.name; }
        else if (isCli) { kind = 'cli'; nextCtx.cli = e.name; }
        else if (CONFIG_DIRS.has(e.name)) kind = 'folder';
        else if (ctx.inConfig && BUCKETS[e.name.toLowerCase()]) { kind = 'folder'; nextCtx.bucket = BUCKETS[e.name.toLowerCase()]; }

        if (depth === 0 && dir === ctx.rootDir) nextCtx.section = e.name;
        if (CONFIG_DIRS.has(e.name)) nextCtx.inConfig = true;

        const node = leaf(id, e.name, kind, full, '');
        const idx = ['README.md', 'index.md', 'INDEX.md'].find((f) => childNames.includes(f));
        if (idx) {
          const info = describe(path.join(full, idx), e.name);
          if (info.desc) node.desc = info.desc;
          node.doc = rel(path.join(full, idx));
          // Same rule the shared roots use: a folder that documents itself opens on that
          // document rather than on a grid of its own children. `cli` is excluded -- it has
          // a purpose-built page, not a fallback one -- and repos set their doc in the
          // branch above, where the README already renders beside the git box.
          if (kind !== 'cli') node.docFirst = true;
        }
        node.children = depth < (ctx.maxDepth ?? CONFIG_DEFAULTS.maxDepth) ? walk(full, depth + 1, nextCtx) : [];
        if (node.children.more) node.more = node.children.more;
        if (node.children.length) node.badge = node.children.length;
        else delete node.children;
        if (kind === 'cli') {
          node.scope = 'project';
          node.counts = countArtifacts(node);
          node.config = ['CLAUDE.md', 'AGENTS.md'].find((f) => childNames.includes(f)) || '';
          if (!node.desc && node.config) node.desc = describe(path.join(full, node.config), e.name).desc;
          const mcpFile = ['.mcp.json', 'config.toml', 'opencode.jsonc', 'settings.json']
            .find((f) => childNames.includes(f));
          node.mcp = mcpFile ? readMcp(path.join(full, mcpFile)) : [];
          node.mcpFile = mcpFile ? rel(path.join(full, mcpFile)) : '';
          node.plugins = [];
          // Hooks live in vendor-specific config one level under the CLI root -- not in
          // `childNames` above, and not a folder of scripts, so the directory walk alone
          // never finds them. See PROJECT_HOOK_SOURCES for which vendors have one.
          node.hooksCfg = (PROJECT_HOOK_SOURCES[e.name.toLowerCase()] || [])
            .flatMap((h) => readHooksFrom(path.join(full, ...h.rel.split('/')), h.format));
          if (node.hooksCfg.length) node.counts.hook += node.hooksCfg.length;
          node.configFiles = childNames
            .filter((n) => /\.(json|md|env|bak)$|^\.env/.test(n) && !n.endsWith('.bak'))
            .slice(0, 8)
            .map((n) => ({ name: n, id: rel(path.join(full, n)), tint: TINT[kindOfFile(n)] }));
          runtimes.push(node);
        }
        out.push(node); flat.push(node);
      } else {
        if (e.name === '.gitignore' || e.name === '.DS_Store') continue;
        if (ctx.repo && (!DOC_FILE.test(e.name) || SECRET_FILE.test(e.name))) { hidden++; continue; }
        // Inside a bucket every file is one of that artifact (hooks are .ps1/.sh, skills .md).
        const bucketKind = ctx.bucket && !/^README\.md$/i.test(e.name) ? ctx.bucket : null;
        const kind = bucketKind || kindOfFile(e.name);
        const node = leaf(id, e.name, kind, full, '');
        stampNode(node, full);
        if (bucketKind || DOC_NAMES.test(e.name)) {
          const info = describe(full, e.name);
          if (info.desc) node.desc = info.desc;
          if (info.fmName) node.title = info.fmName;
        }
        if (bucketKind) { node.doc = id; node.cli = ctx.cli; }
        out.push(node); flat.push(node);
      }
    }
    out.more = hidden;
    return out;
  }

  function buildRootNode(r, shared) {
    if (r.name === 'Pictures') { const node = pictures.root(); flat.push(node); return node; }
    const node = leaf(rel(r.dir), r.name, r.name === 'Documents' ? 'docroot' : 'root', r.dir, '');
    node.children = walk(r.dir, 0, {
      rootDir: r.dir, maxDepth: shared ? CONFIG.maxDepth : (r.maxDepth ?? CONFIG.maxDepth),
      section: null, cli: null, inConfig: false, bucket: null,
    });
    node.badge = node.children.length;
    const readme = path.join(r.dir, 'README.md');
    if (fs.existsSync(readme)) {
      node.desc = describe(readme, r.name).desc;
      node.doc = rel(readme);
      // A shared root is reference material, not a workspace: its README is the point,
      // so the client opens on it rather than on a stats overview or a card grid. Project
      // roots deliberately keep their overview -- that page is why you click a project.
      if (shared) node.docFirst = true;
    }
    node.root = r.dir;
    flat.push(node);
    return node;
  }
  // Arrow-wrapped, not passed bare: Array.map would hand the index in as `shared` and
  // flag every project root but the first.
  const projectNodes = projects.map((p) => buildRootNode(p));
  const sharedNodes = sharedRoots.map((r) => buildRootNode(r, true));

  // Every project workspace nests under one "Projects" folder rather than sitting at
  // the top level next to Documents/Skills/Pictures/Automations -- a real tree node
  // (not just a UI grouping), so it collapses/expands like any other folder. No real
  // directory backs it, so it carries no `root`/`doc` and stays out of `flat` (nothing
  // to search for or resolve a filesystem path from).
  const projectsFolder = leaf('@projects', 'Projects', 'projects', '', '');
  projectsFolder.children = projectNodes;
  projectsFolder.badge = projectNodes.length;

  const tree = [projectsFolder, ...sharedNodes];

  // ~/.claude, ~/.codex, … — same `cli` node shape as a project runtime, so every
  // downstream consumer (counts, search index, the CLI page) works unchanged.
  function buildUserRoot() {
    const kids = [];
    for (const rt of userRuntimes) {
      if (!safeIsDir(rt.dir)) continue;
      const node = leaf(rel(rt.dir), rt.name, 'cli', rt.dir, rt.note || '');
      node.scope = 'user';
      node.children = [];

      for (const sub of rt.dirs) {
        const full = path.join(rt.dir, sub);
        if (!safeIsDir(full)) continue;
        // `sub` may be a nested path (Antigravity's skills sit at `builtin/skills`, not
        // a top-level `skills/`) — the bucket lookup and the display name both use just
        // the last segment, so a nested entry classifies and reads the same as a plain one.
        const label = path.basename(sub);
        const b = leaf(rel(full), label, 'folder', full, '');
        // Starting at depth 4 keeps every `depth === 0/1` special case in walk() from
        // firing on a user subtree, and leaves headroom under the scan-depth limit.
        // inConfig only for a real bucket dir. `extensions/` bundles vendor skill packs
        // (google-workspace-cli alone ships ~95) — browsable as folders, but counting
        // them would swamp the portfolio skill total with someone else's library.
        const bucket = BUCKETS[label.toLowerCase()] || null;
        if (label.toLowerCase() === 'routines') {
          // walk() pushes as it descends; buildRoutines just returns, so the search
          // index needs these added by hand or routines are unfindable.
          b.children = buildRoutines(full);
          for (const r of b.children) flat.push(r);
        } else {
          b.children = walk(full, 4, {
            maxDepth: CONFIG.maxDepth,
            rootDir: rt.dir, section: 'Agents', cli: rt.name, inConfig: !!bucket, bucket,
          });
        }
        if (b.children.length) b.badge = b.children.length; else delete b.children;
        node.children.push(b); flat.push(b);
      }

      for (const f of rt.files) {
        const full = path.join(rt.dir, f);
        if (!fs.existsSync(full)) continue;
        const fn = leaf(rel(full), f, kindOfFile(f), full, '');
        stampNode(fn, full);
        if (DOC_NAMES.test(f)) { const i = describe(full, f); if (i.desc) fn.desc = i.desc; }
        node.children.push(fn); flat.push(fn);
      }

      node.badge = node.children.length;
      node.counts = countArtifacts(node);
      node.config = rt.files.find((f) => /\.md$/i.test(f) && fs.existsSync(path.join(rt.dir, f))) || '';
      node.mcp = readMcp(rt.mcp);
      node.mcpFile = rt.mcp && fs.existsSync(rt.mcp) ? rel(rt.mcp) : '';
      node.plugins = readPlugins(rt.plugins);
      // Per-vendor hook config, from hooksFile/hooksFormat above -- absent for Agents
      // (shared) and OpenCode, which have no config-driven hooks to read.
      node.hooksCfg = rt.hooksFile ? readHooksFrom(rt.hooksFile, rt.hooksFormat) : [];
      if (node.hooksCfg.length) node.counts.hook += node.hooksCfg.length;
      runtimes.push(node);
      kids.push(node); flat.push(node);
    }
    if (!kids.length) return null;
    const root = leaf('~', 'User CLIs', 'userroot', HOME,
      'CLI runtimes configured in the home directory rather than in any one project — every repo on this machine inherits these skills, sub-agents, commands and MCP servers.');
    root.children = kids;
    root.badge = kids.length;
    root.root = HOME;
    flat.push(root);
    return root;
  }

  const userRoot = buildUserRoot();
  if (userRoot) tree.push(userRoot);

  // Join each project CLI to its user-scope counterpart (Agents/Claude -> ~/.claude,
  // "Claude Code") so the CLI page can show inherited skills/commands/agents alongside
  // the project's own, instead of only what the repo itself carries.
  for (const rt of runtimes) {
    if (rt.scope !== 'project') continue;
    const alias = VENDOR_ALIAS[rt.name.toLowerCase()];
    const match = alias && runtimes.find((u) => u.scope === 'user' && u.name.toLowerCase() === alias);
    if (match) rt.userCli = match.id;
  }

  return { tree, repos, runtimes, flat, drafts };
}

// Deliberately lean: `abs`, tint and shape are derived on the client from id + kind.
// Non-enumerable `abs` keeps it usable server-side without paying for it in the payload.
function leaf(id, name, kind, full, desc) {
  const n = { id, name, kind };
  if (desc) n.desc = desc;
  Object.defineProperty(n, 'abs', { value: posix(full), enumerable: false });
  return n;
}

function safeIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
export function fileStamp(file) {
  try { const st = fs.statSync(file); return { size: st.size, mtime: st.mtimeMs }; }
  catch { return { size: 0, mtime: 0 }; }
}

/**
 * Modification times for one folder's immediate children, on demand.
 *
 * `mtime` is deliberately non-enumerable on scanned nodes (see stampNode) because a
 * timestamp on all ~40,000 of them is exactly the payload weight the Pictures pass spent
 * itself removing. The folder list view needs it for a few dozen rows of one open folder,
 * so it is fetched for that folder instead of shipped for every node.
 *
 * Keyed by name, not id: the client already holds the ids, and repeating the folder
 * prefix on every row is the same waste at a smaller scale. Never recurses, never reads
 * file contents.
 */
export function folderStamps(absDir) {
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch { return null; }
  const times = {};
  for (const entry of entries) {
    const { mtime } = fileStamp(path.join(absDir, entry.name));
    if (mtime) times[entry.name] = mtime;
  }
  return times;
}

function stampNode(node, file) {
  const stamp = fileStamp(file);
  node.size = stamp.size;
  // Revision is needed for the signature, not another 118k fields on the wire.
  Object.defineProperty(node, 'mtime', { value: stamp.mtime, enumerable: false });
}

// P9-18: documents modified in the last week, newest first, from the mtimes the walk
// already took. Capped so a mass edit (a formatter run, a branch switch) can't bloat the
// payload; the client says when the cap was hit.
export const RECENT_DAYS = 7, RECENT_DOCS_MAX = 100;
const RECENT_FILE = /\.(md|mdx|markdown|txt|rst|adoc|html?|pdf)$/i;
export function recentDocs(flat, now, allowed = (n) => !!resolveId(n.id)) {
  const since = now - RECENT_DAYS * 86_400_000;
  const hits = flat.filter((n) => n.mtime > since && n.mtime <= now + 60_000 && RECENT_FILE.test(n.name) && allowed(n));
  hits.sort((a, b) => b.mtime - a.mtime);
  return { total: hits.length, docs: hits.slice(0, RECENT_DOCS_MAX).map((n) => ({ id: n.id, name: n.name, mtime: n.mtime })) };
}

export function scanSignature(flat, repos) {
  let sig = 0;
  const mix = (str) => { for (let i = 0; i < str.length; i++) sig = (Math.imul(sig, 31) + str.charCodeAt(i)) | 0; };
  for (const n of flat) mix(`${n.id}|${n.desc || ''}|${n.size || 0}|${n.mtime || 0}`);
  for (const r of repos) mix(`${r.branch}${r.state}${r.commit}${r.ahead}${r.behind}`);
  return sig;
}

/** Directories sort first, then case-insensitive by name (dot-files last). */
function cmpEnt(a, b) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  const ad = a.name.startsWith('.'), bd = b.name.startsWith('.');
  if (ad !== bd) return ad ? 1 : -1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/** Walk a CLI runtime subtree and tally its skills / commands / sub-agents / hooks. */
// `routines/` is not a bucket dir and walk() would get it wrong twice over: every job
// folder would come back as a plain `folder`, and `bin/` is in SKIP_DIRS so the runner
// scripts would vanish. Each job is really one entity with metadata sitting next to it
// in routine.json (the eight Claude jobs) or job.json (the three that wrap an existing
// scheduled task), so read that instead of guessing from the file tree.
function buildRoutines(dir) {
  const out = [];
  const jobsDir = path.join(dir, 'jobs');
  if (!safeIsDir(jobsDir)) return out;
  let names = [];
  try { names = fs.readdirSync(jobsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return out; }

  for (const name of names.sort()) {
    const jd = path.join(jobsDir, name);
    // routine.json is the native shape; job.json wraps a pre-existing Task Scheduler
    // entry. Same schedule block, different fields around it.
    const metaFile = ['routine.json', 'job.json'].map((f) => path.join(jd, f)).find((f) => fs.existsSync(f));
    if (!metaFile) continue;
    let m = {};
    try { m = JSON.parse(fs.readFileSync(metaFile, 'utf8').replace(/^\uFEFF/, '')); } catch { m = {}; }

    const n = leaf(rel(jd), name, 'routine', jd, '');
    n.title = m.taskName || m.project || m.name || name;
    n.taskName = m.taskName || '';
    n.sched = m.schedule && m.schedule.dayOfWeek ? `${m.schedule.dayOfWeek} ${m.schedule.at || ''}`.trim() : '';
    n.runner = m.runner || (m.script ? m.script.split(/[\\/]/).pop() : '');
    // cwd only, with no repo, is the job's own folder -- already the page path. Skip it.
    n.target = m.ghRepo || m.repo || '';
    n.branchPrefix = m.branchPrefix || (m.branchPrefixes || []).join(' · ');
    n.metaFile = rel(metaFile);
    n.cli = 'Claude Code';

    // A README next to the job is the page body; prompt.md is what the run is told to
    // do, and is the more useful of the two when only one is present.
    const readme = path.join(jd, 'README.md');
    const prompt = path.join(jd, 'prompt.md');
    if (fs.existsSync(readme)) { n.doc = rel(readme); n.desc = describe(readme, name).desc; }
    // The seven roadmap jobs ship no README at all -- prompt.md is the whole job, and
    // its opening line ("You are running unattended, once a week, on ...") is a better
    // description than the folder slug the card would otherwise show alone.
    else if (fs.existsSync(prompt)) { n.doc = rel(prompt); n.desc = describe(prompt, name).desc; }
    if (fs.existsSync(prompt)) n.prompt = rel(prompt);
    // The three job.json wrappers carry neither a README nor a prompt -- their whole
    // definition is the JSON. Point the page body at that rather than at the folder,
    // which /api/file cannot render.
    if (!n.doc) n.doc = n.metaFile;
    if (!n.desc && m._comment) n.desc = String(m._comment).split('. ')[0] + '.';

    // Run history: the log directory is the only record of whether any of this fires.
    const logs = path.join(jd, 'logs');
    if (safeIsDir(logs)) {
      let files = [];
      try { files = fs.readdirSync(logs).filter((f) => /\.log$/i.test(f)).sort(); } catch { files = []; }
      n.runs = files.length;
      if (files.length) {
        n.lastRun = files[files.length - 1].replace(/\.log$/i, '');
        n.lastLog = rel(path.join(logs, files[files.length - 1]));
        n.lastStatus = routineStatus(readTail(path.join(logs, files[files.length - 1])));
      }
    }
    out.push(n);
  }
  return out;
}

function countArtifacts(node) {
  const c = { skill: 0, command: 0, agent: 0, hook: 0, routine: 0 };
  (function rec(n) {
    for (const k of n.children || []) {
      if (c[k.kind] !== undefined) c[k.kind]++;
      rec(k);
    }
  })(node);
  return c;
}

// ── git ────────────────────────────────────────────────────────────────────
// Spawning 40 git processes at once makes them all time out on Windows.
// Six at a time keeps a full 20-repo refresh under ~10s and never drops a repo.
const GIT_CONCURRENCY = 6;
let gitActive = 0;
const gitQueue = [];

function gitSlot() {
  if (gitActive < GIT_CONCURRENCY) { gitActive++; return Promise.resolve(); }
  return new Promise((res) => gitQueue.push(res));
}
function gitRelease() {
  const next = gitQueue.shift();
  if (next) next(); else gitActive--;
}

const git = async (cwd, args) => {
  await gitSlot();
  try {
    return await new Promise((res) => {
      execFile('git', ['-C', cwd, ...args], { windowsHide: true, timeout: 20000, maxBuffer: 4 << 20 },
        (err, out) => res(err ? '' : out));
    });
  } finally { gitRelease(); }
};

// git is most of a scan (19s of 35s on 2026-11-06), and the old 15s TTL ran it again on
// every watcher rescan. P9-08: a repo's last result is reused while nothing that could
// change it has moved -- the git files a commit, checkout, stage or fetch writes (the
// signature below), and its working tree, which git doesn't notice until asked, so the
// watcher's changed paths are passed in as `touched`. GIT_MAX_AGE bounds how stale the
// relative commit time ("3 hours ago") can get on a quiet repo. The rescan button
// passes fresh=1 and bypasses all of it.
const gitCache = new Map();
const GIT_MAX_AGE = 10 * 60_000;
const GIT_SIG_FILES = ['index', 'HEAD', 'logs/HEAD', 'FETCH_HEAD', 'packed-refs', 'refs/heads'];

/** mtimes of the files git rewrites when a repo's state moves; null when `.git` isn't a folder (worktree, submodule). */
export function gitSignature(abs) {
  if (!safeIsDir(path.join(abs, '.git'))) return null;
  return GIT_SIG_FILES.map((f) => { try { return fs.statSync(path.join(abs, '.git', f)).mtimeMs; } catch { return 0; } }).join(':');
}

/** Whether a cached git result still holds. `touched` is lowercase absolute paths changed since the last scan, or true for "assume everything". */
export function gitHitValid(hit, { sig, abs, touched, now }) {
  if (!hit || !sig || hit.sig !== sig || now - hit.at >= GIT_MAX_AGE) return false;
  if (touched === true) return false;
  const prefix = posix(abs).toLowerCase() + '/';
  for (const p of touched) if (p.startsWith(prefix)) return false;
  return true;
}

async function gitStateCached(repo, fresh, touched) {
  const sig = gitSignature(repo.abs);
  const hit = gitCache.get(repo.abs);
  if (!fresh && gitHitValid(hit, { sig, abs: repo.abs, touched, now: Date.now() })) return hit.val;
  const val = await gitState(repo);
  gitCache.set(repo.abs, { at: Date.now(), sig, val });
  return val;
}

async function gitState(repo) {
  const [status, log] = await Promise.all([
    git(repo.abs, ['status', '--porcelain=v2', '--branch']),
    git(repo.abs, ['log', '-1', '--format=%s%x1f%cr%x1f%an']),
  ]);
  const s = { branch: '—', state: 'clean', ahead: 0, behind: 0, remote: '—', commit: '—', ago: '', author: '' };
  let dirty = 0, conflict = 0;
  for (const line of status.split(/\r?\n/)) {
    if (line.startsWith('# branch.head ')) s.branch = line.slice(14).trim();
    else if (line.startsWith('# branch.upstream ')) s.remote = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line);
      if (m) { s.ahead = +m[1]; s.behind = +m[2]; }
    } else if (/^[12?!] /.test(line)) dirty++;
    else if (line.startsWith('u ')) conflict++;
  }
  s.dirtyCount = dirty;
  s.state = conflict ? 'conflict' : dirty ? 'dirty' : s.behind ? 'behind' : s.ahead ? 'ahead' : 'clean';
  const [subject, ago, author] = log.trim().split('\x1f');
  if (subject) { s.commit = subject; s.ago = ago || ''; s.author = author || ''; }
  return s;
}

// P9-10: the changed files behind a repo's "uncommitted", and one file's diff on demand.
// Read-only, and only what git itself reports, so a path can't be smuggled in: the diff
// route serves a file only if it is in this list and it passes resolveId's deny list.
export const CHANGES_MAX = 300;
export const DIFF_MAX = 256 * 1024;

/** `git status --porcelain=v1 -z` output to [{ code, path, from? }], capped. */
export function parseStatusZ(out, max = CHANGES_MAX) {
  const parts = out.split('\0'), files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const f = { code: e.slice(0, 2), path: e.slice(3) };
    // A rename or copy carries its old path as the next field.
    if (/[RC]/.test(f.code)) f.from = parts[++i];
    files.push(f);
  }
  return { files: files.slice(0, max), total: files.length };
}

const repoChanges = async (abs) =>
  parseStatusZ(await git(abs, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));

/** One file's diff against HEAD, cut at DIFF_MAX; untracked files come back as their opening bytes. */
async function repoDiff(abs, file, code) {
  if (code === '??') {
    const text = readHead(path.join(abs, file), DIFF_MAX) ?? '';
    if (text.includes('\0')) return { untracked: true, binary: true, text: '' };
    return { untracked: true, text, truncated: text.length >= DIFF_MAX };
  }
  await gitSlot();
  try {
    const out = await new Promise((res) => execFile('git',
      ['-C', abs, 'diff', 'HEAD', '--no-color', '--no-ext-diff', '--', file],
      { windowsHide: true, timeout: 20000, maxBuffer: DIFF_MAX },
      // Over maxBuffer is still a usable diff: keep what arrived and say it was cut.
      (err, stdout) => res({ text: String(stdout || '').slice(0, DIFF_MAX), cut: err?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })));
    return { text: out.text, truncated: out.cut || out.text.length >= DIFF_MAX };
  } finally { gitRelease(); }
}

// P9-17: roadmap progress from a repo's docs/ROADMAP.md. `[x]` is done; `[ ]`, `[-]`
// (claimed by a run) and `[!]` (blocked) are all still open. Fenced code is skipped so
// an example checklist doesn't count. Cached by mtime: a roadmap can run to 200 KB.
export function roadmapProgress(text) {
  let open = 0, done = 0, fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^\s*[-*+] \[([ xX!-])\]\s/.exec(line);
    if (m) { if (m[1] === 'x' || m[1] === 'X') done++; else open++; }
  }
  return open + done ? { open, done } : null;
}

const roadmapCache = new Map();
function repoRoadmap(abs) {
  for (const dir of ['docs', 'Docs']) {
    const file = path.join(abs, dir, 'ROADMAP.md');
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    const hit = roadmapCache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit.val;
    let val = null;
    try { val = roadmapProgress(fs.readFileSync(file, 'utf8')); } catch {}
    roadmapCache.set(file, { mtime: st.mtimeMs, val });
    return val;
  }
  return null;
}

// --ok is the state green; --green is the page's accent. Same colour in every scheme but obsidian.
const DOT = { clean: 'var(--ok)', dirty: 'var(--orange)', behind: 'var(--blue)', ahead: 'var(--blue)', conflict: 'var(--red)' };

/**
 * Which repos reach the overview table, per project, unioned into one list. Example_Workspace
 * names its four Repos/ groups so runtime and scaffold repos stay in the tree only;
 * Identity_Workspace and Finance_Workspace keep their repos directly under Repos/ with no group tier, so
 * they scope by path instead -- matching on a group name alone would pull in any Repos/
 * folder found under Documents, which is not part of those projects. With several
 * projects sharing one repos[] pool, scoping to the project's OWN `idPrefix` first (before
 * applying its own repoScope) also stops one project's group/path rule from matching a
 * same-named Repos/<group>/ folder that actually belongs to a different project.
 */
export function scopeRepos(repos, projects) {
  return projects.flatMap(({ idPrefix, repoScope }) => {
    const underProject = repos.filter((r) => r.id.startsWith(idPrefix));
    const { groups: scopeGroups, pathPrefix } = repoScope;
    return underProject.filter((r) => (
      scopeGroups ? scopeGroups.includes(r.group)
        : pathPrefix ? r.id.startsWith(pathPrefix)
          : true));
  });
}

// ── build payload ──────────────────────────────────────────────────────────
// P9-04: what the last scan found for content search to index. The index itself lives in
// hub.mjs, and stays empty on a hub nobody content-searches; see contentIndexNow().
let contentDocs = [], contentSig = '';
export const CONTENT_FILE = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

async function scan(fresh = false, touched = true) {
  const t0 = Date.now();
  const { tree, repos, runtimes, flat, drafts } = scanTree();
  const walkMs = Date.now() - t0;

  await Promise.all(repos.map(async (r) => {
    Object.assign(r, await gitStateCached(r, fresh, touched));
    r.dot = DOT[r.state] || TINT.file;
    r.roadmap = repoRoadmap(r.abs);
  }));

  const gitMs = Date.now() - t0 - walkMs;
  const totals = { skill: 0, command: 0, agent: 0, hook: 0 };
  for (const rt of runtimes) for (const k in totals) totals[k] += rt.counts[k];
  const userRuntimes = runtimes.filter((r) => r.scope === 'user');
  const userTotals = { skill: 0, command: 0, agent: 0, hook: 0 };
  for (const rt of userRuntimes) for (const k in userTotals) userTotals[k] += rt.counts[k];
  const mcpAll = runtimes.reduce((n, r) => n + (r.mcp || []).length, 0);
  const mcpUser = userRuntimes.reduce((n, r) => n + (r.mcp || []).length, 0);

  const appRepos = scopeRepos(repos, PROJECTS.map((p) => ({ idPrefix: `${rel(p.dir)}/`, repoScope: p.repoScope })));
  const groups = new Set(appRepos.map((r) => r.group));
  const dirtyRepos = repos.filter((r) => r.state !== 'clean');
  const conflicts = repos.filter((r) => r.state === 'conflict').length;

  // Every artifact count is portfolio-wide; the note carries the user-scope share,
  // which is where most of them ended up after the 2026-08-23 consolidation.
  // `link` is the id of the overview heading the tile scrolls to — the strip doubles
  // as the page's table of contents.
  const CLIS = 'sec-project-clis', REPOS = 'sec-repos';
  const stats = [
    { label: 'cli runtimes', value: runtimes.length, note: `${userRuntimes.length} user`, color: TINT.cli, link: CLIS },
    { label: 'repos', value: appRepos.length, note: groups.size > 1 ? `${groups.size} groups` : '', color: 'var(--fg-hi)', link: REPOS },
    { label: 'skills', value: totals.skill, note: `${userTotals.skill} user`, color: TINT.skill, link: CLIS },
    { label: 'commands', value: totals.command, note: `${userTotals.command} user`, color: TINT.command, link: CLIS },
    { label: 'sub-agents', value: totals.agent, note: `${totals.hook} hooks · ${userTotals.agent} user`, color: TINT.agent, link: CLIS },
    { label: 'mcp servers', value: mcpAll, note: `${mcpUser} user`, color: TINT.mcp, link: CLIS },
    { label: 'uncommitted', value: dirtyRepos.length, note: conflicts ? `+${conflicts} conflict` : '', color: dirtyRepos.length ? TINT.command : TINT.cli, link: REPOS },
  ];

  // The 4th featured doc used to be hardcoded to Agents/Claude/CLAUDE.md — one vendor's
  // instruction file, in every hub, regardless of which one actually has an Agents/
  // folder. Example_Workspace names Agents/README.md as the vendor-neutral contract every
  // CLAUDE.md/AGENTS.md syncs from ("if anything conflicts, that file wins"), so it is
  // the one worth featuring — and it degrades to "no 4th doc" on a project that has
  // none, rather than silently matching nothing the way the old regex would. This used
  // to check only ROOTS[0] (the one project a hub had); with several projects in one
  // process every one of them gets its own featured Agents/README.md, not just the first.
  const agentsReadmes = PROJECTS
    .map((p) => flat.find((n) => n.id === rel(path.join(p.dir, 'Agents/README.md'))))
    .filter(Boolean);
  const rootDocs = ROOTS
    .map((r) => flat.find((n) => n.id === rel(path.join(r.dir, 'README.md'))))
    .filter(Boolean)
    .concat(agentsReadmes)
    .map((n) => ({ id: n.id, name: n.name, desc: n.desc, where: path.dirname(n.id).split('/').slice(-2).join('/') }));

  // Parsed straight from each project's own root README's "Live sites" table rather
  // than maintained separately here, so the overview can never drift from the doc a
  // human actually edits when a subdomain changes — it only shows up on projects that
  // have such a table (Identity_Workspace and Finance_Workspace don't), read fresh each scan. Also
  // used to check only ROOTS[0]; now checks every project. Tagged with `project` since
  // a parsed table row has no tree id of its own for the client to scope by ancestry.
  const liveSites = PROJECTS.flatMap((p) => {
    try {
      return parseLiveSites(fs.readFileSync(path.join(p.dir, 'README.md'), 'utf8'))
        .map((s) => ({ ...s, project: p.name }));
    }
    catch { return []; /* no root README, or unreadable — an empty list just hides the section */ }
  });


  // Pre-repo R&D under Repos/Private/Draft/ (#34) — no git state to show, so a lighter list than
  // `repos`: just enough to card it on the overview and jump to its folder page.
  const draftList = drafts.map((d) => ({ id: d.id, name: d.name, desc: d.desc || '' }));
  const recent = recentDocs(flat, Date.now());

  // Modification times cover equal-byte-count edits, including bucket entry docs.
  const sig = scanSignature(flat, repos);
  // Only a list of nodes; nothing is read here. resolveId() keeps the index to what
  // /api/file would serve, so content search can never surface a denied file's text.
  contentDocs = flat.filter((n) => n.abs && CONTENT_FILE.test(n.name) && resolveId(n.id));
  contentSig = String(sig);

  // The search index used to ship here too: 25,731 entries, 4.42MB of the 10.23MB
  // payload, every field of it already present on the tree nodes it was copied from
  // (2.47MB of duplicated id strings alone). The client walks the tree into a Map on
  // arrival anyway, so it builds the index in that same pass now.
  return {
    sig: String(sig),
    scannedAt: new Date().toISOString(),
    ms: Date.now() - t0,
    timings: { walkMs, gitMs, assembleMs: Date.now() - t0 - walkMs - gitMs },
    nodes: flat.length,
    home: HOME, base: BASE,
    roots: ROOTS.map((r) => ({ name: r.name, dir: r.dir })),
    sharedRoots: SHARED_ROOTS.map((r) => ({ name: r.name, dir: r.dir, tint: r.tint })),
    tree, stats, rootDocs, liveSites, drafts: draftList, recent,
    runtimes: runtimes.map((r) => ({
      id: r.id, name: r.name, desc: r.desc, config: r.config, counts: r.counts,
      scope: r.scope || 'project', mcp: (r.mcp || []).length, plugins: (r.plugins || []).length,
    })),
    repos: appRepos.map((r) => ({
      id: r.id, name: r.name, group: r.group, branch: r.branch, state: r.state,
      dot: r.dot, commit: r.commit, ago: r.ago, roadmap: r.roadmap,
    })),
  };
}

let readErrorsAtLastScan = 0;

/** One scan, serialised and gzipped: what the worker posts back, or what runs inline. */
async function scanPayload(fresh, touched) {
  const data = await scan(fresh, touched);
  const serializeStart = Date.now();
  const json = Buffer.from(JSON.stringify(data));
  const serializeMs = Date.now() - serializeStart;
  const gzipStart = Date.now();
  // The tree is megabytes of highly repetitive path strings. Gzip once per scan, not
  // once per request — it takes 5.1MB down to ~0.6MB.
  const gzip = zlib.gzipSync(json, { level: 6 });
  const gzipMs = Date.now() - gzipStart;
  // Read failures per scan, not since boot. A lifetime counter with a fixed
  // threshold turns any long-running hub unhealthy eventually -- a few transient
  // failures per scan is normal (files being written as the walk goes past), and it
  // is the *rate* that distinguishes that from a descriptor leak.
  const errs = readErrors - readErrorsAtLastScan;
  readErrorsAtLastScan = readErrors;
  return {
    json, gzip, errs, contentSig,
    meta: { ms: data.ms, nodes: data.nodes, timings: { ...data.timings, serializeMs, gzipMs } },
    // abs and mtime are non-enumerable on tree nodes, so copy them out or postMessage drops them.
    contentDocs: contentDocs.map((n) => ({ id: n.id, name: n.name, abs: n.abs, size: n.size, mtime: n.mtime })),
    readErrorLog: [...readErrorLog], descCache: descCache.size,
  };
}

/**
 * Mount or unmount a shared root in this thread's lists: the scan (ROOTS, SHARED_ROOTS),
 * the walker's prune set and resolveId's SERVE_DIRS gate. The server applies it on the
 * main thread and posts the same change to the scan worker. Restarting the worker
 * instead threw away its description and git caches, and the cold scan that followed
 * took ~100s on a 138k-node tree against ~25s warm.
 */
function mountSharedRoot(r) {
  // Nothing watched the folder while it was out of the sidebar, so git state cached from
  // before it was removed may be stale. The worker restart used to drop it for free.
  const key = r.dir.toLowerCase();
  for (const k of gitCache.keys()) {
    const p = posix(k).toLowerCase();
    if (p === key || p.startsWith(key + '/')) gitCache.delete(k);
  }
  SHARED_ROOTS.push(r);
  ROOTS.push(r);
  MOUNTED_ROOTS.add(r.dir.toLowerCase());
  SERVE_DIRS.push(r.dir);
}
function unmountSharedRoot(dir) {
  const key = dir.toLowerCase();
  const drop = (list, match) => { const i = list.findIndex(match); if (i > -1) list.splice(i, 1); };
  drop(SHARED_ROOTS, (r) => r.dir.toLowerCase() === key);
  drop(ROOTS, (r) => r.dir.toLowerCase() === key);
  drop(SERVE_DIRS, (d) => d.toLowerCase() === key);
  MOUNTED_ROOTS.delete(key);
}

if (SCAN_WORKER) {
  // One message at a time: a mount that arrives mid-scan waits for that scan to finish
  // rather than changing the root lists under it.
  let queue = Promise.resolve();
  // The catch keeps one failed message from leaving the queue rejected, which would skip
  // every scan after it.
  parentPort.on('message', (m) => {
    queue = queue.then(() => onWorkerMessage(m)).catch((e) => console.error('scan worker message failed:', e.message));
  });
}
async function onWorkerMessage({ fresh, touched, mount, unmount }) {
  if (mount) return mountSharedRoot(mount);
  if (unmount) return unmountSharedRoot(unmount);
  try {
    const out = await scanPayload(fresh, touched);
    // Transfer rather than copy, but only buffers that own their whole ArrayBuffer --
    // transferring a slice of Node's shared pool would detach the pool.
    const own = (b) => b.byteOffset === 0 && b.byteLength === b.buffer.byteLength;
    parentPort.postMessage(out, [out.json, out.gzip].filter(own).map((b) => b.buffer));
  } catch (e) { parentPort.postMessage({ error: e.message }); }
}

/** On the main thread: take in what a worker scan counted and found, as if it ran here. */
function adoptWorkerScan(out) {
  // The worker counts its own read errors; fold them into this thread's view.
  readErrors += out.errs;
  for (const [file, e] of out.readErrorLog) { readErrorLog.delete(file); readErrorLog.set(file, e); }
  while (readErrorLog.size > READ_ERROR_MAX) readErrorLog.delete(readErrorLog.keys().next().value);
  contentDocs = out.contentDocs;
  contentSig = out.contentSig;
}

// What the server in hub.mjs reads. `let` bindings stay live across the import; only
// this module assigns them.
export {
  argv, argOf, CONFIG_FILE, CONFIG, HUB_DIR, PROJECTS, SHARED_ROOTS, ROOTS, MOUNTED_ROOTS, USER_RUNTIMES, SKIP_DIRS,
  DOT_OK, NOISE_FILE, SECRET_DIRS, SERVE_DIRS, posix, rel, resolveId, readHeadAsync, descCache, readErrors,
  READ_ERROR_MAX, readErrorLog, pictureRoot, pictures, safeIsDir, repoChanges, repoDiff, contentDocs,
  contentSig, scan, scanPayload, adoptWorkerScan, mountSharedRoot, unmountSharedRoot,
};
