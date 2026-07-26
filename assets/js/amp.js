/* ============================================================
   FLOTZY — assets/js/amp.js
   The loudness stack, and the bucket calculator.

   Tick things on, watch the number go up, press the button to
   hear it. The tricks don't simply add up — each one works on a
   sound the last one already changed — so later ones count for
   less than the first.
   ============================================================ */

(function () {
  'use strict';

  var BASE_DB = 62;              // a normal fart on a soft chair
  var BASE_CLASS = 'sputterer';
  var FALLOFF = 0.72;

  var TRICKS = {
    holdItIn:   { db: 6, rate: 1.10, fx: { gainDb: 2 } },
    clench:     { db: 3, rate: 1.22, fx: { presenceDb: 2 } },
    lean:       { db: 4, fx: { presenceDb: 3, gainDb: 1 } },
    fizzy:      { db: 4, rate: 0.94, fx: { gainDb: 1 } },
    hardSeat:   { db: 5, fx: { presenceDb: 4, reflect: 0.8 } },
    bareSkin:   { db: 3, fx: { presenceDb: 2, gainDb: 1 } },
    tracksuit:  { db: 2, fx: { presenceDb: 2 } },
    bucket:     { db: 9, fx: { cavityHz: 118, cavityQ: 9, cavityDb: 13 } },
    cuppedHand: { db: 6, fx: { presenceDb: 8 } },
    corner:     { db: 6, fx: { gainDb: 3 } },
    bathroom:   { db: 7, fx: { room: 0.8, reflect: 0.9 } }
  };

  /* what that many decibels actually sounds like */
  var LADDER = [
    [30, 'a whisper'],
    [45, 'a quiet room'],
    [55, 'a fridge humming'],
    [62, 'someone talking'],
    [70, 'a vacuum cleaner'],
    [78, 'a food blender'],
    [85, 'busy traffic'],
    [92, 'a lawnmower'],
    [100, 'a motorbike going past'],
    [110, 'a chainsaw']
  ];

  function describe(db) {
    var best = LADDER[0];
    for (var i = 0; i < LADDER.length; i++) if (db >= LADDER[i][0]) best = LADDER[i];
    return best[1];
  }

  var $ = function (id) { return document.getElementById(id); };

  function activeKeys() {
    var out = [];
    document.querySelectorAll('input[data-tech]:checked').forEach(function (i) {
      out.push(i.getAttribute('data-tech'));
    });
    return out;
  }

  function total(keys) {
    var gains = keys.map(function (k) { return TRICKS[k].db; }).sort(function (a, b) { return b - a; });
    var eff = 0;
    for (var i = 0; i < gains.length; i++) eff += gains[i] * Math.pow(FALLOFF, i);
    return { gain: eff, db: BASE_DB + eff };
  }

  function chain(keys) {
    var fx = { gainDb: 0, room: 0, reflect: 0.5 }, rate = 1;
    keys.forEach(function (k) {
      var t = TRICKS[k];
      if (t.rate) rate *= t.rate;
      var f = t.fx;
      if (f.gainDb) fx.gainDb += f.gainDb;
      if (f.presenceDb) fx.presenceDb = (fx.presenceDb || 0) + f.presenceDb;
      if (f.cavityHz) { fx.cavityHz = f.cavityHz; fx.cavityQ = f.cavityQ; fx.cavityDb = f.cavityDb; }
      if (f.room) fx.room = Math.max(fx.room, f.room);
      if (f.reflect) fx.reflect = Math.max(fx.reflect, f.reflect);
    });
    // keep it kind to the listener's ears
    fx.gainDb = Math.min(fx.gainDb, 6);
    fx.rate = Math.min(rate, 1.5);
    return fx;
  }

  function refresh() {
    var keys = activeKeys(), s = total(keys);
    $('splTotal').textContent = s.db.toFixed(0);
    $('splGain').textContent = (s.gain >= 0 ? '+' : '') + s.gain.toFixed(0);
    $('splCount').textContent = keys.length;
    $('splCompare').textContent = describe(s.db);

    $('splMeter').style.setProperty('--v', Math.min(100, (s.db - 40) / 80 * 100).toFixed(1));
    $('splMeter').style.setProperty('--c',
      s.db > 85 ? 'var(--hazard)' : s.db > 72 ? 'var(--ochre)' : 'var(--methane)');
    $('hearingWarn').hidden = s.db < 85;
  }

  document.querySelectorAll('input[data-tech]').forEach(function (i) {
    i.addEventListener('change', refresh);
  });

  if ($('ampFire')) $('ampFire').addEventListener('click', function () {
    if (!window.Flotzy) return;
    window.Flotzy.stopAll();
    window.Flotzy.play(BASE_CLASS, chain(activeKeys()));
  });

  if ($('ampBaseline')) $('ampBaseline').addEventListener('click', function () {
    if (!window.Flotzy) return;
    window.Flotzy.stopAll();
    window.Flotzy.play(BASE_CLASS, { dampDb: -8 });
  });

  if ($('ampAll')) $('ampAll').addEventListener('click', function () {
    var boxes = document.querySelectorAll('input[data-tech]');
    var anyOff = Array.prototype.some.call(boxes, function (b) { return !b.checked; });
    boxes.forEach(function (b) { b.checked = anyOff; });
    refresh();
  });

  /* ---------- the bucket calculator ----------
     Any container with one opening rings at its own note, the same way a
     bottle does when you blow across the top. Bigger container, lower
     note. The maths stays out of sight; you just move the sliders.     */

  function ringNote() {
    var V = parseFloat($('hV').value) / 1000;    // litres -> cubic metres
    var A = parseFloat($('hA').value) / 10000;   // cm² -> m²
    var L = parseFloat($('hL').value) / 100;     // cm -> m
    if (!(V > 0 && A > 0 && L > 0)) return null;
    var Leff = L + 0.85 * Math.sqrt(A / Math.PI);
    return (343 / (2 * Math.PI)) * Math.sqrt(A / (V * Leff));
  }

  function refreshCavity() {
    var f = ringNote();
    if (f === null || !isFinite(f)) { $('hOut').textContent = '—'; return; }
    $('hOut').textContent = f.toFixed(0);
    $('hNote').textContent =
        f < 60 ? 'so low you feel it more than hear it'
      : f < 130 ? 'a deep boom — this is the good range'
      : f < 300 ? 'full and round, carries well'
      : f < 700 ? 'honky'
      : 'thin and whistly, probably a mistake';
    $('hMeter').style.setProperty('--v', Math.min(100, f / 8).toFixed(1));
  }

  ['hV', 'hA', 'hL'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', refreshCavity);
  });

  document.querySelectorAll('[data-cavity]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-cavity').split(',');
      $('hV').value = v[0]; $('hA').value = v[1]; $('hL').value = v[2];
      document.querySelectorAll('[data-cavity]').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      ['hV', 'hA', 'hL'].forEach(function (id) {
        $(id).dispatchEvent(new Event('input', { bubbles: true }));
      });
      refreshCavity();
    });
  });

  if ($('hHear')) $('hHear').addEventListener('click', function () {
    var f = ringNote();
    if (!window.Flotzy || f === null) return;
    window.Flotzy.stopAll();
    window.Flotzy.play('ripper', { cavityHz: f, cavityQ: 11, cavityDb: 15, room: 0.5, reflect: 0.85 });
  });

  refresh();
  refreshCavity();
})();
