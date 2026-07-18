/* ============================================================================
 * closet-tool.js  —  KidSwaps /closet  PUBLIC PREVIEW (v1)
 * ----------------------------------------------------------------------------
 * Host: GitHub jennie-maker/kidswaps-scripts, served via jsDelivr (pinned @sha).
 * CSS:  SELF-INJECTED here (ensureCss) — NO Webflow custom-code box edit.
 *       Same discipline as browse-tool's ensureBagCss / ensureZoomCss.
 * Read: the curated anon RPC get_available_inventory() called DIRECTLY —
 *       no edge function, no token, no operator gate. Public page, public read.
 *
 * WHAT THIS IS: a pre-launch teaser linked from the Founding Family emails.
 * A live item COUNT plus a grid of recent arrivals. Photo and name ONLY.
 *
 * ⚠⚠ NOTHING IS CLICKABLE, ON PURPOSE. No links, no overlay, no bag, no
 * checkout. The mechanism (credits / tiers / swapping) stays UNREVEALED until
 * launch — that is a ruling, not an oversight. DO NOT "improve" this by making
 * cards link to /browse or by adding tier badges, sizes, or prices.
 * ⚠ Cards are <div>, NOT <a>. If a future session wants click-through, that is
 * a decision to re-open, not a gap to fill.
 *
 * ⚠ THE PAGE MUST BE PUBLIC. It is linked from email to people who are not
 * members. If the site hide is ever applied per-page, /closet must be excluded.
 *
 * ⚠ COPY IS PLACEHOLDER PENDING JENNIE'S APPROVAL (§0: she approves all
 * customer-facing copy BEFORE it is written). Every string lives in COPY below,
 * so approval is a one-block edit. DO NOT scatter member-facing strings.
 *
 * MOUNT: <div id="ks-closet-app"></div>
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__ksClosetInit) return;          // idempotent if loaded twice
  window.__ksClosetInit = true;

  /* ---- VERSION STAMP ------------------------------------------------------
   * Print the live jsDelivr pin, parsed from THIS script's own src — always
   * reflects the actual @<sha> running, never stale. Lifted verbatim from
   * browse-tool.js. Wrapped so a stamp failure can never break the page. */
  try {
    var __ksScript = document.currentScript;
    if (!__ksScript) {
      var __ksScripts = document.getElementsByTagName('script');
      for (var __ksJ = 0; __ksJ < __ksScripts.length; __ksJ++) {
        if (__ksScripts[__ksJ].src && __ksScripts[__ksJ].src.indexOf('closet-tool.js') !== -1) {
          __ksScript = __ksScripts[__ksJ]; break;
        }
      }
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : '';
    var __ksPin = (__ksSrc.match(/@([^/]+)\/closet-tool\.js/) || [])[1] || 'unknown';
    console.log('%c[ks-closet] build ' + __ksPin, 'color:#d24f28;font-weight:600', __ksSrc || '(no src)');
  } catch (__ksErr) {}

  /* ---- CONFIG -------------------------------------------------------------- */
  var SUPABASE_URL = 'https://ajsobivqxexcniwifxzz.supabase.co';
  var RPC          = '/rest/v1/rpc/get_available_inventory';
  var MOUNT_ID     = 'ks-closet-app';
  var LOG          = '[ks-closet]';

  // PUBLIC anon key ONLY. Public-safe by design (ships in browser code; the
  // sealed table + curated RPC are the security model). NEVER the service_role key.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM';

  // How many cards to paint. The COUNT is always the true total; the GRID is a
  // sample. Full-res originals are served (cost guard, below), so this is also
  // the page-weight control on a phone.
  // ⚠ 18 divides evenly at BOTH breakpoints (3-up desktop = 6 rows, 2-up mobile
  // = 9 rows) so there is never an orphaned partial row. Changing this number
  // means re-checking it against both column counts.
  var GRID_LIMIT = 18;

  /* ---- COPY — ⚠ PLACEHOLDER, AWAITING JENNIE'S APPROVAL -------------------
   * countOne/countMany take the number. No em-dashes (standing copy rule).
   * Vocabulary: SWAPS not trades; nothing about returning items. */
  var COPY = {
    countOne:   function () { return '1 piece in the closet right now'; },
    countMany:  function (n) { return n + ' pieces in the closet right now'; },
    emptyTitle: 'The closet is filling up',
    emptySub:   'Check back soon.',
    errorTitle: 'We couldn\u2019t load the closet',
    errorRetry: 'Try again'
  };

  /* ---- small helpers (lifted from browse-tool.js) ------------------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent = XSS-safe
    return n;
  }

  // Item display name. item_name is autoName()'s "Color Brand FriendlyCategory".
  function descriptor(item) {
    if (item.item_name && String(item.item_name).trim()) return item.item_name;
    var parts = [item.color, item.brand].filter(Boolean);
    return parts.length ? parts.join(' ') : (item.brand || 'Item');
  }

  function placeholderTile() {
    return el('div', 'ks-closet-ph', 'Photo coming soon');
  }

  /* COST GUARD — carried over from browse-tool.js DELIBERATELY.
     Each Supabase image transform counts an "origin image" against the 100/cycle
     Pro quota ($5/1000 over). This early return serves the ORIGINAL and keeps
     /closet at ZERO transform requests. object-fit:cover still crops in CSS.
     To RE-ENABLE later (once pre-generated thumbnails land), delete the one
     return line; the rewrite logic below is intact. */
  var THUMB_MARKER = '/storage/v1/object/public/';
  function thumb(url, w, q, h, mode) {
    if (!url || typeof url !== 'string') return url;
    return url;                                   // <-- COST GUARD: serve original
    var i = url.indexOf(THUMB_MARKER);
    if (i === -1) return url;
    var base = url.slice(0, i) + '/storage/v1/render/image/public/' +
               url.slice(i + THUMB_MARKER.length);
    var params = 'width=' + w + '&quality=' + (q || 75);
    if (h) params += '&height=' + h + '&resize=' + (mode || 'cover');
    return base + (base.indexOf('?') === -1 ? '?' : '&') + params;
  }

  /* ---- styles (self-injected; no Webflow CSS box) ------------------------- */
  function ensureCss() {
    if (document.getElementById('ks-closet-css')) return;
    var css =
      '@keyframes ks-closet-shimmer{0%{background-position:-450px 0}100%{background-position:450px 0}}' +
      '#ks-closet-app{font-family:Quicksand,sans-serif;color:#1E1A19;}' +
      '#ks-closet-app .ks-closet-count{font-family:"Instrument Serif",Quicksand,serif;' +
        'font-size:30px;line-height:1.15;text-align:center;margin:0 0 22px;}' +
      '#ks-closet-app .ks-closet-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}' +
      '@media (min-width:721px){#ks-closet-app .ks-closet-grid{grid-template-columns:repeat(3,1fr);gap:18px;}' +
        '#ks-closet-app .ks-closet-count{font-size:34px;}}' +
      '#ks-closet-app .ks-closet-card{display:block;}' +
      /* CONTAIN, not cover. A swap-bag photo is a whole garment shot on white —
         cropping it cuts sleeves and hems off. The padding gives each piece the
         same breathing room /browse has. ⚠ Do NOT "fix" this to object-fit:cover
         for a tidier grid; the ragged bottoms are the garments being whole. */
      '#ks-closet-app .ks-closet-media{position:relative;aspect-ratio:3 / 4;border-radius:10px;' +
        'overflow:hidden;background:#fff;padding:14px;box-sizing:border-box;}' +
      '#ks-closet-app .ks-closet-media img{width:100%;height:100%;object-fit:contain;display:block;}' +
      '#ks-closet-app .ks-closet-ph{width:100%;height:100%;display:flex;align-items:center;' +
        'justify-content:center;background:#efe9dd;color:#9a9384;font-size:12px;text-align:center;}' +
      '#ks-closet-app .ks-closet-name{font-size:13.5px;font-weight:500;line-height:1.35;' +
        'margin:9px 2px 0;}' +
      '#ks-closet-app .ks-closet-state{text-align:center;padding:34px 12px;}' +
      '#ks-closet-app .ks-closet-state-title{font-family:"Instrument Serif",Quicksand,serif;' +
        'font-size:24px;margin-bottom:6px;}' +
      '#ks-closet-app .ks-closet-state-sub{font-size:14px;color:#75736E;}' +
      '#ks-closet-app .ks-closet-retry{margin-top:14px;padding:10px 18px;border-radius:50px;' +
        'border:1px solid #F0C9B5;background:transparent;color:#E54F25;font-family:Quicksand,sans-serif;' +
        'font-size:14px;font-weight:600;cursor:pointer;}' +
      /* skeleton */
      '#ks-closet-app .ks-skel{pointer-events:none;}' +
      '#ks-closet-app .ks-skel .ks-closet-media,#ks-closet-app .ks-skel-line{' +
        'background:#ece9e3;background-image:linear-gradient(90deg,#ece9e3 0,#f5f3ef 40px,#ece9e3 80px);' +
        'background-size:600px 100%;animation:ks-closet-shimmer 1.2s linear infinite;border-radius:10px;}' +
      '#ks-closet-app .ks-skel-line{height:12px;margin:10px 2px 0;}' +
      '#ks-closet-app .ks-skel-line.short{width:55%;}';
    var s = document.createElement('style');
    s.id = 'ks-closet-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---- state screens ------------------------------------------------------ */
  function showLoading(mount) {
    ensureCss();
    mount.innerHTML = '';
    var grid = el('div', 'ks-closet-grid');
    for (var i = 0; i < 8; i++) {
      var card = el('div', 'ks-closet-card ks-skel');
      card.appendChild(el('div', 'ks-closet-media'));
      card.appendChild(el('div', 'ks-skel-line'));
      card.appendChild(el('div', 'ks-skel-line short'));
      grid.appendChild(card);
    }
    mount.appendChild(grid);
  }

  function showEmpty(mount) {
    ensureCss();
    mount.innerHTML = '';
    var w = el('div', 'ks-closet-state');
    w.appendChild(el('div', 'ks-closet-state-title', COPY.emptyTitle));
    w.appendChild(el('div', 'ks-closet-state-sub', COPY.emptySub));
    mount.appendChild(w);
  }

  function showError(mount, retry) {
    ensureCss();
    mount.innerHTML = '';
    var w = el('div', 'ks-closet-state');
    w.appendChild(el('div', 'ks-closet-state-title', COPY.errorTitle));
    if (typeof retry === 'function') {
      var btn = el('button', 'ks-closet-retry', COPY.errorRetry);
      btn.type = 'button';
      btn.addEventListener('click', retry);
      w.appendChild(btn);
    }
    mount.appendChild(w);
  }

  /* ---- card — photo + name, NOT an anchor -------------------------------- */
  function buildCard(item) {
    var card = el('div', 'ks-closet-card');

    var media = el('div', 'ks-closet-media');
    if (item.primary_photo_url) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = descriptor(item);
      // Prefer the pre-generated thumbnail when present; fall back to the
      // full-res primary (thumb() returns it as-is under the cost guard).
      img.src = item.thumbnail_url || thumb(item.primary_photo_url, 400, 75, 533);
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.replaceChild(placeholderTile(), img);
      });
      media.appendChild(img);
    } else {
      media.appendChild(placeholderTile());
    }
    card.appendChild(media);

    card.appendChild(el('div', 'ks-closet-name', descriptor(item)));
    return card;
  }

  /* ---- sort (newest first; RPC already sorts, belt-and-suspenders) -------- */
  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      var da = a.date_added ? Date.parse(a.date_added) : -Infinity;
      var db = b.date_added ? Date.parse(b.date_added) : -Infinity;
      return db - da;
    });
  }

  /* ---- render ------------------------------------------------------------- */
  function render(mount, items) {
    ensureCss();
    mount.innerHTML = '';

    var total = items.length;
    if (!total) { showEmpty(mount); return; }

    mount.appendChild(el('div', 'ks-closet-count',
      total === 1 ? COPY.countOne() : COPY.countMany(total)));

    var view = sortItems(items).slice(0, GRID_LIMIT);
    var grid = el('div', 'ks-closet-grid');
    var frag = document.createDocumentFragment();
    view.forEach(function (it) { frag.appendChild(buildCard(it)); });
    grid.appendChild(frag);
    mount.appendChild(grid);
  }

  /* ---- fetch (lifted verbatim from browse-tool.js) ------------------------ */
  function fetchInventory() {
    return fetch(SUPABASE_URL + RPC, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (Array.isArray(data)) return data;
      console.warn(LOG, 'unexpected RPC shape:', data);
      return [];
    });
  }

  function load(mount) {
    showLoading(mount);
    fetchInventory()
      .then(function (items) { render(mount, items); })
      .catch(function (err) {
        console.error(LOG, 'load failed:', err);
        showError(mount, function () { load(mount); });
      });
  }

  /* ---- init --------------------------------------------------------------- */
  function init() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) {
      console.error(LOG, 'mount #' + MOUNT_ID + ' not found.');
      return;
    }
    if (!ANON_KEY) {
      console.error(LOG, 'ANON_KEY is empty.');
      showError(mount);
      return;
    }
    load(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
