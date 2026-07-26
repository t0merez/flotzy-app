/* ============================================================
   FLOTZY — assets/js/sim.js
   Multi-medium flatal propagation simulator.

   A Lagrangian particle model. Each parcel of emitted gas is
   advected under drag, buoyancy and stochastic diffusion, with
   coefficients taken from the surrounding medium. Five rendering
   modes expose different physics of the same simulation state.

   Domain is 6.0 m wide. Source at left; detector (bystander) at
   2.0 m. Acoustic view is shown in slow motion — real arrival
   times are reported in the readouts, not drawn to scale.
   ============================================================ */

(function (global) {
  'use strict';

  var DOMAIN_W = 6.0;   // metres across the canvas
  var DETECTOR_X = 2.0; // metres from source

  /* ---------- medium library ----------
     rho   kg/m³      density
     mu    Pa·s       dynamic viscosity
     c     m/s        speed of sound (0 = none)
     buoy  —          net upward acceleration on warm gas, m/s²
     drag  —          velocity damping coefficient
     diff  —          turbulent/molecular spreading
     grav  —          sign of gravity on the parcel (+down, −up)
     absorb —         fraction of parcels captured per second
  --------------------------------------- */

  var MEDIA = {
    air: {
      label: 'Standard Air', sub: '1 atm · 21 °C · still',
      rho: 1.20, mu: 1.81e-5, c: 343, buoy: 0.55, drag: 1.6, diff: 0.30,
      grav: 0, absorb: 0, audible: true, tint: '#8B5E34',
      audio: { brightMul: 1, f0Mul: 1, dampDb: 0, room: 0.18, rate: 1 },
      note: 'The reference case. A warm, low-density plume rises slowly while turbulent diffusion broadens it. Detection at 2 m typically follows within a few seconds.'
    },
    water: {
      label: 'Fresh Water', sub: '998 kg/m³ · 20 °C',
      rho: 998, mu: 1.00e-3, c: 1482, buoy: 7.8, drag: 5.5, diff: 0.04,
      grav: 0, absorb: 0, audible: true, tint: '#4E7E9B',
      audio: { brightMul: 0.35, f0Mul: 0.85, dampDb: -14, room: 0.5, rate: 0.82 },
      note: 'Density rises by a factor of 830. The plume cannot disperse — it collapses into discrete buoyant bubbles that ascend at 20–30 cm/s and produce sound at the surface on rupture, not at the source.'
    },
    honey: {
      label: 'Honey', sub: '1420 kg/m³ · µ ≈ 10 Pa·s',
      rho: 1420, mu: 10, c: 2030, buoy: 1.1, drag: 22, diff: 0.004,
      grav: 0, absorb: 0, audible: true, tint: '#B8862B',
      audio: { brightMul: 0.14, f0Mul: 0.7, dampDb: -22, room: 0.05, rate: 0.70 },
      note: 'Viscosity is 550 000 times that of air. Reynolds number collapses to order 1 — the flow is fully laminar, creeping, and reversible. The emission essentially does not go anywhere.'
    },
    vacuum: {
      label: 'Vacuum', sub: '0 Pa · hard vacuum',
      rho: 0, mu: 0, c: 0, buoy: 0, drag: 0, diff: 1.4,
      grav: 0, absorb: 0, audible: false, tint: '#9AA7B4',
      audio: { brightMul: 1, f0Mul: 1, dampDb: -120, room: 0, rate: 1 },
      note: 'No medium, therefore no sound — pressure waves require something to be a wave in. The gas undergoes free molecular expansion in every direction at once and never stops. Newton\'s third law applies: the operator is now propulsion.'
    },
    upholstery: {
      label: 'Upholstery', sub: 'porous solid · Darcy flow',
      rho: 60, mu: 4e-4, c: 180, buoy: 0.1, drag: 30, diff: 0.02,
      grav: 0, absorb: 0.9, audible: true, tint: '#7A5A3E',
      audio: { brightMul: 0.22, f0Mul: 0.92, dampDb: -19, room: 0, rate: 0.95 },
      note: 'Flow through a porous medium follows Darcy\'s law: velocity is proportional to pressure gradient and inversely proportional to viscosity, with a permeability term that is brutally small. The fabric acts as both an acoustic absorber and a physical filter. It also retains the gas and releases it later, which is the entire problem with sofas.'
    },
    zerog: {
      label: 'Zero-G Cabin', sub: 'air · microgravity',
      rho: 1.20, mu: 1.81e-5, c: 343, buoy: 0, drag: 1.6, diff: 0.34,
      grav: 0, absorb: 0, audible: true, tint: '#8B5E34',
      audio: { brightMul: 1, f0Mul: 1, dampDb: 0, room: 0.35, rate: 1 },
      note: 'Without buoyancy there is no convection, so the plume expands as a symmetric sphere and stays exactly where it was made. Aboard crewed spacecraft this is managed by continuous forced ventilation. It is managed very deliberately.'
    },
    ln2: {
      label: 'Liquid Nitrogen', sub: '77 K · cryogenic bath',
      rho: 807, mu: 1.6e-4, c: 850, buoy: 9.5, drag: 4.0, diff: 0.02,
      grav: 0, absorb: 0.35, audible: true, tint: '#7FA8C4',
      audio: { brightMul: 2.1, f0Mul: 1.25, dampDb: -8, room: 0.4, rate: 1.15 },
      note: 'At 77 K the CO₂ fraction desublimates immediately and the water vapour flash-freezes. Parcels crystallise and are removed from the gas phase. The remaining N₂ and H₂ boil the bath violently. Do not do this.'
    },
    sf6: {
      label: 'Sulfur Hexafluoride', sub: '6.16 kg/m³ · dense gas',
      rho: 6.16, mu: 1.53e-5, c: 134, buoy: -2.6, drag: 2.2, diff: 0.18,
      grav: 0, absorb: 0, audible: true, tint: '#6E7F35',
      audio: { brightMul: 0.39, f0Mul: 0.62, dampDb: -2, room: 0.22, rate: 0.62 },
      note: 'Five times denser than air, so the plume sinks and pools at floor level instead of rising. Sound travels at 134 m/s — 39% of the speed in air — which drops every resonance by roughly an octave and a half. This is the anti-helium.'
    },
    helium: {
      label: 'Helium Atmosphere', sub: '0.166 kg/m³ · 100% He',
      rho: 0.166, mu: 1.99e-5, c: 1007, buoy: 4.2, drag: 1.1, diff: 0.62,
      grav: 0, absorb: 0, audible: true, tint: '#C08A4E',
      audio: { brightMul: 2.94, f0Mul: 1.08, dampDb: 0, room: 0.25, rate: 1.71 },
      note: 'Sound travels at 1007 m/s — 2.9× the speed in air — raising every cavity resonance by about an octave and a half while the reed frequency barely moves. The result is the same effect helium has on speech, applied to the other end. Note also that the plume ascends four times faster.'
    }
  };

  var VIEWS = {
    plume:    { label: 'Visible Plume',  hint: 'Direct rendering of gas parcel density.' },
    thermal:  { label: 'Thermal / IR',   hint: 'Parcels false-coloured by temperature. 37 °C source against ambient.' },
    acoustic: { label: 'Acoustic',       hint: 'Pressure wavefronts, shown in slow motion. Real arrival times in readouts.' },
    schlieren:{ label: 'Schlieren',      hint: 'Refractive-index gradient — how a physicist photographs invisible gas.' },
    ppm:      { label: 'Concentration',  hint: 'Coarse-grid concentration field in parts per million.' }
  };

  /* ---------- utilities ---------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function irColor(t) { // 0..1 -> iron palette
    t = clamp(t, 0, 1);
    var stops = [
      [0, 8, 12, 40], [0.22, 60, 20, 110], [0.45, 190, 40, 90],
      [0.68, 240, 120, 20], [0.86, 250, 210, 40], [1, 255, 255, 235]
    ];
    for (var i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i + 1][0]) {
        var u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        return [
          Math.round(lerp(stops[i][1], stops[i + 1][1], u)),
          Math.round(lerp(stops[i][2], stops[i + 1][2], u)),
          Math.round(lerp(stops[i][3], stops[i + 1][3], u))
        ];
      }
    }
    return [255, 255, 235];
  }

  /* ---------- the simulator ---------- */

  function Sim(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.parts = [];
    this.waves = [];
    this.t = 0;
    this.medium = 'air';
    this.view = 'plume';
    this.aperture = 8;     // mm
    this.volume = 180;     // mL
    this.bodyT = 37;       // °C
    this.ambientT = 21;    // °C
    this.detected = null;  // seconds, or null
    this.firedAt = -1;
    this.last = 0;
    this.onReadout = null;
    this.running = true;
    this._resize();
    var self = this;
    this._ro = ('ResizeObserver' in global) ? new ResizeObserver(function () { self._resize(); }) : null;
    if (this._ro) this._ro.observe(canvas);
    else global.addEventListener('resize', function () { self._resize(); });
  }

  Sim.prototype._resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = this.cv.clientWidth || 640;
    var h = Math.round(w * 0.52);
    this.cv.style.height = h + 'px';
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ppm = w / DOMAIN_W;           // pixels per metre
    this.src = { x: w * 0.09, y: h * 0.66 };
  };

  /** Exit velocity from charge volume and aperture area (m/s). */
  Sim.prototype.exitVelocity = function () {
    var r = (this.aperture / 1000) / 2;
    var A = Math.PI * r * r;
    var Q = (this.volume / 1e6) / 1.5;  // m³ over a 1.5 s event
    return clamp(Q / A, 0.05, 40);
  };

  Sim.prototype.reynolds = function () {
    var m = MEDIA[this.medium];
    if (!m.mu) return 0;
    return m.rho * this.exitVelocity() * (this.aperture / 1000) / m.mu;
  };

  Sim.prototype.fire = function () {
    var m = MEDIA[this.medium];
    var v = this.exitVelocity();
    var n = Math.round(clamp(this.volume * 1.3, 60, 460));
    var spreadBase = m === MEDIA.vacuum ? 1.5 : 0.30;
    // A wide aperture produces a broad, slow jet; a narrow one a tight, fast jet.
    var spread = spreadBase * (0.4 + this.aperture / 14);

    this.detected = null;
    this.firedAt = this.t;
    this.parts.length = 0;

    for (var i = 0; i < n; i++) {
      var ang = (Math.random() - 0.5) * spread * 2;
      if (this.medium === 'vacuum' || this.medium === 'zerog') {
        ang = (Math.random() - 0.5) * (this.medium === 'vacuum' ? Math.PI * 2 : 1.6);
      }
      var sp = v * (0.35 + Math.random() * 0.9);
      this.parts.push({
        x: this.src.x + (Math.random() - 0.5) * 3,
        y: this.src.y + (Math.random() - 0.5) * 3,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0,
        max: 7 + Math.random() * 9,
        r: 3 + Math.random() * 7,
        T: this.bodyT - Math.random() * 1.5,
        alive: true,
        delay: Math.random() * 1.2   // the emission is not instantaneous
      });
    }

    if (m.c > 0) this.waves.push({ t0: this.t, c: m.c });
    if (this.waves.length > 4) this.waves.shift();
  };

  Sim.prototype.step = function (dt) {
    var m = MEDIA[this.medium];
    var ppm = this.ppm;
    var elapsed = this.t - this.firedAt;

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }

      p.life += dt;
      if (p.life > p.max) { p.alive = false; continue; }

      // Drag — Stokes-like linear damping, scaled by medium viscosity term
      var k = Math.exp(-m.drag * dt);
      p.vx *= k; p.vy *= k;

      // Buoyancy of a warm, low-density parcel (negative for SF6)
      var thermal = clamp((p.T - this.ambientT) / 16, 0, 1.6);
      p.vy -= m.buoy * (0.35 + 0.65 * thermal) * dt;

      // Diffusion — random walk
      var d = m.diff * (1 + p.life * 0.15);
      p.vx += (Math.random() - 0.5) * d * dt * 9;
      p.vy += (Math.random() - 0.5) * d * dt * 9;

      // Capture by the medium (upholstery filters; LN2 desublimates)
      if (m.absorb > 0 && Math.random() < m.absorb * dt) { p.alive = false; continue; }

      p.x += p.vx * ppm * dt;
      p.y += p.vy * ppm * dt;

      // Parcel cools toward ambient
      p.T += (this.ambientT - p.T) * clamp(dt * 0.55, 0, 1);
      p.r += dt * (m === MEDIA.honey ? 0.4 : 6) * (m.diff + 0.15);

      // Floor / ceiling
      if (p.y > this.h - 2) { p.y = this.h - 2; p.vy *= -0.25; p.vx *= 0.8; }
      if (p.y < 2) { p.y = 2; p.vy *= -0.25; }
      if (p.x < -60 || p.x > this.w + 60) p.alive = false;
    }

    // Detection at the bystander
    if (this.detected === null && this.firedAt >= 0) {
      var dx = this.src.x + DETECTOR_X * ppm;
      var c = this.concentrationAt(dx, this.h * 0.5, 40);
      if (c > 0.04) this.detected = elapsed;
    }

    this.t += dt;
  };

  Sim.prototype.concentrationAt = function (px, py, radius) {
    var sum = 0, r2 = radius * radius;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.delay > 0) continue;
      var dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
      if (d2 < r2) sum += 1 - d2 / r2;
    }
    return sum / Math.max(1, this.parts.length) * 4;
  };

  Sim.prototype.frontDistance = function () {
    var max = 0;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.delay > 0) continue;
      var d = Math.hypot(p.x - this.src.x, p.y - this.src.y);
      if (d > max) max = d;
    }
    return max / this.ppm;
  };

  /* ---------- rendering ---------- */

  Sim.prototype.draw = function () {
    var g = this.g, w = this.w, h = this.h;
    var m = MEDIA[this.medium];
    var css = getComputedStyle(document.documentElement);
    var paper = css.getPropertyValue('--paper-2').trim() || '#EBDFCB';
    var ink3 = css.getPropertyValue('--ink-3').trim() || '#86705A';
    var rule = css.getPropertyValue('--rule').trim() || '#CBB79A';

    g.clearRect(0, 0, w, h);

    /* --- background per view --- */
    if (this.view === 'thermal') {
      g.fillStyle = '#05060E'; g.fillRect(0, 0, w, h);
    } else if (this.view === 'schlieren') {
      g.fillStyle = '#6E6E70'; g.fillRect(0, 0, w, h);
    } else if (this.view === 'acoustic') {
      g.fillStyle = '#0E1218'; g.fillRect(0, 0, w, h);
    } else if (this.view === 'ppm') {
      g.fillStyle = '#0B0D10'; g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = paper; g.fillRect(0, 0, w, h);
      // ambient medium wash
      g.globalAlpha = this.medium === 'vacuum' ? 0 : 0.10;
      g.fillStyle = m.tint; g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      if (this.medium === 'water' || this.medium === 'ln2' || this.medium === 'honey') {
        g.globalAlpha = 0.16; g.fillStyle = m.tint;
        g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      }
      if (this.medium === 'vacuum') {
        g.fillStyle = '#05060B'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        for (var s = 0; s < 60; s++) {
          var sx = (s * 97.13) % w, sy = (s * 53.7) % h;
          g.globalAlpha = 0.15 + ((s * 31) % 60) / 100;
          g.fillRect(sx, sy, 1.2, 1.2);
        }
        g.globalAlpha = 1;
      }
    }

    var dark = this.view !== 'plume' || this.medium === 'vacuum';

    /* --- grid & scale --- */
    g.strokeStyle = dark ? 'rgba(255,255,255,.10)' : rule;
    g.lineWidth = 1;
    for (var mx = 1; mx < DOMAIN_W; mx++) {
      var gx = this.src.x + mx * this.ppm;
      if (gx > w) break;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(gx, h - 18); g.lineTo(gx, h - 10); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = dark ? 'rgba(255,255,255,.45)' : ink3;
      g.font = '10px ui-monospace, monospace';
      g.fillText(mx + ' m', gx - 9, h - 3);
    }

    /* --- acoustic wavefronts --- */
    if (this.view === 'acoustic') {
      // Shown at 1:60 slow motion so that different media are visually comparable.
      var SLOW = 60;
      for (var wv = 0; wv < this.waves.length; wv++) {
        var W = this.waves[wv];
        var age = this.t - W.t0;
        var rad = (W.c / SLOW) * age * this.ppm;
        if (rad > w * 1.7) continue;
        for (var ring = 0; ring < 3; ring++) {
          var rr = rad - ring * 26;
          if (rr <= 0) continue;
          g.beginPath();
          g.arc(this.src.x, this.src.y, rr, 0, Math.PI * 2);
          g.strokeStyle = 'rgba(219,162,76,' + (0.55 - ring * 0.15) * Math.max(0, 1 - rad / (w * 1.5)) + ')';
          g.lineWidth = 2 - ring * 0.5;
          g.stroke();
        }
      }
      if (!m.c) {
        g.fillStyle = 'rgba(217,122,82,.9)';
        g.font = '600 13px system-ui, sans-serif';
        g.fillText('NO PROPAGATION — medium absent', this.src.x + 14, this.src.y - 26);
      }
    }

    /* --- concentration grid --- */
    if (this.view === 'ppm') {
      var cell = 26;
      for (var cx = 0; cx < w; cx += cell) {
        for (var cy = 0; cy < h; cy += cell) {
          var c = this.concentrationAt(cx + cell / 2, cy + cell / 2, cell * 1.1);
          if (c < 0.004) continue;
          var t = clamp(c * 3.2, 0, 1);
          var col = irColor(t);
          g.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.18 + t * 0.7) + ')';
          g.fillRect(cx, cy, cell - 1, cell - 1);
        }
      }
    }

    /* --- particles --- */
    if (this.view !== 'ppm') {
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        if (!p.alive || p.delay > 0) continue;
        var fade = 1 - p.life / p.max;
        var rr2 = p.r * (this.view === 'schlieren' ? 1.1 : 1.5);
        var grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr2);

        if (this.view === 'thermal') {
          var tn = clamp((p.T - this.ambientT) / (this.bodyT - this.ambientT + 0.001), 0, 1);
          var c1 = irColor(tn * 0.95);
          grd.addColorStop(0, 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',' + fade * 0.85 + ')');
          grd.addColorStop(1, 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',0)');
        } else if (this.view === 'schlieren') {
          var sgn = p.vy < 0 ? 1 : -1;
          var lum = 110 + sgn * 95 * fade;
          grd.addColorStop(0, 'rgba(' + lum + ',' + lum + ',' + lum + ',' + fade * 0.5 + ')');
          grd.addColorStop(1, 'rgba(110,110,112,0)');
        } else if (this.view === 'acoustic') {
          grd.addColorStop(0, 'rgba(160,180,200,' + fade * 0.22 + ')');
          grd.addColorStop(1, 'rgba(160,180,200,0)');
        } else {
          var base = this.medium === 'water' ? '90,150,190'
                   : this.medium === 'ln2' ? '150,200,230'
                   : this.medium === 'sf6' ? '110,127,53'
                   : this.medium === 'helium' ? '192,138,78'
                   : this.medium === 'vacuum' ? '180,190,205'
                   : '139,94,52';
          grd.addColorStop(0, 'rgba(' + base + ',' + fade * 0.5 + ')');
          grd.addColorStop(1, 'rgba(' + base + ',0)');
        }
        g.fillStyle = grd;
        g.beginPath(); g.arc(p.x, p.y, rr2, 0, Math.PI * 2); g.fill();
      }
    }

    /* --- source marker --- */
    g.fillStyle = dark ? 'rgba(255,255,255,.8)' : '#3B2412';
    g.beginPath(); g.arc(this.src.x, this.src.y, 5, 0, Math.PI * 2); g.fill();
    g.font = '10px ui-monospace, monospace';
    g.fillText('SOURCE', this.src.x - 12, this.src.y + 20);

    /* --- detector --- */
    var dxp = this.src.x + DETECTOR_X * this.ppm;
    g.strokeStyle = this.detected !== null
      ? 'rgba(217,122,82,.95)'
      : (dark ? 'rgba(255,255,255,.28)' : 'rgba(59,36,18,.28)');
    g.setLineDash([4, 4]);
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(dxp, 8); g.lineTo(dxp, h - 22); g.stroke();
    g.setLineDash([]);
    g.fillStyle = this.detected !== null ? '#D97A52' : (dark ? 'rgba(255,255,255,.55)' : '#86705A');
    g.font = '600 10px system-ui, sans-serif';
    g.fillText(this.detected !== null
      ? 'DETECTED  t+' + this.detected.toFixed(2) + ' s'
      : 'BYSTANDER · 2.0 m', dxp + 6, 18);

    /* --- view label --- */
    g.fillStyle = dark ? 'rgba(255,255,255,.4)' : ink3;
    g.font = '10px ui-monospace, monospace';
    g.fillText(VIEWS[this.view].label.toUpperCase() + ' · ' + m.label.toUpperCase(), 10, 16);
    if (this.view === 'acoustic' && m.c) {
      g.fillText('SLOW MOTION 1:60 · c = ' + m.c + ' m/s', 10, 30);
    }
  };

  /* ---------- readouts ---------- */

  Sim.prototype.readouts = function () {
    var m = MEDIA[this.medium];
    var v = this.exitVelocity();
    var Re = this.reynolds();
    var regime = Re < 10 ? 'creeping' : Re < 2300 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent';
    var arrival = m.c > 0 ? (DETECTOR_X / m.c) : null;

    return {
      velocity: v.toFixed(2) + ' m/s',
      reynolds: Re < 10 ? Re.toFixed(1) : Math.round(Re).toLocaleString(),
      regime: regime,
      soundSpeed: m.c > 0 ? m.c + ' m/s' : '—',
      soundArrival: arrival !== null ? (arrival * 1000).toFixed(1) + ' ms' : 'never',
      front: this.frontDistance().toFixed(2) + ' m',
      density: m.rho ? (m.rho < 10 ? m.rho.toFixed(2) : Math.round(m.rho)) + ' kg/m³' : '0',
      viscosity: m.mu ? m.mu.toExponential(1) + ' Pa·s' : '0',
      detect: this.detected !== null ? 't+' + this.detected.toFixed(2) + ' s' : '—',
      audible: m.audible && m.c > 0
    };
  };

  /* ---------- loop ---------- */

  Sim.prototype.start = function () {
    var self = this;
    function frame(ts) {
      if (!self.running) return;
      var dt = self.last ? Math.min((ts - self.last) / 1000, 0.05) : 0.016;
      self.last = ts;
      self.step(dt);
      self.draw();
      if (self.onReadout) self.onReadout(self.readouts());
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  global.FlotzySim = { Sim: Sim, MEDIA: MEDIA, VIEWS: VIEWS, DOMAIN_W: DOMAIN_W };
})(window);
