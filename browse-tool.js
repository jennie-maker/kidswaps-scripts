/* ============================================================================
 * browse-tool.js  —  KidSwaps /browse  GRID HALF (V3.1)
 * ----------------------------------------------------------------------------
 * Host: GitHub jennie-maker/kidswaps-scripts, served via jsDelivr (pinned @sha).
 * CSS:  lives in the /browse page custom-code box (NOT here). See browse-styles.html.
 * Read path: the curated anon RPC get_available_inventory() called DIRECTLY
 *            (no edge function, no token, no operator gate — public page).
 *
 * SCOPE = V3.1 ONLY: JS mount replacing the CMS grid, locked card design,
 *   featured-then-newest sort, results count, empty state, null-photo
 *   placeholder, and the ?sku= card-click hook STUBBED for V3.3.
 *   Filters/toggle = V3.2.  Detail overlay + Redeem = V3.3/V4.
 *
 * DEPLOY LOOP (same as listing-tool): edit + commit here -> copy new short SHA
 *   -> in the /browse PAGE footer bump the jsDelivr @<sha> on the <script src>
 *   -> Publish Webflow.  If old behavior persists with a 200 on the new @sha,
 *   it's the browser/CDN cache: DevTools open -> right-click reload ->
 *   "Empty Cache and Hard Reload".
 *
 * MOUNT: add  <div id="ks-browse-app"></div>  inside the grid section
 *   (replacing the old CMS collection list).
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__ksBrowseInit) return;          // idempotent if loaded twice
  window.__ksBrowseInit = true;

  /* ---- CONFIG -------------------------------------------------------------- */
  var SUPABASE_URL = 'https://ajsobivqxexcniwifxzz.supabase.co';
  var RPC          = '/rest/v1/rpc/get_available_inventory';
  var MOUNT_ID     = 'ks-browse-app';
  var LOG          = '[ks-browse]';

  // V3.2 type scope. Set in init() from the mount's data-type attribute.
  // 'all' shows everything; 'clothing'/'toy' filter the render (client-side,
  // by the RPC-derived item_type). The fetch is ALWAYS unscoped — the sealed
  // RPC is untouched; we filter what we render, not what we request.
  // NOTE: RPC emits item_type as 'clothing' / 'toy' (SINGULAR toy). A mount
  // typo like data-type="toys" would match nothing — guarded in init().
  var BROWSE_TYPE = 'all';

  // PUBLIC anon key ONLY. It is public-safe by design (it ships in browser code;
  // the sealed table + curated RPC are what make it safe to expose).
  // NEVER paste the service_role / "secret" key here — that bypasses every lockdown.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM'; // <-- paste the anon PUBLIC key (~208 chars, prefix eyJ...)

  var REFRESH_MS = 30000; // min gap between focus-triggered refetches

  /* ---- small helpers ------------------------------------------------------ */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent = XSS-safe by default
    return n;
  }

  // DB value stays lowercase; display is the capitalized word.
  // essentials/elevated/special -> Essentials/Elevated/Special. (Colors deferred.)
  function tierLabel(t) {
    if (!t) return '';
    t = String(t);
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  // Descriptor = the form-built item_name (already "Color Brand FriendlyCategory"
  // for clothing, hand-typed for toys). LOCKED: do NOT re-compose from discrete
  // fields. The fallback below is null-safety only for pre-name test rows.
  function descriptor(item) {
    if (item.item_name && String(item.item_name).trim()) return item.item_name;
    var parts = [item.color, item.brand].filter(Boolean);
    return parts.length ? parts.join(' ') : (item.brand || 'Item');
  }

  function placeholderTile() {
    return el('div', 'ks-browse-ph', 'Photo coming soon');
  }

  var BAG_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"' +
    ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

  /* ---- state screens ------------------------------------------------------ */
  function showLoading(mount) {
    mount.innerHTML = '';
    mount.appendChild(el('div', 'ks-browse-state ks-browse-loading', 'Loading the collection\u2026'));
  }
  function showEmpty(mount) {
    mount.innerHTML = '';
    var w = el('div', 'ks-browse-state ks-browse-empty');
    w.appendChild(el('div', 'ks-browse-state-title', 'Nothing available right now'));
    w.appendChild(el('div', 'ks-browse-state-sub', 'Check back soon \u2014 new pieces are added every cycle.'));
    mount.appendChild(w);
  }
  function showError(mount, retry) {
    mount.innerHTML = '';
    var w = el('div', 'ks-browse-state ks-browse-error');
    w.appendChild(el('div', 'ks-browse-state-title', 'We couldn\u2019t load the collection'));
    if (typeof retry === 'function') {
      var btn = el('button', 'ks-browse-retry', 'Try again');
      btn.type = 'button';
      btn.addEventListener('click', retry);
      w.appendChild(btn);
    }
    mount.appendChild(w);
  }

  /* ---- card --------------------------------------------------------------- */
  // LOCKED card design: media (or placeholder) + tier badge, descriptor (item_name),
  // size, cart-icon stub. NO retail, NO featured badge, NO separate item_name line
  // (the descriptor IS item_name; brand/category/color ride inside it).
  function buildCard(item) {
    var card = el('div', 'ks-browse-card');
    card.setAttribute('data-sku', item.sku || '');
    card.setAttribute('data-item-type', item.item_type || ''); // handy for V3.2 filters
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    // media
    var media = el('div', 'ks-browse-media');
    if (item.primary_photo_url) {
      var img = document.createElement('img');
      img.loading = 'lazy';            // uploads are full-res/uncompressed (25MB cap)
      img.decoding = 'async';
      img.alt = descriptor(item);
      img.src = item.primary_photo_url;
      img.addEventListener('error', function () {  // never leave a broken image
        if (img.parentNode) img.parentNode.replaceChild(placeholderTile(), img);
      });
      media.appendChild(img);
    } else {
      media.appendChild(placeholderTile());
    }
    if (item.tier) media.appendChild(el('span', 'ks-browse-tier', tierLabel(item.tier)));
    card.appendChild(media);

    // body
    var body = el('div', 'ks-browse-body');
    body.appendChild(el('div', 'ks-browse-name', descriptor(item)));

    var meta = el('div', 'ks-browse-meta');
    meta.appendChild(el('span', 'ks-browse-size', item.size || ''));

    var cart = el('button', 'ks-browse-cart');
    cart.type = 'button';
    cart.setAttribute('aria-label', 'Add to bag (coming soon)');
    cart.innerHTML = BAG_SVG;
    meta.appendChild(cart);
    body.appendChild(meta);

    // quiet "coming soon" for the stubbed cart affordance
    body.appendChild(el('span', 'ks-browse-cs', 'Coming soon'));

    card.appendChild(body);
    return card;
  }

  /* ---- sort (RPC already sorts; this is belt-and-suspenders) --------------- */
  // featured desc (nulls last), then date_added desc (nulls last).
  function sortItems(items) {
    return items.sort(function (a, b) {
      var fa = a.featured ? 1 : 0, fb = b.featured ? 1 : 0;
      if (fa !== fb) return fb - fa;
      var da = a.date_added ? Date.parse(a.date_added) : -Infinity;
      var db = b.date_added ? Date.parse(b.date_added) : -Infinity;
      return db - da;
    });
  }

  /* ---- click / keyboard delegation --------------------------------------- */
  function wireGrid(grid) {
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.ks-browse-card');
      if (!card) return;
      if (e.target.closest('.ks-browse-cart')) {   // cart stub — don't open detail
        e.stopPropagation();
        cartStub(card);
        return;
      }
      openDetail(card.getAttribute('data-sku'));    // card body -> detail (stub)
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.ks-browse-card');
      if (!card || card !== document.activeElement) return; // ignore when cart btn focused
      e.preventDefault();
      openDetail(card.getAttribute('data-sku'));
    });
  }

  // V3.3 STUB. Detail overlay is not built yet. V3.3 will set ?sku= in the URL
  // and open the in-page overlay for this sku (reading from the already-fetched set).
  function openDetail(sku) {
    console.debug(LOG, 'openDetail stub ->', sku);
  }

  // Cart redemption is V4. For now: quiet "coming soon" flash, no network, no-op.
  function cartStub(card) {
    var cs = card.querySelector('.ks-browse-cs');
    if (!cs) return;
    cs.classList.add('is-on');
    clearTimeout(cs.__t);
    cs.__t = setTimeout(function () { cs.classList.remove('is-on'); }, 1500);
  }

  /* ---- render ------------------------------------------------------------- */
  function render(mount, items) {
    // V3.2 type scope (client-side). 'all' = no filter; else match RPC-derived item_type.
    if (BROWSE_TYPE !== 'all') {
      items = items.filter(function (it) { return it.item_type === BROWSE_TYPE; });
    }
    items = sortItems(items.slice());
    mount.innerHTML = '';
    if (!items.length) { showEmpty(mount); return; }

    mount.appendChild(
      el('div', 'ks-browse-count', items.length + (items.length === 1 ? ' item' : ' items'))
    );

    var grid = el('div', 'ks-browse-grid');
    var frag = document.createDocumentFragment();
    items.forEach(function (it) { frag.appendChild(buildCard(it)); });
    grid.appendChild(frag);
    wireGrid(grid);
    mount.appendChild(grid);
  }

  /* ---- fetch -------------------------------------------------------------- */
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
      if (Array.isArray(data)) return data;     // RPC returns a jsonb array (or [])
      console.warn(LOG, 'unexpected RPC shape:', data);
      return [];
    });
  }

  var lastFetch = 0;
  function load(mount, silent) {
    lastFetch = Date.now();
    if (!silent) showLoading(mount);
    fetchInventory()
      .then(function (items) { render(mount, items); })
      .catch(function (err) {
        console.error(LOG, 'load failed:', err);
        if (!silent) showError(mount, function () { load(mount); });
      });
  }

  /* ---- init --------------------------------------------------------------- */
  function init() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) {
      console.error(LOG, 'mount #' + MOUNT_ID + ' not found \u2014 add <div id="' +
        MOUNT_ID + '"></div> to the grid section.');
      return;
    }
    if (!ANON_KEY) {
      console.error(LOG, 'ANON_KEY is empty \u2014 paste the anon PUBLIC key into ' +
        'browse-tool.js (never the service_role key).');
      showError(mount);
      return;
    }

    // V3.2: scope this page by the mount's data-type ('all'/'clothing'/'toy').
    var t = (mount.getAttribute('data-type') || 'all').trim().toLowerCase();
    if (t === 'all' || t === 'clothing' || t === 'toy') {
      BROWSE_TYPE = t;
    } else {
      console.warn(LOG, 'unrecognized data-type "' + t + '" \u2014 expected ' +
        '"all", "clothing", or "toy" (singular). Defaulting to all.');
      BROWSE_TYPE = 'all';
    }

    load(mount);

    // Refresh-on-focus: when the tab regains focus, silently refetch so tiles that
    // got reserved/claimed elsewhere drop out. Debounced; keeps the old grid until
    // the new data lands. (V3.1-scope freshness; the V3.3 overlay has its own.)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && (Date.now() - lastFetch) > REFRESH_MS) {
        load(mount, true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
