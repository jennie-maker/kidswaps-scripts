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
     corrections at once: "a month" -> "per month", and "when my first whole
     credit lands" -> "when I have my first whole credit". One bump, not two. */
  var TERMS_VERSION = '2026-07-21';

  var CONSENT_TYPE  = 'arl_auto_renew';   /* BYTE-IDENTICAL across both writers
                                             (browser + S1) or the unique index
                                             on (memberstack_id, consent_type,
                                             terms_version) stops collapsing
                                             the two rows into one. */

  var CANCEL_URL    = '/terms-of-service';
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

  /* ONE PLANS CONSTANT. Step 2's cards, the disclosure interpolation and the
     form selection ALL read from here. A price lives in exactly one place.
     ⚠ PRICE IDs ARE PASTED, NEVER TYPED. Pack prices carry `the-` after
     prc_; trial prices do not. That difference is what a hand-typed ID loses. */
  var PLANS = {

    /* ---- send-bag-first path: the four 60-day-trial prices ---- */
    'basics-trial': {
      slug:    'basics-trial',
      formId:  'ks-form-basics-trial',
      price:   'prc_basics-monthly-60-day-trial-i4801al',
      path:    'send',
      name:    'The Basics',
      monthly: 30,
      swaps:   'Up to 6 clothing swaps per month',
      value:   'Up to $150 value per month',
      pack:    null
    },
    'toychest-trial': {
      slug:    'toychest-trial',
      formId:  'ks-form-toychest-trial',
      price:   'prc_toy-chest-monthly-60-day-trial-3b6704ox',
      path:    'send',
      name:    'The Toy Chest',
      monthly: 45,
      swaps:   'Up to 5 toy swaps per month',
      value:   'Up to $100 value per month',
      pack:    null
    },
    'wardrobe-trial': {
      slug:    'wardrobe-trial',
      formId:  'ks-form-wardrobe-trial',
      price:   'prc_full-wardrobe-monthly-60-day-trial-bd6604eg',
      path:    'send',
      name:    'The Full Wardrobe',
      monthly: 45,
      swaps:   'Up to 10 clothing swaps per month',
      value:   'Up to $250 value per month',
      pack:    null
    },
    'everything-trial': {
      slug:    'everything-trial',
      formId:  'ks-form-everything-trial',
      price:   'prc_everything-bag-monthly-60-day-trial-dg3t01b8',
      path:    'send',
      name:    'The Everything Bag',
      monthly: 70,
      swaps:   'Up to 10 clothing and 3 toy swaps per month',   /* ⚠ NEEDS-CONFIRM */
      value:   'Up to $310 value per month',
      pack:    null
    },

    /* ---- shop-first path: the two pack prices, charged at signup ----
       ⚠ ONLY TWO PLANS EXIST HERE. Full Wardrobe and Everything Bag are
       unreachable for someone starting with a pack. RULED AS-IS. */
    'basics-pack': {
      slug:      'basics-pack',
      formId:    'ks-form-basics-pack',
      price:     'prc_the-basics-clothing-starter-pack-zv5r0e59',
      path:      'shop',
      name:      'The Basics',
      monthly:   30,
      titleTop:  'The Basics plan',
      titleSub:  'with a Clothing Starter Pack',
      swaps:     'Up to 6 clothing swaps per month',
      value:     'Up to $150 value per month',
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
      formId:    'ks-form-toychest-pack',
      price:     'prc_the-toy-chest-toy-starter-pack-0k2c0abs',
      path:      'shop',
      name:      'The Toy Chest',
      monthly:   45,
      titleTop:  'The Toy Chest plan',
      titleSub:  'with a Toy Starter Pack',
      swaps:     'Up to 5 toy swaps per month',
      value:     'Up to $100 value per month',
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
    send: ['basics-trial', 'toychest-trial', 'wardrobe-trial', 'everything-trial'],
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
      head: 'How do you want to start?',
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
      subSend: 'Nothing is charged today. Billing doesn\u2019t start until you\u2019ve earned your first full credit. Cancel whenever you want from your dashboard.',
      subShop: '1 credit = 1 essentials item',
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
        return 'You\u2019re joining ' + p.name + ', $' + p.monthly + ' per month, billed monthly.';
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

  var root, shell, body, formSlot, nav, backBtn, nextBtn, dots;

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
    track('step_view');
    try { shell.scrollTop = 0; } catch (e) {}
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
     Two different exits, two different owners. The tap-out is OURS and gets
     our words. The refresh dialog is the BROWSER'S and its wording is not
     ours to write (ruled). */

  function armRefreshWarning() {
    window.addEventListener('beforeunload', function (e) {
      if (!S.dirty || S.step >= 6) return;
      e.preventDefault();
      e.returnValue = '';          /* the browser supplies its own generic text */
    });
  }

  function confirmLeave(onLeave) {
    if (!S.dirty) { onLeave(); return; }
    var back = el('div', 'ks-wz-scrim');
    var box  = el('div', 'ks-wz-confirm');
    box.appendChild(el('p', 'ks-wz-confirm-text', COPY.nav.tapOut));
    var row  = el('div', 'ks-wz-confirm-row');
    var stay = el('button', 'ks-wz-btn ks-wz-btn-ghost', COPY.nav.tapStay);
    var leave= el('button', 'ks-wz-btn ks-wz-btn-quiet', COPY.nav.tapLeave);
    stay.type = leave.type = 'button';
    stay.addEventListener('click', function () {
      back.parentNode && back.parentNode.removeChild(back);
      track('tapout_stay');
    });
    leave.addEventListener('click', function () {
      track('tapout_leave');
      onLeave();
    });
    row.appendChild(stay); row.appendChild(leave);
    box.appendChild(row); back.appendChild(box);
    root.appendChild(back);
  }


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

    var close = el('button', 'ks-wz-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () {
      confirmLeave(function () { window.location.href = '/'; });
    });

    body     = el('div', 'ks-wz-body');
    formSlot = el('div', 'ks-wz-formslot');
    dots     = el('div', 'ks-wz-dots');

    nav      = el('div', 'ks-wz-nav');
    backBtn  = el('button', 'ks-wz-btn ks-wz-btn-ghost', COPY.nav.back);
    nextBtn  = el('button', 'ks-wz-btn ks-wz-btn-primary', COPY.nav.next);
    backBtn.type = nextBtn.type = 'button';
    backBtn.addEventListener('click', back);
    nav.appendChild(backBtn);
    nav.appendChild(nextBtn);

    card.appendChild(close);
    card.appendChild(dots);
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
    for (var i = 1; i <= MAX_STEP; i++) {
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

    var wrap = el('div', 'ks-wz-forks');
    [['send', COPY.s1.cardA], ['shop', COPY.s1.cardB]].forEach(function (pair) {
      var pathKey = pair[0], c = pair[1];
      var b = el('button', 'ks-wz-fork' + (S.path === pathKey ? ' is-on' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'ks-wz-fork-t', c.title));
      b.appendChild(el('span', 'ks-wz-fork-s', c.sub));
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
    var b = el('button', 'ks-wz-plan' + (S.plan === p.slug ? ' is-on' : ''));
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
    var price = el('div', 'ks-wz-plan-price', '$' + p.monthly + ' per month');
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
    head(COPY.s2.head, S.path === 'shop' ? COPY.s2.subShop : COPY.s2.subSend);

    var list = el('div', 'ks-wz-plans');
    PLAN_ORDER[S.path].forEach(function (slug) {
      list.appendChild(planCard(PLANS[slug]));
    });
    body.appendChild(list);

    /* The three shared benefits sit BELOW the plan list, in one block.
       Identical on every card, they carried no information sitting on any
       of them. */
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
      if (opts.autocomplete) input.setAttribute('autocomplete', opts.autocomplete);
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
      function () { return S.first; }, function (v) { S.first = v; },
      { autocomplete: 'given-name' }));

    body.appendChild(field(COPY.s3.labelLast, 'last',
      function () { return S.last; }, function (v) { S.last = v; },
      { autocomplete: 'family-name' }));

    /* The EMAIL input is the form's own bound field, sitting in the slot below.
       It is never rebuilt and never mirrored. */
    var emailInput = inForm(SEL.email);
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
    sum.appendChild(sumRow(S.first + ' ' + S.last, S.email));
    sum.appendChild(sumRow(addrOneLine(), ''));
    /* ⚠ THE LINE IS KEPT AND CARRIES NO NUMBER until the CPA rules on
       taxability. A stated total is a promise we may not be able to keep. */
    sum.appendChild(sumRow(COPY.s5.dueTodayLabel, ''));
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

    var sub = inForm(SEL.submit);
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
     ⚠⚠ THESE RENDER AFTER STRIPE, AND WHERE SHE LANDS IS NOT DECIDED.
     Memberstack currently sends her to /verify-email. Until a return
     destination is ruled, this only fires on an explicit ?done= flag, so the
     approved copy is built and waiting rather than written twice. */

  function endState(kind, p) {
    var c = (kind === 'pack') ? COPY.endB : COPY.endA;
    clear(body);
    formSlot.style.display = 'none';
    dots.style.display = 'none';
    nav.style.display = 'none';
    body.appendChild(el('h2', 'ks-wz-h', c.head));
    body.appendChild(el('p', 'ks-wz-body-text',
      typeof c.body === 'function' ? c.body(p) : c.body));
    var a = el('a', 'ks-wz-btn ks-wz-btn-primary', c.cta);
    a.href = c.href;
    body.appendChild(a);
    track('end_state', { kind: kind });
  }


  /* =========================================================================
     CSS  —  SELF-INJECTED, same discipline as closet-tool.js / browse-tool.js.
     The whole surface is ONE VERSIONED ARTIFACT and a rollback is a pin bump.
     There is NO Webflow custom-code box for this and there must not be.

     ⚠ ZERO NEW HEXES. Every colour below is one of the eight brand values or
     one of the three surface values.
       ink #1E1A19 · coral #E54F25 · green #309359 · blue #28498D
       cream #EEEFE3 · muted #75736E · paper #FFFFFF
       coral-light #F7E4D9 · coral-light border #F0C9B5 · page base #F2F1EB
     ⚠ NO OPACITY FOR COLOUR. Every grey is a solid hex. Opacity for motion is
     fine (the card's entrance).
     ⚠ QUICKSAND ONLY, CEILING 600. Instrument Serif lives on exactly two
     elements and both are on the dashboard. It does not appear here.
     ⚠ 16px MINIMUM ON EVERY INPUT or Safari zooms in and does not zoom back.
     ====================================================================== */

  function ensureCss() {
    if (document.getElementById('ks-wz-css')) return;
    var s = document.createElement('style');
    s.id = 'ks-wz-css';
    s.textContent = [
      '#' + MOUNT_ID + '{font-family:Quicksand,system-ui,-apple-system,sans-serif;}',

      /* ---- overlay + card ---- */
      '.ks-wz{position:fixed;inset:0;z-index:9000;background:#F2F1EB;',
        'display:flex;align-items:flex-start;justify-content:center;',
        'overflow-y:auto;padding:32px 16px 48px;}',
      '.ks-wz-card{position:relative;width:100%;max-width:560px;background:#FFFFFF;',
        'border:1px solid #EEEFE3;border-radius:18px;padding:28px 26px 22px;',
        'box-shadow:0 10px 30px -12px #C9C7BC;',
        'animation:ks-wz-in 240ms ease-out both;}',
      '@keyframes ks-wz-in{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '@media (prefers-reduced-motion:reduce){.ks-wz-card{animation:none}}',
      '@media (max-width:600px){.ks-wz{padding:0}',
        '.ks-wz-card{max-width:none;min-height:100vh;border:0;border-radius:0;',
        'box-shadow:none;padding:22px 18px 28px;}}',

      '.ks-wz-close{position:absolute;top:14px;right:14px;width:32px;height:32px;',
        'border:0;background:none;cursor:pointer;color:#75736E;font-size:22px;',
        'line-height:1;padding:0;}',
      '.ks-wz-close::before{content:"\\00d7";}',

      /* ---- progress ---- */
      '.ks-wz-dots{display:flex;gap:6px;margin:6px 0 20px;}',
      '.ks-wz-dot{width:26px;height:3px;border-radius:2px;background:#EEEFE3;}',
      '.ks-wz-dot.is-done{background:#F0C9B5;}',
      '.ks-wz-dot.is-on{background:#E54F25;}',

      /* ---- type ---- */
      '.ks-wz-h{font-size:24px;font-weight:600;color:#1E1A19;margin:0 0 6px;line-height:1.25;}',
      '.ks-wz-sub{font-size:15px;color:#75736E;margin:0 0 20px;line-height:1.5;}',
      '.ks-wz-headline{font-size:16px;font-weight:600;color:#1E1A19;margin:0 0 16px;}',
      '.ks-wz-body-text{font-size:16px;color:#1E1A19;line-height:1.6;margin:0 0 22px;}',

      /* ---- the fork (step 1) ---- */
      '.ks-wz-forks{display:flex;flex-direction:column;gap:12px;}',
      '.ks-wz-fork{display:block;width:100%;text-align:left;cursor:pointer;',
        'background:#FFFFFF;border:1px solid #EEEFE3;border-radius:14px;padding:18px 18px;',
        'font-family:inherit;}',
      '.ks-wz-fork:hover{border-color:#F0C9B5;}',
      '.ks-wz-fork.is-on{border-color:#E54F25;background:#F7E4D9;}',
      '.ks-wz-fork-t{display:block;font-size:17px;font-weight:600;color:#1E1A19;margin-bottom:4px;}',
      '.ks-wz-fork-s{display:block;font-size:14px;color:#75736E;line-height:1.45;}',

      /* ---- plan cards (step 2) ---- */
      '.ks-wz-plans{display:flex;flex-direction:column;gap:12px;}',
      '.ks-wz-plan{display:block;width:100%;text-align:left;cursor:pointer;',
        'background:#FFFFFF;border:1px solid #EEEFE3;border-radius:14px;padding:16px 18px;',
        'font-family:inherit;}',
      '.ks-wz-plan:hover{border-color:#F0C9B5;}',
      '.ks-wz-plan.is-on{border-color:#E54F25;background:#F7E4D9;}',
      '.ks-wz-plan-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}',
      '.ks-wz-plan-title-a{display:block;font-size:17px;font-weight:600;color:#1E1A19;}',
      '.ks-wz-plan-title-b{display:block;font-size:17px;font-weight:600;color:#1E1A19;}',
      /* price sits TOP RIGHT on every card, no exceptions */
      '.ks-wz-plan-price{flex:0 0 auto;font-size:14px;font-weight:600;color:#1E1A19;',
        'text-align:right;white-space:nowrap;}',
      '.ks-wz-plan-lines{margin-top:10px;}',
      '.ks-wz-plan-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}',
      '.ks-wz-plan-credits{font-size:16px;font-weight:600;color:#1E1A19;}',
      '.ks-wz-plan-once{font-size:14px;font-weight:600;color:#1E1A19;white-space:nowrap;}',
      '.ks-wz-plan-swaps{font-size:14px;color:#1E1A19;margin-top:4px;}',
      '.ks-wz-plan-value{font-size:14px;font-style:italic;color:#75736E;margin-top:2px;}',

      '.ks-wz-includes{margin-top:20px;padding:16px 18px;background:#EEEFE3;border-radius:14px;}',
      '.ks-wz-includes-h{font-size:13px;font-weight:600;color:#1E1A19;',
        'text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;}',
      '.ks-wz-includes-list{list-style:none;margin:0;padding:0;}',
      '.ks-wz-includes-list li{position:relative;padding-left:22px;font-size:14px;',
        'color:#1E1A19;line-height:1.5;margin-bottom:6px;}',
      '.ks-wz-includes-list li:last-child{margin-bottom:0;}',
      '.ks-wz-includes-list li::before{content:"";position:absolute;left:2px;top:6px;',
        'width:9px;height:5px;border-left:2px solid #309359;border-bottom:2px solid #309359;',
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

      /* ---- the address question ---- */
      '.ks-wz-ask{margin-top:16px;}',
      '.ks-wz-ask-text{font-size:15px;color:#1E1A19;line-height:1.5;margin:0 0 12px;}',
      '.ks-wz-ask-addr{background:#EEEFE3;border-radius:10px;padding:12px 14px;',
        'font-size:15px;color:#1E1A19;line-height:1.5;margin-bottom:12px;}',
      '.ks-wz-ask-row{display:flex;gap:10px;flex-wrap:wrap;}',

      /* ---- step 5 ---- */
      '.ks-wz-summary{background:#EEEFE3;border-radius:14px;padding:14px 16px;margin-bottom:18px;}',
      '.ks-wz-sum-row{display:flex;justify-content:space-between;gap:12px;',
        'font-size:14px;color:#1E1A19;padding:6px 0;line-height:1.45;}',
      '.ks-wz-sum-row+.ks-wz-sum-row{border-top:1px solid #FFFFFF;}',
      '.ks-wz-sum-b{color:#75736E;text-align:right;white-space:nowrap;}',
      '.ks-wz-consent{display:flex;gap:10px;align-items:flex-start;cursor:pointer;',
        'background:#F7E4D9;border:1px solid #F0C9B5;border-radius:14px;padding:14px 16px;}',
      '.ks-wz-consent-box{flex:0 0 auto;width:18px;height:18px;margin:2px 0 0;',
        'accent-color:#309359;cursor:pointer;}',
      '.ks-wz-consent-text{font-size:13px;color:#1E1A19;line-height:1.55;}',
      '.ks-wz-consent-link{color:#1E1A19;font-weight:600;text-decoration:underline;}',

      /* ---- nav + buttons ---- */
      '.ks-wz-nav{display:flex;gap:10px;align-items:center;margin-top:22px;}',
      '.ks-wz-btn{font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;',
        'border-radius:999px;padding:13px 22px;border:1px solid transparent;}',
      '.ks-wz-btn-primary{background:#E54F25;border-color:#E54F25;color:#EEEFE3;',
        'margin-left:auto;text-decoration:none;display:inline-block;text-align:center;}',
      '.ks-wz-btn-primary[disabled]{background:#EEEFE3;border-color:#EEEFE3;color:#75736E;',
        'cursor:default;}',
      '.ks-wz-btn-ghost{background:transparent;border-color:#F0C9B5;color:#1E1A19;}',
      '.ks-wz-btn-quiet{background:transparent;border-color:transparent;color:#75736E;}',

      /* ---- the tap-out confirm ---- */
      '.ks-wz-scrim{position:fixed;inset:0;z-index:9100;background:#1E1A19;',
        'display:flex;align-items:center;justify-content:center;padding:24px;}',
      '.ks-wz-confirm{width:100%;max-width:380px;background:#FFFFFF;border-radius:16px;',
        'padding:22px 20px;box-shadow:0 10px 30px -12px #C9C7BC;}',
      '.ks-wz-confirm-text{font-size:16px;color:#1E1A19;line-height:1.5;margin:0 0 18px;}',
      '.ks-wz-confirm-row{display:flex;gap:10px;justify-content:flex-end;}',

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
    armRefreshWarning();

    /* Best-effort IP, fired early so it is usually in hand before submit.
       NON-FATAL BY DESIGN — if it is blocked or slow the field stays empty
       and everything else still writes. Do not gate submit on it. */
    try {
      fetch(IPIFY_URL).then(function (r) { return r.json(); })
        .then(function (j) { S.ip = (j && j.ip) || ''; })
        .catch(function () {});
    } catch (e) {}

    render();
    track('open');

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
