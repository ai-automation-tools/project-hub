// Project Hub test suite —  node --test hub.test.mjs   (or: npm test)
//
// Deliberately small. It covers the two things that actually broke in production:
// bytes that look fine in an editor but are not (the 2026-08-31 gzip and arrow bugs),
// and the markdown renderer, which is the only place untrusted-ish input is parsed.
// See ../Docs/ROADMAP.md for what is still open.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { md2html, sanitizeHtml, frontmatter, blurb, loadConfig, loadProjectConfig, scopeRepos, ignoreWatchEvent, slugifyHeading, parseLiveSites, DOC_FILE, folderStamps } from './hub.mjs';
import { parseList, isBookmarked, toggleBookmark, renameBookmark, moveBookmark, pushRecent,
  resolveBookmarks, RECENT_MAX, absolutePath } from './navigation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const HUB_DIRS = ['Project-Hub'];

/** Mirrors hub.mjs's own discoverProjects() so the test can't drift from runtime behavior. */
function projectConfigDirs() {
  const dir = path.join(ROOT, 'Projects');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries.filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'hub.config.json')))
    .map((e) => path.join(dir, e.name));
}

// ── the bug class that shipped three times ─────────────────────────────────
// A scripted edit using non-raw string literals turned `/\bgzip\b/` into two 0x08
// bytes (gzip silently never sent, 10.2MB per load) and `content:' \2193'` into
// 0x11 + "93" (the stat-tile arrow rendered as a control char). Neither is visible
// in an editor and both survived three copy-ports, so the check is by bytes.
test('no stray control bytes in any source file', () => {
  const files = [
    ...fs.readdirSync(HERE).filter((f) => /\.(mjs|html|json|ps1)$/.test(f)).map((f) => path.join(HERE, f)),
    ...HUB_DIRS.flatMap((d) => ['hub.config.json', 'Start-Hub.ps1'].map((f) => path.join(ROOT, d, f))),
    ...projectConfigDirs().map((d) => path.join(d, 'hub.config.json')),
  ].filter((f) => fs.existsSync(f));

  assert.ok(files.length >= 8, `expected to find the source files, got ${files.length}`);
  for (const f of files) {
    const bytes = fs.readFileSync(f);
    const bad = [...bytes.entries()]
      .filter(([, b]) => b < 9 || (b >= 11 && b <= 12) || (b >= 14 && b <= 31))
      .map(([i, b]) => `0x${b.toString(16).padStart(2, '0')} at offset ${i}`);
    assert.deepEqual(bad, [], `${path.relative(ROOT, f)} has control bytes: ${bad.join(', ')}`);
  }
});

// The search index was 4.42MB of a 10.23MB payload, every field of it copied from tree
// nodes the client already walks. It is built client-side now; putting it back on the
// wire would silently undo the largest payload win this project has had.
test('the scan payload does not carry a server-built search index', () => {
  const src = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  const ret = /return \{\s*\n\s*sig: String\(sig\),[\s\S]*?\n  \};/.exec(src);
  assert.ok(ret, 'could not find the scan payload literal');
  assert.doesNotMatch(ret[0], /^\s*(index|flat),?\s*$/m, 'payload includes an index again');
  assert.match(ret[0], /\btree, stats, rootDocs\b/);
});

test('the health endpoint reports the states a watchdog checks for', () => {
  const src = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  assert.match(src, /url\.pathname === '\/api\/health'/);
  for (const field of ['readErrors', 'lastScan', 'uptimeSec', 'state']) {
    assert.match(src, new RegExp(`\\b${field}\\b`), `health payload is missing ${field}`);
  }
  // Watch-Hubs.ps1 keys off exactly these; the pair has to move together.
  const ps = fs.readFileSync(path.join(HERE, 'Watch-Hubs.ps1'), 'utf8');
  for (const field of ['ok', 'state', 'readErrors', 'uptimeSec', 'lastScan']) {
    assert.match(ps, new RegExp(`\\$health\\.${field}|\\.${field}\\b`), `watchdog never reads ${field}`);
  }
});

test('the gzip negotiation regex is intact', () => {
  const src = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  const m = /const wantsGzip = (\/[^/]*\/)\.test/.exec(src);
  assert.ok(m, 'could not find the wantsGzip line');
  assert.equal(m[1], '/gzip/', 'the literal must match a real accept-encoding header');
  assert.ok(new RegExp(m[1].slice(1, -1)).test('gzip, deflate, br'));
});

// ── what wakes the watcher ─────────────────────────────────────────────────
// Every one of these was measured driving real rescans: the hub's own logs, and the
// bare-directory events Windows fires alongside every file event. Together they had the
// hub doing a full 2-3s rescan roughly every 8 seconds on an idle machine.
test('the watcher ignores noise and reacts to real changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hubwatch-'));
  const mk = (rel, isDir) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (isDir) fs.mkdirSync(full, { recursive: true }); else fs.writeFileSync(full, 'x');
    return rel;
  };

  // Real changes -- these must get through.
  assert.equal(ignoreWatchEvent(root, mk('docs/README.md')), false);
  assert.equal(ignoreWatchEvent(root, mk('Agents/Claude/CLAUDE.md')), false);
  assert.equal(ignoreWatchEvent(root, mk('.claude/skills/thing.md')), false, '.claude is on the allow-list');
  // A deleted path cannot be stat'ed, and a deletion is a real change.
  assert.equal(ignoreWatchEvent(root, 'docs/gone.md'), false);

  // Noise -- these must not.
  assert.equal(ignoreWatchEvent(root, null), true);
  assert.equal(ignoreWatchEvent(root, mk('node_modules/pkg/index.js')), true);
  assert.equal(ignoreWatchEvent(root, mk('repo/.git/index.lock')), true);
  assert.equal(ignoreWatchEvent(root, mk('db/.sync-state.json')), true, 'dot-file churn');
  assert.equal(ignoreWatchEvent(root, mk('Project-Hub/hub.log')), true, 'our own log');
  assert.equal(ignoreWatchEvent(root, mk('Hub/watchdog.log')), true, 'our own log');
  assert.equal(ignoreWatchEvent(root, mk('Project-Hub/scan.json')), true, 'our own output');
  // The one that mattered: Windows names the parent directory too, and a bare directory
  // says nothing a file event has not already said.
  assert.equal(ignoreWatchEvent(root, mk('db', true)), true, 'directory-only event');

  // Backslash-separated names, which is what fs.watch actually hands over on Windows.
  assert.equal(ignoreWatchEvent(root, 'Project-Hub\\hub.err.log'), true);
  assert.equal(ignoreWatchEvent(root, 'repo\\.git\\index.lock'), true);

  fs.rmSync(root, { recursive: true, force: true });
});

// ── markdown renderer ──────────────────────────────────────────────────────
test('renders the basics', () => {
  assert.match(md2html('# Title'), /<h1 id="title">Title<\/h1>/);
  assert.match(md2html('- one\n- two'), /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
  assert.match(md2html('a **bold** word'), /<strong>bold<\/strong>/);
  assert.match(md2html('see `code`'), /<code>code<\/code>/);
  assert.match(md2html('[text](./a.md)'), /<a href="\.\/a\.md" data-md-link>text<\/a>/);
  assert.match(md2html('| a | b |\n| - | - |\n| 1 | 2 |'), /<table><tbody>.*<\/tbody><\/table>/s);
});

// The click handler used to preventDefault() and stop on every '#anchor' link with no
// scroll — a heading id to scroll to never existed either, so both halves had to be
// fixed. This covers the id side: it has to match what every doc in the repo already
// links to, which was written assuming GitHub's slugger.
test('markdown headings get GitHub-style slug ids so in-doc anchors resolve', () => {
  const seen = new Map();
  assert.equal(slugifyHeading('Phase 0 — what shipped', seen), 'phase-0--what-shipped');
  assert.equal(slugifyHeading("Example's AI Lab", new Map()), 'examples-ai-lab');
  assert.equal(slugifyHeading('P0 — Verified defects', new Map()), 'p0--verified-defects');
  // Repeated heading text gets GitHub's -1, -2, … suffix.
  assert.equal(slugifyHeading('Notes', seen), 'notes');
  assert.equal(slugifyHeading('Notes', seen), 'notes-1');

  const html = md2html('## Phase 0 — what shipped\n\ntext\n\n## Phase 0 — what shipped\n\nmore');
  assert.match(html, /<h2 id="phase-0--what-shipped">Phase 0 — what shipped<\/h2>/);
  assert.match(html, /<h2 id="phase-0--what-shipped-1">Phase 0 — what shipped<\/h2>/);
});

test('fenced code is escaped, not interpreted', () => {
  const html = md2html('```js\nconst x = a < b && c > d;\n```');
  assert.match(html, /<pre class="code"><code>/);
  assert.match(html, /a &lt; b &amp;&amp; c &gt; d/);
  assert.doesNotMatch(html, /<script/i);
});

test('fenced code gets light keyword/string/comment highlighting', () => {
  const html = md2html('```js\nconst s = "hi"; // note\n```');
  assert.match(html, /<span class="tok-k">const<\/span>/);
  assert.match(html, /<span class="tok-s">"hi"<\/span>/);
  assert.match(html, /<span class="tok-c">\/\/ note<\/span>/);
});

test('a GitHub-style [!NOTE] blockquote renders as an alert box, a plain quote does not', () => {
  const alert = md2html('> [!WARNING]\n> First line.\n> Second line.');
  assert.match(alert, /<div class="alert alert-warning">/);
  assert.match(alert, /<p class="alert-label">WARNING<\/p>/);
  assert.match(alert, /<p>First line\. Second line\.<\/p>/);

  const plain = md2html('> just quoted\n> text');
  assert.match(plain, /<blockquote>just quoted<br>text<\/blockquote>/);
  assert.doesNotMatch(plain, /class="alert/);
});

test('YAML frontmatter is dropped from the rendered body', () => {
  const html = md2html('---\ntitle: Secret\n---\n\nBody text.');
  assert.doesNotMatch(html, /title: Secret/);
  assert.match(html, /Body text\./);
});

test('inline text is escaped', () => {
  assert.match(md2html('a <script>alert(1)</script> b'), /&lt;script&gt;/);
});

test('a whitespace-separated event handler is stripped', () => {
  const html = md2html('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /onerror/);
});

test('script and iframe tags are stripped from passed-through HTML', () => {
  assert.doesNotMatch(md2html('<script src="evil.js"></script>'), /<script/i);
  assert.doesNotMatch(md2html('<iframe src="evil"></iframe>'), /<iframe/i);
});

// ── the two bypasses that defeated the old regex filter ───────────────────
// Both executed against the running hub during the August audit. They were `todo`
// until the filter was replaced with parse-then-allowlist on 2026-08-31.
test('slash-separated event handler is stripped', () => {
  const html = md2html('<img/onerror="alert(1)"/src=x>');
  assert.doesNotMatch(html, /onerror/);
  assert.match(html, /<img src="x">/);          // the legitimate attribute survives
});

test('a tag split across lines is filtered as one tag', () => {
  const html = md2html('<img src="x"\n  onerror="alert(1)">');
  assert.doesNotMatch(html, /onerror/);
  assert.match(html, /<img src="x">/);
});

// ── the rebuilt filter ─────────────────────────────────────────────────────
test('only allowlisted attributes survive, in the order they were written', () => {
  assert.equal(sanitizeHtml('<img src="a.png" alt="x" width="10" onload="y" style="z" data-q="1">'),
    '<img src="a.png" alt="x" width="10">');
  assert.equal(sanitizeHtml('<p align="center" onclick="x">'), '<p align="center">');
  assert.equal(sanitizeHtml('<a href="./b.md" target="_blank" onmouseover="x">'),
    '<a href="./b.md" target="_blank">');
});

test('tags that are not on the list are removed', () => {
  assert.equal(sanitizeHtml('<object data="x"></object>'), '');
  assert.equal(sanitizeHtml('<iframe src="evil"></iframe>'), '');
  assert.equal(sanitizeHtml('<form action="/x"></form>'), '');
});

test('script and style take their contents with them', () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script>'), '');
  assert.equal(sanitizeHtml('<style>body{x:1}</style>'), '');
  assert.equal(sanitizeHtml('<div><script>alert(1)</script>ok</div>'), '<div>ok</div>');
});

test('only http, https, mailto and relative URLs are kept', () => {
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
    assert.doesNotMatch(sanitizeHtml(`<a href="${bad}">`), /href/, bad);
  }
  // Browsers ignore control characters inside a scheme, so they are stripped before the test.
  assert.doesNotMatch(sanitizeHtml('<a href="java\tscript:alert(1)">'), /href/);
  for (const ok of ['https://x.dev/a?b=1', 'http://x', 'mailto:a@b.c', './rel.md', '../up.md', '#anchor', 'img/a.png']) {
    assert.match(sanitizeHtml(`<a href="${ok}">`), /href=/, ok);
  }
});

test('attribute values are re-escaped, so a value cannot break out of its quotes', () => {
  const html = sanitizeHtml(`<img src='a.png" onerror="alert(1)' alt="x">`);
  assert.doesNotMatch(html, /onerror="alert/);
  assert.match(html, /&quot;/);
});

test('house-style header HTML is preserved', () => {
  const header = [
    '<h1 align="center">Title</h1>',
    '<p align="center">',
    '  <img src="https://img.shields.io/badge/a-b-c?style=for-the-badge&logo=x" alt="badge">',
    '  <a href="../README.md"><img src="https://img.shields.io/badge/d-e-f" alt="back"></a>',
    '</p>',
    '<sub>small print</sub>',
  ].join('\n');
  const html = md2html(header);
  assert.match(html, /<h1 align="center">Title<\/h1>/);
  assert.match(html, /<img src="https:\/\/img\.shields\.io[^"]*" alt="badge">/);
  assert.match(html, /<a href="\.\.\/README\.md">/);
  assert.match(html, /<sub>small print<\/sub>/);
  // & inside a URL becomes &amp; — the correct encoding; browsers decode it back.
  assert.match(html, /&amp;logo=x/);
});

// ── frontmatter / blurb ────────────────────────────────────────────────────
test('frontmatter reads scalars and folded blocks', () => {
  const fm = frontmatter('---\nname: my-skill\ndescription: >-\n  first line\n  second line\n---\nbody');
  assert.equal(fm.name, 'my-skill');
  assert.equal(fm.description, 'first line second line');
  assert.deepEqual(frontmatter('no frontmatter here'), {});
});

test('blurb takes the first real sentence, skipping chrome', () => {
  assert.equal(blurb('# Heading\n\n> quote\n\nThe real first line.'), 'The real first line.');
  assert.equal(blurb('---\ntitle: x\n---\n\n![badge](a.png)\n\nAfter the badge.'), 'After the badge.');
  assert.equal(blurb('# Only a heading'), '');
});

// A house-style README's real summary lives inside <p><em>…</em></p> under an <h1> and a
// badge row (see Example_Workspace/README.md) — blurb() used to skip every '<'-prefixed line
// outright and fall through to the first unwrapped prose line further down, which for
// that file was a sub-repo's description standing in for the whole workspace.
test('blurb reads text out of house-style HTML wrapper tags', () => {
  const doc = [
    '<h1 align="center">Example\'s AI Lab</h1>',
    '',
    '<p align="center">',
    '  <em>Workspace for the apps that ship under <a href="https://example.com"><b>example.com</b></a> — plus a couple of internal tools.</em>',
    '</p>',
    '',
    '<p align="center">',
    '  <img src="https://img.shields.io/badge/Repos-20-0078D4" alt="Repos">',
    '</p>',
    '',
    '## Next section',
  ].join('\n');
  assert.equal(blurb(doc), 'Workspace for the apps that ship under example.com — plus a couple of internal tools.');
});

// ── live sites (overview dashboard) ─────────────────────────────────────────
test('parseLiveSites reads the root README\'s own table, and nothing when there is none', () => {
  const doc = [
    '# Example\'s AI Lab',
    '',
    '## \u{1F310} Live sites',
    '',
    '| App | Subdomain | Status | Stack |',
    '|:---|:---|:---:|:---|',
    '| **Example\'s AI Lab** *(home)* | [example.com](https://example.com) | \u{1F7E2} Live | Static HTML, GH Pages |',
    '| **Edge Radar** | [edge-radar.example.com](https://edge-radar.example.com) | \u{1F7E2} Live | GH Pages |',
    '',
    '## Next section',
    '',
    '| not | this | table |',
    '|-|-|-|',
    '| a | b | c |',
  ].join('\n');
  const sites = parseLiveSites(doc);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites[0], { app: "Example's AI Lab (home)", url: 'https://example.com', status: '\u{1F7E2} Live', stack: 'Static HTML, GH Pages' });
  assert.equal(sites[1].app, 'Edge Radar');
  assert.equal(sites[1].url, 'https://edge-radar.example.com');

  assert.deepEqual(parseLiveSites('# No such section\n\ntext'), []);
});

// ── configuration ──────────────────────────────────────────────────────────
const tmpConfig = (obj) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hubcfg-')), 'hub.config.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
};

test('loadConfig fills defaults for the server-level config (port/title/favicon only)', () => {
  const c = loadConfig(tmpConfig({ port: 4300, base: 'D:/Work' }));
  assert.equal(c.name, 'Portfolio');
  assert.equal(c.title, 'Project Hub — Portfolio');
  assert.equal(c.favicon.glyph, '/');
  assert.deepEqual(c.sharedRoots, []);
  assert.equal(c.dir, undefined);
  assert.equal(c.repoScope, undefined);
});

// base and sharedRoots are the only machine-specific values left in the codebase; they
// moved out of hub.mjs so a checkout on someone else's disk is a config edit, not a diff.
test('loadConfig normalises base and sharedRoots', () => {
  const c = loadConfig(tmpConfig({
    port: 4300, base: 'D:/Work/',
    sharedRoots: [{ name: 'Docs', dir: 'D:/Work/Documents/' }],
  }));
  assert.equal(c.base, 'D:/Work');
  assert.deepEqual(c.sharedRoots, [{ name: 'Docs', dir: 'D:/Work/Documents', tint: 'var(--dimmer)' }]);
});

test('loadConfig rejects what would otherwise fail deep in a scan', () => {
  assert.throws(() => loadConfig(tmpConfig({})), /missing required key "port"/);
  assert.throws(() => loadConfig(tmpConfig({ port: 80 })), /port/);
  assert.throws(() => loadConfig(tmpConfig({ port: '4300' })), /port/);
  assert.throws(() => loadConfig(tmpConfig({ port: 4300 })), /missing required key "base"/);
  assert.throws(
    () => loadConfig(tmpConfig({ port: 4300, base: 'D:/Work', sharedRoots: [{ name: 'Docs' }] })),
    /sharedRoots\[0\] needs both/,
  );
  assert.throws(() => loadConfig(tmpConfig('{ not json')), /not valid JSON/);
  assert.throws(() => loadConfig(path.join(os.tmpdir(), 'definitely-absent.json')), /cannot read config/);
});

test('loadProjectConfig fills defaults and normalises the path', () => {
  const c = loadProjectConfig(tmpConfig({ name: 'X', dir: 'D:\\a\\b\\' }));
  assert.equal(c.dir, 'D:/a/b');
  assert.deepEqual(c.repoScope, {});
});

test('loadProjectConfig rejects what would otherwise fail deep in a scan', () => {
  assert.throws(() => loadProjectConfig(tmpConfig({ dir: 'D:/a' })), /missing required key "name"/);
  assert.throws(() => loadProjectConfig(tmpConfig({ name: 'X' })), /missing required key "dir"/);
  assert.throws(
    () => loadProjectConfig(tmpConfig({ name: 'X', dir: 'D:/a', repoScope: { groups: ['a'], pathPrefix: 'b/' } })),
    /not both/,
  );
});

test('every hub config is valid, unique and points somewhere real', () => {
  const seen = new Map();
  for (const d of HUB_DIRS) {
    const file = path.join(ROOT, d, 'hub.config.json');
    if (!fs.existsSync(file)) {
      loadConfig(path.join(ROOT, d, 'hub.config.example.json'));
      continue;
    }
    const c = loadConfig(file);
    assert.ok(!seen.has(c.port), `${d} reuses port ${c.port} (already ${seen.get(c.port)})`);
    seen.set(c.port, d);
  }
});

test('every project config is valid, and points somewhere real', () => {
  const dirs = projectConfigDirs();
  if (!dirs.length) loadProjectConfig(path.join(ROOT, 'Projects/_example/hub.config.json.example'));
  for (const d of dirs) {
    const file = path.join(d, 'hub.config.json');
    const c = loadProjectConfig(file);
    assert.ok(fs.existsSync(c.dir), `${d}: configured dir does not exist — ${c.dir}`);
    if (c.repoScope.pathPrefix) {
      assert.match(c.repoScope.pathPrefix, /\/$/, `${d}: pathPrefix must end in / or it matches sibling names`);
    }
  }
});

// ── scopeRepos: per-project repo scoping over one shared repos[] pool ───────
test('scopeRepos filters each project to its own dir before applying its repoScope', () => {
  const repos = [
    { id: 'Projects/A/Repos/tools/foo', group: 'tools' },
    { id: 'Projects/A/Repos/apps/bar', group: 'apps' },
    { id: 'Projects/B/Repos/tools/baz', group: 'tools' },
  ];
  const projects = [
    { idPrefix: 'Projects/A/', repoScope: { groups: ['apps'] } },
    { idPrefix: 'Projects/B/', repoScope: {} },
  ];
  const scoped = scopeRepos(repos, projects).map((r) => r.id);
  // A's own 'tools' group is excluded by A's own scope, and never leaks in from B's
  // same-named 'tools' group even though B's scope is wide open.
  assert.deepEqual(scoped.sort(), ['Projects/A/Repos/apps/bar', 'Projects/B/Repos/tools/baz'].sort());
});

// A repo's report deliverables (a rendered .html, a .pdf export, chart .pngs beside a
// markdown summary) should be visible the same as its docs; its actual source code
// (100k+ files across every mounted project, measured) should not.
test('DOC_FILE recognizes report deliverables (html/pdf/images) alongside docs, not source', () => {
  for (const f of ['report.pdf', 'chart.png', 'photo.jpg', 'icon.svg', 'diagram.webp', 'page.html', 'fragment.htm', 'notes.md', 'data.json', 'LICENSE']) {
    assert.ok(DOC_FILE.test(f), `${f} should be visible inside a repo`);
  }
  for (const f of ['app.ts', 'main.py', 'style.css', 'binary.exe', 'archive.zip']) {
    assert.ok(!DOC_FILE.test(f), `${f} should still be hidden inside a repo`);
  }
});

test('index.html carries every placeholder the server substitutes', () => {
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  for (const token of ['%TITLE%', '%FAVICON%', '%PORT%']) {
    assert.ok(html.includes(token), `index.html is missing ${token}`);
  }
  assert.equal((html.match(/%NONCE%/g) || []).length, 2, 'both inline scripts need a nonce');
  // Every placeholder in the file must be one the server actually knows how to fill.
  const known = new Set(['%TITLE%', '%FAVICON%', '%PORT%', '%NONCE%']);
  for (const found of html.match(/%[A-Z_]+%/g) || []) {
    assert.ok(known.has(found), `index.html uses ${found}, which the server does not substitute`);
  }
});

// P7-15. The search box is a combobox: arrowing through results used to change only a
// visual class, so a screen reader was never told which option was active. There is no
// DOM here, so this pins the wiring rather than the behaviour -- enough to fail loudly
// if any one of the four pieces is dropped again.
test('the search combobox keeps its ARIA wiring', () => {
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const input = /<input id="q"[\s\S]*?>/.exec(html)?.[0] || '';
  for (const attr of ['role="combobox"', 'aria-autocomplete="list"', 'aria-expanded=', 'aria-controls=']) {
    assert.ok(input.includes(attr), `#q is missing ${attr}`);
  }
  // aria-controls must name listboxes that actually get built.
  for (const id of /aria-controls="([^"]+)"/.exec(input)[1].split(/\s+/)) {
    assert.ok(html.includes(`list.id = '${id}'`), `nothing ever creates a listbox with id ${id}`);
  }
  assert.ok(/function syncCombobox/.test(html), 'syncCombobox was removed');
  assert.ok(html.includes('aria-activedescendant'), 'the active option is never announced');
  // Every path that repaints results has to re-sync: the render pass, the arrow keys,
  // and the Pictures section, which appends after the main list is already on the page.
  assert.equal((html.match(/syncCombobox\(/g) || []).length, 4,
    'syncCombobox must be defined and called from renderView, the arrow keys, and searchPictures');
});

// ── bookmarks and recents (P7-10) ──────────────────────────────────────────
// The lists survive a browser restart, so the storage round trip is the thing that
// actually breaks: a bad entry written by an older version must not take the sidebar
// down with it. localStorage is stubbed as the string it really is.

test('bookmarks round-trip through storage and survive junk written by anything else', () => {
  const store = new Map();
  const write = (list) => store.set('hub.bookmarks', JSON.stringify(list));
  const read = () => parseList(store.get('hub.bookmarks'));

  let list = toggleBookmark([], 'Documents/ROADMAP.md', 'ROADMAP.md', 1000);
  list = toggleBookmark(list, 'Projects/hub', 'hub', 2000);
  write(list);
  assert.deepEqual(read().map((e) => e.path), ['Documents/ROADMAP.md', 'Projects/hub']);

  // Toggling is how one control both shows and changes the state.
  assert.ok(isBookmarked(read(), 'Projects/hub'));
  write(toggleBookmark(read(), 'Projects/hub'));
  assert.equal(read().length, 1);
  assert.ok(!isBookmarked(read(), 'Projects/hub'));

  // Renaming keeps the path; an emptied label falls back to the basename.
  write(renameBookmark(read(), 'Documents/ROADMAP.md', 'Hub roadmap'));
  assert.equal(read()[0].label, 'Hub roadmap');
  write(renameBookmark(read(), 'Documents/ROADMAP.md', ''));
  assert.equal(read()[0].label, 'ROADMAP.md');

  // Drag-to-reorder, including the out-of-range drops a drag can genuinely produce.
  const three = parseList(JSON.stringify([{ path: 'a' }, { path: 'b' }, { path: 'c' }]));
  assert.deepEqual(moveBookmark(three, 0, 2).map((e) => e.path), ['b', 'c', 'a']);
  assert.deepEqual(moveBookmark(three, 2, 0).map((e) => e.path), ['c', 'a', 'b']);
  for (const bad of [[0, 9], [-1, 1], [NaN, 0], [1, 1]]) {
    assert.deepEqual(moveBookmark(three, ...bad).map((e) => e.path), ['a', 'b', 'c']);
  }

  // Anything that is not a usable list of paths reads back as empty, never as a throw.
  for (const junk of [undefined, null, '', 'not json', '{}', '[1,2]', '[{"label":"no path"}]']) {
    assert.deepEqual(parseList(junk), [], `parseList(${JSON.stringify(junk)}) should be empty`);
  }
  // Duplicate paths from a corrupted write collapse to one row.
  assert.equal(parseList('[{"path":"a"},{"path":"a"}]').length, 1);
});

test('recents are newest-first, deduplicated by path, and capped', () => {
  let recent = [];
  for (const name of ['one', 'two', 'three']) recent = pushRecent(recent, 'Docs/' + name, name);
  assert.deepEqual(recent.map((e) => e.label), ['three', 'two', 'one']);

  // Reopening a document moves it to the top rather than adding a second row.
  recent = pushRecent(recent, 'Docs/one', 'one');
  assert.deepEqual(recent.map((e) => e.label), ['one', 'three', 'two']);
  assert.equal(recent.length, 3);

  for (let i = 0; i < RECENT_MAX + 12; i++) recent = pushRecent(recent, 'Docs/f' + i, 'f' + i);
  assert.equal(recent.length, RECENT_MAX);
  assert.equal(recent[0].path, 'Docs/f' + (RECENT_MAX + 11));
  assert.ok(!recent.some((e) => e.path === 'Docs/one'), 'the cap must actually drop the tail');
});

test('a bookmark whose file is gone survives the scan as unresolved, with one relink offer', () => {
  const list = parseList(JSON.stringify([
    { path: 'Docs/here.md', label: 'here' },
    { path: 'Docs/moved.md', label: 'moved' },
    { path: 'Docs/deleted.md', label: 'deleted' },
  ]));
  const present = new Set(['Docs/here.md', 'Docs/sub/moved.md']);
  const suggest = (p) => (p === 'Docs/moved.md' ? 'Docs/sub/moved.md' : '');
  const marked = resolveBookmarks(list, (p) => present.has(p), suggest);

  assert.equal(marked.length, 3, 'a missing file must never silently drop its bookmark');
  assert.deepEqual(marked.map((e) => e.unresolved), [false, true, true]);
  // A suggestion is offered, never applied: the stored path is untouched.
  assert.equal(marked[1].suggestion, 'Docs/sub/moved.md');
  assert.equal(marked[1].path, 'Docs/moved.md');
  assert.equal(marked[2].suggestion, '', 'no candidate means no relink offer');

  // Recovery: the file comes back and the entry resolves again with no user action.
  present.add('Docs/deleted.md');
  assert.equal(resolveBookmarks(list, (p) => present.has(p))[2].unresolved, false);
});

test('the sidebar keeps bookmarks and recents wired, and stores paths only', () => {
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  assert.ok(html.includes('<div id="pins">'), 'the sidebar has no pins host');
  // Both sections start closed -- the collapsed-startup rule this feature must not break.
  assert.ok(/open: \{ bookmarks: false, recent: false \}/.test(html), 'the lists must start collapsed');
  for (const call of ['recordRecent(', 'togglePin(', 'renderPins()', 'bookmarkBtn(', 'pinContext(']) {
    assert.ok(html.includes(call), `index.html never calls ${call}`);
  }
  // Only the two path lists are persisted; nothing writes document text to storage.
  const written = [...html.matchAll(/localStorage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
  for (const key of written) {
    assert.ok(['BOOKMARKS_KEY', 'RECENT_KEY', "'hub.rail'", "'hub.theme'", "'hub.sbw'", "'hub.collapsed'", "'hub.folderview'", "'hub.reader'"].includes(key),
      `unexpected localStorage key ${key}`);
  }
});

// ── folder list view (P7-09) ───────────────────────────────────────────────
// Modified times are fetched per folder instead of riding on every scanned node, so the
// thing worth pinning is that the fetch stays cheap: immediate children only, names not
// ids, no recursion, and no file contents read.

test('folderStamps reads one folder, by name, without recursing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-stat-test-'));
  try {
    fs.writeFileSync(path.join(root, 'a.md'), 'a');
    fs.writeFileSync(path.join(root, 'b with space.md'), 'b');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'deep.md'), 'deep');

    const times = folderStamps(root);
    assert.deepEqual(Object.keys(times).sort(), ['a.md', 'b with space.md', 'sub']);
    assert.ok(!('deep.md' in times), 'a nested file must not appear — this never recurses');
    for (const [name, ms] of Object.entries(times)) {
      assert.equal(typeof ms, 'number', name);
      assert.ok(ms > 0 && ms <= Date.now() + 1000, `${name} has an implausible mtime`);
    }
    // Keys are bare names: repeating the folder prefix per row is the payload weight
    // this endpoint exists to avoid in the first place.
    assert.ok(!Object.keys(times).some((k) => k.includes('/')), 'keys must be names, not ids');

    // A path that is not a readable directory is null, which the endpoint turns into 404.
    assert.equal(folderStamps(path.join(root, 'does-not-exist')), null);
    assert.equal(folderStamps(path.join(root, 'a.md')), null, 'a file is not a folder listing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the stat endpoint resolves through resolveId and the list view is wired', () => {
  const server = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  const handler = /if \(url\.pathname === '\/api\/stat'\) \{[\s\S]*?\n  \}/.exec(server)?.[0] || '';
  assert.ok(handler, '/api/stat handler not found');
  // Same gate every other path-addressed endpoint uses; without it this reads any folder.
  assert.ok(handler.includes('resolveId('), '/api/stat must resolve through resolveId');
  assert.ok(handler.includes("403"), '/api/stat must refuse paths outside the roots');

  const ui = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  for (const call of ['folderList(', 'folderTimesFor(', 'setFolderMode(', 'fmtAgo(']) {
    assert.ok(ui.includes(call), `index.html never calls ${call}`);
  }
  // A scan landing must drop cached timestamps, or the list shows times from a stale scan.
  assert.ok(/folderTimesGen\+\+; folderTimes\.clear\(\)/.test(ui),
    'a new scan must invalidate the folder timestamp cache');
});

// ── reader tools (P7-12) ───────────────────────────────────────────────────
test('the source toggle asks for raw explicitly, and every reader tool is wired', () => {
  const server = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  const handler = /if \(url\.pathname === '\/api\/file'\) \{[\s\S]*?\n  \}/.exec(server)?.[0] || '';
  assert.ok(handler, '/api/file handler not found');
  // The 2026-09-08 note said a view-source toggle belongs behind ?raw=1 rather than in
  // every reply -- 44% of the bytes of a large README. Keep it that way.
  assert.ok(handler.includes("get('raw') === '1'"), 'source view must be opt-in per request');
  assert.ok(!/raw:\s*text/.test(handler), 'raw text must never ride along with the rendered reply');
  // A non-markdown file has no rendered form, so it is source whether or not raw is asked.
  assert.match(handler, /raw'\) === '1' \|\| !\/\\.md\$\/i\.test\(abs\)/);

  const ui = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  for (const call of ['buildOutline(', 'addCopyButtons(', 'cycleReader(', 'window.print()']) {
    assert.ok(ui.includes(call), `index.html never calls ${call}`);
  }
  assert.ok(ui.includes("'&raw=1'"), 'the client never requests raw source');
  // The measure is on the children of .md, not on .md itself, so the panel chrome stays
  // full width. Wide children are held to the measure and scroll inside it -- they have
  // their own overflow-x already, so nothing is ever clipped.
  assert.ok(ui.includes('.md>*{max-width:var(--read-width,none)}'), 'reading width must apply to children of .md');
  const END = String.fromCharCode(10) + '}';
  const printCss = ui.slice(ui.indexOf('@media print{'), ui.indexOf(END, ui.indexOf('@media print{')));
  assert.ok(printCss.startsWith('@media print{'), 'no print stylesheet');
  // Everything hidden here is chrome whose only job is getting you to the document.
  for (const hidden of ['aside', 'header', '.ph', '.outline', '.copycode']) {
    assert.ok(printCss.includes(hidden), `print stylesheet never mentions ${hidden}`);
  }
  assert.ok(printCss.includes('.md>*{max-width:none}'), 'print must drop the reading measure');
});

// ── scan status detail (P7-16) ─────────────────────────────────────────────
// The point of this item was that "19 read errors" behind a green `ready` is not
// actionable. Pin the two halves that make it actionable: the server records which path
// failed and why, and the UI stops describing the index as "only docs and config".

test('read errors are recorded with a path and a reason, bounded and paths-only', () => {
  const server = fs.readFileSync(path.join(HERE, 'hub.mjs'), 'utf8');
  const note = /function noteReadError\([\s\S]*?\n\}/.exec(server)?.[0] || '';
  assert.ok(note, 'noteReadError not found');
  assert.ok(note.includes('readErrorLog.delete(file)') && note.includes('readErrorLog.set(file'),
    'a repeat failure on one path must move it, not add a second entry');
  assert.ok(/readErrorLog\.size > READ_ERROR_MAX/.test(note), 'the log must be bounded');
  // Paths and an errno only. A read error means a file could not be read; storing any of
  // its content here would be both useless and a leak.
  assert.ok(!/(text|content|buf|head)\b/.test(note), 'noteReadError must not capture file content');

  // Both counting sites now record the path; neither may go back to a bare increment.
  const bumps = [...server.matchAll(/(?<![.\w])readErrors\+\+/g)];
  assert.equal(bumps.length, 1, 'readErrors++ should live only inside noteReadError');
  assert.ok(server.includes('readErrorPaths:'), '/api/health must expose the failing paths');
  assert.ok(/readErrorPaths:[^\n]*rel\(file\)/.test(server), 'paths must be relative ids, not absolute');
});

test('the UI explains what is indexed instead of understating it', () => {
  const ui = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  // The old wording predated PDF, HTML-report and image support and was simply wrong.
  assert.ok(!ui.includes('only docs and config'), 'the understated indexing text is back');
  assert.ok(ui.includes('showStatusPanel('), 'the status detail panel is not wired');
  assert.ok(ui.includes("activate($('#live')"), 'the scan status must be clickable');
  // The panel has to name the things the roadmap called invisible.
  for (const shown of ['Last successful scan', 'Where the time went', 'Read errors', 'What gets indexed']) {
    assert.ok(ui.includes(shown), `status panel is missing the "${shown}" section`);
  }
  // Its file-type list must actually match the scanner's, or it is a new lie for an old one.
  const kinds = DOC_FILE.source.toLowerCase();
  for (const ext of ['pdf', 'svg', 'webp', 'toml', 'csv']) {
    assert.ok(kinds.includes(ext), `DOC_FILE no longer indexes ${ext}`);
    assert.ok(ui.includes(ext), `the status panel does not mention ${ext}`);
  }
});

// ── image browsing (P7-13) ─────────────────────────────────────────────────
// The scale risk here is a folder of two thousand photos. Pin that thumbnails stay lazy
// and that the viewer's controls exist; the numbers themselves are a browser measurement.
test('image thumbnails are lazy and the viewer has its controls', () => {
  const ui = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const thumb = /if \(c\.kind === 'image'\) \{[\s\S]*?\n    \}/.exec(ui)?.[0] || '';
  assert.ok(thumb, 'image cards never build a thumbnail');
  // Native lazy loading is the entire mechanism -- no observer to write or get wrong.
  assert.ok(thumb.includes("thumb.loading = 'lazy'"), 'thumbnails must not load eagerly');
  assert.ok(thumb.includes("decoding = 'async'"), 'thumbnails must decode off the main thread');
  assert.ok(thumb.includes('thumb.onerror'), 'a broken image must remove itself, not leave a gap');

  for (const bit of ['imageSiblings(', 'ZOOM_STEPS', 'naturalWidth', "el('div', 'imgwrap'"]) {
    assert.ok(ui.includes(bit), `the image viewer is missing ${bit}`);
  }
  // Zoom is session state shared across images: flipping through a folder at 100% must
  // stay at 100%. If this becomes a localStorage key, the allowlist test will catch it.
  assert.ok(/let imgZoom = null;/.test(ui), 'zoom must default to fit');

  // Arrow keys belong to the tree and the search box first; the viewer only gets them
  // when neither has focus and an image is actually open.
  const keys = /if \(e\.key !== 'ArrowLeft' && e\.key !== 'ArrowRight'\) return;[\s\S]*?\n\}\);/.exec(ui)?.[0] || '';
  assert.ok(keys, 'no arrow-key navigation for images');
  assert.ok(keys.includes("closest('#tree')"), 'arrow keys must not be stolen from the tree');
  assert.ok(keys.includes('INPUT|TEXTAREA|SELECT'), 'arrow keys must not be stolen from a text field');
  assert.ok(keys.includes('e.altKey'), 'Alt+arrow is Back/Forward and must still work');
});

test('copy paths use the configured base, home and cross-drive ids', () => {
  assert.equal(absolutePath('Projects/Demo/a #1.md', 'E:/Work', 'C:/Users/demo'), 'E:/Work/Projects/Demo/a #1.md');
  assert.equal(absolutePath('~/Pictures/photo.png', 'E:/Work', 'C:/Users/demo'), 'C:/Users/demo/Pictures/photo.png');
  assert.equal(absolutePath('F:/Reports/a.md', 'E:/Work'), 'F:/Reports/a.md');
  assert.equal(absolutePath('../Docs/a.md', '/work/projects'), '/work/Docs/a.md');
  assert.equal(absolutePath('@projects', 'E:/Work'), '');
});
