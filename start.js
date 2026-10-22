/* ============================================================================
 * start.js — /start, THE ENVELOPE CODE (core 1B item 28, stage 5). v2, S487.
 * v2: her S487 edits to board 2's words, a reason-for-the-code line on boards 2
 *     and 3, and both tops drawn as home's blue frame with a card (coral or white)
 *     and the hero photo on the right on a computer.
 * v3: home's hero photo is a BACKGROUND IMAGE on .home-hero-media, not an <img>
 *     (read live S487), so the card copies that background.
 * Mockup https://claude.ai/artifact/UPc56RDwYK4evL7RbiGqpC (boards 1, 2, 3).
 * Loads ONLY on /start (Page Settings, Before </body>, after home.js). CSS: start.css.
 * ----------------------------------------------------------------------------
 * THREE TOPS
 *   no code      → board 1: the code box sits in the hero, under Pick my plan.
 *   good code    → board 2: a coral top replaces the hero, the code shown with a
 *                  check, Pick my plan to /signup.
 *   bad code     → board 3: a plain top replaces the hero (not found, used or
 *                  expired), with a box to try again.
 * WHERE THE CODE COMES FROM: ?code= first, else the browser's memory,
 *   localStorage 'ks_signup_code' as {code, at}, kept 365 days (a code lasts one
 *   year). The same shape as 'ks_invite'. /signup will read this key when the
 *   code path is built there (1B item 24, step c); change both together.
 * Asks check_signup_code(p_code), open to the website, answering only
 *   'good', 'used', 'expired' or 'unknown'.
 *   good          → remembered, board 2.
 *   used/expired/unknown → forgotten, board 3.
 *   no answer     → (failure, or nothing in 8 seconds) the hero stays, the code
 *                  waits in the box, the memory is KEPT for next time.
 * THE HEAD GATE: an inline line in /start's head box adds html.ks-code-wait when
 *   there is a ?code= or a remembered code, and start.css hides the hero until
 *   this file settles (or for 6 seconds at most, by CSS alone, if it never loads).
 * ALL MEMBER-FACING WORDS LIVE IN TEXT BELOW. Claude's, NOT YET APPROVED (hers
 *   S487: she edits once she sees them live).
 * ========================================================================== */
(function () {
  var BUILD = 'start v3 (S487)';
  var LOG = '[ks-start]';

  var TEXT = {
    boxLabel:     'Have a code from your envelope?',
    boxHolder:    'Enter your code',
    boxButton:    'Start',
    checking:     'Checking\u2026',
    noAnswer:     'We couldn\u2019t check your code just now. Try again in a moment.',

    goodEyebrow:  'Less clutter. Less waste.',
    goodHeading:  'Fill the bag, send it back, start swapping.',
    goodBody:     'KidSwaps is a membership for parents of young children. You send in the good stuff your child has outgrown, earn credits, and swap for what fits next. The bag inside your envelope is already prelabeled, so you can start today.',
    goodCode:     'Your code: ',
    codeWhy:      'With your code you skip the line for your first bag, and everything we accept from your shipment is automatically credited to your account.',
    goodButton:   'Pick my plan',
    goodSent:     'Already sent your bag? Sign up with your code and your credits will be waiting for you.',

    unknownHeading: 'Let\u2019s find your code.',
    unknownBody:    'We couldn\u2019t find that one. Check it against the label on the front of your envelope.',
    usedHeading:    'This code\u2019s already been used.',
    usedBody:       'If you signed up with it, log in to see your dashboard.',
    expiredHeading: 'This code has expired.',
    expiredBody:    'Codes last one year. You can still pick a plan and start swapping.',
    badLabel:       'Your code',
    badButton:      'Check',
    badMember:      'Already a member? ',
    badMemberLink:  'Log in',
    badNoCode:      'No code? ',
    badNoCodeLink:  'Pick my plan'
  };

  var SIGNUP_URL = '/signup';
  var LOGIN_URL  = '/login';

  var CODE_KEY  = 'ks_signup_code';
  var CODE_DAYS = 365;
  var GIVE_UP_MS = 8000;
  var CHECK_URL = 'https://ajsobivqxexcniwifxzz.supabase.co/rest/v1/rpc/check_signup_code';
  /* PUBLIC anon key ONLY, the same one home.js ships. */
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqc29iaXZxeGV4Y25pd2lmeHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI4MjIsImV4cCI6MjA5MTk0ODgyMn0.IFtzADITLHrEhnc8oHfjzyulcxWySp0o3s6v8XTZ5VM';

  var root = document.documentElement;

  /* ---- the code itself -------------------------------------------------- */
  function cleanCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }
  function showCode(c) { return c.length === 6 ? c.slice(0, 3) + '-' + c.slice(3) : c; }

  function remember(c) {
    try { localStorage.setItem(CODE_KEY, JSON.stringify({ code: c, at: Date.now() })); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(CODE_KEY); } catch (e) {} }

  function readCode() {
    var c = '';
    try { c = cleanCode(new URLSearchParams(window.location.search).get('code')); } catch (e) {}
    if (c) return c;
    try {
      var m = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
      if (m && m.code && m.at && (Date.now() - m.at) < CODE_DAYS * 864e5) return cleanCode(m.code);
    } catch (e) {}
    return '';
  }

  /* answers 'good' | 'used' | 'expired' | 'unknown', or null on no answer */
  function check(c, done) {
    var settled = false;
    function finish(v) { if (settled) return; settled = true; done(v); }
    setTimeout(function () { finish(null); }, GIVE_UP_MS);
    try {
      fetch(CHECK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON },
        body: JSON.stringify({ p_code: c })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          finish(j === 'good' || j === 'used' || j === 'expired' || j === 'unknown' ? j : null);
        })
        .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  /* ---- small DOM helpers ---------------------------------------------- */
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(cls, text, href) { var a = node('a', cls, text); a.href = href; return a; }

  var ENVELOPE_SVG = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 8l9 6 9-6"></path></svg>';
  var CHECK_SVG = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"></path></svg>';

  /* One form: an input and a button. onCode(cleanedCode, form) runs on submit. */
  function codeForm(id, cls, labelNode, holder, buttonText, value, onCode) {
    var form = node('form', cls);
    form.setAttribute('novalidate', '');
    form.appendChild(labelNode);
    var row = node('div', cls + '-row');
    var input = node('input', cls + '-input');
    input.id = id;
    input.type = 'text';
    input.name = 'code';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('maxlength', '14');
    if (holder) input.placeholder = holder;
    if (value) input.value = value;
    var btn = node('button', cls + '-button', buttonText);
    btn.type = 'submit';
    row.appendChild(input);
    row.appendChild(btn);
    form.appendChild(row);
    var note = node('p', cls + '-note');
    note.setAttribute('aria-live', 'polite');
    form.appendChild(note);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var c = cleanCode(input.value);
      note.textContent = '';
      if (!c) { input.focus(); return; }
      btn.disabled = true;
      btn.textContent = TEXT.checking;
      onCode(c, function failed() {
        btn.disabled = false;
        btn.textContent = buttonText;
        note.textContent = TEXT.noAnswer;
      });
    });
    return { form: form, input: input };
  }

  /* ---- BOARD 1: the box in the hero ------------------------------------ */
  var heroBox = null;

  function paintHeroBox(prefill) {
    if (heroBox) { if (prefill) heroBox.input.value = showCode(prefill); return; }
    var anchor = document.querySelector('.hero-section .hero-buttons');
    if (!anchor) { console.log(LOG, 'no .hero-buttons, code box not placed'); return; }
    var label = node('label', 'ks-start-box-label');
    label.setAttribute('for', 'ks-start-code');
    label.innerHTML = ENVELOPE_SVG;
    label.appendChild(document.createTextNode(TEXT.boxLabel));
    heroBox = codeForm('ks-start-code', 'ks-start-box', label, TEXT.boxHolder, TEXT.boxButton,
      prefill ? showCode(prefill) : '', function (c, failed) { run(c, failed); });
    anchor.parentNode.insertBefore(heroBox.form, anchor.nextSibling);
  }

  /* ---- BOARDS 2 AND 3: a top that replaces the hero --------------------- */
  var panel = null;

  function clearPanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    root.classList.remove('ks-code-panel');
  }

  function placePanel(p) {
    clearPanel();
    var hero = document.querySelector('.hero-section');
    if (!hero || !hero.parentNode) { console.log(LOG, 'no .hero-section, panel not placed'); return false; }
    hero.parentNode.insertBefore(p, hero);
    panel = p;
    root.classList.add('ks-code-panel');
    return true;
  }

  /* home's frame: the blue band, a rounded card, the words on the left and the
     hero photo (copied from home's hero, so it changes when hers does) on the
     right. Returns the words column. */
  function card(sec) {
    var c = node('div', 'ks-start-card');
    var copy = node('div', 'ks-start-copy');
    c.appendChild(copy);
    var src = document.querySelector('.hero-section .home-hero-media');
    var img = src && src.querySelector('img');
    var bg = '';
    if (!img && src) {
      try { bg = getComputedStyle(src).backgroundImage || ''; } catch (e) {}
      if (bg === 'none') bg = '';
    }
    if (img || bg) {
      var media = node('div', 'ks-start-media');
      if (img) {
        var pic = img.cloneNode(false);
        pic.removeAttribute('id');
        pic.setAttribute('alt', '');
        pic.setAttribute('loading', 'eager');
        media.appendChild(pic);
      } else {
        media.style.backgroundImage = bg;
      }
      c.appendChild(media);
    } else {
      c.classList.add('ks-start-card--no-photo');
      console.log(LOG, 'no hero photo found, card drawn without one');
    }
    sec.appendChild(c);
    return copy;
  }

  function focusHeading(h) {
    h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
  }

  function paintGood(c, moved) {
    var sec = node('section', 'ks-start-top ks-start-good');
    var inner = card(sec);
    inner.appendChild(node('p', 'ks-start-eyebrow', TEXT.goodEyebrow));
    var h = node('h1', 'ks-start-heading', TEXT.goodHeading);
    inner.appendChild(h);
    inner.appendChild(node('p', 'ks-start-body', TEXT.goodBody));
    var chip = node('p', 'ks-start-chip');
    chip.innerHTML = CHECK_SVG;
    chip.appendChild(document.createTextNode(TEXT.goodCode + showCode(c)));
    inner.appendChild(chip);
    inner.appendChild(node('p', 'ks-start-small ks-start-why', TEXT.codeWhy));
    inner.appendChild(link('ks-start-good-button', TEXT.goodButton, SIGNUP_URL));
    inner.appendChild(node('p', 'ks-start-small', TEXT.goodSent));
    if (placePanel(sec) && moved) { window.scrollTo(0, 0); focusHeading(h); }
  }

  function paintBad(kind, c, moved) {
    var words = kind === 'used'
      ? [TEXT.usedHeading, TEXT.usedBody]
      : kind === 'expired'
        ? [TEXT.expiredHeading, TEXT.expiredBody]
        : [TEXT.unknownHeading, TEXT.unknownBody];
    var sec = node('section', 'ks-start-top ks-start-bad ks-start-bad--' + kind);
    var inner = card(sec);
    var h = node('h1', 'ks-start-heading', words[0]);
    inner.appendChild(h);
    inner.appendChild(node('p', 'ks-start-body', words[1]));
    inner.appendChild(node('p', 'ks-start-small ks-start-why', TEXT.codeWhy));
    var label = node('label', 'ks-start-retry-label', TEXT.badLabel);
    label.setAttribute('for', 'ks-start-retry');
    var f = codeForm('ks-start-retry', 'ks-start-retry', label, '', TEXT.badButton,
      showCode(c), function (code, failed) { run(code, failed); });
    inner.appendChild(f.form);
    var m = node('p', 'ks-start-small', TEXT.badMember);
    m.appendChild(link('ks-start-link', TEXT.badMemberLink, LOGIN_URL));
    inner.appendChild(m);
    var n = node('p', 'ks-start-small', TEXT.badNoCode);
    n.appendChild(link('ks-start-link', TEXT.badNoCodeLink, SIGNUP_URL));
    inner.appendChild(n);
    if (placePanel(sec) && moved) { window.scrollTo(0, 0); focusHeading(h); }
  }

  /* ---- the one path every check goes through ---------------------------- */
  function setUrlCode(c) {
    try {
      var u = new URL(window.location.href);
      if (c) u.searchParams.set('code', c); else u.searchParams.delete('code');
      history.replaceState(history.state, '', u.toString());
    } catch (e) {}
  }

  function run(c, failed) {
    check(c, function (ans) {
      console.log(LOG, 'check', c, '→', ans);
      if (ans === 'good') { remember(c); setUrlCode(c); paintGood(c, true); return; }
      if (ans) { forget(); setUrlCode(c); paintBad(ans, c, true); return; }
      if (failed) failed();
    });
  }

  function release() { root.classList.remove('ks-code-wait'); }

  function start() {
    console.log(LOG, 'build', BUILD);
    if (!document.querySelector('.hero-section')) { release(); return; }
    var c = readCode();
    paintHeroBox(c);
    if (!c) { release(); return; }
    check(c, function (ans) {
      console.log(LOG, 'arrived with', c, '→', ans);
      if (ans === 'good') { remember(c); paintGood(c, false); }
      else if (ans) { forget(); paintBad(ans, c, false); }
      /* no answer: the hero stays with the code in the box, memory kept */
      release();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
