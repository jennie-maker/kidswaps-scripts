/* ============================================================================
 * home.js  —  KidSwaps /old-home  THE CLOSET PREVIEW
 * ----------------------------------------------------------------------------
 * Host: GitHub jennie-maker/kidswaps-scripts, served via jsDelivr (pinned @sha).
 * Markup: hand-placed in Webflow (.closet-preview-* classes).
 * CSS:    home.css, pinned, linked from /old-home's PAGE head box.
 *
 * Read path: the curated anon RPC get_available_inventory() called DIRECTLY —
 * no edge function, no token, no operator gate. This is the SAME call
 * browse-tool.js makes, headers and body byte-for-byte. It is a REPETITION of a
 * proven seam, not a new kind of one.
 *
 * WHAT IT DOES: paints the first four available items into
 * .closet-preview-grid, and hides the whole section if there are none.
 *
 * ⚠ THE ORDER IS THE RPC'S, NOT THIS FILE'S, AND THAT IS THE WHOLE FEATURE.
 * get_available_inventory already sorts `featured desc nulls last, date_added
 * desc nulls last`, so the head of the array IS flagged items first and then
 * the newest. Taking the head therefore gives FEATURED FIRST, TOPPED UP WITH
 * THE NEWEST, with no filter and no second sort here. She curates when she
 * wants to and the row can never render short while there is any stock at all.
 * DO NOT "TIDY" THIS INTO A .filter(featured === true) — that is the version
 * that empties the band the moment a flagged item is claimed.
 *
 * ⚠ THE SECTION IS VISIBLE BY DEFAULT AND THIS SCRIPT HIDES IT, never the
 * reverse. A script that never arrives therefore leaves the section on the page
 * rather than blank — the S224 rule, bought by a section that rendered
 * permanently empty when an observer failed to fire. DO NOT INVERT THIS.
 * ========================================================================== */

(function () {
  'use strict';

  /* ---- build stamp (self-parsing, same pattern as browse-tool.js) --------- */
  try {
    var __ksScript = document.currentScript;
    if (!__ksScript) {
      var __all = document.getElementsByTagName('script');
      __ksScript = __all[__all.length - 1];
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : '';
    var __ksPin = (__ksSrc.match(/@([^/]+)\/home\.js/) || [])[1] || 'unknown';
    console.log('%c[ks-home] build ' + __ksPin, 'color:#E54F25;font-weight:600', __ksSrc || '(no src)');
  } catch (__ksErr) {}

  /* ---- CONFIG ------------------------------------------------------------- */
  var SUPABASE_URL = 'https://ajsobivqxexcniwifxzz.supabase.co';
  var RPC          = '/rest/v1/rpc/get_available_inventory';
  var LOG          = '[ks-home]';
  var CARDS        = 4;

  // PUBLIC anon key ONLY. Public-safe by design (it ships in browser code; the
  // sealed table plus the curated RPC are what make exposure safe).
  // NEVER the service_role key.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM';

  /* ---- helpers ------------------------------------------------------------ */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent = XSS-safe
    return n;
  }

  // Same shape as browse-tool.js's descriptor(): the app name wins when the item
  // has one, otherwise colour plus brand. Kept deliberately identical so the two
  // surfaces cannot start naming the same item two different ways.
  function descriptor(item) {
    if (item.item_name && String(item.item_name).trim()) return item.item_name;
    var parts = [item.color, item.brand].filter(Boolean);
    return parts.length ? parts.join(' ') : (item.brand || 'Item');
  }

  // The RPC coalesces clothing_size and toy_age_range into one `size` field, so
  // a clothing item reads "4 / XXS" and a toy reads "Toddler, Preschool".
  // Printed AS STORED, no label word, matching the order-confirmation email.
  function metaLine(item) {
    var parts = [];
    if (item.brand) parts.push(item.brand);
    if (item.size) parts.push(item.size);
    return parts.join(' \u00b7 ');
  }

  function cardEl(item) {
    var a = el('a', 'closet-preview-card');
    a.setAttribute('href', '/browse?sku=' + encodeURIComponent(item.sku || ''));

    var media = el('div', 'closet-preview-card-media');
    // thumbnail_url first, full-res as the fallback — the same order browse uses.
    // ⚠ A PRESENT-BUT-CORRUPT THUMBNAIL SAILS PAST THIS. The known 1x1 fault is a
    // real file at a real URL, so it is not absence and no fallback catches it.
    // The fix for a bad row is data only: null the thumbnail_url.
    var src = item.thumbnail_url || item.primary_photo_url || '';
    if (src) {
      var img = el('img', 'closet-preview-card-img');
      img.setAttribute('src', src);
      img.setAttribute('alt', descriptor(item));
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      media.appendChild(img);
    }
    a.appendChild(media);

    var body = el('div', 'closet-preview-card-body');
    body.appendChild(el('div', 'closet-preview-card-name', descriptor(item)));
    var meta = metaLine(item);
    if (meta) body.appendChild(el('div', 'closet-preview-card-meta', meta));
    a.appendChild(body);

    return a;
  }

  /* ---- fetch (byte-for-byte browse-tool.js's call) ------------------------ */
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

  /* ---- paint -------------------------------------------------------------- */
  function hide(section, why) {
    if (!section) return;
    section.classList.add('is-empty');
    console.log(LOG, 'section hidden:', why);
  }

  function paint() {
    var section = document.querySelector('.closet-preview-section');
    var grid    = document.querySelector('.closet-preview-grid');

    // Not this page, or the markup was renamed. Say so and touch nothing.
    if (!section || !grid) { return; }

    fetchInventory().then(function (items) {
      // The RPC filters to status = 'available' and orders featured first, so
      // the head of the list is already the right four. NO FUNCTION CHANGE WAS
      // NEEDED FOR THIS, and no sorting happens in the browser.
      var show = items.slice(0, CARDS);

      if (!show.length) { hide(section, 'no items available at all'); return; }

      var frag = document.createDocumentFragment();
      for (var i = 0; i < show.length; i++) { frag.appendChild(cardEl(show[i])); }
      grid.appendChild(frag);

      // The flagged count is logged for her, not used for anything. It is the
      // only place the featured pool's size is visible anywhere today — there
      // is a per-item toggle in the listing tool and no list view of the set.
      var flagged = 0;
      for (var n = 0; n < items.length; n++) { if (items[n].featured === true) flagged++; }
      console.log(LOG, 'painted ' + show.length + ' of ' + items.length +
        ' available (' + flagged + ' flagged featured)');

      // The band can only render short if the whole catalogue is nearly empty.
      if (show.length < CARDS) {
        console.warn(LOG, 'fewer available items than the row holds — the band will render short');
      }
    }).catch(function (err) {
      console.error(LOG, 'load failed:', err);
      hide(section, 'fetch failed');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }
})();

/* ============================================================================
 * MOTION — v41 (S251)
 * ----------------------------------------------------------------------------
 * The thirteen Webflow interactions on /old-home are DELETED (S246, her ruling).
 * This is their replacement, and it is deliberately smaller than what it
 * replaces: the hero on load, the four pricing cards on scroll, and the five
 * stars. Nothing else on the page moves.
 *
 * ⚠⚠⚠ THIS FILE ONLY EVER ADDS A CLASS. All the motion is in home.css. The
 * split is deliberate: if this script never arrives, the flag is never set,
 * NOTHING in home.css hides anything, and the page renders exactly as it does
 * today — fully visible, just still. Her S224 ruling, after a scroll entrance
 * left the how-it-works section permanently blank on the live page.
 * FAILURE MUST ALWAYS LAND ON "NO ANIMATION", NEVER ON "INVISIBLE".
 * ========================================================================== */
(function () {
  'use strict';

  var HTML = document.documentElement;

  /* THE FLAG, AND IT IS THE FIRST ACT ON PURPOSE. Everything in home.css's
     motion block is scoped under html.ks-motion. Set it late, or behind a
     condition, and there is a window where the page paints hidden. */
  HTML.classList.add('ks-motion');

  /* ==========================================================================
     THE FAQ ACCORDION — S251, HER RULING: ONE ROW OPEN AT A TIME.
     ⚠⚠⚠ IT IS BOUND HERE, IMMEDIATELY AFTER THE FLAG AND OUTSIDE start(), ON
     PURPOSE. start() returns early on reduced motion, so binding it in there
     would leave a reader who has asked for less motion with FOUR ROWS THAT
     CANNOT OPEN — the collapse would be live (it is scoped under html.ks-motion
     in home.css, and this flag is already set) with nothing to open it. Behaviour
     is not motion. The flag and the handler now arrive in the same breath, which
     is what makes the no-script floor honest: no script, no flag, no collapse,
     ALL FOUR ANSWERS SIT OPEN.
     ⚠⚠ ONE LISTENER ON THE LIST, NOT FOUR ON THE HEADERS. The rows are static
     markup today, but a delegated listener cannot go stale if a fifth row is
     ever added in the Designer — and there is nothing to unbind.
     ⚠ THE HEADER IS A DIV, SO THE KEYBOARD IS NOT FREE. tabindex, role and
     aria-expanded are set here rather than in Webflow, because a custom
     attribute typed into the Designer is one more unversioned thing to keep
     right — this way the whole control ships with the file. */
  (function () {
    /* v50 (S255): SCOPED TO THE SECTION, NOT TO ONE LIST. /faq groups its
       questions into FIVE faq-question-list wrappers, and this used to bind
       document.querySelector — SINGULAR — so groups two to five would have got
       no tabindex, no role, no click and no keyboard while home.css still
       collapsed them: fifteen questions that cannot open, which is exactly the
       dead Webflow dropdown /faq was rebuilt to escape.
       ⚠⚠ THE SECTION, NOT A LOOP OVER THE WRAPPERS. Five per-wrapper bindings
       would each close only their own rows, so a row open in group 1 and
       another in group 3 could sit open together — breaking her S249 ruling
       that ONE ROW IS OPEN AT A TIME. Scoping to the section keeps that ruling
       across groups, and on /old-home (one section, one wrapper) the behaviour
       is byte-for-byte what it was. */
    var scope = document.querySelector('.faq-section');
    if (!scope) return;

    var rows = scope.querySelectorAll('.faq-question-row'), i, hdr;

    for (i = 0; i < rows.length; i++) {
      hdr = rows[i].querySelector('.faq-question-header');
      if (!hdr) continue;
      hdr.setAttribute('tabindex', '0');
      hdr.setAttribute('role', 'button');
      hdr.setAttribute('aria-expanded', 'false');
    }

    function toggle(row) {
      var open = row.classList.contains('is-open'), k, h;
      for (k = 0; k < rows.length; k++) {
        rows[k].classList.remove('is-open');
        h = rows[k].querySelector('.faq-question-header');
        if (h) h.setAttribute('aria-expanded', 'false');
      }
      if (!open) {
        row.classList.add('is-open');
        h = row.querySelector('.faq-question-header');
        if (h) h.setAttribute('aria-expanded', 'true');
      }
    }

    scope.addEventListener('click', function (e) {
      var hit = e.target.closest && e.target.closest('.faq-question-header');
      if (!hit || !scope.contains(hit)) return;
      var row = hit.closest('.faq-question-row');
      if (row) toggle(row);
    });

    scope.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var hit = e.target.closest && e.target.closest('.faq-question-header');
      if (!hit || !scope.contains(hit)) return;
      e.preventDefault();                /* Space would scroll the page */
      var row = hit.closest('.faq-question-row');
      if (row) toggle(row);
    });
  })();

  /* ==========================================================================
     THE FAQ PILL SCROLL SPY — /faq ONLY, v51 (S255), HERS
     --------------------------------------------------------------------------
     A jump link cannot know which group you are looking at, so the amber
     "current" pill in her mockup needs a reader of scroll position. This is it.

     ⚠⚠ IT IS PURE ADDITION AND ITS FAILURE FLOOR IS THE WHOLE DESIGN. The class
     it writes is the ONLY thing home.css styles as current; script gone means no
     class, and every pill renders as the plain navy outline and STILL WORKS as a
     jump link. Nothing here is load-bearing for navigation.
     ⚠ IT BINDS NOTHING ON /old-home — there is no .faq-pill-row there, so it
     returns on the first line.
     ⚠ THE MATCH IS href -> id, so the pills and the group IDs stay in step with
     no second list to keep right. A pill pointing at an id that does not exist
     is simply skipped rather than throwing.
     ⚠ 140 IS THE TRIGGER LINE, NOT A GUESS AT THE HEADER'S HEIGHT: a group
     counts as current once its top has passed that far down the viewport, which
     is what stops the last group flickering as you reach the foot of the page. */
  (function () {
    var row = document.querySelector('.faq-pill-row');
    if (!row) return;

    var pills = row.querySelectorAll('.faq-pill');
    var map = [], i, id, el;

    for (i = 0; i < pills.length; i++) {
      id = (pills[i].getAttribute('href') || '').replace(/^#/, '');
      el = id ? document.getElementById(id) : null;
      if (el) map.push({ pill: pills[i], group: el });
    }
    if (!map.length) return;

    function mark() {
      var k = 0, j;
      for (j = 0; j < map.length; j++) {
        if (map[j].group.getBoundingClientRect().top <= 140) k = j;
      }
      for (j = 0; j < map.length; j++) {
        map[j].pill.classList.toggle('is-current', j === k);
      }
    }

    /* rAF-throttled: a scroll listener that measures on every event forces a
       layout read per frame on a nineteen-row page. */
    var queued = 0;
    function onScroll() {
      if (queued) return;
      queued = requestAnimationFrame(function () { queued = 0; mark(); });
    }

    mark();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    /* ----------------------------------------------------------------------
       v53 (S255): THE PILLS DO THEIR OWN SCROLLING, HERS — "it goes too far
       down on mobile, and the heading of that section is out of view."

       ⚠⚠⚠ CSS scroll-margin-top DID NOT FIX IT AND THAT IS THE FINDING:
       WEBFLOW'S OWN SCRIPT INTERCEPTS IN-PAGE ANCHOR CLICKS, animates its own
       smooth scroll and sets the hash through the History API — and a scroll it
       performs itself does not honour scroll-margin-top. This project already
       proved that interception once, on the header drawer at S227, where a
       :target rule could never fire for the same reason. THE ONLY WAY TO WIN IS
       TO CANCEL THE DEFAULT AND SCROLL OURSELVES.

       ⚠⚠ THE OFFSET IS MEASURED, NEVER HARDCODED. .site-header is sticky
       site-wide and it SHRINKS ON SCROLL, so its height differs between mobile
       and desktop and between the top of the page and anywhere else. Reading it
       at click time is also the SAFE direction: the header is at its TALLEST
       when the click happens, so any later shrink leaves the heading further
       down the viewport rather than tucked under the bar.

       ✅ THE FLOOR IS THE CSS. scroll-margin-top stays in home.css, so if this
       script never arrives the native anchor still lands in roughly the right
       place — this makes the jump exact, it is not what makes it work.
       ⚠ replaceState, NOT a hash assignment: writing location.hash would make
       the browser jump again and undo the scroll we just performed. */
    var HEADER_GAP = 16;

    function headerH() {
      var h = document.querySelector('.site-header');
      return h ? h.getBoundingClientRect().height : 0;
    }

    function targetFor(el) {
      var y = window.pageYOffset + el.getBoundingClientRect().top - headerH() - HEADER_GAP;
      return y < 0 ? 0 : y;
    }

    /* ⚠⚠⚠ CAPTURE PHASE ON document, AND stopPropagation — v55 (S255), AND THE
       TWO EARLIER VERSIONS OF THIS ARE WHY. v51 relied on CSS scroll-margin-top
       and v53 added preventDefault on a bubbling listener; BOTH LANDED THE PAGE
       ON THE GROUP'S RAW TOP EDGE, measured at groupTop -4 with the heading
       running -4 to 38 underneath a 57px header. THE FINDING: preventDefault
       stops the BROWSER'S jump, it does NOT stop another script's listener, and
       Webflow's own in-page anchor handler was scrolling again after ours and
       winning by going last. Capture on document runs before it and
       stopPropagation means it never receives the event at all.
       ⚠ THE SAME INTERCEPTION IS ON RECORD AT S227, where Webflow's smooth
       scroll set the hash through the History API and :target could never fire.
       DO NOT "SIMPLIFY" THIS BACK TO A BUBBLING LISTENER ON THE PILL ROW. */
    document.addEventListener('click', function (e) {
      var hit = e.target.closest && e.target.closest('.faq-pill');
      if (!hit || !row.contains(hit)) return;

      var id = (hit.getAttribute('href') || '').replace(/^#/, '');
      var el = id ? document.getElementById(id) : null;
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();

      var reduce = window.matchMedia &&
                   window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: targetFor(el), behavior: reduce ? 'auto' : 'smooth' });

      /* THE SETTLE CHECK. It exists for two reasons and neither is paranoia.
         (1) IT IS THE BACKSTOP FOR ANY OTHER SCROLLER — if something still
         scrolls after us, this puts the page back where it belongs and the fault
         cannot present as "the heading is hidden" again.
         (2) THE HEADER SHRINKS ON SCROLL — measured 61px at the top of the page
         and 57px once moving — so an offset computed at CLICK time is stale by
         the time the scroll ends. This measures at the END, with the header at
         its final height.
         ⚠ THE 8px DEAD ZONE IS LOAD-BEARING: without it this would re-scroll on
         every sub-pixel difference and fight the reader. */
      setTimeout(function () {
        var want = targetFor(el);
        if (Math.abs(window.pageYOffset - want) > 8) {
          window.scrollTo({ top: want, behavior: 'auto' });
        }
      }, 700);

      if (history.replaceState) history.replaceState(null, '', '#' + id);
      mark();
    }, true);

  })();

  var HERO =
    '.hero-section .hero-tagline,' +
    '.hero-section .h1-light-leftaligned,' +
    '.hero-section .hero-subhead,' +
    '.hero-section .hero-highlights,' +
    '.hero-section .hero-buttons';

  var CARDS = '.pricing-preview-section .pricing-card';

  /* THE FAQ ROWS RIDE THE SAME OBSERVER AS THE CARDS — HER RULING S249 that they
     REPLAY on re-entry, down and up, is exactly what that observer already does.
     A second observer with its own thresholds would be a new kind of seam where a
     repetition of a working one was available (§2 STACK DISCIPLINE). */
  var ROWS = '.faq-section .faq-question-row';

  /* Everything that is hidden and revealed, in one string. Anything added here is
     observed, revealed by the escape hatch, and swept by the watchdog — all three
     at once, which is what stops one of them being forgotten. */
  var WATCHED = CARDS + ',' + ROWS;

  /* STARS was here. DELETED v35, not left inert (§0): the stars came off the
     observer when the spin went scroll-linked, so nothing reveals them any
     more. Their selectors now live once, in SPIN below, WITH their rates. */

  function revealAll(sel) {
    var n = document.querySelectorAll(sel), i;
    for (i = 0; i < n.length; i++) n[i].classList.add('ks-in');
  }

  /* THE ESCAPE HATCH, USED BY EVERY FAILURE PATH BELOW. */
  function revealEverything() {
    revealAll(HERO);
    revealAll(WATCHED);
  }

  /* ==========================================================================
     THE STARS SPIN WITH THE SCROLL — HER RULING S247.
     Each turns at its own rate and its own direction, so five stars never read
     as one mechanism.
     ⚠⚠ THE SPIN IS THE ONLY THING THEY DO — v36. An opacity twinkle shipped
     alongside this at v35 and SHE CUT IT after seeing it live. So a star is
     STILL whenever the page is still, and that is the ruled behaviour, not a
     dead animation. Do not rebuild the twinkle.

     ⚠⚠⚠ IT WRITES AN INLINE `rotate:` AND NEVER `transform`. .home-hero-star-upper
     and -lower are POSITIONED by transform: translateX(-50%); writing transform
     here would delete that and throw them across the section.
     ⚠⚠ NOTHING IS EVER HIDDEN BY THIS. A star with no script is visible, still,
     and twinkling — the floor is "no spin", never "no star".
     ⚠ rAF-THROTTLED AND PASSIVE. A bare scroll handler writing five inline
     styles per event is a scroll-jank generator on a phone; this coalesces to
     one write per frame and never blocks the scroll itself. */
  var SPIN = [
    /* S304: `off` is a STARTING ANGLE in degrees, added to the scroll-derived value so
       the star is already turned at the top of the page. It CANNOT be done in CSS —
       paint() runs once at load and writes an inline `rotate:` immediately, and inline
       beats any stylesheet rule, so a CSS rotation here would verify clean and do
       nothing. 108deg is 30% of a full turn, hers. */
    { sel: '.home-hero-star-upper',     rate:  0.060, off: 108 },
    /* S304: WAS '.home-hero-star-lower', WHICH IS display:none AND HAS BEEN SINCE S303 —
       so this entry was writing a rotation to a hidden div and the star the member
       actually sees, drawn as .hero-buttons::after, never turned. prop:true because a
       pseudo-element is not in the DOM: home.js writes --ks-star-rot on the HOST and the
       ::after reads it. Rotating the host itself would spin both buttons. */
    { sel: '.hero-section .hero-buttons', rate: -0.045, prop: true },
    { sel: '.closet-preview-star',      rate:  0.075 },
    { sel: '.closet-standard-star',     rate: -0.055 },
    { sel: '.closet-standard-star-two', rate:  0.090 },
    /* THE SIXTH, S251. ⚠⚠ A STAR JOINS THIS ONLY BY A LINE HERE — the list is
       explicit and each entry is read with querySelector, so a new star wearing a
       new class spins for exactly no reason until it is named. ITS OWN RATE AND
       ITS OWN SIGN, so six stars still never read as one mechanism. */
    { sel: '.faq-star',                 rate: -0.070 },
    /* THE SEVENTH AND EIGHTH, S253 — the Instagram band. Same rule as the sixth:
       A STAR JOINS THIS ONLY BY A LINE HERE. Each keeps its own rate and its own
       sign so eight stars still never read as one mechanism.
       ⚠ .instagram-preview-star-lower is display:none below 767. That is fine and
       needs no guard — querySelector still finds it, and writing `rotate:` to a
       hidden element is a no-op rather than a throw. Do NOT "fix" it by removing
       the entry; the desktop star would stop turning. */
    { sel: '.instagram-preview-star-upper', rate:  0.052 },
    { sel: '.instagram-preview-star-lower', rate: -0.084 },

    /* ─── S303: THE PHONE STARS ARE ::after PSEUDO-ELEMENTS AND JS CANNOT REACH
       THEM. Below 479 most of the real star divs are hidden and the artwork is
       drawn as a pseudo-element on the heading (or button) it sits beside, because
       that is the only thing that lands the star after the LAST LETTER whatever the
       heading wraps to. A pseudo-element is not in the DOM, so `el.style.rotate`
       has nothing to write to and those stars stopped turning.
       ✅ THE FIX: for these entries the loop writes a CUSTOM PROPERTY on the HOST
       instead, and the ::after rule reads `rotate: var(--ks-star-rot)`. A custom
       property inherits to the pseudo-element; a rotate written on the host itself
       would spin the HEADING, which is why `prop: true` exists rather than reusing
       the same line.
       ⚠ EACH KEEPS ITS OWN RATE AND SIGN, same rule as the eight above. ─── */
    { sel: '.hero-section .h1-light-leftaligned', rate:  0.060, prop: true },
    { sel: '.closet-standard-heading',            rate:  0.090, prop: true },
    { sel: '.closet-standard-text .closet-standard-cta', rate: -0.055, prop: true },
    { sel: '.pricing-preview-section .h2-light',  rate:  0.068, prop: true },
    { sel: '.faq-section .faq-photo-panel',       rate: -0.070, prop: true }
  ];

  function startSpin() {
    var nodes = [], i, el;
    for (i = 0; i < SPIN.length; i++) {
      el = document.querySelector(SPIN[i].sel);
      if (el) nodes.push({ el: el, rate: SPIN[i].rate, prop: SPIN[i].prop, off: SPIN[i].off });
    }
    if (!nodes.length) return;

    var ticking = false;

    function paint() {
      ticking = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0, k;
      for (k = 0; k < nodes.length; k++) {
        var deg = (y * nodes[k].rate + (nodes[k].off || 0)).toFixed(2) + 'deg';
        if (nodes[k].prop) {
          /* pseudo-element host: set the variable, NEVER rotate the host itself */
          nodes[k].el.style.setProperty('--ks-star-rot', deg);
        } else {
          nodes[k].el.style.rotate = deg;
        }
      }
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    }, { passive: true });

    paint();
  }

  function start() {
    var reduced = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Reduced motion, or a browser with no IntersectionObserver: reveal
       everything at once and stop. Nothing hidden, nothing animated. */
    if (reduced || !('IntersectionObserver' in window)) {
      revealEverything();
      return;                            /* no spin either — she asked for less motion */
    }

    startSpin();

    /* THE HERO RUNS ON LOAD, NOT ON SCROLL — it is already on screen, so there
       is nothing to wait for.
       ⚠⚠⚠ THE DOUBLE requestAnimationFrame IS GONE — v35, AND ITS REMOVAL IS THE
       FIX, NOT A TIDY-UP. It existed to make the browser paint the hidden start
       state before the class landed, because a TRANSITION only runs across a
       painted state. That was a race and on a warm cache it lost: the hero
       simply appeared, with the flag set, the classes landed and every gate
       passing. home.css now drives the hero with a KEYFRAME ANIMATION, which
       runs whenever the class exists and cannot lose that race — so the class
       goes on immediately and there is nothing left to wait for. */
    revealAll(HERO);

    /* ⚠⚠⚠ THE WATCHDOG BELOW IS DELIBERATE-LOOKING AND WAS A BUG AT v33, FOUND
       S246 ON THE LIVE PAGE. It was an UNCONDITIONAL setTimeout(revealEverything,
       6000), so on a healthy page it fired while she was still reading the hero
       and revealed the pricing cards and every star BEFORE she scrolled to them.
       Nothing errored, the flag was set, the classes landed, and the animations
       simply never had anything left to run. A SAFETY NET THAT FIRES ON A
       HEALTHY PAGE IS NOT A SAFETY NET, IT IS THE FAULT.
       It now fires ONLY when the observer is proven not to work. */
    var sawCallback = false;

    /* ⚠⚠⚠ THESE REPLAY — HER RULING S247, REVERSING S246's ONE SHOT. Nothing is
       unobserved now: an element re-hides once it is FULLY off screen and plays
       again on the way back down or up.
       ⚠⚠ THE TWO THRESHOLDS ARE THE HYSTERESIS AND THEY ARE NOT DECORATION.
       Revealing at 0.15 and re-hiding ONLY at exactly 0 means a card must leave
       the viewport COMPLETELY before it can hide — with one threshold the same
       edge would both reveal and re-hide, and a small scroll wobble on a phone
       would flicker the whole row. DO NOT COLLAPSE THESE TO ONE VALUE.
       ⚠ AND RE-HIDING IS SAFE ONLY BECAUSE THE HIDE LIVES UNDER html.ks-motion
       IN home.css. Script gone → flag gone → nothing hides, replay or not. */
    var io = new IntersectionObserver(function (entries) {
      sawCallback = true;                /* the observer is alive, whatever it reports */
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= 0.15) {
          e.target.classList.add('ks-in');
        } else if (e.intersectionRatio === 0) {
          e.target.classList.remove('ks-in');
        }
      });
    }, { threshold: [0, 0.15], rootMargin: '0px 0px -8% 0px' });

    var watched = document.querySelectorAll(WATCHED), i;
    for (i = 0; i < watched.length; i++) io.observe(watched[i]);

    /* THE TWO REAL HOLES, EACH CLOSED WITHOUT TOUCHING A HEALTHY PAGE.
       ⚠ BOTH REVEALS BELOW ARE PERMANENT — they add ks-in without observing, so
       nothing re-hides them. That is correct for both cases: a dead observer and
       a zero-box element are exactly the states where replay cannot work.
       (1) THE OBSERVER NEVER RUNS AT ALL. A live IntersectionObserver delivers a
           first callback within a frame or two of observe(), reporting every
           element including the off-screen ones, so a callback having happened
           is the honest liveness test. No callback by 3s = it is not working,
           and everything is revealed.
       (2) AN ELEMENT THAT CAN NEVER INTERSECT. .home-hero-star-lower is
           display:none below 991, so it has no box and no callback can ever
           reveal it — harmless while hidden, but it would sit at opacity 0 if the
           window were widened later. Anything measuring 0x0 at 3s is revealed. */
    setTimeout(function () {
      if (!sawCallback) { revealEverything(); return; }
      var n = document.querySelectorAll(WATCHED), k, r;
      for (k = 0; k < n.length; k++) {
        r = n[k].getBoundingClientRect();
        if (!r.width || !r.height) n[k].classList.add('ks-in');
      }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
