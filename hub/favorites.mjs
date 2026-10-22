// Manual favorites: the tree edits and the bookmarks-file import/export behind the
// Favorites view. Pure, like navigation.mjs, so it is tested without a DOM. A node is
// { name, url } or { name, children }; a position is an array of child indexes from the roots.

const copy = (roots) => JSON.parse(JSON.stringify(roots));
const isWeb = (url) => /^https?:\/\//i.test(url || '');

export function nodeAt(roots, at) {
  let list = roots, node = null;
  for (const i of at) { node = list?.[i]; list = node?.children; }
  return node;
}
const listAt = (roots, parent) => (parent.length ? nodeAt(roots, parent)?.children : roots);

/** Insert node into the folder at `parent`, at `index` (default: the end). */
export function insertNode(roots, parent, node, index) {
  const next = copy(roots);
  const list = listAt(next, parent);
  if (!list) return roots;
  list.splice(index == null ? list.length : Math.max(0, Math.min(index, list.length)), 0, node);
  return next;
}

export function removeNode(roots, at) {
  const next = copy(roots);
  const list = listAt(next, at.slice(0, -1));
  if (!list || at.length < 2 || !list[at[at.length - 1]]) return roots;   // roots themselves stay
  list.splice(at[at.length - 1], 1);
  return next;
}

/** Rename a node, and re-point a link. A blank name or a non-web URL is ignored. */
export function editNode(roots, at, { name, url } = {}) {
  const next = copy(roots);
  const node = nodeAt(next, at);
  if (!node) return roots;
  if (name != null && name.trim()) node.name = name.trim();
  if (url != null && node.url && isWeb(url.trim())) node.url = url.trim();
  return next;
}

/**
 * Bring imported favorites in the way a browser's import does. Into an empty list they land
 * where they came from -- a toolbar folder fills the Favorites bar, a root matching an
 * existing one by name merges into it, anything else goes under Other favorites. Into a
 * list that already has favorites they arrive as one "Imported from …" folder on the bar,
 * so nothing already there is rearranged.
 */
export function mergeImport(roots, imported, label) {
  if (countLinks(roots) > 0) return insertNode(roots, [0], { name: 'Imported from ' + label, children: imported });
  const next = copy(roots);
  const other = next[1] || next[0];
  for (const n of imported) {
    const target = !n.children ? null
      : /(bar|toolbar)$/i.test(n.name) ? next[0]
        : next.find((r) => r.name.toLowerCase() === n.name.toLowerCase()) || (/^other\b/i.test(n.name) ? other : null);
    if (target) target.children.push(...n.children);
    else other.children.push(n);
  }
  return next;
}

/**
 * Move the node at `from` into folder `parent` at `index`. Refuses to move a root, or a
 * folder into itself. Removing first shifts later siblings, so the index is corrected.
 */
export function moveNode(roots, from, parent, index) {
  if (from.length < 2) return roots;
  if (parent.length >= from.length && from.every((v, i) => parent[i] === v)) return roots;
  const node = nodeAt(roots, from);
  if (!node || !Array.isArray(listAt(roots, parent))) return roots;
  const sameList = parent.length === from.length - 1 && parent.every((v, i) => from[i] === v);
  let target = index;
  if (sameList && target != null && target > from[from.length - 1]) target -= 1;
  // The parent's own position shifts too when the moved node was an earlier sibling of one of its ancestors.
  const adjusted = parent.map((v, i) => (i === from.length - 1 && parent.slice(0, i).every((p, j) => p === from[j]) && v > from[i] ? v - 1 : v));
  return insertNode(removeNode(roots, from), adjusted, node, target);
}

/** Every folder as [position, "Root / Sub / Folder"], for pickers. */
export function folderList(roots) {
  const out = [];
  const walk = (list, at, prefix) => list.forEach((n, i) => {
    if (!n.children) return;
    const pos = [...at, i], label = prefix ? prefix + ' / ' + n.name : n.name;
    out.push([pos, label]);
    walk(n.children, pos, label);
  });
  walk(roots, [], '');
  return out;
}

export function countLinks(nodes) {
  return nodes.reduce((n, x) => n + (x.children ? countLinks(x.children) : 1), 0);
}

// ── the bookmarks file every browser exports ──────────────────────────────────
// "NETSCAPE-Bookmark-file-1": nested <DL> lists of <DT><H3>folder</H3> and <DT><A>link</A>.
// Tokenised rather than handed to DOMParser, so the same code runs in the tests.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : ENTITIES[e.toLowerCase()] ?? m));
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decode(m[1] ?? m[2] ?? m[3]) : '';
};

/** Folders and web links out of a browser's exported bookmarks file. */
export function parseBookmarksHtml(html) {
  const top = { children: [] };
  const stack = [top];
  let pendingFolder = null, open = null;   // open = the <A> or <H3> whose text is being read
  const re = /<(\/?)(dl|h3|a)\b([^>]*)>|([^<]+)/gi;
  for (let m; (m = re.exec(html));) {
    const [, close, tagName, attrs, text] = m;
    if (text != null) { if (open) open.text += text; continue; }
    const tag = tagName.toLowerCase();
    const current = stack[stack.length - 1];
    if (tag === 'dl' && !close) {
      // A <DL> right after an <H3> is that folder's contents; the outermost one is the file itself.
      if (pendingFolder) { stack.push(pendingFolder); pendingFolder = null; }
    } else if (tag === 'dl' && close) {
      if (stack.length > 1) stack.pop();
    } else if (!close) {
      open = { tag, text: '', href: attr(attrs, 'href') };
    } else if (open && open.tag === tag) {
      const name = decode(open.text).replace(/\s+/g, ' ').trim();
      if (tag === 'h3') { pendingFolder = { name: name || '(untitled)', children: [] }; current.children.push(pendingFolder); }
      else if (isWeb(open.href)) current.children.push({ name: name || open.href, url: open.href });
      open = null;
    }
  }
  return top.children;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The same format back out, so a list made here imports into any browser. */
export function toBookmarksHtml(roots) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const walk = (nodes, pad) => {
    for (const n of nodes) {
      if (n.children) {
        lines.push(`${pad}<DT><H3>${esc(n.name)}</H3>`, `${pad}<DL><p>`);
        walk(n.children, pad + '    ');
        lines.push(`${pad}</DL><p>`);
      } else lines.push(`${pad}<DT><A HREF="${esc(n.url)}">${esc(n.name)}</A>`);
    }
  };
  walk(roots, '    ');
  lines.push('</DL><p>', '');
  return lines.join('\n');
}
