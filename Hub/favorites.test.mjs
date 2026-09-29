import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeAt, insertNode, removeNode, editNode, moveNode, folderList, countLinks, mergeImport, parseBookmarksHtml, toBookmarksHtml } from './favorites.mjs';

const tree = () => [
  { name: 'Bar', children: [
    { name: 'A', url: 'https://a.example/' },
    { name: 'Dev', children: [{ name: 'B', url: 'https://b.example/' }] },
    { name: 'C', url: 'https://c.example/' },
  ] },
  { name: 'Other', children: [] },
];

test('tree edits return a new tree and leave the old one alone', () => {
  const before = tree();
  const after = insertNode(before, [1], { name: 'D', url: 'https://d.example/' });
  assert.equal(before[1].children.length, 0);
  assert.equal(nodeAt(after, [1, 0]).name, 'D');
  assert.equal(nodeAt(insertNode(before, [0], { name: 'first', url: 'https://x.example/' }, 0), [0, 0]).name, 'first');
  assert.deepEqual(removeNode(before, [0, 1]).map((r) => r.children.length), [2, 0]);
  assert.equal(removeNode(before, [0]), before, 'a root cannot be removed');
  assert.deepEqual(nodeAt(editNode(before, [0, 0], { name: '  Alpha ', url: 'https://alpha.example/' }), [0, 0]), { name: 'Alpha', url: 'https://alpha.example/' });
  assert.equal(nodeAt(editNode(before, [0, 0], { url: 'javascript:alert(1)' }), [0, 0]).url, 'https://a.example/', 'a non-web URL is ignored');
  assert.equal(nodeAt(editNode(before, [0, 0], { name: '   ' }), [0, 0]).name, 'A', 'a blank rename is ignored');
});

test('moves fix up indexes the removal shifts, and refuse impossible moves', () => {
  const t = tree();
  // Down within the same folder: A dropped before C lands between Dev and C.
  assert.deepEqual(moveNode(t, [0, 0], [0], 2)[0].children.map((n) => n.name), ['Dev', 'A', 'C']);
  // Up within the same folder.
  assert.deepEqual(moveNode(t, [0, 2], [0], 0)[0].children.map((n) => n.name), ['C', 'A', 'Dev']);
  // Into a folder that sits after the moved node: Dev's position shifts from 1 to 0.
  assert.deepEqual(nodeAt(moveNode(t, [0, 0], [0, 1]), [0, 0]).children.map((n) => n.name), ['B', 'A']);
  // Across roots.
  assert.deepEqual(moveNode(t, [0, 1, 0], [1])[1].children.map((n) => n.name), ['B']);
  assert.equal(moveNode(t, [0, 1], [0, 1]), t, 'a folder cannot go inside itself');
  assert.equal(moveNode(t, [0], [1]), t, 'roots stay put');
});

test('folders are listed with their paths; links are counted through them', () => {
  assert.deepEqual(folderList(tree()), [[[0], 'Bar'], [[0, 1], 'Bar / Dev'], [[1], 'Other']]);
  assert.equal(countLinks(tree()), 3);
});

test('a browser export parses to folders and web links, and round-trips', () => {
  const exported = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Favorites bar</H3>
    <DL><p>
        <DT><A HREF="https://a.example/?x=1&amp;y=2" ADD_DATE="1" ICON="data:image/png;base64,AA==">A &amp; B</A>
        <DT><H3>Tools</H3>
        <DL><p>
            <DT><A HREF="http://intranet.local/">Intranet</A>
            <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
        </DL><p>
        <DT><A HREF='https://c.example/'>  Spaced
            name </A>
    </DL><p>
    <DT><A HREF="https://loose.example/">Loose</A>
</DL><p>`;
  const roots = parseBookmarksHtml(exported);
  assert.deepEqual(roots, [
    { name: 'Favorites bar', children: [
      { name: 'A & B', url: 'https://a.example/?x=1&y=2' },
      { name: 'Tools', children: [{ name: 'Intranet', url: 'http://intranet.local/' }] },
      { name: 'Spaced name', url: 'https://c.example/' },
    ] },
    { name: 'Loose', url: 'https://loose.example/' },
  ]);
  assert.deepEqual(parseBookmarksHtml(toBookmarksHtml(roots)), roots);
  assert.deepEqual(parseBookmarksHtml('not a bookmarks file'), []);
});

test('imports land where a browser import would put them', () => {
  const empty = () => [{ name: 'Favorites bar', children: [] }, { name: 'Other favorites', children: [] }];
  const fromEdge = [
    { name: 'Favorites bar', children: [{ name: 'A', url: 'https://a.example/' }] },
    { name: 'Other favorites', children: [{ name: 'B', url: 'https://b.example/' }] },
    { name: 'Mobile favorites', children: [{ name: 'M', url: 'https://m.example/' }] },
  ];
  assert.deepEqual(mergeImport(empty(), fromEdge, 'Edge'), [
    { name: 'Favorites bar', children: [{ name: 'A', url: 'https://a.example/' }] },
    { name: 'Other favorites', children: [
      { name: 'B', url: 'https://b.example/' },
      { name: 'Mobile favorites', children: [{ name: 'M', url: 'https://m.example/' }] },
    ] },
  ]);
  // A file export: a toolbar folder plus loose links.
  const fromFile = [{ name: 'Bookmarks bar', children: [{ name: 'T', url: 'https://t.example/' }] }, { name: 'L', url: 'https://l.example/' }];
  const merged = mergeImport(empty(), fromFile, 'file');
  assert.deepEqual(merged.map((r) => r.children.map((c) => c.name)), [['T'], ['L']]);
  // A list that already has favorites gets one folder on the bar instead.
  const again = mergeImport(merged, fromFile, 'bookmarks.html');
  assert.equal(again[0].children.at(-1).name, 'Imported from bookmarks.html');
  assert.equal(countLinks(again), 4);
});
