#!/usr/bin/env node
/**
 * Build the static demo site.
 *
 * Project Hub is a local server that reads a real filesystem, so a hosted demo cannot be
 * the real thing. This builds the next closest: it stands the *actual* hub up against the
 * fixture workspace in `Demo/Workspace`, crawls every API response it produces, and writes
 * them out as flat files next to an unmodified copy of the interface.
 *
 * Nothing here reimplements the scanner. If the scanner changes, the demo changes with it.
 *
 * Usage:  node Demo/build-demo.mjs [--keep]
 *         --keep  leave Demo/.build in place afterwards (for debugging the fixture)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const BUILD = path.join(HERE, '.build');
const SITE = path.join(HERE, 'site');
const PORT = 4399;
const KEEP = process.argv.includes('--keep');

// ── the fixture hub's shape ────────────────────────────────────────────────
// Written into .build at build time rather than committed, so the configs never carry an
// absolute path that is only true on one machine.
const SERVER_CONFIG = {
  name: 'Portfolio',
  port: PORT,
  title: 'Project Hub — demo',
  favicon: { glyph: '/', ink: '#5fe3a1', line: '#2f6b52' },
  sharedRoots: [
    { name: 'Documents', dir: 'Documents', tint: 'var(--red)' },
    { name: 'Automations', dir: 'Automations', tint: 'var(--blue)' },
  ],
};

const PROJECT_CONFIGS = [
  { name: 'Example_Workspace', repoScope: { groups: ['Live_Apps', 'Tools', 'Draft'] } },
  { name: 'Finance_Workspace', repoScope: { pathPrefix: 'Projects/Finance_Workspace/Repos/' } },
  { name: 'Identity_Workspace', repoScope: { pathPrefix: 'Projects/Identity_Workspace/Repos/' } },
];

/**
 * Which fixture folders become git repos, and what state the overview should show them in.
 * `state` drives the dot colour and the STATE column: clean, dirty, ahead, behind.
 * Drafts are deliberately absent — `Repos/Draft/` has no `.git` by convention.
 */
const REPOS = [
  { dir: 'Projects/Example_Workspace/Repos/Live_Apps/atlas-web', branch: 'main', state: 'dirty',
    author: 'R. Okonkwo', commit: 'Split the export segment out of the app shell' },
  { dir: 'Projects/Example_Workspace/Repos/Live_Apps/signal-api', branch: 'main', state: 'ahead',
    author: 'D. Halloran', commit: 'Bound the export worker pool from config' },
  { dir: 'Projects/Example_Workspace/Repos/Tools/studio-kit', branch: 'main', state: 'clean',
    author: 'M. Farrow', commit: 'Add the semantic token tier' },
  { dir: 'Projects/Example_Workspace/Repos/Tools/data-lens', branch: 'main', state: 'clean',
    author: 'M. Farrow', commit: 'Stream the summary command instead of buffering' },
  { dir: 'Projects/Finance_Workspace/Repos/ledger-sync', branch: 'main', state: 'behind',
    author: 'A. Villanueva', commit: 'Resolve posted_at against the account zone' },
  { dir: 'Projects/Finance_Workspace/Repos/rate-watch', branch: 'main', state: 'clean',
    author: 'A. Villanueva', commit: 'Store every provider response, including outliers' },
  { dir: 'Projects/Identity_Workspace/Repos/access-review', branch: 'main', state: 'clean',
    author: 'T. Behrens', commit: 'Report grants with no live justification' },
];

// ── helpers ────────────────────────────────────────────────────────────────
const log = (...a) => console.log('[demo]', ...a);
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
/** Empty a directory without removing it — a shell or an editor sitting in the output
 *  folder holds a handle on the directory itself, and deleting it then fails with EPERM. */
const clear = (p) => {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p)) rm(path.join(p, e));
};
const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

/** A fixture-wide identity, so no commit in the demo carries a real person's name or address. */
const GIT_ENV = (author) => ({
  ...process.env,
  GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: 'team@example.dev',
  GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: 'team@example.dev',
  GIT_CONFIG_GLOBAL: path.join(BUILD, 'gitconfig'), GIT_CONFIG_SYSTEM: path.join(BUILD, 'gitconfig'),
});

const git = (cwd, args, author = 'Demo') =>
  execFileSync('git', args, { cwd, env: GIT_ENV(author), stdio: 'pipe', encoding: 'utf8' });

/**
 * A static path for one workspace id. Deterministic and computed the same way on both
 * sides (see the DEMO_RAW shim), because an <img src> cannot wait for a manifest to load.
 */
const slug = (id) => id.replace(/[^A-Za-z0-9._-]/g, '_');

/** Request key. `fresh` and `download` change nothing about the bytes, so they are dropped. */
function keyOf(pathname, params = {}) {
  const entries = Object.entries(params).filter(([k]) => k !== 'fresh' && k !== 'download');
  entries.sort(([a], [b]) => a.localeCompare(b));
  return pathname + '|' + entries.map(([k, v]) => `${k}=${v}`).join('&');
}

// ── 1. stage the fixture ───────────────────────────────────────────────────
log('staging fixture …');
rm(BUILD);
fs.mkdirSync(BUILD, { recursive: true });
// An empty file, so the fixture repos below cannot pick up the machine's real git config
// (user identity, signing keys, hooks, templates).
write(path.join(BUILD, 'gitconfig'), '[init]\n\tdefaultBranch = main\n');

const WORKSPACE = path.join(BUILD, 'workspace');
const HOME = path.join(BUILD, 'home');
fs.cpSync(path.join(HERE, 'Workspace'), WORKSPACE, { recursive: true });
fs.cpSync(path.join(HERE, 'Home'), HOME, { recursive: true });

// The hub finds its projects at `<config folder>/../Projects`, so the generated config set
// mirrors the layout the repo's own Project-Hub/ + Projects/ pair uses.
const HUB_ROOT = path.join(BUILD, 'hub');
write(path.join(HUB_ROOT, 'Project-Hub', 'hub.config.json'), JSON.stringify({
  ...SERVER_CONFIG,
  base: WORKSPACE.replace(/\\/g, '/'),
  sharedRoots: SERVER_CONFIG.sharedRoots.map((r) => ({
    ...r, dir: path.join(WORKSPACE, r.dir).replace(/\\/g, '/'),
  })),
}, null, 2));
for (const p of PROJECT_CONFIGS) {
  write(path.join(HUB_ROOT, 'Projects', p.name, 'hub.config.json'), JSON.stringify({
    name: p.name,
    dir: path.join(WORKSPACE, 'Projects', p.name).replace(/\\/g, '/'),
    repoScope: p.repoScope,
  }, null, 2));
}

// ── 2. make the fixture repos real ─────────────────────────────────────────
// The overview's branch / state / last-commit columns come from `git status` and `git log`,
// so a demo without real repositories would show an empty table. Each one gets a bare
// origin as well: ahead and behind are relationships, not properties.
log('initialising fixture repos …');
const ORIGINS = path.join(BUILD, 'origins');
for (const r of REPOS) {
  const dir = path.join(WORKSPACE, r.dir);
  const origin = path.join(ORIGINS, path.basename(r.dir) + '.git');
  fs.mkdirSync(origin, { recursive: true });
  git(BUILD, ['init', '--bare', '--initial-branch', r.branch, origin]);

  git(BUILD, ['init', '--initial-branch', r.branch, dir]);
  git(dir, ['remote', 'add', 'origin', origin.replace(/\\/g, '/')]);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', 'Import the initial documentation set'], r.author);

  git(dir, ['commit', '--allow-empty', '-m', r.commit], r.author);
  git(dir, ['push', '-u', 'origin', r.branch]);

  if (r.state === 'behind') {
    // Publish one more commit, then step the local branch back off it: the upstream now
    // holds something this checkout does not, which is exactly what "behind" means. The
    // reset lands on r.commit, so the LAST COMMIT column still reads as the real work.
    git(dir, ['commit', '--allow-empty', '-m', 'Backfill the September window'], 'C. Adeyemi');
    git(dir, ['push']);
    git(dir, ['reset', '--hard', 'HEAD~1']);
  }

  if (r.state === 'ahead') {
    git(dir, ['commit', '--allow-empty', '-m', 'Tighten the lease deadline'], r.author);
  }
  if (r.state === 'dirty') {
    fs.appendFileSync(path.join(dir, 'README.md'), '\n<!-- work in progress -->\n');
    fs.writeFileSync(path.join(dir, 'NOTES.md'), '# Notes\n\nScratch file, not committed.\n');
  }
}

// ── 3. run the real hub against it ─────────────────────────────────────────
const CONFIG = path.join(HUB_ROOT, 'Project-Hub', 'hub.config.json');
log('starting hub on', PORT, '…');
const hub = spawn(process.execPath, [path.join(REPO, 'Hub', 'hub.mjs'), '--config', CONFIG], {
  // The scanner reads `os.homedir()` for the user-scope CLI roots. Pointing it at the
  // fixture home is what makes the "User CLIs" branch show demo skills rather than yours.
  env: { ...process.env, HOME, USERPROFILE: HOME },
  stdio: ['ignore', 'pipe', 'inherit'],
});
hub.stdout.on('data', (b) => process.stdout.write('[hub] ' + b));

const base = `http://127.0.0.1:${PORT}`;
const get = (p) => fetch(base + p, { headers: { host: `127.0.0.1:${PORT}` } });

async function waitForHub() {
  for (let i = 0; i < 120; i++) {
    try { const r = await get('/api/health'); if (r.status === 200 || r.status === 503) return; }
    catch { /* not listening yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('hub did not come up on ' + base);
}

let exitCode = 0;
try {
  await waitForHub();

  // ── 4. crawl ─────────────────────────────────────────────────────────────
  log('crawling …');
  clear(SITE);
  const manifest = {};
  let n = 0;
  const record = (key, body, ext = 'json') => {
    const file = `api/${String(++n).padStart(4, '0')}.${ext}`;
    write(path.join(SITE, file), body);
    manifest[key] = file;
  };

  const scanRes = await get('/api/scan?fresh=1');
  if (!scanRes.ok) throw new Error('/api/scan answered ' + scanRes.status);
  // The payload carries `base`, `home` and every root's `dir` as absolute paths, and the
  // page shows them ("copy path", the status panel). Those are this build machine's paths,
  // so they are swapped for the generic ones the rest of the repo's examples use. Ids stay
  // relative either way, so nothing but the displayed string changes.
  const scanText = (await scanRes.text())
    .split(JSON.stringify(WORKSPACE.replace(/\\/g, '/')).slice(1, -1)).join('D:/Work')
    .split(JSON.stringify(HOME.replace(/\\/g, '/')).slice(1, -1)).join('C:/Users/demo');
  record(keyOf('/api/scan'), scanText);
  const scan = JSON.parse(scanText);

  const health = await (await get('/api/health')).json();
  delete health.pid;
  record(keyOf('/api/health'), JSON.stringify(health, null, 1));

  /** Every node in the tree, depth first. The payload has no flat list — the page builds
   *  its own index the same way when it loads. */
  const flat = [];
  (function collect(nodes) {
    for (const node of nodes || []) { flat.push(node); collect(node.children); }
  }(scan.tree));

  // Absolute path for a scan id — the same rule resolveId() uses, so "is this a file or a
  // folder" is answered by the filesystem rather than guessed from `kind`.
  const abs = (id) => (id.startsWith('~/') ? path.join(HOME, id.slice(2))
    : id === '~' ? HOME : path.join(WORKSPACE, id));

  const TEXT = /\.(md|mdx|markdown|txt|rst|adoc|json|jsonc|ya?ml|toml|ini|cfg|conf|csv|mjs|js|ps1|sh|vbs)$|^(LICENSE|NOTICE|Dockerfile|Makefile|CNAME)$/i;
  const BINARY = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf|html?)$/i;

  const seen = new Set();
  const slugs = new Map();
  let files = 0, folders = 0, assets = 0;

  for (const node of flat) {
    const id = node.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let st;
    try { st = fs.statSync(abs(id)); } catch { continue; }

    if (st.isDirectory()) {
      const r = await get('/api/stat?path=' + encodeURIComponent(id));
      if (!r.ok) continue;
      record(keyOf('/api/stat', { path: id }), await r.text());
      folders++;
      continue;
    }

    const name = path.basename(id);
    if (TEXT.test(name)) {
      // Two variants: the rendered document and the view-source toggle. Both are one small
      // JSON body, so prebaking both is cheaper than deciding which the visitor will want.
      for (const raw of [false, true]) {
        const r = await get('/api/file?path=' + encodeURIComponent(id) + (raw ? '&raw=1' : ''));
        if (!r.ok) continue;
        record(keyOf('/api/file', raw ? { path: id, raw: '1' } : { path: id }), await r.text());
      }
      files++;
    }
    if (BINARY.test(name)) {
      const r = await get('/api/raw?path=' + encodeURIComponent(id));
      if (!r.ok) continue;
      const s = slug(id);
      if (slugs.has(s)) throw new Error(`slug collision: ${slugs.get(s)} and ${id}`);
      slugs.set(s, id);
      write(path.join(SITE, 'files', s), Buffer.from(await r.arrayBuffer()));
      assets++;
    }
  }
  log(`captured ${folders} folders, ${files} documents, ${assets} assets`);

  write(path.join(SITE, 'api', 'manifest.json'), JSON.stringify(manifest));

  // ── 5. the interface, unmodified except where it must reach the server ───
  for (const f of ['navigation.mjs', 'pictures-client.mjs']) {
    fs.copyFileSync(path.join(REPO, 'Hub', f), path.join(SITE, f));
  }
  fs.copyFileSync(path.join(HERE, 'static', 'demo.js'), path.join(SITE, 'demo.js'));
  if (fs.existsSync(path.join(HERE, 'static', 'CNAME'))) {
    fs.copyFileSync(path.join(HERE, 'static', 'CNAME'), path.join(SITE, 'CNAME'));
  }
  // GitHub Pages otherwise runs the tree through Jekyll, which drops paths beginning with
  // an underscore and adds nothing this site wants.
  write(path.join(SITE, '.nojekyll'), '');

  let html = fs.readFileSync(path.join(REPO, 'Hub', 'index.html'), 'utf8');

  /** Replace an exact literal, failing the build if the source no longer contains it. */
  const sub = (find, replace, expected) => {
    const count = html.split(find).length - 1;
    if (count !== expected) {
      throw new Error(`expected ${expected}x ${JSON.stringify(find.slice(0, 60))} in index.html, found ${count}`);
    }
    html = html.split(find).join(replace);
  };

  // Server-side template values. HUB_PORT deliberately keeps the real default: the page
  // compares it against location.port to decide whether to open an event stream, and on a
  // static host there is nothing to stream from.
  sub('%TITLE%', 'Project Hub — live demo', 1);
  sub('%FAVICON%', 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + '<rect width="32" height="32" rx="7" fill="#0a0c0e" stroke="#2f6b52" stroke-width="2"/>'
    + '<text x="16" y="23" font-family="monospace" font-size="20" fill="#5fe3a1" text-anchor="middle">/</text></svg>'), 1);
  sub('%PORT%', '4273', 1);
  sub(' nonce="%NONCE%"', '', 2);

  // Asset URLs are element attributes, not fetches, so the shim cannot intercept them —
  // they are rewritten to the static path instead. Balanced: only the prefix is replaced,
  // so the call's own closing paren still closes it.
  sub("download.href = '/api/raw?path=' + encodeURIComponent(n.id) + '&download=1';",
    'download.href = DEMO_ASSET(n.id);', 1);
  sub("'/api/raw?path=' + encodeURIComponent(", 'DEMO_ASSET(', 4);
  sub("'/api/preview?path=' + encodeURIComponent(", 'DEMO_ASSET(', 1);

  sub('<script type="module">', '<script src="/demo.js"></script>\n<script type="module">', 1);

  write(path.join(SITE, 'index.html'), html);
  log('wrote', SITE);
} catch (err) {
  console.error('[demo] build failed:', err.message);
  exitCode = 1;
} finally {
  hub.kill();
  if (!KEEP) rm(BUILD);
}
process.exit(exitCode);
