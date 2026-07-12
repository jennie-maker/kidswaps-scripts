/* ks-bags — the ship desk. /admin/bags
   Phone-first: cards are the primary layout, the table is a desktop enhancement.
   Server is authoritative on every guard; this file is the hands, not the brain.
   Path A: Jennie prints labels in Shippo's own UI and pastes the tracking back.
   ⚠ The panel NEVER calls Shippo. Under Path B the EDGE FN fills these same two
     fields from the API and this client's contract does not change.
*/
(function () {
  "use strict";

  var BUILD = "dev";
  var FN = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/bags-manage";
  var MOUNT_ID = "ks-bags-app";

  /* ⚠ AGING THRESHOLDS — GUARD 3. Deliberately a constant, not a migration.
     No SLA exists yet (nothing member-facing promises a handling time), so these
     are honest-for-now, not derived. Change the numbers; nothing else moves. */
  var AGE_AMBER_DAYS = 2;
  var AGE_RED_DAYS = 4;

  /* The four bag types this panel can create. 'order' is absent ON PURPOSE —
     checkout's commit_claim_batch owns order rows. The edge fn refuses anything
     not on this list; swap_bags.source DEFAULTS to 'order', so an unset source
     would silently bill the member $15. */
  var SOURCES = [
    { key: "signup",         label: "First bag (new member)",  hint: "Her first empty bag. Free, never counted." },
    { key: "comp",           label: "Make-good bag",           hint: "Never arrived, lost, or all items declined. Free." },
    { key: "requested_free", label: "Free replacement bag",    hint: "She did not order this cycle. Free, restarts her loop." },
    { key: "requested_paid", label: "Paid extra bag",          hint: "$15 NOT charged by this panel — collect it manually." }
  ];

  var SOURCE_LABEL = {
    signup: "First bag",
    comp: "Make-good",
    requested_free: "Free replacement",
    requested_paid: "Paid extra ($15 uncharged)",
    order: "Order"
  };

  var _panel = null;      // last payload from the server
  var _token = null;
  var _busy = false;
  var _root = null;

  /* ---------- utils ---------------------------------------------------- */

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isPhone() { return window.matchMedia("(max-width:720px)").matches; }

  function fullName(r) {
    var n = (r.first_name || "") + " " + (r.last_name || "");
    n = n.trim();
    return n || r.email || "Unknown member";
  }

  function daysSince(iso) {
    if (!iso) return 0;
    var then = new Date(iso).getTime();
    if (isNaN(then)) return 0;
    return Math.floor((Date.now() - then) / 86400000);
  }

  function ageClass(days) {
    if (days >= AGE_RED_DAYS) return "ksb-age--red";
    if (days >= AGE_AMBER_DAYS) return "ksb-age--amber";
    return "ksb-age--ok";
  }

  function ageText(days) {
    if (days <= 0) return "Today";
    if (days === 1) return "1 day old";
    return days + " days old";
  }

  /* ⚠ ADDRESS IS THE WHOLE POINT OF THIS PANEL — eyeball it before printing.
     Every shipping_* column is NULLABLE. A member with no address must SHOUT,
     not render a tidy blank. (S1 is OFF; blanks are expected in testing.) */
  function addressBlock(r) {
    var l1 = (r.shipping_address_line1 || "").trim();
    if (!l1) {
      return '<div class="ksb-addr ksb-addr--missing">⚠ NO ADDRESS ON FILE — do not print a label</div>';
    }
    var l2 = (r.shipping_address_line2 || "").trim();
    var city = (r.shipping_city || "").trim();
    var st = (r.shipping_state || "").trim();
    var zip = (r.shipping_zip || "").trim();
    var lines = [esc(l1)];
    if (l2) lines.push(esc(l2));
    lines.push(esc(city) + (city && st ? ", " : "") + esc(st) + " " + esc(zip));
    return '<div class="ksb-addr">' + lines.join("<br>") + "</div>";
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
          e.code = j.code;
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
      throw e;
    }).finally(function () { _busy = false; });
  }

  /* ---------- render: a bag card (BOTH queues end the same way) ---------- */

  function bagCard(r) {
    var days = daysSince(r.opened_at);
    var isOrder = r.source === "order";

    return '' +
      '<article class="ksb-card ' + ageClass(days) + '" data-bag="' + esc(r.id) + '">' +
        '<header class="ksb-card-head">' +
          '<div>' +
            '<h3 class="ksb-name">' + esc(fullName(r)) + '</h3>' +
            '<div class="ksb-meta">' +
              '<span class="ksb-chip">' + esc(r.plan || "No plan") + '</span>' +
              '<span class="ksb-chip ksb-chip--src">' + esc(SOURCE_LABEL[r.source] || r.source) + '</span>' +
            '</div>' +
          '</div>' +
          '<span class="ksb-age">' + esc(ageText(days)) + '</span>' +
        '</header>' +

        addressBlock(r) +

        (isOrder
          ? '<p class="ksb-note">Pack her items <strong>plus an empty bag</strong> with the return label on it.</p>'
          : '<p class="ksb-note">Empty bag with the return label on it, folded into an envelope. <strong>No items.</strong></p>') +

        '<div class="ksb-fields">' +
          '<label class="ksb-field">' +
            '<span>Outbound tracking <em>(the package)</em></span>' +
            '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="out" placeholder="Paste from Shippo">' +
          '</label>' +
          '<label class="ksb-field">' +
            '<span>Return tracking <em>(the bag inside)</em></span>' +
            '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" data-tr="ret" placeholder="Paste from Shippo">' +
          '</label>' +
        '</div>' +

        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--ship" data-act="ship">Mark shipped</button>' +
          '<button class="ksb-btn ksb-btn--ghost" data-act="cancel">Cancel bag</button>' +
        '</div>' +
      '</article>';
  }

  /* ---------- render: needs-a-bag ---------------------------------------- */

  function needsCard(m) {
    return '' +
      '<article class="ksb-card ksb-card--needs" data-needs="' + esc(m.member_id) + '">' +
        '<header class="ksb-card-head">' +
          '<div>' +
            '<h3 class="ksb-name">' + esc(fullName(m)) + '</h3>' +
            '<div class="ksb-meta">' +
              '<span class="ksb-chip">' + esc(m.plan || "No plan") + '</span>' +
              '<span class="ksb-chip">Never sent a bag</span>' +
            '</div>' +
          '</div>' +
        '</header>' +
        addressBlock(m) +
        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--ship" data-act="create-signup">Create her first bag</button>' +
        '</div>' +
      '</article>';
  }

  /* ---------- render: the send-a-bag form ------------------------------- */

  function sendForm() {
    var members = (_panel.members || []).slice().sort(function (a, b) {
      return fullName(a).localeCompare(fullName(b));
    });

    var opts = members.map(function (m) {
      /* ⚠ GUARD 4 — flag a member who ALREADY has a bag out. Warn, never block
         (§6 override-with-warning; physical truth wins, she may have a reason). */
      var warn = m.open_bags > 0 ? "  ⚠ already has a bag out" : "";
      return '<option value="' + esc(m.member_id) + '" data-open="' + m.open_bags + '">' +
             esc(fullName(m)) + " — " + esc(m.plan || "no plan") + esc(warn) + "</option>";
    }).join("");

    var srcOpts = SOURCES.map(function (s) {
      return '<option value="' + s.key + '">' + esc(s.label) + "</option>";
    }).join("");

    return '' +
      '<div class="ksb-form" id="ksb-form" hidden>' +
        '<label class="ksb-field">' +
          '<span>Member</span>' +
          '<select id="ksb-f-member"><option value="">Choose a member...</option>' + opts + "</select>" +
        "</label>" +
        '<label class="ksb-field">' +
          '<span>Why</span>' +
          '<select id="ksb-f-source">' + srcOpts + "</select>" +
        "</label>" +
        '<p class="ksb-hint" id="ksb-f-hint"></p>' +
        '<p class="ksb-warn" id="ksb-f-warn" hidden></p>' +
        '<div class="ksb-actions">' +
          '<button class="ksb-btn ksb-btn--ship" id="ksb-f-create">Create bag</button>' +
          '<button class="ksb-btn ksb-btn--ghost" id="ksb-f-close">Never mind</button>' +
        "</div>" +
      "</div>";
  }

  /* ---------- render: the page ------------------------------------------ */

  function render() {
    var orders = _panel.orders || [];
    var envelopes = _panel.envelopes || [];
    var needs = (_panel.members || []).filter(function (m) { return m.total_bags === 0; });

    _root.innerHTML = '' +
      '<div class="ksb">' +
        '<header class="ksb-top">' +
          "<h1>Ship desk</h1>" +
          '<button class="ksb-btn ksb-btn--ghost ksb-refresh" id="ksb-refresh">Refresh</button>' +
        "</header>" +

        (needs.length
          ? '<section class="ksb-sec">' +
              "<h2>Waiting on a first bag <span class=\"ksb-count\">" + needs.length + "</span></h2>" +
              needs.map(needsCard).join("") +
            "</section>"
          : "") +

        '<section class="ksb-sec">' +
          '<div class="ksb-sec-head">' +
            "<h2>Bags to send <span class=\"ksb-count\">" + envelopes.length + "</span></h2>" +
            '<button class="ksb-btn ksb-btn--ship ksb-btn--sm" id="ksb-send">+ Send a bag</button>' +
          "</div>" +
          sendForm() +
          (envelopes.length
            ? envelopes.map(bagCard).join("")
            : '<p class="ksb-empty">Nothing to send. Bag-only jobs show up here.</p>') +
        "</section>" +

        '<section class="ksb-sec">' +
          "<h2>Orders to send <span class=\"ksb-count\">" + orders.length + "</span></h2>" +
          (orders.length
            ? orders.map(bagCard).join("")
            : '<p class="ksb-empty">No orders waiting. Checkout puts them here.</p>') +
        "</section>" +
      "</div>";

    wire();
  }

  /* ---------- wiring ---------------------------------------------------- */

  function wire() {
    el("ksb-refresh").addEventListener("click", function (e) {
      withBusy(call({ action: "read" }), e.target, "Loading...");
    });

    var form = el("ksb-form");
    var sendBtn = el("ksb-send");
    var mSel = el("ksb-f-member");
    var sSel = el("ksb-f-source");
    var hint = el("ksb-f-hint");
    var warn = el("ksb-f-warn");

    function refreshHint() {
      var s = SOURCES.filter(function (x) { return x.key === sSel.value; })[0];
      hint.textContent = s ? s.hint : "";
      var opt = mSel.options[mSel.selectedIndex];
      var open = opt ? Number(opt.getAttribute("data-open") || 0) : 0;
      if (open > 0) {
        warn.hidden = false;
        warn.textContent = "⚠ This member already has a bag out. You can still send one — just make sure you mean to.";
      } else {
        warn.hidden = true;
      }
    }

    sendBtn.addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) refreshHint();
    });
    el("ksb-f-close").addEventListener("click", function () { form.hidden = true; });
    mSel.addEventListener("change", refreshHint);
    sSel.addEventListener("change", refreshHint);

    el("ksb-f-create").addEventListener("click", function (e) {
      var memberId = mSel.value;
      if (!memberId) { alert("Choose a member first."); return; }
      withBusy(call({
        action: "create",
        member_id: memberId,
        source: sSel.value
      }), e.target, "Creating...");
    });

    /* one delegated handler for every card action */
    _root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");

      if (act === "create-signup") {
        var nCard = btn.closest("[data-needs]");
        withBusy(call({
          action: "create",
          member_id: nCard.getAttribute("data-needs"),
          source: "signup"
        }), btn, "Creating...");
        return;
      }

      var card = btn.closest("[data-bag]");
      if (!card) return;
      var bagId = card.getAttribute("data-bag");

      if (act === "ship") {
        var out = card.querySelector('[data-tr="out"]').value.trim();
        var ret = card.querySelector('[data-tr="ret"]').value.trim();
        /* ⚠⚠ GUARD 1 — BOTH tracking numbers. Checked here for a fast, kind
           message; ENFORCED in the edge fn, which is the one that counts.
           A tracking number cannot be invented — it is proof the label printed. */
        if (!out || !ret) {
          alert("Both tracking numbers are required.\n\nOne for the outer package, one for the empty bag inside it. If you only have one, the job isn't finished.");
          return;
        }
        withBusy(call({
          action: "ship",
          bag_id: bagId,
          outbound_tracking: out,
          return_tracking: ret
        }), btn, "Shipping...");
        return;
      }

      if (act === "cancel") {
        if (!confirm("Cancel this bag?\n\nUse this when two rows exist for one physical bag. It won't count against her shipping.")) return;
        withBusy(call({ action: "cancel", bag_id: bagId }), btn, "Cancelling...");
      }
    });
  }

  /* ---------- styles ---------------------------------------------------- */

  function injectCSS() {
    if (el("ksb-css")) return;
    var s = document.createElement("style");
    s.id = "ksb-css";
    s.textContent = [
      "#" + MOUNT_ID + " *{box-sizing:border-box}",
      ".ksb{font-family:Quicksand,sans-serif;color:#1E1A19;max-width:900px;margin:0 auto;padding:16px}",
      ".ksb-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}",
      ".ksb h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:40px;margin:0}",
      ".ksb h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:26px;margin:0}",
      ".ksb-sec{margin-top:28px}",
      ".ksb-sec-head{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      ".ksb-count{display:inline-block;min-width:24px;text-align:center;font-family:Quicksand,sans-serif;font-size:13px;font-weight:600;background:#EEEFE3;color:#75736E;border-radius:999px;padding:2px 8px;vertical-align:middle}",
      ".ksb-empty{color:#75736E;font-size:14px;margin:12px 0 0}",
      /* cards are the PRIMARY layout — phone first */
      ".ksb-card{background:#FFF;border:1px solid #EEEFE3;border-left:5px solid #EEEFE3;border-radius:14px;padding:16px;margin-top:12px;box-shadow:0 10px 30px -12px #C9C7BC}",
      ".ksb-age--amber{border-left-color:#E5AD43}",
      ".ksb-age--red{border-left-color:#D65A35}",
      ".ksb-card--needs{border-left-color:#28498D}",
      ".ksb-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
      ".ksb-name{font-family:Quicksand,sans-serif;font-size:18px;font-weight:600;margin:0 0 6px}",
      ".ksb-meta{display:flex;flex-wrap:wrap;gap:6px}",
      ".ksb-chip{font-size:12px;font-weight:600;background:#F7E4D9;color:#D65A35;border-radius:999px;padding:3px 10px}",
      ".ksb-chip--src{background:#EEEFE3;color:#75736E}",
      ".ksb-age{font-size:12px;font-weight:600;color:#75736E;white-space:nowrap}",
      ".ksb-age--amber .ksb-age{color:#E5AD43}",
      ".ksb-age--red .ksb-age{color:#D65A35}",
      ".ksb-addr{margin-top:12px;padding:12px;background:#EEEFE3;border-radius:10px;font-size:15px;line-height:1.5}",
      ".ksb-addr--missing{background:#F7E4D9;color:#D65A35;font-weight:600}",
      ".ksb-note{font-size:13px;color:#75736E;margin:10px 0 0;line-height:1.5}",
      ".ksb-fields{margin-top:12px;display:grid;gap:10px}",
      ".ksb-field{display:block}",
      ".ksb-field>span{display:block;font-size:13px;font-weight:600;margin-bottom:4px}",
      ".ksb-field em{font-style:normal;font-weight:400;color:#75736E}",
      /* 16px inputs: iOS zooms the page on focus below 16 */
      ".ksb-field input,.ksb-field select{width:100%;font-family:Quicksand,sans-serif;font-size:16px;padding:12px;border:1px solid #EEEFE3;border-radius:10px;background:#FFF;color:#1E1A19}",
      ".ksb-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}",
      ".ksb-btn{font-family:Quicksand,sans-serif;font-size:15px;font-weight:600;border-radius:999px;padding:12px 20px;border:1px solid transparent;cursor:pointer;min-height:44px}",
      ".ksb-btn--ship{background:#D65A35;color:#EEEFE3;flex:1}",
      ".ksb-btn--ship:hover{background:#BE4C2E}",
      ".ksb-btn--ghost{background:transparent;color:#75736E;border-color:#EEEFE3}",
      ".ksb-btn--sm{flex:0 0 auto;padding:8px 16px;font-size:14px;min-height:0}",
      ".ksb-btn:disabled{opacity:1;background:#75736E;color:#EEEFE3;cursor:default}",
      ".ksb-form{background:#EEEFE3;border-radius:14px;padding:16px;margin-top:12px;display:grid;gap:10px}",
      ".ksb-hint{font-size:13px;color:#75736E;margin:0}",
      ".ksb-warn{font-size:13px;color:#D65A35;font-weight:600;margin:0;line-height:1.5}",
      ".ksb-refresh{min-height:0;padding:8px 16px;font-size:14px}",
      /* desktop enhancement: two fields side by side, tighter cards */
      "@media(min-width:721px){.ksb-fields{grid-template-columns:1fr 1fr}.ksb-btn--ship{flex:0 0 auto}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ---------- boot ------------------------------------------------------ */

  function boot() {
    _root = el(MOUNT_ID);
    if (!_root) { console.warn("[ks-bags] no #" + MOUNT_ID + " on this page"); return; }
    injectCSS();
    _root.innerHTML = '<p style="font-family:Quicksand,sans-serif;color:#75736E;padding:16px">Loading the ship desk...</p>';

  /* ⚠ getMemberCookie() is SYNCHRONOUS — it returns the token string, not a
       promise. Calling .then() on it throws OUTSIDE the catch below and freezes
       the page on "Loading...". Found live 2026-07-12. */
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
