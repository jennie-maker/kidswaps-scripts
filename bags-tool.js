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
  var BUILD = _sha || "v6-tabs-unpinned";

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
  /* S410: the tabbed desk's own state. _tab is the picked tab; _sel holds the picked
     row's key per tab; _idx remembers its position so that when a row LEAVES (shipped,
     cancelled, returned) the row that slid into its place opens next (hers S409). */
  var _tab = null;
  var _sel = {};
  var _idx = {};
  var _phoneOpen = false;
  /* typed tracking numbers and the picked carrier, per row key, so switching tabs or a
     refresh never throws away half a job */
  var _draft = {};
  /* ⚠ FIRST BAGS: member id -> the bag this page already made for her. If the create
     lands and the ship fails, a second press must SHIP THAT BAG, never make another. */
  var _made = {};
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

  /* ⚠ S409, HERS (S395): names are STORED as typed ("walker three") and Shippo keeps
     whatever is copied off this card, so the card shows capitals. Only the first
     letter of each word is raised; the rest is left alone so "McDonald" survives.
     Display only: nothing here writes the name back. The email fallback is never
     touched. */
  function capWords(t) {
    return String(t).replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function fullName(r) {
    var n = ((r.first_name || "") + " " + (r.last_name || "")).trim();
    return n ? capWords(n) : (r.email || "Unknown member");
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

  /* ⚠ S409, HER ASK S193: the ship card shows WHEN the bag was made, labelled
     "Created", never "Requested". Reads opened_at, the same field the age ladder
     uses, so no server change. e.g. "Sep 24, 9:26 PM". */
  function fmtCreated(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  /* ⚠ S410, HERS S409: the copy buttons copy WITH CAPITALS, city too ("reno" is stored
     as typed and Shippo keeps whatever is pasted). The card shows the same capitals, so
     what she reads is exactly what she pastes. Display and clipboard only: nothing here
     writes the address back. The state is raised whole ("nv" -> "NV"). */
  function addrParts(r) {
    var l1 = capWords((r.shipping_address_line1 || "").trim());
    var l2 = capWords((r.shipping_address_line2 || "").trim());
    var city = capWords((r.shipping_city || "").trim());
    var st = (r.shipping_state || "").trim().toUpperCase();
    var zip = (r.shipping_zip || "").trim();
    var last = (city + (city && st ? ", " : "") + st + " " + zip).trim();
    return { l1: l1, l2: l2, last: last };
  }
  function addrText(r) {
    var a = addrParts(r);
    return [a.l1, a.l2, a.last].filter(Boolean).join("\n");
  }
  function addressBlock(r, withCopy) {
    var a = addrParts(r);
    if (!a.l1) {
      return '<div class="ksb-noaddr"><span class="ksb-noaddr-i">⚠</span>' +
             '<span>NO ADDRESS ON FILE. Do not print a label.</span></div>';
    }
    var out = '<div class="ksb-addr"><div class="ksb-addr-who">' + esc(fullName(r)) + "</div>";
    out += '<div class="ksb-addr-l">' + esc(a.l1) + "</div>";
    if (a.l2) out += '<div class="ksb-addr-l">' + esc(a.l2) + "</div>";
    out += '<div class="ksb-addr-l">' + esc(a.last) + "</div>";
    if (withCopy) {
      out += '<div class="ksb-copyrow">' +
        '<button class="ksb-copy" data-act="copy-name">Copy name</button>' +
        '<button class="ksb-copy" data-act="copy-addr">Copy address</button>' +
      "</div>";
    }
    return out + "</div>";
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

  /* ⚠ THE FOURTH ARGUMENT IS OPTIONAL. It carries a one-line confirmation, a PLAIN
     STRING, set HERE on the success branch because render() runs inside this function.
     render() consumes and clears it, so a failed call cannot leave a stale message.
     ⚠ HER RULING S111: the message is a toast at the top of the viewport, never a line
     tied to a place on the page. DO NOT RESTORE THE q KEY. */
  function withBusy(p, btn, busyText, flash) {
    if (_busy) return Promise.resolve(null);
    _busy = true;
    var old = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = busyText || "Working..."; }
    return p.then(function (res) {
      if (res && res.panel) { _flash = flash || null; _panel = res.panel; render(); }
      return res;
    }).catch(function (e) {
      alert(e.message + (e.detail ? "\n\n" + e.detail : ""));
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }).finally(function () { _busy = false; });
  }

  /* ---------- the five queues ------------------------------------------- */

  /* ⚠⚠ A NO-BAG MEMBER IS A FIRST BAG ONLY WHEN shop_first IS false (S409). A shop-first
     member's first bag rides her first ORDER; making her a signup bag mails a second,
     empty one. shop_first is true when she holds any 'starter_pack' credit.
     ⚠ STRICT === false, ON PURPOSE: a missing key (an old get_bags_panel) HIDES the
     member rather than offering a bag. Hiding is the safe failure; a stray bag is not.
     ⚠ GAP, KNOWN: pack credits land about a minute after signup, so a brand-new
     shop-first member can sit here for that minute. */
  function firstBagMembers() {
    return (_panel.members || []).filter(function (m) {
      return m.total_bags === 0 && m.shop_first === false;
    });
  }
  /* when she joined, if the panel carries it (it may not; the row then says so plainly) */
  function joinedAt(m) { return m.joined_at || m.created_at || m.signed_up_at || null; }

  function byAgeDesc(a, b) { return hoursSince(b.opened_at) - hoursSince(a.opened_at); }

  function queues() {
    /* ⚠ GUARD 3: OVERDUE FLOATS TO THE TOP. Position is the loudest signal there is. */
    var needs = firstBagMembers();
    var envelopes = (_panel.envelopes || []).slice().sort(byAgeDesc);
    var orders = (_panel.orders || []).slice().sort(byAgeDesc);

    function lvlOf(h) { return h >= AGE_RED_HOURS ? "red" : h >= AGE_AMBER_HOURS ? "amber" : "fresh"; }
    function shortAge(h) { return h < 1 ? "new" : h < AGE_RED_HOURS ? h + " hrs" : Math.floor(h / 24) + " days"; }

    function shipRow(r) {
      var h = hoursSince(r.opened_at);
      return {
        key: r.id, kind: "ship", r: r, name: fullName(r),
        isNew: r.source === "signup",
        sub: (r.source === "order" ? "" : (SOURCE_LABEL[r.source] || r.source) + " · ") +
             "Created " + fmtCreated(r.opened_at) + " · " + shortId(r.id),
        lvl: lvlOf(h), age: shortAge(h), h: h
      };
    }
    function needsRow(m) {
      var j = joinedAt(m);
      var h = j ? hoursSince(j) : null;
      return {
        key: "m:" + m.member_id, kind: "needs", r: m, name: fullName(m), isNew: true,
        sub: j ? "First bag · Joined " + fmtCreated(j) : "First bag · not made yet",
        lvl: h == null ? "none" : lvlOf(h), age: h == null ? "" : shortAge(h), h: h
      };
    }
    function transitRow(r) {
      var d = daysSince(r.shipped_at);
      return {
        key: r.id, kind: "transit", r: r, name: fullName(r),
        sub: "Shipped " + fmtDate(r.shipped_at) + " · " + shortId(r.id),
        lvl: "none", age: r.shipped_at ? d + (d === 1 ? " day" : " days") : ""
      };
    }
    function caseRow(r) {
      var d = daysSince(r.created_at);
      return {
        key: r.id, kind: "case", r: r, name: fullName(r),
        sub: (REASON_LABEL[r.reason] || r.reason || "Case") + " · " + shortId(r.id),
        lvl: "none", age: r.created_at ? d + (d === 1 ? " day" : " days") : ""
      };
    }
    function requestRow(r) {
      var d = daysSince(r.created_at);
      return {
        key: r.id, kind: "request", r: r, name: fullName(r),
        sub: "Asked " + (d === 0 ? "today" : d + (d === 1 ? " day ago" : " days ago")),
        lvl: "none", age: ""
      };
    }

    /* First bags go FIRST in their tab: she is the member who has had nothing yet. */
    return [
      { key: "bags", label: "Empty bags to send", short: "Empty bags", rows: needs.map(needsRow).concat(envelopes.map(shipRow)),
        empty: "No empty bags to send.",
        how: "Just an empty bag with the return label on it, folded into an envelope. No items." },
      { key: "orders", label: "Orders to send", short: "Orders", rows: orders.map(shipRow),
        empty: "No orders waiting. Checkout puts them here.",
        how: "Pack her items plus an empty bag with the return label on it." },
      /* ⚠ RPC orders in_transit, cases and requests oldest-first. No reverse. */
      { key: "transit", label: "In transit", short: "In transit", rows: (_panel.in_transit || []).map(transitRow),
        empty: "Nothing out. Shipped bags waiting to come back show up here." },
      { key: "cases", label: "Open cases", short: "Cases", rows: (_panel.cases || []).map(caseRow),
        empty: "No open cases. Lost, damaged and all-declined bags land here." },
      { key: "requests", label: "Bag requests", short: "Requests", rows: (_panel.requests || []).map(requestRow),
        empty: "No requests. Members asking for another bag this cycle land here." }
    ];
  }

  /* ---------- the open card: pieces ------------------------------------- */

  function ageBadge(row, longText) {
    return '<span class="ksb-age ksb-badge ksb-badge--' + row.lvl + '">' + esc(longText) + "</span>";
  }

  function cardHead(row, createdLine, badgeText) {
    return '' +
      '<button class="ksb-back" data-act="back" aria-label="Back to the list">‹ Back</button>' +
      '<div class="ksb-ch">' +
        '<div class="ksb-ch-l">' +
          '<h2 class="ksb-name">' + esc(row.name) + "</h2>" +
          (createdLine ? '<div class="ksb-created">' + createdLine + "</div>" : "") +
        "</div>" +
        (badgeText ? ageBadge(row, badgeText) : "") +
      "</div>";
  }

  function chips(list) {
    return '<div class="ksb-chips">' + list.filter(Boolean).join("") + "</div>";
  }
  function newTag() { return '<span class="ksb-chip ksb-chip--new">New member</span>'; }

  /* ---------- the ship card (both send tabs, first bags included) --------- */

  function shipCard(row, how) {
    var r = row.r;
    var isNeeds = row.kind === "needs";
    var paid = r.source === "requested_paid";
    var d = _draft[row.key] || {};
    var created = isNeeds
      ? (joinedAt(r) ? "<strong>Joined</strong> " + esc(fmtCreated(joinedAt(r))) : "<strong>First bag</strong> not made yet")
      : (fmtCreated(r.opened_at) ? "<strong>Created</strong> " + esc(fmtCreated(r.opened_at)) : "");
    var badge = row.h == null ? "" : (row.h < AGE_RED_HOURS ? ageText(row.h) : Math.floor(row.h / 24) + " days old");

    return '' +
      /* ⚠ data-ship IS THE ONE HANDLE BOTH KINDS SHARE (the gate, the drafts, the ship
         press). A normal bag also carries data-bag and data-bagsrc (Cancel's confirm
         reads them). A first bag carries data-needs INSTEAD: there is no bag yet, so
         there is nothing to cancel and no data-bag to find. */
      '<article class="ksb-open" data-ship="' + esc(row.key) + '"' +
        (isNeeds ? ' data-needs="' + esc(r.member_id) + '"'
                 : ' data-bag="' + esc(r.id) + '" data-bagsrc="' + esc(r.source) + '"') + ">" +
        cardHead(row, created, badge) +
        chips([
          row.isNew ? newTag() : "",
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>",
          '<span class="ksb-chip">' + esc(isNeeds ? "First bag" : (SOURCE_LABEL[r.source] || r.source)) + "</span>",
          isNeeds ? "" : '<span class="ksb-chip ksb-chip--id">' + esc(shortId(r.id)) + "</span>",
          paid ? '<span class="ksb-chip">$15 · not charged here</span>' : ""
        ]) +

        '<div class="ksb-pair">' +
          addressBlock(r, true) +
          '<p class="ksb-how">' + esc(how) +
            (isNeeds ? " Free, never counted, never billed. Mark shipped makes her bag and ships it in one press." : "") +
          "</p>" +
        "</div>" +

        /* THE JOB. Two labels, born in one sitting. */
        '<div class="ksb-job">' +
          '<div class="ksb-job-t">Two labels · one job</div>' +
          '<div class="ksb-fields">' +
            '<div class="ksb-field' + (d.out ? " is-done" : "") + '">' +
              "<label>Outbound tracking <em>(the package)</em></label>" +
              /* ⚠ inputmode TEXT, never numeric: UPS is 1Z..., a keypad cannot type a Z.
                 ⚠ SCANNER-FRIENDLY (hers S409): the Inateck ends each scan with Enter, and
                 Enter here jumps to the next field, never submits anything. */
              '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="out" placeholder="Scan or paste from Shippo" value="' + esc(d.out || "") + '">' +
              '<span class="ksb-tick">✓</span>' +
            "</div>" +
            '<div class="ksb-field' + (d.ret ? " is-done" : "") + '">' +
              "<label>Return tracking <em>(the bag inside)</em></label>" +
              '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="ret" placeholder="Scan or paste from Shippo" value="' + esc(d.ret || "") + '">' +
              '<span class="ksb-tick">✓</span>' +
            "</div>" +
          "</div>" +
          /* ⚠⚠ CARRIER: CAPTURED HERE, NEVER DERIVED. The shipped email builds its link
             from it. Sniffing 92/94 vs 1Z was REJECTED. NOTHING IS PRE-SELECTED, ON
             PURPOSE (the same shape as source defaulting to 'order' and billing $15). */
          '<div class="ksb-flabel">Carrier</div>' +
          '<div class="ksb-reasons" data-cf="carrier">' +
            '<button class="ksb-reason' + (d.car === "usps" ? " is-sel" : "") + '" data-act="carrier" data-carrier="usps">USPS</button>' +
            '<button class="ksb-reason' + (d.car === "ups" ? " is-sel" : "") + '" data-act="carrier" data-carrier="ups">UPS</button>' +
          "</div>" +
        "</div>" +

        /* ⚠⚠ GUARD 1: DISABLED UNTIL BOTH NUMBERS AND A CARRIER ARE IN. NO UNDO, on
           purpose: the package is in the mail. On a phone this row pins to the bottom. */
        '<div class="ksb-actions ksb-actions--pin">' +
          '<div class="ksb-actions-row">' +
            '<button class="ksb-btn ksb-btn--go" data-act="ship" disabled>Mark shipped</button>' +
            (isNeeds ? "" : '<button class="ksb-btn ksb-btn--ghost" data-act="cancel">Cancel</button>') +
          "</div>" +
          '<div class="ksb-lock">Both tracking numbers and the carrier needed to ship</div>' +
        "</div>" +
      "</article>";
  }

  /* ---------- in transit -------------------------------------------------- */

  /* ⚠ Marks returned by EXPLICIT bag_id, never the oldest guess. The confirm repeats
     the RETURN TRACKING: the guard against herself. NO AGE COLOUR: no SLA exists. */
  function transitCard(row) {
    var r = row.r;
    return '' +
      '<article class="ksb-open" data-bag="' + esc(r.id) + '" data-rt="' + esc(r.return_tracking || "") + '">' +
        cardHead(row, "<strong>Shipped</strong> " + esc(fmtDate(r.shipped_at)), row.age ? "Out " + row.age : "") +
        chips([
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>",
          '<span class="ksb-chip">' + esc(SOURCE_LABEL[r.source] || r.source) + "</span>",
          '<span class="ksb-chip ksb-chip--id">' + esc(shortId(r.id)) + "</span>"
        ]) +
        '<div class="ksb-transit-meta">' +
          '<div class="ksb-tl"><span class="ksb-tl-k">Shipped</span><span class="ksb-tl-v">' + esc(fmtDate(r.shipped_at)) + "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Delivered</span><span class="ksb-tl-v">' +
            (r.delivered_at ? esc(fmtDate(r.delivered_at)) : "<em>not yet</em>") + "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Return tracking</span><span class="ksb-tl-v ksb-mono">' + esc(r.return_tracking || "—") + "</span></div>" +
          '<div class="ksb-tl"><span class="ksb-tl-k">Outbound</span><span class="ksb-tl-v ksb-mono">' + esc(r.outbound_tracking || "—") + "</span></div>" +
        "</div>" +
        '<p class="ksb-instr">Back in your hands? Match the return tracking to the bag, then mark it returned.</p>' +
        '<div class="ksb-actions ksb-actions--pin"><div class="ksb-actions-row">' +
          '<button class="ksb-btn ksb-btn--go" data-act="return">Mark returned</button>' +
        "</div></div>" +
      "</article>";
  }

  /* ---------- a case (the make-good desk) --------------------------------- */

  var REASON_LABEL = {
    never_arrived: "Never arrived",
    lost: "Lost",
    damaged: "Damaged",
    all_declined: "All items declined"
  };

  /* ⚠⚠ THE data-case-* ATTRIBUTES EXIST ONLY SO THE RESOLVE CONFIRM CAN NAME THE CASE,
     read off the clicked card, never panel state (the S110 Cancel ruling).
     ⚠ swap_bag_id IS NULL ON MOST CASES; the dialog degrades to "No bag linked". */
  function caseCard(row) {
    var r = row.r;
    return '' +
      '<article class="ksb-open ksb-case" data-case="' + esc(r.id) + '"' +
        ' data-case-bag="' + esc(r.swap_bag_id || "") + '"' +
        ' data-case-bagsrc="' + esc(r.bag_source || "") + '"' +
        ' data-case-rt="' + esc(r.return_tracking || "") + '"' +
        ' data-case-reason="' + esc(REASON_LABEL[r.reason] || r.reason || "") + '">' +
        cardHead(row, "<strong>Opened</strong> " + esc(fmtCreated(r.created_at)), row.age ? "Open " + row.age : "") +
        chips([
          '<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>",
          '<span class="ksb-chip">' + esc(REASON_LABEL[r.reason] || r.reason) + "</span>",
          '<span class="ksb-chip ksb-chip--id">' + esc(shortId(r.id)) + "</span>"
        ]) +
        (r.notes ? '<p class="ksb-case-notes">' + esc(r.notes) + "</p>" : "") +
        /* Address shown because RESHIP mints a comp bag that needs one. */
        addressBlock(r, false) +
        '<p class="ksb-instr">Reship a make-good bag, credit her instead, or decline. Your call is the record.</p>' +
        '<div class="ksb-actions"><div class="ksb-actions-row">' +
          '<button class="ksb-btn ksb-btn--go" data-act="resolve-reship">Reship a bag</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-credit-toggle">Credit</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-decline">Decline</button>' +
        "</div></div>" +
        '<div class="ksb-cform" data-cform hidden>' +
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
          '<div class="ksb-reasons ksb-reasons--3" data-cf="tier">' +
            '<button class="ksb-reason is-sel" data-tier="essentials">Essentials</button>' +
            '<button class="ksb-reason" data-tier="elevated">Elevated</button>' +
            '<button class="ksb-reason" data-tier="special">Special</button>' +
          "</div>" +
          '<div class="ksb-actions"><div class="ksb-actions-row">' +
            '<button class="ksb-btn ksb-btn--go" data-act="resolve-credit-go">Issue credit</button>' +
            '<button class="ksb-btn ksb-btn--ghost" data-act="resolve-credit-cancel">Cancel</button>' +
          "</div></div>" +
        "</div>" +
      "</article>";
  }

  /* ---------- a bag request ----------------------------------------------- */

  /* A request is "I'd like another bag this cycle". Approve mints a COMP bag
     server-side (goodwill, never spends her entitlement, never bills $15). */
  function requestCard(row) {
    var r = row.r;
    return '' +
      '<article class="ksb-open ksb-request" data-request="' + esc(r.id) + '">' +
        cardHead(row, "<strong>Asked</strong> " + esc(fmtCreated(r.created_at)), "") +
        chips(['<span class="ksb-chip">' + esc(r.plan || "No plan") + "</span>"]) +
        '<p class="ksb-req-reason">' + esc(r.reason || "(no reason given)") + "</p>" +
        (r.notes ? '<p class="ksb-case-notes">' + esc(r.notes) + "</p>" : "") +
        addressBlock(r, false) +
        '<p class="ksb-instr">Approve to mail a make-good bag, or decline. This is goodwill on top of her free bag.</p>' +
        '<div class="ksb-actions"><div class="ksb-actions-row">' +
          '<button class="ksb-btn ksb-btn--go" data-act="approve-request">Approve and send</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="decline-request">Decline</button>' +
        "</div></div>" +
      "</article>";
  }

  /* ---------- the send-a-bag form ----------------------------------------- */

  /* ⚠⚠ THE EMAIL IS DISPLAYED, NOT THE PLAN: every member reads "The Basics", and two
     names begin "Jenni". Search is by name OR email (the label carries a name). */
  function memberOptions(q) {
    var needle = String(q || "").trim().toLowerCase();
    var members = (_panel.members || []).slice().sort(function (a, b) {
      return fullName(a).localeCompare(fullName(b));
    });
    return members.filter(function (m) {
      if (!needle) return true;
      return (fullName(m) + " " + (m.email || "")).toLowerCase().indexOf(needle) > -1;
    }).map(function (m) {
      var tail = m.email || m.plan || "no plan";
      return '<option value="' + esc(m.member_id) + '" data-open="' + m.open_bags + '">' +
             esc(fullName(m)) + " · " + esc(tail) + "</option>";
    }).join("");
  }

  function sendForm() {
    var tiles = SOURCES.map(function (s) {
      return '<button class="ksb-reason' + (s.key === _formSource ? " is-sel" : "") + '" data-src="' + s.key + '">' +
             esc(s.label) +
             '<span class="ksb-reason-c">' + esc(s.cost) + "</span>" +
             "</button>";
    }).join("");
    return '' +
      '<article class="ksb-open ksb-sendform">' +
        '<button class="ksb-back" data-act="back" aria-label="Back to the list">‹ Back</button>' +
        '<div class="ksb-ch"><div class="ksb-ch-l"><h2 class="ksb-name">Send a bag</h2>' +
          '<div class="ksb-created">It lands in Empty bags to send, ready to ship.</div></div></div>' +
        '<div class="ksb-flabel">Member</div>' +
        '<input class="ksb-filter" id="ksb-f-filter" type="search" autocomplete="off" spellcheck="false" placeholder="Filter by name or email">' +
        '<select id="ksb-f-member"><option value="">Pick a member...</option>' + memberOptions("") + "</select>" +
        /* ⚠ GUARD 4: warn, never block. */
        '<div class="ksb-dup" id="ksb-f-warn" hidden>' +
          "<strong>⚠ This member already has a bag out.</strong> Sending another is allowed. " +
          "This warns, it never blocks. Send it if you have a reason." +
        "</div>" +
        '<div class="ksb-flabel">Reason</div>' +
        '<div class="ksb-reasons" id="ksb-f-reasons">' + tiles + "</div>" +
        '<div class="ksb-paid" id="ksb-f-paid"' + (_formSource === "requested_paid" ? "" : " hidden") + ">" +
          "$15, <strong>not charged by this page.</strong> There is no payment step here. Collect it manually." +
        "</div>" +
        '<div class="ksb-actions"><div class="ksb-actions-row">' +
          '<button class="ksb-btn ksb-btn--go" id="ksb-f-create">Add to queue</button>' +
        "</div></div>" +
      "</article>";
  }

  /* ---------- the day at a glance ---------------------------------------- */

  /* "14 to send · 4 overdue · oldest waiting 54 days". Overdue and oldest count only
     real bags, the ones on the age ladder. */
  function summaryLine(needs, bags) {
    var total = needs.length + bags.length;
    if (!total) return '<p class="ksb-sum">Nothing to send right now.</p>';
    var overdue = bags.filter(function (b) { return hoursSince(b.opened_at) >= AGE_RED_HOURS; }).length;
    var oldest = bags.reduce(function (m, b) { return Math.max(m, hoursSince(b.opened_at)); }, 0);
    var oldestText = !bags.length ? "" :
      oldest < 1 ? "under an hour" :
      oldest < AGE_RED_HOURS ? oldest + (oldest === 1 ? " hour" : " hours") :
      Math.floor(oldest / 24) + " days";
    return '<p class="ksb-sum">' + total + " to send" +
      (overdue ? ' · <span class="ksb-sum-red">' + overdue + " overdue</span>" : "") +
      (oldestText ? " · oldest waiting " + oldestText : "") + "</p>";
  }

  /* ---------- render ----------------------------------------------------- */

  function isPhone() { return window.matchMedia("(max-width: 899px)").matches; }

  function render() {
    var Q = queues();
    if (!_tab) {
      /* first load: the first tab with something in it, else Empty bags to send */
      var firstFull = Q.filter(function (t) { return t.rows.length; })[0];
      _tab = firstFull ? firstFull.key : "bags";
    }
    var cur = Q.filter(function (t) { return t.key === _tab; })[0] || Q[0];

    /* ⚠ THE NEXT ROW OPENS (hers S409). If the picked row is gone (shipped, cancelled,
       returned), the row now sitting at its old position is picked instead. */
    var selKey = _sel[cur.key];
    var selIdx = -1;
    if (selKey !== "form") {
      for (var i = 0; i < cur.rows.length; i++) if (cur.rows[i].key === selKey) { selIdx = i; break; }
      if (selIdx < 0 && cur.rows.length) {
        selIdx = Math.min(_idx[cur.key] || 0, cur.rows.length - 1);
        selKey = cur.rows[selIdx].key;
      }
      if (selIdx < 0) { selKey = null; _phoneOpen = false; }
      _sel[cur.key] = selKey;
      _idx[cur.key] = selIdx < 0 ? 0 : selIdx;
    }
    var selRow = selIdx >= 0 ? cur.rows[selIdx] : null;

    var tabs = Q.map(function (t) {
      return '<button class="ksb-tab' + (t.key === cur.key ? " is-on" : "") + '" data-act="tab" data-tab="' + t.key + '">' +
        '<span class="ksb-tab-l">' + esc(t.label) + '</span><span class="ksb-tab-s">' + esc(t.short) + "</span>" +
        '<span class="ksb-tab-n">' + t.rows.length + "</span></button>";
    }).join("");

    var list = cur.rows.map(function (row, i) {
      return '<button class="ksb-row' + (i === selIdx ? " is-on" : "") + '" data-act="row" data-key="' + esc(row.key) + '">' +
        '<span class="ksb-dot ksb-dot--' + row.lvl + '"></span>' +
        '<span class="ksb-row-main">' +
          '<span class="ksb-row-top"><span class="ksb-row-name">' + esc(row.name) + "</span>" +
            (row.isNew ? '<span class="ksb-row-new">New member</span>' : "") + "</span>" +
          '<span class="ksb-row-sub">' + esc(row.sub) + "</span>" +
        "</span>" +
        (row.age ? '<span class="ksb-row-age ksb-row-age--' + row.lvl + '">' + esc(row.age) + "</span>" : "") +
      "</button>";
    }).join("");
    if (!cur.rows.length) list = '<p class="ksb-empty">' + esc(cur.empty) + "</p>";
    if (cur.key === "bags") list += '<button class="ksb-add" data-act="send-open">+ Send a bag</button>';

    var card;
    if (_sel[cur.key] === "form") card = sendForm();
    else if (!selRow) card = '<p class="ksb-empty">Nothing to open here.</p>';
    else if (selRow.kind === "ship" || selRow.kind === "needs") card = shipCard(selRow, cur.how);
    else if (selRow.kind === "transit") card = transitCard(selRow);
    else if (selRow.kind === "case") card = caseCard(selRow);
    else card = requestCard(selRow);

    var bagsNow = (_panel.envelopes || []).concat(_panel.orders || []);

    _root.innerHTML = '' +
      '<div class="ksb' + (_phoneOpen ? " is-open" : "") + '">' +
        '<header class="ksb-head">' +
          '<div><h1>The ship desk</h1>' + summaryLine(firstBagMembers(), bagsNow) + "</div>" +
          '<button class="ksb-btn ksb-btn--ghost ksb-btn--sm" data-act="refresh">Refresh</button>' +
        "</header>" +
        '<nav class="ksb-tabs">' + tabs + "</nav>" +
        '<div class="ksb-panes">' +
          '<section class="ksb-list">' + list + "</section>" +
          '<section class="ksb-card-pane">' + card + "</section>" +
        "</div>" +
      "</div>";

    /* lock the page behind the full-screen card on a phone */
    document.documentElement.style.overflow = (_phoneOpen && isPhone()) ? "hidden" : "";

    if (_flash) toast(_flash);
    _flash = null;
    wireCard();
  }

  /* ---------- the toast -------------------------------------------------- */

  /* ⚠⚠ TOP OF THE VIEWPORT, never the bottom: the Memberstack test-mode badge lives at
     the bottom. INK, not green: green means on time on this page. Appended to body so a
     render cannot delete it mid-life. */
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
    }, 4200);
  }

  /* ---------- the gate ---------------------------------------------------- */

  /* ⚠⚠ GUARD 1: both tracking numbers AND a carrier. */
  function gateShip(card) {
    if (!card) return;
    var ins = card.querySelectorAll("[data-tr]");
    var both = true;
    for (var i = 0; i < ins.length; i++) if (!ins[i].value.trim()) { both = false; break; }
    var ready = both && !!card.querySelector("[data-carrier].is-sel");
    var btn = card.querySelector('[data-act="ship"]');
    var lock = card.querySelector(".ksb-lock");
    if (!btn || !lock) return;
    btn.disabled = !ready;
    if (ready) { lock.textContent = "✓ Both labels captured. Safe to ship."; lock.classList.add("is-ready"); }
    else if (both) { lock.textContent = "Pick the carrier to ship"; lock.classList.remove("is-ready"); }
    else { lock.textContent = "Both tracking numbers and the carrier needed to ship"; lock.classList.remove("is-ready"); }
  }

  function saveDraft(card) {
    var key = card.getAttribute("data-ship");
    var c = card.querySelector("[data-carrier].is-sel");
    _draft[key] = {
      out: card.querySelector('[data-tr="out"]').value.trim(),
      ret: card.querySelector('[data-tr="ret"]').value.trim(),
      car: c ? c.getAttribute("data-carrier") : ""
    };
  }

  /* ---------- clipboard -------------------------------------------------- */

  function copyText(t, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(done); } catch (e) { alert("Couldn't copy. Select it by hand."); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast(done); }, fallback);
    } else fallback();
  }

  function rowFor(key) {
    var Q = queues();
    for (var t = 0; t < Q.length; t++)
      for (var i = 0; i < Q[t].rows.length; i++) if (Q[t].rows[i].key === key) return Q[t].rows[i];
    return null;
  }

  /* ---------- first bag: make it and ship it in one press ---------------- */

  /* ⚠⚠ HERS S409: Mark shipped on a first bag MAKES the bag (source 'signup', free,
     never counted) and ships it. bags-manage's create hands back the new row
     (created.id), read S410. If the SHIP half fails the bag STAYS MADE as a normal row
     in Empty bags to send, opened, with her numbers still typed in, and _made stops a
     second press from making a second bag. */
  function shipFirstBag(card, btn, out, ret, car) {
    if (_busy) return;
    _busy = true;
    var memberId = card.getAttribute("data-needs");
    var who = (card.querySelector(".ksb-name") || {}).textContent || "this member";
    btn.disabled = true; btn.textContent = "Making her bag...";

    var made = _made[memberId];
    var p = made ? Promise.resolve(made) : call({ action: "create", member_id: memberId, source: "signup" })
      .then(function (res) {
        var id = res && res.created && res.created.id;
        if (!id) throw new Error("The bag may have been made, but its id didn't come back. Refresh before trying again.");
        _made[memberId] = id;
        return id;
      });

    p.then(function (bagId) {
      btn.textContent = "Shipping...";
      return call({ action: "ship", bag_id: bagId, outbound_tracking: out, return_tracking: ret, carrier: car })
        .then(function (res) {
          delete _made[memberId];
          delete _draft["m:" + memberId];
          _panel = res.panel;
          _flash = "First bag made and shipped. Moved to In transit.";
          render();
        }, function (shipErr) {
          /* the bag exists; open it as a normal row with the numbers kept */
          _draft[bagId] = { out: out, ret: ret, car: car };
          _tab = "bags"; _sel.bags = bagId; _phoneOpen = true;
          return call({ action: "read" }).then(function (r2) { _panel = r2.panel; render(); }, function () {})
            .then(function () {
              alert("Her bag was made, but it didn't ship.\n\n" + who + "\n" + shipErr.message +
                (shipErr.detail ? "\n" + shipErr.detail : "") +
                "\n\nIt's now a normal row in Empty bags to send with your numbers still filled in. Press Mark shipped again.");
            });
        });
    }).catch(function (e) {
      alert(e.message + (e.detail ? "\n\n" + e.detail : ""));
      btn.disabled = false; btn.textContent = "Mark shipped";
      gateShip(card);
    }).finally(function () { _busy = false; });
  }

  /* ---------- wiring: the parts that live inside one render --------------- */

  function wireCard() {
    var card = _root.querySelector("[data-ship]");
    if (card) {
      gateShip(card);
      /* a computer puts the cursor in the first empty field so the scanner can fire
         straight away; a phone does not (the keyboard would cover the card) */
      if (!isPhone()) {
        var first = card.querySelector('[data-tr="out"]');
        var second = card.querySelector('[data-tr="ret"]');
        var target = !first.value ? first : (!second.value ? second : null);
        if (target) target.focus({ preventScroll: true });
      }
    }

    var mSel = el("ksb-f-member");
    if (!mSel) return;
    var warn = el("ksb-f-warn");
    var filt = el("ksb-f-filter");
    mSel.addEventListener("change", function () {
      var o = mSel.options[mSel.selectedIndex];
      warn.hidden = !(o && Number(o.getAttribute("data-open") || 0) > 0);
    });
    /* ⚠ A stale member_id behind a narrowed list is how a bag goes to the wrong person:
       if the filter drops the picked member, the pick is CLEARED. */
    filt.addEventListener("input", function () {
      var was = mSel.value;
      mSel.innerHTML = '<option value="">Pick a member...</option>' + memberOptions(filt.value);
      var kept = false;
      for (var i = 0; i < mSel.options.length; i++) {
        if (mSel.options[i].value === was && was) { mSel.selectedIndex = i; kept = true; break; }
      }
      if (!kept) { mSel.value = ""; warn.hidden = true; }
    });
    el("ksb-f-reasons").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-src]") : null;
      if (!t) return;
      var all = el("ksb-f-reasons").querySelectorAll("[data-src]");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("is-sel");
      t.classList.add("is-sel");
      _formSource = t.getAttribute("data-src");
      el("ksb-f-paid").hidden = _formSource !== "requested_paid";
    });
    el("ksb-f-create").addEventListener("click", function (e) {
      if (!mSel.value) { alert("Pick a member first."); return; }
      var before = (_panel.envelopes || []).map(function (b) { return b.id; });
      withBusy(call({ action: "create", member_id: mSel.value, source: _formSource }), e.target, "Creating...", "Bag created. It's in Empty bags to send.")
        .then(function (res) {
          /* open the new bag straight away */
          if (res && res.created && res.created.id && before.indexOf(res.created.id) < 0) {
            _sel.bags = res.created.id; render();
          }
        });
    });
  }

  /* ---------- wiring: bound ONCE on the mount ----------------------------- */

  /* ⚠⚠ S410 FIX: these used to be added inside wire(), which ran on EVERY render, and
     _root survives a render (only its innerHTML is replaced). So after N renders the
     page held N copies of the click handler: a confirm could appear twice, and only
     the _busy guard stopped a double write. Bound once here, in boot. */
  function bindOnce() {
    _root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t.hasAttribute || !t.hasAttribute("data-tr")) return;
      var f = t.parentNode;
      if (t.value.trim()) f.classList.add("is-done"); else f.classList.remove("is-done");
      var card = t.closest("[data-ship]");
      gateShip(card); saveDraft(card);
    });

    /* SCANNER-FRIENDLY (hers S409): Enter in outbound jumps to return; Enter in return
       jumps to the carrier. The carrier is still picked by hand, never derived. */
    _root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var t = e.target;
      if (!t.hasAttribute || !t.hasAttribute("data-tr")) return;
      e.preventDefault();
      var card = t.closest("[data-ship]");
      if (t.getAttribute("data-tr") === "out") card.querySelector('[data-tr="ret"]').focus();
      else card.querySelector("[data-carrier]").focus();
    });

    _root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");

      /* ---- the desk itself ---- */
      if (act === "refresh") { withBusy(call({ action: "read" }), btn, "Loading..."); return; }
      if (act === "tab") { _tab = btn.getAttribute("data-tab"); _phoneOpen = false; render(); return; }
      if (act === "row") {
        var key = btn.getAttribute("data-key");
        _sel[_tab] = key; _phoneOpen = true;
        var rows = _root.querySelectorAll(".ksb-row");
        for (var ri = 0; ri < rows.length; ri++) if (rows[ri] === btn) _idx[_tab] = ri;
        render();
        return;
      }
      if (act === "back") { _phoneOpen = false; render(); return; }
      if (act === "send-open") { _sel.bags = "form"; _phoneOpen = true; render(); return; }

      if (act === "copy-name" || act === "copy-addr") {
        var holder = btn.closest("[data-ship]");
        var row = holder ? rowFor(holder.getAttribute("data-ship")) : null;
        if (!row) return;
        if (act === "copy-name") copyText(fullName(row.r), "Name copied.");
        else copyText(addrText(row.r), "Address copied.");
        return;
      }

      /* ---- cases ---- */
      var caseEl = btn.closest("[data-case]");
      if (caseEl) {
        var caseId = caseEl.getAttribute("data-case");
        /* ⚠⚠ THE CONFIRM NAMES THE CASE, read off the clicked card, never panel state. */
        var caseIdent = function () {
          var cWho  = (caseEl.querySelector(".ksb-name") || {}).textContent || "this member";
          var cAge  = (caseEl.querySelector(".ksb-age") || {}).textContent || "";
          var cRsn  = caseEl.getAttribute("data-case-reason") || "";
          var cBag  = caseEl.getAttribute("data-case-bag") || "";
          var cBSrc = caseEl.getAttribute("data-case-bagsrc") || "";
          var cRt   = caseEl.getAttribute("data-case-rt") || "";
          return cWho + "\n" +
            "Case " + shortId(caseId) + (cRsn ? " · " + cRsn : "") + (cAge ? " · " + cAge : "") + "\n" +
            (cBag ? "Bag " + shortId(cBag) + (SOURCE_LABEL[cBSrc] ? " · " + SOURCE_LABEL[cBSrc] : "") + (cRt ? " · " + cRt : "")
                  : "No bag linked to this case");
        };
        if (btn.classList.contains("ksb-reason")) {
          var sibs = btn.parentNode.querySelectorAll(".ksb-reason");
          for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove("is-sel");
          btn.classList.add("is-sel");
          return;
        }
        if (act === "resolve-reship") {
          if (!confirm("Reship a make-good bag?\n\n" + caseIdent() +
            "\n\nThis makes a comp bag in Empty bags to send. Check the address, then print. It does not use up her free bag.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "reship" }), btn, "Reshipping...");
          return;
        }
        if (act === "resolve-decline") {
          if (!confirm("Decline this case?\n\n" + caseIdent() +
            "\n\nNothing is issued, no bag, no credit. The case closes. Use this when the reason doesn't hold up.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "decline" }), btn, "Declining...");
          return;
        }
        if (act === "resolve-credit-toggle" || act === "resolve-credit-cancel") {
          var cf = caseEl.querySelector("[data-cform]");
          if (cf) cf.hidden = act === "resolve-credit-cancel" ? true : !cf.hidden;
          return;
        }
        if (act === "resolve-credit-go") {
          var form = caseEl.querySelector("[data-cform]");
          var amt = form.querySelector('[data-cf="amount"] .is-sel');
          var cls = form.querySelector('[data-cf="class"] .is-sel');
          var tr = form.querySelector('[data-cf="tier"] .is-sel');
          var amount = amt ? Number(amt.getAttribute("data-amount")) : null;
          var creditClass = cls ? cls.getAttribute("data-class") : null;
          var tier = tr ? tr.getAttribute("data-tier") : null;
          if (amount == null || !creditClass || !tier) { alert("Pick an amount, a class, and a tier before issuing the credit."); return; }
          if (!confirm("Issue " + amount + " " + tier + " " + creditClass + " credit?\n\n" + caseIdent() +
            "\n\nThis closes the case and adds the credit to her bank. It can't be undone from here.")) return;
          withBusy(call({ action: "resolve_case", case_id: caseId, resolution: "credit",
            amount: amount, "class": creditClass, tier: tier }), btn, "Crediting...");
          return;
        }
        return;
      }

      /* ---- bag requests: MUST stay above the data-bag early return ---- */
      var reqEl = btn.closest("[data-request]");
      if (reqEl) {
        var reqId = reqEl.getAttribute("data-request");
        var reqWho = (reqEl.querySelector(".ksb-name") || {}).textContent || "this member";
        if (act === "approve-request") {
          if (!confirm("Approve and send a bag to " + reqWho + "?\n\nThis makes a comp bag in Empty bags to send. Check the address, then print. It's goodwill on top of her free bag, so it doesn't spend her entitlement or bill her.")) return;
          withBusy(call({ action: "approve_request", request_id: reqId }), btn, "Approving...");
          return;
        }
        if (act === "decline-request") {
          if (!confirm("Decline this request?\n\n" + reqWho + "\n\nNo bag is sent and the request closes. Use this when it doesn't hold up.")) return;
          withBusy(call({ action: "decline_request", request_id: reqId }), btn, "Declining...");
          return;
        }
        return;
      }

      /* ---- the ship card and the transit card ---- */
      var card = btn.closest("[data-ship]") || btn.closest("[data-bag]");
      if (!card) return;
      var bagId = card.getAttribute("data-bag");

      if (act === "carrier") {
        var cs = btn.parentNode.querySelectorAll("[data-carrier]");
        for (var ci = 0; ci < cs.length; ci++) cs[ci].classList.remove("is-sel");
        btn.classList.add("is-sel");
        gateShip(card); saveDraft(card);
        return;
      }

      if (act === "ship") {
        var out = card.querySelector('[data-tr="out"]').value.trim();
        var ret = card.querySelector('[data-tr="ret"]').value.trim();
        var carEl = card.querySelector("[data-carrier].is-sel");
        var car = carEl ? carEl.getAttribute("data-carrier") : "";
        if (!out || !ret || !car) return;   /* unreachable: the button is disabled */
        if (card.hasAttribute("data-needs")) { shipFirstBag(card, btn, out, ret, car); return; }
        var sk = card.getAttribute("data-ship");
        withBusy(call({ action: "ship", bag_id: bagId, outbound_tracking: out, return_tracking: ret, carrier: car }),
          btn, "Shipping...", "Shipped. Moved to In transit.")
          .then(function (res) { if (res) delete _draft[sk]; });
        return;
      }

      if (act === "cancel") {
        /* ⚠⚠ THE CONFIRM NAMES THE BAG, read off the clicked card (S104, S110). */
        var cWho = (card.querySelector(".ksb-name") || {}).textContent || "this member";
        var cSrc = card.getAttribute("data-bagsrc") || "";
        var cType = SOURCE_LABEL[cSrc] || cSrc || "Bag";
        var cAge = (card.querySelector(".ksb-age") || {}).textContent || "";
        if (!confirm("Cancel this bag?\n\n" + cWho + "\n" + cType + " · " + shortId(bagId) + (cAge ? " · " + cAge : "") +
          "\n\nUse this when two rows exist for one physical bag. It won't count against her shipping.")) return;
        withBusy(call({ action: "cancel", bag_id: bagId }), btn, "Cancelling...", "Cancelled. This bag is off the list.");
        return;
      }

      if (act === "return") {
        /* ⚠ The confirm shows the RETURN TRACKING so the bag in hand matches the row. */
        var who = (card.querySelector(".ksb-name") || {}).textContent || "this member";
        var rt = card.getAttribute("data-rt") || "";
        if (!confirm("Mark this bag returned?\n\n" + who + (rt ? "\nReturn tracking: " + rt : "") +
          "\n\nCheck this matches the bag in your hand. It can't be undone from here.")) return;
        withBusy(call({ action: "return", bag_id: bagId }), btn, "Marking...", "Marked returned. Off the In transit list.");
        return;
      }
    });

    /* crossing the phone/computer line with a card open must not strand the lock */
    window.addEventListener("resize", function () {
      if (!isPhone()) document.documentElement.style.overflow = "";
      else if (_phoneOpen) document.documentElement.style.overflow = "hidden";
    });
  }

  /* ---------- styles ----------------------------------------------------- */

  /* ⚠ S410, HERS S409: NAVY #1c4a91 IS THE ONE ACCENT (picked tab, picked row, main
     buttons). Green, amber and red ONLY mean lateness. Everything else is ink, cream,
     white and soft grey. No coral on this page any more.
     ⚠ #C0392B IS ADMIN-ONLY. Never let it reach a member-facing surface.
     ⚠ EVERY RULE IS PREFIXED WITH THE MOUNT ID (Webflow's global heading styles beat
     unprefixed ones), except the toast, which lives on body. */
  function injectCSS() {
    if (el("ksb-css")) return;
    var R = "#" + MOUNT_ID;
    var NAVY = "#1c4a91", INK = "#211b1a", CREAM = "#EEEFE3", GREY = "#6E6A63", LINE = "#C9C7BC";
    var s = document.createElement("style");
    s.id = "ksb-css";
    s.textContent = [
      ".ksb-toast{position:fixed!important;top:20px;left:50%;transform:translateX(-50%);z-index:99999;max-width:min(460px,calc(100vw - 24px));margin:0;padding:16px 24px;border-radius:14px;background:#1E1A19;color:#EEEFE3;box-shadow:0 10px 30px rgba(30,26,25,.30);font-family:Quicksand,sans-serif;font-size:18px;font-weight:700;line-height:1.3;text-align:center;pointer-events:none}",
      R + " *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
      R + " .ksb{font-family:Quicksand,sans-serif;font-weight:500;color:" + INK + ";max-width:1280px;margin:0 auto;padding:8px 16px 60px;line-height:1.45}",
      R + " button{font-family:Quicksand,sans-serif}",

      R + " .ksb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:18px 0 14px}",
      R + " .ksb h1{font-family:'Instrument Serif',serif!important;font-weight:400!important;font-size:44px!important;line-height:1!important;margin:0!important;color:" + INK + "!important;text-transform:none!important;text-align:left!important}",
      R + " .ksb-sum{font-size:16px;font-weight:600;margin:8px 0 0}",
      R + " .ksb-sum-red{color:" + RED + "}",

      /* tabs: a wrapping row on a computer, a swipe row on a phone */
      R + " .ksb-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}",
      R + " .ksb-tab{font-weight:600;font-size:15px;height:44px;padding:0 16px;border-radius:12px;border:1.5px solid #FFF;background:#FFF;color:" + INK + ";display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;flex-shrink:0}",
      R + " .ksb-tab.is-on{background:" + NAVY + ";border-color:" + NAVY + ";color:#FFF}",
      R + " .ksb-tab-n{font-size:13px;min-width:24px;height:24px;padding:0 7px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:" + CREAM + ";color:" + GREY + "}",
      R + " .ksb-tab.is-on .ksb-tab-n{background:#FFF;color:" + NAVY + "}",
      R + " .ksb-tab-s{display:none}",

      R + " .ksb-panes{display:flex;gap:20px;align-items:flex-start}",
      R + " .ksb-list{width:400px;flex-shrink:0;background:#FFF;border-radius:18px;overflow:hidden}",
      R + " .ksb-card-pane{flex:1;min-width:0;background:#FFF;border-radius:18px;padding:26px 28px}",
      R + " .ksb-empty{margin:0;padding:22px 18px;font-size:15px;color:" + GREY + "}",
      R + " .ksb-card-pane > .ksb-empty{padding:0}",

      /* list rows */
      R + " .ksb-row{width:100%;text-align:left;border:none;border-bottom:1px solid " + CREAM + ";background:#FFF;padding:13px 18px;display:flex;align-items:center;gap:12px;cursor:pointer;color:" + INK + "}",
      R + " .ksb-row.is-on{background:#E3E7F1;box-shadow:inset 4px 0 0 " + NAVY + "}",
      R + " .ksb-dot{width:10px;height:10px;border-radius:5px;flex-shrink:0;background:" + LINE + "}",
      R + " .ksb-dot--fresh{background:#256F43}",
      R + " .ksb-dot--amber{background:#E5AD43}",
      R + " .ksb-dot--red{background:" + RED + "}",
      R + " .ksb-row-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}",
      R + " .ksb-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      R + " .ksb-row-name{font-weight:700;font-size:16px}",
      R + " .ksb-row-new{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:10px;background:" + NAVY + ";color:#FFF}",
      R + " .ksb-row-sub{font-size:13px;color:" + GREY + ";overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      R + " .ksb-row-age{font-size:13px;font-weight:600;white-space:nowrap;color:" + GREY + "}",
      R + " .ksb-row-age--fresh{color:#256F43}",
      R + " .ksb-row-age--amber{color:#9A6A0F}",
      R + " .ksb-row-age--red{color:" + RED + "}",
      R + " .ksb-add{display:block;width:calc(100% - 28px);margin:14px;height:48px;border-radius:12px;background:#FFF;border:2px dashed " + LINE + ";color:" + NAVY + ";font-weight:700;font-size:15px;cursor:pointer}",

      /* the open card */
      R + " .ksb-back{display:none}",
      R + " .ksb-ch{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}",
      R + " .ksb-ch-l{display:flex;flex-direction:column;gap:4px;min-width:0}",
      R + " .ksb h2.ksb-name{font-family:'Instrument Serif',serif!important;font-weight:400!important;font-size:36px!important;line-height:1.05!important;margin:0!important;color:" + INK + "!important;text-transform:none!important}",
      R + " .ksb-created{font-size:14px}",
      R + " .ksb-created strong{font-weight:700}",
      R + " .ksb-badge{font-size:13px;font-weight:700;padding:6px 12px;border-radius:11px;white-space:nowrap;background:" + CREAM + ";color:" + GREY + "}",
      R + " .ksb-badge--fresh{color:#256F43}",
      R + " .ksb-badge--amber{color:#9A6A0F}",
      /* red is the only FILLED badge: the fill is what makes it escalate */
      R + " .ksb-badge--red{background:" + RED + ";color:#FFF}",

      R + " .ksb-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}",
      R + " .ksb-chip{font-size:13px;font-weight:600;padding:5px 11px;border-radius:20px;background:" + CREAM + ";color:" + INK + "}",
      R + " .ksb-chip--new{background:" + NAVY + ";color:#FFF;font-weight:700}",
      R + " .ksb-chip--id{background:transparent;border:1px solid " + LINE + ";color:" + GREY + ";font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}",

      R + " .ksb-pair{display:flex;gap:16px;margin-top:16px;align-items:flex-start}",
      R + " .ksb-pair > *{flex:1;min-width:0}",
      R + " .ksb-how{margin:0;font-size:15px;line-height:1.45}",
      R + " .ksb-addr{background:" + CREAM + ";border-radius:12px;padding:13px 15px;font-size:15px;line-height:1.4}",
      R + " .ksb-open > .ksb-addr,#" + MOUNT_ID + " .ksb-open > .ksb-noaddr{margin-top:16px}",
      R + " .ksb-addr-who{font-weight:700}",
      R + " .ksb-addr-l{color:" + GREY + "}",
      R + " .ksb-copyrow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}",
      R + " .ksb-copy{height:36px;padding:0 14px;border-radius:10px;border:1.5px solid " + LINE + ";background:#FFF;color:" + INK + ";font-weight:600;font-size:13.5px;cursor:pointer}",
      R + " .ksb-copy:active{border-color:" + NAVY + "}",
      /* ⚠ NO ADDRESS SHOUTS in ink, not red: red means lateness on this page */
      R + " .ksb-noaddr{background:" + INK + ";color:#FFF;border-radius:12px;padding:13px 15px;font-weight:700;font-size:15px;display:flex;gap:9px;align-items:flex-start;line-height:1.35}",
      R + " .ksb-noaddr-i{font-size:18px;line-height:1}",

      R + " .ksb-job{margin-top:16px;background:" + CREAM + ";border-radius:14px;padding:16px}",
      R + " .ksb-job-t{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:" + GREY + ";margin-bottom:12px}",
      R + " .ksb-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
      R + " .ksb-field{position:relative}",
      R + " .ksb-field label{font-size:13px;font-weight:700;display:block;margin-bottom:5px}",
      R + " .ksb-field em{font-style:normal;font-weight:500;color:" + GREY + "}",
      /* 16px minimum on an input, or iOS zooms and never zooms back */
      R + " .ksb-field input{width:100%;height:48px;border-radius:11px;border:2px solid #FFF;background:#FFF;padding:0 40px 0 14px;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;color:" + INK + "}",
      R + " .ksb-field input:focus{outline:none;border-color:" + NAVY + "}",
      R + " .ksb-field.is-done input{border-color:" + LINE + "}",
      R + " .ksb-tick{position:absolute;right:14px;top:36px;font-size:17px;color:" + NAVY + ";display:none}",
      R + " .ksb-field.is-done .ksb-tick{display:inline}",
      R + " .ksb-flabel{font-size:13px;font-weight:700;margin:14px 0 6px}",
      R + " .ksb-reasons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
      R + " .ksb-reasons--3{grid-template-columns:repeat(3,minmax(0,1fr))}",
      R + " .ksb-reason{min-height:48px;border-radius:11px;border:2px solid #FFF;background:#FFF;font-weight:700;font-size:14px;color:" + INK + ";cursor:pointer;padding:8px}",
      R + " .ksb-reason:focus{outline:2px solid " + NAVY + ";outline-offset:1px}",
      R + " .ksb-reason.is-sel{border-color:" + NAVY + ";background:#E3E7F1}",
      R + " .ksb-reason-c{display:block;font-size:11.5px;font-weight:600;color:" + GREY + ";margin-top:2px}",
      R + " .ksb-open > .ksb-reasons .ksb-reason,#" + MOUNT_ID + " .ksb-sendform .ksb-reason,#" + MOUNT_ID + " .ksb-cform .ksb-reason{border-color:" + CREAM + "}",
      R + " .ksb-sendform .ksb-reason.is-sel,#" + MOUNT_ID + " .ksb-cform .ksb-reason.is-sel{border-color:" + NAVY + "}",

      R + " .ksb-actions{margin-top:18px}",
      R + " .ksb-actions-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
      R + " .ksb-btn{height:52px;border-radius:13px;border:none;font-weight:700;font-size:16px;cursor:pointer;padding:0 30px;display:inline-flex;align-items:center;justify-content:center}",
      R + " .ksb-btn--go{background:" + NAVY + ";color:#FFF}",
      R + " .ksb-btn--go:hover{background:#163b74}",
      /* no opacity: the disabled state is a solid colour */
      R + " .ksb-btn--go:disabled{background:" + CREAM + ";color:" + GREY + ";cursor:not-allowed}",
      R + " .ksb-btn--ghost{background:#FFF;color:" + GREY + ";border:2px solid " + CREAM + ";padding:0 20px}",
      R + " .ksb-btn--sm{height:40px;font-size:14px;padding:0 18px;border:1.5px solid " + INK + ";color:" + INK + ";background:transparent;border-radius:999px}",
      R + " .ksb-lock{font-size:13px;color:" + GREY + ";margin-top:9px;font-weight:600}",
      R + " .ksb-lock.is-ready{color:" + NAVY + "}",

      R + " .ksb-instr{margin:16px 0 0;font-size:15px}",
      R + " .ksb-req-reason{margin:16px 0 0;font-size:16px;line-height:1.45}",
      R + " .ksb-case-notes{margin:12px 0 0;font-size:14px;color:" + GREY + "}",
      R + " .ksb-transit-meta{margin-top:16px;background:" + CREAM + ";border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}",
      R + " .ksb-tl{display:flex;justify-content:space-between;align-items:baseline;gap:14px;font-size:14px}",
      R + " .ksb-tl-k{color:" + GREY + ";font-weight:600;white-space:nowrap}",
      R + " .ksb-tl-v{font-weight:700;text-align:right}",
      R + " .ksb-tl-v em{font-style:normal;font-weight:500;color:" + GREY + "}",
      R + " .ksb-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all}",
      R + " .ksb-cform{margin-top:6px}",

      R + " .ksb-filter,#" + MOUNT_ID + " .ksb-sendform select{width:100%;height:48px;border-radius:11px;border:2px solid " + CREAM + ";background:#FFF;padding:0 14px;font-family:Quicksand,sans-serif;font-weight:600;font-size:16px;color:" + INK + ";margin-bottom:8px}",
      R + " .ksb-filter:focus{outline:none;border-color:" + NAVY + "}",
      R + " .ksb-paid,#" + MOUNT_ID + " .ksb-dup{margin-top:12px;background:" + CREAM + ";border-radius:11px;padding:11px 13px;font-size:13.5px;font-weight:600;line-height:1.4}",
      R + " .ksb-dup{border:2px solid #E5AD43}",

      /* ⚠ PHONE (under 900px): tabs swipe sideways, the list is the page, and a tapped
         row opens its card FULL SCREEN with a back arrow, Mark shipped pinned to the
         bottom. The pinned bar leaves room under it for the Memberstack test badge. */
      "@media(max-width:899px){" +
        R + " .ksb{padding:4px 12px 40px}" +
        R + " .ksb h1{font-size:36px!important}" +
        R + " .ksb-head{align-items:flex-start}" +
        /* ⚠ S410, HERS: ALL FIVE TABS VISIBLE AT ONCE ON A PHONE, an overview at a glance.
           One row of five tiles: the count big on top, a short name under it. */
        R + " .ksb-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:14px}" +
        R + " .ksb-tab{flex-direction:column;justify-content:center;gap:2px;height:auto;min-height:68px;padding:8px 2px;border-radius:12px;white-space:normal;text-align:center}" +
        R + " .ksb-tab-l{display:none}" +
        R + " .ksb-tab-s{display:block;font-size:11.5px;line-height:1.15;font-weight:600}" +
        R + " .ksb-tab-n{order:-1;background:none!important;min-width:0;height:auto;padding:0;font-size:22px;font-weight:700;color:" + INK + "}" +
        R + " .ksb-tab.is-on .ksb-tab-n{color:#FFF}" +
        R + " .ksb-panes{display:block}" +
        R + " .ksb-list{width:100%}" +
        R + " .ksb-card-pane{display:none}" +
        R + " .ksb.is-open .ksb-card-pane{display:block;position:fixed;inset:0;z-index:9990;border-radius:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px 0}" +
        R + " .ksb-back{display:inline-flex;align-items:center;height:40px;padding:0 4px;margin-bottom:8px;border:none;background:none;color:" + NAVY + ";font-weight:700;font-size:16px;cursor:pointer}" +
        R + " .ksb h2.ksb-name{font-size:30px!important}" +
        R + " .ksb-pair{flex-direction:column}" +
        R + " .ksb-fields{grid-template-columns:1fr}" +
        R + " .ksb-actions--pin{position:sticky;bottom:0;background:#FFF;margin:18px -16px 0;padding:12px 16px calc(64px + env(safe-area-inset-bottom));box-shadow:0 -8px 20px -12px rgba(33,27,26,.25)}" +
        R + " .ksb-actions--pin .ksb-btn--go{flex:1}" +
        R + " .ksb-card-pane > .ksb-open{padding-bottom:0}" +
        R + " .ksb-card-pane > .ksb-case,#" + MOUNT_ID + " .ksb-card-pane > .ksb-request,#" + MOUNT_ID + " .ksb-card-pane > .ksb-sendform{padding-bottom:80px}" +
      "}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ---------- boot ------------------------------------------------------- */

  function boot() {
    _root = el(MOUNT_ID);
    if (!_root) { console.warn("[ks-bags] no #" + MOUNT_ID + " on this page"); return; }
    injectCSS();
    bindOnce();
    _root.innerHTML = '<p style="font-family:Quicksand,sans-serif;color:#6E6A63;padding:16px">Loading the ship desk...</p>';

    /* ⚠ getMemberCookie() is SYNCHRONOUS: it returns the token string, not a promise. */
    var c = window.$memberstackDom.getMemberCookie();
    _token = (c && c.data) ? c.data : c;

    call({ action: "read" }).then(function (res) {
      _panel = res.panel;
      render();
      /* ⚠ ONE stamp only, at the top of the file. Two [ks-bags] lines means a
         duplicate script tag. */
    }).catch(function (e) {
      _root.innerHTML = '<p style="font-family:Quicksand,sans-serif;color:' + RED + ';padding:16px">' +
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
