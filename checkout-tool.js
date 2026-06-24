/* ==========================================================================
 * KidSwaps V4 — checkout-tool.js  (§9.3 step 5: the plain page)
 * --------------------------------------------------------------------------
 * Renders the member-facing checkout from the checkout Edge Fn's commit=false
 * PREVIEW payload (proven 2026-06-24e). This pass:
 *   - parseCart()  reads ?items=SKU:credit_id,SKU:credit_id  (the ONE throwaway
 *     piece — the browse "Add to bag" + credit-selection that will populate this
 *     contract are separate later builds; everything below parseCart is real).
 *   - ?state=<x>   client-side override to paint block/failure screens with NO
 *     fetch (mirrors the dashboard greeting ?state= QA pattern).
 *   - ONE fetch with commit:false → renders header / savings / coverage tiles /
 *     summary / coins / Closet-Standard seal / secure line, OR a block screen,
 *     OR a failure screen. Charges/writes NOTHING.
 *   - The Confirm button is a LOGGED NO-OP this pass. commit:true is flipped on
 *     LAST, after every render path is proven charging/writing nothing.
 *
 * Design locked 2026-06-24e (§9 DISPLAY DIRECTION). Coins are static readouts
 * here; jingle/tap-for-balance = step 6.
 *
 * Deploy seam (same as browse/listing): GitHub edit → raw-verify at SHA →
 * footer pin bump → publish → Empty-Cache-and-Hard-Reload → confirm build stamp.
 * ========================================================================== */
(function () {
  "use strict";

  var thisScript = document.currentScript;

  // ---- build stamp (parse @sha from own <script src>; never hardcode) -------
  (function stamp() {
    try {
      var src = (thisScript && thisScript.src) || "";
      var m = src.match(/@([0-9a-f]{7,40})\//);
      var sha = m ? m[1] : "unknown";
      console.log("[ks-checkout] build " + sha + " " + src);
    } catch (e) { /* never break the app over a log line */ }
  })();

  // ---- config ---------------------------------------------------------------
  var FN_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/checkout";
  var MOUNT_ID = "ks-checkout-app";

  // Member-facing copy mirrored from the Edge Fn, used ONLY for ?state= fakes.
  // Real responses render the payload's own `note` string (single source).
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

  // Failure copy mirrored from the Edge Fn, used ONLY for ?state= fakes.
  var FAILURE_TITLE = {
    card_declined: "Your card needs a quick update",
    item_taken: "One item just got claimed",
    reservation_expired: "Your hold expired",
    extra_swap_limit: "One past this cycle's limit",
    resale_missing: "This item isn't ready yet",
    bad_tier: "This item isn't ready yet",
    credit_unavailable: "A credit needs refreshing",
    no_card: "Add a card to check out",
    reprice: "Your total just changed",
  };
  var FAILURE_COPY = {
    card_declined: "We couldn't charge your card. Your bag is saved — update your card and try again.",
    item_taken: "An item in your bag was just claimed by someone else. Your other items are saved.",
    reservation_expired: "Your hold expired — please re-add the item to your bag.",
    extra_swap_limit: "That's past the 5 extra-swap limit for this cycle. Remove that item to check out the rest now.",
    resale_missing: "This item isn't ready to claim yet. Nothing was charged.",
    bad_tier: "This item isn't ready to claim yet. Nothing was charged.",
    credit_unavailable: "A credit in your bag is no longer available — please refresh your bag.",
    no_card: "No saved card on file. Add a card to check out.",
    reprice: "Your total changed since you opened this page. Please review and confirm again.",
  };

  // ---- helpers --------------------------------------------------------------
  function money(d) {            // dollars (number) -> "$8.00"
    var n = Number(d) || 0;
    return "$" + n.toFixed(2);
  }
  function moneyc(c) {           // cents (int) -> "$8.00"
    return money((Number(c) || 0) / 100);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function getToken() {
    try {
      return (window.$memberstackDom &&
        window.$memberstackDom.getMemberCookie &&
        window.$memberstackDom.getMemberCookie()) || null;
    } catch (e) { return null; }
  }
  function getMount() { return document.getElementById(MOUNT_ID); }
  function qp(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (e) { return null; }
  }
  function setHtml(html) {
    var m = getMount();
    if (m) m.innerHTML = html;
  }

  // ---- cart from URL  (the throwaway piece) ---------------------------------
  // ?items=KS-00002:2ef94b92-...,KS-00003:7a1c...   ->  [{sku, credit_id}, ...]
  function parseCart() {
    var raw = qp("items");
    if (!raw) return null;
    var out = [];
    var parts = raw.split(",");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var ci = p.indexOf(":");           // split on FIRST colon (UUIDs have none)
      if (ci < 0) return null;           // malformed pair
      var sku = p.slice(0, ci).trim();
      var credit = p.slice(ci + 1).trim();
      if (!sku || !credit) return null;
      out.push({ sku: sku, credit_id: credit });
    }
    return out.length ? out : null;
  }

  // ---- CSS (self-injected; greenfield page = one file, pure pin-bump) -------
  var CSS = [
    "#" + MOUNT_ID + "{",
    "  --ks-orange:#d24f28; --ks-orange-d:#b23f1f;",
    "  --ks-ink:#2b2b2b; --ks-muted:#8a8278; --ks-line:#ece6dc;",
    "  --ks-card:#fdfbf7; --ks-green:#2e7d52; --ks-green-bg:#e8f3ec;",
    "  --ks-amber:#9a7b1f; --ks-amber-bg:#f7f0db;",
    "  --ks-gray:#5a5550; --ks-gray-bg:#f1ece5;",
    "  max-width:560px; margin:0 auto; padding:24px 18px 64px;",
    "  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
    "  color:var(--ks-ink); -webkit-font-smoothing:antialiased; box-sizing:border-box;",
    "}",
    "#" + MOUNT_ID + " *{box-sizing:border-box;}",
    ".ksc-coins{display:flex; gap:10px; justify-content:flex-end; margin-bottom:18px; flex-wrap:wrap;}",
    ".ksc-coin{display:flex; align-items:center; gap:8px; background:var(--ks-amber-bg);",
    "  border:1px solid #ecdfb6; border-radius:999px; padding:6px 12px 6px 8px;}",
    ".ksc-coin .disc{width:26px; height:26px; border-radius:50%; background:#e8c75a;",
    "  border:1px solid #d8b13e; display:flex; align-items:center; justify-content:center;",
    "  font-weight:700; font-size:.82rem; color:#5c4708;}",
    ".ksc-coin .lab{font-size:.72rem; line-height:1.15; color:var(--ks-amber);}",
    ".ksc-coin .lab b{display:block; font-size:.82rem; color:#6b531a; text-transform:capitalize;}",
    ".ksc-head{font-family:Quicksand,-apple-system,sans-serif; font-weight:600;",
    "  font-size:1.7rem; line-height:1.2; margin:0 0 6px;}",
    ".ksc-value{font-size:1.02rem; color:var(--ks-ink); margin:0 0 2px;}",
    ".ksc-value b{font-weight:600;}",
    ".ksc-sub{font-size:.92rem; color:var(--ks-muted); margin:0 0 20px;}",
    ".ksc-sub.flat{color:var(--ks-muted);}",
    ".ksc-seal{display:flex; align-items:center; gap:10px; background:var(--ks-green-bg);",
    "  border:1px solid #cfe6d8; border-radius:12px; padding:11px 14px; margin:0 0 18px;}",
    ".ksc-seal svg{flex:0 0 auto;}",
    ".ksc-seal span{font-size:.9rem; color:#1f5e3c; font-weight:500;}",
    ".ksc-items{display:flex; flex-direction:column; gap:10px; margin:0 0 18px;}",
    ".ksc-item{display:flex; align-items:flex-start; justify-content:space-between;",
    "  gap:12px; background:var(--ks-card); border:1px solid var(--ks-line);",
    "  border-radius:12px; padding:13px 15px;}",
    ".ksc-item .nm{font-weight:600; font-size:.98rem; line-height:1.25;}",
    ".ksc-item .meta{margin-top:3px; font-size:.82rem; color:var(--ks-muted);}",
    ".ksc-tag{flex:0 0 auto; text-align:right;}",
    ".ksc-badge{display:inline-block; font-size:.78rem; font-weight:600;",
    "  padding:3px 9px; border-radius:999px; white-space:nowrap;}",
    ".ksc-badge.covered{background:var(--ks-green-bg); color:var(--ks-green);}",
    ".ksc-badge.charge{background:var(--ks-gray-bg); color:var(--ks-gray);}",
    ".ksc-fee{margin-top:4px; font-size:.86rem; font-weight:600; color:var(--ks-ink);}",
    ".ksc-note{margin-top:3px; font-size:.76rem; color:var(--ks-muted);}",
    ".ksc-sum{border-top:1px solid var(--ks-line); padding-top:14px; margin:0 0 20px;}",
    ".ksc-row{display:flex; justify-content:space-between; align-items:center;",
    "  font-size:.95rem; padding:4px 0;}",
    ".ksc-row .k{color:var(--ks-muted);}",
    ".ksc-row.total{font-size:1.12rem; font-weight:700; padding-top:10px;}",
    ".ksc-row.total .k{color:var(--ks-ink);}",
    ".ksc-btn{display:block; width:100%; border:0; cursor:pointer;",
    "  background:var(--ks-orange); color:#fff; font-weight:700; font-size:1.02rem;",
    "  font-family:Quicksand,-apple-system,sans-serif; border-radius:12px;",
    "  padding:15px 18px; transition:background .15s;}",
    ".ksc-btn:hover{background:var(--ks-orange-d);}",
    ".ksc-secure{display:flex; align-items:center; justify-content:center; gap:7px;",
    "  margin-top:11px; font-size:.8rem; color:var(--ks-muted);}",
    ".ksc-stub{margin-top:12px; text-align:center; font-size:.78rem; color:var(--ks-orange);}",
    /* block / failure / error / loading */
    ".ksc-screen{text-align:center; padding:34px 8px 12px; max-width:420px; margin:0 auto;}",
    ".ksc-screen .ic{width:54px; height:54px; margin:0 auto 16px;}",
    ".ksc-screen h2{font-family:Quicksand,-apple-system,sans-serif; font-weight:600;",
    "  font-size:1.35rem; margin:0 0 8px;}",
    ".ksc-screen p{font-size:.95rem; color:var(--ks-muted); line-height:1.5; margin:0 0 20px;}",
    ".ksc-screen .act{display:inline-block; background:var(--ks-orange); color:#fff;",
    "  text-decoration:none; font-weight:700; font-size:.95rem; border-radius:10px;",
    "  padding:12px 22px; font-family:Quicksand,-apple-system,sans-serif;}",
    ".ksc-screen .act.ghost{background:transparent; color:var(--ks-orange);",
    "  border:1px solid var(--ks-line);}",
    ".ksc-load{display:flex; flex-direction:column; gap:12px; padding:8px 0;}",
    ".ksc-skel{height:64px; border-radius:12px; background:linear-gradient(90deg,",
    "  #f2ede6 25%,#f8f4ee 37%,#f2ede6 63%); background-size:400% 100%;",
    "  animation:ksc-sh 1.3s ease infinite;}",
    "@keyframes ksc-sh{0%{background-position:100% 0}100%{background-position:0 0}}",
    "@media (max-width:600px){",
    "  .ksc-coins{justify-content:flex-start;}",
    "  .ksc-head{font-size:1.45rem;}",
    "}",
  ].join("\n");

  function injectCss() {
    if (document.getElementById("ks-checkout-css")) return;
    var s = document.createElement("style");
    s.id = "ks-checkout-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- small inline SVGs ----------------------------------------------------
  function shieldCheck() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 2l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5l7-3z" fill="#2e7d52" opacity=".15"/>' +
      '<path d="M12 2l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5l7-3z" stroke="#2e7d52" stroke-width="1.4"/>' +
      '<path d="M8.6 12.2l2.2 2.2 4.6-4.8" stroke="#2e7d52" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function lockIcon() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none">' +
      '<rect x="5" y="11" width="14" height="9" rx="2" stroke="#8a8278" stroke-width="1.6"/>' +
      '<path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#8a8278" stroke-width="1.6"/></svg>';
  }
  function bigIcon(kind) {
    var c = kind === "ok" ? "#2e7d52" : "#d24f28";
    if (kind === "ok") {
      return '<svg class="ic" viewBox="0 0 56 56" fill="none">' +
        '<circle cx="28" cy="28" r="26" stroke="' + c + '" stroke-width="2"/>' +
        '<path d="M18 28.5l7 7 13-14" stroke="' + c + '" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg class="ic" viewBox="0 0 56 56" fill="none">' +
      '<circle cx="28" cy="28" r="26" stroke="' + c + '" stroke-width="2"/>' +
      '<path d="M28 17v16" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="28" cy="39.5" r="1.6" fill="' + c + '"/></svg>';
  }

  // ---- savings subline (locked three bands + the $0 celebration) ------------
  function savingsSubline(totalCents, valueDollars) {
    if ((Number(totalCents) || 0) === 0) return { text: "Your credits covered it all", flat: false };
    var valueCents = Math.round((Number(valueDollars) || 0) * 100);
    if (valueCents <= 0) return { text: "Here's your swap", flat: true };
    var ratio = totalCents / valueCents;
    if (ratio <= 0.34) return { text: "Your credits covered most of it", flat: false };
    if (ratio <= 0.67) return { text: "Your credits covered the bulk of it", flat: false };
    return { text: "Here's your swap", flat: true };  // fee-heavy: no coverage claim
  }

  // ---- coverage tile (the honesty hinge; classified server-side) ------------
  function tileFor(line) {
    var up = Number(line.upgrade_fee) || 0;
    var ex = Number(line.extra_swap_fee) || 0;
    switch (line.coverage) {
      case "covered":
        return { cls: "covered", label: "Covered", fee: null, note: null };
      case "covered_extra":
        return { cls: "covered", label: "Covered", fee: ex ? "+" + money(ex) : null,
                 note: "one extra this month" };
      case "upgrade":
        return { cls: "charge", label: "Credit applied", fee: money(up), note: null };
      case "special_upgrade":
        return { cls: "charge", label: "Special credit applied", fee: money(up),
                 note: up <= 40 ? "designer find" : null };  // flourish recedes as $ climbs
      default:
        return { cls: "charge", label: "Credit applied",
                 fee: (up || ex) ? money(up || ex) : null, note: null };
    }
  }

  // ---- coins (static readouts this pass; bank balance LEFT after this swap) --
  function coinsHtml(bank, cap) {
    var bc = (bank && bank.by_class) || {};
    var out = [];
    function coin(label, after) {
      return '<div class="ksc-coin"><span class="disc">' + esc(after) + '</span>' +
        '<span class="lab">left after this<b>' + esc(label) + '</b></span></div>';
    }
    if (cap && cap.clothing && Number(cap.clothing.limit) > 0) {
      out.push(coin("clothes", (bc.clothing && bc.clothing.after != null) ? bc.clothing.after : 0));
    }
    if (cap && cap.toy && Number(cap.toy.limit) > 0) {
      out.push(coin("toys", (bc.toy && bc.toy.after != null) ? bc.toy.after : 0));
    }
    if (!out.length) return "";
    return '<div class="ksc-coins">' + out.join("") + "</div>";
  }

  // ---- main receipt render --------------------------------------------------
  function renderReceipt(p) {
    var lines = Array.isArray(p.lines) ? p.lines : [];
    var count = lines.length;
    var head = count === 1 ? "Your swap is ready" : "Your swaps are ready";

    var value = Number(p.value_of_items) || 0;
    var totalCents = (p.fees && Number(p.fees.total_cents)) || 0;
    var sub = savingsSubline(totalCents, value);

    var itemsHtml = lines.map(function (ln) {
      var t = tileFor(ln);
      var right = '<span class="ksc-badge ' + t.cls + '">' + esc(t.label) + "</span>";
      if (t.fee) right += '<div class="ksc-fee">' + esc(t.fee) + "</div>";
      if (t.note) right += '<div class="ksc-note">' + esc(t.note) + "</div>";
      return '<div class="ksc-item"><div class="nm">' + esc(ln.item_name || ln.sku) +
        "</div><div class=\"ksc-tag\">" + right + "</div></div>";
    }).join("");

    // summary: shipping + total ONLY (per-item fees never re-listed)
    var ship = (p.fees && p.fees.shipping) || { state: "included", amount_cents: 0 };
    var shipVal = ship.state === "charged" ? moneyc(ship.amount_cents) : "Included";
    var summary =
      '<div class="ksc-sum">' +
        '<div class="ksc-row"><span class="k">Shipping</span><span>' + esc(shipVal) + "</span></div>" +
        '<div class="ksc-row total"><span class="k">Total today</span><span>' +
          moneyc(totalCents) + "</span></div>" +
      "</div>";

    var btnLabel = totalCents > 0 ? "Confirm swap · " + moneyc(totalCents) : "Confirm swap";

    var html =
      coinsHtml(p.bank, p.cap) +
      '<h1 class="ksc-head">' + esc(head) + "</h1>" +
      '<p class="ksc-value"><b>Worth about ' + money(value) + " new</b></p>" +
      '<p class="ksc-sub' + (sub.flat ? " flat" : "") + '">' + esc(sub.text) + "</p>" +
      '<div class="ksc-seal">' + shieldCheck() +
        "<span>Every piece meets The Closet Standard</span></div>" +
      '<div class="ksc-items">' + itemsHtml + "</div>" +
      summary +
      '<button class="ksc-btn" id="ksc-confirm" type="button">' + esc(btnLabel) + "</button>" +
      '<div class="ksc-secure">' + lockIcon() + "<span>Secured by Stripe</span></div>" +
      '<div class="ksc-stub">Preview only — claim wiring comes next (this pass charges nothing)</div>';

    setHtml(html);

    var btn = document.getElementById("ksc-confirm");
    if (btn) btn.addEventListener("click", function () {
      // LOGGED NO-OP this pass. commit:true is flipped on LAST.
      console.log("[ks-checkout] confirm clicked — commit path not wired yet (preview build)");
      btn.textContent = "Claim wiring comes next ✓";
      btn.disabled = true;
      btn.style.background = "#9a948c";
    });
  }

  // ---- block / failure / error / loading ------------------------------------
  function renderBlock(reason, note) {
    var title = BLOCK_TITLE[reason] || "Just a moment";
    var copy = note || BLOCK_COPY[reason] || "This isn't available right now.";
    var cta = BLOCK_CTA[reason] || { label: "Go to dashboard", href: "/dashboard" };
    setHtml(
      '<div class="ksc-screen">' + bigIcon("info") +
        "<h2>" + esc(title) + "</h2><p>" + esc(copy) + "</p>" +
        '<a class="act" href="' + esc(cta.href) + '">' + esc(cta.label) + "</a></div>"
    );
  }

  function renderFailure(failure, note, abortSku) {
    var title = FAILURE_TITLE[failure] || "Something needs a look";
    var copy = note || FAILURE_COPY[failure] ||
      "Something went wrong — nothing was charged. Your bag is saved.";
    if (abortSku && /coming back to the rest|saved/i.test(copy) === false) {
      // keep copy as-is; abort_sku is for logs, not member-facing noise
    }
    setHtml(
      '<div class="ksc-screen">' + bigIcon("info") +
        "<h2>" + esc(title) + "</h2><p>" + esc(copy) + "</p>" +
        '<a class="act ghost" href="/browse">Back to browsing</a></div>'
    );
  }

  function renderError(msg) {
    setHtml(
      '<div class="ksc-screen">' + bigIcon("info") +
        "<h2>We hit a snag</h2><p>" + esc(msg || "Please try again in a moment.") + "</p>" +
        '<a class="act ghost" href="/browse">Back to browsing</a></div>'
    );
  }

  function renderLoading() {
    setHtml('<div class="ksc-load"><div class="ksc-skel"></div>' +
      '<div class="ksc-skel"></div><div class="ksc-skel"></div></div>');
  }

  function friendlyError(code) {
    switch (code) {
      case "no_token":
      case "invalid_token": return "Please log in to check out.";
      case "not_authorized": return "This checkout isn't open to your account yet.";
      case "empty_cart": return "Your bag is empty.";
      case "member_not_found": return "We couldn't find your membership. Please log in again.";
      default: return "Please try again in a moment.";
    }
  }

  // ---- response router ------------------------------------------------------
  function route(data, status) {
    if (data && data.ok === true && data.mode === "preview") { renderReceipt(data); return; }
    if (data && data.can_claim === false && data.block_reason) {
      renderBlock(data.block_reason, data.note); return;
    }
    if (data && data.failure) { renderFailure(data.failure, data.note, data.abort_sku); return; }
    if (status === 401 || status === 403) { renderError(friendlyError(data && data.error)); return; }
    renderError(data && data.error ? friendlyError(data.error) : null);
  }

  // ---- ?state= override (no fetch) ------------------------------------------
  function handleStateOverride() {
    var st = qp("state");
    if (!st) return false;
    if (BLOCK_COPY.hasOwnProperty(st)) { renderBlock(st, null); return true; }
    if (st === "cancelled") { renderBlock("cancelled_ended", null); return true; }
    if (st === "pending") { renderBlock("pending_first_bag", null); return true; }
    if (FAILURE_COPY.hasOwnProperty(st)) { renderFailure(st, null, null); return true; }
    if (st === "error") { renderError(null); return true; }
    if (st === "loading") { renderLoading(); return true; }
    return false; // unknown state -> fall through to the real flow
  }

  // ---- boot -----------------------------------------------------------------
  async function run() {
    injectCss();
    if (!getMount()) return;

    if (handleStateOverride()) return;

    var items = parseCart();
    if (!items) { renderError("Your bag link looks off. Head back and add items again."); return; }

    renderLoading();

    var token = getToken();
    if (!token) { renderError("Please log in to check out."); return; }

    try {
      var res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ms-token": token },
        body: JSON.stringify({ commit: false, items: items }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      route(data, res.status);
    } catch (e) {
      renderError("We couldn't load your bag. Please try again.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
