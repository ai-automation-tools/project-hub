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
// exactly as it was left rather than widening it again. P9-04's content toggle rides along
// for the same reason: it is per query, so it belongs to the search's own address.
export function searchHash(query, scoped = false, limit = 200, { root = '', type = '', content = false } = {}) {
  if (!query) return '';
  const parts = ['q=' + encodeURIComponent(query)];
  if (scoped) parts.push('scoped=1');
  if (limit && limit !== 200) parts.push('limit=' + limit);
  if (root) parts.push('root=' + encodeURIComponent(root));
  if (type) parts.push('type=' + type);
  if (content) parts.push('content=1');
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
      content: params.get('content') === '1',
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
      if (part === '..') { if (!parts.length) return null; parts.pop(); }
      else parts.push(decodeURIComponent(part));
    }
    return { id: parts.join('/'), heading };
  } catch { return null; }
}

// `vscode://file/D:/x/y.html:12:3` -> 'D:/x/y.html'. Docs written for VS Code's preview
// use these; the hub opens the target itself when it is indexed. '' when not one.
export function vscodeFilePath(href) {
  const m = /^vscode:\/\/file\/+(.+)$/i.exec(href || '');
  if (!m) return '';
  let p;
  try { p = decodeURIComponent(m[1]); } catch { return ''; }
  p = p.replace(/\\/g, '/').replace(/(\.[^/:]*)(?::\d+){1,2}$/, '$1');
  return /^[A-Za-z]:\//.test(p) ? p : '/' + p;
}

export function markdownLink(label, destination) {
  return '[' + label.replace(/[\\\[\]]/g, '\\$&') + '](<' + destination.replace(/ /g, '%20').replace(/</g, '%3C').replace(/>/g, '%3E') + '>)';
}

export function includeInSearch(node) {
  return node.kind !== 'file';
}

// ── keyboard context menus (P9-05) ─────────────────────────────────────────
// The two keys a file explorer opens a row's menu with. Browsers also turn both into a
// `contextmenu` event, but only on some platforms and with coordinates that point at
// nothing useful, so the page handles the key itself and anchors the menu under the row.
export function isMenuKey(e) {
  return e.key === 'ContextMenu' || (e.key === 'F10' && !!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);
}

/** Next item index for a menu key over `count` enabled items, wrapping; -1 for any other key. */
export function menuStep(count, from, key) {
  if (!count) return -1;
  switch (key) {
    case 'ArrowDown': return (from + 1) % count;
    case 'ArrowUp': return from <= 0 ? count - 1 : from - 1;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return -1;
  }
}

/**
 * New sidebar width for a key pressed on the divider (P9-06), or null for any other key.
 * Arrows move 16px (64px with Shift) and Home/End jump to the limits, the window-splitter
 * pattern's keys. The sidebar sits on the left, so ArrowRight widens it; Up/Down mirror
 * them because a vertical separator gets both from screen readers.
 */
export function sidebarKeyWidth(key, width, shift = false, min = 200, max = 480) {
  const step = shift ? 64 : 16;
  let next;
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': next = width + step; break;
    case 'ArrowLeft': case 'ArrowDown': next = width - step; break;
    case 'Home': return min;
    case 'End': return max;
    default: return null;
  }
  return Math.max(min, Math.min(max, next));
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
  return list.filter((e) => e && typeof e.path === 'string' && e.path && !seen.has(keyOf(e)) && seen.add(keyOf(e)))
    .map((e) => ({
      ...(typeof e.key === 'string' && e.key && e.key !== e.path ? { key: e.key } : {}),
      path: e.path,
      label: typeof e.label === 'string' && e.label ? e.label : e.path.split('/').pop(),
      addedAt: Number.isFinite(e.addedAt) ? e.addedAt : 0,
      ...(cleanGroup(e.group) ? { group: cleanGroup(e.group) } : {}),
    }));
}

// ── bookmarks file (export / import) ──
// localStorage is per browser and per origin, so this file is the only way to carry a list
// from VS Code's Simple Browser to Chrome (or localhost to 127.0.0.1). Paths only, as stored.
export const PINS_FORMAT = 'project-hub-bookmarks';

export function exportPins(bookmarks, groups = []) {
  return JSON.stringify({ format: PINS_FORMAT, version: 1, bookmarks, groups }, null, 2) + '\n';
}

/** Merge, never replace: existing rows win, new paths are appended. null = not our file. */
export function importPins(current, groups, raw) {
  let file;
  try { file = JSON.parse(raw); } catch { return null; }
  if (!file || file.format !== PINS_FORMAT || !Array.isArray(file.bookmarks)) return null;
  const have = new Set(current.map((e) => e.path));
  const incoming = parseList(JSON.stringify(file.bookmarks)).filter((e) => !have.has(e.path));
  const names = (Array.isArray(file.groups) ? file.groups : []).map(cleanGroup).filter(Boolean);
  return { bookmarks: [...current, ...incoming], groups: [...new Set([...groups, ...names])], added: incoming.length };
}

// ── settings file (export / import) ──
// Everything a person set up, in one file: this browser's preferences (`local`, the raw
// localStorage strings) and what the hub server keeps (`server`: folders, folder icons,
// scan depth, favorites). JSON like the bookmarks file, so no parser has to be written.
export const SETTINGS_FORMAT = 'project-hub-settings';
// The only keys an import may write. Raw values are safe to restore because every reader
// of localStorage already distrusts what it finds there.
export const SETTINGS_KEYS = [BOOKMARKS_KEY, RECENT_KEY, 'hub.bmgroups', 'hub.rootorder', 'hub.theme', 'hub.zoom',
  'hub.rail', 'hub.sbw', 'hub.side', 'hub.collapsed', 'hub.folderview', 'hub.reader', 'hub.links', 'hub.doctabs',
  'hub.favsource', 'hub.websrc'];

export function exportSettings(local, server = {}) {
  const kept = {};
  for (const k of SETTINGS_KEYS) if (typeof local[k] === 'string') kept[k] = local[k];
  return JSON.stringify({ format: SETTINGS_FORMAT, version: 1, local: kept, server }, null, 2) + '\n';
}

/**
 * What an import should write. Bookmarks and recents merge into `current` (existing rows
 * win, as importPins does); every other preference is replaced. `server` is only shaped
 * here -- the hub validates each piece when it is sent. null = not our file.
 */
export function importSettings(current, raw) {
  let file;
  try { file = JSON.parse(raw); } catch { return null; }
  if (!file || file.format !== SETTINGS_FORMAT || !file.local || typeof file.local !== 'object') return null;
  const merge = (mine, theirs) => {
    const cur = parseList(mine);
    const have = new Set(cur.map(keyOf));
    return [...cur, ...parseList(theirs).filter((e) => !have.has(keyOf(e)))];
  };
  const local = {};
  for (const k of SETTINGS_KEYS) {
    const v = file.local[k];
    if (typeof v !== 'string' || v.length > 1e6) continue;
    if (k === BOOKMARKS_KEY) local[k] = JSON.stringify(merge(current[k], v));
    else if (k === RECENT_KEY) local[k] = JSON.stringify(merge(current[k], v).slice(0, RECENT_MAX));
    else local[k] = v;
  }
  const s = file.server && typeof file.server === 'object' ? file.server : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  return {
    local,
    server: {
      folders: (Array.isArray(s.folders) ? s.folders : []).filter((f) => obj(f) && typeof f.name === 'string' && typeof f.dir === 'string'),
      folderIcons: obj(s.folderIcons) || {},
      scan: obj(s.scan) ? { defaultDepth: s.scan.defaultDepth, workspaces: (Array.isArray(s.scan.workspaces) ? s.scan.workspaces : []).filter(obj) } : null,
      favorites: Array.isArray(s.favorites) ? s.favorites : null,
    },
  };
}

// ── bookmark groups ──
// A group is just a name on its bookmarks, so it exists while something is in it and an
// emptied group simply disappears. The one exception is a group made with "+ new group",
// which the page lists separately until its first bookmark arrives.
const cleanGroup = (g) => (typeof g === 'string' ? g.trim().slice(0, 60) : '');
const withGroup = (e, g) => {
  const { group: _drop, ...rest } = e;
  return cleanGroup(g) ? { ...rest, group: cleanGroup(g) } : rest;
};

// A bookmark's identity. The first bookmark of a path is keyed by the path itself, so lists
// saved before duplicates existed need no migration; only a copy carries its own `key`.
export const keyOf = (e) => e.key || e.path;

/** '' (or whitespace) takes the bookmark out of its group. */
export function setBookmarkGroup(list, key, group) {
  return list.map((e) => (keyOf(e) === key ? withGroup(e, group) : e));
}

/** Renaming onto an existing name merges the two; renaming to '' ungroups every member. */
export function renameBookmarkGroup(list, from, to) {
  return list.map((e) => (e.group === from ? withGroup(e, to) : e));
}

/**
 * Drag a group header onto another. Group order is first-appearance order, so the dragged
 * group's bookmarks move as a block: before the target when moving up, after it when down.
 */
export function moveBookmarkGroup(list, from, to) {
  const first = (g) => list.findIndex((e) => e.group === g);
  if (!from || !to || from === to || first(from) < 0 || first(to) < 0) return list;
  const down = first(from) < first(to);
  const moving = list.filter((e) => e.group === from);
  const rest = list.filter((e) => e.group !== from);
  const groups = rest.map((e) => e.group);
  const at = down ? groups.lastIndexOf(to) + 1 : groups.indexOf(to);
  rest.splice(at, 0, ...moving);
  return rest;
}

/**
 * Ungrouped first, then each group in the order its first bookmark appears, then any
 * `empty` (created, not yet filled) names that no bookmark carries.
 */
export function groupBookmarks(list, empty = []) {
  const groups = new Map([['', []]]);
  for (const e of list) {
    const g = e.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  for (const name of empty) {
    if (cleanGroup(name) && !groups.has(cleanGroup(name))) groups.set(cleanGroup(name), []);
  }
  return [...groups].map(([name, entries]) => ({ name, entries }));
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

export function renameBookmark(list, key, label) {
  return list.map((e) => (keyOf(e) === key ? { ...e, label: label || e.path.split('/').pop() } : e));
}

export function removeBookmark(list, key) {
  return list.filter((e) => keyOf(e) !== key);
}

/**
 * A second bookmark to the same path, placed right after the original. `group` undefined
 * keeps the original's group; a string (even '') puts the copy there.
 */
export function duplicateBookmark(list, key, group, now = Date.now()) {
  const i = list.findIndex((e) => keyOf(e) === key);
  if (i < 0) return list;
  const src = list[i];
  const keys = new Set(list.map(keyOf));
  let n = 2;
  while (keys.has(src.path + '#' + n)) n++;
  const copy = withGroup({ ...src, key: src.path + '#' + n, addedAt: now }, group === undefined ? src.group : group);
  return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
}

/** Drag-to-reorder. Out-of-range indexes are a no-op rather than an exception. */
export function moveBookmark(list, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Sort `list` in place into a saved order of ids. Items the order doesn't name (a folder
 * added since) keep their relative order at the end. In place, because the tree array is
 * shared by reference.
 */
export function orderByIds(list, ids) {
  const at = (n) => { const i = ids.indexOf(n.id); return i < 0 ? ids.length : i; };
  return list.sort((a, b) => at(a) - at(b));
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
