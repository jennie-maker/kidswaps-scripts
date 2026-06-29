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
 *     tier badge + full-screen zoom, details panel = name/size/SKU/tier+retail/
 *     condition+gender|washability+set pills/description/personal note/Add-to-bag
 *     STUB). Close via X, backdrop, or Esc.
 *   - DEEP LINK: ?sku= opens the overlay on load; pushState on open; close
 *     restores the URL (browser Back closes the overlay).
 *   - NO-LONGER-AVAILABLE: a ?sku= not in the available set shows a graceful
 *     message instead of a broken panel.
 *
 * Add-to-bag is a STUB here (claim = V4). Zoom is live (full-res viewer).
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

  /* ---- VERSION STAMP (Improvement A) -------------------------------------
   * Print the live jsDelivr pin on load, parsed from THIS script's own src —
   * always reflects the actual @<sha> running, no manual bump, never stale.
   * Wrapped so a stamp failure can never break the app. */
  try {
    var __ksScript = document.currentScript;
    if (!__ksScript) {
      var __ksScripts = document.getElementsByTagName('script');
      for (var __ksJ = 0; __ksJ < __ksScripts.length; __ksJ++) {
        if (__ksScripts[__ksJ].src && __ksScripts[__ksJ].src.indexOf('browse-tool.js') !== -1) {
          __ksScript = __ksScripts[__ksJ]; break;
        }
      }
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : '';
    var __ksPin = (__ksSrc.match(/@([^/]+)\/browse-tool\.js/) || [])[1] || 'unknown';
    console.log('%c[ks-browse] build ' + __ksPin, 'color:#d24f28;font-weight:600', __ksSrc || '(no src)');
  } catch (__ksErr) {}

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
  var lastFocusEl = null;     // element to restore focus to when the overlay closes
  var currentDetailItem = null; // live overlay item — read by the mobile swipe gestures

  var SEARCH = '';            // current free-text query (raw; normalized at match time)

  var PAGE = 1;               // current 1-based page (synced to ?page=)
  var PAGE_SIZE = 24;         // cards per page; pager only appears when total exceeds this

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

  // condition_grade is stored lowercase + hyphenated ("like-new", "new-with-tags").
  // Render-side label only: sentence-case, hyphens -> spaces. DB value untouched.
  function conditionLabel(c) {
    if (!c) return '';
    c = String(c).toLowerCase().replace(/-/g, ' ');
    return c.charAt(0).toUpperCase() + c.slice(1);
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

  // Supabase image transform: rewrite a public OBJECT url to the render/image
  // endpoint at a target width/quality. Pass-through (non-breaking) for any url
  // that isn't a standard public-object url, so unexpected url shapes never break.
  // NOTE: pattern is the documented Supabase public path; confirm against a live
  // card src once (see console check in the deploy notes) — if your urls differ
  // it's a one-line change to MARKER below.
  var THUMB_MARKER = '/storage/v1/object/public/';
  /* COST GUARD (2026-06-27): serve the ORIGINAL image — no Supabase image
     transform. Each transform counts an "origin image" against the 100/cycle
     Pro quota ($5/1000 over), and we were calling thumb() at 3 sizes per photo
     (grid 400 / rail 120 / main 800), multiplying the count per product. This
     early return drops browse to ZERO transform requests. Tradeoff: grid cards
     download the full-res original (object-fit:cover still crops to 3:4 in CSS;
     rail squared via the .ks-detail-thumb img rule added below). To RE-ENABLE
     transforms later (e.g. after pre-generated thumbnails land — Option B),
     delete this one return line; the original rewrite logic below is intact. */
  function thumb(url, w, q, h, mode) {
    if (!url || typeof url !== 'string') return url;
    return url;                                   // <-- COST GUARD: serve original, skip transform
    var i = url.indexOf(THUMB_MARKER);
    if (i === -1) return url;
    var base = url.slice(0, i) + '/storage/v1/render/image/public/' +
               url.slice(i + THUMB_MARKER.length);
    var params = 'width=' + w + '&quality=' + (q || 75);
    if (h) params += '&height=' + h + '&resize=' + (mode || 'cover');
    return base + (base.indexOf('?') === -1 ? '?' : '&') + params;
  }

  // "New" = added within the last NEW_DAYS days (default sort already surfaces
  // these first; the tag is just a discovery cue).
  var NEW_DAYS = 14;
  function isNew(item) {
    if (!item || !item.date_added) return false;
    var t = Date.parse(item.date_added);
    if (isNaN(t)) return false;
    return (Date.now() - t) <= NEW_DAYS * 86400000;
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

  var LUX_NOTE =
    '<div class="ks-detail-luxnote">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4a1.2 1.2 0 0 1 1.2-1.2H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z"/>' +
      '<circle cx="7.5" cy="7.5" r="1.1"/></svg>' +
      '<p>Designer piece \u2014 priced like resale, not retail. Your credit goes toward the cost, and ' +
      'you pay the difference at checkout. You\u2019ll see the exact amount before you confirm.</p>' +
    '</div>';

  /* ---- state screens ------------------------------------------------------ */
  // One-time injected styles for JS-only visuals (skeleton + "New" tag), kept out
  // of the page <head> so they ride the script rather than the fragile head CSS.
  function ensureUtilCss() {
    if (document.getElementById('ks-util-css')) return;
    var css =
      '@keyframes ks-shimmer{0%{background-position:-450px 0}100%{background-position:450px 0}}' +
      '#ks-browse-app .ks-skel{pointer-events:none}' +
      '#ks-browse-app .ks-skel .ks-browse-media,#ks-browse-app .ks-skel-line{' +
        'background:#ece9e3;background-image:linear-gradient(90deg,#ece9e3 0,#f5f3ef 40px,#ece9e3 80px);' +
        'background-size:600px 100%;animation:ks-shimmer 1.2s linear infinite;border-radius:8px;}' +
      '#ks-browse-app .ks-skel .ks-browse-media{aspect-ratio:3 / 4;}' +
      '#ks-browse-app .ks-skel-line{height:12px;margin:10px 2px 0;}' +
      '#ks-browse-app .ks-skel-line.short{width:55%;}' +
      '#ks-browse-app .ks-browse-new{position:absolute;top:10px;right:10px;background:#d24f28;' +
        'color:#fff;font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;' +
        'padding:4px 8px;border-radius:999px;}' +
      '.ks-detail-luxnote{display:flex;gap:9px;align-items:flex-start;margin:14px 0 16px;padding:11px 13px;' +
        'background:#faf7f0;border:1px solid #ecd9ad;border-left:3px solid #e0a93f;border-radius:9px;' +
        'font-size:.82rem;line-height:1.5;color:#5b4a36;}' +
      '.ks-detail-luxnote svg{flex:0 0 auto;margin-top:2px;color:#c8922f;}' +
      '.ks-detail-luxnote p{margin:0;}' +
      '#ks-browse-app .ks-browse-media img{object-fit:cover;}' +
      '#ks-browse-app .ks-browse-media:has(img){background:#fff;}' +
      '#ks-detail-root .ks-detail-main-img{object-fit:contain;}' +
      '#ks-detail-root .ks-detail-media{background:#fff;}' +
      /* D: video rail thumb shows the first frame (#t=0.1) under a play overlay */
      '#ks-detail-root .ks-detail-thumb-video{position:relative;overflow:hidden;}' +
      '#ks-detail-root .ks-detail-thumb-vid{width:100%;height:100%;object-fit:cover;display:block;}' +
      /* COST GUARD: rail thumbs used to be squared by the 120x120 transform;
         serving originals now, so crop them to fill the button via object-fit. */
      '#ks-detail-root .ks-detail-thumb img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '#ks-detail-root .ks-detail-thumb-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28);color:#fff;}' +
      /* PILL DIFFERENTIATION. tier = the one pill: essentials + elevated black,
         Special gold (the only color left). fit rides the size line (muted); condition
         pairs with the tier pill at body size; occasion/set are a quiet extras line.
         #ks-detail-root prefix wins over the per-page base classes. */
      '#ks-detail-root .ks-detail-tier-pill{background:#1E1A19;color:#EEEFE3;border:0;text-transform:none;letter-spacing:.01em;font-weight:600;}' +
      '#ks-detail-root .ks-detail-tier-pill.ks-tier-special{background:#E5AD43;color:#1E1A19;font-weight:700;}' +
      '#ks-detail-root .ks-detail-tier-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px;}' +
      '#ks-detail-root .ks-detail-name{font-family:"Instrument Serif",Quicksand,sans-serif;font-size:30px;line-height:1.12;}' +
      '#ks-detail-root .ks-detail-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:7px;margin:9px 0 0;}' +
      '#ks-detail-root .ks-meta-size{font-size:16px;font-weight:500;color:#1E1A19;}' +
      '#ks-detail-root .ks-meta-fit{font-size:13.5px;color:#a99e92;}' +
      '#ks-detail-root .ks-meta-sku{font-size:13px;letter-spacing:.03em;color:#b3a99d;}' +
      '#ks-detail-root .ks-meta-sep{color:#cfc4b4;}' +
      /* SPACING: group rhythm via margin-tops (block-collapse keeps them sane vs the
         head-box margins); desktop (>=721px, two-col) centers the info block against
         the image via align-self. mobile keeps the rhythm, top-aligned. these layer
         over head-box layout rules not visible here -- verify centering + gaps live. */
      '#ks-detail-root .ks-detail-desc{margin-top:14px;}' +
      '#ks-detail-root .ks-detail-cta{margin-top:20px;}' +
      '@media (min-width:721px){#ks-detail-root .ks-detail-info{align-self:center;}#ks-detail-root .ks-detail-name{font-size:33px;line-height:1.1;}}' +
      '#ks-detail-root .ks-detail-cond{display:inline-flex;align-items:center;gap:5px;font-weight:400;font-size:15px;}' +
      '#ks-detail-root .ks-detail-cond-ic{display:inline-flex;color:#6a5f57;}' +
      '#ks-detail-root .ks-detail-retail{display:block;margin:7px 0 0;font-size:14px;font-weight:400;color:#7d7268;}' +
      '#ks-detail-root .ks-detail-extras{margin:7px 0 0;font-size:14px;font-weight:400;color:#7d7268;}';
    var s = document.createElement('style');
    s.id = 'ks-util-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function showLoading(mount) {
    ensureUtilCss();
    mount.innerHTML = '';
    var grid = el('div', 'ks-browse-grid');
    for (var i = 0; i < 8; i++) {
      var card = el('div', 'ks-browse-card ks-skel');
      card.appendChild(el('div', 'ks-browse-media'));
      var body = el('div', 'ks-browse-body');
      body.appendChild(el('div', 'ks-skel-line'));
      body.appendChild(el('div', 'ks-skel-line short'));
      card.appendChild(body);
      grid.appendChild(card);
    }
    mount.appendChild(grid);
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
      // Option B: serve the pre-generated small thumbnail when present; fall back
      // to the full-res primary (thumb() returns it as-is under the cost guard)
      // for any item without a thumb yet — null everywhere until the client
      // write path ships, so this is behavior-identical until then.
      img.src = item.thumbnail_url || thumb(item.primary_photo_url, 400, 75, 533);
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.replaceChild(placeholderTile(), img);
      });
      media.appendChild(img);
    } else {
      media.appendChild(placeholderTile());
    }
    if (item.tier) media.appendChild(el('span', 'ks-browse-tier', tierLabel(item.tier)));
    if (isNew(item)) media.appendChild(el('span', 'ks-browse-new', 'New'));
    card.appendChild(media);

    // body
    var body = el('div', 'ks-browse-body');
    body.appendChild(el('div', 'ks-browse-name', descriptor(item)));

    var meta = el('div', 'ks-browse-meta');
    meta.appendChild(el('span', 'ks-browse-size', item.size || ''));
    body.appendChild(meta);

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

      // let modified clicks (new tab / new window) use the native anchor href
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;

      // plain click -> in-page overlay
      e.preventDefault();
      openDetail(card.getAttribute('data-sku'));
    });
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
    ensureUtilCss();
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

    // pagination — slice the filtered+searched+sorted set to the current page.
    // Only the current page's cards (and their images) are built, which also
    // keeps image load light until thumbnails exist.
    var total     = view.length;
    var pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (PAGE > pageCount) PAGE = pageCount;   // clamp (e.g. a filter shrank the set)
    if (PAGE < 1) PAGE = 1;
    var startIdx  = (PAGE - 1) * PAGE_SIZE;
    var pageItems = view.slice(startIdx, startIdx + PAGE_SIZE);

    var countText = (pageCount > 1)
      ? 'Showing ' + (startIdx + 1) + '\u2013' + (startIdx + pageItems.length) + ' of ' + total + ' items'
      : total + (total === 1 ? ' item' : ' items');
    mount.appendChild(el('div', 'ks-browse-count', countText));

    var grid = el('div', 'ks-browse-grid');
    var frag = document.createDocumentFragment();
    pageItems.forEach(function (it) { frag.appendChild(buildCard(it)); });
    grid.appendChild(frag);
    wireGrid(grid);
    mount.appendChild(grid);

    if (pageCount > 1) mount.appendChild(buildPagination(pageCount));
  }

  /* ---- pagination --------------------------------------------------------- */
  // Which page numbers to show: always first + last + current's neighbors,
  // collapsing the rest to ellipses (e.g. 1 … 4 5 6 … 12).
  function pageWindow(cur, count) {
    var set = {}, i;
    set[1] = 1; set[count] = 1;
    for (i = cur - 1; i <= cur + 1; i++) if (i >= 1 && i <= count) set[i] = 1;
    var keys = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [], prev = 0;
    keys.forEach(function (k) {
      if (prev && k - prev > 1) out.push('gap');
      out.push(k); prev = k;
    });
    return out;
  }

  function buildPagination(pageCount) {
    var nav = el('div', 'ks-browse-pager');

    var prev = el('button', 'ks-browse-page ks-browse-page-nav', '\u2039');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous page');
    if (PAGE <= 1) prev.disabled = true;
    prev.addEventListener('click', function () { if (PAGE > 1) goToPage(PAGE - 1); });
    nav.appendChild(prev);

    pageWindow(PAGE, pageCount).forEach(function (p) {
      if (p === 'gap') { nav.appendChild(el('span', 'ks-browse-page-gap', '\u2026')); return; }
      var b = el('button', 'ks-browse-page' + (p === PAGE ? ' is-current' : ''), String(p));
      b.type = 'button';
      if (p === PAGE) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', function () { if (p !== PAGE) goToPage(p); });
      nav.appendChild(b);
    });

    var next = el('button', 'ks-browse-page ks-browse-page-nav', '\u203a');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next page');
    if (PAGE >= pageCount) next.disabled = true;
    next.addEventListener('click', function () { if (PAGE < pageCount) goToPage(PAGE + 1); });
    nav.appendChild(next);

    return nav;
  }

  function goToPage(n) {
    PAGE = n;
    var mount = document.getElementById(MOUNT_ID);
    if (mount) render(mount, ALL);   // re-applies filters/search, slices to PAGE
    writeUrl();
    // start the new page at the top of the grid
    var app = document.getElementById(MOUNT_ID);
    if (app && app.scrollIntoView) app.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        '" data-photo="' + i + '"><img src="' + escapeHtml(thumb(u, 120, 70, 120)) + '" alt="" loading="lazy"></button>';
    });
    if (hasVideo) {
      thumbs += '<button type="button" class="ks-detail-thumb ks-detail-thumb-video" data-video="1">' +
        '<video class="ks-detail-thumb-vid" src="' + escapeHtml(item.video_url) + '#t=0.1" muted playsinline preload="metadata"></video>' +
        '<span class="ks-detail-thumb-play">' + PLAY_SVG + '</span>' +
        '</button>';
    }
    if (!photos.length && !hasVideo) {
      thumbs = '';  // rail hidden via CSS when empty wrapper has no children
    }

    // main media (first photo, or placeholder)
    var main;
    if (photos.length) {
      main = '<img class="ks-detail-main-img" src="' + escapeHtml(thumb(photos[0], 800, 80, 1067, 'contain')) +
        '" data-full="' + escapeHtml(photos[0]) + '" alt="' +
        escapeHtml(descriptor(item)) + '">';
    } else {
      main = '<div class="ks-detail-ph">Photo coming soon</div>';
    }
    var tierBadge = item.tier
      ? '<span class="ks-detail-tier-badge">' + escapeHtml(tierLabel(item.tier)) + '</span>' : '';
    var zoom = photos.length
      ? '<button type="button" class="ks-detail-zoom" aria-label="Zoom photo">' + ZOOM_SVG + ' zoom</button>' : '';

    // type-specific fit (gender for clothing, washability for toys) rides the size
    // line, muted; condition pairs with the tier pill; occasion + set are a quiet
    // present-only line. monochrome throughout (gold lives on the Special tier only).
    var fit = isToy
      ? (item.toy_washability ? capFirst(item.toy_washability) : '')
      : genderLabel(item.gender_style);

    var condHtml = item.condition_grade
      ? '<span class="ks-detail-cond"><span class="ks-detail-cond-ic">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M20 6L9 17l-5-5"/></svg></span>' + escapeHtml(conditionLabel(item.condition_grade)) + '</span>'
      : '';

    var extras = [];
    if (item.occasion) extras.push(escapeHtml(item.occasion));
    if (item.is_matching_set) {
      var n = item.set_piece_count;
      extras.push(n ? ('Complete \u00b7 ' + n + ' pieces') : 'Matching set');
    }
    var extraLine = extras.length
      ? '<p class="ks-detail-extras">' + extras.join(' \u00b7 ') + '</p>' : '';

    var metaParts = [];
    if (item.size) metaParts.push('<span class="ks-meta-size">' + escapeHtml(item.size) + '</span>');
    if (fit) metaParts.push('<span class="ks-meta-fit">' + escapeHtml(fit) + '</span>');
    if (item.sku) metaParts.push('<span class="ks-meta-sku">SKU ' + escapeHtml(item.sku) + '</span>');
    var metaLine = metaParts.length
      ? '<p class="ks-detail-meta">' +
        metaParts.join('<span class="ks-meta-sep" aria-hidden="true">\u00b7</span>') + '</p>'
      : '';

    var retail = money(item.retail_value);
    var tierPill = item.tier
      ? '<span class="ks-detail-tier-pill ks-tier-' + escapeHtml(String(item.tier).toLowerCase()) + '">' + escapeHtml(tierLabel(item.tier)) + '</span>' : '';

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
            metaLine +
            '<div class="ks-detail-tier-row">' + tierPill + condHtml + '</div>' +
            (retail ? '<p class="ks-detail-retail">Retail value new ' + retail + '</p>' : '') +
            (item.is_luxury ? LUX_NOTE : '') +
            extraLine +
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
    currentDetailItem = item;     // live item for the once-wired handlers + gestures
    if (root.__ksWired) return;   // attach-once: handlers live on the persistent root
    root.__ksWired = true;
    wireGestures(root);
    // image fallback — 'error' doesn't bubble, so listen in capture phase.
    // Main image -> placeholder; a failed rail thumb just hides itself.
    root.addEventListener('error', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      if (t.classList.contains('ks-detail-main-img')) {
        var media = t.closest('.ks-detail-media');
        if (media) {
          var keep = media.querySelector('.ks-detail-tier-badge');
          media.innerHTML = '<div class="ks-detail-ph">Photo coming soon</div>';
          if (keep) media.appendChild(keep);
        }
      } else {
        var btn = t.closest('.ks-detail-thumb');
        if (btn) btn.style.display = 'none';
      }
    }, true);

    // close affordances
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { e.preventDefault(); closeDetail(); }
      if (e.target.closest('[data-bag]')) { e.preventDefault(); bagStub(root); }

      var t = e.target.closest('[data-photo]');
      if (t) { swapMain(root, currentDetailItem, parseInt(t.getAttribute('data-photo'), 10), false); }
      var v = e.target.closest('[data-video]');
      if (v) { swapMain(root, currentDetailItem, 0, true); }

      // zoom — open full-screen full-res viewer (button OR tapping the main photo)
      if (e.target.closest('.ks-detail-zoom') || e.target.closest('.ks-detail-main-img')) {
        e.preventDefault();
        var mi = root.querySelector('.ks-detail-main-img');
        var src = mi && (mi.getAttribute('data-full') || mi.getAttribute('src'));
        if (src) openZoom(src);
      }
    });
  }

  /* ---- mobile swipe gestures (<=720px) ------------------------------------
     Attached ONCE to the persistent root and delegated, because root.innerHTML
     is rebuilt every open (panel/media are fresh nodes) and wireOverlay re-runs
     each open — re-attaching here would stack handlers. The live item is read
     from currentDetailItem (set in wireOverlay). swapMain is reused unchanged.
     Left/right pages the [...photos, video?] set (wrap); down-from-top closes. */
  function mediaCount() {
    var item = currentDetailItem;
    if (!item) return 0;
    return photoList(item).length + (item.video_url ? 1 : 0);
  }

  function pageMedia(dir) {
    var item = currentDetailItem;
    if (!item) return;
    var photos = photoList(item);
    var hasVid = !!item.video_url;
    var n = photos.length + (hasVid ? 1 : 0);
    if (n < 2) return;
    var root = document.getElementById('ks-detail-root');
    if (!root) return;
    var active = root.querySelector('.ks-detail-thumb.is-active');
    var pos;
    if (active && active.hasAttribute('data-video')) {
      pos = photos.length;                          // video occupies the last slot
    } else if (active) {
      pos = parseInt(active.getAttribute('data-photo'), 10) || 0;
    } else {
      pos = root.querySelector('.ks-detail-main-video') ? photos.length : 0;
    }
    var next = (pos + dir + n) % n;                 // wrap at both ends
    if (hasVid && next === photos.length) swapMain(root, item, 0, true);
    else swapMain(root, item, next, false);
  }

  // After a horizontal page-drag, swallow the synthetic click so it can't open zoom.
  function suppressNextClick(root) {
    var swallow = function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      root.removeEventListener('click', swallow, true);
      clearTimeout(swallow.__t);
    };
    root.addEventListener('click', swallow, true);
    swallow.__t = setTimeout(function () {
      root.removeEventListener('click', swallow, true);
    }, 400);
  }

  function wireGestures(root) {
    if (root.__ksGesturesWired) return;
    root.__ksGesturesWired = true;

    var MQ = window.matchMedia('(max-width: 720px)');
    var startX = 0, startY = 0, startScroll = 0;
    var dragging = false, closing = false, mode = null, panel = null, media = null;
    var lastY = 0, lastT = 0, vy = 0;
    var rafId = 0, pendOff = 0;

    function applyOff() {
      rafId = 0;
      if (!panel) return;
      panel.style.transition = 'none';
      panel.style.transform = 'translateY(' + pendOff + 'px)';
      panel.style.opacity = String(Math.max(0.4, 1 - pendOff / 600));
    }
    function scheduleOff(off) {
      pendOff = off;
      if (!rafId) rafId = requestAnimationFrame(applyOff);
    }
    function clearInline(p) {
      if (!p) return;
      p.style.transition = ''; p.style.transform = ''; p.style.opacity = '';
    }
    function snapBack(p) {
      if (!p) return;
      p.style.transition = 'transform .22s ease, opacity .22s ease';
      p.style.transform = 'translateY(0)';
      p.style.opacity = '1';
      setTimeout(function () { clearInline(p); }, 240);
    }
    function animateClose(p) {
      closing = true;
      if (!p) { closing = false; closeDetail(); return; }
      p.style.transition = 'transform .2s ease, opacity .2s ease';
      p.style.transform = 'translateY(100%)';
      p.style.opacity = '0';
      setTimeout(function () { clearInline(p); closeDetail(); closing = false; }, 200);
    }

    root.addEventListener('touchstart', function (e) {
      if (!MQ.matches || closing) return;
      if (!e.touches || e.touches.length !== 1) { dragging = false; return; }
      panel = root.querySelector('.ks-detail-panel');
      if (!panel) return;
      var tch = e.touches[0];
      startX = tch.clientX; startY = tch.clientY;
      startScroll = panel.scrollTop;
      media = e.target.closest ? e.target.closest('.ks-detail-media') : null;
      dragging = true; mode = null;
      lastY = startY; lastT = Date.now(); vy = 0;
    }, { passive: true });

    root.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var tch = e.touches[0];
      var dx = tch.clientX - startX, dy = tch.clientY - startY;
      if (!mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;   // deadzone
        if (Math.abs(dx) > Math.abs(dy)) {
          if (media && mediaCount() > 1) { mode = 'page'; }
          else { dragging = false; return; }                  // not a media page-swipe -> native
        } else {
          if (dy > 0 && startScroll <= 0) { mode = 'close'; }
          else { dragging = false; return; }                  // upward / mid-scroll -> native scroll
        }
      }
      if (mode === 'page') {
        e.preventDefault();
      } else if (mode === 'close') {
        e.preventDefault();
        var now = Date.now();
        vy = (tch.clientY - lastY) / Math.max(1, now - lastT);
        lastY = tch.clientY; lastT = now;
        scheduleOff(Math.max(0, dy));
      }
    }, { passive: false });

    root.addEventListener('touchend', function (e) {
      if (!dragging) return;
      dragging = false;
      var tch = (e.changedTouches && e.changedTouches[0]) || e;
      var dx = tch.clientX - startX, dy = tch.clientY - startY;
      if (mode === 'page') {
        if (Math.abs(dx) > 55) { pageMedia(dx < 0 ? 1 : -1); }
        suppressNextClick(root);
      } else if (mode === 'close') {
        if (dy > 90 || (vy > 0.5 && dy > 40)) animateClose(panel);
        else snapBack(panel);
      }
      mode = null;
    }, { passive: true });

    root.addEventListener('touchcancel', function () {
      if (mode === 'close') snapBack(panel);
      dragging = false; mode = null;
    }, { passive: true });
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
        '" autoplay loop muted playsinline preload="auto"></video>';
      media.innerHTML = inner + tierBadge;
      // Option A: silent ambient loop, no controls. The muted *property* (not just
      // the attribute) is what some browsers require for autoplay, and an explicit
      // play() with a swallowed rejection covers the rest.
      var vid = media.querySelector('.ks-detail-main-video');
      if (vid) { vid.muted = true; var pp = vid.play(); if (pp && pp.catch) pp.catch(function () {}); }
    } else {
      var u = photos[idx] || photos[0];
      inner = '<img class="ks-detail-main-img" src="' + escapeHtml(thumb(u, 800, 80, 1067, 'contain')) +
        '" data-full="' + escapeHtml(u) + '" alt="' +
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

  /* ---- full-screen zoom (self-contained; ALL styles inlined here — zero page-head CSS) ---- */
  function ensureZoomCss() {
    if (document.getElementById('ks-zoom-css')) return;
    var css =
      '.ks-zoomlayer{position:fixed;inset:0;z-index:10000;background:rgba(20,10,8,.93);' +
        'display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;}' +
      '.ks-zoomlayer-scroll{width:100%;height:100%;overflow:auto;-webkit-overflow-scrolling:touch;' +
        'display:flex;align-items:center;justify-content:center;}' +
      '.ks-zoomlayer img{display:block;max-width:100%;max-height:100%;object-fit:contain;' +
        'cursor:zoom-in;user-select:none;-webkit-user-select:none;}' +
      '.ks-zoomlayer.is-actual .ks-zoomlayer-scroll{align-items:flex-start;justify-content:flex-start;}' +
      '.ks-zoomlayer.is-actual img{max-width:none;max-height:none;width:auto;height:auto;' +
        'object-fit:none;cursor:zoom-out;}' +
      '.ks-zoomlayer-x{position:fixed;top:16px;right:16px;width:40px;height:40px;border-radius:50%;' +
        'border:none;background:rgba(255,255,255,.92);color:#270f0b;font-size:20px;line-height:1;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10001;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.3);}' +
      '.ks-zoomlayer-x:hover{background:#fff;}';
    var s = document.createElement('style');
    s.id = 'ks-zoom-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var zoomKeyHandler = null;

  function openZoom(src) {
    if (!src) return;
    if (document.querySelector('.ks-zoomlayer')) return;   // already open
    ensureZoomCss();

    var layer  = el('div', 'ks-zoomlayer');
    var scroll = el('div', 'ks-zoomlayer-scroll');
    var img    = document.createElement('img');
    img.src = src;
    img.alt = '';
    scroll.appendChild(img);
    layer.appendChild(scroll);

    var x = el('button', 'ks-zoomlayer-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close zoom');
    x.innerHTML = '&times;';
    layer.appendChild(x);

    // tap image -> toggle fit <-> actual size (then scroll/pan to inspect detail)
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      layer.classList.toggle('is-actual');
    });
    // tap the dark area outside the image -> close
    scroll.addEventListener('click', function (e) {
      if (e.target === scroll) closeZoom();
    });
    x.addEventListener('click', closeZoom);

    // Esc closes the ZOOM only — capture phase + stopPropagation keeps the detail overlay open underneath
    zoomKeyHandler = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeZoom(); }
    };
    window.addEventListener('keydown', zoomKeyHandler, true);

    document.body.appendChild(layer);
  }

  function closeZoom() {
    var layer = document.querySelector('.ks-zoomlayer');
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    if (zoomKeyHandler) { window.removeEventListener('keydown', zoomKeyHandler, true); zoomKeyHandler = null; }
  }

  function openDetail(sku) {
    if (!sku) return;
    lastFocusEl = document.activeElement;   // restore focus here on close
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
    // return focus to whatever opened the overlay, if it's still on the page
    if (lastFocusEl && document.contains(lastFocusEl) && lastFocusEl.focus) {
      lastFocusEl.focus();
    }
    lastFocusEl = null;
    // strip ?sku= from the URL without adding history
    if (location.search) {
      history.replaceState({}, '', location.pathname);
    }
  }

  // Keyboard: Esc closes; Tab is trapped inside the open dialog panel.
  document.addEventListener('keydown', function (e) {
    if (!overlayOpen) return;
    if (e.key === 'Escape') { closeDetail(); return; }
    if (e.key !== 'Tab') return;
    var panel = document.querySelector('#ks-detail-root .ks-detail-panel');
    if (!panel) return;
    var f = panel.querySelectorAll(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
    f = Array.prototype.filter.call(f, function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
  var OCCASION_ORDER = ["Valentine's Day", 'Easter', 'Fourth of July', 'Halloween', 'Christmas', 'Special occasion'];

  function capFirst(s) { s = String(s == null ? '' : s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function ident(v) { return v; }

  var FACETS = {
    tier:     { field: 'tier',            title: 'Tier',        match: 'lower',  order: ['essentials', 'elevated', 'special'], display: tierLabel,   urlLower: true },
    brand:    { field: 'brand',           title: 'Brand',       match: 'exact',  order: null,       display: ident,       showAll: true, pin: ['Nike', 'Janie and Jack', 'Gap'] },
    gender:   { field: 'gender_style',    title: 'Gender',      match: 'exact',  order: null,       display: genderLabel },
    color:    { field: 'color',           title: 'Color',       match: 'exact',  order: null,       display: ident,       showAll: true },
    size:     { field: 'size',            title: 'Size',        match: 'exact',  order: SIZE_ORDER, display: ident,       rowFilter: function (it) { return it.category !== 'Shoes'; } },
    category: { field: 'category',        title: 'Category',    match: 'exact',  order: null,       display: ident,       showAll: true },
    wash:     { field: 'toy_washability', title: 'Washability', match: 'exact',  order: null,       display: capFirst },
    age:      { field: 'size',            title: 'Age',         match: 'tokens', order: AGE_ORDER,  display: ident },
    occasion: { field: 'occasion',        title: 'Occasion',    match: 'exact',  order: OCCASION_ORDER, display: ident }
  };

  var RAIL_CONFIG = {
    all:      ['brand', 'occasion', 'tier'],
    clothing: ['brand', 'category', 'color', 'gender', 'size', 'occasion', 'tier'],
    toy:      ['brand', 'age', 'wash', 'occasion', 'tier']
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

    function makeRow(opt) {
      var row   = el('label', 'ks-flt-row');
      var input = document.createElement('input');
      input.type      = 'checkbox';
      input.className  = 'ks-flt-cb';
      input.value      = opt.value;
      input.setAttribute('data-facet', key);
      if (FILTERS[key].indexOf(opt.value) !== -1) input.checked = true;   // checked state from FILTERS = survives rebuild
      input.addEventListener('change', onFacetChange);
      row.appendChild(input);
      row.appendChild(el('span', 'ks-flt-rowtext', opt.label));
      return row;
    }

    // ---- pin/cap mode: facet declares a pin list AND >=1 pinned value is in stock ----
    var def     = FACETS[key];
    var pinList = (def && def.pin) ? def.pin : null;
    var pinned  = pinList
      ? pinList.filter(function (v) { return options.some(function (o) { return o.value === v; }); })
      : [];

    if (pinned.length) {
      var alpha    = options.slice();          // already alpha (brand order:null)
      var expanded = false;
      var more = el('span', 'ks-flt-more', 'Show all (' + options.length + ')');   // ALWAYS shown, even if count === pinned

      function renderRows() {
        var kids = body.querySelectorAll('.ks-flt-row');
        for (var k = 0; k < kids.length; k++) body.removeChild(kids[k]);
        var list = expanded
          ? alpha                                                 // full alphabetical, pinned in normal spots
          : pinned.map(function (v) {                             // collapsed = pinned only, in pin order
              return alpha.filter(function (o) { return o.value === v; })[0];
            });
        list.forEach(function (opt) { body.insertBefore(makeRow(opt), more); });
      }

      more.addEventListener('click', function () {
        expanded = !expanded;
        more.textContent = expanded ? 'Show less' : 'Show all (' + options.length + ')';
        renderRows();
      });
      body.appendChild(more);
      renderRows();
      grp.appendChild(body);
      rail.appendChild(grp);
      return;
    }

    // ---- default mode: all rows, optional 6 + "Show all" CSS cap (unchanged) ----
    options.forEach(function (opt, i) {
      var row = makeRow(opt);
      if (showAll && i >= 6) row.classList.add('ks-flt-extra');   // hidden until "show all"
      body.appendChild(row);
    });
    if (showAll && options.length > 6) {
      var more2 = el('span', 'ks-flt-more', 'Show all (' + options.length + ')');
      more2.addEventListener('click', function () {
        var open = grp.classList.toggle('ks-flt-expanded');
        more2.textContent = open ? 'Show less' : 'Show all (' + options.length + ')';
      });
      body.appendChild(more2);
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
    head.appendChild(el('span', 'ks-flt-title', 'Filter'));
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
    PAGE = 1;                                // any filter/search change returns to page 1
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
    var pg = parseInt(p.get('page'), 10);
    PAGE = (pg && pg > 0) ? pg : 1;
  }

  function writeUrl() {
    var p = new URLSearchParams(location.search);   // preserve other params (?sku=)
    activeFacetKeys().forEach(function (key) {
      if (FILTERS[key].length) p.set(key, FILTERS[key].join(','));
      else p.delete(key);
    });
    if (normSearch(SEARCH)) p.set('q', SEARCH.trim());
    else p.delete('q');
    if (PAGE > 1) p.set('page', String(PAGE));
    else p.delete('page');
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
    input.setAttribute('placeholder', 'Search');
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

    // Pull the existing mobile "Filters" trigger up into the search row so search +
    // filter sit together on mobile. Moving the node preserves its click listener
    // (attached in wireMobileToggle); visibility stays governed by its own
    // breakpoint CSS — hidden on desktop (search fills the row), shown on mobile.
    var mft = document.querySelector('.mobile-filter-toggle');
    if (mft) mount.appendChild(mft);

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
