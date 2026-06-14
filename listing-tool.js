(function () {
  "use strict";

  /* ---- CONFIG ---------------------------------------------------------- */
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM";   // from /dashboard footer
  var BASE = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1";
  var FN_LIST   = BASE + "/inventory-list";
  var FN_UPLOAD = BASE + "/inventory-upload";
  var DRAFT_KEY = "ks_listing_draft_v1";

  /* ---- FIELD SCHEMA  (single source of truth) -------------------------- */
  /* keys MUST match inventory-list body keys exactly.
     group: 'both' | 'clothing' | 'toy'
     type:  text | number | select | textarea | checkbox
     add a field later  ==  add one entry here. */
  var SCHEMA = [
    { key:"sku",            label:"SKU",            type:"text",   group:"both", required:true,  placeholder:"KS-00000", hint:"the KS label number on the item" },
    { key:"brand",          label:"Brand",          type:"text",   group:"both", required:true,  placeholder:"e.g. Patagonia" },
    { key:"item_name",      label:"Item name",      type:"text",   group:"both", required:true,  placeholder:"auto-fills from brand + category" },
    { key:"toy_age_range",  label:"Age range",      type:"select", group:"toy", required:true, options:["0-6 months","6-12 months","1-2 years","2-3 years","3-4 years","5+ years"] },
    { key:"toy_washability",label:"Washability",    type:"pills",  group:"toy", required:true,  options:["wipeable","washable"] },
    { key:"color",          label:"Color",          type:"text",   group:"clothing", required:false },
    { key:"category",       label:"Category",       type:"text",   group:"clothing", required:true, placeholder:"e.g. Dresses, Pants" },
    { key:"clothing_size",  label:"Size",           type:"text",   group:"clothing", required:true, placeholder:"e.g. 4T, 6, 10" },
    { key:"gender_style",   label:"Gender",         type:"select", group:"clothing", required:false, options:[{value:"boy",label:"Male"},{value:"girl",label:"Female"}] },
    { key:"tier",           label:"Tier",           type:"select", group:"both", required:true,  options:["essentials","elevated","special"] },
    { key:"retail_value",   label:"Retail value",   type:"number", group:"both", required:true,  placeholder:"e.g. 48", step:"0.01", min:"0" },
    { key:"bin_location",   label:"Bin location",   type:"text",     group:"both", required:true,  placeholder:"where it's stored" },
    { key:"condition_grade",label:"Condition grade",type:"text",     group:"both", required:false, placeholder:"e.g. EUC, like-new" },
    { key:"season",         label:"Season",         type:"text",     group:"clothing", required:false, placeholder:"e.g. winter, all-season" },
    { key:"description",    label:"Description",    type:"textarea", group:"both", required:false },
  ];

  /* upload validation mirrors inventory-upload */
  var PHOTO_TYPES = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
  var VIDEO_TYPES = ["video/mp4","video/quicktime","video/webm"];
  var MAX_BYTES = 25 * 1024 * 1024;

  /* ---- STATE ----------------------------------------------------------- */
  var itemType = "clothing";
  /* up to 3 photos in fixed roles + 1 video. each rec: {id,url,status,name,objUrl} */
  var PHOTO_SLOTS = [
    { key:"front",  label:"Front",  hint:"primary photo" },
    { key:"back",   label:"Back",   hint:"" },
    { key:"detail", label:"Detail", hint:"tag, flaw, or close-up" }
  ];
  var slots = { front:null, back:null, detail:null };
  var video = null;
  var token = null;

  var root = document.getElementById("ks-list-app");
  if (!root) { console.error("[listing] #ks-list-app not found"); return; }

  /* ---- BUILD UI -------------------------------------------------------- */
  function fieldHtml(f) {
    var reqMark = f.required ? '<span class="ksl-req">*</span>'
                             : ' <span class="ksl-opt">(optional)</span>';
    var inner;
    if (f.type === "select") {
      var opts = '<option value="">Select…</option>' +
        f.options.map(function (o) {
          var val = (o && typeof o === "object") ? o.value : o;
          var lab = (o && typeof o === "object") ? o.label : o;
          return '<option value="' + val + '">' + lab + '</option>';
        }).join("");
      inner = '<select data-key="' + f.key + '">' + opts + '</select>';
    } else if (f.type === "textarea") {
      inner = '<textarea data-key="' + f.key + '" placeholder="' + (f.placeholder || "") + '"></textarea>';
    } else if (f.type === "number") {
      inner = '<input type="number" data-key="' + f.key + '" placeholder="' + (f.placeholder || "") +
              '"' + (f.step ? ' step="' + f.step + '"' : "") + (f.min ? ' min="' + f.min + '"' : "") + '>';
    } else if (f.type === "pills") {
      var pbtns = f.options.map(function (o) {
        var pv = (o && typeof o === "object") ? o.value : o;
        var pl = (o && typeof o === "object") ? o.label : o;
        return '<button type="button" class="ksl-pill" data-pill="' + f.key + '" data-val="' + pv + '">' + pl + '</button>';
      }).join("");
      inner = '<input type="hidden" data-key="' + f.key + '"><div class="ksl-pills">' + pbtns + '</div>';
    } else {
      var extra = (f.key === "sku")
        ? ' autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"'
        : '';
      inner = '<input type="text" data-key="' + f.key + '"' + extra + ' placeholder="' + (f.placeholder || "") + '">';
    }
    var hint = f.hint ? '<div class="ksl-err">' + f.hint + '</div>' : '<div class="ksl-err">Required</div>';
    return '<div class="ksl-field" data-field="' + f.key + '" data-group="' + f.group + '">' +
             '<label class="ksl-label">' + f.label + reqMark + '</label>' +
             inner + hint +
           '</div>';
  }

  var setHtml =
    '<div class="ksl-field" data-field="__set" data-group="clothing">' +
      '<label class="ksl-check"><input type="checkbox" id="ksl-set"> ' +
      '<span class="ksl-label" style="margin:0">This is a matching set <span class="ksl-opt">(optional)</span></span></label>' +
      '<div id="ksl-set-count-wrap" class="ksl-hidden" style="margin-top:10px">' +
        '<label class="ksl-label">Number of pieces<span class="ksl-req">*</span></label>' +
        '<input type="number" id="ksl-set-count" min="2" step="1" placeholder="e.g. 2">' +
        '<div class="ksl-err">Enter 2 or more pieces</div>' +
      '</div>' +
    '</div>';

  /* matching-set block renders right before item_name — i.e. just after the
     Color/Category/Size/Gender group (clothing) or Age/Washability (toy),
     instead of buried at the bottom of the form. */
  var detailsHtml = SCHEMA.map(function (f) {
    return (f.key === "tier" ? setHtml : "") + fieldHtml(f);
  }).join("");

  root.innerHTML =
    '<h1 class="ksl-title">List an item</h1>' +
    '<p class="ksl-sub">Add a graded item to the live inventory.</p>' +
    '<div class="ksl-restore ksl-hidden" id="ksl-restore">' +
      '<span>You have an unsaved draft from before.</span>' +
      '<span><button id="ksl-restore-no">Discard</button> ' +
      '<button class="ksl-restore-yes" id="ksl-restore-yes">Restore</button></span>' +
    '</div>' +

    '<div class="ksl-toggle">' +
      '<button type="button" data-type="clothing" class="is-active">Clothing</button>' +
      '<button type="button" data-type="toy">Toy</button>' +
    '</div>' +

    '<div class="ksl-card"><h3>Photos &amp; video</h3>' +
      '<p class="ksl-media-help">Up to 3 photos + 1 short video. Tap a slot to add.</p>' +
      '<div class="ksl-slot-grid">' +
        PHOTO_SLOTS.map(function (s) {
          return '<div class="ksl-slot" data-slot="' + s.key + '">' +
                   '<div class="ksl-drop ksl-slot-drop" data-slotdrop="' + s.key + '">' +
                     '<strong>' + s.label + '</strong>' +
                     (s.hint ? ' <span class="ksl-opt">' + s.hint + '</span>' : '') +
                   '</div>' +
                   '<input type="file" accept="image/*" capture="environment" class="ksl-hidden" data-slotinput="' + s.key + '">' +
                   '<div class="ksl-thumbs" data-slotthumb="' + s.key + '"></div>' +
                 '</div>';
        }).join("") +
        '<div class="ksl-slot" data-slot="video">' +
          '<div class="ksl-drop ksl-slot-drop" data-slotdrop="video">' +
            '<strong>Video</strong> <span class="ksl-opt">≤25 MB · ~15s</span>' +
          '</div>' +
          '<input type="file" accept="video/*" capture="environment" class="ksl-hidden" data-slotinput="video">' +
          '<div class="ksl-thumbs" data-slotthumb="video"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="ksl-card ksl-details"><h3>Details</h3>' + detailsHtml +
    '</div>' +

    '<button type="button" class="ksl-submit" id="ksl-submit">List item</button>' +
    '<div class="ksl-toast" id="ksl-toast"></div>' +
    '<div class="ksl-review ksl-hidden" id="ksl-review">' +
      '<div class="ksl-review-panel">' +
        '<h3 class="ksl-review-title">Review listing</h3>' +
        '<div class="ksl-review-body" id="ksl-review-body"></div>' +
        '<div class="ksl-review-actions">' +
          '<button type="button" class="ksl-review-back" id="ksl-review-back">Back</button>' +
          '<button type="button" class="ksl-submit ksl-review-confirm" id="ksl-review-confirm">Confirm &amp; list</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* element refs */
  var $ = function (id) { return document.getElementById(id); };
  var setChk = $("ksl-set"), setCountWrap = $("ksl-set-count-wrap"), setCount = $("ksl-set-count");
  var submitBtn = $("ksl-submit"), toast = $("ksl-toast");
  var reviewEl = $("ksl-review"), reviewBody = $("ksl-review-body");
  var reviewBack = $("ksl-review-back"), reviewConfirm = $("ksl-review-confirm");

  /* ---- ITEM TYPE TOGGLE ------------------------------------------------ */
  function applyType() {
    root.classList.toggle("ks-theme-toy", itemType === "toy");
    root.classList.toggle("ks-theme-clothing", itemType === "clothing");
    root.querySelectorAll(".ksl-toggle button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-type") === itemType);
    });
    root.querySelectorAll("[data-group]").forEach(function (el) {
      var g = el.getAttribute("data-group");
      el.classList.toggle("ksl-hidden", !(g === "both" || g === itemType));
    });
    var nmPh = root.querySelector('[data-key="item_name"]');
    if (nmPh) nmPh.placeholder = (itemType === "toy")
      ? "e.g. Lovevery Play Gym"
      : "auto-fills from brand + category";
    // toy: item name sits right under Brand; clothing: after the size/gender group
    var nameField = root.querySelector('.ksl-field[data-field="item_name"]');
    if (nameField) {
      var anchor = (itemType === "toy")
        ? root.querySelector('.ksl-field[data-field="brand"]')
        : root.querySelector('.ksl-field[data-field="gender_style"]');
      if (anchor && anchor.nextSibling !== nameField) {
        anchor.parentNode.insertBefore(nameField, anchor.nextSibling);
      }
    }
  }
  root.querySelectorAll(".ksl-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      var target = b.getAttribute("data-type");
      if (target === itemType) return;                  // already on this side
      if (hasContent() &&
          !window.confirm("Switching to " + (target === "toy" ? "Toy" : "Clothing") +
                          " will clear this item. Continue?")) {
        return;                                         // operator cancelled — stay put
      }
      clearItem();
      itemType = target; applyType(); saveDraft();
    });
  });

  /* has the operator entered anything for the current item?
     (SKU left at its "KS-" default does NOT count as content) */
  function hasContent() {
    var any = false;
    root.querySelectorAll("[data-key]").forEach(function (el) {
      var v = (el.value || "").trim();
      if (!v) return;
      if (el.getAttribute("data-key") === "sku" && v === "KS-") return;
      any = true;
    });
    if (slots.front || slots.back || slots.detail || video) any = true;
    if (setChk.checked) any = true;
    return any;
  }

  /* wipe the current item — shared by the toggle-clear and submit-reset paths */
  function clearItem() {
    root.querySelectorAll("[data-key]").forEach(function (el) { el.value = ""; });
    if (skuEl) skuEl.value = "KS-";
    nameTouched = false;
    root.querySelectorAll(".ksl-pill.is-active").forEach(function (b) { b.classList.remove("is-active"); });
    setChk.checked = false; setCountWrap.classList.add("ksl-hidden"); setCount.value = "";
    slots = { front:null, back:null, detail:null }; video = null; renderAllSlots();
    clearErrors();
  }

  /* ---- SET TOGGLE ------------------------------------------------------ */
  setChk.addEventListener("change", function () {
    setCountWrap.classList.toggle("ksl-hidden", !setChk.checked);
    saveDraft();
  });

  /* ---- PILL TOGGLE (washability, and any future pill field) ------------ */
  root.addEventListener("click", function (e) {
    var pill = (e.target && e.target.closest) ? e.target.closest(".ksl-pill") : null;
    if (!pill || !root.contains(pill)) return;
    var key = pill.getAttribute("data-pill");
    var inp = root.querySelector('input[data-key="' + key + '"]');
    if (inp) inp.value = pill.getAttribute("data-val");
    root.querySelectorAll('.ksl-pill[data-pill="' + key + '"]').forEach(function (b) {
      b.classList.toggle("is-active", b === pill);
    });
    var f = pill.closest(".ksl-field"); if (f) f.classList.remove("has-error");
    saveDraft();
  });
  function reflectPills() {
    root.querySelectorAll('.ksl-field input[type="hidden"][data-key]').forEach(function (inp) {
      var key = inp.getAttribute("data-key"), val = inp.value;
      root.querySelectorAll('.ksl-pill[data-pill="' + key + '"]').forEach(function (b) {
        b.classList.toggle("is-active", !!val && b.getAttribute("data-val") === val);
      });
    });
  }

  /* ---- TOKEN ----------------------------------------------------------- */
  function getToken() {
    if (token) return Promise.resolve(token);
    if (!window.$memberstackDom) return Promise.reject(new Error("no memberstack"));
    return Promise.resolve(window.$memberstackDom.getMemberCookie()).then(function (t) {
      if (!t) throw new Error("no token");
      token = t;
      return t;
    });
  }

  /* ---- UPLOAD ---------------------------------------------------------- */
  function uploadFile(file, kind) {
    return getToken().then(function (t) {
      return fetch(FN_UPLOAD, {
        method: "POST",
        headers: {
          "x-ms-token": t,
          "content-type": file.type,
          "x-file-name": file.name,
          "x-file-kind": kind,
          "apikey": ANON,
          "authorization": "Bearer " + ANON
        },
        body: file
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ("status " + r.status));
        return j.url;
      });
    });
  }

  function uid() { return Date.now() + "-" + Math.random().toString(36).slice(2, 7); }

  function slotRec(key) { return key === "video" ? video : slots[key]; }
  function renderSlot(key) {
    var thumb = root.querySelector('[data-slotthumb="' + key + '"]');
    if (!thumb) return;
    var rec = slotRec(key);
    if (!rec) { thumb.innerHTML = ""; return; }
    var state = rec.status === "uploading" ? '<div class="ksl-state">Uploading…</div>'
              : rec.status === "error" ? '<div class="ksl-state">Failed — tap ✕</div>' : '';
    var media = (key === "video")
      ? '<video src="' + rec.objUrl + '#t=0.1" muted playsinline preload="metadata"></video>'
      : '<img src="' + rec.objUrl + '" alt="">';
    var isPrimary = (key === "front" && rec.status === "done");
    var badge = isPrimary ? '<span class="ksl-badge">PRIMARY</span>' : '';
    thumb.innerHTML =
      '<div class="ksl-thumb' + (isPrimary ? ' is-primary' : '') +
        (rec.status === "error" ? ' is-error' : '') + '">' +
        media + badge + state +
        '<button class="ksl-rm" data-rmslot="' + key + '" aria-label="remove">×</button>' +
      '</div>';
  }
  function renderAllSlots() {
    PHOTO_SLOTS.forEach(function (s) { renderSlot(s.key); });
    renderSlot("video");
  }

  function handleSlotFile(key, file) {
    if (key === "video") {
      if (VIDEO_TYPES.indexOf(file.type) === -1) { showToast("Unsupported video type: " + file.type, true); return; }
      if (file.size > MAX_BYTES) { showToast("Video is over 25MB", true); return; }
      video = { id: uid(), url: null, status: "uploading", name: file.name, objUrl: URL.createObjectURL(file) };
      renderSlot("video");
      uploadFile(file, "video")
        .then(function (url) { if (video) { video.url = url; video.status = "done"; renderSlot("video"); saveDraft(); } })
        .catch(function (e) { if (video) { video.status = "error"; renderSlot("video"); } console.error("[upload video]", e); });
      return;
    }
    if (PHOTO_TYPES.indexOf(file.type) === -1) { showToast("Unsupported image type: " + file.type, true); return; }
    if (file.size > MAX_BYTES) { showToast(file.name + " is over 25MB", true); return; }
    var rec = { id: uid(), url: null, status: "uploading", name: file.name, objUrl: URL.createObjectURL(file) };
    slots[key] = rec; renderSlot(key);
    uploadFile(file, "photo")
      .then(function (url) { if (slots[key] === rec) { rec.url = url; rec.status = "done"; renderSlot(key); saveDraft(); } })
      .catch(function (e) { if (slots[key] === rec) { rec.status = "error"; renderSlot(key); } console.error("[upload photo]", e); });
  }

  /* wire each slot's hidden file input */
  root.querySelectorAll("[data-slotinput]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var key = inp.getAttribute("data-slotinput");
      var file = inp.files && inp.files[0];
      inp.value = "";
      if (file) handleSlotFile(key, file);
    });
  });

  /* delegated: tap a slot to open its picker; tap × to clear it */
  root.addEventListener("click", function (e) {
    var drop = (e.target && e.target.closest) ? e.target.closest("[data-slotdrop]") : null;
    if (drop) {
      var inp = root.querySelector('[data-slotinput="' + drop.getAttribute("data-slotdrop") + '"]');
      if (inp) inp.click();
      return;
    }
    var rm = (e.target && e.target.getAttribute) ? e.target.getAttribute("data-rmslot") : null;
    if (rm) {
      if (rm === "video") video = null; else slots[rm] = null;
      renderSlot(rm); saveDraft();
    }
  });

  /* ---- DRAFT PERSISTENCE (sessionStorage) ------------------------------ */
  /* Note: text fields + type + set only. Photos are NOT redrawn from draft
     (object URLs don't survive reload) but their uploaded URLs are kept so
     a restored draft still submits with its already-uploaded media. */
  function collectFields() {
    var out = {};
    root.querySelectorAll("[data-key]").forEach(function (el) {
      var fld = el.closest(".ksl-field");
      if (fld && fld.classList.contains("ksl-hidden")) return;
      out[el.getAttribute("data-key")] = el.value;
    });
    return out;
  }
  function saveDraft() {
    try {
      var draft = {
        itemType: itemType,
        fields: collectFields(),
        set: setChk.checked,
        setCount: setCount.value,
        photoSlots: {
          front:  (slots.front  && slots.front.status  === "done") ? slots.front.url  : null,
          back:   (slots.back   && slots.back.status   === "done") ? slots.back.url   : null,
          detail: (slots.detail && slots.detail.status === "done") ? slots.detail.url : null
        },
        videoUrl: (video && video.status === "done") ? video.url : null
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {}
  }
  function hasDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (!d) return false;
      var anyText = Object.keys(d.fields || {}).some(function (k) { return d.fields[k]; });
      var ps = d.photoSlots || {};
      var anyPhoto = ps.front || ps.back || ps.detail;
      return anyText || !!anyPhoto || !!d.videoUrl;
    } catch (e) { return false; }
  }
  function restoreDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (!d) return;
      itemType = d.itemType || "clothing"; applyType();
      Object.keys(d.fields || {}).forEach(function (k) {
        var el = root.querySelector('[data-key="' + k + '"]');
        if (!el) return;
        el.value = d.fields[k];
        if (el.tagName === "SELECT" && el.value !== d.fields[k]) {
          el.selectedIndex = 0;
        }
      });
      setChk.checked = !!d.set; setCountWrap.classList.toggle("ksl-hidden", !d.set);
      setCount.value = d.setCount || "";
      var ps = d.photoSlots || {};
      ["front", "back", "detail"].forEach(function (k) {
        if (ps[k]) slots[k] = { id: uid(), url: ps[k], status: "done", name: "restored", objUrl: ps[k] };
      });
      if (d.videoUrl) video = { id: uid(), url: d.videoUrl, status: "done", name: "restored", objUrl: d.videoUrl };
      renderAllSlots(); reflectPills();
    } catch (e) {}
  }
  root.addEventListener("input", saveDraft);

  /* ---- VALIDATION + SUBMIT --------------------------------------------- */
  function clearErrors() {
    root.querySelectorAll(".ksl-field.has-error").forEach(function (f) { f.classList.remove("has-error"); });
  }
  function markError(key) {
    var f = root.querySelector('.ksl-field[data-field="' + key + '"]');
    if (f) f.classList.add("has-error");
  }

  function validate() {
    clearErrors();
    var bad = [];
    SCHEMA.forEach(function (f) {
      if (!(f.group === "both" || f.group === itemType)) return;
      if (!f.required) return;
      var el = root.querySelector('[data-key="' + f.key + '"]');
      var v = el ? el.value.trim() : "";
      if (!v) { bad.push(f.key); markError(f.key); }
      if (f.type === "number" && v && isNaN(Number(v))) { bad.push(f.key); markError(f.key); }
    });
    if (itemType === "clothing" && setChk.checked) {
      var n = parseInt(setCount.value, 10);
      if (!(n >= 2)) { bad.push("__set"); root.querySelector('[data-field="__set"]').classList.add("has-error"); }
    }
    return bad;
  }

  function buildPayload() {
    var p = { item_type: itemType };
    SCHEMA.forEach(function (f) {
      if (!(f.group === "both" || f.group === itemType)) return;
      var el = root.querySelector('[data-key="' + f.key + '"]');
      if (!el) return;
      var v = el.value.trim();
      if (v === "") return;
      p[f.key] = (f.type === "number") ? Number(v) : v;
    });
    var donePhotos = ["front", "back", "detail"]
      .map(function (k) { return slots[k]; })
      .filter(function (r) { return r && r.status === "done"; })
      .map(function (r) { return r.url; });
    if (donePhotos.length) p.photo_urls = donePhotos;
    if (video && video.status === "done") p.video_url = video.url;
    if (itemType === "clothing" && setChk.checked) { p.is_matching_set = true; p.set_piece_count = parseInt(setCount.value, 10); }
    return p;
  }

  function anyUploading() {
    var up = PHOTO_SLOTS.some(function (s) { return slots[s.key] && slots[s.key].status === "uploading"; });
    return up || (video && video.status === "uploading");
  }

  function reviewRow(label, value) {
    return '<div class="ksl-review-row"><span class="ksl-review-k">' + label +
           '</span><span class="ksl-review-v">' + value + '</span></div>';
  }
  function showReview() {
    var rows = reviewRow("Type", itemType === "toy" ? "Toy" : "Clothing");
    SCHEMA.forEach(function (f) {
      if (!(f.group === "both" || f.group === itemType)) return;
      var el = root.querySelector('[data-key="' + f.key + '"]');
      if (!el) return;
      var v = (el.value || "").trim();
      if (!v) return;
      if (f.key === "gender_style") v = (v === "boy") ? "Male" : (v === "girl") ? "Female" : v;
      rows += reviewRow(f.label, v);
    });
    if (itemType === "clothing" && setChk.checked) rows += reviewRow("Matching set", setCount.value + " pieces");
    var pc = ["front", "back", "detail"].filter(function (k) { return slots[k] && slots[k].status === "done"; }).length;
    rows += reviewRow("Media", pc + (pc === 1 ? " photo" : " photos") + (video && video.status === "done" ? " + video" : ""));
    reviewBody.innerHTML = rows;
    reviewEl.classList.remove("ksl-hidden");
  }

  submitBtn.addEventListener("click", function () {
    var bad = validate();
    if (bad.length) { showToast("Check the highlighted fields", true); return; }
    var nmEl = root.querySelector('[data-key="item_name"]');
    var brEl = root.querySelector('[data-key="brand"]');
    var nm = nmEl ? nmEl.value : "", br = brEl ? brEl.value : "";
    var normNB = function (s) { return (s || "").toLowerCase().replace(/\s+/g, ""); };
    if (nm && br && normNB(nm) === normNB(br)) {
      markError("item_name");
      showToast("Item name needs to be more specific than the brand", true);
      return;
    }
    if (anyUploading()) { showToast("Wait for photos to finish uploading", true); return; }
    showReview();
  });

  reviewBack.addEventListener("click", function () { reviewEl.classList.add("ksl-hidden"); });

  reviewConfirm.addEventListener("click", function () {
    reviewConfirm.disabled = true; reviewConfirm.textContent = "Listing…";
    getToken().then(function (t) {
      return fetch(FN_LIST, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify(buildPayload())
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res) {
      reviewEl.classList.add("ksl-hidden");
      if (res.ok && res.j.ok) {
        var sku = res.j.item && res.j.item.sku ? res.j.item.sku : "";
        showToast("Listed " + sku + " ✓");
        resetForm();
      } else {
        var msg = res.j.error || ("status " + res.status);
        if (res.j.fields) msg += ": " + res.j.fields.join(", ");
        showToast("Failed — " + msg, true);
        console.error("[list]", res);
      }
    }).catch(function (e) {
      reviewEl.classList.add("ksl-hidden");
      showToast("Network error — see console", true); console.error("[list]", e);
    }).finally(function () {
      reviewConfirm.disabled = false; reviewConfirm.textContent = "Confirm & list";
    });
  });

  function resetForm() {
    clearItem();
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---- TOAST ----------------------------------------------------------- */
  var toastTimer;
  function showToast(msg, isErr) {
    toast.textContent = msg;
    toast.classList.toggle("is-error", !!isErr);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, isErr ? 4200 : 2600);
  }

  /* ---- SKU PREFILL ----------------------------------------------------- */
  var skuEl = root.querySelector('[data-key="sku"]');
  if (skuEl && !skuEl.value) skuEl.value = "KS-";

  /* ---- ITEM-NAME AUTO-GENERATE ----------------------------------------- */
  /* Builds "Color Brand Category" from those fields, but STOPS once the
     operator manually edits the name (so we never clobber their wording). */
  var nameEl = root.querySelector('[data-key="item_name"]');
  var nameTouched = false;
  if (nameEl) {
    nameEl.addEventListener("input", function () { nameTouched = true; });
  }
  function titleCase(s) {
    return s.replace(/\w\S*/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
  }
  function autoName() {
    if (!nameEl || nameTouched) return;
    var brand = (root.querySelector('[data-key="brand"]') || {}).value || "";
    var cat   = (root.querySelector('[data-key="category"]') || {}).value || "";
    var color = (root.querySelector('[data-key="color"]') || {}).value || "";
    // Never auto-fill a name that's just the brand — require Color or Category
    // (clothing-only), so toys are left blank for a real, specific name.
    if (!color.trim() && !cat.trim()) return;
    // Format: Color Brand Category (no parentheses)
    var parts = [color.trim(), brand.trim(), cat.trim()].filter(Boolean).map(titleCase);
    nameEl.value = parts.join(" ");
  }
  ["brand", "category", "color"].forEach(function (k) {
    var el = root.querySelector('[data-key="' + k + '"]');
    if (el) el.addEventListener("input", autoName);
  });

  /* ---- INIT ------------------------------------------------------------ */
  applyType();
  if (hasDraft()) {
    var rb = $("ksl-restore"); rb.classList.remove("ksl-hidden");
    $("ksl-restore-yes").addEventListener("click", function () {
      restoreDraft();
      nameTouched = true;
      rb.classList.add("ksl-hidden");
    });
    $("ksl-restore-no").addEventListener("click", function () {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      rb.classList.add("ksl-hidden");
    });
  }
  // warm the token early so first upload is instant
  getToken().catch(function () {});
})();
