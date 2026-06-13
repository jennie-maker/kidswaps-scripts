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
    { key:"tier",           label:"Tier",           type:"select", group:"both", required:true,  options:["essentials","elevated","special"] },
    { key:"retail_value",   label:"Retail value",   type:"number", group:"both", required:true,  placeholder:"e.g. 48", step:"0.01", min:"0" },

    { key:"category",       label:"Category",       type:"text",   group:"clothing", required:true, placeholder:"e.g. Dresses, Pants" },
    { key:"clothing_size",  label:"Size",           type:"text",   group:"clothing", required:true, placeholder:"e.g. 4T, 6, 10" },
    { key:"gender_style",   label:"Gender",         type:"select", group:"clothing", required:false, options:["boy","girl"] },

    { key:"toy_age_range",  label:"Age range",      type:"text",   group:"toy", required:true, placeholder:"e.g. 0-2, 3-5" },
    { key:"toy_washability",label:"Washability",    type:"select", group:"toy", required:false, options:["wipeable","washable"] },

    { key:"item_name",      label:"Item name",      type:"text",     group:"both", required:true,  placeholder:"auto-fills from brand + category" },
    { key:"color",          label:"Color",          type:"text",     group:"both", required:false },
    { key:"season",         label:"Season",         type:"text",     group:"both", required:false, placeholder:"e.g. winter, all-season" },
    { key:"bin_location",   label:"Bin location",   type:"text",     group:"both", required:true,  placeholder:"where it's stored" },
    { key:"condition_grade",label:"Condition grade",type:"text",     group:"both", required:false, placeholder:"e.g. EUC, like-new" },
    { key:"condition_notes",label:"Condition notes",type:"textarea", group:"both", required:false },
    { key:"description",    label:"Description",    type:"textarea", group:"both", required:false }
  ];

  /* upload validation mirrors inventory-upload */
  var PHOTO_TYPES = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
  var VIDEO_TYPES = ["video/mp4","video/quicktime","video/webm"];
  var MAX_BYTES = 25 * 1024 * 1024;

  /* ---- STATE ----------------------------------------------------------- */
  var itemType = "clothing";
  var photos = [];   // {id, url, status:'uploading'|'done'|'error', name, objUrl}
  var video  = null; // {id, url, status, name, objUrl}
  var token  = null;

  var root = document.getElementById("ks-list-app");
  if (!root) { console.error("[listing] #ks-list-app not found"); return; }

  /* ---- BUILD UI -------------------------------------------------------- */
  function fieldHtml(f) {
    var reqMark = f.required ? '<span class="ksl-req">*</span>'
                             : ' <span class="ksl-opt">(optional)</span>';
    var inner;
    if (f.type === "select") {
      var opts = '<option value="">Select…</option>' +
        f.options.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join("");
      inner = '<select data-key="' + f.key + '">' + opts + '</select>';
    } else if (f.type === "textarea") {
      inner = '<textarea data-key="' + f.key + '" placeholder="' + (f.placeholder || "") + '"></textarea>';
    } else if (f.type === "number") {
      inner = '<input type="number" data-key="' + f.key + '" placeholder="' + (f.placeholder || "") +
              '"' + (f.step ? ' step="' + f.step + '"' : "") + (f.min ? ' min="' + f.min + '"' : "") + '>';
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

  var detailsHtml = SCHEMA.map(fieldHtml).join("");

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
      '<div class="ksl-drop" id="ksl-photo-drop">' +
        '<strong>Add photos</strong> — tap to use camera or pick files<br>' +
        '<span style="font-size:12px">first photo becomes the primary</span>' +
      '</div>' +
      '<input type="file" id="ksl-photo-input" accept="image/*" capture="environment" multiple class="ksl-hidden">' +
      '<div class="ksl-thumbs" id="ksl-photo-thumbs"></div>' +
      '<div class="ksl-drop" id="ksl-video-drop" style="margin-top:14px">' +
        '<strong>Add video</strong> <span class="ksl-opt">(optional, ~15s, one clip)</span>' +
      '</div>' +
      '<input type="file" id="ksl-video-input" accept="video/*" capture="environment" class="ksl-hidden">' +
      '<div class="ksl-thumbs" id="ksl-video-thumbs"></div>' +
    '</div>' +

    '<div class="ksl-card"><h3>Details</h3>' + detailsHtml +
      '<div class="ksl-field" data-field="__set" data-group="both">' +
        '<label class="ksl-check"><input type="checkbox" id="ksl-set"> ' +
        '<span class="ksl-label" style="margin:0">This is a matching set <span class="ksl-opt">(optional)</span></span></label>' +
        '<div id="ksl-set-count-wrap" class="ksl-hidden" style="margin-top:10px">' +
          '<label class="ksl-label">Number of pieces<span class="ksl-req">*</span></label>' +
          '<input type="number" id="ksl-set-count" min="2" step="1" placeholder="e.g. 2">' +
          '<div class="ksl-err">Enter 2 or more pieces</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<button type="button" class="ksl-submit" id="ksl-submit">List item</button>' +
    '<div class="ksl-toast" id="ksl-toast"></div>';

  /* element refs */
  var $ = function (id) { return document.getElementById(id); };
  var photoInput = $("ksl-photo-input"), videoInput = $("ksl-video-input");
  var photoThumbs = $("ksl-photo-thumbs"), videoThumbs = $("ksl-video-thumbs");
  var setChk = $("ksl-set"), setCountWrap = $("ksl-set-count-wrap"), setCount = $("ksl-set-count");
  var submitBtn = $("ksl-submit"), toast = $("ksl-toast");

  /* ---- ITEM TYPE TOGGLE ------------------------------------------------ */
  function applyType() {
    root.querySelectorAll(".ksl-toggle button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-type") === itemType);
    });
    root.querySelectorAll("[data-group]").forEach(function (el) {
      var g = el.getAttribute("data-group");
      el.classList.toggle("ksl-hidden", !(g === "both" || g === itemType));
    });
  }
  root.querySelectorAll(".ksl-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      itemType = b.getAttribute("data-type"); applyType(); saveDraft();
    });
  });

  /* ---- SET TOGGLE ------------------------------------------------------ */
  setChk.addEventListener("change", function () {
    setCountWrap.classList.toggle("ksl-hidden", !setChk.checked);
    saveDraft();
  });

  /* ---- TOKEN ----------------------------------------------------------- */
  function getToken() {
    if (token) return Promise.resolve(token);
    if (!window.$memberstackDom) return Promise.reject(new Error("no memberstack"));
    return window.$memberstackDom.getMemberCookie().then(function (t) { token = t; return t; });
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

  function renderPhotos() {
    photoThumbs.innerHTML = photos.map(function (p, i) {
      var primary = (i === firstDonePhotoIndex());
      var state = p.status === "uploading" ? '<div class="ksl-state">Uploading…</div>'
                : p.status === "error" ? '<div class="ksl-state">Failed — tap ✕</div>' : '';
      var badge = primary ? '<span class="ksl-badge">PRIMARY</span>' : '';
      var mkBtn = (p.status === "done" && !primary)
        ? '<button class="ksl-mk-primary" data-mkprimary="' + p.id + '">Make primary</button>' : '';
      return '<div class="ksl-thumb' + (primary ? ' is-primary' : '') +
             (p.status === "error" ? ' is-error' : '') + '">' +
               '<img src="' + p.objUrl + '" alt="">' + badge + state + mkBtn +
               '<button class="ksl-rm" data-rm="' + p.id + '" aria-label="remove">×</button>' +
             '</div>';
    }).join("");
  }
  function firstDonePhotoIndex() {
    for (var i = 0; i < photos.length; i++) if (photos[i].status === "done") return i;
    return -1;
  }
  function renderVideo() {
    if (!video) { videoThumbs.innerHTML = ""; return; }
    var state = video.status === "uploading" ? '<div class="ksl-state">Uploading…</div>'
              : video.status === "error" ? '<div class="ksl-state">Failed — tap ✕</div>' : '';
    videoThumbs.innerHTML =
      '<div class="ksl-thumb' + (video.status === "error" ? ' is-error' : '') + '">' +
        '<video src="' + video.objUrl + '" muted></video>' + state +
        '<button class="ksl-rm" data-rmvideo="1" aria-label="remove">×</button>' +
      '</div>';
  }

  photoInput.addEventListener("change", function () {
    Array.prototype.forEach.call(photoInput.files, function (file) {
      if (PHOTO_TYPES.indexOf(file.type) === -1) { showToast("Unsupported image type: " + file.type, true); return; }
      if (file.size > MAX_BYTES) { showToast(file.name + " is over 25MB", true); return; }
      var rec = { id: uid(), url: null, status: "uploading", name: file.name, objUrl: URL.createObjectURL(file) };
      photos.push(rec); renderPhotos();
      uploadFile(file, "photo")
        .then(function (url) { rec.url = url; rec.status = "done"; renderPhotos(); saveDraft(); })
        .catch(function (e) { rec.status = "error"; renderPhotos(); console.error("[upload photo]", e); });
    });
    photoInput.value = "";
  });

  videoInput.addEventListener("change", function () {
    var file = videoInput.files[0]; videoInput.value = "";
    if (!file) return;
    if (VIDEO_TYPES.indexOf(file.type) === -1) { showToast("Unsupported video type: " + file.type, true); return; }
    if (file.size > MAX_BYTES) { showToast("Video is over 25MB", true); return; }
    video = { id: uid(), url: null, status: "uploading", name: file.name, objUrl: URL.createObjectURL(file) };
    renderVideo();
    uploadFile(file, "video")
      .then(function (url) { video.url = url; video.status = "done"; renderVideo(); saveDraft(); })
      .catch(function (e) { if (video) { video.status = "error"; renderVideo(); } console.error("[upload video]", e); });
  });

  $("ksl-photo-drop").addEventListener("click", function () { photoInput.click(); });
  $("ksl-video-drop").addEventListener("click", function () { videoInput.click(); });

  photoThumbs.addEventListener("click", function (e) {
    var rm = e.target.getAttribute("data-rm");
    var mk = e.target.getAttribute("data-mkprimary");
    if (rm) { photos = photos.filter(function (p) { return p.id !== rm; }); renderPhotos(); saveDraft(); }
    else if (mk) {
      var idx = photos.findIndex(function (p) { return p.id === mk; });
      if (idx > 0) { var x = photos.splice(idx, 1)[0]; photos.unshift(x); renderPhotos(); saveDraft(); }
    }
  });
  videoThumbs.addEventListener("click", function (e) {
    if (e.target.getAttribute("data-rmvideo")) { video = null; renderVideo(); saveDraft(); }
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
        photoUrls: photos.filter(function (p) { return p.status === "done"; }).map(function (p) { return p.url; }),
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
      return anyText || (d.photoUrls && d.photoUrls.length);
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
      (d.photoUrls || []).forEach(function (url) {
        photos.push({ id: uid(), url: url, status: "done", name: "restored", objUrl: url });
      });
      if (d.videoUrl) video = { id: uid(), url: d.videoUrl, status: "done", name: "restored", objUrl: d.videoUrl };
      renderPhotos(); renderVideo();
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
    if (setChk.checked) {
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
    var donePhotos = photos.filter(function (x) { return x.status === "done"; }).map(function (x) { return x.url; });
    if (donePhotos.length) p.photo_urls = donePhotos;
    if (video && video.status === "done") p.video_url = video.url;
    if (setChk.checked) { p.is_matching_set = true; p.set_piece_count = parseInt(setCount.value, 10); }
    return p;
  }

  function anyUploading() {
    return photos.some(function (p) { return p.status === "uploading"; }) ||
           (video && video.status === "uploading");
  }

  submitBtn.addEventListener("click", function () {
    var bad = validate();
    if (bad.length) { showToast("Check the highlighted fields", true); return; }
    if (anyUploading()) { showToast("Wait for photos to finish uploading", true); return; }

    submitBtn.disabled = true; submitBtn.textContent = "Listing…";
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
      showToast("Network error — see console", true); console.error("[list]", e);
    }).finally(function () {
      submitBtn.disabled = false; submitBtn.textContent = "List item";
    });
  });

  function resetForm() {
    root.querySelectorAll("[data-key]").forEach(function (el) { el.value = ""; });
    if (skuEl) skuEl.value = "KS-";
    nameTouched = false;
    setChk.checked = false; setCountWrap.classList.add("ksl-hidden"); setCount.value = "";
    photos = []; video = null; renderPhotos(); renderVideo();
    clearErrors();
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
  /* Builds "Brand Category (Color)" from those fields, but STOPS once the
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
