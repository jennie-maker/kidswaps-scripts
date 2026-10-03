/* sort-tool.js — /admin/sort, the new sorting page (replaces the Wized grading page).
   Built S428 to the approved option A mockup (https://claude.ai/artifact/4VYF5pMqFuxiCRrdGrARRM).
   Every save goes through the same doorman (grading-db) with the same columns the
   Wized page sent, and closing a bag fires the same Make webhook (S27), so credits
   and emails don't change. The old /admin/grading page stays untouched as the rollback.
   v5 (S430), the S429 D boards: one page per item in this order: Clothing or Toy, what it is,
   Keep or Decline, then only the part that applies. Each pick moves down to the next question.
   v6 (S430, hers): Keep or Decline comes first; one form for clothing and toys (a kept item's brand
   decides which questions follow; a decline asks Clothing or Toy); picked things turn green with a check;
   the dots become a short summary of sorted items; "Close" is now "Finish and send her credits", and
   cancelling a bag deletes the items sorted on it.
   v7 (S430, hers): the order is brand (which tells clothing or toy; No brand asks it), then the
   category or a toy's short name, then Keep or Decline, then the reason or the rest. Every toy
   carries its short name now, kept ones too (saved as graded_item_name for listing).
   v8 (S430, hers): one "Miscellaneous" brand in the list (clothing or toy and the tier decide which
   Miscellaneous row it saves as); a big item number; Keep or Decline waits until the category or short
   name is in; list rows to tap look different from the typing box; warnings clear as soon as they're fixed.
   v9 (S430, hers): tiers aren't tied to brands. No tier is picked for you, nothing is saved as an
   upgrade or downgrade, a new brand isn't asked its tier. The preview's gold box sits above the
   placeholder, as in the real email. Finishing waits until the bag has really closed.
   v10 (S430, hers): the clothing count moves on to the toy count by itself; a search box (brand,
   category, member) scrolls to the top of the screen so its list shows above the keyboard; the finish
   screen keeps only what changes from bag to bag. */
(function () {
  "use strict";

  var BUILD = "sort-tool S430 v10";
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
  // The same three slots as listing (listing-tool.js PHOTO_SLOTS), same words. Saved in this order.
  var VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];   // the same three listing takes
  var SLOTS = [
    { key: "front", label: "Front", hint: "primary photo" },
    { key: "back", label: "Back", hint: "tap to add" },
    { key: "detail", label: "Detail", hint: "tag, flaw, or close-up" }
  ];

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
    freedSku: "",
    editing: null,       // the saved record being edited, or null        // the SKU just freed by "Remove it and sort it again", offered back for the re-sort
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
    // Loaded in pages of 1,000, because Supabase stops a single request at 1,000 rows.
    var all = [];
    function page(from) {
      return door("GET", "/brands?select=id,brand_name,item_type,default_tier,condition_restriction&order=brand_name.asc,id.asc&limit=1000&offset=" + from)
        .then(function (rows) {
          rows = rows || [];
          all = all.concat(rows);
          return rows.length === 1000 ? page(from + 1000) : null;
        });
    }
    return page(0).then(function () {
      S.brands = { clothing: [], toy: [] };
      all.forEach(function (b) { if (S.brands[b.item_type]) S.brands[b.item_type].push(b); });
    });
  }
  function loadNextSku() {
    return door("GET", "/grading_next_label_source?label_number=gt.KS-&select=label_number&order=label_sort_num.desc&limit=1")
      .then(function (rows) { var r = firstRow(rows); S.nextSku = skuPlusOne(r ? r.label_number : ""); });
  }
  function loadRecords() {
    if (!S.batch) { S.records = []; return Promise.resolve(); }
    var sel = "id,status,tier,label_number,reject_reason,reject_reason_other_text,item_type,brand,category,size,credit_amount_at_grading,graded_item_name";
    var more = ",would_be_tier,is_complete,set_piece_count,credit_amount_reason,operator_item_notes,photo_urls";
    var withVideo = more + ",video_url";
    var tail = "&batch_id=eq." + S.batch.id + "&order=created_at.asc";
    // The longer list lets an item be edited; if it's ever refused, the short list still loads the bag.
    return door("GET", "/intake_records?select=" + sel + withVideo + tail)
      .catch(function () { return door("GET", "/intake_records?select=" + sel + more + tail); })
      .catch(function () { return door("GET", "/intake_records?select=" + sel + tail); })
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
      fresh: true,
      type: type || (S.item ? S.item.type : "clothing"),
      brandQ: "", brand: null,
      catQ: "", category: "",
      size: "", sizeOther: false, sizeOtherText: "", pieces: "",
      ages: [], complete: true,
      tier: "", half: false, halfReason: "",
      sku: S.freedSku || S.nextSku,
      photos: { front: null, back: null, detail: null }, video: null, skuOpen: false,
      choice: "", typeSet: false, noBrand: false, more: false, reasons: [], otherText: "", note: "", toyName: ""
    };
    S.addBrand = null; S.errors = []; S.viewRec = null;
  }
  function totalCount() {
    if (!S.batch) return 0;
    return (Number(S.batch.clothing_items_counted_at_batch_open) || 0) + (Number(S.batch.toy_items_counted_at_batch_open) || 0);
  }
  var MISC = { id: "misc", brand_name: "Miscellaneous", item_type: "", default_tier: "essentials", condition_restriction: null, misc: true };
  function isMiscName(n) { return /^miscellaneous/i.test(String(n || "")); }
  function miscRowName() {
    // The Miscellaneous rows are one per kind and tier ("Miscellaneous Elevated", toy or clothing).
    // Save the one that matches what was picked; if that tier has no row, fall back to Essentials.
    var it = S.item, list = S.brands[it.type] || [];
    var tier = it.choice === "keep" && !it.half ? (it.tier || "essentials") : "essentials";
    function find(t) { return list.filter(function (b) { return isMiscName(b.brand_name) && b.default_tier === t; })[0]; }
    var row = find(tier) || find("essentials") || list.filter(function (b) { return isMiscName(b.brand_name); })[0];
    return row ? row.brand_name : "Miscellaneous";
  }
  function brandPool() {
    var it = S.item;
    // A decline already knows Clothing or Toy; a kept item's brand decides it, so search both lists.
    var all = (S.brands.clothing || []).concat(S.brands.toy || []);
    var plain = all.filter(function (b) { return !isMiscName(b.brand_name); });
    return plain.length < all.length ? plain.concat([MISC]) : plain;
  }
  function brandById(id) {
    if (id === "misc") return MISC;
    var all = (S.brands.clothing || []).concat(S.brands.toy || []);
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
    return null;
  }
  function brandTwin(b) {   // the same brand name in the other list (a brand that makes clothing and toys)
    if (!b || b.misc) return null;
    var other = b.item_type === "toy" ? "clothing" : "toy", n = b.brand_name.toLowerCase();
    return (S.brands[other] || []).filter(function (x) { return x.brand_name.toLowerCase() === n; })[0] || null;
  }
  function brandList() {
    var it = S.item, all = brandPool();
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
  function setType(type) {
    // Changing between clothing and toy clears the answers that belong to the other one. Photos stay.
    var it = S.item;
    if (it.type !== type) {
      it.catQ = ""; it.category = ""; it.size = ""; it.sizeOther = false; it.sizeOtherText = ""; it.pieces = "";
      it.ages = []; it.complete = true; it.toyName = ""; it.reasons = []; it.otherText = "";
    }
    it.type = type; it.typeSet = true;
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
  function upload(file, kind) {
    return token().then(function (t) {
      return fetch(FN_UPLOAD, {
        method: "POST",
        headers: { "x-ms-token": t, "content-type": file.type, "x-file-name": file.name, "x-file-kind": kind || "photo",
          apikey: ANON, authorization: "Bearer " + ANON },
        body: file
      });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ("status " + r.status)); return j.url; });
    });
  }
  function photoList() {
    var it = S.item;
    return SLOTS.map(function (s) { return it.photos[s.key]; }).filter(Boolean);
  }
  function addPhotos(key, files) {
    var it = S.item;
    files = Array.prototype.slice.call(files || []);
    var vids = files.filter(function (f) { return /^video\//.test(f.type); });
    files = files.filter(function (f) { return !/^video\//.test(f.type); });
    if (vids.length) addVideo(vids[0]);
    if (!files.length) { render(); return; }
    if (!it.photos.hasOwnProperty(key)) return;
    // The tapped slot first, then the empty slots in order: Front, Back, Detail.
    var targets = [key].concat(SLOTS.map(function (s) { return s.key; }).filter(function (k) { return k !== key && !it.photos[k]; }));
    files.slice(0, targets.length).forEach(function (f, i) { addPhoto(targets[i], f); });
    if (files.length > targets.length) { var left = files.length - targets.length; S.toast = "Only 3 photos fit, so " + left + (left === 1 ? " was" : " were") + " left out."; }
    render();
  }
  function addVideo(file) {
    var it = S.item;
    if (!file) return;
    if (VIDEO_TYPES.indexOf(file.type) < 0) { S.toast = "That video type can't be used (" + (file.type || "unknown") + ")."; render(); return; }
    var v = { status: "uploading", url: null, preview: URL.createObjectURL(file) };
    it.video = v;
    upload(file, "video").then(function (u) { v.url = u; v.status = "done"; render(); })
      .catch(function (e) { v.status = "error"; console.error("[sort-tool video]", e); render(); });
    render();
  }
  function addPhoto(key, file) {
    var it = S.item;
    if (!file || !it.photos.hasOwnProperty(key)) return;
    var p = { status: "uploading", url: null, preview: URL.createObjectURL(file) };
    it.photos[key] = p;   // a new photo in a filled slot replaces it
    shrink(file).then(function (f) { return upload(f, "photo"); }).then(function (u) { p.url = u; p.status = "done"; render(); })
      .catch(function (e) { p.status = "error"; console.error("[sort-tool upload]", e); render(); });
    render();
  }

  /* ---------- saving ---------- */
  function validate(decline) {
    // A kept item needs everything. A declined clothing item needs a category and a reason;
    // a declined toy needs its short name and a reason. Brand, size and age are optional on a decline.
    var it = S.item, e = [];
    if (!it.typeSet) { e.push("Pick the brand, or tap No brand and pick clothing or toy."); return e; }
    if (!decline && !it.brand) { e.push("A kept item needs its brand."); return e; }
    if (it.type === "clothing" && !it.category) e.push("Pick a category.");
    if (it.type === "toy" && !it.toyName.trim()) e.push("Give the toy a short name.");
    if (decline) {
      if (!it.reasons.length) e.push("Pick at least one reason.");
      if (it.reasons.indexOf("Other") > -1 && !it.otherText.trim()) e.push("Say what the other reason is.");
      if (it.type === "clothing" && it.sizeOther && !it.sizeOtherText.trim()) e.push("Type the size, or untap Other size.");
    } else {
      if (!it.brand) e.push("Pick a brand.");
      if (it.type === "clothing" && !sizeValue()) e.push("Pick a size.");
      if (it.type === "toy" && !it.ages.length) e.push("Pick an age range.");
      if (!it.half && !it.tier) e.push("Pick a tier.");
      if (!normSku(it.sku)) { e.push("Add the SKU."); it.skuOpen = true; }
      if (it.type === "clothing" && it.category === "Sets" && !(num(it.pieces) >= 2)) e.push("Say how many pieces are in the set.");
      if (photoList().concat(it.video ? [it.video] : []).some(function (p) { return p.status === "uploading"; })) e.push("Wait for the photos to finish uploading.");
    }
    return e;
  }
  function baseBody(decline) {
    var it = S.item, b = it.brand;
    // Front, Back, Detail in that order, so listing can put each one in its own slot. An empty
    // slot is null; empty slots at the end are dropped.
    var urls = SLOTS.map(function (s) { var p = it.photos[s.key]; return p && p.status === "done" && p.url ? p.url : null; });
    while (urls.length && urls[urls.length - 1] === null) urls.pop();
    var body = {
      batch_id: S.batch.id,
      item_type: it.type,
      brand: b ? (b.misc ? miscRowName() : b.brand_name) : null,
      size: sizeValue() || null,
      category: it.type === "clothing" ? it.category : null,
      condition_restriction_at_grading: !!(b && b.condition_restriction === "new_or_like_new_only"),
      is_complete: it.type === "toy" ? it.complete : true,
      graded_item_name: it.type === "toy" ? (it.toyName.trim() || null) : null,
      graded_item_description: null
    };
    if (decline) return body;   // a declined item never carries photos (D2: tier, photos and SKU never show)
    if (urls.length) body.photo_urls = urls; // only sent when there are rough photos
    if (it.video && it.video.status === "done" && it.video.url) body.video_url = it.video.url;
    return body;
  }
  function post(body) {
    return door("POST", "/intake_records", body).catch(function (err) {
      // If the doorman refuses the photos column, save the item without its photos rather than lose it.
      if (body.photo_urls || body.video_url) {
        var b2 = {}; Object.keys(body).forEach(function (k) { if (k !== "photo_urls" && k !== "video_url") b2[k] = body[k]; });
        return door("POST", "/intake_records", b2).then(function (d) {
          S.toast = "Saved, but the photos and video didn't attach (" + err.message + ").";
          return d;
        });
      }
      throw err;
    });
  }
  function saveEdit(body) {
    // An edit changes the saved row in place, so it keeps its spot in the bag.
    if (!body.photo_urls) body.photo_urls = null;   // all photos removed, or a decline (never carries photos)
    if (!body.video_url && S.editing.hasOwnProperty("video_url")) body.video_url = null;   // video removed, or a decline
    delete body.batch_id;
    return door("PATCH", "/intake_records?id=eq." + encodeURIComponent(S.editing.id), body);
  }
  function startEdit(rec) {
    var type = rec.item_type === "toy" ? "toy" : "clothing";
    S.freedSku = "";
    newItem(type);
    var it = S.item, list = S.brands[type] || [], name = String(rec.brand || "").toLowerCase();
    var b = list.filter(function (x) { return x.brand_name.toLowerCase() === name; })[0];
    if (!b && rec.brand) b = { id: "saved", brand_name: rec.brand, item_type: type, default_tier: rec.would_be_tier || rec.tier || "essentials", condition_restriction: null };
    if (b && isMiscName(b.brand_name)) b = MISC;
    if (b) { it.brand = b; it.brandQ = b.brand_name; }
    if (type === "clothing") {
      it.category = rec.category || ""; it.catQ = it.category;
      var sz = rec.size || "";
      if (sz && sizeOptions().indexOf(sz) < 0) { it.sizeOther = true; it.sizeOtherText = sz; } else it.size = sz;
      it.pieces = rec.set_piece_count != null ? String(rec.set_piece_count) : "";
    } else {
      it.ages = String(rec.size || "").split(",").map(function (a) { return a.trim(); }).filter(Boolean);
      it.complete = rec.is_complete !== false;
    }
    it.half = Number(rec.credit_amount_at_grading) === 0.5;
    it.halfReason = rec.credit_amount_reason || "";
    it.tier = rec.tier || "";
    it.sku = rec.label_number || S.nextSku;
    (rec.photo_urls || []).forEach(function (u, i) { if (u && SLOTS[i]) it.photos[SLOTS[i].key] = { status: "done", url: u, preview: u }; });
    if (rec.video_url) it.video = { status: "done", url: rec.video_url, preview: rec.video_url };
    it.choice = rec.status === "rejected_at_grading" ? "decline" : "keep";
    it.typeSet = true;
    it.more = !!rec.size;
    it.toyName = rec.graded_item_name || "";
    if (!rec.brand || rec.brand === "Unknown") { it.brand = null; it.brandQ = ""; it.noBrand = true; }
    if (rec.status === "rejected_at_grading") {
      it.reasons = (rec.reject_reason || []).slice();
      it.otherText = rec.reject_reason_other_text || "";
      it.note = rec.operator_item_notes || "";
      it.toyName = rec.graded_item_name || "";
    }
    S.editing = rec; S.viewRec = null; S.errors = []; S.errMode = "";
  }
  function afterSave() {
    S.freedSku = ""; S.editing = null; S.errMode = ""; S.errors = [];
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
    if (S.errors.length) { S.errMode = "keep"; render(); return; }
    var sku = normSku(it.sku);
    S.busy = true; render();
    door("GET", "/grading_next_label_source?label_number=eq." + encodeURIComponent(sku) + "&select=label_number&limit=1")
      .then(function (rows) {
        if (rows && rows.length && sku !== S.freedSku && !(S.editing && sku === S.editing.label_number)) {
          S.busy = false;
          S.errors = [sku + " is already used. Check the sticker, or use " + S.nextSku + "."]; it.skuOpen = true;
          render(); throw null;
        }
        var b = baseBody(false);
        var tier = it.half ? "essentials" : it.tier;
        b.tier = tier;
        b.would_be_tier = tier;          // tiers aren't tied to brands (hers, S430)
        b.tier_override_reason = null;
        b.retail_value = it.type === "clothing" ? (TIER_RETAIL[tier] || null) : null;
        b.label_number = sku;
        b.is_matching_set = it.type === "clothing" && it.category === "Sets";
        b.set_piece_count = b.is_matching_set ? num(it.pieces) : null;
        b.operator_item_notes = null;
        b.status = "accepted_at_grading";
        b.stage_2_research_note = null;
        b.credit_amount_at_grading = it.half ? 0.5 : 1;
        b.credit_amount_reason = it.half ? (it.halfReason.trim() || null) : null;
        if (S.editing) { b.reject_reason = null; b.reject_reason_other_text = null; return saveEdit(b); }
        return post(b);
      })
      .then(afterSave)
      .catch(function (err) { if (err) fail(err); });
  }
  function saveDecline() {
    var it = S.item;
    S.errors = validate(true);
    if (S.errors.length) { S.errMode = "decline"; render(); return; }
    S.busy = true; render();
    var b = baseBody(true);
    b.tier_override_reason = null;
    b.label_number = null;
    b.operator_item_notes = it.note.trim() || null;
    b.status = "rejected_at_grading";
    b.stage_2_research_note = it.type === "toy" ? it.toyName.trim() : null;
    b.graded_item_name = it.type === "toy" ? it.toyName.trim() : null;
    b.reject_reason = it.reasons.slice();
    b.reject_reason_other_text = it.reasons.indexOf("Other") > -1 ? it.otherText.trim() : null;
    if (S.editing) { b.tier = null; b.retail_value = null; b.is_matching_set = false; b.set_piece_count = null; }
    function send(body) { return S.editing ? saveEdit(body) : post(body); }
    send(b).catch(function (err) {
      // If the database insists on a brand, save the decline as "Unknown" rather than lose it
      // (declined items never reach the closet, and browse hides "Unknown" anyway).
      if (b.brand) throw err;
      b.brand = "Unknown";
      if (S.editing) { b.photo_urls = null; }
      return send(b).then(function (d) { S.toast = "Saved with the brand as Unknown, because the database needs one."; return d; });
    }).then(afterSave).catch(fail);
  }
  function removeRecord(rec) {
    if (!window.confirm("Remove this item from the bag? You can sort it again right after.")) return;
    S.busy = true; render();
    door("DELETE", "/intake_records?id=eq." + rec.id)
      .then(function () { S.freedSku = rec.label_number || ""; return Promise.all([loadRecords(), loadNextSku()]); })
      .then(function () { S.busy = false; S.viewRec = null; S.screen = "sort"; newItem(S.item ? S.item.type : "clothing"); render(); })
      .catch(fail);
  }
  function saveBrand() {
    var a = S.addBrand, it = S.item;
    if (!a.name.trim() || !a.type) { S.errors = ["Type the brand name, and pick clothing or toys."]; render(); return; }
    S.busy = true; render();
    door("POST", "/brands", {
      brand_name: a.name.trim(),
      item_type: a.type,
      default_tier: "essentials",   // the brands table still has the column; sorting no longer reads it
      condition_restriction: a.newOnly ? "new_or_like_new_only" : null,
      last_verified: new Date().toISOString().split("T")[0]
    }, { Accept: "application/vnd.pgrst.object+json" }).then(function (d) {
      var row = firstRow(d);
      if (!row || !row.id) return loadBrands().then(function () {
        row = (S.brands[a.type] || []).filter(function (b) { return b.brand_name.toLowerCase() === a.name.trim().toLowerCase(); })[0];
        return row;
      });
      S.brands[a.type].push(row);
      return row;
    }).then(function (row) {
      S.busy = false; S.addBrand = null; S.errors = [];
      if (row) pickBrand(row);
      render();
    }).catch(fail);
  }
  function pickBrand(b) {
    var it = S.item;
    if (b.misc) it.typeSet = false;   // Miscellaneous asks clothing or toy
    else if (b.item_type && b.item_type !== it.type) setType(b.item_type); else it.typeSet = true;
    it.brand = b; it.brandQ = b.brand_name; it.noBrand = false;
  }

  /* ---------- start, cancel and close a bag ---------- */
  var memberTimer = null;
  function searchMembers() {
    clearTimeout(memberTimer);
    var q = S.start.memberQ.trim();
    if (q.length < 2) { S.start.members = []; renderPart("members"); return; }
    memberTimer = setTimeout(function () {
      // Paused members' bags get sorted too (Bag Processed has a Paused version), so both statuses are searched.
      var tail = "&select=id,first_name,last_name,email,plan,status&order=last_name.asc&limit=8";
      var safe = q.replace(/[,()*%]/g, " ").trim(), parts = safe.split(/\s+/).filter(Boolean), qs;
      if (parts.length > 1) {   // "maria rem" = first and last name
        qs = "&first_name=ilike." + encodeURIComponent(parts[0] + "*") + "&last_name=ilike." + encodeURIComponent(parts.slice(1).join(" ") + "*");
      } else {
        var w = encodeURIComponent("*" + safe + "*");
        qs = "&or=" + encodeURIComponent("(") + "email.ilike." + w + ",first_name.ilike." + w + ",last_name.ilike." + w + encodeURIComponent(")");
      }
      door("GET", "/members?status=in.(active,paused)" + qs + tail)
        .catch(function () {   // if the doorman won't take a name search, fall back to email only
          return door("GET", "/members?status=in.(active,paused)&email=ilike." + encodeURIComponent("*" + q + "*") + tail);
        })
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
    var n = S.records.length;
    if (!window.confirm("Cancel " + nameOf(S.member) + "'s bag for good? " + (n ? "The " + n + " item" + (n === 1 ? "" : "s") + " sorted on it are deleted. " : "") + "No credits or email go out.")) return;
    S.busy = true; render();
    var id = S.batch.id;
    // Delete the bag's items first, all at once; if the doorman won't take that, one at a time.
    var del = n ? door("DELETE", "/intake_records?batch_id=eq." + id).catch(function () {
      return S.records.reduce(function (p, r) { return p.then(function () { return door("DELETE", "/intake_records?id=eq." + r.id); }); }, Promise.resolve());
    }) : Promise.resolve();
    del.then(function () { return door("PATCH", "/intake_batches?id=eq." + id, { status: "cancelled" }); })
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
    if (!sorted) { S.errors = ["Sort at least one item before finishing the bag."]; render(); return; }
    if (sorted < total && !window.confirm("You've sorted " + sorted + " of " + total + ". Finish the bag anyway? Her credits and email go out.")) return;
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
      if (!r.ok) throw new Error("Make answered " + r.status + ". The bag isn't finished and nothing was sent");
      S.closedSummary = { name: firstOf(S.member), credits: creditSummary() };
      S.toast = "Sent. Waiting for the bag to close…"; render();
      return waitForClose(b.id, 20);
    }).then(function (closed) {
      if (closed === undefined) return;
      S.busy = false; S.toast = "";
      if (closed) { S.screen = "closed"; render(); window.scrollTo(0, 0); return; }
      S.errors = ["Make has the bag, but it hasn't closed after a minute. Don't tap Finish again. Check S27's History in Make, and tell Claude what it shows."];
      render();
    }).catch(fail);
  }
  // Make answers "got it" before S27 runs, so check the bag itself: done once it leaves stage_1_in_progress.
  function waitForClose(id, tries) {
    return new Promise(function (r) { setTimeout(r, 3000); }).then(function () {
      return door("GET", "/intake_batches?id=eq." + id + "&select=status");
    }).then(function (rows) {
      var st = rows && rows[0] && rows[0].status;
      if (st && st !== "stage_1_in_progress") return true;
      return tries > 1 ? waitForClose(id, tries - 1) : false;
    }, function () { return tries > 1 ? waitForClose(id, tries - 1) : false; });
  }

  /* ---------- drawing ---------- */
  function pills(list, isSel, act, cls) {
    return '<div class="ss-pills ' + (cls || "") + '">' + list.map(function (v) {
      var val = typeof v === "object" ? v.value : v, lab = typeof v === "object" ? v.label : v;
      return '<button type="button" class="ss-pill' + (isSel(val) ? " sel" : "") + '" data-act="' + act + '" data-val="' + esc(val) + '">' + esc(lab) + "</button>";
    }).join("") + "</div>";
  }
  function errorBox() {
    if (!S.errors.length) return '<div data-part="err"></div>';
    return '<div data-part="err"><div class="ss-err" role="alert">' + S.errors.map(function (e) { return "<p>" + esc(e) + "</p>"; }).join("") + "</div></div>";
  }
  function recLine(r) {
    var kept = r.status === "accepted_at_grading", reasons = r.reject_reason || [];
    var why = reasons.length ? reasons[0] + (reasons.length > 1 ? " +" + (reasons.length - 1) : "") : "";
    var bits;
    if (kept) bits = [r.brand, r.item_type === "toy" ? r.size : r.category, r.item_type === "toy" ? "" : r.size,
      (TIER_LABEL[r.tier] || r.tier || "") + (Number(r.credit_amount_at_grading) === 0.5 ? " ½" : "")];
    else if (r.item_type === "toy") bits = [r.graded_item_name || "Toy", why];
    else bits = [r.category, r.brand && r.brand !== "Unknown" ? r.brand : "", r.size, why];
    return bits.filter(Boolean).join(" · ");
  }
  function header(eyebrow) {
    var total = totalCount(), n = S.records.length;
    var kept = S.records.filter(function (r) { return r.status === "accepted_at_grading"; }).length;
    var pct = total ? Math.min(100, Math.round(n / total * 100)) : 0;
    var rows = S.records.map(function (r, i) {
      var k = r.status === "accepted_at_grading", ed = S.editing && S.editing.id === r.id;
      return '<button type="button" class="ss-sumrow' + (k ? " kept" : " dec") + (ed ? " ed" : "") + '" data-act="dot" data-val="' + i + '">' +
        '<span class="ss-sumn">' + (i + 1) + '</span><span class="ss-summ">' + (k ? "✓" : "✗") + '</span><span class="ss-sumt">' + esc(recLine(r)) + "</span></button>";
    }).join("");
    return '<div class="ss-head"><p class="ss-eyebrow">' + esc(eyebrow) + '</p><h1 class="ss-h1">' + esc(nameOf(S.member)) + "'s bag</h1>" +
      '<p class="ss-sub">' + (n < total ? "Item " + (n + 1) + " of " + total : n + " of " + total + " sorted") + " · " + kept + " kept · " + (n - kept) + " declined</p>" +
      '<div class="ss-bar"><span style="width:' + pct + '%"></span></div>' + (rows ? '<div class="ss-sumlist">' + rows + "</div>" : "") + "</div>";
  }
  function viewStart() {
    if (S.batch) {
      var n = S.records.length;
      return '<div class="ss-head"><h1 class="ss-h1">Sort a bag</h1></div>' +
        '<div class="ss-card"><p class="ss-lab">A bag is already open</p><p class="ss-sub">' + esc(nameOf(S.member)) + "'s bag, " + n + " of " + totalCount() + " sorted.</p></div>" + errorBox() +
        '<button type="button" class="ss-btn" data-act="resume"' + (S.busy ? " disabled" : "") + ">Keep sorting this bag</button>" +
        '<button type="button" class="ss-btn ghost" data-act="cancel-bag"' + (S.busy ? " disabled" : "") + ">Cancel this bag for good</button>";
    }
    var st = S.start;
    return '<div class="ss-head"><h1 class="ss-h1">Sort a bag</h1><p class="ss-sub">Find the member, then count what\'s in the bag.</p></div>' +
      '<div class="ss-card">' +
      '<div><label class="ss-lab" for="ss-track">Return label</label><input id="ss-track" class="ss-inp" type="text" data-k="trackQ" autocomplete="off" autocorrect="off" autocapitalize="characters" placeholder="Scan or type the tracking number" value="' + esc(st.trackQ) + '"></div>' +
      '<div><label class="ss-lab" for="ss-member">Member name or email <span class="ss-req">*</span></label><input id="ss-member" class="ss-inp" type="text" data-k="memberQ" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Her name, or part of her email" value="' + esc(st.memberQ) + '">' +
      '<div data-part="members">' + viewMembers() + "</div></div>" +
      '<div class="ss-grid2"><div><label class="ss-lab" for="ss-cc">Clothing items</label><input id="ss-cc" class="ss-inp" type="text" inputmode="numeric" data-k="clothing" value="' + esc(st.clothing) + '"></div>' +
      '<div><label class="ss-lab" for="ss-tc">Toys</label><input id="ss-tc" class="ss-inp" type="text" inputmode="numeric" data-k="toy" value="' + esc(st.toy) + '"></div></div>' +
      "</div>" + errorBox() +
      '<button type="button" class="ss-btn" data-act="start"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Starting…" : "Start sorting") + "</button>";
  }
  function viewMembers() {
    var st = S.start;
    if (st.member) {
      return '<div class="ss-list"><button type="button" class="ss-row sel" data-act="member-clear">✓ ' + esc(nameOf(st.member)) +
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
      var fixed = it.choice === "decline" && it.typeSet;
      return '<div class="ss-addbrand"><p class="ss-lab">New brand: ' + esc(a.name) + "</p>" +
        (fixed ? "" : '<p class="ss-hint">Clothing or toys?</p>' + pills([{ value: "clothing", label: "Clothing" }, { value: "toy", label: "Toys" }], function (v) { return a.type === v; }, "newbrand-type", "two")) +
        '<button type="button" class="ss-mini' + (a.newOnly ? " sel" : "") + '" data-act="newbrand-newonly">' + (a.newOnly ? "✓ " : "") + "Only accepted new or like new</button>" +
        '<div class="ss-grid2"><button type="button" class="ss-btn small" data-act="newbrand-save"' + (S.busy ? " disabled" : "") + '>Save brand</button><button type="button" class="ss-btn small ghost" data-act="newbrand-cancel">Cancel</button></div></div>';
    }
    var bl = brandList(), q = it.brandQ.trim();
    var rows = bl.rows.map(function (b) {
      var both = !(it.choice === "decline" && it.typeSet);
      return '<button type="button" class="ss-row' + (it.brand && it.brand.id === b.id ? " sel" : "") + '" data-act="brand" data-val="' + esc(b.id) + '">' + esc(b.brand_name) +
        " <small>" + (b.misc ? "Clothing or toy" : (b.item_type === "toy" ? "Toy" : "Clothing")) + (b.condition_restriction === "new_or_like_new_only" ? " · new or like new only" : "") + "</small></button>";
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
  function pickedRow(act, label, small) {
    return '<button type="button" class="ss-row sel ss-picked" data-act="' + act + '"><span>✓ ' + esc(label) + "</span> <small>" + small + (small ? "<br>" : "") + "<u>Change</u></small></button>";
  }
  function brandField() {
    var it = S.item, brandPicked = it.brand && !S.addBrand;
    var h = '<div data-q="brand"><label class="ss-lab" for="ss-brand">Brand</label>';
    if (brandPicked) {
      h += pickedRow("brand-change", it.brand.brand_name, it.brand.misc ? "" : (it.brand.item_type === "toy" ? "Toy" : "Clothing") + (it.brand.condition_restriction === "new_or_like_new_only" ? " · new or like new only" : ""));
      if (brandTwin(it.brand)) {
        h += '<p class="ss-hint">This brand makes clothing and toys. Which is this?</p>' +
          pills([{ value: "clothing", label: "Clothing" }, { value: "toy", label: "Toy" }], function (v) { return it.type === v; }, "brand-type", "two");
      }
      if (it.brand.condition_restriction === "new_or_like_new_only") h += '<p class="ss-hint warn">This brand is only accepted new or like new.</p>';
    } else if (it.noBrand) {
      h += pickedRow("brand-change", "No brand", "Only for a decline. A kept item needs its brand.");
    } else {
      h += '<input id="ss-brand" class="ss-inp" type="text" data-k="brandQ" autocomplete="off" autocorrect="off" autocapitalize="words" value="' + esc(it.brandQ) + '">' +
        '<div data-part="brands">' + viewBrandBlock() + "</div>" +
        (S.addBrand ? "" : '<button type="button" class="ss-link ss-more" data-act="nobrand">No brand, or can\'t tell</button>');
    }
    return h + "</div>";
  }
  function catField() {
    var it = S.item;
    return '<div data-q="cat"><label class="ss-lab" for="ss-cat">Category <span class="ss-req">*</span></label>' +
      (it.category ? pickedRow("cat-change", it.category, "")
        : '<input id="ss-cat" class="ss-inp ss-need" type="text" data-k="catQ" autocomplete="off" autocorrect="off" value="' + esc(it.catQ) + '">' +
          '<div data-part="cats">' + viewCatBlock() + "</div>") + "</div>";
  }
  function nameField() {
    var it = S.item;
    return '<div data-q="tn"><label class="ss-lab" for="ss-tn">Short name <span class="ss-req">*</span></label><input id="ss-tn" class="ss-inp' + (it.toyName.trim() ? "" : " ss-need") + '" type="text" data-k="toyName" autocapitalize="sentences" placeholder="Like wooden train set" value="' + esc(it.toyName) + '"><p class="ss-hint">If it\'s declined, the email uses this to say what came back.</p></div>';
  }
  function sizeField(optional) {
    var it = S.item;
    return '<div data-q="size"><p class="ss-lab">Size ' + (optional ? '<span class="ss-opt">optional</span>' : '<span class="ss-req">*</span>') + "</p>" +
      pills(sizeOptions(), function (v) { return !it.sizeOther && it.size === v; }, "size") +
      '<button type="button" class="ss-pill wide' + (it.sizeOther ? " sel" : "") + '" data-act="size-other">Other size</button>' +
      (it.sizeOther ? '<input class="ss-inp ss-gap" type="text" data-k="sizeOtherText" autocorrect="off" placeholder="Size on the tag, like 8 or 10/12" value="' + esc(it.sizeOtherText) + '">' : "") + "</div>";
  }
  function ageField(optional) {
    var it = S.item;
    return '<div data-q="age"><p class="ss-lab">Age range ' + (optional ? '<span class="ss-opt">optional</span>' : '<span class="ss-req">*</span>') + ' <span class="ss-opt">pick all that fit</span></p>' +
      pills(ageOptions(), function (v) { return it.ages.indexOf(v) > -1; }, "age", "two") + "</div>";
  }
  function viewSort() {
    if (S.viewRec) return viewSavedRecord();
    var it = S.item, toy = it.type === "toy", dec = it.choice === "decline", keep = it.choice === "keep";
    var ed = S.editing, edNum = ed ? S.records.indexOf(ed) + 1 : 0;
    var out = header(ed ? "Editing item " + edNum : "Sorting");

    var total = totalCount();
    out += '<div class="ss-itemhead">' + (ed ? "Editing item " + edNum : "Item " + (S.records.length + 1) + ' <small>of ' + total + "</small>") + "</div>";
    // 1. Brand, which tells the form clothing or toy (No brand asks it instead)
    var first = '<div class="ss-card' + (it.fresh && !ed ? " ss-itemcard" : "") + '">' + brandField();
    if ((it.noBrand && !it.brand) || (it.brand && it.brand.misc)) {
      first += '<div data-q="dtype"><p class="ss-lab">Clothing or toy? <span class="ss-req">*</span></p>' +
        pills([{ value: "clothing", label: "Clothing" }, { value: "toy", label: "Toy" }], function (v) { return it.typeSet && it.type === v; }, "dtype", "two") + "</div>";
    }
    if (!it.typeSet || S.addBrand) return out + first + "</div>" + errorBox() + footerLinks();

    // 2. What it is: a clothing category, or a toy's short name
    first += (toy ? nameField() : catField()) + "</div>";
    out += first;
    if (toy ? !it.toyName.trim() : !it.category) return out + errorBox() + footerLinks();

    // 3. Keep or decline
    out += '<div class="ss-card" data-q="choice"><p class="ss-lab">Keep it or decline it? <span class="ss-req">*</span></p>' +
      pills([{ value: "keep", label: "Keep" }, { value: "decline", label: "Decline" }], function (v) { return it.choice === v; }, "choice", "two ss-choice") + "</div>";
    if (!dec && !keep) return out + errorBox() + footerLinks();

    if (dec) {
      // 4a. The reason, then next. Size (or age) stays folded away.
      var dc = '<div class="ss-card"><p class="ss-eyebrow">Because it\'s declined</p>' +
        '<div data-q="reasons"><p class="ss-lab">Why it\'s declined <span class="ss-req">*</span> <span class="ss-opt">pick all that fit</span></p>' +
        pills(REASONS[it.type], function (v) { return it.reasons.indexOf(v) > -1; }, "reason", "two") +
        (it.reasons.indexOf("Other") > -1 ? '<input class="ss-inp ss-gap" type="text" data-k="otherText" placeholder="What\'s the other reason?" value="' + esc(it.otherText) + '">' : "") + "</div>" +
        (it.more ? (toy ? ageField(true) : sizeField(true))
          : '<button type="button" class="ss-link ss-more" data-act="more">+ Add the ' + (toy ? "age" : "size") + " (optional)</button>") +
        (toy ? "" : '<div><label class="ss-lab" for="ss-note">Note for you <span class="ss-opt">optional, members never see it</span></label><input id="ss-note" class="ss-inp" type="text" data-k="note" value="' + esc(it.note) + '"></div>') +
        "</div>";
      return out + dc + errorBox() +
        '<button type="button" class="ss-btn" data-act="decline-save" data-q="go"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : (ed ? "Save changes" : "Decline it, next item")) + "</button>" + footerLinks();
    }

    // 4b. Kept: the rest of the questions
    if (!it.brand) {
      return out + '<div class="ss-card"><p class="ss-hint warn">A kept item needs its brand. Tap Change on No brand above and pick it.</p></div>' + errorBox() + footerLinks();
    }
    var what = '<div class="ss-card">';
    if (!toy) {
      if (it.category === "Sets") what += '<div data-q="pieces"><label class="ss-lab" for="ss-pieces">Pieces in the set <span class="ss-req">*</span></label><input id="ss-pieces" class="ss-inp" type="text" inputmode="numeric" data-k="pieces" value="' + esc(it.pieces) + '"></div>';
      what += sizeField(false);
    } else {
      what += ageField(false);
    }
    what += "</div>";

    var tierCard = '<div class="ss-card" data-q="tier"><p class="ss-eyebrow">Because it\'s kept</p><div><p class="ss-lab">Tier <span class="ss-req">*</span></p>' +
      pills([{ value: "essentials", label: "Essentials" }, { value: "elevated", label: "Elevated" }, { value: "special", label: "Special" }],
        function (v) { return !it.half && it.tier === v; }, "tier", "three") +
      '<p class="ss-hint">Pick the tier that fits this piece.</p>' +
      '<button type="button" class="ss-mini' + (it.half ? " sel" : "") + '" data-act="tier" data-val="half">' + (it.half ? "✓ " : "") + "Half credit</button>" +
      (it.half ? '<input class="ss-inp ss-gap" type="text" data-k="halfReason" placeholder="Why half? (optional, just for you)" value="' + esc(it.halfReason) + '">' : "") + "</div>" +
      (it.skuOpen
        ? '<div><label class="ss-lab" for="ss-sku">SKU <span class="ss-req">*</span></label><input id="ss-sku" class="ss-inp" type="text" inputmode="numeric" data-k="sku" autocomplete="off" autocorrect="off" autocapitalize="characters" value="' + esc(it.sku) + '">' +
          '<p class="ss-hint">Type the number on the sticker if it\'s different.</p></div>'
        : '<div class="ss-skuline"><span>SKU <b>' + esc(normSku(it.sku) || it.sku) + '</b></span><button type="button" class="ss-link" data-act="sku-open">Change</button></div>') +
      "</div>";

    var photos = '<div class="ss-card" data-q="photos"><p class="ss-lab">Photos <span class="ss-opt">optional</span></p><div class="ss-slots">' +
      SLOTS.map(function (sl) {
        var p = it.photos[sl.key];
        var input = '<input type="file" accept="' + (p ? "image/*" : "image/*,video/*") + '"' + (p ? "" : " multiple") + ' data-act="photo-add" data-val="' + sl.key + '" hidden>';
        if (!p) return '<label class="ss-slot">' + sl.label + "<small>" + esc(sl.hint) + "</small>" + input + "</label>";
        var state = p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Didn't upload, tap to retry" : "tap to retake";
        return '<div class="ss-slot full' + (p.status === "error" ? " bad" : "") + '" style="background-image:url(\'' + esc(p.preview) + '\')">' +
          '<label class="ss-slot-tap"><span>' + sl.label + "<small>" + state + "</small></span>" + input + "</label>" +
          '<button type="button" class="ss-x" data-act="photo-remove" data-val="' + sl.key + '" aria-label="Remove the ' + sl.label + ' photo">×</button></div>';
      }).join("") + videoTile() +
      '</div><p class="ss-hint">Tap a slot to take a photo or pick from your library. Pick several and they fill the empty slots in order. Each one carries into the same slot on listing.</p></div>';

    var pieces = toy ? '<div class="ss-card" data-q="complete"><p class="ss-lab">All the pieces?</p>' +
      pills([{ value: "yes", label: "Complete" }, { value: "no", label: "Missing pieces" }], function (v) { return (v === "yes") === it.complete; }, "complete", "two") + "</div>" : "";

    return out + what + tierCard + photos + pieces + errorBox() +
      '<button type="button" class="ss-btn" data-act="keep" data-q="go"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : (ed ? "Save changes" : "Keep it, next item")) + "</button>" + footerLinks();
  }
  function videoTile() {
    var v = S.item.video;
    var input = '<input type="file" accept="video/*" data-act="video-add" hidden>';
    if (!v) return '<label class="ss-slot">Video<small>about 15s</small>' + input + "</label>";
    var state = v.status === "uploading" ? "Uploading…" : v.status === "error" ? "Didn't upload, tap to retry" : "tap to replace";
    return '<div class="ss-slot full' + (v.status === "error" ? " bad" : "") + '">' +
      '<video class="ss-vid" src="' + esc(v.preview) + '#t=0.1" muted playsinline preload="metadata"></video>' +
      '<label class="ss-slot-tap"><span>Video<small>' + state + "</small></span>" + input + "</label>" +
      '<button type="button" class="ss-x" data-act="video-remove" aria-label="Remove the video">×</button></div>';
  }
  function footerLinks() {
    if (S.editing) return '<div class="ss-links"><button type="button" class="ss-link" data-act="edit-cancel">Cancel editing</button></div>';
    return '<div class="ss-links"><button type="button" class="ss-link" data-act="to-close">Finish the bag</button></div>';
  }
  function viewSavedRecord() {
    var r = S.viewRec, i = S.records.indexOf(r);
    var kept = r.status === "accepted_at_grading";
    var bits = [r.brand, r.category, r.size].filter(Boolean).join(" · ");
    return header("Sorting") +
      '<div class="ss-card"><p class="ss-lab">Item ' + (i + 1) + ": " + (kept ? "kept" : "declined") + "</p><p class=\"ss-sub\">" + esc(bits || r.graded_item_name || "") + "</p>" +
      (kept ? '<p class="ss-sub">' + esc(TIER_LABEL[r.tier] || r.tier) + (Number(r.credit_amount_at_grading) === 0.5 ? ", half credit" : "") + " · " + esc(r.label_number || "") + "</p>" :
        '<p class="ss-sub">' + esc((r.reject_reason || []).join(", ")) + "</p>") +
      "</div>" + errorBox() +
      '<button type="button" class="ss-btn" data-act="rec-edit"' + (S.busy ? " disabled" : "") + ">Edit it</button>" +
      '<button type="button" class="ss-btn ghost" data-act="rec-back">Back to the next item</button>' +
      '<div class="ss-links"><button type="button" class="ss-link" data-act="rec-remove"' + (S.busy ? " disabled" : "") + ">Remove it from the bag</button></div>";
  }
  // Her email, only the parts that are always exact (S429): subject, preview line, date, greeting,
  // the gold credits box, her personal note, the sign-off and the button. The opening paragraph and the
  // decline lines stay out until the database writes them for both the email and this preview.
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function titleName(s) { return String(s || "").trim().toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function bagDate() {
    var raw = S.batch && (S.batch.received_at || S.batch.created_at);
    var d = raw ? new Date(raw) : null;
    return d && !isNaN(d) ? d : null;
  }
  function creditsPhrase() {
    var by = { essentials: 0, elevated: 0, special: 0 };
    S.records.forEach(function (r) { if (r.status === "accepted_at_grading") by[r.tier] = (by[r.tier] || 0) + (Number(r.credit_amount_at_grading) || 0); });
    var parts = TIERS.filter(function (t) { return by[t] > 0; }).map(function (t) {
      return fmtCredit(by[t]) + " " + TIER_LABEL[t] + " credit" + (by[t] > 1 ? "s" : "");
    });
    if (parts.length < 2) return parts.join("");
    return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }
  function viewNote() {
    var n = S.close.note.trim();
    return n ? '<p class="em-note">✍️ ' + esc(n) + "</p>" : "";
  }
  function viewEmail() {
    var c = creditSummary(), name = titleName(S.member && S.member.first_name), d = bagDate();
    var paused = S.member && S.member.status === "paused";
    if (!c.kept) {
      return '<div class="ss-card"><p class="ss-lab">Her email</p><p class="ss-sub">Nothing was kept, so she gets the All Declined email. Its preview isn\'t built yet.</p></div>';
    }
    var subject = "Hi " + (name || "there") + ", we just finished going through your " + (d ? MONTHS[d.getMonth()] + " " : "") + "bag";
    var dateLine = d ? "Batch received " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() : "";
    return '<div class="ss-card"><p class="ss-lab">Her email, exactly as it will send</p>' +
      '<div class="em"><div class="em-top"><p class="em-k">Subject</p><p class="em-subj">' + esc(subject) + "</p>" +
      (paused ? "" : '<p class="em-pre">Here\'s what you earned and where to find new favorites.</p>') + "</div>" +
      '<div class="em-body"><p class="em-brand">KidSwaps</p>' + (dateLine ? '<p class="em-date">' + esc(dateLine) + "</p>" : "") +
      '<p class="em-hi">Hi ' + esc(name || "there") + ",</p>" +
      '<div class="em-gold"><p class="em-gold-h">What you earned from this batch</p><p class="em-gold-n">' + esc(creditsPhrase()) + "</p>" +
      (paused ? "" : '<p class="em-gold-s">Your credits are in your bank now.</p>') + "</div>" +
      '<div class="em-gap">Her bag summary and decline lines go here, written by S27 when you finish.</div>' +
      '<div data-part="note">' + viewNote() + "</div>" +
      '<p class="em-sign">Thanks for swapping,<br>Jennie</p><span class="em-btn">Go to my dashboard</span></div></div>' +
      '<p class="ss-hint">' + (paused ? "She's paused, so her email is the Paused version: it also says her credits are held until she comes back. " : "") +
      "The middle paragraph and the decline lines are left out until the database writes them for both the email and this preview.</p></div>";
  }
  function viewClose() {
    // Only what changes from bag to bag (hers, S430): who, the counts, the subject line, the credits, her note.
    var c = creditSummary(), name = titleName(S.member && S.member.first_name), d = bagDate();
    var paused = S.member && S.member.status === "paused";
    var subject = "Hi " + (name || "there") + ", we just finished going through your " + (d ? MONTHS[d.getMonth()] + " " : "") + "bag";
    return '<div class="ss-head"><p class="ss-eyebrow">' + S.records.length + " of " + totalCount() + " sorted</p><h1 class=\"ss-h1\">Finish " + esc(firstOf(S.member)) + "'s bag</h1>" +
      '<p class="ss-sub">' + c.kept + " kept · " + c.dec + " declined · " + esc(plainPlan(S.member && S.member.plan)) + (paused ? " · paused" : "") + "</p></div>" +
      '<div class="ss-card ss-fin">' +
      (c.kept
        ? '<div><p class="ss-k">Subject</p><p class="ss-fin-subj">' + esc(subject) + "</p></div>" +
          '<div class="ss-fin-gold"><p class="ss-k">She earns</p><p>' + esc(creditsPhrase()) + "</p></div>"
        : '<p class="ss-hint">Nothing kept, so she gets the All Declined email.</p>') +
      '<div><label class="ss-lab" for="ss-pn">Add a note to her email <span class="ss-opt">optional</span></label>' +
      '<textarea id="ss-pn" class="ss-inp" rows="2" data-k="closeNote" autocapitalize="sentences">' + esc(S.close.note) + "</textarea></div>" +
      "</div>" + errorBox() +
      '<button type="button" class="ss-btn" data-act="close"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Sending…" : "Finish and send her credits") + "</button>" +
      '<button type="button" class="ss-link ss-back" data-act="back-to-items">Back to the items</button>';
  }
  function viewClosed() {
    var s = S.closedSummary || { name: "Her", credits: { total: 0 } };
    var n = s.credits.total;
    return '<div class="ss-done"><span class="ss-badge">✓</span><div><p class="ss-lab">' + esc(s.name) + "'s bag is finished</p>" +
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
  function recheck() {
    // A warning stays only while it's still true: re-check after every tap or keystroke.
    if (!S.errMode || S.screen !== "sort" || !S.item) return;
    var keepOpen = S.item.skuOpen;
    S.errors = validate(S.errMode === "decline");
    S.item.skuOpen = keepOpen || S.item.skuOpen;
    if (!S.errors.length) S.errMode = "";
  }
  function render() {
    if (!root) return;
    recheck();
    var a = document.activeElement, key = a && a.getAttribute ? a.getAttribute("data-k") : null, pos = null;
    try { pos = key ? a.selectionStart : null; } catch (e) { pos = null; }
    root.innerHTML = '<div class="ss-wrap" data-build="' + BUILD + '">' + view() + (S.toast ? '<div class="ss-toast" role="status">' + esc(S.toast) + "</div>" : "") + "</div>";
    if (S.item && S.item.fresh && S.screen === "sort") S.item.fresh = false;   // the new-item flash plays once
    if (key) {
      var el = root.querySelector('[data-k="' + key + '"]');
      if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }
  function focusOn(id) { var el = document.getElementById(id); if (el) { try { el.focus(); } catch (e) {} } }
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
      if (k === "clothing") {
        // A one-digit count moves on after a short pause (so 12 can still be typed); two digits move on at once.
        clearTimeout(S.ccTimer);
        if (/^\d+$/.test(v)) S.ccTimer = setTimeout(function () {
          var t = document.getElementById("ss-tc"); if (t) { t.focus(); try { t.select(); } catch (er) {} }
        }, v.length >= 2 ? 0 : 900);
      }
      return;
    }
    if (k === "closeNote") { S.close.note = v; var np = root.querySelector('[data-part="note"]'); if (np) np.innerHTML = viewNote(); return; }
    var it = S.item; if (!it) return;
    var hadName = !!(it.toyName || "").trim();
    it[k] = v;
    if (k === "toyName" && hadName !== !!v.trim()) { render(); return; }   // shows or hides Keep or Decline
    if (S.errMode) { recheck(); var eb = root.querySelector('[data-part="err"]'); if (eb) eb.outerHTML = errorBox(); }
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
    if (e.target.getAttribute("data-act") === "photo-add") {
      addPhotos(e.target.getAttribute("data-val"), e.target.files); e.target.value = "";
    } else if (e.target.getAttribute("data-act") === "video-add") {
      addVideo(e.target.files && e.target.files[0]); e.target.value = "";
    }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!b || !root.contains(b) || b.tagName === "INPUT") return;
    var act = b.getAttribute("data-act"), val = b.getAttribute("data-val");
    var it = S.item, advance = "";
    S.toast = "";
    switch (act) {
      case "reload": location.reload(); return;
      case "member": S.start.member = S.start.members[Number(val)]; S.start.memberQ = S.start.member.email; S.start.members = []; break;
      case "member-clear": S.start.member = null; break;
      case "start": startBag(); return;
      case "resume":
        newItem((S.records.length && S.records[S.records.length - 1].item_type) || "clothing");
        S.screen = S.records.length >= totalCount() && totalCount() > 0 ? "close" : "sort";   // fully sorted: straight to Finish
        break;
      case "cancel-bag": cancelBag(); return;
      case "type":
        if (it.type !== val) {
          var keepPhotos = it.photos;
          newItem(val); S.item.photos = keepPhotos;
        }
        advance = "type";
        break;
      case "brand":
        var picked = brandById(val);
        if (picked) pickBrand(picked);
        advance = "brand";
        break;
      case "brand-type":
        var twin = brandTwin(it.brand);
        if (twin && twin.item_type === val) pickBrand(twin);
        break;
      case "dtype": setType(val); advance = "dtype"; break;
      case "more": it.more = true; break;
      case "nobrand": it.noBrand = true; it.brand = null; it.brandQ = ""; it.typeSet = false; advance = "brand"; break;
      case "newbrand": S.addBrand = { name: it.brandQ.trim(), tier: "", type: (it.choice === "decline" && it.typeSet) ? it.type : "" }; break;
      case "newbrand-newonly": S.addBrand.newOnly = !S.addBrand.newOnly; break;
      case "newbrand-type": S.addBrand.type = val; break;
      case "newbrand-save": saveBrand(); return;
      case "newbrand-cancel": S.addBrand = null; break;
      case "cat": it.category = val; it.catQ = val; it.size = ""; advance = "cat"; break;
      case "size": it.size = val; it.sizeOther = false; advance = "size"; break;
      case "size-other":
        it.sizeOther = !it.sizeOther;
        break;
      case "age": var ai = it.ages.indexOf(val); if (ai > -1) it.ages.splice(ai, 1); else it.ages.push(val); break;
      case "complete": it.complete = val === "yes"; advance = "complete"; break;
      case "tier":
        if (val === "half") { it.half = !it.half; }
        else { it.half = false; it.tier = val; advance = "tier"; }
        break;
      case "photo-remove": if (it.photos.hasOwnProperty(val)) it.photos[val] = null; break;
      case "keep": saveKeep(); return;
      case "choice":
        it.choice = val; S.errors = [];
        if (val === "decline" && it.sizeOther && it.reasons.indexOf("Size out of range") < 0 && it.type === "clothing") it.reasons.push("Size out of range");
        advance = "choice";
        break;
      case "reason": var ri = it.reasons.indexOf(val); if (ri > -1) it.reasons.splice(ri, 1); else it.reasons.push(val); break;
      case "decline-save": saveDecline(); return;
      case "dot":
        var rec = S.records[Number(val)];
        if (rec && S.editing) { S.editing = null; newItem(it ? it.type : "clothing"); }
        S.viewRec = rec || null;
        break;
      case "rec-back": S.viewRec = null; break;
      case "brand-change": it.brand = null; it.brandQ = ""; it.noBrand = false; render(); focusOn("ss-brand"); return;
      case "cat-change": it.category = ""; it.catQ = ""; render(); focusOn("ss-cat"); return;
      case "sku-open": it.skuOpen = true; render(); focusOn("ss-sku"); return;
      case "video-remove": it.video = null; break;
      case "rec-edit": startEdit(S.viewRec); window.scrollTo(0, 0); break;
      case "edit-cancel": S.editing = null; newItem(it ? it.type : "clothing"); break;
      case "rec-remove": removeRecord(S.viewRec); return;
      case "to-close": S.screen = "close"; S.errors = []; break;
      case "back-to-items": S.screen = "sort"; S.errors = []; if (!S.item) newItem("clothing"); break;
      case "close": closeBag(); return;
      case "another": S.start = { trackQ: "", memberQ: "", members: [], member: null, clothing: "", toy: "" }; S.close = { note: "" }; S.screen = "loading"; render(); boot(); return;
      default: return;
    }
    render();
    if (advance && S.screen === "sort") moveOn(advance);
  }
  // Each pick moves down to the next question by itself. A typing box that's next and empty gets
  // the cursor (so the keyboard comes up for it); anything else just scrolls into view.
  function moveOn(from) {
    var qs = Array.prototype.slice.call(root.querySelectorAll("[data-q]"));
    var i = -1;
    qs.forEach(function (el, k) { if (el.getAttribute("data-q") === from) i = k; });
    var next = qs[i + 1];
    if (!next) return;
    var inp = next.querySelector('input.ss-inp[data-k]');
    if (inp && !inp.value) { try { inp.focus({ preventScroll: true }); } catch (e) {} }
    var y = next.getBoundingClientRect().top + window.pageYOffset - 16;
    try { window.scrollTo({ top: y, behavior: "smooth" }); } catch (e) { window.scrollTo(0, y); }
  }

  /* ---------- styles ---------- */
  function css() {
    if (document.getElementById("ss-style")) return;
    var s = document.createElement("style");
    s.id = "ss-style";
    s.textContent = [
      "#" + ROOT_ID + "{display:block;width:100%;background:#161514;min-height:100vh}",
      ".ss-searching .ss-wrap{padding-bottom:75vh}",
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
      ".ss-row.sel{background:#1f3a28;color:#fff;box-shadow:inset 0 0 0 2px #4caf73}",
      ".ss-row.add{color:#f6b49a}",
      ".ss-list .ss-row:not(.sel){background:#2e2a28}",
      ".ss-list .ss-row:not(.sel):not(.add)::after{content:'Tap to pick';flex:none;font-size:11.5px;font-weight:700;color:#161514;background:#f4efe9;border-radius:99px;padding:4px 9px;margin-left:4px}",
      ".ss-list .ss-row:not(.sel) small{margin-left:auto}",
      ".ss-inp.ss-need{border-color:#e8835f;box-shadow:0 0 0 3px rgba(232,131,95,.25)}",
      ".ss-itemhead{margin:6px 0 -4px;font-family:'Instrument Serif',Georgia,serif;font-size:40px;line-height:1.05;color:#f4efe9}",
      ".ss-itemhead small{font-size:22px;color:#bdb5ab}",
      ".ss-itemcard{animation:ssItemIn .5s ease-out}",
      "@keyframes ssItemIn{from{box-shadow:0 0 0 3px #e8835f;transform:translateY(8px)}to{box-shadow:0 0 0 0 rgba(232,131,95,0);transform:none}}",
      "@media (prefers-reduced-motion:reduce){.ss-itemcard{animation:none}}",
      ".ss-row small{font-size:12px;color:#bdb5ab;font-weight:600;text-align:right}",
      ".ss-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
      ".ss-pills.two{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".ss-pills.three{grid-template-columns:repeat(3,minmax(0,1fr))}",
      ".ss-picked{border:0;border-radius:12px;margin-top:0}",
      ".ss-picked small{line-height:1.5}",
      ".ss-picked u{color:#9fe0b6;text-decoration:underline}",
      ".ss-sumlist{display:flex;flex-direction:column;border:1px solid #3a3634;border-radius:12px;overflow:hidden;margin-top:6px}",
      ".ss-sumrow{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border:0;border-top:1px solid #3a3634;background:#1c1a19;color:#e9e3dc;font:600 13.5px 'Quicksand',sans-serif;text-align:left;cursor:pointer;width:100%}",
      ".ss-sumrow:first-child{border-top:0}",
      ".ss-sumrow.ed{box-shadow:inset 0 0 0 2px #f4efe9}",
      ".ss-sumn{flex:none;width:18px;color:#bdb5ab}",
      ".ss-summ{flex:none;width:16px;font-weight:700}",
      ".ss-sumrow.kept .ss-summ{color:#4caf73}",
      ".ss-sumrow.dec .ss-summ{color:#bdb5ab}",
      ".ss-sumt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ss-more{align-self:flex-start;padding:2px 0;font-size:14px}",
      ".ss-mini{margin-top:10px;min-height:32px;padding:4px 12px;border-radius:99px;border:1px solid #4a4542;background:transparent;color:#bdb5ab;font:600 13px 'Quicksand',sans-serif;cursor:pointer}",
      ".ss-mini.sel{background:#f4efe9;color:#161514;border-color:#f4efe9}",
      ".ss-skuline{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;color:#bdb5ab}",
      ".ss-skuline b{color:#f4efe9;font-weight:700;letter-spacing:.02em}",
      ".ss-skuline .ss-link{padding:4px 0;font-size:14px}",
      ".ss-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:12px}",
      ".ss-pill{min-height:48px;padding:6px 8px;border-radius:12px;border:1px solid #4a4542;background:#1c1a19;color:#f4efe9;font:600 15px 'Quicksand',sans-serif;cursor:pointer;line-height:1.2}",
      ".ss-pill.sel{background:#f4efe9;color:#161514;border-color:#f4efe9}",
      ".ss-pill.wide{width:calc(50% - 4px);margin-top:8px}",
      ".ss-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}",
      ".ss-slot{position:relative;height:96px;border-radius:12px;border:1.5px dashed #5a534f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:14px;font-weight:700;color:#f4efe9;text-align:center;padding:0 6px;cursor:pointer;background:#1c1a19 center/cover no-repeat}",
      ".ss-slot small{display:block;font-size:10.5px;color:#bdb5ab;font-weight:600;line-height:1.2}",
      ".ss-slot.full{border:0;padding:0}",
      ".ss-slot.bad{outline:2px solid #c8461f}",
      ".ss-slot-tap{position:absolute;inset:0;display:flex;align-items:flex-end;padding:8px;cursor:pointer;background:linear-gradient(transparent 45%,rgba(0,0,0,.55));border-radius:12px;text-align:left}",
      ".ss-slot-tap small{color:#f4efe9}",
      ".ss-under{margin-top:-6px}",
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
      ".ss-card > .ss-eyebrow{margin:-2px 0 -4px}",
      ".ss-choice .ss-pill{min-height:56px;font-size:17px;font-weight:700}",
      ".ss-fin{gap:12px}",
      ".ss-k{margin:0 0 2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#bdb5ab;font-weight:700}",
      ".ss-fin-subj{margin:0;font-size:16px;font-weight:700;line-height:1.35}",
      ".ss-fin-gold{border-top:2px solid #eda920;border-bottom:2px solid #eda920;padding:8px 0}",
      ".ss-fin-gold p:last-child{margin:0;font-size:17px;font-weight:700}",
      ".ss-back{align-self:center;padding:6px 0}",
      ".em{background:#fff;color:#211b1a;border-radius:12px;overflow:hidden;font-family:'Quicksand',system-ui,sans-serif}",
      ".em-top{background:#f3f1ea;padding:12px 14px;border-bottom:1px solid #e3ded4}",
      ".em-k{margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6e6a63;font-weight:700}",
      ".em-subj{margin:2px 0 0;font-size:15px;font-weight:700;line-height:1.35}",
      ".em-pre{margin:4px 0 0;font-size:13px;color:#6e6a63;line-height:1.35}",
      ".em-body{padding:16px 14px 18px;display:flex;flex-direction:column;gap:10px}",
      ".em-brand{margin:0;font-weight:700;font-size:18px}",
      ".em-date{margin:-6px 0 0;font-size:12.5px;color:#6e6a63}",
      ".em-hi{margin:4px 0 0;font-size:15px}",
      ".em-gap{border:1.5px dashed #cfc8bc;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#8a837a;line-height:1.4}",
      ".em-gold{background:#fdf6e3;border-top:2px solid #eda920;border-bottom:2px solid #eda920;padding:12px 14px;text-align:center}",
      ".em-gold-h{margin:0;font-size:13px;color:#6e6a63;font-weight:700}",
      ".em-gold-n{margin:4px 0 0;font-size:17px;font-weight:700}",
      ".em-gold-s{margin:4px 0 0;font-size:13px;color:#6e6a63}",
      ".em-note{margin:0;font-size:15px;line-height:1.45}",
      ".em-sign{margin:0;font-size:15px;line-height:1.5}",
      ".em-btn{align-self:flex-start;background:#e54f25;color:#fff;border-radius:99px;padding:10px 18px;font-weight:700;font-size:14px}",
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
    root.addEventListener("focusin", function (e) {
      // Brand, category and member searches: bring the box to the top so its list shows above the keyboard.
      var k = e.target.getAttribute && e.target.getAttribute("data-k");
      if (k !== "brandQ" && k !== "catQ" && k !== "memberQ") return;
      root.classList.add("ss-searching");
      setTimeout(function () {
        var y = e.target.getBoundingClientRect().top + window.pageYOffset - 12;
        try { window.scrollTo({ top: y, behavior: "smooth" }); } catch (er) { window.scrollTo(0, y); }
      }, 250);
    });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); // Enter never saves by accident
    });
    console.log("[sort-tool] " + BUILD);
    render();
    boot();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
