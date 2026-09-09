import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createReportHandler, REPORT_CSP } from './reports.mjs';
import { kindOfFile, fileStamp, scanSignature } from './hub.mjs';
import { routeHash, parseRoute, searchHash, parseSearch, documentTarget, markdownLink, includeInSearch } from './navigation.mjs';
import { launchNative } from './open-native.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

test('PDF and HTML report filenames enter search without indexing ordinary source', () => {
  for (const [name, kind] of [['report.PDF', 'pdf'], ['report.html', 'html'], ['report.htm', 'html'], ['chart.png', 'image']]) {
    assert.equal(kindOfFile(name), kind);
    assert.equal(includeInSearch({ name, kind: kindOfFile(name) }), true);
  }
  assert.equal(includeInSearch({ name: 'app.ts', kind: kindOfFile('app.ts') }), false);
});

test('search routes round-trip so Back returns to the results, not the previous document', () => {
  // The defect this covers: opening a result cleared the query and left no route behind,
  // so Back landed on the last document instead of the search you came from.
  for (const q of ['readme', 'pdf: quarterly report', 'A & B', '日本語']) {
    assert.deepEqual(parseSearch(searchHash(q)), { query: q, scoped: false, limit: 200 });
  }
  assert.deepEqual(parseSearch(searchHash('readme', true, 600)), { query: 'readme', scoped: true, limit: 600 });

  // Clean URLs: defaults are never spelled out, and an empty query has no route at all.
  assert.equal(searchHash('readme'), '#?q=readme');
  assert.equal(searchHash('readme', false, 200), '#?q=readme');
  assert.equal(searchHash(''), '');

  // Document routes and search routes must not be mistaken for one another.
  assert.equal(parseSearch(routeHash('Projects/Example_Workspace')), null);
  assert.equal(parseSearch(routeHash('Docs/README.md', 'install')), null);
  assert.equal(parseSearch('#'), null);
  assert.equal(parseSearch('#?scoped=1'), null);
  assert.equal(parseRoute(searchHash('readme')).id, '');

  // A hand-edited or hostile limit must not become an unbounded render.
  assert.equal(parseSearch('#?q=x&limit=999999').limit, 200);
  assert.equal(parseSearch('#?q=x&limit=-5').limit, 200);
  assert.equal(parseSearch('#?q=x&limit=abc').limit, 200);
});

test('heading routes preserve old links and round-trip punctuation and Unicode', () => {
  for (const id of ['Projects/Example_Workspace', '~/skills/test/SKILL.md', 'Documents/A & B/日本語.md']) {
    assert.deepEqual(parseRoute(routeHash(id, 'setup & use')), { id, heading: 'setup & use' });
  }
  assert.deepEqual(parseRoute('#Projects/Example_Workspace'), { id: 'Projects/Example_Workspace', heading: '' });
  assert.deepEqual(parseRoute('#bad%zz'), { id: '', heading: '' });
  assert.deepEqual(documentTarget('Docs/Guide/README.md', '../Other%20Doc.md#install%20now'), { id: 'Docs/Other Doc.md', heading: 'install now' });
  assert.deepEqual(documentTarget('Docs/README.md', '#top'), { id: 'Docs/README.md', heading: 'top' });
  assert.equal(documentTarget('Docs/README.md', '%zz'), null);
  assert.equal(markdownLink('A [draft]', 'http://localhost/#A B'), '[A \\[draft\\]](<http://localhost/#A%20B>)');
});

test('same-length edits change the scan signature without changing descriptions', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-revision-test-'));
  const file = path.join(folder, 'report.md');
  try {
    fs.writeFileSync(file, 'value: 10');
    fs.utimesSync(file, 100000, 100000);
    const before = { id: 'report.md', desc: 'unchanged', ...fileStamp(file) };
    fs.writeFileSync(file, 'value: 11');
    fs.utimesSync(file, 100002, 100002);
    const after = { id: 'report.md', desc: 'unchanged', ...fileStamp(file) };
    assert.equal(before.size, after.size);
    assert.notEqual(scanSignature([before], []), scanSignature([after], []));
  } finally { fs.unlinkSync(file); fs.rmdirSync(folder); }
});

test('native launch treats paths as data and propagates process errors', async () => {
  const file = 'D:\\Reports\\A & B $(test) %PATH%.pdf';
  let called = false;
  await launchNative(file, 'code', (program, args, options, cb) => {
    called = true;
    assert.equal(program, 'powershell.exe');
    assert.equal(options.env.HUB_OPEN_PATH, file);
    assert.equal(options.windowsHide, true);
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    assert.ok(!script.includes(file));
    assert.match(script, /\$env:HUB_OPEN_PATH/);
    cb(null);
  });
  assert.ok(called);
  await assert.rejects(launchNative(file, 'default', (_p, _a, _o, cb) => cb(new Error('failed'))), /launch request failed/);
  await assert.rejects(launchNative(file, 'bad'), /unsupported/);
});

test('inline UI module remains syntactically valid', () => {
  const source = /<script type="module"[^>]*>([\s\S]*?)<\/script>/.exec(ui)[1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  // Import lists wrap across lines, so strip to the first line-ending semicolon.
  assert.doesNotThrow(() => new AsyncFunction(source.replace(/^import [\s\S]*?;$/mg, '')));
});

test('refresh failures keep readable content and recover; startup retries restore the link', async () => {
  // Exercise the actual load functions with small UI ports, without simulating a browser.
  const controls = new Map();
  const select = (key) => {
    if (!controls.has(key)) controls.set(key, { textContent: key === '#view' ? 'readable document' : '', scrollTop: 123, hidden: true, classList: { add() {}, remove() {} } });
    return controls.get(key);
  };
  let fail = true, fatal = 0, navigated = null;
  const old = { sig: 'one', scannedAt: '2026-09-08T00:00:00Z' };
  const state = { data: old, sig: 'one', sel: 'Docs/README.md', byId: new Map([['Docs/README.md', {}]]) };
  const context = vm.createContext({
    S: state, $: select, AbortController, setTimeout, clearTimeout, Date,
    pictureNodes: { attach() {}, owns() { return false; } },
    fetch: async () => { if (fail) throw new Error('offline'); return { ok: true, json: async () => old }; },
    showFatal: () => { fatal++; }, reindex: (data) => { state.data = data; },
    renderTree() {}, renderPins() {}, folderTimes: new Map(), folderTimesGen: 0, renderView() {}, go: (...args) => { navigated = args; },
    parseRoute, parseSearch, location: { hash: routeHash('Docs/README.md', 'install') },
  });
  vm.runInContext(ui.slice(ui.indexOf('let loading = null;'), ui.indexOf("const HUB_PORT =")) + '\nglobalThis.runLoad = load;', context);
  await context.runLoad({ quiet: true });
  assert.equal(fatal, 0);
  assert.equal(select('#view').textContent, 'readable document');
  assert.equal(select('#view').scrollTop, 123);
  assert.equal(select('#connection').hidden, false);
  fail = false;
  await context.runLoad({ quiet: true });
  assert.equal(select('#connection').hidden, true);
  state.data = null; state.sig = null; fail = true;
  await context.runLoad();
  assert.equal(fatal, 1);
  fail = false;
  await context.runLoad();
  assert.deepEqual(navigated, ['Docs/README.md', 'install']);
});

test('a reloaded search URL restores the query instead of navigating to a document', async () => {
  const controls = new Map();
  const select = (key) => {
    if (!controls.has(key)) controls.set(key, { textContent: '', value: '', scrollTop: 0, hidden: true, classList: { add() {}, remove() {} } });
    return controls.get(key);
  };
  const data = { sig: 'one', scannedAt: '2026-09-08T00:00:00Z' };
  const state = { data: null, sig: null, sel: null, byId: new Map() };
  let navigated = null, rendered = 0;
  const context = vm.createContext({
    S: state, $: select, AbortController, setTimeout, clearTimeout, Date,
    pictureNodes: { attach() {}, owns() { return false; } },
    fetch: async () => ({ ok: true, json: async () => data }),
    showFatal: () => {}, reindex: (d) => { state.data = d; },
    renderTree() {}, renderPins() {}, folderTimes: new Map(), folderTimesGen: 0, renderView() { rendered++; }, go: (...args) => { navigated = args; },
    parseRoute, parseSearch, location: { hash: searchHash('readme', true, 400) },
  });
  vm.runInContext(ui.slice(ui.indexOf('let loading = null;'), ui.indexOf("const HUB_PORT =")) + '\nglobalThis.runLoad = load;', context);
  await context.runLoad();
  assert.equal(navigated, null, 'a search URL must not navigate to a document');
  assert.equal(state.query, 'readme');
  assert.equal(state.searchScoped, true);
  assert.equal(state.hitLimit, 400);
  assert.equal(select('#q').value, 'readme');
  assert.ok(rendered > 0);
});

test('report HTTP delivery resolves assets, serves PDFs, and confines signed directories', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-report-test-'));
  const reportDir = path.join(root, 'report');
  fs.mkdirSync(reportDir);
  fs.mkdirSync(path.join(reportDir, 'charts'));
  fs.writeFileSync(path.join(reportDir, 'page.html'), '<img src="charts/plot.svg"><script src="app.js"></script>');
  fs.writeFileSync(path.join(reportDir, 'charts/plot.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(reportDir, 'app.js'), 'document.title="working";');
  fs.writeFileSync(path.join(reportDir, 'data.json'), '{"value":1}');
  fs.writeFileSync(path.join(reportDir, 'report.pdf'), '%PDF-1.4\nfixture');
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
  const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
  const resolve = (id) => {
    const file = path.resolve(root, id);
    const rel = path.relative(root, file);
    return rel.startsWith('..') || path.isAbsolute(rel) ? null : file;
  };
  const handler = createReportHandler({ resolveId: resolve, toId: relative });
  const server = http.createServer(async (req, res) => {
    if (!await handler(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (url, options) => fetch(new URL(url, base), options);
  try {
    const redirect = await get('/api/raw?path=report/page.html', { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    const entry = new URL(redirect.headers.get('location'), base);
    const html = await get(entry);
    assert.equal(html.headers.get('content-security-policy'), REPORT_CSP);
    assert.ok(!REPORT_CSP.includes('allow-same-origin'));
    assert.match(await html.text(), /charts\/plot.svg/);
    for (const asset of ['charts/plot.svg', 'app.js', 'data.json']) {
      const response = await get(new URL(asset, entry));
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      await response.arrayBuffer();
    }
    const pdf = await get('/api/raw?path=report/report.pdf');
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal(pdf.headers.get('access-control-allow-origin'), null);
    assert.match(await pdf.text(), /^%PDF/);
    const range = await get('/api/raw?path=report/report.pdf', { headers: { range: 'bytes=0-3' } });
    assert.equal(range.status, 206); assert.equal(await range.text(), '%PDF');
    const invalidRange = await get('/api/raw?path=report/report.pdf', { headers: { range: 'bytes=999-1000' } });
    assert.equal(invalidRange.status, 416); await invalidRange.text();
    const download = await get('/api/raw?path=report/report.pdf&download=1');
    assert.match(download.headers.get('content-disposition'), /^attachment/); await download.arrayBuffer();
    const token = entry.pathname.split('/')[3];
    const forged = await get('/api/artifact/' + token.slice(0, -1) + '!/page.html');
    assert.equal(forged.status, 403); await forged.text();
    const escaped = await get('/api/artifact/' + token + '/%2e%2e%2foutside.txt');
    assert.equal(escaped.status, 403); await escaped.text();
    const head = await get(entry, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const wrongType = await get('/api/preview?path=report/report.pdf');
    assert.equal(wrongType.status, 415); await wrongType.text();
    // Windows junction creation does not require Developer Mode/admin privileges.
    const junction = path.join(reportDir, 'escape');
    fs.symlinkSync(root, junction, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const response = await get(new URL('escape/outside.txt', entry));
      assert.equal(response.status, 403); await response.text();
    } finally { fs.unlinkSync(junction); }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    // Only fixture files in this freshly created absolute temporary directory.
    for (const file of ['report/page.html', 'report/app.js', 'report/data.json', 'report/report.pdf', 'report/charts/plot.svg', 'outside.txt']) fs.unlinkSync(path.join(root, file));
    fs.rmdirSync(path.join(reportDir, 'charts')); fs.rmdirSync(reportDir); fs.rmdirSync(root);
  }
});

test('SVG keeps its sandbox everywhere except when the browser loads it as an image', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-svg-test-'));
  fs.writeFileSync(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
  fs.writeFileSync(path.join(root, 'page.html'), '<p>report</p>');
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const resolve = (id) => {
    const file = path.resolve(root, id);
    const rel = path.relative(root, file);
    return rel.startsWith('..') || path.isAbsolute(rel) ? null : file;
  };
  const handler = createReportHandler({ resolveId: resolve, toId: relative });
  const server = http.createServer(async (req, res) => {
    if (!await handler(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (dest) => fetch(new URL('/api/raw?path=icon.svg', base), { headers: dest ? { 'sec-fetch-dest': dest } : {} });
  try {
    // A `sandbox` CSP puts the response in an opaque origin, and Chrome then will not
    // decode it inside <img> at all -- blank box, no error event. Scripting is disabled
    // for SVG-as-image by spec, so the sandbox buys nothing there.
    const asImage = await get('image');
    assert.equal(asImage.status, 200);
    assert.equal(asImage.headers.get('content-type'), 'image/svg+xml');
    assert.equal(asImage.headers.get('content-security-policy'), null, 'SVG in <img> must be decodable');

    // Every other destination is the case the sandbox exists for and must keep it.
    for (const dest of ['document', 'iframe', 'object', 'empty', null]) {
      const other = await get(dest);
      assert.equal(other.headers.get('content-security-policy'), REPORT_CSP, `sec-fetch-dest: ${dest}`);
    }
    // The header is browser-set; HTML is unconditional either way and never negotiates.
    const asHtml = await fetch(new URL('/api/raw?path=page.html', base), {
      headers: { 'sec-fetch-dest': 'image' }, redirect: 'manual',
    });
    assert.equal(asHtml.status, 302, 'HTML must still redirect to the signed route');
  } finally { server.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
