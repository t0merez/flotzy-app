/* ============================================================
   FLOTZY — assets/js/player.js
   Playback of the recorded specimen library.

   Every sound on this site is a real recording (see audio/CREDITS.md).
   This module decodes them once, caches the buffers, and routes
   playback through an effects chain that models the acoustic
   environment: cavity resonance, horn loading, substrate damping
   and room reverberation. Medium and amplification effects are
   applied to the recording rather than to any synthesised source.

   Signal chain:
     [buffer @ playbackRate] -> [cavity peak] -> [presence shelf]
       -> [damping shelf] -> [gain] -> [room FDN] -> [analyser] -> out

   Public API:
     Flotzy.play(id, fx)   -> handle {stop(), promise}
     Flotzy.has(id)        -> is there a recording for this class?
     Flotzy.stopAll()
     Flotzy.analyser()
     Flotzy.waveform(canvas, id)
     Flotzy.bindButtons(root)
   ============================================================ */

(function (global) {
  'use strict';

  var ctx = null, master = null, analyserNode = null;
  var buffers = {}, pending = {}, live = [];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dbToGain(db) { return Math.pow(10, db / 20); }

  function audio() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.72;
      master.connect(analyserNode);
      analyserNode.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* A class may list several real recordings. Pick one at random so
     repeated presses give genuinely different farts of the same type. */
  function variants(id) {
    var m = global.FLOTZY_AUDIO, v = m && m[id];
    if (!v) return null;
    return typeof v === 'string' ? [v] : (v.length ? v : null);
  }
  function url(id) {
    var v = variants(id);
    return v ? v[(Math.random() * v.length) | 0] : null;
  }

  /* ---------- effects chain ---------- */

  function buildFx(c, fx) {
    fx = fx || {};
    var input = c.createGain(), node = input;

    // Cavity coupling — a bucket, a bathtub, a chair well
    if (fx.cavityHz) {
      var peak = c.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = clamp(fx.cavityHz, 30, 4000);
      peak.Q.value = fx.cavityQ || 6;
      peak.gain.value = clamp(fx.cavityDb != null ? fx.cavityDb : 9, -24, 24);
      node.connect(peak); node = peak;
    }

    // Horn loading — presence lift plus directivity
    if (fx.presenceDb) {
      var pres = c.createBiquadFilter();
      pres.type = 'highshelf';
      pres.frequency.value = 1600;
      pres.gain.value = clamp(fx.presenceDb, -24, 24);
      node.connect(pres); node = pres;
    }

    // Substrate / medium damping — upholstery and honey eat the top end
    if (fx.dampDb) {
      var damp = c.createBiquadFilter();
      damp.type = 'highshelf';
      damp.frequency.value = 900;
      damp.gain.value = clamp(fx.dampDb, -30, 0);
      node.connect(damp); node = damp;
    }

    var out = c.createGain();
    out.gain.value = dbToGain(clamp(fx.gainDb || 0, -40, 18));
    node.connect(out);

    // Room — a feedback delay network standing in for a tiled bathroom
    if (fx.room > 0) {
      var size = clamp(fx.room, 0, 1);
      var send = c.createGain();
      send.gain.value = size * 0.42;
      var wet = c.createGain();
      wet.gain.value = 0.5;
      var times = [0.021, 0.037, 0.053, 0.079];
      for (var i = 0; i < times.length; i++) {
        var dl = c.createDelay(1.0);
        dl.delayTime.value = times[i] * (0.6 + size * 1.9);
        var fb = c.createGain();
        fb.gain.value = 0.28 + size * 0.42;
        var tone = c.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 1200 + (fx.reflect || 0.5) * 5200;
        dl.connect(tone); tone.connect(fb); fb.connect(dl);
        send.connect(dl); dl.connect(wet);
      }
      out.connect(send);
      wet.connect(master);
    }

    out.connect(master);
    return input;
  }

  /* ---------- loading ---------- */

  function load(u) {
    if (buffers[u]) return Promise.resolve(buffers[u]);
    if (pending[u]) return pending[u];
    var c = audio();
    pending[u] = fetch(u)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        return new Promise(function (res, rej) {
          // Callback form for Safari, which still lacks the promise overload.
          var p = c.decodeAudioData(ab, res, rej);
          if (p && p.then) p.then(res, rej);
        });
      })
      .then(function (buf) { buffers[u] = buf; delete pending[u]; return buf; })
      .catch(function (e) { delete pending[u]; throw e; });
    return pending[u];
  }

  /* ---------- playback ---------- */

  function play(id, fx) {
    fx = fx || {};
    var c = audio();
    var handle = { stopped: false, stop: function () {}, promise: Promise.resolve() };
    var pick = url(id);
    if (!c || !pick || muted) return handle;

    var resolveDone;
    handle.promise = new Promise(function (r) { resolveDone = r; });
    live.push(handle);

    function finish() {
      if (handle.stopped) return;
      handle.stopped = true;
      var i = live.indexOf(handle);
      if (i > -1) live.splice(i, 1);
      resolveDone();
    }

    load(pick).then(function (buf) {
      if (handle.stopped) return;
      var src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clamp(fx.rate || 1, 0.25, 4);
      src.connect(buildFx(c, fx));
      src.onended = finish;
      src.start();
      handle.stop = function () { try { src.stop(); } catch (e) {} finish(); };
    }).catch(finish);

    return handle;
  }

  function stopAll() {
    live.slice().forEach(function (h) { h.stop(); });
    live.length = 0;
  }

  /* ---------- button blips ----------
     Every button on the site farts when you press it. Short clips only,
     played quietly and without interrupting anything already going, so
     it reads as a click sound rather than a whole event.               */

  var BLIPS = ['pop', 'sneezefart', 'pop', 'chaircreak', 'squeaker'];
  var muted = false;
  try { muted = localStorage.getItem('flotzy-mute') === '1'; } catch (e) {}

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('flotzy-mute', muted ? '1' : '0'); } catch (e) {}
    if (muted) stopAll();
  }

  function blip() {
    if (muted) return;
    var pool = BLIPS.filter(function (id) { return variants(id); });
    if (!pool.length) return;
    var id = pool[(Math.random() * pool.length) | 0];
    // quieter than a real one, and slightly retuned each press so a run of
    // clicks doesn't sound like a stuck loop
    play(id, { gainDb: -11, rate: 0.9 + Math.random() * 0.35 });
  }

  /* ---------- waveform ----------
     Drawn from peak envelopes measured at export time (audio/waveforms.js),
     so the shape on screen is the shape of the actual recording.        */

  function waveform(canvas, id) {
    if (!canvas || !canvas.getContext) return;
    var data = global.FLOTZY_WAVES && global.FLOTZY_WAVES[id];
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 300, h = canvas.clientHeight || 54;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var css = getComputedStyle(document.documentElement);
    var brown = css.getPropertyValue('--brown').trim() || '#6B4423';
    var soft = css.getPropertyValue('--rule-soft').trim() || '#DED0B7';
    var ink3 = css.getPropertyValue('--ink-3').trim() || '#86705A';

    g.strokeStyle = soft; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

    if (!data || !data.length) {
      g.fillStyle = ink3;
      g.font = '10px ui-monospace, monospace';
      g.fillText('NO SIGNAL — NO RECORDING EXISTS', 8, h / 2 - 6);
      return;
    }

    var n = data.length, bw = w / n, mid = h / 2, amp = h / 2 - 3;
    g.fillStyle = brown;
    for (var i = 0; i < n; i++) {
      var v = (data[i] / 100) * amp;
      g.globalAlpha = 0.85;
      g.fillRect(i * bw, mid - v, Math.max(0.7, bw - 0.4), v * 2);
    }
    g.globalAlpha = 1;
  }

  /* ---------- public ---------- */

  var Flotzy = {
    ctx: audio,
    analyser: function () { audio(); return analyserNode; },
    has: function (id) { return !!variants(id); },
    isReal: function (id) { return !!variants(id); },
    variantCount: function (id) { var v = variants(id); return v ? v.length : 0; },
    preload: function (id) { var u = url(id); return u ? load(u) : Promise.resolve(null); },
    waveform: waveform,
    play: play,
    stopAll: stopAll,
    blip: blip,
    setMuted: setMuted,
    isMuted: function () { return muted; },

    /** Wire every [data-fart] control. Controls without a recording are disabled. */
    bindButtons: function (root) {
      (root || document).querySelectorAll('[data-fart]').forEach(function (btn) {
        if (btn.__bound) return;
        btn.__bound = true;
        var id = btn.getAttribute('data-fart');

        if (!Flotzy.has(id)) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
          btn.title = 'No recording exists for this class — that is its defining feature.';
          return;
        }

        var current = null;
        btn.addEventListener('click', function () {
          if (current && !current.stopped) { current.stop(); current = null; }
          stopAll();
          btn.setAttribute('data-playing', 'true');
          current = play(id);
          current.promise.then(function () { btn.setAttribute('data-playing', 'false'); });
        });
      });
    }
  };

  global.Flotzy = Flotzy;
})(window);
