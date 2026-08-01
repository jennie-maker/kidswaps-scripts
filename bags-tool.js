/* ks-bags — the ship desk. /admin/bags
   Phone-first: cards are the primary layout, desktop just widens the fields.
   Server is authoritative on every guard; this file is the hands, not the brain.
   Path A: Jennie prints labels in Shippo's own UI and pastes the tracking back.
   ⚠ The panel NEVER calls Shippo. Under Path B the EDGE FN fills these same two
     fields from the API and this client's contract does not change.
*/
(function () {
  "use strict";

  /* ⚠ THE STAMP PARSES ITS OWN SHA OUT OF THE SCRIPT SRC — the pattern lifted from
     browse-tool.js / signup-tool.js. It CANNOT go stale and needs no edit before a
     commit: a new commit stamps itself. The old hardcoded "v4-requests" label was a
     hand-typed string, so this page's stamp could never say which commit was live and
     every verification needed a server-side fetch instead. Falls back to the label if
     currentScript is unavailable. */
  var _src = (document.currentScript && document.currentScript.src) || "";
  var _sha = (_src.match(/scripts@([0-9a-f]+)\//) || [])[1];
  var BUILD = _sha || "v5-age-unpinned";

  /* ⚠ STAMPED HERE, NOT INSIDE THE READ'S SUCCESS BRANCH. It used to print only after
     the panel loaded, so a failed read printed an error and NO stamp — exactly the
     moment you most need to know which file is running. */
  console.log("[ks-bags] build " + BUILD);

  var FN = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/bags-manage";
  var MOUNT_ID = "ks-bags-app";

  /* ⚠ AGING — GUARD 3. Deliberately constants, not a migration. Change the numbers;
     nothing else moves.
     ⚠⚠ HOURS, NOT DAYS, AND THE UNIT IS THE POINT. Her target is "all orders shipped
     within 24 hours" (S94) — OPERATOR-ONLY, nothing member-facing promises it. A ladder
     counting in days cannot express a 24-hour bar: "1 day old" could be 25 hours or 47.
     ⚠ GREEN-FOR-ON-TIME IS HERS. Claude argued for a neutral grey so that ANY colour
     meant "look at me"; she ruled for an affirming green. The float-to-top sort is what
     makes that safe, because POSITION carries the urgency, not colour. Do NOT "correct"
     green back to grey. */
  var AGE_AMBER_HOURS = 24;
  var AGE_RED_HOURS = 48;

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
  /* one-shot confirmation line, consumed and cleared by render() */
  var _flash = null;

  /* ---------- short id — the handle SQL uses ----------------------------- */

  /* ⚠ TEXT, NEVER COLOUR. Colour on this page already means AGE (the ladder) plus blue
     for first-bag cards; a second colour language would fight it. Two cards for one
     member at one address are otherwise identical apart from a small source chip, and
     S104 cancelled the wrong bag three times in twenty minutes because of it. */
  function shortId(id) { return String(id == null ? "" : id).slice(0, 8); }

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

  /* ⚠ hoursSince IS A SIBLING OF daysSince, NOT A REPLACEMENT. daysSince still serves
     THREE other call sites that must not change unit: "Out N days" (in transit),
     "Open N days" (cases) and "Asked N days ago" (requests). Only the send-queue
     ladder and its sort read hours, and both key on opened_at. */
  function hoursSince(iso) {
    if (!iso) return 0;
    var then = new Date(iso).getTime();
    if (isNaN(then)) return 0;
    return Math.floor((Date.now() - then) / 3600000);
  }

  function ageClass(h) {
    if (h >= AGE_RED_HOURS) return "ksb-red";
    if (h >= AGE_AMBER_HOURS) return "ksb-amber";
    return "ksb-fresh";
  }

  /* Hours below 48, days at and above it. Continuous at the handover: 48 hours reads
     "2 days old", so there is no gap and no double-naming of the same moment. */
  function ageText(h) {
    if (h < 1) return "Under an hour";
    if (h === 1) return "1 hour old";
    if (h < AGE_RED_HOURS) return h + " hours old";
    var d = Math.floor(h / 24);
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

  /* ⚠ THE FOURTH ARGUMENT IS OPTIONAL AND EVERY EXISTING CALL PASSES THREE. It carries
     a one-line confirmation, now A PLAIN STRING. It has to be set HERE, on the success
     branch, because render() runs inside this function — setting it after withBusy
     resolves would need a second render. render() consumes and clears it, so a failed
     call cannot leave a stale message behind.
     ⚠⚠ IT USED TO BE {q,t} AND PRINT INSIDE THE SECTION THE CARD LEFT. HER RULING S111:
     "the page jumps around and its not a noticeable sentence." The jump is structural —
     a card leaves the queue while a line is inserted above it — so the fix is to stop
     tying the message to a place on the page. DO NOT RESTORE THE q KEY. */
  function withBusy(p, btn, busyText, flash) {
    if (_busy) return Promise.resolve(null);
    _busy = true;
    var old = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = busyText || "Working..."; }
    return p.then(function (res) {
      if (res && res.panel) { _flash = flash || null; _panel = res.panel; render(); }  /* flash: a string */
      return res;
    }).catch(function (e) {
      alert(e.message + (e.detail ? "\n\n" + e.detail : ""));
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }).finally(function () { _busy = false; });
  }

  /* ---------- a bag card (BOTH queues end the same way) ------------------ */

  function bagCard(r) {
    var h = hoursSince(r.opened_at);
    var isOrder = r.source === "order";
    var paid = r.source === "requested_paid";

    return '' +
      /* ⚠ data-bagsrc IS READ BY TWO THINGS, AND IT IS **NOT** data-src — that attribute
         already means "reason tile" on the send form and the tile handler climbs to the
         nearest [data-src]. Two meanings for one attribute name is a trap, not a saving.
         The two readers: Cancel's confirm (to name the bag TYPE from
         SOURCE_LABEL rather than scraping chip text) and the ship confirmation line
         (to know which of the two send queues the card left). */
      '<article class="ksb-card ' + ageClass(h) + '" data-bag="' + esc(r.id) + '"' +
        ' data-bagsrc="' + esc(r.source) + '">' +
        '<div class="ksb-top">' +
          '<h3 class="ksb-name">' + esc(fullName(r)) + "</h3>" +
          '<span class="ksb-age">' + esc(ageText(h)) + "</span>" +
        "</div>" +

        '<div class="ksb-chips">' +
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>" +
          '<span class="ksb-chip ksb-chip--type">' + esc(SOURCE_LABEL[r.source] || r.source) + "</span>" +
          '<span class="ksb-chip ksb-chip--id">' + esc(shortId(r.id)) + "</span>" +
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

          /* ⚠⚠ CARRIER — CAPTURED HERE, NEVER DERIVED. The shipped email builds its
             tracking link from this, and a wrong carrier is a link that renders
             perfectly and goes nowhere. Sniffing the barcode prefix (92/94 vs 1Z)
             was REJECTED — it is the barcode-parser argument in a hat, already
             turned down on #BAG-TRACKING for encoding one label read once.
             ⚠ NOTHING IS PRE-SELECTED, ON PURPOSE. A default here is the same shape
             as swap_bags.source defaulting to 'order' and silently billing $15.
             ⚠ REUSES .ksb-reasons/.ksb-reason/.is-sel so this needs NO new CSS —
             the head box on /admin/bags is unversioned and has no rollback.
             ⚠ data-act IS REQUIRED. The root click handler opens with
             closest("[data-act]") and returns on null, so a chip without it is
             inert and looks fine. */
          '<div class="ksb-flabel">Carrier</div>' +
          '<div class="ksb-reasons" data-cf="carrier">' +
            '<button class="ksb-reason" data-act="carrier" data-carrier="usps">USPS</button>' +
            '<button class="ksb-reason" data-act="carrier" data-carrier="ups">UPS</button>' +
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
        '<div class="ksb-lock">Both tracking numbers and the carrier needed to ship</div>' +
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
          '<span class="ksb-chip ksb-chip--id">' + esc(shortId(r.id)) + "</span>" +
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

  /* ⚠⚠ THE EMAIL IS DISPLAYED, NOT THE PLAN, AND THAT IS THE WHOLE POINT. Every member
     on this list reads "The Basics", so plan disambiguates NOTHING while two names both
     begin "Jenni". The email is the only unique handle — and on /admin/grading it is
     also what tells the real member list apart from iOS's AutoFill Contact chip.
     ⚠ SEARCH IS BY NAME **OR** EMAIL. Name, because the SHIPPING LABEL carries a name
     and never an email, so name is the handle at the moment the bag is in her hands.
     ⚠ IF THE PAYLOAD CARRIES NO EMAIL this degrades to the plan rather than showing a
     bare name. That is a fail-soft, NOT evidence the email is there — get_bags_panel's
     members key is the thing to read if the emails do not render. */
  function memberOptions(q) {
    var needle = String(q || "").trim().toLowerCase();
    var members = (_panel.members || []).slice().sort(function (a, b) {
      return fullName(a).localeCompare(fullName(b));
    });

    return members.filter(function (m) {
      if (!needle) return true;
      var hay = (fullName(m) + " " + (m.email || "")).toLowerCase();
      return hay.indexOf(needle) > -1;
    }).map(function (m) {
      var tail = m.email || m.plan || "no plan";
      return '<option value="' + esc(m.member_id) + '" data-open="' + m.open_bags + '">' +
             esc(fullName(m)) + " · " + esc(tail) + "</option>";
    }).join("");
  }

  function sendForm() {
    var opts = memberOptions("");

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
        '<input class="ksb-filter" id="ksb-f-filter" type="search" autocomplete="off" ' +
          'spellcheck="false" placeholder="Filter by name or email">' +
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
      /* ⚠⚠ THESE FOUR ATTRIBUTES EXIST ONLY SO THE RESOLVE CONFIRM CAN NAME THE CASE.
         Nothing renders them — the card looks identical. They are here rather than read
         from panel state because a confirm built from panel state can describe a
         different row than the one under her thumb (the S110 Cancel ruling).
         ⚠ swap_bag_id IS NULL ON MOST CASES — three of the four ever written read null.
         The empty string is expected; the dialog degrades to "No bag linked". */
      '<article class="ksb-card ksb-case" data-case="' + esc(r.id) + '"' +
        ' data-case-bag="' + esc(r.swap_bag_id || "") + '"' +
        ' data-case-bagsrc="' + esc(r.bag_source || "") + '"' +
        ' data-case-rt="' + esc(r.return_tracking || "") + '"' +
        ' data-case-reason="' + esc(REASON_LABEL[r.reason] || r.reason || "") + '">' +
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
    function byAge(a, b) { return hoursSince(a.opened_at) - hoursSince(b.opened_at); }
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

    /* ⚠ ONE-SHOT, and it must fire AFTER innerHTML: the toast lives on document.body,
       not inside _root, precisely so this rewrite cannot delete it mid-life. */
    if (_flash) toast(_flash);
    _flash = null;
    wire();
  }

  /* ---------- the toast -------------------------------------------------- */

  /* ⚠⚠ ANCHORED TO THE TOP OF THE VIEWPORT, NOT THE BOTTOM, AND THAT IS DELIBERATE.
     The Memberstack test-mode badge is fixed bottom-center with a huge z-index. The
     doc's usual answer is "unverified until seen in incognito" — but /admin/bags is
     Memberstack-gated and CANNOT be opened in incognito, and its only user is the
     operator, signed in, with that badge present on every single load. So the badge is
     not a hazard to clear here, it is a permanent resident. Top-center never meets it.
     ⚠⚠ IT IS INK, AND IT IS DELIBERATELY **NOT** GREEN. She read the first cream
     version live — "the cream almost disappeared in the background" — and asked for green
     and larger, then delegated the choice. GREEN WAS DECLINED BECAUSE GREEN ALREADY MEANS
     ON-TIME IN THE AGE LADDER, seconds apart on the same screen, and red is the only
     FILLED badge precisely so that a fill escalates. Ink sits outside the age language
     entirely, so it can be loud without borrowing a meaning. CLAUDE'S CALL, REVERSIBLE —
     if it ever goes green it must be a DARK stop (#1F5C38); white on brand green measures
     3.86 and fails AA. DO NOT give this a coral. */
  var _toastEl = null, _toastT = null;

  function toast(msg) {
    if (_toastT) { clearTimeout(_toastT); _toastT = null; }
    if (_toastEl && _toastEl.parentNode) _toastEl.parentNode.removeChild(_toastEl);
    var d = document.createElement("div");
    d.className = "ksb-toast";
    d.setAttribute("role", "status");
    d.textContent = msg;
    document.body.appendChild(d);
    _toastEl = d;
    _toastT = setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
      if (_toastEl === d) _toastEl = null;
      _toastT = null;
    }, 4200);   /* 4.2s — 3.6 was survivable but she had to be looking. */
  }

  /* ---------- wiring ----------------------------------------------------- */

  /* ⚠⚠ GUARD 1, EXTENDED S127 — THREE THINGS NOW, NOT TWO: both tracking numbers
     AND a carrier. Split out of checkJob because the carrier chips have no input
     event to ride; both the typing path and the tapping path call this.
     ⚠ The two tracking numbers still carry the guard's original weight: a tracking
     number cannot be invented, so holding two is proof the labels were really
     printed. The carrier is one more thing to COPY off the Shippo row she is
     already looking at, not one more thing to know. */
  function gateShip(card) {
    if (!card) return;
    var ins = card.querySelectorAll("[data-tr]");
    var both = true;
    for (var i = 0; i < ins.length; i++) {
      if (!ins[i].value.trim()) { both = false; break; }
    }
    var carrier = card.querySelector("[data-carrier].is-sel");
    var ready = both && !!carrier;

    var btn = card.querySelector('[data-act="ship"]');
    var lock = card.querySelector(".ksb-lock");
    btn.disabled = !ready;
    if (ready) {
      lock.textContent = "✓ Both labels captured — safe to ship";
      lock.classList.add("is-ready");
    } else if (both) {
      lock.textContent = "Pick the carrier to ship";
      lock.classList.remove("is-ready");
    } else {
      lock.textContent = "Both tracking numbers and the carrier needed to ship";
      lock.classList.remove("is-ready");
    }
  }

  function checkJob(input) {
    var field = input.parentNode;
    var has = input.value.trim().length > 0;
    if (has) field.classList.add("is-done"); else field.classList.remove("is-done");
    gateShip(input.closest("[data-bag]"));
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

    /* ⚠ THE FILTER REBUILDS THE OPTIONS AND KEEPS A STILL-VISIBLE SELECTION. If the
       filtered list no longer holds the picked member, the selection is CLEARED and the
       duplicate warning goes with it — a stale member_id sitting behind a narrowed list
       is exactly how you mail a bag to the wrong person. */
    var filt = el("ksb-f-filter");
    if (filt) {
      filt.addEventListener("input", function () {
        var was = mSel.value;
        mSel.innerHTML = '<option value="">Pick a member...</option>' + memberOptions(filt.value);
        var kept = false;
        for (var i = 0; i < mSel.options.length; i++) {
          if (mSel.options[i].value === was && was) { mSel.selectedIndex = i; kept = true; break; }
        }
        if (!kept) { mSel.value = ""; warn.hidden = true; }
      });
    }

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
      withBusy(call({ action: "create", member_id: mSel.value, source: _formSource }), e.target, "Creating...", "Bag created. It's in Bags to send.");
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
        withBusy(call({ action: "create", member_id: n.getAttribute("data-needs"), source: "signup" }), btn, "Creating...", "Bag created. It's in Bags to send.");
        return;
      }

      /* ---- CASES (make-good desk) ---- */
      var caseCard = btn.closest("[data-case]");
      if (caseCard) {
        var caseId = caseCard.getAttribute("data-case");

        /* ⚠⚠ THE CONFIRM MUST NAME THE CASE — the same guard Cancel got at S110, for the
           same reason: resolving is irreversible, and one case card is visually identical
           to another apart from a name. Harmless while exactly one case exists; dangerous
           the first time there are two. READ OFF THE CLICKED CARD, never panel state.
           ⚠ var-assigned, not a function declaration: this file is strict mode and a
           declaration inside a block would not hoist the way it reads. */
        var caseIdent = function () {
          var cWho  = (caseCard.querySelector(".ksb-name") || {}).textContent || "this member";
          var cAge  = (caseCard.querySelector(".ksb-age") || {}).textContent || "";
          var cRsn  = caseCard.getAttribute("data-case-reason") || "";
          var cBag  = caseCard.getAttribute("data-case-bag") || "";
          var cBSrc = caseCard.getAttribute("data-case-bagsrc") || "";
          var cRt   = caseCard.getAttribute("data-case-rt") || "";
          return cWho + "\n" +
            "Case " + shortId(caseId) + (cRsn ? " \u00b7 " + cRsn : "") + (cAge ? " \u00b7 " + cAge : "") + "\n" +
            (cBag
              ? "Bag " + shortId(cBag) +
                (SOURCE_LABEL[cBSrc] ? " \u00b7 " + SOURCE_LABEL[cBSrc] : "") +
                (cRt ? " \u00b7 " + cRt : "")
              : "No bag linked to this case");
        };

        /* tile selection inside the credit form: flip is-sel among siblings */
        if (btn.classList.contains("ksb-reason")) {
          var group = btn.parentNode;
          var sibs = group.querySelectorAll(".ksb-reason");
          for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove("is-sel");
          btn.classList.add("is-sel");
          return;
        }

        if (act === "resolve-reship") {
          if (!confirm("Reship a make-good bag?\n\n" + caseIdent() +
            "\n\nThis mints a comp bag in the send queue — check the address, then print. It does not use up her free bag.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "reship" }), btn, "Reshipping...");
          return;
        }

        if (act === "resolve-decline") {
          if (!confirm("Decline this case?\n\n" + caseIdent() +
            "\n\nNothing is issued — no bag, no credit. The case closes. Use this when the reason doesn't hold up.")) return;
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
          if (!confirm("Issue " + amount + " " + tier + " " + creditClass + " credit?\n\n" + caseIdent() +
            "\n\nThis closes the case and adds the credit to her bank. It can't be undone from here.")) return;
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

      /* Carrier chip: flip is-sel among its siblings, then re-run the gate.
         ⚠ SCOPED TO THE CLICKED CARD's OWN GROUP (btn.parentNode), never the page —
         several send cards render at once and each holds its own carrier. */
      if (act === "carrier") {
        var cGroup = btn.parentNode;
        var cSibs = cGroup.querySelectorAll("[data-carrier]");
        for (var ci = 0; ci < cSibs.length; ci++) cSibs[ci].classList.remove("is-sel");
        btn.classList.add("is-sel");
        gateShip(card);
        return;
      }

      if (act === "ship") {
        var out = card.querySelector('[data-tr="out"]').value.trim();
        var ret = card.querySelector('[data-tr="ret"]').value.trim();
        var carEl = card.querySelector("[data-carrier].is-sel");
        var car = carEl ? carEl.getAttribute("data-carrier") : "";
        if (!out || !ret || !car) return;   /* unreachable — the button is disabled. Belt to the server's braces. */
        /* ⚠ A SHIPPED BAG CORRECTLY VANISHES FROM THIS QUEUE AND NOTHING SAID WHERE IT
           WENT. The line now prints as a toast at the top of the viewport, so it lands
           where her eyes are whatever the scroll position — HER RULING S111. In transit
           IS the destination; do not give this a section of its own. */
        withBusy(call({
          action: "ship", bag_id: bagId,
          outbound_tracking: out, return_tracking: ret, carrier: car
        }), btn, "Shipping...", "Shipped. Moved to In transit.");
        return;
      }

      if (act === "cancel") {
        /* ⚠⚠ THE CONFIRM MUST NAME THE BAG — the guard-against-myself pattern "Mark
           returned" already had. This dialog used to be byte-identical for every bag on
           the page, and two cards for one member at one address are visually identical
           apart from a small chip. S104 cancelled the wrong bag three times in twenty
           minutes and every mistake was invisible until the database was read.
           ⚠ READ OFF THE CLICKED CARD, never from panel state — it cannot then describe
           a different row than the one under her thumb. */
        var cWho = (card.querySelector(".ksb-name") || {}).textContent || "this member";
        var cSrc = card.getAttribute("data-bagsrc") || "";
        var cType = SOURCE_LABEL[cSrc] || cSrc || "Bag";
        var cAge = (card.querySelector(".ksb-age") || {}).textContent || "";
        var cMsg = "Cancel this bag?\n\n" + cWho + "\n" +
          cType + " · " + shortId(bagId) + (cAge ? " · " + cAge : "") +
          "\n\nUse this when two rows exist for one physical bag. It won't count against her shipping.";
        if (!confirm(cMsg)) return;
        withBusy(call({ action: "cancel", bag_id: bagId }), btn, "Cancelling...", "Cancelled. This bag is off the queue.");
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
        withBusy(call({ action: "return", bag_id: bagId }), btn, "Marking...", "Marked returned. Off the In transit list.");
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
      /* ⚠⚠ THE ONE RULE IN THIS FILE THAT IS **NOT** PREFIXED WITH THE MOUNT ID, AND IT
         HAS TO BE: the toast is appended to document.body so that render()'s innerHTML
         rewrite cannot destroy it, which puts it outside #ks-bags-app entirely. A
         prefixed rule would match nothing and the toast would paint unstyled.
         ⚠ The layout properties carry !important because this element sits in Webflow's
         page, not in our mount, where global styles reach it. */
      ".ksb-toast{position:fixed!important;top:20px;left:50%;transform:translateX(-50%);z-index:99999;max-width:min(460px,calc(100vw - 24px));margin:0;padding:16px 24px;border-radius:14px;background:#1E1A19;color:#EEEFE3;box-shadow:0 10px 30px rgba(30,26,25,.30);font-family:Quicksand,sans-serif;font-size:18px;font-weight:700;line-height:1.3;text-align:center;pointer-events:none}",
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
      /* ⚠ .ksb-fresh WAS EMITTED BY ageClass() WITH NO RULE BEHIND IT — an inert class,
         which is why an on-time card read grey. This is the whole green build.
         ⚠⚠ #256F43 IS A DARK STOP AND BRAND GREEN WOULD BE WRONG HERE. Contrast is
         symmetric, so the measured 3.86 for white-on-#309359 is ALSO #309359 text on a
         white card: it FAILS AA either way. #256F43 reads 6.12 against white.
         ⚠ GREEN IS COLOURED TEXT, NOT A FILLED BADGE — CLAUDE'S CALL, REVERSIBLE. It
         matches AMBER's shape on purpose. RED is the only filled badge, and the fill is
         what makes red escalate; filling green too would flatten the ladder and teach
         the operator to ignore all three. */
      R + " .ksb-fresh{border-left-color:#256F43}",
      R + " .ksb-amber{border-left-color:#E5AD43}",
      R + " .ksb-red{border-left-color:" + RED + "}",
      R + " .ksb-first{border-left-color:#28498D}",

      R + " .ksb-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}",
      R + " .ksb-name{font-family:Quicksand,sans-serif!important;font-size:20px!important;font-weight:600!important;margin:0!important;color:#1E1A19!important;letter-spacing:-.01em}",
      R + " .ksb-age{font-size:13px;color:#75736E;font-weight:600;white-space:nowrap;padding-top:3px}",
      R + " .ksb-fresh .ksb-age{color:#256F43}",
      R + " .ksb-amber .ksb-age{color:#E5AD43}",
      /* the overdue badge is FILLED — colour + shape + size, not just a hairline */
      R + " .ksb-red .ksb-age{color:#FFF;background:" + RED + ";padding:5px 10px;border-radius:11px;font-size:12.5px;padding-top:5px}",

      R + " .ksb-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}",
      R + " .ksb-chip{font-size:13px;font-weight:600;padding:5px 11px;border-radius:20px;background:#EEEFE3;color:#1E1A19}",
      R + " .ksb-chip--type{background:#F7E4D9;color:#BE4C2E}",
      /* ⚠ THE ID CHIP IS DELIBERATELY THE QUIETEST THING ON THE CARD — monospace so it
         reads as a serial number, muted grey so it takes NO meaning-bearing colour.
         Colour on this page means AGE. Do not give this a fill. */
      R + " .ksb-chip--id{background:transparent;border:1px solid #C9C7BC;color:#75736E;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.02em}",
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
      /* ⚠ 16px MINIMUM ON AN INPUT or iOS Safari zooms in and does not zoom back out. */
      R + " .ksb-filter{width:100%;height:46px;border-radius:11px;border:2px solid #EEEFE3;background:#FFF;padding:0 14px;margin-bottom:8px;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;color:#1E1A19}",
      R + " .ksb-filter:focus{outline:none;border-color:#D65A35}",
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
      /* ⚠ THE STAMP MOVED TO THE TOP OF THE FILE. Do not restore a second one here —
         TWO [ks-bags] LINES IS THIS PROJECT'S TELL FOR A DUPLICATE SCRIPT TAG, and one
         file printing twice would be a false alarm on the page's only instrument. */
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
