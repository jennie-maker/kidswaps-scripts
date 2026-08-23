/* ==========================================================================
   landing.js  —  KidSwaps landing pages  —  S270
   Rides the SAME SHA as landing.css. TWO PIN FIELDS, EDIT BOTH EVERY TIME.
   Goes in each landing page's Before </body> box. Never Site Settings.

   It does three things and nothing else:
     1. sets html.landing-motion, which is what ARMS every hiding rule in
        landing.css
     2. reveals each section once, as it comes into view
     3. spins the star with the scroll

   HER S224 RULING IS THE DESIGN OF THIS FILE: NOTHING IS HIDDEN WITHOUT THE
   FLAG. The how-it-works entrance hid four steps in CSS and revealed them on
   an observer, and when the observer did not fire the section rendered
   PERMANENTLY BLANK on the live page. Here the CSS hides nothing until this
   script says so, so every failure path — script blocked, script 404s,
   IntersectionObserver missing, an exception on line one — ends with a fully
   visible page. The failure lands on "no animation", never on "no content".
   ========================================================================== */

(function () {
  "use strict";

  var doc = document.documentElement;

  /* ------------------------------------------------------------------------
     1. THE FLAG
     Set FIRST, and only if we can actually deliver the animation. If
     IntersectionObserver is missing we never set it, so the CSS never hides
     anything and the page is simply static. Do not move this below anything
     that can throw.
     ------------------------------------------------------------------------ */

  var canObserve = typeof window.IntersectionObserver === "function";
  var reduced = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (canObserve && !reduced) {
    doc.classList.add("landing-motion");
  }

  /* ------------------------------------------------------------------------
     2. THE SECTIONS
     One shot each, then unobserve — no replay on the way back up, her ruling.
     Each section carries its own entry, so a section never scrolled to simply
     never fires, independently of the others.

     rootMargin's -15% bottom is what makes it read as ARRIVING rather than
     REACTING: the section starts moving when its top edge crosses roughly 85%
     of the viewport, so it is already in flight by the time the eye gets
     there. Fire at 100% and the motion happens off-screen — you scroll onto a
     finished section and it looks like nothing happened.
     ------------------------------------------------------------------------ */

  function start() {
    var sections = document.querySelectorAll(".landing-section");
    if (!sections.length) return;

    if (!canObserve || reduced) return;

    var io = new IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add("is-in");
          obs.unobserve(entries[i].target);
        }
      }
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });

    for (var i = 0; i < sections.length; i++) {
      io.observe(sections[i]);
    }
  }

  /* ------------------------------------------------------------------------
     3. THE STAR
     Scroll-linked spin, written as an INLINE `rotate:` — a scroll-linked value
     cannot live in a stylesheet, and landing.css deliberately carries no
     rotate rule, because one would lose to this inline value silently.

     `rotate:` NOT `transform: rotate()`. On the hero stars a transform
     keyframe deletes the translate that positions them and throws the star
     across the section; this star is not positioned by a transform today, but
     the rule is kept identical so the two cannot drift.

     STILL WHEN THE PAGE IS STILL — her S247 ruling, chosen over an
     always-turning version. requestAnimationFrame coalesces the scroll events
     so this never runs more than once a frame.
     ------------------------------------------------------------------------ */

  function spin() {
    var star = document.querySelector(".landing-star");
    if (!star) return;
    if (reduced) return;

    var RATE = 0.08;
    var ticking = false;

    function paint() {
      ticking = false;
      star.style.rotate = (window.pageYOffset * RATE).toFixed(2) + "deg";
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(paint);
      }
    }, { passive: true });

    paint();
  }

  /* ------------------------------------------------------------------------
     GO
     Bound immediately when the DOM is already parsed, otherwise on
     DOMContentLoaded. Not on load — waiting for images would let a section
     scroll past before its observer exists.
     ------------------------------------------------------------------------ */

  function go() {
    start();
    spin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go);
  } else {
    go();
  }

})();
