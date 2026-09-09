import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PictureLibrary, ignorePictureEvent } from './pictures.mjs';
import { PictureNodes } from './pictures-client.mjs';

const classify = (name) => /\.png$/i.test(name) ? 'image' : /\.md$/i.test(name) ? 'md' : 'file';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-pictures-'));
  const files = [], dirs = [];
  const mkdir = (name) => { fs.mkdirSync(path.join(root, name)); dirs.push(name); };
  const write = (name, data = '') => { fs.writeFileSync(path.join(root, name), data); if (!files.includes(name)) files.push(name); };
  t.after(() => {
    // Only remove known fixture files, then their empty directories.
    for (const file of files) if (fs.existsSync(path.join(root, file))) fs.unlinkSync(path.join(root, file));
    for (const dir of dirs.reverse()) fs.rmdirSync(path.join(root, dir));
    fs.rmdirSync(root);
  });
  const library = new PictureLibrary({ dir: root, id: '~/Pictures', classify, allow: (name) => !name.startsWith('.') });
  return { root, library, mkdir, write };
}

test('Pictures root is metadata-only and folder browsing does not build a search index', async (t) => {
  const { library, mkdir, write } = fixture(t);
  mkdir('Album'); write('Album/photo.png'); write('README.md', '# Pictures');
  assert.equal(library.health().foldersRead, 0);
  assert.equal(library.root().children, undefined);
  assert.equal(library.root().lazy, true);
  const result = await library.resolve();
  assert.equal(result.node.children.length, 2);
  const album = result.node.children.find((n) => n.name === 'Album');
  assert.equal(album.lazy, true); assert.equal(album.loaded, false); assert.equal(album.children, undefined);
  assert.equal(library.health().foldersRead, 1);
  assert.equal(library.health().state, 'unloaded');
  await library.resolve();
  assert.equal(library.health().foldersRead, 1, 'the directory is cached');
});

test('Deep links return the selected file and its ancestor path without walking sibling albums', async (t) => {
  const { library, mkdir, write } = fixture(t);
  mkdir('Album'); mkdir('Album/Sub'); mkdir('Other'); write('Album/Sub/photo.png', 'image');
  const result = await library.resolve('~/Pictures/Album/Sub/photo.png');
  assert.deepEqual(result.ancestors.map((n) => n.id), ['~/Pictures', '~/Pictures/Album', '~/Pictures/Album/Sub']);
  assert.equal(result.node.kind, 'image'); assert.equal(result.node.size, 5);
  assert.equal(library.health().foldersRead, 0);
  const cache = new PictureNodes(), tree = [library.root()];
  cache.attach(tree); cache.merge(result); cache.attach(tree);
  assert.equal(tree[0].children[0].children[0].children[0].id, result.node.id);
  assert.equal(tree[0].loaded, false, 'a path-only ancestor is still eligible for full folder loading');
});

test('Pictures search is paginated, shared across simultaneous requests, and invalidates independently', async (t) => {
  const { library, mkdir, write } = fixture(t);
  mkdir('Album');
  for (let i = 0; i < 215; i++) write(`Album/photo-${String(i).padStart(3, '0')}.png`);
  write('Album/source.ts'); write('Album/.hidden.png');
  const [first, second] = await Promise.all([library.search({ q: 'photo', kind: 'image' }), library.search({ q: 'photo', kind: 'image', offset: 200 })]);
  assert.equal(first.total, 215); assert.equal(first.hits.length, 200); assert.equal(second.hits.length, 15);
  assert.equal(new Set([...first.hits, ...second.hits].map((n) => n.id)).size, 215);
  assert.equal(library.health().foldersRead, 2, 'one index build for concurrent requests');
  assert.equal((await library.search({ q: 'source' })).total, 0);
  const oldVersion = first.version;
  write('Album/new.png'); library.invalidate();
  assert.equal(library.health().state, 'unloaded');
  const updated = await library.search({ q: 'new.png' });
  assert.equal(updated.total, 1); assert.notEqual(updated.version, oldVersion);
});

test('Cache invalidation prevents an in-flight Pictures directory read from returning stale nodes', async (t) => {
  const { library, write } = fixture(t); write('old.png');
  const original = library.entries.bind(library);
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  library.entries = async (id) => { const result = await original(id); entered(); await gate; return result; };
  const pending = library.children('~/Pictures');
  await started; library.invalidate(); release();
  await assert.rejects(pending, (err) => err.status === 409);
  assert.equal(library.health().cachedFolders, 0);
});

test('Pictures rejects traversal, excluded paths, and junctions that escape its root', async (t) => {
  const { library, root, mkdir, write } = fixture(t);
  mkdir('.private'); write('.private/photo.png');
  await assert.rejects(library.resolve('~/Pictures/../elsewhere'), (err) => err.status === 403);
  await assert.rejects(library.resolve('~/Pictures/.private/photo.png'), (err) => err.status === 403);
  await assert.rejects(library.resolve('Documents/photo.png'), (err) => err.status === 403);
  const link = path.join(root, 'escape');
  fs.symlinkSync(os.tmpdir(), link, process.platform === 'win32' ? 'junction' : 'dir');
  try { await assert.rejects(library.resolve('~/Pictures/escape'), (err) => err.status === 403); }
  finally { fs.unlinkSync(link); }
});

test('Loaded Pictures folders survive project reindexing, but not a new Pictures version', async (t) => {
  const { library, mkdir, write } = fixture(t);
  mkdir('Album'); write('Album/photo.png'); write('README.md');
  const cache = new PictureNodes();
  let tree = [library.root()]; cache.attach(tree);
  cache.merge(await library.resolve()); cache.merge(await library.resolve('~/Pictures/Album'));
  tree = [{ id: 'Projects', kind: 'projects' }, library.root()]; cache.attach(tree);
  assert.equal(tree[1].children.find((n) => n.name === 'Album').children.length, 1);
  assert.equal(cache.owns('~/Pictures/Album/photo.png'), true);
  assert.equal(cache.owns('~/PicturesElsewhere/photo.png'), false);
  library.invalidate(); cache.merge(await library.resolve()); cache.attach(tree);
  assert.equal(tree[1].children.find((n) => n.name === 'Album').children, undefined);
});


test('Directory metadata notifications do not invalidate a search; empty-folder renames still do', async (t) => {
  const { library, mkdir, write } = fixture(t);
  mkdir('Album'); write('Album/photo.png');
  const original = library.entries.bind(library);
  library.entries = async (id) => {
    const result = await original(id);
    if (!ignorePictureEvent('change', true)) library.invalidate();
    return result;
  };
  const result = await library.search({ q: 'photo' });
  assert.equal(result.total, 1);
  assert.equal(ignorePictureEvent('rename', true), false);
  assert.equal(ignorePictureEvent('change', false), false);
  mkdir('Empty');
  if (!ignorePictureEvent('rename', true)) library.invalidate();
  assert.notEqual(library.version, result.version);
  assert.ok((await library.resolve()).node.children.some((n) => n.name === 'Empty'));
});

test('Search preserves the previous scan depth boundary; direct browsing can go deeper', async (t) => {
  const { library, mkdir, write } = fixture(t);
  library.maxDepth = 0;
  mkdir('Album'); write('Album/photo.png'); write('top.png');
  const result = await library.search({ kind: 'image' });
  assert.equal(result.total, 1); assert.equal(result.hits[0].name, 'top.png');
  assert.equal(result.depthLimited, 1);
  const deep = await library.resolve('~/Pictures/Album/photo.png');
  assert.equal(deep.node.kind, 'image');
});
