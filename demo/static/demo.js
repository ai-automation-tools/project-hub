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
    // Content search answers any query from a server-side index, so no crawl can capture it
    // -- except the fixture's `tag:` searches, which the build records ahead of time.
    if (url.pathname === '/api/content' && !/^tag:/i.test(url.searchParams.get('q') || '')) {
      return Promise.resolve(new Response(
        'this is a hosted demo — searching inside documents needs Project Hub running on your own machine',
        { status: 501 }));
    }
    // The link check reads every document under a folder on request, so it has no fixed answer to capture.
    if (url.pathname === '/api/links') {
      return Promise.resolve(new Response(
        'this is a hosted demo — checking links needs Project Hub running on your own machine',
        { status: 501 }));
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
   * The way back to the source, and the only one this page has: the shared source bar
   * every ai-automation-tools site carries in the same place — full width at the very
   * top, the demo notice on the left, repo link in the right corner. It is also the
   * demo's only notice and only repo link (the standard allows one per site).
   *
   * In normal flow above #app rather than fixed over it; #app never scrolls the page, so
   * the bar never leaves the top. `zoom` on the bar divides out the interface's own
   * `html{zoom}`, so it is the standard 34px / 12px at every text size the visitor picks,
   * and #app is shortened by those same 34 screen pixels. The interface's own stylesheet
   * is still copied verbatim and still has nothing added to it.
   */
  function mountSourceBar() {
    var style = document.createElement('style');
    style.textContent = ':root{--demo-bar-h:34px}'
      + '#app{height:calc((100vh - var(--demo-bar-h)) / var(--zoom));'
      + 'height:calc((100dvh - var(--demo-bar-h)) / var(--zoom))}';
    document.head.append(style);

    var bar = document.createElement('div');
    bar.style.cssText = 'zoom:calc(1 / var(--zoom));'
      + 'display:flex;align-items:center;gap:16px;height:var(--demo-bar-h);padding:0 16px;'
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

  document.addEventListener('DOMContentLoaded', function () {
    linkTheMark();
    mountSourceBar();
  });
}());
