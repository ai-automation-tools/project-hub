/**
 * Static-demo shim.
 *
 * The interface is the real one, byte-for-byte apart from the asset URLs the build
 * rewrites. Everything it would ask a local hub for is answered here from files the build
 * captured by crawling an actual running hub.
 *
 * Loaded as a classic script before the app module, so `fetch` is already patched by the
 * time the module runs its first request.
 */
(function () {
  'use strict';

  var realFetch = window.fetch.bind(window);
  var manifest = realFetch('/api/manifest.json').then(function (r) { return r.json(); });

  /** Must match slug() in build-demo.mjs — an <img src> cannot wait for a manifest. */
  function assetPath(id) {
    return '/files/' + String(id).replace(/[^A-Za-z0-9._-]/g, '_');
  }
  window.DEMO_ASSET = assetPath;

  /** `fresh` and `download` change nothing about the bytes, so they are dropped. */
  function keyOf(url) {
    var entries = [];
    url.searchParams.forEach(function (value, name) {
      if (name !== 'fresh' && name !== 'download') entries.push([name, value]);
    });
    entries.sort(function (a, b) { return a[0].localeCompare(b[0]); });
    return url.pathname + '|' + entries.map(function (e) { return e[0] + '=' + e[1]; }).join('&');
  }

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200, headers: { 'content-type': 'application/json' },
    });
  }

  window.fetch = function (input, init) {
    var href = typeof input === 'string' ? input : (input && input.url) || '';
    var url;
    try { url = new URL(href, location.href); } catch (_) { return realFetch(input, init); }
    if (url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0) {
      return realFetch(input, init);
    }

    // The one endpoint with an effect outside the browser. There is no filesystem behind
    // this page to reveal, so say that rather than failing with a status nobody can read.
    if (url.pathname === '/api/open') {
      return Promise.resolve(new Response(
        'this is a hosted demo — opening files and folders needs Project Hub running on your own machine',
        { status: 501 }));
    }
    // No Pictures root is configured in the demo fixture, so the browser never opens one.
    if (url.pathname === '/api/pictures') {
      return Promise.resolve(json({ error: 'Pictures is not part of the demo' }, 404));
    }

    var key = keyOf(url);
    return manifest.then(function (map) {
      var file = map[key];
      if (!file) return new Response('not captured in this demo', { status: 404 });
      return realFetch('/' + file);
    });
  };

  var LANDING = 'https://ai-automation-tools.dev';

  /**
   * The `/` mark in the sidebar header is inert in a local hub — there is nowhere for it
   * to go. On the demo it is the way back out to the landing page, which is the one piece
   * of navigation a hosted page needs and the app has no reason to carry.
   *
   * Swapped for a real anchor rather than given a click handler, so middle-click, Ctrl+click
   * and keyboard focus all behave. `.glyph` is sized and centred by class, so the anchor
   * inherits the whole look; only the underline needs removing.
   */
  function linkTheMark() {
    var mark = document.querySelector('.ex-head .glyph');
    if (!mark) return;
    var link = document.createElement('a');
    link.className = mark.className;
    link.textContent = mark.textContent;
    link.href = LANDING;
    link.title = 'ai-automation-tools.dev';
    link.setAttribute('aria-label', 'Back to ai-automation-tools.dev');
    link.style.textDecoration = 'none';
    mark.replaceWith(link);
  }

  // A one-line banner, dismissed for the session once. Inline styles on purpose: the
  // interface's own stylesheet is copied verbatim and nothing is added to it.
  document.addEventListener('DOMContentLoaded', function () {
    linkTheMark();
    try { if (sessionStorage.getItem('demo.banner') === 'off') return; } catch (_) { /* private mode */ }
    var bar = document.createElement('div');
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:18px;transform:translateX(-50%);'
      + 'max-width:min(760px,calc(100vw - 32px));display:flex;gap:14px;align-items:center;'
      + 'padding:9px 14px;border:1px solid #2f6b52;border-radius:8px;background:#0e1114;'
      + 'color:#a7b0ba;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.5)';
    var text = document.createElement('span');
    text.innerHTML = 'Read-only demo over a fictional workspace. '
      + '<a href="https://github.com/ai-automation-tools/project-hub" '
      + 'style="color:#5fe3a1">Run it on your own files &rarr;</a>';
    var close = document.createElement('button');
    close.textContent = 'dismiss';
    close.style.cssText = 'margin-left:auto;border:1px solid #22272e;border-radius:6px;background:#12161a;'
      + 'color:#79838f;font:inherit;padding:3px 10px;cursor:pointer';
    close.onclick = function () {
      bar.remove();
      try { sessionStorage.setItem('demo.banner', 'off'); } catch (_) { /* private mode */ }
    };
    bar.append(text, close);
    document.body.append(bar);
  });
}());
