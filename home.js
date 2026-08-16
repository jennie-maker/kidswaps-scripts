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
 * WHAT IT DOES: takes the featured-and-available items the RPC already returns
 * in order (featured desc, date_added desc), keeps the ones actually flagged
 * featured, paints the first four into .closet-preview-grid, and hides the
 * whole section if there are none.
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
      // The RPC already filters to status = 'available' and already orders
      // featured first, so this only has to keep the genuinely flagged ones and
      // take the head of the list. NO FUNCTION CHANGE WAS NEEDED FOR THIS.
      var featured = items.filter(function (it) { return it.featured === true; });
      var show = featured.slice(0, CARDS);

      if (!show.length) { hide(section, 'no featured items available'); return; }

      var frag = document.createDocumentFragment();
      for (var i = 0; i < show.length; i++) { frag.appendChild(cardEl(show[i])); }
      grid.appendChild(frag);

      console.log(LOG, 'painted ' + show.length + ' of ' + featured.length +
        ' featured (' + items.length + ' available)');

      // ⚠ NOT A FAILURE, BUT SHE HAS NO OTHER WARNING: if the featured pool ever
      // runs below the row size the band renders short. Keep more items flagged
      // featured than the row shows.
      if (featured.length < CARDS) {
        console.warn(LOG, 'featured pool is smaller than the row — the band will render short');
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
