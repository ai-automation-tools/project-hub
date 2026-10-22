// Report delivery, including directory-relative assets. No browser origin privileges
// are granted to HTML, even when a raw URL is opened outside the hub's iframe.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const REPORT_CSP = "sandbox allow-scripts allow-forms allow-modals allow-popups; frame-ancestors 'self'; object-src 'none'";
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.bmp': 'image/bmp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const within = (root, file) => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};

export function createReportHandler({ resolveId, toId }) {
  // Signed directory capabilities expire at server restart. A framed script cannot
  // substitute a broader root to turn its assets endpoint into a general file API.
  const key = crypto.randomBytes(32);
  const sign = (value) => crypto.createHmac('sha256', key).update(value).digest('base64url');
  const tokenFor = (dir) => {
    const value = Buffer.from(dir).toString('base64url');
    return value + '.' + sign(value);
  };
  const directoryFor = (token) => {
    const [value, mac, extra] = token.split('.');
    if (!value || !mac || extra) return null;
    const expected = Buffer.from(sign(value));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    return Buffer.from(value, 'base64url').toString('utf8');
  };
  const fail = (res, status, message) => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(message); };

  return async function handleReport(req, res, url) {
    const asset = url.pathname.startsWith('/api/artifact/');
    if (!asset && url.pathname !== '/api/raw' && url.pathname !== '/api/preview') return false;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('allow', 'GET, HEAD'); fail(res, 405, 'method not allowed'); return true;
    }
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cache-control', 'no-store');
    try {
      let file;
      if (asset) {
        const segments = url.pathname.slice('/api/artifact/'.length).split('/');
        const rootId = directoryFor(segments.shift());
        const root = rootId && resolveId(rootId);
        const names = segments.map(decodeURIComponent);
        if (!root || !names.length || names.some((s) => !s || s === '.' || s === '..' || /[\\/\0:]/.test(s))) {
          fail(res, 403, 'invalid artifact path'); return true;
        }
        file = path.resolve(root, ...names);
        // Resolve junctions/symlinks, and reapply credential/path policy to both names.
        const realRoot = await fs.realpath(root);
        const realFile = await fs.realpath(file);
        if (!within(realRoot, realFile) || !resolveId(toId(file)) || !resolveId(toId(realFile)) || !TYPES[path.extname(file).toLowerCase()]) {
          fail(res, 403, 'outside artifact or unsupported asset'); return true;
        }
        file = realFile;
        // Opaque-origin HTML needs CORS for its own JSON, module, and font assets.
        // This header is deliberately limited to the signed, directory-contained route.
        res.setHeader('access-control-allow-origin', '*');
      } else {
        file = resolveId(url.searchParams.get('path') || '');
        if (!file) { fail(res, 403, 'outside roots'); return true; }
        const real = await fs.realpath(file);
        if (!resolveId(toId(real))) { fail(res, 403, 'outside roots'); return true; }
        file = real;
      }
      const st = await fs.stat(file);
      if (!st.isFile()) { fail(res, 404, 'not a file'); return true; }
      const ext = path.extname(file).toLowerCase();
      const html = ext === '.html' || ext === '.htm';
      if (url.pathname === '/api/preview' && !html) { fail(res, 415, 'preview requires HTML'); return true; }
      if (!asset && html) {
        const token = tokenFor(toId(path.dirname(file)));
        res.writeHead(302, { location: '/api/artifact/' + token + '/' + encodeURIComponent(path.basename(file)) }).end();
        return true;
      }
      res.setHeader('content-type', TYPES[ext] || 'application/octet-stream');
      // SVG is active content, so it carries the sandbox -- but a `sandbox` CSP puts the
      // response in an opaque origin, and Chrome then refuses to decode it inside <img>
      // at all. That silently broke every SVG thumbnail, preview and markdown-embedded
      // diagram when the sandbox was added on 2026-09-08 (P7-06): no error event, just a
      // blank box. `Sec-Fetch-Dest: image` is set by the browser and cannot be forged by
      // page script, and the HTML spec disables scripting for SVG loaded as an image, so
      // the sandbox buys nothing in that context. Every other destination -- document,
      // iframe, object -- still gets it, which is the case P7-06 was actually about.
      const asImage = req.headers['sec-fetch-dest'] === 'image';
      if (html || (ext === '.svg' && !asImage)) res.setHeader('content-security-policy', REPORT_CSP);
      if (ext === '.pdf') res.setHeader('content-security-policy', "frame-ancestors 'self'; object-src 'none'");
      if (url.searchParams.get('download') === '1') {
        res.setHeader('content-disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(file)).replace(/'/g, '%27'));
      }
      // Native PDF viewers can seek without fetching the entire report again.
      let start = 0, end = st.size - 1, status = 200;
      res.setHeader('accept-ranges', 'bytes');
      if (req.headers.range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (m && (m[1] || m[2])) {
          start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
          end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        }
        if (!m || (!m[1] && !m[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= st.size) {
          res.setHeader('content-range', `bytes */${st.size}`); fail(res, 416, 'invalid range'); return true;
        }
        status = 206;
        res.setHeader('content-range', `bytes ${start}-${end}/${st.size}`);
      }
      res.setHeader('content-length', Math.max(0, end - start + 1));
      if (req.method === 'HEAD' || !st.size) { res.writeHead(status).end(); return true; }
      const handle = await fs.open(file, 'r');
      res.writeHead(status);
      const stream = handle.createReadStream({ start, end, autoClose: true });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (err) {
      if (!res.headersSent) fail(res, err instanceof URIError ? 400 : 404, 'report or asset unavailable');
      else res.destroy();
    }
    return true;
  };
}
