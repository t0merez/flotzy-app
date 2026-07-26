/* ============================================================
   FLOTZY — assets/js/synth.js
   Physical-ish synthesis of anal sphincter reed-valve acoustics.

   The sphincter is modelled as a lip-reed oscillator (as in the
   brass family): a pressurised flow drives two apposed tissue
   folds into self-sustained oscillation. Fundamental frequency is
   set by aperture tension; timbre by turbulent noise and by the
   non-linear collapse of the aperture at high flow.

   Signal chain:
     [saw reed osc] --\
                       >-- [waveshaper] -- [LPF] -- [env gain] --\
     [band-passed noise]-/                                        \
     [sub thump] ------------------------------------------------->-- [cavity peak] -- [horn] -- [room] -- out

   Public API:
     Flotzy.play(profile, fx)      -> handle {stop(), promise}
     Flotzy.stopAll()
     Flotzy.analyser()             -> AnalyserNode (post-mix)
     Flotzy.preview(canvas, profile)
     Flotzy.PROFILES               -> named presets
   ============================================================ */

(function (global) {
  'use strict';

  /* ---------- context ---------- */

  var ctx = null, master = null, analyserNode = null, live = [];

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

  /* ---------- helpers ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dbToGain(db) { return Math.pow(10, db / 20); }

  var noiseCache = null;
  function noiseBuffer(c) {
    if (noiseCache && noiseCache.sampleRate === c.sampleRate) return noiseCache;
    var n = Math.floor(c.sampleRate * 3);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    // Slightly brown-tinted noise: turbulent flow has a downward spectral tilt.
    var last = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.055 * w) / 1.055;
      d[i] = w * 0.55 + last * 2.6;
    }
    noiseCache = buf;
    return buf;
  }

  var shaperCache = {};
  function shaperCurve(drive) {
    var key = drive.toFixed(2);
    if (shaperCache[key]) return shaperCache[key];
    var n = 2048, curve = new Float32Array(n), k = 1 + drive * 40;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      // Asymmetric soft clip — a valve opens and closes differently.
      var y = Math.tanh(k * x) / Math.tanh(k);
      curve[i] = x >= 0 ? y : y * 0.82;
    }
    shaperCache[key] = curve;
    return curve;
  }

  /* ---------- envelope / pitch curve generation ---------- */

  var SR_CURVE = 480; // curve points per second

  function envelopeCurve(p, rnd) {
    var n = Math.max(16, Math.round(p.dur * SR_CURVE));
    var env = new Float32Array(n);
    var atk = clamp(p.attack != null ? p.attack : 0.012, 0.001, p.dur * 0.5);
    var rel = clamp(p.release != null ? p.release : 0.09, 0.005, p.dur * 0.7);

    for (var i = 0; i < n; i++) {
      var t = (i / (n - 1)) * p.dur, v;

      // Body shape across the whole event
      var u = i / (n - 1);
      switch (p.shape) {
        case 'swell':  v = Math.sin(Math.PI * Math.pow(u, 0.85)); break;
        case 'decay':  v = Math.pow(1 - u, 1.6); break;
        case 'ramp':   v = Math.pow(u, 1.35); break;
        case 'stab':   v = Math.pow(1 - u, 3.4); break;
        case 'lumpy':  v = 0.55 + 0.45 * Math.sin(u * Math.PI * 3.1) * (1 - u * 0.5); break;
        default:       v = 1 - 0.35 * u; // 'even'
      }

      // Attack / release windows
      if (t < atk) v *= t / atk;
      var tr = p.dur - t;
      if (tr < rel) v *= tr / rel;

      // Burst gating (sputter / machine-gun)
      if (p.bursts > 1) {
        var g = Math.sin(Math.PI * u * p.bursts);
        v *= 0.18 + 0.82 * Math.abs(g);
      }

      // Flow instability
      v *= 1 - p.jitter * 0.3 * (rnd() * 0.5 + 0.5) * Math.abs(Math.sin(t * p.flutter * Math.PI * 2));

      env[i] = clamp(v, 0, 1);
    }
    env[0] = 0; env[n - 1] = 0;
    return env;
  }

  function pitchCurve(p, rnd) {
    var n = Math.max(16, Math.round(p.dur * SR_CURVE));
    var f = new Float32Array(n);
    var walk = 0;
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1), t = u * p.dur;
      var base = p.f0 * Math.pow(p.f1 / p.f0, Math.pow(u, 0.8));

      // Damped random walk = the raspy, irregular buzz
      walk = walk * 0.84 + (rnd() * 2 - 1) * p.jitter * 0.42;
      // Periodic flutter of the tissue folds
      var wob = 1 + p.jitter * 0.34 * Math.sin(2 * Math.PI * p.flutter * t);

      f[i] = clamp(base * (1 + walk) * wob, 22, 1400);
    }
    return f;
  }

  /* ---------- profile normalisation ---------- */

  var DEFAULTS = {
    id: 'anon', dur: 0.9, f0: 95, f1: 62, jitter: 0.5, flutter: 11,
    bright: 900, q: 5, wet: 0.35, rasp: 0.45, bursts: 1,
    shape: 'even', gain: 0.85, thump: 0.35, attack: 0.012, release: 0.09
  };

  function norm(p) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (p || {})) if (p[k] != null) o[k] = p[k];
    o.dur = clamp(o.dur, 0.08, 12);
    return o;
  }

  /* ---------- FX chain ---------- */

  function buildFx(c, fx) {
    fx = fx || {};
    var input = c.createGain(), node = input;

    // Cavity coupling — a Helmholtz resonance from a bucket, bath, chair well
    if (fx.cavityHz) {
      var peak = c.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = clamp(fx.cavityHz, 30, 4000);
      peak.Q.value = fx.cavityQ || 6;
      peak.gain.value = clamp(fx.cavityDb != null ? fx.cavityDb : 9, -24, 24);
      node.connect(peak); node = peak;
    }

    // Horn / megaphone — presence lift plus directional gain
    if (fx.presenceDb) {
      var pres = c.createBiquadFilter();
      pres.type = 'highshelf';
      pres.frequency.value = 1600;
      pres.gain.value = clamp(fx.presenceDb, -24, 24);
      node.connect(pres); node = pres;
    }

    // Substrate damping — upholstery eats the top end
    if (fx.dampDb) {
      var damp = c.createBiquadFilter();
      damp.type = 'highshelf';
      damp.frequency.value = 900;
      damp.gain.value = clamp(fx.dampDb, -30, 0);
      node.connect(damp); node = damp;
    }

    var out = c.createGain();
    out.gain.value = dbToGain(clamp(fx.gainDb || 0, -40, 26));
    node.connect(out);

    // Room — feedback delay network standing in for a tiled bathroom
    if (fx.room > 0) {
      var size = clamp(fx.room, 0, 1);
      var send = c.createGain();
      send.gain.value = size * 0.42;
      var wet = c.createGain();
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
      wet.gain.value = 0.5;
      out.connect(send);
      wet.connect(master);
    }

    out.connect(master);
    return input;
  }

  /* ---------- the event ---------- */

  function play(profile, fx) {
    var c = audio();
    if (!c) return { stop: function () {}, promise: Promise.resolve() };

    var p = norm(profile);
    var rnd = mulberry32(hashStr(p.id) ^ ((Math.random() * 1e9) | 0));
    var t0 = c.currentTime + 0.02;
    var dur = p.dur;
    var nodes = [];

    var dest = buildFx(c, fx);

    /* -- reed oscillator -- */
    var osc = c.createOscillator();
    osc.type = 'sawtooth';
    var pc = pitchCurve(p, rnd);
    osc.frequency.setValueCurveAtTime(pc, t0, dur);

    var shaper = c.createWaveShaper();
    shaper.curve = shaperCurve(p.rasp);
    shaper.oversample = '2x';

    var lpf = c.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = p.q;
    lpf.frequency.setValueAtTime(p.bright * 1.5, t0);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(90, p.bright * 0.55), t0 + dur);

    var oscGain = c.createGain();
    oscGain.gain.value = 0.5 * (1 - p.wet * 0.45);

    osc.connect(shaper); shaper.connect(lpf); lpf.connect(oscGain);

    /* -- turbulent noise layer (the squelch) -- */
    var noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c);
    noise.loop = true;
    noise.playbackRate.value = 0.8 + rnd() * 0.5;

    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(p.bright * 1.1, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(120, p.bright * 0.45), t0 + dur);

    var noiseGain = c.createGain();
    noiseGain.gain.value = p.wet * 0.42;

    noise.connect(bp); bp.connect(noiseGain);

    /* -- shared amplitude envelope -- */
    var env = c.createGain();
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(envelopeCurve(p, rnd), t0, dur);

    var vol = c.createGain();
    vol.gain.value = p.gain;

    oscGain.connect(env); noiseGain.connect(env);
    env.connect(vol); vol.connect(dest);

    /* -- sub thump: the initial pressure release transient -- */
    var sub = null;
    if (p.thump > 0.02) {
      sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(p.f0 * 0.85, t0);
      sub.frequency.exponentialRampToValueAtTime(Math.max(24, p.f0 * 0.34), t0 + Math.min(0.22, dur));
      var sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.exponentialRampToValueAtTime(p.thump * 0.7, t0 + 0.012);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(0.3, dur));
      sub.connect(sg); sg.connect(dest);
      sub.start(t0); sub.stop(t0 + dur + 0.05);
      nodes.push(sub);
    }

    osc.start(t0); osc.stop(t0 + dur + 0.05);
    noise.start(t0); noise.stop(t0 + dur + 0.05);
    nodes.push(osc, noise);

    var handle = {
      stopped: false,
      stop: function () {
        if (handle.stopped) return;
        handle.stopped = true;
        try { env.gain.cancelScheduledValues(c.currentTime); } catch (e) {}
        try {
          env.gain.setValueAtTime(env.gain.value, c.currentTime);
          env.gain.linearRampToValueAtTime(0, c.currentTime + 0.03);
        } catch (e) {}
        nodes.forEach(function (n) { try { n.stop(c.currentTime + 0.05); } catch (e) {} });
      }
    };

    handle.promise = new Promise(function (res) {
      global.setTimeout(function () {
        var i = live.indexOf(handle);
        if (i > -1) live.splice(i, 1);
        res();
      }, (dur + 0.12) * 1000);
    });

    live.push(handle);
    return handle;
  }

  function stopAll() {
    live.slice().forEach(function (h) { h.stop(); });
    live.length = 0;
  }

  /* ---------- static waveform preview (no audio needed) ---------- */

  function preview(canvas, profile) {
    if (!canvas || !canvas.getContext) return;
    var p = norm(profile);
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 300, h = canvas.clientHeight || 54;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue('--brown').trim() || '#6B4423';
    var soft = css.getPropertyValue('--rule-soft').trim() || '#DED0B7';

    // Mid-line
    g.strokeStyle = soft; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

    var rnd = mulberry32(hashStr(p.id));
    var env = envelopeCurve(p, mulberry32(hashStr(p.id)));
    var n = Math.max(60, Math.floor(w));
    var phase = 0;

    g.strokeStyle = ink;
    g.lineWidth = 1;
    g.beginPath();
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1);
      var e = env[Math.min(env.length - 1, Math.floor(u * env.length))];
      // Cheap oscillator: enough cycles to read as a buzz, not a blur.
      phase += (p.f0 / 900) * (1 + p.jitter * (rnd() - 0.5) * 1.4) * (Math.PI * 2) * 0.9;
      var s = Math.sin(phase) * (1 - p.rasp * 0.35) + (rnd() - 0.5) * p.wet * 0.8;
      var y = h / 2 - s * e * (h / 2 - 3);
      if (i === 0) g.moveTo(i * (w / n), y); else g.lineTo(i * (w / n), y);
    }
    g.stroke();

    // Envelope hull
    g.strokeStyle = ink; g.globalAlpha = 0.28; g.lineWidth = 1;
    [1, -1].forEach(function (sgn) {
      g.beginPath();
      for (var i = 0; i < n; i++) {
        var u = i / (n - 1);
        var e = env[Math.min(env.length - 1, Math.floor(u * env.length))];
        var y = h / 2 - sgn * e * (h / 2 - 3);
        if (i === 0) g.moveTo(i * (w / n), y); else g.lineTo(i * (w / n), y);
      }
      g.stroke();
    });
    g.globalAlpha = 1;
  }

  /* ---------- catalogue of specimen profiles ---------- */

  var PROFILES = {
    // id                dur   f0   f1  jit  flut  bright  q   wet  rasp  burst shape     gain thump
    sputterer:  { dur: 1.4, f0: 88,  f1: 70,  jitter: .85, flutter: 17, bright: 780,  q: 6,  wet: .42, rasp: .62, bursts: 6, shape: 'lumpy', gain: .8,  thump: .3 },
    silent:     { dur: 2.6, f0: 40,  f1: 33,  jitter: .12, flutter: 3,  bright: 190,  q: 1.4,wet: .82, rasp: .06, bursts: 1, shape: 'swell', gain: .28, thump: .04, attack: .5, release: .8 },
    trumpet:    { dur: 1.5, f0: 132, f1: 108, jitter: .3,  flutter: 8,  bright: 1500, q: 9,  wet: .18, rasp: .58, bursts: 1, shape: 'even',  gain: 1.0, thump: .5 },
    squeaker:   { dur: .7,  f0: 340, f1: 430, jitter: .22, flutter: 14, bright: 2400, q: 12, wet: .12, rasp: .3,  bursts: 1, shape: 'ramp',  gain: .72, thump: .06 },
    ripper:     { dur: 1.1, f0: 105, f1: 78,  jitter: .78, flutter: 26, bright: 1900, q: 7,  wet: .3,  rasp: .9,  bursts: 1, shape: 'decay', gain: 1.0, thump: .62 },
    machinegun: { dur: 1.9, f0: 118, f1: 96,  jitter: .55, flutter: 20, bright: 1250, q: 8,  wet: .25, rasp: .7,  bursts: 11,shape: 'even',  gain: .88, thump: .45 },
    bubbler:    { dur: 2.2, f0: 62,  f1: 48,  jitter: .68, flutter: 9,  bright: 420,  q: 4,  wet: .74, rasp: .2,  bursts: 5, shape: 'lumpy', gain: .66, thump: .22 },
    ghost:      { dur: 3.4, f0: 46,  f1: 41,  jitter: .2,  flutter: 2.5,bright: 260,  q: 2,  wet: .6,  rasp: .1,  bursts: 1, shape: 'even',  gain: .3,  thump: .05, attack: .7, release: 1.1 },
    wet:        { dur: .95, f0: 74,  f1: 55,  jitter: .8,  flutter: 15, bright: 560,  q: 5,  wet: .95, rasp: .5,  bursts: 2, shape: 'lumpy', gain: .8,  thump: .4 },
    crescendo:  { dur: 3.0, f0: 58,  f1: 168, jitter: .45, flutter: 10, bright: 1400, q: 8,  wet: .3,  rasp: .6,  bursts: 1, shape: 'ramp',  gain: .95, thump: .2 },
    sneezefart: { dur: .55, f0: 150, f1: 92,  jitter: .6,  flutter: 22, bright: 1700, q: 6,  wet: .3,  rasp: .75, bursts: 1, shape: 'stab',  gain: .9,  thump: .55 },
    chaircreak: { dur: .8,  f0: 210, f1: 246, jitter: .35, flutter: 12, bright: 2100, q: 10, wet: .2,  rasp: .35, bursts: 1, shape: 'even',  gain: .55, thump: .1 },
    marathon:   { dur: 6.5, f0: 78,  f1: 64,  jitter: .4,  flutter: 6,  bright: 900,  q: 6,  wet: .35, rasp: .5,  bursts: 3, shape: 'even',  gain: .78, thump: .35 },
    pop:        { dur: .16, f0: 160, f1: 96,  jitter: .3,  flutter: 18, bright: 1600, q: 6,  wet: .18, rasp: .55, bursts: 1, shape: 'stab',  gain: .85, thump: .6 },
    afterburner:{ dur: 2.4, f0: 96,  f1: 84,  jitter: .92, flutter: 30, bright: 2600, q: 11, wet: .28, rasp: .95, bursts: 1, shape: 'swell', gain: 1.0, thump: .7 }
  };

  Object.keys(PROFILES).forEach(function (k) { PROFILES[k].id = k; });

  /* ---------- optional real-recording overrides ----------
     Drop files in /audio and list them in audio/manifest.js as
     window.FLOTZY_AUDIO = { trumpet: 'audio/trumpet.mp3', ... }
     Any id present there is played back instead of being synthesised.
  -------------------------------------------------------- */

  var buffers = {};

  function overrideUrl(id) {
    var m = global.FLOTZY_AUDIO;
    return m && m[id] ? m[id] : null;
  }

  function playFile(id, url, fx) {
    var c = audio();
    var dest = buildFx(c, fx || {});
    var handle = { stop: function () {}, promise: Promise.resolve() };

    function start(buf) {
      var src = c.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();
      handle.stop = function () { try { src.stop(); } catch (e) {} };
      handle.promise = new Promise(function (r) { src.onended = r; });
    }

    if (buffers[id]) { start(buffers[id]); return handle; }

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (ab) { return c.decodeAudioData(ab); })
      .then(function (buf) { buffers[id] = buf; start(buf); })
      .catch(function () { play(PROFILES[id] || { id: id }, fx); });

    return handle;
  }

  /* ---------- public ---------- */

  var Flotzy = {
    PROFILES: PROFILES,
    ctx: audio,
    analyser: function () { audio(); return analyserNode; },
    preview: preview,
    stopAll: stopAll,
    play: function (profileOrId, fx) {
      var p = typeof profileOrId === 'string'
        ? (PROFILES[profileOrId] || { id: profileOrId })
        : profileOrId;
      var url = overrideUrl(p.id);
      return url ? playFile(p.id, url, fx) : play(p, fx);
    },
    /** Wire every [data-fart] play button on the page. */
    bindButtons: function (root) {
      (root || document).querySelectorAll('[data-fart]').forEach(function (btn) {
        if (btn.__bound) return;
        btn.__bound = true;
        var current = null;
        btn.addEventListener('click', function () {
          if (current && !current.stopped) { current.stop(); current = null; }
          Flotzy.stopAll();
          btn.setAttribute('data-playing', 'true');
          current = Flotzy.play(btn.getAttribute('data-fart'));
          current.promise.then(function () {
            btn.setAttribute('data-playing', 'false');
          });
        });
      });
    }
  };

  global.Flotzy = Flotzy;
})(window);
