(function () {
  "use strict";

  /* ---- VERSION STAMP (Improvement A) -------------------------------------
   * Same as browse-tool.js: print the live jsDelivr @<sha> from this script's
   * own src on load — reflects the real running pin, never stale, never breaks
   * the app (wrapped in try/catch). */
  try {
    var __ksScript = document.currentScript;
    if (!__ksScript) {
      var __ksScripts = document.getElementsByTagName("script");
      for (var __ksJ = 0; __ksJ < __ksScripts.length; __ksJ++) {
        if (__ksScripts[__ksJ].src && __ksScripts[__ksJ].src.indexOf("listing-tool.js") !== -1) {
          __ksScript = __ksScripts[__ksJ]; break;
        }
      }
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : "";
    var __ksPin = (__ksSrc.match(/@([^/]+)\/listing-tool\.js/) || [])[1] || "unknown";
    console.log("%c[ks-listing] build " + __ksPin, "color:#d24f28;font-weight:600", __ksSrc || "(no src)");
  } catch (__ksErr) {}

  /* ---- CONFIG ---------------------------------------------------------- */
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM";   // from /dashboard footer
  var BASE = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1";
  var FN_LIST   = BASE + "/inventory-list";
  var FN_UPLOAD = BASE + "/inventory-upload";
  var FN_LOOKUP = BASE + "/intake-lookup";
  var FN_EDIT   = BASE + "/inventory-edit";   // Manage-Item load/update
  var FN_BRAND  = BASE + "/brand-manage";     // brand dropdown list + add-new (operator-gated)
  var REST = "https://ajsobivqxexcniwifxzz.supabase.co/rest/v1";   // direct PostgREST (option_lists, nothing to hide)
  var DRAFT_KEY = "ks_listing_draft_v1";

  /* ---- RESALE PRICING CONFIG (locked 2026-06-23b) ---------------------- */
  /* resale_value = retail x tierPct x conditionFactor, auto-filled at listing
     for elevated/special (editable). Essentials is EXEMPT (resale stays NULL).
     These are the LISTING-side numbers only; the $5 upgrade-fee floor + $80
     Luxury ceiling live in the checkout Edge Fn (spend-side), NOT here.
     Tune ~quarterly vs real resale comps. NOTE: changing a number only affects
     items listed AFTER the change — already-listed rows keep their stored value
     until re-saved/backfilled (price stability for live items, by design). */
  var RESALE_CONFIG = {
    tierPct:   { essentials: 0.30, elevated: 0.50, special: 0.55 },
    condition: { "new-with-tags": 1.20, "like-new": 1.00, "great": 0.90, "good": 0.85, "fair": 0.70 }
  };

  /* ---- OPTION_LISTS (controlled vocabulary, live read — Path B) --------- */
  /* Fetched once at load; the remote-select fields fill from this. The SKU
     equals the grading label; option values are the stored canonical values
     (so an auto-populated category/size matches an <option value> exactly). */
  var OPTION_LISTS = {};   // field -> [{value, display_label, sort_order}, ...] (sorted)

  function loadOptionLists() {
    var url = REST + "/option_lists?active=eq.true" +
              "&select=field,value,email_singular,display_label,sort_order&order=field,sort_order";
    return fetch(url, { headers: { apikey: ANON, authorization: "Bearer " + ANON } })
      .then(function (r) {
        if (!r.ok) throw new Error("option_lists HTTP " + r.status);
        return r.json();
      })
      .then(function (rows) {
        OPTION_LISTS = {};
        rows.forEach(function (row) {
          (OPTION_LISTS[row.field] = OPTION_LISTS[row.field] || []).push(row);
        });
        return OPTION_LISTS;
      });
  }

  // Build a select's options from option_lists rows.
  // display-fallback rule: show display_label if present, else value.
  // Preserve any value already on the select (stays "" if not in the new set).
  function fillSelect(sel, rows) {
    var saved = sel.value;
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = ""; ph.textContent = "Select…";
    sel.appendChild(ph);
    rows.forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.value;                       // stored canonical value
      opt.textContent = row.display_label || row.value;
      sel.appendChild(opt);
    });
    if (saved) sel.value = saved;
  }

  // The Size field is ONE control writing to clothing_size, but its vocabulary
  // swaps by category: Shoes -> shoe_size (22), everything else -> clothing_size
  // (10). Storage is unchanged — shoes co-exist in inventory.clothing_size,
  // distinguished by category='Shoes' (mirrors intake_records.size).
  function isShoeCategory() {
    var catSel = root.querySelector('select[data-key="category"]');
    return !!catSel && catSel.value === "Shoes";
  }
  function populateSizeOptions() {
    var sel = root.querySelector('select[data-key="clothing_size"]');
    if (!sel) return;
    var shoe = isShoeCategory();
    fillSelect(sel, OPTION_LISTS[shoe ? "shoe_size" : "clothing_size"] || []);
    // relabel for clarity; preserve the required-asterisk span (first text node only)
    var lbl = root.querySelector('.ksl-field[data-field="clothing_size"] .ksl-label');
    if (lbl && lbl.firstChild && lbl.firstChild.nodeType === 3) {
      lbl.firstChild.nodeValue = shoe ? "Shoe size" : "Size";
    }
  }

  /* ---- RESPONSIVE: toy age tiles wrap on phones (E) -------------------- */
  /* The 4 toy age pills overflow the right edge on narrow screens. Inject a
     mobile-only rule (<=600px) so the pillbox wraps onto multiple rows instead
     of clipping. Pure JS / injected <style> (no Webflow CSS-box edit); desktop
     (>600px) is byte-untouched. !important defeats any current nowrap/grid on
     the container. */
  (function injectAgeTileWrap() {
    if (document.getElementById("ksl-agewrap-css")) return;
    var st = document.createElement("style");
    st.id = "ksl-agewrap-css";
    st.textContent =
      "@media (max-width:600px){" +
        "[data-pillbox=\"toy_age_range\"]{display:flex!important;flex-wrap:wrap!important;gap:8px!important;}" +
        "[data-pillbox=\"toy_age_range\"] .ksl-pill{flex:0 1 auto;}" +
      "}";
    document.head.appendChild(st);
  })();

  /* ---- VISIBILITY: draft-restore banner stands out ------------------- */
  /* The Restore/Discard buttons inherited near-invisible defaults from the page
     CSS. Inject a clear alert-card look (reusing the browse luxury-note gold
     treatment, not a new color) + real button styling so the prompt can't be
     missed. Pure JS / injected <style>; IDs win specificity over the page. */
  (function injectRestoreCss() {
    if (document.getElementById("ksl-restore-css")) return;
    var st = document.createElement("style");
    st.id = "ksl-restore-css";
    st.textContent =
      "#ksl-restore{display:flex;align-items:center;justify-content:space-between;gap:14px;" +
        "flex-wrap:wrap;background:#faf7f0;border:1px solid #ecd9ad;border-left:3px solid #e0a93f;" +
        "border-radius:9px;padding:11px 14px;margin:0 0 14px;color:#1f1a17;font-size:.9rem;}" +
      "#ksl-restore button{font:inherit;font-weight:700;cursor:pointer;border-radius:8px;padding:7px 16px;}" +
      "#ksl-restore #ksl-restore-yes{background:#d24f28;color:#fff;border:1px solid #d24f28;}" +
      "#ksl-restore #ksl-restore-no{background:#fff;color:#1f1a17;border:1px solid rgba(31,26,23,.2);}";
    document.head.appendChild(st);
  })();

  /* ---- RESTYLE: Clothing/Toy toggle = segmented control --------------- */
  /* The two type tabs read as standalone buttons. Restyle as one connected
     segmented control (active filled in brand orange, inactive muted) so it
     reads as a single toggle. Pure JS inject; #ks-list-app prefix wins over the
     page CSS; approved palette + ink-derived neutrals. */
  (function injectToggleCss() {
    if (document.getElementById("ksl-toggle-css")) return;
    var st = document.createElement("style");
    st.id = "ksl-toggle-css";
    st.textContent =
      "#ks-list-app .ksl-toggle{display:inline-flex;gap:0;padding:3px;border-radius:10px;" +
        "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);}" +
      "#ks-list-app .ksl-toggle button{appearance:none;-webkit-appearance:none;border:0;background:transparent;" +
        "color:inherit;font:inherit;font-weight:600;padding:8px 22px;border-radius:8px;cursor:pointer;" +
        "opacity:.55;transition:background .15s,opacity .15s;}" +
      "#ks-list-app .ksl-toggle button.is-active{background:#d24f28;color:#fff;opacity:1;}";
    document.head.appendChild(st);
  })();

  // Build the toy-age multipills from option_lists.toy_age (4 stages).
  // Pills render in fetched order (= sort_order), so the active-pill join in
  // the click handler yields the canonical-order delimited value for free.
  // Display the label ("Baby · under 1"); store the bare stage word ("Baby").
  function injectMultipills() {
    var box = root.querySelector('[data-pillbox="toy_age_range"]');
    if (!box) return;
    var rows = OPTION_LISTS["toy_age"] || [];
    box.innerHTML = "";
    rows.forEach(function (row) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ksl-pill";
      b.setAttribute("data-pill", "toy_age_range");
      b.setAttribute("data-val", row.value);
      b.setAttribute("data-multi", "1");
      b.textContent = row.display_label || row.value;
      box.appendChild(b);
    });
    reflectPills();   // re-activate from any current/restored hidden value
  }

  // Most listed items are great, so default condition_grade to it whenever
  // the select is fresh/empty (drops the blank "Select…" and a stray Fair
  // sticking). Drafts (restore runs after this) and any operator pick still
  // win. Math is unchanged — a blank grade already fell back to 1.00.
  function defaultCondition() {
    var sel = root.querySelector('select[data-key="condition_grade"]');
    if (sel && !sel.value) sel.value = "great";
  }

  // Fill the remote selects after the fetch resolves. Size is category-aware.
  function injectOptions() {
    ["color", "category", "condition_grade"].forEach(function (key) {
      var sel = root.querySelector('select[data-key="' + key + '"]');
      if (sel) fillSelect(sel, OPTION_LISTS[key] || []);
    });
    defaultCondition();
    populateSizeOptions();
    injectMultipills();
  }

  /* ---- FIELD SCHEMA  (single source of truth) -------------------------- */
  /* keys MUST match inventory-list body keys exactly.
     group: 'both' | 'clothing' | 'toy'
     type:  text | number | select | textarea | checkbox
     add a field later  ==  add one entry here. */
  var SCHEMA = [
    { key:"sku",            label:"SKU",            type:"text",   group:"both", required:true,  placeholder:"KS-00000", hint:"the KS label number on the item" },
    { key:"brand",          label:"Brand",          type:"text",   group:"both", required:true,  placeholder:"e.g. Patagonia" },
    { key:"item_name",      label:"Item name",      type:"text",   group:"both", required:true,  placeholder:"auto-fills from brand + category" },
    { key:"description",    label:"Description",    type:"textarea", group:"both", required:false },
    { key:"toy_age_range",  label:"Age range",      type:"multipills", remote:true, group:"toy", required:true },
    { key:"toy_washability",label:"Washability",    type:"pills",  group:"toy", required:true,  options:["wipeable","washable"] },
    { key:"color",          label:"Color",          type:"select", remote:true, group:"clothing", required:true },
    { key:"category",       label:"Category",       type:"select", remote:true, group:"clothing", required:true },
    { key:"clothing_size",  label:"Size",           type:"select", remote:true, group:"clothing", required:true },
    { key:"gender_style",   label:"Gender",         type:"select", group:"clothing", required:false, options:[{value:"boy",label:"Male"},{value:"girl",label:"Female"}] },
    { key:"tier",           label:"Tier",           type:"select", group:"both", required:true,  options:["essentials","elevated","special"] },
    { key:"retail_value",   label:"Retail value",   type:"number", group:"both", required:true,  placeholder:"e.g. 48", step:"0.01", min:"0" },
    { key:"resale_value",   label:"Resale value",   type:"number", group:"both", required:false, noOptTag:true, step:"0.01", min:"0", hint:"Auto-fills for Elevated/Special — editable; Essentials skips it" },
    { key:"condition_grade",label:"Condition grade",type:"select", remote:true, group:"both", required:false },
    { key:"season",         label:"Season",         type:"text",     group:"clothing", required:false, placeholder:"e.g. winter, all-season" },
    { key:"condition_notes",label:"Personal note",  type:"textarea", group:"both", required:false, placeholder:"e.g. really soft fabric, runs a little big" },
    { key:"bin_location",   label:"Bin location",   type:"text",     group:"both", required:true,  placeholder:"where it's stored" },
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
  var resaleTouched = false;   // resale auto-fill override latch; a tier change resets it
  var gradedForSku = "";       // SKU the current carry-forward data belongs to (drift guard)
  var awaitingPhotoFocus = false;  // photos-first guided entry: when armed, the first
                                   // completed photo drops the cursor into Color (one-shot)

  /* ---- MANAGE-ITEM (edit existing) STATE ------------------------------- */
  var EDIT_MODE   = false;   // true once an existing item is loaded for editing
  var loadedRecord = null;   // the inventory row returned by inventory-edit "load"
  var editLocked  = false;   // true when the loaded row is reserved/claimed

  var root = document.getElementById("ks-list-app");
  if (!root) { console.error("[listing] #ks-list-app not found"); return; }

  /* ---- BUILD UI -------------------------------------------------------- */
  function fieldHtml(f) {
    var reqMark = f.required ? '<span class="ksl-req">*</span>'
                             : (f.noOptTag ? '' : ' <span class="ksl-opt">(optional)</span>');
    var inner;
    if (f.type === "select") {
      if (f.remote) {
        inner = '<select data-key="' + f.key + '"><option value="">Loading…</option></select>';
      } else {
        var opts = '<option value="">Select…</option>' +
          f.options.map(function (o) {
            var val = (o && typeof o === "object") ? o.value : o;
            var lab = (o && typeof o === "object") ? o.label : o;
            return '<option value="' + val + '">' + lab + '</option>';
          }).join("");
        inner = '<select data-key="' + f.key + '">' + opts + '</select>';
      }
    } else if (f.type === "textarea") {
      inner = '<textarea data-key="' + f.key + '" placeholder="' + (f.placeholder || "") + '"></textarea>';
    } else if (f.type === "number") {
      inner = '<input type="number" inputmode="decimal" data-key="' + f.key + '" placeholder="' + (f.placeholder || "") +
              '"' + (f.step ? ' step="' + f.step + '"' : "") + (f.min ? ' min="' + f.min + '"' : "") + '>';
    } else if (f.type === "pills") {
      var pbtns = f.options.map(function (o) {
        var pv = (o && typeof o === "object") ? o.value : o;
        var pl = (o && typeof o === "object") ? o.label : o;
        return '<button type="button" class="ksl-pill" data-pill="' + f.key + '" data-val="' + pv + '">' + pl + '</button>';
      }).join("");
      inner = '<input type="hidden" data-key="' + f.key + '"><div class="ksl-pills">' + pbtns + '</div>';
    } else if (f.type === "multipills") {
      // remote, multi-select: pills injected after the option_lists fetch.
      // hidden value = active pills joined by ", " in canonical sort order.
      inner = '<input type="hidden" data-key="' + f.key + '">' +
              '<div class="ksl-pills" data-pillbox="' + f.key + '">' +
              '<span class="ksl-opt">Loading…</span></div>';
    } else {
      var extra = (f.key === "sku")
        ? ' autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"'
        : (f.key === "brand" ? ' autocomplete="off"' : '');
      var inputHtml = '<input type="text" data-key="' + f.key + '"' + extra + ' placeholder="' + (f.placeholder || "") + '">';
      inner = (f.key === "brand")
        ? '<div class="ksl-brand-wrap">' + inputHtml + '<div class="ksl-brand-results" data-brand-results></div></div>'
        : inputHtml;
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
        '<input type="number" inputmode="numeric" id="ksl-set-count" min="2" step="1" placeholder="e.g. 2">' +
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

    '<div class="ksl-manage" id="ksl-manage">' +
      '<input type="text" id="ksl-mng-sku" placeholder="KS-00000" ' +
        'autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">' +
      '<button type="button" class="ksl-manage-btn" id="ksl-mng-load">Load</button>' +
      '<a href="#" class="ksl-manage-new ksl-hidden" id="ksl-mng-new">\u2190 New listing</a>' +
      '<div class="ksl-manage-hint" id="ksl-manage-hint">Edit an existing item\u2019s photos, status, bin, or featured flag.</div>' +
    '</div>' +
    '<div class="ksl-restore ksl-hidden" id="ksl-restore">' +
      '<span>You have an unsaved draft from before.</span>' +
      '<span><button id="ksl-restore-no">Discard</button> ' +
      '<button class="ksl-restore-yes" id="ksl-restore-yes">Restore</button></span>' +
    '</div>' +

    '<div class="ksl-toggle">' +
      '<button type="button" data-type="clothing" class="is-active">Clothing</button>' +
      '<button type="button" data-type="toy">Toy</button>' +
    '</div>' +

    '<div class="ksl-card" data-photos-card><h3>Photos &amp; video</h3>' +
      '<p class="ksl-media-help"><strong>Start here \u2014 upload all photos.</strong> Up to 3 photos + 1 short video. Tap a slot, or add them all at once.</p>' +
      '<button type="button" class="ksl-batch-btn" data-batch-add>Add all at once</button>' +
      '<input type="file" accept="image/*,video/*" multiple class="ksl-hidden" data-batchinput>' +
      '<div class="ksl-slot-grid">' +
      PHOTO_SLOTS.map(function (s) {
          return '<div class="ksl-slot" data-slot="' + s.key + '">' +
                   '<div class="ksl-drop ksl-slot-drop" data-slotdrop="' + s.key + '">' +
                     '<strong>' + s.label + '</strong>' +
                     (s.hint ? ' <span class="ksl-opt">' + s.hint + '</span>' : '') +
                   '</div>' +
                   '<input type="file" accept="image/*" class="ksl-hidden" data-slotinput="' + s.key + '">' +
                   '<div class="ksl-thumbs" data-slotthumb="' + s.key + '"></div>' +
                 '</div>';
        }).join("") +
        '<div class="ksl-slot" data-slot="video">' +
          '<div class="ksl-drop ksl-slot-drop" data-slotdrop="video">' +
            '<strong>Video</strong> <span class="ksl-opt">≤25 MB · ~15s</span>' +
          '</div>' +
          '<input type="file" accept="video/*" class="ksl-hidden" data-slotinput="video">' +
          '<div class="ksl-thumbs" data-slotthumb="video"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="ksl-card ksl-details"><h3>Details</h3>' + detailsHtml +
    '</div>' +

    '<div class="ksl-card ksl-edit-panel ksl-hidden" id="ksl-edit-panel">' +
      '<div class="ksl-edit-ref" id="ksl-edit-ref"></div>' +
      '<div class="ksl-edit-lock ksl-hidden" id="ksl-edit-lock"></div>' +
      '<h3>Edit</h3>' +
      '<div class="ksl-field">' +
        '<label class="ksl-label">Item name</label>' +
        '<input type="text" id="ksl-edit-name" placeholder="item name">' +
      '</div>' +
      '<div class="ksl-field">' +
        '<label class="ksl-label">Description</label>' +
        '<textarea id="ksl-edit-desc" rows="4" placeholder="member-facing description"></textarea>' +
      '</div>' +
      '<div class="ksl-field">' +
        '<label class="ksl-label">Status</label>' +
        '<select id="ksl-edit-status">' +
          '<option value="available">Available</option>' +
          '<option value="retired">Un-list</option>' +
        '</select>' +
      '</div>' +
      '<div class="ksl-field">' +
        '<label class="ksl-label">Bin location</label>' +
        '<input type="text" id="ksl-edit-bin" placeholder="where it\u2019s stored">' +
      '</div>' +
      '<div class="ksl-field">' +
        '<label class="ksl-check"><input type="checkbox" id="ksl-edit-featured"> ' +
        '<span class="ksl-label" style="margin:0">Featured</span></label>' +
      '</div>' +
      '<button type="button" class="ksl-submit" id="ksl-edit-save">Save changes</button>' +
      '<button type="button" class="ksl-danger" id="ksl-edit-delete">Delete item</button>' +
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
    '</div>' +

    '<div class="ksl-review ksl-hidden" id="ksl-success">' +
      '<div class="ksl-review-panel">' +
        '<h3 class="ksl-review-title ksl-success-title">\u2713 Listed</h3>' +
        '<div class="ksl-success-body" id="ksl-success-body"></div>' +
        '<div class="ksl-review-actions">' +
          '<button type="button" class="ksl-review-back" id="ksl-success-view">View live on browse</button>' +
          '<button type="button" class="ksl-submit ksl-review-confirm" id="ksl-success-again">List another</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="ksl-review ksl-hidden" id="ksl-dupe">' +
      '<div class="ksl-review-panel">' +
        '<h3 class="ksl-review-title">SKU already in use</h3>' +
        '<div class="ksl-success-body" id="ksl-dupe-body"></div>' +
        '<div class="ksl-review-actions" style="flex-wrap:wrap;gap:8px">' +
          '<button type="button" class="ksl-review-back" id="ksl-dupe-cancel">Cancel</button>' +
          '<button type="button" class="ksl-review-back" id="ksl-dupe-edit">Edit that item</button>' +
          '<button type="button" class="ksl-submit ksl-review-confirm" id="ksl-dupe-newnum">Use a different number</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* ---- INJECTED CSS for the Manage-Item UI ----------------------------- */
  /* Self-contained (browse-tool pattern). Reuses existing .ksl-card /
     .ksl-field / .ksl-submit styling from the page; only the bespoke
     manage-bar + reference-block + make-primary bits need rules. */
  (function injectEditCss() {
    if (document.getElementById("ksl-edit-css")) return;
    var s = document.createElement("style");
    s.id = "ksl-edit-css";
    s.textContent =
      "#ks-list-app .ksl-manage{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 20px;padding:14px 16px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.03)}" +
      "#ks-list-app .ksl-manage input{flex:0 0 150px;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.22);background:transparent;color:inherit;font:inherit;text-transform:uppercase}" +
      "#ks-list-app .ksl-manage-btn{padding:9px 18px;border:0;border-radius:8px;background:#d24f28;color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-manage-btn:disabled{opacity:.6;cursor:default}" +
      "#ks-list-app .ksl-manage-new{font-size:.85rem;color:#d24f28;text-decoration:none;cursor:pointer}" +
      "#ks-list-app .ksl-manage-hint{flex:1 1 100%;font-size:.82rem;opacity:.6}" +
      "#ks-list-app .ksl-edit-ref{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12)}" +
      "#ks-list-app .ksl-ref-name{font-size:1.05rem;font-weight:600;margin-bottom:10px}" +
      "#ks-list-app .ksl-ref-grid{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:.86rem}" +
      "#ks-list-app .ksl-ref-k{opacity:.5;text-transform:uppercase;letter-spacing:.04em;font-size:.72rem;align-self:center}" +
      "#ks-list-app .ksl-ref-v{opacity:.92}" +
      "#ks-list-app .ksl-edit-lock{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:rgba(210,79,40,.14);border:1px solid rgba(210,79,40,.55);font-size:.86rem}" +
      "#ks-list-app .ksl-danger{display:block;width:100%;margin-top:10px;padding:11px 18px;border:1px solid rgba(192,57,43,.6);border-radius:9px;background:transparent;color:#e06a5a;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-danger:hover{background:#c0392b;border-color:#c0392b;color:#fff}" +
      "#ks-list-app .ksl-danger:disabled{opacity:.5;cursor:default}" +
      "#ks-list-app #ksl-edit-desc{min-height:92px;resize:vertical}" +
      "#ks-list-app .ksl-slot{position:relative}" +
      "#ks-list-app .ksl-makeprimary{position:absolute;left:6px;right:6px;bottom:6px;z-index:6;margin:0;padding:5px 8px;border:1px solid rgba(255,255,255,.35);border-radius:7px;background:rgba(20,18,16,.82);color:#fff;font:inherit;font-size:.72rem;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-makeprimary:hover{border-color:#d24f28;background:rgba(210,79,40,.9)}" +
      "#ks-list-app .ksl-field.ksl-cued > .ksl-label::after{content:'from grading';margin-left:8px;padding:1px 7px;border-radius:999px;border:1px solid rgba(210,79,40,.4);background:rgba(210,79,40,.12);color:#e07a52;font-size:.64rem;font-weight:600;letter-spacing:.02em;text-transform:none;vertical-align:middle;white-space:nowrap}" +
      "#ks-list-app .ksl-field.ksl-cued > .ksl-label{display:flex;align-items:center;flex-wrap:wrap;gap:2px 0}" +
      "#ks-list-app .ksl-brand-wrap{position:relative}" +
      "#ks-list-app .ksl-brand-results{display:none;position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:60;max-height:240px;overflow-y:auto;background:#1f1f1f;border:1px solid rgba(255,255,255,.18);border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.45)}" +
      "#ks-list-app .ksl-brand-results.is-open{display:block}" +
      "#ks-list-app .ksl-brand-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;cursor:pointer;font-size:.9rem}" +
      "#ks-list-app .ksl-brand-opt:hover{background:rgba(210,79,40,.18)}" +
      "#ks-list-app .ksl-brand-tier{font-size:.66rem;opacity:.5;text-transform:uppercase;letter-spacing:.05em}" +
      "#ks-list-app .ksl-brand-empty{padding:9px 12px;font-size:.82rem;opacity:.5}" +
      "#ks-list-app .ksl-brand-add{padding:10px 12px;cursor:pointer;font-size:.88rem;font-weight:600;color:#d24f28;border-top:1px solid rgba(255,255,255,.12)}" +
      "#ks-list-app .ksl-brand-add:hover{background:rgba(210,79,40,.12)}" +
      "#ks-list-app .ksl-brand-modal{display:none;position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:20px}" +
      "#ks-list-app .ksl-brand-modal.is-open{display:flex}" +
      "#ks-list-app .ksl-brand-card{width:100%;max-width:420px;background:#1f1f1f;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:22px}" +
      "#ks-list-app .ksl-brand-card h3{margin:0 0 4px;font-size:1.05rem}" +
      "#ks-list-app .ksl-bm-sub{margin:0 0 16px;font-size:.85rem;opacity:.65}" +
      "#ks-list-app .ksl-bm-name{font-weight:600}" +
      "#ks-list-app .ksl-bm-label{margin:0 0 8px;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;opacity:.55}" +
      "#ks-list-app .ksl-bm-tiers{display:flex;gap:8px;margin:0 0 16px}" +
      "#ks-list-app .ksl-bm-tier{flex:1;padding:10px 6px;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:.86rem;cursor:pointer;text-transform:capitalize}" +
      "#ks-list-app .ksl-bm-tier.is-active{border-color:#d24f28;background:rgba(210,79,40,.18);color:#fff;font-weight:600}" +
      "#ks-list-app .ksl-bm-warn{margin:0 0 18px;font-size:.78rem;opacity:.55}" +
      "#ks-list-app .ksl-bm-actions{display:flex;gap:10px;justify-content:flex-end}" +
      "#ks-list-app .ksl-bm-cancel{padding:9px 16px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}" +
      "#ks-list-app .ksl-bm-confirm{padding:9px 18px;border:0;border-radius:8px;background:#d24f28;color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-bm-confirm:disabled{opacity:.6;cursor:default}" +
      "#ks-list-app .ksl-field[data-field='resale_value'] input{border-left:3px solid #d24f28;background:rgba(210,79,40,.06)}" +
      "#ks-list-app .ksl-field[data-field='resale_value'] > .ksl-label::after{content:'computed';margin-left:8px;padding:1px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);color:#c2bcb4;font-size:.62rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle;white-space:nowrap}" +
      "#ks-list-app .ksl-batch-btn{display:block;width:100%;margin:0 0 12px;padding:11px 14px;border:1px dashed rgba(210,79,40,.55);border-radius:10px;background:rgba(210,79,40,.06);color:#e07a52;font:inherit;font-weight:600;font-size:.9rem;cursor:pointer}" +
      "#ks-list-app .ksl-batch-btn:hover{border-color:#d24f28;background:rgba(210,79,40,.12);color:#fff}" +
      "#ks-list-app .ksl-success-title{color:#54935f}" +
      "#ks-list-app .ksl-success-body{display:flex;align-items:center;gap:14px;margin:0 0 18px}" +
      "#ks-list-app .ksl-success-thumb{flex:0 0 64px;width:64px;height:85px;object-fit:cover;border-radius:8px;background:rgba(255,255,255,.05)}" +
      "#ks-list-app .ksl-success-meta{min-width:0}" +
      "#ks-list-app .ksl-success-sku{font-weight:600;font-size:1rem}" +
      "#ks-list-app .ksl-success-name{font-size:.86rem;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
    document.head.appendChild(s);
  })();

  /* element refs */
  var $ = function (id) { return document.getElementById(id); };
  var setChk = $("ksl-set"), setCountWrap = $("ksl-set-count-wrap"), setCount = $("ksl-set-count");
  var submitBtn = $("ksl-submit"), toast = $("ksl-toast");
  var reviewEl = $("ksl-review"), reviewBody = $("ksl-review-body");
  var reviewBack = $("ksl-review-back"), reviewConfirm = $("ksl-review-confirm");
  var successEl = $("ksl-success"), successBody = $("ksl-success-body");
  var successView = $("ksl-success-view"), successAgain = $("ksl-success-again");
  var lastListedSku = "";

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
    // resale_value is group "both", so the data-group pass above just made it
    // visible regardless of tier — re-assert the tier gate as the last word.
    applyResaleVisibility();
    // warm the pre-approved brand list for this type (cached per type in
    // BRANDS_BY_TYPE): clothing fetches at init, toy lazily on first switch.
    loadBrands(itemType);
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
      // Re-fill the SKU after a manual type switch (clearItem reset it to "KS-").
      // With the grading queue empty this returns the next fresh sequential label
      // and pulls no graded data, so it never flips the type back. When grading
      // is live and a graded item is WAITING, this would pull that item and flip
      // back -> the force-fresh upgrade is banked for grading-go-live.
      prefillNextSku();
      armPhotoFirst();
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
    lastLookup = null;
    gradedForSku = "";
    setAgeHint("");
    root.querySelectorAll(".ksl-pill.is-active").forEach(function (b) { b.classList.remove("is-active"); });
    setChk.checked = false; setCountWrap.classList.add("ksl-hidden"); setCount.value = "";
    slots = { front:null, back:null, detail:null }; video = null; renderAllSlots();
    clearErrors();
    clearAllCues();
    // reset the resale latch + re-assert the tier gate (tier is now blank -> hidden)
    resaleTouched = false;
    applyResaleVisibility();
    closeBrandSuggest();
    defaultCondition();        // next item starts on the "great" default
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
    if (pill.getAttribute("data-multi") === "1") {
      // multi-select: toggle this pill, rebuild value from all active (DOM order = canonical)
      pill.classList.toggle("is-active");
      if (inp) {
        var vals = [];
        root.querySelectorAll('.ksl-pill[data-pill="' + key + '"]').forEach(function (b) {
          if (b.classList.contains("is-active")) vals.push(b.getAttribute("data-val"));
        });
        inp.value = vals.join(", ");
      }
    } else {
      // single-select (radio behavior)
      if (inp) inp.value = pill.getAttribute("data-val");
      root.querySelectorAll('.ksl-pill[data-pill="' + key + '"]').forEach(function (b) {
        b.classList.toggle("is-active", b === pill);
      });
    }
    var f = pill.closest(".ksl-field"); if (f) f.classList.remove("has-error");
    saveDraft();
  });
  function reflectPills() {
    root.querySelectorAll('.ksl-field input[type="hidden"][data-key]').forEach(function (inp) {
      var key = inp.getAttribute("data-key"), val = inp.value;
      var pills = root.querySelectorAll('.ksl-pill[data-pill="' + key + '"]');
      if (!pills.length) return;
      if (pills[0].getAttribute("data-multi") === "1") {
        var set = (val || "").split(", ").filter(Boolean);
        pills.forEach(function (b) {
          b.classList.toggle("is-active", set.indexOf(b.getAttribute("data-val")) !== -1);
        });
      } else {
        pills.forEach(function (b) {
          b.classList.toggle("is-active", !!val && b.getAttribute("data-val") === val);
        });
      }
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
      ? '<video src="' + (rec.url || rec.objUrl) + '#t=0.1" muted playsinline preload="metadata"></video>'
      : '<img src="' + rec.objUrl + '" alt="">';
    var isPrimary = (key === "front" && rec.status === "done");
    var badge = isPrimary ? '<span class="ksl-badge">PRIMARY</span>' : '';
    var mkPrimary = (EDIT_MODE && (key === "back" || key === "detail") && rec.status === "done")
      ? '<button type="button" class="ksl-makeprimary" data-makeprimary="' + key + '">Make primary</button>'
      : '';
    thumb.innerHTML =
      '<div class="ksl-thumb' + (isPrimary ? ' is-primary' : '') +
        (rec.status === "error" ? ' is-error' : '') + '">' +
        media + badge + state +
        '<button class="ksl-rm" data-rmslot="' + key + '" aria-label="remove">×</button>' +
      '</div>' + mkPrimary;
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
      .then(function (url) { if (slots[key] === rec) { rec.url = url; rec.status = "done"; renderSlot(key); saveDraft(); if (key === "front") focusColorAfterPhotos(); } })
      .catch(function (e) { if (slots[key] === rec) { rec.status = "error"; renderSlot(key); } console.error("[upload photo]", e); });
  }

  /* ---- PHOTOS-FIRST GUIDED ENTRY --------------------------------------- */
  /* On a fresh form (open or "List another"), nudge the operator to upload
     photos first (scroll + a transient gold ring on the Photos card) and arm a
     one-shot so the cursor drops into Color the moment the first (front) photo
     finishes uploading. Replaces the old focus-on-SKU-prefill behavior. Pure JS
     / inline style (no Webflow CSS edit); ring = approved palette gold #e0a93f.
     Toys have no Color field -> the focus is a quiet no-op. */
  function nudgePhotos() {
    var card = root.querySelector("[data-photos-card]");
    if (!card) return;
    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
    var prev = card.style.boxShadow;
    card.style.transition = "box-shadow .25s ease";
    card.style.boxShadow = "0 0 0 3px #e0a93f";
    setTimeout(function () { card.style.boxShadow = prev || ""; }, 2600);
  }
  function focusColorAfterPhotos() {
    if (EDIT_MODE || !awaitingPhotoFocus) return;
    awaitingPhotoFocus = false;                 // one-shot per item
    var ae = document.activeElement;            // never steal focus mid-typing
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== "file") return;
    setTimeout(function () {
      var c = root.querySelector('[data-key="color"]');
      if (c && c.offsetParent !== null) { try { c.focus(); } catch (e) {} }
    }, 50);
  }
  function armPhotoFirst() {
    if (EDIT_MODE) return;                       // edit mode uses the Manage bar
    awaitingPhotoFocus = true;
    nudgePhotos();
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

  /* batch add: one picker fills front/back/detail + video at once. Routes by
     MIME and reuses the per-slot handleSlotFile untouched, so uploads fire in
     parallel and the front=slot0=primary invariant is unchanged. Photos assign
     in selection order starting at Front; the named slots remain the fix-up
     path (tap-to-replace / × / make-primary). */
  (function wireBatchAdd() {
    var btn = root.querySelector("[data-batch-add]");
    var inp = root.querySelector("[data-batchinput]");
    if (!btn || !inp) return;
    btn.addEventListener("click", function () { inp.click(); });
    inp.addEventListener("change", function () {
      var files = inp.files ? Array.prototype.slice.call(inp.files) : [];
      inp.value = "";
      if (!files.length) return;
      var vids = [], pics = [], skipped = 0;
      files.forEach(function (f) {
        if (VIDEO_TYPES.indexOf(f.type) !== -1) vids.push(f);
        else if (PHOTO_TYPES.indexOf(f.type) !== -1) pics.push(f);
        else skipped++;
      });
      if (vids[0]) handleSlotFile("video", vids[0]);
      ["front", "back", "detail"].forEach(function (key, i) {
        if (pics[i]) handleSlotFile(key, pics[i]);
      });
      if (vids.length > 1) showToast("Only the first video was added", true);
      if (pics.length > 3) showToast("Front/Back/Detail filled — extra photos skipped", true);
      if (skipped) showToast(skipped + " file(s) skipped — unsupported type", true);
    });
  })();

  /* delegated: tap an empty slot to add; tap a filled slot to replace; × clears */
  root.addEventListener("click", function (e) {
    /* edit mode: "Make primary" swaps this slot's photo into the Front (=primary)
       slot. Must run BEFORE the thumb-tap logic, which would otherwise open the
       file picker (the button lives inside [data-slotthumb]). */
    var mp = (e.target && e.target.getAttribute) ? e.target.getAttribute("data-makeprimary") : null;
    if (mp) { e.stopPropagation(); makePrimary(mp); return; }
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
      return;
    }
    /* tap a filled slot's image to retake/replace it */
    var th = (e.target && e.target.closest) ? e.target.closest("[data-slotthumb]") : null;
    if (th) {
      var inp2 = root.querySelector('[data-slotinput="' + th.getAttribute("data-slotthumb") + '"]');
      if (inp2) inp2.click();
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
    if (EDIT_MODE) return;   // editing an existing item must not touch the insert draft
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
      // category is now restored -> set the Size vocabulary, then re-apply the
      // saved size (a shoe size only matches once shoe options are present).
      populateSizeOptions();
      var rsize = (d.fields || {})["clothing_size"];
      if (rsize) {
        var szSel = root.querySelector('select[data-key="clothing_size"]');
        if (szSel) szSel.value = rsize;
      }
      setChk.checked = !!d.set; setCountWrap.classList.toggle("ksl-hidden", !d.set);
      setCount.value = d.setCount || "";
      var ps = d.photoSlots || {};
      ["front", "back", "detail"].forEach(function (k) {
        if (ps[k]) slots[k] = { id: uid(), url: ps[k], status: "done", name: "restored", objUrl: ps[k] };
      });
      if (d.videoUrl) video = { id: uid(), url: d.videoUrl, status: "done", name: "restored", objUrl: d.videoUrl };
      renderAllSlots(); reflectPills();
      // re-assert resale tier-gate after a restore (tier value is now in place)
      applyResaleVisibility();
    } catch (e) {}
  }
  root.addEventListener("input", saveDraft);

  // Category drives the Size vocabulary. Fires on user pick AND on auto-populate
  // (setField dispatches a bubbling 'input'), so the size source is correct
  // before a graded shoe size is written into the field.
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-key") === "category") {
      populateSizeOptions();
    }
  });

  // clear the "from grading" cue on a field the operator actually edits.
  // programmatic setField fires isTrusted=false, so carry-forward won't self-clear.
  root.addEventListener("input", function (e) { if (e.isTrusted) clearCueFor(e.target); });
  root.addEventListener("change", function (e) { if (e.isTrusted) clearCueFor(e.target); });
  root.addEventListener("click", function (e) {
    if (e.isTrusted && e.target.closest && e.target.closest("[data-pill]")) clearCueFor(e.target);
  });

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
    // resale required for elevated/special (essentials exempt). Client mirror of
    // the checkout NULL-block guard, so a missing resale fails loud at listing
    // instead of silently blocking the claim later.
    var tierElV = root.querySelector('[data-key="tier"]');
    var tierV = tierElV ? tierElV.value : "";
    if (tierV === "elevated" || tierV === "special") {
      var rvEl = root.querySelector('[data-key="resale_value"]');
      var rvVal = rvEl ? rvEl.value.trim() : "";
      if (!rvVal || isNaN(Number(rvVal))) { bad.push("resale_value"); markError("resale_value"); }
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
    // TYPE BANNER: prominent, color-coded, first thing in the review — so a
    // wrong-type listing (clothing form left on for a toy, or vice versa) is
    // caught at the one glance before Confirm, the autopilot failure point.
    // Inline-styled so it needs no page CSS (pure JS deploy).
    var isToy = (itemType === "toy");
    var bannerBg = isToy ? "rgba(210,79,40,.14)" : "rgba(84,147,95,.14)";
    var bannerBd = isToy ? "rgba(210,79,40,.55)" : "rgba(84,147,95,.55)";
    var bannerInk = isToy ? "#d24f28" : "#54935f";
    var rows = '<div style="margin:0 0 14px;padding:10px 14px;border-radius:10px;' +
                 'background:' + bannerBg + ';border:1px solid ' + bannerBd + ';' +
                 'color:' + bannerInk + ';font-size:1rem;font-weight:700;letter-spacing:.02em;text-align:center">' +
                 'Listing a ' + (isToy ? "TOY" : "CLOTHING") + ' item' +
               '</div>';
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
    // SKU-DRIFT GUARD: graded data was pulled for one SKU, but the SKU field
    // now shows a different label -> the carry-forward data is stale. Block,
    // don't silently list mismatched data (an autopilot-class mistake).
    if (gradedForSku) {
      var curSku = normalizeLabel(skuEl ? skuEl.value : "") || "";
      if (curSku && curSku !== gradedForSku) {
        markError("sku");
        showToast("This data was loaded for " + gradedForSku + " but the SKU is now " + curSku + " — re-check the SKU, or clear and start over.", true);
        return;
      }
    }
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
        showSuccess(res.j.item || { sku: sku });
      } else if (res.j && res.j.code === "duplicate_sku") {
        // SKU collision: the DB UNIQUE constraint refused it. Show the blocking
        // three-out panel (Edit that item / different number / Cancel) instead
        // of a dismissable toast — the autopilot-safe halt.
        showDupePanel(skuEl ? skuEl.value : "");
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
    prefillNextSku();        // next label + graded data ready for the next item
    armPhotoFirst();         // photos-first nudge + re-arm Color-after-photos
  }

  /* ---- DUPLICATE-SKU COLLISION PANEL ----------------------------------- */
  /* Shown when inventory-list refuses a duplicate SKU (the DB UNIQUE constraint
     is the hard floor; this turns the refusal into an actionable, blocking halt
     so an autopilot collision can't be blown past with a toast). Two safe outs +
     cancel; deliberate deletion stays in Manage-Item, not on this fast path. */
  var dupeEl = $("ksl-dupe");
  function showDupePanel(rawSku) {
    var norm = normalizeLabel(rawSku) || rawSku || "this SKU";
    var body = $("ksl-dupe-body");
    if (body) {
      body.innerHTML =
        '<p style="margin:0 0 6px"><strong>' + norm + '</strong> is already listed in inventory.</p>' +
        '<p style="margin:0;opacity:.8;font-size:.9em">Edit the existing item, or get the next free number for this one.</p>';
    }
    if (dupeEl) dupeEl.classList.remove("ksl-hidden");
  }
  (function wireDupe() {
    var cancelBtn = $("ksl-dupe-cancel");
    var editBtn   = $("ksl-dupe-edit");
    var newBtn    = $("ksl-dupe-newnum");
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      if (dupeEl) dupeEl.classList.add("ksl-hidden");
    });
    if (editBtn) editBtn.addEventListener("click", function () {
      if (dupeEl) dupeEl.classList.add("ksl-hidden");
      // route the colliding SKU into the Manage bar + load it for editing
      var norm = normalizeLabel(skuEl ? skuEl.value : "");
      var mng = $("ksl-mng-sku");
      if (mng && norm) mng.value = norm;
      runManageLoad();
    });
    if (newBtn) newBtn.addEventListener("click", function () {
      if (dupeEl) dupeEl.classList.add("ksl-hidden");
      // clear the colliding SKU + fetch the next free label (won't collide)
      if (skuEl) skuEl.value = "KS-";
      lastLookup = null;
      gradedForSku = "";
      prefillNextSku();
      if (skuEl) { try { skuEl.focus(); } catch (e) {} }
    });
  })();

  /* ---- POST-LIST SUCCESS PANEL ----------------------------------------- */
  /* On a successful list, show a confirm panel with a live deep-link to the
     just-listed item on /browse (?sku= opens the overlay) + "List another"
     (the existing resetForm path). Always links to /browse (the All page) so
     any item type resolves in the available set. Client-only; reuses the
     review-modal shell + the proven ?sku= deep-link. */
  function showSuccess(item) {
    lastListedSku = (item && item.sku) ? item.sku : "";
    var img = (item && item.primary_photo_url) ? item.primary_photo_url : "";
    var name = (item && item.item_name) ? item.item_name : "";
    var html = "";
    if (img) html += '<img class="ksl-success-thumb" src="' + esc(img) + '" alt="">';
    html += '<div class="ksl-success-meta">' +
              '<div class="ksl-success-sku">' + esc(lastListedSku) + '</div>' +
              (name ? '<div class="ksl-success-name">' + esc(name) + '</div>' : '') +
            '</div>';
    if (successBody) successBody.innerHTML = html;
    var title = root.querySelector(".ksl-success-title");
    if (title) title.textContent = "\u2713 Listed " + lastListedSku;
    if (successEl) successEl.classList.remove("ksl-hidden");
  }
  if (successView) successView.addEventListener("click", function () {
    if (lastListedSku) window.open("/browse?sku=" + encodeURIComponent(lastListedSku), "_blank");
  });
  if (successAgain) successAgain.addEventListener("click", function () {
    if (successEl) successEl.classList.add("ksl-hidden");
    resetForm();
  });

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

  /* ---- SKU AUTO-ADVANCE (Build F) -------------------------------------- */
  /* On form open (no draft) and after each successful list, fetch the next
     un-listed accepted grading label + the count of labels still waiting from
     the operator-gated intake-lookup edge fn ({action:"next_label"} -> the
     get_next_unlisted RPC). Fill the SKU, then run the existing carry-forward
     lookup so the graded data (brand/tier/retail/size) auto-fills in one motion
     (option A). null label -> SKU stays "KS-" + an "all caught up" note. The
     count + label come from one derived query so they can't drift. */

  // The "N waiting" note lives just under the SKU field; created lazily.
  function skuNoteEl() {
    if (!skuEl) return null;
    var fld = skuEl.closest ? skuEl.closest(".ksl-field") : null;
    if (!fld) return null;
    var el = fld.querySelector(".ksl-sku-note");
    if (!el) {
      el = document.createElement("div");
      el.className = "ksl-sku-note";
      el.style.cssText = "margin-top:6px;font-size:.85em;opacity:.8;";
      fld.appendChild(el);
    }
    return el;
  }
  function setSkuNote(text) {
    var el = skuNoteEl();
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "" : "none";
  }

  function prefillNextSku() {
    if (EDIT_MODE || !skuEl) return;
    getToken().then(function (t) {
      return fetch(FN_LOOKUP, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "next_label" })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!(res.ok && res.j && res.j.ok)) {
        // auth / unexpected: leave "KS-" as-is, no note, allow manual entry
        setSkuNote("");
        console.error("[next_sku]", res);
        return;
      }
      var remaining = (typeof res.j.remaining === "number") ? res.j.remaining : 0;
      var mode = (res.j.mode === "graded" || res.j.mode === "fresh") ? res.j.mode : null;
      if (res.j.label) {
        // only auto-fill if the operator hasn't started typing a SKU themselves
        if (!skuEl.value || skuEl.value === "KS-") {
          skuEl.value = res.j.label;
          if (mode === "graded") {
            // a real graded item is waiting -> pull its carry-forward data
            lastLookup = null;                  // clear the guard so runLookup fires
            runLookup();                        // pulls graded data (option A)
          } else {
            // fresh sequential counter label -> no graded record to pull.
            // mark it "looked up" so a later blur doesn't fire a doomed lookup.
            lastLookup = skuEl.value;
          }
          // (Color focus moved to the photos-first flow: the cursor now drops
          // into Color after the first photo lands via focusColorAfterPhotos,
          // not on SKU prefill.)
        }
        if (mode === "fresh") {
          // counter path: no queue, just the next number to use
          setSkuNote("Next available label");
        } else {
          setSkuNote(remaining + (remaining === 1 ? " item waiting to list" : " items waiting to list"));
        }
      } else {
        // no label at all (both RPCs empty -> brand new system) -> leave "KS-"
        setSkuNote("");
      }
    }).catch(function (e) {
      setSkuNote("");
      console.error("[next_sku]", e);
    });
  }

  /* ---- SKU AUTO-POPULATE FROM GRADING ---------------------------------- */
  /* On blur: normalize the typed label to KS-NNNNN, look up the accepted
     grading record via the operator-gated intake-lookup edge function, and
     pre-fill the carry-forward fields. Toy age now populates the multipills
     from the graded size (token-filtered vs option_lists.toy_age). */
  var lastLookup = null;            // guards against re-firing on unchanged label
  var lookupInFlight = false;

  // ageHint sits under the toy Age-range field; created lazily.
  function ageHintEl() {
    var fld = root.querySelector('.ksl-field[data-field="toy_age_range"]');
    if (!fld) return null;
    var el = fld.querySelector(".ksl-age-hint");
    if (!el) {
      el = document.createElement("div");
      el.className = "ksl-age-hint";
      el.style.cssText = "margin-top:6px;font-size:.85em;opacity:.75;";
      fld.appendChild(el);
    }
    return el;
  }
  function setAgeHint(text) {
    var el = ageHintEl();
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "" : "none";
  }

  // Normalize "4", "ks-45", "KS-00045" -> "KS-00045". Returns null if no digits.
  function normalizeLabel(raw) {
    var digits = (raw || "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length > 5) digits = digits.slice(-5);  // guard: never exceed 5
    return "KS-" + digits.padStart(5, "0");
  }

  // write a field value and fire 'input' so autoName + saveDraft react
  function setField(key, value) {
    var el = root.querySelector('[data-key="' + key + '"]');
    if (!el) return;
    el.value = (value === null || value === undefined) ? "" : String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---- "from grading" cue: faint tag marking a carry-forward-filled field,
  //      auto-cleared when the operator actually edits that field.
  function cueField(key) {
    var f = root.querySelector('.ksl-field[data-field="' + key + '"]');
    if (f) f.classList.add("ksl-cued");
  }
  function clearAllCues() {
    root.querySelectorAll(".ksl-field.ksl-cued").forEach(function (f) {
      f.classList.remove("ksl-cued");
    });
  }
  function clearCueFor(el) {
    var f = el && el.closest ? el.closest(".ksl-field") : null;
    if (f) f.classList.remove("ksl-cued");
  }
  function fieldHasValue(key) {
    var e = root.querySelector('[data-key="' + key + '"]');
    return !!(e && String(e.value).trim());
  }

  /* ---- BRAND AUTOCOMPLETE + ADD-NEW ------------------------------------ */
  /* Dropdown of pre-approved brands (brand-manage edge fn, operator-gated) plus
     a permanent add-new modal. For bulk-listing ungraded items where the SKU
     carry-forward doesn't apply. Read+write both route through the gated fn
     because the brands table is sealed (not anon-readable). Closes the §3
     free-type gap for the manual-entry path; carry-forward stays untouched
     (suggest render is gated on e.isTrusted so programmatic setField is quiet). */
  var BRANDS_BY_TYPE = {};       // { clothing:[{brand_name,default_tier}], toy:[...] }
  var brandMatches = [];         // the rows currently rendered in the dropdown
  function escBrand(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function brandInputEl()   { return root.querySelector('input[data-key="brand"]'); }
  function brandResultsEl() { return root.querySelector("[data-brand-results]"); }

  function loadBrands(type) {
    if (Array.isArray(BRANDS_BY_TYPE[type])) return Promise.resolve(BRANDS_BY_TYPE[type]);
    BRANDS_BY_TYPE[type] = [];   // in-flight marker (prevents a double fetch)
    return getToken().then(function (t) {
      return fetch(FN_BRAND, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "list", item_type: type })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      var list = (d && d.ok && Array.isArray(d.brands)) ? d.brands : [];
      BRANDS_BY_TYPE[type] = list;
      return list;
    }).catch(function () {
      delete BRANDS_BY_TYPE[type];   // let a later call retry; free-type still works
      return [];
    });
  }

  function renderBrandSuggest() {
    var inp = brandInputEl(), box = brandResultsEl();
    if (!inp || !box) return;
    var q = (inp.value || "").trim();
    var ql = q.toLowerCase();
    var list = BRANDS_BY_TYPE[itemType] || [];
    var matches = q
      ? list.filter(function (b) { return (b.brand_name || "").toLowerCase().indexOf(ql) !== -1; })
      : list.slice();
    matches = matches.slice(0, 30);   // keep a 90+ row list usable
    brandMatches = matches;
    var hasExact = !!q && list.some(function (b) {
      return (b.brand_name || "").toLowerCase() === ql;
    });
    var html = matches.map(function (b, i) {
      var tier = b.default_tier
        ? '<span class="ksl-brand-tier">' + escBrand(b.default_tier) + '</span>' : "";
      return '<div class="ksl-brand-opt" data-brand-idx="' + i + '">' +
               escBrand(b.brand_name) + tier + '</div>';
    }).join("");
    if (!matches.length && q) html = '<div class="ksl-brand-empty">No match in your list</div>';
    if (q && !hasExact) {
      html += '<div class="ksl-brand-add" data-brand-add="1">+ Add &ldquo;' + escBrand(q) + '&rdquo;</div>';
    }
    if (!html) { closeBrandSuggest(); return; }
    box.innerHTML = html;
    box.classList.add("is-open");
  }
  function closeBrandSuggest() {
    var box = brandResultsEl();
    if (box) { box.classList.remove("is-open"); box.innerHTML = ""; }
    brandMatches = [];
  }
  function pickBrand(name) {
    setField("brand", name);             // value + bubbling input -> autoName composes
    var inp = brandInputEl();
    if (inp) clearCueFor(inp);           // a deliberate pick drops any "from grading" tag
    closeBrandSuggest();
  }

  /* add-new modal (built once, lazily) */
  var brandModal = null, brandModalName = "", brandModalTier = "essentials";
  function paintBrandModalTiers() {
    if (!brandModal) return;
    brandModal.querySelectorAll("[data-bm-tier]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-bm-tier") === brandModalTier);
    });
  }
  function ensureBrandModal() {
    if (brandModal) return brandModal;
    var m = document.createElement("div");
    m.className = "ksl-brand-modal";
    m.innerHTML =
      '<div class="ksl-brand-card">' +
        '<h3>Add a brand</h3>' +
        '<p class="ksl-bm-sub">Adding <span class="ksl-bm-name"></span> to your permanent brand list.</p>' +
        '<p class="ksl-bm-label">Default tier</p>' +
        '<div class="ksl-bm-tiers">' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="essentials">essentials</button>' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="elevated">elevated</button>' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="special">special</button>' +
        '</div>' +
        '<p class="ksl-bm-warn">Saves permanently \u2014 appears for every future listing.</p>' +
        '<div class="ksl-bm-actions">' +
          '<button type="button" class="ksl-bm-cancel">Cancel</button>' +
          '<button type="button" class="ksl-bm-confirm">Add brand</button>' +
        '</div>' +
      '</div>';
    root.appendChild(m);
    m.querySelectorAll("[data-bm-tier]").forEach(function (b) {
      b.addEventListener("click", function () {
        brandModalTier = b.getAttribute("data-bm-tier"); paintBrandModalTiers();
      });
    });
    m.querySelector(".ksl-bm-cancel").addEventListener("click", closeBrandModal);
    m.querySelector(".ksl-bm-confirm").addEventListener("click", submitBrandAdd);
    m.addEventListener("mousedown", function (e) { if (e.target === m) closeBrandModal(); }); // backdrop
    brandModal = m;
    return m;
  }
  function openBrandModal(name) {
    name = (name || "").trim();
    if (!name) return;
    ensureBrandModal();
    brandModalName = name;
    brandModal.querySelector(".ksl-bm-name").textContent = "\u201c" + name + "\u201d";
    var tEl = root.querySelector('[data-key="tier"]');
    var tv = tEl && tEl.value;          // prefill tier from the item; fall back to essentials
    brandModalTier = (tv === "essentials" || tv === "elevated" || tv === "special") ? tv : "essentials";
    paintBrandModalTiers();
    var cf = brandModal.querySelector(".ksl-bm-confirm");
    cf.disabled = false; cf.textContent = "Add brand";
    brandModal.classList.add("is-open");
    closeBrandSuggest();
  }
  function closeBrandModal() { if (brandModal) brandModal.classList.remove("is-open"); }
  function submitBrandAdd() {
    var cf = brandModal.querySelector(".ksl-bm-confirm");
    var name = brandModalName, type = itemType, tier = brandModalTier;
    cf.disabled = true; cf.textContent = "Adding\u2026";
    getToken().then(function (t) {
      return fetch(FN_BRAND, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "add", brand_name: name, item_type: type, default_tier: tier })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) {
        if (!Array.isArray(BRANDS_BY_TYPE[type])) BRANDS_BY_TYPE[type] = [];
        BRANDS_BY_TYPE[type].push({ brand_name: name, default_tier: tier });
        pickBrand(name); closeBrandModal();
        showToast("Added \u201c" + name + "\u201d to your brand list");
      } else if (d && d.reason === "exists") {
        pickBrand(name); closeBrandModal();
        showToast("Already in your list \u2014 selected it");
        delete BRANDS_BY_TYPE[type]; loadBrands(type);   // refresh canonical row
      } else {
        cf.disabled = false; cf.textContent = "Add brand";
        showToast("Couldn\u2019t add that brand \u2014 try again", true);
      }
    }).catch(function () {
      cf.disabled = false; cf.textContent = "Add brand";
      showToast("Network error adding brand \u2014 try again", true);
    });
  }

  /* brand field wiring: suggest on trusted typing / focus, pick + add on click,
     Esc/Enter, and close on an outside mousedown. */
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-key") === "brand" && e.isTrusted) {
      renderBrandSuggest();
    }
  });
  root.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-key") === "brand") renderBrandSuggest();
  });
  root.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute("data-key") !== "brand") return;
    if (e.key === "Escape") { closeBrandSuggest(); return; }
    var box = brandResultsEl();
    if (!box || !box.classList.contains("is-open")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (brandMatches.length) pickBrand(brandMatches[0].brand_name);
      else openBrandModal((t.value || "").trim());
    }
  });
  root.addEventListener("click", function (e) {
    var opt = e.target.closest ? e.target.closest(".ksl-brand-opt") : null;
    if (opt && root.contains(opt)) {
      var b = brandMatches[parseInt(opt.getAttribute("data-brand-idx"), 10)];
      if (b) pickBrand(b.brand_name);
      return;
    }
    var add = e.target.closest ? e.target.closest("[data-brand-add]") : null;
    if (add && root.contains(add)) {
      var inp = brandInputEl();
      openBrandModal((inp && inp.value || "").trim());
    }
  });
  document.addEventListener("mousedown", function (e) {
    var box = brandResultsEl();
    if (!box || !box.classList.contains("is-open")) return;
    var inWrap = e.target.closest ? e.target.closest(".ksl-brand-wrap") : null;
    if (!inWrap) closeBrandSuggest();
  });

  /* ---- RESALE VALUE AUTO-FILL ------------------------------------------ */
  /* resale = retail x tierPct x conditionFactor, written into the (editable)
     resale_value field. Fires on tier/retail/condition input — which includes
     the SKU-lookup carry-forward, since setField dispatches a bubbling 'input'.
     Essentials is exempt (field hidden + cleared -> sent as NULL). A blank/
     unknown condition_grade falls back to like-new (1.00): the conservative
     no-discount default, never above resale. Operator can hand-edit to override
     (resaleTouched latch); a TIER change resets the latch and recomputes fresh,
     since a tier switch means the pricing basis changed. */
  function computeResale() {
    if (resaleTouched) return;                 // operator override wins
    var resaleEl = root.querySelector('[data-key="resale_value"]');
    if (!resaleEl) return;
    var tierEl = root.querySelector('[data-key="tier"]');
    var tier = tierEl ? tierEl.value : "";
    if (tier !== "elevated" && tier !== "special") return;   // essentials/unset: visibility handler clears
    var pct = RESALE_CONFIG.tierPct[tier];
    var retailEl = root.querySelector('[data-key="retail_value"]');
    var retail = retailEl ? Number(retailEl.value) : NaN;
    if (!pct || !(retail > 0)) { resaleEl.value = ""; return; }   // no valid retail yet -> leave blank
    var condEl = root.querySelector('[data-key="condition_grade"]');
    var grade = condEl ? condEl.value : "";
    var factor = RESALE_CONFIG.condition[grade];
    if (factor === undefined) factor = 1.00;   // blank/unknown grade -> like-new (no discount)
    var resale = Math.round(retail * pct * factor * 100) / 100;
    resaleEl.value = resale.toFixed(2);
    saveDraft();
  }

  function applyResaleVisibility() {
    var fld = root.querySelector('.ksl-field[data-field="resale_value"]');
    if (!fld) return;
    var tierEl = root.querySelector('[data-key="tier"]');
    var tier = tierEl ? tierEl.value : "";
    var resaleEl = root.querySelector('[data-key="resale_value"]');
    if (tier === "elevated" || tier === "special") {
      fld.classList.remove("ksl-hidden");
      computeResale();
    } else {
      // essentials or unset -> hide, clear, reset latch (resale stays NULL)
      fld.classList.add("ksl-hidden");
      if (resaleEl) resaleEl.value = "";
      resaleTouched = false;
    }
  }

  function onTierInput() {
    resaleTouched = false;       // tier change wins: recompute fresh at the new basis
    applyResaleVisibility();     // show/hide + recompute
  }

  (function wireResale() {
    var tierEl = root.querySelector('[data-key="tier"]');
    if (tierEl) tierEl.addEventListener("input", onTierInput);
    ["retail_value", "condition_grade"].forEach(function (k) {
      var el = root.querySelector('[data-key="' + k + '"]');
      if (el) el.addEventListener("input", computeResale);
    });
    var resaleEl = root.querySelector('[data-key="resale_value"]');
    if (resaleEl) resaleEl.addEventListener("input", function (e) {
      if (e.isTrusted) resaleTouched = true;   // operator hand-edit latches the override
    });
  })();

  function applyRecord(rec) {
    // 1. item type FIRST, then applyType(), so the correct group is visible
    //    before we write the size field (clothing_size vs toy_age_range).
    var t = (rec.item_type === "toy") ? "toy" : "clothing";
    if (t !== itemType) { itemType = t; applyType(); }

    // SKU-DRIFT GUARD: remember which SKU this carry-forward data belongs to.
    // If the operator later changes the SKU without re-looking-up, submit blocks
    // (stale graded data under a different label = an autopilot mismatch).
    gradedForSku = normalizeLabel(skuEl ? skuEl.value : "") || "";

    // 2. carry-forward fields (overwrite; the label is the source of truth).
    //    Re-cue from scratch so a fresh lookup never inherits a stale tag.
    clearAllCues();
    setField("brand", rec.brand);
    if (rec.brand) cueField("brand");
    setField("tier", rec.tier);
    if (rec.tier) cueField("tier");
    if (rec.retail_value !== null && rec.retail_value !== undefined) {
      setField("retail_value", rec.retail_value);
      cueField("retail_value");
    }

    if (itemType === "clothing") {
      setAgeHint("");
      if (rec.category !== null && rec.category !== undefined) {
        setField("category", rec.category);
        if (fieldHasValue("category")) cueField("category");
      }
      if (rec.size !== null && rec.size !== undefined) {
        setField("clothing_size", rec.size);
        if (fieldHasValue("clothing_size")) cueField("clothing_size");
      }
    } else {
      // toy: populate the age multipills from the graded size. Filter to valid
      // option_lists.toy_age tokens so a non-canonical graded string can never
      // reach the submit value (safe-by-construction: a mismatch lights no pills
      // and falls back to manual pick + hint).
      var validAges = (OPTION_LISTS["toy_age"] || []).map(function (r) { return r.value; });
      var pickedAges = String(rec.size || "").split(", ")
                         .filter(function (v) { return validAges.indexOf(v) !== -1; });
      setField("toy_age_range", pickedAges.join(", "));
      reflectPills();
      if (pickedAges.length) cueField("toy_age_range");
      setAgeHint(rec.size && !pickedAges.length
        ? "Graded as: " + rec.size + " — pick the closest match"
        : "");
    }
  }

  function runLookup() {
    if (EDIT_MODE) return;   // edit mode uses the Manage bar, not grading auto-populate
    if (!skuEl) return;
    var norm = normalizeLabel(skuEl.value);
    if (!norm) return;                       // empty / no digits -> no lookup
    // reflect the normalized value back into the field
    if (skuEl.value !== norm) {
      skuEl.value = norm;
      skuEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (norm === lastLookup || lookupInFlight) return;  // already looked this up
    lastLookup = norm;
    lookupInFlight = true;
    getToken().then(function (t) {
      return fetch(FN_LOOKUP, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ label: norm })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.ok && res.j.found && res.j.record) {
        applyRecord(res.j.record);
        showToast("Loaded graded record for " + norm + " ✓");
      } else if (res.ok && res.j.ok && res.j.found === false) {
        showToast("No graded record found — enter manually");
      } else {
        // auth / unexpected error: allow a retry of the same label
        lastLookup = null;
        showToast("Lookup failed — enter manually", true);
        console.error("[lookup]", res);
      }
    }).catch(function (e) {
      lastLookup = null;
      showToast("Lookup error — enter manually", true);
      console.error("[lookup]", e);
    }).finally(function () {
      lookupInFlight = false;
    });
  }

  if (skuEl) skuEl.addEventListener("blur", runLookup);

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

  // Friendly singular for item_name, read live from option_lists.category
  // (email_singular). Fallback to the raw stored value if not found / null /
  // fetch not yet landed — always a real word, never errors. Retired the
  // hardcoded CATEGORY_DISPLAY map (option_lists is the single source).
  function friendlyCategory(c) {
    var k = (c || "").trim();
    if (!k) return k;
    var rows = OPTION_LISTS.category || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].value === k) return rows[i].email_singular || k;
    }
    return k;
  }

  function autoName() {
    if (!nameEl || nameTouched) return;
    var brand = (root.querySelector('[data-key="brand"]') || {}).value || "";
    var cat   = (root.querySelector('[data-key="category"]') || {}).value || "";
    var color = (root.querySelector('[data-key="color"]') || {}).value || "";
    // Never auto-fill a name that's just the brand — require Color or Category
    // (clothing-only), so toys are left blank for a real, specific name.
    if (!color.trim() && !cat.trim()) return;
    var parts = [titleCase(color.trim()), titleCase(brand.trim()), friendlyCategory(cat)].filter(Boolean);
    nameEl.value = parts.join(" ");
  }
  ["brand", "category", "color"].forEach(function (k) {
    var el = root.querySelector('[data-key="' + k + '"]');
    if (el) el.addEventListener("input", autoName);
  });

  /* ---- MANAGE-ITEM MODE (edit existing inventory) ---------------------- */
  /* Server: inventory-edit edge fn ({action:"load"|"update"}) + the
     get_inventory_by_sku RPC behind it. v1 edits PHOTOS + status +
     bin_location + featured only; metadata is shown read-only for reference.
     Front slot is always primary (= photo_urls[0]); the server re-derives
     primary from photo_urls[0], so a client-sent primary is irrelevant. */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function buildRefBlock(rec) {
    var el = $("ksl-edit-ref");
    if (!el) return;
    var sizeLabel = rec.item_type === "toy" ? "Age" : "Size";
    var rows = [
      ["SKU", rec.sku],
      ["Type", rec.item_type],
      ["Brand", rec.brand],
      ["Tier", rec.tier],
      ["Category", rec.category],
      [sizeLabel, rec.size],
      ["Status", rec.status],
      ["Added", rec.date_added ? String(rec.date_added).slice(0, 10) : ""]
    ];
    var html = '<div class="ksl-ref-name">' + esc(rec.item_name || rec.sku) + '</div>';
    html += '<div class="ksl-ref-grid">';
    rows.forEach(function (r) {
      if (r[1] === null || r[1] === undefined || r[1] === "") return;
      html += '<span class="ksl-ref-k">' + esc(r[0]) + '</span>' +
              '<span class="ksl-ref-v">' + esc(r[1]) + '</span>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function showLockBanner(msg) {
    var el = $("ksl-edit-lock");
    if (el) { el.textContent = msg; el.classList.remove("ksl-hidden"); }
    var save = $("ksl-edit-save");
    if (save) save.disabled = true;
    var del = $("ksl-edit-delete");
    if (del) del.disabled = true;
  }
  function hideLockBanner() {
    var el = $("ksl-edit-lock");
    if (el) el.classList.add("ksl-hidden");
    var save = $("ksl-edit-save");
    if (save) save.disabled = false;
    var del = $("ksl-edit-delete");
    if (del) del.disabled = false;
  }

  /* swap insert chrome (toggle / details / List-item) <-> edit panel */
  function setEditChrome(on) {
    var tgl = root.querySelector(".ksl-toggle");
    var det = root.querySelector(".ksl-details");
    var pnl = $("ksl-edit-panel");
    var nw  = $("ksl-mng-new");
    var hint = $("ksl-manage-hint");
    var rest = $("ksl-restore");
    if (tgl) tgl.classList.toggle("ksl-hidden", on);
    if (det) det.classList.toggle("ksl-hidden", on);
    if (submitBtn) submitBtn.classList.toggle("ksl-hidden", on);
    if (pnl) pnl.classList.toggle("ksl-hidden", !on);
    if (nw)  nw.classList.toggle("ksl-hidden", !on);
    if (hint) hint.classList.toggle("ksl-hidden", on);
    if (on && rest) rest.classList.add("ksl-hidden");
  }

  /* hosted photo_urls -> the three fixed slots (front/back/detail) + video.
     Each becomes a DONE rec whose objUrl is the hosted URL directly (no
     re-upload) — exactly how restoreDraft rehydrates a saved draft. */
  function rehydratePhotos(rec) {
    slots = { front: null, back: null, detail: null };
    video = null;
    var urls = Array.isArray(rec.photo_urls) ? rec.photo_urls.slice() : [];
    // defensive: guarantee the stored primary sits at index 0 (Front)
    if (rec.primary_photo_url) {
      var pi = urls.indexOf(rec.primary_photo_url);
      if (pi > 0) { urls.splice(pi, 1); urls.unshift(rec.primary_photo_url); }
      else if (pi === -1 && urls.length === 0) { urls = [rec.primary_photo_url]; }
    }
    var keys = ["front", "back", "detail"];
    urls.slice(0, 3).forEach(function (u, i) {
      if (!u) return;
      slots[keys[i]] = { id: uid(), url: u, status: "done", name: "existing", objUrl: u };
    });
    if (rec.video_url) {
      video = { id: uid(), url: rec.video_url, status: "done", name: "existing", objUrl: rec.video_url };
    }
    renderAllSlots();
  }

  /* edit-mode "Make primary": swap the chosen slot's photo into Front. */
  function makePrimary(key) {
    if (!EDIT_MODE || key === "front") return;
    var tmp = slots.front;
    slots.front = slots[key];
    slots[key] = tmp;           // tmp may be null -> the source slot empties
    renderAllSlots();
  }

  function enterEditMode(rec) {
    loadedRecord = rec;
    EDIT_MODE = true;
    editLocked = (rec.status === "reserved" || rec.status === "claimed");

    // item type from the record so the theme/reference read coherently
    var t = (rec.item_type === "toy") ? "toy" : "clothing";
    if (t !== itemType) { itemType = t; applyType(); }

    rehydratePhotos(rec);
    buildRefBlock(rec);

    var st = $("ksl-edit-status");
    if (st) st.value = (rec.status === "retired") ? "retired" : "available";
    var bin = $("ksl-edit-bin");
    if (bin) bin.value = rec.bin_location || "";
    var feat = $("ksl-edit-featured");
    if (feat) feat.checked = !!rec.featured;
    var nm = $("ksl-edit-name");
    if (nm) nm.value = rec.item_name || "";
    var ds = $("ksl-edit-desc");
    if (ds) ds.value = rec.description || "";
    nameTouched = true;   // edit mode must never auto-recompose the loaded name

    setEditChrome(true);
    if (editLocked) showLockBanner("This item is " + rec.status + " (member-pending) — editing is locked.");
    else hideLockBanner();
  }

  function exitEditMode() {
    EDIT_MODE = false; editLocked = false; loadedRecord = null;
    hideLockBanner();
    clearItem();                       // wipes photos + fields; renders slots without make-primary
    var mng = $("ksl-mng-sku"); if (mng) mng.value = "";
    setEditChrome(false);
  }

  function buildEditPatch() {
    var photos = ["front", "back", "detail"]
      .map(function (k) { return slots[k]; })
      .filter(function (r) { return r && r.status === "done"; })
      .map(function (r) { return r.url; });
    return {
      status: ($("ksl-edit-status") || {}).value || "available",
      item_name: (($("ksl-edit-name") || {}).value || "").trim(),
      description: (($("ksl-edit-desc") || {}).value || "").trim(),
      bin_location: (($("ksl-edit-bin") || {}).value || "").trim(),
      featured: !!($("ksl-edit-featured") && $("ksl-edit-featured").checked),
      photo_urls: photos,                                   // front-first; server derives primary
      video_url: (video && video.status === "done") ? video.url : null
    };
  }

  function runManageLoad() {
    var inp = $("ksl-mng-sku");
    var norm = normalizeLabel(inp ? inp.value : "");
    if (!norm) { showToast("Enter a KS label, e.g. KS-00001", true); return; }
    if (inp) inp.value = norm;
    var btn = $("ksl-mng-load");
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    getToken().then(function (t) {
      return fetch(FN_EDIT, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "load", sku: norm })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.ok && res.j.found && res.j.record) {
        enterEditMode(res.j.record);
        showToast("Loaded " + norm + " ✓");
      } else if (res.ok && res.j.ok && res.j.found === false) {
        showToast("No item found for " + norm, true);
      } else {
        showToast("Load failed — see console", true);
        console.error("[manage-load]", res);
      }
    }).catch(function (e) {
      showToast("Load error — see console", true);
      console.error("[manage-load]", e);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Load"; }
    });
  }

  function runEditSave() {
    if (!EDIT_MODE || !loadedRecord) { showToast("No item loaded", true); return; }
    if (editLocked) { showToast("This item is reserved/claimed — can't edit", true); return; }
    if (!(slots.front && slots.front.status === "done")) {
      showToast("A Front photo is required — it's the primary", true);
      return;
    }
    if (!(($("ksl-edit-bin") || {}).value || "").trim()) {
      showToast("Bin location can't be empty", true);
      return;
    }
    if (!(($("ksl-edit-name") || {}).value || "").trim()) {
      showToast("Item name can't be empty", true);
      return;
    }
    if (anyUploading()) { showToast("Wait for photos to finish uploading", true); return; }
    var sku = loadedRecord.sku;
    var btn = $("ksl-edit-save");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    getToken().then(function (t) {
      return fetch(FN_EDIT, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "update", sku: sku, patch: buildEditPatch() })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.ok && res.j.item) {
        ["status", "primary_photo_url", "photo_urls", "video_url", "bin_location", "featured"]
          .forEach(function (k) { if (res.j.item[k] !== undefined) loadedRecord[k] = res.j.item[k]; });
        // name + description aren't in the update .select() response — the save
        // succeeded, so the field values we sent are now DB truth.
        loadedRecord.item_name = (($("ksl-edit-name") || {}).value || "").trim();
        loadedRecord.description = (($("ksl-edit-desc") || {}).value || "").trim() || null;
        buildRefBlock(loadedRecord);
        var st = $("ksl-edit-status");
        if (st) st.value = (loadedRecord.status === "retired") ? "retired" : "available";
        showToast("Saved " + sku + " ✓ — verify in Supabase");
      } else if (res.status === 409) {
        editLocked = true;
        showLockBanner("This item is now reserved/claimed — editing is locked.");
        showToast("Reserved/claimed — can't edit", true);
        console.error("[edit-save 409]", res);
      } else {
        var msg = res.j.error || ("status " + res.status);
        showToast("Save failed — " + msg, true);
        console.error("[edit-save]", res);
      }
    }).catch(function (e) {
      showToast("Network error — see console", true);
      console.error("[edit-save]", e);
    }).finally(function () {
      if (btn && !editLocked) { btn.disabled = false; btn.textContent = "Save changes"; }
      else if (btn) { btn.textContent = "Save changes"; }
    });
  }

  function runEditDelete() {
    if (!EDIT_MODE || !loadedRecord) { showToast("No item loaded", true); return; }
    if (editLocked) { showToast("This item is reserved/claimed — can't delete", true); return; }
    var sku = loadedRecord.sku;
    var ok = window.confirm(
      "Delete " + sku + "?\n\n" +
      "You'll permanently lose ALL data for this item — photos, details, " +
      "everything. This can't be undone.\n\n" +
      "(Items that have ever been claimed can't be deleted — Un-list those instead.)"
    );
    if (!ok) return;
    var btn = $("ksl-edit-delete");
    if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
    getToken().then(function (t) {
      return fetch(FN_EDIT, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "delete", sku: sku })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.ok && res.j.deleted) {
        showToast("Deleted " + sku + " ✓");
        exitEditMode();                       // item is gone — leave edit mode
      } else if (res.status === 409 && res.j.error === "has_claims") {
        showToast("Has order history — Un-list it instead of deleting", true);
      } else if (res.status === 409) {
        editLocked = true;
        showLockBanner("This item is now reserved/claimed — can't delete.");
        showToast("Reserved/claimed — can't delete", true);
        console.error("[edit-delete 409]", res);
      } else {
        var msg = res.j.error || ("status " + res.status);
        showToast("Delete failed — " + msg, true);
        console.error("[edit-delete]", res);
      }
    }).catch(function (e) {
      showToast("Network error — see console", true);
      console.error("[edit-delete]", e);
    }).finally(function () {
      var b = $("ksl-edit-delete");
      if (b && !editLocked) { b.disabled = false; b.textContent = "Delete item"; }
      else if (b) { b.textContent = "Delete item"; }
    });
  }

  /* wire the manage bar + edit panel */
  (function wireManage() {
    var loadBtn = $("ksl-mng-load");
    if (loadBtn) loadBtn.addEventListener("click", runManageLoad);
    var mngSku = $("ksl-mng-sku");
    if (mngSku) mngSku.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); runManageLoad(); }
    });
    var newLink = $("ksl-mng-new");
    if (newLink) newLink.addEventListener("click", function (e) { e.preventDefault(); exitEditMode(); });
    var saveBtn = $("ksl-edit-save");
    if (saveBtn) saveBtn.addEventListener("click", runEditSave);
    var delBtn = $("ksl-edit-delete");
    if (delBtn) delBtn.addEventListener("click", runEditDelete);
  })();

  /* ---- INIT ------------------------------------------------------------ */
  applyType();
  if (hasDraft()) {
    var rb = $("ksl-restore"); rb.classList.remove("ksl-hidden");
    var ryBtn = $("ksl-restore-yes");
    ryBtn.disabled = true;                 // gate restore until the selects have options
    ryBtn.addEventListener("click", function () {
      restoreDraft();
      nameTouched = true;
      rb.classList.add("ksl-hidden");
    });
    $("ksl-restore-no").addEventListener("click", function () {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      rb.classList.add("ksl-hidden");
    });
  }
  // fetch controlled vocab, then fill the remote selects (Path B, live read).
  // Restore stays gated until this settles, so a draft value is never written
  // into a select before its <option> exists.
  loadOptionLists()
    .then(injectOptions)
    .catch(function (e) { console.error("[option_lists] load failed", e); })
    .then(function () { var ry = $("ksl-restore-yes"); if (ry) ry.disabled = false; })
    .then(function () {
      // Auto-advance the SKU only when there's no draft waiting to restore
      // (a draft owns the SKU; the restore banner handles it). Runs after
      // option_lists settles so the graded-data pull writes into ready selects.
      if (!hasDraft()) { prefillNextSku(); armPhotoFirst(); }
    });
  // warm the token early so first upload is instant
  getToken().catch(function () {});
})();
