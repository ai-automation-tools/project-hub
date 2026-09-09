// Pictures has its own asynchronous browse/search cache. Project scans never walk it.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const failure = (status, message) => Object.assign(new Error(message), { status });
const inside = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
};

// Ignore directory metadata noise, while retaining rename events for empty folders.
export const ignorePictureEvent = (event, directory) => event === 'change' && directory;

export class PictureLibrary {
  constructor({ dir, id, classify, allow = () => true, maxDepth = 7 }) {
    this.maxDepth = maxDepth; this.depthLimited = 0;
    this.dir = path.resolve(dir); this.id = id; this.classify = classify; this.allow = allow;
    this.epoch = crypto.randomBytes(8).toString('hex'); this.generation = 0;
    this.directories = new Map(); this.index = null; this.build = null; this.buildMs = null;
    this.realRoot = null;
    this.readErrors = 0; this.foldersRead = 0; this.indexErrors = 0;
  }
  get version() { return this.epoch + ':' + this.generation; }
  owns(id) { return id === this.id || id.startsWith(this.id + '/'); }
  root() { return { id: this.id, name: 'Pictures', kind: 'docroot', lazy: true, lazyRoot: true, loaded: false, desc: 'Browse folders on demand. Pictures are searched separately without loading the photo library into this page.' }; }
  invalidate() {
    this.generation++; this.realRoot = null; this.directories.clear(); this.index = null; this.buildMs = null;
    // An older build notices the version change between directory reads and exits.
  }
  health() { return { version: this.version, state: this.index ? 'ready' : this.build ? 'indexing' : 'unloaded', indexedEntries: this.index?.length || 0, cachedFolders: this.directories.size, foldersRead: this.foldersRead, readErrors: this.readErrors, searchBuildMs: this.buildMs, maxSearchDepth: this.maxDepth, depthLimited: this.depthLimited }; }
  async location(id) {
    if (!this.owns(id)) throw failure(403, 'outside Pictures');
    const parts = id === this.id ? [] : id.slice(this.id.length + 1).split('/');
    if (parts.some((name, i) => !name || name === '.' || name === '..' || /[\\\0:]/.test(name) || !this.allow(name, i < parts.length - 1))) throw failure(403, 'invalid Pictures path');
    const target = path.resolve(this.dir, ...parts);
    if (!this.realRoot) this.realRoot = fs.realpath(this.dir).catch((err) => { this.realRoot = null; throw err; });
    const [root, real] = await Promise.all([this.realRoot, fs.realpath(target)]);
    if (!inside(root, real)) throw failure(403, 'outside Pictures');
    return target;
  }
  entry(parent, item) {
    return { id: parent + '/' + item.name, name: item.name, kind: item.isDirectory() ? 'folder' : this.classify(item.name), ...(item.isDirectory() ? { lazy: true, loaded: false } : {}) };
  }
  async entries(id) {
    const target = await this.location(id);
    const entries = await fs.readdir(target, { withFileTypes: true });
    this.foldersRead++;
    return entries.filter((e) => !e.isSymbolicLink() && (e.isDirectory() || e.isFile()) && this.allow(e.name, e.isDirectory()))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  }
  async children(id) {
    const version = this.version;
    if (this.directories.has(id)) return this.directories.get(id);
    const pending = (async () => {
      const entries = await this.entries(id);
      const nodes = [];
      // Bounded stat batches avoid the descriptor burst of Promise.all(78,000 files).
      for (let start = 0; start < entries.length; start += 16) {
        if (version !== this.version) throw failure(409, 'Pictures changed; retry');
        const batch = await Promise.all(entries.slice(start, start + 16).map(async (entry) => {
          const node = this.entry(id, entry);
          if (!entry.isDirectory()) {
            try { const st = await fs.stat(path.join(this.dir, node.id.slice(this.id.length + 1))); node.size = st.size; }
            catch { this.readErrors++; return null; }
          }
          return node;
        }));
        nodes.push(...batch.filter(Boolean));
      }
      if (version !== this.version) throw failure(409, 'Pictures changed; retry');
      return nodes;
    })();
    if (this.directories.size >= 128) this.directories.delete(this.directories.keys().next().value);
    this.directories.set(id, pending);
    try { return await pending; }
    catch (err) { if (this.directories.get(id) === pending) this.directories.delete(id); throw err; }
  }
  async resolve(id = this.id) {
    const version = this.version;
    const target = await this.location(id);
    const st = await fs.stat(target);
    if (!st.isDirectory() && !st.isFile()) throw failure(404, 'not a browsable file');
    if (!this.allow(path.basename(target), st.isDirectory())) throw failure(403, 'excluded Pictures path');
    const node = id === this.id ? this.root() : { id, name: path.basename(target), kind: st.isDirectory() ? 'folder' : this.classify(target) };
    if (st.isDirectory()) Object.assign(node, { lazy: true, loaded: true, children: await this.children(id) });
    else node.size = st.size;
    const ancestors = [];
    if (id !== this.id) {
      ancestors.push(this.root());
      const parts = id.slice(this.id.length + 1).split('/');
      for (let i = 1; i < parts.length; i++) ancestors.push({ id: this.id + '/' + parts.slice(0, i).join('/'), name: parts[i - 1], kind: 'folder', lazy: true, loaded: false });
    }
    if (version !== this.version) throw failure(409, 'Pictures changed; retry');
    return { version, ancestors, node };
  }
  async searchIndex() {
    if (this.index) return this.index;
    if (this.build) {
      await this.build;
      if (this.index) return this.index;
    }
    const version = this.version;
    const started = Date.now();
    const pending = (async () => {
      const index = [], folders = [{ id: this.id, depth: 0 }];
      let errors = 0, depthLimited = 0;
      while (folders.length) {
        if (version !== this.version) throw failure(409, 'Pictures changed; retry');
        // Metadata-only search uses a small batch of directory reads. This keeps
        // Windows/OneDrive latency from accumulating serially across thousands of albums.
        const batch = folders.splice(Math.max(0, folders.length - 8));
        const results = await Promise.all(batch.map(async ({ id, depth }) => {
          try { return { id, depth, entries: await this.entries(id) }; }
          catch (err) { errors++; this.readErrors++; if (id === this.id) throw err; return { id, depth, entries: [] }; }
        }));
        for (const { id, depth, entries } of results) for (const entry of entries) {
          const node = this.entry(id, entry);
          if (entry.isDirectory()) {
            if (depth < this.maxDepth) folders.push({ id: node.id, depth: depth + 1 });
            else depthLimited++;
          }
          if (node.kind !== 'file') index.push({ id: node.id, name: node.name, kind: node.kind });
        }
      }
      if (version !== this.version) throw failure(409, 'Pictures changed; retry');
      this.index = index; this.indexErrors = errors; this.depthLimited = depthLimited; this.buildMs = Date.now() - started;
      return index;
    })();
    this.build = pending;
    try { return await pending; }
    finally { if (this.build === pending) this.build = null; }
  }
  async search({ q = '', kind = '', offset = 0, limit = 200 } = {}) {
    const index = await this.searchIndex();
    const query = q.trim().toLowerCase();
    const ranked = [];
    for (const node of index) {
      if (kind && node.kind !== kind) continue;
      const name = node.name.toLowerCase();
      const score = !query ? 1 : name === query ? 1000 : name.startsWith(query) ? 600 : name.includes(query) ? 400 : node.id.toLowerCase().includes(query) ? 60 : 0;
      if (score) ranked.push({ node, score });
    }
    ranked.sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
    const start = Math.max(0, Math.floor(Number(offset)) || 0);
    const count = Math.max(1, Math.min(200, Math.floor(Number(limit)) || 200));
    return { version: this.version, readErrors: this.indexErrors, depthLimited: this.depthLimited, total: ranked.length, offset: start, hits: ranked.slice(start, start + count).map((r) => r.node) };
  }
}
