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
        if (__ksScripts[__ksJ].src && __ksScripts[__ksJ].src.indexOf('dashboard-tool') !== -1) {
          __ksScript = __ksScripts[__ksJ]; break;
        }
      }
    }
    var __ksSrc = __ksScript && __ksScript.src ? __ksScript.src : '';
    var __ksPin = (__ksSrc.match(/@([^/]+)\/dashboard-tool(?:\.min)?\.js/) || [])[1] || 'unknown';   // S420: .min too
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
  // THE CAPPED LINE IS BUILT, NOT STORED — because "6 swaps" is only true on The Basics.
  // Toy Chest 5 toy - Full Wardrobe 10 clothing - Everything Bag 10 clothing AND 3 toy.
  // Approved copy (Jennie, S87): the allowance is named from s.caps and the rest is verbatim.
  // ⚠ THE FALLBACK IS THE PREVIOUS LIVE STRING, UNCHANGED. If caps are missing we must never
  // render "Your plan includes 0 swaps", and inventing a new sentence here would be
  // unapproved member-facing copy. Falling back to the string that already shipped is free.
  function cappedSub(s) {
    var caps = (s && s.caps) || {};
    var c = Number(caps.clothing) || 0;
    var t = Number(caps.toy) || 0;
    var allowance;
    if (c > 0 && t > 0)  allowance = c + ' clothing and ' + t + ' toy swaps';
    else if (c > 0)      allowance = c + (c === 1 ? ' swap' : ' swaps');
    else if (t > 0)      allowance = t + (t === 1 ? ' swap' : ' swaps');
    else return "You've used this month's swaps. Don't worry, your credits are safe for next month.";   // S427 hers: no em dash, "month" like the main line
    return 'Your plan includes ' + allowance + " per cycle, and you've used them all. " +
           "Don't worry, your credits are safe for next month.";
  }

  var GREET = {
    // ⚠⚠ mode WAS "manage" UNTIL S300 AND IT WAS A FAKE DOOR. That branch removes the
    // href and scrolls to the utility row's Manage Membership link, which opens the
    // STRIPE PORTAL — and the portal cannot revive a cancelled subscription (switch-plans
    // is off, and there is no subscription left to manage). So "Reactivate" flashed a
    // control that could not reactivate anything. She found it live at S300.
    // ⚠ /pricing IS THE DESTINATION because that page grew a members-only grid at S300:
    // four cards carrying data-ms-price:update, rendered on data-ms-content="no-plans",
    // i.e. exactly a logged-in member with no active plan. PROVEN END TO END S300 — a real
    // Basics checkout wrote status cancelled -> active and plan null -> The Basics, with
    // starter-pack credits correctly unmoved.
    // ⚠ PAUSED KEEPS mode:"manage" ON PURPOSE. A paused member still HAS a subscription,
    // so the portal is the right control for her. Do not "fix" both at once.
    cancelled: { sub: "Your membership won't renew. Reactivate anytime to pick up where you left off.", cta: "Reactivate",        mode: "closet", href: "/pricing", accent: false },
	paused:    { sub: "Your membership is paused. Your credits are safe and waiting.",                  cta: "Resume membership", mode: "manage",                  accent: false },
    capped:    { sub: cappedSub,                                                                        cta: "See what's new",    mode: "closet", href: "/browse", accent: false },
    // ⚠⚠ "ready to spend" IS A DELIBERATE, NARROW EXCEPTION TO THE "ADDED TO YOUR BANK,
    // NEVER READY TO SPEND" LOCK, AND IT IS SAFE FOR A STRUCTURAL REASON. DO NOT "CORRECT" IT.
    // pickState routes on signals.has_credits = bool_or(credit_amount >= 1.0), so A LONE 0.5
    // ROUTES TO `zero`, NOT HERE. Any member who reads this line provably holds a whole
    // credit. Same narrowing Jennie already allowed on /signup END STATE B (S81).
    // ⚠ THE LOCK IS UNCHANGED EVERYWHERE ELSE — §DASH.7 and every earned-credit surface.
    // ⚠ It also fixes a real error: the old line said "Your closet's ready", but on
    // /dashboard "closet" means HER KEEPS GALLERY, so it pointed at the wrong thing.
    active:    { sub: "Your credits are ready to spend.",                                               cta: "Browse the closet", mode: "closet", href: "/browse", accent: false },
    // ⚠⚠ `zero` IS THE ONLY STATE THAT GETS THE BLUE BANNER (Jennie, S78). accent:true is
    // what emits .ks-greet-accent; the CSS rule keyed to it ships in the NEXT commit.
    // ⚠ DEPLOY ORDER INVERTS HERE: this flag is INERT until the CSS moves. Ship JS first.
    zero:      { sub: "Send in a bag to earn credits and start swapping.",                               cta: "Browse the closet", mode: "closet", href: "/browse", accent: true  }
  };

  function fallbackHeadline() {
    var h = document.querySelector('.ks-greet-headline');
    if (h) h.textContent = 'Welcome back.';
  }

/* ---- NAME CASING -------------------------------------------------------
     §2 COPY RULES, HER RULING S125: capitalize AT DISPLAY, never the stored
     row - the same call as the all-caps address ruling, for the same reason.
     Her scope is every surface: "any time names are used, they should be
     shown with proper casing."
     ⚠⚠ CAPITALIZE ONLY A UNIFORMLY CASED NAME. A BARE title-case IS FORBIDDEN
     HERE: it lowercases first, which destroys internal capitals, so a
     correctly typed McAllister comes back Mcallister. It would BREAK NAMES
     THAT ARRIVED RIGHT, which is worse than the fault it fixes.
     ⚠ AND FIRST-LETTER-ONLY IS NOT ENOUGH ALONE - it leaves mary-jane as
     Mary-jane, which is why the separators are in the pattern.
     ⚠ TWO FLOORS, ACCEPTED KNOWINGLY BY HER: an all-lowercase name carrying an
     internal capital stays wrong (mcallister -> Mcallister), and an
     INTENTIONALLY lowercase name gets capitalized (bell hooks). Nothing short
     of a name dictionary tells either from a typo. Both close the day a member
     can edit her own name.
     ⚠ A THIRD COPY OF THIS RULE NOW EXISTS - bags-manage and shippo-track each
     carry their own. Different runtimes, so they cannot share; worth a diff if
     one is ever changed. */
  function displayName(v) {
    var str = String(v == null ? '' : v).trim();
    if (!str) return str;
    var hasUpper = /[A-Z]/.test(str), hasLower = /[a-z]/.test(str);
    if (hasUpper && hasLower) return str;   /* mixed = she meant it. Leave it alone. */
    return str.toLowerCase().replace(/(^|[\s\-'\u2019])([a-z])/g, function (m, sep, ch) {
      return sep + ch.toUpperCase();
    });
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
    if (_sbName) fname = _sbName;   // S420: the Supabase row wins whenever it has arrived
    var h = document.querySelector('.ks-greet-headline');
    if (!h) return;
    if (fname) _fnameDisp = displayName(fname);
    // S393: while she is new the welcome is the headline, whichever promise lands first.
    if (_jjOn) { h.textContent = welcomeHeadline(); if (fname) paintReviewPrompt(); return; }
    if (!fname) { h.textContent = 'Welcome back.'; return; }
    h.textContent = timeGreeting(fname);
    paintReviewPrompt();       // whichever promise lands second is the one that paints
  }
  
  // S420 FIX (Walk 4 fix 2, seen S416/S417): the server's is_capped came back true when
  // only ONE kind was used up (The Everything Bag: 10 clothing used, 0 of 3 toy), and on
  // The Toy Chest beside "5 of 5 swaps left" (a kind with 0 swaps counts as used up).
  // Capped now means EVERY kind her plan covers is used up, read from the same numbers
  // the swaps row uses. No caps or used numbers in the payload = trust the server, as before.
  // ?fake=capped keeps working (it fakes the signal, not the numbers).
  function allCoveredUsed(s) {
    if (_FAKE === 'capped') return true;
    var caps = (s && s.caps) || {}, used = s && s.used_this_cycle;
    if (!used) return true;
    var any = false, all = true;
    ['clothing', 'toy'].forEach(function (k) {
      var cap = parseFloat(caps[k]); if (isNaN(cap) || cap <= 0) return;
      any = true;
      var u = parseFloat(used[k]); if (isNaN(u)) u = 0;
      if (u < cap) all = false;
    });
    return any ? all : true;
  }

  function pickState(s) {
    var override = new URLSearchParams(window.location.search).get('state');
    var valid = ['cancelled','paused','capped','active','zero'];   // S427: 'expiring' removed, credits never expire
    if (override && valid.indexOf(override) !== -1) return override;
    var ms = (s.member_status || '').toLowerCase();
    if (ms === 'cancelled') return 'cancelled';
    if (ms === 'paused')    return 'paused';
    var sig = s.signals || {};
    if (sig.is_capped && allCoveredUsed(s)) return 'capped';
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
        // S393: the portal link now sits INSIDE the Manage Membership menu, so open the
        // menu first - scrollIntoView on a hidden element does nothing.
        var mwrap = document.querySelector('.ks-mem-wrap');
        if (mwrap) {
          mwrap.classList.add('is-open');
          var mtrig = mwrap.querySelector('.ks-mem-trigger');
          if (mtrig) mtrig.setAttribute('aria-expanded', 'true');
        }
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
  // ⚠⚠ THE BAG-IN-MOTION SENTENCE LIVES HERE NOW, NOT IN A CARD (Jennie, S89/S90).
  // Headline + subheading + this line read as ONE serif block at the top of the page.
  // ⚠ VERBATIM, MOVED NOT REDRAFTED — byte-identical to the string paintBagButton's
  // check 1 used to emit as .ks-sb-stop. DO NOT REWRITE IT.
  // ⚠⚠ .ks-sb-stop CARRIED THREE MESSAGES AND ONLY THIS ONE MOVED. The other two answer
  // a BUTTON PRESS and still live by the button (request success / request failure).
  // GREP THE CLASS BEFORE MOVING ANYTHING THAT WEARS IT.
  // ⚠ SHORTENED S214, HER RULING — was "You've already got a swap bag in motion. Once it finds
  //   its way back to us, we'll get the next one out to you." She cut it to one line and dropped
  //   the "we'll get the next one out" clause. This is the ACTIVE/capped/expiring bag-out line;
  //   the PRECREDIT.bagout copy (a different state) was left untouched.
  var BAG_IN_MOTION = 'You\u2019ve got a swap bag out.';

  // Returns '' when no bag sentence is owed. THE ORDER OF THESE CHECKS IS THE RULING.
  function bagSentence(s, state) {
    // ⚠ HERS, S89: to a member who has LEFT, "we'll get the next one out to you" is a
    // promise to someone who is gone. DROPPED ENTIRELY on cancelled.
    if (state === 'cancelled') return '';
    // ⚠ PAUSED IS CLAUDE'S CALL, REVERSIBLE — she ruled cancelled, not paused. Dropped for
    // the same reason. It cannot reach a member today: PAUSE IS NOT BUILT (§DASH.5).
    if (state === 'paused') return '';
    var b = s && s.bags;
    // ⚠⚠ FAILS CLOSED, same direction as paintBagButton. null means "WE DON'T KNOW",
    // never "no bag out". Never assert a bag is in motion on an unknown state.
    if (!b) return '';
    // ⚠ CHECKED BEFORE bag_out, ON PURPOSE (hers): a true day-one member waiting on her
    // SIGNUP bag gets NO bag sentence at all. Do not add one.
    if (b.has_bag_history === false) return '';
    // S427 HERS ("i want it to always be honest"): "out" means a bag has LEFT us and has
    // not come back. bag_out also counts a bag still on the ship desk ('open'), which is
    // why Maria read "bag out" with only order bags on the desk. bag_out stays broad in
    // the database on purpose (the send-a-bag stop line needs it); only this sentence narrows.
    // A bag the carrier has delivered back to us is no longer out either. When in doubt
    // (one bag out, another already back) it says nothing, never something untrue.
    if (!b.bag_shipped || b.return_delivered) return '';
    return BAG_IN_MOTION;
  }

  // ---------- #DASH-PRECREDIT ----------
  // THE THREE PRE-CREDIT STATES. Approved copy, hers, S164 — VERBATIM, DO NOT REDRAFT.
  // ⚠⚠ THESE REPLACE .ks-greet-sub AND ITS CTA ON `zero` ONLY (no whole credit yet).
  // Her ruling S165. The S90 BAG_IN_MOTION line is UNCHANGED and still renders on
  // active / capped / expiring — she rejected that wording for THIS moment and ruled it
  // stays everywhere else. One state stops reaching for it; nothing was rewritten.
  // ⚠ They also retire GREET.zero's "Send in a bag to earn credits" for these members,
  // which is the wrong-member copy this item exists to fix.
  var PRECREDIT = {
    prebag: {
      sub: 'We\u2019re getting your first swap bag ready. It will arrive already prelabeled, so all you have to do is fill it up and send it back. Outgrowing things is about to get a lot more fun.',
      /* S393 HER RULING: "See what we accept", same page. She already knows how it
         works; what she needs now is what to put in the bag. */
      cta: 'See what we accept', href: '/the-closet-standard'
    },
    bagout: {
      sub: 'You\u2019ve got a swap bag out right now, it\u2019s already prelabeled so you can fill it up and send it back whenever you\u2019re ready.',
      cta: 'See The Closet Standard', href: '/the-closet-standard'
    },
    processing: {
      sub: 'Your bag made it back to us. After processing it, we\u2019ll email you a full breakdown of what was accepted, and how many credits you earned.',
      cta: 'Browse the closet', href: null   // href routed by plan — see precredit()
    }
  };

  // PROCESSING routes to her own half of the closet, the way the signup end screens route
  // "Shop Now". Read off CAPS, not the plan NAME — a renamed plan would silently misroute.
  function closetHref(s) {
    var caps = (s && s.caps) || {};
    var c = Number(caps.clothing) || 0;
    var t = Number(caps.toy) || 0;
    if (c > 0 && t === 0) return '/clothing';
    if (t > 0 && c === 0) return '/toys';
    return '/browse';
  }

  // Returns a PRECREDIT config, or null to leave today's behaviour untouched.
  // ⚠⚠⚠ THE ORDER IS MECHANICAL, NOT A PREFERENCE. A bag whose return has landed still
  // reads status 'shipped' with returned_at null, so it satisfies bag_shipped AND
  // return_delivered AT ONCE. TEST return_delivered FIRST OR PROCESSING NEVER RENDERS.
  // ⚠⚠ FAILS CLOSED on a null payload.bags, same direction as bagSentence and
  // paintBagButton: null means "WE DON'T KNOW", never "no bag". Falling through leaves the
  // member on the line she sees today, which is never a lie — only less specific.
  // ⚠ THE FOURTH CASE IS DELIBERATE AND IS NOT A GAP: a member whose bag came back and
  // graded all-declined has returned_at set, so no bag is out and none of these three fit.
  // She falls through to GREET.zero's "Send in a bag to earn credits and start swapping.",
  // which is exactly right for her. DO NOT invent a fourth string without asking Jennie.
  function precredit(s) {
    var b = s && s.bags;
    if (!b) return null;
    if (b.return_delivered) return PRECREDIT.processing;
    if (b.bag_shipped)      return PRECREDIT.bagout;
    if (b.bag_out || b.has_bag_history === false) return PRECREDIT.prebag;
    return null;
  }

  // ---------- JUST JOINED (S393, hers) ----------
  // A brand-new member gets a welcome on the dashboard, and /signup's own welcome screen
  // retires (Stripe will land her here instead). It shows until HER FIRST SWAP BAG SHIPS:
  //   shop-first  - the empty bag rides with her first order, so until that order ships
  //   send-first  - until her empty bag is marked shipped
  // ⚠ FAILS CLOSED. No bags payload, no lifetime block, cancelled or paused = no welcome.
  // ⚠ "First" is read from what the payload has: nothing she has sent was ever accepted,
  //   she has never received an item, and she joined in the last 60 days. That is what
  //   stops a month-six member with a new bag on the desk from being welcomed again.
  // ⚠ Send-first keeps PRECREDIT.prebag's S164 line, which is locked. Only the tag is added.
  var JUST_JOINED = {
    shop: { sub: 'So glad you joined. Your credits are in your bank, ready to spend.', cta: 'Start shopping' },
    // S393 HERS: shop-first "What happens next". Built from her approved S81 welcome
    // paragraph, so nothing here is a new promise. Icons are placeholders (numbers) until
    // she paints her own.
    steps: [
      'Pick up to {n} items for your kids.',
      'Your order ships with your empty swap bag, prepaid label already attached.',
      'Fill it with what they\u2019ve outgrown and send it back to earn more credits.'
    ]
  };
  var _jjOn = false, _fnameDisp = null;
  /* ---- THE NAME, S420 (Walk 4 fix 2) ------------------------------------
     Hers S402: the Supabase member row is the one source of the name (checkout
     already reads it there). member-state sends it as first_name since S420.
     Memberstack's first-name is only the FALLBACK now: it paints first if it
     lands first, and the Supabase name replaces it when member-state lands.
     A missing or blank first_name leaves everything exactly as before. */
  var _sbName = '';
  function timeGreeting(fname) {
    var hr = new Date().getHours();
    var t = hr < 12 ? 'Good morning' : (hr < 18 ? 'Good afternoon' : 'Good evening');
    return t + ', ' + displayName(fname) + '.';
  }
  function nameFromState(s) {
    var n = (s && typeof s.first_name === 'string') ? s.first_name.trim() : '';
    if (!n) return;
    _sbName = n;
    _fnameDisp = displayName(n);
    var h = document.querySelector('.ks-greet-headline');
    if (h && !_jjOn) h.textContent = timeGreeting(n);   // the welcome headline repaints in paintGreeting
  }
  function welcomeHeadline() {
    return _fnameDisp ? ('Welcome to KidSwaps, ' + _fnameDisp + '.') : 'Welcome to KidSwaps!';
  }
  function justJoined(s, state) {
    if (state === 'cancelled' || state === 'paused') return false;
    var b = s && s.bags, lt = s && s.lifetime;
    if (!b || !lt) return false;
    if (b.bag_shipped || b.return_delivered) return false;
    if (!(b.has_bag_history === false || b.bag_out)) return false;
    if ((Number(lt.items_received) || 0) > 0) return false;
    if ((Number(lt.items_kept_from_landfill) || 0) > 0) return false;
    var since = lt.member_since ? new Date(lt.member_since) : null;
    if (!since || isNaN(since.getTime())) return false;
    return (Date.now() - since.getTime()) < 60 * 24 * 3600 * 1000;
  }
  // ---------- JUST JOINED: the extras (S393, hers) ----------
  // (1) "What happens next" under the button, shop-first only.
  // (2) "Short on credits?" hidden and (3) "How credits work" folded shut while she is new.
  function memMenuCss() {
    if (document.getElementById('ks-mem-css')) return;
    var st = document.createElement('style');
    st.id = 'ks-mem-css';
    st.textContent =
      '.ks-mem-wrap{position:relative;display:inline-block;}' +
      '.ks-mem-trigger{all:unset;cursor:pointer;color:#D24F28;font-weight:500;font-family:inherit;font-size:inherit;}' +
      '.ks-mem-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);z-index:50;min-width:230px;' +
        'background:#fff;border:1px solid #E4E1D8;border-radius:12px;padding:12px 14px;' +
        'box-shadow:0 8px 20px rgba(0,0,0,.08);text-align:left;}' +
      '.ks-mem-wrap.is-open .ks-mem-menu{display:block;}' +
      '@media (hover:hover){.ks-mem-wrap:hover .ks-mem-menu,.ks-mem-wrap:focus-within .ks-mem-menu{display:block;}}' +
      '.ks-mem-menu .ks-plan-chip{all:unset;display:block;font-size:13px;color:#76716C;line-height:1.5;' +
        'padding-bottom:10px;margin-bottom:6px;border-bottom:1px solid #EEE;}' +
      '.ks-mem-menu .ks-plan-chip b{color:#1E1A19;font-weight:600;}' +
      '.ks-mem-item{display:block;padding:6px 0;font-size:14px;color:#D24F28;text-decoration:none;cursor:pointer;}' +
      '.ks-mem-item:hover{text-decoration:underline;}';
    document.head.appendChild(st);
  }
  function nextCss() {
    if (document.getElementById('ks-next-css')) return;
    var st = document.createElement('style');
    st.id = 'ks-next-css';
    st.textContent =
      '.ks-next{max-width:620px;margin:30px auto 8px;font-family:Quicksand,sans-serif;}' +
      '.ks-next-h{text-align:center;font-size:12px;letter-spacing:.16em;color:#76716C;font-weight:600;}' +
      '.ks-next-path{display:grid;grid-template-columns:repeat(3,1fr);position:relative;margin-top:14px;}' +
      '.ks-next-path:before{content:"";position:absolute;top:27px;left:16.6%;right:16.6%;height:2px;' +
        'background:repeating-linear-gradient(90deg,#D9D6CC 0 6px,transparent 6px 12px);}' +
      '.ks-next-st{text-align:center;padding:0 10px;position:relative;}' +
      '.ks-next-ic{width:56px;height:56px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;' +
        'justify-content:center;font-size:22px;font-weight:600;background:#F4F2EC;color:#9A958C;' +
        'border:2px solid #E4E1D8;position:relative;z-index:1;}' +
      '.ks-next-st.is-now .ks-next-ic{background:#FBE3DA;color:#D24F28;border-color:#D24F28;}' +
      '.ks-next-nm{font-size:12px;letter-spacing:.12em;font-weight:600;color:#9A958C;margin-bottom:6px;}' +
      '.ks-next-st.is-now .ks-next-nm{color:#D24F28;}' +
      '.ks-next-tx{font-size:14px;line-height:1.5;color:#76716C;}' +
      '.ks-next-st.is-now .ks-next-tx{color:#1E1A19;font-weight:500;}' +
      '.ks-next-ship{font-size:12px;color:#76716C;margin-top:8px;}' +
      '.ks-next-ship button{all:unset;cursor:pointer;color:#D24F28;text-decoration:underline;}' +
      '@media (max-width:640px){.ks-next-path{grid-template-columns:1fr;gap:18px;}' +
        '.ks-next-path:before{top:28px;bottom:28px;left:27px;right:auto;width:2px;height:auto;' +
        'background:repeating-linear-gradient(180deg,#D9D6CC 0 6px,transparent 6px 12px);}' +
        '.ks-next-st{display:grid;grid-template-columns:56px 1fr;gap:0 14px;text-align:left;padding:0;}' +
        '.ks-next-ic{margin:0;grid-row:span 3;}}' +
      '.ks-hcw-fold{all:unset;cursor:pointer;}';
    document.head.appendChild(st);
  }
  function openShippingEdit() {
    var panel = document.querySelector('.ks-account-panel');
    var btn = document.querySelector('.ks-account-toggle');
    if (!panel) return;
    panel.classList.add('is-open');
    if (btn) btn.classList.add('is-open');
    var pair = null;
    _accPairs.forEach(function (p) { if (p.head.textContent === 'Shipping address') pair = p; });
    _accPairs.forEach(function (p) { closeAcc(p.head, p.body); });
    if (pair) {
      openAcc(pair.head, pair.body);
      pair.head.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  function paintNewMemberExtras(s, shopNew) {
    var cta = document.querySelector('.ks-greet-cta');
    var box = document.querySelector('.ks-next');
    if (!shopNew) { if (box) box.remove(); }
    else if (cta && cta.parentNode) {
      nextCss();
      if (!box) {
        box = document.createElement('div');
        box.className = 'ks-next';
        cta.parentNode.insertBefore(box, cta.nextSibling);
      }
      var caps = s.caps || {};
      var n = (Number(caps.clothing) || 0) + (Number(caps.toy) || 0);
      var sh = s.shipping || {};
      var where = [sh.city, sh.state].filter(Boolean).map(function (v) { return displayName(v); });
      if (sh.state) where[where.length - 1] = String(sh.state).toUpperCase();
      var html = '<div class="ks-next-h">WHAT HAPPENS NEXT</div><div class="ks-next-path">';
      JUST_JOINED.steps.forEach(function (tx, i) {
        html += '<div class="ks-next-st' + (i === 0 ? ' is-now' : '') + '">' +
                  '<div class="ks-next-ic">' + (i + 1) + '</div>' +
                  '<div class="ks-next-nm">' + (i === 0 ? 'YOU ARE HERE' : 'STEP ' + (i + 1)) + '</div>' +
                  '<div class="ks-next-tx">' + esc(tx.replace('{n}', String(n || 'a few'))) + '</div>' +
                  ((i === 1 && where.length) ? '<div class="ks-next-ship">Shipping to ' +
                    esc(where.join(', ')) + ' \u00B7 <button type="button">Change</button></div>' : '') +
                '</div>';
      });
      box.innerHTML = html + '</div>';
      var ch = box.querySelector('.ks-next-ship button');
      if (ch) ch.addEventListener('click', openShippingEdit);
    }
    // Hidden / folded for BOTH paths while she is new; restored the moment she is not.
    var pack = document.querySelector('.credit-pack-menu');
    if (pack) pack.style.display = (_jjOn || packHidden(s)) ? 'none' : '';
    var hcw = document.querySelector('.ks-sec-hcw');
    if (hcw) {
      var rowsEls = hcw.querySelectorAll('.ks-hcw-row');
      var h = hcw.querySelector('.ks-panel-h');
      [].forEach.call(rowsEls, function (r0) { r0.style.display = _jjOn ? 'none' : ''; });
      if (h && _jjOn && !h.querySelector('.ks-hcw-fold')) {
        var label = h.textContent;
        h.innerHTML = '<button type="button" class="ks-hcw-fold" aria-expanded="false">' +
                      esc(label) + ' \u25BE</button>';
        h.querySelector('.ks-hcw-fold').addEventListener('click', function () {
          var open = this.getAttribute('aria-expanded') !== 'true';
          this.setAttribute('aria-expanded', open ? 'true' : 'false');
          [].forEach.call(hcw.querySelectorAll('.ks-hcw-row'), function (r0) { r0.style.display = open ? '' : 'none'; });
        });
      }
    }
  }

  function paintGreeting(s) {
    var state = pickState(s);
    var jj = justJoined(s, state);
    _jjOn = jj;
    var oldTag = document.querySelector('.ks-greet-welcome'); if (oldTag) oldTag.remove();
    // S393 HER RULING: while she is new, the welcome IS the headline (no tag, no pill).
    var hh = document.querySelector('.ks-greet-headline');
    if (hh && jj) hh.textContent = welcomeHeadline();
    paintNewMemberExtras(s, jj && state === 'active');
    // Shop-first: she holds credits, so pickState says `active`. The welcome replaces
    // active's line and button. Send-first lands on `zero` -> PRECREDIT.prebag below.
    if (jj && state === 'active') {
      var jsub = document.querySelector('.ks-greet-sub');
      if (jsub) { jsub.textContent = JUST_JOINED.shop.sub; jsub.classList.remove('ks-greet-accent'); }
      setCTA(JUST_JOINED.shop.cta, 'closet', closetHref(s));
      return;
    }
    var cfg = GREET[state] || GREET.active;
    // ⚠ PRE-CREDIT ONLY. Any other state and this is null, so every line below behaves
    // exactly as it did before this commit.
    var pre = (state === 'zero') ? precredit(s) : null;
    var sub = document.querySelector('.ks-greet-sub');
    if (sub) {
      // cfg.sub may be a STRING or a FUNCTION of the state (capped builds its numbers live).
      var base = (typeof cfg.sub === 'function') ? cfg.sub(s) : cfg.sub;
      var bag = bagSentence(s, state);
      // ⚠⚠ THE BAG SENTENCE LEADS, AND THE ORDER IS THE RULING (hers, S90).
      // On `zero` it REPLACES the base outright — telling a member who already has a bag
      // out to "send in a bag" is the exact fault this fixes.
      // On EVERY OTHER STATE IT LEADS and the base FOLLOWS as the closing beat, which is
      // what puts the credits line directly above the CTA.
      // ⚠⚠ IT RAN base-THEN-bag FOR EXACTLY ONE COMMIT (@ad891f0) AND SHE REVERSED IT ON
      // READING IT LIVE: "Your credits are ready to spend. You’ve already got a swap bag
      // in motion" reads as a contradiction, because "already" answers an objection nobody
      // raised. NOT ONE WORD OF EITHER STRING CHANGED — ONLY THE ORDER.
      // DO NOT "simplify" this back to base-then-bag.
      // S441 HERS: on `capped` the swaps half already says it, so the base line is dropped
      // whenever that half shows. A bag sentence still shows on its own. No swaps half = as before.
      if (state === 'capped' && !pre && swapsHalfOn(s)) base = '';
      sub.textContent = pre ? pre.sub
                            : (bag ? (state === 'zero' ? bag : (base ? bag + ' ' + base : bag)) : base);
      sub.style.display = sub.textContent ? '' : 'none';
      sub.classList.toggle('ks-greet-accent', cfg.accent === true);
    }
    if (pre) setCTA(pre.cta, 'closet', pre.href || closetHref(s));
    else     setCTA(cfg.cta, cfg.mode, cfg.href);
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
    // S393 HER RULING: say WHAT resets. No year - it is always within the month.
    reset = reset.replace(/,\s*\d{4}$/, '');
    return reset ? ('Your swaps reset ' + reset + '.') : '';
  }

  function swapsReadyString(s) {
    // ⚠⚠ S393 HER RULING: THIS LINE COUNTS CREDITS, NOT SWAPS. It used to read
    //   available_this_cycle and call them "swaps in your bank" - two words for one thing,
    //   the exact mix-up /pricing was fixed for. Credits are what she HOLDS (bank.by_class);
    //   swaps are the monthly limit, and they now have their own line (paintCycleBar).
    var bc = (s.bank && s.bank.by_class) || {};
    var c = parseFloat(bc.clothing); if (isNaN(c)) c = 0;
    var t = parseFloat(bc.toy);      if (isNaN(t)) t = 0;
    if (c + t < 1) return '';   // S407 hers: half a credit - the bank says it, no "0.5" line
    var parts = [];
    if (c > 0) parts.push('<b>' + c + ' clothing credit' + (c === 1 ? '' : 's') + '</b>');
    if (t > 0) parts.push('<b>' + t + ' toy credit' + (t === 1 ? '' : 's') + '</b>');
    if (!parts.length) return '';
    // S408 hers: the whole line goes (the bank card says the same thing right under it).
    return '';
    // ⚠⚠ "this cycle" IMPLIED THE CREDITS EXPIRE AT CYCLE END — S214, her catch. They don't;
    //   credits persist across cycles (the never-expire rule / "safe for next month" promise).
    //   "in your bank" is accurate and drops the false expiry implication.
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
    // ⚠⚠ S393 HER RULING: THE BAR IS SWAPS LEFT THIS MONTH, NOT DAYS GONE. The old bar was
    //   time elapsed, so on day one it was a lone dot on an empty track and read as broken.
    //   It starts FULL and shrinks as she uses swaps. Her plan is named here, because
    //   the plan is WHY she has this many (the old top-of-page chip is gone).
    // ⚠⚠ S407 HER RULING (option 1, mockup approved): the number and its words sit together
    //   ("4 of 6 swaps left this month"), the plan name sits on its own line above, and the
    //   track is dark enough to read on the card. AT ZERO the bar is replaced by one sentence
    //   and the separate reset line is hidden, so the date is said once:
    //   "You've used this month's 6 swaps. Extra swaps are $5 each until your swaps reset
    //   October 21." Extra swaps are encouraged (hers S395); they work the same for toys (S407).
    // ⚠ FAILS CLOSED: no caps or no used_this_cycle in the payload = no bar at all.
    var line = document.querySelector('.ks-cycle-line');
    if (!line || !line.parentNode) return;
    cycleBarCss();
    var wrap = document.querySelector('.ks-cycle-bar-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ks-cycle-bar-wrap';
      line.parentNode.insertBefore(wrap, line);
    }
    var caps = s.caps || {}, used = s.used_this_cycle;
    if (!used || swapsHalfOff(s)) { wrap.style.display = 'none'; line.style.display = 'none'; arrangeHalves(); return; }
    var rows = [];
    [['clothing', 'clothing'], ['toy', 'toy']].forEach(function (k) {
      var cap = parseFloat(caps[k[0]]); if (isNaN(cap) || cap <= 0) return;
      var u = parseFloat(used[k[0]]); if (isNaN(u)) u = 0;
      var left = Math.max(cap - u, 0);
      rows.push({ name: k[1], left: left, cap: cap });
    });
    if (!rows.length) { wrap.style.display = 'none'; line.style.display = 'none'; arrangeHalves(); return; }
    wrap.style.display = '';
    line.style.display = '';
    var plan = s.plan ? String(s.plan).trim() : '';
    // S441 HERS: the swaps half. A heading, the plan name, then one row of dots per kind her
    // plan covers ("Clothing: 7 of 10 left"). A FILLED dot is a swap she still has (gold for
    // clothing, green for toys, the coin colours); a used swap is an empty ring.
    var html = '<div class="ks-sw-h">Swaps this month</div>' +
               (plan ? '<div class="ks-cycle-plan">' + esc(plan) + '</div>' : '');
    rows.forEach(function (r0) {
      var n = Math.min(Math.round(r0.cap), 20), on = Math.min(Math.round(r0.left), n), dots = '';
      for (var d = 0; d < n; d++) dots += '<i class="ks-sw-dot k-' + r0.name + (d < on ? ' is-on' : '') + '"></i>';
      html += '<div class="ks-sw-row"><div class="ks-sw-num"><b>' + (r0.name === 'toy' ? 'Toys' : 'Clothing') +
              ':</b> ' + r0.left + ' of ' + r0.cap + ' left</div><div class="ks-sw-dots" aria-hidden="true">' + dots + '</div></div>';
    });
    var allUsed = rows.every(function (r0) { return r0.left === 0; });
    if (allUsed) {
      var reset = cycleLineString(s).replace(/^Your swaps reset /, '').replace(/\.$/, '');
      var what = rows.length === 1 ? rows[0].cap + ' swaps'
               : rows.map(function (r0) { return r0.cap + ' ' + r0.name; }).join(' and ') + ' swaps';
      html += '<p class="ks-cycle-zero">You\u2019ve used this month\u2019s <b>' + esc(what) + '</b>. ' +
              'Extra swaps are $5 each' + (reset ? ' until your swaps reset ' + esc(reset) : '') + '.</p>';
      line.style.display = 'none';                 // the date lives in the sentence
    }
    wrap.innerHTML = html;
    arrangeHalves();
  }

  // ⚠⚠ S441 HERS: THE CORAL "MORE BELOW" ARROW, PHONES ONLY (under 768px). Pinned to the
  //   bottom of the screen on a soft white pill, it bobs to say there's more. It stays until the
  //   LAST section of the page reaches the screen, then fades (and comes back if she scrolls up).
  //   A tap scrolls to the next section that isn't fully on screen yet. Reduced motion: still,
  //   and the scroll jumps instead of gliding. The look lives in dashboard.css (.ks-more-arrow).
  //   Sections are read by their real position on screen, because phones reorder the cards
  //   with CSS order (the DOM order is not the visual order).
  var _moreUpdate = null;
  function moreSections() {
    var out = [], sw = document.querySelector('.ks-bank-halves:not(.is-solo) .ks-half--swaps');
    if (sw && sw.offsetHeight) out.push(sw);
    var pm = document.querySelector('.ks-hero-card .credit-pack-menu');
    if (pm && pm.offsetHeight) out.push(pm);
    [].forEach.call(document.querySelectorAll('.ks-grid .ks-closet-sec'), function (e) {
      if (e.offsetHeight) out.push(e);
    });
    return out;
  }
  function moreArrow() {
    if (_moreUpdate) { _moreUpdate(); return; }
    if (!document.body || !window.matchMedia) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ks-more-arrow is-gone';
    b.setAttribute('aria-label', 'Scroll down for more');
    b.innerHTML = '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true"><path d="M2 2 L11 11 L20 2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    document.body.appendChild(b);
    var mq = window.matchMedia('(max-width: 767px)');
    function update() {
      var l = moreSections(), lastTop = -1e9;
      l.forEach(function (e) { lastTop = Math.max(lastTop, e.getBoundingClientRect().top); });
      var on = mq.matches && l.length > 0 && lastTop > window.innerHeight - 60;
      var wasGone = b.classList.contains('is-gone');
      b.classList.toggle('is-gone', !on);
      if (on && wasGone) setTimeout(lift, 0);   // re-check its spot each time it comes back
    }
    b.addEventListener('click', function () {
      var l = moreSections().map(function (e) { var r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })
        .sort(function (x, y) { return x.top - y.top; });
      var next = null;
      for (var i = 0; i < l.length; i++) { if (l[i].top > 90 && l[i].bottom > window.innerHeight - 20) { next = l[i]; break; } }
      if (!next) return;
      var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { window.scrollTo({ top: window.pageYOffset + next.top - 24, behavior: still ? 'auto' : 'smooth' }); }
      catch (e) { window.scrollTo(0, window.pageYOffset + next.top - 24); }
    });
    // S441: anything else pinned to that spot (today Memberstack's Test Mode badge) would
    // cover the arrow, so it sits just above whatever is there. Nothing there = its own spot.
    function lift() {
      b.style.bottom = '';
      if (!document.elementsFromPoint || b.classList.contains('is-gone')) return;
      var r = b.getBoundingClientRect(), hits = document.elementsFromPoint(window.innerWidth / 2, r.top + r.height / 2);
      for (var i = 0; i < hits.length; i++) {
        var e = hits[i];
        if (e === b || b.contains(e)) continue;
        for (var a = e; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
          if (getComputedStyle(a).position === 'fixed') {
            var fr = a.getBoundingClientRect();
            if (fr.top < r.bottom && fr.bottom > r.top) b.style.bottom = Math.round(window.innerHeight - fr.top + 10) + 'px';
            return;
          }
        }
        return;   // the first thing under it is page content, so the spot is clear
      }
    }
    function updateLift() { update(); lift(); }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', updateLift);
    _moreUpdate = update;
    update(); setTimeout(updateLift, 1500); setTimeout(updateLift, 4000); setTimeout(updateLift, 8000);
  }

  // S441: paused or cancelled = no swaps half (she can't swap). Cancelled also has no caps.
  function swapsHalfOff(s) {
    var ms = String((s && s.member_status) || '').toLowerCase();
    return ms === 'paused' || ms === 'cancelled';
  }
  // True when the swaps half will show, read from the same numbers paintCycleBar uses.
  function swapsHalfOn(s) {
    if (!s || !s.used_this_cycle || swapsHalfOff(s)) return false;
    var caps = s.caps || {};
    return (parseFloat(caps.clothing) > 0) || (parseFloat(caps.toy) > 0);
  }

  // S441 HERS: the bank section is two halves, credits and swaps. Every piece is MOVED here,
  // never rebuilt, so every paint hook keeps working. Phone: stacked with a short rule between.
  // 768px and up: side by side with a thin line between, no wider than the greeting.
  // No swaps half (paused, cancelled, no numbers) = the credits half sits alone, centred.
  function arrangeHalves() {
    var card = document.querySelector('.ks-hero-card'), ksb = document.querySelector('.ksb');
    if (!card || !ksb || !ksb.parentNode) return;
    var h = card.querySelector('.ks-bank-halves');
    if (!h) {
      h = document.createElement('div');
      h.className = 'ks-bank-halves';
      h.innerHTML = '<div class="ks-half ks-half--credits"></div><div class="ks-half-rule" aria-hidden="true"></div><div class="ks-half ks-half--swaps"></div>';
      ksb.parentNode.insertBefore(h, ksb);
    }
    var L = h.querySelector('.ks-half--credits'), R = h.querySelector('.ks-half--swaps');
    if (ksb.parentNode !== L) L.appendChild(ksb);
    var w = document.querySelector('.ks-cycle-bar-wrap'), cl = document.querySelector('.ks-cycle-line');
    if (w && w.parentNode !== R) R.appendChild(w);
    if (cl && cl.parentNode !== R) R.appendChild(cl);
    h.classList.toggle('is-solo', !(w && w.style.display !== 'none'));
    if (_bankFit) _bankFit();
  }

  function cycleBarCss() {
    if (document.getElementById('ks-cycle-css')) return;
    var st = document.createElement('style');
    st.id = 'ks-cycle-css';
    st.textContent =
      '.ks-cycle-plan{font-size:13px;color:#75736E;margin:0 0 4px;}' +
      '.ks-cycle-num{font-size:15px;color:#1E1A19;margin:0 0 8px;}' +
      '.ks-cycle-num b{font-weight:700;}' +
      '.ks-cycle-num + .ks-cycle-bar-track{margin-bottom:14px;}' +
      '.ks-cycle-bar-wrap .ks-cycle-bar-track{background:rgba(30,26,25,.14);}' +
      '.ks-cycle-bar-wrap .ks-cycle-bar-track:last-child{margin-bottom:0;}' +
      '.ks-cycle-zero{font-size:15px;line-height:1.5;color:#1E1A19;margin:0;}' +
      '.ks-cycle-zero b{font-weight:700;}';
    document.head.appendChild(st);
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
label.textContent = 'Credit Bank';   // hers S406
    label.style.display = 'none';        // S441 hers: the heading is gone; "You have" says it
  }

  var PLAN_PRICE = { 'basics': 30, 'toy chest': 45, 'full wardrobe': 45, 'everything bag': 70 };

  function paintPlanChip(s) {
    // ⚠⚠ S393 HER RULING: THE PLAN CHIP LEFT THE TOP OF THE PAGE - it read as a button.
    //   The plan NAME now sits in the swaps bar; the plan AND PRICE sit as the first line of
    //   the Account & Settings panel. Manage Membership STAYS a visible link on its own:
    //   it is the cancel path, and "visible on the dashboard" is part of the open
    //   cancel-path question with Shahin.
    // ⚠ Inserted AFTER buildAccordion has run, and it is NOT a section, so ACC_LABELS'
    //   positional index is untouched.
    // (S393, option A: it now lives inside the Manage Membership menu, not the account panel.)
    var chip = document.querySelector('.ks-plan-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'ks-plan-chip';
      var menuEl = document.querySelector('.ks-mem-menu');
      var sub = document.querySelector('.ks-greet-sub');
      if (menuEl) menuEl.insertBefore(chip, menuEl.firstChild);
      else if (sub && sub.parentNode) sub.parentNode.insertBefore(chip, sub.nextSibling);
      else return;
    }
    var raw = (s && s.plan) ? String(s.plan).trim() : '';
    var key = raw.toLowerCase().replace(/^the\s+/, '');
    var price = PLAN_PRICE[key];
    if (!raw || price === undefined) { chip.style.display = 'none'; return; }
    chip.style.display = '';
    chip.innerHTML = 'Your plan<br><b>' + esc(raw) + ' \u00B7 $' + price + '/mo</b>';
  }

  // ---------- CREDIT BANK (S406, hers) ----------
  // The approved S400 bank, the SAME bowl as checkout-tool.js (hers S400: every bank looks
  // the same; change them together). Mockup approved S406:
  // https://claude.ai/artifact/Btf8xjhFX5GNKzqWzfjNhP
  // Bowl on the left, words on the right. A kind the plan covers shows even at 0 ("0 toy
  // credits", grey, hers S406). Up to 30 coins; past 30 the pile stops and the number keeps
  // counting (hers S406). The pour plays on a first visit, and when new credits land only
  // the new coins fall; a return visit shows the pile sitting there (hers S397).
  // EMPTY BANK (hers S403, cases ruled S406): always shown, the bowl rocks once, and the
  // words follow where her bag is. See bankEmpty().
  // ⚠ FAILURE DIRECTION: the words are real text written first. Reduced motion or a
  // missing image leaves the numbers right and the coins sitting still.
  // ⚠ The old coin row (.ks-coins-row) is hidden, not deleted: its [data-coin] numbers are
  // still written because the credit pack snapshot reads them (wirePackSnapshot).
  var PILE_ART = 'https://cdn.jsdelivr.net/gh/jennie-maker/kidswaps-scripts@b1c24101b87e8842d1bba248a7ecc8ff78d8c494/';
  var PILE_H = { bowl: 239, 'bowl-rim': 239, fall1: 164, fall2: 145, fall3: 177, flatA: 74, flatB: 74, flatC: 83, leanA: 114, leanB: 114 };
  var PW = 460, PCW = 96, PBOWL = { w: 300, x: 80, y: 110 }, PFLOOR = 190, PTABLE = 233, PCX = PW / 2;
  var PSPOTS = [[0,4,'flatC',2],[-64,0,'flatA',-3],[59,2,'flatB',4],[-34,16,'leanA',-6],[36,18,'leanB',6],[0,28,'flatA',-2],
    [-75,20,'leanA',-10],[77,22,'leanB',9],[-40,34,'flatA',-2,-150],[-17,42,'flatB',5],[44,36,'flatB',3,152],[10,54,'leanA',-8],
    [-50,48,'flatB',4],[52,50,'leanB',8],[-90,36,'leanA',-12],[92,38,'leanB',12],[-24,62,'flatA',-3],[28,64,'flatC',3],
    [0,76,'leanA',-6],[-60,62,'leanA',-9],[62,66,'leanB',9],[-60,50,'flatA',-2,-118,18],[-12,88,'flatB',4],[60,50,'flatB',3,116,20],
    [20,96,'leanB',7],[-38,80,'flatC',-4],[-40,70,'flatC',-3,-182,6],[42,84,'flatA',5],[0,108,'flatC',-2],[30,90,'flatB',-3,178,8]];
  var PFALL = ['fall1', 'fall2', 'fall3'];
  var BANK_PANEL_LINE = 'Every item is tagged Essentials, Elevated or Special. A credit covers an item in its own tier or a lower one. A higher-tier item adds a small upgrade fee.';   // hers S406
  var _bankFit = null, _bankPopBound = false;

  function bankCss() {
    if (document.getElementById('ks-bank-css')) return;
    var st = document.createElement('style');
    st.id = 'ks-bank-css';
    st.textContent =
      // S408, hers: layout D, "one centre line", the same bank as checkout-tool.js @9cfb4d4.
      // A white card; the bowl, the total, the two kinds side by side, the tier link, centred.
      '.ksb{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;margin:4px 0 0;text-align:center;background:#fff;border:1px solid rgba(33,27,26,.14);border-radius:16px;padding:24px 32px 22px;}' +
      '.ksb-pile{position:relative;flex:none;width:350px;max-width:100%;cursor:pointer;}' +
      '.ksb-scene{position:relative;overflow:hidden;}' +
      '.ksb--pour .ksb-scene{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 9%);mask-image:linear-gradient(to bottom,transparent 0,#000 9%);}' +
      '.ksb-world{position:absolute;left:0;top:0;width:460px;height:305px;transform-origin:0 0;}' +
      '.ksb-world img,.ksb-world .sh{position:absolute;left:0;top:0;will-change:transform;max-width:none;}' +
      '.ksb-world .sh{border-radius:50%;background:rgba(33,27,26,.55);filter:blur(4px);}' +
      '.ksb-meta{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;}' +
      // S408 hers: large text is Instrument Serif, small is Quicksand (same as checkout @S408c)
      // S408 hers: the "You have" eyebrow over the total, on every bank
      '.ksb-eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6E6A63;margin:0 0 -8px;}' +
      '.ksb-cap{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:40px;line-height:1;color:#211b1a;margin:0;}' +
      '.ksb-tiers{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;font-size:15px;line-height:1.45;}' +
      '.ksb-pk{display:flex;flex-wrap:wrap;align-items:center;gap:2px 12px;}' +
      '.ksb-pk .lab{display:inline-flex;align-items:center;gap:7px;}' +
      '.ksb-pk img{width:18px;height:auto;}' +
      '.ksb-pk b{font-weight:600;color:#211b1a;}' +
      '.ksb-pk.zero b{color:#6E6A63;font-weight:500;}' +
      '.ksb-pk .tl{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 12px;}' +
      '.ksb-ess{color:#6E6A63;}.ksb-elev{color:#1c4a91;font-weight:600;}.ksb-spec{color:#e54f25;font-weight:600;}' +
      '.ksb-hint{display:inline-block;margin:0;border:0;background:none;padding:3px 0;font-family:inherit;font-size:12.5px;color:#6E6A63;text-decoration:underline;text-underline-offset:3px;border-radius:4px;cursor:pointer;}' +
      '.ksb-hint:focus-visible{outline:2px solid #211b1a;outline-offset:2px;}' +
      '.ksb-hint .tp{display:none;}' +
      '@media (hover:none){.ksb-hint .hv{display:none;}.ksb-hint .tp{display:inline;}}' +
      '.ksb-pop{position:absolute;top:calc(100% + 6px);left:50%;width:300px;max-width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(33,27,26,.14);border-radius:16px;box-shadow:0 10px 30px rgba(30,26,25,.14);padding:16px 18px 14px;text-align:center;white-space:normal;opacity:0;pointer-events:none;transform:translate(-50%,-6px);transition:opacity .18s ease,transform .18s ease;z-index:600;}' +
      '.ksb-pop.open{opacity:1;pointer-events:auto;transform:translate(-50%,0);}' +
      '.ksb-pop .pop-h{font-family:"Instrument Serif",Georgia,serif;font-size:19px;color:#211b1a;margin:0 0 10px;}' +
      '.ksb-pop .ksb-tiers{flex-direction:column;flex-wrap:nowrap;gap:10px;font-size:14px;align-items:center;}' +
      '.ksb-pop .ksb-pk{flex-direction:column;gap:2px;}' +
      '.ksb-pop .ksb-pk img{width:18px;}' +
      '.ksb-pop .pop-p{font-size:13px;line-height:1.5;color:#6E6A63;margin:12px 0 0;}' +
      '.ksb-line{font-size:14.5px;line-height:1.5;color:#4d4843;margin:0;max-width:360px;}' +
      '.ksb-ctas{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;}' +
      '.ksb-btn{display:inline-block;font-family:inherit;font-size:15px;font-weight:700;border-radius:999px;padding:11px 18px;border:1.5px solid #211b1a;text-decoration:none;cursor:pointer;line-height:1.2;}' +
      '.ksb-btn.pri{background:#211b1a;color:#fff;}.ksb-btn.sec{background:transparent;color:#211b1a;}' +
      '@media (prefers-reduced-motion:reduce){.ksb-pop{transition:none;}}' +
      '@media (max-width:600px){.ksb{padding:20px 16px 18px;}.ksb-pile{width:290px;}.ksb--empty .ksb-btn{width:100%;text-align:center;}}';
    document.head.appendChild(st);
  }

  function bankNum(v) { var n = parseFloat(v); return (isNaN(n) || n < 0) ? 0 : n; }
  function bankTierWords(obj) {
    var parts = [];
    [['essentials','Essential','Essentials','ess'], ['elevated','Elevated','Elevated','elev'], ['special','Special','Special','spec']].forEach(function (t) {
      var n = parseFloat(obj && obj[t[0]]);
      if (!isNaN(n) && n > 0) parts.push('<span class="ksb-' + t[3] + '">' + esc(String(n) + ' ' + (n === 1 ? t[1] : t[2])) + '</span>');
    });
    return parts.join('');
  }

  // THE EMPTY BANK, the six cases ruled S406 (hers: "im going to trust you on this one").
  // The words follow where her bag is, read the same way precredit() reads it, and
  // return_delivered is tested FIRST for the same mechanical reason.
  // Returns { line, btns: [[text, href, isPack]] }.
  function bankEmpty(s) {
    var ms = String((s && s.member_status) || '').toLowerCase();
    if (ms === 'paused' || ms === 'cancelled') return { line: '', btns: [] };   // case 5: the greeting carries Resume / Reactivate
    var b = s && s.bags, lt = (s && s.lifetime) || {};
    var PACK = ['Buy a credit pack', '/pricing', true];
    // ⚠ FAILS CLOSED: no bags payload = her S403 line and no buttons. Never a lie.
    if (!b) return { line: 'To get more credits you can send in more items, or buy a credit pack.', btns: [] };
    if (b.return_delivered) return { line: 'Your bag made it back to us. Your credits land once it\u2019s graded, or you can buy a credit pack to shop now.', btns: [PACK] };   // case 3
    if (b.bag_shipped) return { line: 'To get more credits you can send in more items, or buy a credit pack.', btns: [['How to send your bag', '/how-it-works'], PACK] };   // case 2, her S403 line
    var firstBag = (Number(lt.items_received) || 0) === 0 && (Number(lt.items_kept_from_landfill) || 0) === 0;
    if (b.has_bag_history === false || (b.bag_out && firstBag)) {
      // case 1: her first bag is not out yet. No credit pack: a send-first member was told
      // "no charge today", so a pack would be a surprise first charge (S406).
      // S407 hers: no button here; the greeting's coral "See what we accept" is the same link.
      return { line: 'Your first swap bag is getting ready. Fill it up and send it back to earn credits.', btns: [], freeBag: true };
    }
    if (b.bag_out) {
      // found at the S406 build, not in the mockup: a later bag still on the ship desk
      // (it rides inside an order she has placed). Claude's wording; hers to change.
      return { line: 'Your next swap bag is coming with your order. You can also buy a credit pack to shop now.', btns: [PACK] };
    }
    // case 4: no bag anywhere. Her next bag comes inside her next order (S357 gap stays open).
    return { line: 'Your next swap bag comes with your next order. Buy a credit pack to shop now.', btns: [PACK] };
  }

  // S407 hers: "Short on credits?" is hidden when paused or cancelled (she can't swap), and on
  // the free-bag empty bank (a send-first member was told "no charge today").
  function packHidden(s) {
    var ms = String((s && s.member_status) || '').toLowerCase();
    if (ms === 'paused' || ms === 'cancelled') return true;
    var bc = (s && s.bank && s.bank.by_class) || {};
    if (bankNum(bc.clothing) + bankNum(bc.toy) >= 1) return false;
    return !!bankEmpty(s).freeBag;
  }

  function bankHtml(s, capOverride) {
    var bc = (s.bank && s.bank.by_class) || {}, bct = (s.bank && s.bank.by_class_tier) || {}, caps = s.caps || {};
    var c = bankNum(bc.clothing), t = bankNum(bc.toy), total = c + t;
    var shown = [];
    if (bankNum(caps.clothing) > 0 || c > 0) shown.push(['clothing', c]);
    if (bankNum(caps.toy) > 0 || t > 0) shown.push(['toy', t]);
    var empty = total < 1;
    var coins = empty ? 0 : Math.min(PSPOTS.length, Math.floor(c) + Math.floor(t));
    var cap = capOverride || (total === 0 ? '0 credits' : (empty ? 'Half a credit' : (total === 1 ? '1 credit' : String(total) + ' credits')));
    function kind(x, withTiers) {
      return '<div class="ksb-pk' + (x[1] ? '' : ' zero') + '"><span class="lab"><img alt="" src="' + PILE_ART + x[0] + '-face.webp"><b>' +
        esc(String(x[1]) + ' ' + x[0] + (withTiers ? ' credit' + (x[1] === 1 ? '' : 's') : '')) + '</b></span>' +   // S441 hers: "6 clothing" beside the coin

        (withTiers ? '<span class="tl">' + bankTierWords(bct[x[0]]) + '</span>' : '') + '</div>';
    }
    var meta, pop = '';
    if (empty) {
      var e = bankEmpty(s);
      // case 6: half a credit. Same buttons as her bag case, with one line in front (S406).
      var line = e.line && total > 0 ? 'Another half makes it whole. ' + e.line : e.line;
      meta = '<div class="ksb-eyebrow">You have</div><div class="ksb-cap">' + esc(cap) + '</div>' +
        (line ? '<p class="ksb-line">' + esc(line) + '</p>' : '') +
        (e.btns.length ? '<div class="ksb-ctas">' + e.btns.map(function (x, i) {
          return '<a class="ksb-btn ' + (i ? 'sec' : 'pri') + '" href="' + x[1] + '"' + (x[2] ? ' data-ksb-pack="1"' : '') + '>' + esc(x[0]) + '</a>';
        }).join('') + '</div>' : '');
    } else {
      meta = '<div class="ksb-eyebrow">You have</div><div class="ksb-cap">' + esc(cap) + '</div>' +
        '<div class="ksb-tiers">' + shown.map(function (x) { return kind(x, false); }).join('') + '</div>' +
        '<button class="ksb-hint" type="button" aria-expanded="false"><span class="hv">Hover to see your tiers</span><span class="tp">Tap to see your tiers</span></button>';
      pop = '<div class="ksb-pop" role="region" aria-label="Your credits by tier"><div class="pop-h">Your credits by tier</div>' +
        '<div class="ksb-tiers">' + shown.map(function (x) { return kind(x, true); }).join('') + '</div>' +
        '<p class="pop-p">' + esc(BANK_PANEL_LINE) + '</p></div>';
    }
    return { empty: empty, coins: coins, c: Math.floor(c), t: Math.floor(t),
      html: '<div class="ksb-pile"><div class="ksb-scene"><div class="ksb-world"></div></div></div><div class="ksb-meta">' + meta + '</div>' + pop };
  }

  function bankArmPop(wrap) {
    var pop = wrap.querySelector('.ksb-pop'), btn = wrap.querySelector('.ksb-hint'), meta = wrap.querySelector('.ksb-meta'), pile = wrap.querySelector('.ksb-pile');
    if (!pop || !btn) return;
    function openPop(on) { pop.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
    if (window.matchMedia && window.matchMedia('(hover:hover)').matches) {
      var ht;
      [meta, pop].forEach(function (z) {
        z.addEventListener('mouseenter', function () { clearTimeout(ht); openPop(true); });
        z.addEventListener('mouseleave', function () { ht = setTimeout(function () { openPop(false); }, 150); });
      });
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); openPop(!pop.classList.contains('open')); });
    pile.addEventListener('click', function (e) { e.stopPropagation(); openPop(!pop.classList.contains('open')); });
    if (!_bankPopBound) {
      _bankPopBound = true;
      document.addEventListener('click', function (e) {
        var p = document.querySelector('.ksb-pop.open');
        if (p && !p.contains(e.target)) { p.classList.remove('open'); var b = document.querySelector('.ksb-hint'); if (b) b.setAttribute('aria-expanded', 'false'); }
      });
      document.addEventListener('keydown', function (e) {
        var p = document.querySelector('.ksb-pop.open');
        if ((e.key === 'Escape' || e.keyCode === 27) && p) { p.classList.remove('open'); var b = document.querySelector('.ksb-hint'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); } }
      });
    }
  }

  // The credit pack button: jump to the dashboard's own pack section when it is on screen,
  // otherwise it is a plain link to /pricing (which sells both packs). Never a dead button.
  function bankArmPack(wrap) {
    wrap.querySelectorAll('[data-ksb-pack]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var m = document.querySelector('.credit-pack-menu');
        if (m && m.offsetParent !== null) { e.preventDefault(); m.scrollIntoView({ behavior: COIN_REDUCE ? 'auto' : 'smooth', block: 'center' }); }
      });
    });
  }

  window.addEventListener('resize', function () { if (_bankFit) _bankFit(); });

  // from = how many coins are already sitting there; coins from..n-1 fall. from >= n sits still.
  function bankPile(wrap, info, from, onPour) {
    var box = wrap.querySelector('.ksb-pile'), scene = box.querySelector('.ksb-scene'), world = box.querySelector('.ksb-world');
    var nc = info.c, nt = info.t, n = info.coins, total = nc + nt;
    function isToy(i) { return total ? Math.floor((i + 1) * nt / total) > Math.floor(i * nt / total) : false; }
    function K(i, key) { return (isToy(i) ? 'toy-' : 'clothing-') + key; }
    function src(k) { return PILE_ART + k + '.webp'; }
    function hOf(k) { return PCW * (PILE_H[k.replace(/^(clothing|toy)-/, '')] || 100) / 180; }
    function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; world.appendChild(e); return e; }
    function img(key, z, w) { var e = el('img'); e.alt = ''; e.src = src(key); e.style.width = (w || PCW) + 'px'; e.style.zIndex = z; return e; }
    var bsh = el('div');
    bsh.style.cssText = 'position:absolute;left:0;top:0;z-index:0;width:250px;height:26px;border-radius:50%;background:radial-gradient(closest-side,rgba(33,27,26,.32),rgba(33,27,26,0));transform:translate(105px,212px)';
    var bowl = img('bowl', 1, PBOWL.w), rim = img('bowl-rim', 100, PBOWL.w);
    function bowlAt(r) { var tf = 'translate(' + PBOWL.x + 'px,' + PBOWL.y + 'px) rotate(' + r + 'deg)'; bowl.style.transformOrigin = rim.style.transformOrigin = '50% 100%'; bowl.style.transform = rim.style.transform = tf; }
    bowlAt(0);
    function finalPos(i) { var s = PSPOTS[i]; return s[4] ? { x: PCX + s[4], b: PTABLE + (s[5] || 0), z: 200 + i * 2 } : { x: PCX + s[0], b: PFLOOR - s[1], z: 10 + i * 2 }; }
    // trim the sky to the pile's own height, same numbers as checkout (S401)
    var top = 110;
    for (var q = 0; q < n; q++) top = Math.min(top, finalPos(q).b - hOf(K(q, PSPOTS[q][2])));
    // S407: the scene's floor grows to fit the lowest coin, so spilled coins on the table
    // are never cut off (seen on the 50-credit pile)
    var PBOT = 248;
    for (var q2 = 0; q2 < n; q2++) PBOT = Math.max(PBOT, finalPos(q2).b + 10);
    var CROP = Math.max(0, top - 8);
    function fit() { var k = scene.clientWidth / PW; world.style.transform = 'scale(' + k + ') translateY(' + (-CROP) + 'px)'; scene.style.height = ((PBOT - CROP) * k) + 'px'; }
    fit(); _bankFit = fit;
    function anim(d, step, done) { var t0 = null; function f(t) { if (t0 === null) t0 = t; var k = Math.min(1, (t - t0) / d); step(k); if (k < 1) requestAnimationFrame(f); else if (done) done(); } requestAnimationFrame(f); }
    var canMove = !COIN_REDUCE && !!window.requestAnimationFrame;
    if (!n) {                                         // the empty bowl rocks once (hers S403)
      if (canMove) whenBankOnScreen(box, function () { anim(900, function (k) { bowlAt(4 * Math.sin(k * Math.PI * 3) * Math.pow(1 - k, 1.4)); }, function () { bowlAt(0); }); });
      return false;
    }
    var coins = [];
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function place(c, x, bot, rot, sx, sy) { c.e.style.transformOrigin = '50% 100%'; c.e.style.transform = 'translate(' + (x - PCW / 2) + 'px,' + (bot - hOf(c.key)) + 'px) rotate(' + rot + 'deg) scale(' + (sx || 1) + ',' + (sy || 1) + ')'; }
    function shadow(c, x, bot, k) { var w = 86 * (0.35 + 0.65 * k); c.sh.style.width = w + 'px'; c.sh.style.height = (14 * (0.5 + 0.5 * k)) + 'px'; c.sh.style.opacity = k * 0.6; c.sh.style.transform = 'translate(' + (x - w / 2) + 'px,' + (bot - 10) + 'px)'; }
    function setKey(c, k) { c.key = k; c.e.src = src(k); }
    function settle(c, i) { var s = PSPOTS[i], p = finalPos(i); setKey(c, K(i, s[2])); c.e.style.zIndex = p.z; c.sh.style.zIndex = p.z - 1; place(c, p.x, p.b, s[3]); shadow(c, p.x, p.b, 1); }
    function nudge(i, x) {
      coins.forEach(function (o, j) {
        if (!o || j >= i || o.busy || PSPOTS[j][4]) return;
        var p = finalPos(j); if (Math.abs(p.x - x) > 70) return;
        var s = PSPOTS[j], a = rnd(1, 2.2), w = rnd(-0.6, 0.6);
        anim(140, function (k) { place(o, p.x, p.b + Math.sin(k * Math.PI) * a, s[3] + Math.sin(k * Math.PI) * w); });
      });
    }
    function drop(i) {
      var s = PSPOTS[i], spill = !!s[4], c = { key: K(i, PFALL[i % 3]), busy: 1 };
      c.e = img(c.key, 10 + i * 2); c.sh = el('div', 'sh'); c.sh.style.zIndex = 9 + i * 2; coins[i] = c;
      var land = spill ? { x: PCX + s[4] * 0.3, b: PFLOOR - s[1] - 8 } : finalPos(i);
      var x0 = land.x + rnd(-36, 36), y0 = -60, T = rnd(380, 440), spin = rnd(200, 340) * (Math.random() < 0.5 ? -1 : 1), fl = Math.random() < 0.5 ? 1 : 2, r0 = s[3] - spin;
      // same fade as checkout (S400/S401): solid before it lands, measured from the trimmed top
      var fadeTo = Math.max(CROP + 12, Math.min(CROP + 60, land.b - 4));
      c.e.style.opacity = 0; place(c, x0, y0, r0);
      anim(T, function (k) {
        var g = k * k, x = x0 + (land.x - x0) * (1 - (1 - k) * (1 - k)), b = y0 + (land.b - y0) * g, ph = Math.cos(k * fl * Math.PI * 2);
        c.e.style.opacity = Math.max(0, Math.min(1, (b - CROP) / (fadeTo - CROP)));
        place(c, x, b, r0 + spin * (1 - (1 - k) * (1 - k)), 1, 0.3 + 0.7 * Math.abs(ph)); shadow(c, land.x, land.b, g * 0.8);
      }, function () {
        c.e.style.opacity = 1; setKey(c, K(i, s[2])); nudge(i, land.x);
        var hop = rnd(2, 4), rock = rnd(2, 3.5) * (Math.random() < 0.5 ? -1 : 1), rot = s[3];
        anim(60, function (k) { place(c, land.x, land.b, rot, 1 + 0.07 * Math.sin(k * Math.PI), 1 - 0.14 * Math.sin(k * Math.PI)); shadow(c, land.x, land.b, 1); }, function () {
          anim(110, function (k) { place(c, land.x, land.b - Math.sin(k * Math.PI) * hop, rot + rock * k); }, function () {
            anim(220, function (k) { place(c, land.x, land.b, rot + rock * Math.cos(k * Math.PI * 2) * Math.pow(1 - k, 2)); }, function () {
              if (!spill) { c.busy = 0; settle(c, i); return; }
              var p = finalPos(i), dir = Math.sign(s[4]);
              c.e.style.zIndex = p.z; c.sh.style.zIndex = p.z - 1;
              anim(340, function (k) {
                var x = land.x + (p.x - land.x) * (1 - (1 - k) * (1 - k) * 0.4 - 0.6 * (1 - k)), b = land.b + (p.b - land.b) * k * k;
                place(c, x, b, rot + dir * 28 * Math.sin(k * Math.PI)); shadow(c, x, p.b, 0.4 + 0.6 * k);
              }, function () {
                anim(160, function (k) { place(c, p.x, p.b - Math.sin(k * Math.PI) * 2, s[3] + dir * 4 * (1 - k)); }, function () { c.busy = 0; settle(c, i); });
              });
            });
          });
        });
      });
    }
    if (!canMove) from = n;
    var still = Math.min(from, n);
    for (var i = 0; i < still; i++) { var cc = { key: K(i, PSPOTS[i][2]) }; cc.e = img(cc.key, 1); cc.sh = el('div', 'sh'); coins[i] = cc; settle(cc, i); }
    if (still >= n) return false;
    // ⚠ S407: EVERY PICTURE THE POUR USES IS DOWNLOADED FIRST. A coin swaps from its falling
    //   picture to its resting one as it lands; on a first visit the resting picture was not
    //   downloaded yet, so the tall falling picture sat in the resting spot for a moment and
    //   the coin looked like it fell through the bowl, then jumped back up. Gives up waiting
    //   after 3 seconds and pours anyway.
    var need = {}, held = [], pending = 0, ready = false, readyCbs = [];
    for (var j0 = still; j0 < n; j0++) { need[K(j0, PFALL[j0 % 3])] = 1; need[K(j0, PSPOTS[j0][2])] = 1; }
    function markReady() { if (ready) return; ready = true; readyCbs.forEach(function (f) { f(); }); }
    function oneDone() { pending--; if (pending <= 0) markReady(); }
    Object.keys(need).forEach(function (k) {
      pending++;
      var im = new Image(); held.push(im);
      im.onload = function () { if (im.decode) im.decode().then(oneDone, oneDone); else oneDone(); };
      im.onerror = oneDone;
      im.src = src(k);
    });
    setTimeout(markReady, 3000);
    function whenReady(f) { if (ready) f(); else readyCbs.push(f); }
    wrap.classList.add('ksb--pour');
    whenBankOnScreen(box, function () {
      whenReady(function () {
        if (onPour) onPour();                         // S407: "seen" is written as the coins start falling
        var t = 350;
        for (var j = still; j < n; j++) {
          (function (j) { setTimeout(function () { drop(j); }, t); })(j);
          t += j < 14 ? (110 + Math.random() * 90) : (30 + Math.random() * 25);
        }
      });
    });
    return true;
  }

  // the pour waits until the bowl is on screen (a phone may need a scroll)
  function whenBankOnScreen(box, go) {
    var done = false;
    function once() { if (!done) { done = true; setTimeout(function () { kidsWhenClosed(go); }, 250); } }   // S435: waits for the kids step
    if (!('IntersectionObserver' in window)) { once(); return; }
    var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); once(); } }); }, { threshold: 0.6 });
    io.observe(box);
  }

  // How many coins she has already watched land. Separate key under ?fake= so a preview
  // never changes what her real dashboard pours.
  function bankSeenKey() { return 'ks_bank_seen' + (_FAKE ? '_fake_' + _FAKE : ''); }
  function bankSeenGet() { try { var v = localStorage.getItem(bankSeenKey()); return v === null ? null : parseInt(v, 10); } catch (e) { return null; } }
  function bankSeenSet(n) { try { localStorage.setItem(bankSeenKey(), String(n)); } catch (e) {} }

  // opts.cap    replaces the credit line (the pack wait's "Adding your credits")
  // opts.still  the pile sits still and "seen" is not updated (during the pack wait)
  function paintBank(s, opts) {
    opts = opts || {};
    var row = document.querySelector('.ks-coins-row');
    var wrap = document.querySelector('.ksb');
    if (!wrap) {
      if (!row || !row.parentNode) return;
      wrap = document.createElement('div');
      wrap.className = 'ksb';
      row.parentNode.insertBefore(wrap, row);
    }
    if (row) row.style.display = 'none';
    bankCss();
    var info = bankHtml(s, opts.cap);
    wrap.className = 'ksb' + (info.empty ? ' ksb--empty' : '');
    wrap.innerHTML = info.html;
    bankArmPop(wrap);
    bankArmPack(wrap);
    var seen = bankSeenGet(), from;
    if (opts.still) from = info.coins;
    else if (seen === null) from = 0;                 // first visit: the full pour
    else from = Math.min(seen, info.coins);           // only the new coins fall
    // S407: when coins will fall, "seen" is written only as they start falling, so a member who
    // opens the dashboard in a background tab or leaves early still gets her pour next time.
    var willPour = bankPile(wrap, info, from, opts.still ? null : function () { bankSeenSet(info.coins); });
    if (!opts.still && !willPour) bankSeenSet(info.coins);
    arrangeHalves();
  }

function paintCoins(s) {
    _coinToTumble = [];
    // S406: the old coin row is replaced by the bank (paintBank). Its [data-coin] numbers are
    // still written, because wirePackSnapshot reads them when she taps a pack button.
    var byClass = (s.bank && s.bank.by_class) || {};
    document.querySelectorAll('[data-coin]').forEach(function (el) {
      var n = parseFloat(byClass[el.getAttribute('data-coin')]);
      el.textContent = String(isNaN(n) ? 0 : n);
    });
    if (packWaitArm(s)) return;                    // S356 credit pack wait owns the bank
    paintBank(s);
  }

  // THE BIG DROP — HER RULING S356. Every coin entrance uses it: page load AND the credit
  // pack landing. It replaced the S2xx subtle drop (-24px / 650ms), which she found barely
  // noticeable at real size. ⚠ COIN_SETTLE below is computed from these numbers. Change one,
  // change the other.
  var COIN_DROP_MS = 800;
  var COIN_NUM_AT  = 520;                          // number fades in on the flat face
  var COIN_DROP = [
    { transform: 'translateY(-48px)', opacity: 0.4 },
    { transform: 'translateY(0)',     opacity: 1, offset: 0.5 },
    { transform: 'translateY(-14px)', offset: 0.68 },
    { transform: 'translateY(0)',     offset: 0.82 },
    { transform: 'translateY(-5px)',  offset: 0.92 },
    { transform: 'translateY(0)' }
  ];

  function tumbleCoin(unit, delay) {
    var coin = unit.querySelector('.ks-coin');
    var img  = unit.querySelector('.ks-coin-img');
    var num  = unit.querySelector('.ks-coin-num');
    if (!coin || !img || !num) return;
   setTimeout(function () {
      unit.style.visibility = 'visible';           // the coin appears WITH its spin, never before
      if (coin.animate) {                          // vertical drop-in + settle bounce                          // vertical drop-in + settle bounce
        coin.animate(COIN_DROP, { duration: COIN_DROP_MS, easing: 'ease-out' });
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
      }, COIN_NUM_AT);
    }, delay || 0);
  }

  /* THE COIN ENTRANCE NOW REPORTS WHEN IT IS FINISHED. S163.
     ⚠⚠ ADDED SO THE TWO NUMBERS CAN CHAIN OFF IT WITHOUT A HARDCODED DELAY. A fixed
     wait drifts out of sync on a slow phone and stutters where nobody is testing, so the
     landing time is computed FROM THE SAME TWO CONSTANTS THE TUMBLE ITSELF USES.
     ⚠ COIN_SETTLE is the drop + spin + the 200ms number fade (starts at COIN_NUM_AT, S356).
     If tumbleCoin's timings ever change, CHANGE THESE TOO — they are one artifact.
     ⚠⚠ markTumblesDone IS ALSO CALLED BY THE WATCHDOG AND ON AN EMPTY LIST, so a
     member with no coins, a backgrounded tab or a dropped rAF still releases the waiters.
     Nothing downstream may ever be left waiting forever on a coin that never spun. */
  var COIN_STAGGER = 120;
  var COIN_SETTLE  = COIN_DROP_MS;   // S356: the big drop ends last (number fade ends at 720)
  var _tumblesDone = false;
  var _tumbleWaiters = [];
  function onTumblesDone(fn) {
    if (_tumblesDone) { fn(); return; }
    _tumbleWaiters.push(fn);
  }
  function markTumblesDone() {
    if (_tumblesDone) return;
    _tumblesDone = true;
    var w = _tumbleWaiters; _tumbleWaiters = [];
    w.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  function runTumbles() {
    if (!_coinToTumble.length) { markTumblesDone(); return; }
    var list = _coinToTumble.slice();
    _coinToTumble = [];
   requestAnimationFrame(function () {
      list.forEach(function (unit, idx) { tumbleCoin(unit, idx * COIN_STAGGER); });
    });
    setTimeout(markTumblesDone, (list.length - 1) * COIN_STAGGER + COIN_SETTLE);
    // WATCHDOG: a coin must never sit blank. If a number is still hidden after the
    // longest tumble could have landed, just show it. Covers a dropped rAF, a
    // backgrounded tab, or any future path that arms a coin and forgets to spin it.
  setTimeout(function () {
      list.forEach(function (unit) {
        unit.style.visibility = 'visible';
        var n = unit.querySelector('.ks-coin-num');
        if (n && n.style.opacity === '0') n.style.opacity = '1';
      });
      markTumblesDone();
    }, 1500);
  }

  // ---------- CREDIT PACK WAIT (S356) ----------
  // After a credit pack purchase Memberstack returns her here with ?fromCheckout=true&msPriceId=...
  // Make writes the credits a few seconds LATER (7s measured S355), so the first paint can carry
  // the OLD balance. HER RULING S356: the old number is never shown. The purchased coin spins
  // BLANK with "Adding your credits" until member-state reports MORE credits than before, then
  // lands with a bigger drop than the page-load entrance (hers, S356). 30s with nothing: stop,
  // stay blank, say so. Both strings approved by her S356. Do not redraft.
  // ⚠⚠ THE WAIT IS KEYED ON DATA, NEVER A TIMER. The 30s is only the give-up.
  // ⚠⚠ THE BASELINE: tapping a pack button snapshots the coin's number into sessionStorage
  // (the Stripe round trip keeps the tab, same seam as ks_consent_pending). This is a one-shot
  // post-checkout handoff, cleared on land or give-up, not state persistence.
  // ⚠⚠ NO SNAPSHOT, NO WAIT — FIXED S356 AFTER A LIVE FALSE START. The address alone is NOT
  // evidence of a purchase: reloading or bookmarking an old post-checkout URL armed a 30s blank
  // coin for nothing. The wait now arms ONLY with a snapshot from THIS tab, under an hour old,
  // for the same pack. Cost, accepted: a checkout that returns in a DIFFERENT tab shows the old
  // balance until refresh (Stripe returns in the same tab; signup's consent seam relies on it).
  // ⚠ ONLY the coin and its tier line update on landing. Other figures on the page (the
  // earned line) refresh on the next load. KNOWN, NAMED, ACCEPTED.
  // ⚠ NEVER under ?fake=. Pack price IDs are keys: if a pack price is ever recreated (the live
  // flip), PACK_PRICES must change with it or the wait silently never arms.
  var PACK_PRICES = { 'prc_clothing-credit-pack-8n6m0ucp': 'clothing', 'prc_toy-credit-pack-kr6v0rrk': 'toy' };
  var PACK_KEY = 'ks_pack_before';
  var _lastBank = null;   // S420: by_class of the last painted payload, for the pack snapshot
  var PACK_POLL_MS = 1000, PACK_GIVEUP_MS = 30000;   // S423: every second, like the landing wait
  var PACK_WAIT_TEXT = 'Adding your credits';
  var PACK_LATE_TEXT = 'On the way. Refresh in a minute if you don\u2019t see them.';
  var PACK_LOOP = COIN_SPIN.slice(0, -1);   // continuous waiting spin, half the landing speed
  var _pack = null;
  var _packQS = new URLSearchParams(window.location.search);
  var _packFor = (_packQS.get('fromCheckout') === 'true') ? (PACK_PRICES[_packQS.get('msPriceId')] || null) : null;
  // S423: back from checkout but the price ID didn't map: trust this tab's own snapshot.
  if (!_packFor && _packQS.get('fromCheckout') === 'true') {
    try { var _ps = JSON.parse(sessionStorage.getItem('ks_pack_before') || 'null'); if (_ps && (_ps.key === 'clothing' || _ps.key === 'toy')) _packFor = _ps.key; } catch (x) {}
  }

  function wirePackSnapshot() {
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-ms-price\\:add]');
      if (!b) return;
      var k = PACK_PRICES[b.getAttribute('data-ms-price:add')];
      if (!k) return;
      // S420 FIX (found S417 on walk3): the baseline used to be read from the old hidden coin
      // row, which can read blank, so the wait never armed. It now comes from the last bank
      // the page painted. The coin row stays as the fallback.
      // S423 FIX (Maria, S423): an EMPTY bank has no entry for the kind, so the baseline read
      // blank and the wait never armed - the one case a pack is most likely bought. Once the
      // page has painted a bank, a missing kind means 0.
      var n = _lastBank ? bankNum(_lastBank[k]) : NaN;
      if (isNaN(n)) { var el = document.querySelector('[data-coin="' + k + '"]'); n = el ? parseFloat(el.textContent) : NaN; }
      if (isNaN(n)) n = 0;
      try { sessionStorage.setItem(PACK_KEY, JSON.stringify({ key: k, n: isNaN(n) ? null : n, t: Date.now() })); } catch (x) {}
    }, true);   // capture phase: Memberstack's own handler cannot beat it
  }

  // S406: the pack wait now lives in the bank. While waiting, the pile sits still and the
  // credit line reads "Adding your credits"; when they land the bank repaints and only the
  // new coins fall. Same snapshot rules as S356.
  function packWaitArm(s) {
    if (!_packFor || _FAKE) return false;
    var bc = (s.bank && s.bank.by_class) || {};
    var n = parseFloat(bc[_packFor]); if (isNaN(n)) n = 0;
    if (_pack) {
      if (_pack.done) return false;
      paintBank(s, { cap: PACK_WAIT_TEXT, still: true });
      return true;
    }
    var snap = null;
    try { snap = JSON.parse(sessionStorage.getItem(PACK_KEY) || 'null'); } catch (x) {}
    if (!(snap && snap.key === _packFor && typeof snap.n === 'number' && (Date.now() - snap.t) < 3600000)) {
      packCleanup();
      console.log('[ks-dash] credit pack wait NOT armed: no snapshot from this tab');
      return false;
    }
    _pack = { key: _packFor, base: snap.n, s: s, done: false, polling: false };
    console.log('[ks-dash] credit pack wait:', _packFor, '| baseline', snap.n, '| painted', n);
    if (n > snap.n) { _pack.done = true; packCleanup(); return false; }   // already arrived: paint normally, new coins fall
    paintBank(s, { cap: PACK_WAIT_TEXT, still: true });
    // S423, hers: the same full-page cover as the shop-first landing wait (white, the gold
    // coin spinning, "Adding your credits"). It stays up until the credits land, then the
    // page reloads once and the new coins pour in.
    _pack.cover = jjCover();
    setTimeout(function () { if (_pack && !_pack.done) packGiveUp(); }, PACK_GIVEUP_MS + 5000);
    return true;
  }

  function packWaitStart() {
    if (!_pack || _pack.done || _pack.polling) return;
    _pack.polling = true;
    var t0 = Date.now();
    (function tick() {
      if (_pack.done) return;
      if (Date.now() - t0 >= PACK_GIVEUP_MS) { packGiveUp(); return; }
      setTimeout(function () {
        if (_pack.done) return;
        var tk = window.$memberstackDom.getMemberCookie();
        fetch(FN_URL, { method: 'POST', headers: { 'x-ms-token': tk, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON } })
          .then(function (r) { return r.json(); })
          .then(function (st) {
            if (_pack.done) return;
            var bank = (st && st.bank) || {};
            var n = parseFloat(bank.by_class && bank.by_class[_pack.key]);
            if (!isNaN(n) && n > _pack.base) packLand(n, st);
            else tick();
          })
          .catch(function () { tick(); });
      }, PACK_POLL_MS);
    })();
  }

  function packLand(n, st) {
    var p = _pack; p.done = true;
    packCleanup();
    console.log('[ks-dash] credit pack landed:', p.key, p.base, '->', n);
    // S423: with the cover up, reload once (the cleanup above strips the address and the
    // snapshot, so the reload can't re-arm). The cover stays until the new page replaces it.
    if (p.cover) { window.location.reload(); return; }
    paintBank(st);                                 // only the new coins fall
  }

  function packGiveUp() {
    var p = _pack; if (!p || p.done) return;
    p.done = true;
    paintBank(p.s, { cap: PACK_LATE_TEXT, still: true });   // hers S356: the old number never shows
    packCleanup();
    if (p.cover) p.cover.remove();                          // S423: the cover lifts on the late line
    console.log('[ks-dash] credit pack wait gave up after', PACK_GIVEUP_MS, 'ms');
  }

  // Clear the one-shot snapshot and strip the checkout params, so a refresh or a bookmark
  // shows the real balance instead of replaying the wait.
  function packCleanup() {
    try { sessionStorage.removeItem(PACK_KEY); } catch (x) {}
    try {
      var u = new URL(window.location.href);
      ['fromCheckout', 'msPriceId', 'stripePriceId', 'forceRefetch'].forEach(function (k) { u.searchParams.delete(k); });
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (x) {}
  }

  // ---------- SHOP-FIRST LANDING WAIT (S394, hers) ----------
  // Stripe can land a brand-new shop-first member here a few seconds BEFORE her starter
  // credits are written. With zero credits pickState says `zero`, so she was shown
  // send-first's welcome (seen on Walk 3). HER RULING S394: read her PLAN, not her bank.
  // Memberstack knows the plan the moment she pays, and only the two starter-pack plans
  // are shop-first. While the credits are on their way: the shop welcome, a spinning coin
  // with "Adding your credits", a check every 2 seconds, and ONE RELOAD once they land (the
  // normal load then paints everything). After 30 seconds: the credit pack's late line.
  // The few seconds of "credits are in your bank" beside "Adding your credits": hers, fine.
  // ⚠ PRICE IDS ARE KEYS: at the live flip these two are repointed with /signup's PRICE_MAP.
  // ⚠ Reloads at most once per 2 minutes (sessionStorage), so it can never loop.
  // ⚠ Never under ?fake= or a ?state= override. Only on `zero` with no history at all.
  var STARTER_PRICES = {
    'prc_the-basics-clothing-starter-pack-zv5r0e59': 'clothing',
    'prc_the-toy-chest-toy-starter-pack-0k2c0abs': 'toy'
  };
  var JJW_KEY = 'ks_jj_reloaded';
  var JJW_POLL_MS = 1000;   // S394: every second, not every 2 - she sees her credits a second sooner
  function jjWaitMaybe(s) {
    try {
      s = s || {};
      if (_FAKE) return;
      if (new URLSearchParams(window.location.search).get('state')) return;
      if (pickState(s) !== 'zero') return;
      var lt = s.lifetime || {}, b = s.bags || {};
      if ((Number(lt.items_received) || 0) > 0 || (Number(lt.items_kept_from_landfill) || 0) > 0) return;
      if (b.bag_shipped || b.return_delivered) return;
      var last = 0;
      try { last = Number(sessionStorage.getItem(JJW_KEY)) || 0; } catch (x) {}
      if (Date.now() - last < 120000) return;
    } catch (e) { return; }
    function decide(m) {
      var pcs = (m && m.data && m.data.planConnections) || [];
      var key = null;
      pcs.forEach(function (pc) {
        var pid = pc && pc.payment && pc.payment.priceId;
        if (!key && pid && STARTER_PRICES[pid]) key = STARTER_PRICES[pid];
      });
      if (key) jjWaitRun(key);
    }
    // The member usually landed already (the name paints first), so decide SYNCHRONOUSLY
    // and the cover goes up before the page is revealed - no flash of the wrong welcome.
    if (_member) { decide(_member); return; }
    window.$memberstackDom.getCurrentMember().then(decide).catch(function () {});
  }

  // S394 HERS: "the loading screen looks broken... hide it all and use a loading animation".
  // While her credits are on their way, ONE clean screen covers the whole page: the gold
  // coin spinning, and "Adding your credits" (the credit pack wait's approved line).
  // Credits land -> reload once, and the finished dashboard is what she sees.
  // 30 seconds and nothing -> the cover lifts, the shop welcome is painted, and her coin
  // (if the plan shows it yet) carries the pack wait's late line.
  function jjCover() {
    var ov = document.createElement('div');
    ov.id = 'ks-jjw-cover';
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    ov.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#FFFFFF;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    var img = document.createElement('img');
    img.src = COIN_FRAMES[0];
    img.alt = '';
    img.style.cssText = 'width:120px;height:auto;display:block;';
    var txt = document.createElement('div');
    txt.textContent = PACK_WAIT_TEXT;
    txt.style.cssText = 'font-size:16px;color:#75736E;text-align:center;padding:0 24px;';
    ov.appendChild(img);
    ov.appendChild(txt);
    (document.body || document.documentElement).appendChild(ov);
    var loop = null;
    if (!COIN_REDUCE) {
      var i = 0;
      loop = setInterval(function () { img.src = COIN_FRAMES[PACK_LOOP[i % PACK_LOOP.length]]; i++; }, 52);
    }
    return { remove: function () { if (loop) clearInterval(loop); if (ov.parentNode) ov.parentNode.removeChild(ov); } };
  }
  function jjWaitRun(key) {
    console.log('[ks-dash] shop-first landing wait:', key);
    var cover = jjCover();
    var t0 = Date.now();
    (function tick() {
      if (Date.now() - t0 >= PACK_GIVEUP_MS) { jjGiveUp(key, cover); return; }
      setTimeout(function () {
        var tk = window.$memberstackDom.getMemberCookie();
        fetch(FN_URL, { method: 'POST', headers: { 'x-ms-token': tk, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON } })
          .then(function (r) { return r.json(); })
          .then(function (st) {
            var sig = (st && st.signals) || {};
            if (sig.has_credits) {
              try { sessionStorage.setItem(JJW_KEY, String(Date.now())); } catch (x) {}
              console.log('[ks-dash] shop-first credits landed; reloading once');
              window.location.reload();          // the cover stays up until the new page replaces it
            } else { tick(); }
          })
          .catch(function () { tick(); });
      }, JJW_POLL_MS);
    })();
  }
  function jjGiveUp(key, cover) {
    console.log('[ks-dash] shop-first landing wait gave up after', PACK_GIVEUP_MS, 'ms');
    _jjOn = true;
    var tag = document.querySelector('.ks-greet-welcome'); if (tag) tag.remove();
    var hh = document.querySelector('.ks-greet-headline'); if (hh) hh.textContent = welcomeHeadline();
    var jsub = document.querySelector('.ks-greet-sub');
    if (jsub) { jsub.textContent = JUST_JOINED.shop.sub; jsub.classList.remove('ks-greet-accent'); }
    setCTA(JUST_JOINED.shop.cta, 'closet', key === 'toy' ? '/toys' : '/clothing');
    // S406: the late line now sits in the bank, where the credits will show
    var bcap = document.querySelector('.ksb-cap');
    if (bcap) bcap.textContent = PACK_LATE_TEXT;
    cover.remove();
  }

  // ---------- CARDS ----------
  function paint(s) {
    _lastBank = (s.bank && s.bank.by_class) || null;
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
      // S407 hers: hidden when the whole bank is under one credit - the bank says "Half a credit"
      var bankTot = bankNum((s.bank && s.bank.total));
      // S420 HERS: "dont say anything about half credits". The Webflow note is hidden always.
      note.style.display = 'none';
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

    // ---------- LIFETIME / CONTRIBUTION ----------
    // These five writes USED to live here as loose setText() calls into a Webflow Code
    // Embed. THE EMBED WAS DRAGGED OUT OF ITS CONTAINER IN NAVIGATOR AND SILENTLY DELETED
    // (#IMPACT-RESTORE), and because setText() is if(el)-guarded they went on no-op'ing
    // into nothing, on every load, for days, reporting no error.
    // The section is now SCRIPT-INJECTED and self-contained -> see paintImpact(), called
    // below. Nothing to write here any more. Do not re-add hooks to this block.

  paintPlanChip(s);
    paintBankLabel();
    paintSwapsReady(s);
    paintCoins(s);
	paintCycleLine(s);
    paintCycleBar(s);
	paintLook(s);   // ⚠ MUST STAY ABOVE paintHowCredits: column order is call order
    // ⚠⚠ COLUMN ORDER IS CALL ORDER (§DASH.12) AND IT WAS REORDERED S87 SO DESKTOP
    // MATCHES THE MOBILE ORDER SHE ALREADY RULED IN S85 (hero → contribution → review →
    // how credits → activity → closet). Mobile is driven by `order:` values keyed to
    // class inside @media, NOT by this order, so the two are set independently — which
    // is exactly how they drifted apart. Change one, check the other.
    paintHowCredits();
    paintCloset(s);
    // ⚠⚠ THE OLD RULE HERE IS DEAD AS OF S163 AND ITS REASON WENT WITH IT. It read
    // "paintImpact MUST stay above paintActivity, it is the SUMMARY of that feed" — and the
    // line it summarised, the sent-in count, HAS LEFT for paintLook(). What is left in that
    // card summarises nothing, so paintImpact now runs LAST and sits at the BOTTOM of the rail.
    // ⚠ COLUMN ORDER IS CALL ORDER. Moving this call moves the card. Its MOBILE order is a
    // SEPARATE decision in dashboard.css (.ks-sec-impact { order: 7 }). Change one, check the other.
    _state = s;
    // ⚠⚠ THE REVIEW SLOT IS RESERVED HERE AND THAT IS NOT COSMETIC. paintReviewPrompt()
    // runs from TWO callers (here and paintHeadline) and only paints once it holds BOTH
    // _state and _member — which land on separate promises, in either order. sectionIn()
    // APPENDS on first creation, so whichever caller wins decides where the card sits.
    // That was invisible while review was LAST in the rail; the moment it moved ABOVE
    // activity the rail order became a RACE. Reserving the slot makes it deterministic.
    reserveReviewSlot();
    paintActivity(s);
    paintReviewPrompt();
    paintImpact(s);   // LAST in the rail — S163
    paintPackMenu();  // S355 — must follow paintImpact, which appends to the card
   paintChildren(s);
    paintEmailPrefs(s);
    moreArrow();      // S441 hers: the coral arrow, phones only

    // If the 4s failsafe already revealed the page (slow Memberstack, slow fetch), the
    // coins are being armed onto a VISIBLE page. Spin them now instead of waiting on
    // Promise.allSettled - that wait is exactly what left them sitting blank.
    if (_revealed) runTumbles();
  }

  /* ============================================================
     "LOOK WHAT YOU'VE DONE" — THE TWO NUMBERS. S163, HER RULING.
     Main column, directly under the credit bank card. sectionIn('main', ...) appends, and
     ensureGrid() puts .ks-hero-card in as main's FIRST child, so THIS CALL MUST STAY ABOVE
     paintHowCredits() in paint() or the block lands under How credits work instead.

     ⚠⚠⚠ IT REPLACES THE SAVINGS INSET, WHICH IS WEBFLOW MARKUP, NOT OURS.
     paintSavings() is RETIRED and the inset is hidden HERE, on line one, deliberately:
     .ks-savings-block is authored in the Designer with PLACEHOLDER NUMBERS in it, and this
     project has already shipped Webflow placeholder numbers to every member on every load
     once. Hiding it in CSS would show those placeholders on any load where the stylesheet
     is slow or 404s. Hiding it in JS cannot, because no script means the page never reveals
     at all. WHEN THE DESIGNER DELETION LANDS this line becomes a harmless no-op — keep it.
     ⚠ items_received IS NOW OFF THIS PAGE ENTIRELY except as the review prompt's gate.
     Two item counts meaning OPPOSITE things (received vs sent in) is arithmetic a member
     should not have to do — her ruling. Do not reinstate the "N finds" line anywhere.

     ⚠ IT HIDES AT ZERO, PER STAT LINE, and both zero hides the card. Her S20 ruling,
     carried over from "Your contribution": a zero here is a REPORT OF NOTHING, not a promise,
     and a new member sits in that state for WEEKS. The note only ever renders beside at least
     one real number — nobody meets a high five under an empty block.
     ⚠ THE COMMON HALF STATE IS SAVINGS-ONLY: savings arrive when she claims something,
     the accepted count only after a bag comes back and is graded. A lone stat CENTRES, and
     that is CSS (.ks-look-stat:only-child), not a branch here.

     ⚠⚠ THE DONATION TRIPWIRE MOVED HERE WITH THE NUMBER. items_kept_from_landfill
     counts donated = true AS WELL AS accepted at grading, and A DONATED ITEM WAS NOT KEPT IN
     CIRCULATION BY A SWAP. The donated flag has NO WRITER today, so this number is exactly
     her ruling right now. THE DAY DONATION GETS A WRITER, EXCLUDE IT FROM THE DERIVATION —
     the copy does not become false, the NUMBER does.

     COPY IS APPROVED AND LOCKED, HERS, S162, VERBATIM. Four strings, curly apostrophes.
     DO NOT REDRAFT, DO NOT SHORTEN, DO NOT "IMPROVE".
     ⚠ "kept in circulation" retires the singular problem — it reads the same at 1 and
     at 248, so there is NO PLURAL BRANCH TO BUILD. Do not add one.
     ⚠⚠ THE NOTE IS THE FIRST "I" ON THIS PAGE; every other string here is "we". She was
     shown that and took it anyway. It is a decision, not a slip.
     ============================================================ */
  var LOOK_HEAD    = 'Look what you’ve done';
  /* ⚠⚠ THE SPARK IS A DRAWN SVG, NEVER A TEXT GLYPH — the same rule the signup star badge
     follows. A character depends on whatever font is available and renders differently on
     her phone than on the Mac. currentColor so it can never disagree with the heading it
     sits beside, aria-hidden because the heading already says what the card is, and it is
     PURE MARKUP so if anything about it fails the heading still reads. */
  var LOOK_SPARK =
    '<svg class="ks-look-spark" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M5 19C5 11 11 5 19 5C19 13 13 19 5 19Z"/>' +
    '<path d="M5 19L14.5 9.5"/>' +
    '</svg>';
  var LOOK_NOTE    = 'I hope you’re proud of this, because I am.';
  var LOOK_L_SAVED = 'saved vs new';
  // ⚠⚠ HER RULING S213: the count label becomes "second lives" — positive, and it works
  // for clothes AND toys where "kept in circulation" was neutral about both.
  // ⚠⚠⚠ IT REINTRODUCES A PLURAL BRANCH THAT "kept in circulation" EXISTED TO AVOID. That
  // string deliberately read the same at 1 and at 248. "second lives" does not, so the
  // singular is a real branch and not decoration — a member's FIRST graded bag lands on
  // exactly n === 1, which is the state she is most likely to be looking at.
  /* ⚠⚠ THE LONE-STAT LABEL BREAKS TO TWO LINES — her ruling S214. A bare "2 second lives"
     under the italic note read as a run-on with the sentence above it; number-over-stacked-
     label fixes it. The <br> is OUR markup, never escaped. ⚠⚠⚠ THE SINGULAR PARTNER IS
     REQUIRED, not optional — n===1 is the state after a member's FIRST graded bag, the most
     common thing on this card, and "1 items given / a second life" would ship a grammar bug
     to exactly that member. */
  var LOOK_L_KEPT  = 'items given<br>second lives';
  var LOOK_L_KEPT1 = 'item given<br>a second life';

  function paintLook(s) {
    var inset = document.querySelector('.ks-savings-block');
    if (inset) inset.style.display = 'none';     // see the block comment above

    var panel = sectionIn('main', 'ks-sec-look');
    if (!panel) return;
    var sec = panel.parentNode;

    var lt = (s && s.lifetime) || {};
    var saved = Math.round(parseFloat(lt.value_received));
    if (isNaN(saved)) saved = 0;
    var kept = Number(lt.items_kept_from_landfill) || 0;

    if (saved <= 0 && kept <= 0) { sec.style.display = 'none'; return; }
    sec.style.display = '';

    /* ⚠⚠ THE ORDER IS heading → note → numbers, HER RULING S213. The note stopped being a
       bottom signature, which is what made the card read as an info card with a footnote.
       ⚠ LOOK_SPARK IS CONCATENATED RAW AND MUST NOT BE PASSED THROUGH esc() — it is our own
       markup, not member data. Only LOOK_HEAD is escaped. */
    var html = '<div class="ks-look-h">' + LOOK_SPARK + '<span>' + esc(LOOK_HEAD) + '</span></div>' +
               '<div class="ks-look-note">' + esc(LOOK_NOTE) + '</div>' +
               '<div class="ks-look-row">';
    if (saved > 0) {
      html += '<div class="ks-look-stat">' +
                '<div class="ks-look-n" data-ks-look="saved">$' + saved.toLocaleString() + '</div>' +
                '<div class="ks-look-l">' + esc(LOOK_L_SAVED) + '</div>' +
              '</div>';
    }
    if (kept > 0) {
      html += '<div class="ks-look-stat">' +
                '<div class="ks-look-n" data-ks-look="kept">' + esc(kept) + '</div>' +
                /* ⚠ NOT escaped: LOOK_L_KEPT/1 carry an intentional <br>. They are our own
                   constants, never member data — the count is the only variable and it is a
                   number. Do not wrap this in esc() "for safety"; it would print the tag. */
                '<div class="ks-look-l">' + (kept === 1 ? LOOK_L_KEPT1 : LOOK_L_KEPT) + '</div>' +
              '</div>';
    }
    html += '</div>';
    panel.innerHTML = html;

    armLookEntrance(sec, [
      { el: panel.querySelector('[data-ks-look="saved"]'), to: saved, prefix: '$' },
      { el: panel.querySelector('[data-ks-look="kept"]'),  to: kept,  prefix: '' }
    ]);
  }

  /* THE ENTRANCE. HER RULING S163: the numbers count up on WHICHEVER HAPPENS LAST — the
     coins have finished tumbling AND the block is on screen. On a phone this block is below
     the fold, so waiting on the coins alone spends the moment somewhere she is not looking.
     On a wide screen the block is often already in view, the scroll condition satisfies
     immediately, and it waits on the coins only. SAME CODE, NO BRANCH.

     ⚠⚠⚠ THE FAILURE DIRECTION IS LOAD-BEARING AND IT IS WHY THE REAL VALUE IS PAINTED
     FIRST, ABOVE, BEFORE ANY OF THIS RUNS. Old browser, no IntersectionObserver, reduced
     motion, backgrounded tab, a coin that never spun — every one of those ends with the
     CORRECT NUMBER SITTING STILL. Failure lands on "no animation", NEVER on "$0 saved".
     Do not restructure this so the count-up is what writes the value.

     ⚠ ONE SHOT PER PAGE LOAD: the observer disconnects on the first intersection and
     _lookFired latches. Scrolling back up must not replay it.
     ⚠ reduced motion kills the count-up here and the CSS kills the pop on the same
     query, so the two die together. */
  var _lookFired = false;

  function armLookEntrance(sec, stats) {
    if (_lookFired) return;
    stats = stats.filter(function (t) { return t.el && t.to > 0; });
    if (!stats.length) return;
    if (COIN_REDUCE) return;
    if (typeof IntersectionObserver !== 'function') return;

    var seen = false, coins = false;
    function go() {
      if (_lookFired || !seen || !coins) return;
      _lookFired = true;
      stats.forEach(countUpStat);
    }
    onTumblesDone(function () { coins = true; go(); });

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { seen = true; io.disconnect(); go(); return; }
      }
    }, { threshold: 0.35 });
    io.observe(sec);
  }

  function countUpStat(t) {
    var start = null, DUR = 900;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / DUR);
      var eased = 1 - Math.pow(1 - p, 3);
      t.el.textContent = t.prefix + Math.round(t.to * eased).toLocaleString();
      if (p < 1) { requestAnimationFrame(frame); return; }
      t.el.textContent = t.prefix + t.to.toLocaleString();
      // THE WIGGLE IS CSS. JS only adds the class — the same split .ks-greet-accent uses.
      t.el.className = t.el.className + ' is-pop';
    }
    requestAnimationFrame(frame);
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

       MAIN: credit bank -> how credits work -> my closet
       RAIL: your contribution -> review / referral slot -> recent activity

     ⚠ REORDERED S87 so desktop matches the mobile order ruled in S85. The old order
     (closet second in main, activity second in the rail) was never a decision — it was
     the order the sections got built, which is the same fault this grid was created to fix.

     ⚠ THIS BLOCK ONCE DESCRIBED AN ABANDONED FIRST DRAFT and had the columns BACKWARDS
     (activity in main; membership + how-credits in the rail). It was wrong for a full
     session. THE sectionIn() CALLS ARE THE TRUTH, NOT THIS COMMENT. Read them.

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
    // ⚠⚠ S441 HERS (mockup round 3 approved): THE BANK SITS ABOVE THE GRID, centred and full
    //   width of the page column, so Recent activity no longer sits beside it as an equal.
    //   Phone order is unchanged (the bank was first there already). Rollback: put back
    //   main.appendChild(hero) in place of the line below.
    wrap.insertBefore(hero, grid);

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
      // ⚠⚠ S393 HER RULING (option A): MANAGE MEMBERSHIP IS A MENU. The trigger keeps the
      //   visible words "Manage Membership"; inside sit her plan and price, "Change plan"
      //   (/pricing) and the REAL portal link, relabelled "Billing and cancel". The portal
      //   element is MOVED, never cloned, so data-ms-action="customer-portal" rides along.
      // ⚠ CANCEL IS NOW TWO CLICKS (open menu, then Billing and cancel). This is on Shahin's
      //   cancel-path question (§17602(d)). If he says a menu does not count, undo THIS block.
      var mw = document.createElement('span');
      mw.className = 'ks-mem-wrap';
      var mt = document.createElement('button');
      mt.type = 'button';
      mt.className = 'ks-mem-trigger';
      mt.setAttribute('aria-expanded', 'false');
      mt.setAttribute('aria-haspopup', 'true');
      mt.textContent = 'Manage Membership \u25BE';
      var mm = document.createElement('div');
      mm.className = 'ks-mem-menu';
      var cp = document.createElement('a');
      cp.className = 'ks-mem-item';
      cp.href = '/pricing';
      cp.textContent = 'Change plan';
      mm.appendChild(cp);
      mng.classList.add('ks-mem-item');
      mng.textContent = 'Billing and cancel';
      mm.appendChild(mng);                         // MOVE - attribute rides along
      mw.appendChild(mt);
      mw.appendChild(mm);
      grp.appendChild(mw);
      util.appendChild(grp);
      memMenuCss();
      mt.addEventListener('click', function (e) {
        e.preventDefault();
        var open = !mw.classList.contains('is-open');
        mw.classList.toggle('is-open', open);
        mt.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) {
        if (!mw.contains(e.target)) { mw.classList.remove('is-open'); mt.setAttribute('aria-expanded', 'false'); }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { mw.classList.remove('is-open'); mt.setAttribute('aria-expanded', 'false'); }
      });
    }

    // The plan chip is account chrome too. It was a lone coral pill floating under the
    // greeting; here it sits with the things it belongs to. ⚠ paintPlanChip() injects it
    // relative to .ks-greet-sub and HIDES ITSELF on an unknown/null plan (a cancelled
    // member has no plan), so it may not exist yet or at all. Re-home it if it turns up.
    // S393: the plan chip goes INSIDE the Manage Membership menu, first line.
    var chip = document.querySelector('.ks-plan-chip');
    var menuEl = document.querySelector('.ks-mem-menu');
    if (chip && menuEl) menuEl.insertBefore(chip, menuEl.firstChild);

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
  var CLOSET_MIN = 3;   // her ruling S213 — see paintCloset

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

    /* ⚠⚠⚠ MY CLOSET IS HIDDEN UNTIL SHE HAS AT LEAST 3 ITEMS — HER RULING S213, HER NUMBER.
       It builds the S192 ruling this page still violated: blocks are CONDITIONAL ON STATE,
       no empty states, no placeholder cards.
       ⚠⚠ THE EMPTY STATE WAS NOT MERELY UGLY, IT WAS WRONG-MEMBER COPY — it told a member
       to "send in a bag of outgrown clothes" while the card directly above it showed the
       credits she had just earned for doing exactly that. Same species as GREET.zero.
       ⚠ THE THRESHOLD HIDES THE **SECTION**, NOT JUST THE EMPTY BRANCH: at 1 or 2 items a
       grid of one or two tiles reads thinner than no section at all, which is why her
       number is 3 and not 1. The empty-state markup is DELETED rather than left unreachable
       (§0: inert code is deleted, not left in) — the strings are recoverable from @2de9c4b.
       ⚠ null still means WE DO NOT KNOW and still hides, exactly as before. Do not merge
       the two returns: a null closet and a short closet are different facts. */
    if (list.length < CLOSET_MIN) {
      panel.parentNode.style.display = 'none';
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
      } else if (src && src !== 'starter_pack' && /pack/.test(String(src))) {
        // S396 HERS: a credit pack reads like the starter pack row.
        // ⚠ S417 walk3 showed NO row for a pack at all: the server may not send one yet.
        title = 'Credit pack added';
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
      placeEarned();
      return;
    }

    var shown = list.slice(0, ACT_VISIBLE);
    var html = '<div class="ks-panel-h">Recent activity</div>' +
               shown.map(actRowHTML).join('');
    if (list.length > ACT_VISIBLE) {
      html += '<button type="button" class="ks-showall">Show more</button>';
    }
    panel.innerHTML = html;
    placeEarned();

    var btn = panel.querySelector('.ks-showall');
    if (btn) {
      btn.addEventListener('click', function () {
        panel.innerHTML = '<div class="ks-panel-h">Recent activity</div>' +
                          list.map(actRowHTML).join('');
        placeEarned();
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

  // ---------- YOUR CONTRIBUTION (#IMPACT-RESTORE) ----------
  // SCRIPT-INJECTED, NOT A CODE EMBED, AND THAT IS THE WHOLE POINT. The old embed died
  // because a Designer embed can be dragged out of its container in Navigator and nothing
  // anywhere reports it. A script-injected section cannot be dragged out of anything, cannot
  // flash a Webflow placeholder (it does not exist until the payload lands, so it needs no
  // data-ks-ready gate), and sidesteps the ACC_LABELS positional-index trap entirely.
  // DO NOT REBUILD THIS AS A CODE EMBED.
  //
  // ⚠⚠⚠ GUTTED S163, HER RULING. "Your contribution" IS RETIRED AS A CARD. Its heading
  // and its sent-in stat line ("N items you’ve passed on to another family") ARE GONE — that
  // number now lives in paintLook() in the MAIN column, in her approved words. What is left
  // here is credits earned and Member since, and the card sits at the BOTTOM of the rail.
  //
  // ⚠⚠ DO NOT RESTORE THE SENT-IN LINE HERE. Two counts of items in two columns is
  // exactly what she retired. And DO NOT re-add a .ks-panel-h heading on a guess: the heading
  // was approved copy and its retirement was her call, so a replacement is HER words, not ours.
  // (This drops .ks-panel-h from 6 emit sites to 5. dashboard.css still says 6 in a comment
  // near .ks-panel-h — fold that correction into the next CSS commit.)
  //
  // ⚠ IT HIDES AT ZERO — RULED BY JENNIE 2026-07-13. A zero is a REPORT OF NOTHING, not
  // a promise, and hiding the card takes Member since with it. That is right: an account fact
  // alone in a card is not a payoff. The COINS are the deliberate exception to the zero rule.
  //
  // ⚠ credits_earned has NO status filter in get_member_state -> it will DOUBLE-COUNT a
  // merged half once anything ever merges (a real 1.0 would read 1.5). LATENT, not bleeding:
  // zero merged rows have ever existed. Banked for the get_member_state session.
  //
  // ⚠ THE DONATION TRIPWIRE MOVED WITH THE NUMBER — it is in paintLook() now, not here.
  /* ⚠⚠⚠ RELOCATED S214, HER RULING. The credits-earned + Member-since text is NO LONGER a
     standalone rail section — it reads as ONE SENTENCE in the FOOTER OF THE NAVY BANK, below
     the cycle-reset line. Two reasons it moved: on the borderless page it was a headingless
     naked block, and it duplicated the coins directly above it. The old .ks-sec-impact section
     is HIDDEN (its wrapper still exists in the DOM; we blank it and display:none it).
     ⚠⚠ THIS STILL OWNS THE SAME COMPUTE — the live earned count, the zero-hide, the date
     format, the singular/plural. Only the RENDER TARGET changed: it appends .ks-bank-earned
     after the cycle bar inside .ks-hero-card. DO NOT re-add the .ks-imp-* markup; those CSS
     rules are now unused and get cleaned in the CSS half.
     ⚠ THE SENTENCE IS HER APPROVED WORDING S214: "You've earned N credit(s) since joining on
     <date>." Singular is REQUIRED — a brand-new member reads "1 credit" and "joining on" needs
     the date or the whole line is suppressed (same zero/no-date guard as before). */
  function paintImpact(s) {
    var sec = document.querySelector('.ks-sec-impact');
    if (sec) { sec.style.display = 'none'; }          // retire the old rail block

    var card = document.querySelector('.ks-hero-card');
    if (!card) return;
    var el = _earnedEl;

    var lt     = (s && s.lifetime) || {};
    var earned = Number(lt.credits_earned) || 0;
    var since  = fmtDate(lt.member_since);

    // Nothing earned, or no join date -> no footer line at all (mirrors the old zero-hide).
    if (earned <= 0 || !since) { if (el) el.style.display = 'none'; return; }

    if (!el) {
      el = document.createElement('div');
      el.className = 'ks-bank-earned';
      _earnedEl = el;
    }
    el.style.display = '';
    // S393 HER RULING: "added", not "earned" - a starter pack is bought, not earned,
    // and "added" is true of both.
    el.innerHTML = '<b>' + esc(String(earned)) + ' credit' + (earned === 1 ? '' : 's') +
                   '</b> added since you joined on ' + esc(since) + '.';
    placeEarned();
  }
  // S441 HERS: "N credits added since you joined" is history, so it sits under the Recent
  // activity heading. paintActivity rewrites its panel, so it is placed again after every paint.
  var _earnedEl = null;
  function placeEarned() {
    if (!_earnedEl) return;
    var p = document.querySelector('.ks-sec-activity .ks-panel');
    var h = p && p.querySelector('.ks-panel-h');
    if (!h) { if (_earnedEl.parentNode) _earnedEl.parentNode.removeChild(_earnedEl); return; }
    if (h.nextSibling !== _earnedEl) h.parentNode.insertBefore(_earnedEl, h.nextSibling);
  }
  /* ⚠⚠ THE CREDIT PACK MENU — S355. Markup is Webflow's; styling is dashboard.css.
     (1) paintImpact() APPENDS .ks-bank-earned to the card, which would land it BELOW this menu,
         so the menu is moved back to the end on every paint. appendChild is a MOVE, never a
         clone, so the data-ms-* attributes ride along untouched.
     (2) The toggle is a plain div, not a link, so Webflow's anchor handler never touches it.
         It is given role, tabindex and aria here, and Enter/Space open it.
     (3) .is-armed is what lets the CSS hide the panel. It is set ONLY once the toggle works,
         so a script failure leaves the panel OPEN with every price visible.
     ⚠ The purchase itself is Memberstack's (data-ms-price:add). Nothing here touches it. */
  function paintPackMenu() {
    var card = document.querySelector('.ks-hero-card');
    var menu = document.querySelector('.credit-pack-menu');
    if (!card || !menu) return;
    if (menu.parentNode === card && card.lastElementChild !== menu) card.appendChild(menu);
    if (menu.getAttribute('data-ks-armed') === '1') return;
    var tog   = menu.querySelector('.credit-pack-menu-toggle');
    var panel = menu.querySelector('.credit-pack-menu-panel');
    if (!tog || !panel) return;
    if (!panel.id) panel.id = 'ks-credit-pack-panel';
    tog.setAttribute('role', 'button');
    tog.setAttribute('tabindex', '0');
    tog.setAttribute('aria-controls', panel.id);
    tog.setAttribute('aria-expanded', 'false');
    function flip() {
      var open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    tog.addEventListener('click', flip);
    tog.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); flip(); }
    });
    menu.setAttribute('data-ks-armed', '1');
    menu.classList.add('is-armed');
  }
// ---------- SEND A BAG (§SB step 7a) ----------
  var BAG_URL = "https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/member-bag-request";

  function paintBagButton(s) {
    var cta = document.querySelector('.ks-greet-cta');
    if (!cta) return;                                  // no CTA, no row. Fail closed.

    // THE ROW ALWAYS EXISTS once the CTA does. A SOLO cta centres in it exactly as before —
    // most members never see the button and there is NO GAP where it would have been.
    var row = document.querySelector('.ks-cta-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'ks-cta-row';
      cta.parentNode.insertBefore(row, cta);
      row.appendChild(cta);   // ⚠⚠ MOVE, NEVER CLONE. appendChild relocates the live node with
                              // its classes and listeners intact. setCTA's onclick rides along.
                              // Rebuild this element and you delete the greeting CTA's behaviour.
    }

    var old = row.querySelector('.ks-sb-cta');           if (old) old.remove();
    // ⚠ SCOPED TO THE ROW'S CONTAINER (S90). A page-wide sweep for a class that used to
    // carry three different messages is a wider blast radius than this job needs.
    var oldLine = row.parentNode.querySelector('.ks-sb-stop'); if (oldLine) oldLine.remove();

    // ---- CHECK 0 — cancelled / no plan. HIDE. RULED BY JENNIE (25th session).
    // ⚠⚠ A SERVER GUARD IS NOT A CLIENT FORK. get_member_bag_state returns FACTS, NOT
    // ELIGIBILITY — it never reads status. A cancelled member comes back bag_out:false /
    // free_bag_used:false / has_bag_history:true — INDISTINGUISHABLE from a member who is
    // OWED her bag. Without this the button PAINTS, she TAPS, and the server REFUSES her.
    var ms = String(s.member_status || '').toLowerCase();
    if (ms !== 'active' || !s.plan) {
      console.log('[ks-dash] bag button: check 0 — not active / no plan. Hidden.');
      return;
    }

    // ---- FAILS CLOSED ON null. Opposite direction to closet/activity.
    // null means "WE DON'T KNOW", never "no bag out". A hidden closet is cosmetic;
    // a button shown on unknown state MAILS A BAG.
    var b = s.bags;
    if (!b) {
      console.log('[ks-dash] bag button: payload.bags is null — hidden (fail closed).');
      return;
    }

    // ---- has_bag_history false = a DAY-ONE member awaiting her SIGNUP bag. HIDE.
    // She reads byte-identical to someone owed a bag. This key exists for exactly that.
    if (b.has_bag_history === false) {
      console.log('[ks-dash] bag button: no bag history — hidden.');
      return;
    }

    // ---- CHECK 1 — a bag is out. STOP. No fork, no fee.
    // ⚠ bag_out INCLUDES 'open' — a bag still on the ship desk. "In motion" is true in every
    // bag-out state, which is why the copy does not say "fill it and send it back".
    if (b.bag_out) {
      // ⚠⚠ THE MESSAGE MOVED (S90). THE CHECK DID NOT. This return is what stops the
      // button being built while a bag is out — it is load-bearing and it stays.
      // The sentence is now painted into .ks-greet-sub by bagSentence(). Nothing is emitted
      // here any more. DO NOT re-add a card: that is the composition she reversed.
      console.log('[ks-dash] bag button: check 1 — bag out. Message is in the greeting.');
      return;
    }

    // ---- CHECK 2-YES — free bag already used this cycle. HIDE.
    // ⚠ THE HIDE IS GATED, NOT SHRUGGED: 7b MUST SHIP BEFORE THE OPERATOR TEST-DOOR DROPS.
    // This logs so a future session is TOLD about the hole instead of re-deriving it.
    if (b.free_bag_used) {
      console.log('[ks-dash] bag button: check 2-YES — free bag used this cycle. ' +
                  'NO PATH BUILT (7b unbuilt, $15 is step 8). Hidden.');
      return;
    }

    // ---- CHECK 2-NO — her free bag ships. Self-serve, no operator, no approval.
    var btn = document.createElement('button');
    btn.type = 'button';                    // ⚠ native <button>. Focus/Enter/Space come free.
    btn.className = 'ks-sb-cta';
    btn.textContent = 'Swap Bags';
    btn.onclick = function () { requestBag(btn, row); };
    row.appendChild(btn);
    console.log('[ks-dash] bag button: check 2-NO — button shown.');
  }
	function requestBag(btn, row) {
    if (btn.disabled) return;               // client double-tap guard.
                                            // ⚠ NOT the real one — request_free_bag takes an
                                            // ADVISORY XACT LOCK. This is courtesy; that is safety.
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';

    var token = window.$memberstackDom.getMemberCookie();   // bare string, never {data:{token}}

    // ⚠⚠ NO BODY, ON PURPOSE. Identity from the token. Cycle from get_member_state (the ONLY
    // cycle authority). Decision from the RPC. THERE IS NOTHING A CLIENT CAN SEND THAT CHANGES
    // THE OUTCOME. Do not add a body to this call.
    fetch(BAG_URL, {
      method: 'POST',
      headers: {
        'x-ms-token': token,
        'apikey': ANON,
        'Authorization': 'Bearer ' + ANON,
        'Content-Type': 'application/json'
      }
    })
    .then(function (r) { return r.json().then(function (j) { return { http: r.status, body: j }; }); })
    .then(function (res) {
      console.log('[ks-dash] bag request ->', res.http, res.body);

      if (res.body && res.body.ok) {
        var done = document.createElement('div');
        done.className = 'ks-sb-stop';
        done.textContent = 'Consider it done. We\u2019ll get a bag packed and sent your way, so watch your mailbox.';
        row.parentNode.insertBefore(done, row.nextSibling);
        btn.remove();
        return;
      }

      // ⚠ A REFUSAL IS NOT AN ERROR. {ok:false, reason:...} is the system WORKING.
      bagFail(btn, row, (res.body && res.body.reason) || ('refused:' + res.http));
    })
    .catch(function (e) {
      bagFail(btn, row, e);
    });
  }

  // ⚠ ONE LINE FOR BOTH FAILURE PATHS, ON PURPOSE. A member cannot tell a refusal from a
  // timeout and does not care. A reason-specific string per code would need four more copy
  // approvals for states nobody has ever hit.
  // ⚠⚠ "REFRESH" IS LOAD-BEARING, NOT POLITENESS. The likeliest refusal is the SERVER
  // DISAGREEING WITH WHAT THE PAGE PAINTED — a stale tab, a bag that went out between her
  // load and her tap. The client's fork is PAINT, NOT PERMISSION; the RPC checks again and is
  // right to say no. "Try again" would loop her through the same refusal forever. A refresh
  // re-reads member-state and she then sees the honest STOP line instead.
  // APPROVED BY JENNIE 2026-07-13. Do not redraft.
  function bagFail(btn, row, why) {
    console.log('[ks-dash] bag request NOT COMPLETED:', why);
    btn.disabled = false;
    btn.textContent = 'Swap Bags';
    var msg = row.parentNode.querySelector('.ks-sb-stop');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'ks-sb-stop';
      row.parentNode.insertBefore(msg, row.nextSibling);
    }
    msg.textContent = 'That didn\u2019t go through. Refresh the page and try again, or email us.';
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

  // Creates the rail slot in the right position and leaves it hidden. paintReviewPrompt()
  // is the only thing that ever un-hides it. The innerHTML guard means that if the prompt
  // has ALREADY painted (the other caller won the race), this cannot hide a live card.
  function reserveReviewSlot() {
    var panel = sectionIn('rail', 'ks-sec-review');
    if (panel && !panel.innerHTML && panel.parentNode) panel.parentNode.style.display = 'none';
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

    var first = displayName(cf['first-name']);
    var last  = displayName(cf['last-name']);
    var name  = [first, last].filter(Boolean).join(' ');

    var nEl = document.querySelector('[data-profile-name]');
    var eEl = document.querySelector('[data-profile-email]');

    // A missing value KEEPS the "—". Never write an empty string: a blank line reads as
    // a broken card, a dash reads as "we don't have this." Fail visible, not silent.
    if (nEl && name)  nEl.textContent = name;
    if (eEl && email) eEl.textContent = email;
  }

  // ---------- CHILDREN (list paint) ----------
  
  // S436, hers: the kids list in Account & Settings is the name-tag look in small (mockup
  // https://claude.ai/artifact/3CfkAdU7USMt8b59F2FAcx boards 3 and 4). Up to two size chips,
  // "14 months" under 2, Edit opens the kids step on that child, "+ Add another child" opens
  // it for a new one. The old Webflow template (data-child-template) is no longer used, and
  // the quiz lines it carried (style, brands...) aren't shown; the quiz is post-launch.
  // ⚠ The row keeps class ks-child, data-child-id and the data-child-remove button, because
  //   wireChildRemove finds them by those names.
  var _lastKids = [];
  var KIDS_LIST_CSS = [
    '.ks-kids-list{display:flex;flex-direction:column;gap:8px;padding:2px 0 8px;font-family:Quicksand,sans-serif;color:#211b1a;}',
    '.ks-kids-list-tiles{display:flex;flex-wrap:wrap;gap:8px;}',
    '.ks-kids-list-row{display:inline-flex;align-items:center;max-width:100%;padding:8px 12px;border:1px solid #d8d4c8;border-radius:12px;background:#fff;font-family:Quicksand,sans-serif;color:#211b1a;text-align:left;cursor:pointer;appearance:none;}',
    '.ks-kids-list-row:hover{border-color:#211b1a;}',
    '.ks-kids-list-row:focus-visible{outline:2px solid #211b1a;outline-offset:2px;}',
    '.ks-kids-list-main{min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;}',
    '.ks-kids-list-name{font-size:16px;font-weight:700;line-height:1.2;word-break:break-word;}',
    '.ks-kids-list-chips{display:flex;gap:5px;flex-wrap:wrap;}',
    '.ks-kids-list-chip{padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.5;color:#211b1a;}',
    '.ks-kids-list-chip--gender{background:#f491a9;}',
    '.ks-kids-list-chip--age{background:#eda920;}',
    '.ks-kids-list-chip--size{background:#309359;color:#fff;}',
    '.ks-kids-list-links{display:flex;gap:12px;align-items:center;flex-shrink:0;}',
    '.ks-kids-list-links button{background:none;border:0;padding:4px 0;font-family:Quicksand,sans-serif;font-size:13px;font-weight:700;color:#211b1a;text-decoration:underline;cursor:pointer;}',
    '.ks-kids-list-links .ks-kids-list-remove{color:#6E6A63;font-weight:500;}',
    '.ks-kids-list-bottom-links{display:flex;gap:18px;align-items:center;}',
    '.ks-kids-list-add{background:none;border:0;padding:4px 0;font-family:Quicksand,sans-serif;font-size:14px;font-weight:700;color:#211b1a;text-decoration:underline;cursor:pointer;}'
  ].join('');

  function kidsListSizes(c) {
    if (c.sizes && c.sizes.length) return c.sizes.slice(0, 2);
    return c.size_top ? [c.size_top] : [];
  }

  function paintChildren(s) {
    var kids = (s && s.children) || [];
    _lastKids = kids;
    var list = document.querySelector('.ks-children-list');
    var tpl  = document.querySelector('[data-child-template="true"]');
    var empty = document.querySelector('.ks-children-empty');
    if (!list) return;
    if (tpl) tpl.style.display = 'none';
    if (!document.getElementById('ks-kids-list-style')) {
      var st = document.createElement('style');
      st.id = 'ks-kids-list-style';
      st.textContent = KIDS_LIST_CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    if (empty) empty.style.display = kids.length ? 'none' : '';

    var html = '<div class="ks-kids-list"><div class="ks-kids-list-tiles">';
    kids.forEach(function (c, i) {
      var name = kidsCap(c.name || 'Child');
      var chips = '';
      kidsListSizes(c).forEach(function (sz) {
        chips += '<span class="ks-kids-list-chip ks-kids-list-chip--size">Size ' + kidsEsc(kidsSizeLabel(sz)) + '</span>';
      });
      // S442, hers: the whole tile is the way in to edit that child.
      html += '<button type="button" class="ks-kids-list-row ks-child" data-child-id="' + kidsEsc(c.id) + '"' +
        ' data-kids-account="edit-one" data-kids-index="' + i + '" aria-label="Edit ' + kidsEsc(name) + '">' +
        '<span class="ks-kids-list-main"><span class="ks-kids-list-name">' + kidsEsc(name) + '</span>' +
        (chips ? '<span class="ks-kids-list-chips">' + chips + '</span>' : '') + '</span>' +
        '</button>';
    });
    // S442, hers: no separate Edit link; tapping a tile edits that child.
    html += '</div><div class="ks-kids-list-bottom-links">' +
      '<button type="button" class="ks-kids-list-add" data-kids-account="add">' + (kids.length ? '+ Add another child' : '+ Add a child') + '</button>' +
      '</div></div>';
    list.innerHTML = html;
    accResize(list.querySelector('.ks-kids-list-add'));
  }

  // Edit / Add from the list open the kids step over the page
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-kids-account]') : null;
    if (!t) return;
    ev.preventDefault();
    var act = t.getAttribute('data-kids-account');
    kidsOpenFromAccount(act, parseInt(t.getAttribute('data-kids-index'), 10));
  });

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
            // ⚠ EMPTY AND IN THE DOM, never absent. addrShowConfirm fills it,
            // addrConfirmClear empties it. Nothing creates it mid-flight.
            '<div class="ks-addr-confirm" style="display:none"></div>' +
            '<div class="ks-addr-status" aria-live="polite" role="status"></div>';
    form.innerHTML = html;

    card.appendChild(edit);
    card.appendChild(form);

    edit.addEventListener('click', addrOpen);
    form.querySelector('.ks-addr-cancel').addEventListener('click', addrClose);
    // ⚠ WRAPPED, NOT PASSED BY REFERENCE. addEventListener hands the click Event as the
    // first argument, and addrSave's first argument is now the confirm mode - a bare
    // reference would send an Event where null/"mine"/"suggested" belongs.
    form.querySelector('.ks-addr-save').addEventListener('click', function () { addrSave(null); });
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
    addrConfirmClear();
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
    addrConfirmClear();
    addrResize();
  }

  // ================= THE CONFIRM STEP (§ADDR-VERIFY, Session 51) =================
  // The server checks the address against Shippo BEFORE it writes anything. On a first
  // pass it answers HTTP 200 with {needs_confirm, code, suggestion, typed} and NO ok key.
  //
  // ⚠⚠ WE ONLY EVER *ASK*. There is no branch below that refuses her a save. Shippo flags
  // real, occupied addresses as not receiving deliveries (it does this to the operator's
  // own business address) and it cannot see a missing apartment number at all. A hard
  // block would strand a member on an address that is perfectly fine.
  //
  // ⚠⚠ THIS IS THE HALF THAT WAS MISSING, AND ITS ABSENCE WAS NOT A GAP - IT WAS A BREAK.
  // The server half shipped without it, so needs_confirm fell through addrSave's ok test,
  // found no .error, and landed on "That didn't save. Try again, or email us." A member
  // whose address was corrected or flagged could not save it at all, and "try again" sent
  // her round the identical loop. Do not remove this branch.

  // The body from the first pass, held so the confirm call re-sends EXACTLY what she typed.
  // ⚠ WE NEVER SEND THE SUGGESTION BACK UP. The server re-derives it from Shippo, so a
  // hand-rolled request cannot write an address Shippo never actually suggested.
  var ADDR_PENDING = null;

  // ⚠ COPY APPROVED BY JENNIE, SESSION 51. Do not redraft without her.
  var ADDR_ASK = {
    corrected: {
      msg: 'We found a slightly different version of your address. Which one should we use?',
      go:  'Use this one',
      alt: 'Keep what I typed',
      altMode: 'mine'
    },
    flagged: {
      msg: 'The postal service has a note on this address. It may still be fine to mail to.',
      go:  'Save anyway',
      alt: 'Let me edit it',
      altMode: null
    },
    not_found: {
      msg: 'We couldn\u2019t find this address. That can happen with newer homes. Check it over, or save it as is.',
      go:  'Save anyway',
      alt: 'Let me edit it',
      altMode: null
    }
  };

  function addrConfirmClear() {
    var card = addrCard();
    if (!card) return;
    var box  = card.querySelector('.ks-addr-confirm');
    var acts = card.querySelector('.ks-addr-actions');
    if (box)  { box.innerHTML = ''; box.style.display = 'none'; }
    if (acts) acts.style.display = '';
    ADDR_PENDING = null;
    addrResize();
  }

  // ================= S442: THE STOP BOX (hers, mockup https://claude.ai/artifact/2PAqVQb6YMhQQT4HCRLUTA) =================
  // A cream box with a coral line on top so it reads as a STOP, not a suggestion. Every
  // choice is an equal card with its own button; "Let me edit it" sits underneath. Same
  // box for all three codes. Her S51 lines are kept word for word; the heading is hers S442.
  // ⚠ The account panel is never wider than 420px, so the cards always stack. Do not try
  // to put them side by side in there.
  var ADDR_STOP_HEAD = 'Your address isn\u2019t saved yet.';
  var ADDR_EDIT_LABEL = 'Let me edit it';
  // Claude's wording S442, hers to change. Only shown when the ZIP is short AND there is
  // no found version to take, so the only way on is to fix it.
  var ADDR_ZIP_FIX = 'ZIP needs to be 5 digits.';
  // Claude's wording, approved by her S442. Shown only when the unit box was left empty:
  // Shippo's check cannot see a missing unit (S50), but a carrier can refuse the label (S422).
  var ADDR_UNIT_ASK = 'No apartment, suite or unit number? If you have one, tap Let me edit it.';

  // A ZIP she could actually be mailed at: 5 digits, or ZIP+4.
  function addrZipOk(z) { return /^\d{5}(-?\d{4})?$/.test(String(z || '').trim()); }

  // Marks the parts of the found version that differ from what she typed (case ignored,
  // since case alone is not a correction she needs to look for).
  function addrSame(a, b) {
    return String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() ===
           String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function addrMark(v, changed) {
    return changed ? '<span class="ks-addr-diff">' + esc(v) + '</span>' : esc(v);
  }

  // ⚠ NOT PRETTIFIED HERE. Each card shows the lines that will ACTUALLY BE STORED.
  // (Since S442 the SERVER tidies the found version's street and city before sending it,
  // and saves that same tidied version, so the card still shows exactly what is stored.)
  // ⚠⚠ line2 IS CARRIED THROUGH BOTH CANDIDATES, UNCHANGED (Shippo never returns a unit).
  function addrCardValue(a, line2, typed) {
    var out = [addrMark(a.line1, typed && !addrSame(a.line1, typed.line1))];
    if (line2) out.push(esc(line2));
    out.push(addrMark(a.city, typed && !addrSame(a.city, typed.city)) + ', ' +
             addrMark(a.state, typed && !addrSame(a.state, typed.state)) + ' ' +
             addrMark(a.zip, typed && !addrSame(a.zip, typed.zip)));
    return out.join('<br>');
  }

  function addrOptCard(label, valueHtml, btnText, mode) {
    return '<div class="ks-addr-opt">' +
             '<span class="ks-addr-opt-label">' + esc(label) + '</span>' +
             '<div class="ks-addr-opt-value">' + valueHtml + '</div>' +
             (btnText ? '<button type="button" class="ks-addr-opt-btn" data-addr-mode="' + mode + '">' + esc(btnText) + '</button>' : '') +
           '</div>';
  }

  // PURE: answer + what she typed in, HTML out. Nothing in here touches the page.
  // ⚠ Returns '' on a code we have no words for (the caller fails safe).
  function addrConfirmHTML(res, pending) {
    var cfg = ADDR_ASK[res.code];
    if (!cfg) return '';
    var typed = res.typed || pending || {};
    var zipOk = addrZipOk(typed.zip);
    var hasFound = res.code === 'corrected' && res.suggestion;

    var html = '<p class="ks-addr-stop-head">' + esc(ADDR_STOP_HEAD) + '</p>' +
               '<p class="ks-addr-confirm-msg">' + esc(cfg.msg) + '</p>' +
               (String(typed.line2 || '').trim() ? '' : '<p class="ks-addr-unit-ask">' + esc(ADDR_UNIT_ASK) + '</p>') +
               '<div class="ks-addr-opts">';
    if (hasFound) {
      // S442, hers: never offer "Keep what I typed" on a ZIP that can't be mailed to.
      if (zipOk) html += addrOptCard('You typed', addrCardValue(typed, typed.line2, null), cfg.alt, 'mine');
      html += addrOptCard('We found', addrCardValue(res.suggestion, typed.line2, typed), cfg.go, 'suggested');
    } else {
      // flagged / not_found: one card, what she typed, with Save anyway (unless the ZIP is short).
      html += addrOptCard('You typed', addrCardValue(typed, typed.line2, null), zipOk ? cfg.go : '', 'mine');
    }
    html += '</div>';
    if (!hasFound && !zipOk) html += '<p class="ks-addr-zipfix">' + esc(ADDR_ZIP_FIX) + '</p>';
    html += '<button type="button" class="ks-addr-confirm-edit">' + esc(ADDR_EDIT_LABEL) + '</button>';
    return html;
  }

  function addrShowConfirm(res) {
    var card = addrCard();
    if (!card) return;
    var html = addrConfirmHTML(res, ADDR_PENDING);
    // ⚠ FAIL SAFE ON AN UNKNOWN CODE. Never paint an empty box with unlabelled buttons.
    if (!html) { addrStatus('That didn\u2019t save. Try again, or email us.', false); return; }

    var box  = card.querySelector('.ks-addr-confirm');
    var acts = card.querySelector('.ks-addr-actions');
    if (!box) return;

    box.innerHTML = html;
    box.style.display = '';
    // ⚠ THE FORM'S OWN SAVE ROW HIDES WHILE THIS IS UP. Two live save paths on one card is
    // how she ends up saving the thing she just declined.
    if (acts) acts.style.display = 'none';

    box.querySelectorAll('.ks-addr-opt-btn').forEach(function (b) {
      b.addEventListener('click', function () { addrSave(b.getAttribute('data-addr-mode')); });
    });
    box.querySelector('.ks-addr-confirm-edit').addEventListener('click', function () {
      addrConfirmClear();                       // back to the fields
      var first = card.querySelector('.ks-addr-input');
      if (first) first.focus();
    });

    // ⚠⚠ RESIZE BEFORE FOCUS (§DASH.9): the accordion body is frozen at its open height.
    addrResize();
    var firstBtn = box.querySelector('.ks-addr-opt-btn') || box.querySelector('.ks-addr-confirm-edit');
    if (firstBtn) firstBtn.focus();
    // On a phone the box can open below the screen; bring its top into view.
    if (box.scrollIntoView) { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
  }

  // Busy state has to cover THREE buttons now, because the save can be fired from the form
  // row or from the confirm row and only one of them is on screen at a time.
  function addrBusy(on, mode) {
    var card = addrCard();
    if (!card) return;
    var save = card.querySelector('.ks-addr-save');
    if (save) { save.disabled = on; save.textContent = on ? 'Saving\u2026' : 'Save address'; }
    card.querySelectorAll('.ks-addr-opt-btn').forEach(function (b) {
      b.disabled = on;
      if (on && b.getAttribute('data-addr-mode') === mode) {
        b.setAttribute('data-label', b.textContent); b.textContent = 'Saving\u2026';
      } else if (!on && b.getAttribute('data-label')) {
        b.textContent = b.getAttribute('data-label'); b.removeAttribute('data-label');
      }
    });
    var ed = card.querySelector('.ks-addr-confirm-edit');
    if (ed) ed.disabled = on;
  }

  /* ---- S442: TIDY THE CITY AND STREET, SAME RULE AS SIGNUP (S437) ----------
     Copied from signup-tool.js tidyCase, unchanged. Only a field typed ALL lowercase
     or ALL capitals changes ("san diego" -> "San Diego"); her own capitals are never
     touched; N, NW, PO stay capitals; line2 (her unit) is never touched.
     ⚠ Change both files together. */
  function tidyCase(v) {
    v = String(v || '').replace(/\s+/g, ' ').trim();
    if (!/[a-z]/i.test(v)) return v;
    if (v !== v.toLowerCase() && v !== v.toUpperCase()) return v;
    return v.toLowerCase().replace(/[a-z][a-z']*/g, function (w) {
      if (/^(n|s|e|w|ne|nw|se|sw|po)$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).replace(/(\d)([A-Z])([a-z]+)/g, function (m, d, c, rest) {
      return d + c.toLowerCase() + rest;   /* "1St" back to "1st" */
    });
  }

  // confirm === null        -> first pass, she has not been asked yet
  // confirm === 'mine'      -> save exactly what she typed
  // confirm === 'suggested' -> save Shippo's version (the server re-derives it)
  function addrSave(confirm) {
    var card = addrCard();
    if (!card) return;

    var body;
    if (confirm) {
      // ⚠ RE-SEND THE ORIGINAL TYPED VALUES. Never the suggestion.
      if (!ADDR_PENDING) { addrStatus('That didn\u2019t save. Try again, or email us.', false); return; }
      body = {};
      for (var k in ADDR_PENDING) {
        if (Object.prototype.hasOwnProperty.call(ADDR_PENDING, k)) body[k] = ADDR_PENDING[k];
      }
      body.confirm = confirm;
    } else {
      body = {};
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
      // S442: tidy street and city, and show her the tidied words in the fields.
      body.line1 = tidyCase(body.line1);
      body.city  = tidyCase(body.city);
      card.querySelectorAll('.ks-addr-input').forEach(function (inp) {
        var k = inp.getAttribute('data-addr');
        if (k === 'line1' || k === 'city') inp.value = body[k];
      });
      ADDR_PENDING = body;
    }

    addrBusy(true, confirm);
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
        addrBusy(false);

        // ⚠⚠ THIS TEST COMES FIRST AND MUST STAY FIRST. needs_confirm arrives at 200 with
        // no ok key; below the ok test it falls straight through to the failure line.
        if (res.status === 200 && res.body && res.body.needs_confirm) {
          addrShowConfirm(res.body);
          return;
        }

        if (res.status === 200 && res.body && res.body.ok) {
          addrConfirmClear();
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
        if (err === 'suggestion_expired') {
          // Shippo answered on the first pass and failed on the confirm call, so the
          // suggestion she just accepted is no longer in hand. The server refuses rather
          // than quietly writing her original typo and reporting success. "Try again" is
          // literally the right instruction: a retry re-runs the check and re-asks her.
          addrConfirmClear();
          addrStatus('That didn\u2019t save. Try again, or email us.', false);
        } else if (err === 'missing_required') {
          addrStatus('We need a street, city, state and ZIP to mail your bag.', false);
        } else if (err === 'bad_state') {
          addrStatus('State needs to be two letters, like CA.', false);
        } else {
          addrStatus('That didn\u2019t save. Try again, or email us.', false);
        }
      })
      .catch(function () {
        addrBusy(false);
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
  /* ⚠ EACH SHAPE IS COMPLETE ON PURPOSE - every key paintBagButton, bagSentence and
     precredit read, with nothing left to inherit from a real payload. A partial object
     here is how the old harness went blind in the first place. */
  var FAKE_BAGS = {
    /* her signup bag exists but has not left the ship desk */
    prebag:     { bag_out: true,  free_bag_used: false, has_bag_history: true, in_flight_count: 1,
                  bag_shipped: false, return_delivered: false },
    /* it is with the carrier or sitting in her hallway */
    bagout:     { bag_out: true,  free_bag_used: false, has_bag_history: true, in_flight_count: 1,
                  bag_shipped: true,  return_delivered: false },
    /* the carrier says it reached us; grading has not closed, so returned_at is still null */
    processing: { bag_out: true,  free_bag_used: false, has_bag_history: true, in_flight_count: 1,
                  bag_shipped: true,  return_delivered: true },
    /* S406 empty-bank previews */
    nobag:      { bag_out: false, free_bag_used: true, has_bag_history: true, in_flight_count: 0,
                  bag_shipped: false, return_delivered: false },
    ordered:    { bag_out: true,  free_bag_used: true, has_bag_history: true, in_flight_count: 1,
                  bag_shipped: false, return_delivered: false },
    half:       { bag_out: true,  free_bag_used: true, has_bag_history: true, in_flight_count: 1,
                  bag_shipped: true,  return_delivered: false },
    paused:     { bag_out: false, free_bag_used: true, has_bag_history: true, in_flight_count: 0,
                  bag_shipped: false, return_delivered: false }
  };

  function applyFake(s) {
    if (!_FAKE || !s) return s;
    if (_FAKE === 'zero' || FAKE_BAGS[_FAKE]) { // day-one member: has a plan, no credits, nothing yet
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
      // S406: nobag, ordered and half are past members (items already received), so the
      // bank's first-bag case does not claim them; half holds one half credit; paused is paused.
      if (_FAKE === 'nobag' || _FAKE === 'ordered' || _FAKE === 'half' || _FAKE === 'paused') {
        s.lifetime.items_received = 3; s.lifetime.items_kept_from_landfill = 3;
      }
      if (_FAKE === 'half') { s.bank = { total: 0.5, by_tier: { essentials: 0.5 }, by_class: { clothing: 0.5, toy: 0 }, by_class_tier: { clothing: { essentials: 0.5 }, toy: {} } }; }
      if (_FAKE === 'paused') { s.member_status = 'paused'; }
    } else if (_FAKE === 'big') {             // S406: past 30 coins the pile stops, the number counts
      s.bank = { total: 50, by_tier: { essentials: 30, elevated: 10, special: 10 }, by_class: { clothing: 42, toy: 8 },
                 by_class_tier: { clothing: { essentials: 30, elevated: 10, special: 2 }, toy: { special: 8 } } };
      s.signals = Object.assign({}, s.signals || {}, { has_credits: true });
    } else if (_FAKE === 'capped') {           // holds credits, this cycle's swaps all used
      s.available_this_cycle = { total: 0, clothing: 0, toy: 0 };
      s.signals = Object.assign({}, s.signals || {}, { is_capped: true });
    } else if (_FAKE === 'cancelled') {        // plan gone, earned credits survive
      s.plan = null;
      s.member_status = 'cancelled';
     s.caps = { clothing: 0, toy: 0 };
    }
    // BAGS HARNESS (§SB 7a) — display-only, NEVER writes. applyFake touched everything EXCEPT
    // s.bags, so a faked member kept the operator's real bag_out:true and the button could never
    // paint. This shape reaches CHECK 2-NO so the button is SEEN. Applies to any ?fake= value:
    //   ?fake=zero      -> active+plan untouched + bags ok -> button paints (see + tap)
    //   ?fake=cancelled -> check 0 hides it -> proves the cancelled ruling
    // ⚠⚠ S186: THE SHAPE ABOVE PREDATED @e911f72 AND WENT BLIND. #DASH-PRECREDIT added
    // bag_shipped and return_delivered to payload.bags; this object carried neither, so
    // precredit() ALWAYS fell through to null and ?fake= could not show the three
    // pre-credit states at all. PRE-BAG and PROCESSING have never rendered for anyone.
    // ✅ THE THREE SHAPES BELOW ARE THE ONLY WAY TO SEE THEM before a real member exists.
    // Reached through the EXISTING ?fake= param rather than a new one (§2 SAMENESS), and
    // each one also runs the `zero` mutations above so pickState lands on zero - which is
    // the only state that calls precredit() at all.
    // ⚠⚠ PROCESSING SETS **BOTH** bag_shipped AND return_delivered, deliberately, because
    // that is the true shape on a real row: a returned bag still reads status 'shipped'
    // with returned_at NULL. It is what makes the harness exercise precredit's mechanical
    // ordering rather than dodging it. Set only return_delivered and the test is a lie.
    // ⚠ DISPLAY-ONLY, NEVER WRITES - unchanged from the S28 harness this extends.
    s.bags = FAKE_BAGS[_FAKE] ||
      { bag_out: false, free_bag_used: false, has_bag_history: true, in_flight_count: 0,
        bag_shipped: false, return_delivered: false };
    console.log('[ks-dash] FAKE STATE:', _FAKE, s);
    return s;
  }
  // ---------- PLAN-CHANGE NOTE (S420, mockup approved S420) ----------
  // https://claude.ai/artifact/DXhgEqcrCFyogK3SgmAr7F
  // After a plan change she lands here with no confirmation (S417). The dashboard remembers
  // the last plan it saw FOR THIS MEMBER ON THIS DEVICE (localStorage ksPlanSeen:<id>); when
  // it differs, one note sits at the top of the page. It shows ONCE: the new plan is
  // remembered the moment the note is shown.
  // SHOWS ONLY WHEN: the last plan seen was active with a plan, and she is active with a
  // different plan now. NEVER on a first visit or a new device (nothing remembered), never
  // after paused, cancelled or no plan (a returner's welcome back covers that), never when
  // she is paused or cancelled now. Two changes before a visit name only where she ended up.
  // Upgrades and downgrades read the same (The Basics to The Toy Chest costs more and drops
  // clothing). The "moving on <date>" version waits on Teresa (1D item 10): nothing tells
  // the page a change is scheduled yet.
  // WORDING (Claude's, approved on the mockup S420): heading "You're now on <plan>.";
  // swaps left from the same numbers as the swaps row (no line when none are left);
  // a saved-credits line only for WHOLE credits her new plan can't use (hers S420: nothing
  // about half credits); button "Back to your bag" when her bag in this tab holds items and
  // is hers (browse's ksBag / ksBagOwner), else "See what's new" to her closet.
  // Preview: ?fake=planchange (never writes).
  var PLAN_SEEN = 'ksPlanSeen:';
  function planNoteCss() {
    if (document.getElementById('ks-plannote-css')) return;
    var st = document.createElement('style');
    st.id = 'ks-plannote-css';
    st.textContent =
      '.ks-plannote{position:relative;box-sizing:border-box;max-width:680px;margin:0 auto 24px;background:#EDECE0;' +
        'border-top:2px solid #EDA920;border-bottom:2px solid #EDA920;padding:24px 52px 22px;text-align:center;' +
        'display:flex;flex-direction:column;align-items:center;gap:10px;color:#211B1A}' +
      '.ks-plannote h2{margin:0;font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;color:#211B1A}' +
      '.ks-plannote p{margin:0;font-family:Quicksand,system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:460px}' +
      '.ks-plannote-btn{margin-top:6px;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 26px;' +
        'background:#e54f25;color:#fff !important;border-radius:999px;font-family:Quicksand,system-ui,sans-serif;font-weight:700;font-size:15px;text-decoration:none}' +
      '.ks-plannote-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;background:transparent;color:#6E6A63;font-size:24px;line-height:1;cursor:pointer}' +
      '.ks-plannote-x:focus-visible,.ks-plannote-btn:focus-visible{outline:2px solid #1c4a91;outline-offset:2px}' +
      '@media (max-width:767px){.ks-plannote{margin:0 0 20px;padding:24px 22px 22px}.ks-plannote h2{padding:0 26px}}';
    document.head.appendChild(st);
  }
  function planSeenRead(id) { try { return JSON.parse(localStorage.getItem(PLAN_SEEN + id) || 'null'); } catch (e) { return null; } }
  function planSeenWrite(id, v) { try { localStorage.setItem(PLAN_SEEN + id, JSON.stringify(v)); } catch (e) {} }
  function bagIsHers(id) {
    try {
      var bag = JSON.parse(sessionStorage.getItem('ksBag') || '[]');
      if (!bag || !bag.length) return false;
      var owner = sessionStorage.getItem('ksBagOwner');
      return !owner || owner === id;       // a bag built logged out becomes hers (browse S419)
    } catch (e) { return false; }
  }
  function planNoteText(s) {
    var caps = s.caps || {}, used = s.used_this_cycle || {}, bc = (s.bank && s.bank.by_class) || {};
    var rows = [];
    ['clothing', 'toy'].forEach(function (k) {
      var cap = parseFloat(caps[k]); if (isNaN(cap) || cap <= 0) return;
      var u = parseFloat(used[k]); if (isNaN(u)) u = 0;
      rows.push({ k: k, left: Math.max(cap - u, 0) });
    });
    var lines = [];
    var leftTotal = rows.reduce(function (a, r) { return a + r.left; }, 0);
    if (s.used_this_cycle && rows.length && leftTotal > 0) {
      if (rows.length === 1) lines.push('You\u2019ve got ' + rows[0].left + ' swap' + (rows[0].left === 1 ? '' : 's') + ' left this month.');
      else lines.push('You\u2019ve got ' + rows.map(function (r) { return r.left + ' ' + r.k + ' swap' + (r.left === 1 ? '' : 's'); }).join(' and ') + ' left this month.');
    }
    ['clothing', 'toy'].forEach(function (k) {
      var cap = parseFloat(caps[k]); if (!isNaN(cap) && cap > 0) return;
      var n = Math.floor(bankNum(bc[k])); if (n < 1) return;
      lines.push('Your ' + n + ' ' + k + ' credit' + (n === 1 ? ' is' : 's are') + ' saved in your bank. ' +
        'You can spend ' + (n === 1 ? 'it' : 'them') + ' again if you switch back to a plan with ' + (k === 'toy' ? 'toys' : 'clothing') + '.');
    });
    return lines;
  }
  function planNoteShow(s, id) {
    if (document.querySelector('.ks-plannote')) return;
    planNoteCss();
    var hasBag = bagIsHers(id);
    var note = document.createElement('section');
    note.className = 'ks-plannote';
    note.setAttribute('aria-label', 'Plan change');
    note.innerHTML =
      '<button type="button" class="ks-plannote-x" aria-label="Close">\u00d7</button>' +
      '<h2>You\u2019re now on ' + esc(String(s.plan).trim()) + '.</h2>' +
      planNoteText(s).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<a class="ks-plannote-btn" href="' + (hasBag ? '/browse?bag=1' : esc(closetHref(s))) + '">' +
        (hasBag ? 'Back to your bag' : 'See what\u2019s new') + '</a>';
    note.querySelector('.ks-plannote-x').addEventListener('click', function () { note.remove(); });
    // Above the greeting: climb from the headline to the page column that holds the grid.
    var grid = document.querySelector('.ks-grid'), hero = document.querySelector('.ks-hero-card');
    var col = grid ? grid.parentNode : (hero ? hero.parentNode : null);
    var at = document.querySelector('.ks-greet-headline');
    while (at && col && at.parentNode !== col) at = at.parentNode;
    if (col && at) col.insertBefore(note, at);
    else if (col) col.insertBefore(note, col.firstChild);
    else return;
    console.log('[ks-dash] plan-change note shown:', s.plan);
  }
  function planNoteMaybe(s) {
    try {
      var ms = window.$memberstackDom;
      if (!ms || typeof ms.getCurrentMember !== 'function') return;
      ms.getCurrentMember().then(function (r) {
        var id = r && r.data && r.data.id;
        if (!id) return;
        var status = String(s.member_status || '').toLowerCase();
        var now = { plan: s.plan ? String(s.plan).trim() : null, status: status };
        if (_FAKE === 'planchange') {             // preview only, never writes
          if (now.plan) planNoteShow(s, id);
          return;
        }
        var prev = planSeenRead(id);
        planSeenWrite(id, now);                  // remembered now, so the note shows once
        if (!prev || prev.status !== 'active' || !prev.plan) return;
        if (status !== 'active' || !now.plan || prev.plan === now.plan) return;
        planNoteShow(s, id);
      }).catch(function () {});
    } catch (e) {}
  }

  // ---------- THE KIDS STEP (S435, design approved S434) ----------
  // Mockup: https://claude.ai/artifact/HaqPoPKhU7vqRAUgNpVi63 (four boards).
  // Shows FIRST, over the whole dashboard, whenever member-state sends no children.
  // Mandatory, hers S434: at least one child, no skip, no close button.
  // Asks first name, then Girl / Boy (or "I'd rather not say"), then AGE (months under 2,
  // years after), never a birthday. The size fills in from the age; Change shows the ten
  // closet sizes. Saved through member-child { action: "add" } -> add_child_by_memberstack,
  // which turns the age into an estimated birthday so the age (and the size, unless she
  // set it by hand) moves forward by itself.
  // ⚠ KIDS_SIZE_FOR_MONTHS MIRRORS THE DATABASE'S closet_size_for_age. Change both together.
  // Preview: ?fake=kids shows it on any account and NEVER WRITES.
  // Wording is Claude's (hers to change): the heading, the three questions, the size line.
  var KIDS_SIZES = [
    { value: '6-9M',      label: '6-9M' },
    { value: '9-12M',     label: '9-12M' },
    { value: '12-18M',    label: '12-18M' },
    { value: '18-24M',    label: '18-24M' },
    { value: '2T',        label: '2T' },
    { value: '3T',        label: '3T' },
    { value: '4 / XXS',   label: '4' },
    { value: '5 / XS',    label: '5' },
    { value: '6 / XS',    label: '6' },
    { value: '7 / Small', label: '7' }
  ];
  function kidsSizeForMonths(m) {
    if (m < 3)  return '';            // S435: outside the closet's range, no size (database returns null)
    if (m < 9)  return '6-9M';
    if (m < 12) return '9-12M';
    if (m < 18) return '12-18M';
    if (m < 24) return '18-24M';
    if (m < 36) return '2T';
    if (m < 48) return '3T';
    if (m < 60) return '4 / XXS';
    if (m < 72) return '5 / XS';
    if (m < 84) return '6 / XS';
    if (m < 108) return '7 / Small';
    return '';
  }
  function kidsSizeLabel(v) {
    for (var i = 0; i < KIDS_SIZES.length; i++) if (KIDS_SIZES[i].value === v) return KIDS_SIZES[i].label;
    return v || '';
  }
  // "a 3T", "a size 4", "12-18M" (no article on the month sizes)
  function kidsSizePhrase(v) {
    var l = kidsSizeLabel(v);
    if (/M$/.test(l)) return l;
    if (/T$/.test(l)) return 'a ' + l;
    return 'a size ' + l;
  }
  // S435, hers: the age list IS the closet's size range (6 months to 7 years). Under 2 the
  // choices are the month ranges; each saves as its middle month, so the estimated birthday
  // sits mid-range and the database picks the same size.
  var KIDS_AGES = [
    { unit: 'months', age: 4,  label: '3 to 6 months',   chip: '3-6 months' },
    { unit: 'months', age: 7,  label: '6 to 9 months',   chip: '6-9 months' },
    { unit: 'months', age: 10, label: '9 to 12 months',  chip: '9-12 months' },
    { unit: 'months', age: 15, label: '12 to 18 months', chip: '12-18 months' },
    { unit: 'months', age: 21, label: '18 to 24 months', chip: '18-24 months' },
    { unit: 'years',  age: 2,  label: '2 years',  chip: '2 years' },
    { unit: 'years',  age: 3,  label: '3 years',  chip: '3 years' },
    { unit: 'years',  age: 4,  label: '4 years',  chip: '4 years' },
    { unit: 'years',  age: 5,  label: '5 years',  chip: '5 years' },
    { unit: 'years',  age: 6,  label: '6 years',  chip: '6 years' },
    { unit: 'years',  age: 7,  label: '7 years',  chip: '7 years' },
    { unit: 'years',  age: 8,  label: '8 years',  chip: '8 years' }
  ];
  // "Other" (hers S435) opens a number box plus Months / Years, for any age outside the list.
  function kidsInList(age, unit) {
    for (var i = 0; i < KIDS_AGES.length; i++) if (KIDS_AGES[i].unit === unit && KIDS_AGES[i].age === age) return true;
    return false;
  }
  // First letter of each word capitalised, the rest left as typed (so McKenzie stays McKenzie)
  function kidsCap(n) {
    return String(n || '').trim().replace(/(^|[\s-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function kidsAgeLabel(age, unit) {
    for (var i = 0; i < KIDS_AGES.length; i++) if (KIDS_AGES[i].unit === unit && KIDS_AGES[i].age === age) return KIDS_AGES[i].chip;
    return unit === 'months' ? age + ' months' : age + ' years';
  }
  // Months used for the size: mid-range, matching the estimated birthday the database saves
  function kidsAgeMonths(age, unit) { return unit === 'months' ? age : age * 12 + 6; }

  var KIDS_CSS = [
    '#ks-kids-step{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147482000;background:rgba(237,236,224,0.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Quicksand,sans-serif;color:#211b1a;}',
    '#ks-kids-step *{box-sizing:border-box;}',
    '.ks-kids-step-column{max-width:480px;margin:calc(40px + env(safe-area-inset-top,0px)) auto calc(40px + env(safe-area-inset-bottom,0px));padding:30px 24px 28px;background:#edece0;border-radius:28px;box-shadow:0 24px 60px rgba(33,27,26,0.22);display:flex;flex-direction:column;gap:22px;}',
    '@media (max-width:560px){.ks-kids-step-column{margin:calc(12px + env(safe-area-inset-top,0px)) 12px calc(24px + env(safe-area-inset-bottom,0px));padding:26px 18px 24px;}}',
    '.ks-kids-step-remove-link{color:#b3401c;margin-top:10px;}',
    '.ks-kids-step-size-note{font-size:15px;margin:0;padding:0 4px;}',
    '.ks-kids-step-size-grows{font-size:14px;color:#4A4340;margin:0;padding:0 4px;}',
    '.ks-kids-step-heading-wrap{position:relative;text-align:center;}',
    '.ks-kids-step-heading-star{position:absolute;top:-6px;right:18px;}',
    '.ks-kids-step-heading{margin:0;font-family:"Instrument Serif",serif;font-weight:400;font-size:40px;line-height:1.05;}',
    '.ks-kids-step-name-tag{position:relative;margin:4px 6px;background:#fff;border:2.5px solid #211b1a;border-radius:22px;box-shadow:5px 5px 0 #211b1a;overflow:hidden;}',
    '.ks-kids-step-name-tag.is-tappable{cursor:pointer;}',
    '.ks-kids-step-name-tag-top{background:#e54f25;color:#fff;text-align:center;padding:10px 0 8px;font-family:"Instrument Serif",serif;font-size:30px;line-height:1;}',
    '.ks-kids-step-name-tag-top span{display:block;font-family:Quicksand,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;margin-top:2px;}',
    '.ks-kids-step-name-tag-body{padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px;min-height:92px;justify-content:center;}',
    '.ks-kids-step-name-tag-blank{height:48px;border-bottom:2.5px dashed #b9b5aa;width:70%;}',
    '.ks-kids-step-name-on-tag{width:100%;border:0;border-bottom:2.5px dashed #b9b5aa;background:transparent;outline:none;padding:0 0 4px;font-family:"Instrument Serif",serif;font-size:48px;line-height:1.1;color:#211b1a;border-radius:0;-webkit-appearance:none;appearance:none;}',
    '.ks-kids-step-name-on-tag::placeholder{color:#b9b5aa;}',
    '.ks-kids-step-name-on-tag:focus{border-bottom-color:#211b1a;}',
    '.ks-kids-step-tag-hint{text-align:center;font-size:15px;color:#4A4340;margin:0;}',
    '.ks-kids-step-name-tag-name{padding-right:36px;font-family:"Instrument Serif",serif;font-size:48px;line-height:1;word-break:break-word;}',
    '.ks-kids-step-chips{display:flex;gap:8px;flex-wrap:wrap;}',
    '.ks-kids-step-chip{padding:6px 12px;border-radius:999px;font-size:14px;font-weight:700;}',
    '.ks-kids-step-chip--first{background:#f491a9;color:#211b1a;}',
    '.ks-kids-step-chip--age{background:#eda920;color:#211b1a;}',
    '.ks-kids-step-chip--size{background:#309359;color:#fff;}',
    '.ks-kids-step-name-tag-edit{position:absolute;right:16px;top:76px;font-size:14px;font-weight:700;color:#211b1a;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;font-family:Quicksand,sans-serif;}',
    '.ks-kids-step-question{display:flex;flex-direction:column;gap:12px;}',
    '.ks-kids-step-question-text{font-family:"Instrument Serif",serif;font-weight:400;font-size:28px;margin:0;line-height:1.15;}',
    '.ks-kids-step-text-box,.ks-kids-step-age-picker{height:56px;width:100%;border:2.5px solid #211b1a;border-radius:16px;padding:0 16px;font-family:Quicksand,sans-serif;font-size:17px;background:#fff;color:#211b1a;box-shadow:3px 3px 0 #211b1a;-webkit-appearance:none;appearance:none;}',
    '.ks-kids-step-age-picker{background-image:linear-gradient(45deg,transparent 50%,#211b1a 50%),linear-gradient(135deg,#211b1a 50%,transparent 50%);background-position:calc(100% - 22px) 50%,calc(100% - 16px) 50%;background-size:6px 6px;background-repeat:no-repeat;}',
    '.ks-kids-step-choice-row{display:flex;gap:12px;}',
    '.ks-kids-step-choice{flex:1;height:58px;border:2.5px solid #211b1a;background:#fff;border-radius:18px;font-family:Quicksand,sans-serif;font-size:18px;font-weight:700;color:#211b1a;box-shadow:3px 3px 0 #211b1a;cursor:pointer;}',
    '.ks-kids-step-choice.is-picked{background:#eda920;}',
    '.ks-kids-step-small-link{align-self:center;font-size:13px;color:#4A4340;margin-top:4px;background:none;border:0;padding:4px;text-decoration:underline;cursor:pointer;font-family:Quicksand,sans-serif;}',
    '.ks-kids-step-small-link.is-picked{font-weight:700;color:#211b1a;}',
    '.ks-kids-step-size-line{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:15px;padding:2px 4px;}',
    '.ks-kids-step-size-change{font-weight:700;color:#211b1a;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;font-family:Quicksand,sans-serif;font-size:15px;}',
    '.ks-kids-step-size-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}',
    '.ks-kids-step-size-choice{height:46px;border:2.5px solid #211b1a;background:#fff;border-radius:14px;font-family:Quicksand,sans-serif;font-size:15px;font-weight:700;color:#211b1a;box-shadow:2px 2px 0 #211b1a;cursor:pointer;padding:0;}',
    '.ks-kids-step-size-choice.is-picked{background:#eda920;}',
    '.ks-kids-step-add-another{height:56px;border:2.5px dashed #211b1a;background:transparent;border-radius:18px;font-family:Quicksand,sans-serif;font-size:17px;font-weight:700;color:#211b1a;cursor:pointer;}',
    '.ks-kids-step-spacer{flex:0 0 4px;}',
    '.ks-kids-step-continue{height:58px;border:2.5px solid #211b1a;background:#1c4a91;border-radius:999px;font-family:Quicksand,sans-serif;font-size:18px;font-weight:700;color:#edece0;box-shadow:4px 4px 0 #211b1a;cursor:pointer;}',
    '.ks-kids-step-continue:disabled{border-color:#b9b5aa;background:transparent;color:#6E6A63;box-shadow:none;cursor:default;}',
    '.ks-kids-step-error{color:#e54f25;font-size:14px;font-weight:700;text-align:center;margin:0;}',
    '.ks-kids-step-saved-list{display:flex;flex-direction:column;gap:22px;}'
  ].join('');

  var _kids = null;   // the open step: { saved: [], cur: {...}, stage, el, fake }
  // S435, hers: the dashboard shows faintly through the step, and the coin pour waits
  // until the step is finished. whenBankOnScreen hands its start to this.
  var _kidsAfter = [];
  function kidsWhenClosed(fn) { if (_kids) _kidsAfter.push(fn); else fn(); }

  function kidsStepMaybe(s) {
    try {
      if (document.getElementById('ks-kids-step')) return;
      var fake = (_FAKE === 'kids');
      var kidsNow = (s && s.children) || [];
      if (!fake && kidsNow.length) return;
      // The shop-first landing wait reloads the page when credits land; the step shows then.
      if (document.getElementById('ks-jjw-cover')) return;
      kidsStepOpen(fake);
    } catch (e) { console.error('kids step error', e); }
  }

  function kidsStepOpen(fake) {
    if (!document.getElementById('ks-kids-step-style')) {
      var st = document.createElement('style');
      st.id = 'ks-kids-step-style';
      st.textContent = KIDS_CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    var el = document.createElement('div');
    el.id = 'ks-kids-step';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ks-kids-step-heading');
    (document.body || document.documentElement).appendChild(el);
    _kids = { saved: [], cur: kidsBlank(), stage: 'name', el: el, fake: fake, busy: false, error: '', sizeOpen: false };
    document.documentElement.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';
    if (fake) console.log('[ks-dash] kids step PREVIEW (?fake=kids), saves are not written');
    kidsRender();
  }

  // S436: a saved child from member-state, in the step's own shape (for Edit)
  function kidsFromServerChild(c) {
    var m = (c.age_months === 0 || c.age_months) ? c.age_months : null;
    var unit = '', age = null;
    if (m !== null) { if (m < 24) { unit = 'months'; age = m; } else { unit = 'years'; age = Math.floor(m / 12); } }
    return { id: c.id, name: kidsCap(c.name || ''), gender: c.gender || '', age: age, unit: unit,
             sizes: kidsListSizes(c), byHand: !!c.size_by_hand, other: age !== null && !kidsInList(age, unit) };
  }
  function kidsEditCopy(sc) {
    return { name: sc.name, gender: sc.gender, age: sc.age, unit: sc.unit, sizes: (sc.sizes || []).slice(),
             byHand: sc.byHand, replaces: sc.id, other: sc.other };
  }
  // From the kids list in Account & Settings: 'edit' opens every saved tag (each with its
  // own Edit), 'add' opens a blank tag
  function kidsOpenFromAccount(mode, idx) {
    if (_kids) return;
    kidsStepOpen(_FAKE === 'kids');
    _kids.saved = _lastKids.map(kidsFromServerChild);
    _kids.cur = kidsBlank();
    _kids.entry = mode;
    // S442: a tapped tile opens straight on that child's edit form.
    if (mode === 'edit-one' && _kids.saved[idx]) {
      _kids.cur = kidsEditCopy(_kids.saved[idx]);
      kidsGo('edit');
      return;
    }
    kidsGo(mode === 'edit' && _kids.saved.length ? 'done' : 'name');
  }
  // Close with nothing changed (no reload of the list)
  function kidsCloseNow() {
    var k = _kids; if (!k) return;
    if (k.el.parentNode) k.el.parentNode.removeChild(k.el);
    document.documentElement.style.overflow = '';
    if (document.body) document.body.style.overflow = '';
    _kids = null;
    var q = _kidsAfter; _kidsAfter = [];
    q.forEach(function (fn) { try { fn(); } catch (e) { console.error('kids step: after-close error', e); } });
  }

  function kidsBlank() {
    return { name: '', gender: '', age: null, unit: '', sizes: [], byHand: false, replaces: null, other: false };
  }

  function kidsEsc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function kidsChipsHtml(c) {
    var out = '';
    if (c.gender === 'girl') out += '<span class="ks-kids-step-chip ks-kids-step-chip--first">Girl</span>';
    if (c.gender === 'boy')  out += '<span class="ks-kids-step-chip ks-kids-step-chip--first">Boy</span>';
    // Under 2 the size chip already says the range (6-9M etc.), so that age chip is dropped
    var sameAsSize = c.unit === 'months' && !c.byHand && [7, 10, 15, 21].indexOf(c.age) !== -1;
    if (c.age !== null && c.unit && !sameAsSize) out += '<span class="ks-kids-step-chip ks-kids-step-chip--age">' + kidsEsc(kidsAgeLabel(c.age, c.unit)) + '</span>';
    (c.sizes || []).forEach(function (sz) { out += '<span class="ks-kids-step-chip ks-kids-step-chip--size">Size ' + kidsEsc(kidsSizeLabel(sz)) + '</span>'; });
    return out ? '<div class="ks-kids-step-chips">' + out + '</div>' : '';
  }

  function kidsNameTagHtml(c, opts) {
    opts = opts || {};
    var body = c.name
      ? '<div class="ks-kids-step-name-tag-name">' + kidsEsc(kidsCap(c.name)) + '</div>' + kidsChipsHtml(c)
      : '<div class="ks-kids-step-name-tag-blank"></div>';
    return '<div class="ks-kids-step-name-tag' + (opts.tappable ? ' is-tappable' : '') + '"' +
      (opts.tappable ? ' data-kids-step="change-name" role="button" tabindex="0" aria-label="Change the name"' : '') + '>' +
      '<div class="ks-kids-step-name-tag-top">Hello!<span>MY NAME IS</span></div>' +
      '<div class="ks-kids-step-name-tag-body">' + body + '</div>' +
      (opts.editIndex !== undefined ? '<button type="button" class="ks-kids-step-name-tag-edit" data-kids-step="edit" data-kids-index="' + opts.editIndex + '">Edit</button>' : '') +
      '</div>';
  }

  function kidsAgeOptionsHtml(c) {
    var html = '<option value="">Pick an age</option>';
    KIDS_AGES.forEach(function (a) {
      var sel = (!c.other && c.unit === a.unit && c.age === a.age) ? ' selected' : '';
      html += '<option value="' + a.unit + ':' + a.age + '"' + sel + '>' + a.label + '</option>';
    });
    html += '<option value="other"' + (c.other ? ' selected' : '') + '>Other</option>';
    return html;
  }
  function kidsOtherValid(c) {
    if (c.age === null || !c.unit) return false;
    return c.unit === 'months' ? (c.age >= 0 && c.age <= 23) : (c.age >= 2 && c.age <= 17);
  }

  // S436: up to two sizes. The months the size is read from (null until an age is picked)
  function kidsMonthsOf(c) {
    if (c.age === null || !c.unit) return null;
    if (c.other && !kidsOtherValid(c)) return null;
    return kidsAgeMonths(c.age, c.unit);
  }
  function kidsRefreshSize(c) {
    if (c.byHand) return;
    var m = kidsMonthsOf(c);
    var s = m === null ? '' : kidsSizeForMonths(m);
    c.sizes = s ? [s] : [];
  }
  function kidsSizeIndex(v) {
    for (var i = 0; i < KIDS_SIZES.length; i++) if (KIDS_SIZES[i].value === v) return i;
    return 99;
  }
  // "size 7", "sizes 5 and 6"
  function kidsSizesWords(list) {
    return (list.length > 1 ? 'sizes ' : 'size ') + list.map(kidsSizeLabel).join(' and ');
  }

  function kidsEditReady(c) {
    return !!String(c.name || '').trim() && !!c.gender && kidsMonthsOf(c) !== null;
  }

  function kidsRender() {
    var k = _kids; if (!k) return;
    var c = k.cur;
    var star = '<svg class="ks-kids-step-heading-star" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 L14.6 9.4 L23 12 L14.6 14.6 L12 23 L9.4 14.6 L1 12 L9.4 9.4 Z" fill="#f491a9"></path></svg>';
    var html = '<div class="ks-kids-step-column">' +
      '<div class="ks-kids-step-heading-wrap">' + star +
      '<h1 class="ks-kids-step-heading" id="ks-kids-step-heading">Tell us about your kids</h1></div>';

    if (k.stage === 'done') {
      html += '<div class="ks-kids-step-saved-list">';
      k.saved.forEach(function (sc, i) { html += kidsNameTagHtml(sc, { editIndex: i }); });
      html += '</div>' +
        '<button type="button" class="ks-kids-step-add-another" data-kids-step="add-another">+ Add another child</button>' +
        '<div class="ks-kids-step-spacer"></div>' +
        (k.error ? '<p class="ks-kids-step-error" role="alert">' + kidsEsc(k.error) + '</p>' : '') +
        '<button type="button" class="ks-kids-step-continue" data-kids-step="finish"' + (k.busy ? ' disabled' : '') + '>' + (k.entry ? 'Done' : 'Continue') + '</button>';
    } else {
      var canGo = false;
      var editing = k.stage === 'edit';   // S436: the edit form, every answer on one screen
      if (k.stage === 'name' || editing) {
        html += '<div class="ks-kids-step-name-tag">' +
          '<div class="ks-kids-step-name-tag-top">Hello!<span>' + (editing ? 'MY NAME IS' : 'MY CHILD\'S NAME IS') + '</span></div>' +
          '<div class="ks-kids-step-name-tag-body">' +
          '<input id="ks-kids-step-name-box" class="ks-kids-step-name-on-tag" type="text" maxlength="40" autocomplete="off" autocapitalize="words" enterkeyhint="next" placeholder="Name" aria-label="Your child\'s first name" value="' + kidsEsc(c.name) + '">' +
          '</div></div>' +
          (editing ? '' : '<p class="ks-kids-step-tag-hint">Write your child\'s first name on the tag.</p>');
        // ⚠ The tag says MY CHILD'S NAME IS while she types, then MY NAME IS once it's filled
        //   (hers S435: she must never put her own name here).
        canGo = !!c.name.trim();
      } else {
        html += kidsNameTagHtml(c, { tappable: true });
      }
      if (k.stage === 'gender' || editing) {
        html += '<div class="ks-kids-step-question">' +
          '<div class="ks-kids-step-question-text">' + kidsEsc(kidsCap(c.name)) + ' is a…</div>' +
          '<div class="ks-kids-step-choice-row">' +
          '<button type="button" class="ks-kids-step-choice' + (c.gender === 'girl' ? ' is-picked' : '') + '" data-kids-step="gender" data-kids-value="girl">Girl</button>' +
          '<button type="button" class="ks-kids-step-choice' + (c.gender === 'boy' ? ' is-picked' : '') + '" data-kids-step="gender" data-kids-value="boy">Boy</button>' +
          '</div>' +
          '<button type="button" class="ks-kids-step-small-link' + (c.gender === 'not_said' ? ' is-picked' : '') + '" data-kids-step="gender" data-kids-value="not_said">I\'d rather not say</button>' +
          '</div>';
        canGo = !!c.gender;
      }
      if (k.stage === 'age' || editing) {
        var who = c.gender === 'girl' ? 'she wears' : (c.gender === 'boy' ? 'he wears' : kidsEsc(kidsCap(c.name)) + ' wears');
        html += '<div class="ks-kids-step-question">' +
          '<label for="ks-kids-step-age-picker" class="ks-kids-step-question-text">How old is ' + kidsEsc(kidsCap(c.name)) + '?</label>' +
          '<select id="ks-kids-step-age-picker" class="ks-kids-step-age-picker">' + kidsAgeOptionsHtml(c) + '</select>';
        if (c.other) {
          html += '<div class="ks-kids-step-choice-row">' +
            '<input id="ks-kids-step-other-age" class="ks-kids-step-text-box" type="text" inputmode="numeric" maxlength="2" placeholder="Age" aria-label="Age" style="flex:1" value="' + (c.age === null ? '' : c.age) + '">' +
            '<button type="button" class="ks-kids-step-choice' + (c.unit === 'months' ? ' is-picked' : '') + '" data-kids-step="other-unit" data-kids-value="months">Months</button>' +
            '<button type="button" class="ks-kids-step-choice' + (c.unit === 'years' ? ' is-picked' : '') + '" data-kids-step="other-unit" data-kids-value="years">Years</button>' +
            '</div>';
        }
        var mo = kidsMonthsOf(c);
        var nm = kidsEsc(kidsCap(c.name));
        var sug = mo === null ? '' : kidsSizeForMonths(mo);
        var showGrid = k.sizeOpen;
        if (mo !== null) {
          if (c.byHand && c.sizes.length) {
            html += '<div class="ks-kids-step-size-line"><span>' + nm + ' wears ' + kidsEsc(kidsSizesWords(c.sizes)) + '.</span>' +
              '<button type="button" class="ks-kids-step-size-change" data-kids-step="size-open">' + (k.sizeOpen ? 'Done' : 'Change') + '</button></div>';
          } else if (sug) {
            html += '<div class="ks-kids-step-size-line"><span>We think ' + who + ' <b>' + kidsEsc(kidsSizePhrase(sug)) + '</b>.</span>' +
              '<button type="button" class="ks-kids-step-size-change" data-kids-step="size-open">' + (k.sizeOpen ? 'Done' : 'Change') + '</button></div>';
          } else {
            // Past the closet's sizes by age (or under 3 months): the sizes show straight away
            showGrid = true;
            var pr = c.gender === 'girl' ? 'she' : (c.gender === 'boy' ? 'he' : nm);
            html += '<p class="ks-kids-step-size-note">' + (mo < 3
              ? 'Our closet currently starts at 6-9M. Pick the size ' + pr + ' wears. You can select two sizes if you want.'
              : 'Our closet currently goes up to size 7. Pick the size ' + pr + ' wears. You can select two sizes if you want.') + '</p>';
          }
        }
        if (mo !== null && showGrid) {
          if (sug || (c.byHand && c.sizes.length)) html += '<p class="ks-kids-step-size-note">You can select two sizes if you want.</p>';
          html += '<div class="ks-kids-step-size-grid" role="group" aria-label="Sizes">';
          KIDS_SIZES.forEach(function (sz) {
            var on = c.sizes.indexOf(sz.value) !== -1;
            html += '<button type="button" class="ks-kids-step-size-choice' + (on ? ' is-picked' : '') + '" aria-pressed="' + on + '" data-kids-step="size" data-kids-value="' + kidsEsc(sz.value) + '">' + kidsEsc(sz.label) + '</button>';
          });
          html += '</div>';
          if (c.byHand && c.sizes.length) {
            html += '<p class="ks-kids-step-size-grows">' + (c.gender === 'girl' ? 'Her sizes move up as she grows.'
              : (c.gender === 'boy' ? 'His sizes move up as he grows.' : 'Sizes move up as ' + nm + ' grows.')) + '</p>';
          }
        }
        html += '</div>';
        canGo = kidsMonthsOf(c) !== null && !k.busy;
      }
      if (editing) canGo = kidsEditReady(c) && !k.busy;
      html += '<div class="ks-kids-step-spacer"></div>' +
        (k.error ? '<p class="ks-kids-step-error" role="alert">' + kidsEsc(k.error) + '</p>' : '') +
        '<button type="button" class="ks-kids-step-continue" data-kids-step="continue"' + (canGo ? '' : ' disabled') + '>' + (k.busy ? 'Saving…' : (editing ? 'Save' : 'Continue')) + '</button>' +
        ((k.saved.length || k.entry) && !k.busy ? '<button type="button" class="ks-kids-step-small-link" data-kids-step="back-to-list">Cancel</button>' : '') +
        (editing && c.replaces && !k.busy ? '<button type="button" class="ks-kids-step-small-link ks-kids-step-remove-link" data-kids-step="remove-child">Remove ' + kidsEsc(kidsCap(c.name || 'this child')) + '</button>' : '');
    }
    html += '</div>';
    k.el.innerHTML = html;
    kidsWire();
  }

  function kidsWire() {
    var k = _kids; if (!k) return;
    var box = k.el.querySelector('#ks-kids-step-name-box');
    if (box) {
      box.addEventListener('input', function () {
        k.cur.name = box.value;
        var go = k.el.querySelector('[data-kids-step="continue"]');
        if (go) go.disabled = k.stage === 'edit' ? !kidsEditReady(k.cur) : !box.value.trim();
      });
      box.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); kidsContinue(); }
      });
      if (k.stage === 'name') setTimeout(function () { try { box.focus(); } catch (e) {} }, 50);
    }
    var age = k.el.querySelector('#ks-kids-step-age-picker');
    if (age) {
      age.addEventListener('change', function () {
        var v = age.value;
        if (v === 'other') {
          k.cur.other = true; k.cur.age = null; k.cur.unit = ''; kidsRefreshSize(k.cur);
          k.error = ''; kidsRender();
          var ob = k.el.querySelector('#ks-kids-step-other-age'); if (ob) ob.focus();
          return;
        }
        k.cur.other = false;
        if (!v) { k.cur.age = null; k.cur.unit = ''; kidsRefreshSize(k.cur); kidsRender(); return; }
        var p = v.split(':');
        k.cur.unit = p[0]; k.cur.age = parseInt(p[1], 10);
        kidsRefreshSize(k.cur);
        k.error = '';
        kidsRender();
      });
    }
    var ob = k.el.querySelector('#ks-kids-step-other-age');
    if (ob) {
      ob.addEventListener('input', function () {
        var n = ob.value.replace(/[^0-9]/g, ''); if (n !== ob.value) ob.value = n;
        k.cur.age = n === '' ? null : parseInt(n, 10);
        kidsOtherSize();
        kidsRender();                            // redraw (size line, chips, Continue), keep her typing
        var again = k.el.querySelector('#ks-kids-step-other-age');
        if (again) { again.focus(); try { again.setSelectionRange(again.value.length, again.value.length); } catch (e) {} }
      });
    }
    var tag = k.el.querySelector('[data-kids-step="change-name"]');
    if (tag) tag.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); kidsGo('name'); }
    });
  }

  function kidsOtherSize() {
    kidsRefreshSize(_kids.cur);
  }
  function kidsGo(stage) {
    if (!_kids) return;
    _kids.stage = stage; _kids.error = ''; _kids.sizeOpen = false;
    kidsRender();
    try { _kids.el.scrollTop = 0; } catch (e) {}
  }

  function kidsContinue() {
    var k = _kids; if (!k || k.busy) return;
    var c = k.cur;
    if (k.stage === 'name') {
      c.name = c.name.trim();
      if (!c.name) return;
      kidsGo('gender');
    } else if (k.stage === 'gender') {
      if (c.gender) kidsGo('age');
    } else if (k.stage === 'age') {
      if (kidsMonthsOf(c) === null) return;
      kidsSave();
    } else if (k.stage === 'edit') {
      c.name = String(c.name || '').trim();
      if (!kidsEditReady(c)) return;
      kidsSave();
    }
  }

  function kidsSave() {
    var k = _kids; var c = k.cur;
    k.busy = true; k.error = ''; kidsRender();
    var payload = {
      name: kidsCap(c.name), gender: c.gender, age: String(c.age), age_unit: c.unit,
      size: c.byHand ? c.sizes.join('|') : '', size_by_hand: (c.byHand && c.sizes.length) ? 'true' : 'false'
    };
    var done = function (resp) {
      k.busy = false;
      if (resp && resp.ok && resp.child) {
        var saved = { id: resp.child.id, name: kidsCap(c.name), gender: c.gender, age: c.age, unit: c.unit,
                      sizes: (resp.child.sizes && resp.child.sizes.length) ? resp.child.sizes.slice(0, 2) : c.sizes.slice(),
                      byHand: c.byHand, other: c.other };
        var replaced = c.replaces;
        if (replaced) {
          for (var i = 0; i < k.saved.length; i++) if (k.saved[i].id === replaced) { k.saved.splice(i, 1, saved); saved = null; break; }
          kidsRemoveOld(replaced);
        }
        if (saved) k.saved.push(saved);
        k.cur = kidsBlank();
        k.changed = true;
        kidsGo('done');
      } else {
        console.error('kids step save error', resp);
        k.error = "Couldn't save that. Please try again.";
        kidsRender();
      }
    };
    if (k.fake) {
      setTimeout(function () { done({ ok: true, child: { id: 'preview-' + Date.now(), sizes: c.sizes.slice() } }); }, 400);
      return;
    }
    var token = window.$memberstackDom.getMemberCookie();
    if (!token) { done(null); return; }
    fetch(CHILD_URL, {
      method: 'POST',
      headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', child: payload })
    })
      .then(function (r) { return r.json(); })
      .then(done)
      .catch(function (e) { console.error('kids step save error', e); done(null); });
  }

  // Editing a saved child saves her again as new, then removes the old row (the remove path)
  function kidsRemoveOld(id) {
    if (!_kids || _kids.fake || !id) return;
    var token = window.$memberstackDom.getMemberCookie();
    if (!token) return;
    fetch(CHILD_URL, {
      method: 'POST',
      headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', child_id: id })
    }).then(function (r) { return r.json(); })
      .then(function (resp) { if (!resp || !resp.ok) console.error('kids step: old row not removed', id, resp); })
      .catch(function (e) { console.error('kids step: old row not removed', id, e); });
  }

  function kidsFinish() {
    var k = _kids; if (!k || !k.saved.length) return;
    k.busy = true; kidsRender();
    var close = function () {
      if (k.el.parentNode) k.el.parentNode.removeChild(k.el);
      document.documentElement.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
      _kids = null;
      var q = _kidsAfter; _kidsAfter = [];
      q.forEach(function (fn) { try { fn(); } catch (e) { console.error('kids step: after-close error', e); } });
    };
    if (k.fake) { close(); return; }
    // Repaint the dashboard's kids list from the server, then lift the step
    var token = window.$memberstackDom.getMemberCookie();
    fetch(FN_URL, { method: 'POST', headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON } })
      .then(function (r) { return r.json(); })
      .then(function (st) { if (st && !st.error) paintChildren(st); })   // also refreshes _lastKids
      .catch(function () {})
      .then(close);
  }

  document.addEventListener('click', function (ev) {
    var k = _kids; if (!k) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-kids-step]') : null;
    if (!t || !k.el.contains(t)) return;
    var act = t.getAttribute('data-kids-step');
    var val = t.getAttribute('data-kids-value');
    if (act === 'continue') { ev.preventDefault(); kidsContinue(); }
    else if (act === 'change-name') { kidsGo('name'); }
    else if (act === 'gender') {
      ev.preventDefault();
      k.cur.gender = val; kidsRender();
      setTimeout(function () { if (_kids && _kids.stage === 'gender') kidsGo('age'); }, 350);
    }
    else if (act === 'other-unit') {
      ev.preventDefault();
      k.cur.unit = val; kidsOtherSize(); kidsRender();
    }
    else if (act === 'size-open') { ev.preventDefault(); k.sizeOpen = !k.sizeOpen; kidsRender(); }
    else if (act === 'size') {
      ev.preventDefault();
      var cc = k.cur;
      if (!cc.byHand) { cc.sizes = []; cc.byHand = true; }
      var at = cc.sizes.indexOf(val);
      if (at !== -1) cc.sizes.splice(at, 1);
      else { cc.sizes.push(val); if (cc.sizes.length > 2) cc.sizes.shift(); }
      cc.sizes.sort(function (a, b) { return kidsSizeIndex(a) - kidsSizeIndex(b); });
      if (!cc.sizes.length) { cc.byHand = false; kidsRefreshSize(cc); }
      k.sizeOpen = true;   // stays open so a second size is one more tap; Done closes it
      kidsRender();
    }
    else if (act === 'add-another') { ev.preventDefault(); k.cur = kidsBlank(); kidsGo('name'); }
    else if (act === 'remove-child') {
      ev.preventDefault();
      var rid = k.cur.replaces;
      var rname = kidsCap(k.cur.name || 'this child');
      if (!rid || !window.confirm('Remove ' + rname + '? You can add them again later.')) return;
      kidsRemoveOld(rid);   // the same remove call (skipped in the preview)
      for (var ri = 0; ri < k.saved.length; ri++) if (k.saved[ri].id === rid) { k.saved.splice(ri, 1); break; }
      k.changed = true;
      k.cur = kidsBlank();
      if (!k.saved.length) { k.entry = null; kidsGo('name'); }   // at least one child, always
      else kidsGo('done');
    }
    else if (act === 'back-to-list') {
      ev.preventDefault();
      // Opened with "+ Add" from Account & Settings and nothing saved yet: Cancel closes it all
      // S442: the same for a tapped tile, Cancel with nothing changed goes back to the page.
      if ((k.entry === 'add' || k.entry === 'edit-one') && !k.changed) { kidsCloseNow(); return; }
      k.cur = kidsBlank(); kidsGo('done');
    }
    else if (act === 'edit') {
      ev.preventDefault();
      var sc = k.saved[parseInt(t.getAttribute('data-kids-index'), 10)];
      if (!sc) return;
      k.cur = kidsEditCopy(sc);
      kidsGo('edit');
    }
    else if (act === 'finish') { ev.preventDefault(); kidsFinish(); }
  });

  // ---------- RUN ----------
  setTimeout(reveal, 4000);

  var token = window.$memberstackDom.getMemberCookie();
  if (!token) { console.error('member-state: no token (logged out?)'); reveal(); return; }

  wirePrefToggles();
  wireChildRemove();
  wireAccountToggle();
  wirePackSnapshot();
  var pName = window.$memberstackDom.getCurrentMember()
    .then(paintHeadline)
    .catch(fallbackHeadline);

  var pState = fetch(FN_URL, {
    method: 'POST',
    headers: { 'x-ms-token': token, 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }
  })
    .then(function (res) { return res.json(); })
    .then(function (state) {
if (state && !state.error) { applyFake(state); nameFromState(state); paint(state); paintGreeting(state); paintBagButton(state); addrBuild(); packWaitStart(); jjWaitMaybe(state); planNoteMaybe(state); kidsStepMaybe(state); }
else { console.error('member-state error', state); neutralGreeting(); jjWaitMaybe(null); }
    })
    .catch(function (e) { console.error('member-state paint error', e); neutralGreeting(); });
Promise.allSettled([pName, pState]).then(function () { reveal(); });
})();
