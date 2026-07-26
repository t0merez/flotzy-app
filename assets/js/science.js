/* ============================================================
   FLOTZY — assets/js/science.js
   Hooks the simulator up to its buttons.
   ============================================================ */

(function () {
  'use strict';

  var cv = document.getElementById('sim');
  if (!cv || !window.FlotzySim) return;

  var MEDIA = window.FlotzySim.MEDIA;
  var VIEWS = window.FlotzySim.VIEWS;
  var sim = new window.FlotzySim.Sim(cv);
  var $ = function (id) { return document.getElementById(id); };

  function chips(host, dict, current, pick) {
    host.innerHTML = '';
    Object.keys(dict).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = dict[key].label;
      b.setAttribute('aria-pressed', String(key === current));
      b.addEventListener('click', function () {
        host.querySelectorAll('.chip').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        pick(key);
      });
      host.appendChild(b);
    });
  }

  chips($('media'), MEDIA, sim.medium, function (k) {
    sim.medium = k;
    sim.clear();
    describe();
  });

  chips($('views'), VIEWS, sim.view, function (k) {
    sim.view = k;
    $('viewHint').textContent = VIEWS[k].hint;
  });

  function describe() {
    var m = MEDIA[sim.medium];
    $('medLabel').textContent = m.label;
    $('medSub').textContent = m.sub;
    $('medNote').textContent = m.note;
    $('silentWarn').hidden = !!m.sound;
  }

  var sizeEl = $('size');
  if (sizeEl) {
    var apply = function () { sim.size = parseFloat(sizeEl.value); };
    sizeEl.addEventListener('input', apply);
    apply();
  }

  var fields = ['spread', 'gap', 'heard', 'smelled', 'speed'];
  sim.onReadout = function (r) {
    fields.forEach(function (f) {
      var el = $('r-' + f);
      if (el && el.textContent !== r[f]) el.textContent = r[f];
    });
  };

  function fire() {
    sim.fire();
    var m = MEDIA[sim.medium];
    var pick = $('fartClass') ? $('fartClass').value : 'sputterer';
    if (!window.Flotzy) return;

    if (!m.sound) { flash('No sound out here. Space is silent.'); return; }
    if (!window.Flotzy.has(pick)) { flash('That one has no recording — it is a silent one.'); return; }

    var a = m.audio;
    window.Flotzy.stopAll();
    window.Flotzy.play(pick, { dampDb: a.dampDb, room: a.room, reflect: 0.6, rate: a.rate });
  }

  function flash(msg) {
    var el = $('flash');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.hidden = true; }, 2600);
  }

  $('fireBtn').addEventListener('click', fire);
  $('resetBtn').addEventListener('click', function () {
    sim.clear();
    if (window.Flotzy) window.Flotzy.stopAll();
  });

  describe();
  $('viewHint').textContent = VIEWS[sim.view].hint;
  sim.start();
})();
