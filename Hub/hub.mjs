#!/usr/bin/env node
// Project Hub — scans every mounted project workspace + the shared roots (Documents,
// skills, Pictures, Automations) and serves the navigation UI. Zero dependencies. Node 18+.
//
// One process, one config folder, any number of projects: this file's own
// hub.config.json holds only the server's own settings (port, title, favicon); each
// project it mounts gets its own small config under `Projects/<name>/hub.config.json`,
// discovered at startup — adding a project is a folder and a config, nothing here changes.
//
//   node hub.mjs --config ../Project-Hub/hub.config.json    → serve
//   node hub.mjs --config <path> --scan                     → write scan.json and exit
//   node hub.mjs --config <path> --port 5000                → override the configured port

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createReportHandler } from './reports.mjs';
import { launchNative } from './open-native.mjs';
import { PictureLibrary, ignorePictureEvent } from './pictures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── configuration ──────────────────────────────────────────────────────────
// Before 2026-08-31 this was three copies of the file differing in four values, which
// meant every fix landed three times -- and a bad edit broke three servers at once.
// Before 2026-09-07 it was one process per project workspace; now it's one process for
// all of them, so the config that used to name ONE project (`dir`/`repoScope`) has split
// in two: this file's own hub.config.json is now just the server's own settings (port,
// title, favicon), and each project it mounts gets its own small config under `Projects/`
// (see loadProjectConfig below).
const CONFIG_DEFAULTS = {
  name: 'Portfolio', port: 4273, title: '',
  // The workspace drive root. Every id in the tree is a path relative to this, so it is
  // the one value that has to match the machine — it lives in config, not in this file.
  base: '',
  // Roots every project shares (Documents, Pictures, …). Machine-specific: config too.
  sharedRoots: [],
  favicon: { glyph: '/', ink: '#5fe3a1', line: '#2f6b52' },
};
const PROJECT_DEFAULTS = {
  name: '', dir: '',
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
  if (!j.port) throw new Error(`${file} is missing required key "port"`);
  if (!Number.isInteger(j.port) || j.port < 1024 || j.port > 65535) {
    throw new Error(`${file}: "port" must be an integer 1024-65535, got ${JSON.stringify(j.port)}`);
  }
  if (!j.base) throw new Error(`${file} is missing required key "base" (the workspace drive root, e.g. "D:/Work")`);
  const cfg = {
    ...CONFIG_DEFAULTS, ...j,
    base: normalizeDir(j.base),
    sharedRoots: (j.sharedRoots || []).map((r, i) => {
      if (!r.name || !r.dir) throw new Error(`${file}: sharedRoots[${i}] needs both "name" and "dir"`);
      return { tint: 'var(--dimmer)', ...r, dir: normalizeDir(r.dir) };
    }),
    favicon: { ...CONFIG_DEFAULTS.favicon, ...(j.favicon || {}) },
  };
  if (!cfg.title) cfg.title = `Project Hub — ${cfg.name}`;
  return cfg;
}

/** Read and validate one project's hub.config.json under `Projects/<name>/`. */
export function loadProjectConfig(file) {
  const j = readConfigJson(file);
  for (const k of ['name', 'dir']) {
    if (!j[k]) throw new Error(`${file} is missing required key "${k}"`);
  }
  return {
    ...PROJECT_DEFAULTS, ...j,
    dir: normalizeDir(j.dir),
    repoScope: validateRepoScope(file, j.repoScope || {}),
  };
}

const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : null; };

// The config file's own folder is the hub's directory: scan.json is written there, and
// Start-Hub.ps1 already points its logs at it.
const CONFIG_FILE = path.resolve(argOf('--config') || path.join(HERE, 'hub.config.json'));

// Running this file as a program without a config is a hard error -- that is the
// misconfiguration worth shouting about. Importing it (hub.test.mjs does) gets inert
// defaults instead, so the pure functions can be tested without a workspace.
export const IS_MAIN = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
const CONFIG = (IS_MAIN || fs.existsSync(CONFIG_FILE))
  ? loadConfig(CONFIG_FILE)
  : { ...CONFIG_DEFAULTS, name: '(not configured)' };
const HUB_DIR = path.dirname(CONFIG_FILE);

/**
 * Every project this hub mounts, found by scanning `Projects/<name>/hub.config.json`
 * next to this hub's own config folder -- adding a project is a folder and a config,
 * the same property the old three-hubs-one-codebase design already relied on, just
 * redirected at a project config (no port: it names a root this ONE process mounts,
 * not another process to reach) rather than another whole hub instance.
 */
function discoverProjects() {
  const dir = path.join(path.dirname(HUB_DIR), 'Projects');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const cfgFile = path.join(dir, e.name, 'hub.config.json');
    if (!fs.existsSync(cfgFile)) continue;
    out.push(loadProjectConfig(cfgFile));
  }
  return out;
}
const PROJECTS = IS_MAIN ? discoverProjects() : [];

// Every project workspace gets its own root; Documents, Pictures and the rest are shared
// by all of them. They are machine paths, so they come from `sharedRoots` in the hub's
// config rather than being listed here — see Project-Hub/hub.config.example.json.
//
// A shared root may sit physically inside another one (Links inside Documents): mount it
// anyway, MOUNTED_ROOTS below prunes it from the parent's walk so it appears once rather
// than twice with colliding ids. A dot-prefixed dir (`.My-Custom-Skills`, hidden from
// Obsidian) likewise has to be its own root — the walker skips dot-dirs.
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
const MAX_DEPTH = 7;
// A folder by one of these names is a signal the .html files under it are meant to be
// looked at, not read as source -- so they survive the repo doc-only filter (which
// otherwise drops every .html, #31) and get surfaced on the overview as a shelf.
const ARTIFACT_DIRS = new Set(['artifacts', 'dashboards', 'prototypes']);
const DOC_NAMES = /^(README|CLAUDE|AGENTS|SKILL|GEMINI|CONTRIBUTING|INDEX)\.md$/i;
// What counts as a document once we are inside a repo. Repos are walked for their
// docs and deliverables, not their source: keeping all 100k+ source files across every
// mounted project would multiply the payload for nodes the search index discards
// anyway (it drops `kind: 'file'') -- measured, on this machine, at ~117,000 additional
// files. Whatever this misses is still counted per folder as `more` and reachable via
// `open folder`. Report outputs (a rendered .html, a .pdf export, chart .pngs sitting
// next to a markdown summary) are exactly what this is meant to show, same as a repo's
// own README -- html/pdf/image extensions are recognized generally now, not only under
// an artifacts/dashboards/prototypes folder (see isArtifactHtml below, which still
// gates the separate Artifacts-shelf listing, just no longer gates plain visibility).
export const DOC_FILE = /\.(md|mdx|markdown|txt|rst|adoc|json|jsonc|ya?ml|toml|ini|cfg|conf|csv|pdf|html?|png|jpe?g|gif|svg|webp|avif|bmp|ico)$|^(LICENSE|NOTICE|Dockerfile|Makefile|CNAME)/i;
// Walking repos put real credential stores in reach — Edge-Radar keeps gitignored
// Kalshi keys in `keys/`, and a `.txt`/`.toml` in there matches DOC_FILE. Anything
// indexed is also readable through /api/file, so secrets are pruned by name before
// they can reach the payload. Scoped to repo interiors, which is the reach this
// change added; the rest of the tree keeps the behaviour it always had.
// Files this hub writes itself. They sit inside a scanned root, so without this a log
// line is indistinguishable from a real change to the library.
const NOISE_FILE = /^(hub\.log|hub\.err\.log|watchdog\.log|scan\.json)(\.\d+)?$/i;

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
const SERVE_DIRS = [
  ...ROOTS.map((r) => r.dir),
  ...USER_RUNTIMES.map((r) => r.dir),
  `${HOME}/.gemini/config`, // Antigravity's global hooks.json -- a sibling of antigravity-cli/
];
function resolveId(id) {
  const abs = posix(id.startsWith('~/') ? path.resolve(HOME, id.slice(2)) : path.resolve(BASE, id));
  const lo = abs.toLowerCase();
  const ok = SERVE_DIRS.some((d) => lo === d.toLowerCase() || lo.startsWith(d.toLowerCase() + '/'));
  if (!ok) return null;
  // The scanner already keeps credential stores out of the tree, but this endpoint is
  // addressed by path rather than by index — a hand-typed /api/file?path=…/keys/… would
  // still read the file. Same deny-list, enforced where the bytes actually leave.
  const segs = posix(path.relative(BASE, abs)).split('/');
  if (segs.some((s) => SECRET_DIRS.has(s.toLowerCase()))) return null;
  if (CREDENTIAL_FILE.test(path.basename(abs))) return null;
  return abs;
}

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
function readHead(file, bytes = 4096) {
  // The fd must close in a finally: a readSync that throws (file locked, or deleted
  // mid-scan) used to strand it, and the watcher calls this thousands of times a day.
  // That leak is what killed the AI Lab hub with EMFILE after four days up on 2026-08-31.
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8');
  } catch (err) { lastReadHeadError = err; return null; }   // null = could not read; '' = read fine, file is empty
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

/** Pull `name`/`description` out of YAML frontmatter, incl. `>-` folded blocks. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let [, key, val] = kv;
    if (val === '>-' || val === '>' || val === '|' || val === '|-') {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      val = parts.join(' ');
    }
    out[key] = val.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** First real sentence of a markdown doc — used as a card blurb. */
// House-style READMEs open with an <h1>/badge-row wrapper and put the actual one-line
// summary inside a plain <p><em>…</em></p> a few lines down (see Mikes_AI_Lab/README.md).
// Unconditionally skipping every line that starts with '<' — the original rule — walked
// straight past that summary and fell through to the first *unwrapped* prose line, which
// on that file was a sub-repo's description, not the workspace's. HTML lines now have
// their tags stripped and are used if real text is left; a heading tag is still skipped
// (it belongs to the title, not the blurb), and a pure-markup line (badge rows, bare
// wrapper tags) still falls through to the next line exactly as before.
export function blurb(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('!')
      || line.startsWith('|') || line.startsWith('```') || line.startsWith('---')) continue;
    if (line.startsWith('<')) {
      if (/^<h[1-6][\s>]/i.test(line)) continue;
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) continue;
      return stripped.replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').slice(0, 240);
    }
    return line.replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').slice(0, 240);
  }
  return '';
}

const mdCell = (c) => (c || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
const mdCellLink = (c) => { const m = /\[[^\]]+\]\(([^)]+)\)/.exec(c || ''); return m ? m[1] : null; };

/** Rows of the first markdown table under a heading matching `headingRe`, or []. */
export function parseLiveSites(text, headingRe = /live sites/i) {
  const lines = text.split(/\r?\n/);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (m && headingRe.test(m[2])) { start = i + 1; level = m[1].length; break; }
  }
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  const tableLines = lines.slice(start, end).filter((l) => /^\s*\|/.test(l));
  if (tableLines.length < 2) return [];
  const split = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const headers = split(tableLines[0]).map((h) => h.toLowerCase());
  const col = (name) => headers.findIndex((h) => h.includes(name));
  const iApp = col('app'), iUrl = col('subdomain') > -1 ? col('subdomain') : col('url');
  const iStatus = col('status'), iStack = col('stack');
  if (iApp === -1 || iUrl === -1) return [];
  return tableLines.slice(1)
    .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map(split)
    .map((cells) => ({
      app: mdCell(cells[iApp]),
      url: mdCellLink(cells[iUrl]) || mdCell(cells[iUrl]),
      status: iStatus > -1 ? mdCell(cells[iStatus]) : '',
      stack: iStack > -1 ? mdCell(cells[iStack]) : '',
    }))
    .filter((s) => s.app && s.url);
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
  dir: pictureRoot.dir, id: pictureRoot.dir ? rel(pictureRoot.dir) : 'Pictures', classify: kindOfFile,
  allow: (name, directory) => directory
    ? !SKIP_DIRS.has(name) && !SECRET_DIRS.has(name.toLowerCase()) && (!name.startsWith('.') || DOT_OK.has(name))
    : !CREDENTIAL_FILE.test(name) && !/^\.env(?:$|\.)/i.test(name),
});

// ── scan ───────────────────────────────────────────────────────────────────
function scanTree() {
  const repos = [];
  const runtimes = [];
  const flat = [];
  const artifacts = [];
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

      if (e.isDirectory()) {
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
          node.children = depth < MAX_DEPTH
            ? walk(full, depth + 1, { ...ctx, section: null, bucket: null, repo: id, group: node.group })
            : [];
          if (node.children.more) node.more = node.children.more;
          if (node.children.length) node.badge = node.children.length; else delete node.children;
          repos.push(node);
          out.push(node); flat.push(node);
          continue;
        }

        // Repos/Draft/ is pre-repo R&D by convention (see the workspace's own CLAUDE.md)
        // -- no `.git`, so `isRepo` above never fires, and it would otherwise fall through
        // to a plain, unfiltered `folder` walk: every source file included, invisible to
        // the Repos table and its git-state stats, and absent from the overview entirely
        // (#34). Giving it its own kind and the same doc-only filtering a real repo gets
        // is the fix -- collected into `drafts` for a dedicated overview card cluster.
        if (!isCli && ctx.group === 'Draft' && depth === 2) {
          const node = leaf(id, e.name, 'draft', full, '');
          const readme = childNames.find((n) => /^readme\.md$/i.test(n));
          if (readme) {
            const d = describe(path.join(full, readme), e.name).desc;
            if (d) node.desc = d;
            node.doc = rel(path.join(full, readme));
            node.docFirst = true;   // a draft renders through viewFolder, so the same rule applies
          }
          node.children = depth < MAX_DEPTH
            ? walk(full, depth + 1, { ...ctx, section: null, bucket: null, repo: id })
            : [];
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
        else if (ctx.section === 'Repos' && depth === 1) { kind = 'group'; nextCtx.group = e.name; }
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
        node.children = depth < MAX_DEPTH ? walk(full, depth + 1, nextCtx) : [];
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
        // DOC_FILE already recognizes .html generally, so isArtifactHtml no longer gates
        // whether an .html file is visible at all -- it only decides whether this one
        // additionally gets collected for the overview's Artifacts shelf (below), which
        // is meant to surface interactive dashboards specifically, not every report
        // export sitting next to a markdown summary.
        const dirName = path.basename(dir);
        const isArtifactHtml = ARTIFACT_DIRS.has(dirName.toLowerCase()) && /\.html?$/i.test(e.name);
        if (ctx.repo && !isArtifactHtml && (!DOC_FILE.test(e.name) || SECRET_FILE.test(e.name))) { hidden++; continue; }
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
        if (isArtifactHtml) artifacts.push({ id, name: e.name, repo: ctx.repo || '', folder: dirName, size: node.size });
        out.push(node); flat.push(node);
      }
    }
    out.more = hidden;
    return out;
  }

  function buildRootNode(r, shared) {
    if (r.name === 'Pictures') { const node = pictures.root(); flat.push(node); return node; }
    const node = leaf(rel(r.dir), r.name, r.name === 'Documents' ? 'docroot' : 'root', r.dir, '');
    node.children = walk(r.dir, 0, { rootDir: r.dir, section: null, cli: null, inConfig: false, bucket: null });
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
  const projectNodes = PROJECTS.map((p) => buildRootNode(p));
  const sharedNodes = SHARED_ROOTS.map((r) => buildRootNode(r, true));

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
    for (const rt of USER_RUNTIMES) {
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
        // depth 4 leaves three levels of headroom under MAX_DEPTH and keeps every
        // `depth === 0/1` special case in walk() from firing on a user subtree.
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

  return { tree, repos, runtimes, flat, artifacts, drafts };
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

// git is ~90% of scan time (2 spawns × 32 repos). A short TTL keeps watcher-driven
// rescans instant; the rescan button passes fresh=1 to bypass it.
// ponytail: time-based cache, swap for .git mtime invalidation if 15s ever feels stale.
const gitCache = new Map();
const GIT_TTL = 15_000;

async function gitStateCached(repo, fresh) {
  const hit = gitCache.get(repo.abs);
  if (!fresh && hit && Date.now() - hit.at < GIT_TTL) return hit.val;
  const val = await gitState(repo);
  gitCache.set(repo.abs, { at: Date.now(), val });
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

const DOT = { clean: 'var(--green)', dirty: 'var(--orange)', behind: 'var(--blue)', ahead: 'var(--blue)', conflict: 'var(--red)' };

/**
 * Which repos reach the overview table, per project, unioned into one list. Mikes_AI_Lab
 * names its four Repos/ groups so runtime and scaffold repos stay in the tree only;
 * Mike_IAM and Mike_Finance keep their repos directly under Repos/ with no group tier, so
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
async function scan(fresh = false) {
  const t0 = Date.now();
  const { tree, repos, runtimes, flat, artifacts, drafts } = scanTree();
  const walkMs = Date.now() - t0;

  await Promise.all(repos.map(async (r) => {
    Object.assign(r, await gitStateCached(r, fresh));
    r.dot = DOT[r.state] || TINT.file;
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
  // folder. Mikes_AI_Lab names Agents/README.md as the vendor-neutral contract every
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
  // have such a table (Mike_IAM and Mike_Finance don't), read fresh each scan. Also
  // used to check only ROOTS[0]; now checks every project. Tagged with `project` since
  // a parsed table row has no tree id of its own for the client to scope by ancestry.
  const liveSites = PROJECTS.flatMap((p) => {
    try {
      return parseLiveSites(fs.readFileSync(path.join(p.dir, 'README.md'), 'utf8'))
        .map((s) => ({ ...s, project: p.name }));
    }
    catch { return []; /* no root README, or unreadable — an empty list just hides the section */ }
  });

  // .html files found under an artifacts/dashboards/prototypes folder (#31) — surfaced
  // on the overview so an interactive dashboard doesn't require finding its repo first.
  const repoNameById = new Map(repos.map((r) => [r.id, r.name]));
  const artifactList = artifacts.map((a) => ({
    id: a.id, name: a.name, folder: a.folder, size: a.size,
    repoName: repoNameById.get(a.repo) || '',
  }));

  // Pre-repo R&D under Repos/Draft/ (#34) — no git state to show, so a lighter list than
  // `repos`: just enough to card it on the overview and jump to its folder page.
  const draftList = drafts.map((d) => ({ id: d.id, name: d.name, desc: d.desc || '' }));

  // Modification times cover equal-byte-count edits, including bucket entry docs.
  const sig = scanSignature(flat, repos);

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
    home: HOME,
    roots: ROOTS.map((r) => ({ name: r.name, dir: r.dir })),
    tree, stats, rootDocs, liveSites, artifacts: artifactList, drafts: draftList,
    runtimes: runtimes.map((r) => ({
      id: r.id, name: r.name, desc: r.desc, config: r.config, counts: r.counts,
      scope: r.scope || 'project', mcp: (r.mcp || []).length, plugins: (r.plugins || []).length,
    })),
    repos: appRepos.map((r) => ({
      id: r.id, name: r.name, group: r.group, branch: r.branch, state: r.state,
      dot: r.dot, commit: r.commit, ago: r.ago,
    })),
  };
}

// ── raw HTML in markdown ───────────────────────────────────────────────────
// House-style READMEs open with raw HTML -- logo hero, centred title, badge row --
// and escaping that turns the top of every doc into noise, so block HTML passes
// through. What passes is *rebuilt*, not filtered.
//
// The filter this replaced pattern-matched dangerous bits out of the original text,
// which meant anything the patterns did not anticipate survived verbatim. Two ways
// through it, both reproduced against the running hub in the August audit:
// `<img/onerror=...>` (the handler-stripping regex wanted whitespace before the
// handler, and HTML accepts `/` as a separator), and any tag split across lines (the
// filter ran line by line, so only the first line was ever examined).
//
// Rebuilding inverts the burden: a tag has to be on the list to survive, an attribute
// has to be on the list to exist, and every value is re-quoted and re-escaped. There is
// no original text left for a trick to hide in.
const HTML_TAGS = new Set(('a b blockquote br center code details div em h1 h2 h3 h4 h5 h6 '
  + 'hr i img kbd li ol p picture pre small source span strong sub summary sup table '
  + 'tbody td th thead tr ul').split(' '));

const GLOBAL_ATTRS = new Set(['align', 'id', 'title']);
const TAG_ATTRS = {
  a: new Set(['href', 'name', 'rel', 'target']),
  img: new Set(['alt', 'height', 'loading', 'src', 'width']),
  source: new Set(['media', 'src', 'srcset', 'type']),
  td: new Set(['colspan', 'rowspan', 'valign']),
  th: new Set(['colspan', 'rowspan', 'valign']),
  ol: new Set(['start']),
  details: new Set(['open']),
};
const URL_ATTRS = new Set(['href', 'src', 'srcset']);

/** http, https, mailto, or no scheme at all (relative paths and #anchors). */
function safeUrl(value) {
  // Control characters and stray whitespace inside a scheme are a classic way to smuggle
  // `java\tscript:` past a naive check; browsers ignore them, so strip before testing.
  const v = value.replace(/[\u0000-\u0020]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  return !scheme || /^(https?|mailto)$/i.test(scheme[1]);
}

const attrEsc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rebuild a chunk of raw HTML from allowlisted tags and attributes only. */
export function sanitizeHtml(chunk) {
  const stripped = chunk
    // Dropping only the tags would leave the body of a <script> on the page as text.
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style)\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  return stripped.replace(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g,
    (_m, close, tag, attrs) => {
      const t = tag.toLowerCase();
      if (!HTML_TAGS.has(t)) return '';
      if (close) return `</${t}>`;

      const allowed = TAG_ATTRS[t];
      const keep = [];
      for (const a of attrs.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        const name = a[1].toLowerCase();
        if (!GLOBAL_ATTRS.has(name) && !(allowed && allowed.has(name))) continue;
        const value = a[3] ?? a[4] ?? a[5] ?? '';
        if (URL_ATTRS.has(name) && !safeUrl(value)) continue;
        keep.push(a[2] === undefined ? name : `${name}="${attrEsc(value)}"`);
      }
      return `<${t}${keep.length ? ' ' + keep.join(' ') : ''}>`;
    });
}

/** Does this line open or close a tag we let through? */
const isBlockHtml = (l) => {
  const m = /^\s*<\/?([a-zA-Z][\w-]*)/.exec(l);
  return Boolean(m) && HTML_TAGS.has(m[1].toLowerCase());
};

// GitHub's heading-slug algorithm: lowercase, drop markup down to plain text, strip
// anything that is not a letter/digit/space/hyphen/underscore, then turn every *space*
// (not run of spaces) into its own hyphen — a heading like "Phase 0 — what shipped"
// has the em dash removed but both flanking spaces survive, so it slugs to
// "phase-0--what-shipped" with the double hyphen every doc in this repo already links
// to. Repeats of the same heading text get -1, -2, … appended, matching GitHub.
export function slugifyHeading(text, seen) {
  let s = text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .replace(/ /g, '-');
  if (!s) s = 'section';
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n === 0 ? s : `${s}-${n}`;
}

// GitHub alert-callout kinds, in the order GitHub itself checks them.
const ALERT_KINDS = new Set(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);

// A light, single-pass token highlighter — not a per-language lexer. One shared
// keyword list across JS/Python/PowerShell/Bash, matched line by line, so a block
// comment or triple-quoted string that spans lines is not recognised as one token.
// ponytail: naive per-line highlighting, upgrade to a real lexer (e.g. per-fence-language
// grammar) if code blocks with multi-line strings/comments start looking wrong.
const CODE_KEYWORDS = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'of', 'in', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'try', 'catch',
  'finally', 'throw', 'async', 'await', 'typeof', 'instanceof', 'null', 'undefined', 'true',
  'false', 'this', 'continue', 'break', 'switch', 'case', 'do', 'yield', 'static', 'def', 'elif',
  'pass', 'not', 'and', 'or', 'is', 'lambda', 'with', 'as', 'raise', 'except', 'param', 'foreach',
  'begin', 'process', 'end'];
const CODE_TOKEN_RE = new RegExp(
  '(//.*$|#.*$|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`|'
  + `\\b(?:${CODE_KEYWORDS.join('|')})\\b|\\b\\d+(?:\\.\\d+)?\\b)`, 'g');
/** Runs over an already-HTML-escaped line, so the delimiters it matches on (", ', #, //,
 *  word boundaries) are untouched by escaping and nothing needs re-escaping in the callback. */
function highlightCode(escapedLine) {
  return escapedLine.replace(CODE_TOKEN_RE, (m) => {
    if (m.startsWith('//') || m.startsWith('#')) return `<span class="tok-c">${m}</span>`;
    if (/^["'`]/.test(m)) return `<span class="tok-s">${m}</span>`;
    if (/^\d/.test(m)) return `<span class="tok-n">${m}</span>`;
    return `<span class="tok-k">${m}</span>`;
  });
}

// ── markdown → html (small on purpose) ─────────────────────────────────────
export function md2html(src) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // YAML frontmatter is vault metadata, not content - drop it instead of showing it.
  const body = src.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const out = [];
  const lines = body.split(/\r?\n/);
  let inCode = false, listType = null, para = [];
  const headingSlugs = new Map();
  // Raw HTML is accumulated rather than handled a line at a time: the badge rows in a
  // house-style README routinely split one tag over several lines, and filtering half a
  // tag is how the old version let the other half through untouched.
  let htmlBuf = null, htmlLines = 0;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const flushHtml = () => {
    if (htmlBuf === null) return;
    out.push(sanitizeHtml(htmlBuf));
    htmlBuf = null; htmlLines = 0;
  };
  // Consecutive `>` lines are one blockquote, not one per line — and a `[!NOTE]`-style
  // first line makes the whole thing a GitHub-style alert box instead.
  let quoteBuf = null;
  const flushQuote = () => {
    if (quoteBuf === null) return;
    const lines = quoteBuf; quoteBuf = null;
    const kind = /^\[!([a-z]+)\]\s*$/i.exec(lines[0].trim())?.[1]?.toUpperCase();
    if (kind && ALERT_KINDS.has(kind)) {
      const paras = [];
      let cur = [];
      for (const l of lines.slice(1)) {
        if (!l.trim()) { if (cur.length) paras.push(cur.join(' ')); cur = []; }
        else cur.push(l.trim());
      }
      if (cur.length) paras.push(cur.join(' '));
      const body = paras.map((p) => `<p>${inline(p)}</p>`).join('');
      out.push(`<div class="alert alert-${kind.toLowerCase()}"><p class="alert-label">${kind}</p>${body}</div>`);
    } else {
      out.push(`<blockquote>${lines.map((l) => inline(l)).join('<br>')}</blockquote>`);
    }
  };

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" data-md-link>$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  for (const line of lines) {
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      flushPara(); closeList(); flushQuote();
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { out.push(`<pre class="code"><code>`); inCode = true; }
      continue;
    }
    if (inCode) { out.push(highlightCode(esc(line)) + '\n'); continue; }

    if (htmlBuf === null && isBlockHtml(line)) { flushPara(); closeList(); flushQuote(); htmlBuf = ''; }
    if (htmlBuf !== null) {
      htmlBuf += (htmlBuf ? '\n' : '') + line;
      htmlLines++;
      // Still inside a tag? Keep reading. The line cap stops a stray '<' in prose from
      // swallowing the rest of the document.
      if (htmlBuf.lastIndexOf('<') > htmlBuf.lastIndexOf('>') && htmlLines < 25) continue;
      flushHtml();
      continue;
    }

    if (!line.trim()) { flushPara(); closeList(); flushQuote(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); closeList(); flushQuote();
      const slug = slugifyHeading(h[2], headingSlugs);
      out.push(`<h${h[1].length} id="${attrEsc(slug)}">${inline(h[2])}</h${h[1].length}>`);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushPara(); closeList(); flushQuote(); out.push('<hr>'); continue; }

    const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flushPara(); flushQuote();
      const want = /^\d/.test(li[1]) ? 'ol' : 'ul';
      if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flushPara(); closeList(); flushQuote();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<td>${inline(c.trim())}</td>`);
      out.push(`<table-row>${cells.join('')}</table-row>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara(); closeList();
      if (quoteBuf === null) quoteBuf = [];
      quoteBuf.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }

    flushQuote();
    para.push(line.trim());
  }
  flushHtml(); flushPara(); closeList(); flushQuote();
  if (inCode) out.push('</code></pre>');

  return out.join('\n')
    .replace(/(<table-row>[\s\S]*?<\/table-row>\n?)+/g, (m) => `<table><tbody>${m.replace(/table-row/g, 'tr')}</tbody></table>`);
}

// ── security headers ───────────────────────────────────────────────────────
// The markdown renderer passes block HTML through a regex filter, and a regex filter
// on HTML is a best-effort thing -- `<img/onerror=...>` defeated the one in sanitize()
// because it anchors on whitespace before the handler. A script-src without
// 'unsafe-inline' makes that whole class inert regardless of what gets past the filter,
// so the two inline scripts in index.html carry a per-request nonce instead.
// Fonts are the only third-party origin; img-src allows https: for README badges.
// index.html is shared, so the two things that identify this hub are substituted at
// serve time rather than living in three near-identical copies of the file, as they
// used to before there was only one process to identify.

const favicon = ({ glyph, ink, line }) => 'data:image/svg+xml,'
  + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
  + "<rect width='32' height='32' rx='6' fill='%230a0c0e'/>"
  + `<rect x='.5' y='.5' width='31' height='31' rx='5.5' fill='none' stroke='${line.replace('#', '%23')}'/>`
  + "<text x='16' y='24' font-family='ui-monospace,monospace' font-size='21' font-weight='700' "
  + `text-anchor='middle' fill='${ink.replace('#', '%23')}'>${glyph}</text></svg>`;

const csp = (nonce) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// ── server ─────────────────────────────────────────────────────────────────
const PORT = argOf('--port') ? +argOf('--port') : CONFIG.port;

if (IS_MAIN && argv.includes('--scan')) {
  const data = await scan();
  fs.writeFileSync(path.join(HUB_DIR, 'scan.json'), JSON.stringify(data, null, 1));
  console.log(`scanned ${data.repos.length} repos in ${data.ms}ms → ${path.join(HUB_DIR, 'scan.json')}`);
  process.exit(0);
}

const sse = new Set();

// A scan is a synchronous 15k-path walk plus ~1300 doc reads — it blocks the event
// loop, so letting every request run its own serialises them into a queue that never
// drains under watcher churn. Instead: one scan at a time, its serialised JSON reused
// until the watcher says the library actually moved.
let cached = null;          // { json, gzip, at }
let dirty = true;
let scanning = null;
const STARTED = Date.now();
// Rolling record of what the last few scans cost, so /api/health can show a trend rather
// than a single number. The 2026-08-31 outage was invisible partly because nothing kept
// any history at all.
const scanLog = [];
let scanCount = 0, watcherTicks = 0, readErrorsAtLastScan = 0;

function rescan(fresh) {
  if (scanning) return scanning;
  scanning = scan(fresh)
    .then((data) => {
      const serializeStart = Date.now();
      const json = JSON.stringify(data);
      const serializeMs = Date.now() - serializeStart;
      const gzipStart = Date.now();
      // The tree is ~5MB of highly repetitive path strings. Gzip once per scan, not
      // once per request — it takes 5.1MB down to ~0.6MB.
      cached = { json, gzip: zlib.gzipSync(json, { level: 6 }), at: Date.now() };
      const gzipMs = Date.now() - gzipStart;
      dirty = false;
      scanCount++;
      // Read failures per scan, not since boot. A lifetime counter with a fixed
      // threshold turns any long-running hub unhealthy eventually -- a few transient
      // failures per scan is normal (files being written as the walk goes past), and it
      // is the *rate* that distinguishes that from a descriptor leak.
      const errsThisScan = readErrors - readErrorsAtLastScan;
      readErrorsAtLastScan = readErrors;
      scanLog.push({ at: cached.at, ms: data.ms, bytes: json.length, gzip: cached.gzip.length, nodes: data.nodes, errs: errsThisScan, timings: { ...data.timings, serializeMs, gzipMs } });
      if (scanLog.length > 10) scanLog.shift();
      return cached;
    })
    .finally(() => { scanning = null; });
  return scanning;
}

/**
 * Always serve the last built payload. The walk is synchronous, so kicking off a
 * refresh here would block the very response we're trying to send — and the watcher
 * already schedules one 2.5s after any real change, then pings the page. The rescan
 * button (`fresh`) is the only caller that waits for a fresh walk.
 */
async function scanJson(fresh) {
  if (fresh || !cached) return rescan(fresh);
  return cached;
}

// A page on any origin can point a request at 127.0.0.1, and an attacker's domain can be
// re-resolved to it (DNS rebinding) to become same-origin. Neither survives a Host check:
// a rebound request still carries the attacker's hostname.
const HOSTS_OK = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);

// Browsers label every request's relationship to the page that made it. Anything a
// foreign page triggers reads `cross-site` or `same-site`; our own fetch reads
// `same-origin`, a typed URL reads `none`, and non-browser clients send nothing at all.
const sameOrigin = (req) => {
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
};

const handleReport = createReportHandler({ resolveId, toId: rel });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (!HOSTS_OK.has(req.headers.host || '')) {
    res.writeHead(403, { 'content-type': 'text/plain' })
      .end(`unexpected Host header "${req.headers.host || ''}" - this hub only answers to loopback`);
    return;
  }

  // Set before routing so every response carries them; a later writeHead() object
  // wins on any name it repeats, which none of them do.
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('content-security-policy', csp(nonce));
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');

  // HUB_DEBUG=1 node hub.mjs — per-request timing, useful when the page feels slow.
  if (process.env.HUB_DEBUG) {
    const t0 = Date.now();
    res.on('finish', () => console.log(`[req] ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`));
  }

  if (url.pathname === '/api/scan') {
    const { json, gzip } = await scanJson(url.searchParams.get('fresh') === '1');
    const wantsGzip = /gzip/.test(req.headers['accept-encoding'] || '');
    const head = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (wantsGzip) head['content-encoding'] = 'gzip';
    res.writeHead(200, head);
    res.end(wantsGzip ? gzip : json);
    return;
  }

  // Nothing was watching the hub when it died of a descriptor leak on 2026-08-31; the
  // first anyone knew was a dead browser tab hours later. This is what a watchdog reads.
  if (url.pathname === '/api/health') {
    const last = scanLog[scanLog.length - 1] || null;
    const mem = process.memoryUsage();
    const warming = !cached && (Date.now() - STARTED) < 180000;
    // A leak shows up as failures on every scan and climbing; ordinary churn is a
    // handful. Judge the recent rate, never the total.
    const recentErrs = scanLog.slice(-3).reduce((n, x) => n + (x.errs || 0), 0);
    const body = {
      ok: recentErrs < 300 && (Boolean(cached) || warming),
      state: cached ? 'ready' : warming ? 'warming' : 'stalled',
      workspace: PROJECTS.map((p) => p.name).join(', ') || CONFIG.name,
      port: PORT,
      pid: process.pid,
      uptimeSec: Math.round((Date.now() - STARTED) / 1000),
      node: process.version,
      scans: scanCount,
      watcherTicks,
      sseClients: sse.size,
      // A climbing readErrors count is the fingerprint of the descriptor leak that
      // killed this process once already. Steady near zero is healthy.
      pictures: pictures.health(),
      readErrors,                     // since start; informational only
      readErrorsRecent: recentErrs,   // across the last 3 scans -- this is what `ok` uses
      // The paths behind those counts, newest last. Relative ids, so the UI can link them.
      readErrorPaths: [...readErrorLog].map(([file, e]) => ({ path: rel(file), code: e.code, at: e.at })),
      descCache: descCache.size,
      lastScan: last && {
        at: new Date(last.at).toISOString(),
        ageSec: Math.round((Date.now() - last.at) / 1000),
        ms: last.ms,
        timings: last.timings,
        nodes: last.nodes,
        mb: +(last.bytes / 1048576).toFixed(2),
        gzipMb: +(last.gzip / 1048576).toFixed(2),
      },
      recentScanMs: scanLog.map((x) => x.ms),
      recentScanErrs: scanLog.map((x) => x.errs || 0),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
    };
    res.writeHead(body.ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body, null, 1));
    return;
  }

  if (url.pathname === '/api/pictures') {
    if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end('method not allowed'); return; }
    try {
      const action = url.searchParams.get('action') || 'browse';
      if (!['browse', 'search', 'status'].includes(action)) { res.writeHead(400).end('unknown Pictures action'); return; }
      const data = action === 'status' ? pictures.health() : action === 'search'
        ? await pictures.search({ q: url.searchParams.get('q') || '', kind: url.searchParams.get('kind') || '', offset: url.searchParams.get('offset'), limit: url.searchParams.get('limit') })
        : await pictures.resolve(url.searchParams.get('path') || pictures.id);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
    } catch (err) { res.writeHead(err.status || 404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.status ? err.message : 'Pictures folder unavailable' })); }
    return;
  }

  if (await handleReport(req, res, url)) return;

  if (url.pathname === '/api/file') {
    const p = url.searchParams.get('path') || '';
    const abs = resolveId(p);
    if (!abs) { res.writeHead(403).end('outside roots'); return; }
    if (['pdf', 'image'].includes(kindOfFile(abs))) { res.writeHead(415).end('binary file: use preview or download'); return; }
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch { res.writeHead(404).end('not found'); return; }
    // `raw` used to ride along with every response and no client ever read it -- 44% of
    // the bytes on a large README. The view-source toggle that comment anticipated now
    // exists, and asks for it explicitly here rather than in every reply.
    const asSource = url.searchParams.get('raw') === '1' || !/\.md$/i.test(abs);
    const payload = asSource
      ? { html: `<pre class="code"><code>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code></pre>` }
      : { html: md2html(text) };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname === '/api/stat') {
    const abs = resolveId(url.searchParams.get('path') || '');
    if (!abs) { res.writeHead(403).end('outside roots'); return; }
    const times = folderStamps(abs);
    if (!times) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(times));
    return;
  }

  if (url.pathname === '/api/open') {
    // The only endpoint with a side effect outside the browser -- it shells out. A GET,
    // so a foreign page's <img src="...:4273/api/open?path=..."> would fire it without
    // ever needing to read the response.
    if (!sameOrigin(req)) { res.writeHead(403).end('cross-origin request refused'); return; }
    const abs = resolveId(url.searchParams.get('path') || '');
    if (!abs) { res.writeHead(403).end('outside roots'); return; }
    if (!fs.existsSync(abs)) { res.writeHead(404).end('path no longer exists'); return; }
    const destination = url.searchParams.get('in');
    if (destination && destination !== 'code') { res.writeHead(400).end('unsupported destination'); return; }
    try {
      await launchNative(abs, destination === 'code' ? 'code' : url.searchParams.get('reveal') === '1' ? 'reveal' : 'default');
      res.writeHead(204).end();
    } catch (err) { res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end(err.message); }
    return;
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    sse.add(res);
    // Heartbeat so proxies and idle-socket reapers leave the stream alone.
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(beat); sse.delete(res); });
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const abs = path.join(HERE, file);
  if (!abs.startsWith(HERE) || !fs.existsSync(abs)) { res.writeHead(404).end('not found'); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(abs)] || 'text/plain';
  res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  // index.html carries placeholders for the per-request nonce and the two per-hub
  // values; every other static file is served byte-for-byte.
  res.end(path.extname(abs) === '.html'
    ? fs.readFileSync(abs, 'utf8')
      .split('%NONCE%').join(nonce)
      .split('%TITLE%').join(CONFIG.title)
      .split('%FAVICON%').join(favicon(CONFIG.favicon))
      .split('%PORT%').join(String(PORT))
    : fs.readFileSync(abs));
});

// ── watcher: notify the page when the library changes ──────────────────────

/**
 * Should this raw watcher event be ignored?
 *
 * Three reasons to drop one. Build output, virtualenvs and git internals are churn we
 * never index. Our own logs sit inside a scanned root, so writing them looked exactly
 * like the library changing. And a *directory-named* event carries no information at
 * all: Windows reports the parent directory alongside the file, so
 * `Agent-Chat/db/.sync-state.json` -- which the DB sync rewrites every couple of
 * seconds, and which the dot-prefix rule already drops -- arrived a second time as a
 * bare `Agent-Chat/db` that nothing could recognise as noise. That alone was driving a
 * full rescan roughly every 8 seconds on a completely idle machine, each one 2-3s of
 * blocked event loop.
 *
 * Dropping directory events is safe because a real file change always fires a
 * file-named event too. The one thing it gives up: creating an *empty* directory no
 * longer shows up until something else triggers a scan. A directory with anything in it
 * fires events for its contents and appears normally. A *deleted* directory still
 * reports, because the stat fails rather than saying "directory".
 */
export function ignoreWatchEvent(dir, name) {
  if (!name) return true;
  const parts = posix(name).split('/');
  if (parts.some((p) => SKIP_DIRS.has(p) || p === '.git' || (p.startsWith('.') && !DOT_OK.has(p)))) return true;
  if (NOISE_FILE.test(parts[parts.length - 1])) return true;
  try { return fs.statSync(path.join(dir, name)).isDirectory(); }
  catch { return false; }        // gone, or unreadable -- that is a real change
}

// Guarded by IS_MAIN below: importing this module for tests must not spawn watchers.
let timer = null;
function bump(why) {
  dirty = true;
  watcherTicks++;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    // Build the new payload before announcing it, or every client races in and gets
    // handed the same stale copy it already has.
    await rescan(false).catch(() => {});
    for (const res of sse) res.write(`event: change\ndata: ${JSON.stringify({ why })}\n\n`);
  }, 2500);
}

const WATCH = [
  ...ROOTS.map((r) => r.dir),
  // Only the artifact sub-dirs — ~/.claude as a whole churns on every session write.
  ...USER_RUNTIMES.flatMap((rt) => rt.dirs.map((d) => `${rt.dir}/${d}`)),
].filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });

let pictureTimer;
if (IS_MAIN) for (const dir of WATCH) {
  try {
    fs.watch(dir, { recursive: true, persistent: false }, (_evt, name) => {
      if (dir === pictureRoot.dir) {
        // OneDrive emits directory metadata 'change' events while folders are read.
        // Keep rename events (including new empty folders), but don't invalidate
        // the search index because its own enumeration touched directory metadata.
        if (ignorePictureEvent(_evt, name && safeIsDir(path.join(dir, String(name))))) return;
        const parts = posix(String(name || '')).split('/');
        if (parts.some((p) => SKIP_DIRS.has(p) || SECRET_DIRS.has(p.toLowerCase()) || (p.startsWith('.') && !DOT_OK.has(p)))) return;
        pictures.invalidate();
        clearTimeout(pictureTimer);
        pictureTimer = setTimeout(() => {
          for (const response of sse) response.write(`event: pictures\ndata: ${JSON.stringify({ version: pictures.version })}\n\n`);
        }, 500);
        return;
      }
      if (ignoreWatchEvent(dir, name)) return;
      bump(posix(name));
    });
  } catch (e) {
    console.warn(`watch failed for ${dir}: ${e.message}`);
  }
}

// Node closes idle keep-alive sockets after 5s by default. Browsers happily reuse a
// socket for longer than that, and a request sent onto one the server just closed is
// silently lost — the page hangs on "scanning…" while curl works fine. Outliving the
// browser's reuse window is the standard fix.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — the hub may already be running at http://127.0.0.1:${PORT}`);
    console.error(`Use --port <n> to run a second instance.`);
    process.exit(1);
  }
  throw e;
});

if (IS_MAIN) server.listen(PORT, '127.0.0.1', () => {
  console.log(`Project Hub (${CONFIG.name}) → http://127.0.0.1:${PORT}`);
  console.log(`config: ${CONFIG_FILE}   health: http://127.0.0.1:${PORT}/api/health`);
  console.log(`watching: ${WATCH.length} paths — ${ROOTS.map((r) => r.dir).join('  ')} + user scope`);
  // Warm the cache so the first page load doesn't pay for 20 repos of git.
  scanJson(true).then((c) => console.log(
    `warm: ${(c.json.length / 1048576).toFixed(1)}MB → ${(c.gzip.length / 1048576).toFixed(2)}MB gzip`));
});
