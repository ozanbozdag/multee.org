/* MuLTEE — multee.org
   No framework, no build step. Three small behaviours:
   mobile nav disclosure, theme toggle, and the rack-focus scroll reveal.
   The theme and .js-focus class are set by an inline script in each <head>
   so neither flashes before this file loads. */
(function () {
  'use strict';

  /* ---------------------------------------------------------- mobile nav */
  var masthead = document.querySelector('.masthead');
  var navToggle = document.querySelector('.nav-toggle');
  if (masthead && navToggle) {
    navToggle.addEventListener('click', function () {
      var open = masthead.getAttribute('data-open') === 'true';
      masthead.setAttribute('data-open', String(!open));
      navToggle.setAttribute('aria-expanded', String(!open));
    });
    // Collapsing at the desktop breakpoint leaves aria-expanded stale otherwise.
    var mq = window.matchMedia('(min-width:1401px)');
    var sync = function () {
      if (mq.matches) {
        masthead.setAttribute('data-open', 'false');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    };
    mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
  }

  /* -------------------------------------------------------- theme toggle */
  var themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    var label = function () {
      var explicit = document.documentElement.getAttribute('data-theme');
      var dark = explicit
        ? explicit === 'dark'
        : window.matchMedia('(prefers-color-scheme:dark)').matches;
      themeToggle.textContent = dark ? 'Light' : 'Dark';
      themeToggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    };
    label();
    themeToggle.addEventListener('click', function () {
      var explicit = document.documentElement.getAttribute('data-theme');
      var dark = explicit
        ? explicit === 'dark'
        : window.matchMedia('(prefers-color-scheme:dark)').matches;
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('multee-theme', next); } catch (e) {}
      label();
    });
  }

  /* ----------------------------------------------------------- rack focus
     Applied only to elements marked .reveal, and only a handful per page:
     past about six it stops being a device and becomes a tic. */
  var plates = document.querySelectorAll('.reveal');
  var revealAll = function () {
    Array.prototype.forEach.call(plates, function (p) { p.classList.add('in'); });
  };
  if (plates.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    Array.prototype.forEach.call(plates, function (p) { io.observe(p); });
    // Failsafe. The reveal is decoration; a blurred image is a broken page.
    // Anything the observer has not fired on within 2.5s gets shown anyway.
    setTimeout(revealAll, 2500);
  } else {
    revealAll();
  }
})();
