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
  var FN_EDIT   = BASE + "/inventory-edit";   // Manage-Item load/update/delete/resolve
  var FN_MEMBER_LOOKUP = BASE + "/member-lookup";  // G(3) returns/relist by member (operator-gated, flat {ok,mode,...})
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
    var catEl = root.querySelector('[data-key="category"]');
    return !!catEl && catEl.value === "Shoes";
  }
  function populateSizeOptions() {
    var shoe = isShoeCategory();
    // relabel for clarity; preserve the required-asterisk span (first text node only)
    var lbl = root.querySelector('.ksl-field[data-field="clothing_size"] .ksl-label');
    if (lbl && lbl.firstChild && lbl.firstChild.nodeType === 3) {
      lbl.firstChild.nodeValue = shoe ? "Shoe size" : "Size";
    }
    // size is a combo reading comboSource() live — no fillSelect. Drop a value
    // that's no longer valid for the current vocab (e.g. a clothing size left
    // over after switching category to Shoes) and refresh the list if it's open.
    var hid = comboHiddenEl("clothing_size");
    if (hid && hid.value) {
      var stillValid = comboSource("clothing_size").some(function (r) { return r.value === hid.value; });
      if (!stillValid) {
        hid.value = "";
        hid.dispatchEvent(new Event("input", { bubbles: true }));
        var vin = comboInputEl("clothing_size");
        if (vin) vin.value = "";
      }
    }
    var box = comboResultsEl("clothing_size");
    if (box && box.classList.contains("is-open")) renderComboSuggest("clothing_size");
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
      "#ksl-restore #ksl-restore-yes{background:var(--ksl-btn);color:#fff;border:1px solid var(--ksl-btn);}" +
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
      "#ks-list-app{--ksl-btn:var(--ks-coral);}" +
      "#ks-list-app.ks-theme-toy{--ksl-btn:var(--ks-pink);}" +
      "#ks-list-app .ksl-toggle{display:flex;width:100%;box-sizing:border-box;gap:0;padding:3px;border-radius:10px;" +
        "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);}" +
      "#ks-list-app .ksl-toggle button{appearance:none;-webkit-appearance:none;border:0;background:transparent;" +
        "flex:1;text-align:center;color:inherit;font:inherit;font-weight:600;padding:8px 22px;border-radius:8px;cursor:pointer;" +
        "opacity:.55;transition:background .15s,opacity .15s;}" +
    document.head.appendChild(st);
  })();

  /* U2 2026-07-01c: (a) item_name + description span the full form row (long
     text fields, cramped at 1/3 width); covers grid AND flex layouts so it
     doesn't care how the page CSS lays out .ksl-details. (b) review panel =
     compact 2-col grid of label-over-value cells so the whole review scans on
     one phone screen; banner/thumbs/wide rows span both columns. #ksl-review-body
     ID specificity wins over the page-CSS class rules. Pure JS inject. */
  (function injectReviewCss() {
    if (document.getElementById("ksl-review-css")) return;
    var st = document.createElement("style");
    st.id = "ksl-review-css";
    st.textContent =
      '#ks-list-app .ksl-details .ksl-field[data-field="item_name"],' +
      '#ks-list-app .ksl-details .ksl-field[data-field="description"]{' +
        'grid-column:1/-1;flex-basis:100%;width:100%;max-width:100%;box-sizing:border-box;}' +
      "#ksl-review-body{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 8px;}" +
      "#ksl-review-body>*:not(.ksl-review-row){grid-column:1/-1;}" +
      "#ksl-review-body .ksl-review-row{display:flex;flex-direction:column;gap:1px;margin:0;" +
        "padding:6px 9px;background:rgba(255,255,255,.05);border:0;border-radius:8px;}" +
      "#ksl-review-body .ksl-review-row.is-wide{grid-column:1/-1;}" +
      "#ksl-review-body .ksl-review-row.is-wide2{grid-column:span 2;}" +
      "#ksl-review-body .ksl-review-k{font-size:.68rem;font-weight:600;letter-spacing:.05em;" +
        "text-transform:uppercase;opacity:.6;}" +
      "#ksl-review-body .ksl-review-v{font-size:.92rem;line-height:1.3;word-break:break-word;}" +
      /* U5 2026-07-05: mobile-only — stop a lone/orphan entry field from flex-growing
         to fill the row (Gender was stranding onto its own row and stretching to full
         width at phone width; same effect hits Brand/others when a row runs short).
         Scoped to <=600px so desktop packing is untouched. Mirrors the toy-age @media. */
      "@media (max-width:600px){#ks-list-app .ksl-details>.ksl-field{flex-grow:0}}";
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
    ["condition_grade", "occasion"].forEach(function (key) {
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
    /* U1 2026-07-01c: size/age/retail lead — manual entry remembers these off the
     * physical item first. Rarely-filled fields (season/occasion/note) sit dead
     * last; review order follows this array too. */
    { key:"clothing_size",  label:"Size",           type:"select", remote:true, combo:true, group:"clothing", required:true, placeholder:"Type to filter\u2026" },
    { key:"toy_age_range",  label:"Age range",      type:"multipills", remote:true, group:"toy", required:true },
    { key:"retail_value",   label:"Retail value",   type:"number", group:"both", required:true,  placeholder:"e.g. 48", step:"0.01", min:"0" },
    { key:"sku",            label:"SKU",            type:"text",   group:"both", required:true,  placeholder:"KS-00000", hint:"the KS label number on the item" },
    { key:"brand",          label:"Brand",          type:"text",   group:"both", required:true,  placeholder:"e.g. Patagonia" },
    { key:"item_name",      label:"Item name",      type:"text",   group:"both", required:true,  placeholder:"auto-fills from brand + category" },
    { key:"description",    label:"Description",    type:"textarea", group:"both", required:false },
    { key:"toy_washability",label:"Washability",    type:"pills",  group:"toy", required:true,  options:["wipeable","washable"] },
    { key:"is_complete",    label:"Completeness",   type:"pills",  group:"toy", required:true,  options:[{value:"complete",label:"Complete"},{value:"missing",label:"Missing pieces"}] },
    { key:"color",          label:"Color",          type:"select", remote:true, combo:true, group:"clothing", required:true, placeholder:"Type to filter\u2026" },
    { key:"category",       label:"Category",       type:"select", remote:true, combo:true, group:"clothing", required:true, placeholder:"Type to filter\u2026" },
    { key:"gender_style",   label:"Gender",         type:"select", group:"clothing", required:false, options:[{value:"boy",label:"Male"},{value:"girl",label:"Female"}] },
    { key:"tier",           label:"Tier",           type:"select", group:"both", required:true,  options:["essentials","elevated","special"] },
    { key:"resale_value",   label:"Resale value",   type:"number", group:"both", required:false, noOptTag:true, step:"0.01", min:"0", hint:"Auto-fills for Elevated/Special — editable; Essentials skips it" },
    { key:"condition_grade",label:"Condition grade",type:"select", remote:true, group:"both", required:false },
    { key:"bin_location",   label:"Bin location",   type:"text",     group:"both", required:true,  placeholder:"where it's stored" },
    { key:"season",         label:"Season",         type:"text",     group:"clothing", required:false, placeholder:"e.g. winter, all-season" },
    { key:"occasion",       label:"Occasion",       type:"select", remote:true, group:"both", required:false },
    { key:"condition_notes",label:"Personal note",  type:"textarea", group:"both", required:false, placeholder:"e.g. really soft fabric, runs a little big" },
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
  var thumbUrl = null;         // Option B: client-gen grid-thumbnail URL for the current item; null -> browse falls back to full-res
  var token = null;
  var resaleTouched = false;   // resale auto-fill override latch; a tier change resets it
  var gradedForSku = "";       // SKU the current carry-forward data belongs to (drift guard)
  var awaitingPhotoFocus = false;  // photos-first guided entry: when armed, the first
                                   // completed photo drops the cursor into Color (one-shot)

  /* ---- MANAGE-ITEM (edit existing) STATE ------------------------------- */
  var EDIT_MODE   = false;   // true once an existing item is loaded for editing
  var loadedRecord = null;   // the inventory row returned by inventory-edit "load"
  var loadedGrade  = "";     // condition_grade at load — drives the snag-1 photo-coupling cue
  var loadedTier   = "";     // (L1) tier at load — buildEditPatch sends tier ONLY when it changes from this
  var loadedComplete = "";   // (L3) completeness at load ("", "complete", "missing") — send only on change
  var editResaleVal = null;  // last client-recomputed resale; rides the patch (operator never types it)
  var editLocked  = false;   // true when the loaded row is reserved/claimed
  var editPrimaryDirty = false; // edit mode: true once the primary photo changed this edit (new front OR make-primary) -> regen the grid thumb on save
  var editThumbUrl = null;      // edit mode: regenerated grid-thumb URL for this save; null -> buildEditPatch omits thumbnail_url -> DB value preserved

  var root = document.getElementById("ks-list-app");
  if (!root) { console.error("[listing] #ks-list-app not found"); return; }

  /* ---- BUILD UI -------------------------------------------------------- */
  function fieldHtml(f) {
    var reqMark = f.required ? '<span class="ksl-req">*</span>'
                             : (f.noOptTag ? '' : ' <span class="ksl-opt">(optional)</span>');
    var inner;
    if (f.combo) {
      // searchable closed-vocab field: HIDDEN canonical [data-key] (written only
      // by pickCombo) + a visible filter input (no data-key) + results dropdown.
      // Typed junk can't reach inventory.<key> because the value channel and the
      // typing channel are physically separate.
      inner = '<div class="ksl-combo-wrap" data-combo-wrap="' + f.key + '">' +
                '<input type="hidden" data-key="' + f.key + '">' +
                '<input type="text" class="ksl-combo-input" data-combo="' + f.key + '" autocomplete="off" placeholder="' + (f.placeholder || "Type to filter\u2026") + '">' +
                '<div class="ksl-combo-results" data-combo-results="' + f.key + '"></div>' +
              '</div>';
    } else if (f.type === "select") {
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
      '<button type="button" class="ksl-manage-ghost" id="ksl-mng-returns">Returns / relist</button>' +
      '<a href="#" class="ksl-manage-new ksl-hidden" id="ksl-mng-new">\u2190 New listing</a>' +
      '<div class="ksl-manage-hint" id="ksl-manage-hint">Edit an existing item\u2019s photos, condition, status, bin, or featured flag.</div>' +
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
      '<div class="ksl-field ksl-edit-cond">' +
        '<label class="ksl-label" for="ksl-edit-condition">Condition grade</label>' +
        '<select id="ksl-edit-condition"></select>' +
        '<div class="ksl-edit-photonote ksl-hidden" id="ksl-edit-photonote">Re-graded? Confirm the photo above shows this condition before saving.</div>' +
      '</div>' +
      '<div class="ksl-field ksl-edit-tier">' +
        '<label class="ksl-label" for="ksl-edit-tier">Tier</label>' +
        '<select id="ksl-edit-tier"></select>' +
      '</div>' +
      '<div class="ksl-field ksl-edit-complete ksl-hidden" id="ksl-edit-complete-wrap">' +
        '<label class="ksl-label" for="ksl-edit-complete">Completeness</label>' +
        '<select id="ksl-edit-complete">' +
          '<option value="">\u2014</option>' +
          '<option value="complete">Complete</option>' +
          '<option value="missing">Missing pieces</option>' +
        '</select>' +
      '</div>' +
      '<div class="ksl-field ksl-edit-resale">' +
        '<label class="ksl-label">Resale value</label>' +
        '<div class="ksl-edit-resale-box" id="ksl-edit-resale-display">\u2014</div>' +
      '</div>' +
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
        '<label class="ksl-label">Occasion</label>' +
        '<select id="ksl-edit-occasion"></select>' +
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

    '<div class="ksl-card ksl-lookup-panel ksl-hidden" id="ksl-lookup-panel">' +
      '<a href="#" class="ksl-lookup-back" id="ksl-lookup-back">\u2190 Back to listing</a>' +
      '<h3>Returns / relist</h3>' +
      '<p class="ksl-lookup-help">Search a member by <strong>name or email</strong> (not SKU) to see what they currently have out. Match each item in hand to its photo + SKU, then relist clothing, stage toys for the workshop, or mark an item kept if it isn\u2019t coming back.</p>' +
      '<div class="ksl-lookup-search">' +
        '<input type="text" id="ksl-lookup-input" placeholder="Member name or email" ' +
          'autocomplete="off" autocorrect="off" spellcheck="false">' +
        '<button type="button" class="ksl-manage-btn" id="ksl-lookup-go">Search</button>' +
      '</div>' +
      // snag-2 seam (DEFERRED): staged-count chip. Stays hidden until a server
      // count read (status='retired' AND awaiting_relist) feeds it — one line
      // when that endpoint exists. Do NOT populate from the client (inventory
      // is RLS-sealed; no count path today).
      '<div class="ksl-lookup-staged ksl-hidden" id="ksl-lookup-staged"></div>' +
      '<div class="ksl-lookup-results" id="ksl-lookup-results"></div>' +
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
      "#ks-list-app .ksl-manage-btn{padding:9px 18px;border:0;border-radius:8px;background:var(--ksl-btn);color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-manage-btn:disabled{opacity:.6;cursor:default}" +
      "#ks-list-app .ksl-manage-new{font-size:.85rem;color:var(--ksl-btn);text-decoration:none;cursor:pointer}" +
      "#ks-list-app .ksl-manage-hint{flex:1 1 100%;font-size:.82rem;opacity:.6}" +
      "#ks-list-app .ksl-edit-ref{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12)}" +
      "#ks-list-app .ksl-ref-name{font-size:1.05rem;font-weight:600;margin-bottom:10px}" +
      "#ks-list-app .ksl-ref-grid{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:.86rem}" +
      "#ks-list-app .ksl-ref-k{opacity:.5;text-transform:uppercase;letter-spacing:.04em;font-size:.72rem;align-self:center}" +
      "#ks-list-app .ksl-ref-v{opacity:.92}" +
      "#ks-list-app .ksl-edit-lock{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:color-mix(in srgb, var(--ksl-btn) 14%, transparent);border:1px solid color-mix(in srgb, var(--ksl-btn) 55%, transparent);font-size:.86rem}" +
      "#ks-list-app .ksl-danger{display:block;width:100%;margin-top:10px;padding:11px 18px;border:1px solid rgba(192,57,43,.6);border-radius:9px;background:transparent;color:#e06a5a;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-danger:hover{background:#c0392b;border-color:#c0392b;color:#fff}" +
      "#ks-list-app .ksl-danger:disabled{opacity:.5;cursor:default}" +
      "#ks-list-app #ksl-edit-desc{min-height:92px;resize:vertical}" +
      "#ks-list-app .ksl-edit-resale-box{padding:9px 12px;border-radius:8px;border:1px dashed rgba(255,255,255,.24);background:rgba(255,255,255,.04);color:inherit;font:inherit;font-weight:700;letter-spacing:.01em}" +
      "#ks-list-app .ksl-edit-resale-box.is-essentials{font-weight:500;font-style:italic;opacity:.72}" +
      "#ks-list-app .ksl-edit-photonote{margin-top:8px;padding:8px 11px;border-radius:8px;background:color-mix(in srgb, var(--ksl-btn) 13%, transparent);border:1px solid color-mix(in srgb, var(--ksl-btn) 50%, transparent);color:inherit;font-size:.8rem;line-height:1.35}" +
      "#ks-list-app .ksl-slot{position:relative}" +
      "#ks-list-app .ksl-makeprimary{position:absolute;left:6px;right:6px;bottom:6px;z-index:6;margin:0;padding:5px 8px;border:1px solid rgba(255,255,255,.35);border-radius:7px;background:rgba(20,18,16,.82);color:#fff;font:inherit;font-size:.72rem;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-makeprimary:hover{border-color:var(--ksl-btn);background:color-mix(in srgb, var(--ksl-btn) 90%, transparent)}" +
      "#ks-list-app .ksl-field.ksl-cued > .ksl-label::after{content:'from grading';margin-left:8px;padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb, var(--ksl-btn) 40%, transparent);background:color-mix(in srgb, var(--ksl-btn) 12%, transparent);color:var(--ksl-btn);font-size:.64rem;font-weight:600;letter-spacing:.02em;text-transform:none;vertical-align:middle;white-space:nowrap}" +
      "#ks-list-app .ksl-field.ksl-cued > .ksl-label{display:flex;align-items:center;flex-wrap:wrap;gap:2px 0}" +
      "#ks-list-app .ksl-brand-wrap{position:relative}" +
      "#ks-list-app .ksl-brand-results{display:none;position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:60;max-height:240px;overflow-y:auto;background:#1f1f1f;border:1px solid rgba(255,255,255,.18);border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.45)}" +
      "#ks-list-app .ksl-brand-results.is-open{display:block}" +
      "#ks-list-app .ksl-brand-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;cursor:pointer;font-size:.9rem}" +
      "#ks-list-app .ksl-brand-opt:hover{background:color-mix(in srgb, var(--ksl-btn) 18%, transparent)}" +
      "#ks-list-app .ksl-brand-tier{display:none}" +
      "#ks-list-app .ksl-brand-empty{padding:9px 12px;font-size:.82rem;opacity:.5}" +
      "#ks-list-app .ksl-combo-wrap{position:relative}" +
      "#ks-list-app .ksl-combo-results{display:none;position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:60;max-height:260px;overflow-y:auto;background:#1f1f1f;border:1px solid rgba(255,255,255,.18);border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.45)}" +
      "#ks-list-app .ksl-combo-results.is-open{display:block}" +
      "#ks-list-app .ksl-combo-opt{padding:9px 12px;cursor:pointer;font-size:.9rem}" +
      "#ks-list-app .ksl-combo-opt:hover{background:color-mix(in srgb, var(--ksl-btn) 18%, transparent)}" +
      "#ks-list-app .ksl-combo-empty{padding:9px 12px;font-size:.82rem;opacity:.5}" +
      "#ks-list-app .ksl-brand-add{padding:10px 12px;cursor:pointer;font-size:.88rem;font-weight:600;color:var(--ksl-btn);border-top:1px solid rgba(255,255,255,.12)}" +
      "#ks-list-app .ksl-brand-add:hover{background:color-mix(in srgb, var(--ksl-btn) 12%, transparent)}" +
      "#ks-list-app .ksl-brand-modal{display:none;position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:20px}" +
      "#ks-list-app .ksl-brand-modal.is-open{display:flex}" +
      "#ks-list-app .ksl-brand-card{width:100%;max-width:420px;background:#1f1f1f;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:22px}" +
      "#ks-list-app .ksl-brand-card h3{margin:0 0 4px;font-size:1.05rem}" +
      "#ks-list-app .ksl-bm-sub{margin:0 0 16px;font-size:.85rem;opacity:.65}" +
      "#ks-list-app .ksl-bm-name{font-weight:600}" +
      "#ks-list-app .ksl-bm-label{margin:0 0 8px;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;opacity:.55}" +
      "#ks-list-app .ksl-bm-tiers{display:flex;gap:8px;margin:0 0 16px}" +
      "#ks-list-app .ksl-bm-tier{flex:1;padding:10px 6px;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:.86rem;cursor:pointer;text-transform:capitalize}" +
      "#ks-list-app .ksl-bm-tier.is-active{border-color:var(--ksl-btn);background:color-mix(in srgb, var(--ksl-btn) 18%, transparent);color:#fff;font-weight:600}" +
      "#ks-list-app .ksl-bm-warn{margin:0 0 18px;font-size:.78rem;opacity:.55}" +
      "#ks-list-app .ksl-bm-actions{display:flex;gap:10px;justify-content:flex-end}" +
      "#ks-list-app .ksl-bm-cancel{padding:9px 16px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}" +
      "#ks-list-app .ksl-bm-confirm{padding:9px 18px;border:0;border-radius:8px;background:var(--ksl-btn);color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-bm-confirm:disabled{opacity:.6;cursor:default}" +
      /* --- brand EDIT (BR): pencil on rows + edit/cascade modal states --- */
      "#ks-list-app .ksl-brand-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#ks-list-app .ksl-brand-edit{flex:0 0 auto;opacity:.45;cursor:pointer;font-size:.9rem;line-height:1;padding:2px 7px;border-radius:6px}" +
      "#ks-list-app .ksl-brand-edit:hover{opacity:1;background:color-mix(in srgb, var(--ksl-btn) 22%, transparent)}" +
      "#ks-list-app .ksl-bm-namerow{margin:0 0 16px}" +
      "#ks-list-app .ksl-bm-nameinput{width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0 0;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:rgba(255,255,255,.05);color:inherit;font:inherit}" +
      "#ks-list-app .ksl-bm-err{margin:0 0 12px;font-size:.8rem;color:#e0857a;display:none}" +
      "#ks-list-app .ksl-bm-err.is-shown{display:block}" +
      "#ks-list-app .ksl-bm-casc-msg{margin:0 0 18px;font-size:.9rem;line-height:1.45}" +
      "#ks-list-app .ksl-bm-casc-msg b{font-weight:600}" +
      "#ks-list-app .ksl-bm-casc-keep{padding:9px 16px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}" +
      "#ks-list-app .ksl-bm-casc-go{padding:9px 18px;border:0;border-radius:8px;background:var(--ksl-btn);color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-bm-casc-go:disabled{opacity:.6;cursor:default}" +
      "#ks-list-app .ksl-bm-namerow,#ks-list-app .ksl-bm-cascade{display:none}" +
      "#ks-list-app .ksl-brand-card.mode-edit .ksl-bm-addsub{display:none}" +
      "#ks-list-app .ksl-brand-card.mode-edit .ksl-bm-namerow{display:block}" +
      "#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-addsub,#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-namerow,#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-err,#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-tierlabel,#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-tiers,#ks-list-app .ksl-brand-card.mode-cascade > .ksl-bm-warn,#ks-list-app .ksl-brand-card.mode-cascade > .ksl-bm-actions{display:none}" +
      "#ks-list-app .ksl-brand-card.mode-cascade .ksl-bm-cascade{display:block}" +
      "#ks-list-app .ksl-field[data-field='resale_value'] input{border-left:3px solid var(--ksl-btn);background:color-mix(in srgb, var(--ksl-btn) 6%, transparent)}" +
      "#ks-list-app .ksl-field[data-field='resale_value'] > .ksl-label::after{content:'computed';margin-left:8px;padding:1px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);color:#c2bcb4;font-size:.62rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle;white-space:nowrap}" +
      "#ks-list-app .ksl-batch-btn{display:block;width:100%;margin:0 0 12px;padding:11px 14px;border:1px dashed color-mix(in srgb, var(--ksl-btn) 55%, transparent);border-radius:10px;background:color-mix(in srgb, var(--ksl-btn) 6%, transparent);color:var(--ksl-btn);font:inherit;font-weight:600;font-size:.9rem;cursor:pointer}" +
      "#ks-list-app .ksl-batch-btn:hover{border-color:var(--ksl-btn);background:color-mix(in srgb, var(--ksl-btn) 12%, transparent);color:#fff}" +
      "#ks-list-app .ksl-success-title{color:#54935f}" +
      "#ks-list-app .ksl-success-body{display:flex;align-items:center;gap:14px;margin:0 0 18px}" +
      "#ks-list-app .ksl-success-thumb{flex:0 0 64px;width:64px;height:85px;object-fit:cover;border-radius:8px;background:rgba(255,255,255,.05)}" +
      "#ks-list-app .ksl-success-meta{min-width:0}" +
      "#ks-list-app .ksl-success-sku{font-weight:600;font-size:1rem}" +
      "#ks-list-app .ksl-success-name{font-size:.86rem;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      /* --- Returns / relist lookup (G build 3) --- */
      "#ks-list-app .ksl-manage-ghost{padding:9px 16px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-manage-ghost:hover{border-color:var(--ksl-btn);color:#fff}" +
      "#ks-list-app .ksl-lookup-back{display:inline-block;margin:0 0 12px;font-size:.85rem;color:var(--ksl-btn);text-decoration:none;cursor:pointer}" +
      "#ks-list-app .ksl-lookup-help{margin:0 0 16px;font-size:.85rem;opacity:.65;line-height:1.4}" +
      "#ks-list-app .ksl-lookup-search{display:flex;gap:10px;margin:0 0 16px}" +
      "#ks-list-app .ksl-lookup-search input{flex:1 1 auto;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.22);background:transparent;color:inherit;font:inherit}" +
      "#ks-list-app .ksl-lookup-staged{margin:0 0 14px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);font-size:.82rem;opacity:.85}" +
      "#ks-list-app .ksl-lookup-empty{padding:18px 4px;font-size:.9rem;opacity:.6;text-align:center}" +
      "#ks-list-app .ksl-lookup-trunc{margin:0 0 10px;font-size:.78rem;opacity:.6}" +
      "#ks-list-app .ksl-lookup-memberhead{margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.12)}" +
      "#ks-list-app .ksl-lookup-mh-name{font-weight:600;font-size:1rem}" +
      "#ks-list-app .ksl-lookup-mh-email{font-size:.82rem;opacity:.6}" +
      "#ks-list-app .ksl-disrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin:0 0 8px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.03);cursor:pointer}" +
      "#ks-list-app .ksl-disrow:hover{border-color:var(--ksl-btn);background:color-mix(in srgb, var(--ksl-btn) 10%, transparent)}" +
      "#ks-list-app .ksl-disrow-name{font-weight:600;font-size:.92rem}" +
      "#ks-list-app .ksl-disrow-email{font-size:.78rem;opacity:.6}" +
      "#ks-list-app .ksl-disrow-count{flex:0 0 auto;font-size:.78rem;opacity:.7;white-space:nowrap}" +
      "#ks-list-app .ksl-outcard{display:flex;gap:14px;padding:14px;margin:0 0 12px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(255,255,255,.03)}" +
      "#ks-list-app .ksl-outcard-thumb{flex:0 0 64px;width:64px;height:85px;object-fit:cover;border-radius:8px;background:rgba(255,255,255,.06)}" +
      "#ks-list-app .ksl-outcard-thumb.is-empty{display:flex;align-items:center;justify-content:center;font-size:.62rem;opacity:.5;text-align:center;line-height:1.2}" +
      "#ks-list-app .ksl-outcard-body{flex:1 1 auto;min-width:0}" +
      "#ks-list-app .ksl-outcard-sku{font-weight:700;font-size:.95rem}" +
      "#ks-list-app .ksl-outcard-name{font-size:.85rem;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#ks-list-app .ksl-outcard-meta{margin-top:3px;font-size:.74rem;opacity:.5}" +
      "#ks-list-app .ksl-outcard-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
      "#ks-list-app .ksl-outcard-primary{padding:8px 14px;border:0;border-radius:8px;background:var(--ksl-btn);color:#fff;font:inherit;font-size:.84rem;font-weight:600;cursor:pointer}" +
      "#ks-list-app .ksl-outcard-primary:hover{background:#bf4522}" +
      "#ks-list-app .ksl-outcard-keep{padding:8px 12px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:.84rem;cursor:pointer;opacity:.8}" +
      "#ks-list-app .ksl-outcard-keep:hover{border-color:rgba(255,255,255,.45);opacity:1}" +
      "#ks-list-app .ksl-outcard.is-busy{opacity:.5;pointer-events:none}";
    document.head.appendChild(s);
  })();

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
    // A: toys aren't sold new, so "retail" reads as an average current price
    var retLbl = root.querySelector('.ksl-field[data-field="retail_value"] .ksl-label');
    if (retLbl) retLbl.innerHTML = (itemType === "toy" ? "Average current price" : "Retail value") +
      '<span class="ksl-req">*</span>';
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
      // FORCE-FRESH (true): fetch the next sequential label directly so this never
      // pulls a WAITING graded item — which would flip the type back into a loop
      // once grading is live. The edge fn honors fresh:true on next_label, and the
      // client guard above refuses any graded response on this path as a backstop.
      prefillNextSku(true);
      armPhotoFirst();
    });
  });

  /* has the operator entered anything for the current item?
     (the auto-generated SKU + the default condition don't count as content) */
  function hasContent() {
    var any = false;
    root.querySelectorAll("[data-key]").forEach(function (el) {
      var v = (el.value || "").trim();
      if (!v) return;
      if (el.getAttribute("data-key") === "sku") return;   // SKU is always auto-generated — never a draft signal
      if (el.getAttribute("data-key") === "condition_grade" && v === "great") return;
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
    slots = { front:null, back:null, detail:null }; video = null; thumbUrl = null; renderAllSlots();
    clearErrors();
    clearAllCues();
    // reset the resale latch + re-assert the tier gate (tier is now blank -> hidden)
    resaleTouched = false;
    applyResaleVisibility();
    applyDuoState();           // DUO: category is now blank -> unlock tier, restore asterisks
    closeBrandSuggest();
    root.querySelectorAll(".ksl-combo-input").forEach(function (ci) { ci.value = ""; });
    closeAllCombos();
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

  /* ---- THUMBNAIL (Option B grid thumb, client-gen) --------------------- */
  /* Downscale the primary photo to ~400w JPEG (~20-40KB) for the browse grid.
     Best-effort: ANY failure -> reject -> caller leaves thumbUrl null -> browse
     grid falls back to the full-res primary (the cost-guard default behavior).
     JPEG (not WebP) to dodge edge-fn naming + Safari-encode risk. Source is the
     original full-res File (best-quality downscale), not the rendered objUrl. */
  var THUMB_W = 400;
  function makeThumb(file) {
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) { URL.revokeObjectURL(objUrl); reject(new Error("no dims")); return; }
          var tw = Math.min(THUMB_W, w);            // never upscale
          var th = Math.max(1, Math.round(h * (tw / w)));
          var cv = document.createElement("canvas");
          cv.width = tw; cv.height = th;
          cv.getContext("2d").drawImage(img, 0, 0, tw, th);
          URL.revokeObjectURL(objUrl);
          cv.toBlob(function (blob) {
            if (!blob) { reject(new Error("toBlob null")); return; }
            resolve(new File([blob], "thumb.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.7);
        } catch (e) { URL.revokeObjectURL(objUrl); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); reject(new Error("img load")); };
      img.src = objUrl;
    });
  }

  /* ---- THUMBNAIL FROM A URL (Option B edit-mode regen) ----------------- */
  /* Sibling to makeThumb(file): same ~400w JPEG, but the source is a URL, not a
     File — the edit path has the loaded item's Front photo as a hosted URL (or
     a fresh blob: after a re-upload), never the original File. crossOrigin so a
     cross-origin Supabase URL doesn't taint the canvas (ACAO:* confirmed);
     blob: is same-origin -> a quiet no-op. A cross-origin URL the browser
     already cached WITHOUT CORS (the on-screen <img>) can re-serve tainted ->
     toBlob throws SecurityError; the http(s)-only cache-buster forces a fresh
     CORS fetch so a backfill actually lands. Buster is NEVER applied to blob:
     (a query param breaks a blob URL). Does NOT revoke the URL — the slot <img>
     still uses it; this fn doesn't own it. Best-effort: ANY failure -> reject
     -> caller leaves editThumbUrl null -> patch omits thumbnail_url -> DB value
     preserved -> browse full-res fallback. */
  function corsBust(url) {
    if (typeof url !== "string" || url.indexOf("blob:") === 0) return url;
    return url + (url.indexOf("?") > -1 ? "&" : "?") + "kscors=1";
  }
  function makeThumbFromUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) { reject(new Error("no dims")); return; }
          var tw = Math.min(THUMB_W, w);            // never upscale
          var th = Math.max(1, Math.round(h * (tw / w)));
          var cv = document.createElement("canvas");
          cv.width = tw; cv.height = th;
          cv.getContext("2d").drawImage(img, 0, 0, tw, th);
          cv.toBlob(function (blob) {
            if (!blob) { reject(new Error("toBlob null")); return; }
            resolve(new File([blob], "thumb.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.7);
        } catch (e) { reject(e); }                  // tainted-canvas SecurityError lands here
      };
      img.onerror = function () { reject(new Error("img load")); };
      img.src = corsBust(url);
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
      .then(function (url) {
        if (slots[key] !== rec) return;
        rec.url = url; rec.status = "done"; renderSlot(key); saveDraft();
        if (key === "front") {
          focusColorAfterPhotos();
          if (EDIT_MODE) {
            // Edit mode: don't run the insert thumb path. Just flag that the
            // primary changed — runEditSave regenerates from slots.front on save.
            editPrimaryDirty = true;
          } else {
            thumbUrl = null;                          // invalidate any prior thumb; regen below
            makeThumb(file)
              .then(function (tf) { return uploadFile(tf, "thumb"); })
              .then(function (turl) { if (slots.front === rec) thumbUrl = turl; })  // ignore if front replaced mid-flight
              .catch(function (e) { console.warn("[thumb] skipped, full-res fallback", e); });
          }
        }
      })
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
      // U1: the form now opens on Size (clothing) / Age (toy) — land the cursor there.
      // size is a combo: focus the visible filter, not the hidden data-key input.
      var c = (itemType === "toy")
        ? root.querySelector('[data-pillbox="toy_age_range"] .ksl-pill')
        : (root.querySelector('[data-combo="clothing_size"]') || root.querySelector('[data-key="clothing_size"]'));
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
      if (rm === "video") video = null; else { slots[rm] = null; if (rm === "front") thumbUrl = null; }
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
      // combo fields: the hidden canonical value was restored in the loop above;
      // reflect it into the visible filter input (option_lists is loaded — Restore
      // stays disabled until it settles).
      root.querySelectorAll("[data-combo]").forEach(function (ci) { syncComboDisplay(ci.getAttribute("data-combo")); });
      // (clothing_size is a combo now too — the sync loop above restores it; the
      //  old select-based re-apply is gone, and populateSizeOptions already set
      //  the right vocab for the restored category.)
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
      applyDuoState();           // DUO: restored category may be "Duo" -> re-lock tier
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
      applyDuoState();           // DUO: category = "Duo" locks Essentials + optional brand/color
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
    // DUO: brand + color are optional on a duo (two items may share neither).
    var isDuo = (root.querySelector('[data-key="category"]') || {}).value === "Duo";
    SCHEMA.forEach(function (f) {
      if (!(f.group === "both" || f.group === itemType)) return;
      if (!f.required) return;
      if (isDuo && (f.key === "brand" || f.key === "color")) return;   // duo exemption
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
    // L3: completeness pills -> boolean (key only exists on toys via group:"toy";
    // unpicked -> key absent -> server leaves is_complete null)
    if (typeof p.is_complete === "string") p.is_complete = (p.is_complete === "complete");
    var donePhotos = ["front", "back", "detail"]
      .map(function (k) { return slots[k]; })
      .filter(function (r) { return r && r.status === "done"; })
      .map(function (r) { return r.url; });
    if (donePhotos.length) p.photo_urls = donePhotos;
    if (thumbUrl) p.thumbnail_url = thumbUrl;   // Option B grid thumb; omitted -> server leaves null -> browse full-res fallback
    if (video && video.status === "done") p.video_url = video.url;
    if (itemType === "clothing" && setChk.checked) { p.is_matching_set = true; p.set_piece_count = parseInt(setCount.value, 10); }
    return p;
  }

  function anyUploading() {
    var up = PHOTO_SLOTS.some(function (s) { return slots[s.key] && slots[s.key].status === "uploading"; });
    return up || (video && video.status === "uploading");
  }

  function reviewRow(label, value, wide) {
    var wc = wide === true ? ' is-wide' : ((typeof wide === 'string' && wide) ? ' ' + wide : '');
    return '<div class="ksl-review-row' + wc + '"><span class="ksl-review-k">' + label +
           '</span><span class="ksl-review-v">' + value + '</span></div>';
  }
  function reviewRowEmpty(label, wide) {
    var wc = wide === true ? ' is-wide' : ((typeof wide === 'string' && wide) ? ' ' + wide : '');
    return '<div class="ksl-review-row' + wc + '"><span class="ksl-review-k">' + label +
           '</span><span class="ksl-review-v" style="color:var(--ks-amber);font-weight:600">not set</span></div>';
  }
  function showReview() {
    // TYPE BANNER: prominent, color-coded, first thing in the review — so a
    // wrong-type listing (clothing form left on for a toy, or vice versa) is
    // caught at the one glance before Confirm, the autopilot failure point.
    // Inline-styled so it needs no page CSS (pure JS deploy).
    var isToy = (itemType === "toy");
    var bannerBd = isToy ? "rgba(245,145,169,.55)" : "rgba(231,80,37,.55)";
    var bannerInk = isToy ? "#F591A9" : "#E75025";
    // U2: heading treatment (left-aligned, colored underline, no fill) — the old
    // filled pill read as a button. Color-coding kept: it's the wrong-type catch.
    var rows = '<div style="margin:0 0 12px;padding:0 0 8px;' +
                 'border-bottom:2px solid ' + bannerBd + ';' +
                 'color:' + bannerInk + ';font-size:1.02rem;font-weight:700;' +
                 'letter-spacing:.06em;text-transform:uppercase">' +
                 'Listing a ' + (isToy ? "toy" : "clothing") + ' item' +
               '</div>';
    // L7: photo thumbnails up top — visual proof of what's being listed
    var revThumbs = ["front", "back", "detail"].map(function (k) {
      var s = slots[k];
      if (!s || s.status !== "done") return "";
      var src = s.url || s.objUrl;
      return src ? '<img src="' + esc(src) + '" alt="" style="width:58px;height:58px;object-fit:cover;' +
                   'border-radius:8px;border:1px solid var(--ks-line)">' : "";
    }).filter(Boolean).join("");
    if (revThumbs) rows += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">' + revThumbs + '</div>';
    // U3: group wide fields (name/description on top, personal note + media at bottom)
    // so the short specs pack into a clean 3-col grid with no lone-cell gaps.
    // U3: wide fields group top (name/description) + bottom (personal note, media);
    // U4: short specs pack 3-col, and the last row's orphan spans to fill (no gap).
    var topWide = "", botWide = "", narrowCells = [];
    SCHEMA.forEach(function (f) {
      if (!(f.group === "both" || f.group === itemType)) return;
      var el = root.querySelector('[data-key="' + f.key + '"]');
      if (!el) return;
      var wrap = el.closest(".ksl-field");
      if (wrap && wrap.classList.contains("ksl-hidden")) return;   // skip fields hidden for this item (e.g. resale on essentials)
      var lbl = (f.key === "retail_value" && isToy) ? "Average current price" : f.label;   // A
      var v = (el.value || "").trim();
      if (f.key === "gender_style" && v) v = (v === "boy") ? "Male" : (v === "girl") ? "Female" : v;
      if (f.key === "is_complete" && v) v = (v === "complete") ? "Complete" : "Missing pieces";   // L3
      var isTop = (f.key === "item_name" || f.key === "description");
      var isBot = (f.key === "condition_notes");
      if (isTop) topWide += (v ? reviewRow(lbl, v, true) : reviewRowEmpty(lbl, true));
      else if (isBot) botWide += (v ? reviewRow(lbl, v, true) : reviewRowEmpty(lbl, true));
      else narrowCells.push({ lbl: lbl, v: v });   // L8: flag blanks instead of hiding
    });
    if (itemType === "clothing" && setChk.checked) narrowCells.push({ lbl: "Matching set", v: setCount.value + " pieces" });
    // fill the last short-spec row so a lone/pair orphan doesn't leave a gap
    var rem = narrowCells.length % 3;
    var narrow = narrowCells.map(function (c, idx) {
      var span = (idx === narrowCells.length - 1) ? (rem === 1 ? "is-wide" : (rem === 2 ? "is-wide2" : false)) : false;
      return c.v ? reviewRow(c.lbl, c.v, span) : reviewRowEmpty(c.lbl, span);
    }).join("");
    rows += topWide + narrow + botWide;
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
    // BRAND GUARD (Option B, banked 2026-06-24i — carry-forward-exempt + fail-open).
    // The dropdown only SUGGESTS; without this an operator can ignore it and
    // free-type any unvalidated string into inventory.brand. Predicate is the
    // exact negation of renderBrandSuggest's hasExact (trim+lowercase) so this
    // blocks IFF the dropdown would have shown the "+ Add" row. ESCAPE HATCH:
    // "+ Add" lands the brand in BRANDS_BY_TYPE -> next submit passes. EXEMPT
    // carry-forward (gradedForSku): a graded item's intake brand is free-text
    // (no FK) and may legitimately not be in the brands list -> never fight the
    // pipeline. FAILS OPEN when the list isn't loaded (brand-manage outage /
    // in-flight [] marker / empty table) so infra can never block listing.
    if (!gradedForSku) {
      var brandList = BRANDS_BY_TYPE[itemType];
      if (Array.isArray(brandList) && brandList.length && br.trim()) {
        var brKey = br.trim().toLowerCase();
        var brandKnown = brandList.some(function (b) {
          return (b.brand_name || "").toLowerCase() === brKey;
        });
        if (!brandKnown) {
          markError("brand");
          showToast("\u201c" + br.trim() + "\u201d isn\u2019t in your brand list \u2014 pick a match or use \u201c+ Add\u201d.", true);
          var bi = brandInputEl();
          if (bi) { try { bi.focus(); } catch (_e) {} }
          renderBrandSuggest();
          return;
        }
      }
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
        // U4: the live browse overlay IS the confirmation (real photo + data a
        // member sees). Clear the draft first — a stale draft would raise the
        // restore banner when the op-bar's "New listing" brings us back. &op=1
        // is the post-list marker that gates the browse operator action bar.
        if (sku) {
          try { sessionStorage.removeItem(DRAFT_KEY); } catch (e2) {}
          window.location.href = (itemType === "toy" ? "/toys" : "/clothing") +
            "?sku=" + encodeURIComponent(sku) + "&op=1";
          return;
        }
        showToast("Listed \u2713");   // no echoed SKU (shouldn't happen) — stay put
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

  /* (U4: resetForm removed — "List another" was its only caller; the op-bar's
     "New listing" is a fresh /admin/listing page load, which resets naturally.) */

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
      // clear the colliding SKU + fetch the next free label (won't collide).
      // FORCE-FRESH (true): like the manual type-switch, this must not pull a
      // WAITING graded item into the item you're mid-listing once grading is live.
      if (skuEl) skuEl.value = "KS-";
      lastLookup = null;
      gradedForSku = "";
      prefillNextSku(true);
      if (skuEl) { try { skuEl.focus(); } catch (e) {} }
    });
  })();

  /* ---- POST-LIST CONFIRMATION ------------------------------------------- */
  /* U4 2026-07-01c: the old success panel is GONE. A successful list (and
     edit-save) redirects to the item's TYPE page at ?sku=KS-XXXXX&op=1 — the
     live browse overlay is the confirmation. The browse-side &op=1 operator
     action bar (Edit this listing -> /admin/listing?edit=SKU · New listing ->
     /admin/listing) ships in the browse half of this unit. */

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

  function prefillNextSku(forceFresh) {
    if (EDIT_MODE || !skuEl) return;
    getToken().then(function (t) {
      return fetch(FN_LOOKUP, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify(forceFresh ? { action: "next_label", fresh: true } : { action: "next_label" })
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
      if (forceFresh && mode === "graded") {
        // a manual type-switch must NEVER pull a graded item (that's the loop this
        // prevents). If the edge fn returns graded under fresh:true (e.g. a stale
        // deploy window), skip the auto-fill: leave "KS-" for manual entry, and
        // the next non-forced prefill will pick the graded item up normally.
        setSkuNote("");
        return;
      }
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
    // combo field: reflect the just-set canonical value into the visible filter
    if (root.querySelector('[data-combo="' + key + '"]')) syncComboDisplay(key);
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
      var pencil = b.id
        ? '<span class="ksl-brand-edit" data-brand-edit="' + i + '" title="Edit brand">\u270E</span>' : "";
      return '<div class="ksl-brand-opt" data-brand-idx="' + i + '">' +
               '<span class="ksl-brand-nm">' + escBrand(b.brand_name) + '</span>' +
               tier + pencil + '</div>';
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
  /* BR edit-mode context */
  var brandModalMode = "add";        // "add" | "edit"
  var brandEditId = null, brandEditOrigName = "", brandEditOrigTier = "", brandEditType = "";
  var cascadeCtx = null;             // {old_name, new_name, item_type} while confirming a cascade
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
      '<div class="ksl-brand-card mode-add">' +
        '<h3 data-bm-title>Add a brand</h3>' +
        '<p class="ksl-bm-sub ksl-bm-addsub">Adding <span class="ksl-bm-name"></span> to your permanent brand list.</p>' +
        '<div class="ksl-bm-namerow">' +
          '<p class="ksl-bm-label">Brand name</p>' +
          '<input type="text" class="ksl-bm-nameinput" autocomplete="off" spellcheck="false" />' +
        '</div>' +
        '<p class="ksl-bm-err" data-bm-err></p>' +
        '<p class="ksl-bm-label ksl-bm-tierlabel">Default tier</p>' +
        '<div class="ksl-bm-tiers">' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="essentials">essentials</button>' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="elevated">elevated</button>' +
          '<button type="button" class="ksl-bm-tier" data-bm-tier="special">special</button>' +
        '</div>' +
        '<p class="ksl-bm-warn" data-bm-warn>Saves permanently \u2014 appears for every future listing.</p>' +
        '<div class="ksl-bm-actions">' +
          '<button type="button" class="ksl-bm-cancel">Cancel</button>' +
          '<button type="button" class="ksl-bm-confirm">Add brand</button>' +
        '</div>' +
        '<div class="ksl-bm-cascade">' +
          '<p class="ksl-bm-casc-msg"></p>' +
          '<div class="ksl-bm-actions">' +
            '<button type="button" class="ksl-bm-casc-keep">Keep old name on them</button>' +
            '<button type="button" class="ksl-bm-casc-go"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.appendChild(m);
    m.querySelectorAll("[data-bm-tier]").forEach(function (b) {
      b.addEventListener("click", function () {
        brandModalTier = b.getAttribute("data-bm-tier"); paintBrandModalTiers();
      });
    });
    m.querySelector(".ksl-bm-cancel").addEventListener("click", closeBrandModal);
    // confirm dispatches by mode: add -> insert, edit -> update
    m.querySelector(".ksl-bm-confirm").addEventListener("click", function () {
      if (brandModalMode === "edit") submitBrandEdit(); else submitBrandAdd();
    });
    m.querySelector(".ksl-bm-casc-keep").addEventListener("click", function () {
      cascadeCtx = null; closeBrandModal();
      showToast("Renamed \u2014 listed items keep the old name");
    });
    m.querySelector(".ksl-bm-casc-go").addEventListener("click", runCascade);
    m.addEventListener("mousedown", function (e) { if (e.target === m) closeBrandModal(); }); // backdrop
    brandModal = m;
    return m;
  }
  function showBrandModalState(mode) {
    if (!brandModal) return;
    var card = brandModal.querySelector(".ksl-brand-card");
    card.classList.remove("mode-add", "mode-edit", "mode-cascade");
    card.classList.add("mode-" + mode);
  }
  function setBrandErr(msg) {
    if (!brandModal) return;
    var el = brandModal.querySelector("[data-bm-err]");
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.add("is-shown"); }
    else { el.textContent = ""; el.classList.remove("is-shown"); }
  }
  function openBrandModal(name) {
    name = (name || "").trim();
    if (!name) return;
    ensureBrandModal();
    brandModalMode = "add";
    setBrandErr("");
    brandModal.querySelector("[data-bm-title]").textContent = "Add a brand";
    brandModal.querySelector("[data-bm-warn]").textContent =
      "Saves permanently \u2014 appears for every future listing.";
    brandModalName = name;
    brandModal.querySelector(".ksl-bm-name").textContent = "\u201c" + name + "\u201d";
    var tEl = root.querySelector('[data-key="tier"]');
    var tv = tEl && tEl.value;          // prefill tier from the item; fall back to essentials
    brandModalTier = (tv === "essentials" || tv === "elevated" || tv === "special") ? tv : "essentials";
    paintBrandModalTiers();
    var cf = brandModal.querySelector(".ksl-bm-confirm");
    cf.disabled = false; cf.textContent = "Add brand";
    showBrandModalState("add");
    brandModal.classList.add("is-open");
    closeBrandSuggest();
  }
  function closeBrandModal() { cascadeCtx = null; if (brandModal) brandModal.classList.remove("is-open"); }
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
        pickBrand(name); closeBrandModal();
        showToast("Added \u201c" + name + "\u201d to your brand list");
        delete BRANDS_BY_TYPE[type]; loadBrands(type);   // refresh so the new row carries its id (edit needs it)
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

  /* ---- BRAND EDIT (BR) ------------------------------------------------- */
  /* Reuses the add modal in edit mode (editable name + tier, prefilled from the
     row). Keyed on the row's id (list now returns it). On save -> update; if the
     rename touches listed inventory (affected>0), swap to the cascade-confirm
     state so the operator chooses whether to rewrite those items too. */
  function openBrandEditModal(row) {
    if (!row || !row.id) {
      showToast("Reload the page to edit this brand", true);
      return;
    }
    ensureBrandModal();
    brandModalMode = "edit";
    brandEditId = row.id;
    brandEditType = row.item_type || itemType;
    brandEditOrigName = String(row.brand_name || "");
    brandEditOrigTier = String(row.default_tier || "");
    setBrandErr("");
    brandModal.querySelector("[data-bm-title]").textContent = "Edit brand";
    brandModal.querySelector("[data-bm-warn]").textContent =
      "Renaming updates future listings and your approved list. You'll be asked before any items already listed under the old name are changed.";
    var nameInput = brandModal.querySelector(".ksl-bm-nameinput");
    nameInput.value = brandEditOrigName;
    brandModalTier = (brandEditOrigTier === "essentials" || brandEditOrigTier === "elevated" ||
                      brandEditOrigTier === "special") ? brandEditOrigTier : "essentials";
    paintBrandModalTiers();
    var cf = brandModal.querySelector(".ksl-bm-confirm");
    cf.disabled = false; cf.textContent = "Save changes";
    showBrandModalState("edit");
    brandModal.classList.add("is-open");
    closeBrandSuggest();
  }
  function submitBrandEdit() {
    var cf = brandModal.querySelector(".ksl-bm-confirm");
    var nameInput = brandModal.querySelector(".ksl-bm-nameinput");
    var newName = (nameInput.value || "").trim();
    var newTier = brandModalTier;
    setBrandErr("");
    if (!newName) { setBrandErr("Brand name can\u2019t be empty."); return; }
    // no-op guard: nothing actually changed
    if (newName === brandEditOrigName && newTier === brandEditOrigTier) {
      closeBrandModal();
      return;
    }
    var id = brandEditId, type = brandEditType, oldName = brandEditOrigName;
    cf.disabled = true; cf.textContent = "Saving\u2026";
    getToken().then(function (t) {
      return fetch(FN_BRAND, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "update", id: id, brand_name: newName, default_tier: newTier })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) {
        // patch the local canonical row so the dropdown reflects the change now
        var list = BRANDS_BY_TYPE[type];
        if (Array.isArray(list)) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { list[i].brand_name = newName; list[i].default_tier = newTier; break; }
          }
        }
        renderBrandSuggest();
        if (d.name_changed && d.affected > 0) {
          openCascadeConfirm(d.old_name || oldName, d.new_name || newName, d.item_type || type, d.affected);
        } else {
          closeBrandModal();
          showToast("Saved changes to \u201c" + newName + "\u201d");
        }
      } else if (d && d.reason === "exists") {
        cf.disabled = false; cf.textContent = "Save changes";
        setBrandErr("That name already exists for " + type + ".");
      } else {
        cf.disabled = false; cf.textContent = "Save changes";
        showToast("Couldn\u2019t save that change \u2014 try again", true);
      }
    }).catch(function () {
      cf.disabled = false; cf.textContent = "Save changes";
      showToast("Network error saving brand \u2014 try again", true);
    });
  }
  function openCascadeConfirm(oldName, newName, type, affected) {
    cascadeCtx = { old_name: oldName, new_name: newName, item_type: type };
    var n = affected, word = n === 1 ? "item" : "items";
    brandModal.querySelector(".ksl-bm-casc-msg").innerHTML =
      "<b>" + escBrand(String(n)) + " listed " + word + "</b> still show the old name \u201c" +
      escBrand(oldName) + "\u201d. Update " + (n === 1 ? "it" : "them") + " to \u201c" +
      escBrand(newName) + "\u201d too?";
    var go = brandModal.querySelector(".ksl-bm-casc-go");
    go.disabled = false;
    go.textContent = "Update " + n + " " + word;
    showBrandModalState("cascade");
  }
  function runCascade() {
    if (!cascadeCtx) { closeBrandModal(); return; }
    var go = brandModal.querySelector(".ksl-bm-casc-go");
    var ctx = cascadeCtx;
    go.disabled = true; go.textContent = "Updating\u2026";
    getToken().then(function (t) {
      return fetch(FN_BRAND, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({
          action: "cascade", old_name: ctx.old_name, new_name: ctx.new_name, item_type: ctx.item_type
        })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      cascadeCtx = null; closeBrandModal();
      if (d && d.ok) {
        var u = d.updated || 0;
        showToast("Updated " + u + " listed " + (u === 1 ? "item" : "items"));
      } else {
        showToast("Rename saved, but updating listed items failed \u2014 retry from the pencil", true);
      }
    }).catch(function () {
      cascadeCtx = null; closeBrandModal();
      showToast("Rename saved, but updating listed items failed \u2014 network error", true);
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
    var pen = e.target.closest ? e.target.closest("[data-brand-edit]") : null;
    if (pen && root.contains(pen)) {
      e.stopPropagation();
      var b2 = brandMatches[parseInt(pen.getAttribute("data-brand-edit"), 10)];
      if (b2) openBrandEditModal(b2);
      return;
    }
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

  /* ---- GENERIC COMBO (searchable closed-vocab select) ------------------ */
  /* Type-to-filter over an option_lists field, modeled on the brand autocomplete
     but for a CLOSED vocab (no add-new). Activate via combo:true in SCHEMA.
     Canonical value = the HIDDEN [data-key] input, written ONLY by pickCombo, so
     a typed non-match never lands in inventory.<field>. Reads OPTION_LISTS[field]
     live (same shape as brand's BRANDS_BY_TYPE). */
  var comboMatches = {};   // field -> rows currently rendered
  function escCombo(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function comboInputEl(field)   { return root.querySelector('input[data-combo="' + field + '"]'); }
  function comboHiddenEl(field)  { return root.querySelector('input[type="hidden"][data-key="' + field + '"]'); }
  function comboResultsEl(field) { return root.querySelector('[data-combo-results="' + field + '"]'); }
  function comboRowLabel(row)    { return row.display_label || row.value || ""; }
  // option source for a combo field. clothing_size is category-dynamic: it shows
  // shoe_size when category is Shoes, clothing_size otherwise (storage stays in
  // inventory.clothing_size either way). Every other combo reads its own list.
  function comboSource(field) {
    if (field === "clothing_size") return OPTION_LISTS[isShoeCategory() ? "shoe_size" : "clothing_size"] || [];
    return OPTION_LISTS[field] || [];
  }
  function renderComboSuggest(field) {
    var inp = comboInputEl(field), box = comboResultsEl(field);
    if (!inp || !box) return;
    var q = (inp.value || "").trim().toLowerCase();
    var list = comboSource(field);
    var matches = q
      ? list.filter(function (r) { return comboRowLabel(r).toLowerCase().indexOf(q) !== -1; })
      : list.slice();
    comboMatches[field] = matches;
    var html = matches.map(function (r, i) {
      return '<div class="ksl-combo-opt" data-combo-idx="' + i + '">' + escCombo(comboRowLabel(r)) + '</div>';
    }).join("");
    if (!matches.length) html = '<div class="ksl-combo-empty">No match</div>';
    box.innerHTML = html;
    box.classList.add("is-open");
  }
  function closeComboSuggest(field) {
    var box = comboResultsEl(field);
    if (box) { box.classList.remove("is-open"); box.innerHTML = ""; }
    comboMatches[field] = [];
  }
  function closeAllCombos() {
    root.querySelectorAll("[data-combo]").forEach(function (i) { closeComboSuggest(i.getAttribute("data-combo")); });
  }
  function pickCombo(field, row) {
    setField(field, row.value);                 // HIDDEN canonical value + bubbling input -> autoName/saveDraft
    var inp = comboInputEl(field);
    if (inp) inp.value = comboRowLabel(row);     // visible filter shows the display label
    closeComboSuggest(field);
  }
  // hidden canonical value -> visible display label (draft restore / programmatic set)
  function syncComboDisplay(field) {
    var hid = comboHiddenEl(field), inp = comboInputEl(field);
    if (!hid || !inp) return;
    var v = hid.value || "";
    if (!v) { inp.value = ""; return; }
    var list = comboSource(field);
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === v) { inp.value = comboRowLabel(list[i]); return; }
    }
    inp.value = v;   // unknown/legacy value -> show raw, never blank
  }

  /* combo wiring: filter on typing/focus, pick on click, Esc/Enter, outside-close.
     Delegated; the field comes off data-combo. Typing voids any prior pick (the
     hidden value clears) until they pick again -> a half-typed filter with no pick
     is an empty value that Required validation blocks. */
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-combo") && e.isTrusted) {
      var field = t.getAttribute("data-combo");
      var hid = comboHiddenEl(field);
      if (hid && hid.value) { hid.value = ""; hid.dispatchEvent(new Event("input", { bubbles: true })); }
      renderComboSuggest(field);
    }
  });
  root.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-combo")) renderComboSuggest(t.getAttribute("data-combo"));
  });
  root.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute("data-combo")) return;
    var field = t.getAttribute("data-combo");
    if (e.key === "Escape") { closeComboSuggest(field); return; }
    var box = comboResultsEl(field);
    if (!box || !box.classList.contains("is-open")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      var m = comboMatches[field] || [];
      if (m.length) pickCombo(field, m[0]);
    }
  });
  root.addEventListener("click", function (e) {
    var opt = e.target.closest ? e.target.closest(".ksl-combo-opt") : null;
    if (!opt || !root.contains(opt)) return;
    var wrap = opt.closest("[data-combo-wrap]");
    var field = wrap ? wrap.getAttribute("data-combo-wrap") : null;
    if (!field) return;
    var row = (comboMatches[field] || [])[parseInt(opt.getAttribute("data-combo-idx"), 10)];
    if (row) pickCombo(field, row);
  });
  document.addEventListener("mousedown", function (e) {
    if (!root.querySelector(".ksl-combo-results.is-open")) return;
    var inWrap = e.target.closest ? e.target.closest("[data-combo-wrap]") : null;
    if (!inWrap) { closeAllCombos(); return; }
    var keep = inWrap.getAttribute("data-combo-wrap");
    root.querySelectorAll("[data-combo]").forEach(function (i) {
      var f = i.getAttribute("data-combo");
      if (f !== keep) closeComboSuggest(f);
    });
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

  /* ---- DUO MODE (category = "Duo") ------------------------------------- */
  /* A duo is two half-credit pieces (e.g. shirt + shorts) listed as ONE
     Essentials item, claimed for 1 credit. When category = Duo: Tier locks to
     essentials (picker disabled) and Brand + Color drop their required-asterisk
     (validate() already exempts them, since a duo may share neither). Nothing is
     hidden or moved; the form is otherwise unchanged. Leaving Duo re-enables Tier
     and restores the asterisks. Re-applied from category-input + clearItem +
     draft-restore so every entry path stays consistent. */
  function applyDuoState() {
    var catEl  = root.querySelector('[data-key="category"]');
    var isDuo  = !!catEl && catEl.value === "Duo";
    var tierEl = root.querySelector('[data-key="tier"]');
    if (tierEl) {
      if (isDuo) { tierEl.value = "essentials"; tierEl.disabled = true; }
      else       { tierEl.disabled = false; }
    }
    ["brand", "color"].forEach(function (k) {
      var req = root.querySelector('.ksl-field[data-field="' + k + '"] .ksl-req');
      if (req) req.style.display = isDuo ? "none" : "";
    });
    applyResaleVisibility();   // essentials -> resale hides, consistent with the tier lock
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
      // L3: completeness carries forward from grading (intake.is_complete).
      // Only false means "missing"; true/anything-else defaults complete.
      if (rec.is_complete !== null && rec.is_complete !== undefined) {
        setField("is_complete", rec.is_complete === false ? "missing" : "complete");
        cueField("is_complete");
      }
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
      ["Retail", (rec.retail_value != null && rec.retail_value !== "") ? ("$" + Number(rec.retail_value).toFixed(2)) : ""],
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
    var cond = $("ksl-edit-condition");   // (1c) re-grading is locked too
    if (cond) cond.disabled = true;
    var tierL = $("ksl-edit-tier");       // (L1) re-tiering is locked too
    if (tierL) tierL.disabled = true;
    var compL = $("ksl-edit-complete");   // (L3) completeness is locked too
    if (compL) compL.disabled = true;
  }
  function hideLockBanner() {
    var el = $("ksl-edit-lock");
    if (el) el.classList.add("ksl-hidden");
    var save = $("ksl-edit-save");
    if (save) save.disabled = false;
    var del = $("ksl-edit-delete");
    if (del) del.disabled = false;
    var cond = $("ksl-edit-condition");
    if (cond) cond.disabled = false;
    var tierL = $("ksl-edit-tier");
    if (tierL) tierL.disabled = false;
    var compL = $("ksl-edit-complete");
    if (compL) compL.disabled = false;
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
    editPrimaryDirty = true;    // primary changed -> regen the grid thumb on save
    renderAllSlots();
  }

  function enterEditMode(rec) {
    loadedRecord = rec;
    EDIT_MODE = true;
    editPrimaryDirty = false;   // fresh load: primary is unchanged until the operator touches it
    editThumbUrl = null;        // no regenerated thumb yet this edit
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
    var occ = $("ksl-edit-occasion");
    if (occ) { fillSelect(occ, OPTION_LISTS.occasion || []); occ.value = rec.occasion || ""; }
    var cond = $("ksl-edit-condition");
    if (cond) { fillSelect(cond, OPTION_LISTS.condition_grade || []); cond.value = rec.condition_grade || ""; }
    loadedGrade = rec.condition_grade || "";              // (1c) baseline for the photo-coupling cue
    var tierSel = $("ksl-edit-tier");                     // (L1) tier editable in edit mode
    if (tierSel) { fillSelect(tierSel, [{value:"essentials"},{value:"elevated"},{value:"special"}]); tierSel.value = rec.tier || ""; }
    loadedTier = rec.tier || "";                          // (L1) baseline for the tier-changed check
    // (L3) completeness: toy-only control; null shows as "—" (legacy/ungraded rows)
    var compW = $("ksl-edit-complete-wrap"), compS = $("ksl-edit-complete");
    if (compW) compW.classList.toggle("ksl-hidden", t !== "toy");
    loadedComplete = (rec.is_complete === true) ? "complete" : (rec.is_complete === false) ? "missing" : "";
    if (compS) compS.value = loadedComplete;
    var pnote = $("ksl-edit-photonote");
    if (pnote) pnote.classList.add("ksl-hidden");
    renderEditResale();                                  // paint stored/computed resale (or essentials label)
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

  /* (1c) edit-mode condition + resale. Recompute reuses RESALE_CONFIG (the same
     single source of truth as the insert form) against the item's STORED tier +
     retail (both read-only here) and the operator's new grade. Resale is a
     read-only computed display — the operator never types it, so a re-graded
     return can't ship at a stale hand-typed price. Essentials = no resale
     (explicit label, patch sends null). The edge-fn pricing guard validates the
     number we send; we never duplicate the config server-side. */
  function paintResaleBox(tier, val) {
    var box = $("ksl-edit-resale-display");
    if (!box) return;
    if (tier === "essentials") {
      box.textContent = "Essentials \u2014 no resale price";
      box.classList.add("is-essentials");
      return;
    }
    box.classList.remove("is-essentials");
    if (val == null || isNaN(Number(val))) {
      box.textContent = (tier === "elevated" || tier === "special")
        ? "\u2014 (no retail on record)" : "\u2014";
      return;
    }
    box.textContent = "$" + Number(val).toFixed(2);
  }

  function renderEditResale() {
    if (!loadedRecord) return;
    // (L1) tier is now editable — recompute against the SELECTED tier, falling
    // back to the loaded tier before the select exists / is filled.
    var tierSel = $("ksl-edit-tier");
    var tier = (tierSel && tierSel.value) ? tierSel.value : loadedRecord.tier;
    if (tier === "essentials") { editResaleVal = null; paintResaleBox(tier, null); return; }
    if (tier !== "elevated" && tier !== "special") {
      // legacy/unknown tier: don't invent a price, show whatever is stored
      editResaleVal = (loadedRecord.resale_value != null) ? Number(loadedRecord.resale_value) : null;
      paintResaleBox(tier, editResaleVal);
      return;
    }
    var pct = RESALE_CONFIG.tierPct[tier];
    var retail = Number(loadedRecord.retail_value);
    var gradeSel = $("ksl-edit-condition");
    var grade = gradeSel ? gradeSel.value : "";
    var factor = RESALE_CONFIG.condition[grade];
    if (factor === undefined) factor = 1.00;          // blank/unknown -> like-new (conservative)
    if (!pct || !(retail > 0)) { editResaleVal = null; paintResaleBox(tier, null); return; }
    editResaleVal = Math.round(retail * pct * factor * 100) / 100;
    paintResaleBox(tier, editResaleVal);
  }

  function onEditGradeChange() {
    renderEditResale();
    var note = $("ksl-edit-photonote");
    var sel = $("ksl-edit-condition");
    if (note && sel) note.classList.toggle("ksl-hidden", sel.value === loadedGrade);
  }

  function onEditTierChange() {
    // (L1) re-tier recomputes resale silently — no photo-coupling note (that cue
    // is condition<->photo only; a tier change doesn't imply a bad photo).
    renderEditResale();
  }

  function buildEditPatch() {
    var photos = ["front", "back", "detail"]
      .map(function (k) { return slots[k]; })
      .filter(function (r) { return r && r.status === "done"; })
      .map(function (r) { return r.url; });
    var patch = {
      status: ($("ksl-edit-status") || {}).value || "available",
      item_name: (($("ksl-edit-name") || {}).value || "").trim(),
      description: (($("ksl-edit-desc") || {}).value || "").trim(),
      bin_location: (($("ksl-edit-bin") || {}).value || "").trim(),
      featured: !!($("ksl-edit-featured") && $("ksl-edit-featured").checked),
      photo_urls: photos,                                   // front-first; server derives primary
      video_url: (video && video.status === "done") ? video.url : null,
      occasion: (($("ksl-edit-occasion") || {}).value || "")
    };
    // (1c) condition + resale ride ONLY when a grade is actually selected, so a
    // legacy null-grade row can still take a plain bin/photo edit without the
    // pricing guard engaging. resale is the CLIENT recompute (renderEditResale
    // set editResaleVal); essentials sends null, elevated/special send the
    // computed number — the edge fn validates it.
    renderEditResale();                                     // guarantee editResaleVal is fresh
    var cond = $("ksl-edit-condition");
    var grade = cond ? cond.value : "";
    var tierSel = $("ksl-edit-tier");
    var selTier = (tierSel && tierSel.value) ? tierSel.value : (loadedRecord ? loadedRecord.tier : "");
    var tierChanged = !!(loadedRecord && selTier && selTier !== loadedTier);
    // (L1) send tier ONLY when it actually changed from the loaded value — keeps
    // the legacy null-resale exemption intact (an unchanged elevated/special row
    // can still take a plain bin/photo edit without tripping the server guard).
    if (tierChanged) patch.tier = selTier;
    // condition_grade rides when a grade is selected; resale rides when a grade is
    // selected OR the tier changed. The essentials-null decision reads the
    // SELECTED tier (where the item lands), not the loaded one.
    if (grade || tierChanged) {
      if (grade) patch.condition_grade = grade;
      patch.resale_value = (selTier === "essentials") ? null : editResaleVal;
    }
    // (L3) completeness: toy records only, send ONLY when changed from the loaded
    // value (mirrors tier) — "" clears to null, otherwise boolean. Outside the
    // pricing guard server-side, so it never trips resale validation.
    var compS2 = $("ksl-edit-complete");
    if (compS2 && loadedRecord && loadedRecord.item_type === "toy" && compS2.value !== loadedComplete) {
      patch.is_complete = (compS2.value === "") ? null : (compS2.value === "complete");
    }
    // Option B grid thumb: ride only when a regen landed this save (runEditSave's
    // prelude set editThumbUrl). Omitted -> edge fn whitelist preserves the DB
    // value (the "leave untouched" branch). The client never sends null here.
    if (editThumbUrl) patch.thumbnail_url = editThumbUrl;
    return patch;
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

  /* Option B edit-mode thumb prelude — non-rejecting. Regenerate the grid thumb
     from the current Front photo ONLY when the primary changed this edit OR the
     loaded row has no thumb yet (opportunistic backfill — returns/relist re-grades
     flow through here, so the live catalog self-backfills). Else resolve with
     editThumbUrl null so buildEditPatch omits thumbnail_url and the DB value is
     preserved (no orphan churn on unchanged-primary edits). ANY failure (canvas
     taint, network, no source) -> log + resolve null -> omit -> preserve / full-res
     fallback. NEVER blocks the save. */
  function prepareEditThumb() {
    editThumbUrl = null;
    var have = !!(loadedRecord && loadedRecord.thumbnail_url);
    var front = slots.front;
    if (!(editPrimaryDirty || !have)) return Promise.resolve();   // unchanged primary + already thumbed
    if (!(front && front.objUrl)) return Promise.resolve();       // no source photo -> preserve
    return makeThumbFromUrl(front.objUrl)
      .then(function (tf) { return uploadFile(tf, "thumb"); })
      .then(function (turl) { editThumbUrl = turl; })
      .catch(function (e) { editThumbUrl = null; console.warn("[edit-thumb] skipped, preserve/full-res", e); });
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
    prepareEditThumb().then(function () {
      return getToken();
    }).then(function (t) {
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
        ["status", "primary_photo_url", "photo_urls", "video_url", "thumbnail_url",
         "bin_location", "featured", "tier", "condition_grade", "retail_value", "resale_value", "is_complete"]
          .forEach(function (k) { if (res.j.item[k] !== undefined) loadedRecord[k] = res.j.item[k]; });
        // Thumb regen (if any) is now DB truth -> clear the dirty flags so a
        // follow-up save that doesn't touch the primary skips regeneration
        // (loadedRecord.thumbnail_url is freshly populated above -> backfill
        // predicate is satisfied -> no orphan churn).
        editPrimaryDirty = false; editThumbUrl = null;
        // name + description aren't in the update .select() response — the save
        // succeeded, so the field values we sent are now DB truth.
        loadedRecord.item_name = (($("ksl-edit-name") || {}).value || "").trim();
        loadedRecord.description = (($("ksl-edit-desc") || {}).value || "").trim() || null;
        buildRefBlock(loadedRecord);
        var st = $("ksl-edit-status");
        if (st) st.value = (loadedRecord.status === "retired") ? "retired" : "available";
        // (1c) read-back: reflect DB truth, not the sent value. Sync the grade
        // select + resale box to the echoed row and clear the photo-coupling cue.
        var condEl = $("ksl-edit-condition");
        if (condEl && loadedRecord.condition_grade != null) condEl.value = loadedRecord.condition_grade;
        loadedGrade = loadedRecord.condition_grade || "";
        // (L1) sync the tier select + baseline to the echoed row, so the next
        // save computes tierChanged against DB truth (not the pre-save value).
        var tierElB = $("ksl-edit-tier");
        if (tierElB && loadedRecord.tier != null) tierElB.value = loadedRecord.tier;
        loadedTier = loadedRecord.tier || "";
        // (L3) sync the completeness select + baseline to the echoed row
        loadedComplete = (loadedRecord.is_complete === true) ? "complete"
                       : (loadedRecord.is_complete === false) ? "missing" : "";
        var compElB = $("ksl-edit-complete");
        if (compElB) compElB.value = loadedComplete;
        editResaleVal = (loadedRecord.resale_value != null) ? Number(loadedRecord.resale_value) : null;
        paintResaleBox(loadedRecord.tier, loadedRecord.resale_value);
        var pn = $("ksl-edit-photonote"); if (pn) pn.classList.add("ksl-hidden");
        // U4: edit-save confirms on the live browse overlay too. Retired items
        // land on the overlay's graceful "no longer available" fallback.
        window.location.href = ((loadedRecord && loadedRecord.item_type === "toy") ? "/toys" : "/clothing") +
          "?sku=" + encodeURIComponent(sku) + "&op=1";
        return;
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

  /* ---- RETURNS / RELIST LOOKUP (G build 3, client half) ----------------
   * Operator types a member name/email -> member-lookup edge fn (flat
   * {ok,mode,...}) -> render that member's currently-out items as cards with a
   * photo thumbnail (null-safe) + visible SKU (the safety rail: match the
   * picture/tag in hand before tapping) -> tap routes to the PROVEN
   * inventory-edit "resolve":
   *   clothing -> publish (one tap, straight back to available/live)
   *   toy      -> stage   (-> retired workshop; edit condition via Manage-Item,
   *                        then publish)
   *   any      -> keep    (never-returned terminal; confirm-gated)
   * The list is self-cleaning server-side (resolve flips inventory off
   * status='claimed'); the client drops the card optimistically on success and
   * re-fetches on a 409 (the row changed under us). Member disambiguation +
   * snag-7 empty split are mode-driven off the single RPC. */
  var LOOKUP_MODE = false;
  var lookupMember = null;   // {member_id, display_name, email} once an items view is shown (drives re-fetch)

  /* swap insert/manage chrome <-> the lookup panel (mirrors setEditChrome) */
  function setLookupChrome(on) {
    var tgl = root.querySelector(".ksl-toggle");
    var det = root.querySelector(".ksl-details");
    var photos = root.querySelector("[data-photos-card]");
    var mng = $("ksl-manage");
    var pnl = $("ksl-lookup-panel");
    var rest = $("ksl-restore");
    if (tgl) tgl.classList.toggle("ksl-hidden", on);
    if (det) det.classList.toggle("ksl-hidden", on);
    if (photos) photos.classList.toggle("ksl-hidden", on);
    if (submitBtn) submitBtn.classList.toggle("ksl-hidden", on);
    if (mng) mng.classList.toggle("ksl-hidden", on);
    if (pnl) pnl.classList.toggle("ksl-hidden", !on);
    if (on && rest) rest.classList.add("ksl-hidden");
  }

  function enterLookupMode() {
    if (EDIT_MODE) exitEditMode();          // the two operator surfaces are mutually exclusive
    LOOKUP_MODE = true;
    lookupMember = null;
    var res = $("ksl-lookup-results"); if (res) res.innerHTML = "";
    var inp = $("ksl-lookup-input"); if (inp) inp.value = "";
    setLookupChrome(true);
    if (inp) inp.focus();
  }

  function exitLookupMode() {
    LOOKUP_MODE = false;
    lookupMember = null;
    setLookupChrome(false);
  }

  function lookupEmpty(msg) {
    var res = $("ksl-lookup-results");
    if (res) res.innerHTML = '<div class="ksl-lookup-empty">' + esc(msg) + "</div>";
  }

  /* one call covers both the name/email search ({search}) and the post-picker
     resolve to a single member ({member_id}); fromPicker suppresses the
     "Searching…" wipe so a re-fetch doesn't flash. */
  function runMemberSearch(payload, fromPicker) {
    var res = $("ksl-lookup-results");
    var go = $("ksl-lookup-go");
    if (res && !fromPicker) res.innerHTML = '<div class="ksl-lookup-empty">Searching\u2026</div>';
    if (go && !fromPicker) { go.disabled = true; go.textContent = "Searching\u2026"; }
    getToken().then(function (t) {
      return fetch(FN_MEMBER_LOOKUP, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify(payload)
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res2) {
      if (!(res2.ok && res2.j && res2.j.ok)) {
        lookupEmpty("Lookup failed — see console");
        console.error("[member-lookup]", res2);
        return;
      }
      renderLookup(res2.j);
    }).catch(function (e) {
      lookupEmpty("Network error — see console");
      console.error("[member-lookup]", e);
    }).finally(function () {
      if (go) { go.disabled = false; go.textContent = "Search"; }
    });
  }

  function renderLookup(d) {
    if (d.mode === "no_match") {
      lookupMember = null;
      lookupEmpty("No member matched that name or email.");   // snag-7: nobody matched
      return;
    }
    if (d.mode === "disambiguate") { lookupMember = null; renderDisambiguate(d); return; }
    if (d.mode === "items") { lookupMember = d.member || null; renderItems(d); return; }
    lookupEmpty("Unexpected response — see console");
    console.error("[member-lookup] unknown mode", d);
  }

  function renderDisambiguate(d) {
    var res = $("ksl-lookup-results");
    if (!res) return;
    var members = Array.isArray(d.members) ? d.members : [];
    var html = "";
    if (typeof d.match_count === "number" && d.match_count > members.length) {
      html += '<div class="ksl-lookup-trunc">Showing ' + members.length + " of " + d.match_count +
              " matches — narrow the search to see the rest.</div>";
    }
    members.forEach(function (m) {
      var n = (m.out_count === 1) ? "1 item out" : ((m.out_count || 0) + " items out");
      html += '<div class="ksl-disrow" data-member="' + esc(m.member_id) + '">' +
                "<div><div class=\"ksl-disrow-name\">" + esc(m.display_name || "(no name)") + "</div>" +
                '<div class="ksl-disrow-email">' + esc(m.email || "") + "</div></div>" +
                '<div class="ksl-disrow-count">' + esc(n) + "</div>" +
              "</div>";
    });
    res.innerHTML = html || '<div class="ksl-lookup-empty">No members to show.</div>';
  }

  function renderItems(d) {
    var res = $("ksl-lookup-results");
    if (!res) return;
    var m = d.member || {};
    var items = Array.isArray(d.items) ? d.items : [];
    var head = '<div class="ksl-lookup-memberhead">' +
                 '<div class="ksl-lookup-mh-name">' + esc(m.display_name || "(no name)") + "</div>" +
                 '<div class="ksl-lookup-mh-email">' + esc(m.email || "") + "</div>" +
               "</div>";
    if (!items.length) {
      // snag-7: member matched, but nothing currently out — opposite of no_match
      res.innerHTML = head + '<div class="ksl-lookup-empty">This member has nothing currently out.</div>';
      return;
    }
    res.innerHTML = head + items.map(outCardHtml).join("");
    // null-fallback thumbnails (primary_photo_url can be NULL — proven on
    // KS-00002): swap a failed/empty image for the SKU+name fallback tile.
    res.querySelectorAll("img.ksl-outcard-thumb").forEach(function (img) {
      img.addEventListener("error", function () {
        var ph = document.createElement("div");
        ph.className = "ksl-outcard-thumb is-empty";
        ph.textContent = "no photo";
        if (img.parentNode) img.parentNode.replaceChild(ph, img);
      });
    });
  }

  function outCardHtml(it) {
    var isToy = (it.item_type === "toy");
    var sizeVal = isToy ? (it.toy_age_range || "") : (it.clothing_size || "");
    var meta = [it.tier, it.category, sizeVal].filter(Boolean).join(" \u00b7 ");
    var claimed = it.date_claimed ? ("out since " + String(it.date_claimed).slice(0, 10)) : "";
    var metaLine = [meta, claimed].filter(Boolean).join(" \u00b7 ");
    var thumb = it.primary_photo_url
      ? '<img class="ksl-outcard-thumb" src="' + esc(it.primary_photo_url) + '" alt="">'
      : '<div class="ksl-outcard-thumb is-empty">no photo</div>';
    var primaryLabel = isToy ? "Stage for workshop" : "Relist now";
    var primaryMode  = isToy ? "stage" : "publish";
    return '<div class="ksl-outcard" data-sku="' + esc(it.sku) + '">' +
             thumb +
             '<div class="ksl-outcard-body">' +
               '<div class="ksl-outcard-sku">' + esc(it.sku) + "</div>" +
               '<div class="ksl-outcard-name">' + esc(it.item_name || "(unnamed)") + "</div>" +
               (metaLine ? '<div class="ksl-outcard-meta">' + esc(metaLine) + "</div>" : "") +
               '<div class="ksl-outcard-actions">' +
                 '<button type="button" class="ksl-outcard-primary" data-resolve="' + primaryMode + '">' + primaryLabel + "</button>" +
                 '<button type="button" class="ksl-outcard-keep" data-resolve="keep">Mark kept</button>' +
               "</div>" +
             "</div>" +
           "</div>";
  }

  /* tap -> the proven inventory-edit resolve (action:"resolve"); keep is
     terminal so it's confirm-gated. On success drop the card (self-cleaning);
     on a 409 the row already moved -> re-fetch this member to resync. */
  function runResolve(sku, mode, cardEl) {
    if (!sku || !mode) return;
    if (mode === "keep") {
      var ok = window.confirm(
        "Mark " + sku + " as kept?\n\n" +
        "Use this only when the item will NOT come back to inventory (member is " +
        "keeping it, or it's lost / lost in the mail). This is final — it won't be relisted."
      );
      if (!ok) return;
    }
    if (cardEl) cardEl.classList.add("is-busy");
    getToken().then(function (t) {
      return fetch(FN_EDIT, {
        method: "POST",
        headers: {
          "x-ms-token": t, "content-type": "application/json",
          "apikey": ANON, "authorization": "Bearer " + ANON
        },
        body: JSON.stringify({ action: "resolve", sku: sku, mode: mode })
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j && res.j.ok) {
        var msg = (mode === "publish") ? ("Relisted " + sku + " — live on browse")
                : (mode === "stage")   ? ("Staged " + sku + " — edit + publish from Manage-Item")
                : ("Marked " + sku + " kept");
        showToast(msg + " \u2713");
        dropCard(cardEl);
      } else if (res.status === 409 && res.j && res.j.error === "not_claimed") {
        showToast(sku + " isn't out anymore — refreshing", true);
        if (cardEl) cardEl.classList.remove("is-busy");
        refreshLookup();
      } else if (res.status === 409 && res.j && res.j.error === "concurrent_change") {
        showToast(sku + " changed under you — refreshing", true);
        if (cardEl) cardEl.classList.remove("is-busy");
        refreshLookup();
      } else {
        var em = (res.j && res.j.error) || ("status " + res.status);
        showToast("Couldn't resolve " + sku + " — " + em, true);
        if (cardEl) cardEl.classList.remove("is-busy");
        console.error("[resolve]", res);
      }
    }).catch(function (e) {
      showToast("Network error — see console", true);
      if (cardEl) cardEl.classList.remove("is-busy");
      console.error("[resolve]", e);
    });
  }

  function dropCard(cardEl) {
    if (!cardEl || !cardEl.parentNode) return;
    var container = cardEl.parentNode;
    container.removeChild(cardEl);
    if (!container.querySelector(".ksl-outcard")) {
      var note = document.createElement("div");
      note.className = "ksl-lookup-empty";
      note.textContent = "All caught up — this member has nothing else out.";
      container.appendChild(note);
    }
  }

  function refreshLookup() {
    if (lookupMember && lookupMember.member_id) {
      runMemberSearch({ member_id: lookupMember.member_id }, true);
    }
  }

  (function wireLookup() {
    var entry = $("ksl-mng-returns");
    if (entry) entry.addEventListener("click", enterLookupMode);
    var back = $("ksl-lookup-back");
    if (back) back.addEventListener("click", function (e) { e.preventDefault(); exitLookupMode(); });
    var go = $("ksl-lookup-go");
    function fire() {
      var inp = $("ksl-lookup-input");
      var q = (inp ? inp.value : "").trim();
      if (q.length < 2) { showToast("Type at least 2 characters", true); return; }   // mirrors the server floor
      runMemberSearch({ search: q }, false);
    }
    if (go) go.addEventListener("click", fire);
    var inp = $("ksl-lookup-input");
    if (inp) inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); fire(); }
    });
    var res = $("ksl-lookup-results");
    if (res) res.addEventListener("click", function (e) {
      var disrow = e.target.closest ? e.target.closest(".ksl-disrow") : null;
      if (disrow && res.contains(disrow)) {
        var mid = disrow.getAttribute("data-member");
        if (mid) runMemberSearch({ member_id: mid }, true);
        return;
      }
      var btn = e.target.closest ? e.target.closest("[data-resolve]") : null;
      if (btn && res.contains(btn)) {
        var card = btn.closest(".ksl-outcard");
        runResolve(card ? card.getAttribute("data-sku") : null, btn.getAttribute("data-resolve"), card);
      }
    });
  })();

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
    var condSel = $("ksl-edit-condition");   // (1c) recompute resale + photo cue on re-grade
    if (condSel) condSel.addEventListener("input", onEditGradeChange);
    var tierSelW = $("ksl-edit-tier");       // (L1) recompute resale on re-tier
    if (tierSelW) tierSelW.addEventListener("input", onEditTierChange);
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
      prefillNextSku();   // discarding a draft must seed the next SKU (was: stuck on "KS-" until refresh)
      armPhotoFirst();    // ...and re-arm the photos-first nudge, mirroring the no-draft init path
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
      // U4: ?edit=KS-XXXXX deep-link (the browse op-bar "Edit this listing"
      // path) -> auto-load Manage-Item edit mode. Runs after option_lists
      // settles so enterEditMode's selects fill with real options. Takes
      // precedence over SKU prefill; the listing tool's admin gate + the
      // operator-gated inventory-edit fn are the real security, not this param.
      var editParam = null;
      try { editParam = new URLSearchParams(window.location.search).get("edit"); } catch (e) {}
      if (editParam) {
        var mng = $("ksl-mng-sku");
        if (mng) mng.value = editParam;
        runManageLoad();
        return;
      }
      // Auto-advance the SKU only when there's no draft waiting to restore
      // (a draft owns the SKU; the restore banner handles it). Runs after
      // option_lists settles so the graded-data pull writes into ready selects.
      if (!hasDraft()) { prefillNextSku(); armPhotoFirst(); }
    });
  // warm the token early so first upload is instant
  getToken().catch(function () {});
})();
