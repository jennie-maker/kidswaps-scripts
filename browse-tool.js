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
  var FETCHED = false;        // true once a real inventory fetch returns — fail-open guard for the bag's "no longer available" flag (never flag before a confirmed fetch)
  var overlayOpen = false;
  var lastFocusEl = null;     // element to restore focus to when the overlay closes
  var currentDetailItem = null; // live overlay item — read by the mobile swipe gestures
  // OP-BAR (post-list confirmation unit): true when this page load carried &op=1
  // (only the listing tool's post-list/post-save redirect produces it). Session-
  // sticky on purpose — openDetail's pushState rewrites the URL to bare ?sku=,
  // so shared member URLs stay clean while the operator keeps the bar. The bar
  // only LINKS to /admin/listing, which is admin-gated — param = convenience,
  // the tool's gate = the security.
  var OP_MODE = false;
  try { OP_MODE = new URLSearchParams(location.search).get('op') === '1'; } catch (e) {}

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

  // MISC-1 (S265): a broken OPERATOR brand never reaches a member. PREFIX match on
  // "Miscellaneous" -- the family includes Essentials/Elevated/Special, so an exact
  // match catches one and lets the siblings through silently -- plus exact "Unknown".
  // DISPLAY ONLY. The stored brand stays wrong (her S117 call) and searchBlob still
  // indexes it, so "Miscellaneous" remains findable in search.
  // NOT applied in descriptor(): every one of the 774 available rows has an
  // item_name (read live S265), so descriptor's [color, brand] fallback is
  // unreachable on live data. Claude's call, reversible -- if an item ever lands
  // with no item_name the brand would print in the heading again.
  function displayBrand(b) {
    if (!b) return '';
    var s = String(b).trim();
    var l = s.toLowerCase();
    if (l.indexOf('miscellaneous') === 0) return '';
    if (l === 'unknown') return '';
    return s;
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
  /* THE OVERLAY TIER BADGE -- ONE EMITTER, S266.
     HER FINDING, off a real render: the badge in the photo's top corner had NO DOT
     while the card badge and the chip row both did, so "Special" showed its yellow
     twice on one screen and not in the corner. It had never carried one.
     IT WAS ALSO WRITTEN OUT TWICE -- once in detailHtml and again inside swapMain,
     which REBUILDS the media block from a hardcoded string on every thumbnail tap.
     Two copies is how the dot could have been added in one place and silently
     disappeared the moment she tapped a second photo. ONE FUNCTION, BOTH CALLERS.
     ⚠ THE DOT RULE IS S198'S, UNCHANGED AND DELIBERATE: essentials carries NO MARK,
     elevated is blue, special is HER BRAND YELLOW #EDA920. The yellow sits below the
     contrast bar for a mark and she ruled that knowingly, twice, with the numbers in
     front of her. DO NOT "CORRECT" IT TO #A67C0A HERE -- the word is the information
     and the dot is a fast-scan aid, which is the whole reason a below-bar mark is
     acceptable on this element and nowhere that carries meaning alone. */
  /* ONE EMITTER FOR THE MEDIA BOX'S CONTENTS. swapMain() throws this box away and
     rebuilds it on EVERY thumbnail and video tap, so anything in here that is written
     twice will eventually be added in one place and vanish in the other. */
  function mediaInnerHtml(item, inner, zoom) {
    return inner + tierBadgeHtml(item) + (zoom || '');
  }

  function tierBadgeHtml(item) {
    if (!item || !item.tier) return '';
    var k = String(item.tier).toLowerCase();
    var dot = (k === 'elevated' || k === 'special')
      ? '<span class="ks-tier-dot ks-tier-' + escapeHtml(k) + '"></span>' : '';
    return '<span class="ks-detail-tier-badge">' + dot +
           escapeHtml(tierLabel(item.tier)) + '</span>';
  }

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
      '<p>Designer piece. Priced like resale, not retail. Your credit goes toward the cost, and ' +
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
      /* PILL DIFFERENTIATION. tier = the one pill, ONE INK PILL FOR ALL THREE TIERS.
         fit rides the size line (muted); condition pairs with the tier pill at body
         size; occasion/set are a quiet extras line. #ks-detail-root prefix wins over
         the per-page base classes.
         S198: THE AMBER .ks-tier-special OVERRIDE IS DELETED, NOT LEFT INERT. It made
         browse contradict itself -- amber meant SPECIAL here and ELEVATED on the bag
         dot. The tier colour language now lives ONLY on the card grid, as a dot (no
         mark on essentials, blue on elevated, gold on special).
         AND THE DOT CANNOT COME HERE: measured against this pill's ink fill, the blue
         reads 1.99 and would be near-invisible. A dot is a fast-scan aid for a GRID
         and the overlay shows one item, so it has no job on this surface anyway.
         DO NOT "restore" a colour to this pill. */
      '#ks-detail-root .ks-detail-name{font-family:"Instrument Serif",Quicksand,sans-serif;font-size:30px;line-height:1.12;}' +
      /* NO UNDERLINE -- HER RULING S198, off the live render. A linked label reads
         like the rest of the row and the ONLY affordance is that it sits at ink
         while the un-linkable SKU stays muted. Brand and size were already ink so
         they do not move; the fit label darkens from #a99e92 to ink, which is what
         makes the rule visible as a rule.
         ACCEPTED COST, NAMED BEFORE SHE RULED: on a phone a linked label and a
         plain one look identical until she taps. DO NOT ADD AN UNDERLINE BACK.
         The tier pill is excluded -- it is a filled pill and already reads tappable. */
      /* SPACING: group rhythm via margin-tops (block-collapse keeps them sane vs the
         head-box margins); desktop (>=721px, two-col) centers the info block against
         the image via align-self. mobile keeps the rhythm, top-aligned. these layer
         over head-box layout rules not visible here -- verify centering + gaps live. */
      '#ks-detail-root .ks-detail-desc{margin-top:14px;}' +
      '#ks-detail-root .ks-detail-cta{margin-top:20px;}' +
      '@media (min-width:721px){#ks-detail-root .ks-detail-info{align-self:center;}#ks-detail-root .ks-detail-name{font-size:33px;line-height:1.1;}}' +

      /* FILTER RAIL -- a heading and an option were both Quicksand 13px with no
         tracking, no case change and NO SPACE BENEATH THE HEADING. Separated by
         weight + case + tracking + breathing room. NO COLOUR CHANGE: rail text
         computes #270F0B, a near-miss of ink #1E1A19, which is flagged in the
         build doc and is its own decision -- do not fix it here.
         Specificity is id + class + class so it beats the per-page head-box
         rules (bare class) WITHOUT !important. */
      /* MISC-6, SETTLED S266 AFTER TWO COLOURS WERE TRIED AND REJECTED ON LIVE RENDERS.
         GREEN #1F5C38 (S265) read too close to her ink to register as a heading. CORAL
         was mocked and rejected too -- it would have been coral's seventh job and it
         fails AA at this size (3.84:1). ▶▶ SO THE HEADING IS DIFFERENTIATED BY SHAPE AND
         WEIGHT INSTEAD OF BY COLOUR, and no colour is spent on rail text at all.
         HER PICK: her options A AND B TOGETHER -- an amber rule under the heading, plus
         the options muted and indented beneath it.
         ⚠ THE AMBER RULE IS A BACKGROUND IMAGE, NOT A ::after, AND THAT IS DELIBERATE:
         .ks-flt-grouplabel is a flex row holding the title and the chevron, so a pseudo
         element becomes a THIRD FLEX ITEM and lands beside the chevron instead of under
         the text. A background cannot be caught by the flex.
         ⚠ #EDA920 IS THE PALETTE YELLOW FROM HER S249 LIST, not the home page's #E5AD43
         amber. Same device, this project's value.
         ⚠ IT IS A MARK, NOT TEXT, so it carries no contrast obligation -- which is the
         whole reason this answer works where the two colours did not. */
      '#ks-filter-rail .ks-flt-group > .ks-flt-grouplabel{margin-bottom:10px;}' +
      /* THE HEADING IS INSTRUMENT SERIF -- HER RULING S266, HER OPTION R1.
         ⚠⚠ IT CANNOT BE BOLD AND THAT IS WHY IT IS 20px. Instrument Serif SHIPS ONE
         WEIGHT (400, measured off document.fonts), so any weight above that is a
         browser-SYNTHESISED bold -- the exact fault that sat on .ks-wz-h for months
         before S196 pinned it to 400. The size and the face do the separating that
         weight, uppercase and tracking used to do, so all three of those come off.
         DO NOT ADD font-weight HERE, and do not restore the uppercase: a serif at 12px
         uppercase is the weakest version of both ideas.
         ⚠ ROMAN, NOT ITALIC. The italic face is confirmed loaded on /signup and FONT
         LINKS ARE PER PAGE -- nobody has read whether /browse loads it, so an italic
         here risks a synthesised shear for no gain. R3 was offered and not taken.
         ⚠⚠ THE RULE IS PAINTED ON THE TITLE SPAN, NOT ON THE LABEL, AND background-size
         IS 100% RATHER THAN A FIXED WIDTH. The label is a flex row carrying the chevron
         too, so a rule on it measures the whole rail; on the span it measures the word,
         which is what she asked for after seeing Occasion and Condition look stubby.
         ⚠ IT STAYS A BACKGROUND RATHER THAN A ::after -- a pseudo element on a flex row
         becomes a third flex item and lands beside the chevron instead of under the text.
         ⚠ #EDA920 IS THE PALETTE YELLOW FROM HER S249 LIST, not the home page's #E5AD43.
         It is a MARK, not text, so it carries no contrast obligation -- which is the
         whole reason this answer works where green and coral both failed on a render. */
      '#ks-filter-rail .ks-flt-grouptitle{display:inline-block;' +
        'font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:20px;' +
        'line-height:1.15;letter-spacing:0;text-transform:none;color:#1E1A19;' +
        'padding-bottom:7px;background-image:linear-gradient(#EDA920,#EDA920);' +
        'background-size:100% 3px;background-repeat:no-repeat;background-position:left bottom;}' +
      '#ks-filter-rail .ks-flt-group.ks-flt-collapsed > .ks-flt-grouplabel{margin-bottom:0;}' +
      '#ks-filter-rail .ks-flt-group > .ks-flt-groupbody .ks-flt-row{padding-left:12px;}' +
      '#ks-filter-rail .ks-flt-group > .ks-flt-groupbody .ks-flt-rowtext{font-weight:400;color:#75736E;}' +
      '#ks-filter-rail .ks-flt-group{margin-bottom:16px;}' +
      '#ks-filter-rail .ks-flt-head > .ks-flt-clear{font-weight:700;text-decoration:underline;}' +

      /* COUNT LINE -- centred, and the gap above it closed.
         MEASURED LIVE, NOT DERIVED (Session 55). The 70px above the count is a
         FLEX GAP on .inventory-layout (display:flex, gap:50px). It is not margin
         or padding on anything: every element in BOTH ancestor chains reports
         0/0, which is precisely why an earlier pass targeting .filter-bar-section
         and .inventory-main changed nothing. Those two rules were INERT and have
         been DELETED rather than left sitting here looking load-bearing.
         THE FIX SPLITS THE SHORTHAND INSTEAD OF GUESSING A BREAKPOINT: sidebar
         and main sit side by side on desktop (flex-direction:row, so the COLUMN
         gap separates them) and stack below it (column, so the ROW gap does).
         Shrinking row-gap alone therefore closes the stacked gap and CANNOT
         touch the desktop two-column spacing, at any width, with no media query
         and no breakpoint to get wrong. */
      '#ks-search{margin-bottom:10px;}' +
      '.inventory-layout{column-gap:50px;row-gap:14px;}' +
      '#ks-browse-app .ks-browse-count{text-align:center;margin:14px 0 0;color:#75736E;}' +   /* S266: the count moved BELOW the grid, so its breathing room moved from under it to over it. Both numbers cannot live at once -- a bottom margin here would sit between the count and the pager. */
      '#ks-browse-app .ks-browse-size{color:#75736E;}' +

      /* TIER DOT ON THE CARD BADGE -- HER RULING S195, PLACEMENT RULED S198.
         NO MARK ON ESSENTIALS, blue on elevated, gold on special. The WORD is the
         information and the dot is only a fast-scan aid, which is what makes
         colour safe here at all.
         THE SPECIAL DOT IS HER BRAND YELLOW #EDA920 AND IT IS BELOW THE CONTRAST
         BAR ON PURPOSE -- HER RULING S198, TAKEN WITH THE NUMBERS IN FRONT OF HER
         TWICE. Measured against this pill's rgba(255,255,255,.92) fill: blue 8.65,
         dark gold #A67C0A 3.81, HER YELLOW 2.04 against a 3.0 bar for a mark. The
         first build shipped #A67C0A and she could not see it on a real card at 6px,
         because the catalogue is pale garments on white -- so SIZE was the larger
         half of that problem and the dot went 6px -> 9px in the same commit.
         DO NOT "CORRECT" THE YELLOW BACK TO #A67C0A ON THE STRENGTH OF THE RATIO.
         She was shown dark gold, a larger yellow and a dark-rimmed yellow side by
         side and chose the flat brand yellow knowingly. THE WORD IS STILL THE
         INFORMATION; the dot is only a fast-scan aid, which is what makes a
         below-bar mark acceptable HERE and nowhere that carries meaning alone.
         :has() SCOPES THE FLEX TO PILLS THAT ACTUALLY CARRY A DOT, so the essentials
         pill is not touched at all. If :has ever fails the dot still paints, just
         without the gap -- ugly, not broken. Accepted consequence: with no dot on
         essentials the three pills are no longer the same width. */
      '#ks-browse-app .ks-browse-tier:has(.ks-tier-dot){display:inline-flex;align-items:center;gap:5px;}' +
      '#ks-browse-app .ks-browse-tier .ks-tier-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;}' +
      '#ks-browse-app .ks-browse-tier .ks-tier-dot.ks-tier-elevated{background:#28498D;}' +
      '#ks-browse-app .ks-browse-tier .ks-tier-dot.ks-tier-special{background:#EDA920;}' +

      /* ===== S265 CHIP FACTS ROW + TIER DISCLOSURE =====================
         Appended LAST on purpose: within one injected sheet later wins a tie, so
         these beat any survivor of the four rules the rebuild retired. All scoped
         #ks-detail-root, so nothing here can reach the grid or the rail. */
      '#ks-detail-root .ks-detail-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;align-items:center;}' +
      '#ks-detail-root .ks-chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:1.2;}' +
      '#ks-detail-root .ks-chip-link{border:1px solid #C9C7BC;border-radius:999px;padding:5px 11px;' +
        'color:#1E1A19;text-decoration:none;}' +
      '#ks-detail-root .ks-chip-link:hover{border-color:#1E1A19;}' +
      '#ks-detail-root .ks-chip-plain{color:#75736E;padding:5px 0;}' +
      '#ks-detail-root .ks-chip .ks-tier-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;}' +
      '#ks-detail-root .ks-chip .ks-tier-dot.ks-tier-elevated{background:#28498D;}' +
      '#ks-detail-root .ks-chip .ks-tier-dot.ks-tier-special{background:#EDA920;}' +
      /* THE SAME DOT ON THE PHOTO'S TIER BADGE (S266, her finding).
         ⚠ .ks-detail-tier-badge ITSELF IS STYLED IN THE UNVERSIONED PER-PAGE HEAD BOX
         AND IS NOT TOUCHED HERE -- that surface is six style blocks across three
         pages with no rollback. These are NEW selectors adding a dot to an existing
         element, so they cannot collide with whatever the head box says about it.
         The flex is scoped with :has() so the essentials badge, which carries no
         mark, is not altered at all. If :has ever fails the dot still paints, just
         without its gap: ugly, not broken. */
      '#ks-detail-root .ks-detail-tier-badge:has(.ks-tier-dot){display:inline-flex;align-items:center;gap:5px;}' +
      '#ks-detail-root .ks-detail-tier-badge .ks-tier-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;}' +
      '#ks-detail-root .ks-detail-tier-badge .ks-tier-dot.ks-tier-elevated{background:#28498D;}' +
      '#ks-detail-root .ks-detail-tier-badge .ks-tier-dot.ks-tier-special{background:#EDA920;}' +
      /* RETAIL AND SKU, EACH ON ITS OWN LINE (S266). Retail takes the ink and SKU takes
         the muted grey retail used to have -- her ruling, and the swap is the point. */
      '#ks-detail-root .ks-detail-retail{margin:14px 0 0;font-size:15px;color:#1E1A19;}' +
      '#ks-detail-root .ks-detail-sku{margin:6px 0 0;font-size:13px;color:#75736E;}' +
      /* ===== THE MEDIA COLUMN (S266) ==================================
         .ks-detail-mediacol wraps the toggle, the photo box and the panel. It takes the
         flex-child job .ks-detail-media used to do, and the head box sizes the media box
         itself by DESCENDANT selectors, so wrapping it changes nothing there -- checked
         against the served CSS before this was built, not assumed.
         ⚠ THE PANEL IS POSITIONED AGAINST THIS COLUMN, NOT AGAINST THE PHOTO BOX, which
         is what keeps it clear of that box's overflow:hidden. 82px = the 26px toggle row
         + the 8px gap + a 48px inset, which lands it under the tier badge so SPECIAL
         stays readable. ONE NUMBER; move the toggle's height and move this with it. */
      '#ks-detail-root .ks-detail-mediacol{flex:0 0 auto;position:relative;' +
        'display:flex;flex-direction:column;gap:8px;}' +
      '#ks-detail-root .ks-tiers-toggle{display:inline-flex;align-items:center;gap:7px;' +
        'align-self:flex-start;height:26px;margin:0 0 0 12px;' +   /* 12px == the badge's own inset */
        'background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:500;' +
        'color:#75736E;text-decoration:none;cursor:pointer;}' +    /* NO UNDERLINE (hers) */
      '#ks-detail-root .ks-tiers-toggle:hover{color:#1E1A19;}' +
      '#ks-detail-root .ks-tiers-toggle svg{flex:none;}' +
      '#ks-detail-root .ks-tiers-body{display:none;position:absolute;top:82px;left:12px;' +
        'right:12px;z-index:3;background:#fff;border:1px solid #C9C7BC;border-radius:10px;' +
        'padding:14px 15px;box-shadow:0 10px 26px rgba(0,0,0,.18);' +
        'font-size:13px;line-height:1.5;color:#1E1A19;}' +
      '#ks-detail-root .ks-tiers-body.is-open{display:block;}' +
      '#ks-detail-root .ks-tiers-body p{margin:0;}' +
      '#ks-detail-root .ks-tiers-body p + p{margin-top:10px;}' +
      /* THE NAME STARTS LEVEL WITH THE TOP OF THE PHOTO, NOT WITH THE LINK ABOVE IT --
         her correction S266. The rail drops by the same amount so all three columns line
         up again. 34px = the toggle row plus its gap.
         ⚠ THIS ALSO TAKES .ks-detail-info OFF align-self:center, which it has carried
         since S55 -- so the info column is TOP-ALIGNED at desktop now, not vertically
         centred. She approved that on the mockup. It is the one change here that alters
         a layout she had already signed off. */
      '@media (min-width:721px){#ks-detail-root .ks-detail-info{align-self:flex-start;margin-top:34px;}' +
        '#ks-detail-root .ks-detail-rail{margin-top:34px;}}' +
      /* Stacked: nothing to align to, so the offsets come off. The ORDER moves to the
         wrapper -- the head box puts the photo first with order:1 on .ks-detail-media,
         and that property now has to sit on the flex child, which is the column. */
      '@media (max-width:720px){#ks-detail-root .ks-detail-mediacol{order:1;width:100%;' +
        'align-self:stretch;}' +
        '#ks-detail-root .ks-detail-info,#ks-detail-root .ks-detail-rail{margin-top:0;}}';
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
    w.appendChild(el('div', 'ks-browse-state-sub', 'Check back soon. New pieces are added every cycle.'));
    mount.appendChild(w);
  }
  function showSearchEmpty(mount) {
    mount.innerHTML = '';
    var w = el('div', 'ks-browse-state ks-browse-empty');
    // textContent (via el) keeps the user query XSS-safe
    w.appendChild(el('div', 'ks-browse-state-title', 'No matches for \u201c' + SEARCH.trim() + '\u201d'));
    w.appendChild(el('div', 'ks-browse-state-sub', 'Try a brand, item, or category. Or clear your search.'));
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
    if (item.tier) {
      // TIER DOT (S198). No mark on essentials -- the dot is emitted for elevated and
      // special ONLY, so the essentials pill keeps exactly the markup it always had.
      var tierEl = el('span', 'ks-browse-tier');
      var tKey   = String(item.tier).toLowerCase();
      if (tKey === 'elevated' || tKey === 'special') {
        tierEl.appendChild(el('span', 'ks-tier-dot ks-tier-' + tKey));
      }
      tierEl.appendChild(document.createTextNode(tierLabel(item.tier)));
      media.appendChild(tierEl);
    }
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
    return [it.brand, it.item_name, it.category, it.sku].filter(Boolean).join(' ').toLowerCase();   // sku: 'KS-00275' and '275' both hit
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
    var grid = el('div', 'ks-browse-grid');
    var frag = document.createDocumentFragment();
    pageItems.forEach(function (it) { frag.appendChild(buildCard(it)); });
    grid.appendChild(frag);
    wireGrid(grid);
    mount.appendChild(grid);

    // COUNT BELOW THE GRID -- HER RULING S266. It reads as a footer to the results
    // beside the pager rather than as a header above them. Built BEFORE the grid and
    // appended AFTER it, because the figures come off the same slice the grid uses.
    mount.appendChild(el('div', 'ks-browse-count', countText));

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
  // MISC-2 (S265): her approved tier paragraph, VERBATIM, behind a disclosure.
  // IT IS IDENTICAL ON ALL 774 ITEMS. Dropped in above Add to bag it would push the
  // CTA down four lines on every item forever to answer a question a stranger asks
  // ONCE -- so it sits collapsed under the tier chip and the people who want it are
  // the people who tap it. HER RULING, option 3 of three.
  // NO ANIMATION, deliberately: this overlay does not exist at all without the
  // script, so there is no reduced-motion or script-never-arrived case to fail open
  // into, and a plain show/hide cannot leak the way a 0fr collapse can (home.css v43).
  // "How tiers work" is CLAUDE'S LABEL, not hers -- reversible, one string.
  /* THREE RISING STEPS. HER RULING S266, REVERSING HER OWN SPARKLE PICK MADE MINUTES
     EARLIER OFF THE MOCKUP -- and she reversed it for a reason worth keeping: ON THE
     LIVE PAGE THE SPARKLE AND THE TIER DOT DIRECTLY BELOW IT READ AS THE SAME MARK at
     16px. A mockup could not have shown that, because the mockup did not put the two
     within an inch of each other at real size. THE SHAPE ALSO MEANS SOMETHING: three
     rising steps is what the paragraph behind the link is about. Do not swap it back
     for something cuter without looking at the tier chip underneath it.
     A DRAWN PATH, NEVER A TEXT GLYPH -- a character depends on whatever font happens to
     be available and renders differently on her phone than on her Mac (the same rule
     the home page's badge star is built on). aria-hidden, because the button says what
     it is in words. */
  var TIERS_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 18h4V9H4z"/><path d="M10 18h4V5h-4z"/><path d="M16 18h4v-6h-4z"/></svg>';

  /* THE TOGGLE SITS ABOVE THE PHOTO, LEFT, LINED UP WITH THE TIER BADGE -- HER RULING
     S266, off a live render, SUPERSEDING S265's "beside the tier badge".
     ⚠⚠ IT CANNOT LIVE INSIDE .ks-detail-media AND THAT IS NOT A PREFERENCE. That box is
     overflow:hidden with a FIXED 453px height and an image at height:100%, so a row
     added inside it does not push the photo down -- it pushes the bottom of the photo
     out through the clip. Hence the wrapper column: toggle, then the media box.
     ⚠ NO UNDERLINE (hers). The 12px left margin is not a guess -- it matches the badge's
     own 12px inset, read off the served head box, which is what lines the two up. */
  var TIERS_TOGGLE =
    '<button type="button" class="ks-tiers-toggle" data-tiers="1" aria-expanded="false" ' +
      'aria-controls="ks-tiers-body">' + TIERS_ICON_SVG + '<span>How tiers work</span></button>';

  /* HER APPROVED PARAGRAPH, VERBATIM, NOW SET AS TWO PARAGRAPHS -- HER RULING S266.
     ⚠⚠ THE SPLIT IS FORMATTING AND NOT A REWRITE: NOT ONE WORD CHANGES, and the break
     falls at the sentence that turns from how grading works to what it costs her. Same
     move as the /browse SEO block, which she set as three rendered paragraphs with the
     words untouched. DO NOT REDRAFT EITHER PARAGRAPH (S0). */
  var TIERS_BODY =
    '<div class="ks-tiers-body" id="ks-tiers-body">' +
      '<p>It isn\u2019t always about the label. We grade every item essentials, elevated ' +
      'or special, going on quality, demand and what the piece is actually worth.</p>' +
      '<p>Send good, get good: six elevated items in, six elevated items back, no extra ' +
      'charge. Want something from a higher tier than you sent? You pay the ' +
      'difference, based on what it\u2019s worth used, never full retail.</p>' +
    '</div>';

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
    var zoom = photos.length
      ? '<button type="button" class="ks-detail-zoom" aria-label="Zoom photo">' + ZOOM_SVG + ' zoom</button>' : '';

    // THE FACTS ROW IS CHIPS -- her ruling S264. Every fact is its own wrapping
    // pill, so a long brand widens its OWN chip and nothing strands mid-row, which
    // is what kills the separator fault by construction rather than by patching it.
    // THIS REPLACES FOUR ELEMENTS: .ks-detail-meta, .ks-detail-tier-row,
    // .ks-detail-retail and .ks-detail-extras. Their CSS rules are DELETED in the
    // same commit -- an inert rule beside working ones is the CSS version of an
    // orphaned comment lying confidently (S0).
    // NO LABELS -- a labelled list made the panel far too tall (hers).
    //
    // AFFORDANCE IS OPTION B: a LINKED value keeps the pill border; an INERT value
    // is plain grey text, no border, NO UNDERLINE (her ruling). So a row with
    // nothing linked degrades to a readable sentence of facts instead of looking
    // like dead buttons -- which is why B beat bolding.
    //
    // THE LINK RULE IS UNCHANGED FROM S197: a value links iff that facet exists on
    // THIS page. facetLive() + facetValueOf() already do exactly that (and already
    // handle a toy's two age bands), so this is a REPETITION of a proven seam.
    // ORDER IS LINKED FIRST, INERT LAST -- HER RULING S266, off the live render: a
    // mixed row read as disorganised. TWO ARRAYS rather than a sort, so the order
    // WITHIN each group is still the order these chip() calls are written in and
    // stays readable here. ⚠ WHICH CHIPS LINK IS PER PAGE, so this row genuinely
    // reorders itself between /browse and /clothing. That is the rule working.
    var chipsLinked = [], chipsPlain = [];
    function chip(key, raw, text, dotKey) {
      if (!text) return;                       // A CHIP WITH NO VALUE DOES NOT RENDER (hers)
      var dot = dotKey
        ? '<span class="ks-tier-dot ks-tier-' + escapeHtml(dotKey) + '"></span>' : '';
      var v = (key && facetLive(key)) ? facetValueOf(key, raw) : '';
      if (v) {
        chipsLinked.push('<a class="ks-chip ks-chip-link" href="#" data-facet-link="' +
          escapeHtml(key) + '" data-facet-value="' + escapeHtml(v) + '">' +
          dot + escapeHtml(text) + '</a>');
      } else {
        chipsPlain.push('<span class="ks-chip ks-chip-plain">' + dot + escapeHtml(text) + '</span>');
      }
    }

    chip('brand', item.brand, displayBrand(item.brand));
    chip(isToy ? 'age' : 'size', item.size, item.size);
    if (!isToy) chip('gender', item.gender_style, genderLabel(item.gender_style));
    var tKeyLower = item.tier ? String(item.tier).toLowerCase() : '';
    // The tier chip KEEPS its S198 dot, or browse says two different things about
    // tier on the card and in the overlay. Essentials stays silent, by design.
    if (item.tier) chip('tier', item.tier, tierLabel(item.tier),
      (tKeyLower === 'elevated' || tKeyLower === 'special') ? tKeyLower : '');
    // CONDITION lost its inline checkmark: the tick existed to separate it from the
    // tier pill beside it, and a chip is already its own visual unit. Reversible.
    // IT IS A LINK AS OF S266 -- the condition facet now exists on all three rails,
    // so this key changed from '' to 'condition' and nothing else had to move.
    chip('condition', item.condition_grade, conditionLabel(item.condition_grade));
    if (isToy && item.toy_washability) chip('wash', item.toy_washability, capFirst(item.toy_washability));
    // COMPLETENESS, HER RULING S265: ticked -> "Complete", UNTICKED -> "Missing
    // pieces", NEVER CHECKED (null) -> nothing. An item she checked and found
    // incomplete SHOWS -- that is a disclosure, not an unknown.
    if (isToy && item.is_complete === true) chip('', null, 'Complete');
    else if (isToy && item.is_complete === false) chip('', null, 'Missing pieces');
    if (item.is_matching_set) {
      var setN = item.set_piece_count;
      chip('', null, setN ? (setN + ' pieces') : 'Matching set');
    }
    // OCCASION was not in her chip list, but it is a LIVE FACET on all three pages,
    // so the S197 rule makes it a link mechanically. Claude's call, reversible.
    chip('occasion', item.occasion, item.occasion);

    var chips = chipsLinked.concat(chipsPlain);
    var chipRow = chips.length
      ? '<div class="ks-detail-chips">' + chips.join('') + '</div>' : '';

    /* RETAIL AND SKU EACH GET THEIR OWN LINE -- HER RULING S266, off the rendered
       mockup, and it REVERSES her own S265 call that SKU joins the chip row. Recorded
       as hers rather than as drift: she ruled it once on a description and again on a
       picture, and the picture won.
       THE TWO WEIGHTS ARE SWAPPED ON PURPOSE. Retail takes the INK; SKU takes the muted
       grey retail used to wear. A price is a fact a shopper reads, a SKU is a reference
       she reads, so the shopper's fact is the darker one.
       ⚠ APPROVED STRINGS, VERBATIM. "$45 new" is shorter and is UNAPPROVED COPY -- do
       not shorten either one to fit a line (S0: her words do not stray). */
    var retail = money(item.retail_value);
    var retailLine = retail
      ? '<p class="ks-detail-retail">' +
          escapeHtml(isToy ? ('Worth about ' + retail) : ('Retail value new ' + retail)) +
        '</p>' : '';
    var skuLine = item.sku
      ? '<p class="ks-detail-sku">SKU ' + escapeHtml(item.sku) + '</p>' : '';

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
        (OP_MODE && item.sku ? opBarHtml(item.sku) : '') +
        '<div class="ks-detail-cols">' +
          (thumbs ? '<div class="ks-detail-rail">' + thumbs + '</div>' : '') +
          // THE MEDIA COLUMN: the toggle, then the photo box, then the panel. The panel
          // is a SIBLING of the media box rather than a child, so swapMain cannot delete
          // it and .ks-detail-media's overflow:hidden cannot clip it.
          '<div class="ks-detail-mediacol">' +
            TIERS_TOGGLE +
            '<div class="ks-detail-media">' + mediaInnerHtml(item, main, zoom) + '</div>' +
            TIERS_BODY +
          '</div>' +
          '<div class="ks-detail-info">' +
            '<h2 class="ks-detail-name">' + escapeHtml(descriptor(item)) + '</h2>' +
            chipRow +
            retailLine +
            skuLine +
            (item.is_luxury ? LUX_NOTE : '') +
            blocks +
            // NO ICON ON THIS BUTTON -- HER RULING S266. BAG_SVG was live here and is
            // removed; the icon she actually wanted is the header cart's, which is a
            // different conversation and a different surface. The label carries it.
            '<button type="button" class="ks-detail-cta" data-bag="1">' +
              '<span>Add to bag</span></button>' +
            '<span class="ks-detail-cta-cs" aria-live="polite"></span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* OP-BAR: operator actions under the overlay (post-list confirmation unit).
     Inline-styled — no Webflow CSS edit, same discipline as the rail type links.
     Edit deep-links the listing tool's ?edit= handler; New listing is a fresh
     form load. Anchors, so Cmd/middle-click works. */
  /* ---- FACET LINKS ON THE DETAIL OVERLAY (S198) ---------------------------
     Her ask: tapping a label shows every other item that shares it. ONE RULE
     rather than a per-label special case: A LABEL IS A LINK IF THAT FACET
     EXISTS ON THE PAGE SHE IS ON. activeFacetKeys() already returns the live
     per-page list. S266 MOVED TWO OF THESE: gender is now on /browse's rail as well
     as /clothing's, and the condition facet was built, so CONDITION now links on all
     three pages exactly as this comment predicted it would. SKU is still never a
     link and structurally cannot become one -- it has no facet and would return the
     item already on screen.
     THE VALUE MUST MATCH rowMatchesFacet'S NORMALISATION or the link filters to
     nothing and reads as broken: 'lower' facets compare lowercased, and a
     'tokens' facet (toy age) compares one band at a time. */
  function facetLive(key) {
    return !!FACETS[key] && activeFacetKeys().indexOf(key) !== -1;
  }

  function facetValueOf(key, raw) {
    var def = FACETS[key];
    var v = String(raw == null ? '' : raw).trim();
    if (!def || !v) return '';
    // A TOY CAN HOLD TWO AGE BANDS ("Toddler, Preschool"). Target the one the
    // item shows FIRST; the age facet is token-aware, so either band matches.
    if (def.match === 'tokens') v = tokensOf(v)[0] || '';
    else if (def.match === 'lower') v = v.toLowerCase();
    return v;
  }

  // metaLabel() lived here. Its ONLY caller was the retired metaParts block, so it
  // went inert with the chip rebuild and is deleted S265 (S0). chip() inside
  // detailHtml now does the same job and adds the tier dot.

  function opBarHtml(sku) {
    var btn = 'display:inline-block;padding:8px 14px;border-radius:8px;font-size:.85rem;' +
              'font-weight:600;text-decoration:none;line-height:1.2;';
    return '<div class="ks-detail-opbar" style="margin:0 0 14px;padding:0 44px 12px 0;' +
             'border-bottom:1px dashed rgba(0,0,0,.2);display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
             '<span style="font-size:.68rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;opacity:.55">Operator</span>' +
             '<a href="/admin/listing?edit=' + encodeURIComponent(sku) + '" style="' + btn +
               'border:1px solid rgba(0,0,0,.28);color:inherit">Edit this listing</a>' +
             '<a href="/admin/listing" style="' + btn + 'background:#E75025;color:#fff">New listing</a>' +
           '</div>';
  }

  function showUnavailable(root) {
    // OP-BAR rides here too: an edit-save that retires an item redirects to a
    // ?sku= that's no longer in the available set — the operator still needs
    // Edit/New. SKU comes from the URL (a retired item is still Manage-loadable).
    var opSku = '';
    try { opSku = new URLSearchParams(location.search).get('sku') || ''; } catch (e) {}
    root.innerHTML =
      '<div class="ks-detail-backdrop" data-close="1"></div>' +
      '<div class="ks-detail-panel ks-detail-panel-msg" role="dialog" aria-modal="true">' +
        '<button type="button" class="ks-detail-x" data-close="1" aria-label="Close">' + X_SVG + '</button>' +
        (OP_MODE && opSku ? opBarHtml(opSku) : '') +
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
      // FACET LINK first: it closes the overlay itself, so nothing below should run.
      var fl = e.target.closest('[data-facet-link]');
      if (fl) {
        e.preventDefault();
        applyFacetLink(fl.getAttribute('data-facet-link'), fl.getAttribute('data-facet-value'));
        return;
      }
      // TIER DISCLOSURE (S265). DELEGATED on the persistent root: detailHtml is
      // rebuilt on every open, so a per-open binding would stack one handler per
      // item viewed. It ships closed on every open, which is correct -- it answers
      // a first-visit question, not a per-item one.
      var tt = e.target.closest('[data-tiers]');
      if (tt) {
        e.preventDefault();
        var tb = root.querySelector('.ks-tiers-body');
        if (tb) tt.setAttribute('aria-expanded', tb.classList.toggle('is-open') ? 'true' : 'false');
        return;
      }
      if (e.target.closest('[data-close]')) { e.preventDefault(); closeDetail(); }
      if (e.target.closest('[data-bag]')) { e.preventDefault(); addFromDetail(root); }

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
    // ⚠ THIS IS WHY mediaInnerHtml() EXISTS. This function throws the media block away
    // and rebuilds it on EVERY thumbnail and video tap, so anything living in there must
    // be re-emitted here or it vanishes on the second photo with nothing in the console.
    // The badge was a second hardcoded copy until S266. THE TOGGLE AND THE PANEL ARE
    // DELIBERATELY OUTSIDE THIS BOX and are therefore untouched by a photo swap.
    var inner;
    if (isVideo && item.video_url) {
      inner = '<video class="ks-detail-main-video" src="' + escapeHtml(item.video_url) +
        '" autoplay loop muted playsinline preload="auto"></video>';
      media.innerHTML = mediaInnerHtml(item, inner, '');
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
      media.innerHTML = mediaInnerHtml(item, inner, zoom);
    }
    // active thumb state
    root.querySelectorAll('.ks-detail-thumb').forEach(function (b) {
      var on = isVideo ? b.hasAttribute('data-video')
                       : (b.getAttribute('data-photo') === String(idx));
      b.classList.toggle('is-active', on);
    });
  }

  /* ====================================================================== *
   *  BAG (V4 step 2) — the cycle bag that feeds checkout.                    *
   *  Front half only: accumulate SKUs across the 3 browse pages, no credit  *
   *  resolution yet (that's the picker step). State = sessionStorage so it   *
   *  survives /browse <-> /clothing <-> /toys. CSS self-injects (zoom-layer  *
   *  pattern) so there's NO Webflow CSS-box edit and one deploy covers all.  *
   * ====================================================================== */

  var BAG_KEY = 'ksBag';
  // One-shot banner at the top of the bag drawer. TWO writers, both one-shot,
  // both cleared on close: (1) the checkout trim note ("we removed X, it was just
  // swapped"), (2) the duplicate-add note. Renamed from pendingRemovalNote 2026-07-12
  // when the second writer landed — the old name only described half its job.
  var pendingBagNote = null;

  // Memberstack presence check — token VALUE isn't needed here (the picker step
  // will fetch member-claim-context with the real token); we only gate add-to-bag.
  // Login state. The ONLY harmful failure is blocking a real member, so we bias
  // toward "logged in" and resolve authoritatively via the Memberstack SDK.
  var MS_LOGGED_IN = null;   // null = unknown, true/false once resolved

  // Async-authoritative check. Fast paths (cache, any _ms- cookie) answer instantly;
  // otherwise ask the SDK and cache the answer. cb(true|false).
  function checkLoggedIn(cb) {
    if (MS_LOGGED_IN === true) { cb(true); return; }
    try { if (/(?:^|;\s*)_ms-/.test(document.cookie)) { MS_LOGGED_IN = true; cb(true); return; } } catch (e) {}
    try {
      var ms = window.$memberstackDom;
      if (ms && typeof ms.getCurrentMember === 'function') {
        ms.getCurrentMember().then(function (r) { MS_LOGGED_IN = !!(r && r.data); cb(MS_LOGGED_IN); })
                             .catch(function () { cb(false); });
        return;
      }
      if (ms && typeof ms.getMemberCookie === 'function') {
        ms.getMemberCookie().then(function (tok) { MS_LOGGED_IN = !!tok; cb(!!tok); })
                            .catch(function () { cb(false); });
        return;
      }
    } catch (e) {}
    cb(false);
  }

  function bagRead()  { try { return JSON.parse(sessionStorage.getItem(BAG_KEY)) || []; } catch (e) { return []; } }
  function bagWrite(a){ try { sessionStorage.setItem(BAG_KEY, JSON.stringify(a)); } catch (e) {} }
  function bagCount() { return bagRead().length; }

  // Membership map of available SKUs from an inventory array, used as a Set.
  // The single availability signal both #3 surfaces read: the bag flag checks
  // the cached ALL, the checkout catch rebuilds it from a fresh fetch. Pure —
  // touches no module state, so either caller can pass whatever array it trusts.
  function skuSetOf(items) {
    var s = {};
    if (Array.isArray(items)) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it && it.sku) s[it.sku] = true;
      }
    }
    return s;
  }

  // Add currentDetailItem's shape to the bag. Returns 'added' | 'dup' | 'noop'.
  function addToBag(item) {
    if (!item || !item.sku) return 'noop';
    var bag = bagRead();
    for (var i = 0; i < bag.length; i++) { if (bag[i].sku === item.sku) return 'dup'; }
    var thumb = item.thumbnail_url || item.primary_photo_url ||
                (Array.isArray(item.photo_urls) ? item.photo_urls[0] : '') || '';
    bag.push({
      sku:   item.sku,
      name:  descriptor(item),
      tier:  item.tier || '',
      klass: item.item_type || '',     // 'clothing' | 'toy' — the credit class
      size:  item.size || '',
      thumb: thumb
    });
    bagWrite(bag);
    updateBagCount();
    return 'added';
  }

  function removeFromBag(sku) {
    bagWrite(bagRead().filter(function (x) { return x.sku !== sku; }));
    updateBagCount();
    renderBag();
  }

  /* ⚠ DEAD as of 2026-07-12. Nothing calls this. The detail CTA's flash was replaced
   * by drawer-on-add (see addFromDetail). The .ks-detail-cta-cs span it writes into
   * is likewise dead but left in the overlay template. Left in place, harmless.
   * WHY IT DIED: it worked. It rendered. It was 11px of #A89E90 under the button and
   * a member could not see it. Do not "fix" this by re-enabling it. */
  function flashCta(root, msg) {
    var cs = root.querySelector('.ks-detail-cta-cs');
    if (!cs) return;
    cs.textContent = msg;
    cs.classList.add('is-on');
    clearTimeout(cs.__t);
    cs.__t = setTimeout(function () { cs.classList.remove('is-on'); }, 1800);
  }

  /* Detail-overlay "Add to bag" handler (data-bag). Logged-out -> /pricing prompt.
   * THE DRAWER IS THE CONFIRMATION. The overlay closes and the bag slides in
   * showing the item, instead of flashing an 11px whisper under the button that
   * nobody could see (2026-07-12: proven live -- the flash rendered correctly and
   * was still missable; a member is TOLD the item landed by being SHOWN the bag).
   * ⚠ The logged-out branch is UNCHANGED and must stay that way -- showJoinPrompt()
   * is a different message on a different path and it never touches the bag. */
  function addFromDetail(root) {
    var item = currentDetailItem;
    if (!item) return;
    checkLoggedIn(function (ok) {
      if (!ok) { showJoinPrompt(); return; }
      var res = addToBag(item);
      // A re-tap is silent otherwise: with 6 rows in the drawer, nothing would say
      // WHICH one was already there. Reuses the existing one-shot banner seam.
      if (res === 'dup') pendingBagNote = 'That\u2019s already in your bag.';
      closeDetail();   // drops ks-detail-lock, strips ?sku=
      openBag();       // adds ks-bag-lock, calls renderBag()
    });
  }

  /* ---- header CART button (Webflow, member-only) becomes the bag opener ----
   * The logged-in CART link is tagged data-ks-bag in Webflow; we swap its label
   * for a cart icon + live count and open the drawer on click. Its orange Webflow
   * styling is preserved (we set inner content + flex display, nothing else).
   * The logged-out JOIN button is a separate element and is never touched. */
  // CART_SVG was defined here and referenced NOWHERE (inert since S229).
  // Deleted S265 -- S0: inert code is deleted, not left in.

  // Find the member CART link to adopt as the bag opener. Priority: an explicit
  // data-ks-bag tag, else the .verified-dashboard-button whose label is "CART"
  // (the logged-in twin), else the first visible one that isn't "JOIN". The JOIN
  // button (the logged-out twin) is never adopted.
  function findHeaderCart() {
    var nodes = document.querySelectorAll('[data-ks-bag], .verified-dashboard-button');
    var fallback = null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.hasAttribute('data-ks-bag')) return n;
      var txt = (n.textContent || '').trim().toUpperCase();
      if (txt === 'CART') return n;
      if (txt !== 'JOIN' && !fallback && n.offsetParent !== null) fallback = n;
    }
    return fallback;
  }

  var headerCartWired = false;
  function wireHeaderCart() {
    ensureBagCss();
    var c = findHeaderCart();
    if (!c || c.__ksBagWired) return;
    c.__ksBagWired = true;
    c.insertAdjacentHTML('beforeend', '<span class="ks-cart-badge" aria-hidden="true"></span>');
    c.setAttribute('aria-label', 'Open your bag');
    c.addEventListener('click', function (e) { e.preventDefault(); openBag(); });
    headerCartWired = true;
    checkLoggedIn(function () {});   // prime login state
    updateBagCount();
  }

  /* ---- fallback bag button (search row) — only if the header CART isn't tagged ---- */
  function mountBagButton(mount) {
    ensureBagCss();
    checkLoggedIn(function () {});   // prime login state so the first click is instant
    if (headerCartWired) { updateBagCount(); return; }   // header CART is the opener
    if (!mount || mount.querySelector('.ks-bag-btn')) return;
    var btn = el('button', 'ks-bag-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open your bag');
    btn.innerHTML = BAG_SVG + '<span class="ks-bag-count" aria-hidden="true"></span>';
    btn.addEventListener('click', openBag);
    mount.appendChild(btn);
    updateBagCount();
  }

  function updateBagCount() {
    var n = bagCount();
    var badges = document.querySelectorAll('.ks-bag-count, .ks-cart-badge');
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = n ? String(n) : '';
      badges[i].style.display = n ? 'inline-flex' : 'none';
    }
  }

  /* ---- bag drawer (bottom sheet, self-contained, body-appended) ---- */
  function ensureBagRoot() {
    var root = document.getElementById('ks-bag-root');
    if (root) return root;
    root = el('div'); root.id = 'ks-bag-root'; root.className = 'ks-bag-root';
    root.setAttribute('hidden', '');
    document.body.appendChild(root);
    // attach-once delegated handlers (innerHTML is rebuilt each open)
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-bag-close]'))    { closeBag(); return; }
      var rm = e.target.closest('[data-bag-remove]');
      if (rm) { removeFromBag(rm.getAttribute('data-bag-remove')); return; }
      if (e.target.closest('[data-bag-checkout]'))  { goCheckout(); return; }
    });
    return root;
  }

  function renderBag() {
    var root = document.getElementById('ks-bag-root');
    if (!root || root.hasAttribute('hidden')) return;
    var bag = bagRead();
    var rows = '';
    if (!bag.length) {
      rows = '<div class="ks-bag-empty">Your bag is empty.' +
             '<span>Tap \u201cAdd to bag\u201d on any piece to start.</span></div>';
    } else {
      var avail = FETCHED ? skuSetOf(ALL) : null;   // null until a real fetch lands — never flag before then
      for (var i = 0; i < bag.length; i++) {
        var it = bag[i];
        var gone = avail && !avail[it.sku];          // bagged but no longer in the available catalog
        var dot = it.tier ? ('ks-tier-' + String(it.tier).toLowerCase()) : '';
        var meta = [];
        if (it.tier) meta.push(tierLabel(it.tier));
        if (it.size) meta.push(it.size);
        else if (it.klass === 'toy') meta.push('Toy');
        var thumb = it.thumb
          ? '<img src="' + escapeHtml(it.thumb) + '" alt="" onerror="this.style.display=&quot;none&quot;">'
          : '';
        rows +=
          '<div class="ks-bag-row' + (gone ? ' is-gone' : '') + '">' +
            '<div class="ks-bag-thumb">' + thumb + '</div>' +
            '<div class="ks-bag-info">' +
              '<div class="ks-bag-name">' + escapeHtml(it.name) + '</div>' +
              '<div class="ks-bag-meta"><span class="ks-bag-dot ' + dot + '"></span>' +
                escapeHtml(meta.join(' \u00b7 ')) + '</div>' +
            (gone ? '<div class="ks-bag-gone">No longer available</div>' : '') +
            '</div>' +
            '<button type="button" class="ks-bag-x" data-bag-remove="' + escapeHtml(it.sku) +
              '" aria-label="Remove from bag">' + X_SVG + '</button>' +
          '</div>';
      }
    }
    var footer = bag.length
      ? '<div class="ks-bag-foot">' +
          '<div class="ks-bag-note-line">Credits and any fees are shown at checkout.</div>' +
          '<button type="button" class="ks-bag-checkout" data-bag-checkout>Check out</button>' +
        '</div>'
      : '';
    root.innerHTML =
      '<div class="ks-bag-backdrop" data-bag-close></div>' +
      '<div class="ks-bag-sheet" role="dialog" aria-modal="true" aria-label="My bag">' +
        '<div class="ks-bag-grip" data-bag-close></div>' +
        '<div class="ks-bag-head">' +
          '<span class="ks-bag-title">My bag</span>' +
          '<span class="ks-bag-tally">' +
            (bag.length ? bag.length + (bag.length === 1 ? ' item' : ' items') : '') +
          '</span>' +
        '</div>' +
        (bag.length ? '<div class="ks-bag-subnote">Nothing\u2019s reserved until you check out.</div>' : '') +
        (pendingBagNote ? '<div class="ks-bag-removed">' + escapeHtml(pendingBagNote) + '</div>' : '') +
        '<div class="ks-bag-list">' + rows + '</div>' +
        footer +
      '</div>';
  }

  function openBag() {
    ensureBagCss();
    var root = ensureBagRoot();
    root.removeAttribute('hidden');
    renderBag();
    document.documentElement.classList.add('ks-bag-lock');
  }

  function closeBag() {
    pendingBagNote = null;
    var root = document.getElementById('ks-bag-root');
    if (root) { root.setAttribute('hidden', ''); root.innerHTML = ''; }
    document.documentElement.classList.remove('ks-bag-lock');
  }

  /* ====================================================================== *
   *  PICKER (V4 step 3) — replaces the goCheckout stub.                      *
   *  Resolves the WHOLE bag at once: assigns ONE credit per item from a      *
   *  shared, shrinking pool. Default = PRESERVE the higher-value credit      *
   *  (auto-spend a higher credit only when it's the sole option for that     *
   *  item). No money math here — the checkout fn derives every fee from the  *
   *  supplied credit_id. On success -> /checkout?items=SKU:credit_id (the    *
   *  proven commit:false preview takes over). Logic proven by                *
   *  /tmp/picker.test.js (29/29) before wiring.                              *
   * ====================================================================== */
  var TIER_RANK = { essentials: 1, elevated: 2, special: 3 };

  function expMs(c) { var t = Date.parse(c.effective_expiration_date); return isNaN(t) ? Infinity : t; }
  function pickSoonest(arr) { return arr.reduce(function (b, c) { return expMs(c) < expMs(b) ? c : b; }); }
  function pickByWorth(arr, dir) {
    return arr.reduce(function (b, c) {
      if (c.worth === b.worth) return expMs(c) < expMs(b) ? c : b;        // tie -> soonest-expiring
      return (dir === 'max' ? c.worth > b.worth : c.worth < b.worth) ? c : b;
    });
  }

  // Pure: (bag items {sku,klass,tier}, ctx from member-claim-context) -> resolution.
  function resolveBag(bag, ctx) {
    // Off-plan class: an item whose class isn't on the member's plan (cap 0) can't be
    // swapped here. Block with an upgrade nudge instead of billing it as an extra swap.
    var planCaps = ctx.caps || {};
    // Fail-open: only judge off-plan when caps actually loaded (get_member_state always
    // returns both keys) — a data hiccup must never block a member's valid bag.
    var capsLoaded = planCaps.hasOwnProperty('clothing') && planCaps.hasOwnProperty('toy');
    var offPlan = capsLoaded ? bag.filter(function (it) { return (planCaps[it.klass] || 0) === 0; }) : [];
    if (offPlan.length) {
      var offClasses = {};
      offPlan.forEach(function (it) { offClasses[it.klass] = true; });
      return { ok: false, blocked: { type: 'off_plan', classes: Object.keys(offClasses), count: offPlan.length } };
    }

    var pool = (ctx.claimable_credits || []).slice();
    function take(c) { var i = pool.indexOf(c); if (i >= 0) pool.splice(i, 1); }

    var slots = bag.map(function (it) { return { item: it, credit: null, kind: null, value_loss: false }; });

    // Phase 1 — exact-tier locks across the whole bag (same class + same tier).
    slots.forEach(function (s) {
      var it = s.item;
      var m = pool.filter(function (c) { return c.credit_class === it.klass && c.tier === it.tier; });
      if (m.length) { var c = pickSoonest(m); s.credit = c; s.kind = 'exact'; take(c); }
    });

    // Phase 2 — cross-tier for the rest, in bag order, from what's left.
    slots.forEach(function (s) {
      if (s.credit) return;
      var it = s.item;
      var cc = pool.filter(function (c) { return c.credit_class === it.klass; });
      if (!cc.length) return;                                   // unresolved -> no class credit left
      var rank = TIER_RANK[it.tier];
      var below = cc.filter(function (c) { return TIER_RANK[c.tier] < rank; });  // upgrade (fee)
      var above = cc.filter(function (c) { return TIER_RANK[c.tier] > rank; });  // downgrade (free, wastes value)
      var c;
      if (below.length) { c = pickByWorth(below, 'max'); s.kind = 'upgrade'; }   // smallest gap = smallest fee; preserves higher credits
      else { c = pickByWorth(above, 'min'); s.kind = 'downgrade'; s.value_loss = true; } // sole option -> least value wasted, flag it
      s.credit = c; take(c);
    });

    function asgn(s) {
      return { sku: s.item.sku, klass: s.item.klass, item_tier: s.item.tier,
               credit_id: s.credit.id, credit_tier: s.credit.tier, kind: s.kind, value_loss: s.value_loss };
    }
    var assigned = slots.filter(function (s) { return s.credit; });
    var unresolved = slots.filter(function (s) { return !s.credit; }).map(function (s) { return s.item; });

    // Credit shortage -> block the bag (no silent partial checkout).
    if (unresolved.length) {
      var byClass = {};
      unresolved.forEach(function (it) { byClass[it.klass] = (byClass[it.klass] || 0) + 1; });
      return { ok: false, blocked: { type: 'credit_shortage', byClass: byClass, items: unresolved },
               assignments: assigned.map(asgn), unresolved: unresolved };
    }

    // Extra-swap cap: anything past plan headroom in a class is a $5 extra; max 5 combined/cycle.
    var caps = ctx.caps || {}, used = ctx.used_this_cycle || {};
    var perClass = {};
    assigned.forEach(function (s) { var k = s.item.klass; perClass[k] = (perClass[k] || 0) + 1; });
    var alreadyExtra = 0, newExtra = 0;
    ['clothing', 'toy'].forEach(function (k) {
      var cap = caps[k] || 0, u = used[k] || 0;
      alreadyExtra += Math.max(0, u - cap);
      newExtra += Math.max(0, (perClass[k] || 0) - Math.max(0, cap - u));
    });
    var totalExtra = alreadyExtra + newExtra;
    if (totalExtra > 5) {
      return { ok: false, blocked: { type: 'extra_swap_cap', totalExtra: totalExtra, newExtra: newExtra },
               assignments: assigned.map(asgn) };
    }

    return { ok: true, assignments: assigned.map(asgn), extra: newExtra,
             itemsParam: assigned.map(function (s) { return s.item.sku + ':' + s.credit.id; }).join(',') };
  }

  /* ---- runtime glue: token, claim-context fetch, gate, in-drawer block --- */
  var CLAIM_CTX_URL = SUPABASE_URL + '/functions/v1/member-claim-context';

  // member_status blocks (copy mirrors checkout-tool.js so the voice matches).
  var GATE_TITLE = {
    paused: 'Your membership is paused',
    cancelled_ended: 'Reactivate to keep swapping',
    pending_first_bag: 'Send your first bag to start'
  };
var GATE_COPY = {
    paused: 'Resume your membership to claim items.',
    cancelled_ended: 'Your membership is cancelled, but your closet\u2019s still here. Reactivate whenever you\u2019re ready to start swapping again.',
    pending_first_bag: 'Send your first bag to earn credits before you can claim.'
  };
  var GATE_CTA = {
    paused: { label: 'Manage membership', href: '/dashboard' },
    cancelled_ended: { label: 'Reactivate', href: '/dashboard' },
    pending_first_bag: { label: 'Go to dashboard', href: '/dashboard' }
  };

  // getMemberCookie() returns the JWT as a STRING (not a promise) in this SDK
  // build — but tolerate a thenable too, so the picker can't regress either way.
  function getToken(cb) {
    try {
      var ms = window.$memberstackDom;
      if (ms && typeof ms.getMemberCookie === 'function') {
        var v = ms.getMemberCookie();
        if (v && typeof v.then === 'function') {
          v.then(function (t) { cb(t || null); }).catch(function () { cb(null); });
        } else {
          cb(v || null);
        }
        return;
      }
    } catch (e) {}
    cb(null);
  }

  function fetchClaimContext(tok, cb) {
    fetch(CLAIM_CTX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY,
                 'Authorization': 'Bearer ' + ANON_KEY, 'x-ms-token': tok },
      body: '{}'
    })
    .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
    .then(function (d) { cb(null, d); })
    .catch(function (e) { cb(e, null); });
  }

  function ensureBagBlockCss() {
    if (document.getElementById('ks-bag-block-css')) return;
    var css =
      '.ks-bag-block{margin:10px 18px 0;padding:13px 15px;border-radius:13px;' +
        'background:#fbeee9;border:1px solid #efc9bb;font-family:Quicksand,sans-serif;}' +
      '.ks-bag-block-t{font-weight:600;color:#b23c19;font-size:14.5px;margin-bottom:3px;}' +
      '.ks-bag-block-m{color:#6f4a3e;font-size:13px;line-height:1.4;}' +
     '.ks-bag-block-cta{display:inline-block;margin-top:10px;padding:7px 13px;border-radius:9px;' +
        'background:#d24f28;color:#fff;text-decoration:none;font-size:13px;font-weight:600;}' +
      '.ks-bag-block-ctas{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}' +
      '.ks-bag-block-ctas .ks-bag-block-cta{margin-top:0;}' +
      '.ks-bag-block-ctas .ks-bag-block-cta:nth-child(2){background:#fff;color:#b23c19;' +
        'border:1px solid #d8a892;}';
    var s = document.createElement('style'); s.id = 'ks-bag-block-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  function clearBagBlock() {
    var b = document.querySelector('.ks-bag-block'); if (b && b.parentNode) b.parentNode.removeChild(b);
  }

function showBagBlock(title, msg, cta) {
    ensureBagBlockCss();
    var sheet = document.querySelector('.ks-bag-sheet'); if (!sheet) return;
    clearBagBlock();
    var list = cta ? (Array.isArray(cta) ? cta : [cta]) : [];
    var btns = list.map(function (c) {
      return '<a class="ks-bag-block-cta" href="' + escapeHtml(c.href) + '">' + escapeHtml(c.label) + '</a>';
    }).join('');
    var html =
      '<div class="ks-bag-block" role="alert">' +
        '<div class="ks-bag-block-t">' + escapeHtml(title) + '</div>' +
        '<div class="ks-bag-block-m">' + escapeHtml(msg) + '</div>' +
        (btns ? '<div class="ks-bag-block-ctas">' + btns + '</div>' : '') +
      '</div>';
    var foot = sheet.querySelector('.ks-bag-foot');
    if (foot) foot.insertAdjacentHTML('beforebegin', html);
    else sheet.insertAdjacentHTML('beforeend', html);
  }

  function setCheckoutBusy(btn, on) {
    if (!btn) return;
    if (on) { btn.__old = btn.textContent; btn.textContent = 'Checking your credits\u2026'; btn.disabled = true; btn.style.opacity = '.7'; }
    else { if (btn.__old) btn.textContent = btn.__old; btn.disabled = false; btn.style.opacity = ''; }
  }

  function shortageMessage(byClass) {
    // STANDING COPY RULE (Jennie, Session 41): a credit-shortage message NEVER says
    // "remove an item." It points to send-a-bag AND mentions the credit pack, in
    // every shortage message. byClass is intentionally unused now (the copy no
    // longer enumerates what to remove); the signature is kept so the call site
    // in finishCheckout doesn't move.
    return 'Send in more items to earn more credits and you\u2019ll be ready to go. ' +
           'If you see something you like and just can\u2019t wait, you can always buy a credit pack.';
  }

  // Usable credits per class from the claim-context pool (same source the picker uses).
  function creditCountByClass(ctx) {
    var by = { clothing: 0, toy: 0 };
    (ctx.claimable_credits || []).forEach(function (c) {
      if (c.credit_class === 'clothing') by.clothing += 1;
      else if (c.credit_class === 'toy') by.toy += 1;
    });
    return by;
  }

  // Zero usable credits in the shorted class(es): point to send-a-bag (earn) and
  // mention the credit pack, per the standing copy rule. ONE button (send a bag);
  // the pack is plain text in the body, not a second CTA.
function outOfCreditsBlock(zeroClasses) {
    var title = zeroClasses.length > 1 ? 'Out of credits'
              : zeroClasses[0] === 'toy' ? 'Out of toy credits'
              : 'Out of clothing credits';
    return {
      title: title,
      msg: 'You\u2019ve picked more than your credits cover right now. Send in a swap bag to earn more. ' +
           'If you see something you like and just can\u2019t wait, you can always buy a credit pack.',
      ctas: [
        { label: 'Send in a swap bag', href: '/dashboard' }
      ]
    };
  }
  // Runs the credit picker on a resolved item set and hands off to /checkout.
  // Shared by the no-removal path and the fail-open path of goCheckout.
  // Block copy for a bag holding items whose class isn't on the member's plan.
  // Copy approved by Jennie (Session 43). Signature kept (classes/count unused)
  // so the finishCheckout call site doesn't move -- same pattern as shortageMessage.
  // NO CTA on purpose: the two remedies (remove it / switch plans) are named in
  // prose, and there is no self-serve plan-switch path today (Stripe portal
  // switching is OFF, #PLAN-UPGRADE-IN-CHECKOUT is unbuilt), so a button would be
  // a dead end. When the in-checkout upgrade ships, add the button then.
  function offPlanBlock(classes, count) {
    return {
      title: 'Not on your plan',
      msg: 'This one\u2019s not covered by your current plan. You can take it ' +
           'out of your bag, or switch to a plan that includes it.'
    };
  }

  function finishCheckout(items, ctx, btn) {
    var res = resolveBag(items, ctx);
    if (!res.ok) {
      setCheckoutBusy(btn, false);
      if (res.blocked.type === 'credit_shortage') {
        var byClass = res.blocked.byClass;
        var have = creditCountByClass(ctx);
        var shortClasses = Object.keys(byClass);
        var zeroClasses = shortClasses.filter(function (k) { return (have[k] || 0) === 0; });
        if (zeroClasses.length === shortClasses.length) {
          // every shorted class is truly empty -> earn-or-buy, not "remove N"
  var oc = outOfCreditsBlock(zeroClasses);
          showBagBlock(oc.title, oc.msg, oc.ctas);
        } else {
          // has some credits, just over-bagged -> point to send-a-bag + pack (one button)
          showBagBlock('Almost there', shortageMessage(byClass),
            { label: 'Send in a swap bag', href: '/dashboard' });
        }
      } else if (res.blocked.type === 'extra_swap_cap') {
        showBagBlock('Past this cycle\u2019s limit', 'You can swap up to 5 extra items per cycle. Edit your bag to check out.');
      } else if (res.blocked.type === 'off_plan') {
        var ob = offPlanBlock(res.blocked.classes, res.blocked.count);
        showBagBlock(ob.title, ob.msg);
      } else {
        showBagBlock('Something\u2019s off', 'Please edit your bag and try again.');
      }
      return;
    }
    console.log(LOG, 'picker resolved', res.assignments);
    window.location.href = '/checkout?items=' + encodeURIComponent(res.itemsParam);
  }

  // One-shot bag-banner text after checkout drops just-swapped items.
  function removalNote(removed) {
    var names = removed.map(function (x) { return x.name; });
    if (names.length === 1) return 'We removed ' + names[0] + '. It is no longer available.';
    return 'We removed ' + names.join(', ') + '. They are no longer available.';
  }

  // The picker. Replaces the step-2 stub; wired to [data-bag-checkout].
  function goCheckout() {
    var bag = bagRead();
    if (!bag.length) return;
    var btn = document.querySelector('.ks-bag-checkout');
    clearBagBlock();
    pendingBagNote = null;
    setCheckoutBusy(btn, true);

    getToken(function (tok) {
      if (!tok) {
        setCheckoutBusy(btn, false);
        showBagBlock('Please log in', 'Log in to check out your bag.', { label: 'Log in', href: '/pricing' });
        return;
      }
      fetchClaimContext(tok, function (err, ctx) {
        if (err || !ctx) {
          setCheckoutBusy(btn, false);
          showBagBlock('Couldn\u2019t load your bag', 'Something went wrong reading your credits. Please try again in a moment.');
          return;
        }

        var st = ctx.member_status;
        // get_member_state passes members.status through RAW ('pending', 'active',
        // 'cancelled' -- the only values any live writer produces). The block and
        // copy maps below speak the server's NORMALIZED enum, so map raw -> enum
        // here, mirroring the server, or a pending/cancelled member falls through
        // to a generic server block instead of her own drawer. ('paused' already
        // matches literal and nothing writes it yet; 'canceled' is cheap insurance.
        // Server stays the authoritative gate regardless.)
        if (st === 'pending') st = 'pending_first_bag';
        else if (st === 'cancelled' || st === 'canceled') st = 'cancelled_ended';
        if (st === 'paused' || st === 'cancelled_ended' || st === 'pending_first_bag') {
          setCheckoutBusy(btn, false);
          showBagBlock(GATE_TITLE[st], GATE_COPY[st], GATE_CTA[st]);
          return;
        }
        // st === 'active' (or any unrecognized status) -> proceed. The checkout fn
        // is the authoritative gate, so an unknown status falls through to it.

        // Fresh availability read at the tap. The bag is a wishlist, so a piece
        // can be claimed by someone else between bagging and now. Drop anything
        // that's gone, tell the member, and run the picker on what survives.
        // Fail-open: a network hiccup here must never block a real member.
        fetchInventory().then(function (freshItems) {
          var live = skuSetOf(freshItems);
          var survivors = [], removed = [];
          for (var i = 0; i < bag.length; i++) {
            (live[bag[i].sku] ? survivors : removed).push(bag[i]);
          }
          if (removed.length) {
            bagWrite(survivors);
            updateBagCount();
            pendingBagNote = removalNote(removed);
            renderBag();                  // trimmed bag + note; member taps Check out again
            setCheckoutBusy(btn, false);
            return;                       // no redirect on a removal pass
          }
          finishCheckout(bag, ctx, btn);  // nothing gone -> straight through
        }).catch(function () {
          finishCheckout(bag, ctx, btn);  // fail-open: proceed on the full bag
        });
      });
    });
  }

  // Logged-out add-to-bag -> gentle nudge to /pricing
  function showJoinPrompt() {
    ensureBagCss();
    var t = document.getElementById('ks-bag-toast');
    if (!t) { t = el('div'); t.id = 'ks-bag-toast'; t.className = 'ks-bag-toast'; document.body.appendChild(t); }
    t.innerHTML = '<span>Join KidSwaps to start swapping.</span><a href="/pricing">See plans</a>';
    t.classList.add('is-on');
    clearTimeout(t.__t);
    t.__t = setTimeout(function () { t.classList.remove('is-on'); }, 4200);
  }

  function ensureBagCss() {
    if (document.getElementById('ks-bag-css')) return;
    var css =
      '.ks-bag-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;' +
        'width:40px;height:40px;border:0;background:transparent;color:#1E1A19;cursor:pointer;flex:none;}' +
      '.ks-bag-btn svg{width:22px;height:22px;}' +
      '.ks-bag-count{position:absolute;top:-2px;right:-2px;min-width:17px;height:17px;padding:0 4px;' +
        'border-radius:9px;background:#d24f28;color:#fff;font-size:10px;font-weight:600;' +
        'line-height:1;align-items:center;justify-content:center;}' +
      '[data-ks-bag]{display:inline-flex;align-items:center;justify-content:center;gap:3px;}' +
      '.ks-cart-ico{vertical-align:middle;}' +
      '.ks-cart-badge{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;' +
        'min-width:18px;height:18px;padding:0 5px;margin-left:7px;border-radius:9px;' +
        'background:#eeece1;color:#1f1a17;font-size:11px;font-weight:700;line-height:1;}' +
      '.ks-bag-count-header{position:static;top:auto;right:auto;background:transparent;color:inherit;' +
        'min-width:auto;height:auto;padding:0;border-radius:0;font-size:14px;font-weight:600;margin-left:2px;}' +
      '.ks-bag-root[hidden]{display:none;}' +
      '.ks-bag-root{position:fixed;inset:0;z-index:9000;}' +
      '.ks-bag-backdrop{position:absolute;inset:0;background:rgba(31,26,23,.42);}' +
      '.ks-bag-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;background:#fff;' +
        'border-radius:22px 22px 0 0;max-height:82vh;display:flex;flex-direction:column;' +
        'font-family:Quicksand,sans-serif;}' +
      '.ks-bag-grip{width:38px;height:4px;border-radius:4px;background:#d8d4c6;margin:12px auto 6px;cursor:pointer;}' +
      '.ks-bag-head{display:flex;align-items:baseline;justify-content:space-between;padding:4px 18px 8px;}' +
      '.ks-bag-subnote{font-size:11.5px;color:#9a9384;padding:0 18px 10px;margin-top:-2px;}' +
      '.ks-bag-title{font-family:"Instrument Serif",Quicksand,serif;font-size:30px;color:#1E1A19;line-height:1;}' +
      '.ks-bag-tally{font-size:13px;color:#6f6a60;}' +
      '.ks-bag-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:0 18px;}' +
      '.ks-bag-row{display:flex;gap:14px;align-items:center;padding:13px 0;border-top:1px solid #efece2;}' +
      '.ks-bag-thumb{width:56px;height:56px;border-radius:10px;background:#efe9dd;overflow:hidden;flex:none;}' +
      '.ks-bag-thumb img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.ks-bag-info{flex:1;min-width:0;}' +
      '.ks-bag-name{font-size:14.5px;font-weight:500;color:#1E1A19;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.ks-bag-meta{font-size:12.5px;color:#6f6a60;display:flex;align-items:center;gap:6px;margin-top:3px;}' +
      '.ks-bag-dot{width:7px;height:7px;border-radius:50%;background:#b9b2a3;flex:none;}' +
      /* S198: REPOINTED TO THE ONE SCHEME. Was green/amber/coral, which disagreed
         with the card dot on every single tier. Essentials is HIDDEN rather than
         recoloured -- "no mark" is the ruling, and the bag row prints the tier as a
         WORD beside it anyway, so nothing is lost. */
      '.ks-bag-dot.ks-tier-essentials{display:none;}' +
      '.ks-bag-dot.ks-tier-elevated{background:#28498D;}' +
      '.ks-bag-dot.ks-tier-special{background:#EDA920;}' +
      '.ks-bag-x{width:40px;height:40px;border:0;background:transparent;color:#9a9384;cursor:pointer;' +
        'flex:none;display:flex;align-items:center;justify-content:center;}' +
      '.ks-bag-x svg{width:16px;height:16px;}' +
      '.ks-bag-empty{padding:26px 4px 30px;text-align:center;color:#6f6a60;font-size:14px;' +
        'display:flex;flex-direction:column;gap:6px;}' +
      '.ks-bag-empty span{font-size:12.5px;color:#a89f8e;}' +
      '.ks-bag-foot{padding:14px 18px 18px;border-top:1px solid #efece2;}' +
      '.ks-bag-note-line{font-size:12px;color:#6f6a60;margin-bottom:11px;}' +
      '.ks-bag-checkout{display:block;width:100%;background:#d24f28;color:#fdf6ec;border:0;' +
        'border-radius:50px;padding:15px;font-size:15px;font-weight:600;' +
        'font-family:Quicksand,sans-serif;cursor:pointer;}' +
      '.ks-bag-hold{text-align:center;font-size:11px;color:#9a9384;margin-top:9px;}' +
      '.ks-bag-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(20px);' +
        'background:#1E1A19;color:#eeece1;font-family:Quicksand,sans-serif;font-size:13px;' +
        'padding:12px 16px;border-radius:12px;z-index:10001;opacity:0;pointer-events:none;' +
        'transition:opacity .2s,transform .2s;max-width:90vw;}' +
      '.ks-bag-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}' +
      '.ks-bag-toast a{color:#E5AD43;font-weight:600;text-decoration:underline;margin-left:5px;}' +
      '.ks-bag-row.is-gone .ks-bag-thumb{filter:grayscale(1);opacity:.55;}' +
      '.ks-bag-row.is-gone .ks-bag-name{opacity:.55;}' +
      '.ks-bag-row.is-gone .ks-bag-meta{display:none;}' +
      '.ks-bag-gone{font-size:12.5px;color:#b4542f;font-weight:600;margin-top:3px;}' +
      '.ks-bag-removed{margin:2px 18px 10px;padding:10px 12px;background:#faf3e6;' +
        'border-left:3px solid #d24f28;border-radius:8px;font-size:12.5px;color:#1f1a17;line-height:1.4;}' +
      'html.ks-bag-lock{overflow:hidden;}';
    var s = document.createElement('style');
    s.id = 'ks-bag-css';
    s.textContent = css;
    document.head.appendChild(s);
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
        FETCHED = true;
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
   * NOTE: every group is a collapsible accordion section and EVERY ONE renders
   *       COLLAPSED on load. This note used to claim only the first group (Tier)
   *       opened -- that was NEVER true of the code: buildRail passed
   *       startOpen=true for all of them, so the rail rendered fully expanded.
   *       Corrected by reading the caller, Session 55.
   * ----------------------------------------------------------------------- */
  var SIZE_ORDER = ['6-9M', '9-12M', '12-18M', '18-24M', '2T', '3T', '4 / XXS', '5 / XS', '6 / XS', '7 / Small'];
  var AGE_ORDER  = ['Baby', 'Toddler', 'Preschool', 'Big Kid'];
  var OCCASION_ORDER = ["Valentine's Day", 'Easter', 'Fourth of July', 'Halloween', 'Christmas', 'Special occasion'];
  /* CONDITION_ORDER -- BEST TO WORST, and every string is the RAW stored value read
     off inventory S266 with its counts (great 481, good 138, like-new 74, fair 52,
     new-with-tags 30). AN `order` ARRAY IS A WHITELIST: facetOptions keeps only
     present values that appear in it, so ONE WRONG STRING SILENTLY DROPS THAT GRADE
     FROM THE RAIL WITH NO ERROR ANYWHERE. Do not retype these from memory, and do
     not "tidy" new-with-tags to nwt -- conditionLabel() renders these five as
     New with tags / Like new / Great / Good / Fair, which is why no display map is
     needed here. */
  var CONDITION_ORDER = ['new-with-tags', 'like-new', 'great', 'good', 'fair'];

  function capFirst(s) { s = String(s == null ? '' : s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function ident(v) { return v; }

  var FACETS = {
    tier:     { field: 'tier',            title: 'Tier',        match: 'lower',  order: ['essentials', 'elevated', 'special'], display: tierLabel,   urlLower: true },
    brand:    { field: 'brand',           title: 'Brand',       match: 'exact',  order: null,       display: ident,       showAll: true },   // pin list REMOVED Session 55 -- falls back to the default 4-alphabetical preview + Show all (N). buildGroup's pin branch is still there and fires for any facet that declares one.
    gender:   { field: 'gender_style',    title: 'Gender',      match: 'exact',  order: null,       display: genderLabel },
    color:    { field: 'color',           title: 'Color',       match: 'exact',  order: null,       display: ident,       showAll: true },
    size:     { field: 'size',            title: 'Size',        match: 'exact',  order: SIZE_ORDER, display: ident,       rowFilter: function (it) { return it.category !== 'Shoes'; } },
    category: { field: 'category',        title: 'Category',    match: 'exact',  order: null,       display: ident,       showAll: true },
    wash:     { field: 'toy_washability', title: 'Washability', match: 'exact',  order: null,       display: capFirst },
    age:      { field: 'size',            title: 'Age',         match: 'tokens', order: AGE_ORDER,  display: ident },
    occasion: { field: 'occasion',        title: 'Occasion',    match: 'exact',  order: OCCASION_ORDER, display: ident },
    // CONDITION (S266). The file predicted this one at S198: "CONDITION is plain
    // today and starts linking itself for free the day a condition facet is ever
    // built." That is exactly what happened -- the chip's key changed from '' to
    // 'condition' and facetLive() did the rest. match:'exact' compares the RAW
    // value, which is what the chip link sends, so the two cannot diverge.
    condition:{ field: 'condition_grade',  title: 'Condition',   match: 'exact',  order: CONDITION_ORDER, display: conditionLabel }
  };

  /* S266: GENDER added to /browse and CONDITION added to all three.
     GENDER was already live on /clothing, so "Girls" has linked there since S198 and
     only /browse was missing the rail entry -- confirmed off this config, not off the
     doc. ⚠ /browse HOLDS TOYS TOO and toys carry no gender_style, so a gender
     selection there returns clothing only. That is correct (facets combine with AND)
     and it is NOT the size/age case, which needed EXCLUSIVE_PAIRS because it could
     only ever return zero rows.
     ⚠ THE 31 UNGENDERED CLOTHING ITEMS STAY ABSENT FROM THIS FACET -- her S264
     ruling that null is the honest answer. Reachable unfiltered; do not fill them in.
     Placement is CLAUDE'S CALL AND REVERSIBLE: gender beside brand, condition beside
     tier, since tier and condition are the two quality questions. */
  var RAIL_CONFIG = {
    all:      ['category', 'brand', 'gender', 'tier', 'condition', 'size', 'age', 'occasion'],
    clothing: ['category', 'brand', 'color', 'gender', 'size', 'tier', 'condition', 'occasion'],
    toy:      ['brand', 'age', 'wash', 'tier', 'condition', 'occasion']   // no category group on toys
  };

  /* /browse carries BOTH size (clothing values) and age (toy values). Each facet's
     `order` array is a WHITELIST -- facetOptions keeps only present values that
     appear in it -- so SIZE_ORDER can only ever yield clothing sizes and AGE_ORDER
     can only ever yield toy age bands. The two lists cannot mix, and that is what
     makes the split free rather than a new facet.
     THEY ARE MUTUALLY EXCLUSIVE AT SELECTION TIME (see onFacetChange): facets
     combine with AND, and nothing is both a 2T and a Toddler-aged toy, so holding
     one from each could only ever return zero rows. */
  var EXCLUSIVE_PAIRS = { size: 'age', age: 'size' };
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
    if (!startOpen) grp.classList.add('ks-flt-collapsed');   // every group is an accordion; ALL render collapsed (buildRail passes startOpen=false)
    var lbl  = el('div', 'ks-flt-grouplabel');
    // THE TITLE CARRIES ITS OWN CLASS AS OF S266 so the amber rule can measure THE WORD.
    // The label is a flex row holding the title and the chevron, so a rule painted on the
    // LABEL spans the whole rail width -- which is what made it look stubby under long
    // words like Occasion and Condition and endless under short ones.
    lbl.appendChild(el('span', 'ks-flt-grouptitle', title));
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
      if (showAll && i >= 4) row.classList.add('ks-flt-extra');   // hidden until "show all"
      body.appendChild(row);
    });
    if (showAll && options.length > 4) {
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

    // B: Type nav — a discoverable second path across the three browse pages,
    // and a populated header so /browse doesn't read as sparse. Links, not facets.
    var typeGrp = el('div', 'ks-flt-group');
    var typeLbl = el('div', 'ks-flt-grouplabel');
    typeLbl.appendChild(el('span', 'ks-flt-grouptitle', 'Type'));   // same class as buildGroup's, or TYPE alone keeps the old treatment
    typeGrp.appendChild(typeLbl);
    var typeBody = el('div', 'ks-flt-groupbody');
    [['All', '/browse', 'all'], ['Clothing', '/clothing', 'clothing'], ['Toys', '/toys', 'toy']]
      .forEach(function (t) {
        var a = document.createElement('a');
        a.className = 'ks-flt-row';
        a.href = t[1];
        a.style.textDecoration = 'none';
        a.style.color = 'inherit';
        if (BROWSE_TYPE === t[2]) a.style.fontWeight = '700';
        a.appendChild(el('span', 'ks-flt-rowtext', t[0]));
        typeBody.appendChild(a);
      });
    typeGrp.appendChild(typeBody);
    rail.appendChild(typeGrp);

    activeFacetKeys().forEach(function (key, idx) {
      var def = FACETS[key];
      buildGroup(rail, key, def.title, facetOptions(key), true, false);   // startOpen=false: EVERY group collapsed on load
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

    // MUTUALLY EXCLUSIVE FACETS -- ticking one clears the other rather than
    // letting a member hold a combination that can only return zero rows.
    // Clears FILTERS *and* the live checkboxes: the rail is built once
    // (RAIL_BUILT) so an unticked box will not repaint itself.
    var other = EXCLUSIVE_PAIRS[facet];
    if (cb.checked && other && FILTERS[other] && FILTERS[other].length) {
      FILTERS[other].length = 0;
      var boxes = document.querySelectorAll('.ks-flt-cb[data-facet="' + other + '"]');
      for (var b = 0; b < boxes.length; b++) boxes[b].checked = false;
    }

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

  /* A LABEL LINK REPLACES THE WHOLE SELECTION rather than adding to it, because
     the promise it makes is "every other item like this one". Leaving her other
     facets on would make that promise false and hand back a near-empty grid that
     reads as a broken link -- the same reasoning that made size/age mutually
     exclusive rather than explained. The search box is cleared for the same
     reason. CLAUDE'S CALL, REVERSIBLE; the named cost is that she loses the
     filter set she arrived with. */
  function applyFacetLink(key, value) {
    if (!facetLive(key) || !value) return;
    Object.keys(FILTERS).forEach(function (k) { FILTERS[k] = []; });
    FILTERS[key] = [value];
    resetSearchInput();
    // THE RAIL IS BUILT ONCE (RAIL_BUILT), so a box that is not ticked here will
    // never repaint itself and the rail would silently disagree with the grid.
    var rail = document.getElementById(RAIL_MOUNT_ID);
    if (rail) Array.prototype.forEach.call(
      rail.querySelectorAll('input.ks-flt-cb'),
      function (cb) {
        cb.checked = (cb.getAttribute('data-facet') === key && cb.value === value);
      }
    );
    closeDetail();
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
    if (mft) mount.insertBefore(mft, box);   // BEFORE the box: Filters sits LEFT of search on mobile. Desktop unaffected -- its own breakpoint CSS hides it there.

    mountBagButton(mount);

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

  // the DOM half alone, so a facet link can clear the query WITHOUT a second render
  function resetSearchInput() {
    SEARCH = '';
    var mount = document.getElementById(SEARCH_MOUNT_ID);
    if (mount) {
      var input = mount.querySelector('.ks-search-input');
      if (input) input.value = '';
      var box = mount.querySelector('.ks-search-box');
      if (box) box.classList.remove('has-text');
    }
    clearTimeout(searchDebounce);
  }

  function clearSearch() {
    resetSearchInput();
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
    wireHeaderCart();

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