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
export function searchHash(query, scoped = false, limit = 200) {
  if (!query) return '';
  const parts = ['q=' + encodeURIComponent(query)];
  if (scoped) parts.push('scoped=1');
  if (limit && limit !== 200) parts.push('limit=' + limit);
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
    };
  } catch { return null; }
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
