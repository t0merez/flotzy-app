/* ============================================================
   FLOTZY — assets/js/site.js
   Shared page wiring: nav state, audio buttons, waveform
   previews, and reveal-on-scroll for meter bars.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- current page in nav ---------- */

  function markNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a[href]').forEach(function (a) {
      var target = a.getAttribute('href').split('/').pop().split('#')[0];
      if (target && target === here) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- waveform previews ---------- */

  function drawPreviews() {
    if (!window.Flotzy) return;
    document.querySelectorAll('canvas[data-wave]').forEach(function (cv) {
      window.Flotzy.waveform(cv, cv.getAttribute('data-wave'));
    });
  }

  /* ---------- provenance badges ----------
     Classes backed by a real recording are marked as such, so the
     page never implies a synthesised specimen was collected.      */

  function markProvenance() {
    if (!window.Flotzy || !window.Flotzy.has) return;
    document.querySelectorAll('.specimen[id]').forEach(function (spec) {
      var btn = spec.querySelector('[data-fart]');
      if (!btn) return;
      var id = btn.getAttribute('data-fart');
      var real = window.Flotzy.has(id);
      var host = spec.querySelector('.specimen__id');
      if (!host || host.querySelector('.tag')) return;
      var tag = document.createElement('span');
      tag.className = 'tag ' + (real ? 'tag--meth' : 'tag--haz');
      tag.style.marginLeft = '.5rem';
      tag.textContent = real ? 'Recorded' : 'No recording';
      tag.title = real
        ? 'A real recording, sourced from Wikimedia Commons. See provenance below.'
        : 'Silent by definition — no recording of this class can exist.';
      host.appendChild(tag);
    });
  }

  /* ---------- meters animate in ---------- */

  function revealMeters() {
    var bars = document.querySelectorAll('.meter[data-v]');
    if (!bars.length) return;

    if (!('IntersectionObserver' in window)) {
      bars.forEach(function (b) { b.style.setProperty('--v', b.getAttribute('data-v')); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.setProperty('--v', e.target.getAttribute('data-v'));
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.15 });
    bars.forEach(function (b) { io.observe(b); });
  }

  /* ---------- range inputs echo their value ---------- */

  function bindRanges() {
    document.querySelectorAll('.ctrl input[type="range"]').forEach(function (r) {
      var out = r.closest('.ctrl').querySelector('output');
      if (!out) return;
      var unit = out.getAttribute('data-unit') || '';
      var fmt = function () {
        var v = parseFloat(r.value);
        var dec = (r.step && r.step.indexOf('.') > -1) ? r.step.split('.')[1].length : 0;
        out.textContent = v.toFixed(dec) + unit;
      };
      r.addEventListener('input', fmt);
      fmt();
    });
  }

  /* ---------- sortable tables ---------- */

  function bindSortable() {
    document.querySelectorAll('table[data-sortable]').forEach(function (table) {
      var tbody = table.tBodies[0];
      if (!tbody) return;

      table.querySelectorAll('th[data-sort]').forEach(function (th, idx) {
        th.tabIndex = 0;
        var col = Array.prototype.indexOf.call(th.parentNode.children, th);
        var type = th.getAttribute('data-sort'); // 'num' | 'text'

        function sort() {
          var asc = th.getAttribute('aria-sort') !== 'ascending';
          table.querySelectorAll('th[data-sort]').forEach(function (o) {
            o.removeAttribute('aria-sort');
          });
          th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');

          var rows = Array.prototype.slice.call(tbody.rows);
          rows.sort(function (a, b) {
            var av = a.cells[col], bv = b.cells[col];
            var x = av ? (av.getAttribute('data-v') || av.textContent).trim() : '';
            var y = bv ? (bv.getAttribute('data-v') || bv.textContent).trim() : '';
            var r;
            if (type === 'num') {
              r = (parseFloat(x) || 0) - (parseFloat(y) || 0);
            } else {
              r = x.localeCompare(y, undefined, { sensitivity: 'base' });
            }
            return asc ? r : -r;
          });
          rows.forEach(function (r) { tbody.appendChild(r); });
        }

        th.addEventListener('click', sort);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
        });
      });
    });
  }

  /* ---------- table filter box ---------- */

  function bindFilters() {
    document.querySelectorAll('[data-filters]').forEach(function (input) {
      var table = document.getElementById(input.getAttribute('data-filters'));
      if (!table || !table.tBodies[0]) return;
      var count = document.getElementById(input.getAttribute('data-count') || '');
      var rows = Array.prototype.slice.call(table.tBodies[0].rows);

      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        var shown = 0;
        rows.forEach(function (r) {
          var hit = !q || r.textContent.toLowerCase().indexOf(q) > -1;
          r.hidden = !hit;
          if (hit) shown++;
        });
        if (count) count.textContent = shown;
      });
    });
  }

  /* ---------- every button farts ----------
     Any control that doesn't already play something of its own gets a
     short quiet one on press. Controls that DO play something are left
     alone, so you never hear two at once.                             */

  var ALREADY_LOUD = '[data-fart], [data-noblip], #fireBtn, #ampFire, #ampBaseline, #hHear';

  function bindBlips() {
    if (!window.Flotzy || !window.Flotzy.blip) return;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var el = t.closest('button, a[href], .chip, label.switch, summary');
      if (!el) return;
      if (el.closest(ALREADY_LOUD)) return;      // it makes its own noise
      if (el.disabled || el.id === 'muteBtn') return;
      window.Flotzy.blip();
    }, true);
  }

  /* A way out, for anyone who has had enough. */
  function buildMuteButton() {
    var bar = document.querySelector('.topbar__in');
    if (!bar || !window.Flotzy || document.getElementById('muteBtn')) return;

    var b = document.createElement('button');
    b.id = 'muteBtn';
    b.type = 'button';
    b.className = 'mutebtn';
    bar.appendChild(b);

    function paint() {
      var m = window.Flotzy.isMuted();
      b.textContent = m ? '🔇' : '🔊';
      b.setAttribute('aria-pressed', String(m));
      b.title = m ? 'Sound is off — click to turn it back on'
                  : 'Sound is on — click to silence the whole site';
      b.setAttribute('aria-label', b.title);
    }
    b.addEventListener('click', function () {
      window.Flotzy.setMuted(!window.Flotzy.isMuted());
      paint();
    });
    paint();
  }

  /* ---------- boot ---------- */

  function init() {
    markNav();
    bindRanges();
    bindSortable();
    bindFilters();
    revealMeters();
    markProvenance();
    drawPreviews();
    if (window.Flotzy) window.Flotzy.bindButtons(document);
    buildMuteButton();
    bindBlips();

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(drawPreviews, 180);
    });

    // Stop everything on Escape — a courtesy to the open-plan office.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && window.Flotzy) {
        window.Flotzy.stopAll();
        document.querySelectorAll('[data-playing="true"]').forEach(function (b) {
          b.setAttribute('data-playing', 'false');
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
