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

  /**
   * The `/` mark in the sidebar header is inert in a local hub — there is nowhere for it
   * to go. Here it goes home: the site root, with no fragment, which is the overview the
   * demo opens on. A deep-linked visitor lands on one document with no obvious way back
   * to the top, and this is it.
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
    link.href = '/';
    link.title = 'Back to the overview';
    link.setAttribute('aria-label', 'Back to the overview');
    link.style.textDecoration = 'none';
    mark.replaceWith(link);
  }

  var REPO = 'https://github.com/ai-automation-tools/project-hub';

  /**
   * The way back to the source, and the only one this page has: the banner below is
   * dismissed for the session on first click, so the repo link inside it cannot be the
   * whole answer. This bar outlives it.
   *
   * The shared source bar every ai-automation-tools site carries in the same place:
   * full width at the very top, note on the left, repo link in the right corner.
   *
   * In normal flow above #app rather than fixed over it, because `html{zoom}` scales a
   * fixed strip too and #app already divides the zoom out of its own height. One
   * injected rule shortens #app by the bar; the interface's own stylesheet is still
   * copied verbatim and still has nothing added to it.
   */
  function mountSourceBar() {
    var style = document.createElement('style');
    style.textContent = ':root{--demo-bar-h:34px}'
      + '#app{height:calc(100vh / var(--zoom) - var(--demo-bar-h))}';
    document.head.append(style);

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:16px;height:34px;padding:0 14px;'
      + 'box-sizing:border-box;background:var(--panel);border-bottom:1px solid var(--line);'
      + 'font:12px/1.4 ui-sans-serif,system-ui,sans-serif';

    var note = document.createElement('p');
    note.style.cssText = 'margin:0;min-width:0;overflow:hidden;white-space:nowrap;'
      + 'text-overflow:ellipsis;color:var(--dim)';
    note.innerHTML = '<strong style="font-weight:600;color:var(--green)">Read-only demo</strong>'
      + ' &middot; a fictional workspace, captured from a real hub.';

    var link = document.createElement('a');
    link.href = REPO;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" style="flex:none"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg><span>View source</span>';
    link.style.cssText = 'margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:6px;'
      + 'color:var(--fg-mid);text-decoration:none;font-weight:500';
    link.onmouseenter = function () { link.style.color = 'var(--fg-max)'; link.style.textDecoration = 'none'; };
    link.onmouseleave = function () { link.style.color = 'var(--fg-mid)'; };

    bar.append(note, link);
    document.body.prepend(bar);
  }

  // A one-line banner, dismissed for the session once. Inline styles on purpose: the
  // interface's own stylesheet is copied verbatim and nothing is added to it.
  document.addEventListener('DOMContentLoaded', function () {
    linkTheMark();
    mountSourceBar();
    try { if (sessionStorage.getItem('demo.banner') === 'off') return; } catch (_) { /* private mode */ }
    var bar = document.createElement('div');
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:16px;transform:translateX(-50%);'
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
