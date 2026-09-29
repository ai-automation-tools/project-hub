// Browser favorites, read live from Chromium-family profiles (Edge, Chrome, Brave), and the
// favicons that go with them. Read-only on purpose: the browser stays the source of truth,
// so an edit made there shows up here on the next open, and nothing here can corrupt the
// file a running browser rewrites whenever it likes.
import fs from 'node:fs';
import path from 'node:path';

const BROWSERS = [
  { key: 'edge', label: 'Edge', win: 'Microsoft/Edge/User Data', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  { key: 'chrome', label: 'Chrome', win: 'Google/Chrome/User Data', mac: 'Google/Chrome', linux: 'google-chrome' },
  { key: 'brave', label: 'Brave', win: 'BraveSoftware/Brave-Browser/User Data', mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser' },
];

/** Each browser's "User Data" folder on this platform. */
export function browserDirs({ platform = process.platform, home, localAppData } = {}) {
  return BROWSERS.map((b) => ({
    key: b.key,
    label: b.label,
    dir: platform === 'win32' ? path.join(localAppData || path.join(home, 'AppData', 'Local'), b.win)
      : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', b.mac)
        : path.join(home, '.config', b.linux),
  }));
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** Every profile holding a Bookmarks file, named the way the browser's own profile menu names it. */
export function listSources(dirs) {
  const out = [];
  for (const b of dirs) {
    let entries;
    try { entries = fs.readdirSync(b.dir, { withFileTypes: true }); } catch { continue; }
    const names = readJson(path.join(b.dir, 'Local State'))?.profile?.info_cache || {};
    for (const e of entries) {
      const file = path.join(b.dir, e.name, 'Bookmarks');
      if (!e.isDirectory() || !fs.existsSync(file)) continue;
      out.push({ id: `${b.key}:${e.name}`, label: `${b.label} — ${names[e.name]?.name || e.name}`, file });
    }
  }
  return out;
}

// javascript: bookmarklets, edge://, chrome:// and file: links either cannot be opened from a
// web page or must not run in the hub's origin, so only web links survive.
const toNode = (n) => {
  if (n.type === 'url') return /^https?:\/\//i.test(n.url || '') ? { name: n.name || n.url, url: n.url } : null;
  return { name: n.name || '(untitled)', children: (n.children || []).map(toNode).filter(Boolean) };
};

/** Chromium's Bookmarks JSON → roots in the browser's order (Favorites bar, Other, Mobile), empty ones dropped. */
export function parseChromium(json) {
  const roots = json?.roots || {};
  return ['bookmark_bar', 'other', 'synced'].map((k) => roots[k]).filter(Boolean).map(toNode)
    .filter((r) => r.children.length);
}

export function readSource(source) {
  return parseChromium(readJson(source.file));
}

// ── manual favorites ────────────────────────────────────────────────────────
// The hub's own list, kept as one JSON file beside the server config. Everything the
// client sends is rebuilt field by field, so the file only ever holds names, web URLs and
// folders, however the request was shaped.

export const EMPTY_FAVORITES = () => [{ name: 'Favorites bar', children: [] }, { name: 'Other favorites', children: [] }];
const MAX_NODES = 50000, MAX_DEPTH = 32;

/** A tree fit to store, or null when the input is not one. */
export function cleanTree(input) {
  let count = 0;
  const clean = (n, depth) => {
    if (++count > MAX_NODES || depth > MAX_DEPTH || !n || typeof n !== 'object') throw new Error('bad tree');
    const name = String(n.name ?? '').slice(0, 500);
    if (Array.isArray(n.children)) return { name: name || '(untitled)', children: n.children.map((c) => clean(c, depth + 1)).filter(Boolean) };
    return typeof n.url === 'string' && /^https?:\/\//i.test(n.url) && n.url.length <= 8192 ? { name: name || n.url, url: n.url } : null;
  };
  try {
    if (!Array.isArray(input)) return null;
    const roots = input.map((r) => clean(r, 0)).filter((r) => r && r.children);
    return roots.length ? roots : null;
  } catch { return null; }
}

export function loadFavorites(file) {
  return cleanTree(readJson(file)) || EMPTY_FAVORITES();
}

/** Write to a temporary file then rename, so a crash mid-write never leaves half a list. */
export function saveFavorites(file, roots) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(roots, null, 1));
  fs.renameSync(tmp, file);
}

// ── embedding ───────────────────────────────────────────────────────────────
// A site that forbids framing shows the browser's own "refused to connect" page inside an
// iframe, and the page cannot detect that. So ask the site first: its X-Frame-Options and
// CSP frame-ancestors headers say whether a hub tab can show it.

/** Whether response headers allow a page on another origin to frame this one. */
export function allowsFraming(headers) {
  // A header sent twice arrives joined with commas ("SAMEORIGIN, SAMEORIGIN"), so check each value.
  const xfo = (headers.get('x-frame-options') || '').toLowerCase().split(',').map((v) => v.trim());
  if (xfo.some((v) => v === 'deny' || v === 'sameorigin' || v.startsWith('allow-from'))) return false;
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(headers.get('content-security-policy') || '')?.[1];
  return ancestors == null || /(^|\s)\*(\s|$)/.test(ancestors.trim());
}

/** One answer per URL, cached for the process. An unreachable or erroring site answers false: a browser tab always works. */
export function createFrameCheck({ fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const cache = new Map();
  const check = async (url) => {
    try {
      const r = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'Mozilla/5.0 (Project Hub embed check)', accept: 'text/html,*/*' },
      });
      r.body?.cancel?.().catch(() => {});
      // An error or bot-challenge page (403, 429, 5xx) carries that page's headers, not the
      // site's, so it cannot vouch for framing. A browser tab always works; a blank frame doesn't.
      return r.status < 400 && allowsFraming(r.headers);
    } catch { return false; }
  };
  return (url) => {
    if (!cache.has(url)) cache.set(url, check(url));
    return cache.get(url);
  };
}

// ── favicons ────────────────────────────────────────────────────────────────
// Chromium keeps icons in a SQLite file this zero-dependency server cannot read, so they
// are resolved the way a browser finds them in the first place: the page's <link rel=icon>
// tags, then /favicon.ico.

/** Icon URLs a page declares, best first: nearest to 32px, unsized after sized, SVG as a sized one. */
export function iconLinks(html, pageUrl) {
  const found = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag) || []).slice(1).find((v) => v != null) || '';
    if (!/(^|\s|-)icon(\s|$)/i.test(rel)) continue;
    const href = (/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag) || []).slice(1).find((v) => v != null);
    if (!href) continue;
    let abs;
    try { abs = new URL(href.replace(/&amp;/g, '&'), pageUrl).href; } catch { continue; }
    const size = +(/\bsizes\s*=\s*["']?(\d+)x/i.exec(tag)?.[1] || 0);
    const svg = /\bsizes\s*=\s*["']?any/i.test(tag) || /\.svg(\?|$)/i.test(abs);
    found.push({ href: abs, score: svg ? 0 : size ? Math.abs(size - 32) : 16 });
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.href);
}

/** Image type from the bytes themselves -- favicon.ico is served as everything from text/plain up. */
export function sniffImage(buf) {
  const head = buf.subarray(0, 12);
  if (head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x00000100) return 'image/x-icon';
  if (head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (/<svg[\s>]/i.test(buf.subarray(0, 1024).toString('utf8'))) return 'image/svg+xml';
  return '';
}

const PAGE_MAX = 2e6, ICON_MAX = 256e3;

/**
 * One resolved icon per origin, cached for the life of the process (misses too, so a dead
 * site is asked once). ponytail: memory only -- a restart re-resolves; persist it if
 * that ever gets slow.
 */
export function createFavicons({ fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const cache = new Map();
  const get = async (url, max) => {
    const r = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (Project Hub favicon lookup)', accept: '*/*' },
    });
    if (!r.ok || +(r.headers.get('content-length') || 0) > max) return null;
    const body = Buffer.from(await r.arrayBuffer());
    return body.length && body.length <= max ? { body, url: r.url || url, type: r.headers.get('content-type') || '' } : null;
  };
  async function resolve(pageUrl) {
    const candidates = [];
    try {
      const page = await get(pageUrl, PAGE_MAX);
      if (page && /html/i.test(page.type)) candidates.push(...iconLinks(page.body.toString('utf8'), page.url));
    } catch {}
    candidates.push(new URL('/favicon.ico', pageUrl).href);
    for (const href of new Set(candidates)) {
      try {
        const icon = await get(href, ICON_MAX);
        const type = icon && sniffImage(icon.body);
        if (type) return { type, body: icon.body };
      } catch {}
    }
    return null;
  }
  return {
    get(pageUrl) {
      const origin = new URL(pageUrl).origin;
      if (!cache.has(origin)) cache.set(origin, resolve(pageUrl));
      return cache.get(origin);
    },
    get size() { return cache.size; },
  };
}
