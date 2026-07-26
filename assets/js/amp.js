/* ============================================================
   FLOTZY — assets/js/amp.js
   Acoustic amplification stack + Helmholtz cavity calculator.

   Gains do not sum linearly: each successive technique acts on
   an already-modified signal and returns less. We apply a
   diminishing-returns model — techniques sorted by magnitude,
   the nth contributing g·0.72^(n−1) — which keeps the totals in
   the region of physical plausibility. Barely.
   ============================================================ */

(function () {
  'use strict';

  var BASELINE_SPL = 62;         // dB @ 1 m, untreated FL-001 on a soft chair
  var BASELINE_CLASS = 'sputterer';
  var FALLOFF = 0.72;

  /* ---------- technique library ---------- */

  var TECHNIQUES = {
    retention:     { db: 6, group: 'Source',      rate: 1.10, fx: { gainDb: 2 } },
    tensioning:    { db: 3, group: 'Source',      rate: 1.22, fx: { presenceDb: 2 } },
    lean:          { db: 4, group: 'Source',      fx: { presenceDb: 3, gainDb: 1 } },
    carbonation:   { db: 4, group: 'Source',      rate: 0.94, fx: { gainDb: 1 } },
    hardSubstrate: { db: 5, group: 'Substrate',   fx: { presenceDb: 4, reflect: 0.8 } },
    skinLeather:   { db: 3, group: 'Substrate',   fx: { presenceDb: 2, gainDb: 1 } },
    nylon:         { db: 2, group: 'Substrate',   fx: { presenceDb: 2 } },
    cavity:        { db: 9, group: 'Coupling',    fx: { cavityHz: 118, cavityQ: 9, cavityDb: 13 } },
    megaphone:     { db: 6, group: 'Coupling',    fx: { presenceDb: 8 } },
    corner:        { db: 6, group: 'Environment', fx: { gainDb: 3 } },
    tiled:         { db: 7, group: 'Environment', fx: { room: 0.8, reflect: 0.9 } }
  };

  /* ---------- SPL reference ladder ---------- */

  var LADDER = [
    [30, 'a whisper at 1 m'],
    [45, 'a quiet library'],
    [55, 'a refrigerator hum'],
    [62, 'normal conversation'],
    [70, 'a vacuum cleaner'],
    [78, 'a garbage disposal'],
    [85, 'city traffic — hearing protection advised over 8 h'],
    [92, 'a petrol lawnmower'],
    [100, 'a passing motorcycle'],
    [110, 'a chainsaw at 1 m'],
    [120, 'a jet engine at 60 m — threshold of pain']
  ];

  function describeSpl(spl) {
    var best = LADDER[0];
    for (var i = 0; i < LADDER.length; i++) {
      if (spl >= LADDER[i][0]) best = LADDER[i];
    }
    return best[1];
  }

  /* ---------- stack computation ---------- */

  function activeKeys() {
    var out = [];
    document.querySelectorAll('input[data-tech]:checked').forEach(function (i) {
      out.push(i.getAttribute('data-tech'));
    });
    return out;
  }

  function computeStack(keys) {
    var gains = keys.map(function (k) { return TECHNIQUES[k].db; }).sort(function (a, b) { return b - a; });
    var naive = gains.reduce(function (a, b) { return a + b; }, 0);
    var eff = 0;
    for (var i = 0; i < gains.length; i++) eff += gains[i] * Math.pow(FALLOFF, i);
    return { naive: naive, effective: eff, spl: BASELINE_SPL + eff };
  }

  function buildSignal(keys) {
    // Techniques act on the recording, not on a synthesised source: tension
    // and pressure retune it (playback rate), everything else is filtering,
    // cavity resonance and room.
    var fx = { gainDb: 0, room: 0, reflect: 0.5 };
    var rate = 1;

    keys.forEach(function (k) {
      var t = TECHNIQUES[k];
      if (t.rate) rate *= t.rate;
      var f = t.fx;
      if (f.gainDb)     fx.gainDb += f.gainDb;
      if (f.presenceDb) fx.presenceDb = (fx.presenceDb || 0) + f.presenceDb;
      if (f.dampDb)     fx.dampDb = (fx.dampDb || 0) + f.dampDb;
      if (f.cavityHz)   { fx.cavityHz = f.cavityHz; fx.cavityQ = f.cavityQ; fx.cavityDb = f.cavityDb; }
      if (f.room)       fx.room = Math.max(fx.room, f.room);
      if (f.reflect)    fx.reflect = Math.max(fx.reflect, f.reflect);
    });

    // The listener's ears are not part of the experiment: modelled gain
    // becomes audible character rather than raw output level.
    fx.gainDb = Math.min(fx.gainDb, 6);
    fx.rate = Math.min(rate, 1.5);
    return fx;
  }

  /* ---------- UI ---------- */

  var $ = function (id) { return document.getElementById(id); };

  function refresh() {
    var keys = activeKeys();
    var s = computeStack(keys);

    $('splTotal').textContent = s.spl.toFixed(1);
    $('splGain').textContent = (s.effective >= 0 ? '+' : '') + s.effective.toFixed(1);
    $('splNaive').textContent = '+' + s.naive.toFixed(0);
    $('splCount').textContent = keys.length;
    $('splCompare').textContent = describeSpl(s.spl);

    var pct = Math.min(100, (s.spl - 40) / 80 * 100);
    $('splMeter').style.setProperty('--v', pct.toFixed(1));
    $('splMeter').style.setProperty('--c', s.spl > 85 ? 'var(--hazard)' : s.spl > 72 ? 'var(--ochre)' : 'var(--methane)');

    $('hearingWarn').hidden = s.spl < 85;
  }

  document.querySelectorAll('input[data-tech]').forEach(function (i) {
    i.addEventListener('change', refresh);
  });

  var fireBtn = $('ampFire');
  if (fireBtn) {
    fireBtn.addEventListener('click', function () {
      if (!window.Flotzy) return;
      window.Flotzy.stopAll();
      window.Flotzy.play(BASELINE_CLASS, buildSignal(activeKeys()));
    });
  }

  var baseBtn = $('ampBaseline');
  if (baseBtn) {
    baseBtn.addEventListener('click', function () {
      if (!window.Flotzy) return;
      window.Flotzy.stopAll();
      window.Flotzy.play(BASELINE_CLASS, { dampDb: -8 });
    });
  }

  var allBtn = $('ampAll');
  if (allBtn) {
    allBtn.addEventListener('click', function () {
      var boxes = document.querySelectorAll('input[data-tech]');
      var anyOff = Array.prototype.some.call(boxes, function (b) { return !b.checked; });
      boxes.forEach(function (b) { b.checked = anyOff; });
      refresh();
    });
  }

  /* ---------- Helmholtz calculator ---------- */

  function helmholtz() {
    var V = parseFloat($('hV').value) / 1000;      // litres -> m³
    var A = parseFloat($('hA').value) / 10000;     // cm² -> m²
    var L = parseFloat($('hL').value) / 100;       // cm -> m
    if (!(V > 0 && A > 0 && L > 0)) return null;
    // End correction: an open neck behaves as if slightly longer.
    var Leff = L + 0.85 * Math.sqrt(A / Math.PI);
    return (343 / (2 * Math.PI)) * Math.sqrt(A / (V * Leff));
  }

  function refreshHelmholtz() {
    var f = helmholtz();
    if (f === null || !isFinite(f)) { $('hOut').textContent = '—'; return; }
    $('hOut').textContent = f.toFixed(1);
    var note = f < 60 ? 'sub-bass — felt more than heard'
             : f < 130 ? 'bass — reinforces the fundamental of most classes'
             : f < 300 ? 'low-mid — adds body and projection'
             : f < 700 ? 'mid — adds honk'
             : 'high — thin, whistling, generally a mistake';
    $('hNote').textContent = note;
    $('hMeter').style.setProperty('--v', Math.min(100, f / 8).toFixed(1));
  }

  ['hV', 'hA', 'hL'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', refreshHelmholtz);
  });

  document.querySelectorAll('[data-cavity]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-cavity').split(',');
      $('hV').value = v[0]; $('hA').value = v[1]; $('hL').value = v[2];
      document.querySelectorAll('[data-cavity]').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      refreshHelmholtz();
      ['hV', 'hA', 'hL'].forEach(function (id) {
        var el = $(id);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      refreshHelmholtz();
    });
  });

  var hearBtn = $('hHear');
  if (hearBtn) {
    hearBtn.addEventListener('click', function () {
      var f = helmholtz();
      if (!window.Flotzy || f === null) return;
      window.Flotzy.stopAll();
      window.Flotzy.play('trumpet', { cavityHz: f, cavityQ: 11, cavityDb: 15, room: 0.5, reflect: 0.85 });
    });
  }

  refresh();
  refreshHelmholtz();
})();
