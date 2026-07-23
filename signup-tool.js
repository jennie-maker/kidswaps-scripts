/* ============================================================================
   KidSwaps — signup wizard
   /signup  ·  mount #ks-signup  ·  stamp [ks-signup] build <sha>

   Six static Webflow forms live inside #ks-signup, one per price, each with
   data-ms-price:add HARDCODED in the Designer. This script NEVER writes a
   price attribute at runtime. It shows the one form matching her plan.

   The inline gate in /signup's head box holds #ks-signup at display:none
   until this file sets data-ks-signup-ready="1". Script never arrives ->
   the form stays hidden. FAIL UGLY, NEVER FAIL OPEN.

   NOTHING OUTSIDE THE COPY BLOCK WRITES MEMBER-FACING TEXT.
   ========================================================================= */

(function () {
  'use strict';

  /* ---- build stamp -------------------------------------------------------
     Lifted verbatim from browse-tool.js / dashboard-tool.js. Parsed from the
     script's OWN src so it cannot go stale. try/catch: a stamp failure must
     never break the page it is stamping. AFTER ANY PIN BUMP, COUNT THE STAMPS.
  */
  try {
    var _s = document.currentScript && document.currentScript.src || '';
    var _m = _s.match(/scripts@([0-9a-f]+)\//);
    console.log('[ks-signup] build ' + (_m ? _m[1] : 'unknown'));
  } catch (e) {}


  /* =========================================================================
     CONFIG
     ====================================================================== */

  /* TERMS_VERSION bumps with this build. It carries BOTH owed copy
     ⚠⚠ S64 OVERRIDE, HERS: the plan CARDS now read "$45/month" and the value
     line drops its tail ("Up to $150 value"). The swaps line keeps "per
     month". This overrides the S56 always-per-month rule FOR THE CARDS ONLY —
     the consent sentence still says "per month" and must not be touched,
     because it is TERMS_VERSION'd and a change means a new row generation.
     corrections at once: "a month" -> "per month", and "when my first whole
     credit lands" -> "when I have my first whole credit". One bump, not two. */
  var TERMS_VERSION = '2026-07-21';

  var CONSENT_TYPE  = 'arl_auto_renew';   /* BYTE-IDENTICAL across both writers
                                             (browser + S1) or the unique index
                                             on (memberstack_id, consent_type,
                                             terms_version) stops collapsing
                                             the two rows into one. */

  var CANCEL_URL    = '/terms-of-service';
  /* S72: the general assent line's two destinations. TERMS_URL happens to
     equal CANCEL_URL today; they are separate names because they answer
     different questions and either could move. */
  var PRIVACY_URL   = '/privacy-policy';
  var TERMS_URL     = '/terms-of-service';
  var IPIFY_URL     = 'https://api.ipify.org?format=json';

  /* The check-only address endpoint. Unauthenticated because at step 4 there
     is no member and no token. IT WRITES NOTHING — it takes an address and
     returns one of: ok | corrected | flagged | not_found | unavailable.
     ⚠ NOT BUILT YET. Until it exists every call fails and falls through to
     'unavailable', which proceeds. FAIL-OPEN IS CORRECT HERE: the check must
     never cost her a signup, and it never blocks her even when it works. */
  var ADDR_CHECK_URL = 'https://ajsobivqxexcniwifxzz.supabase.co/functions/v1/address-check';

  var MOUNT_ID      = 'ks-signup';
  var READY_ATTR    = 'data-ks-signup-ready';

  /* THE POST-STRIPE HANDOFF KEY. Written at step 5 beside ks_consent_pending,
     read on the next load of /signup. See the stash in syncHidden() and the
     call site in resumeEnd(). */
  var END_KEY       = 'ks_end_pending';

  /* ONE PLANS CONSTANT. Step 2's cards, the disclosure interpolation and the
     form selection ALL read from here. A price lives in exactly one place.
     ⚠ PRICE IDs ARE PASTED, NEVER TYPED. Pack prices carry `the-` after
     prc_; trial prices do not. That difference is what a hand-typed ID loses. */
  var PLANS = {

    /* ---- send-bag-first path: the four 60-day-trial prices ---- */
    'basics-trial': {
      slug:    'basics-trial',
      cls:     'clothing',
      formId:  'ks-form-basics-trial',
      price:   'prc_basics-monthly-60-day-trial-i4801al',
      path:    'send',
      name:    'The Basics',
      monthly: 30,
      swaps:   'Up to 6 clothing swaps per month',
      value:   'Up to $150 value',
      pack:    null
    },
    'toychest-trial': {
      slug:    'toychest-trial',
      cls:     'toy',
      formId:  'ks-form-toychest-trial',
      price:   'prc_toy-chest-monthly-60-day-trial-3b6704ox',
      path:    'send',
      name:    'The Toy Chest',
      monthly: 45,
      swaps:   'Up to 5 toy swaps per month',
      value:   'Up to $100 value',
      pack:    null
    },
    'wardrobe-trial': {
      slug:    'wardrobe-trial',
      cls:     'clothing',
      formId:  'ks-form-wardrobe-trial',
      price:   'prc_full-wardrobe-monthly-60-day-trial-bd6604eg',
      path:    'send',
      name:    'The Full Wardrobe',
      monthly: 45,
      swaps:   'Up to 10 clothing swaps per month',
      value:   'Up to $250 value',
      pack:    null
    },
    'everything-trial': {
      slug:    'everything-trial',
      cls:     'both',
      formId:  'ks-form-everything-trial',
      price:   'prc_everything-bag-monthly-60-day-trial-dg3t01b8',
      path:    'send',
      name:    'The Everything Bag',
      monthly: 70,
      swaps:   'Up to 10 clothing and 3 toy swaps per month',   /* ⚠ NEEDS-CONFIRM */
      value:   'Up to $310 value',
      pack:    null
    },

    /* ---- shop-first path: the two pack prices, charged at signup ----
       ⚠ ONLY TWO PLANS EXIST HERE. Full Wardrobe and Everything Bag are
       unreachable for someone starting with a pack. RULED AS-IS. */
    'basics-pack': {
      slug:      'basics-pack',
      cls:       'clothing',
      formId:    'ks-form-basics-pack',
      price:     'prc_the-basics-clothing-starter-pack-zv5r0e59',
      path:      'shop',
      name:      'The Basics',
      monthly:   30,
      titleTop:  'The Basics plan',
      titleSub:  'with a Clothing Starter Pack',
      swaps:     'Up to 6 clothing swaps per month',
      value:     'Up to $150 value',
      pack: {
        name:    'Clothing Starter Pack',
        amount:  75,
        count:   6,
        credits: '6 clothing credits',
        klass:   'clothing'
      }
    },
    'toychest-pack': {
      slug:      'toychest-pack',
      cls:       'toy',
      formId:    'ks-form-toychest-pack',
      price:     'prc_the-toy-chest-toy-starter-pack-0k2c0abs',
      path:      'shop',
      name:      'The Toy Chest',
      monthly:   45,
      titleTop:  'The Toy Chest plan',
      titleSub:  'with a Toy Starter Pack',
      swaps:     'Up to 5 toy swaps per month',
      value:     'Up to $100 value',
      pack: {
        name:    'Toy Starter Pack',
        amount:  85,
        count:   5,
        credits: '5 toy credits',
        klass:   'toy'
      }
    }
  };

  var PLAN_ORDER = {
    send: ['basics-trial', 'wardrobe-trial', 'toychest-trial', 'everything-trial'],
    shop: ['basics-pack', 'toychest-pack']
  };

  /* The seven hidden consent fields. Script-built <input type="hidden"
     data-ms-member="KEY"> appended to the ACTIVE form at the moment she ticks
     and clicks. Memberstack reads INPUT VALUES at submit; it BINDS THE FORM at
     load. That is why fields can be injected and the form cannot.
     ⚠ S1's consent route filters on arl-consented = true. NO FIELD -> NO FILTER
     MATCH -> NO consent_log ROW -> AND NOTHING ERRORS. */
  var ARL_FIELDS = [
    'arl-consented',
    'arl-consented-at',
    'arl-disclosure-text',
    'arl-plan-price',
    'arl-terms-version',
    'arl-user-agent',
    'arl-ip'
  ];

  /* The five shipping fields, script-built hidden inputs on the active form.
     S1 reads exactly these off member.created. Hyphenated keys. */
  var SHIP_FIELDS = {
    line1: 'shipping-street',
    line2: 'shipping-apartment-or-unit',
    city:  'shipping-city',
    state: 'shipping-state',
    zip:   'shipping-zip'
  };


  /* =========================================================================
     COPY  —  every member-facing string lives here and nowhere else.
     JENNIE APPROVES ALL MEMBER-FACING COPY. Strings marked ⚠ NEEDS-COPY are
     placeholders and MUST NOT SHIP.
     ⚠ Curly apostrophes are written as \u2019 escapes, matching browse-tool.js.
     No em-dashes anywhere in member copy.
     ====================================================================== */

  var COPY = {

    /* ---- step 1 ---- APPROVED */
    s1: {
      head: 'So glad you\u2019re here, how would you prefer to start?',
      sub:  'Either option is right.',
      cardA: {
        title: 'Send my swap bag first',
        sub:   'I\u2019d rather send my items first, then shop.'
      },
      cardB: {
        title: 'Shop first',
        sub:   'I want to shop now, and get my empty swap bag with my first order.'
      }
    },

    /* ---- step 2 ---- APPROVED */
    s2: {
      head:    'Pick your plan',
      subSend: 'Nothing is charged today. Billing doesn\u2019t start until you have your first whole credit. Cancel whenever you want from your dashboard.',
      subShop: '1 credit = 1 essentials item',
      /* ⚠ APPROVED VERBATIM S72, HERS. Sits UNDER the credit-unit line, on the
         SHOP-FIRST path only. ⚠⚠ IT PROMISES THE CREDITS ARE ALREADY HERS AND
         NOTHING HAS EVER OBSERVED THAT HAPPENING — see #PACK-CREDITS-OBSERVED.
         Ruled in by her: the promise is true the moment the build is finished,
         and to a member "as soon as I joined" IS immediately. Do not soften it,
         and do not let a handoff describe it as proven. */
      subShopB: 'Your credits are added to your bank immediately, so you can start shopping right away.',
      badge: 'Best of both',
      includesHead: 'Every plan includes',
      includes: [
        'One free round trip per month',
        'Hand inspected to The Closet Standard',
        'Unused credits roll over, and never expire.'
      ]
    },

    /* ---- step 3 ---- APPROVED Session 63.
       ⚠ THE TYPO NUDGE IS NOT OPTIONAL. On a passwordless system a mistyped
       address is an account she can never enter and an inbox we can never
       reach. The same blur also runs the already-registered check. */
    s3: {
      head: 'Your details',
      sub:  'We\u2019ll send a six digit code to sign you in. No password to remember.',
      labelFirst: 'First name',
      labelLast:  'Last name',
      labelEmail: 'Email address',
      typoNudge:  function (suggested) {
        return 'Did you mean ' + suggested + '?';       /* the address itself is tappable */
      },
      registered:     'You already have an account with this email.',
      registeredLink: 'Sign me in'
    },

    /* ---- step 4 ---- heads APPROVED. Field labels + errors reused verbatim
       from the shipped dashboard address form (§ADDR). The three ADDR_ASK
       QUESTIONS are reused VERBATIM from #ADDR-VERIFY, same content, second
       surface — DO NOT REDRAFT THEM.
       ⚠ ONLY THE BUTTONS CHANGED, RULED Session 63: "Save anyway" became
       "Use it anyway" and "or save it as is" became "or use it as is",
       because at step 4 there is no account yet and nothing saves. */
    s4: {
      headShop: 'Where should we send your first order?',
      headSend: 'Where should we send your swap bag?',
      labelLine1: 'Street address',
      labelLine2: 'Apartment, suite, etc. (optional)',
      labelCity:  'City',
      labelState: 'State',
      labelZip:   'ZIP',
      errMissing: 'We need a street, city, state and ZIP to mail your bag.',
      errState:   'State needs to be two letters, like CA.',
      ask: {
        corrected: {
          text: 'We found a slightly different version of your address. Which one should we use?',
          yes:  'Use this one',
          no:   'Keep what I typed'
        },
        flagged: {
          text: 'The postal service has a note on this address. It may still be fine to mail to.',
          yes:  'Use it anyway',
          no:   'Let me edit it'
        },
        not_found: {
          text: 'We couldn\u2019t find this address. That can happen with newer homes. Check it over, or use it as is.',
          yes:  'Use it anyway',
          no:   'Let me edit it'
        }
      }
    },

    /* ---- step 5 ---- consent APPROVED, with both owed corrections applied.
       ⚠⚠ THESE STRINGS ARE STORED VERBATIM IN arl-disclosure-text AND IN
       consent_log. They are the EVIDENCE, not just the page.
       ⚠⚠ "How to cancel" IS INSIDE THE SENTENCE, RULED Session 63 — so the
       stored disclosure itself carries the cancellation reference, which is
       what §17602(a)(8)(E) asks for. The renderer linkifies that trailing
       phrase to CANCEL_URL. DO NOT LIFT IT OUT INTO A SEPARATE LINK. */
    s5: {
      head: 'One last look',
      headline: function (p) {
        return 'You\u2019re joining ' + p.name + ', $' + p.monthly + ' per month.';
      },
      dueTodayLabel: 'Due today',                      /* line kept, NO NUMBER until the CPA rules */
      consentTrial: function (p) {
        return 'I understand my KidSwaps membership renews automatically at $' + p.monthly +
               ' per month until I cancel. I won\u2019t be charged today, billing starts when I have my ' +
               'first whole credit. If I haven\u2019t earned one within 60 days, my card is released and ' +
               'I\u2019m never charged. I can cancel anytime from my dashboard, effective at the end of ' +
               'the period I\u2019ve paid for. ' + COPY.s5.cancelLink;
      },
      consentPack: function (p) {
        return 'I understand my KidSwaps membership renews automatically at $' + p.monthly +
               ' per month until I cancel. My plan begins today, so I\u2019m charged my first month ' +
               'and a one time $' + p.pack.amount + ' credit pack fee now. I can cancel anytime from ' +
               'my dashboard, effective at the end of the period I\u2019ve paid for. ' + COPY.s5.cancelLink;
      },
      cancelLink: 'How to cancel',
      /* ⚠⚠ APPROVED VERBATIM S74. DO NOT REDRAFT. Rendered at step 5, its
         own line, outside the ARL sentence. */
      preframe: 'Stripe handles your card next. The date on their page is how '
              + 'long we hold it. Nothing is charged until your first whole credit.',

      /* ⚠⚠ S72: the general Privacy/Terms assent, which is SEPARATE from the
         ARL checkbox above it (§2) and had never come across into the wizard.
         LIFTED VERBATIM off the published old signup block. DO NOT REDRAFT.
         Held in parts only so the two links can sit inside the sentence; it
         reassembles to the approved string exactly. */
      assent: {
        pre:     'By creating an account you agree to KidSwaps\u2019 ',
        privacy: 'Privacy Policy',
        mid:     ' and ',
        terms:   'Terms of Service',
        post:    '.'
      },
      /* ⚠ INHERITED FROM THE OLD INJECTOR, NEVER APPROVED. Stiff for the house
         voice. Shipping it unchanged rather than redrafting it. */
      errConsent: 'Please confirm you understand your membership renews automatically before continuing.',
      /* ⚠ SUPERSEDES the spring ruling "Agree & Continue to Payment Setup".
         That label was written when payment came next. In the wizard it does
         not — the code step comes next, then Stripe. RULED Session 63. */
      createLabel: 'Create my account'
    },

    /* ---- step 6 ---- APPROVED Session 63.
       ⚠ THE EMAIL IS SAID OUT LOUD ON PURPOSE. This is the last moment she can
       catch a typo before she is locked out of an account she cannot enter
       (passwordless: no password fallback, #EMAIL-CHANGE). */
    s6: {
      head:    'Check your email',
      sub:     function (email) {
        return 'We sent a six digit code to ' + email + '. It\u2019s good for 10 minutes.';
      },
      label:   'Six digit code',
      resend:  'Send a new code',
      resent:  'Sent. Give it a minute.',
      submitLabel: 'Confirm my code',
      errCode: 'That code didn\u2019t work. Check it over, or send a new one.'
    },

    /* ---- end states ---- APPROVED Session 63, Jennie's own wording. */
    endA: {
      head: 'You\u2019re in.',
      /* ⚠⚠ "shortly" IS A TIMING WORD AND THERE IS NO SHIPPING SLA BEHIND IT
         (§BAGS). FLAGGED AND OVERRULED BY JENNIE, Session 63, IN HER WORDS:
         "a bag will never take 9 days, shortly is perfect here." HERS, NOT A
         DEFAULT. Do not quietly remove it; do not re-flag it. */
      body: 'Your first swap bag will be on its way shortly, so watch your mailbox. ' +
            'Fill it with what your kids have outgrown and send it back with the prepaid ' +
            'label that\u2019s already stuck to it. You can start shopping once you earn ' +
            'your first credits.',
      cta:  'Go to my dashboard',
      href: '/dashboard'
    },
    endB: {
      head: 'You\u2019re in.',
      /* ⚠ "added to your bank", NEVER "ready to spend" (§DASH.7 standing rule).
         ⚠ "essential" singular is JENNIE'S WORDING, ruled Session 63 — the tier
         is "essentials" everywhere else in the product. Do not "correct" it.
         ⚠ The count swaps with the pack: 6 clothing, 5 toy. The line does NOT
         say clothing or toy. Raised and ruled as-is. */
      body: function (p) {
        return 'Your ' + p.pack.count + ' essential credits have been added to your bank, ' +
               'and your membership has started. Your empty swap bag will come tucked inside ' +
               'of your first order, prepaid label already attached. Fill it up and send it ' +
               'back to earn more credits.';
      },
      cta:  'Browse the closet',
      href: '/browse'
    },

    /* ---- chrome ---- APPROVED Session 63.
       ⚠ Back is available on steps 2 to 5 and GONE at step 6 — once the
       account exists and the code is sent, Back is meaningless. */
    nav: {
      back:     'Back',
      next:     'Continue',
      /* S71: tapOut / tapStay / tapLeave are APPROVED COPY, RETAINED, AND NO
         LONGER RENDERED. The dialog they belonged to went with the overlay.
         Kept so the words survive if an exit is ever ruled back in. */
      tapOut:   'Leave without finishing? You\u2019ll lose what you\u2019ve filled in so far and will need to start again.',
      tapStay:  'Keep going',
      tapLeave: 'Leave'
    },

    /* ---- generic failure ---- APPROVED Session 63.
       The dashboard's failure line with "save" taken out, because nothing
       saves during signup. */
    errGeneric: 'That didn\u2019t go through. Try again, or email us.'
  };

  /* =========================================================================
     STATE  —  memory only. Nothing persists. A refresh loses it, deliberately
     (ruled: popup, our own tap-out warning, the browser's generic dialog on
     refresh). DO NOT add sessionStorage persistence here.
     ====================================================================== */

  var S = {
    step:      1,
    path:      null,    /* 'send' | 'shop' */
    plan:      null,    /* slug into PLANS */
    first:     '',
    last:      '',
    email:     '',
    addr:      { line1: '', line2: '', city: '', state: '', zip: '' },
    addrCode:  null,    /* ok | corrected | flagged | not_found | unavailable */
    addrSugg:  null,    /* Shippo's suggestion, when there is one */
    consent:   false,
    ip:        '',      /* best-effort, non-fatal */
    busy:      false,   /* IN-FLIGHT GUARD. Her rule, from the grading Save buttons. */
    dirty:     false,   /* has she typed anything yet -> drives the tap-out warning */
    codeSent:  false
  };

  var MAX_STEP = 6;


  /* =========================================================================
     MACHINERY
     ====================================================================== */

  var root, shell, body, formSlot, nav, backBtn, nextBtn, dots, topbar;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls)  n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  function plan() { return S.plan ? PLANS[S.plan] : null; }

  /* ONE EVENT PER STEP, FROM DAY ONE. Step drop-off cannot be reconstructed
     later — same shape as #ANALYTICS-CLOCK. Fire-and-forget; never throws. */
  function track(name, extra) {
    try {
      var payload = { step: S.step, path: S.path, plan: S.plan };
      if (extra) for (var k in extra) payload[k] = extra[k];
      if (window.dataLayer && window.dataLayer.push) {
        window.dataLayer.push({ event: 'ks_signup_' + name, ks: payload });
      }
      console.log('[ks-signup] ' + name, payload);
    } catch (e) {}
  }

  /* Every form-scoped lookup goes through here. All six forms share
     id="Email-2" and id="Password-2", so a document-level id lookup would
     silently return the FIRST form's input. NEVER QUERY BY ID. */
  function activeForm() {
    return S.plan ? document.getElementById(PLANS[S.plan].formId) : null;
  }
  function inForm(sel) {
    var f = activeForm();
    return f ? f.querySelector(sel) : null;
  }

  var SEL = {
    email:  'input[data-ms-member="email"]',
    code:   'input[data-ms-member="token"]',   /* named Password-2 by inheritance.
                                                  IT IS NOT A PASSWORD. */
    submit: 'input[type="submit"]',
    codeWrap: '[data-ms-passwordless="step-2"]'
  };


  /* ---- navigation -------------------------------------------------------- */

  function go(n) {
    if (n < 1 || n > MAX_STEP) return;
    S.step = n;
    render();
    foldFit();   /* belt: the observer covers this too, but not if it is absent */
    track('step_view');
    /* ⚠⚠ S74 FAULT, FIXED HERE. This line used to read shell.scrollTop = 0,
       which is THE CARD'S INTERNAL SCROLL AND NOT THE WINDOW'S. Nothing
       scrolled the page on a step change, so advancing from a tall step to a
       short one left the window where it was and the card landed mid-page,
       which reads exactly like a broken load. Seen on step 6.
       ⚠ THE GLOBAL HEADER IS ON THIS PAGE SINCE S71, so the offset has to
       clear it or the top of the card hides underneath. .w-nav is Webflow's
       navbar class; if it is absent the offset is 0 and this still works.
       ⚠ render() runs on FIRST PAINT, go() does not - so this never fires on
       page load and cannot yank a fresh visitor down the page. */
    try {
      var hdr = document.querySelector('.w-nav');
      var off = hdr ? hdr.getBoundingClientRect().height : 0;
      var rm  = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)');
      var y   = shell.getBoundingClientRect().top + window.pageYOffset - off - 14;
      window.scrollTo({ top: y < 0 ? 0 : y,
                        behavior: (rm && rm.matches) ? 'auto' : 'smooth' });
    } catch (e) {}
  }

  /* ---- the fold ----------------------------------------------------------
     S72, hers: the steps are different heights, so the footer walked up and
     down the page as she advanced.
     ⚠ THE MIN-HEIGHT GOES ON THE SECTION, NEVER ON THE CARD. A fixed card
     leaves short steps with dead space inside a white box; a fixed section
     holds the footer still and lets the card keep its natural height, centred.
     It is a SELF-TUNING HIGH-WATER MARK — no magic number to go stale across
     widths, and if this code never runs the page behaves exactly as it does
     today. Growing only is also what stops the ResizeObserver looping. */
  var FOLD_MAX = 0;

  function foldCard() { return shell && shell.querySelector('.ks-wz-card'); }

  function foldFit() {
    var card = foldCard();
    if (!card) return;
    var cs   = getComputedStyle(shell);
    var need = card.offsetHeight +
               (parseFloat(cs.paddingTop) || 0) +
               (parseFloat(cs.paddingBottom) || 0);
    if (need > FOLD_MAX + 1) {
      FOLD_MAX = need;
      shell.style.minHeight = Math.ceil(FOLD_MAX) + 'px';
    }
  }

  /* A resize can make every card SHORTER (phone -> desktop), and a high-water
     mark cannot shrink on its own. Reset, then re-measure. */
  function foldReset() {
    FOLD_MAX = 0;
    if (shell) shell.style.minHeight = '';
    foldFit();
  }

  function foldWatch() {
    var card = foldCard();
    /* The observer catches EVERY height change, not just step changes — the
       address ask opening, an error line appearing, a late webfont. */
    if (card && window.ResizeObserver) {
      try { new ResizeObserver(foldFit).observe(card); } catch (e) {}
    }
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(foldReset, 150);
    });
  }

  function back() {
    /* Back lives on steps 2 to 5 and is GONE at step 6. Once the account
       exists and the code is sent, Back is meaningless. */
    if (S.step <= 1 || S.step >= 6) return;
    go(S.step - 1);
  }

  /* ---- the in-flight guard ----------------------------------------------
     Her rule, and the precedent is hers: the grading Save buttons carry the
     same guard because a double-tap would phantom-credit a real member.
     Here a double-tap on Create would fire two signups. */
  function lock(btn, label) {
    if (S.busy) return false;
    S.busy = true;
    if (btn) { btn.disabled = true; if (label) btn.value = btn.textContent = label; }
    return true;
  }
  function unlock(btn, label) {
    S.busy = false;
    if (btn) { btn.disabled = false; if (label) btn.value = btn.textContent = label; }
  }


  /* ---- leaving ----------------------------------------------------------
     ONE exit now. The refresh dialog is the BROWSER'S and its wording is not
     ours to write (ruled). The tap-out dialog was OURS and was retired in S71
     with the overlay it belonged to. */

  function armRefreshWarning() {
    window.addEventListener('beforeunload', function (e) {
      if (!S.dirty || S.step >= 6) return;
      e.preventDefault();
      e.returnValue = '';          /* the browser supplies its own generic text */
    });
  }

  /* S71: confirmLeave() REMOVED with the close X — it was that button's only
     caller, and in the page flow there is no backdrop to tap out of. */


  /* ---- the shell ---------------------------------------------------------
     Built once. Steps 1, 2 and 4 render into .ks-wz-body. Steps 3, 5 and 6
     need real Memberstack-bound markup, so the ACTIVE FORM is moved into
     .ks-wz-formslot and its own three elements are shown or hidden per step.
     ⚠⚠ THE FORM IS MOVED, NEVER REBUILT. appendChild relocates the live node
     with its Memberstack binding intact. Memberstack binds at LOAD; the
     element object does not change when it moves. THIS IS UNOBSERVED ON THIS
     PROJECT — watch the console for a re-bind line on the first real run. */

  function buildShell() {
    shell = el('div', 'ks-wz');
    var card = el('div', 'ks-wz-card');

    /* S71: NO CLOSE X. The wizard is in the page flow, so there is nothing to
       close, and there is no ruled destination to send her to. Recoverable at
       @3696638 along with confirmLeave(). */

    body     = el('div', 'ks-wz-body');
    formSlot = el('div', 'ks-wz-formslot');
    dots     = el('div', 'ks-wz-dots');

    nav      = el('div', 'ks-wz-nav');
    backBtn  = el('button', 'ks-wz-btn ks-wz-btn-ghost', COPY.nav.back);
    nextBtn  = el('button', 'ks-wz-btn ks-wz-btn-primary', COPY.nav.next);
    backBtn.type = nextBtn.type = 'button';
    backBtn.addEventListener('click', back);
    nav.appendChild(nextBtn);

    /* ⚠⚠ RULED S74: BACK SITS TOP RIGHT, beside the dots. The bottom nav
       row now carries Continue alone (it already had margin-left:auto, so it
       stays right-aligned on its own). backBtn is the SAME ELEMENT and the
       SAME click handler - only its parent changed, so paintNav's
       'steps 2-5 only' line keeps working untouched. */
    topbar = el('div', 'ks-wz-top');
    topbar.appendChild(dots);
    topbar.appendChild(backBtn);

    card.appendChild(topbar);
    card.appendChild(body);
    card.appendChild(formSlot);
    card.appendChild(nav);
    shell.appendChild(card);

    /* The shell goes FIRST inside the mount, ahead of the six form-blocks. */
    root.insertBefore(shell, root.firstChild);
  }

  /* Hide all six form-blocks; move the chosen one into the slot. */
  function mountForm() {
    var forms = root.querySelectorAll('form[data-ks-form]');
    for (var i = 0; i < forms.length; i++) {
      var wrap = forms[i].closest('.w-form') || forms[i].parentNode;
      wrap.style.display = 'none';
    }
    var f = activeForm();
    if (!f) return;
    var w = f.closest('.w-form') || f.parentNode;
    if (w.parentNode !== formSlot) formSlot.appendChild(w);
    w.style.display = '';
  }

  /* Steps 3, 5 and 6 each want a different subset of the form's own three
     elements. Nothing is REMOVED — the email input must keep its value all
     the way to submit. Hide, never detach. */
  function formView(mode) {
    var email = inForm(SEL.email);
    var code  = inForm(SEL.code);
    var sub   = inForm(SEL.submit);
    var cw    = inForm(SEL.codeWrap);
    var ew    = email && (email.closest('.field-wrapper') || email.parentNode);

    if (ew) ew.style.display = (mode === 'details') ? '' : 'none';
    if (cw) cw.style.display = (mode === 'code')    ? '' : 'none';
    if (sub) {
      sub.style.display = (mode === 'create' || mode === 'code') ? '' : 'none';
      if (mode === 'create') sub.value = COPY.s5.createLabel;
      /* S69: the account was already made at step 5, so Memberstack's
         inherited "Create my account" was a lie on the code screen. */
      if (mode === 'code')   sub.value = COPY.s6.submitLabel;
    }
    if (code) {
      code.setAttribute('autocomplete', 'one-time-code');
      code.setAttribute('inputmode', 'numeric');
    }
    if (email) {
      email.setAttribute('autocomplete', 'email');
      email.setAttribute('inputmode', 'email');
    }
  }


  /* ---- progress ---------------------------------------------------------- */

  function paintDots() {
    clear(dots);
    /* MAX_STEP + 1: the last dot is Stripe, which this wizard does not own.
       It never lights. It is there so six screens do not promise "done". */
    for (var i = 1; i <= MAX_STEP + 1; i++) {
      var d = el('span', 'ks-wz-dot' + (i === S.step ? ' is-on' : (i < S.step ? ' is-done' : '')));
      dots.appendChild(d);
    }
  }

  function paintNav(opts) {
    opts = opts || {};
    backBtn.style.display = (S.step >= 2 && S.step <= 5) ? '' : 'none';
    nextBtn.style.display = opts.hideNext ? 'none' : '';
    nextBtn.textContent   = opts.nextLabel || COPY.nav.next;
    nextBtn.disabled      = !!opts.nextDisabled;
    nextBtn.onclick       = opts.onNext || null;
  }


  /* =========================================================================
     STEPS
     ====================================================================== */

  function render() {
    clear(body);
    paintDots();
    if (S.step === 1) return step1();
    if (S.step === 2) return step2();
    if (S.step === 3) return step3();
    if (S.step === 4) return step4();
    if (S.step === 5) return step5();
    if (S.step === 6) return step6();
  }

  function head(h, sub) {
    body.appendChild(el('h2', 'ks-wz-h', h));
    if (sub) body.appendChild(el('p', 'ks-wz-sub', sub));
  }


  /* ---- step 1: how do you want to start ---------------------------------- */

  function step1() {
    formSlot.style.display = 'none';
    head(COPY.s1.head, COPY.s1.sub);

    var wrap = el('div', 'ks-wz-forks' + (S.path ? ' has-pick' : ''));
    [['send', COPY.s1.cardA], ['shop', COPY.s1.cardB]].forEach(function (pair) {
      var pathKey = pair[0], c = pair[1];
      var b = el('button', 'ks-wz-fork ks-wz-fork--' + pathKey +
                (S.path === pathKey ? ' is-on' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'ks-wz-fork-t', c.title));
      b.appendChild(el('span', 'ks-wz-fork-s', c.sub));
      b.appendChild(el('span', 'ks-wz-fork-check'));
      b.addEventListener('click', function () {
        /* Changing path invalidates a plan chosen on the other path. */
        if (S.path !== pathKey) { S.path = pathKey; S.plan = null; }
        S.dirty = true;
        track('path_pick', { picked: pathKey });
        go(2);
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);

    paintNav({ hideNext: true });
  }


  /* ---- step 2: pick your plan -------------------------------------------- */

  function planCard(p) {
    var b = el('button', 'ks-wz-plan ks-wz-plan--' + (p.cls || 'clothing') +
                     ((p.slug || '').indexOf('wardrobe') === 0 ? ' ks-wz-plan--gold' : '') +
                     (S.plan === p.slug ? ' is-on' : ''));
    b.type = 'button';

    var top = el('div', 'ks-wz-plan-top');
    var title = el('div', 'ks-wz-plan-title');
    if (p.pack) {
      /* Pack card title splits onto two lines, and the card reads as a
         RECEIPT: each charge sits beside what it buys. */
      title.appendChild(el('span', 'ks-wz-plan-title-a', p.titleTop));
      title.appendChild(el('span', 'ks-wz-plan-title-b', p.titleSub));
    } else {
      title.appendChild(el('span', 'ks-wz-plan-title-a', p.name));
    }
    /* Price sits TOP RIGHT on every card, no exceptions. */
    var price = el('div', 'ks-wz-plan-price', '$' + p.monthly + '/month');
    top.appendChild(title);
    top.appendChild(price);
    b.appendChild(top);

    var lines = el('div', 'ks-wz-plan-lines');
    if (p.pack) {
      var creditRow = el('div', 'ks-wz-plan-row');
      creditRow.appendChild(el('span', 'ks-wz-plan-credits', p.pack.credits));
      creditRow.appendChild(el('span', 'ks-wz-plan-once', 'plus $' + p.pack.amount + ' once'));
      lines.appendChild(creditRow);
    }
    lines.appendChild(el('div', 'ks-wz-plan-swaps', p.swaps));
    lines.appendChild(el('div', 'ks-wz-plan-value', p.value));   /* italic, in CSS */
    b.appendChild(lines);
    /* always built, shown by CSS only when this card is the pick */
    if ((p.slug || '').indexOf('everything') === 0) {
      b.appendChild(el('span', 'ks-wz-plan-badge', COPY.s2.badge));
      /* S70: the light sweep. Its OWN layer, so its overflow clip can never
         reach the badge the way the card's old clip did. */
      b.appendChild(el('span', 'ks-wz-plan-shine'));
    }
    b.appendChild(el('span', 'ks-wz-plan-check'));

    b.addEventListener('click', function () {
      S.plan = p.slug;
      S.dirty = true;
      track('plan_pick', { picked: p.slug });
      render();
    });
    return b;
  }

  function step2() {
    formSlot.style.display = 'none';
    /* TWO subs on the shop-first path, ONE on send-first. head() takes a single
       sub and EVERY other step calls it, so the shop branch builds its own pair
       here rather than changing head()'s signature. --lead only closes the gap
       between the two lines; it carries no colour and no size. */
    if (S.path === 'shop') {
      head(COPY.s2.head);
      body.appendChild(el('p', 'ks-wz-sub ks-wz-sub--lead', COPY.s2.subShop));
      body.appendChild(el('p', 'ks-wz-sub', COPY.s2.subShopB));
    } else {
      head(COPY.s2.head, COPY.s2.subSend);
    }

    /* ⚠⚠ RULED S74, HERS, AND IT IS A KNOWING REVERSAL OF S69 - NOT A
       CORRECTION. S69 put this block ABOVE the cards on purpose: sitting
       below them it read like a fifth option and a skippable afterthought.
       She was shown that reasoning and moved it back down anyway. DO NOT
       'RESTORE' IT TO THE TOP. Its divider moved with it - .ks-wz-includes
       now carries a border-TOP, so the line sits between the cards and the
       list instead of hanging under nothing. */
    var list = el('div', 'ks-wz-plans' + (S.plan ? ' has-pick' : ''));
    PLAN_ORDER[S.path].forEach(function (slug) {
      list.appendChild(planCard(PLANS[slug]));
    });
    body.appendChild(list);

    var inc = el('div', 'ks-wz-includes');
    inc.appendChild(el('div', 'ks-wz-includes-h', COPY.s2.includesHead));
    var ul = el('ul', 'ks-wz-includes-list');
    COPY.s2.includes.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    inc.appendChild(ul);
    body.appendChild(inc);

    paintNav({
      nextDisabled: !S.plan,
      onNext: function () { if (S.plan) go(3); }
    });
  }


  /* ---- shared field builder ---------------------------------------------- */

  var STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN ' +
                'MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA ' +
                'WV WI WY').split(' ');

  function field(label, key, get, set, opts) {
    opts = opts || {};
    var wrap = el('div', 'ks-wz-field');
    var id   = 'ks-wz-' + key;
    var lab  = el('label', 'ks-wz-label', label);
    lab.setAttribute('for', id);

    var input;
    if (opts.select) {
      input = el('select', 'ks-wz-input');
      input.appendChild(el('option', null, ''));
      STATES.forEach(function (s) {
        var o = el('option', null, s);
        o.value = s;
        input.appendChild(o);
      });
    } else {
      input = el('input', 'ks-wz-input');
      input.type = opts.type || 'text';
      if (opts.autocomplete) {
        input.setAttribute('autocomplete', opts.autocomplete);
        /* ⚠⚠ RULED S74, HERS: ADDRESS CASING IS FIXED AT ENTRY, NOT AFTER.
           The phone capitalises AS SHE TYPES and she can override it. NO
           transformation at display, NONE at save.
           ⚠ REASONING, so it is not re-litigated: any automatic capitalising
           breaks Mc, Mac, O', hyphens and directionals. If it happens as she
           types she SEES it and fixes it; afterwards she never knows. And the
           confirmation screen's job is letting her catch her own typo, which
           showing exactly what will be stored serves and prettifying defeats.
           ⚠ DRIVEN OFF THE AUTOCOMPLETE TOKEN so no address field can be
           missed and no NON-address field can be caught by accident. Name
           fields are deliberately NOT included - she ruled address. */
        if (/^address-line|^address-level2$/.test(opts.autocomplete)) {
          input.setAttribute('autocapitalize', 'words');
        }
      }
      if (opts.inputmode)    input.setAttribute('inputmode', opts.inputmode);
      if (opts.maxlength)    input.setAttribute('maxlength', opts.maxlength);
    }
    input.id = id;
    input.value = get() || '';
    input.addEventListener('input', function () { set(input.value); S.dirty = true; });
    if (opts.onBlur) input.addEventListener('blur', function () { opts.onBlur(input, wrap); });

    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function note(parent, cls, text) {
    var n = parent.querySelector('.' + cls);
    if (!n) { n = el('div', cls); parent.appendChild(n); }
    n.textContent = text || '';
    n.style.display = text ? '' : 'none';
    return n;
  }


  /* ---- the hidden-field sync --------------------------------------------
     ONE PLACE, ONE MOMENT. Every data-ms-member value the wizard collects is
     written into the ACTIVE FORM immediately before submit. Memberstack reads
     INPUT VALUES at submit and BINDS THE FORM at load, which is exactly why
     these can be injected and the form itself cannot.
     ⚠ THIS IS THE CONSENT GATE. If it does not run, S1's consent route filter
     never matches, no consent_log row is written, AND NOTHING ERRORS. */

  function putHidden(form, key, value) {
    var n = form.querySelector('input[data-ms-member="' + key + '"]');
    if (!n) {
      n = el('input');
      n.type = 'hidden';
      n.setAttribute('data-ms-member', key);
      form.appendChild(n);
    }
    n.value = value == null ? '' : String(value);
  }

  function syncHidden() {
    var f = activeForm();
    var p = plan();
    if (!f || !p) return false;

    putHidden(f, 'first-name', S.first);
    putHidden(f, 'last-name',  S.last);

    putHidden(f, SHIP_FIELDS.line1, S.addr.line1);
    putHidden(f, SHIP_FIELDS.line2, S.addr.line2);
    putHidden(f, SHIP_FIELDS.city,  S.addr.city);
    putHidden(f, SHIP_FIELDS.state, S.addr.state);
    putHidden(f, SHIP_FIELDS.zip,   S.addr.zip);

    var disclosure = p.pack ? COPY.s5.consentPack(p) : COPY.s5.consentTrial(p);

    putHidden(f, 'arl-consented',        S.consent ? 'true' : 'false');
    putHidden(f, 'arl-consented-at',     new Date().toISOString());
    putHidden(f, 'arl-disclosure-text',  disclosure);
    putHidden(f, 'arl-plan-price',       p.price);
    putHidden(f, 'arl-terms-version',    TERMS_VERSION);
    putHidden(f, 'arl-user-agent',       navigator.userAgent || '');
    putHidden(f, 'arl-ip',               S.ip);   /* may be empty. NON-FATAL. */

    /* consent-return.js runs site-wide and writes the row on whatever page she
       lands on after Stripe. THE WIZARD MUST KEEP DOING THIS until that script
       is deliberately retired (§EM 0.1). */
    try {
      sessionStorage.setItem('ks_consent_pending', JSON.stringify({
        consent_type:    CONSENT_TYPE,
        terms_version:   TERMS_VERSION,
        disclosure_text: disclosure,
        plan_id:         p.price,       /* ⚠ ONE-SLOT QUIRK: S1 points BOTH
                                           plan_id and price_id at the single
                                           arl-plan-price field, so plan_id has
                                           been receiving a PRICE ID since the
                                           day it shipped. Carried deliberately.
                                           Fix it on purpose or not at all. */
        price_id:        p.price,
        email:           S.email,
        source:          'signup_wizard',
        ip:              S.ip,
        user_agent:      navigator.userAgent || ''
      }));
    } catch (e) {}

    /* ---- THE END-STATE HANDOFF ------------------------------------------
       A SIBLING OF THE STASH ABOVE, WRITTEN AT THE SAME MOMENT AND FOR THE
       SAME REASON: the wizard cannot survive the Stripe round trip, so
       anything the return page needs has to be left behind here. THIS IS THE
       ONLY MOMENT WE OWN - step 6's submit belongs to Memberstack and there
       is no hook of ours between the code and Stripe.

       ⚠⚠ THIS IS NOT THE sessionStorage THE `S` OBJECT FORBIDS, AND A FUTURE
       SESSION WILL THINK IT IS. The rule at `S` protects the RULED refresh /
       tap-out behaviour MID-WIZARD: a refresh at step 3 must lose her answers,
       deliberately. This writes nothing the wizard reads while it is running.
       It is a one-shot handoff to the page she lands on AFTER she has left.
       Different job, opposite direction. DO NOT CORRECT IT BACK.

       ⚠ THE SLUG, NOT THE COUNT. PLANS is the one place a pack size lives.
       Stashing the number would put a second copy of it in storage and let
       the two drift. */
    try {
      sessionStorage.setItem(END_KEY, JSON.stringify({ plan: p.slug }));
    } catch (e) {}

    return true;
  }


  /* ---- step 3: your details ---------------------------------------------- */

  var COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                        'icloud.com', 'aol.com', 'comcast.net', 'me.com', 'live.com'];

  function editDistance(a, b) {
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      for (j = 0; j <= n; j++) prev[j] = cur[j];
    }
    return prev[n];
  }

  function suggestEmail(v) {
    var at = v.lastIndexOf('@');
    if (at < 1) return null;
    var local = v.slice(0, at), dom = v.slice(at + 1).toLowerCase();
    if (!dom) return null;
    for (var i = 0; i < COMMON_DOMAINS.length; i++) {
      var d = COMMON_DOMAINS[i];
      if (dom === d) return null;                       /* already right */
      if (editDistance(dom, d) <= 2) return local + '@' + d;
    }
    return null;
  }

  function emailLooksValid(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function step3() {
    formSlot.style.display = '';
    mountForm();
    formView('details');
    head(COPY.s3.head, COPY.s3.sub);

    body.appendChild(field(COPY.s3.labelFirst, 'first',
      function () { return S.first; }, function (v) { S.first = v.trim(); },
      { autocomplete: 'given-name' }));

    body.appendChild(field(COPY.s3.labelLast, 'last',
      function () { return S.last; }, function (v) { S.last = v.trim(); },
      { autocomplete: 'family-name' }));

    /* The EMAIL input is the form's own bound field, sitting in the slot below.
       It is never rebuilt and never mirrored. */
    var emailInput = inForm(SEL.email);
    /* ⚠ S64: COPY.s3.labelEmail existed and was never applied, so
       Memberstack's own "Email" was on screen instead of the approved
       "Email address". Approved copy, applied. Not a rewrite. */
    if (emailInput && emailInput.parentNode) {
      var eLab = emailInput.parentNode.querySelector('label');
      if (eLab) eLab.textContent = COPY.s3.labelEmail;
    }
    var hint = el('div', 'ks-wz-hint');
    body.appendChild(hint);

    if (emailInput) {
      emailInput.value = S.email || emailInput.value || '';
      emailInput.oninput = function () { S.email = emailInput.value.trim(); S.dirty = true; };
      emailInput.onblur  = function () {
        clear(hint);
        var v = S.email;
        if (!v) return;
        var sugg = suggestEmail(v);
        if (sugg) {
          var line = el('div', 'ks-wz-nudge');
          var b = el('button', 'ks-wz-nudge-btn', COPY.s3.typoNudge(sugg));
          b.type = 'button';
          b.addEventListener('click', function () {
            S.email = sugg;
            emailInput.value = sugg;
            clear(hint);
            track('email_typo_fixed');
          });
          line.appendChild(b);
          hint.appendChild(line);
          track('email_typo_shown');
        }
        /* ⚠⚠ THE ALREADY-REGISTERED CHECK IS NOT WIRED, ON PURPOSE.
           Memberstack exposes no "does this email exist" call. The only ways to
           find out both SEND AN EMAIL, and #PASSWORDLESS-CODE-DELIVERY is
           already unreliable. The copy exists (COPY.s3.registered) and this is
           where it renders. DO NOT INVENT A MECHANISM THAT BURNS SENDS. */
      };
    }

    paintNav({
      onNext: function () {
        var ok = S.first.trim() && S.last.trim() && emailLooksValid(S.email);
        if (!ok) { note(body, 'ks-wz-err', COPY.errGeneric); return; }
        go(4);
      }
    });
  }


  /* ---- step 4: where should we send it ----------------------------------- */

  function step4() {
    formSlot.style.display = 'none';
    head(S.path === 'shop' ? COPY.s4.headShop : COPY.s4.headSend);

    /* ⚠ GOOGLE PLACES AUTOCOMPLETE MOUNTS ON THIS FIELD when the key exists.
       It sits IN FRONT of the check, never instead of it — autocomplete only
       helps someone who taps the dropdown. RULED. */
    var line1 = field(COPY.s4.labelLine1, 'line1',
      function () { return S.addr.line1; }, function (v) { S.addr.line1 = v; },
      { autocomplete: 'address-line1' });
    line1.querySelector('input').id = 'address-autocomplete';
    body.appendChild(line1);

    body.appendChild(field(COPY.s4.labelLine2, 'line2',
      function () { return S.addr.line2; }, function (v) { S.addr.line2 = v; },
      { autocomplete: 'address-line2' }));
    body.appendChild(field(COPY.s4.labelCity, 'city',
      function () { return S.addr.city; }, function (v) { S.addr.city = v; },
      { autocomplete: 'address-level2' }));
    body.appendChild(field(COPY.s4.labelState, 'state',
      function () { return S.addr.state; }, function (v) { S.addr.state = v; },
      { select: true, autocomplete: 'address-level1' }));
    body.appendChild(field(COPY.s4.labelZip, 'zip',
      function () { return S.addr.zip; }, function (v) { S.addr.zip = v; },
      { inputmode: 'numeric', maxlength: 5, autocomplete: 'postal-code' }));

    var ask = el('div', 'ks-wz-ask');
    body.appendChild(ask);

    paintNav({ onNext: function () { checkAddress(ask); } });
  }

  function addrComplete() {
    var a = S.addr;
    return a.line1.trim() && a.city.trim() && a.state.trim() && a.zip.trim();
  }

  function checkAddress(ask) {
    clear(ask);
    if (!addrComplete()) { note(body, 'ks-wz-err', COPY.s4.errMissing); return; }
    if (!/^[A-Za-z]{2}$/.test(S.addr.state)) { note(body, 'ks-wz-err', COPY.s4.errState); return; }
    note(body, 'ks-wz-err', '');

    if (!lock(nextBtn)) return;

    /* 5-SECOND TIMEOUT, THEN PROCEED. A slow checker must never cost her a
       signup. Anything that is not a clear verdict is treated as unavailable. */
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true; unlock(nextBtn, COPY.nav.next);
      S.addrCode = 'unavailable';
      track('addr_check', { code: 'timeout' });
      go(5);
    }, 5000);

    fetch(ADDR_CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line1: S.addr.line1, line2: S.addr.line2,
        city: S.addr.city, state: S.addr.state, zip: S.addr.zip
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (done) return;
        done = true; clearTimeout(timer); unlock(nextBtn, COPY.nav.next);
        S.addrCode = (j && j.code) || 'unavailable';
        S.addrSugg = (j && j.suggestion) || null;
        track('addr_check', { code: S.addrCode });
        if (S.addrCode === 'ok' || S.addrCode === 'unavailable') { go(5); return; }
        renderAsk(ask);
      })
      .catch(function () {
        if (done) return;
        done = true; clearTimeout(timer); unlock(nextBtn, COPY.nav.next);
        S.addrCode = 'unavailable';
        track('addr_check', { code: 'error' });
        go(5);
      });
  }

  /* NOTHING IS EVER A HARD BLOCK, INCLUDING not_found. A brand new house USPS
     has not catalogued yet would otherwise strand her permanently. She is
     ASKED, and every variant has a way through AND a way back. */
  function renderAsk(ask) {
    clear(ask);
    var v = COPY.s4.ask[S.addrCode];
    if (!v) { go(5); return; }

    ask.appendChild(el('p', 'ks-wz-ask-text', v.text));

    if (S.addrCode === 'corrected' && S.addrSugg) {
      /* SHOW THE WHOLE SUGGESTED ADDRESS, not just the changed word —
         accepting re-derives every field, so showing her one word means
         agreeing to things she never saw. */
      var s = S.addrSugg;
      var lines = [s.line1, s.line2, (s.city || '') + ', ' + (s.state || '') + ' ' + (s.zip || '')];
      var boxS = el('div', 'ks-wz-ask-addr');
      lines.forEach(function (t) { if (t && t.trim() !== ',') boxS.appendChild(el('div', null, t)); });
      ask.appendChild(boxS);
    }

    var row = el('div', 'ks-wz-ask-row');
    var yes = el('button', 'ks-wz-btn ks-wz-btn-primary', v.yes);
    var no  = el('button', 'ks-wz-btn ks-wz-btn-ghost', v.no);
    yes.type = no.type = 'button';

    yes.addEventListener('click', function () {
      if (S.addrCode === 'corrected' && S.addrSugg) {
        /* ⚠⚠ line2 IS NEVER TOUCHED BY A CORRECTION. Shippo cannot see the
           unit and does not return it. ACCEPTING MUST NEVER SILENTLY ERASE
           HER APARTMENT NUMBER. */
        var keep = S.addr.line2;
        S.addr.line1 = S.addrSugg.line1 || S.addr.line1;
        S.addr.city  = S.addrSugg.city  || S.addr.city;
        S.addr.state = S.addrSugg.state || S.addr.state;
        S.addr.zip   = (S.addrSugg.zip || S.addr.zip).slice(0, 5);
        S.addr.line2 = keep;
      }
      track('addr_ask', { code: S.addrCode, choice: 'accept' });
      go(5);
    });

    no.addEventListener('click', function () {
      track('addr_ask', { code: S.addrCode, choice: 'edit' });
      if (S.addrCode === 'corrected') { go(5); return; }   /* keep what she typed */
      clear(ask);                                          /* back to the fields */
    });

    row.appendChild(yes); row.appendChild(no);
    ask.appendChild(row);
  }


  /* ---- step 5: one last look, the disclosure, and Create -----------------
     ⚠⚠ THE PRICE, THE CHECKBOX AND THE CREATE BUTTON STAY ON ONE STEP.
     §17602(a)(1) anchors proximity to the request for consent. Do not split
     them across screens. */

  function step5() {
    formSlot.style.display = '';
    mountForm();
    formView('create');

    var p = plan();
    head(COPY.s5.head);
    body.appendChild(el('p', 'ks-wz-headline', COPY.s5.headline(p)));

    var sum = el('div', 'ks-wz-summary');
    sum.appendChild(sumRow(p.pack ? p.titleTop + ' ' + p.titleSub : p.name,
                           '$' + p.monthly + ' per month'));
    if (p.pack) sum.appendChild(sumRow(p.pack.name, '$' + p.pack.amount + ' once'));
    /* ⚠ RULED S74: one value per row. See .ks-wz-sum-a. */
    sum.appendChild(sumRow(S.first + ' ' + S.last, ''));
    sum.appendChild(sumRow(S.email, ''));
    sum.appendChild(sumRow(addrOneLine(), ''));
    /* ⚠⚠ RULED S69: THE DUE TODAY ROW IS HIDDEN ENTIRELY until the CPA
       rules on taxability. It read as broken with an empty value, and a
       stated total is a promise we may not be able to keep — so show
       NEITHER. COPY.s5.dueTodayLabel is kept in the COPY block so the
       string is ready the moment the number is; this is the only place
       it rendered. Re-add this one line to bring the row back. */
    body.appendChild(sum);

    /* THE GATE. The checkbox and the Create wiring are built together, in one
       function, so that no code means no button. */
    var gate = el('label', 'ks-wz-consent');
    var box  = el('input', 'ks-wz-consent-box');
    box.type = 'checkbox';
    box.checked = S.consent;
    box.addEventListener('change', function () {
      S.consent = box.checked;
      S.dirty = true;
      note(body, 'ks-wz-err', '');
      lockSync();
    });

    var text = el('span', 'ks-wz-consent-text');
    var full = p.pack ? COPY.s5.consentPack(p) : COPY.s5.consentTrial(p);
    var tail = COPY.s5.cancelLink;
    text.appendChild(document.createTextNode(full.slice(0, full.length - tail.length)));
    var a = el('a', 'ks-wz-consent-link', tail);
    a.href = CANCEL_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    text.appendChild(a);

    gate.appendChild(box);
    gate.appendChild(text);
    body.appendChild(gate);

    /* ⚠⚠ S72: THE GENERAL ASSENT LINE. §2 says the "you agree to our Privacy
       Policy and Terms" line is SEPARATE from the ARL checkbox and that BOTH
       must survive the rebuild. It did not — the wizard has never carried it.
       It sits BELOW the affirmed sentence and ABOVE Create, which is in the
       form slot directly beneath this body. */
    var assent = el('p', 'ks-wz-assent');
    assent.appendChild(document.createTextNode(COPY.s5.assent.pre));
    assent.appendChild(legalLink(COPY.s5.assent.privacy, PRIVACY_URL));
    assent.appendChild(document.createTextNode(COPY.s5.assent.mid));
    assent.appendChild(legalLink(COPY.s5.assent.terms, TERMS_URL));
    assent.appendChild(document.createTextNode(COPY.s5.assent.post));
    body.appendChild(assent);

    /* ⚠⚠ APPROVED VERBATIM S74, HERS - she picked this of three. DO NOT
       REDRAFT. It exists because STRIPE'S HOSTED PAGE SAYS '60 days free'
       and that contradicts the sentence she affirms one screen earlier. The
       heading is DERIVED from the price's trial, is in no Stripe setting,
       and everything Stripe does allow is set at Checkout Session creation,
       which MEMBERSTACK owns. So saying it FIRST, here, is the whole fix.
       ⚠⚠ IT SITS OUTSIDE THE ARL SENTENCE. Nothing versioned is touched.
       ⚠ §17602(a)(1) proximity: the price, the checkbox and Create stay on
       one step. This line sits BETWEEN the consent text and Create, so it is
       the only thing separating them - keep it to one line. */
    body.appendChild(el('p', 'ks-wz-preframe', COPY.s5.preframe));

    var sub = inForm(SEL.submit);

    /* ⚠ LOOK ONLY. The block below is the real guard and is untouched. This
       just stops the button painting live while the box is empty. */
    function lockSync() {
      if (!sub) return;
      var base = sub.className.replace(/\s*is-locked/g, '');
      sub.className = S.consent ? base : (base + ' is-locked');
    }
    lockSync();

    paintNav({ hideNext: true });

    if (sub) {
      sub.onclick = function (ev) {
        if (!S.consent) {
          ev.preventDefault();
          note(body, 'ks-wz-err', COPY.s5.errConsent);
          track('consent_blocked');
          return false;
        }
        if (S.busy) { ev.preventDefault(); return false; }
        if (!syncHidden()) { ev.preventDefault(); note(body, 'ks-wz-err', COPY.errGeneric); return false; }
        S.busy = true;
        S.codeSent = true;
        track('create_submit');
        /* Memberstack owns the submit from here: it sends the code and reveals
           its own step-2. We follow it to step 6. */
        setTimeout(function () { S.busy = false; go(6); }, 400);
        return true;
      };
    }
  }

  function legalLink(label, href) {
    var a = el('a', 'ks-wz-assent-link', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function sumRow(a, b) {
    var r = el('div', 'ks-wz-sum-row');
    r.appendChild(el('span', 'ks-wz-sum-a', a));
    r.appendChild(el('span', 'ks-wz-sum-b', b));
    return r;
  }

  function addrOneLine() {
    var a = S.addr;
    return [a.line1, a.line2, a.city, a.state + ' ' + a.zip]
      .filter(function (x) { return x && x.trim(); }).join(', ');
  }


  /* ---- step 6: the six digit code ---------------------------------------- */

  function step6() {
    formSlot.style.display = '';
    mountForm();
    formView('code');
    head(COPY.s6.head, COPY.s6.sub(S.email));

    var cw = inForm(SEL.codeWrap);
    if (cw) {
      var lab = cw.querySelector('label');
      if (lab) lab.textContent = COPY.s6.label;
    }

    var again = el('button', 'ks-wz-link', COPY.s6.resend);
    again.type = 'button';
    var said = el('div', 'ks-wz-hint');
    again.addEventListener('click', function () {
      if (!lock(again)) return;
      track('code_resend');
      try {
        window.$memberstackDom.sendMemberSignupPasswordlessEmail({ email: S.email })
          .then(function () { said.textContent = COPY.s6.resent; })
          .catch(function () { said.textContent = COPY.errGeneric; })
          .then(function () { unlock(again, COPY.s6.resend); });
      } catch (e) {
        said.textContent = COPY.errGeneric;
        unlock(again, COPY.s6.resend);
      }
      /* ⚠⚠ #PASSWORDLESS-CODE-DELIVERY: Memberstack returns success:true for
         codes it does not send. A resolved promise here is NOT evidence that
         an email arrived. STEP 6 SHIPS BUILT, NOT PROVEN. */
    });
    body.appendChild(again);
    body.appendChild(said);

    paintNav({ hideNext: true });   /* Back is gone: the account now exists. */
  }


  /* ---- the end states ---------------------------------------------------
     THESE RENDER AFTER STRIPE, ON THE NEXT LOAD OF /signup, off the END_KEY
     stash written at step 5. resumeEnd() below is the call site.

     ⚠⚠ NOTHING ROUTES HERE YET, AND THAT IS DELIBERATE. Memberstack still
     sends her to /verify-email (§5 REDIRECT CONFIG), so this whole path is
     INERT on the live site. The trigger ships BEFORE the redirect moves,
     never after: a member landing on /signup with no call site would be shown
     step 1 and invited to sign up again, seconds after signing up.

     ⚠⚠⚠ DO NOT MOVE THE REDIRECT UNTIL THE BANK READ SHIPS (§NEXT 2c).
     The stash is written at step 5 - BEFORE the code step and BEFORE payment.
     So a member who reaches step 5 and abandons at step 6 has a stash sitting
     in her tab, and once /signup is the post-Stripe destination she can be
     told she is in without having paid. THE BANK READ IS WHAT CLOSES THAT,
     AND IT CLOSES IT STRUCTURALLY: no confirmed code means no member session,
     no token, no answer from member-state, and nothing for this screen to
     say. A timestamp or an expiry does NOT close it. */

  function endState(kind, p) {
    var c = (kind === 'pack') ? COPY.endB : COPY.endA;
    clear(body);
    formSlot.style.display = 'none';
    /* ⚠⚠ HIDE THE TOP BAR, NOT THE DOTS. This line read dots.style.display
       until S77. It was written in S63 when BACK LIVED INSIDE nav, so hiding
       nav took Back with it. S74 MOVED BACK OUT OF nav INTO THE TOP BAR
       beside the dots - correct for every path that runs through paintNav,
       and this is the one path that does not. Back then survived onto the
       completion screen as a dead pill, and the top bar being
       justify-content:space-between with its only visible child left put it
       at the LEFT edge, which is exactly what it looked like.
       ⚠ NOBODY COULD HAVE SEEN THIS UNTIL NOW - the end screen had never
       rendered once in four sessions. Found S77 on its first ever paint.
       ⚠ Hiding the bar also takes its 28px bottom margin, which closes the
       gap that sat above the headline. DO NOT GO BACK TO HIDING THE DOTS. */
    topbar.style.display = 'none';
    nav.style.display = 'none';
    body.appendChild(el('h2', 'ks-wz-h', c.head));
    body.appendChild(el('p', 'ks-wz-body-text',
      typeof c.body === 'function' ? c.body(p) : c.body));
    var a = el('a', 'ks-wz-btn ks-wz-btn-primary', c.cta);
    a.href = c.href;
    body.appendChild(a);
    track('end_state', { kind: kind });
  }


  /* THE CALL SITE. Returns true when it has painted, so boot() knows not to
     render a step on top of it. */

  function resumeEnd() {
    var raw, p;
    try { raw = sessionStorage.getItem(END_KEY); } catch (e) { return false; }
    if (!raw) return false;

    try { p = PLANS[(JSON.parse(raw) || {}).plan]; } catch (e) { return false; }
    if (!p) return false;   /* unknown or stale slug: fall through to the
                               wizard rather than paint a screen with a hole
                               in it. */

    /* ⚠ THE KEY IS NOT CLEARED, ON PURPOSE. Clearing on read means a refresh
       of the end screen drops her onto STEP 1 of a wizard she has just
       finished - the exact failure the build order exists to avoid. The stash
       dies with the tab, which is the right lifetime. DO NOT ADD removeItem. */

    /* ⚠ THE STATE OBJECT IS SET BEFORE PAINTING SO THE EVENT CARRIES THE
       PLAN. resumeEnd paints straight from the stash and never runs through
       the wizard, so without these two lines end_state fires with plan:null
       and path:null - the single most valuable event in the flow, unable to
       say which plan converted. §2 rules one event per step from day one
       because this cannot be reconstructed later. Found S77 by reading a
       real payload. CLAUDE'S CALL, REVERSIBLE - not a ruling of hers. */
    S.plan = p.slug;
    S.path = p.path;

    endState(p.pack ? 'pack' : 'plan', p);
    return true;
  }


  /* =========================================================================
     CSS  —  SELF-INJECTED, same discipline as closet-tool.js / browse-tool.js.
     The whole surface is ONE VERSIONED ARTIFACT and a rollback is a pin bump.
     There is NO Webflow custom-code box for this and there must not be.

     ⚠ ZERO NEW HEXES. Every colour below is one of the eight brand values or
     one of the three surface values.
       ink #1E1A19 · coral #E54F25 · green #309359 · blue #28498D
       cream #EEEFE3 · muted #75736E · paper #FFFFFF
       line #C9C7BC (ghost border + card shadow)
     ⚠ NO OPACITY FOR COLOUR. Every grey is a solid hex. Opacity for motion is
     fine (the card's entrance).
     ⚠ S64 RULING: the lightened corals #F7E4D9 and #F0C9B5 and the old page
     base #F2F1EB are GONE. Selection is full coral, every tint is cream.
     Do not reintroduce a lightened brand colour.
     ⚠ QUICKSAND EVERYWHERE EXCEPT .ks-wz-h, which is Instrument Serif at
     weight 400. S64: the serif had been arriving BY ACCIDENT from Webflow's
     h2 styling, at weight 600 the browser was faking. Now it is deliberate.
     ⚠ 16px MINIMUM ON EVERY INPUT or Safari zooms in and does not zoom back.
     ====================================================================== */

  function ensureCss() {
    if (document.getElementById('ks-wz-css')) return;
    var s = document.createElement('style');
    s.id = 'ks-wz-css';
    s.textContent = [
      '#' + MOUNT_ID + '{font-family:Quicksand,system-ui,-apple-system,sans-serif;}',

      /* ---- overlay + card ---- */
      /* S71: IN THE PAGE FLOW, NOT AN OVERLAY. Ruled by Jennie: the global
         header and footer STAY on /signup and the wizard sits centred between
         them. Until S71 this was position:fixed with an opaque cream sheet at
         z-index 9000, which had been covering the global header since the file
         shipped. Do not restore the overlay. */
      /* S72: box-sizing is LOAD-BEARING for the fold. foldFit() sets
         min-height to card + padding, which is a BORDER-box figure. Under
         content-box the same number would add the padding a second time and
         the section would sit one padding too tall. */
      '.ks-wz{position:static;background:transparent;box-sizing:border-box;',
        'display:flex;align-items:center;justify-content:center;',
        'padding:64px 16px;}',

      /* S71: the six Memberstack form-blocks live in the page flow. mountForm()
         hides them, but only once a form is needed, so on step 1 they would all
         be visible under the wizard. Hidden structurally here instead. The
         chosen form ESCAPES this selector when it is moved into .ks-wz-formslot,
         because it is no longer a child of the mount. */
      '#' + MOUNT_ID + ' > .w-form{display:none;}',
      '.ks-wz-card{position:relative;width:100%;max-width:560px;background:#FFFFFF;',
        'border:1px solid #EEEFE3;border-radius:18px;padding:32px 28px 26px;',
        'box-shadow:0 10px 30px -12px #C9C7BC;',
        'animation:ks-wz-in 240ms ease-out both;}',
      '@keyframes ks-wz-in{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '@media (prefers-reduced-motion:reduce){.ks-wz-card{animation:none}}',
      /* S71: no min-height:100vh. In the flow that made a full-screen card sit
         inside the page; the card is content-height now and keeps its border,
         radius and shadow at every width. */
      '@media (max-width:600px){.ks-wz{padding:28px 12px 40px;}',
        '.ks-wz-card{max-width:none;padding:26px 20px 32px;}',
        '.ks-wz-h{font-size:35px;}}',

      /* ---- progress ---- */
      '.ks-wz-dots{display:flex;gap:6px;margin:6px 0 28px;}',
      '.ks-wz-dot{width:26px;height:3px;border-radius:2px;background:#EEEFE3;}',
      '.ks-wz-dot.is-done{background:#E54F25;}',
      '.ks-wz-dot.is-on{background:#E54F25;}',

      /* ---- type ---- */
      '.ks-wz-h{font-family:"Instrument Serif",Georgia,serif;font-size:41px;',
        'font-weight:400;color:#1E1A19;margin:0 0 12px;line-height:1.15;}',
      '.ks-wz-sub{font-size:15px;color:#75736E;margin:0 0 28px;line-height:1.5;}',
      /* Two stacked subs on shop-first: the first sits tight above the second. */
      '.ks-wz-sub--lead{margin-bottom:6px;}',
      '.ks-wz-headline{font-size:16px;font-weight:600;color:#1E1A19;margin:0 0 16px;}',
      /* The step 5 pre-frame line. Secondary weight and muted grey: it is
         context for the NEXT screen, and it must not compete with the ARL
         sentence above it, which is the one she actually agrees to. */
      '.ks-wz-preframe{font-size:13px;color:#75736E;line-height:1.5;margin:14px 0 0;}',
      '.ks-wz-body-text{font-size:16px;color:#1E1A19;line-height:1.6;margin:0 0 22px;}',

      /* ---- the fork (step 1) ---- */
      '.ks-wz-forks{display:flex;flex-direction:column;gap:12px;}',
      '.ks-wz-fork{display:block;width:100%;text-align:left;cursor:pointer;',
        'border:0;border-radius:14px;padding:18px 18px;',
        'font-family:inherit;position:relative;}',
      /* ⚠⚠ RULED S69. THE FORK CARDS ARE FILLED WITH PINK — THE RESERVED
         ACCENT, NOW PLACED. Both forks share pink because it brands them as
         the two ways in, not two packages; the words tell them apart, not
         colour. Pink #F491A9 is light, so text is ink. Package colours
         (blue/green/yellow) stay OFF the forks so a fork never implies a
         plan, and coral stays off because it is the CTA colour. Selection is
         the SAME ink-ring + check language as the plan cards, so the whole
         wizard teaches ONE selection signal. Resting border is 2px
         transparent (above) so the ring never resizes the box on tap. */
      /* RULED S69: the two forks take DIFFERENT colours so they stop reading
         as twins. S70 HER RULING: Send = CORAL #E54F25 (white text), Shop =
         blue #28498D (white text). Pink #F491A9 is UNUSED again - it was
         'the reserved accent, placed' and it is unplaced once more. Borders
         removed; selection is the check + dim, same as the plan cards. */
      '.ks-wz-fork--send{background:#E54F25;color:#FFFFFF;}',
      '.ks-wz-fork--shop{background:#28498D;color:#FFFFFF;}',
      '.ks-wz-forks.has-pick .ks-wz-fork:not(.is-on){opacity:.5;}',
      '.ks-wz-fork-t{display:block;font-size:17px;font-weight:600;color:inherit;margin-bottom:4px;}',
      '.ks-wz-fork-s{display:block;font-size:14px;font-weight:500;color:inherit;opacity:.82;line-height:1.45;}',
      /* the drawn check, inheriting ink so it matches the fork text */
      '.ks-wz-fork-check{display:none;position:absolute;right:16px;bottom:16px;width:15px;height:15px;}',
      '.ks-wz-fork.is-on .ks-wz-fork-check{display:block;}',
      '.ks-wz-fork-check::after{content:"";position:absolute;left:5px;top:0;',
        'width:5px;height:11px;border:solid currentColor;border-width:0 2px 2px 0;',
        'transform:rotate(45deg);}',

      /* ---- plan cards (step 2) ---- */
      '.ks-wz-plans{display:flex;flex-direction:column;gap:12px;}',
      /* NO overflow:hidden ON THIS RULE. It clipped the floating
         'Best of both' badge (top:-11px) dead along the card's top edge:
         11px of a 28px pill, measured live S70. The --both sheen pseudos
         now round themselves with border-radius:inherit, which is the only
         job the clip was doing. DO NOT RESTORE IT. */
      '.ks-wz-plan{display:block;width:100%;text-align:left;cursor:pointer;',
        'border:0;border-radius:14px;',
        'padding:16px 18px;',
        'font-family:inherit;position:relative;',
        'transition:transform .15s ease,box-shadow .15s ease;}',
      /* S70 HER RULING: a subtle hover on all four plan cards. Gated on
         (hover:hover) so it can NEVER stick on a phone, and cancelled
         under prefers-reduced-motion. Depth only, no colour change, so
         it cannot fight the card fills or the has-pick dimming. */
      '@media (hover:hover){',
        '.ks-wz-plan:hover{transform:translateY(-2px);',
          'box-shadow:0 6px 16px rgba(30,26,25,.16);}',
        '.ks-wz-plan--both:hover{box-shadow:0 10px 26px rgba(30,26,25,.28);}}',
      '@media (prefers-reduced-motion:reduce){.ks-wz-plan{transition:none}}',
      /* ⚠⚠ RULED S69. COLOUR IS PACKAGE IDENTITY, NOT what-is-in-the-bag.
         The whole card is filled with its package colour and a member learns
         it once. Packages use BLUE / GREEN / YELLOW only; CORAL/RED IS HELD
         FOR THE CTAs (Continue, Create) AND NEVER APPEARS ON A CARD; PINK is
         reserved as an accent, not yet placed. This SUPERSEDES S68 Option B
         (cream selected card, white unselected) and the S69 8px left rule —
         both are gone. Text flips per fill for contrast: ink on the light
         yellow, white on the darker green and blue. Everything Bag is the
         only two-class plan, so its fill is the blue+green split. */
      /* ⚠⚠ RULED S69 (revised): COLOUR = WHAT IS IN THE BAG, not package.
         Clothing YELLOW, toys GREEN. So BOTH clothing plans (Basics, Full
         Wardrobe) are yellow — told apart by name and price, not colour —
         and the Everything Bag is the yellow+green split because it is both.
         This freed BLUE, which now joins pink on the fork step. Approved
         hexes only; the earlier #3A2905 / plum text were INVENTED and are
         corrected to ink #1E1A19 here. */
      /* ⚠⚠ RULED S74, HERS: ALL THREE GOLDS BECOME ONE GOLD - the Full
         Wardrobe gradient. She did not like Basics and Full Wardrobe sitting
         side by side in two slightly different golds. THIS RETIRES #EDA920 AS
         A PLAN-CARD FILL. It stays a brand colour; it is just not a card any
         more. NO NEW HEXES - these are the same three she okayed in S69.
         ⚠ --clothing AND --gold ARE ONE RULE ON PURPOSE, so the gold gradient
         string exists in one place here rather than two that can drift. The
         JS still adds ks-wz-plan--gold to the Full Wardrobe card (planCard);
         left alone deliberately, so the seam survives if they are ever split
         again. THE OTHER COPY OF THIS GRADIENT IS THE EVERYTHING BAG'S
         background-image. Change one, change both.
         ⚠ The shop-first Basics pack card is cls:'clothing', so it follows
         this rule for free. Both clothing cards change together. */
      '.ks-wz-plan--clothing,.ks-wz-plan--gold{',
        'background:linear-gradient(160deg,#F7DE8A 0%,#E0B838 40%,#A67C0A 100%);',
        'color:#1E1A19;}',
   /* ⚠⚠ RULED S73, HERS: ANY GREEN BACKGROUND TAKES WHITE TEXT. The S69
         green could not carry it — white measured 1.80 / 2.74 / 3.86 against
         its stops #8AD0A6 / #4FAE7A / #309359, failing AA at every one, which
         is exactly why S69 flipped this card to ink. SO THE GREEN GOT DARKER
         RATHER THAN THE TEXT GOING WHITE ON THE OLD GREEN: white now reads
         4.95 / 6.12 / 7.94, AA at every stop. Her own words are the reason
         this shape works — white renders great "as long as it is over the
         darker shade of the green gradient."
         ⚠ THREE NEW HEXES, ADDED WITH HER OKAY, exactly as the Full Wardrobe
         golds were: #2A7F4C #256F43 #1F5C38. Brand green #309359 tops out at
         3.86 against white and STRUCTURALLY CANNOT carry white body text, so
         there was no way to do this inside the existing eight.
         ⚠⚠ THIS NO LONGER MATCHES THE EVERYTHING BAG'S GREEN ::before AND
         THAT IS DELIBERATE. Do not resync them; see the --both block. */
      '.ks-wz-plan--toy{background:linear-gradient(160deg,#2A7F4C 0%,#256F43 40%,#1F5C38 100%);color:#FFFFFF;}',
      /* ⚠ EVERYTHING BAG TEXT IS INK, not white: white on the yellow half
         fails contrast, ink on the yellow half is perfect and on green is
         acceptable for large/bold text. Ink is the least-bad single choice
         for a two-colour fill. Watch this one on the render. */
      /* ⚠⚠ RULED S69, AND STILL THE REASON THIS GRADIENT EXISTS AT ALL: gold
         reads as GOLD only as a light-to-dark sheen. A flat gold always reads
         as yellow on screen, which is why reaching for a different flat hex
         will not fix it. Her pick, and the three hexes #F7DE8A #E0B838
         #A67C0A were added with her explicit okay. Ink passes AA-normal even
         at the dark end #A67C0A (4.53).
         ⚠ THE --gold RULE ITSELF MOVED UP (S74) and now shares one
         declaration with --clothing. THERE IS NO SEPARATE --gold RULE ANY
         MORE. Do not re-add one. */
      /* ⚠⚠ RULED S74, HERS, AND IT SUPERSEDES THE ENTIRE S69/S73 SPLIT-CARD
         MODEL: THE EVERYTHING BAG IS A GOLD CARD WITH A SHORT DARK-GREEN BAND
         ACROSS THE TOP. Not a left/right split. ALL TEXT SITS ON GOLD, IN INK,
         AND NOTHING CROSSES A FILL BOUNDARY - which is the whole point of the
         shape, not a side effect of it.
         ⚠⚠ THIS KILLS THE OLD 'THE EVERYTHING BAG IS THE ONE EXCLUSION / DO
         NOT RESYNC THE GREENS' RULE. That exclusion existed ONLY because text
         spanned both fills, so darkening the green would have wrecked the ink
         lines running onto the gold. Nothing spans anything now, so BOTH
         GREENS ARE THE SAME DARK GRADIENT as --toy and are meant to stay so.
         ⚠⚠ WHY THE PROPORTION IS RIGHT, so it is not re-opened as taste: the
         plan is TEN clothing swaps against THREE toy ones. The set now reads
         no green = no toys · all green = only toys · a band of green = some
         toys. The amount of green is the amount of toy. A half-and-half card
         always overstated the toy side.
         ⚠ TWO BACKGROUND LAYERS ON THE ELEMENT ITSELF, NOT PSEUDOS. The old
         ::before / ::after split layers are GONE. background-repeat:no-repeat
         IS LOAD-BEARING - the band layer is sized 100% 34px, so without it the
         band tiles all the way down the card.
         ⚠ isolation:isolate STAYS even though the -z pseudos are gone. The
         shine sits at z-index 2 and the badge at 3, and the card only makes
         its own stacking context on hover (transform); isolate is what keeps
         that consistent at rest.
         ⚠⚠ THE GOLD MUST MATCH .ks-wz-plan--clothing EXACTLY AND THE GREEN
         MUST MATCH .ks-wz-plan--toy EXACTLY. Two copies of each gradient live
         in this file and this is one of them. Change one, change both. */
      '.ks-wz-plan--both{color:#1E1A19;isolation:isolate;',
        'background-image:linear-gradient(160deg,#2A7F4C 0%,#256F43 40%,#1F5C38 100%),',
          'linear-gradient(160deg,#F7DE8A 0%,#E0B838 40%,#A67C0A 100%);',
        'background-size:100% 34px,100% 100%;',
        'background-position:left top,left top;',
        'background-repeat:no-repeat;}',
      /* ⚠⚠ THE WHITE PRICE IS GONE, S74, AND THIS OVERTURNS A RULING SHE
         MADE TWICE. White was RIGHT while the price sat on the green half
         (S69, re-confirmed S73). The price now sits on GOLD, where white
         measures 1.33 / 1.89 / 3.81 and fails at every stop; ink reads
         12.96 / 9.11 / 4.53 and passes throughout. So the price inherits ink
         like every other line on this card. DO NOT RESTORE THE WHITE - it
         would reinstate a ruling whose reason the card no longer has. */
      /* RULED S69: recommended-tier emphasis. S70 HER RULING: the extra top
         separation is REMOVED so all four cards sit an equal 12px apart and
         the shadow alone carries the emphasis. The rgbas in this file are
         functional depth or tint only, never a brand colour. */
      /* ⚠ 62px, NOT S70's 52px: the band is 34px and the enlarged badge
         reaches ~49px down the card. This is the clearance for both. */
      '.ks-wz-plan--both{padding-top:62px;',
        'box-shadow:0 6px 18px rgba(30,26,25,.22);}',
      /* S70 HER RULING: the Everything Bag title is bigger. Weight stays
         600 - the standing type rule caps Quicksand at 600 and 700 would
         risk faux-bold. The size step is doing the work. */
      '.ks-wz-plan--both .ks-wz-plan-title-a{font-size:21px;}',
      /* ⚠ RULED S69: BORDERS REMOVED. Selection is the drawn check plus
         the dimming of the others — no ring, no outline. With no border in
         any state the box never resizes on tap, so no-jump holds for free. */
      '.ks-wz-plans.has-pick .ks-wz-plan:not(.is-on){opacity:.5;}',
      /* The check is DRAWN, not a glyph, and inherits the card's text colour
         so it is ink on yellow and white on green/blue. */
      '.ks-wz-plan-check{display:none;position:absolute;right:16px;bottom:14px;',
        'width:15px;height:15px;}',
      '.ks-wz-plan.is-on .ks-wz-plan-check{display:block;}',
      '.ks-wz-plan-check::after{content:"";position:absolute;left:5px;top:0;',
        'width:5px;height:11px;border:solid currentColor;border-width:0 2px 2px 0;',
        'transform:rotate(45deg);}',
      '.ks-wz-plan-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}',
      '.ks-wz-plan-title-a{display:block;font-size:17px;font-weight:600;color:inherit;}',
      '.ks-wz-plan-title-b{display:block;font-size:14px;font-weight:500;color:inherit;',
        'opacity:.82;margin-top:2px;}',
      /* price sits TOP RIGHT on every card, no exceptions */
      '.ks-wz-plan-price{flex:0 0 auto;font-size:14px;font-weight:600;color:inherit;',
        'text-align:right;white-space:nowrap;}',
      '.ks-wz-plan-lines{margin-top:10px;padding-right:26px;}',
      /* ⚠⚠ RULED S74: the badge is ENLARGED and STRADDLES THE JOIN between
         the green band and the gold - half on each. THIS IS NOT THE S70 BUG
         COMING BACK. S70's clipping was the badge against the CARD'S OUTER
         EDGE under overflow:hidden, and that clip is gone and stays gone (see
         .ks-wz-plans). THIS join is INSIDE the card, so there is nothing there
         that can clip it. Same-looking picture, different problem.
         ⚠ THE BAND IS 34px AND THE BADGE SITS AT top:19px. Those two numbers
         are what makes it straddle. Move one and re-check the other.
         ⚠ left:18px keeps it flush with the card's own left padding and with
         the title beneath it (the S70 alignment, kept).
         ⚠ ONLY THE EVERYTHING BAG EVER RENDERS A BADGE - planCard appends it
         for the 'everything' slug only - so this rule is left unscoped. A
         second badged card would inherit this size. */
      '.ks-wz-plan-badge{position:absolute;top:19px;left:18px;z-index:3;',
        'background:#E54F25;color:#EEEFE3;font-size:13px;font-weight:600;',
        'letter-spacing:.04em;padding:7px 17px;border-radius:999px;',
        'box-shadow:0 2px 6px rgba(30,26,25,.18);}',
      /* S70 HER RULING: the Everything Bag catches the light when it is
         hovered on desktop or picked on a phone. pointer-events:none so it
         can never eat a tap; ONE pass, never a loop; gone entirely under
         prefers-reduced-motion. The badge sits at z-index 3, above it. */
      '.ks-wz-plan-shine{position:absolute;inset:0;border-radius:inherit;',
        'overflow:hidden;pointer-events:none;z-index:2;}',
      '.ks-wz-plan-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;',
        'width:38%;left:-60%;transform:skewX(-14deg);',
        'background:linear-gradient(100deg,rgba(255,255,255,0) 0%,',
          'rgba(255,255,255,.42) 50%,rgba(255,255,255,0) 100%);}',
      '@keyframes ks-wz-shine{from{left:-60%}to{left:130%}}',
      '.ks-wz-plan--both.is-on .ks-wz-plan-shine::after{animation:ks-wz-shine .9s ease-out 1;}',
      '@media (hover:hover){',
        '.ks-wz-plan--both:hover .ks-wz-plan-shine::after{animation:ks-wz-shine .9s ease-out 1;}}',
      '@media (prefers-reduced-motion:reduce){.ks-wz-plan-shine{display:none}}',
      '.ks-wz-plan-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}',
      '.ks-wz-plan-credits{font-size:15px;font-weight:600;color:inherit;}',
      '.ks-wz-plan-once{font-size:14px;font-weight:500;color:inherit;opacity:.85;white-space:nowrap;}',
      '.ks-wz-plan-swaps{font-size:14px;font-weight:500;color:inherit;margin-top:4px;}',
      /* ⚠ RULED S69: value becomes a CREAM chip (approved #EEEFE3, ink
         text) so it reads on every card colour. Copy UNCHANGED ('Up to
         $X value') per her locked-copy rule — dropping 'Up to' is a copy
         decision, not built. */
   '.ks-wz-plan-value{display:inline-block;font-size:12px;font-weight:600;color:#1E1A19;',
        'background:rgba(30,26,25,.13);padding:3px 9px;border-radius:999px;margin-top:8px;}',
      /* ⚠⚠ S73: THE CHIP HARDCODES INK AND DOES NOT INHERIT, so the darkened
         green card would have kept BLACK TEXT ON A DARK TINT — unreadable,
         and invisible to anyone auditing only the card's own color rule. On
         green it flips to white on a light tint. The rgba is a tint of the
         fill underneath, which is one of the three jobs rgba is allowed. */
      '.ks-wz-plan--toy .ks-wz-plan-value{color:#FFFFFF;background:rgba(255,255,255,.18);}',

      /* ⚠ RULED S69: benefits FRAME the choice up top — no filled box,
         a divider under them, text larger (15px) and bolder (600).
         S70 HER OVERRIDE: the heading and the checks are now CORAL
         #E54F25. That reverses the S69 'coral is held for the CTAs and
         never appears elsewhere' rule - coral now does two jobs on this
         screen. Green still means only toys, which was the real point of
         moving the checks off green in the first place. */
      '.ks-wz-includes{margin:20px 0 0;padding:18px 0 0;border-top:1px solid #C9C7BC;}',
      '.ks-wz-includes-h{font-size:13px;font-weight:600;color:#E54F25;',
        'text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;}',
      '.ks-wz-includes-list{list-style:none;margin:0;padding:0;}',
      '.ks-wz-includes-list li{position:relative;padding-left:26px;font-size:15px;',
        'font-weight:600;color:#1E1A19;line-height:1.5;margin-bottom:9px;}',
      '.ks-wz-includes-list li:last-child{margin-bottom:0;}',
      '.ks-wz-includes-list li::before{content:"";position:absolute;left:3px;top:6px;',
        'width:11px;height:6px;border-left:2.5px solid #E54F25;border-bottom:2.5px solid #E54F25;',
        'transform:rotate(-45deg);}',

      /* ---- fields ---- */
      '.ks-wz-field{margin-bottom:14px;}',
      '.ks-wz-label{display:block;font-size:13px;font-weight:600;color:#1E1A19;margin-bottom:5px;}',
      '.ks-wz-input{display:block;width:100%;box-sizing:border-box;font-family:inherit;',
        'font-size:16px;color:#1E1A19;background:#FFFFFF;border:1px solid #EEEFE3;',
        'border-radius:10px;padding:12px 12px;}',
      '.ks-wz-input:focus{outline:none;border-color:#E54F25;}',
      '.ks-wz-hint{margin:-4px 0 12px;}',
      '.ks-wz-nudge-btn{background:none;border:0;padding:0;cursor:pointer;font-family:inherit;',
        'font-size:14px;font-weight:600;color:#28498D;text-decoration:underline;}',
      '.ks-wz-err{font-size:14px;color:#1E1A19;font-weight:600;margin:10px 0 0;}',
      '.ks-wz-link{background:none;border:0;padding:0;cursor:pointer;font-family:inherit;',
        'font-size:14px;font-weight:600;color:#1E1A19;text-decoration:underline;margin-top:14px;}',

      /* the form's own three elements, inherited from Webflow, normalised */
      '.ks-wz-formslot .w-form{margin:0;}',
      '.ks-wz-formslot label{display:block;font-size:13px;font-weight:600;color:#1E1A19;',
        'margin-bottom:5px;font-family:inherit;}',
      '.ks-wz-formslot input[type="text"],.ks-wz-formslot input[type="email"]{',
        'display:block;width:100%;box-sizing:border-box;height:auto;font-family:inherit;',
        'font-size:16px;color:#1E1A19;background:#FFFFFF;border:1px solid #EEEFE3;',
        'border-radius:10px;padding:12px 12px;margin-bottom:14px;}',
      '.ks-wz-formslot input[type="text"]:focus,.ks-wz-formslot input[type="email"]:focus{',
        'outline:none;border-color:#E54F25;}',
      '.ks-wz-formslot input[type="submit"]{display:block;width:100%;cursor:pointer;',
        'font-family:inherit;font-size:16px;font-weight:600;color:#EEEFE3;background:#E54F25;',
        'border:1px solid #E54F25;border-radius:999px;padding:14px 20px;margin-top:18px;}',
      /* ⚠ S64: the consent guard was always correct; the button just PAINTED
         live because nothing styled a locked form submit. Look only. */
      '.ks-wz-formslot input[type="submit"].is-locked{background:#EEEFE3;',
        'border-color:#EEEFE3;color:#75736E;cursor:default;}',
      /* ⚠ S64: Memberstack's own component copy rode in with the form-move —
         an H1, an intro P and a field disclaimer, baked into all six forms in
         Webflow at S62. Hidden here so the Designer stays untouched. */
      '.ks-wz-formslot form h1,.ks-wz-formslot form h2,.ks-wz-formslot form h3,',
        '.ks-wz-formslot form p{display:none !important;}',
      /* S69: Memberstack's field disclaimer ("We'll email you a code to
         safely sign up.") is a DIV.disclaimer, so the h1/h2/h3/p rule
         above never caught it. READ LIVE off all six forms first: one
         .disclaimer per form, identical shape, nothing else inside a
         moved form wears the class. SCOPED — this is NOT a widening of
         the deliberately broad rule above. */
      '.ks-wz-formslot form .disclaimer{display:none !important;}',

      /* ---- the address question ---- */
      '.ks-wz-ask{margin-top:16px;}',
      '.ks-wz-ask-text{font-size:15px;color:#1E1A19;line-height:1.5;margin:0 0 12px;}',
      '.ks-wz-ask-addr{background:#EEEFE3;border-radius:10px;padding:12px 14px;',
        'font-size:15px;color:#1E1A19;line-height:1.5;margin-bottom:12px;}',
      '.ks-wz-ask-row{display:flex;gap:10px;flex-wrap:wrap;}',

      /* ---- step 5 ---- */
      '.ks-wz-summary{background:#EEEFE3;border-radius:14px;padding:18px 18px;margin-bottom:28px;}',
      '.ks-wz-sum-row{display:flex;justify-content:space-between;gap:12px;',
        'font-size:14px;color:#1E1A19;padding:6px 0;line-height:1.45;}',
      '.ks-wz-sum-row+.ks-wz-sum-row{border-top:1px solid #FFFFFF;}',
      '.ks-wz-sum-b{color:#75736E;text-align:right;white-space:nowrap;}',
      '.ks-wz-consent{display:flex;gap:10px;align-items:flex-start;cursor:pointer;',
        'background:#EEEFE3;border:1px solid #EEEFE3;border-left:3px solid #E54F25;',
        'border-radius:14px;padding:18px 18px;}',
      '.ks-wz-consent-box{flex:0 0 auto;width:18px;height:18px;margin:2px 0 0;',
        'accent-color:#309359;cursor:pointer;}',
      '.ks-wz-consent-text{font-size:15px;color:#1E1A19;line-height:1.55;}',
      /* ⚠⚠ RULED S74, HERS: BOLD, NO UNDERLINE. Nothing in ARL requires an
         underline, and weight is a NON-COLOUR cue, so this still satisfies
         the accessibility rule against signalling a link with colour alone.
         The surrounding .ks-wz-consent-text sets no weight, so 600 here is a
         real contrast against it. THE WORDS DO NOT CHANGE - NO TERMS_VERSION
         BUMP. ⚠ 600 is the cap on purpose: Quicksand faux-bolds above it. */
      '.ks-wz-consent-link{color:#1E1A19;font-weight:600;text-decoration:none;}',

      /* S72: the assent line is genuinely secondary text and takes NO
         meaning-bearing colour — muted grey only. Under the affirmed ARL
         sentence, which stays 15px ink because it is the one she agrees to. */
      '.ks-wz-assent{margin:14px 0 0;font-size:13px;line-height:1.55;color:#75736E;}',
      '.ks-wz-assent-link{color:#75736E;text-decoration:underline;}',

      /* ---- nav + buttons ---- */
      '.ks-wz-nav{display:flex;gap:10px;align-items:center;margin-top:28px;}',
      /* ⚠⚠ RULED S74, HERS: BACK MOVES TO THE TOP RIGHT, beside the progress
         dots. It is no longer in the bottom nav row with Continue.
         ⚠ THE STEPS 2-5 / GONE AT 6 RULE IS UNTOUCHED. paintNav still owns
         backBtn.style.display and that line did not change - the button only
         moved house. Do not re-implement the hide rule up here.
         ⚠ The dots' old bottom margin moved onto this row, so the spacing
         under the header is unchanged. */
      '.ks-wz-top{display:flex;align-items:center;justify-content:space-between;',
        'gap:12px;margin:6px 0 28px;}',
      '.ks-wz-top .ks-wz-dots{margin:0;}',
      '.ks-wz-top .ks-wz-btn{padding:7px 14px;font-size:14px;flex:0 0 auto;}',
      /* ⚠ RULED S74: the name and the email STOP SHARING A ROW - the name
         wrapped to two lines beside the email and read as broken. They are
         now one value per row, which is the shape the address row already
         used. overflow-wrap lets a long email break rather than overflow. */
      '.ks-wz-sum-a{min-width:0;overflow-wrap:anywhere;}',
      /* ⚠ RULED S74: step 6 gets intentional styling. The code field is
         MEMBERSTACK'S OWN INPUT inside the moved form, reached through the
         same seam the script uses (SEL.codeWrap). This is the ONE change in
         this commit that is a proposal rather than a ruling - look at it.
         ⚠ It is CSS only. Nothing about the binding is touched. */
      '.ks-wz-formslot [data-ms-passwordless="step-2"] input{',
        'font-size:24px;font-weight:600;letter-spacing:.32em;text-align:center;',
        'font-family:inherit;color:#1E1A19;}',
      '.ks-wz-btn{font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;',
        'border-radius:999px;padding:13px 22px;border:1px solid transparent;}',
      '.ks-wz-btn-primary{background:#E54F25;border-color:#E54F25;color:#FFFFFF;',
        'margin-left:auto;text-decoration:none;display:inline-block;text-align:center;',
        'transition:transform .15s ease,box-shadow .15s ease;}',
      /* S70 HER RULING: white text and a hover on the primary button. The
         hover is gated on :not([disabled]) so the LIVE button answers and
         the dead one does not - on desktop that is the only cue a member
         gets that a plan is still needed. Depth only, NO darker coral: a
         hover hex would be an invented colour. */
      '@media (hover:hover){',
        '.ks-wz-btn-primary:not([disabled]):hover{transform:translateY(-1px);',
          'box-shadow:0 5px 14px rgba(229,79,37,.34);}}',
      /* S70 HER RULING: the primary button keeps full coral even when
         disabled. WARNING, NOT A DEFECT: it now LOOKS tappable while
         nothing is picked. The disabled attribute is still set, so a tap
         does nothing at all. */
      '.ks-wz-btn-primary[disabled]{cursor:default;}',
      '.ks-wz-btn-ghost{background:transparent;border-color:#C9C7BC;color:#1E1A19;}',
      '.ks-wz-btn-quiet{background:transparent;border-color:transparent;color:#75736E;}',

      /* S71: the tap-out confirm CSS was deleted with its markup. An inert rule
         sitting beside working ones is the CSS version of a comment that lies. */

      /* ---- focus, everywhere, visible ---- */
      '#' + MOUNT_ID + ' :focus-visible{outline:2px solid #28498D;outline-offset:2px;}'
    ].join('');
    document.head.appendChild(s);
  }


  /* =========================================================================
     BOOT
     ====================================================================== */

  function boot() {
    root = document.getElementById(MOUNT_ID);
    if (!root) return;                     /* not /signup. Nothing to do. */

    ensureCss();
    buildShell();
    foldWatch();
    armRefreshWarning();

    /* Best-effort IP, fired early so it is usually in hand before submit.
       NON-FATAL BY DESIGN — if it is blocked or slow the field stays empty
       and everything else still writes. Do not gate submit on it. */
    try {
      fetch(IPIFY_URL).then(function (r) { return r.json(); })
        .then(function (j) { S.ip = (j && j.ip) || ''; })
        .catch(function () {});
    } catch (e) {}

    /* THE HANDOFF IS CHECKED BEFORE THE WIZARD PAINTS. Coming back from
       Stripe there is no step to render. */
    if (!resumeEnd()) {
      render();
      track('open');
    }

    /* LAST LINE. Only now does the gate lift. Everything above must be ready
       before a member can see any of it. */
    document.documentElement.setAttribute(READY_ATTR, '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
