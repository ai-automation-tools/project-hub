// The optional access token: the pure checks, then a real hub started with HUB_TOKEN set.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ACCESS_COOKIE, accessAllowed, accessPage, accessTokenFrom } from './hub.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = 'test-token-0123456789abcdef';

test('accessTokenFrom: HUB_TOKEN first, then an access-token file beside the config, else none; a short one is refused', () => {
  const read = (/** @type {string} */ f) => { if (f === path.join('cfg', 'access-token')) return `  ${TOKEN}\n`; throw new Error('ENOENT'); };
  assert.equal(accessTokenFrom({ env: { HUB_TOKEN: 'from-env-0123456789' }, dir: 'cfg', read }), 'from-env-0123456789');
  assert.equal(accessTokenFrom({ env: {}, dir: 'cfg', read }), TOKEN);
  assert.equal(accessTokenFrom({ env: {}, dir: 'elsewhere', read }), null);
  assert.throws(() => accessTokenFrom({ env: { HUB_TOKEN: 'short' }, dir: 'cfg', read }), /at least 16 characters/);
});

test('accessAllowed: no token lets everything through; with one, the health check, the bearer header or the cookie', () => {
  const req = (pathname, headers = {}) => ({ pathname, headers });
  assert.equal(accessAllowed(null, req('/api/scan')), true);
  assert.equal(accessAllowed(TOKEN, req('/api/health')), true);
  assert.equal(accessAllowed(TOKEN, req('/api/scan')), false);
  assert.equal(accessAllowed(TOKEN, req('/')), false);
  assert.equal(accessAllowed(TOKEN, req('/api/scan', { authorization: `Bearer ${TOKEN}` })), true);
  assert.equal(accessAllowed(TOKEN, req('/api/scan', { authorization: `Bearer ${TOKEN}x` })), false);
  assert.equal(accessAllowed(TOKEN, req('/api/scan', { authorization: TOKEN })), false);
  assert.equal(accessAllowed(TOKEN, req('/', { cookie: `theme=dark; ${ACCESS_COOKIE}=${encodeURIComponent(TOKEN)}` })), true);
  assert.equal(accessAllowed(TOKEN, req('/', { cookie: `${ACCESS_COOKIE}=nope` })), false);
  assert.equal(accessAllowed(TOKEN, req('/', { cookie: `${ACCESS_COOKIE}=%E0%A4%A` })), false);
});

test('accessPage posts the token (never in the address) and has no script', () => {
  const page = accessPage(false);
  assert.match(page, /<form method="post" action="\/login">/);
  assert.match(page, /type="password" name="token"/);
  assert.ok(!/<script/i.test(page));
  assert.match(accessPage(true), /isn't it/);
});

test('a hub started with HUB_TOKEN refuses without it, answers with it, and its login form sets the cookie', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-access-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const config = path.join(dir, 'hub.config.json');
  fs.writeFileSync(config, JSON.stringify({ name: 'Access_Test', port, title: 'Access test', base: dir.replaceAll('\\', '/'), sharedRoots: [] }));
  const hub = spawn(process.execPath, [path.join(HERE, 'hub.mjs'), '--config', config], { env: { ...process.env, HUB_TOKEN: TOKEN }, stdio: 'ignore' });
  t.after(() => { hub.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    const up = await fetch(`${base}/api/health`).then((r) => r.status, () => 0);
    if (up) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  // The watchdog's check stays open.
  assert.notEqual(await fetch(`${base}/api/health`).then((r) => r.status), 401);
  assert.equal(await fetch(`${base}/api/favorites`).then((r) => r.status), 401);
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 401);
  assert.match(await page.text(), /asks for its access token/);
  assert.equal(await fetch(`${base}/api/favorites`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.status), 200);
  // A wrong token at the form: 401, no cookie.
  const bad = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ token: 'wrong' }), redirect: 'manual' });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  const good = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ token: TOKEN }), redirect: 'manual' });
  assert.equal(good.status, 303);
  const cookie = good.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(await fetch(`${base}/api/favorites`, { headers: { cookie: cookie.split(';')[0] } }).then((r) => r.status), 200);
});
