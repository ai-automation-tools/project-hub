// Only folders the user has requested are attached to the browser's tree.
export class PictureNodes {
  constructor() { this.nodes = new Map(); this.version = null; this.rootId = null; }
  owns(id) { return !!this.rootId && (id === this.rootId || id.startsWith(this.rootId + '/')); }
  clear() { this.nodes.clear(); this.version = null; }
  merge({ version, ancestors, node }) {
    if (this.version && this.version !== version) this.clear();
    this.version = version;
    for (const ancestor of ancestors) if (!this.nodes.has(ancestor.id)) this.nodes.set(ancestor.id, { ...ancestor });
    this.nodes.set(node.id, { ...node });
    for (const child of node.children || []) {
      const existing = this.nodes.get(child.id);
      this.nodes.set(child.id, existing?.loaded ? { ...child, children: existing.children, loaded: true } : { ...child });
    }
    const chain = [...ancestors, node];
    for (let i = 0; i < chain.length - 1; i++) {
      const parent = this.nodes.get(chain[i].id), child = chain[i + 1];
      if (!parent.children) parent.children = [];
      if (!parent.children.some((n) => n.id === child.id)) parent.children.push(child);
    }
  }
  attach(tree) {
    const root = tree.find((node) => node.lazyRoot);
    if (!root) return;
    this.rootId = root.id;
    delete root.children; root.loaded = false;
    const visit = (node) => {
      const cached = this.nodes.get(node.id);
      const merged = cached ? { ...node, ...cached } : { ...node };
      if (merged.children) merged.children = merged.children.map(visit);
      return merged;
    };
    Object.assign(root, visit(root));
  }
}
