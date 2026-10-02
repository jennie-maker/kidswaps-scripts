/* sort-tool.js — /admin/sort, the new sorting page (replaces the Wized grading page).
   Built S428 to the approved option A mockup (https://claude.ai/artifact/4VYF5pMqFuxiCRrdGrARRM).
   Every save goes through the same doorman (grading-db) with the same columns the
   Wized page sent, and closing a bag fires the same Make webhook (S27), so credits
   and emails don't change. The old /admin/grading page stays untouched as the rollback. */
(function () {
  "use strict";

  var BUILD = "sort-tool S428 v1";
  var ROOT_ID = "ks-sort-app";
  var BASE = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1";
  var DOOR = BASE + "/grading-db";
  var FN_UPLOAD = BASE + "/inventory-upload";
  var REST = "https://ajsobivqxexcniwifxzz.supabase.co/rest/v1";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM";   // public anon key, the same one listing-tool.js uses
  var S27_URL = "https://hook.us2.make.com/72890oaid7b726tcy2sxdcyu5y2u6iog";
  var LISTING_URL = "/admin/listing";

  var TIERS = ["essentials", "elevated", "special"];
  var TIER_LABEL = { essentials: "Essentials", elevated: "Elevated", special: "Special" };
  var TIER_RETAIL = { essentials: 25, elevated: 45, special: 85 }; // same placeholder values the old page saved
  var REASONS = {
    clothing: ["Stains", "Holes or tears", "Pilling", "Fading", "Excessive wear", "Stretched or misshapen",
      "Missing buttons", "Broken zipper", "Broken snaps or fasteners", "Unwashed", "Smell or odor", "Pet hair",
      "Out of style", "Size out of range", "Brand not accepted", "Item type not eligible for plan",
      "Transit damage", "Other"],
    toy: ["Missing pieces", "Cracked or damaged", "Stain or discoloration", "Peeling or fading", "Excessive wear",
      "Sharp or unsafe components", "Electronic (not accepted)", "Licensed character", "Pet hair",
      "Item type not eligible for plan", "Transit damage", "Other"]
  };
  var MAX_PHOTOS = 3;

  var root = null;
  var S = {
    screen: "loading",   // loading | start | sort | close | closed | error
    msg: "",
    batch: null, member: null, records: [],
    brands: { clothing: [], toy: [] },
    options: {},
    nextSku: "",
    item: null,
    viewRec: null,       // a saved record opened from the dots
    start: { trackQ: "", memberQ: "", members: [], member: null, clothing: "", toy: "" },
    close: { note: "" },
    addBrand: null,      // { name, tier } while the new-brand panel is open
    errors: [],
    busy: false,
    toast: ""
  };

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { s = String(s || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  function nameOf(m) {
    if (!m) return "";
    return (cap(m.first_name) + " " + cap(m.last_name)).trim() || m.email || "this member";
  }
  function firstOf(m) { return m ? (cap(m.first_name) || "the member") : "the member"; }
  function plainPlan(p) {
    return String(p || "").replace(/[_-]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim() || "Unknown";
  }
  function normSku(raw) {
    var d = String(raw || "").replace(/[^0-9]/g, "");
    return d ? "KS-" + d.padStart(5, "0") : "";
  }
  function skuPlusOne(label) {
    var d = String(label || "").replace(/[^0-9]/g, "");
    var n = d ? parseInt(d, 10) : 0;
    return "KS-" + String(n + 1).padStart(5, "0");
  }
  function num(v) { var n = Number(String(v || "").trim()); return isFinite(n) ? n : NaN; }
  function tierRank(t) { return TIERS.indexOf(t); }
  function fmtCredit(n) { return (Math.round(n * 2) / 2).toString(); }

  /* ---------- talking to the server ---------- */
  function token() {
    var ms = window.$memberstackDom;
    if (!ms) return Promise.reject(new Error("Memberstack isn't loaded"));
    return Promise.resolve(ms.getMemberCookie()).then(function (t) {
      if (!t) throw new Error("You're not logged in");
      return t;
    });
  }
  function door(method, path, body, extra) {
    return token().then(function (t) {
      var h = { "x-ms-token": t };
      if (body !== undefined) h["Content-Type"] = "application/json";
      if (method === "POST" || method === "PATCH") h["Prefer"] = "return=representation";
      if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
      return fetch(DOOR + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (!r.ok) {
          var m = data && (data.message || data.error) ? (data.message || data.error) : ("status " + r.status);
          var err = new Error(m); err.status = r.status; throw err;
        }
        return data;
      });
    });
  }
  function firstRow(d) { return Array.isArray(d) ? (d[0] || null) : (d && typeof d === "object" ? d : null); }

  function loadOptions() {
    return fetch(REST + "/option_lists?active=eq.true&select=field,value,display_label,sort_order&order=field,sort_order",
      { headers: { apikey: ANON, authorization: "Bearer " + ANON } })
      .then(function (r) { if (!r.ok) throw new Error("option lists " + r.status); return r.json(); })
      .then(function (rows) {
        var o = {};
        rows.forEach(function (row) { (o[row.field] = o[row.field] || []).push(row); });
        S.options = o;
      });
  }
  function loadBrands() {
    // The whole list once, filtered on the phone (the old page asked the server on every letter).
    return door("GET", "/brands?select=id,brand_name,item_type,default_tier,condition_restriction&order=brand_name.asc")
      .then(function (rows) {
        S.brands = { clothing: [], toy: [] };
        (rows || []).forEach(function (b) { if (S.brands[b.item_type]) S.brands[b.item_type].push(b); });
      });
  }
  function loadNextSku() {
    return door("GET", "/grading_next_label_source?label_number=gt.KS-&select=label_number&order=label_sort_num.desc&limit=1")
      .then(function (rows) { var r = firstRow(rows); S.nextSku = skuPlusOne(r ? r.label_number : ""); });
  }
  function loadRecords() {
    if (!S.batch) { S.records = []; return Promise.resolve(); }
    var sel = "id,status,tier,label_number,reject_reason,reject_reason_other_text,item_type,brand,category,size,credit_amount_at_grading,graded_item_name";
    return door("GET", "/intake_records?select=" + sel + "&batch_id=eq." + S.batch.id + "&order=created_at.asc")
      .then(function (rows) { S.records = rows || []; });
  }
  function loadOpenBatch() {
    return door("GET", "/intake_batches?status=eq.stage_1_in_progress&order=created_at.desc&limit=1")
      .then(function (rows) {
        S.batch = firstRow(rows);
        if (!S.batch) { S.member = null; S.records = []; return; }
        return door("GET", "/members?id=eq." + encodeURIComponent(S.batch.member_id) + "&select=id,first_name,last_name,email,plan,status")
          .then(function (m) { S.member = firstRow(m); return loadRecords(); });
      });
  }

  /* ---------- the item being sorted ---------- */
  function newItem(type) {
    S.item = {
      type: type || (S.item ? S.item.type : "clothing"),
      brandQ: "", brand: null,
      catQ: "", category: "",
      size: "", sizeOther: false, sizeOtherText: "", pieces: "",
      ages: [], complete: true,
      tier: "", half: false, halfReason: "",
      sku: S.nextSku,
      photos: [],
      declining: false, reasons: [], otherText: "", note: "", toyName: ""
    };
    S.addBrand = null; S.errors = []; S.viewRec = null;
  }
  function totalCount() {
    if (!S.batch) return 0;
    return (Number(S.batch.clothing_items_counted_at_batch_open) || 0) + (Number(S.batch.toy_items_counted_at_batch_open) || 0);
  }
  function brandList() {
    var it = S.item, all = S.brands[it.type] || [];
    var q = it.brandQ.trim().toLowerCase();
    if (it.brand && it.brand.brand_name.toLowerCase() === q) return { rows: [it.brand], exact: true };
    if (q.length < 1) return { rows: [], exact: false };
    var starts = [], has = [], exact = false;
    all.forEach(function (b) {
      var n = b.brand_name.toLowerCase();
      if (n === q) exact = true;
      if (n.indexOf(q) === 0) starts.push(b); else if (n.indexOf(q) > -1) has.push(b);
    });
    return { rows: starts.concat(has).slice(0, 8), exact: exact };
  }
  function catList() {
    var it = S.item, all = (S.options.category || []).map(function (r) { return r.value; });
    var q = it.catQ.trim().toLowerCase();
    if (it.category && it.category.toLowerCase() === q) return [it.category];
    if (!q) return [];
    var starts = [], has = [];
    all.forEach(function (v) { var n = v.toLowerCase(); if (n.indexOf(q) === 0) starts.push(v); else if (n.indexOf(q) > -1) has.push(v); });
    return starts.concat(has).slice(0, 8);
  }
  function sizeOptions() {
    var key = S.item.category === "Shoes" ? "shoe_size" : "clothing_size";
    return (S.options[key] || []).map(function (r) { return r.value; });
  }
  function ageOptions() {
    var rows = S.options.toy_age || [];
    return rows.length ? rows.map(function (r) { return r.value; }) : ["Baby", "Toddler", "Preschool", "Big Kid"];
  }
  function sizeValue() {
    var it = S.item;
    if (it.type === "toy") {
      var order = ageOptions();
      return it.ages.slice().sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).join(", ");
    }
    return it.sizeOther ? it.sizeOtherText.trim() : it.size;
  }

  /* ---------- rough photos ---------- */
  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, max = 1600, k = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement("canvas");
          cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) {
            URL.revokeObjectURL(url);
            resolve(b ? new File([b], "rough-" + Date.now() + ".jpg", { type: "image/jpeg" }) : file);
          }, "image/jpeg", 0.82);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function upload(file) {
    return token().then(function (t) {
      return fetch(FN_UPLOAD, {
        method: "POST",
        headers: { "x-ms-token": t, "content-type": file.type, "x-file-name": file.name, "x-file-kind": "photo",
          apikey: ANON, authorization: "Bearer " + ANON },
        body: file
      });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ("status " + r.status)); return j.url; });
    });
  }
  function addPhotos(files) {
    var it = S.item;
    Array.prototype.slice.call(files || []).slice(0, MAX_PHOTOS - it.photos.length).forEach(function (f) {
      var p = { status: "uploading", url: null, preview: URL.createObjectURL(f) };
      it.photos.push(p);
      shrink(f).then(upload).then(function (u) { p.url = u; p.status = "done"; render(); })
        .catch(function (e) { p.status = "error"; console.error("[sort-tool upload]", e); render(); });
    });
    render();
  }

  /* ---------- saving ---------- */
  function validate(decline) {
    var it = S.item, e = [];
    if (!it.brand) e.push("Pick a brand.");
    if (it.type === "clothing") {
      if (!it.category) e.push("Pick a category.");
      if (!sizeValue()) e.push("Pick a size.");
    }
    if (it.photos.some(function (p) { return p.status === "uploading"; })) e.push("Wait for the photos to finish uploading.");
    if (decline) {
      if (!it.reasons.length) e.push("Pick at least one reason.");
      if (it.reasons.indexOf("Other") > -1 && !it.otherText.trim()) e.push("Say what the other reason is.");
      if (it.type === "toy" && !it.toyName.trim()) e.push("Give the toy a short name, so the email can say what it was.");
    } else {
      if (it.type === "toy" && !it.ages.length) e.push("Pick an age range.");
      if (!it.half && !it.tier) e.push("Pick a tier.");
      if (!normSku(it.sku)) e.push("Add the SKU.");
      if (it.type === "clothing" && it.category === "Sets" && !(num(it.pieces) >= 2)) e.push("Say how many pieces are in the set.");
    }
    return e;
  }
  function baseBody() {
    var it = S.item, b = it.brand;
    var urls = it.photos.filter(function (p) { return p.status === "done" && p.url; }).map(function (p) { return p.url; });
    var body = {
      batch_id: S.batch.id,
      item_type: it.type,
      brand: b.brand_name,
      size: sizeValue() || null,
      category: it.type === "clothing" ? it.category : null,
      condition_restriction_at_grading: b.condition_restriction === "new_or_like_new_only",
      is_complete: it.type === "toy" ? it.complete : true,
      graded_item_name: null,
      graded_item_description: null
    };
    if (urls.length) body.photo_urls = urls; // only sent when there are rough photos
    return body;
  }
  function post(body) {
    return door("POST", "/intake_records", body).catch(function (err) {
      // If the doorman refuses the photos column, save the item without its photos rather than lose it.
      if (body.photo_urls) {
        var b2 = {}; Object.keys(body).forEach(function (k) { if (k !== "photo_urls") b2[k] = body[k]; });
        return door("POST", "/intake_records", b2).then(function (d) {
          S.toast = "Saved, but the rough photos didn't attach (" + err.message + ").";
          return d;
        });
      }
      throw err;
    });
  }
  function afterSave() {
    return Promise.all([loadRecords(), loadNextSku()]).then(function () {
      var type = S.item.type;
      newItem(type);
      S.busy = false;
      if (S.records.length >= totalCount() && totalCount() > 0) S.screen = "close";
      render();
      window.scrollTo(0, 0);
    });
  }
  function fail(err) {
    S.busy = false;
    S.errors = ["That didn't save: " + (err && err.message ? err.message : err) + ". Nothing was lost; try again."];
    render();
  }
  function saveKeep() {
    var it = S.item;
    S.errors = validate(false);
    if (S.errors.length) { render(); return; }
    var sku = normSku(it.sku);
    S.busy = true; render();
    door("GET", "/grading_next_label_source?label_number=eq." + encodeURIComponent(sku) + "&select=label_number&limit=1")
      .then(function (rows) {
        if (rows && rows.length) {
          S.busy = false;
          S.errors = [sku + " is already used. Check the sticker, or use " + S.nextSku + "."];
          render(); throw null;
        }
        var b = baseBody(), def = it.brand.default_tier || "essentials";
        var tier = it.half ? "essentials" : it.tier;
        var r = tierRank(tier), d = tierRank(def);
        b.tier = tier;
        b.would_be_tier = def;
        b.tier_override_reason = r > d ? "Upgrade (pristine)" : (r < d ? "Downgrade (worn condition)" : null);
        b.retail_value = it.type === "clothing" ? (TIER_RETAIL[tier] || null) : null;
        b.label_number = sku;
        b.is_matching_set = it.type === "clothing" && it.category === "Sets";
        b.set_piece_count = b.is_matching_set ? num(it.pieces) : null;
        b.operator_item_notes = null;
        b.status = "accepted_at_grading";
        b.stage_2_research_note = null;
        b.credit_amount_at_grading = it.half ? 0.5 : 1;
        b.credit_amount_reason = it.half ? (it.halfReason.trim() || null) : null;
        return post(b);
      })
      .then(afterSave)
      .catch(function (err) { if (err) fail(err); });
  }
  function saveDecline() {
    var it = S.item;
    S.errors = validate(true);
    if (S.errors.length) { render(); return; }
    S.busy = true; render();
    var b = baseBody();
    b.tier_override_reason = null;
    b.label_number = null;
    b.operator_item_notes = it.note.trim() || null;
    b.status = "rejected_at_grading";
    b.stage_2_research_note = it.type === "toy" ? it.toyName.trim() : null;
    b.graded_item_name = it.type === "toy" ? it.toyName.trim() : null;
    b.reject_reason = it.reasons.slice();
    b.reject_reason_other_text = it.reasons.indexOf("Other") > -1 ? it.otherText.trim() : null;
    post(b).then(afterSave).catch(fail);
  }
  function removeRecord(rec) {
    if (!window.confirm("Remove this item from the bag? You can sort it again right after.")) return;
    S.busy = true; render();
    door("DELETE", "/intake_records?id=eq." + rec.id)
      .then(function () { return Promise.all([loadRecords(), loadNextSku()]); })
      .then(function () { S.busy = false; S.viewRec = null; S.screen = "sort"; newItem(S.item ? S.item.type : "clothing"); render(); })
      .catch(fail);
  }
  function saveBrand() {
    var a = S.addBrand, it = S.item;
    if (!a.name.trim() || !a.tier) { S.errors = ["Type the brand name and pick its tier."]; render(); return; }
    S.busy = true; render();
    door("POST", "/brands", {
      brand_name: a.name.trim(),
      item_type: it.type,
      default_tier: a.tier === "condition_gated" ? "essentials" : a.tier,
      condition_restriction: a.tier === "condition_gated" ? "new_or_like_new_only" : null,
      last_verified: new Date().toISOString().split("T")[0]
    }, { Accept: "application/vnd.pgrst.object+json" }).then(function (d) {
      var row = firstRow(d);
      if (!row || !row.id) return loadBrands().then(function () {
        row = (S.brands[it.type] || []).filter(function (b) { return b.brand_name.toLowerCase() === a.name.trim().toLowerCase(); })[0];
        return row;
      });
      S.brands[it.type].push(row);
      return row;
    }).then(function (row) {
      S.busy = false; S.addBrand = null; S.errors = [];
      if (row) pickBrand(row);
      render();
    }).catch(fail);
  }
  function pickBrand(b) {
    var it = S.item;
    it.brand = b; it.brandQ = b.brand_name;
    if (!it.half) it.tier = b.default_tier || "essentials";
  }

  /* ---------- start, cancel and close a bag ---------- */
  var memberTimer = null;
  function searchMembers() {
    clearTimeout(memberTimer);
    var q = S.start.memberQ.trim();
    if (q.length < 2) { S.start.members = []; renderPart("members"); return; }
    memberTimer = setTimeout(function () {
      // Paused members' bags get sorted too (Bag Processed has a Paused version), so both statuses are searched.
      door("GET", "/members?status=in.(active,paused)&email=ilike." + encodeURIComponent("*" + q + "*") +
        "&select=id,first_name,last_name,email,plan,status&order=last_name.asc&limit=8")
        .then(function (rows) { if (S.start.memberQ.trim() === q) { S.start.members = rows || []; renderPart("members"); } })
        .catch(function (e) { console.error("[sort-tool members]", e); });
    }, 250);
  }
  function startBag() {
    var st = S.start, e = [];
    var c = st.clothing.trim() === "" ? 0 : num(st.clothing), t = st.toy.trim() === "" ? 0 : num(st.toy);
    if (!st.member) e.push("Pick the member.");
    if (!(c >= 0) || !(t >= 0) || c % 1 || t % 1) e.push("Counts must be whole numbers.");
    else if (c + t < 1) e.push("Say how many items are in the bag.");
    S.errors = e;
    if (e.length) { render(); return; }
    S.busy = true; render();
    door("POST", "/intake_batches", {
      member_id: st.member.id,
      clothing_items_counted_at_batch_open: c,
      toy_items_counted_at_batch_open: t,
      status: "stage_1_in_progress",
      inbound_tracking_number: st.trackQ.trim() || null
    }, { Accept: "application/vnd.pgrst.object+json" })
      .then(function () { return loadOpenBatch(); })
      .then(function () {
        S.busy = false; S.errors = [];
        if (!S.batch) throw new Error("the bag was made but couldn't be read back; reload the page");
        newItem(c > 0 ? "clothing" : "toy");
        S.screen = "sort"; render();
      }).catch(fail);
  }
  function cancelBag() {
    if (!window.confirm("Cancel " + nameOf(S.member) + "'s bag? No credits or email go out. Items already sorted stay saved on the cancelled bag.")) return;
    S.busy = true; render();
    door("PATCH", "/intake_batches?id=eq." + S.batch.id, { status: "cancelled" })
      .then(function () { return loadOpenBatch(); })
      .then(function () { S.busy = false; S.screen = "start"; render(); })
      .catch(fail);
  }
  function creditSummary() {
    var by = { essentials: 0, elevated: 0, special: 0 }, kept = 0, dec = 0;
    S.records.forEach(function (r) {
      if (r.status === "accepted_at_grading") { kept++; by[r.tier] = (by[r.tier] || 0) + (Number(r.credit_amount_at_grading) || 0); }
      else if (r.status === "rejected_at_grading") dec++;
    });
    var parts = TIERS.filter(function (t) { return by[t] > 0; }).map(function (t) { return fmtCredit(by[t]) + " " + TIER_LABEL[t]; });
    var total = TIERS.reduce(function (s, t) { return s + by[t]; }, 0);
    return { kept: kept, dec: dec, text: parts.join(", ") || "None", total: total };
  }
  function closeBag() {
    var sorted = S.records.length, total = totalCount();
    if (!sorted) { S.errors = ["Sort at least one item before closing the bag."]; render(); return; }
    if (sorted < total && !window.confirm("You've sorted " + sorted + " of " + total + ". Close the bag anyway?")) return;
    S.busy = true; S.errors = []; render();
    var cl = S.records.filter(function (r) { return r.item_type === "clothing"; }).length;
    var ty = S.records.filter(function (r) { return r.item_type === "toy"; }).length;
    var b = S.batch, fix = Promise.resolve();
    if (cl !== Number(b.clothing_items_counted_at_batch_open) || ty !== Number(b.toy_items_counted_at_batch_open)) {
      fix = door("PATCH", "/intake_batches?id=eq." + b.id, {
        clothing_items_counted_at_batch_open: cl,
        toy_items_counted_at_batch_open: ty,
        items_count_change_reason: "Counts adjusted at batch close to match graded items"
      });
    }
    fix.then(function () {
      var note = S.close.note.trim();
      return fetch(S27_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: b.id,
          personal_note_from_operator: note.length ? note : "-",
          operator_executed_at: new Date().toISOString(),
          scenario_event_id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
        })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("Make answered " + r.status + ". The bag isn't closed and nothing was sent");
      S.closedSummary = { name: firstOf(S.member), credits: creditSummary() };
      S.busy = false; S.screen = "closed"; render(); window.scrollTo(0, 0);
    }).catch(fail);
  }

  /* ---------- drawing ---------- */
  function pills(list, isSel, act, cls) {
    return '<div class="ss-pills ' + (cls || "") + '">' + list.map(function (v) {
      var val = typeof v === "object" ? v.value : v, lab = typeof v === "object" ? v.label : v;
      return '<button type="button" class="ss-pill' + (isSel(val) ? " sel" : "") + '" data-act="' + act + '" data-val="' + esc(val) + '">' + esc(lab) + "</button>";
    }).join("") + "</div>";
  }
  function errorBox() {
    if (!S.errors.length) return "";
    return '<div class="ss-err" role="alert">' + S.errors.map(function (e) { return "<p>" + esc(e) + "</p>"; }).join("") + "</div>";
  }
  function header(eyebrow) {
    var total = totalCount(), n = S.records.length;
    var kept = S.records.filter(function (r) { return r.status === "accepted_at_grading"; }).length;
    var pct = total ? Math.min(100, Math.round(n / total * 100)) : 0;
    var dots = "";
    for (var i = 0; i < Math.max(total, n + 1); i++) {
      var r = S.records[i];
      var cls = r ? (r.status === "accepted_at_grading" ? " kept" : " dec") : (i === n ? " now" : "");
      dots += '<button type="button" class="ss-dot' + cls + '" data-act="dot" data-val="' + i + '" aria-label="Item ' + (i + 1) + '">' + (i + 1) + "</button>";
    }
    return '<div class="ss-head"><p class="ss-eyebrow">' + esc(eyebrow) + '</p><h1 class="ss-h1">' + esc(nameOf(S.member)) + "'s bag</h1>" +
      '<p class="ss-sub">' + (n < total ? "Item " + (n + 1) + " of " + total : n + " of " + total + " sorted") + " · " + kept + " kept · " + (n - kept) + " declined</p>" +
      '<div class="ss-bar"><span style="width:' + pct + '%"></span></div><div class="ss-strip">' + dots + "</div></div>";
  }
  function viewStart() {
    if (S.batch) {
      var n = S.records.length;
      return '<div class="ss-head"><h1 class="ss-h1">Sort a bag</h1></div>' +
        '<div class="ss-card"><p class="ss-lab">A bag is already open</p><p class="ss-sub">' + esc(nameOf(S.member)) + "'s bag, " + n + " of " + totalCount() + " sorted.</p></div>" + errorBox() +
        '<button type="button" class="ss-btn" data-act="resume"' + (S.busy ? " disabled" : "") + ">Keep sorting this bag</button>" +
        '<button type="button" class="ss-btn ghost" data-act="cancel-bag"' + (S.busy ? " disabled" : "") + ">Cancel this bag</button>";
    }
    var st = S.start;
    return '<div class="ss-head"><h1 class="ss-h1">Sort a bag</h1><p class="ss-sub">Find the member, then count what\'s in the bag.</p></div>' +
      '<div class="ss-card">' +
      '<div><label class="ss-lab" for="ss-track">Return label</label><input id="ss-track" class="ss-inp" type="text" data-k="trackQ" autocomplete="off" autocorrect="off" autocapitalize="characters" placeholder="Scan or type the tracking number" value="' + esc(st.trackQ) + '"></div>' +
      '<div><label class="ss-lab" for="ss-member">Member email <span class="ss-req">*</span></label><input id="ss-member" class="ss-inp" type="email" data-k="memberQ" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Type part of her email" value="' + esc(st.memberQ) + '">' +
      '<div data-part="members">' + viewMembers() + "</div></div>" +
      '<div class="ss-grid2"><div><label class="ss-lab" for="ss-cc">Clothing items</label><input id="ss-cc" class="ss-inp" type="text" inputmode="numeric" data-k="clothing" value="' + esc(st.clothing) + '"></div>' +
      '<div><label class="ss-lab" for="ss-tc">Toys</label><input id="ss-tc" class="ss-inp" type="text" inputmode="numeric" data-k="toy" value="' + esc(st.toy) + '"></div></div>' +
      "</div>" + errorBox() +
      '<button type="button" class="ss-btn" data-act="start"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Starting…" : "Start sorting") + "</button>";
  }
  function viewMembers() {
    var st = S.start;
    if (st.member) {
      return '<div class="ss-list"><button type="button" class="ss-row sel" data-act="member-clear">' + esc(nameOf(st.member)) +
        " <small>" + esc(plainPlan(st.member.plan)) + (st.member.status === "paused" ? " · paused" : "") + "</small></button></div>";
    }
    if (!st.members.length) return st.memberQ.trim().length >= 2 ? '<p class="ss-hint">No active or paused member matches that.</p>' : "";
    return '<div class="ss-list">' + st.members.map(function (m, i) {
      return '<button type="button" class="ss-row" data-act="member" data-val="' + i + '">' + esc(nameOf(m)) + " <small>" + esc(m.email) + "</small></button>";
    }).join("") + "</div>";
  }
  function viewBrandBlock() {
    var it = S.item, a = S.addBrand;
    if (a) {
      return '<div class="ss-addbrand"><p class="ss-lab">New brand: ' + esc(a.name) + '</p><p class="ss-hint">Its usual tier. This is saved for every future ' + (it.type === "toy" ? "toy" : "item") + " from this brand.</p>" +
        pills([{ value: "essentials", label: "Essentials" }, { value: "elevated", label: "Elevated" }, { value: "special", label: "Special" }, { value: "condition_gated", label: "Only new or like new" }],
          function (v) { return a.tier === v; }, "newbrand-tier", "two") +
        '<div class="ss-grid2"><button type="button" class="ss-btn small" data-act="newbrand-save"' + (S.busy ? " disabled" : "") + '>Save brand</button><button type="button" class="ss-btn small ghost" data-act="newbrand-cancel">Cancel</button></div></div>';
    }
    var bl = brandList(), q = it.brandQ.trim();
    var rows = bl.rows.map(function (b) {
      return '<button type="button" class="ss-row' + (it.brand && it.brand.id === b.id ? " sel" : "") + '" data-act="brand" data-val="' + esc(b.id) + '">' + esc(b.brand_name) +
        " <small>" + esc(TIER_LABEL[b.default_tier] || "") + (b.condition_restriction === "new_or_like_new_only" ? " · new or like new only" : "") + "</small></button>";
    }).join("");
    if (q.length >= 2 && !bl.exact && !(it.brand && it.brand.brand_name.toLowerCase() === q.toLowerCase())) {
      rows += '<button type="button" class="ss-row add" data-act="newbrand">+ Add "' + esc(q) + '" as a new brand</button>';
    }
    return rows ? '<div class="ss-list">' + rows + "</div>" : "";
  }
  function viewCatBlock() {
    var it = S.item, list = catList();
    if (!list.length) return it.catQ.trim() && !it.category ? '<p class="ss-hint">No category matches that.</p>' : "";
    return '<div class="ss-list">' + list.map(function (v) {
      return '<button type="button" class="ss-row' + (it.category === v ? " sel" : "") + '" data-act="cat" data-val="' + esc(v) + '">' + esc(v) + "</button>";
    }).join("") + "</div>";
  }
  function viewSort() {
    if (S.viewRec) return viewSavedRecord();
    var it = S.item, toy = it.type === "toy";
    var h = header("Sorting");
    h += '<div class="ss-toggle"><button type="button" class="' + (toy ? "" : "on") + '" data-act="type" data-val="clothing">Clothing</button><button type="button" class="' + (toy ? "on" : "") + '" data-act="type" data-val="toy">Toy</button></div>';

    var top = '<div class="ss-card"><div><label class="ss-lab" for="ss-brand">Brand <span class="ss-req">*</span></label>' +
      '<input id="ss-brand" class="ss-inp" type="text" data-k="brandQ" autocomplete="off" autocorrect="off" autocapitalize="words" value="' + esc(it.brandQ) + '">' +
      '<div data-part="brands">' + viewBrandBlock() + "</div>" +
      (it.brand && it.brand.condition_restriction === "new_or_like_new_only" ? '<p class="ss-hint warn">This brand is only accepted new or like new.</p>' : "") + "</div>";
    if (!toy) {
      top += '<div><label class="ss-lab" for="ss-cat">Category <span class="ss-req">*</span></label>' +
        '<input id="ss-cat" class="ss-inp" type="text" data-k="catQ" autocomplete="off" autocorrect="off" value="' + esc(it.catQ) + '">' +
        '<div data-part="cats">' + viewCatBlock() + "</div></div>";
      if (it.category === "Sets") {
        top += '<div><label class="ss-lab" for="ss-pieces">Pieces in the set <span class="ss-req">*</span></label><input id="ss-pieces" class="ss-inp" type="text" inputmode="numeric" data-k="pieces" value="' + esc(it.pieces) + '"></div>';
      }
      var sizes = sizeOptions();
      top += '<div><p class="ss-lab">Size <span class="ss-req">*</span></p>' +
        pills(sizes, function (v) { return !it.sizeOther && it.size === v; }, "size") +
        '<button type="button" class="ss-pill wide' + (it.sizeOther ? " sel" : "") + '" data-act="size-other">Other size</button>' +
        (it.sizeOther ? '<input class="ss-inp ss-gap" type="text" data-k="sizeOtherText" autocorrect="off" placeholder="Size on the tag, like 8 or 10/12" value="' + esc(it.sizeOtherText) + '">' : "") + "</div>";
    } else {
      top += '<div><p class="ss-lab">Age range <span class="ss-req">*</span> <span class="ss-opt">pick all that fit</span></p>' +
        pills(ageOptions(), function (v) { return it.ages.indexOf(v) > -1; }, "age", "two") + "</div>" +
        '<div><p class="ss-lab">All the pieces?</p>' +
        pills([{ value: "yes", label: "Complete" }, { value: "no", label: "Missing pieces" }], function (v) { return (v === "yes") === it.complete; }, "complete", "two") + "</div>";
    }
    top += "</div>";

    var photos = '<div class="ss-card"><p class="ss-lab">Rough photos <span class="ss-opt">optional</span></p><div class="ss-thumbs">' +
      it.photos.map(function (p, i) {
        return '<div class="ss-thumb" style="background-image:url(\'' + esc(p.preview) + '\')"><span>' + (p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Didn't upload" : "Rough " + (i + 1)) +
          '</span><button type="button" class="ss-x" data-act="photo-remove" data-val="' + i + '" aria-label="Remove photo">×</button></div>';
      }).join("") +
      (it.photos.length < MAX_PHOTOS ? '<label class="ss-thumb add">+ Photo<input type="file" accept="image/*" capture="environment" multiple data-act="photo-add" hidden></label>' : "") +
      '</div><p class="ss-hint">Quick snaps for research later. When you list it, your good photos replace these.</p></div>';

    if (it.declining) {
      var reasons = REASONS[it.type];
      var dec = '<div class="ss-card"><p class="ss-lab">Why it\'s declined <span class="ss-req">*</span> <span class="ss-opt">pick all that fit</span></p>' +
        pills(reasons, function (v) { return it.reasons.indexOf(v) > -1; }, "reason", "two") +
        (it.reasons.indexOf("Other") > -1 ? '<input class="ss-inp ss-gap" type="text" data-k="otherText" placeholder="What\'s the other reason?" value="' + esc(it.otherText) + '">' : "") +
        (toy ? '<div><label class="ss-lab" for="ss-tn">Short name <span class="ss-req">*</span></label><input id="ss-tn" class="ss-inp" type="text" data-k="toyName" autocapitalize="sentences" placeholder="Like wooden train set" value="' + esc(it.toyName) + '"><p class="ss-hint">The email uses this to say what came back.</p></div>' : "") +
        '<div><label class="ss-lab" for="ss-note">Note for you <span class="ss-opt">optional, members never see it</span></label><input id="ss-note" class="ss-inp" type="text" data-k="note" value="' + esc(it.note) + '"></div></div>';
      return h + top + dec + photos + errorBox() +
        '<button type="button" class="ss-btn" data-act="decline-save"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : "Decline it, next item") + "</button>" +
        '<button type="button" class="ss-btn ghost" data-act="decline-off">Back to keeping it</button>' + footerLinks();
    }

    var tierCard = '<div class="ss-card"><div><p class="ss-lab">Tier <span class="ss-req">*</span></p>' +
      pills([{ value: "essentials", label: "Essentials" }, { value: "elevated", label: "Elevated" }, { value: "special", label: "Special" }, { value: "half", label: "Half credit" }],
        function (v) { return v === "half" ? it.half : (!it.half && it.tier === v); }, "tier", "two") +
      '<p class="ss-hint">' + (it.brand ? "Picked for you from the brand (" + esc(TIER_LABEL[it.brand.default_tier] || "Essentials") + "). Change it if this piece is better or worse than usual." : "Picked for you once you choose the brand.") + "</p>" +
      (it.half ? '<input class="ss-inp ss-gap" type="text" data-k="halfReason" placeholder="Why half? (optional, just for you)" value="' + esc(it.halfReason) + '">' : "") + "</div>" +
      '<div><label class="ss-lab" for="ss-sku">SKU <span class="ss-req">*</span></label><input id="ss-sku" class="ss-inp" type="text" inputmode="numeric" data-k="sku" autocomplete="off" autocorrect="off" autocapitalize="characters" value="' + esc(it.sku) + '">' +
      '<p class="ss-hint">The next unused SKU. Stick the sticker on and check it matches.</p></div></div>';

    return h + top + tierCard + photos + errorBox() +
      '<button type="button" class="ss-btn" data-act="keep"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : "Keep it, next item") + "</button>" +
      '<button type="button" class="ss-btn ghost" data-act="decline-on">Decline it</button>' + footerLinks();
  }
  function footerLinks() {
    return '<div class="ss-links"><button type="button" class="ss-link" data-act="to-close">Close the bag</button></div>';
  }
  function viewSavedRecord() {
    var r = S.viewRec, i = S.records.indexOf(r);
    var kept = r.status === "accepted_at_grading";
    var bits = [r.brand, r.category, r.size].filter(Boolean).join(" · ");
    return header("Sorting") +
      '<div class="ss-card"><p class="ss-lab">Item ' + (i + 1) + ": " + (kept ? "kept" : "declined") + "</p><p class=\"ss-sub\">" + esc(bits || r.graded_item_name || "") + "</p>" +
      (kept ? '<p class="ss-sub">' + esc(TIER_LABEL[r.tier] || r.tier) + (Number(r.credit_amount_at_grading) === 0.5 ? ", half credit" : "") + " · " + esc(r.label_number || "") + "</p>" :
        '<p class="ss-sub">' + esc((r.reject_reason || []).join(", ")) + "</p>") +
      '<p class="ss-hint">To change it, remove it and sort it again. Its SKU sticker can be reused.</p></div>' + errorBox() +
      '<button type="button" class="ss-btn ghost" data-act="rec-remove"' + (S.busy ? " disabled" : "") + ">Remove it and sort it again</button>" +
      '<button type="button" class="ss-btn" data-act="rec-back">Back to the next item</button>';
  }
  function viewClose() {
    var c = creditSummary();
    return '<div class="ss-head"><p class="ss-eyebrow">' + S.records.length + " of " + totalCount() + " items sorted</p><h1 class=\"ss-h1\">Close " + esc(firstOf(S.member)) + "'s bag</h1>" +
      '<p class="ss-sub">Credits land and the email goes out as soon as you close it.</p></div>' +
      '<div class="ss-card"><div class="ss-sum"><span>Kept</span><b>' + c.kept + '</b></div><div class="ss-sum"><span>Declined</span><b>' + c.dec + "</b></div>" +
      '<div class="ss-sum"><span>Credits</span><b>' + esc(c.text) + '</b></div><div class="ss-sum"><span>Plan</span><b>' + esc(plainPlan(S.member && S.member.plan)) + "</b></div></div>" +
      '<div class="ss-card"><label class="ss-lab" for="ss-pn">A personal note in her email <span class="ss-opt">optional</span></label>' +
      '<textarea id="ss-pn" class="ss-inp big" data-k="closeNote" autocapitalize="sentences">' + esc(S.close.note) + "</textarea>" +
      '<p class="ss-hint">The Bag Processed email goes to ' + esc(S.member ? S.member.email : "her") + ". Check S27 is on in Make before you close.</p></div>" + errorBox() +
      '<button type="button" class="ss-btn" data-act="close"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Closing…" : "Close the bag") + "</button>" +
      '<button type="button" class="ss-btn ghost" data-act="back-to-items">Back to the items</button>';
  }
  function viewClosed() {
    var s = S.closedSummary || { name: "Her", credits: { total: 0 } };
    var n = s.credits.total;
    return '<div class="ss-done"><span class="ss-badge">✓</span><div><p class="ss-lab">' + esc(s.name) + "'s bag is closed</p>" +
      '<p class="ss-hint">' + (n > 0 ? "Her " + fmtCredit(n) + " credit" + (n === 1 ? "" : "s") + " and her email are on their way." : "Her email is on its way.") + "</p></div></div>" +
      '<button type="button" class="ss-btn" data-act="another">Sort another bag</button>' +
      '<a class="ss-btn ghost" href="' + LISTING_URL + '">List items</a>';
  }
  function view() {
    if (S.screen === "loading") return '<p class="ss-sub">Loading…</p>';
    if (S.screen === "error") return '<div class="ss-err"><p>' + esc(S.msg) + '</p></div><button type="button" class="ss-btn" data-act="reload">Try again</button>';
    if (S.screen === "start") return viewStart();
    if (S.screen === "sort") return viewSort();
    if (S.screen === "close") return viewClose();
    if (S.screen === "closed") return viewClosed();
    return "";
  }
  function render() {
    if (!root) return;
    var a = document.activeElement, key = a && a.getAttribute ? a.getAttribute("data-k") : null, pos = null;
    try { pos = key ? a.selectionStart : null; } catch (e) { pos = null; }
    root.innerHTML = '<div class="ss-wrap" data-build="' + BUILD + '">' + view() + (S.toast ? '<div class="ss-toast" role="status">' + esc(S.toast) + "</div>" : "") + "</div>";
    if (key) {
      var el = root.querySelector('[data-k="' + key + '"]');
      if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }
  function renderPart(name) {
    var box = root && root.querySelector('[data-part="' + name + '"]');
    if (!box) return render();
    box.innerHTML = name === "members" ? viewMembers() : name === "brands" ? viewBrandBlock() : viewCatBlock();
  }

  /* ---------- taps and typing ---------- */
  function onInput(e) {
    var k = e.target.getAttribute("data-k");
    if (!k) return;
    var v = e.target.value;
    if (S.screen === "start") {
      S.start[k] = v;
      if (k === "memberQ") { S.start.member = null; searchMembers(); }
      return;
    }
    if (k === "closeNote") { S.close.note = v; return; }
    var it = S.item; if (!it) return;
    it[k] = v;
    if (k === "brandQ") { if (it.brand && it.brand.brand_name !== v) it.brand = null; renderPart("brands"); }
    if (k === "catQ") {
      var was = it.category;
      if (it.category && it.category !== v) it.category = "";
      if (was !== it.category && was === "Sets") { render(); return; }
      renderPart("cats");
    }
  }
  function onBlur(e) {
    if (e.target.getAttribute && e.target.getAttribute("data-k") === "sku" && S.item) {
      var n = normSku(S.item.sku); if (n) { S.item.sku = n; e.target.value = n; }
    }
  }
  function onChange(e) {
    if (e.target.getAttribute("data-act") === "photo-add") { addPhotos(e.target.files); e.target.value = ""; }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!b || !root.contains(b) || b.tagName === "INPUT") return;
    var act = b.getAttribute("data-act"), val = b.getAttribute("data-val");
    var it = S.item;
    S.toast = "";
    switch (act) {
      case "reload": location.reload(); return;
      case "member": S.start.member = S.start.members[Number(val)]; S.start.memberQ = S.start.member.email; S.start.members = []; break;
      case "member-clear": S.start.member = null; break;
      case "start": startBag(); return;
      case "resume": S.screen = "sort"; newItem((S.records.length && S.records[S.records.length - 1].item_type) || "clothing"); break;
      case "cancel-bag": cancelBag(); return;
      case "type":
        if (it.type !== val) {
          var keepPhotos = it.photos;
          newItem(val); S.item.photos = keepPhotos;
        }
        break;
      case "brand":
        var list = S.brands[it.type] || [];
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === val) { pickBrand(list[i]); break; }
        break;
      case "newbrand": S.addBrand = { name: it.brandQ.trim(), tier: "" }; break;
      case "newbrand-tier": S.addBrand.tier = val; break;
      case "newbrand-save": saveBrand(); return;
      case "newbrand-cancel": S.addBrand = null; break;
      case "cat": it.category = val; it.catQ = val; it.size = ""; break;
      case "size": it.size = val; it.sizeOther = false; break;
      case "size-other":
        it.sizeOther = !it.sizeOther;
        break;
      case "age": var ai = it.ages.indexOf(val); if (ai > -1) it.ages.splice(ai, 1); else it.ages.push(val); break;
      case "complete": it.complete = val === "yes"; break;
      case "tier":
        if (val === "half") { it.half = !it.half; }
        else { it.half = false; it.tier = val; }
        break;
      case "photo-remove": it.photos.splice(Number(val), 1); break;
      case "keep": saveKeep(); return;
      case "decline-on":
        it.declining = true; S.errors = [];
        if (it.sizeOther && it.reasons.indexOf("Size out of range") < 0 && it.type === "clothing") it.reasons.push("Size out of range");
        break;
      case "decline-off": it.declining = false; S.errors = []; break;
      case "reason": var ri = it.reasons.indexOf(val); if (ri > -1) it.reasons.splice(ri, 1); else it.reasons.push(val); break;
      case "decline-save": saveDecline(); return;
      case "dot":
        var rec = S.records[Number(val)];
        S.viewRec = rec || null;
        break;
      case "rec-back": S.viewRec = null; break;
      case "rec-remove": removeRecord(S.viewRec); return;
      case "to-close": S.screen = "close"; S.errors = []; break;
      case "back-to-items": S.screen = "sort"; S.errors = []; if (!S.item) newItem("clothing"); break;
      case "close": closeBag(); return;
      case "another": S.start = { trackQ: "", memberQ: "", members: [], member: null, clothing: "", toy: "" }; S.close = { note: "" }; S.screen = "loading"; render(); boot(); return;
      default: return;
    }
    render();
  }

  /* ---------- styles ---------- */
  function css() {
    if (document.getElementById("ss-style")) return;
    var s = document.createElement("style");
    s.id = "ss-style";
    s.textContent = [
      "#" + ROOT_ID + "{display:block;width:100%;background:#161514;min-height:100vh}",
      ".ss-wrap{box-sizing:border-box;max-width:560px;margin:0 auto;padding:20px 16px 140px;color:#f4efe9;font-family:'Quicksand',system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;gap:14px}",
      ".ss-wrap *{box-sizing:border-box}",
      ".ss-head{display:flex;flex-direction:column;gap:6px}",
      ".ss-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#bdb5ab;font-weight:600;margin:0}",
      ".ss-h1{font-size:24px;font-weight:700;margin:0;line-height:1.2;color:#f4efe9}",
      ".ss-sub{font-size:14px;color:#bdb5ab;margin:0;line-height:1.4}",
      ".ss-bar{height:8px;border-radius:99px;background:#33302d;overflow:hidden}",
      ".ss-bar span{display:block;height:100%;background:#e0623a}",
      ".ss-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
      ".ss-dot{width:34px;height:34px;border-radius:99px;border:1.5px solid #5a534f;background:transparent;color:#bdb5ab;font:700 12px 'Quicksand',sans-serif;padding:0;cursor:pointer}",
      ".ss-dot.kept{background:#2f7a4c;border-color:#2f7a4c;color:#fff}",
      ".ss-dot.dec{background:#6a625d;border-color:#6a625d;color:#fff}",
      ".ss-dot.now{border:2px solid #f4efe9;color:#f4efe9}",
      ".ss-toggle{display:grid;grid-template-columns:1fr 1fr;background:#232120;border:1px solid #3a3634;border-radius:14px;padding:4px}",
      ".ss-toggle button{height:44px;border:0;border-radius:10px;background:transparent;color:#bdb5ab;font:600 15px 'Quicksand',sans-serif;cursor:pointer}",
      ".ss-toggle button.on{background:#f4efe9;color:#161514}",
      ".ss-card{background:#232120;border:1px solid #3a3634;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:14px}",
      ".ss-lab{font-size:13px;font-weight:700;color:#e9e3dc;margin:0 0 6px;display:block}",
      ".ss-req{color:#f08a63}",
      ".ss-opt{font-weight:600;color:#bdb5ab;font-size:12px}",
      ".ss-inp{width:100%;height:52px;border-radius:12px;border:1px solid #4a4542;background:#161514;color:#f4efe9;font:600 17px 'Quicksand',sans-serif;padding:0 14px;-webkit-appearance:none}",
      ".ss-inp:focus{outline:2px solid #f08a63;outline-offset:1px}",
      ".ss-inp.big{height:140px;padding:12px 14px;font-weight:500;font-size:16px;line-height:1.45;resize:vertical}",
      ".ss-gap{margin-top:8px}",
      ".ss-hint{font-size:12.5px;color:#bdb5ab;margin:6px 0 0;line-height:1.35}",
      ".ss-hint.warn{color:#f0c77a}",
      ".ss-list{display:flex;flex-direction:column;border:1px solid #3a3634;border-radius:12px;overflow:hidden;margin-top:8px}",
      ".ss-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:56px;padding:0 14px;border:0;border-top:1px solid #3a3634;background:#1c1a19;color:#f4efe9;font:600 16px 'Quicksand',sans-serif;text-align:left;cursor:pointer;width:100%}",
      ".ss-row:first-child{border-top:0}",
      ".ss-row.sel{background:#4a2417;color:#fff;box-shadow:inset 0 0 0 3px #f08a63}",
      ".ss-row.add{color:#f6b49a}",
      ".ss-row small{font-size:12px;color:#bdb5ab;font-weight:600;text-align:right}",
      ".ss-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
      ".ss-pills.two{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".ss-pill{min-height:48px;padding:6px 8px;border-radius:12px;border:1px solid #4a4542;background:#1c1a19;color:#f4efe9;font:600 15px 'Quicksand',sans-serif;cursor:pointer;line-height:1.2}",
      ".ss-pill.sel{background:#f4efe9;color:#161514;border-color:#f4efe9}",
      ".ss-pill.wide{width:calc(50% - 4px);margin-top:8px}",
      ".ss-thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".ss-thumb{position:relative;height:96px;border-radius:12px;background:#4b3f38 center/cover no-repeat;display:flex;align-items:flex-end;padding:6px 8px;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000}",
      ".ss-thumb.add{background:transparent;border:1.5px dashed #5a534f;align-items:center;justify-content:center;font-size:14px;text-shadow:none;cursor:pointer}",
      ".ss-x{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:99px;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:18px;line-height:28px;padding:0;cursor:pointer}",
      ".ss-addbrand{margin-top:8px;padding:14px;border:1px solid #f08a63;border-radius:12px;display:flex;flex-direction:column;gap:10px}",
      ".ss-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".ss-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;border-radius:14px;border:0;background:#c8461f;color:#fff;font:700 17px 'Quicksand',sans-serif;text-decoration:none;cursor:pointer}",
      ".ss-btn[disabled]{opacity:.55;cursor:default}",
      ".ss-btn.ghost{background:transparent;border:2px solid #6a625d;color:#f4efe9}",
      ".ss-btn.small{min-height:48px;font-size:15px}",
      ".ss-links{display:flex;justify-content:flex-end}",
      ".ss-link{color:#f6b49a;font-weight:700;font-size:15px;text-decoration:underline;background:none;border:0;padding:8px 0;font-family:'Quicksand',sans-serif;cursor:pointer}",
      ".ss-err{background:#3a1d17;border:1px solid #c8461f;border-radius:12px;padding:10px 14px}",
      ".ss-err p{margin:4px 0;font-size:14px;color:#ffd6c8;font-weight:600}",
      ".ss-sum{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:44px;border-top:1px solid #3a3634;font-size:15px}",
      ".ss-sum:first-child{border-top:0}",
      ".ss-sum b{text-align:right}",
      ".ss-done{display:flex;gap:12px;align-items:flex-start;background:#1f2a22;border:1px solid #35553f;border-radius:16px;padding:16px;margin-top:30px}",
      ".ss-badge{flex:none;width:28px;height:28px;border-radius:99px;background:#2f7a4c;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}",
      ".ss-toast{background:#3a3020;border:1px solid #e0a43a;color:#f0c77a;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600}",
      "@media (min-width:768px){.ss-wrap{padding-top:40px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ---------- start up ---------- */
  function waitForMemberstack(ms) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function check() {
        if (window.$memberstackDom) return resolve();
        if (Date.now() - t0 > ms) return reject(new Error("Memberstack didn't load. Reload the page."));
        setTimeout(check, 100);
      })();
    });
  }
  function boot() {
    S.errors = []; S.busy = false;
    return waitForMemberstack(10000)
      .then(function () { return Promise.all([loadOptions(), loadBrands(), loadNextSku(), loadOpenBatch()]); })
      .then(function () { S.screen = "start"; render(); })
      .catch(function (e) { S.screen = "error"; S.msg = "The page couldn't load: " + (e && e.message ? e.message : e); render(); });
  }
  function init() {
    root = document.getElementById(ROOT_ID);
    if (!root) { console.error("[sort-tool] no #" + ROOT_ID + " on this page"); return; }
    css();
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("focusout", onBlur);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); // Enter never saves by accident
    });
    console.log("[sort-tool] " + BUILD);
    render();
    boot();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
