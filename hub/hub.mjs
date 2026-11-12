#!/usr/bin/env node
// Project Hub — scans every mounted project workspace + the shared roots (Documents,
// skills, Automations) and serves the navigation UI. Zero dependencies. Node 18+.
//
// One process, one config folder, any number of projects: this file's own
// hub.config.json holds only the server's own settings (port, title, favicon); each
// project it mounts gets its own small config under `projects/<name>/hub.config.json`,
// discovered at startup — adding a project is a folder and a config, nothing here changes.
//
//   node hub.mjs --config ../project-hub/hub.config.json    → serve
//   node hub.mjs --config <path> --scan                     → write scan.json and exit
//   node hub.mjs --config <path> --port 5000                → override the configured port
//
// This file is the server, the watcher and content search. Configuration and the scanner
// live in scan.mjs (it is also what the scan worker thread loads), markdown rendering and
// sanitizing in markdown.mjs. Everything either one exported is re-exported from here.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createReportHandler } from './reports.mjs';
import { launchNative } from './open-native.mjs';
import { browserDirs, listSources, readSource, createFavicons, createFrameCheck, cleanTree, loadFavorites, saveFavorites } from './webmarks.mjs';
import {
  HERE, argv, argOf, CONFIG_FILE, IS_MAIN, CONFIG, HUB_DIR, PROJECTS, SHARED_ROOTS, ROOTS,
  USER_RUNTIMES, SKIP_DIRS, DOT_OK, NOISE_FILE, SECRET_DIRS, posix, rel, resolveId, readHeadAsync,
  descCache, readErrors, readErrorLog, kindOfFile, safeIsDir,
  folderStamps, repoChanges, repoDiff, contentDocs, contentSig, scan, scanPayload, adoptWorkerScan,
  mountSharedRoot, unmountSharedRoot, countImages, IMAGE_WARN,
  validateNewRoot, writeSharedRoots, validateScanDepth, writeScanDepth,
  FOLDER_ICONS_MAX, validateFolderIcon, writeFolderIcons,
} from './scan.mjs';
import { frontmatter, docTags, docMeta, checkLinks, md2html } from './markdown.mjs';

export {
  loadConfig, loadProjectConfig, ROOT_TINTS, validateNewRoot, writeSharedRoots, validateScanDepth, writeScanDepth,
  validateFolderIcon, writeFolderIcons, countImages, IMAGE_WARN,
  IS_MAIN, projectsDir, DOC_FILE, runtimeServePaths, createResolveId, routineStatus, kindOfFile, scanTree,
  fileStamp, folderStamps, RECENT_DAYS, RECENT_DOCS_MAX, recentDocs, scanSignature, gitSignature, gitHitValid,
  CHANGES_MAX, DIFF_MAX, parseStatusZ, roadmapProgress, scopeRepos, CONTENT_FILE,
} from './scan.mjs';
export {
  frontmatter, docTags, docMeta, blurb, parseLiveSites, sanitizeHtml, slugifyHeading, linkTargets,
  headingAnchors, LINKCHECK_MAX_DOCS, checkLinks, md2html,
} from './markdown.mjs';

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
  + `<rect x='.5' y='.5' width='31' height='31' rx='5.5' fill='none' stroke='${line.replaceAll('#', '%23')}'/>`
  + "<text x='16' y='24' font-family='ui-monospace,monospace' font-size='21' font-weight='700' "
  + `text-anchor='middle' fill='${ink.replaceAll('#', '%23')}'>${glyph}</text></svg>`;

const csp = (nonce) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  // Hub tabs frame websites. Each frame is sandboxed without allow-top-navigation, so a
  // framed site can never navigate the hub itself away.
  "frame-src 'self' http: https:",
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
//
// Measured on 2026-10-26 against a 150k-node library: an 18s walk plus 8s of assembly,
// all of it blocking, so opening a document mid-scan waited up to 10s for an answer the
// server could give in 4ms. The scan now runs on a worker thread that loads its own copy
// of scan.mjs -- and so keeps its own descCache and git cache warm between scans --
// and the main thread only swaps in the finished bytes. `--scan` still runs inline.
let cached = null;          // { json, gzip, at } -- json and gzip are Buffers
let dirty = true;
let scanning = null;
let lastScanEnd = 0;
const STARTED = Date.now();
// Rolling record of what the last few scans cost, so /api/health can show a trend rather
// than a single number. The 2026-08-31 outage was invisible partly because nothing kept
// any history at all.
const scanLog = [];
export const SCAN_LOG_MAX = 20;
let scanCount = 0, watcherTicks = 0;
// P9-04: the content index, built on the first content search; see contentIndexNow().
let contentIndex = null;

let scanWorker = null, workerDescCache = null;
function workerScan(fresh, touched) {
  if (!scanWorker) {
    scanWorker = new Worker(new URL('./scan.mjs', import.meta.url), { argv: ['--config', CONFIG_FILE], workerData: { hubScanWorker: true } });
  }
  const w = scanWorker;
  return new Promise((resolve, reject) => {
    const settle = (fn, value) => { w.off('message', onMessage); w.off('error', onError); w.off('exit', onExit); fn(value); };
    const lost = () => { if (scanWorker === w) scanWorker = null; };
    const onMessage = (m) => (m.error ? settle(reject, new Error(m.error)) : settle(resolve, m));
    const onError = (e) => { lost(); settle(reject, e); };
    const onExit = (code) => { lost(); settle(reject, new Error(`scan worker exited with code ${code}`)); };
    w.on('message', onMessage); w.on('error', onError); w.on('exit', onExit);
    w.postMessage({ fresh, touched });
  });
}
/** The worker read the config at startup, so a mounted root or a new depth needs a fresh one. */
function restartScanWorker() {
  const w = scanWorker;
  scanWorker = null;
  w?.terminate();
}

// Posted buffers arrive as plain Uint8Arrays.
const asBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

// P9-08: working-tree paths the watcher saw change since the last scan began, for the git
// cache. `touchedAll` means "assume every repo moved": before the first scan, after a
// failed one, or once more paths changed than are worth keeping.
let touchedPaths = new Set(), touchedAll = true;
const TOUCHED_MAX = 5000;
function noteTouched(abs) {
  if (touchedPaths.size >= TOUCHED_MAX) touchedAll = true;
  else touchedPaths.add(posix(abs).toLowerCase());
}

function rescan(fresh) {
  if (scanning) return scanning;
  const touched = touchedAll ? true : [...touchedPaths];
  touchedPaths = new Set(); touchedAll = false;
  scanning = (async () => {
    let out = null;
    if (IS_MAIN) {
      try {
        out = await workerScan(fresh, touched);
        out.json = asBuffer(out.json);
        out.gzip = asBuffer(out.gzip);
        adoptWorkerScan(out);
        workerDescCache = out.descCache;
      } catch (e) {
        console.error(`scan worker failed, scanning on the main thread: ${e.message}`);
        out = null;
      }
    }
    if (!out) out = await scanPayload(fresh, touched);
    cached = { json: out.json, gzip: out.gzip, at: Date.now() };
    dirty = false;
    scanCount++;
    scanLog.push({ at: cached.at, ms: out.meta.ms, bytes: out.json.length, gzip: out.gzip.length, nodes: out.meta.nodes, errs: out.errs, timings: out.meta.timings });
    // P9-20: twenty is enough for the status panel's sparkline to show a trend.
    if (scanLog.length > SCAN_LOG_MAX) scanLog.shift();
    return cached;
  })().catch((e) => { touchedAll = true; throw e; }) // the changes it consumed went unseen
    .finally(() => { scanning = null; lastScanEnd = Date.now(); });
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

// ── content search (P9-04) ─────────────────────────────────────────────────
// The ordinary search matches names, descriptions and paths, and P7-07 asked that it never
// imply more. This is the explicit opt-in that looks inside documents. Nothing is read
// until the first query asks for it -- never during a scan -- and only markdown and plain
// text, each file capped, inside a total budget: a 12k-doc workspace would otherwise pin
// its whole text in the heap for a feature most sessions never touch.
//
// Each file is held as its raw UTF-8 bytes decoded as latin1, one byte per character. V8
// stores a string with a single em dash in it at two bytes per character, and nearly every
// doc here has one. As latin1 the heap cost is the byte count, so the budget below is the
// memory cost. Measured 2026-10-06 over a 7,752-doc tree (58MB of markdown), after a forced
// GC: 64KB per file indexes 49.8MB and retains 51.5MB of heap; the same files decoded to
// UTF-16 retain 86.1MB. A first cut at 128KB/32MB had left 2,968 of those files out.
export const CONTENT_CAPS = { perFile: 64 * 1024, total: 64 * 1024 * 1024 };
// The longest list one answer carries. The client applies the root and project filters to
// it, so it is generous; each hit is an id, a count and a ~130-char snippet.
const CONTENT_HITS_MAX = 1000;

/**
 * Index `docs` ({ id, abs, size, mtime }) for content search. An entry whose size and
 * mtime match `prev` is reused, so the rebuild after a watcher rescan reads only what
 * moved. Files clipped to the per-file cap, left out by the total budget, or unreadable
 * are counted rather than silently dropped, so the page can say the index is partial.
 */
export async function buildContentIndex(docs, prev = new Map(), read = (abs, n) => readHeadAsync(abs, n, 'latin1'), caps = CONTENT_CAPS) {
  const entries = new Map();
  let bytes = 0, clipped = 0, skipped = 0, unread = 0;
  for (const d of docs) {
    if (!d.size) continue;
    const want = Math.min(d.size, caps.perFile);
    if (bytes + want > caps.total) { skipped++; continue; }
    const old = prev.get(d.id);
    const reuse = old && old.size === d.size && old.mtime === d.mtime;
    const text = reuse ? old.text : await read(d.abs, want);
    if (text == null) { unread++; continue; }
    // Tags are parsed once per read, so a tag: query never re-parses 11k heads.
    const tags = reuse ? old.tags : docTags(frontmatter(Buffer.from(text.slice(0, 4096), 'latin1').toString('utf8')));
    entries.set(d.id, { size: d.size, mtime: d.mtime, text, tags });
    bytes += want;
    if (d.size > caps.perFile) clipped++;
  }
  return { entries, bytes, clipped, skipped, unread };
}

/**
 * Literal match over an index whose texts are UTF-8 bytes as latin1 (see CONTENT_CAPS), so
 * the query is encoded the same way. ASCII letters match either case; every other byte
 * matches exactly -- a plain `i` flag would also fold latin1 lookalikes that are really
 * halves of multi-byte characters. Files rank by how often the query occurs (counted to
 * 100, plenty to rank by), then by id so the order is stable. The snippet is the decoded
 * text around the first occurrence; the client marks the match.
 */
export function searchContent(index, q, limit = CONTENT_HITS_MAX) {
  const needle = String(q || '').trim();
  if (needle.length < 2) return { hits: [], total: 0 };
  // P9-19: `tag:name` matches frontmatter tags exactly instead of searching the text.
  const tag = /^tag:\s*(.+)$/i.exec(needle)?.[1].trim().replace(/^#/, '').toLowerCase();
  if (tag) {
    const hits = [];
    for (const [id, { tags }] of index.entries) if (tags?.includes(tag)) hits.push({ id, count: 1, snippet: 'tags: ' + tags.join(', ') });
    hits.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { hits: hits.slice(0, limit), total: hits.length };
  }
  const bytes = Buffer.from(needle, 'utf8').toString('latin1');
  const re = new RegExp([...bytes].map((c) => /[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]`
    : c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')).join(''), 'g');
  const hits = [];
  for (const [id, { text }] of index.entries) {
    re.lastIndex = 0;
    const first = re.exec(text);
    if (!first) continue;
    let count = 1;
    while (count < 100 && re.exec(text)) count++;
    const start = Math.max(0, first.index - 60), end = Math.min(text.length, first.index + bytes.length + 60);
    // A window edge can split a multi-byte character; its stray half decodes to U+FFFD.
    const around = Buffer.from(text.slice(start, end), 'latin1').toString('utf8').replace(/^�+|�+$/g, '');
    const snippet = (start ? '…' : '') + around.replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
    hits.push({ id, count, snippet });
  }
  hits.sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { hits: hits.slice(0, limit), total: hits.length };
}

// The index is rebuilt lazily when the scan's signature moves on (state declared above
// scan(), which `--scan` runs before this point is reached). P9-55: the build reads
// asynchronously -- the first one is ~11k files and took 10.4s, during which a synchronous
// build stalled every other request. Queries arriving mid-build share the one build.
// ponytail: each query still scans the whole index on this thread (50-170ms over 64MB
// here); move search to a worker if that ever shows up as lag.
let contentBuild = null;
async function contentIndexNow() {
  if (contentIndex?.sig === contentSig) return contentIndex;
  if (contentBuild?.sig !== contentSig) {
    const sig = contentSig, t0 = Date.now();
    const promise = buildContentIndex(contentDocs, contentIndex?.entries)
      .then((built) => (contentIndex = { sig, ...built, buildMs: Date.now() - t0 }))
      .finally(() => { if (contentBuild?.promise === promise) contentBuild = null; });
    contentBuild = { sig, promise };
  }
  return contentBuild.promise;
}

// A page on any origin can point a request at 127.0.0.1, and an attacker's domain can be
// re-resolved to it (DNS rebinding) to become same-origin. Neither survives a Host check:
// a rebound request still carries the attacker's hostname. `allowedHosts` adds exact
// names (a tailnet's MagicDNS name) — never a pattern, so the check stays as tight.
const HOSTS_OK = new Set(['127.0.0.1', 'localhost', '[::1]', ...CONFIG.allowedHosts].map((h) => `${h}:${PORT}`));
// Loopback alone: what only the PC itself may do (widening what the hub can read).
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'].map((h) => `${h}:${PORT}`));

// Browsers label every request's relationship to the page that made it. Anything a
// foreign page triggers reads `cross-site` or `same-site`; our own fetch reads
// `same-origin`, a typed URL reads `none`, and non-browser clients send nothing at all.
const sameOrigin = (req) => {
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
};

const handleReport = createReportHandler({ resolveId, toId: rel, sameOrigin });
const BROWSER_DIRS = browserDirs({ home: os.homedir(), localAppData: process.env.LOCALAPPDATA });
const favicons = createFavicons();
const frameable = createFrameCheck();
const FAVORITES_FILE = path.join(HUB_DIR, 'favorites.json');
const FAVORITES_MAX = 5 * 1024 * 1024;
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

  // Icons for the Explorer's top-level folders. Anyone who can see the hub can read them;
  // only the machine running it can change them, like the folder list itself.
  if (url.pathname === '/api/folder-icons') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ icons: CONFIG.folderIcons }));
      return;
    }
    if (!sameOrigin(req) || !LOCAL_HOSTS.has(req.headers.host || '')) {
      res.writeHead(403).end('Folder icons can only be changed on the computer running the hub.'); return;
    }
    if (req.method !== 'PUT') { res.writeHead(405, { allow: 'GET, PUT' }).end('method not allowed'); return; }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { res.writeHead(415).end('application/json required'); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) { res.writeHead(413).end('request too large'); req.destroy(); return; }
    }
    let change;
    try { const input = JSON.parse(body); change = validateFolderIcon(input?.id, input?.icon ?? null); }
    catch (e) { res.writeHead(400).end(e instanceof SyntaxError ? 'expected a JSON object' : e.message); return; }
    // No prototype, so an id like `__proto__` is stored as a key like any other.
    const next = Object.assign(Object.create(null), CONFIG.folderIcons);
    if (change.icon === null) delete next[change.id];
    else next[change.id] = change.icon;
    if (Object.keys(next).length > FOLDER_ICONS_MAX) { res.writeHead(400).end('Too many folder icons.'); return; }
    try { writeFolderIcons(CONFIG_FILE, next); }
    catch { res.writeHead(500).end(`could not save ${CONFIG_FILE}`); return; }
    CONFIG.folderIcons = next;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ icons: next }));
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
      readErrors,                     // since start; informational only
      readErrorsRecent: recentErrs,   // across the last 3 scans -- this is what `ok` uses
      // The paths behind those counts, newest last. Relative ids, so the UI can link them.
      readErrorPaths: [...readErrorLog].map(([file, e]) => ({ path: rel(file), code: e.code, at: e.at })),
      descCache: workerDescCache ?? descCache.size,
      // What the watcher last reacted to, newest last -- the place to look when scans run
      // back to back on a machine nobody is editing on.
      recentChanges: recentChanges.map((c) => ({ path: c.path, ageSec: Math.round((Date.now() - c.at) / 1000) })),
      // null until the first content search builds it (P9-04).
      contentIndex: contentIndex && { docs: contentIndex.entries.size, mb: +(contentIndex.bytes / 1048576).toFixed(2), buildMs: contentIndex.buildMs },
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

  if (await handleReport(req, res, url)) return;

  // Browser favorites. The source id is matched against the discovered profiles, never
  // turned into a path, so nothing here reads a file the client named.
  if (url.pathname === '/api/webmarks') {
    if (!sameOrigin(req)) { res.writeHead(403).end('same-origin only'); return; }
    const sources = listSources(BROWSER_DIRS);
    const src = sources.find((s) => s.id === url.searchParams.get('source')) || sources[0];
    const body = { sources: sources.map(({ id, label }) => ({ id, label })), source: src?.id || '', roots: src ? readSource(src) : [] };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    return;
  }

  // The hub's own favorites. PUT replaces the whole list: it is small, and a whole-list
  // write can never interleave into a tree neither edit meant. A cross-site page cannot
  // send a JSON content type without a preflight this server never answers, and
  // sameOrigin refuses it anyway.
  // Add or remove a sidebar folder (a shared root). Mounting one widens what every
  // path-addressed endpoint will read, so beyond same-origin it takes a loopback Host:
  // a phone on the tailnet can browse the folders but not add C:/Users to them.
  if (url.pathname === '/api/scan-settings') {
    const settings = () => ({ defaultDepth: CONFIG.maxDepth, workspaces: PROJECTS.map((p) => ({
      name: p.name, maxDepth: p.maxDepth, effectiveDepth: p.maxDepth ?? CONFIG.maxDepth,
    })) });
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(settings()));
      return;
    }
    if (!sameOrigin(req) || !LOCAL_HOSTS.has(req.headers.host || '')) {
      res.writeHead(403).end('Scan settings can only be changed on the computer running the hub.'); return;
    }
    if (req.method !== 'PUT') { res.writeHead(405, { allow: 'GET, PUT' }).end('method not allowed'); return; }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { res.writeHead(415).end('application/json required'); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) { res.writeHead(413).end('request too large'); req.destroy(); return; }
    }
    let input, project;
    try {
      input = JSON.parse(body);
      if (!input || typeof input !== 'object') throw new Error('Expected settings.');
      if (input.workspace !== undefined) {
        project = PROJECTS.find((p) => p.name === input.workspace);
        if (!project) throw new Error('Unknown workspace.');
      }
      if (!project || input.maxDepth !== null) validateScanDepth(input.maxDepth);
    } catch (e) { res.writeHead(400).end(e.message); return; }
    // The request selects a known workspace, never an arbitrary filesystem path.
    try { writeScanDepth(project ? project.configFile : CONFIG_FILE, input.maxDepth); }
    catch { res.writeHead(500).end('Could not save scan settings.'); return; }
    if (project) project.maxDepth = input.maxDepth;
    else CONFIG.maxDepth = input.maxDepth;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(settings()));
    // Finish any older scan first so its cached result cannot swallow this change.
    setImmediate(async () => {
      try { if (scanning) await scanning; await rootsChanged('scan depth changed', true); }
      catch (e) { console.error('Could not refresh scan settings:', e.message); }
    });
    return;
  }

  if (url.pathname === '/api/roots') {
    if (!sameOrigin(req) || !LOCAL_HOSTS.has(req.headers.host || '')) {
      res.writeHead(403).end('Folders can only be changed on the computer running the hub.');
      return;
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') { res.writeHead(405, { allow: 'POST, DELETE' }).end('method not allowed'); return; }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { res.writeHead(415).end('application/json required'); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) { res.writeHead(413).end('request too large'); req.destroy(); return; }
    }
    let input = null;
    try { input = JSON.parse(body); } catch {}
    if (!input || typeof input !== 'object') { res.writeHead(400).end('expected a JSON object'); return; }
    let root, why;
    if (req.method === 'POST') {
      try { root = validateNewRoot(input, ROOTS, safeIsDir); }
      catch (e) { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end(e.message); return; }
      // A photo library is the one kind of folder that makes every scan slow. Ask first;
      // `force` is the person saying "add it anyway".
      if (input.force !== true && countImages(root.dir) > IMAGE_WARN) {
        res.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' })
          .end(`${root.name} holds more than ${IMAGE_WARN.toLocaleString('en-US')} images. The hub lists every file on each scan, so a photo library makes scans and the sidebar slow.`);
        return;
      }
      mountRoot(root);
      why = `added ${root.name}`;
    } else {
      root = SHARED_ROOTS.find((r) => r.name === input.name);
      if (!root) { res.writeHead(404).end('no such folder'); return; }
      unmountRoot(root);
      why = `removed ${root.name}`;
    }
    // Saved after the in-memory change succeeds, and undone if the save fails, so the
    // config file and the running hub never disagree.
    try { writeSharedRoots(CONFIG_FILE, SHARED_ROOTS); }
    catch {
      if (req.method === 'POST') unmountRoot(root); else mountRoot(root);
      res.writeHead(500).end(`could not save ${CONFIG_FILE}`);
      return;
    }
    // Answer once the folder is mounted and saved; the rescan that puts it in the tree
    // takes as long as a whole scan (~25s here), and its change event updates every page.
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify({ sharedRoots: SHARED_ROOTS.map((r) => ({ name: r.name, dir: r.dir, tint: r.tint })) }));
    rootsChanged(why).catch((e) => console.error(`Could not rescan after ${why}:`, e.message));
    return;
  }

  if (url.pathname === '/api/favorites') {
    if (!sameOrigin(req)) { res.writeHead(403).end('same-origin only'); return; }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ roots: loadFavorites(FAVORITES_FILE) }));
      return;
    }
    if (req.method !== 'PUT') { res.writeHead(405, { allow: 'GET, PUT' }).end('method not allowed'); return; }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { res.writeHead(415).end('application/json required'); return; }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > FAVORITES_MAX) { res.writeHead(413).end('favorites too large'); req.destroy(); return; }
      chunks.push(chunk);
    }
    let roots = null;
    try { roots = cleanTree(JSON.parse(Buffer.concat(chunks).toString('utf8')).roots); } catch {}
    if (!roots) { res.writeHead(400).end('not a favorites tree'); return; }
    try { saveFavorites(FAVORITES_FILE, roots); } catch { res.writeHead(500).end('could not save favorites'); return; }
    res.writeHead(204).end();
    return;
  }

  // Whether a site lets a hub tab frame it. Asked by the server because the browser gives
  // a page no way to tell a refused frame from a slow one.
  if (url.pathname === '/api/frameable') {
    if (!sameOrigin(req)) { res.writeHead(403).end('same-origin only'); return; }
    let page = null;
    try { page = new URL(url.searchParams.get('url') || ''); } catch {}
    if (!page || !/^https?:$/.test(page.protocol)) { res.writeHead(400).end('http(s) url required'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify({ frameable: await frameable(page.href) }));
    return;
  }

  // The server fetches the page and its icon, so the lookup never reaches a third-party
  // favicon service. Same-origin only: a foreign page must not use the hub as a fetcher.
  if (url.pathname === '/api/favicon') {
    if (!sameOrigin(req)) { res.writeHead(403).end('same-origin only'); return; }
    let page = null;
    try { page = new URL(url.searchParams.get('url') || ''); } catch {}
    if (!page || !/^https?:$/.test(page.protocol)) { res.writeHead(400).end('http(s) url required'); return; }
    const icon = await favicons.get(page.href);
    if (!icon) { res.writeHead(404, { 'cache-control': 'max-age=86400' }).end(); return; }
    // An SVG icon opened directly is a document; this policy leaves it no script to run.
    res.writeHead(200, {
      'content-type': icon.type,
      'cache-control': 'max-age=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    }).end(icon.body);
    return;
  }

  if (url.pathname === '/api/file') {
    const p = url.searchParams.get('path') || '';
    const abs = resolveId.real(p);
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
      : { html: md2html(text), meta: docMeta(text) };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
    return;
  }

  // P9-04: opt-in content search. Read-only and addressed by query, not path; the index
  // only ever holds files scan() found and resolveId() admits.
  if (url.pathname === '/api/content') {
    if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end('method not allowed'); return; }
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) { res.writeHead(400).end('type at least two characters to search inside documents'); return; }
    await scanJson(false);
    const index = await contentIndexNow();
    const { hits, total } = searchContent(index, q);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({
      hits, total, docs: index.entries.size, mb: +(index.bytes / 1048576).toFixed(2),
      clipped: index.clipped, skipped: index.skipped, unread: index.unread, buildMs: index.buildMs, perFileKb: CONTENT_CAPS.perFile / 1024,
    }));
    return;
  }

  if (url.pathname === '/api/stat') {
    const abs = resolveId.real(url.searchParams.get('path') || '');
    if (!abs) { res.writeHead(403).end('outside roots'); return; }
    const times = folderStamps(abs);
    if (!times) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(times));
    return;
  }

  if (url.pathname === '/api/links') {
    if (!sameOrigin(req)) { res.writeHead(403).end('cross-origin request refused'); return; }
    const id = (url.searchParams.get('path') || '').replace(/\/$/, '');
    if (!resolveId.real(id)) { res.writeHead(403).end('outside roots'); return; }
    // contentDocs is already deny-listed and limited to what /api/file would serve.
    const docs = contentDocs.filter((d) => /\.(md|mdx|markdown)$/i.test(d.name)
      && (d.id === id || d.id.startsWith(id + '/')));
    const t0 = Date.now();
    const result = await checkLinks(docs, {
      allowed: (abs) => !!resolveId(abs),
      read: (abs) => readHeadAsync(abs, 1 << 20),
    });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ...result, ms: Date.now() - t0 }));
    return;
  }

  if (url.pathname === '/api/repo/changes' || url.pathname === '/api/repo/diff') {
    if (!sameOrigin(req)) { res.writeHead(403).end('cross-origin request refused'); return; }
    const id = url.searchParams.get('path') || '';
    const abs = resolveId.real(id);
    if (!abs) { res.writeHead(403).end('outside roots'); return; }
    if (!fs.existsSync(path.join(abs, '.git'))) { res.writeHead(404).end('not a repo'); return; }
    const changes = await repoChanges(abs);
    let body = changes;
    if (url.pathname === '/api/repo/diff') {
      const file = url.searchParams.get('file') || '';
      const hit = changes.files.find((f) => f.path === file);
      if (!hit) { res.writeHead(404).end('not a changed file'); return; }
      // The deny list applies to a changed file exactly as to any other read -- deleted
      // ones too, since their diff is the old content.
      if (!resolveId.real(id.replace(/\/$/, '') + '/' + file)) {
        res.writeHead(403).end('outside roots'); return;
      }
      body = { file, code: hit.code, ...(await repoDiff(abs, file, hit.code)) };
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }

  if (url.pathname === '/api/open') {
    // The only endpoint with a side effect outside the browser -- it shells out. A GET,
    // so a foreign page's <img src="...:4273/api/open?path=..."> would fire it without
    // ever needing to read the response.
    if (!sameOrigin(req)) { res.writeHead(403).end('cross-origin request refused'); return; }
    const abs = resolveId.real(url.searchParams.get('path') || '');
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
// A large library takes 30-60s to scan, and the watcher used to queue the next one 2.5s
// after any event, so on a busy machine the hub was never not scanning -- 15 scans in
// its first 15 minutes on 2026-10-26. A change now waits until SCAN_GAP after the last
// scan finished, and the one queued scan covers every change that lands before it runs.
//
// A fixed 30s gap still wasn't enough for a large library: on 2026-11-11 a 138k-node tree
// took 40-70s a scan and files changed constantly, so the hub ran 53 scans in 92 minutes
// and was scanning about two thirds of the time. The gap now grows with the last scan:
// four times its length, so scanning stays under a fifth of the time, between the old
// 30s (small libraries keep their quick refresh) and 10 minutes.
const SCAN_DEBOUNCE = 2500, SCAN_GAP_MIN = 30_000, SCAN_GAP_MAX = 600_000, SCAN_GAP_FACTOR = 4;
export function scanGap(lastScanMs) {
  const ms = Number.isFinite(lastScanMs) && lastScanMs > 0 ? lastScanMs : 0;
  return Math.min(SCAN_GAP_MAX, Math.max(SCAN_GAP_MIN, ms * SCAN_GAP_FACTOR));
}
const currentGap = () => scanGap(scanLog[scanLog.length - 1]?.ms);
let timer = null, lastWhy = '';
const recentChanges = [];
function bump(why) {
  dirty = true;
  watcherTicks++;
  lastWhy = why;
  recentChanges.push({ path: why, at: Date.now() });
  if (recentChanges.length > 20) recentChanges.shift();
  if (timer) return;
  timer = setTimeout(fireScan, Math.max(SCAN_DEBOUNCE, lastScanEnd + currentGap() - Date.now()));
}
async function fireScan() {
  // A scan already running predates this change; wait it out, then keep the gap.
  if (scanning) await scanning.catch(() => {});
  const wait = lastScanEnd + currentGap() - Date.now();
  if (wait > 0) { timer = setTimeout(fireScan, wait); return; }
  timer = null;          // changes from here on queue the next scan
  const why = lastWhy;
  // Build the new payload before announcing it, or every client races in and gets
  // handed the same stale copy it already has.
  const before = contentSig;
  await rescan(false).catch(() => {});
  // Most watcher bursts (logs, git internals, editor temp files) leave the payload as it
  // was. Announcing those anyway made every open page fetch and parse the whole scan --
  // 27.7MB on a 138k-node tree, about once a minute, freezing the page for 0.5-2s each time.
  if (contentSig === before) return;
  for (const res of sse) res.write(`event: change\ndata: ${JSON.stringify({ why })}\n\n`);
}

const WATCH = [
  ...ROOTS.map((r) => r.dir),
  // Only the artifact sub-dirs — ~/.claude as a whole churns on every session write.
  ...USER_RUNTIMES.flatMap((rt) => rt.dirs.map((d) => `${rt.dir}/${d}`)),
].filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });

const watchers = new Map();   // dir -> FSWatcher, so a folder removed in Settings stops being watched
function watchDir(dir) {
  try {
    watchers.set(dir, fs.watch(dir, { recursive: true, persistent: false }, (_evt, name) => {
      if (ignoreWatchEvent(dir, name)) return;
      noteTouched(path.join(dir, String(name)));
      bump(posix(name));
    }));
  } catch (e) {
    console.warn(`watch failed for ${dir}: ${e.message}`);
  }
}
if (IS_MAIN) for (const dir of WATCH) watchDir(dir);

// Mount or unmount a shared root without a restart. Every list a root was copied into at
// startup is updated in place, in this thread and in the scan worker's copy of scan.mjs
// (see mountSharedRoot), plus the watcher.
function mountRoot(r) {
  mountSharedRoot(r);
  scanWorker?.postMessage({ mount: r });
  WATCH.push(r.dir);
  watchDir(r.dir);
}
function unmountRoot(r) {
  unmountSharedRoot(r.dir);
  scanWorker?.postMessage({ unmount: r.dir });
  const i = WATCH.indexOf(r.dir);
  if (i > -1) WATCH.splice(i, 1);
  watchers.get(r.dir)?.close();
  watchers.delete(r.dir);
}
/**
 * Rescan now (not after the watcher's debounce) and tell every open page. `restart` is for
 * changes the worker only reads at startup, like the scan depth; a mounted root reaches it
 * as a message instead, so it keeps its caches.
 */
async function rootsChanged(why, restart = false) {
  dirty = true;
  if (scanning) await scanning.catch(() => {});   // an in-flight scan predates the change
  if (restart) restartScanWorker();
  await rescan(false).catch(() => {});
  for (const res of sse) res.write(`event: change\ndata: ${JSON.stringify({ why })}\n\n`);
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
