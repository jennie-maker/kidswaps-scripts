/* ==========================================================================
 * KidSwaps V4 — checkout-tool.js  (§9.3 step 5: the plain page)  rev 2
 * --------------------------------------------------------------------------
 * Renders the member-facing checkout from the checkout Edge Fn's commit=false
 * PREVIEW payload (proven 2026-06-24e). This pass:
 *   - parseCart()  reads ?items=SKU:credit_id,SKU:credit_id  (the ONE throwaway
 *     piece — browse "Add to bag" + credit-selection populate this contract in
 *     later builds; everything below parseCart is real).
 *   - ?state=<x>   client-side override to paint block/failure screens, NO fetch.
 *   - ONE fetch commit:false → header / savings / coverage tiles / summary /
 *     coins / Closet-Standard seal / secure line, OR a block/failure screen.
 *     Charges/writes NOTHING (preview). Confirm now commits — see rev 7 below.
 *
 * rev 2 (2026-06-24): all CSS scoped under #ks-checkout-app so Webflow global
 *   heading/link styles can't bleed in (root cause of the centered header +
 *   missing block title). Palette = KidSwaps swatches only (orange #d24f28
 *   documented; green #54935f, gold #e0a93f, cream #eeece1, ink #1f1a17 from
 *   the brand swatches; backgrounds are transparency variants of those exact
 *   hues; charges use neutral ink-grays, no invented colors). Quicksand base;
 *   all-left receipt; value line no cents; item thumbnails (placeholder until
 *   the fn returns image_url); block/failure = tight centered cluster.
 *   Header = Instrument Serif 400, scaled large (receipt 3.2rem / screens 2rem),
 *   sentence case; body stays Quicksand.
 * rev 3 (2026-06-24): SOLID fills only (no opacity tints) — full-shade green
 *   seal + green "Covered" badge (white text), quiet solid neutral charge badge,
 *   solid gold coins. Empty thumbnails hidden (tile shows photo only once the fn
 *   returns image_url). Coins wrapped in #ksc-bank = the stable mount for the
 *   step-6 animated bank (top-right desktop, left on mobile).
 * rev 4 (2026-06-24): trust bar de-boxed — no background, bold green text, gold
 *   shield (matches coins). Charge badge now ink-on-cream (palette neutrals, off
 *   the derived gray). Confirm button = 50px pill.
 * rev 5 (2026-06-24): item tiles link out — thumb+name wrapped in
 *   <a href="/browse?sku=…" target="_blank"> so a member can re-reference the
 *   live detail overlay mid-checkout without losing their cart. Tag/fee stays
 *   outside the link. (Cart edit/remove still belongs to the unbuilt browse→bag
 *   workstream, not here.)
 * rev 6 (2026-06-30): EDITABLE CART (the choosing screen). CART is now a mutable
 *   module ref (seeded from parseCart); changing a line's credit re-fetches the
 *   commit:false preview with the new pick and re-renders — money stays 100%
 *   server-authoritative (resale never client-side). Per line: a "Change" chip
 *   (ONLY when the fn returns >1 distinct priced credit_option — single-credit
 *   lines render exactly as before) opens a modal that NAMES tiers, prices each
 *   option Free/+$X, collapses fungible same-tier credits to one row, highlights
 *   the current pick, and greys in-use-elsewhere credits ("In use on KS-…",
 *   flag-and-keep, not selectable). value_loss (applied credit outranks the item,
 *   re-derived server-side since the URL carries only SKU:credit_id): inline note
 *   on the line + a checkbox that gates Confirm until acknowledged. Each change
 *   replaceState()s the new ?items= so a reload keeps the member's choices.
 * rev 7 (2026-07-02): COMMIT WIRED — Confirm now POSTs {commit:true, items:CART,
 *   idempotency_key} (assume-commit default; idem key = crypto.randomUUID, stable
 *   per unchanged cart, reset on any credit change). Server charges the saved card
 *   off-session + commit_claim_batch; the page just sends and routes the result.
 *   NEW renderSuccess() (the "You're all set." screen) reads items/value/bank from
 *   the stashed last preview (LAST_PREVIEW) + charge/shipping from the commit
 *   response; route() gains an ok+claim_ids branch. Every failure code already had
 *   copy (renderFailure), so only the success screen was net-new. OPEN: lifetime-
 *   saved $ hidden until the fn passes state.lifetime (line renders only if present);
 *   browse-bag not cleared from here (checkout owns no bag storage). The ship-
 *   tracking email the screen promises is a SEPARATE flow (manual at soft launch).
 * rev 8 (2026-07-12): TWO SHIPPING-COPY BUGS FIXED. Both were dormant only
 *   because shipping had never fired; the bags panel is what wakes them. The fn
 *   already sent everything needed — this file had simply never read it. CLIENT
 *   ONLY: no Edge Fn change.
 *   (1) fees.shipping.note NOW HAS A DOM HOME (.ksc-shipnote, under the Shipping
 *       row). The fn has always sent it; every version of that copy has been dead
 *       text. ⚠ GATED TO state==="charged" — the fn's INCLUDED note is the label
 *       "Shipping — Included", which the row already says; rendering it would
 *       print the same fact twice. Only the charged note is a real sentence.
 *   (2) THE COVERAGE SUBLINE NO LONGER KEYS OFF total_cents. It now feeds off
 *       fees.upgrade_total (×100 — that key is DOLLARS, this fn wants CENTS).
 *       total_cents = upgrade + extra-swap + SHIPPING, so a member whose credit
 *       fully covered her item but who owed $15 shipping was told her credits
 *       fell short. ONLY AN UPGRADE FEE IS A CREDIT SHORTFALL: extra-swap is a
 *       QUANTITY fee (she must still hold a credit to use it) and shipping is a
 *       LOGISTICS fee. Ruled by Jennie 2026-07-12. The tile already agreed — an
 *       over-cap item renders "Covered" with a +$5 beside it.
 *   ⚠ The button label + Total row still use total_cents, correctly — she really
 *     does owe it. ONLY the subline's input changed.
 * ========================================================================== */
(function () {
  "use strict";

  var thisScript = document.currentScript;

  (function stamp() {
    try {
      var src = (thisScript && thisScript.src) || "";
      var m = src.match(/@([0-9a-f]{7,40})\//);
      console.log("[ks-checkout] build " + (m ? m[1] : "unknown") + " " + src);
    } catch (e) {}
  })();

  // ---- config ---------------------------------------------------------------
  var FN_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/checkout";
  var MOUNT_ID = "ks-checkout-app";

  // ---- editable-cart state (rev 6) ------------------------------------------
  var CART = null;          // mutable [{sku, credit_id}] — seeded from parseCart
  var MODAL_SKU = null;     // which line's modal is open
  var LAST_LINES = {};      // sku -> last rendered line (for modal open)
  var LAST_PREVIEW = null;  // last preview payload (success screen reads items/value/bank from it)
  var IDEM_KEY = null;      // stable per unchanged cart; reset on any credit change (fresh order = fresh key)
  var MS_FIELDS = null;     // Memberstack customFields (shipping-* + name); loaded once at boot, read synchronously by renderSuccess

  function newIdemKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "ks-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  var BLOCK_COPY = {
    paused: "Your membership is paused. Resume it to claim items.",
    cancelled_ended: "Reactivate your membership to claim items.",
    pending_first_bag: "Send your first bag to earn credits before you can claim.",
  };
  var BLOCK_TITLE = {
    paused: "Your membership is paused",
    cancelled_ended: "Reactivate to keep swapping",
    pending_first_bag: "Send your first bag to start",
  };
  var BLOCK_CTA = {
    paused: { label: "Manage membership", href: "/dashboard" },
    cancelled_ended: { label: "Reactivate", href: "/dashboard" },
    pending_first_bag: { label: "Go to dashboard", href: "/dashboard" },
  };

  var FAILURE_TITLE = {
    card_declined: "Your card needs a quick update",
    item_taken: "One item is no longer available",
    reservation_expired: "Your hold expired",
    extra_swap_limit: "One past this cycle's limit",
    resale_missing: "This item isn't ready yet",
    bad_tier: "This item isn't ready yet",
    credit_unavailable: "A credit needs refreshing",
    no_card: "Add a card to check out",
    reprice: "Your total just changed",
    off_plan: "Not on your plan",
  };
  var FAILURE_COPY = {
    card_declined: "We couldn't charge your card. Your bag is saved. Update your card and try again.",
    item_taken: "One item in your bag is no longer available, so nothing was charged. Your other items are saved. If you just placed an order, check your dashboard before trying again.",
    reservation_expired: "Your hold expired. Please re-add the item to your bag.",
    extra_swap_limit: "That's past the 5 extra-swap limit for this cycle. Remove that item to check out the rest now.",
    resale_missing: "This item isn't ready to claim yet. Nothing was charged.",
    bad_tier: "This item isn't ready to claim yet. Nothing was charged.",
    credit_unavailable: "A credit in your bag is no longer available. Please refresh your bag.",
    no_card: "No saved card on file. Add a card to check out.",
    reprice: "Your total changed since you opened this page. Please review and confirm again.",
    off_plan: "This item isn't available on your current plan.",
  };

  // ---- helpers --------------------------------------------------------------
  function money(d) { return "$" + (Number(d) || 0).toFixed(2); }       // "$8.00"
  function moneyc(c) { return money((Number(c) || 0) / 100); }          // cents
  function moneyRound(d) { return "$" + Math.round(Number(d) || 0); }   // "$60" (value line)
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function getToken() {
    try {
      return (window.$memberstackDom && window.$memberstackDom.getMemberCookie &&
        window.$memberstackDom.getMemberCookie()) || null;
    } catch (e) { return null; }
  }
  function loadMsFields() {
    try {
      if (!(window.$memberstackDom && window.$memberstackDom.getCurrentMember)) return;
      window.$memberstackDom.getCurrentMember().then(function (m) {
        MS_FIELDS = (m && m.data && m.data.customFields) || null;
      }).catch(function () {});
    } catch (e) {}
  }
  function msField(k) {
    var v = MS_FIELDS && MS_FIELDS[k];
    return (typeof v === "string") ? v.trim() : "";
  }
  /* §2 COPY RULES — CAPITALIZE A NAME AT DISPLAY, NEVER THE STORED ROW.
     Capitalize ONLY a uniformly cased name: jennifer -> Jennifer, MARY -> Mary.
     ANY mix of upper and lower is LEFT ALONE — McAllister, JoAnne, de la Cruz
     and DeAngelo must come back untouched, and that is the half nobody can
     notice afterwards, because it only ever shows on a name that arrived right.
     ⚠ DO NOT REPLACE THIS WITH A BARE title-case. Lowercasing first destroys
     internal capitals and BREAKS NAMES THAT ARRIVED CORRECT.
     ⚠ A FOURTH COPY OF THIS RULE NOW EXISTS - bags-manage, shippo-track and
     dashboard-tool.js each carry their own. Different runtimes, so they cannot
     share; worth a diff if one is ever changed. Byte-identical to the
     dashboard-tool.js @2de9c4b version, which was unit-tested over 13 cases. */
  function displayName(v) {
    var str = String(v == null ? '' : v).trim();
    if (!str) return str;
    var hasUpper = /[A-Z]/.test(str), hasLower = /[a-z]/.test(str);
    if (hasUpper && hasLower) return str;   /* mixed = she meant it. Leave it alone. */
    return str.toLowerCase().replace(/(^|[\s\-'\u2019])([a-z])/g, function (m, sep, ch) {
      return sep + ch.toUpperCase();
    });
  }
  /* ⚠⚠ titleCase() WAS REMOVED AT S187, HER RULING, AND MUST NOT COME BACK.
     It was lowercase-everything-then-uppercase-word-starts — the damaging
     variant — and it ran on the shipping STREET and CITY on the confirmation
     screen, so a stored "1234 MCALLISTER ST" rendered "1234 Mcallister St".
     THE ADDRESS NOW PRINTS EXACTLY AS STORED, which is also what prints on the
     label. A Shippo-corrected address therefore shows in capitals: that is
     honest and it is her decision, not a regression. */
  function getMount() { return document.getElementById(MOUNT_ID); }
  function qp(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (e) { return null; }
  }
  function setHtml(html) { var m = getMount(); if (m) m.innerHTML = html; }

  // ---- cart from URL (the throwaway piece) ----------------------------------
  function parseCart() {
    var raw = qp("items");
    if (!raw) return null;
    var out = [], parts = raw.split(",");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var ci = p.indexOf(":"); if (ci < 0) return null;
      var sku = p.slice(0, ci).trim(), credit = p.slice(ci + 1).trim();
      if (!sku || !credit) return null;
      out.push({ sku: sku, credit_id: credit });
    }
    return out.length ? out : null;
  }

  // ---- editable-cart helpers (rev 6) ----------------------------------------
  function tierName(t) {
    t = String(t == null ? "" : t).toLowerCase();
    if (t === "essentials") return "Essentials";
    if (t === "elevated") return "Elevated";
    if (t === "special") return "Special";
    return t ? (t.charAt(0).toUpperCase() + t.slice(1)) : "Credit";
  }
  function currentCreditFor(sku) {
    if (!CART) return null;
    for (var i = 0; i < CART.length; i++) if (CART[i].sku === sku) return CART[i].credit_id;
    return null;
  }
  function setCreditFor(sku, credit) {
    if (!CART) return;
    for (var i = 0; i < CART.length; i++) if (CART[i].sku === sku) { CART[i].credit_id = credit; return; }
  }
  function writeCartUrl() {
    try {
      if (!CART) return;
      var raw = CART.map(function (c) { return c.sku + ":" + c.credit_id; }).join(",");
      var u = new URL(window.location.href);
      u.searchParams.set("items", raw);
      window.history.replaceState(null, "", u.toString());
    } catch (e) {}
  }
  // Group a line's credit_options into the choices the member actually sees:
  //   - selectable (not in_use_elsewhere) collapsed by tier+price to one row
  //     (representative = the currently-applied credit if it's in that group,
  //      else the soonest-expiring), sorted cheapest-first;
  //   - in-use-elsewhere kept separately for flag-and-keep display.
  // count = number of DISTINCT selectable choices (chip shows only when > 1).
  function optionRowsFor(line) {
    var opts = Array.isArray(line.credit_options) ? line.credit_options : [];
    var cur = currentCreditFor(line.sku);
    var inUse = [], free = [];
    opts.forEach(function (o) { (o.in_use_elsewhere ? inUse : free).push(o); });
    var groups = {};
    free.forEach(function (o) {
      var key = String(o.tier) + "|" + String(o.total_owed_cents);
      (groups[key] || (groups[key] = [])).push(o);
    });
    var reps = Object.keys(groups).map(function (key) {
      var g = groups[key];
      for (var i = 0; i < g.length; i++) if (g[i].credit_id === cur) return g[i];
      g.sort(function (a, b) { return String(a.expires_at) < String(b.expires_at) ? -1 : 1; });
      return g[0];
    });
    reps.sort(function (a, b) {
      return (Number(a.total_owed_cents) - Number(b.total_owed_cents)) || (Number(a.worth) - Number(b.worth));
    });
    return { reps: reps, inUse: inUse, count: reps.length };
  }

  // ---- CSS (ALL scoped under the mount id; KidSwaps palette only) -----------
  var ID = "#" + MOUNT_ID;
  var CSS = [
    // palette + container
    ID + "{",
    "  --ks-orange:#d24f28; --ks-orange-d:#b23f1f;",
    "  --ks-ink:#1f1a17; --ks-cream:#eeece1;",
    "  --ks-green:#54935f; --ks-gold:#e0a93f;",
    "  --ks-muted:#847b6f; --ks-line:#e0d9ca;",
    "  --ks-card:#f6f4ec;",
    "  --ks-green-d:#467a50;",
    "  --ks-chg-bg:#eeece1; --ks-chg-tx:#1f1a17;",
    "  max-width:560px; margin:0 auto; padding:24px 18px 64px; text-align:left;",
    "  font-family:Quicksand,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
    "  color:var(--ks-ink); -webkit-font-smoothing:antialiased; box-sizing:border-box;",
    "}",
    ID + " *{box-sizing:border-box;}",
    // coins (top-right)
    // bank (#ksc-bank = the future step-6 animation mount; coins are the static stand-in)
    ID + " #ksc-bank{display:flex; justify-content:flex-end; margin:0 0 18px;}",
    // ---- THE REAL COINS, PORTED FROM dashboard-tool.js @7d49e80 / dashboard.css
    // @91d836e (S217). The old .ksc-coin / .ksc-coins pill rules were DELETED, not left
    // inert (§0) - nothing wears those classes any more.
    // ⚠⚠ NOTHING IS SHARED WITH THE DASHBOARD. Its coin styling lives in dashboard.css;
    // this file injects all its CSS as a string array, so every rule below is a hand
    // copy. IF ONE SURFACE CHANGES, DIFF THE OTHER - they are two artifacts now.
    ID + " .ks-coins-row{display:flex; gap:0; align-items:flex-start;}",
    // ⚠ THE -15px OVERLAP SITS ON THE UNIT, NOT THE COIN, so coin + label + tiers shift
    // together as a column. The tier label's own 12px padding is what stops the second
    // coin's label sliding under the first's (dashboard.css S214).
    ID + " .ks-coin-unit{display:flex; flex-direction:column; align-items:center;}",
    ID + " .ks-coin-unit + .ks-coin-unit{margin-left:-15px;}",
    // ⚠⚠ THREE NUMBERS MOVE TOGETHER OR THE COINS BREAK: the 87px box, the 29px numeral
    // and the -15px overlap. The art is a 130px PNG, so the img rule is not optional.
    ID + " .ks-coin{width:87px; height:87px; position:relative;}",
    ID + " .ks-coin .ks-coin-img{width:100%; height:100%; display:block;}",
    // ⚠⚠ THE ENGRAVED NUMERAL IS THE ONLY SANCTIONED GOLD ON THIS COMPONENT (her S53
    // ruling, carried across). DO NOT restore an ink fill. It ships at opacity 0 and is
    // faded in by the tumble; the watchdog forces it visible if the spin never runs.
    ID + " .ks-coin .ks-coin-num{position:absolute; inset:0; font-family:Quicksand,sans-serif;",
    "  font-weight:600; font-size:29px; line-height:1; display:flex; align-items:center;",
    "  justify-content:center; color:#D9AF4A; opacity:0;",
    "  text-shadow:0 -1px 0 rgba(120,84,16,.55), 0 1px 0 rgba(255,250,222,.95);}",
    ID + " .ks-coin-label{font-size:.82rem; font-weight:700; color:var(--ks-ink); text-align:center; padding:0 12px;}",
    // tier breakdown - ALWAYS SHOWN, her S216 ruling. Empty when the class has no tiers,
    // and the reserve collapses so a zero coin holds no empty gap open.
    ID + " .ks-coin-tier{margin-top:6px; font-size:12px; line-height:1.7; color:var(--ks-muted);",
    "  display:flex; flex-direction:column; align-items:flex-start; width:fit-content;",
    "  margin-left:auto; margin-right:auto; padding:0 12px;}",
    ID + " .ks-tier-row{display:flex; align-items:center; gap:7px;}",
    ID + " .ks-dot{width:7px; height:7px; border-radius:50%; flex:none;}",
    // ⚠ ONE TIER LANGUAGE EVERYWHERE (her S213/S214 rulings): essentials green, elevated
    // blue, special brand yellow. These match dashboard.css and browse-tool.js. A change
    // here is a change on all three.
    ID + " .ks-dot--ess{background:#1F5C38;}",
    ID + " .ks-dot--elev{background:#28498D;}",
    ID + " .ks-dot--spec{background:#EDA920;}",
    // header / savings (all-left)
    ID + " .ksc-head{text-align:left; font-family:'Instrument Serif',Georgia,serif; font-weight:400; font-size:3.2rem; line-height:1.05; letter-spacing:-.01em; margin:0 0 8px; color:var(--ks-ink);}",
    ID + " .ksc-value{text-align:left; font-size:1.02rem; color:var(--ks-ink); margin:0 0 2px; font-weight:700;}",
    ID + " .ksc-sub{text-align:left; font-size:.92rem; color:var(--ks-muted); margin:0 0 20px; font-weight:500;}",
    // seal (KidSwaps green)
    ID + " .ksc-seal{display:flex; align-items:center; gap:9px; padding:2px 2px; margin:0 0 18px;}",
    ID + " .ksc-seal svg{flex:0 0 auto;}",
    ID + " .ksc-seal span{font-size:.95rem; color:var(--ks-green); font-weight:700;}",
    // item tiles (thumb + name + tag)
    ID + " .ksc-items{display:flex; flex-direction:column; gap:10px; margin:0 0 18px;}",
    ID + " .ksc-item{display:flex; align-items:center; gap:13px; background:var(--ks-card);",
    "  border:1px solid var(--ks-line); border-radius:12px; padding:12px 14px;}",
    ID + " .ksc-thumb{position:relative; flex:0 0 auto; width:54px; height:54px; border-radius:8px;",
    "  overflow:hidden; background:#ece5d6; border:1px solid var(--ks-line);}",
    ID + " .ksc-thumb img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover;}",
    ID + " .ksc-thumb .phsvg{position:absolute; inset:0; margin:auto; width:22px; height:22px; opacity:.35;}",
    ID + " .ksc-itemlink{display:flex; align-items:center; gap:13px; flex:1 1 auto; min-width:0; text-decoration:none; color:inherit;}",
    ID + " .ksc-itemlink:hover .nm{text-decoration:underline; text-underline-offset:2px; text-decoration-color:var(--ks-muted);}",
    ID + " .ksc-itemlink:hover .ksc-thumb{opacity:.88;}",
    ID + " .ksc-main{flex:1 1 auto; min-width:0;}",
    ID + " .ksc-main .nm{font-weight:700; font-size:.98rem; line-height:1.25; color:var(--ks-ink);}",
    ID + " .ksc-tag{flex:0 0 auto; text-align:right;}",
    ID + " .ksc-badge{display:inline-block; font-size:.78rem; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap;}",
    ID + " .ksc-badge.covered{background:var(--ks-green); color:#fff;}",
    ID + " .ksc-badge.charge{background:var(--ks-chg-bg); color:var(--ks-chg-tx);}",
    ID + " .ksc-fee{margin-top:4px; font-size:.86rem; font-weight:700; color:var(--ks-ink);}",
    ID + " .ksc-note{margin-top:3px; font-size:.76rem; color:var(--ks-muted);}",
    // summary
    ID + " .ksc-sum{border-top:1px solid var(--ks-line); padding-top:14px; margin:0 0 20px;}",
    ID + " .ksc-row{display:flex; justify-content:space-between; align-items:center; font-size:.95rem; padding:4px 0;}",
    ID + " .ksc-row .k{color:var(--ks-muted);}",
    ID + " .ksc-row.total{font-size:1.12rem; font-weight:700; padding-top:10px;}",
    ID + " .ksc-row.total .k{color:var(--ks-ink);}",
    ID + " .ksc-row.total span{color:var(--ks-ink);}",
    // shipping note: renders ONLY in the charged state (see renderReceipt).
    // Full-width sentence between the Shipping row and Total — not a .ksc-row
    // (it has no right-hand value), so it must not inherit the flex layout.
    ID + " .ksc-shipnote{font-size:.78rem; line-height:1.45; color:var(--ks-muted);",
    "  padding:2px 0 6px; max-width:44ch;}",
    // button + secure
    ID + " .ksc-btn{display:block; width:100%; border:0; cursor:pointer; background:var(--ks-orange);",
    "  color:#fff; font-weight:700; font-size:1.02rem; font-family:inherit; border-radius:50px;",
    "  padding:15px 18px; transition:background .15s;}",
    ID + " .ksc-btn:hover{background:var(--ks-orange-d);}",
    ID + " .ksc-secure{display:flex; align-items:center; justify-content:center; gap:7px; margin-top:11px; font-size:.8rem; color:var(--ks-muted);}",
    ID + " .ksc-stub{margin-top:12px; text-align:center; font-size:.78rem; color:var(--ks-orange);}",
    // block / failure / error screens — tight centered cluster
    ID + " .ksc-screen{display:flex; flex-direction:column; align-items:center; justify-content:center;",
    "  text-align:center; min-height:58vh; max-width:430px; margin:0 auto; padding:32px 16px;}",
    ID + " .ksc-screen .ic{width:54px; height:54px; margin:0 0 18px;}",
    ID + " .ksc-screen h2{font-family:'Instrument Serif',Georgia,serif; font-weight:400; font-size:2rem; line-height:1.1; margin:0 0 10px; color:var(--ks-ink); text-align:center;}",
    ID + " .ksc-screen p{font-size:.95rem; color:var(--ks-muted); line-height:1.5; margin:0 0 22px; text-align:center; font-weight:500;}",
    ID + " .ksc-screen .act{display:inline-block; background:var(--ks-orange); color:#fff; text-decoration:none;",
    "  font-weight:700; font-size:.95rem; border-radius:10px; padding:12px 22px; font-family:inherit;}",
    ID + " .ksc-screen .act.ghost{background:transparent; color:var(--ks-orange); border:1px solid var(--ks-line);}",
    // loading
    ID + " .ksc-load{display:flex; flex-direction:column; gap:12px; padding:8px 0;}",
    ID + " .ksc-skel{height:64px; border-radius:12px; background:linear-gradient(90deg,",
    "  rgba(31,26,23,.05) 25%,rgba(31,26,23,.025) 37%,rgba(31,26,23,.05) 63%); background-size:400% 100%;",
    "  animation:ksc-sh 1.3s ease infinite;}",
    "@keyframes ksc-sh{0%{background-position:100% 0}100%{background-position:0 0}}",
    // ---- editable cart (rev 6): chip + value-loss note + gate + modal --------
    ID + " .ksc-item-wrap{display:flex; flex-direction:column;}",
    ID + " .ksc-item-extra{display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:8px 14px 0;}",
    ID + " .ksc-chip{display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-family:inherit;",
    "  background:#faf8f2; border:1px solid var(--ks-line); border-radius:999px; padding:6px 13px;",
    "  font-size:.82rem; font-weight:700; color:var(--ks-ink);}",
    ID + " .ksc-chip:hover{border-color:var(--ks-gold);}",
    ID + " .ksc-chip .cv{color:var(--ks-orange); font-weight:700;}",
    ID + " .ksc-freehint{flex:1 1 100%; font-size:.78rem; font-weight:700; color:var(--ks-green); padding-top:2px;}",
    ID + " .ksc-vlnote{display:flex; align-items:flex-start; gap:6px; font-size:.78rem; line-height:1.35;",
    "  color:#9a6b12; font-weight:600; flex:1 1 220px; min-width:0;}",
    ID + " .ksc-vlconfirm{display:flex; align-items:flex-start; gap:10px; background:var(--ks-card);",
    "  border:1px solid var(--ks-gold); border-radius:12px; padding:12px 14px; margin:0 0 14px; cursor:pointer;}",
    ID + " .ksc-vlconfirm input{margin-top:1px; width:17px; height:17px; accent-color:var(--ks-green); flex:0 0 auto;}",
    ID + " .ksc-vlconfirm span{font-size:.86rem; line-height:1.4; color:var(--ks-ink); font-weight:600;}",
    ID + " .ksc-btn:disabled{background:#c9c2b8; cursor:not-allowed;}",
    ID + " .ksc-busy{opacity:.55; pointer-events:none;}",
    // modal (bottom-sheet on mobile, centered on desktop)
    ID + " .ksc-modal[hidden]{display:none;}",
    ID + " .ksc-modal{position:fixed; inset:0; z-index:99999; display:flex; align-items:flex-end; justify-content:center;}",
    ID + " .ksc-modal-bd{position:absolute; inset:0; background:rgba(31,26,23,.45);}",
    ID + " .ksc-modal-card{position:relative; width:100%; max-width:460px; background:#fbf9f2;",
    "  border:1px solid var(--ks-line); border-radius:18px 18px 0 0; padding:18px 18px 22px;",
    "  box-shadow:0 -8px 40px rgba(31,26,23,.18); max-height:82vh; overflow:auto;}",
    ID + " .ksc-modal-hd{display:flex; align-items:center; justify-content:space-between; margin:0 0 4px;}",
    ID + " .ksc-modal-hd .t{font-family:'Instrument Serif',Georgia,serif; font-weight:400; font-size:1.5rem; color:var(--ks-ink);}",
    ID + " .ksc-modal-hd .x{border:0; background:transparent; font-size:1.7rem; line-height:1; cursor:pointer; color:var(--ks-muted); font-family:inherit; padding:0 4px;}",
    ID + " .ksc-modal-item .mi-name{font-size:.86rem; font-weight:700; color:var(--ks-muted); margin:0 0 14px;}",
    ID + " .ksc-modal-opts{display:flex; flex-direction:column; gap:10px;}",
    ID + " .ksc-opt{display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;",
    "  text-align:left; font-family:inherit; cursor:pointer; background:#fff; border:1px solid var(--ks-line);",
    "  border-radius:12px; padding:13px 15px;}",
    ID + " .ksc-opt:hover{border-color:var(--ks-gold);}",
    ID + " .ksc-opt.is-current{border-color:var(--ks-green); border-width:2px; padding:12px 14px;}",
    ID + " .ksc-opt.is-disabled{cursor:default; background:var(--ks-card);}",
    ID + " .ksc-opt.is-disabled .ot{color:var(--ks-muted);}",
    ID + " .ksc-opt .ot{font-weight:700; font-size:.96rem; color:var(--ks-ink);}",
    ID + " .ksc-opt .osub{font-size:.76rem; color:var(--ks-muted); margin-top:3px; font-weight:600;}",
    ID + " .ksc-opt .free{font-weight:700; color:var(--ks-green); font-size:.96rem; white-space:nowrap;}",
    ID + " .ksc-opt .fee{font-weight:700; color:var(--ks-ink); font-size:.96rem; white-space:nowrap;}",
    ID + " .ksc-opt .curtag{display:block; margin-top:2px; font-size:.7rem; font-weight:700; color:var(--ks-green); text-align:right;}",
    ID + " .ksc-modal-ft{font-size:.76rem; color:var(--ks-muted); margin-top:14px; text-align:center; font-weight:500;}",
    "@media (max-width:600px){",
    // ⚠ THE MOBILE FLIP TO flex-start IS RETIRED - HER RULING S217. The coins sit TOP
    // RIGHT at every width, on both screens. Do not restore a left-align breakpoint.
    ID + " .ksc-head{font-size:2.5rem;}",
    ID + " .ksc-screen h2{font-size:1.75rem;}",
    "}",
    "@media (min-width:601px){",
    ID + " .ksc-modal{align-items:center;}",
    ID + " .ksc-modal-card{border-radius:18px; max-height:80vh;}",
    "}",
  ].join("\n");

  function injectCss() {
    if (document.getElementById("ks-checkout-css")) return;
    var s = document.createElement("style");
    s.id = "ks-checkout-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- inline SVGs ----------------------------------------------------------
  function shieldCheck() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 2l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5l7-3z" fill="#e0a93f" opacity=".22"/>' +
      '<path d="M12 2l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5l7-3z" stroke="#e0a93f" stroke-width="1.5"/>' +
      '<path d="M8.6 12.2l2.2 2.2 4.6-4.8" stroke="#e0a93f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function lockIcon() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none">' +
      '<rect x="5" y="11" width="14" height="9" rx="2" stroke="#8a8278" stroke-width="1.6"/>' +
      '<path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#8a8278" stroke-width="1.6"/></svg>';
  }
  function phSvg() {
    return '<svg class="phsvg" viewBox="0 0 24 24" fill="none">' +
      '<rect x="3" y="4" width="18" height="16" rx="2" stroke="#1f1a17" stroke-width="1.5"/>' +
      '<circle cx="8.5" cy="9.5" r="1.6" fill="#1f1a17"/>' +
      '<path d="M5 18l4.5-5 3 3 3-3.5L20 18" stroke="#1f1a17" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function bigIcon() {
    return '<svg class="ic" viewBox="0 0 56 56" fill="none">' +
      '<circle cx="28" cy="28" r="26" stroke="#d24f28" stroke-width="2"/>' +
      '<path d="M28 17v16" stroke="#d24f28" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="28" cy="39.5" r="1.6" fill="#d24f28"/></svg>';
  }
  function warnDot() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;margin-top:1px;">' +
      '<path d="M12 3l9 16H3L12 3z" stroke="#c9962a" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M12 10v4" stroke="#c9962a" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="12" cy="16.6" r=".9" fill="#c9962a"/></svg>';
  }

  // ---- thumbnail (only renders when a real image exists; hidden until then) --
  function thumbHtml(line) {
    var url = line.image_url || line.primary_photo_url || null;
    if (!url) return "";                       // no photo yet -> no empty box
    return '<div class="ksc-thumb">' + phSvg() +
      '<img src="' + esc(url) + '" alt="" onerror="this.remove()"></div>';
  }

  // ---- savings subline (locked bands + $0 celebration) ----------------------
  // ⚠ TAKES UPGRADE CENTS, *NOT* TOTAL CENTS. The param is named for what it
  // must receive: only an UPGRADE fee means the member's credit fell short of
  // the item. Shipping and extra-swap are NOT shortfalls (§2). Feeding this
  // total_cents is the bug fixed 2026-07-12 — do not "simplify" it back.
  function savingsSubline(upgradeCents, valueDollars) {
    if ((Number(upgradeCents) || 0) === 0) return { text: "Your credits covered it all", flat: false };
    var valueCents = Math.round((Number(valueDollars) || 0) * 100);
    if (valueCents <= 0) return { text: "Here's your swap", flat: true };
    var ratio = upgradeCents / valueCents;
    if (ratio <= 0.34) return { text: "Your credits covered most of it", flat: false };
    if (ratio <= 0.67) return { text: "Your credits covered the bulk of it", flat: false };
    return { text: "Here's your swap", flat: true };
  }

  // ---- coverage tile --------------------------------------------------------
  function tileFor(line) {
    var up = Number(line.upgrade_fee) || 0, ex = Number(line.extra_swap_fee) || 0;
    switch (line.coverage) {
      case "covered": return { cls: "covered", label: "Covered", fee: null, note: null };
      case "covered_extra": return { cls: "covered", label: "Covered", fee: ex ? "+" + money(ex) : null, note: "one extra this month" };
      case "upgrade": return { cls: "charge", label: "Credit applied", fee: money(up), extraFee: ex ? "+" + money(ex) : null, note: null };
      case "special_upgrade": return { cls: "charge", label: "Special credit applied", fee: money(up), extraFee: ex ? "+" + money(ex) : null, note: up <= 40 ? "designer find" : null };
      default: return { cls: "charge", label: "Credit applied", fee: (up || ex) ? money(up || ex) : null, note: null };
    }
  }

  // ==== THE COINS =============================================================
  // PORTED FROM dashboard-tool.js @7d49e80 (S217). #ksc-bank was always described as the
  // "stable mount for the step-6 animated bank"; this is that bank arriving.
  // ⚠⚠ THE DASHBOARD DOES NOT BUILD ITS OWN COIN MARKUP - the .ks-coin-unit elements are
  // authored in WEBFLOW and its script only paints into them. This file builds everything
  // as strings, so the markup below is NEW here and has no counterpart to diff against.
  // The animation, the frames and the timings ARE copies and must be diffed if either
  // surface changes.
  var COIN_FRAMES = [
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b690af665b710e72397_1.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69f8963de4ade9c6f3_2.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b690d55ec781cc518be_3.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b6915f14827ff280f72_4.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69d6108c2bd6c11b3f_5.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69f8963de4ade9c6f6_6.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69de57bb0d285396f3_7.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b691aee406df1bd0bda_8.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b693f83baa40803c070_9.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b697caae2e0fb664fee_10.png"
  ];
  // spin path: front(1) -> back(10) -> front(1); lands flat on frame 1 where the number sits
  var COIN_SPIN = [0,1,2,3,4,5,6,7,8,9,8,7,6,5,4,3,2,1,0];
  var COIN_STAGGER = 120;
  var COIN_REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var _coinPreload = COIN_FRAMES.map(function (u) { var im = new Image(); im.src = u; return im; });
  // ⚠ ONE SPIN PER PAGE LOAD - CLAUDE'S CALL, REVERSIBLE. The receipt re-renders whenever
  // she changes a credit, and re-spinning on every re-render is noise rather than a
  // moment. The numbers show the CURRENT bank, which a credit swap does not change.
  var _coinsSpun = false;

  // tier rows under a coin. Returns "" when the class holds nothing, which collapses the
  // reserve - a zero coin must not hold an empty gap open.
  function coinTierHTML(obj) {
    var order = [["essentials","Essential","Essentials","ks-dot--ess"],
                 ["elevated","Elevated","Elevated","ks-dot--elev"],
                 ["special","Special","Special","ks-dot--spec"]];
    var rows = [];
    order.forEach(function (t) {
      var n = parseFloat(obj && obj[t[0]]);
      if (!isNaN(n) && n > 0) {
        rows.push('<span class="ks-tier-row"><i class="ks-dot ' + t[3] + '"></i>' +
                  esc(String(n) + " " + (n === 1 ? t[1] : t[2])) + "</span>");
      }
    });
    return rows.join("");
  }

  // ⚠⚠ THE NUMBER IS THE CURRENT BANK, NOT A PROJECTED POST-ORDER BALANCE - HER RULING
  // S215. "0 left after this" is retired. Her reason: "we should always show what they
  // currently have. after their order is placed, theyll see their new balance on their
  // dashboard." Both figures ride the payload; read .now, never .after.
  function coinsHtml(bank, cap) {
    var bc = (bank && bank.by_class) || {};
    var bt = (bank && bank.by_class_tier) || {};
    var out = [];
    function coin(key, label) {
      var v = bc[key];
      var n = (v && v.now != null) ? v.now : 0;
      return '<div class="ks-coin-unit">' +
          '<div class="ks-coin">' +
            '<img class="ks-coin-img" src="' + COIN_FRAMES[0] + '" alt="">' +
            '<div class="ks-coin-num">' + esc(n) + "</div>" +
          "</div>" +
          '<div class="ks-coin-label">' + esc(label) + "</div>" +
          '<div class="ks-coin-tier">' + coinTierHTML(bt[key]) + "</div>" +
        "</div>";
    }
    if (cap && cap.clothing && Number(cap.clothing.limit) > 0) out.push(coin("clothing", "Clothes"));
    if (cap && cap.toy && Number(cap.toy.limit) > 0) out.push(coin("toy", "Toys"));
    if (!out.length) return "";
    return '<div id="ksc-bank"><div class="ks-coins-row">' + out.join("") + "</div></div>";
  }

  // Arm and spin whatever coins are on screen. Called AFTER setHtml, on both the receipt
  // and the confirmation screen.
  // ⚠⚠ THE FAILURE DIRECTION IS LOAD-BEARING, same as the dashboard's: the real number is
  // written into the markup FIRST and the animation only reveals it. Reduced motion, an
  // old browser or a dropped frame all end with the CORRECT NUMBER SITTING STILL. Failure
  // lands on "no animation", never on a blank coin.
  function armCoins() {
    var units = document.querySelectorAll("#ksc-bank .ks-coin-unit");
    if (!units.length) return;
    if (_coinsSpun || COIN_REDUCE) {
      units.forEach(function (u) {
        var n = u.querySelector(".ks-coin-num"); if (n) n.style.opacity = "1";
      });
      return;
    }
    _coinsSpun = true;
    var list = [];
    units.forEach(function (u) { u.style.visibility = "hidden"; list.push(u); });
    requestAnimationFrame(function () {
      list.forEach(function (u, i) { tumbleCoin(u, i * COIN_STAGGER); });
    });
    // WATCHDOG: a coin must never sit blank. Covers a dropped rAF or a backgrounded tab.
    setTimeout(function () {
      list.forEach(function (u) {
        u.style.visibility = "visible";
        var n = u.querySelector(".ks-coin-num");
        if (n && n.style.opacity !== "1") n.style.opacity = "1";
      });
    }, 1500);
  }

  function tumbleCoin(unit, delay) {
    var coin = unit.querySelector(".ks-coin");
    var img  = unit.querySelector(".ks-coin-img");
    var num  = unit.querySelector(".ks-coin-num");
    if (!coin || !img || !num) return;
    setTimeout(function () {
      unit.style.visibility = "visible";        // the coin appears WITH its spin, never before
      if (coin.animate) {                       // vertical drop-in + settle bounce
        coin.animate([
          { transform: "translateY(-24px)", opacity: 0.4 },
          { transform: "translateY(0)",     opacity: 1, offset: 0.55 },
          { transform: "translateY(-6px)",  offset: 0.72 },
          { transform: "translateY(0)",     offset: 0.86 },
          { transform: "translateY(-2px)",  offset: 0.94 },
          { transform: "translateY(0)" }
        ], { duration: 650, easing: "ease-out" });
      }
      var i = 0;                                // spin the frames 1 -> 10 -> 1
      var spin = setInterval(function () {
        img.src = COIN_FRAMES[COIN_SPIN[i]];
        i++;
        if (i >= COIN_SPIN.length) { clearInterval(spin); img.src = COIN_FRAMES[0]; }
      }, 26);
      setTimeout(function () {                  // number fades in on the flat face
        num.style.transition = "opacity 200ms ease-out";
        num.style.opacity = "1";
      }, 460);
    }, delay || 0);
  }

  // ---- receipt --------------------------------------------------------------
  function renderReceipt(p) {
    LAST_PREVIEW = p;   // success screen reads items / value_of_items / bank-after from here
    var lines = Array.isArray(p.lines) ? p.lines : [];
    // ⚠ HER APPROVED COPY, S215/S216, BOTH BRANCHES: "Your swaps are ready, Olivia." and
    // "Your swap is ready, Olivia." Her reason for the singular: it is always one order at
    // a time. Falls back to the bare line with no trailing period when no name is on file.
    // ⚠⚠ USE THE displayName() ALREADY IN THIS FILE. Do not add a second casing helper and
    // do not reach for the deleted titleCase() - it lowercases first and breaks McAllister.
    var head = lines.length === 1 ? "Your swap is ready" : "Your swaps are ready";
    var headName = displayName(msField("first-name"));
    if (headName) head += ", " + headName + ".";
    var value = Number(p.value_of_items) || 0;
    var totalCents = (p.fees && Number(p.fees.total_cents)) || 0;

    // COVERAGE SUBLINE feeds off UPGRADE FEES ONLY — never total_cents (§2, §1 bug 2).
    // total_cents = upgrade + extra-swap + SHIPPING. Only the UPGRADE fee is a credit
    // shortfall. Extra-swap is a QUANTITY fee (she still had to hold a credit to use
    // it) and shipping is a LOGISTICS fee — neither says her credit fell short. The
    // tile already knew this: an over-cap item renders "Covered" with a +$5 beside it.
    // UNITS: fees.upgrade_total is DOLLARS (claims-native); savingsSubline wants CENTS.
    var upgradeCents = Math.round(((p.fees && Number(p.fees.upgrade_total)) || 0) * 100);
    var sub = savingsSubline(upgradeCents, value);

    // keep the rendered lines for modal open + count value-loss lines
    LAST_LINES = {};
    var vlCount = 0;
    lines.forEach(function (l) { LAST_LINES[l.sku] = l; if (l.value_loss) vlCount++; });

    var itemsHtml = lines.map(function (ln) {
      var t = tileFor(ln);
      var tag = '<span class="ksc-badge ' + t.cls + '">' + esc(t.label) + "</span>";
      if (t.fee) tag += '<div class="ksc-fee">' + esc(t.fee) + "</div>";
      if (t.extraFee) tag += '<div class="ksc-fee">' + esc(t.extraFee) + '</div><div class="ksc-note">one extra this month</div>';
      if (t.note) tag += '<div class="ksc-note">' + esc(t.note) + "</div>";
      var href = "/browse?sku=" + encodeURIComponent(ln.sku);
      var tile =
        '<div class="ksc-item">' +
          '<a class="ksc-itemlink" href="' + esc(href) + '" target="_blank" rel="noopener">' +
            thumbHtml(ln) +
            '<div class="ksc-main"><div class="nm">' + esc(ln.item_name || ln.sku) + "</div></div>" +
          "</a>" +
          '<div class="ksc-tag">' + tag + "</div>" +
        "</div>";

      // editable-cart extras: change-credit chip (only when a real choice exists)
      // + a value-loss note (applied credit outranks the item).
      var info = optionRowsFor(ln);
      var appliedTier = tierName(ln.credit_applied && ln.credit_applied.tier);
      var extras = "";
      if (info.count > 1) {
        extras += '<button type="button" class="ksc-chip" data-sku="' + esc(ln.sku) + '">' +
          "Using " + esc(appliedTier) + " credit" +
          '<span class="cv">Change \u25be</span></button>';
        // free-hint: this line is charging a fee AND a $0 credit option exists
        // -> surface the no-cost choice (the value-loss confirm still backstops it).
        var lineFee = (Number(ln.upgrade_fee) || 0) + (Number(ln.extra_swap_fee) || 0);
        var hasFree = info.reps.some(function (r) { return Number(r.total_owed_cents) === 0; });
        if (lineFee > 0 && hasFree) {
          extras += '<div class="ksc-freehint">Free option available \u2014 tap Change</div>';
        }
      }
      if (ln.value_loss) {
        var vlMsg = info.count > 1
          ? "Using your " + appliedTier + " credit here. Tap Change to use a smaller one."
          : "Using your " + appliedTier + " credit. It's your only match for this item.";
        extras += '<div class="ksc-vlnote">' + warnDot() + "<span>" + esc(vlMsg) + "</span></div>";
      }
      var extraRow = extras ? '<div class="ksc-item-extra">' + extras + "</div>" : "";
      return '<div class="ksc-item-wrap">' + tile + extraRow + "</div>";
    }).join("");

    var ship = (p.fees && p.fees.shipping) || { state: "included", amount_cents: 0 };
    var shipVal = ship.state === "charged" ? moneyc(ship.amount_cents) : "Included";

    // SHIPPING NOTE — gated to state==="charged" ON PURPOSE (§1 bug 1, §5).
    // The fn sends a note in BOTH states and they are different animals: the
    // INCLUDED note is the LABEL "Shipping — Included" (the row above already
    // says that — rendering it would print the same fact twice, stacked), while
    // the CHARGED note is the real round-trip explanation. Only the charged
    // state carries information the row doesn't already have.
    var shipNote = (ship.state === "charged" && ship.note)
      ? '<div class="ksc-shipnote">' + esc(ship.note) + "</div>"
      : "";

    var summary =
      '<div class="ksc-sum">' +
        '<div class="ksc-row"><span class="k">Shipping</span><span>' + esc(shipVal) + "</span></div>" +
        shipNote +
        '<div class="ksc-row total"><span class="k">Total today</span><span>' + moneyc(totalCents) + "</span></div>" +
      "</div>";

    // value-loss confirm gate: acknowledge before Confirm enables
    var vlGate = vlCount > 0
      ? '<label class="ksc-vlconfirm"><input type="checkbox" id="ksc-vlack">' +
        "<span>" + (vlCount > 1 ? "Some swaps use" : "One swap uses") +
        " a higher-value credit than the item needed. I\u2019m good with that.</span></label>"
      : "";

    var btnLabel = totalCents > 0 ? "Confirm swap \u00b7 " + moneyc(totalCents) : "Confirm swap";

    // modal scaffold (populated on chip tap; hidden until then)
    var modalHtml =
      '<div class="ksc-modal" id="ksc-modal" hidden>' +
        '<div class="ksc-modal-bd" data-close></div>' +
        '<div class="ksc-modal-card" role="dialog" aria-modal="true" aria-label="Choose a credit">' +
          '<div class="ksc-modal-hd"><div class="t">Choose a credit</div>' +
            '<button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>' +
          '<div class="ksc-modal-item" id="ksc-modal-item"></div>' +
          '<div class="ksc-modal-opts" id="ksc-modal-opts"></div>' +
          '<div class="ksc-modal-ft">Prices update the moment you choose.</div>' +
        "</div>" +
      "</div>";

    setHtml(
      coinsHtml(p.bank, p.cap) +
      '<h1 class="ksc-head">' + esc(head) + "</h1>" +
      '<p class="ksc-value">Worth about ' + moneyRound(value) + " new</p>" +
      '<p class="ksc-sub">' + esc(sub.text) + "</p>" +
      '<div class="ksc-seal">' + shieldCheck() + "<span>Every piece meets The Closet Standard</span></div>" +
      '<div class="ksc-items">' + itemsHtml + "</div>" +
      summary +
      vlGate +
      '<button class="ksc-btn" id="ksc-confirm" type="button">' + esc(btnLabel) + "</button>" +
      '<div class="ksc-secure">' + lockIcon() + "<span>Secured by Stripe</span></div>" +
      modalHtml
    );

    armCoins();
    wireReceipt(vlCount > 0);
  }

  // ---- editable-cart wiring + modal (rev 6) ---------------------------------
  function wireReceipt(needsAck) {
    var btn = document.getElementById("ksc-confirm");
    if (btn) {
      if (needsAck) btn.disabled = true;
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        commitSwap(btn);
      });
    }
    var ack = document.getElementById("ksc-vlack");
    if (ack && btn) ack.addEventListener("change", function () { btn.disabled = !ack.checked; });

    // chips -> open modal
    var chips = document.querySelectorAll("#" + MOUNT_ID + " .ksc-chip");
    Array.prototype.forEach.call(chips, function (c) {
      c.addEventListener("click", function () { openModal(c.getAttribute("data-sku")); });
    });

    // modal close (backdrop / × / any [data-close]) — nodes are fresh each render
    var modal = document.getElementById("ksc-modal");
    if (modal) modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });

    // option select (delegated on the fresh opts container)
    var optsEl = document.getElementById("ksc-modal-opts");
    if (optsEl) optsEl.addEventListener("click", function (e) {
      var b = e.target.closest(".ksc-opt[data-credit]");
      if (!b) return;
      var credit = b.getAttribute("data-credit");
      var sku = MODAL_SKU;
      closeModal();
      if (!sku || !credit) return;
      if (credit === currentCreditFor(sku)) return;   // picked the current one -> no-op
      setCreditFor(sku, credit);
      IDEM_KEY = null;   // cart changed -> new order identity (avoids a stale key replaying)
      writeCartUrl();
      refreshPreview();
    });
  }

  function optHtml(o, isCurrent) {
    var price = Number(o.total_owed_cents) === 0
      ? '<span class="free">Free</span>'
      : '<span class="fee">+' + moneyc(o.total_owed_cents) + "</span>";
    var subs = [];
    if (o.value_loss) subs.push("uses a higher-value credit");
    if (o.is_soonest) subs.push("soonest to expire");
    var sub = subs.length ? '<div class="osub">' + esc(subs.join(" \u00b7 ")) + "</div>" : "";
    var cur = isCurrent ? '<span class="curtag">Current</span>' : "";
    return '<button type="button" class="ksc-opt' + (isCurrent ? " is-current" : "") + '" data-credit="' + esc(o.credit_id) + '">' +
      '<div class="ol"><div class="ot">' + esc(tierName(o.tier)) + " credit</div>" + sub + "</div>" +
      '<div class="orr">' + price + cur + "</div></button>";
  }
  function inUseHtml(o) {
    return '<div class="ksc-opt is-disabled">' +
      '<div class="ol"><div class="ot">' + esc(tierName(o.tier)) + " credit</div>" +
      '<div class="osub">In use on ' + esc(o.in_use_on_sku || "another item") + "</div></div>" +
      '<div class="orr"></div></div>';
  }
  function openModal(sku) {
    var line = LAST_LINES[sku];
    if (!line) return;
    MODAL_SKU = sku;
    var itemEl = document.getElementById("ksc-modal-item");
    if (itemEl) itemEl.innerHTML = '<div class="mi-name">' + esc(line.item_name || sku) + "</div>";
    var info = optionRowsFor(line);
    var cur = currentCreditFor(sku);
    var html = info.reps.map(function (o) { return optHtml(o, o.credit_id === cur); }).join("") +
      info.inUse.map(inUseHtml).join("");
    var optsEl = document.getElementById("ksc-modal-opts");
    if (optsEl) optsEl.innerHTML = html;
    var modal = document.getElementById("ksc-modal");
    if (modal) modal.hidden = false;
  }
  function closeModal() {
    MODAL_SKU = null;
    var modal = document.getElementById("ksc-modal");
    if (modal) modal.hidden = true;
  }

  async function refreshPreview() {
    var m = getMount();
    var btn = document.getElementById("ksc-confirm");
    if (btn) { btn.disabled = true; btn.textContent = "Updating\u2026"; }
    if (m) m.classList.add("ksc-busy");
    var token = getToken();
    if (!token) { if (m) m.classList.remove("ksc-busy"); renderError("Please log in to check out."); return; }
    try {
      var res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ms-token": token },
        body: JSON.stringify({ commit: false, items: CART }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (m) m.classList.remove("ksc-busy");
      route(data, res.status);
    } catch (e) {
      if (m) m.classList.remove("ksc-busy");
      renderError("We couldn't update your bag. Please try again.");
    }
  }

  // ---- commit (Confirm) -----------------------------------------------------
  async function commitSwap(btn) {
    var m = getMount();
    var token = getToken();
    if (!token) { renderError("Please log in to check out."); return; }
    if (!IDEM_KEY) IDEM_KEY = newIdemKey();   // one identity per unchanged cart (double-tap / retry safe)
    var restore = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Placing your swap\u2026"; }
    if (m) m.classList.add("ksc-busy");
    try {
      var res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ms-token": token },
        body: JSON.stringify({ commit: true, items: CART, idempotency_key: IDEM_KEY }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (m) m.classList.remove("ksc-busy");
      route(data, res.status);   // success -> renderSuccess; every failure -> existing screens
    } catch (e) {
      if (m) m.classList.remove("ksc-busy");
      if (btn) { btn.disabled = false; btn.textContent = restore; }
      renderError("We couldn't reach checkout. Your bag is saved \u2014 please try again.");
    }
  }

  // ---- success (commit ok) --------------------------------------------------
  function renderSuccess(commit) {
    var p = LAST_PREVIEW || {};
    var lines = Array.isArray(p.lines) ? p.lines : [];
    var value = Number(p.value_of_items) || 0;
    var charged = Number(commit && commit.charged_cents) || 0;
    var shipCents = Number(commit && commit.shipping_cents) || 0;

    var icCheck = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    var icTruck = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/></svg>';
    var icMail = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>';

    var itemsHtml = lines.map(function (ln) {
      return '<div class="ksc-item" style="padding:10px 12px; margin-bottom:8px;">' +
        thumbHtml(ln) +
        '<div class="ksc-main"><div class="nm">' + esc(ln.item_name || ln.sku) + "</div></div>" +
      "</div>";
    }).join("");

    var payLine = charged === 0
      ? '<div style="display:flex; align-items:center; gap:9px; color:var(--ks-green); font-weight:700;">' + icCheck + "<span>No charge, covered by your credits</span></div>"
      : '<div style="display:flex; align-items:center; gap:9px; color:var(--ks-ink); font-weight:700;">' + icCheck + "<span>" + esc(moneyc(charged)) + " charged to your card</span></div>";
    var shipLine = '<div style="display:flex; align-items:center; gap:9px; color:var(--ks-muted);">' + icTruck +
      "<span>" + (shipCents > 0 ? "Shipping " + esc(moneyc(shipCents)) : "Shipping included") + "</span></div>";
    var mailLine = '<div style="display:flex; align-items:center; gap:9px; color:var(--ks-muted);">' + icMail +
      "<span>We\u2019ll email tracking when it ships</span></div>";

    // lifetime saved: render ONLY if the payload carries it (not wired yet -> hidden, never blocks)
    var lifetime = (p.lifetime && p.lifetime.saved_dollars != null) ? Number(p.lifetime.saved_dollars) : null;
    var lifetimeBlock = (lifetime != null)
      ? '<div style="border-top:1px solid var(--ks-line); margin-top:11px; padding-top:9px;">' +
          '<div style="font-size:1.05rem; font-weight:700; color:var(--ks-orange); line-height:1.1;">' + esc(moneyRound(lifetime)) + "</div>" +
          '<div style="font-size:.74rem; color:var(--ks-muted); margin-top:3px;">Saved with KidSwaps so far</div></div>'
      : "";

    function step(label, active) {
      var dot = active
        ? '<div style="width:16px; height:16px; border-radius:50%; background:var(--ks-orange); margin:0 auto 6px;"></div>'
        : '<div style="width:16px; height:16px; border-radius:50%; background:var(--ks-cream); border:2px solid var(--ks-line); box-sizing:border-box; margin:0 auto 6px;"></div>';
      var tx = active ? "color:var(--ks-ink); font-weight:700;" : "color:var(--ks-muted);";
      return '<div style="position:relative; text-align:center; flex:1;">' + dot +
        '<span style="font-size:.7rem; ' + tx + '">' + esc(label) + "</span></div>";
    }
    var timeline =
      '<div style="background:var(--ks-card); border:1px solid var(--ks-line); border-radius:12px; padding:15px 14px; margin:12px 0;">' +
        '<div style="display:flex; justify-content:space-between; position:relative;">' +
          '<div style="position:absolute; top:7px; left:16%; right:16%; height:2px; background:var(--ks-line);"></div>' +
          step("Confirmed", true) + step("Shipped", false) + step("Delivered", false) +
        "</div>" +
      "</div>";

    // savings = retail total (value_of_items); full-width gold; hidden when the retail figure is missing/0 so we never show "$0"
    var savingsBlock = (value > 0)
      ? '<div style="background:var(--ks-card); border:1px solid var(--ks-line); border-radius:12px; padding:16px; margin-bottom:14px; text-align:center;">' +
          '<div style="font-size:2.1rem; font-weight:700; color:var(--ks-gold); line-height:1;">' + esc(moneyRound(value)) + "</div>" +
          '<div style="font-size:.8rem; color:var(--ks-ink); margin-top:5px;">What you\u2019d pay for these new</div>' +
        "</div>"
      : "";
    // ⚠⚠⚠ "The more you send, the more you earn" IS DELETED OUTRIGHT - HER RULING S215,
    // "just lose it." Heading and sub, both gone. Do NOT reposition it, restyle it, or
    // move it below the coins. She saw the placement problem and chose removal over
    // restyling, superseding her own "can be styled more" earlier in the same session.
    // ⚠ THE CARD AND ITS BORDER WENT WITH IT: the band existed to hold two things side by
    // side, and a bordered box around a lone right-aligned coin row is a frame around
    // nothing. #ksc-bank already carries justify-content:flex-end.
    // ⚠⚠ ON THIS SCREEN THE BALANCE IS GENUINELY ZERO - she has just spent the credits -
    // and the tier line is empty with it. THAT IS THE REAL RENDER AND SHE HAS ACCEPTED IT
    // (S216: "i want her to know her balance"). Do not hide the coins to avoid a zero.
    var bankBandHtml = '<div style="margin:6px 0 10px;">' + coinsHtml(p.bank, p.cap) + "</div>";

    // greet by name when present; count-neutral, drops cleanly to "You're all set." with no fallback word
    var firstName = displayName(msField("first-name"));
    var headline = firstName ? ("You\u2019re all set, " + esc(firstName) + ".") : "You\u2019re all set.";

    // order number = first 8 hex of the idempotency key (per-checkout identity; exact-match lookup on claim_idempotency PK)
    var orderNo = IDEM_KEY ? ("#" + String(IDEM_KEY).replace(/-/g, "").slice(0, 8).toUpperCase()) : "";
    var orderNoHtml = orderNo
      ? '<div style="margin:0 0 14px;"><span style="display:inline-block; background:#efe6d3; color:#6b6152; font-size:.75rem; font-weight:700; letter-spacing:.02em; padding:4px 11px; border-radius:20px;">Order ' + esc(orderNo) + "</span></div>"
      : "";

    // shipping-to (Memberstack customFields; render only when a street is on file; apartment line only when present)
    var shStreet = msField("shipping-street");
    var shApt    = msField("shipping-apartment-or-unit");
    var shCity   = msField("shipping-city");
    var shState  = msField("shipping-state");
    var shZip    = msField("shipping-zip");
    var shName   = [displayName(msField("first-name")), displayName(msField("last-name"))].filter(Boolean).join(" ");
    var cityStateZip = "";
    if (shCity || shState || shZip) {
      cityStateZip = shCity;
      if (shState) cityStateZip += (cityStateZip ? ", " : "") + shState.toUpperCase();
      if (shZip)   cityStateZip += (cityStateZip ? " " : "") + shZip;
    }
    var shipToHtml = shStreet
      ? '<div style="border-top:1px solid var(--ks-line); margin-top:14px; padding-top:12px;">' +
          '<div style="font-weight:700; font-size:1rem; color:var(--ks-ink); margin-bottom:6px;">Shipping to</div>' +
          '<div style="font-size:.9rem; color:var(--ks-muted); line-height:1.6;">' +
            (shName ? esc(shName) + "<br>" : "") +
            esc(shStreet) + "<br>" +
            (shApt ? esc(shApt) + "<br>" : "") +
            (cityStateZip ? esc(cityStateZip) : "") +
          "</div>" +
        "</div>"
      : "";

    setHtml(
      bankBandHtml +
      '<div style="background:var(--ks-card); border:1px solid var(--ks-line); border-radius:12px; padding:16px; margin:6px 0 12px;">' +
        '<h1 class="ksc-head" style="font-size:2.4rem; margin:0 0 2px;">' + headline + "</h1>" +
        orderNoHtml +
        itemsHtml +
        '<div style="border-top:1px solid var(--ks-line); margin-top:6px; padding-top:12px; display:flex; flex-direction:column; gap:8px; font-size:.9rem;">' +
          payLine + shipLine + mailLine +
        "</div>" +
        shipToHtml +
        // ⚠⚠ THE THANK-YOU PANEL IS FIVE COLOUR VALUES AND ALL FIVE MOVED - HER RULING
        // S216, off a rendered mockup. Was: fill #f4e3d9, circle #e9c9b8, leaf #c0491f,
        // heading ink, body #8a5f4d. Now her brand green #309359 with cream #EEEFE3 text,
        // the circle a WHITE TINT over the fill (not a second green - #2A7F4C was Claude's
        // invention and she withdrew it: "my green shade has always been 309359"), and the
        // leaf cream.
        // ⚠⚠⚠ THIS KNOWINGLY REVERSES HER OWN S72/S73 RULE - "any green background takes
        // white text ... DARKEN THE GREEN, NEVER WHITEN THE TEXT" - FOR THIS ELEMENT ONLY.
        // Cream reads ~3.5 on #309359 and white 3.86, both UNDER the 4.5 AA bar for the
        // small body line. SHE CHOSE IT HAVING SEEN IT RENDER, which beats the
        // measurement. The rule still binds /signup's toy card, and #1F5C38 remains the
        // DASHBOARD's green - two greens, deliberately. DO NOT "correct" this back.
        '<div style="background:#309359; border-radius:12px; padding:15px; margin-top:14px; display:flex; gap:12px; align-items:flex-start;">' +
          '<div style="flex-shrink:0; width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,.18); color:#EEEFE3; display:flex; align-items:center; justify-content:center;"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg></div>' +
          '<div>' +
            '<div style="font-weight:700; font-size:1.05rem; color:#EEEFE3; margin-bottom:4px;">Thank you for swapping</div>' +
            '<div style="font-size:.88rem; color:#EEEFE3; line-height:1.55;">You chose a new way to shop for your kids, and gave good things a second life.</div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      timeline +
      savingsBlock +
      '<div style="display:flex; gap:8px;">' +
        '<a class="ksc-btn" href="/dashboard" style="flex:1; width:auto; font-size:.9rem; padding:14px 10px; text-decoration:none; text-align:center; box-sizing:border-box;">Go to my dashboard</a>' +
        '<a href="/browse" style="flex:1; box-sizing:border-box; text-align:center; background:transparent; color:var(--ks-orange); border:1px solid var(--ks-line); border-radius:50px; padding:14px 10px; font-weight:700; font-size:.9rem; text-decoration:none;">Keep browsing</a>' +
      "</div>"
    );

    armCoins();
  }

  // ---- block / failure / error / loading ------------------------------------
  function renderBlock(reason, note) {
    var title = BLOCK_TITLE[reason] || "Just a moment";
    var copy = note || BLOCK_COPY[reason] || "This isn't available right now.";
    var cta = BLOCK_CTA[reason] || { label: "Go to dashboard", href: "/dashboard" };
    setHtml('<div class="ksc-screen">' + bigIcon() + "<h2>" + esc(title) + "</h2><p>" + esc(copy) + "</p>" +
      '<a class="act" href="' + esc(cta.href) + '">' + esc(cta.label) + "</a></div>");
  }
  function renderFailure(failure, note) {
    var title = FAILURE_TITLE[failure] || "Something needs a look";
    var copy = note || FAILURE_COPY[failure] || "Something went wrong. Nothing was charged. Your bag is saved.";
    // off_plan gets a plan-upgrade CTA (primary -> /pricing), browsing as the ghost fallback.
    // item_taken ALSO gets a dashboard CTA (2026-07-12c): its copy tells a member who just
    // placed an order to CHECK HER DASHBOARD, and the only button on screen said "Back to
    // browsing." A screen that gives an instruction with no way to follow it is the same
    // dead end the copy rewrite was meant to remove. Found by LOOKING at the rendered page,
    // not by reading the string (§0). Both stay GHOST on purpose: a solid pill here would
    // invent a new primary action on a failure screen (§DASH.2 fourth-coral tripwire).
    var cta;
    if (failure === "off_plan") {
      cta = '<a class="act" href="/pricing">See our plans</a>' +
        '<a class="act ghost" href="/browse" style="margin-top:8px;">Back to browsing</a>';
    } else if (failure === "item_taken") {
      cta = '<a class="act ghost" href="/browse">Back to browsing</a>' +
        '<a class="act ghost" href="/dashboard" style="margin-top:8px;">Go to my dashboard</a>';
    } else {
      cta = '<a class="act ghost" href="/browse">Back to browsing</a>';
    }
    setHtml('<div class="ksc-screen">' + bigIcon() + "<h2>" + esc(title) + "</h2><p>" + esc(copy) + "</p>" +
      cta + "</div>");
  }
  function renderError(msg) {
    setHtml('<div class="ksc-screen">' + bigIcon() + "<h2>We hit a snag</h2><p>" +
      esc(msg || "Please try again in a moment.") + "</p>" +
      '<a class="act ghost" href="/browse">Back to browsing</a></div>');
  }
  function renderLoading() {
    setHtml('<div class="ksc-load"><div class="ksc-skel"></div><div class="ksc-skel"></div><div class="ksc-skel"></div></div>');
  }

  function friendlyError(code) {
    switch (code) {
      case "no_token": case "invalid_token": return "Please log in to check out.";
      case "not_authorized": return "This checkout isn't open to your account yet.";
      case "empty_cart": return "Your bag is empty.";
      case "member_not_found": return "We couldn't find your membership. Please log in again.";
      default: return "Please try again in a moment.";
    }
  }

  // ---- celebration burst (decorative only; never load-bearing) --------------
  function ksConfetti() {
    if (typeof window.confetti !== "function") return;   // library absent -> silent no-op
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var KS = ["#E54F25", "#EDA920", "#309359", "#1C4A91", "#F491A9"];
    window.confetti({ particleCount: 70, angle: 60,  spread: 60, startVelocity: 55, origin: { x: 0, y: 0.9 }, colors: KS, zIndex: 9999 });
    window.confetti({ particleCount: 70, angle: 120, spread: 60, startVelocity: 55, origin: { x: 1, y: 0.9 }, colors: KS, zIndex: 9999 });
  }

  function route(data, status) {
    if (data && data.ok === true && data.mode === "preview") { renderReceipt(data); return; }
    if (data && data.ok === true && Array.isArray(data.claim_ids)) {
      try { sessionStorage.removeItem('ksBag'); } catch (e) {}  // clear browse bag on confirmed commit (hygiene, §1)
      renderSuccess(data);
      try { ksConfetti(); } catch (e) {}                        // celebration burst; decorative, never blocks the screen
      return;
    }
    if (data && data.can_claim === false && data.block_reason) { renderBlock(data.block_reason, data.note); return; }
    if (data && data.failure) { renderFailure(data.failure, data.note); return; }
    if (status === 401 || status === 403) { renderError(friendlyError(data && data.error)); return; }
    renderError(data && data.error ? friendlyError(data.error) : null);
  }

  function handleStateOverride() {
    var st = qp("state");
    if (!st) return false;
    if (BLOCK_COPY.hasOwnProperty(st)) { renderBlock(st, null); return true; }
    if (st === "cancelled") { renderBlock("cancelled_ended", null); return true; }
    if (st === "pending") { renderBlock("pending_first_bag", null); return true; }
    if (FAILURE_COPY.hasOwnProperty(st)) { renderFailure(st, null); return true; }
    if (st === "error") { renderError(null); return true; }
    if (st === "loading") { renderLoading(); return true; }
    return false;
  }

  async function run() {
    injectCss();
    loadMsFields();   // fire-and-forget; resolves well before the success screen (renderSuccess reads MS_FIELDS synchronously)
    if (!getMount()) return;
    if (handleStateOverride()) return;

    var items = parseCart();
    if (!items) { renderError("Your bag link looks off. Head back and add items again."); return; }
    CART = items;   // mutable source of truth for credit changes (rev 6)

    renderLoading();
    var token = getToken();
    if (!token) { renderError("Please log in to check out."); return; }

    try {
      var res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ms-token": token },
        body: JSON.stringify({ commit: false, items: CART }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      route(data, res.status);
    } catch (e) {
      renderError("We couldn't load your bag. Please try again.");
    }
  }

  // close the credit modal on Escape (attached once at module load)
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.keyCode === 27) {
      var m = document.getElementById("ksc-modal");
      if (m && !m.hidden) closeModal();
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
