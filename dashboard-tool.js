(function () {
	/* ---- BUILD STAMP --------------------------------------------------------
   * Print the live jsDelivr pin on load, parsed from THIS script's own src —
   * always reflects the actual @<sha> running, no manual bump, never stale.
   * Wrapped so a stamp failure can never break the app. */
  try {
    var __ksScript = document.currentScript;
    if (!__ksScript) {
      var __ksScripts = document.getElementsByTagName('script');
      for (var __ksJ = 0; __ksJ < __ksScripts.length; __ksJ++) {
        if (__ksScripts[__ksJ].src && __ksScripts[__ksJ].src.indexOf('dashboard-tool.js') !== -1) {
          __ksScript = __ksScripts[__ksJ]; break;
        }
      }
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : '';
    var __ksPin = (__ksSrc.match(/@([^/]+)\/dashboard-tool\.js/) || [])[1] || 'unknown';
    console.log('%c[ks-dash] build ' + __ksPin, 'color:#d24f28;font-weight:600', __ksSrc || '(no src)');
  } catch (__ksErr) {}
  var FN_URL  = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/member-state";
  var PREF_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/member-pref";
var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM";
  function fmt(v) { return (v === undefined || v === null || v === '') ? '0' : v; }
  function setText(sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

 // ---------- GREETING ----------
  var GREET = {
    cancelled: { sub: "Your membership won't renew. Reactivate anytime to pick up where you left off.", cta: "Reactivate",        mode: "manage",                  accent: false },
    paused:    { sub: "Your membership is paused. Your credits are safe and waiting.",                  cta: "Resume membership", mode: "manage",                  accent: false },
    capped:    { sub: "You've used this cycle's swaps \u2014 your credits are safe for next cycle.",      cta: "See what's new",    mode: "closet", href: "/browse", accent: false },
    expiring:  { sub: "Some credits are expiring soon. Don't let them slip away.",                       cta: "Browse the closet", mode: "closet", href: "/browse", accent: true  },
    active:    { sub: "Your closet's ready when you are.",                                               cta: "Browse the closet", mode: "closet", href: "/browse", accent: false },
    zero:      { sub: "Send in a bag to earn credits and start swapping.",                               cta: "Browse the closet", mode: "closet", href: "/browse", accent: false }
  };

  function fallbackHeadline() {
    var h = document.querySelector('.ks-greet-headline');
    if (h) h.textContent = 'Welcome back';
  }

function paintHeadline(member) {
    _member = member;          // the review prompt needs this; it lands on its own promise
    paintProfile(member);      // ⚠ MUST BE CALLED HERE, ABOVE THE EARLY RETURNS. Two of them
                               // sit below this line (no .ks-greet-headline element; no
                               // first-name). Either one would silently skip Profile — which
                               // is precisely the shape of bug that left it unbuilt for months.
    var fname = '';
    try { fname = (member && member.data && member.data.customFields && member.data.customFields['first-name']) || ''; } catch (e) {}
    fname = (typeof fname === 'string') ? fname.trim() : '';
    var h = document.querySelector('.ks-greet-headline');
    if (!h) return;
    if (!fname) { h.textContent = 'Welcome back'; return; }
    var hr = new Date().getHours();
    var t = hr < 12 ? 'Good morning' : (hr < 18 ? 'Good afternoon' : 'Good evening');
    h.textContent = t + ', ' + fname;
    paintReviewPrompt();       // whichever promise lands second is the one that paints
  }
  
  function pickState(s) {
    var override = new URLSearchParams(window.location.search).get('state');
    var valid = ['cancelled','paused','capped','expiring','active','zero'];
    if (override && valid.indexOf(override) !== -1) return override;
    var ms = (s.member_status || '').toLowerCase();
    if (ms === 'cancelled') return 'cancelled';
    if (ms === 'paused')    return 'paused';
    var sig = s.signals || {};
    if (sig.is_capped)     return 'capped';
    if (sig.expiring_soon) return 'expiring';
    if (sig.has_credits)   return 'active';
    return 'zero';
  }
 // The destination lives in the CONFIG, not in Webflow. The old closet branch
  // trusted an "existing closet href" that never existed — the button rendered
  // perfectly and went nowhere on active/capped/expiring/zero, live, for weeks.
  // A state must never be able to paint a CTA with no destination.
  function setCTA(text, mode, href) {
    var cta = document.querySelector('.ks-greet-cta');
    if (!cta) return;
    cta.textContent = text;
  if (mode === 'manage') {
      cta.removeAttribute('href');
      cta.style.cursor = 'pointer';
      cta.onclick = function (e) {
        // ⚠⚠ BUG FIXED 2026-07-13. This used to scroll to .ks-section--membership. That
        // card is now display:none (its guts moved to the utility row), and
        // scrollIntoView ON A HIDDEN ELEMENT DOES NOTHING — so a cancelled or paused
        // member tapped "Reactivate" and the page just sat there. It shipped live in
        // @80dfafc. The manage control is now the utility row's link, so point at THAT.
        // ⚠ Never point this at an element that can be hidden. Fail loudly, not silently.
        e.preventDefault();
        var m = document.querySelector('.ks-util .ks-membership-manage') ||
                document.querySelector('.ks-membership-manage');
        if (!m) return;
        m.scrollIntoView({ behavior: 'smooth', block: 'center' });
        m.classList.add('is-flagged');
        setTimeout(function () { m.classList.remove('is-flagged'); }, 2200);
      };
    } else {
      cta.onclick = null;
      cta.setAttribute('href', href || '/browse');
    }
  }
  function paintGreeting(s) {
    var cfg = GREET[pickState(s)] || GREET.active;
    var sub = document.querySelector('.ks-greet-sub');
    if (sub) {
      sub.textContent = cfg.sub;
      sub.classList.toggle('ks-greet-accent', cfg.accent === true);
    }
    setCTA(cfg.cta, cfg.mode, cfg.href);
  }
  function neutralGreeting() {
    var sub = document.querySelector('.ks-greet-sub');
    if (sub) { sub.textContent = "Here's where things stand."; sub.classList.remove('ks-greet-accent'); }
  }
  var _revealed = false;
  function reveal() {
    _revealed = true;
    document.documentElement.setAttribute('data-ks-ready', '1');
    runTumbles();                 // never reveal an armed-but-unspun coin
  }

  // ---------- COINS (by_class hero + entrance tumble) ----------
  var COIN_FRAMES = [
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b690af665b710e72397_1.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69f8963de4ade9c6f3_2.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b690d55ec781cc518be_3.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b6915f14827ff280f72_4.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69d6108c2bd6c11b3f_5.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69f8963de4ade9c6f6_6.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b69de57bb0d285396f3_7.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b691aee406df1bd0bda_8.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b693f83baa40803c070_9.png",
    "https://cdn.prod.website-files.com/69c8a3bec63e739bf6cbf213/6a519b697caae2e0fb664fee_10.png"
  ];
  // preload so the first spin doesn't flicker
  var _coinPreload = COIN_FRAMES.map(function (u) { var im = new Image(); im.src = u; return im; });
  // spin path: front(1) -> back(10) -> front(1); lands flat on frame 1 where the number sits
  var COIN_SPIN = [0,1,2,3,4,5,6,7,8,9,8,7,6,5,4,3,2,1,0];
  var COIN_REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var _coinToTumble = [];

  function coinTierString(obj) {
 var order = [['essentials', 'Essential', 'Essentials'], ['elevated', 'Elevated', 'Elevated'], ['special', 'Special', 'Special']];
    var parts = [];
    order.forEach(function (t) {
      var n = parseFloat(obj && obj[t[0]]);
      if (!isNaN(n) && n > 0) parts.push(String(n) + ' ' + (n === 1 ? t[1] : t[2]));
    });
 return parts.join(' \u00B7 ');
  }

  function coinTierHTML(obj) {
    var order = [['essentials','Essential','Essentials','ks-dot--ess'],
                 ['elevated','Elevated','Elevated','ks-dot--elev'],
                 ['special','Special','Special','ks-dot--spec']];
    var rows = [];
    order.forEach(function (t) {
      var n = parseFloat(obj && obj[t[0]]);
      if (!isNaN(n) && n > 0) {
        rows.push('<span class="ks-tier-row"><i class="ks-dot ' + t[3] + '"></i>' +
                  String(n) + ' ' + (n === 1 ? t[1] : t[2]) + '</span>');
      }
    });
    return rows.join('');
  }

function cycleLineString(s) {
    var cyc = s.cycle || {};
    var reset = cyc.cycle_reset ? fmtDate(cyc.cycle_reset) : '';
    return reset ? ('Your cycle resets ' + reset) : '';
  }

  function swapsReadyString(s) {
    var av = s.available_this_cycle || {};
    var c = parseFloat(av.clothing); if (isNaN(c)) c = 0;
    var t = parseFloat(av.toy);      if (isNaN(t)) t = 0;
    var parts = [];
    if (c > 0) parts.push('<b>' + c + ' clothing swap' + (c === 1 ? '' : 's') + '</b>');
    if (t > 0) parts.push('<b>' + t + ' toy swap' + (t === 1 ? '' : 's') + '</b>');
    if (!parts.length) return '';
    return 'You have ' + parts.join(' and ') + ' ready to use this cycle';
  }

  function paintSwapsReady(s) {
    var row = document.querySelector('.ks-coins-row');
    if (!row || !row.parentNode) return;
    var line = document.querySelector('.ks-swaps-ready');
    if (!line) {
      line = document.createElement('div');
      line.className = 'ks-swaps-ready';
      row.parentNode.insertBefore(line, row);
    }
    var txt = swapsReadyString(s);
    if (!txt) { line.style.display = 'none'; return; }
    line.style.display = '';
    line.innerHTML = txt;
  }

  function paintCycleLine(s) {
    var row = document.querySelector('.ks-coins-row');
    var line = document.querySelector('.ks-cycle-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'ks-cycle-line';
      if (row && row.parentNode) row.parentNode.insertBefore(line, row.nextSibling);
    }
    line.style.cssText = 'margin:14px 0 0;font-size:14px;color:#8A897F;text-align:center;';
    line.textContent = cycleLineString(s);
   var old = document.querySelector('.ks-section--available');
    if (old) old.style.display = 'none';
  }

  function paintCycleBar(s) {
    var cyc = s.cycle || {};
    var line = document.querySelector('.ks-cycle-line');
    if (!line || !line.parentNode) return;
    var wrap = document.querySelector('.ks-cycle-bar-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ks-cycle-bar-wrap';
      wrap.innerHTML =
        '<div class="ks-cycle-bar-head">' +
          '<span class="ks-cycle-bar-label">This cycle</span>' +
          '<span class="ks-cycle-bar-left"></span>' +
        '</div>' +
        '<div class="ks-cycle-bar-track"><i class="ks-cycle-bar-fill"></i></div>';
      line.parentNode.insertBefore(wrap, line);
    }
    var start = cyc.cycle_start ? new Date(cyc.cycle_start).getTime() : NaN;
    var end   = cyc.cycle_reset ? new Date(cyc.cycle_reset).getTime() : NaN;
    if (isNaN(start) || isNaN(end) || end <= start) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    var now = Date.now();
    var pct = ((now - start) / (end - start)) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    var daysLeft = Math.ceil((end - now) / 86400000);
    if (daysLeft < 0) daysLeft = 0;
    var leftEl = wrap.querySelector('.ks-cycle-bar-left');
    if (leftEl) {
      leftEl.innerHTML = (daysLeft === 0)
        ? '<b>Resets today</b>'
        : '<b>' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + '</b> left';
    }
    var fill = wrap.querySelector('.ks-cycle-bar-fill');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
  }

function paintBankLabel() {
    var row = document.querySelector('.ks-coins-row');
    if (!row || !row.parentNode) return;
    var label = document.querySelector('.ks-bank-label');
    if (!label) {
      label = document.createElement('div');
      label.className = 'ks-bank-label';
      row.parentNode.insertBefore(label, row);
    }
label.style.cssText = 'font-size:14px;letter-spacing:2px;color:#5F5E5A;text-transform:uppercase;text-align:center;margin:28px 0 8px;';
label.textContent = 'your credit bank';
  }

  var PLAN_PRICE = { 'basics': 30, 'toy chest': 45, 'full wardrobe': 45, 'everything bag': 70 };

  function paintPlanChip(s) {
    var sub = document.querySelector('.ks-greet-sub');
    if (!sub || !sub.parentNode) return;
    var chip = document.querySelector('.ks-plan-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'ks-plan-chip';
      sub.parentNode.insertBefore(chip, sub.nextSibling);
    }
    var raw = (s && s.plan) ? String(s.plan).trim() : '';
    var key = raw.toLowerCase().replace(/^the\s+/, '');
    var price = PLAN_PRICE[key];
    if (!raw || price === undefined) { chip.style.display = 'none'; return; }
    chip.style.display = '';
    chip.textContent = raw + ' \u00B7 $' + price + '/mo';
  }

function paintCoins(s) {
    _coinToTumble = [];

    var byClass = (s.bank && s.bank.by_class) || {};
    var byClassTier = (s.bank && s.bank.by_class_tier) || {};
    var caps = s.caps || {};
    document.querySelectorAll('[data-coin]').forEach(function (el) {
      var key = el.getAttribute('data-coin');
      var n = parseFloat(byClass[key]);
      if (isNaN(n)) n = 0;
      el.textContent = String(n);                 // 2 -> "2", 1.5 -> "1.5", 0 -> "0"
      var unit = el.closest('.ks-coin-unit');
      // Show a coin if the PLAN allows this class, or if the member OWNS credits in it.
      // A zero coin is a promise: a day-one member sees the shape of the thing they'll fill.
      // The owns-it half only fires on a downgrade, so a member never loses sight of real credits.
      var cap = parseFloat(caps[key]); if (isNaN(cap)) cap = 0;
     var show = (cap > 0) || (n > 0);
      if (unit) { unit.style.display = show ? 'flex' : 'none'; unit.style.visibility = 'visible'; }
      if (!show || !unit) return;
	// tier breakdown: always shown, one tier per line, under the label
      var tierEl = unit.querySelector('.ks-coin-tier');
      if (!tierEl) {
        tierEl = document.createElement('div');
        tierEl.className = 'ks-coin-tier';
        unit.appendChild(tierEl);
      }
// Reserve tier space only when there ARE tiers. A zero coin has nothing to list,
      // so the 54px reserve would hold open an empty gap under the label.
      // The coins stay level via align-items:flex-start on .ks-coins-row, not via this reserve.
      var tierHTML = coinTierHTML(byClassTier[key]);
      var tierReserve = tierHTML ? '54px' : '0px';
      tierEl.style.cssText = 'margin-top:' + (tierHTML ? '6px' : '0') + ';font-size:12px;line-height:1.7;color:#75736E;min-height:' + tierReserve + ';display:flex;flex-direction:column;align-items:flex-start;width:fit-content;margin-left:auto;margin-right:auto;';
      tierEl.innerHTML = tierHTML;
      var img = unit.querySelector('.ks-coin-img');
      if (COIN_REDUCE) {                           // reduced-motion: still coin, number shown
        if (img) img.src = COIN_FRAMES[0];
        el.style.opacity = '1';
        return;
      }
   if (img) img.src = COIN_FRAMES[0];           // arm on the flat face
      el.style.opacity = '0';                      // hide number until it settles
      // An ARMED coin has no number on it. Keep it invisible until its spin actually
      // starts, so a blank gold disc can never be on screen no matter how the load times
      // fall. visibility (not display) keeps its layout space, so the card doesn't jump.
      unit.style.visibility = 'hidden';
      _coinToTumble.push(unit);
    });
  }

  function tumbleCoin(unit, delay) {
    var coin = unit.querySelector('.ks-coin');
    var img  = unit.querySelector('.ks-coin-img');
    var num  = unit.querySelector('.ks-coin-num');
    if (!coin || !img || !num) return;
   setTimeout(function () {
      unit.style.visibility = 'visible';           // the coin appears WITH its spin, never before
      if (coin.animate) {                          // vertical drop-in + settle bounce                          // vertical drop-in + settle bounce
        coin.animate([
          { transform: 'translateY(-24px)', opacity: 0.4 },
          { transform: 'translateY(0)',     opacity: 1, offset: 0.55 },
          { transform: 'translateY(-6px)',  offset: 0.72 },
          { transform: 'translateY(0)',     offset: 0.86 },
          { transform: 'translateY(-2px)',  offset: 0.94 },
          { transform: 'translateY(0)' }
        ], { duration: 650, easing: 'ease-out' });
      }
      var i = 0;                                   // spin the frames 1 -> 10 -> 1
      var spin = setInterval(function () {
        img.src = COIN_FRAMES[COIN_SPIN[i]];
        i++;
        if (i >= COIN_SPIN.length) { clearInterval(spin); img.src = COIN_FRAMES[0]; }
      }, 26);
      setTimeout(function () {                      // number fades in on the flat face
        num.style.transition = 'opacity 200ms ease-out';
        num.style.opacity = '1';
      }, 460);
    }, delay || 0);
  }

  function runTumbles() {
    if (!_coinToTumble.length) return;
    var list = _coinToTumble.slice();
    _coinToTumble = [];
   requestAnimationFrame(function () {
      list.forEach(function (unit, idx) { tumbleCoin(unit, idx * 120); });  // 120ms stagger
    });
    // WATCHDOG: a coin must never sit blank. If a number is still hidden after the
    // longest tumble could have landed, just show it. Covers a dropped rAF, a
    // backgrounded tab, or any future path that arms a coin and forgets to spin it.
  setTimeout(function () {
      list.forEach(function (unit) {
        unit.style.visibility = 'visible';
        var n = unit.querySelector('.ks-coin-num');
        if (n && n.style.opacity === '0') n.style.opacity = '1';
      });
    }, 1500);
  }

  // ---------- CARDS ----------
  function paint(s) {
    var bt = (s.bank && s.bank.by_tier) || {};
    var line = document.querySelector('.credit-line');
    if (line) {
      var parts = [];
      [[bt.essentials, 'Essentials'],
       [bt.elevated,   'Elevated'],
       [bt.special,    'Special']].forEach(function (t) {
        var n = parseFloat(t[0]);
        if (!isNaN(n) && n > 0) {
          parts.push(t[0] + ' ' + t[1] + ' credit' + (n === 1 ? '' : 's'));
        }
      });
      line.textContent = parts.length ? parts.join(', ') : '0 credits';
    }
    var essNum = parseFloat(bt.essentials);
    var note = document.querySelector('.ks-partial-note');
    if (note) {
      note.style.display = (!isNaN(essNum) && essNum % 1 !== 0) ? 'block' : 'none';
    }
    var expiry = s.expiry || {};
    var numEl  = document.querySelector('.expiry-num');
    var dateEl = document.querySelector('.expiry-date');
    if (numEl)  numEl.textContent  = fmt(expiry.expiring_soon_count) + ' ';
    if (dateEl) dateEl.textContent = fmtDate(expiry.next_expiration_date);
    var wrap = document.querySelector('[data-expiry-wrap="true"]');
    if (wrap) {
      var n = parseFloat(expiry.expiring_soon_count);
      wrap.style.display = (!expiry.expiring_soon_count || isNaN(n) || n === 0) ? 'none' : '';
    }
    setText('.ks-membership-plan', s.plan || '');
   var status = s.member_status || '';
    setText('.ks-membership-status', status ? (status.charAt(0).toUpperCase() + status.slice(1)) : '');
    var stEl = document.querySelector('.ks-membership-status');
    if (stEl) {
      var st = status.toLowerCase();
      if (st === 'cancelled' || st === 'paused') stEl.setAttribute('data-tone', 'off');
      else stEl.removeAttribute('data-tone');
    }
    var av = s.available_this_cycle || {};
    var caps = s.caps || {};
    setText('.ks-avail-total', fmt(av.total) + ' swaps');
    setText('.ks-avail-clothing', 'Clothing: ' + fmt(av.clothing));
    setText('.ks-avail-toy', 'Toys: ' + fmt(av.toy));
    var toyWrap = document.querySelector('.ks-avail-toy-wrap');
    if (toyWrap) toyWrap.style.display = (parseFloat(caps.toy) > 0) ? '' : 'none';
    var cyc = s.cycle || {};
    setText('.ks-avail-reset', 'Resets ' + fmtDate(cyc.cycle_reset));

   // ---------- SHIPPING (Section 10) ----------
    // The render logic lives in renderShipping() so the ADDRESS EDIT block can reuse it
    // after a save (2026-07-13, §ADDR). ONE source of truth for how an address looks.
    renderShipping(s.shipping);

    // ---------- LIFETIME / IMPACT ----------
    // The $ value line was DELETED 2026-07-12 — the hero savings inset already paints
    // lifetime.value_received, louder and better. Do not re-add it here.
    // items_kept_from_landfill counts INTAKE (accepted_at_grading OR donated) = what she
    // SENT IN. It is NOT items received. The old "kept out of a landfill" copy was an
    // unprovable environmental claim (§2) and is dead.
    var lt = s.lifetime || {};

    var sent = Number(lt.items_kept_from_landfill) || 0;
    setText('.ks-lifetime-landfill', fmt(sent));
    setText('.ks-lifetime-landfill-label',
      (sent === 1 ? 'item' : 'items') + " you've passed on to another family");

    var earned = Number(lt.credits_earned) || 0;
    setText('.ks-lifetime-credits', fmt(earned));
    setText('.ks-lifetime-credits-label',
      (earned === 1 ? 'credit' : 'credits') + ' earned to date');

    setText('.ks-lifetime-since', 'Member since ' + fmtDate(lt.member_since));

  paintPlanChip(s);
    paintBankLabel();
    paintSwapsReady(s);
    paintCoins(s);
	paintCycleLine(s);
    paintCycleBar(s);
	paintSavings(s);
    paintCloset(s);
    paintHowCredits();
    paintActivity(s);
    _state = s;
    paintReviewPrompt();
   paintChildren(s);
    paintEmailPrefs(s);

    // If the 4s failsafe already revealed the page (slow Memberstack, slow fetch), the
    // coins are being armed onto a VISIBLE page. Spin them now instead of waiting on
    // Promise.allSettled - that wait is exactly what left them sitting blank.
    if (_revealed) runTumbles();
  }

  // ---------- SAVINGS BLOCK (lifetime brought-home) ----------
  function paintSavings(s) {
    var lt = s.lifetime || {};
    var block = document.querySelector('.ks-savings-block');
    if (!block) return;
    var items = parseFloat(lt.items_received); if (isNaN(items)) items = 0;
    var val   = parseFloat(lt.value_received); if (isNaN(val))   val = 0;
    // Nothing brought home yet: hide the block rather than lead a day-one member with "$0".
    // It is a payoff beat and it has no payoff to report until the first swap lands.
    if (items <= 0) { block.style.display = 'none'; return; }
    block.style.display = '';
    var valEl = block.querySelector('.ks-savings-value');
    var cntEl = block.querySelector('.ks-savings-count');
    if (valEl) valEl.textContent = '$' + Math.round(val).toLocaleString();
    if (cntEl) cntEl.textContent = items + (items === 1 ? ' find' : ' finds');
    var cls = document.querySelector('.ks-savings-class');
    if (cls) {
      var kinds = {};
      (s.closet || []).forEach(function (it) { kinds[it.item_class] = true; });
      var hasC = !!kinds.clothing, hasT = !!kinds.toy;
      cls.textContent = (hasC && hasT) ? 'clothes and toys'
                      : hasT ? 'toys'
                      : 'clothes';
    }
  }
// ---------- CLOSET / ACTIVITY / HOW CREDITS ----------
  function fmtShort(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[d.getMonth()] + ' ' + d.getDate();
  }

  var TIER_DOT = { essentials:'ks-dot--ess', elevated:'ks-dot--elev', special:'ks-dot--spec' };
  var TIER_NAME = { essentials:'Essentials', elevated:'Elevated', special:'Special' };

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============================================================
     THE PAGE GRID — 19th session, 2026-07-13.
     THE DIAGNOSIS: this page never had a layout. Every section injected itself
     AFTER the previous one, so the running order was the order things got BUILT,
     not a decision. Result: the hero stranded alone in a 900px band, the primary
     CTA in the basement, and the membership card - a COMPLIANCE surface - dumped
     at the very bottom.
     THE FIX: one 2/3 MAIN column + one 1/3 RAIL. A grid a new section can slot
     into, instead of a stack it gets appended to the bottom of.

       MAIN: credit bank (+ the Browse CTA, inside it) -> my closet -> recent activity
       RAIL: your membership -> how credits work -> review / referral slot

     ⚠ THE RAIL IS WHAT KILLS THE .is-solo PROBLEM. The review card is hidden for
     most members and hidden FOREVER once clicked. In a 2-column GRID that collapsed
     a track and flung activity to 900px. In a RAIL, a missing card just makes the
     column SHORTER. There is no track to collapse. No branching, no class, no hack.

     ⚠⚠ EVERYTHING HERE IS A **MOVE**, NEVER A RETYPE (§0). appendChild relocates a
     live node with its classes, attributes and listeners intact. The three moved
     elements are all load-bearing and NONE of them may be rebuilt:
       · .ks-hero-card         - named by the data-ks-ready visibility gate
       · .ks-section--membership - named by the gate AND by setCTA's manage branch,
         and it carries data-ms-action="customer-portal" as a WEBFLOW attribute.
         That attribute IS the cancel path. It is not in this script and not in the
         CSS. Retyping this element deletes the only way a member can cancel.
       · .ks-greet-cta         - the state-driven primary button.
     Both gate selectors keep matching after a move: the gate names CLASSES, not
     positions.
     ============================================================ */
  function ensureGrid() {
    var grid = document.querySelector('.ks-grid');
    if (grid) return grid;

    var hero = document.querySelector('.ks-hero-card');
    if (!hero || !hero.parentNode) return null;   // fail closed: no hero, no grid

    var wrap = hero.parentNode;   // ⚠ CAPTURED BEFORE THE MOVE. After main.appendChild(hero)
                                  // the hero's parent is .ks-main, not the page column.

    grid = document.createElement('div');
    grid.className = 'ks-grid';
    var main = document.createElement('div');
    main.className = 'ks-col ks-main';
    var rail = document.createElement('div');
    rail.className = 'ks-col ks-rail';
    grid.appendChild(main);
    grid.appendChild(rail);

    // The grid takes the hero's place in the flow, then swallows it.
    wrap.insertBefore(grid, hero);
    main.appendChild(hero);

    // THE PRIMARY ACTION SITS UNDER THE GREETING, CENTRED. It is the PAGE's one action,
    // not the credit card's conclusion — inside the hero it read as a random left-aligned
    // pill hanging off the savings inset. It was at the very BOTTOM of the page, below the
    // account panel, for the whole life of this build.
    // ⚠ It is STATE-DRIVEN (setCTA): on cancelled/paused it becomes "Reactivate" and
    // stops being a link. It belongs with the greeting, which is the other state-driven
    // surface on this page.
    var cta = document.querySelector('.ks-greet-cta');
    var gsub = document.querySelector('.ks-greet-sub');
    if (cta && gsub && gsub.parentNode) {
      gsub.parentNode.insertBefore(cta, gsub.nextSibling);
    }

    buildUtilityRow(wrap, grid);
    return grid;
  }

  /* ============================================================
     THE UTILITY ROW — 19th session, 2026-07-13.
     Account chrome, top-right of the PAGE (not the site navbar - the navbar is a
     global Webflow element and would need member-gating on every public surface).

         Active · Manage membership          ⚙ Account & Settings ▾

     WHY THE MEMBERSHIP CARD DIED: it was a 420px card holding three short lines,
     and it had been sitting at the BOTTOM of the page. ⚠ THAT PLACEMENT WAS A
     COMPLIANCE PROBLEM, NOT A TASTE ONE. CA ARL 17602(d) wants the cancel path
     "prominently located"; DASH.8 lifted it out of the account panel to make it
     VISIBLE, and "visible" got satisfied by dropping it at the end of the page -
     arguably the opposite of prominent. Top-right of the page is prominent.
     ⚠ THE STATUTE PERMITS A "direct link or button", so a text link is allowed.
     SHAHIN STILL RULES on link-vs-button; if he wants the button back it is one
     CSS rule in this same slot, same position, same prominence.

     ⚠⚠ EVERY ELEMENT HERE IS **MOVED**, NEVER REBUILT (§0). This is not style:
       · .ks-membership-manage CARRIES data-ms-action="customer-portal" AS A WEBFLOW
         ATTRIBUTE. THAT ATTRIBUTE **IS** THE CANCEL PATH. It is not in this script
         and not in the CSS, so neither a script audit nor a CSS audit would ever
         find it. Retype this element and you delete the only way a member can cancel.
       · .ks-membership-status is a live paint hook (and carries data-tone="off" on
         cancelled/paused). It is the ONLY place a cancelled member is told so.
       · .ks-account-toggle owns the accordion's open/close listener.
     ⚠ THE CARD ITSELF IS HIDDEN, NOT DELETED. .ks-membership-plan still lives inside
     it, so paint() keeps writing to it and NO HOOK DIES; .ks-section--membership is
     still named by the data-ks-ready gate AND by setCTA's manage-branch scroll target,
     and both still resolve. Deleting the card would silently break all three.
     ============================================================ */
  function buildUtilityRow(wrap, grid) {
    if (!wrap || document.querySelector('.ks-util')) return;

    var util = document.createElement('div');
    util.className = 'ks-util';

    // Anchor above the greeting. Walk up from a PROVEN hook until we are a direct
    // child of the page column - the greeting's nesting depth is not something to
    // assume (§0: a querySelector that misses fails silently).
    var a = document.querySelector('.ks-greet-headline');
    while (a && a.parentNode && a.parentNode !== wrap) a = a.parentNode;
    if (a && a.parentNode === wrap) wrap.insertBefore(util, a);
    else wrap.insertBefore(util, wrap.firstChild);

    var stat = document.querySelector('.ks-membership-status');
    var mng = document.querySelector('.ks-membership-manage');
    if (stat && mng) {
      var grp = document.createElement('span');
      grp.className = 'ks-util-mem';
      grp.appendChild(stat);                       // MOVE
      var sep = document.createElement('span');
      sep.className = 'ks-util-sep';
      sep.textContent = '\u00b7';
      grp.appendChild(sep);
      grp.appendChild(mng);                        // MOVE - attribute rides along
      util.appendChild(grp);
    }

    // The plan chip is account chrome too. It was a lone coral pill floating under the
    // greeting; here it sits with the things it belongs to. ⚠ paintPlanChip() injects it
    // relative to .ks-greet-sub and HIDES ITSELF on an unknown/null plan (a cancelled
    // member has no plan), so it may not exist yet or at all. Re-home it if it turns up.
    var chip = document.querySelector('.ks-plan-chip');
    if (chip) util.insertBefore(chip, util.firstChild);

    // ACCOUNT & SETTINGS IS A REAL DROPDOWN NOW, anchored to its own button.
    // ⚠ THE PANEL MUST BE A SIBLING OF THE TOGGLE INSIDE A position:relative BOX, or
    // absolute positioning has nothing to hang off and it lands relative to the page.
    var acct = document.createElement('div');
    acct.className = 'ks-util-acct';
    util.appendChild(acct);

    var tog = document.querySelector('.ks-account-toggle');
    if (tog) acct.appendChild(tog);                // MOVE

    var pnl = document.querySelector('.ks-account-panel');
    if (pnl) acct.appendChild(pnl);                // MOVE

    // Gutted, so hide it. NOT removed - see the header comment.
    var mem = document.querySelector('.ks-section--membership');
    if (mem) mem.classList.add('ks-mem-hidden');

    wireDropdownDismiss();
  }

  /* A dropdown that cannot be dismissed by clicking away is not a dropdown, it is a
     trapdoor. Click-outside + Escape. ⚠ Delegated on document and guarded on .is-open,
     so it costs nothing when closed and cannot fight wireAccountToggle's own handler
     (that one lives on the button, and a click on the button is INSIDE .ks-util-acct,
     so this listener returns before touching it). */
  function wireDropdownDismiss() {
    if (document.documentElement.hasAttribute('data-ks-dd')) return;
    document.documentElement.setAttribute('data-ks-dd', '1');

    function shut() {
      var pnl = document.querySelector('.ks-account-panel');
      var tog = document.querySelector('.ks-account-toggle');
      if (pnl) pnl.classList.remove('is-open');
      if (tog) tog.classList.remove('is-open');
    }
    document.addEventListener('click', function (e) {
      var pnl = document.querySelector('.ks-account-panel');
      if (!pnl || !pnl.classList.contains('is-open')) return;
      if (e.target.closest && e.target.closest('.ks-util-acct')) return;
      shut();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pnl = document.querySelector('.ks-account-panel');
      if (!pnl || !pnl.classList.contains('is-open')) return;
      shut();
      var tog = document.querySelector('.ks-account-toggle');
      if (tog) tog.focus();          // never strand focus inside a closed region
    });
  }

  // which = 'main' | 'rail'. Append order IS call order within a column, so the
  // paint() call order below is the visual order. Same contract as the old
  // sectionAfterHero: returns the .ks-panel to write into, or null.
  function sectionIn(which, cls) {
    var grid = ensureGrid();
    if (!grid) return null;
    var col = grid.querySelector(which === 'rail' ? '.ks-rail' : '.ks-main');
    if (!col) return null;

    var sec = col.querySelector('.' + cls);
    if (!sec) {
      sec = document.createElement('div');
      sec.className = 'ks-closet-sec ' + cls;
      var panel = document.createElement('div');
      panel.className = 'ks-panel';
      sec.appendChild(panel);
      col.appendChild(sec);
    }
    return sec.querySelector('.ks-panel');
  }
var _EMPTY_TEST = new URLSearchParams(window.location.search).get('empty') === '1';
  var CLOSET_VISIBLE = 6;
  var CLOSET_H = '<div class="ks-panel-h">My closet</div>';

  function findCardHTML(it) {
    var dot = TIER_DOT[it.tier] || 'ks-dot--ess';
    var tname = TIER_NAME[it.tier] || '';
    var img = it.thumb
      ? '<img src="' + esc(it.thumb) + '" alt="' + esc(it.item_name) + '" loading="lazy">'
      : '';
    return '<div class="ks-find">' +
      '<div class="ks-find-ph">' + img + '</div>' +
      '<div class="ks-find-body">' +
        '<div class="ks-find-nm">' + esc(it.item_name) + '</div>' +
        '<div class="ks-find-sz">' + esc(it.size_label || '') + '</div>' +
        '<div class="ks-find-tier"><i class="ks-dot ' + dot + '"></i>' + tname + '</div>' +
      '</div></div>';
  }
function paintCloset(s) {
    var panel = sectionIn('main', 'ks-sec-closet');
    if (!panel) return;

    var list = _EMPTY_TEST ? [] : s.closet;

    if (list === null || list === undefined) {
      panel.parentNode.style.display = 'none';
      return;
    }
    panel.parentNode.style.display = '';

    if (!list.length) {
      panel.innerHTML =
        CLOSET_H +
        '<div class="ks-empty">' +
          '<div class="ks-empty-h">Nothing in here yet</div>' +
          '<div class="ks-empty-p">Send in a bag of outgrown clothes. Every item we accept adds a credit to your bank, and everything you bring home stays yours.</div>' +
          '<a href="/browse" class="ks-empty-cta">See what\'s in the closet</a>' +
        '</div>';
      return;
    }

 

    var shown = list.slice(0, CLOSET_VISIBLE);
    var html = CLOSET_H + '<div class="ks-closet-grid">' + shown.map(findCardHTML).join('') + '</div>';
    if (list.length > CLOSET_VISIBLE) {
      html += '<button type="button" class="ks-showall">Show all ' + list.length + '</button>';
    }
    panel.innerHTML = html;

    var btn = panel.querySelector('.ks-showall');
    if (btn) {
      btn.addEventListener('click', function () {
        panel.querySelector('.ks-closet-grid').innerHTML = list.map(findCardHTML).join('');
        btn.parentNode.removeChild(btn);
      });
    }
  }

  var ACT_VISIBLE = 10;

  function actRowHTML(e) {
    var when = fmtShort(e.ts);
    var title, detail, icon, glyph;

    if (e.type === 'swap') {
      icon = 'ks-act-icon--swap';
      glyph = '\u2191';
      var n = parseFloat(e.items) || 0;
      title = 'You swapped for ' + n + ' item' + (n === 1 ? '' : 's');
      detail = (e.item_names && e.item_names.length) ? e.item_names.join(', ') : '';
    } else {
      icon = 'ks-act-icon--earn';
      glyph = '\u25C6';
      var c = parseFloat(e.credits) || 0;
      var cTxt = c + ' credit' + (c === 1 ? '' : 's') + ' added to your bank';
      var src = e.source;
      if (src === 'intake') {
        var it = parseFloat(e.items) || 0;
        title = 'Your bag was graded';
        detail = cTxt + ', ' + it + ' item' + (it === 1 ? '' : 's') + ' accepted';
      } else if (src === 'starter_pack') {
        title = 'Starter pack added';
        detail = cTxt;
      } else if (src === 'gift') {
        title = 'Credits gifted to you';
        detail = cTxt;
      } else {
        title = 'Credits added to your bank';
        detail = c + ' credit' + (c === 1 ? '' : 's');
      }
    }

    return '<div class="ks-act-row">' +
      '<div class="ks-act-icon ' + icon + '">' + glyph + '</div>' +
      '<div class="ks-act-main">' +
        '<div class="ks-act-title">' + esc(title) + '</div>' +
        (detail ? '<div class="ks-act-detail">' + esc(detail) + '</div>' : '') +
      '</div>' +
      '<div class="ks-act-when">' + when + '</div>' +
    '</div>';
  }

  function paintActivity(s) {
    var panel = sectionIn('rail', 'ks-sec-activity');
    if (!panel) return;
    var list = _EMPTY_TEST ? [] : s.activity;

    if (list === null || list === undefined) {
      panel.parentNode.style.display = 'none';
      return;
    }
    panel.parentNode.style.display = '';

    if (!list.length) {
      panel.innerHTML =
        '<div class="ks-panel-h">Recent activity</div>' +
        '<div class="ks-empty" style="padding:8px 8px 4px">' +
          '<div class="ks-empty-p">Your bags and swaps will show up here once your first bag is graded.</div>' +
        '</div>';
      return;
    }

    var shown = list.slice(0, ACT_VISIBLE);
    var html = '<div class="ks-panel-h">Recent activity</div>' +
               shown.map(actRowHTML).join('');
    if (list.length > ACT_VISIBLE) {
      html += '<button type="button" class="ks-showall">Show more</button>';
    }
    panel.innerHTML = html;

    var btn = panel.querySelector('.ks-showall');
    if (btn) {
      btn.addEventListener('click', function () {
        panel.innerHTML = '<div class="ks-panel-h">Recent activity</div>' +
                          list.map(actRowHTML).join('');
      });
    }
  }

  function paintHowCredits() {
    var panel = sectionIn('main', 'ks-sec-hcw');
    if (!panel) return;
    panel.innerHTML =
      '<div class="ks-panel-h">How credits work</div>' +
      '<div class="ks-hcw-row"><div class="ks-hcw-n">1</div><div>' +
        '<div class="ks-hcw-t">One item, one credit</div>' +
        '<div class="ks-hcw-b">Every item we accept earns you one credit, whatever the brand. One credit brings one item home.</div>' +
      '</div></div>' +
      '<div class="ks-hcw-row"><div class="ks-hcw-n">2</div><div>' +
        '<div class="ks-hcw-t">Some items earn half a credit</div>' +
        '<div class="ks-hcw-b">If an item is loved but still has life in it, it earns half. Two halves join into a whole automatically. You\'ll need a whole credit to bring something home.</div>' +
      '</div></div>' +
      '<div class="ks-hcw-row"><div class="ks-hcw-n">3</div><div>' +
        '<div class="ks-hcw-t">Your credit\'s tier is how far it reaches</div>' +
        '<div class="ks-hcw-b">Essentials, Elevated, and Special. Reach above your credit\'s tier and there\'s a small upgrade fee. A Special credit brings home almost anything at no extra charge.</div>' +
      '</div></div>';
  }

// ---------- REVIEW PROMPT ----------
  var REVIEW_URL = "https://g.page/r/CQ6-0phqnjFCEBM/review";
  var REVIEW_MIN_FINDS = 2;   // one find is a transaction; two is a habit
  var _member = null;
  var _state  = null;

  function reviewDone(m) {
    var v = '';
    try { v = (m && m.data && m.data.customFields && m.data.customFields['reviewed-google']) || ''; } catch (e) {}
    return String(v).toLowerCase() === 'true';
  }

  function paintReviewPrompt() {
    // Needs BOTH reads and they land on separate promises, either order. This runs
    // from both and only paints once it holds the pair. A MISSING member is not
    // "hasn't reviewed" - it is "we don't know", and we must never ask on a guess.
    // So if getCurrentMember fails, this block simply never appears. Fail closed.
    if (!_state || !_member) return;
    var panel = sectionIn('rail', 'ks-sec-review');
    if (!panel) return;
    var sec = panel.parentNode;

    var items = parseFloat((_state.lifetime || {}).items_received);
    if (isNaN(items)) items = 0;

    if (items < REVIEW_MIN_FINDS || reviewDone(_member)) { sec.style.display = 'none'; return; }
    sec.style.display = '';

    panel.innerHTML =
      '<div class="ks-rev-h">Enjoying your finds?</div>' +
      '<div class="ks-rev-p">A quick Google review helps other parents find KidSwaps, and a bigger swap means more to choose from.</div>' +
      '<a class="ks-rev-cta" href="' + REVIEW_URL + '" target="_blank" rel="noopener">Leave a Google review</a>';

    var cta = panel.querySelector('.ks-rev-cta');
    if (cta) {
      cta.addEventListener('click', function () {
        // Honor system: the click IS the record. Hide immediately - never make a
        // member who just did you a favour sit and watch a spinner. If the write
        // fails she sees it again next load, which is the harmless direction.
        sec.style.display = 'none';
        try {
          window.$memberstackDom.updateMember({ customFields: { 'reviewed-google': 'true' } })
            .catch(function (e) { console.error('[ks-dash] review flag write failed', e); });
        } catch (e) { console.error('[ks-dash] review flag write threw', e); }
      });
    }
  }
  
// ---------- PROFILE ----------
  // paintProfile() NEVER EXISTED. [data-profile-name] and [data-profile-email] have
  // rendered "—" to every member on every load since the day they were built, and
  // the doc's SCRIPT-HOOK list is what hid it: they sat beside genuinely live hooks,
  // so the section looked wired. Not misfiring — the function was simply absent.
  //
  // ⚠⚠ DISPLAY ONLY, AND THAT IS A RULING, NOT AN OVERSIGHT. Do NOT turn these into
  // inputs. Her email is her ONLY login credential (passwordless — no password to fall
  // back on), the Memberstack switch is IMMEDIATE with no confirm step, and NOTHING
  // syncs an email change to Supabase / Klaviyo / Stripe. See #EMAIL-CHANGE.
  //
  // ⚠ THE EMAIL IS NOT IN customFields. There is no email key there at all (read live
  // off getCurrentMember 2026-07-12). It lives on member.data.auth.email — an object
  // paintHeadline already holds and used to throw away.
  function paintProfile(member) {
    var cf = {}, email = '';
    try { cf    = (member && member.data && member.data.customFields) || {}; } catch (e) {}
    try { email = (member && member.data && member.data.auth && member.data.auth.email) || ''; } catch (e) {}

    var first = String(cf['first-name'] || '').trim();
    var last  = String(cf['last-name']  || '').trim();
    var name  = [first, last].filter(Boolean).join(' ');

    var nEl = document.querySelector('[data-profile-name]');
    var eEl = document.querySelector('[data-profile-email]');

    // A missing value KEEPS the "—". Never write an empty string: a blank line reads as
    // a broken card, a dash reads as "we don't have this." Fail visible, not silent.
    if (nEl && name)  nEl.textContent = name;
    if (eEl && email) eEl.textContent = email;
  }

  // ---------- CHILDREN (list paint) ----------
  
  function paintChildren(s) {
    var kids = (s && s.children) || [];
    var list = document.querySelector('.ks-children-list');
    var tpl  = document.querySelector('[data-child-template="true"]');
    var empty = document.querySelector('.ks-children-empty');
    if (!list || !tpl) return;

    list.innerHTML = '';

    if (!kids.length) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    function line(node, sel, val, prefix) {
      var el = node.querySelector(sel);
      if (!el) return;
      if (val === undefined || val === null || val === '') { el.style.display = 'none'; return; }
      el.textContent = (prefix || '') + val;
      el.style.display = '';
    }

    kids.forEach(function (c) {
      var node = tpl.cloneNode(true);
      node.removeAttribute('data-child-template');
      node.style.display = '';
      node.classList.add('ks-child-rendered');

      line(node, '.ks-child-name', c.name || 'Child');

      var ageText = null;
      if (c.age_years === 0 || c.age_years) {
        ageText = c.age_years + (c.age_years === 1 ? ' year old' : ' years old');
      }
      line(node, '.ks-child-age', ageText);

      var sizes = null;
      if (c.size_top && c.size_bottom) sizes = 'Sizes: ' + c.size_top + ' top / ' + c.size_bottom + ' bottom';
      else if (c.size_top)    sizes = 'Top size: ' + c.size_top;
      else if (c.size_bottom) sizes = 'Bottom size: ' + c.size_bottom;
      line(node, '.ks-child-sizes', sizes);

      line(node, '.ks-child-toyage',    c.toy_age_range,          'Toy age range: ');
      line(node, '.ks-child-style',     c.style_profile,          'Style: ');
      line(node, '.ks-child-condition', c.condition_preference,   'Condition: ');
      line(node, '.ks-child-week',      c.typical_week,           'Typical week: ');
      line(node, '.ks-child-hoping',    c.most_hoping_to_find,    'Hoping to find: ');
      line(node, '.ks-child-brands',    c.preferred_brand_groups, 'Brands: ');
      line(node, '.ks-child-updated',   c.last_updated ? fmtDate(c.last_updated) : null, 'Profile updated ');

      node.setAttribute('data-child-id', c.id);
      var rm = node.querySelector('[data-child-remove]');
      if (rm) { rm.setAttribute('data-child-name', c.name || 'this child'); }

      list.appendChild(node);
    });
  }

  // ---------- EMAIL PREFERENCES ----------
  function paintEmailPrefs(s) {
    var prefs = (s && s.email_prefs) || {};
    var toggles = document.querySelectorAll('.ks-pref-toggle');
    toggles.forEach(function (t) {
      var key = t.getAttribute('data-pref');
      t.checked = (prefs[key] === true);
    });
  }

// ⚠ NO OPACITY, ANYWHERE (§DASH.2) — it shifts the perceived colour. The old
  // el.style.opacity = ok ? '0.7' : '1' was a §DASH.2 violation hiding in JS, where a
  // CSS audit would never look. Same intent, real hexes: success is QUIET, failure LOUD.
  //
  // ⚠⚠ THE ARIA FIX IS NOT JUST AN ATTRIBUTE. A screen reader does NOT announce text
  // written into a display:none region that is then revealed — so adding aria-live to
  // the old show/hide would have looked correct and announced nothing. The region now
  // lives in the DOM permanently and EMPTIES instead of hiding. Do not "tidy" the
  // display toggle back in.
 // ⚠⚠ AN OPEN ACCORDION BODY IS FROZEN AT THE HEIGHT IT HAD WHEN IT OPENED.
  // openAcc() sets max-height from scrollHeight ONCE, and .ks-acc-body is overflow:hidden.
  // So ANY content that grows inside an already-open section is CLIPPED — it renders
  // perfectly, twenty pixels below the visible edge. That is exactly what hid "Saved"
  // for the entire life of this page (measured 2026-07-12: body needed 140px, max-height
  // was 120px). This is STRUCTURAL, not a prefs bug: any future section that grows after
  // opening must re-measure too. Call this after changing content inside a panel section.
  function accResize(el) {
    var body = (el && el.closest) ? el.closest('.ks-acc-body') : null;
    if (!body) return;
    // A CLOSED body sits at 0px and MUST STAY SHUT — never re-measure it open.
    if (!body.style.maxHeight || body.style.maxHeight === '0px') return;
    body.style.maxHeight = body.scrollHeight + 'px';
  }

  function prefStatus(msg, ok) {
    var el = document.querySelector('.ks-pref-status');
    if (!el) return;
    if (!el.hasAttribute('aria-live')) {
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('role', 'status');
    }
    el.style.display = '';                        // never hidden again — it empties instead
    el.style.color = ok ? '#75736E' : '#1E1A19';  // muted grey = saved · ink = failed
   el.textContent = msg;
    accResize(el);                               // grow the section to fit the message
    clearTimeout(prefStatus._t);
    prefStatus._t = setTimeout(function () {
      el.textContent = '';
      accResize(el);                             // and shrink back when it clears
    }, 2500);
  }

  var CHILD_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/member-child";

  function wireChildRemove() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target;
      if (!btn || !btn.getAttribute || btn.getAttribute('data-child-remove') !== 'true') return;
      ev.preventDefault();

      var node = btn.closest('.ks-child');
      if (!node) return;
      var childId = node.getAttribute('data-child-id');
      var childName = btn.getAttribute('data-child-name') || 'this child';
      if (!childId) return;

      if (!window.confirm('Remove ' + childName + '? You can re-add them later.')) return;

      btn.style.pointerEvents = 'none';
      btn.textContent = 'Removing…';

      var token = window.$memberstackDom.getMemberCookie();
      if (!token) { btn.textContent = 'Remove'; btn.style.pointerEvents = ''; window.alert("Couldn't remove — please reload."); return; }

      fetch(CHILD_URL, {
        method: 'POST',
        headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', child_id: childId })
      })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          if (resp && resp.ok) {
            node.parentNode.removeChild(node);
          } else {
            btn.textContent = 'Remove'; btn.style.pointerEvents = '';
            window.alert("Couldn't remove — please try again.");
            console.error('child remove error', resp);
          }
        })
        .catch(function (e) {
          btn.textContent = 'Remove'; btn.style.pointerEvents = '';
          window.alert("Couldn't remove — please try again.");
          console.error('child remove error', e);
        });
    });
  }

  function wirePrefToggles() {
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.classList || !t.classList.contains('ks-pref-toggle')) return;

      var key = t.getAttribute('data-pref');
      var newVal = t.checked;
      t.disabled = true;
      var token = window.$memberstackDom.getMemberCookie();
      if (!token) { t.checked = !newVal; t.disabled = false; prefStatus("Couldn't save \u2014 please reload", false); return; }
      fetch(PREF_URL, {
        method: 'POST',
        headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pref_key: key, value: newVal })
      })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          if (resp && resp.ok) { prefStatus("Saved", true); }
          else { t.checked = !newVal; prefStatus("Couldn't save", false); console.error('pref write error', resp); }
        })
        .catch(function (e) { t.checked = !newVal; prefStatus("Couldn't save", false); console.error('pref write error', e); })
        .finally(function () { t.disabled = false; });
    });
  }


// ---------- ACCOUNT PANEL (accordion, tap-to-open) ----------
  var _accPairs = [];
  function closeAcc(head, body) {
    head.classList.remove('is-open');
    head.setAttribute('aria-expanded', 'false');
    body.style.maxHeight = '0px';
    body.style.opacity = '0';
  }
  function openAcc(head, body) {
    head.classList.add('is-open');
    head.setAttribute('aria-expanded', 'true');
    body.style.opacity = '1';
    body.style.maxHeight = body.scrollHeight + 'px';
  }
  function accOpenFirst() {
    _accPairs.forEach(function (p) { closeAcc(p.head, p.body); });
    if (_accPairs[0]) openAcc(_accPairs[0].head, _accPairs[0].body);
  }
  var ACC_LABELS = ['Children', 'Shipping address', 'Profile', 'Email preferences', 'Help & contact'];
  // 2026-07-13: 'Your impact' REMOVED. The impact embed (code-embed-5) was dragged OUT of
  // .ks-account-panel in Navigator. ACC_LABELS IS INDEXED BY POSITION over the panel's direct
  // children - drop a section without dropping its label and every row below is silently
  // mislabeled. Verified live against the panel's real child order before this edit.
  function buildAccordion() {
    var panel = document.querySelector('.ks-account-panel');
    if (!panel) return;
    var sections = Array.prototype.slice.call(panel.children);
    _accPairs = [];
    sections.forEach(function (body, i) {
      body.classList.add('ks-acc-body');
      var titleEl = body.querySelector('.ks-card-title');
      var label = ACC_LABELS[i] || (titleEl ? titleEl.textContent.trim() : 'Section');

      // A <div> with a click handler is not a control: not focusable, no role, no state,
      // so a keyboard or screen-reader member cannot open these sections at all
      // (WCAG 2.1.1 + 4.1.2, both Level A). A native <button> gets focus, Enter and
      // Space for free. Do not put the div back.
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'ks-acc-head';
      head.textContent = label;

      var bodyId = 'ks-acc-body-' + i;
      body.id = bodyId;
      head.setAttribute('aria-controls', bodyId);
      head.setAttribute('aria-expanded', 'false');

      panel.insertBefore(head, body);
      closeAcc(head, body);
      var pair = { head: head, body: body };
      _accPairs.push(pair);
      head.addEventListener('click', function () {
        var isOpen = head.classList.contains('is-open');
        _accPairs.forEach(function (p) { closeAcc(p.head, p.body); });
        if (!isOpen) openAcc(head, body);
      });
    });
  }
  function openAccountPanel() {
    var panel = document.querySelector('.ks-account-panel');
    if (!panel) return;
    panel.classList.add('is-open');
    var btn = document.querySelector('.ks-account-toggle');
    if (btn) btn.classList.add('is-open');
    accOpenFirst();
  }
  function wireAccountToggle() {
    var btn = document.querySelector('.ks-account-toggle');
    var panel = document.querySelector('.ks-account-panel');
    if (!btn || !panel) return;
    buildAccordion();
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var opening = !panel.classList.contains('is-open');
      panel.classList.toggle('is-open');
      btn.classList.toggle('is-open', opening);
      if (opening) accOpenFirst();
    });
  }


  
  // ================= SHIPPING ADDRESS: EDIT (§ADDR, 2026-07-13) =================
  // Server half (RPC + member-address edge fn + dual write) was built and PROVEN in the
  // 15th session. This is the UI, which only ever waited on somewhere to live.
  //
  // ⚠⚠ THE DISPLAY HALF ALREADY EXISTED. paint() has always filled the four hooks
  // ([data-ship-line1] / -line2 / -citystatezip / -empty). This ADDS an Edit affordance
  // beside that card. It does NOT rebuild the card and it RETYPES NOTHING.
  //
  // ⚠⚠ THE CARD LIVES INSIDE AN OPEN ACCORDION BODY. An open body is frozen at the height
  // it had when it opened (max-height from scrollHeight, once, + overflow:hidden). So EVERY
  // height change here MUST call accResize() or the form renders perfectly, below the
  // visible edge, and nothing reports it (§DASH.9). Open, close, save, error: all four.
  //
  // ⚠ THE ANCHOR IS THE HOOK, NOT A CLASS NAME. The doc said inject at ".code-embed-9
  // .ks-card"; that class is NOT on the card (read live 2026-07-13). We derive the card
  // from [data-ship-line1], which paint() writes to on every load, so this selector cannot
  // miss unless the display half is already broken.

  var ADDR_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/member-address";

  var ADDR_FIELDS = [
    ['line1', 'Street address',                    'address-line1',   40],
    ['line2', 'Apartment, suite, etc. (optional)', 'address-line2',   40],
    ['city',  'City',                              'address-level2',  40],
    ['state', 'State',                             'address-level1',   2],
    ['zip',   'ZIP',                               'postal-code',     10]
  ];

  // ONE source of truth for how an address renders. paint() calls it on load; addrSave()
  // calls it again with the edge fn's FRESH READ. Never render from the form's own inputs.
  function renderShipping(shipping) {
    var sh = shipping || {};
    var shLine1 = document.querySelector('[data-ship-line1]');
    var shLine2 = document.querySelector('[data-ship-line2]');
    var shCsz   = document.querySelector('[data-ship-citystatezip]');
    var shEmpty = document.querySelector('[data-ship-empty]');
    if (sh.line1) {
      if (shLine1) shLine1.textContent = sh.line1;
      if (shLine2) {
        if (sh.line2) { shLine2.textContent = sh.line2; shLine2.style.display = ''; }
        else { shLine2.style.display = 'none'; }
      }
      if (shCsz) {
        var csz = [sh.city, sh.state].filter(Boolean).join(', ');
        if (sh.zip) csz += (csz ? ' ' : '') + sh.zip;
        shCsz.textContent = csz;
      }
      if (shEmpty) shEmpty.style.display = 'none';
    } else {
      if (shLine1) shLine1.textContent = '';
      if (shLine2) shLine2.style.display = 'none';
      if (shCsz) shCsz.textContent = '';
      if (shEmpty) shEmpty.style.display = '';
    }
  }

  function addrCard() {
    var h = document.querySelector('[data-ship-line1]');
    return (h && h.closest) ? h.closest('.ks-card') : null;
  }

  // ⚠ EVERY height change inside the open accordion body goes through here.
  function addrResize() {
    var card = addrCard();
    if (card) accResize(card);
  }

  // ⚠ MIRRORS prefStatus(): the region lives in the DOM PERMANENTLY and EMPTIES rather than
  // hiding. A screen reader does NOT announce text written into a display:none region that
  // is then revealed. Do not "tidy" a display toggle back in (§DASH.9).
  // ⚠ NO OPACITY (§DASH.2). Solid hexes only: muted grey = quiet, ink = loud.
  function addrStatus(msg, ok) {
    var el = document.querySelector('.ks-addr-status');
    if (!el) return;
    el.style.color = ok ? '#75736E' : '#1E1A19';
    el.textContent = msg || '';
    addrResize();
  }

  function addrBuild() {
    var card = addrCard();
    if (!card || card.querySelector('.ks-addr-edit')) return;   // build once

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ks-addr-edit';
    edit.textContent = 'Edit';

    var form = document.createElement('div');
    form.className = 'ks-addr-form';
    form.style.display = 'none';

    var html = '';
    for (var i = 0; i < ADDR_FIELDS.length; i++) {
      var f = ADDR_FIELDS[i];
      html += '<label class="ks-addr-row">' +
                '<span class="ks-addr-label">' + f[1] + '</span>' +
                '<input type="text" class="ks-addr-input" data-addr="' + f[0] + '" ' +
                       'autocomplete="' + f[2] + '" maxlength="' + f[3] + '">' +
              '</label>';
    }
    html += '<div class="ks-addr-actions">' +
              '<button type="button" class="ks-addr-save">Save address</button>' +
              '<button type="button" class="ks-addr-cancel">Cancel</button>' +
            '</div>' +
            '<div class="ks-addr-status" aria-live="polite" role="status"></div>';
    form.innerHTML = html;

    card.appendChild(edit);
    card.appendChild(form);

    edit.addEventListener('click', addrOpen);
    form.querySelector('.ks-addr-cancel').addEventListener('click', addrClose);
    form.querySelector('.ks-addr-save').addEventListener('click', addrSave);
  }

  function addrDisplayRows(show) {
    ['[data-ship-line1]', '[data-ship-citystatezip]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.style.display = show ? '' : 'none';
    });
    // ⚠ line2 and empty are display-MANAGED by renderShipping (line2 hides when absent,
    // empty shows only when there is no address). Hide them while editing; on close we
    // re-render from the payload rather than guessing what they were.
    ['[data-ship-line2]', '[data-ship-empty]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && !show) el.style.display = 'none';
    });
  }

  function addrOpen() {
    var card = addrCard();
    if (!card) return;
    var sh = (_state && _state.shipping) || {};
    // ⚠ PREFILL FROM THE PAYLOAD, NEVER FROM THE DOM. [data-ship-citystatezip] is a JOINED
    // display string; parsing it back would be reading our own output.
    card.querySelectorAll('.ks-addr-input').forEach(function (inp) {
      inp.value = sh[inp.getAttribute('data-addr')] || '';
    });
    addrStatus('', true);
    addrDisplayRows(false);
    card.querySelector('.ks-addr-edit').style.display = 'none';
    card.querySelector('.ks-addr-form').style.display = '';
    addrResize();
    var first = card.querySelector('.ks-addr-input');
    if (first) first.focus();
  }

  function addrClose() {
    var card = addrCard();
    if (!card) return;
    card.querySelector('.ks-addr-form').style.display = 'none';
    card.querySelector('.ks-addr-edit').style.display = '';
    addrDisplayRows(true);
    renderShipping(_state && _state.shipping);   // restore the true display state
    addrStatus('', true);
    addrResize();
  }

  function addrSave() {
    var card = addrCard();
    if (!card) return;
    var saveBtn = card.querySelector('.ks-addr-save');

    var body = {};
    card.querySelectorAll('.ks-addr-input').forEach(function (inp) {
      body[inp.getAttribute('data-addr')] = (inp.value || '').trim();
    });

    // Client guard, so she is not made to wait for a round trip to be told a field is blank.
    // ⚠ The SERVER is still authoritative and is ALL-OR-NOTHING: a blank required field
    // writes NOTHING (a half-applied address erases one we could previously mail to).
    if (!body.line1 || !body.city || !body.state || !body.zip) {
      addrStatus('We need a street, city, state and ZIP to mail your bag.', false);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving\u2026';
    addrStatus('', true);

    var token = window.$memberstackDom.getMemberCookie();   // bare string, never a promise

    fetch(ADDR_URL, {
      method: 'POST',
      headers: {
        'x-ms-token': token,
        'apikey': ANON,
        'Authorization': 'Bearer ' + ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save address';

        if (res.status === 200 && res.body && res.body.ok) {
          // ⚠ RE-RENDER FROM THE FN'S FRESH READ. It returns what the DB HOLDS, not what it
          // was handed. Never re-render from the form's own inputs (§ADDR).
          if (_state) _state.shipping = res.body.shipping || {};
          card.querySelector('.ks-addr-form').style.display = 'none';
          card.querySelector('.ks-addr-edit').style.display = '';
          addrDisplayRows(true);
          renderShipping(_state && _state.shipping);
          addrResize();
          // ⚠ The Memberstack half is NON-FATAL by design. If it failed, Supabase already
          // holds the truth and the label prints correctly. Never tell her it did not save.
          addrSaved();
          return;
        }

        var err = (res.body && res.body.error) || '';
        if (err === 'missing_required') {
          addrStatus('We need a street, city, state and ZIP to mail your bag.', false);
        } else if (err === 'bad_state') {
          addrStatus('State needs to be two letters, like CA.', false);
        } else {
          addrStatus('That didn\u2019t save. Try again, or email us.', false);
        }
      })
      .catch(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save address';
        addrStatus('That didn\u2019t save. Try again, or email us.', false);
      });
  }

  // "Saved." confirms on the CARD after the form closes, then clears itself.
  function addrSaved() {
    var card = addrCard();
    if (!card) return;
    var el = card.querySelector('.ks-addr-saved');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ks-addr-saved';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('role', 'status');
      card.appendChild(el);
    }
    el.textContent = 'Saved.';
    addrResize();
    clearTimeout(addrSaved._t);
    addrSaved._t = setTimeout(function () {
      el.textContent = '';
      addrResize();
    }, 2500);
  }

  // ---------- TEST: ?fake= payload override (display-only, never writes) ----------
  var _FAKE = new URLSearchParams(window.location.search).get('fake');
  function applyFake(s) {
    if (!_FAKE || !s) return s;
    if (_FAKE === 'zero') {                    // day-one member: has a plan, no credits, nothing yet
      s.bank = { total: 0, by_tier: {}, by_class: { clothing: 0, toy: 0 },
                 by_class_tier: { clothing: {}, toy: {} } };
      s.available_this_cycle = { total: 0, clothing: 0, toy: 0 };
      s.lifetime = { items_kept_from_landfill: 0, credits_earned: 0,
                     member_since: (s.lifetime && s.lifetime.member_since) || null,
                     value_received: 0, items_received: 0 };
      s.expiry = {};
      s.closet = [];
      s.activity = [];
      s.signals = { is_capped: false, expiring_soon: false, has_credits: false };
    } else if (_FAKE === 'capped') {           // holds credits, this cycle's swaps all used
      s.available_this_cycle = { total: 0, clothing: 0, toy: 0 };
      s.signals = Object.assign({}, s.signals || {}, { is_capped: true });
    } else if (_FAKE === 'cancelled') {        // plan gone, earned credits survive
      s.plan = null;
      s.member_status = 'cancelled';
      s.caps = { clothing: 0, toy: 0 };
    }
    console.log('[ks-dash] FAKE STATE:', _FAKE, s);
    return s;
  }
  // ---------- RUN ----------
  setTimeout(reveal, 4000);

  var token = window.$memberstackDom.getMemberCookie();
  if (!token) { console.error('member-state: no token (logged out?)'); reveal(); return; }

  wirePrefToggles();
  wireChildRemove();
  wireAccountToggle();
  var pName = window.$memberstackDom.getCurrentMember()
    .then(paintHeadline)
    .catch(fallbackHeadline);

  var pState = fetch(FN_URL, {
    method: 'POST',
    headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }
  })
    .then(function (res) { return res.json(); })
    .then(function (state) {
if (state && !state.error) { applyFake(state); paint(state); paintGreeting(state); addrBuild(); }
else { console.error('member-state error', state); neutralGreeting(); }
    })
    .catch(function (e) { console.error('member-state paint error', e); neutralGreeting(); });
Promise.allSettled([pName, pState]).then(function () { reveal(); });
})();
