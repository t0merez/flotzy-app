/* ============================================================
   FLOTZY — assets/js/science.js
   Wires the multi-medium simulator to its instrument panel and
   drives the live spectrum display.
   ============================================================ */

(function () {
  'use strict';

  var cv = document.getElementById('sim');
  if (!cv || !window.FlotzySim) return;

  var MEDIA = window.FlotzySim.MEDIA;
  var VIEWS = window.FlotzySim.VIEWS;
  var sim = new window.FlotzySim.Sim(cv);

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- medium & view selectors ---------- */

  function buildChips(host, dict, current, onPick) {
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
        onPick(key);
      });
      host.appendChild(b);
    });
  }

  buildChips($('media'), MEDIA, sim.medium, function (k) {
    sim.medium = k;
    sim.parts.length = 0;
    sim.waves.length = 0;
    sim.detected = null;
    describeMedium();
  });

  buildChips($('views'), VIEWS, sim.view, function (k) {
    sim.view = k;
    $('viewHint').textContent = VIEWS[k].hint;
  });

  function describeMedium() {
    var m = MEDIA[sim.medium];
    $('medLabel').textContent = m.label;
    $('medSub').textContent = m.sub;
    $('medNote').textContent = m.note;
    $('fireBtn').disabled = false;
    $('silentWarn').hidden = m.c > 0;
  }

  /* ---------- sliders ---------- */

  function bindSlider(id, prop, transform) {
    var el = $(id);
    if (!el) return;
    var apply = function () {
      sim[prop] = transform ? transform(parseFloat(el.value)) : parseFloat(el.value);
    };
    el.addEventListener('input', apply);
    apply();
  }

  bindSlider('aperture', 'aperture');
  bindSlider('volume', 'volume');
  bindSlider('bodyT', 'bodyT');
  bindSlider('ambientT', 'ambientT');

  /* ---------- readouts ---------- */

  var fields = ['velocity', 'reynolds', 'regime', 'soundSpeed', 'soundArrival', 'front', 'density', 'detect'];
  sim.onReadout = function (r) {
    fields.forEach(function (f) {
      var el = $('r-' + f);
      if (el && el.textContent !== r[f]) el.textContent = r[f];
    });
  };

  /* ---------- fire ---------- */

  function fire() {
    sim.fire();

    var m = MEDIA[sim.medium];
    var classKey = $('fartClass').value;
    var base = window.Flotzy && window.Flotzy.PROFILES[classKey];

    if (!base || !window.Flotzy) return;

    if (m.c === 0) {
      // Vacuum: the simulation runs, the speakers do not.
      flash('NO SOUND — vacuum carries no pressure wave');
      return;
    }

    var a = m.audio;
    var p = {};
    Object.keys(base).forEach(function (k) { p[k] = base[k]; });
    p.id = classKey + '-' + sim.medium;
    p.base = classKey;                    // lets a real recording resolve through
    p.f0 = base.f0 * a.f0Mul;
    p.f1 = base.f1 * a.f0Mul;
    p.bright = base.bright * a.brightMul;

    window.Flotzy.stopAll();
    window.Flotzy.play(p, {
      dampDb: a.dampDb, room: a.room, gainDb: 0,
      rate: a.rate                        // recordings shift by playback rate instead
    });
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
    sim.parts.length = 0;
    sim.waves.length = 0;
    sim.detected = null;
    if (window.Flotzy) window.Flotzy.stopAll();
  });

  /* ---------- live spectrum ---------- */

  var spec = document.getElementById('spectrum');
  if (spec) {
    var sg = spec.getContext('2d');
    var sized = false;

    function sizeSpec() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = spec.clientWidth || 400;
      spec.style.height = '120px';
      spec.width = Math.round(w * dpr);
      spec.height = Math.round(120 * dpr);
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      sized = true;
      return { w: w, h: 120 };
    }
    var dims = sizeSpec();
    window.addEventListener('resize', function () { dims = sizeSpec(); });

    var bins = null;
    function drawSpectrum() {
      requestAnimationFrame(drawSpectrum);
      if (!sized) return;
      var an = window.Flotzy && window.Flotzy.__analyser;
      var css = getComputedStyle(document.documentElement);
      var w = dims.w, h = dims.h;

      sg.clearRect(0, 0, w, h);
      sg.fillStyle = '#0E1218';
      sg.fillRect(0, 0, w, h);

      if (!an) {
        sg.fillStyle = 'rgba(255,255,255,.35)';
        sg.font = '11px ui-monospace, monospace';
        sg.fillText('AWAITING FIRST EMISSION — press FIRE', 12, h / 2);
        return;
      }
      if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(bins);

      // Only the lowest ~4 kHz carries anything of interest here.
      var n = Math.floor(bins.length * 0.18);
      var bw = w / n;
      for (var i = 0; i < n; i++) {
        var v = bins[i] / 255;
        var bh = v * (h - 16);
        var t = i / n;
        var r = Math.round(110 + t * 145), g2 = Math.round(70 + v * 120), b = Math.round(40 + t * 40);
        sg.fillStyle = 'rgba(' + r + ',' + g2 + ',' + b + ',' + (0.35 + v * 0.65) + ')';
        sg.fillRect(i * bw, h - bh - 12, Math.max(1, bw - 0.5), bh);
      }

      sg.fillStyle = 'rgba(255,255,255,.35)';
      sg.font = '9px ui-monospace, monospace';
      var sr = 48000, nyq = sr / 2, span = nyq * 0.18;
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        sg.fillText(Math.round(span * f) + ' Hz', f * w + (f === 1 ? -44 : 2), h - 2);
      });
    }
    drawSpectrum();
  }

  /* Expose the analyser once the context exists, so the spectrum can find it. */
  var origPlay = window.Flotzy && window.Flotzy.play;
  if (origPlay) {
    window.Flotzy.play = function () {
      var h = origPlay.apply(window.Flotzy, arguments);
      window.Flotzy.__analyser = window.Flotzy.analyser();
      return h;
    };
  }

  describeMedium();
  $('viewHint').textContent = VIEWS[sim.view].hint;
  sim.start();
})();
