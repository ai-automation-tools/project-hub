import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browserDirs, listSources, parseChromium, readSource, iconLinks, sniffImage, createFavicons } from './webmarks.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const ICO = Buffer.from('0000010001001010', 'hex');

test('browser profile folders follow each platform', () => {
  const win = browserDirs({ platform: 'win32', home: 'C:/Users/you', localAppData: 'C:/Users/you/AppData/Local' });
  assert.equal(win.find((b) => b.key === 'edge').dir, path.join('C:/Users/you/AppData/Local', 'Microsoft/Edge/User Data'));
  const mac = browserDirs({ platform: 'darwin', home: '/Users/you' });
  assert.equal(mac.find((b) => b.key === 'chrome').dir, path.join('/Users/you', 'Library', 'Application Support', 'Google/Chrome'));
  const linux = browserDirs({ platform: 'linux', home: '/home/you' });
  assert.equal(linux.find((b) => b.key === 'brave').dir, path.join('/home/you', '.config', 'BraveSoftware/Brave-Browser'));
});

test('profiles are discovered with their display names, and only web links survive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webmarks-'));
  try {
    const edge = path.join(root, 'Edge');
    fs.mkdirSync(path.join(edge, 'Default'), { recursive: true });
    fs.mkdirSync(path.join(edge, 'Profile 1'), { recursive: true });
    fs.mkdirSync(path.join(edge, 'System Profile'), { recursive: true });   // no Bookmarks file
    fs.writeFileSync(path.join(edge, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' } } } }));
    fs.writeFileSync(path.join(edge, 'Default', 'Bookmarks'), JSON.stringify({ roots: {
      bookmark_bar: { type: 'folder', name: 'Favorites bar', children: [
        { type: 'url', name: 'Docs', url: 'https://example.com/docs' },
        { type: 'url', name: 'Bookmarklet', url: 'javascript:alert(1)' },
        { type: 'url', name: 'Settings', url: 'edge://settings' },
        { type: 'folder', name: 'Tools', children: [{ type: 'url', name: '', url: 'http://intranet.local/' }] },
      ] },
      other: { type: 'folder', name: 'Other favorites', children: [] },
      synced: { type: 'folder', name: 'Mobile favorites', children: [{ type: 'url', name: 'News', url: 'https://news.example/' }] },
    } }));
    fs.writeFileSync(path.join(edge, 'Profile 1', 'Bookmarks'), '{ not json');

    const sources = listSources([{ key: 'edge', label: 'Edge', dir: edge }, { key: 'chrome', label: 'Chrome', dir: path.join(root, 'missing') }]);
    assert.deepEqual(sources.map((s) => [s.id, s.label]), [['edge:Default', 'Edge — Work'], ['edge:Profile 1', 'Edge — Profile 1']]);

    const roots = readSource(sources[0]);
    assert.deepEqual(roots.map((r) => r.name), ['Favorites bar', 'Mobile favorites'], 'empty roots are dropped');
    assert.deepEqual(roots[0].children, [
      { name: 'Docs', url: 'https://example.com/docs' },
      { name: 'Tools', children: [{ name: 'http://intranet.local/', url: 'http://intranet.local/' }] },
    ]);
    assert.deepEqual(readSource(sources[1]), [], 'a corrupt file reads as empty, not a crash');
    assert.deepEqual(parseChromium(null), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('icon links are resolved, filtered to icons and ranked nearest 32px first', () => {
  const html = `<head>
    <link rel="stylesheet" href="/app.css">
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
    <link rel='icon' type='image/png' sizes='16x16' href='/16.png'>
    <link href="https://cdn.example/32.png" rel="shortcut icon" sizes="32x32">
    <link rel=icon href=/plain.ico>
    <link rel="icon" href="/logo.svg?v=2&amp;x=1">`;
  // An exact 32px icon and an SVG tie; the tie keeps the page's own order.
  assert.deepEqual(iconLinks(html, 'https://site.example/a/page'), [
    'https://cdn.example/32.png',
    'https://site.example/logo.svg?v=2&x=1',
    'https://site.example/16.png',
    'https://site.example/plain.ico',
    'https://site.example/touch.png',
  ]);
});

test('image types come from the bytes, not the header', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(ICO), 'image/x-icon');
  assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="x">')), 'image/svg+xml');
  assert.equal(sniffImage(Buffer.from('<!doctype html><title>404</title>')), '');
  assert.equal(sniffImage(Buffer.alloc(0)), '');
});

test('favicons try declared icons, fall back to /favicon.ico, and cache per origin', async () => {
  const calls = [];
  const routes = {
    'https://a.example/page': ['text/html', Buffer.from('<link rel="icon" href="/missing.png"><link rel="icon" href="/html-not-image.png">')],
    'https://a.example/html-not-image.png': ['image/png', Buffer.from('<html>soft 404</html>')],
    'https://a.example/favicon.ico': ['text/plain', ICO],
    'https://b.example/': ['text/html', Buffer.from('<p>no icons</p>')],
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    const hit = routes[url];
    return hit
      ? new Response(hit[1], { status: 200, headers: { 'content-type': hit[0] } })
      : new Response('nope', { status: 404 });
  };
  const favicons = createFavicons({ fetchImpl });
  const a = await favicons.get('https://a.example/page');
  assert.equal(a.type, 'image/x-icon', 'a soft 404 is not an icon; favicon.ico is, whatever its header says');
  const before = calls.length;
  await favicons.get('https://a.example/other');
  assert.equal(calls.length, before, 'a second page on the same origin reuses the result');
  assert.equal(await favicons.get('https://b.example/'), null);
  assert.equal(await favicons.get('https://b.example/x'), null, 'misses are cached too');
  assert.equal(calls.filter((u) => u.startsWith('https://b.example')).length, 2);
});
