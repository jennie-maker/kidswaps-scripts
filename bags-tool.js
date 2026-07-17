/* ks-bags — the ship desk. /admin/bags
   Phone-first: cards are the primary layout, desktop just widens the fields.
   Server is authoritative on every guard; this file is the hands, not the brain.
   Path A: Jennie prints labels in Shippo's own UI and pastes the tracking back.
   ⚠ The panel NEVER calls Shippo. Under Path B the EDGE FN fills these same two
     fields from the API and this client's contract does not change.
*/
(function () {
  "use strict";

  var BUILD = "v4-requests";
  var FN = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/bags-manage";
  var MOUNT_ID = "ks-bags-app";

  /* ⚠ AGING — GUARD 3. Deliberately constants, not a migration. No SLA exists yet
     (nothing member-facing promises a handling time), so these are honest-for-now,
     not derived. Change the numbers; nothing else moves. */
  var AGE_AMBER_DAYS = 2;
  var AGE_RED_DAYS = 4;

  /* ⚠ #C0392B IS A 9th VALUE AND IT IS DELIBERATE — ADMIN SURFACES ONLY.
     The 8-hex palette is a BRAND system; it exists so MEMBERS see a coherent product.
     This page has exactly one user and it is the operator. An overdue bag is a WARNING
     LIGHT, not a brand accent. The alternative was spending a FOURTH coral, which is
     precisely what §DASH.2's tripwire exists to prevent. Ruled 2026-07-12.
     ⚠ NEVER let this hex reach a member-facing surface. */
  var RED = "#C0392B";

  /* The four bag types this panel can create. 'order' is absent ON PURPOSE —
     checkout's commit_claim_batch owns order rows. The edge fn refuses anything
     not on this list; swap_bags.source DEFAULTS to 'order', so an unset source
     would silently bill the member $15. */
  var SOURCES = [
    { key: "signup",         label: "First bag",         cost: "Free" },
    { key: "comp",           label: "Make-good",         cost: "Free" },
    { key: "requested_free", label: "Free replacement",  cost: "Free" },
    { key: "requested_paid", label: "Paid extra",        cost: "$15" }
  ];

  var SOURCE_LABEL = {
    signup: "First bag",
    comp: "Make-good bag",
    requested_free: "Free replacement",
    requested_paid: "Paid extra bag",
    order: "Order + bag"
  };

  var _panel = null;
  var _token = null;
  var _busy = false;
  var _root = null;
  var _formSource = "signup";

  /* ---------- utils ---------------------------------------------------- */

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fullName(r) {
    var n = ((r.first_name || "") + " " + (r.last_name || "")).trim();
    return n || r.email || "Unknown member";
  }

  function daysSince(iso) {
    if (!iso) return 0;
    var then = new Date(iso).getTime();
    if (isNaN(then)) return 0;
    return Math.floor((Date.now() - then) / 86400000);
  }

  function ageClass(d) {
    if (d >= AGE_RED_DAYS) return "ksb-red";
    if (d >= AGE_AMBER_DAYS) return "ksb-amber";
    return "ksb-fresh";
  }

  function ageText(d) {
    if (d <= 0) return "Today";
    if (d === 1) return "1 day old";
    return d + " days old";
  }

  /* Short local-date, e.g. "Jul 12, 2026". Local time is correct here — these are
     moments (shipped_at / delivered_at), not date-only values. */
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /* ⚠ ADDRESS IS THE WHOLE POINT OF THIS PANEL — eyeball it before printing.
     Every shipping_* column is NULLABLE. A member with no address must SHOUT,
     not render a tidy blank — a tidy blank is exactly what hid the S1 gap for a month.
     ⚠ line2 IS RENDERED. A Cowork mockup silently dropped "Apt 4B" off the one
     fixture in the system that has one. An apartment number is a door. */
  function addressBlock(r) {
    var l1 = (r.shipping_address_line1 || "").trim();
    if (!l1) {
      return '<div class="ksb-noaddr"><span class="ksb-noaddr-i">⚠</span>' +
             '<span>NO ADDRESS ON FILE — do not print a label.</span></div>';
    }
    var l2 = (r.shipping_address_line2 || "").trim();
    var city = (r.shipping_city || "").trim();
    var st = (r.shipping_state || "").trim();
    var zip = (r.shipping_zip || "").trim();
    var out = '<div class="ksb-addr"><div class="ksb-addr-who">' + esc(fullName(r)) + "</div>";
    out += '<div class="ksb-addr-l">' + esc(l1) + "</div>";
    if (l2) out += '<div class="ksb-addr-l">' + esc(l2) + "</div>";
    out += '<div class="ksb-addr-l">' + esc(city) + (city && st ? ", " : "") +
           esc(st) + " " + esc(zip) + "</div></div>";
    return out;
  }

  /* ---------- server --------------------------------------------------- */

  function call(payload) {
    return fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ms-token": _token },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.error) {
          var e = new Error(j.error || "Request failed");
          e.detail = j.detail;
          throw e;
        }
        return j;
      });
    });
  }

  function withBusy(p, btn, busyText) {
    if (_busy) return Promise.resolve(null);
    _busy = true;
    var old = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = busyText || "Working..."; }
    return p.then(function (res) {
      if (res && res.panel) { _panel = res.panel; render(); }
      return res;
    }).catch(function (e) {
      alert(e.message + (e.detail ? "\n\n" + e.detail : ""));
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }).finally(function () { _busy = false; });
  }

  /* ---------- a bag card (BOTH queues end the same way) ------------------ */

  function bagCard(r) {
    var d = daysSince(r.opened_at);
    var isOrder = r.source === "order";
    var paid = r.source === "requested_paid";

    return '' +
      '<article class="ksb-card ' + ageClass(d) + '" data-bag="' + esc(r.id) + '">' +
        '<div class="ksb-top">' +
          '<h3 class="ksb-name">' + esc(fullName(r)) + "</h3>" +
          '<span class="ksb-age">' + esc(ageText(d)) + "</span>" +
        "</div>" +

        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>" +
          '<span class="ksb-chip ksb-chip--type">' + esc(SOURCE_LABEL[r.source] || r.source) + "</span>" +
          (paid ? '<span class="ksb-chip ksb-chip--paid">$15 · not charged here</span>' : "") +
        "</div>" +

        addressBlock(r) +

        '<p class="ksb-instr"><span class="ksb-arrow">›</span>' +
          (isOrder
            ? "Pack her items <strong>plus an empty bag</strong> with the return label on it."
            : "Empty bag with the return label on it, folded into an envelope. <strong>No items.</strong>") +
        "</p>" +

        /* THE JOB — the heart of the card. Two labels, born in one sitting. */
        '<div class="ksb-job">' +
          '<div class="ksb-job-t">Two labels <span class="ksb-of2">· one job</span></div>' +
          '<div class="ksb-field">' +
            "<label>Outbound tracking <em>(the package)</em></label>" +
            /* ⚠ inputmode TEXT, never numeric. Tracking numbers are ALPHANUMERIC —
               UPS is 1Z... A numeric keypad cannot type a Z. */
            '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="out" placeholder="Paste from Shippo">' +
            '<span class="ksb-tick">✓</span>' +
          "</div>" +
          '<div class="ksb-field">' +
            "<label>Return tracking <em>(the bag inside)</em></label>" +
            '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="ret" placeholder="Paste from Shippo">' +
            '<span class="ksb-tick">✓</span>' +
          "</div>" +
        "</div>" +

        '<div class="ksb-actions">' +
          /* ⚠⚠ GUARD 1 — DISABLED UNTIL BOTH TRACKING NUMBERS ARE IN.
             Prevention, not nagging: the button cannot be pressed, so there is
             nothing to misclick. ⚠ NO UNDO, DELIBERATELY — marking shipped is NOT
             reversible (the package is in the mail), and an unship action would let
             a mailed bag return to 'open', break Guard 2, and un-fire a $15 fee that
             was correctly charged. Two deliberate pastes IS the confirmation. */
          '<button class="ksb-btn ksb-btn--go" data-act="ship" disabled>Mark shipped</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="cancel">Cancel</button>' +
        "</div>" +
        '<div class="ksb-lock">Both tracking numbers needed to ship</div>' +
      "</article>";
  }

  /* ---------- in transit (the return-stamp queue) ----------------------- */

  /* ⚠ #BAG-TRACKING INTERIM. Marks a shipped bag returned by EXPLICIT bag_id — it
     does NOT guess the oldest (that trap is stamp_bag_returned's), and it does NOT
     read the tracking number off the label (the real fix, deferred to its own
     session). The operator matches the physical bag in her hand to the RETURN
     TRACKING shown here, then taps. The confirm repeats that number — that is the
     guard against herself, same species as "two tracking numbers to ship."
     ⚠ NO ADDRESS BLOCK — the bag is already out; there is no label to print here.
     ⚠ NO AGE COLOUR — no SLA exists (§BAGS), so "Out N days" is neutral, never
     amber/red. An in-transit bag waiting on the mail is not the operator's fault. */
  function transitCard(r) {
    var outN = daysSince(r.shipped_at);
    var outLabel = r.shipped_at ? ("Out " + outN + (outN === 1 ? " day" : " days")) : "";
    return '' +
      '<article class="ksb-card" data-bag="' + esc(r.id) + '"' +
        ' data-rt="' + esc(r.return_tracking || "") + '">' +
        '<div class="ksb-top">' +
          '<h3 class="ksb-name">' + esc(fullName(r)) + "</h3>" +
          (outLabel ? '<span class="ksb-age">' + esc(outLabel) + "</span>" : "") +
        "</div>" +

        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>" +
          '<span class="ksb-chip ksb-chip--type">' + esc(SOURCE_LABEL[r.source] || r.source) + "</span>" +
        "</div>" +

        '<div class="ksb-transit-meta">' +
          '<div class="ksb-tl"><span class="ksb-tl-k">Shipped</span>' +
            '<span class="ksb-tl-v">' + esc(fmtDate(r.shipped_at)) + "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Delivered</span>' +
            '<span class="ksb-tl-v">' +
              (r.delivered_at ? esc(fmtDate(r.delivered_at)) : "<em>not yet</em>") +
            "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Return tracking</span>' +
            '<span class="ksb-tl-v ksb-mono">' + esc(r.return_tracking || "—") + "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Outbound</span>' +
            '<span class="ksb-tl-v ksb-mono">' + esc(r.outbound_tracking || "—") + "</span></div>" +
        "</div>" +

        '<p class="ksb-instr"><span class="ksb-arrow">›</span>' +
          "Back in your hands? Match the return tracking to the bag, then mark it returned." +
        "</p>" +

        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--go ksb-btn--wide" data-act="return">Mark returned</button>' +
        "</div>" +
      "</article>";
  }

  /* ---------- needs-a-bag ------------------------------------------------ */

  function needsCard(m) {
    return '' +
      '<article class="ksb-card ksb-first" data-needs="' + esc(m.member_id) + '">' +
        '<div class="ksb-top"><h3 class="ksb-name">' + esc(fullName(m)) + "</h3></div>" +
        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(m.plan || "No plan") + "</span>" +
          '<span class="ksb-chip ksb-chip--free">Free · never counted</span>' +
        "</div>" +
        addressBlock(m) +
        '<p class="ksb-instr"><span class="ksb-arrow">›</span>Her first empty bag. Free, never counted, never billed.</p>' +
        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--go ksb-btn--wide" data-act="create-signup">Create her first bag</button>' +
        "</div>" +
      "</article>";
  }

  /* ---------- the send-a-bag form ---------------------------------------- */

  function sendForm() {
    var members = (_panel.members || []).slice().sort(function (a, b) {
      return fullName(a).localeCompare(fullName(b));
    });

    var opts = members.map(function (m) {
      return '<option value="' + esc(m.member_id) + '" data-open="' + m.open_bags + '">' +
             esc(fullName(m)) + " — " + esc(m.plan || "no plan") + "</option>";
    }).join("");

    /* Reason as TAP TILES, not a dropdown — far better with a thumb. */
    var tiles = SOURCES.map(function (s, i) {
      return '<button class="ksb-reason' + (i === 0 ? " is-sel" : "") + '" data-src="' + s.key + '">' +
             esc(s.label) +
             '<span class="ksb-reason-c ' + (s.cost === "$15" ? "is-paid" : "is-free") + '">' + esc(s.cost) + "</span>" +
             "</button>";
    }).join("");

    return '' +
      '<div class="ksb-form" id="ksb-form" hidden>' +
        '<div class="ksb-flabel">Member</div>' +
        '<select id="ksb-f-member"><option value="">Pick a member...</option>' + opts + "</select>" +
        /* ⚠ GUARD 4 — warn, never block (§6 override-with-warning; she may have a reason). */
        '<div class="ksb-dup" id="ksb-f-warn" hidden>' +
          "<strong>⚠ This member already has a bag out.</strong> Sending another is allowed. " +
          "This warns, it never blocks. Send it if you have a reason." +
        "</div>" +
        '<div class="ksb-flabel">Reason</div>' +
        '<div class="ksb-reasons" id="ksb-f-reasons">' + tiles + "</div>" +
        '<div class="ksb-paid" id="ksb-f-paid" hidden>' +
          "$15 — <strong>not charged by this page.</strong> There is no payment step here. Collect it manually." +
        "</div>" +
        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--go" id="ksb-f-create">Add to queue</button>' +
          '<button class="ksb-btn ksb-btn--ghost" id="ksb-f-close">Close</button>' +
        "</div>" +
      "</div>";
  }


  /* ---------- a case card (bag_cases — the make-good desk) ---------------- */
  /* ⚠ A case row is bag_cases JOINed to members, LEFT-joined to swap_bags — so
     the bag_* fields are null on a hand-opened case with no bag. Reuses fullName,
     addressBlock and fmtDate verbatim; the row carries the same shipping_* keys
     addressBlock reads. The credit form is REVEAL-ON-CLICK (same idiom as
     sendForm's hidden toggle): tapping Credit shows amount/class/tier tiles; Reship
     and Decline act immediately. ⚠ Reship mints a comp bag server-side; Decline
     issues nothing (confirm-guarded); Credit needs all three picks. */
  var REASON_LABEL = {
    never_arrived: "Never arrived",
    lost: "Lost",
    damaged: "Damaged",
    all_declined: "All items declined"
  };

  function casesCard(r) {
    var ageN = daysSince(r.created_at);
    var ageLabel = r.created_at ? ("Open " + ageN + (ageN === 1 ? " day" : " days")) : "";
    return '' +
      '<article class="ksb-card ksb-case" data-case="' + esc(r.id) + '">' +
        '<div class="ksb-top">' +
          '<h3 class="ksb-name">' + esc(fullName(r)) + "</h3>" +
          (ageLabel ? '<span class="ksb-age">' + esc(ageLabel) + "</span>" : "") +
        "</div>" +

        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>" +
          '<span class="ksb-chip ksb-chip--type">' + esc(REASON_LABEL[r.reason] || r.reason) + "</span>" +
        "</div>" +

        (r.notes ? '<p class="ksb-case-notes">' + esc(r.notes) + "</p>" : "") +

        /* ⚠ Address shown because RESHIP = a comp bag that needs an address to
           eyeball before printing (§BAGS). addressBlock SHOUTS on a missing one. */
        addressBlock(r) +

        '<p class="ksb-instr"><span class="ksb-arrow">›</span>' +
          "Reship a make-good bag, credit her instead, or decline. Your call is the record." +
        "</p>" +

        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--go" data-act="resolve-reship">Reship a bag</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-credit-toggle">Credit</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-decline">Decline</button>' +
        "</div>" +

        /* Reveal-on-click credit form — hidden until Credit is tapped. */
        '<div class="ksb-form ksb-cform" data-cform hidden>' +
          '<div class="ksb-flabel">How many credits</div>' +
          '<div class="ksb-reasons" data-cf="amount">' +
            '<button class="ksb-reason is-sel" data-amount="1">1 credit</button>' +
            '<button class="ksb-reason" data-amount="0.5">Half credit</button>' +
          "</div>" +
          '<div class="ksb-flabel">Class</div>' +
          '<div class="ksb-reasons" data-cf="class">' +
            '<button class="ksb-reason is-sel" data-class="clothing">Clothing</button>' +
            '<button class="ksb-reason" data-class="toy">Toy</button>' +
          "</div>" +
          '<div class="ksb-flabel">Tier</div>' +
          '<div class="ksb-reasons" data-cf="tier">' +
            '<button class="ksb-reason is-sel" data-tier="essentials">Essentials</button>' +
            '<button class="ksb-reason" data-tier="elevated">Elevated</button>' +
            '<button class="ksb-reason" data-tier="special">Special</button>' +
          "</div>" +
          '<div class="ksb-actions">' +
            '<button class="ksb-btn ksb-btn--go" data-act="resolve-credit-go">Issue credit</button>' +
            '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-credit-cancel">Cancel</button>' +
          "</div>" +
        "</div>" +
      "</article>";
  }

  /* ⚠ THE "WANT ANOTHER BAG" QUEUE (§SB 7b). Distinct from CASES: a case is
     "something went wrong" (lost/damaged/all-declined); a request is "I'd like
     another bag this cycle" from a member who has ALREADY used her free bag.
     Approve mints a COMP bag server-side (goodwill on top — never spends her
     entitlement, never bills $15). No reveal form, no reason MAP — the reason is
     free text the member typed, shown verbatim. Address is shown so it can be
     eyeballed here, but the real address check happens when the comp bag lands
     in the send queue on approve. */
  function requestsCard(r) {
    var ageN = daysSince(r.created_at);
    var ageLabel = r.created_at ? ("Asked " + ageN + (ageN === 1 ? " day ago" : " days ago")) : "";
    return '' +
      '<article class="ksb-card ksb-request" data-request="' + esc(r.id) + '">' +
        '<div class="ksb-top">' +
          '<h3 class="ksb-name">' + esc(fullName(r)) + "</h3>" +
          (ageLabel ? '<span class="ksb-age">' + esc(ageLabel) + "</span>" : "") +
        "</div>" +

        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>" +
        "</div>" +

        '<p class="ksb-req-reason">' + esc(r.reason || "(no reason given)") + "</p>" +
        (r.notes ? '<p class="ksb-case-notes">' + esc(r.notes) + "</p>" : "") +

        addressBlock(r) +

        '<p class="ksb-instr"><span class="ksb-arrow">\u203a</span>' +
          "Approve to mail a make-good bag, or decline. This is goodwill on top of her free bag." +
        "</p>" +

        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--go" data-act="approve-request">Approve &amp; send</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="decline-request">Decline</button>' +
        "</div>" +
      "</article>";
  }

  /* ---------- render ----------------------------------------------------- */

  function render() {
    /* ⚠ GUARD 3, THE HALF THAT ACTUALLY WORKS: OVERDUE FLOATS TO THE TOP.
       A red border 400px down the page is a color a tired person learns to scroll
       past. Position is the loudest signal there is, and it costs one sort. */
    function byAge(a, b) { return daysSince(a.opened_at) - daysSince(b.opened_at); }
    var orders = (_panel.orders || []).slice().sort(byAge).reverse();
    var envelopes = (_panel.envelopes || []).slice().sort(byAge).reverse();
    var needs = (_panel.members || []).filter(function (m) { return m.total_bags === 0; });
    /* ⚠ RPC already orders in_transit oldest-first (by shipped_at). Longest-out at
       the top is the natural attention order; no reverse, no age float here. */
    var inTransit = (_panel.in_transit || []).slice();
    /* cases: RPC orders oldest-first (created_at). No reverse — oldest case wants attention first. */
    var cases = (_panel.cases || []).slice();
    /* requests: RPC orders oldest-first (created_at). Same as cases — oldest ask first. */
    var requests = (_panel.requests || []).slice();

    _root.innerHTML = '' +
      '<div class="ksb">' +
        '<header class="ksb-head">' +
          "<h1>The ship desk</h1>" +
          '<p class="ksb-sub">Two labels, one job. Check the address before you print.</p>' +
          '<button class="ksb-btn ksb-btn--ghost ksb-btn--sm" id="ksb-refresh">Refresh</button>' +
        "</header>" +

        (needs.length
          ? '<section class="ksb-sec">' +
              '<div class="ksb-sech"><h2>Waiting on a first bag</h2><span class="ksb-count">' + needs.length + "</span></div>" +
              needs.map(needsCard).join("") +
            "</section>"
          : "") +

        '<section class="ksb-sec">' +
          '<div class="ksb-sech"><h2>Bags to send</h2><span class="ksb-count">' + envelopes.length + "</span></div>" +
          (envelopes.length
            ? envelopes.map(bagCard).join("")
            : '<p class="ksb-empty">Nothing to send. Bag-only jobs show up here.</p>') +
          '<button class="ksb-add" id="ksb-send">+ Send a bag</button>' +
          sendForm() +
        "</section>" +

        '<section class="ksb-sec">' +
          '<div class="ksb-sech"><h2>Orders to send</h2><span class="ksb-count">' + orders.length + "</span></div>" +
          (orders.length
            ? orders.map(bagCard).join("")
            : '<p class="ksb-empty">No orders waiting. Checkout puts them here.</p>') +
        "</section>" +

        '<section class="ksb-sec">' +
          '<div class="ksb-sech"><h2>In transit</h2><span class="ksb-count">' + inTransit.length + "</span></div>" +
          (inTransit.length
            ? inTransit.map(transitCard).join("")
            : '<p class="ksb-empty">Nothing out. Shipped bags waiting to come back show up here.</p>') +
        "</section>" +

        '<section class="ksb-sec">' +
          '<div class="ksb-sech"><h2>Open cases</h2><span class="ksb-count">' + cases.length + "</span></div>" +
          (cases.length
            ? cases.map(casesCard).join("")
            : '<p class="ksb-empty">No open cases. Lost, damaged and all-declined bags land here.</p>') +
        "</section>" +

        '<section class="ksb-sec">' +
          '<div class="ksb-sech"><h2>Bag requests</h2><span class="ksb-count">' + requests.length + "</span></div>" +
          (requests.length
            ? requests.map(requestsCard).join("")
            : '<p class="ksb-empty">No requests. Members asking for another bag this cycle land here.</p>') +
        "</section>" +
      "</div>";

    wire();
  }

  /* ---------- wiring ----------------------------------------------------- */

  function checkJob(input) {
    var field = input.parentNode;
    var has = input.value.trim().length > 0;
    if (has) field.classList.add("is-done"); else field.classList.remove("is-done");

    var card = input.closest("[data-bag]");
    var ins = card.querySelectorAll("[data-tr]");
    var both = true;
    for (var i = 0; i < ins.length; i++) {
      if (!ins[i].value.trim()) { both = false; break; }
    }
    var btn = card.querySelector('[data-act="ship"]');
    var lock = card.querySelector(".ksb-lock");
    btn.disabled = !both;
    if (both) {
      lock.textContent = "✓ Both labels captured — safe to ship";
      lock.classList.add("is-ready");
    } else {
      lock.textContent = "Both tracking numbers needed to ship";
      lock.classList.remove("is-ready");
    }
  }

  function wire() {
    el("ksb-refresh").addEventListener("click", function (e) {
      withBusy(call({ action: "read" }), e.target, "Loading...");
    });

    var form = el("ksb-form");
    var mSel = el("ksb-f-member");
    var warn = el("ksb-f-warn");
    var paid = el("ksb-f-paid");

    el("ksb-send").addEventListener("click", function () { form.hidden = !form.hidden; });
    el("ksb-f-close").addEventListener("click", function () { form.hidden = true; });

    mSel.addEventListener("change", function () {
      var o = mSel.options[mSel.selectedIndex];
      warn.hidden = !(o && Number(o.getAttribute("data-open") || 0) > 0);
    });

    el("ksb-f-reasons").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-src]") : null;
      if (!t) return;
      var all = el("ksb-f-reasons").querySelectorAll("[data-src]");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("is-sel");
      t.classList.add("is-sel");
      _formSource = t.getAttribute("data-src");
      paid.hidden = _formSource !== "requested_paid";
    });

    el("ksb-f-create").addEventListener("click", function (e) {
      if (!mSel.value) { alert("Pick a member first."); return; }
      withBusy(call({ action: "create", member_id: mSel.value, source: _formSource }), e.target, "Creating...");
    });

    _root.addEventListener("input", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-tr")) checkJob(e.target);
    });

    _root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");

      if (act === "create-signup") {
        var n = btn.closest("[data-needs]");
        withBusy(call({ action: "create", member_id: n.getAttribute("data-needs"), source: "signup" }), btn, "Creating...");
        return;
      }

      /* ---- CASES (make-good desk) ---- */
      var caseCard = btn.closest("[data-case]");
      if (caseCard) {
        var caseId = caseCard.getAttribute("data-case");

        /* tile selection inside the credit form: flip is-sel among siblings */
        if (btn.classList.contains("ksb-reason")) {
          var group = btn.parentNode;
          var sibs = group.querySelectorAll(".ksb-reason");
          for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove("is-sel");
          btn.classList.add("is-sel");
          return;
        }

        if (act === "resolve-reship") {
          if (!confirm("Reship a make-good bag?\n\nThis mints a comp bag in the send queue — check the address, then print. It does not use up her free bag.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "reship" }), btn, "Reshipping...");
          return;
        }

        if (act === "resolve-decline") {
          if (!confirm("Decline this case?\n\nNothing is issued — no bag, no credit. The case closes. Use this when the reason doesn't hold up.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "decline" }), btn, "Declining...");
          return;
        }

        if (act === "resolve-credit-toggle") {
          var cf = caseCard.querySelector("[data-cform]");
          if (cf) cf.hidden = !cf.hidden;
          return;
        }

        if (act === "resolve-credit-cancel") {
          var cfc = caseCard.querySelector("[data-cform]");
          if (cfc) cfc.hidden = true;
          return;
        }

        if (act === "resolve-credit-go") {
          var form = caseCard.querySelector("[data-cform]");
          var amt = form.querySelector('[data-cf="amount"] .is-sel');
          var cls = form.querySelector('[data-cf="class"] .is-sel');
          var tr = form.querySelector('[data-cf="tier"] .is-sel');
          var amount = amt ? Number(amt.getAttribute("data-amount")) : null;
          var creditClass = cls ? cls.getAttribute("data-class") : null;
          var tier = tr ? tr.getAttribute("data-tier") : null;
          if (amount == null || !creditClass || !tier) {
            alert("Pick an amount, a class, and a tier before issuing the credit.");
            return;
          }
          var who = (caseCard.querySelector(".ksb-name") || {}).textContent || "this member";
          if (!confirm("Issue " + amount + " " + tier + " " + creditClass + " credit to " + who + "?\n\nThis closes the case and adds the credit to her bank. It can't be undone from here.")) return;
          withBusy(call({
            action: "resolve_case", case_id: caseId, resolution: "credit",
            amount: amount, "class": creditClass, tier: tier
          }), btn, "Crediting...");
          return;
        }
        return;
      }

      /* ---- BAG REQUESTS (§SB 7b) ----
         ⚠⚠ THIS BRANCH MUST STAY ABOVE THE data-bag EARLY-RETURN BELOW. A request
         card is data-request, NOT data-bag — dropped below the `if (!card) return`
         it would be swallowed silently, buttons rendering and doing nothing. This
         is the EXACT bug that bit the CASES section; do not move it down. */
      var reqCard = btn.closest("[data-request]");
      if (reqCard) {
        var reqId = reqCard.getAttribute("data-request");
        var reqWho = (reqCard.querySelector(".ksb-name") || {}).textContent || "this member";

        if (act === "approve-request") {
          if (!confirm("Approve and send a bag to " + reqWho + "?\n\nThis mints a comp bag in the send queue — check the address, then print. It's goodwill on top of her free bag, so it doesn't spend her entitlement or bill her.")) return;
          withBusy(call({ action: "approve_request", request_id: reqId }), btn, "Approving...");
          return;
        }

        if (act === "decline-request") {
          if (!confirm("Decline this request?\n\nNo bag is sent and the request closes. Use this when it doesn't hold up.")) return;
          withBusy(call({ action: "decline_request", request_id: reqId }), btn, "Declining...");
          return;
        }
        return;
      }

      var card = btn.closest("[data-bag]");
      if (!card) return;
      var bagId = card.getAttribute("data-bag");

      if (act === "ship") {
        var out = card.querySelector('[data-tr="out"]').value.trim();
        var ret = card.querySelector('[data-tr="ret"]').value.trim();
        if (!out || !ret) return;   /* unreachable — the button is disabled. Belt to the server's braces. */
        withBusy(call({
          action: "ship", bag_id: bagId,
          outbound_tracking: out, return_tracking: ret
        }), btn, "Shipping...");
        return;
      }

      if (act === "cancel") {
        if (!confirm("Cancel this bag?\n\nUse this when two rows exist for one physical bag. It won't count against her shipping.")) return;
        withBusy(call({ action: "cancel", bag_id: bagId }), btn, "Cancelling...");
        return;
      }

      if (act === "return") {
        /* ⚠ THE GUARD AGAINST MYSELF: the confirm shows the RETURN TRACKING so the
           bag in hand can be matched to the right row before stamping. When two bags
           are out at once, this number is the tiebreaker (§BAG-TRACKING). No undo
           exists — a rejected mockup Undo toast was ruled out for irreversible acts. */
        var who = (card.querySelector(".ksb-name") || {}).textContent || "this member";
        var rt = card.getAttribute("data-rt") || "";
        var msg = "Mark this bag returned?\n\n" + who +
          (rt ? "\nReturn tracking: " + rt : "") +
          "\n\nCheck this matches the bag in your hand. It can't be undone from here.";
        if (!confirm(msg)) return;
        withBusy(call({ action: "return", bag_id: bagId }), btn, "Marking...");
        return;
      }

    });
  }

  /* ---------- styles ----------------------------------------------------- */

  function injectCSS() {
    if (el("ksb-css")) return;
    var R = "#" + MOUNT_ID;
    var s = document.createElement("style");
    s.id = "ksb-css";
    /* ⚠ EVERY RULE IS PREFIXED WITH THE MOUNT ID. The v1 h1/h2 rules were NOT, and
       Webflow's global heading styles beat them — the section headings rendered as
       invisible text and only the count chips showed. Specificity, not magic. */
    s.textContent = [
      R + " *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
      R + " .ksb{font-family:Quicksand,sans-serif;font-weight:500;color:#1E1A19;max-width:460px;margin:0 auto;padding:8px 16px 80px;line-height:1.45}",

      R + " .ksb-head{padding:18px 0 4px}",
      R + " .ksb h1{font-family:'Instrument Serif',serif!important;font-weight:400!important;font-size:40px!important;line-height:1!important;margin:0!important;color:#1E1A19!important;text-transform:none!important}",
      R + " .ksb-sub{color:#75736E;font-size:14px;margin:6px 0 0}",
      R + " #ksb-refresh{margin-top:12px}",

      R + " .ksb-sec{margin-top:20px}",
      R + " .ksb-sech{display:flex;align-items:baseline;gap:10px;position:sticky;top:0;z-index:5;background:#F2F1EB;padding:14px 0 10px}",
      R + " .ksb h2{font-family:'Instrument Serif',serif!important;font-weight:400!important;font-size:26px!important;line-height:1!important;margin:0!important;color:#1E1A19!important;text-transform:none!important}",
      R + " .ksb-count{font-weight:600;font-size:13px;min-width:26px;height:26px;padding:0 8px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;background:#EEEFE3;color:#75736E}",
      R + " .ksb-empty{color:#75736E;font-size:14px;margin:8px 0 0}",

      /* cards — phone first */
      R + " .ksb-card{background:#FFF;border-radius:18px;box-shadow:0 10px 30px -12px #C9C7BC;padding:16px;margin:0 0 16px;border-left:6px solid #75736E}",
      R + " .ksb-amber{border-left-color:#E5AD43}",
      R + " .ksb-red{border-left-color:" + RED + "}",
      R + " .ksb-first{border-left-color:#28498D}",

      R + " .ksb-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}",
      R + " .ksb-name{font-family:Quicksand,sans-serif!important;font-size:20px!important;font-weight:600!important;margin:0!important;color:#1E1A19!important;letter-spacing:-.01em}",
      R + " .ksb-age{font-size:13px;color:#75736E;font-weight:600;white-space:nowrap;padding-top:3px}",
      R + " .ksb-amber .ksb-age{color:#E5AD43}",
      /* the overdue badge is FILLED — colour + shape + size, not just a hairline */
      R + " .ksb-red .ksb-age{color:#FFF;background:" + RED + ";padding:5px 10px;border-radius:11px;font-size:12.5px;padding-top:5px}",

      R + " .ksb-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}",
      R + " .ksb-chip{font-size:13px;font-weight:600;padding:5px 11px;border-radius:20px;background:#EEEFE3;color:#1E1A19}",
      R + " .ksb-chip--type{background:#F7E4D9;color:#BE4C2E}",
      R + " .ksb-chip--paid{background:#F7E4D9;color:#BE4C2E}",
      R + " .ksb-chip--free{background:#EEEFE3;color:#4E9360}",

      R + " .ksb-addr{background:#EEEFE3;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:15px;line-height:1.4}",
      R + " .ksb-addr-who{font-weight:600}",
      R + " .ksb-addr-l{color:#75736E}",
      R + " .ksb-noaddr{background:#F7E4D9;border:2px solid #D65A35;border-radius:12px;padding:13px 14px;margin-top:14px;color:#BE4C2E;font-weight:600;font-size:15px;display:flex;gap:9px;align-items:flex-start;line-height:1.35}",
      R + " .ksb-noaddr-i{font-size:18px;line-height:1}",

      R + " .ksb-instr{margin:14px 0 0;font-size:14px;color:#75736E;line-height:1.4}",
      R + " .ksb-arrow{color:#D65A35;font-weight:600;margin-right:6px}",

      /* the member's own words on a bag request — the line the operator reads to judge */
      R + " .ksb-req-reason{margin:12px 0 0;font-size:15px;color:#1E1A19;line-height:1.4}",

      /* in-transit queue — the return-stamp cards (no address, no age colour) */
      R + " .ksb-transit-meta{margin-top:14px;background:#EEEFE3;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:9px}",
      R + " .ksb-tl{display:flex;justify-content:space-between;align-items:baseline;gap:14px;font-size:14px}",
      R + " .ksb-tl-k{color:#75736E;font-weight:600;white-space:nowrap}",
      R + " .ksb-tl-v{color:#1E1A19;font-weight:600;text-align:right}",
      R + " .ksb-tl-v em{font-style:normal;font-weight:500;color:#75736E}",
      R + " .ksb-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;letter-spacing:.01em;word-break:break-all}",

      /* the job — the heart of the card */
      R + " .ksb-job{margin-top:16px;background:#EEEFE3;border-radius:14px;padding:14px}",
      R + " .ksb-job-t{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#75736E;margin-bottom:11px}",
      R + " .ksb-of2{color:#BE4C2E}",
      R + " .ksb-field{position:relative;margin-top:10px}",
      R + " .ksb-field:first-of-type{margin-top:0}",
      R + " .ksb-field label{font-size:13px;font-weight:600;color:#1E1A19;display:block;margin-bottom:5px}",
      R + " .ksb-field em{font-style:normal;font-weight:500;color:#75736E}",
      /* 16px minimum: below it, iOS zooms the page on focus */
      R + " .ksb-field input{width:100%;height:52px;border-radius:11px;border:2px solid #EEEFE3;background:#FFF;padding:0 44px 0 14px;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;color:#1E1A19}",
      R + " .ksb-field input:focus{outline:none;border-color:#D65A35}",
      R + " .ksb-field.is-done input{border-color:#4E9360}",
      R + " .ksb-tick{position:absolute;right:14px;top:36px;font-size:18px;color:#4E9360;display:none}",
      R + " .ksb-field.is-done .ksb-tick{display:inline}",

      R + " .ksb-actions{display:flex;gap:10px;margin-top:16px}",
      R + " .ksb-btn{height:54px;border-radius:13px;border:none;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;cursor:pointer;flex:1;display:inline-flex;align-items:center;justify-content:center}",
      R + " .ksb-btn--go{background:#D65A35;color:#FFF}",
      R + " .ksb-btn--go:hover{background:#BE4C2E}",
      /* ⚠ NO OPACITY (§DASH.2) — the disabled state is a solid hex, not a faded coral */
      R + " .ksb-btn--go:disabled{background:#EEEFE3;color:#75736E;cursor:not-allowed}",
      R + " .ksb-btn--ghost{flex:0 0 auto;background:#FFF;color:#75736E;border:2px solid #EEEFE3;padding:0 18px}",
      R + " .ksb-btn--sm{height:40px;font-size:14px;flex:0 0 auto;padding:0 16px}",
      R + " .ksb-btn--wide{flex:1}",
      R + " .ksb-lock{font-size:12.5px;color:#75736E;margin-top:9px;text-align:center;font-weight:600}",
      R + " .ksb-lock.is-ready{color:#4E9360}",

      R + " .ksb-add{width:100%;height:52px;border-radius:14px;margin-top:4px;background:#FFF;border:2px dashed #75736E;color:#BE4C2E;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;cursor:pointer}",
      R + " .ksb-form{background:#FFF;border-radius:18px;box-shadow:0 10px 30px -12px #C9C7BC;padding:16px;margin-top:12px}",
      R + " .ksb-flabel{font-size:13px;font-weight:600;margin:12px 0 6px}",
      R + " .ksb-flabel:first-child{margin-top:0}",
      R + " .ksb-form select{width:100%;height:52px;border-radius:11px;border:2px solid #EEEFE3;background:#FFF;padding:0 14px;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;color:#1E1A19}",
      R + " .ksb-reasons{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      R + " .ksb-reason{border:2px solid #EEEFE3;border-radius:11px;padding:11px 10px;cursor:pointer;font-size:14px;font-weight:600;text-align:center;background:#FFF;color:#1E1A19;font-family:Quicksand,sans-serif;min-height:56px}",
      R + " .ksb-reason.is-sel{border-color:#D65A35;background:#F7E4D9}",
      R + " .ksb-reason-c{display:block;font-size:11.5px;font-weight:600;margin-top:3px}",
      R + " .ksb-reason-c.is-free{color:#4E9360}",
      R + " .ksb-reason-c.is-paid{color:#BE4C2E}",
      R + " .ksb-paid{margin-top:12px;background:#F7E4D9;border-radius:11px;padding:11px 13px;font-size:13.5px;font-weight:600;color:#BE4C2E;line-height:1.35}",
      R + " .ksb-dup{margin-top:12px;background:#F7E4D9;border:2px solid #E5AD43;border-radius:11px;padding:11px 13px;font-size:13.5px;font-weight:600;color:#1E1A19;line-height:1.4}",

      /* desktop: just a wider column and side-by-side fields. Not a second build. */
      "@media(min-width:721px){" + R + " .ksb{max-width:720px}" +
        R + " .ksb-job{display:grid;grid-template-columns:1fr 1fr;gap:12px;grid-template-areas:'t t' 'a b'}" +
        R + " .ksb-job-t{grid-area:t;margin-bottom:0}" +
        R + " .ksb-field:first-of-type{grid-area:a}" +
        R + " .ksb-field:last-of-type{grid-area:b;margin-top:0}" +
        R + " .ksb-btn--go{flex:0 0 auto;padding:0 28px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ---------- boot ------------------------------------------------------- */

  function boot() {
    _root = el(MOUNT_ID);
    if (!_root) { console.warn("[ks-bags] no #" + MOUNT_ID + " on this page"); return; }
    injectCSS();
    _root.innerHTML = '<p style="font-family:Quicksand,sans-serif;color:#75736E;padding:16px">Loading the ship desk...</p>';

    /* ⚠ getMemberCookie() is SYNCHRONOUS — it returns the token STRING, not a promise.
       Calling .then() on it throws OUTSIDE the catch below and freezes the page on
       "Loading...". Found live 2026-07-12. */
    var c = window.$memberstackDom.getMemberCookie();
    _token = (c && c.data) ? c.data : c;

    call({ action: "read" }).then(function (res) {
      _panel = res.panel;
      render();
      console.log("[ks-bags] build " + BUILD);
    }).catch(function (e) {
      _root.innerHTML = '<p style="font-family:Quicksand,sans-serif;color:#D65A35;padding:16px">' +
        esc(e.message || "Couldn't load the ship desk.") + "</p>";
      console.error("[ks-bags]", e);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
