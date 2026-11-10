// Project Hub — markdown: frontmatter, blurbs, the live-sites table, the renderer and its
// raw-HTML sanitizer, heading slugs, and the link check. Pure text in, text out; the only
// filesystem touch is checkLinks()'s default `exists`. hub.mjs re-exports all of it.

import fs from 'node:fs';
import path from 'node:path';

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
    } else if (val === '') {
      // P9-19: a block list (`tags:` then `  - a` lines) reads as "a, b", like a flow list.
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+\S/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '').trim());
      if (items.length) val = items.join(', ');
    }
    out[key] = val.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/**
 * P9-19: a document's tags from its frontmatter -- `tags:` (or `tag:` / `keywords:`) as a
 * flow list `[a, b]`, a block list, or a comma- or space-separated string. Lowercased,
 * without a leading `#`, deduplicated.
 */
export function docTags(fm) {
  const raw = String(fm.tags || fm.tag || fm.keywords || '').replace(/^\[|\]$/g, '').trim();
  if (!raw) return [];
  const parts = raw.includes(',') ? raw.split(',') : raw.split(/\s+/);
  return [...new Set(parts.map((t) => t.trim().replace(/^["'#]+|["']+$/g, '').toLowerCase()).filter(Boolean))];
}

/** The frontmatter worth showing above a document: tags, status, and any date field. */
export function docMeta(text) {
  const fm = frontmatter(text);
  const meta = {};
  const tags = docTags(fm);
  if (tags.length) meta.tags = tags;
  if (fm.status) meta.status = fm.status;
  const dates = Object.entries(fm).filter(([k, v]) => v && /date|created|updated|modified|reviewed/i.test(k));
  if (dates.length) meta.dates = dates;
  return Object.keys(meta).length ? meta : null;
}

/** First real sentence of a markdown doc — used as a card blurb. */
// House-style READMEs open with an <h1>/badge-row wrapper and put the actual one-line
// summary inside a plain <p><em>…</em></p> a few lines down (see Example_Workspace/README.md).
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

/** http, https, mailto, vscode, or no scheme at all (relative paths and #anchors). */
function safeUrl(value) {
  // Control characters and stray whitespace inside a scheme are a classic way to smuggle
  // `java\tscript:` past a naive check; browsers ignore them, so strip before testing.
  const v = value.replace(/[\u0000-\u0020]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  return !scheme || /^(https?|mailto|vscode)$/i.test(scheme[1]);
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

  // The attribute run can't let a quote match both as a quoted string and as a plain
  // character: that ambiguity backtracked exponentially on a tag full of quotes. Any `<`
  // left that doesn't open a complete tag (an unclosed `<img ...` at the end of a chunk,
  // which the next chunk's `>` would otherwise close) is escaped to text.
  return stripped.replace(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|</g,
    (m, close, tag, attrs) => {
      if (m === '<') return '&lt;';
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
  // Trim the heading text, not the result: "🔧 Setup" loses its emoji but keeps the
  // space after it, so GitHub slugs it "-setup" and house-style READMEs link to that.
  let s = text.trim()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
  if (!s) s = 'section';
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n === 0 ? s : `${s}-${n}`;
}

// P9-11: an on-demand link check. Never part of a scan: it reads every document under one
// folder, so it runs only when someone asks. Headings use slugifyHeading exactly as the
// renderer does, plus explicit <a id>/<a name> anchors, so "missing heading" means the
// reader's own jump would fail too.
export function linkTargets(text) {
  const out = [];
  let fence = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; return; }
    if (fence) return;
    const line = raw.replace(/`[^`]*`/g, '');
    // `(<a b.md>)` may hold spaces; a bare destination ends at the first space.
    for (const m of line.matchAll(/(!?)\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g)) out.push({ href: m[2] ?? m[3], image: !!m[1], line: i + 1 });
    for (const m of line.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) out.push({ href: m[1], image: true, line: i + 1 });
  });
  return out;
}

export function headingAnchors(text) {
  const seen = new Map(), ids = new Set();
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) ids.add(slugifyHeading(h[2], seen));
    for (const m of line.matchAll(/<a\s+[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) ids.add(m[1]);
  }
  return ids;
}

export const LINKCHECK_MAX_DOCS = 2000;
/**
 * docs: [{ id, abs }] markdown files. allowed(abs) says whether a target may be probed at
 * all (outside the roots it is reported, not looked at). read(abs) returns text or null.
 */
export async function checkLinks(docs, { allowed, read, exists = fs.existsSync }) {
  const problems = [], anchors = new Map();
  const anchorsOf = async (abs) => {
    if (!anchors.has(abs)) { const t = await read(abs); anchors.set(abs, t == null ? null : headingAnchors(t)); }
    return anchors.get(abs);
  };
  let links = 0;
  for (const doc of docs.slice(0, LINKCHECK_MAX_DOCS)) {
    const text = await read(doc.abs);
    if (text == null) continue;
    for (const { href, image, line } of linkTargets(text)) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue;   // http:, mailto:, data:, //host
      links++;
      const hash = href.indexOf('#');
      let file = (hash < 0 ? href : href.slice(0, hash)).split('?')[0];
      let heading = hash < 0 ? '' : href.slice(hash + 1);
      try { file = decodeURIComponent(file); heading = decodeURIComponent(heading); }
      catch { problems.push({ doc: doc.id, line, href, kind: 'malformed' }); continue; }
      const target = file ? path.resolve(path.dirname(doc.abs), file) : doc.abs;
      const report = (kind) => problems.push({ doc: doc.id, line, href, kind });
      if (file && file.startsWith('/')) { report('absolute'); continue; }
      if (!allowed(target)) { report('outside roots'); continue; }
      if (!exists(target)) { report(image ? 'missing image' : 'missing file'); continue; }
      if (heading && /\.(md|mdx|markdown)$/i.test(target)) {
        const ids = await anchorsOf(target);
        if (ids && !ids.has(heading) && !ids.has(heading.toLowerCase())) report('missing heading');
      }
    }
  }
  return { docs: Math.min(docs.length, LINKCHECK_MAX_DOCS), totalDocs: docs.length, links, problems };
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

  // P9-51: `esc()` leaves quotes alone (right for text), so anything landing inside an
  // attribute gets them escaped too, and a target is kept only if safeUrl() admits it --
  // otherwise `[x](a" onmouseover=…)` or `[x](javascript:…)` was held back by the CSP alone.
  const q = (v) => v.replace(/"/g, '&quot;');
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => safeUrl(src) ? `<img src="${q(src)}" alt="${q(alt)}">` : alt)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => safeUrl(href) ? `<a href="${q(href)}" data-md-link>${text}</a>` : text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  for (const line of lines) {
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      flushHtml(); flushPara(); closeList(); flushQuote();
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { out.push(`<pre class="code"><code>`); inCode = true; }
      continue;
    }
    if (inCode) { out.push(highlightCode(esc(line)) + '\n'); continue; }

    if (htmlBuf === null && isBlockHtml(line)) { flushPara(); closeList(); flushQuote(); htmlBuf = ''; }
    if (htmlBuf !== null) {
      // Still inside a tag? Keep reading, even across a blank line. The line cap stops a
      // stray '<' in prose from swallowing the rest of the document.
      const inTag = htmlBuf.lastIndexOf('<') > htmlBuf.lastIndexOf('>') && htmlLines < 25;
      // Otherwise the block runs to the next blank line, as on GitHub (CommonMark type 6):
      // the bare `·` separators between centred links are part of the <p>, not new paragraphs.
      if (inTag || line.trim()) {
        htmlBuf += (htmlBuf ? '\n' : '') + line;
        htmlLines++;
        continue;
      }
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
