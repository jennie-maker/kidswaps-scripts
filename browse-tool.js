/* ============================================================================
 * browse-tool.js  —  KidSwaps /browse  GRID + DETAIL OVERLAY (V3.3)
 * ----------------------------------------------------------------------------
 * Host: GitHub jennie-maker/kidswaps-scripts, served via jsDelivr (pinned @sha).
 * CSS:  lives in each browse page custom-code box (NOT here). See browse-styles.html.
 * Read path: the curated anon RPC get_available_inventory() called DIRECTLY
 *            (no edge function, no token, no operator gate — public page).
 *
 * V3.3 adds, on top of V3.1 grid + V3.2 type-scope:
 *   - cards are REAL ANCHORS (<a href="?sku=...">) so Cmd/middle-click opens a
 *     new tab natively; plain click opens the in-page overlay (preventDefault).
 *   - CURRENT stash: render() keeps the fetched items so openDetail(sku) reads
 *     the full object from memory (no second round-trip — locked decision).
 *   - DETAIL OVERLAY: locked design (thumbnail rail incl. video, main image +
 *     tier badge + zoom stub, details panel = name/size/SKU/tier+retail/
 *     condition+gender|washability+set pills/description/personal note/Add-to-bag
 *     STUB). Close via X, backdrop, or Esc.
 *   - DEEP LINK: ?sku= opens the overlay on load; pushState on open; close
 *     restores the URL (browser Back closes the overlay).
 *   - NO-LONGER-AVAILABLE: a ?sku= not in the available set shows a graceful
 *     message instead of a broken panel.
 *
 * Add-to-bag + zoom are STUBS here (claim = V4; zoom = focused follow-up).
 *
 * DEPLOY LOOP (same as listing-tool): edit + commit -> verify raw file at SHA
 *   -> bump jsDelivr @<sha> on the <script src> in each browse page footer
 *   -> Publish Webflow. Cache gotcha: DevTools open -> right-click reload ->
 *   "Empty Cache and Hard Reload" if old behavior persists on a 200 new @sha.
 *
 * MOUNT: <div id="ks-browse-app" data-type="all|clothing|toy"></div>
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

  var BROWSE_TYPE = 'all';   // set in init() from mount data-type

  // PUBLIC anon key ONLY. Public-safe by design (ships in browser code; the
  // sealed table + curated RPC are what make exposure safe). NEVER the service_role key.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM';

  var REFRESH_MS = 30000;     // min gap between focus-triggered refetches

  /* ---- module state ------------------------------------------------------- */
  var CURRENT = [];           // last rendered (post-type-filter) item set
  var ALL = [];               // last fetched (pre-type-filter) — overlay looks here
  var overlayOpen = false;

  var SEARCH = '';            // current free-text query (raw; normalized at match time)

  /* ---- small helpers ------------------------------------------------------ */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent = XSS-safe
    return n;
  }

  function tierLabel(t) {
    if (!t) return '';
    t = String(t);
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  function descriptor(item) {
    if (item.item_name && String(item.item_name).trim()) return item.item_name;
    var parts = [item.color, item.brand].filter(Boolean);
    return parts.length ? parts.join(' ') : (item.brand || 'Item');
  }

  function placeholderTile() {
    return el('div', 'ks-browse-ph', 'Photo coming soon');
  }

  function genderLabel(g) {
    if (!g) return '';
    g = String(g).toLowerCase();
    if (g === 'boy') return 'Boys';
    if (g === 'girl') return 'Girls';
    return g;
  }

  function money(v) {
    if (v == null || v === '') return '';
    var n = Number(v);
    if (isNaN(n)) return '';
    return '$' + (Math.round(n * 100) / 100).toString().replace(/\.00$/, '');
  }

  // Collect the ordered photo list: primary first, then any photo_urls not equal
  // to primary. Returns array of {url} ; empty if none.
  function photoList(item) {
    var out = [];
    if (item.primary_photo_url) out.push(item.primary_photo_url);
    if (Array.isArray(item.photo_urls)) {
      item.photo_urls.forEach(function (u) {
        if (u && out.indexOf(u) === -1) out.push(u);
      });
    }
    return out;
  }

  var BAG_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"' +
    ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

  var PLAY_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 5v14l11-7z"/></svg>';

  var ZOOM_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"' +
    ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';

  var X_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"' +
    ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 6L6 18M6 6l12 12"/></svg>';

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
  function showSearchEmpty(mount) {
    mount.innerHTML = '';
    var w = el('div', 'ks-browse-state ks-browse-empty');
    // textContent (via el) keeps the user query XSS-safe
    w.appendChild(el('div', 'ks-browse-state-title', 'No matches for \u201c' + SEARCH.trim() + '\u201d'));
    w.appendChild(el('div', 'ks-browse-state-sub', 'Try a brand, item, or category \u2014 or clear your search.'));
    var btn = el('button', 'ks-browse-retry', 'Clear search');
    btn.type = 'button';
    btn.addEventListener('click', clearSearch);
    w.appendChild(btn);
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

  /* ---- card (now an ANCHOR) ----------------------------------------------- */
  function buildCard(item) {
    var sku = item.sku || '';
    var card = el('a', 'ks-browse-card');
    // Real href so Cmd/middle-click opens a shareable deep-link in a new tab.
    card.href = '?sku=' + encodeURIComponent(sku);
    card.setAttribute('data-sku', sku);
    card.setAttribute('data-item-type', item.item_type || '');

    // media
    var media = el('div', 'ks-browse-media');
    if (item.primary_photo_url) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = descriptor(item);
      img.src = item.primary_photo_url;
      img.addEventListener('error', function () {
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

    body.appendChild(el('span', 'ks-browse-cs', 'Coming soon'));
    card.appendChild(body);
    return card;
  }

  /* ---- sort (RPC already sorts; belt-and-suspenders) ---------------------- */
  function sortItems(items) {
    return items.sort(function (a, b) {
      var fa = a.featured ? 1 : 0, fb = b.featured ? 1 : 0;
      if (fa !== fb) return fb - fa;
      var da = a.date_added ? Date.parse(a.date_added) : -Infinity;
      var db = b.date_added ? Date.parse(b.date_added) : -Infinity;
      return db - da;
    });
  }

  /* ---- click / keyboard delegation ---------------------------------------- */
  function wireGrid(grid) {
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.ks-browse-card');
      if (!card) return;

      // cart stub — never opens detail, never navigates
      if (e.target.closest('.ks-browse-cart')) {
        e.preventDefault();
        e.stopPropagation();
        cartStub(card);
        return;
      }

      // let modified clicks (new tab / new window) use the native anchor href
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;

      // plain click -> in-page overlay
      e.preventDefault();
      openDetail(card.getAttribute('data-sku'));
    });
  }

  // Cart redemption is V4 — quiet "coming soon" flash, no network.
  function cartStub(card) {
    var cs = card.querySelector('.ks-browse-cs');
    if (!cs) return;
    cs.classList.add('is-on');
    clearTimeout(cs.__t);
    cs.__t = setTimeout(function () { cs.classList.remove('is-on'); }, 1500);
  }

  /* ---- search (free-text predicate over the in-memory stash) -------------- */
  // case-insensitive, whitespace-collapsed, token-AND across brand+item_name+category.
  function normSearch(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function searchBlob(it) {
    return [it.brand, it.item_name, it.category].filter(Boolean).join(' ').toLowerCase();
  }
  function applySearch(list) {
    var q = normSearch(SEARCH);
    if (!q) return list;
    var toks = q.split(' ').filter(Boolean);
    if (!toks.length) return list;
    return list.filter(function (it) {
      var blob = searchBlob(it);
      for (var i = 0; i < toks.length; i++) {
        if (blob.indexOf(toks[i]) === -1) return false;   // every token must appear
      }
      return true;
    });
  }

  /* ---- render ------------------------------------------------------------- */
  function render(mount, items) {
    ALL = items.slice();      // keep the full set for overlay lookups
    var view = items.slice();
    if (BROWSE_TYPE !== 'all') {
      view = view.filter(function (it) { return it.item_type === BROWSE_TYPE; });
    }
    view = applyFacets(view);   // active Tier/Brand selections (V3.2 rail)
    view = applySearch(view);   // free-text query — AND-combines with facets, one pass
    view = sortItems(view);
    CURRENT = view;

    mount.innerHTML = '';
    if (!view.length) {
      if (normSearch(SEARCH)) showSearchEmpty(mount);   // "No matches for ..." + clear
      else showEmpty(mount);
      return;
    }

    mount.appendChild(
      el('div', 'ks-browse-count', view.length + (view.length === 1 ? ' item' : ' items'))
    );

    var grid = el('div', 'ks-browse-grid');
    var frag = document.createDocumentFragment();
    view.forEach(function (it) { frag.appendChild(buildCard(it)); });
    grid.appendChild(frag);
    wireGrid(grid);
    mount.appendChild(grid);
  }

  /* ---- DETAIL OVERLAY ----------------------------------------------------- */
  // Look up an item by sku in the fetched set (prefer ALL so a /clothing page
  // can still resolve a toy deep-link if one is shared, though normally same type).
  function findBySku(sku) {
    if (!sku) return null;
    var hit = null;
    ALL.forEach(function (it) { if (it.sku === sku) hit = it; });
    return hit;
  }

  function ensureOverlayRoot() {
    var root = document.getElementById('ks-detail-root');
    if (root) return root;
    root = el('div', 'ks-detail-root');
    root.id = 'ks-detail-root';
    root.setAttribute('hidden', '');
    document.body.appendChild(root);
    return root;
  }

  function pill(text) {
    return '<span class="ks-detail-pill">' + escapeHtml(text) + '</span>';
  }
  function pillCheck(text) {
    return '<span class="ks-detail-pill"><span class="ks-detail-pill-ic">' +
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 6L9 17l-5-5"/></svg></span>' + escapeHtml(text) + '</span>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Build the overlay innerHTML for a resolved item.
  function detailHtml(item) {
    var photos = photoList(item);
    var hasVideo = !!item.video_url;
    var isToy = item.item_type === 'toy';

    // thumbnail rail
    var thumbs = '';
    photos.forEach(function (u, i) {
      thumbs += '<button type="button" class="ks-detail-thumb' + (i === 0 ? ' is-active' : '') +
        '" data-photo="' + i + '"><img src="' + escapeHtml(u) + '" alt="" loading="lazy"></button>';
    });
    if (hasVideo) {
      thumbs += '<button type="button" class="ks-detail-thumb ks-detail-thumb-video" data-video="1">' +
        PLAY_SVG + '</button>';
    }
    if (!photos.length && !hasVideo) {
      thumbs = '';  // rail hidden via CSS when empty wrapper has no children
    }

    // main media (first photo, or placeholder)
    var main;
    if (photos.length) {
      main = '<img class="ks-detail-main-img" src="' + escapeHtml(photos[0]) + '" alt="' +
        escapeHtml(descriptor(item)) + '">';
    } else {
      main = '<div class="ks-detail-ph">Photo coming soon</div>';
    }
    var tierBadge = item.tier
      ? '<span class="ks-detail-tier-badge">' + escapeHtml(tierLabel(item.tier)) + '</span>' : '';
    var zoom = photos.length
      ? '<button type="button" class="ks-detail-zoom" aria-label="Zoom photo">' + ZOOM_SVG + ' zoom</button>' : '';

    // pills — condition always; then type-specific
    var pills = '';
    if (item.condition_grade) pills += pillCheck(item.condition_grade);
    if (isToy) {
      if (item.toy_washability) {
        pills += pill(item.toy_washability.charAt(0).toUpperCase() + item.toy_washability.slice(1));
      }
    } else {
      var g = genderLabel(item.gender_style);
      if (g) pills += pill(g);
    }
    if (item.is_matching_set) {
      var n = item.set_piece_count;
      pills += pill(n ? ('Complete \u00b7 ' + n + ' pieces') : 'Matching set');
    }

    var retail = money(item.retail_value);
    var tierPill = item.tier
      ? '<span class="ks-detail-tier-pill">' + escapeHtml(tierLabel(item.tier)) + '</span>' : '';

    var blocks = '';
    if (item.description) {
      blocks += '<p class="ks-detail-desc">' + escapeHtml(item.description) + '</p>';
    }
    if (item.condition_notes) {
      blocks += '<p class="ks-detail-note"><span class="ks-detail-note-ic">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg></span>' +
        escapeHtml(item.condition_notes) + '</p>';
    }

    return '' +
      '<div class="ks-detail-backdrop" data-close="1"></div>' +
      '<div class="ks-detail-panel" role="dialog" aria-modal="true" aria-label="' +
        escapeHtml(descriptor(item)) + '">' +
        '<button type="button" class="ks-detail-x" data-close="1" aria-label="Close">' + X_SVG + '</button>' +
        '<div class="ks-detail-cols">' +
          (thumbs ? '<div class="ks-detail-rail">' + thumbs + '</div>' : '') +
          '<div class="ks-detail-media">' + main + tierBadge + zoom + '</div>' +
          '<div class="ks-detail-info">' +
            '<h2 class="ks-detail-name">' + escapeHtml(descriptor(item)) + '</h2>' +
            (item.size ? '<p class="ks-detail-size">' + escapeHtml(item.size) + '</p>' : '') +
            '<p class="ks-detail-sku">SKU ' + escapeHtml(item.sku || '') + '</p>' +
            '<div class="ks-detail-tier-row">' + tierPill +
              (retail ? '<span class="ks-detail-retail">Retail value ' + retail + '</span>' : '') +
            '</div>' +
            (pills ? '<div class="ks-detail-pills">' + pills + '</div>' : '') +
            blocks +
            '<button type="button" class="ks-detail-cta" data-bag="1">' + BAG_SVG +
              '<span>Add to bag</span></button>' +
            '<span class="ks-detail-cta-cs">Redemption coming soon</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function showUnavailable(root) {
    root.innerHTML =
      '<div class="ks-detail-backdrop" data-close="1"></div>' +
      '<div class="ks-detail-panel ks-detail-panel-msg" role="dialog" aria-modal="true">' +
        '<button type="button" class="ks-detail-x" data-close="1" aria-label="Close">' + X_SVG + '</button>' +
        '<div class="ks-detail-msg">' +
          '<div class="ks-detail-msg-title">This piece is no longer available</div>' +
          '<div class="ks-detail-msg-sub">It may have just been claimed. Browse what\u2019s still in the collection.</div>' +
        '</div>' +
      '</div>';
    root.removeAttribute('hidden');
    overlayOpen = true;
  }

  function wireOverlay(root, item) {
    // close affordances
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { e.preventDefault(); closeDetail(); }
      if (e.target.closest('[data-bag]')) { e.preventDefault(); bagStub(root); }

      var t = e.target.closest('[data-photo]');
      if (t) { swapMain(root, item, parseInt(t.getAttribute('data-photo'), 10), false); }
      var v = e.target.closest('[data-video]');
      if (v) { swapMain(root, item, 0, true); }

      // zoom stub — focused follow-up build
      if (e.target.closest('.ks-detail-zoom')) {
        e.preventDefault();
        console.debug(LOG, 'zoom stub (V3.3 follow-up)');
      }
    });
  }

  function swapMain(root, item, idx, isVideo) {
    var media = root.querySelector('.ks-detail-media');
    if (!media) return;
    var photos = photoList(item);
    // rebuild media content but keep tier badge + zoom
    var tierBadge = item.tier
      ? '<span class="ks-detail-tier-badge">' + escapeHtml(tierLabel(item.tier)) + '</span>' : '';
    var inner;
    if (isVideo && item.video_url) {
      inner = '<video class="ks-detail-main-video" src="' + escapeHtml(item.video_url) +
        '" controls muted playsinline preload="metadata"></video>';
      media.innerHTML = inner + tierBadge;
    } else {
      var u = photos[idx] || photos[0];
      inner = '<img class="ks-detail-main-img" src="' + escapeHtml(u) + '" alt="' +
        escapeHtml(descriptor(item)) + '">';
      var zoom = '<button type="button" class="ks-detail-zoom" aria-label="Zoom photo">' + ZOOM_SVG + ' zoom</button>';
      media.innerHTML = inner + tierBadge + zoom;
    }
    // active thumb state
    root.querySelectorAll('.ks-detail-thumb').forEach(function (b) {
      var on = isVideo ? b.hasAttribute('data-video')
                       : (b.getAttribute('data-photo') === String(idx));
      b.classList.toggle('is-active', on);
    });
  }

  function bagStub(root) {
    var cs = root.querySelector('.ks-detail-cta-cs');
    if (!cs) return;
    cs.classList.add('is-on');
    clearTimeout(cs.__t);
    cs.__t = setTimeout(function () { cs.classList.remove('is-on'); }, 1800);
  }

  function openDetail(sku) {
    if (!sku) return;
    var item = findBySku(sku);
    var root = ensureOverlayRoot();

    // reflect in URL (shareable, back-button closes) — only push if not already there
    var want = '?sku=' + encodeURIComponent(sku);
    if (location.search !== want) {
      history.pushState({ ksSku: sku }, '', want);
    }

    if (!item) { showUnavailable(root); document.documentElement.classList.add('ks-detail-lock'); return; }

    root.innerHTML = detailHtml(item);
    root.removeAttribute('hidden');
    overlayOpen = true;
    document.documentElement.classList.add('ks-detail-lock');
    wireOverlay(root, item);

    // focus the close button for keyboard users
    var x = root.querySelector('.ks-detail-x');
    if (x) x.focus();
  }

  function closeDetail() {
    var root = document.getElementById('ks-detail-root');
    if (root) { root.setAttribute('hidden', ''); root.innerHTML = ''; }
    overlayOpen = false;
    document.documentElement.classList.remove('ks-detail-lock');
    // strip ?sku= from the URL without adding history
    if (location.search) {
      history.replaceState({}, '', location.pathname);
    }
  }

  // Esc closes
  document.addEventListener('keydown', function (e) {
    if (overlayOpen && e.key === 'Escape') closeDetail();
  });

  // Back/forward: open or close to match the URL
  window.addEventListener('popstate', function () {
    var sku = new URLSearchParams(location.search).get('sku');
    if (sku) {
      openDetailFromUrl(sku);
    } else if (overlayOpen) {
      var root = document.getElementById('ks-detail-root');
      if (root) { root.setAttribute('hidden', ''); root.innerHTML = ''; }
      overlayOpen = false;
      document.documentElement.classList.remove('ks-detail-lock');
    }
  });

  // open without pushing a new history entry (used by popstate + initial load)
  function openDetailFromUrl(sku) {
    var item = findBySku(sku);
    var root = ensureOverlayRoot();
    if (!item) { showUnavailable(root); document.documentElement.classList.add('ks-detail-lock'); return; }
    root.innerHTML = detailHtml(item);
    root.removeAttribute('hidden');
    overlayOpen = true;
    document.documentElement.classList.add('ks-detail-lock');
    wireOverlay(root, item);
    var x = root.querySelector('.ks-detail-x');
    if (x) x.focus();
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
      if (Array.isArray(data)) return data;
      console.warn(LOG, 'unexpected RPC shape:', data);
      return [];
    });
  }

  var lastFetch = 0;
  function load(mount, silent, afterRender) {
    lastFetch = Date.now();
    if (!silent) showLoading(mount);
    fetchInventory()
      .then(function (items) {
        render(mount, items);
        if (typeof afterRender === 'function') afterRender();
      })
      .catch(function (err) {
        console.error(LOG, 'load failed:', err);
        if (!silent) showError(mount, function () { load(mount); });
      });
  }

  /* ---- filter rail (V3.4: config-driven facets) =========================== */
  // JS owns the rail: render groups from distinct in-stock values, multi-select
  // checkboxes, grid updates live (client-side on the fetched set), state synced
  // to URL params. The rail render, URL sync, and filter logic ALL read from the
  // FACETS config + RAIL_CONFIG (per-type facet list) below, so adding a facet is
  // one FACETS entry + one key in RAIL_CONFIG. Mount = #ks-filter-rail.
  var RAIL_MOUNT_ID = 'ks-filter-rail';
  var RAIL_BUILT    = false;
  var CHEV_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" ' +
                 'stroke="currentColor" stroke-width="1.6"><path d="M4 6l4 4 4-4"/></svg>';

  /* ---- facet config -------------------------------------------------------
   * One entry per facet. Adding a facet = one FACETS entry + one key in RAIL_CONFIG.
   *   field       : inventory property this facet reads
   *   title       : group header text
   *   match       : 'lower' | 'exact' | 'tokens'  (how a row value is compared)
   *   order       : canonical value array (present-only) OR null (alpha sort)
   *   display     : value -> shown label
   *   showAll     : truncate option list to 6 + "Show all (N)" (long lists only)
   *   rowFilter   : optional (it)->bool, narrows which rows contribute OPTIONS
   *   urlLower    : optional, lowercase the URL param on read (tier back-compat)
   * NOTE: every group is a collapsible accordion section; on load only the FIRST
   *       group (Tier) is open, the rest render collapsed (header visible).
   * ----------------------------------------------------------------------- */
  var SIZE_ORDER = ['6-9M', '9-12M', '12-18M', '18-24M', '2T', '3T', '4 / XXS', '5 / XS', '6 / XS', '7 / Small'];
  var AGE_ORDER  = ['Baby', 'Toddler', 'Preschool', 'Big Kid'];

  function capFirst(s) { s = String(s == null ? '' : s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function ident(v) { return v; }

  var FACETS = {
    tier:     { field: 'tier',            title: 'Tier',        match: 'lower',  order: ['essentials', 'elevated', 'special'], display: tierLabel,   urlLower: true },
    brand:    { field: 'brand',           title: 'Brand',       match: 'exact',  order: null,       display: ident,       showAll: true },
    gender:   { field: 'gender_style',    title: 'Gender',      match: 'exact',  order: null,       display: genderLabel },
    color:    { field: 'color',           title: 'Color',       match: 'exact',  order: null,       display: ident,       showAll: true },
    size:     { field: 'size',            title: 'Size',        match: 'exact',  order: SIZE_ORDER, display: ident,       rowFilter: function (it) { return it.category !== 'Shoes'; } },
    category: { field: 'category',        title: 'Category',    match: 'exact',  order: null,       display: ident,       showAll: true },
    wash:     { field: 'toy_washability', title: 'Washability', match: 'exact',  order: null,       display: capFirst },
    age:      { field: 'size',            title: 'Age',         match: 'tokens', order: AGE_ORDER,  display: ident }
  };

  var RAIL_CONFIG = {
    all:      ['tier', 'brand'],
    clothing: ['tier', 'brand', 'gender', 'color', 'size', 'category'],
    toy:      ['tier', 'brand', 'wash', 'age']
  };
  function activeFacetKeys() { return RAIL_CONFIG[BROWSE_TYPE] || RAIL_CONFIG.all; }

  // split a stored ", "-delimited value into clean tokens (toy age: "Toddler, Preschool")
  function tokensOf(val) {
    return String(val == null ? '' : val).split(', ').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var FILTERS = {};   // active selections per facet key (multi-select arrays)
  Object.keys(FACETS).forEach(function (k) { FILTERS[k] = []; });

  // the page's items after the type filter, before facet filters (rail options
  // come from here so options don't vanish as you select)
  function typeScoped() {
    if (BROWSE_TYPE === 'all') return ALL.slice();
    return ALL.filter(function (it) { return it.item_type === BROWSE_TYPE; });
  }

  // does a single row satisfy the active selection for one facet?
  function rowMatchesFacet(it, key) {
    var def = FACETS[key], sel = FILTERS[key];
    if (!sel.length) return true;
    if (def.match === 'tokens') {
      var toks = tokensOf(it[def.field]);
      for (var i = 0; i < toks.length; i++) if (sel.indexOf(toks[i]) !== -1) return true;
      return false;
    }
    var v = it[def.field];
    v = (def.match === 'lower') ? String(v == null ? '' : v).toLowerCase() : (v == null ? '' : v);
    return sel.indexOf(v) !== -1;
  }

  // apply the active facet selections to a list (called inside render())
  function applyFacets(list) {
    var keys = activeFacetKeys();
    return list.filter(function (it) {
      for (var i = 0; i < keys.length; i++) if (!rowMatchesFacet(it, keys[i])) return false;
      return true;
    });
  }

  // build the option list for one facet from in-stock values (present-only)
  function facetOptions(key) {
    var def = FACETS[key];
    var rows = typeScoped();
    if (def.rowFilter) rows = rows.filter(def.rowFilter);

    var present = {};
    rows.forEach(function (it) {
      if (def.match === 'tokens') {
        tokensOf(it[def.field]).forEach(function (t) { present[t] = true; });
      } else {
        var v = it[def.field];
        if (v == null || v === '') return;
        present[(def.match === 'lower') ? String(v).toLowerCase() : v] = true;
      }
    });

    var values = def.order
      ? def.order.filter(function (v) { return present[v]; })                 // canonical, present-only
      : Object.keys(present).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });

    return values.map(function (v) { return { value: v, label: def.display(v) }; });
  }

  function buildGroup(rail, key, title, options, showAll, startOpen) {
    if (!options.length) return;
    var grp  = el('div', 'ks-flt-group');
    if (!startOpen) grp.classList.add('ks-flt-collapsed');   // every group is an accordion; only the first opens on load
    var lbl  = el('div', 'ks-flt-grouplabel');
    lbl.appendChild(el('span', null, title));
    var chev = el('span', 'ks-flt-chev');
    chev.innerHTML = CHEV_SVG;
    lbl.appendChild(chev);
    lbl.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      grp.classList.toggle('ks-flt-collapsed');
    });
    grp.appendChild(lbl);

    var body = el('div', 'ks-flt-groupbody');
    options.forEach(function (opt, i) {
      var row   = el('label', 'ks-flt-row');
      var input = document.createElement('input');
      input.type      = 'checkbox';
      input.className  = 'ks-flt-cb';
      input.value      = opt.value;
      input.setAttribute('data-facet', key);
      if (FILTERS[key].indexOf(opt.value) !== -1) input.checked = true;
      input.addEventListener('change', onFacetChange);
      row.appendChild(input);
      row.appendChild(el('span', 'ks-flt-rowtext', opt.label));
      if (showAll && i >= 6) row.classList.add('ks-flt-extra');   // hidden until "show all"
      body.appendChild(row);
    });
    if (showAll && options.length > 6) {
      var more = el('span', 'ks-flt-more', 'Show all (' + options.length + ')');
      more.addEventListener('click', function () {
        var open = grp.classList.toggle('ks-flt-expanded');
        more.textContent = open ? 'Show less' : 'Show all (' + options.length + ')';
      });
      body.appendChild(more);
    }
    grp.appendChild(body);
    rail.appendChild(grp);
  }

  function buildRail() {
    if (RAIL_BUILT) return;
    var rail = document.getElementById(RAIL_MOUNT_ID);
    if (!rail) return;                       // page hasn't added the mount yet
    rail.innerHTML = '';

    var head  = el('div', 'ks-flt-head');
    head.appendChild(el('span', 'ks-flt-title', 'Filters'));
    var clear = el('span', 'ks-flt-clear', 'Clear all');
    clear.addEventListener('click', clearAll);
    head.appendChild(clear);
    var close = el('span', 'ks-flt-close');   // mobile-only (CSS), closes the sheet
    close.innerHTML = X_SVG;
    close.addEventListener('click', closeRailSheet);
    head.appendChild(close);
    rail.appendChild(head);

    activeFacetKeys().forEach(function (key, idx) {
      var def = FACETS[key];
      buildGroup(rail, key, def.title, facetOptions(key), !!def.showAll, idx === 0);
    });

    var apply = el('button', 'ks-flt-apply', '');   // mobile-only (CSS)
    apply.addEventListener('click', closeRailSheet);
    rail.appendChild(apply);

    RAIL_BUILT = true;
    updateClearVisibility();
    updateApplyLabel();
  }

  function onFacetChange(e) {
    var cb    = e.target;
    var facet = cb.getAttribute('data-facet');
    var arr   = FILTERS[facet];
    var idx   = arr.indexOf(cb.value);
    if (cb.checked && idx === -1) arr.push(cb.value);
    else if (!cb.checked && idx !== -1) arr.splice(idx, 1);
    applyAndRender();
  }

  function applyAndRender() {
    var mount = document.getElementById(MOUNT_ID);
    if (mount) render(mount, ALL);          // render re-applies type + facets
    writeUrl();
    updateClearVisibility();
    updateApplyLabel();
  }

  function clearAll() {
    Object.keys(FILTERS).forEach(function (k) { FILTERS[k] = []; });
    var rail = document.getElementById(RAIL_MOUNT_ID);
    if (rail) Array.prototype.forEach.call(
      rail.querySelectorAll('input.ks-flt-cb'),
      function (cb) { cb.checked = false; }
    );
    applyAndRender();
  }

  function updateClearVisibility() {
    var rail = document.getElementById(RAIL_MOUNT_ID);
    if (!rail) return;
    var any = activeFacetKeys().some(function (k) { return FILTERS[k].length > 0; });
    var clear = rail.querySelector('.ks-flt-clear');
    if (clear) clear.style.display = any ? '' : 'none';
  }

  function updateApplyLabel() {
    var rail = document.getElementById(RAIL_MOUNT_ID);
    if (!rail) return;
    var apply = rail.querySelector('.ks-flt-apply');
    if (!apply) return;
    var n = applySearch(applyFacets(typeScoped())).length;
    apply.textContent = 'Show ' + n + (n === 1 ? ' item' : ' items');
  }

  // URL <-> FILTERS (e.g. ?tier=essentials,elevated&brand=Gap,Lovevery&size=2T)
  function readUrl() {
    var p = new URLSearchParams(location.search);
    activeFacetKeys().forEach(function (key) {
      var def = FACETS[key], raw = p.get(key);
      FILTERS[key] = raw
        ? raw.split(',').map(function (s) { s = s.trim(); return def.urlLower ? s.toLowerCase() : s; }).filter(Boolean)
        : [];
    });
    SEARCH = p.get('q') || '';   // free-text query is shareable/bookmarkable
  }

  function writeUrl() {
    var p = new URLSearchParams(location.search);   // preserve other params (?sku=)
    activeFacetKeys().forEach(function (key) {
      if (FILTERS[key].length) p.set(key, FILTERS[key].join(','));
      else p.delete(key);
    });
    if (normSearch(SEARCH)) p.set('q', SEARCH.trim());
    else p.delete('q');
    var qs  = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  // mobile: the existing .mobile-filter-toggle opens the rail as a bottom sheet
  function wireMobileToggle() {
    var toggle = document.querySelector('.mobile-filter-toggle');
    if (toggle) toggle.addEventListener('click', openRailSheet);
  }
  function openRailSheet() {
    document.body.classList.add('ks-flt-sheet-open');
    if (!document.querySelector('.ks-flt-backdrop')) {
      var bd = el('div', 'ks-flt-backdrop');
      bd.addEventListener('click', closeRailSheet);
      document.body.appendChild(bd);
    }
  }
  function closeRailSheet() {
    document.body.classList.remove('ks-flt-sheet-open');
    var bd = document.querySelector('.ks-flt-backdrop');
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
  }

  /* ---- search widget (rendered ONCE into #ks-search, survives render()) ===
   * Lives OUTSIDE #ks-browse-app so render()'s innerHTML wipe never touches it
   * (same pattern as the rail in #ks-filter-rail). Typing updates SEARCH and
   * re-runs applyAndRender (debounced); the predicate lives in render().
   * ----------------------------------------------------------------------- */
  var SEARCH_MOUNT_ID = 'ks-search';
  var SEARCH_BUILT    = false;
  var searchDebounce  = null;
  var SEARCH_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"' +
    ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

  function buildSearch() {
    if (SEARCH_BUILT) return;
    var mount = document.getElementById(SEARCH_MOUNT_ID);
    if (!mount) return;                       // page hasn't added the mount yet
    mount.innerHTML = '';

    var box  = el('div', 'ks-search-box');
    var icon = el('span', 'ks-search-icon');
    icon.innerHTML = SEARCH_SVG;
    box.appendChild(icon);

    var input = document.createElement('input');
    input.type        = 'text';
    input.className    = 'ks-search-input';
    input.value        = SEARCH;             // reflect a ?q= deep-link on load
    input.setAttribute('placeholder', 'Search by brand, item, or category');
    input.setAttribute('aria-label', 'Search the collection');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('enterkeyhint', 'search');
    box.appendChild(input);

    var clear = el('button', 'ks-search-clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear search');
    clear.innerHTML = X_SVG;
    box.appendChild(clear);

    mount.appendChild(box);

    input.addEventListener('input', function () {
      SEARCH = input.value;
      box.classList.toggle('has-text', !!SEARCH);
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(applyAndRender, 200);   // debounce so render() isn't thrashed
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); clearSearch(); }
      else if (e.key === 'Enter') { e.preventDefault(); input.blur(); }  // dismiss mobile keyboard, reveal grid
    });
    clear.addEventListener('click', function () { clearSearch(); input.focus(); });

    box.classList.toggle('has-text', !!SEARCH);
    SEARCH_BUILT = true;
  }

  function clearSearch() {
    SEARCH = '';
    var mount = document.getElementById(SEARCH_MOUNT_ID);
    if (mount) {
      var input = mount.querySelector('.ks-search-input');
      if (input) input.value = '';
      var box = mount.querySelector('.ks-search-box');
      if (box) box.classList.remove('has-text');
    }
    clearTimeout(searchDebounce);
    applyAndRender();                         // immediate (no debounce) + drops ?q=
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

    var t = (mount.getAttribute('data-type') || 'all').trim().toLowerCase();
    if (t === 'all' || t === 'clothing' || t === 'toy') {
      BROWSE_TYPE = t;
    } else {
      console.warn(LOG, 'unrecognized data-type "' + t + '" \u2014 defaulting to all.');
      BROWSE_TYPE = 'all';
    }

    // seed active filters from the URL BEFORE first load so the grid respects
    // a deep-linked filter immediately (also the pre-seed hook for future
    // member-aware defaults like kids' sizes)
    readUrl();

    // initial load; once data lands, build the rail from in-stock values and
    // wire the mobile sheet toggle. if the URL has ?sku=, open that overlay.
    var initialSku = new URLSearchParams(location.search).get('sku');
    load(mount, false, function () {
      if (!RAIL_BUILT) { buildRail(); wireMobileToggle(); }
      if (!SEARCH_BUILT) buildSearch();
      if (initialSku) openDetailFromUrl(initialSku);
    });

    // refresh-on-focus: silently refetch so stale "available" tiles drop
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
