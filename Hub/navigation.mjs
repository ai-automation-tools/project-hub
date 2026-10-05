// URL helpers shared by the UI and regression tests. Old #Projects/... links remain valid.
export function routeHash(id, heading = '') {
  return '#' + encodeURIComponent(id) + (heading ? '?heading=' + encodeURIComponent(heading) : '');
}

export function parseRoute(hash) {
  try {
    const [id, query = ''] = hash.replace(/^#/, '').split('?');
    return { id: decodeURIComponent(id), heading: new URLSearchParams(query).get('heading') || '' };
  } catch { return { id: '', heading: '' }; }
}

// A search was the one view with no address of its own: opening a result cleared the query,
// so Back landed on the previous document instead of the results you came from. Giving the
// search a route lets the browser's own history restore it, with no separate state to keep.
// P9-02: the root and type chips live in the route too, so Back restores a narrowed search
// exactly as it was left rather than widening it again.
export function searchHash(query, scoped = false, limit = 200, { root = '', type = '' } = {}) {
  if (!query) return '';
  const parts = ['q=' + encodeURIComponent(query)];
  if (scoped) parts.push('scoped=1');
  if (limit && limit !== 200) parts.push('limit=' + limit);
  if (root) parts.push('root=' + encodeURIComponent(root));
  if (type) parts.push('type=' + type);
  return '#?' + parts.join('&');
}

export function parseSearch(hash) {
  try {
    const [id, query = ''] = hash.replace(/^#/, '').split('?');
    if (id) return null;
    const params = new URLSearchParams(query);
    const q = params.get('q');
    if (!q) return null;
    const limit = parseInt(params.get('limit'), 10);
    return {
      query: q,
      scoped: params.get('scoped') === '1',
      limit: Number.isInteger(limit) && limit >= 200 && limit <= 20000 ? limit : 200,
      // A root id is only ever compared against tree ids, so an unknown one just matches
      // nothing; a type outside the chip set is dropped rather than becoming a kind filter.
      root: params.get('root') || '',
      type: SEARCH_TYPES.includes(params.get('type')) ? params.get('type') : '',
    };
  } catch { return null; }
}

// The document kinds that get a type chip. Everything else is still reachable with a
// `skill:`-style prefix; these four are the ones P7-07 asked to narrow to in one click.
export const SEARCH_TYPES = ['md', 'html', 'pdf', 'image'];

/**
 * Narrow the search pool by the chips. `rootOf(id)` returns the id of the top-level tree
 * node a hit sits under (Projects, Documents, Skills, …). The prefix kind and the type chip
 * both apply, so `skill:` with the PDF chip on is honestly empty rather than one silently
 * overriding the other.
 */
export function filterSearchPool(pool, { kind = null, root = '', type = '' } = {}, rootOf = () => '') {
  return pool.filter((h) => (!kind || h.kind === kind) && (!type || h.kind === type) && (!root || rootOf(h.id) === root));
}

// How much each kind is worth when ranking: a CLI or repo named like the query is more
// likely the thing wanted than a config file of the same name.
export const KIND_WEIGHT = { cli: 60, repo: 50, skill: 45, command: 45, agent: 45, routine: 45, hook: 40, style: 40, group: 35, section: 35, userroot: 35, md: 25, folder: 15, config: 10 };

/** Substring score of one hit against a lowercased query; 0 means no match. */
export function searchScore(h, q) {
  const name = h.name.toLowerCase();
  let s = 0;
  if (name === q) s = 1000;
  else if (name.startsWith(q)) s = 600;
  else if (name.includes(q)) s = 400;
  else if ((h.desc || '').toLowerCase().includes(q)) s = 150;
  else if (h.id.toLowerCase().includes(q)) s = 60;
  return s ? s + (KIND_WEIGHT[h.kind] || 0) : 0;
}

/**
 * Edit distance with adjacent transpositions counted as one edit (optimal string
 * alignment), because "kalhsi" is the commonest typo there is. Gives up and returns
 * max + 1 as soon as every cell in a row exceeds `max`, so a long name against a short
 * query costs a row or two rather than the full table.
 */
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < low) low = d;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = row;
  }
  return prev[b.length];
}

// P9-03: the typo budget grows with the query. Under four characters almost everything is
// one edit from something, so short queries get no tolerance at all.
const typoBudget = (q) => q.length < 4 ? 0 : q.length < 8 ? 1 : 2;

/**
 * Rank a search pool. The substring pass is the whole answer whenever it finds anything,
 * so typo tolerance can never reorder or dilute real matches; only an empty result falls
 * through to the edit-distance pass. That pass compares the query against the name, the
 * name without its extension, and each word of the name, so "kalhsi" finds
 * "kalshi-trader.md". `typo` tells the caller the list is a guess, not a match.
 */
export function rankSearch(pool, q) {
  if (!q) return { ranked: pool.map((h) => ({ h, score: KIND_WEIGHT[h.kind] || 1 })).sort((a, b) => b.score - a.score), typo: false };
  const exact = pool.map((h) => ({ h, score: searchScore(h, q) })).filter((x) => x.score > 0);
  const max = typoBudget(q);
  if (exact.length || !max) return { ranked: exact.sort((a, b) => b.score - a.score), typo: false };
  const close = [];
  for (const h of pool) {
    const name = h.name.toLowerCase();
    const candidates = new Set([name, name.replace(/\.[^.]+$/, ''), ...name.split(/[^a-z0-9]+/)]);
    let best = max + 1;
    for (const c of candidates) if (c) best = Math.min(best, editDistance(q, c, max));
    if (best <= max) close.push({ h, score: 100 * (max + 1 - best) + (KIND_WEIGHT[h.kind] || 0) });
  }
  return { ranked: close.sort((a, b) => b.score - a.score), typo: close.length > 0 };
}

export function documentTarget(fromId, href) {
  try {
    const split = href.indexOf('#');
    const file = split < 0 ? href : href.slice(0, split);
    const heading = split < 0 ? '' : decodeURIComponent(href.slice(split + 1));
    if (!file) return { id: fromId, heading };
    const parts = fromId.split('/').slice(0, -1);
    for (const part of file.split('/')) {
      if (part === '.' || !part) continue;
      if (part === '..') parts.pop(); else parts.push(decodeURIComponent(part));
    }
    return { id: parts.join('/'), heading };
  } catch { return null; }
}

export function markdownLink(label, destination) {
  return '[' + label.replace(/[\\\[\]]/g, '\\$&') + '](<' + destination.replace(/ /g, '%20').replace(/</g, '%3C').replace(/>/g, '%3E') + '>)';
}

export function includeInSearch(node) {
  return node.kind !== 'file';
}

// ── bookmarks and recents (P7-10) ──────────────────────────────────────────
// Paths only, never document contents: these outlive a process restart in localStorage,
// and a rendered document does not. The hub has no per-user server state and this does
// not introduce any. Everything here is pure so the regressions can run without a DOM.

export const BOOKMARKS_KEY = 'hub.bookmarks';
export const RECENT_KEY = 'hub.recent';
export const RECENT_MAX = 20;

/** localStorage is user-editable and survives across versions, so nothing is trusted. */
export function parseList(raw) {
  let list;
  try { list = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((e) => e && typeof e.path === 'string' && e.path && !seen.has(e.path) && seen.add(e.path))
    .map((e) => ({
      path: e.path,
      label: typeof e.label === 'string' && e.label ? e.label : e.path.split('/').pop(),
      addedAt: Number.isFinite(e.addedAt) ? e.addedAt : 0,
    }));
}

export function isBookmarked(list, path) {
  return list.some((e) => e.path === path);
}

/** Toggle, because one control has to show and change the same state. */
export function toggleBookmark(list, path, label, now = Date.now()) {
  if (!path) return list;
  return isBookmarked(list, path)
    ? list.filter((e) => e.path !== path)
    : [...list, { path, label: label || path.split('/').pop(), addedAt: now }];
}

export function renameBookmark(list, path, label) {
  return list.map((e) => (e.path === path ? { ...e, label: label || e.path.split('/').pop() } : e));
}

/** Drag-to-reorder. Out-of-range indexes are a no-op rather than an exception. */
export function moveBookmark(list, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/** Newest first, deduplicated by path so reopening a file moves it rather than adding a row. */
export function pushRecent(list, path, label, now = Date.now()) {
  if (!path) return list;
  return [{ path, label: label || path.split('/').pop(), addedAt: now },
    ...list.filter((e) => e.path !== path)].slice(0, RECENT_MAX);
}

/**
 * Bookmarks outlive the files they point at. A missing path is marked unresolved and
 * kept -- never silently dropped, because a pin that vanishes on a temporarily
 * unreadable folder is worse than a dim one. `suggest` returns a single relink
 * candidate or '' ; a suggestion is offered, never applied.
 */
export function resolveBookmarks(list, exists, suggest = () => '') {
  return list.map((e) => {
    if (exists(e.path)) return { ...e, unresolved: false, suggestion: '' };
    return { ...e, unresolved: true, suggestion: suggest(e.path) || '' };
  });
}

// Resolve display/copy paths with the same base and home supplied by the scanner.
export function absolutePath(id, base = '', home = '~') {
  if (id === '@projects') return '';
  const value = id === '~' ? home : id.startsWith('~/') ? home + id.slice(1)
    : /^(?:[A-Za-z]:[\\/]|\/)/.test(id) ? id : base.replace(/[\\/]$/, '') + '/' + id;
  const normalized = value.replace(/\\/g, '/');
  const parts = [];
  for (const part of normalized.split('/')) {
    if (part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '' && !/^[A-Za-z]:$/.test(parts.at(-1))) parts.pop();
    else if (part !== '..') parts.push(part);
  }
  return parts.join('/');
}
