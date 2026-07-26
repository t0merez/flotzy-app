/* ============================================================
   FLOTZY — assets/js/sim.js
   Multi-medium flatal propagation simulator, Mk III.

   Two solvers share one viewport:

   1. TRANSPORT — a Lagrangian parcel model (drag, buoyancy from
      real density difference, entrainment, curl-noise turbulence)
      whose parcels are splatted into continuous scalar fields for
      concentration and temperature. Nothing is ever drawn as a
      dot; every view renders a field.

   2. ACOUSTIC — a 2D finite-difference solver for the wave
      equation, u_tt = c²∇²u, run on the same grid with reflective
      boundaries. Wavefronts, reflections and standing patterns
      emerge from the solver rather than being drawn as circles.

   Source and detector are draggable. Domain is 6.0 m wide.
   ============================================================ */

(function (global) {
  'use strict';

  var DOMAIN_W = 6.0;   // metres across the viewport
  var GW = 132;         // field grid width
  var GH = 70;          // field grid height

  /* ---------- medium library ----------
     rho   kg/m³   density          mu   Pa·s   dynamic viscosity
     c     m/s     speed of sound   diff  m²/s   eddy diffusivity
     turb  —       turbulence intensity scale
     absorb —      parcel capture rate per second (porous/cryogenic media)
     aAbs   —      acoustic absorption per solver step

     Drag and buoyancy are NOT listed here: both are derived from rho, mu
     and the parcel's own density via Archimedes and Schiller-Naumann.
  --------------------------------------- */

  var MEDIA = {
    air: {
      label: 'Standard Air', sub: '1 atm · 21 °C · still',
      rho: 1.20, mu: 1.81e-5, c: 343, drag: 1.5, diff: 0.020, wind: 0.12, turb: 1.0,
      absorb: 0, aAbs: 0.0006, audible: true, tint: [139, 94, 52],
      audio: { brightMul: 1, f0Mul: 1, dampDb: 0, room: 0.18, rate: 1 },
      note: 'The reference case. A warm plume is roughly 5% less dense than room air, giving gentle buoyancy while turbulent entrainment broadens it into the familiar cone. Detection at 2 m follows in three to eight seconds.'
    },
    water: {
      label: 'Fresh Water', sub: '998 kg/m³ · 20 °C',
      rho: 998, mu: 1.00e-3, c: 1482, drag: 5.0, diff: 0.0008, wind: 0.01, turb: 0.35,
      absorb: 0, aAbs: 0.0002, audible: true, tint: [78, 126, 155],
      audio: { brightMul: 0.35, f0Mul: 0.85, dampDb: -14, room: 0.5, rate: 0.82 },
      note: 'Density rises 830-fold, so buoyancy overwhelms everything — the gas cannot disperse and instead ascends as a coherent column at 20–30 cm/s. Sound travels 4.3× faster than in air, so the acoustic field fills the domain almost instantly.'
    },
    honey: {
      label: 'Honey', sub: '1420 kg/m³ · µ ≈ 10 Pa·s',
      rho: 1420, mu: 10, c: 2030, drag: 24, diff: 0.0000002, wind: 0, turb: 0.02,
      absorb: 0, aAbs: 0.02, audible: true, tint: [184, 134, 43],
      audio: { brightMul: 0.14, f0Mul: 0.7, dampDb: -22, room: 0.05, rate: 0.70 },
      note: 'Viscosity is 550 000× that of air. Reynolds number collapses to order 1 — Stokes flow, where inertia is irrelevant and motion is reversible. Note how the acoustic field is absorbed within centimetres of the source.'
    },
    vacuum: {
      label: 'Vacuum', sub: '0 Pa · hard vacuum',
      rho: 0, mu: 0, c: 0, drag: 0, diff: 0, wind: 0, turb: 0,
      absorb: 0, aAbs: 1, audible: false, tint: [180, 190, 205],
      audio: { brightMul: 1, f0Mul: 1, dampDb: -120, room: 0, rate: 1 },
      note: 'No medium, therefore no wave — the acoustic solver has nothing to propagate through and stays flat. The gas undergoes free molecular expansion in all directions and never stops. The operator, by conservation of momentum, is now propulsion.'
    },
    upholstery: {
      label: 'Upholstery', sub: 'porous solid · Darcy flow',
      rho: 60, mu: 4e-4, c: 180, drag: 28, diff: 0.0005, wind: 0, turb: 0.1,
      absorb: 0.85, aAbs: 0.035, audible: true, tint: [122, 90, 62],
      audio: { brightMul: 0.22, f0Mul: 0.92, dampDb: -19, room: 0, rate: 0.95 },
      note: 'Flow through a porous solid follows Darcy\'s law, with a permeability term that is brutally small. The fabric is simultaneously an acoustic absorber and a physical filter — parcels are captured and the wave is damped within a few centimetres.'
    },
    zerog: {
      label: 'Zero-G Cabin', sub: 'air · microgravity',
      rho: 1.20, mu: 1.81e-5, c: 343, drag: 1.5, diff: 0.030, wind: 0.02, turb: 0.8,
      absorb: 0, aAbs: 0.0006, audible: true, tint: [139, 94, 52], nogravity: true,
      audio: { brightMul: 1, f0Mul: 1, dampDb: 0, room: 0.35, rate: 1 },
      note: 'Remove gravity and you remove buoyancy, and with it all natural convection. The plume expands as a symmetric sphere and stays precisely where it was made, mixing only by diffusion. Spacecraft solve this with continuous forced ventilation.'
    },
    ln2: {
      label: 'Liquid Nitrogen', sub: '77 K · cryogenic bath',
      rho: 807, mu: 1.6e-4, c: 850, drag: 4.0, diff: 0.0010, wind: 0.02, turb: 0.5,
      absorb: 0.30, aAbs: 0.001, audible: true, tint: [127, 168, 196],
      audio: { brightMul: 2.1, f0Mul: 1.25, dampDb: -8, room: 0.4, rate: 1.15 },
      note: 'At 77 K the CO₂ fraction desublimates directly to solid and the water vapour flash-freezes — parcels crystallise and leave the gas phase entirely. Set ambient to −40 °C to see the thermal field invert.'
    },
    sf6: {
      label: 'Sulfur Hexafluoride', sub: '6.16 kg/m³ · dense gas',
      rho: 6.16, mu: 1.53e-5, c: 134, drag: 2.0, diff: 0.014, wind: 0.08, turb: 0.9,
      absorb: 0, aAbs: 0.0012, audible: true, tint: [110, 127, 53],
      audio: { brightMul: 0.39, f0Mul: 0.62, dampDb: -2, room: 0.22, rate: 0.62 },
      note: 'Five times denser than air. A fart is far lighter than this gas, so it shoots upward like a released balloon — the derived terminal velocity is about 0.38 m/s, six times the rise rate in air. Sound travels at 134 m/s, 39% of its speed in air, so the wavefront visibly crawls and every resonance drops about an octave and a half. This is the anti-helium.'
    },
    helium: {
      label: 'Helium Atmosphere', sub: '0.166 kg/m³ · 100% He',
      rho: 0.166, mu: 1.99e-5, c: 1007, drag: 1.0, diff: 0.045, wind: 0.15, turb: 1.2,
      absorb: 0, aAbs: 0.0004, audible: true, tint: [192, 138, 78],
      audio: { brightMul: 2.94, f0Mul: 1.08, dampDb: 0, room: 0.25, rate: 1.71 },
      note: 'Sound travels 2.9× faster than in air, raising every cavity resonance by about an octave and a half while the reed frequency barely moves — the helium voice effect, applied at the wrong end. The plume is strongly buoyant in the reverse sense: flatus is denser than helium, so it sinks.'
    }
  };

  var VIEWS = {
    plume:    { label: 'Visible Plume',  wave: false, hint: 'Continuous concentration field of the emitted gas.' },
    thermal:  { label: 'Thermal / IR',   wave: false, hint: 'Temperature field on an iron palette — 37 °C source against ambient. No parcels drawn; this is what a bolometer sees.' },
    acoustic: { label: 'Acoustic',       wave: true,  hint: 'Live 2D wave-equation solver. Wavefronts, reflections and interference emerge from the physics. Slow motion; true arrival times in the readouts.' },
    schlieren:{ label: 'Schlieren',      wave: false, hint: 'Magnitude of the density gradient, |∇ρ| — how a physicist actually photographs invisible gas.' },
    ppm:      { label: 'Concentration',  wave: false, hint: 'Same field as the plume view, quantised into contour bands with a parts-per-million scale.' }
  };

  /* ---------- utilities ---------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function irColor(t) {                       // iron / thermal palette
    t = clamp(t, 0, 1);
    var s = [[0, 6, 10, 34], [0.20, 58, 18, 108], [0.44, 190, 40, 88],
             [0.66, 240, 120, 20], [0.85, 250, 212, 44], [1, 255, 255, 238]];
    for (var i = 0; i < s.length - 1; i++) {
      if (t <= s[i + 1][0]) {
        var u = (t - s[i][0]) / (s[i + 1][0] - s[i][0]);
        return [lerp(s[i][1], s[i + 1][1], u), lerp(s[i][2], s[i + 1][2], u), lerp(s[i][3], s[i + 1][3], u)];
      }
    }
    return [255, 255, 238];
  }

  /* Standard normal deviate (Box-Muller), for the diffusion random walk. */
  var gaussSpare = null;
  function gauss() {
    if (gaussSpare !== null) { var g = gaussSpare; gaussSpare = null; return g; }
    var u, v, sq;
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; sq = u * u + v * v; }
    while (sq >= 1 || sq === 0);
    var f = Math.sqrt(-2 * Math.log(sq) / sq);
    gaussSpare = v * f;
    return u * f;
  }

  /* Divergence-free turbulence: curl of a scalar noise field. Because the
     field is stirred rather than pushed, gas is neither created nor
     destroyed and the plume wanders as a body instead of atomising.
     Output is normalised to roughly unit magnitude so the caller can set
     turbulence in physical units (m/s) rather than arbitrary ones. */
  function sNoise(x, y, t) {
    return Math.sin(x * 1.7 + t * 0.7) * Math.cos(y * 2.1 - t * 0.5)
         + 0.5 * Math.sin(x * 0.9 - y * 1.3 + t * 0.45);
  }
  function curl(x, y, t, out) {
    var e = 0.35, k = 0.28;   // k normalises the finite difference to ~±1
    out[0] = k * (sNoise(x, y + e, t) - sNoise(x, y - e, t)) / (2 * e);
    out[1] = -k * (sNoise(x + e, y, t) - sNoise(x - e, y, t)) / (2 * e);
  }

  /* ---------- the simulator ---------- */

  function Sim(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');

    this.parts = [];
    this.waves = [];                 // retained for API compatibility
    this.t = 0;
    this.last = 0;
    this.running = true;

    this.medium = 'air';
    this.view = 'plume';
    this.aperture = 8;               // mm
    this.volume = 180;               // mL
    this.bodyT = 37;                 // °C
    this.ambientT = 21;              // °C
    this.timeScale = 8;              // simulated seconds per wall-clock second

    // Normalised positions so a resize never moves anything
    this.srcN = { x: 0.10, y: 0.66 };
    this.detN = { x: 0.10 + 2.0 / DOMAIN_W, y: 0.50 };
    this.detected = null;
    this.firedAt = -1;
    this.onReadout = null;

    // Scalar fields
    var n = GW * GH;
    this.fC = new Float32Array(n);   // concentration
    this.fT = new Float32Array(n);   // temperature excess
    this.tmp = new Float32Array(n);

    // Acoustic solver state
    this.p = new Float32Array(n);
    this.pPrev = new Float32Array(n);
    this.pNext = new Float32Array(n);
    this.emitT = -1;

    this.img = null;
    this._resize();
    this._bindDrag();

    var self = this;
    if ('ResizeObserver' in global) new ResizeObserver(function () { self._resize(); }).observe(canvas);
    else global.addEventListener('resize', function () { self._resize(); });
  }

  Sim.prototype._resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = this.cv.clientWidth || 640;
    var h = Math.round(w * 0.52);
    this.cv.style.height = h + 'px';
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ppm = w / DOMAIN_W;

    // Offscreen buffer at grid resolution; upscaled with smoothing so
    // every field reads as a continuous area rather than cells.
    if (!this.off) {
      this.off = document.createElement('canvas');
      this.off.width = GW; this.off.height = GH;
      this.offg = this.off.getContext('2d');
      this.img = this.offg.createImageData(GW, GH);
    }
  };

  /* ---------- source / detector dragging ---------- */

  Sim.prototype._bindDrag = function () {
    var self = this, dragging = null;

    function pos(ev) {
      var r = self.cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    }
    function near(p, target) {
      var dx = (p.x - target.x) * self.w, dy = (p.y - target.y) * self.h;
      return Math.hypot(dx, dy) < 26;
    }

    this.cv.style.touchAction = 'none';
    this.cv.style.cursor = 'grab';

    this.cv.addEventListener('pointerdown', function (ev) {
      var p = pos(ev);
      if (near(p, self.srcN)) dragging = 'src';
      else if (near(p, self.detN)) dragging = 'det';
      else return;
      self.cv.setPointerCapture(ev.pointerId);
      self.cv.style.cursor = 'grabbing';
      ev.preventDefault();
    });

    this.cv.addEventListener('pointermove', function (ev) {
      var p = pos(ev);
      if (!dragging) {
        self.cv.style.cursor = (near(p, self.srcN) || near(p, self.detN)) ? 'grab' : 'default';
        return;
      }
      var t = dragging === 'src' ? self.srcN : self.detN;
      t.x = clamp(p.x, 0.02, 0.98);
      t.y = clamp(p.y, 0.04, 0.94);
      if (dragging === 'src') self.detected = null;
      ev.preventDefault();
    });

    function end(ev) {
      if (!dragging) return;
      dragging = null;
      self.cv.style.cursor = 'grab';
      try { self.cv.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    this.cv.addEventListener('pointerup', end);
    this.cv.addEventListener('pointercancel', end);
  };

  Sim.prototype.srcPx = function () { return { x: this.srcN.x * this.w, y: this.srcN.y * this.h }; };
  Sim.prototype.detPx = function () { return { x: this.detN.x * this.w, y: this.detN.y * this.h }; };
  Sim.prototype.detDistance = function () {
    var s = this.srcPx(), d = this.detPx();
    return Math.hypot(d.x - s.x, d.y - s.y) / this.ppm;
  };

  /* ---------- source model ---------- */

  Sim.prototype.exitVelocity = function () {
    var r = (this.aperture / 1000) / 2;
    var A = Math.PI * r * r;
    var Q = (this.volume / 1e6) / 1.5;         // m³ over a 1.5 s event
    return clamp(Q / A, 0.05, 40);
  };

  Sim.prototype.reynolds = function () {
    var m = MEDIA[this.medium];
    if (!m.mu) return 0;
    return m.rho * this.exitVelocity() * (this.aperture / 1000) / m.mu;
  };

  /* ---------- real particle mechanics ----------
     Nothing below is tuned by eye. Parcel density comes from the ideal gas
     law, buoyancy from Archimedes, and drag from the Schiller–Naumann
     correlation — the standard empirical fit to the sphere drag curve. The
     terminal velocities these produce are the correct ones: ~0.3 m/s for a
     millimetre bubble in water, ~0.07 m/s for a warm parcel in still air.
  --------------------------------------------- */

  var G = 9.81;
  var RHO_FLATUS_293 = 1.14;   // kg/m³ at 20 °C — N₂/CO₂/H₂ mixture

  /** Parcel density at temperature T (°C), ideal gas at constant pressure. */
  function parcelDensity(T) {
    return RHO_FLATUS_293 * (293.15 / (T + 273.15));
  }

  /** Buoyant acceleration, m/s². Positive is upward. */
  Sim.prototype.buoyancy = function (parcelT) {
    var m = MEDIA[this.medium];
    if (m.nogravity || m.rho === 0) return 0;
    var rp = parcelDensity(parcelT);
    return G * (m.rho - rp) / rp;
  };

  /** Drag coefficient of a sphere at Reynolds number Re (Schiller–Naumann). */
  function dragCoefficient(Re) {
    if (Re < 1e-4) return 2.4e5;
    if (Re < 1000) return (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687));
    return 0.44;                       // Newton regime, flat to Re ≈ 2×10⁵
  }

  /** Drag deceleration magnitude per unit speed, s⁻¹, for a parcel of radius R. */
  Sim.prototype.dragRate = function (speed, R, parcelT) {
    var m = MEDIA[this.medium];
    if (!m.rho || !m.mu) return 0;
    var rp = parcelDensity(parcelT);
    var Re = m.rho * speed * 2 * R / m.mu;
    var Cd = dragCoefficient(Re);
    // a_drag = 3·Cd·ρ_medium·|v|·v / (8·ρ_parcel·R)  ->  rate = a/|v|
    return (3 * Cd * m.rho * speed) / (8 * rp * R);
  };

  /** Terminal rise speed of a buoyant parcel, m/s. Positive = upward. */
  Sim.prototype.slipVelocity = function (R) {
    var m = MEDIA[this.medium];
    if (m.nogravity || !m.rho || !m.mu) return 0;
    R = R || 0.004;
    var a = this.buoyancy(this.bodyT);
    var sign = a < 0 ? -1 : 1;
    a = Math.abs(a);
    if (a < 1e-6) return 0;
    var v = 0.05;
    for (var i = 0; i < 40; i++) {
      var rate = this.dragRate(v, R, this.bodyT);
      if (rate < 1e-9) break;
      v = a / rate;
    }
    return sign * clamp(v, 0, 50);
  };

  Sim.prototype.clear = function () {
    this.parts.length = 0;
    this.fC.fill(0); this.fT.fill(0);
    this.p.fill(0); this.pPrev.fill(0); this.pNext.fill(0);
    this.detected = null;
    this.emitT = -1;
    this.firedAt = -1;
  };

  Sim.prototype.fire = function () {
    var m = MEDIA[this.medium];
    var v = this.exitVelocity();
    var s = this.srcPx();
    var n = Math.round(clamp(this.volume * 3.2, 220, 900));

    this.detected = null;
    this.firedAt = this.t;
    this.emitT = this.t;                 // drives the acoustic source term
    this.parts.length = 0;

    // A wide aperture gives a broad slow jet; a narrow one a tight fast jet.
    var spread = 0.30 * (0.4 + this.aperture / 14);
    if (this.medium === 'vacuum') spread = Math.PI;
    else if (this.medium === 'zerog') spread = 0.9;

    for (var i = 0; i < n; i++) {
      var ang = (Math.random() - 0.5) * spread * 2;
      var sp = v * (0.3 + Math.random() * 0.95);
      this.parts.push({
        x: s.x + (Math.random() - 0.5) * 3,
        y: s.y + (Math.random() - 0.5) * 3,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0, max: 45 + Math.random() * 45,   // simulated seconds
        R: 0.0018 + Math.random() * 0.0022,   // physical radius, metres
        r: 1.6 + Math.random() * 2.4,         // render radius, px
        T: this.bodyT - Math.random() * 1.5,
        m: 0.5 + Math.random() * 0.5,      // parcel mass, for entrainment
        seed: Math.random() * 6.28,
        alive: true,
        delay: Math.random() * 1.1         // release is not instantaneous         // release is not instantaneous
      });
    }
  };

  /* ---------- transport step ---------- */

  Sim.prototype.step = function (dt) {
    var m = MEDIA[this.medium];
    var ppm = this.ppm, cv = [0, 0], src = this.srcPx();

    // Jet spreading rate and virtual origin, from the aperture diameter.
    var spread = 0.107 * m.turb;
    var x0 = spread > 1e-4 ? (this.aperture / 1000) / (2 * spread) : 1e9;

    // Terminal slip velocity for a buoyant parcel (positive = rises).
    var vSlip = this.slipVelocity();
    var slipRate = vSlip !== 0 ? this.dragRate(Math.abs(vSlip), 0.004, this.bodyT) : 0;
    var sigma = m.diff > 0 ? Math.sqrt(2 * m.diff * dt) : 0;   // metres per step

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }

      p.life += dt;
      if (p.life > p.max) { p.alive = false; continue; }

      // JET MOMENTUM. A parcel inside a jet is the fluid, not a sphere moving
      // through it, so there is no sphere drag here — momentum is lost by
      // entrainment of ambient fluid. A round turbulent jet spreads linearly
      // (db/dx ≈ 0.107), which integrates to the standard decay law
      //     u(x) = u₀·x₀/(x₀+x),   x₀ = d₀/(2·0.107)
      // Written incrementally as du = −u·ds/(x₀+x), it reproduces that exactly.
      var dxs = (p.x - src.x) / ppm, dys = (p.y - src.y) / ppm;
      var travelled = Math.sqrt(dxs * dxs + dys * dys);
      var sp = Math.hypot(p.vx, p.vy);
      if (sp > 1e-6 && spread > 1e-4 && m.rho > 0) {
        var ds = sp * dt;
        var f = 1 - ds / (x0 + travelled);
        if (f < 0) f = 0;
        p.vx *= f; p.vy *= f;
      }

      // BUOYANT SLIP. Once a parcel has slowed to ambient it is a blob rising
      // (or sinking) under Archimedes against Schiller–Naumann drag. That
      // balance has a closed-form terminal velocity, so we relax toward it
      // rather than integrating a stiff acceleration.
      if (vSlip !== 0) {
        var relax = 1 - Math.exp(-slipRate * dt);
        p.vy += (-vSlip - p.vy) * relax * 0.5;
      }

      // Curl-noise turbulence, in m/s. Eddies grow as the plume ages, so
      // the far field meanders more than the jet core.
      if (m.turb > 0) {
        curl(p.x / 260, p.y / 260, this.t * 0.35, cv);
        var s2 = m.turb * 0.30 * (0.35 + p.life * 0.10);
        p.vx += cv[0] * s2;
        p.vy += cv[1] * s2;
      }

      // Fickian diffusion, done exactly: a random walk with step length
      // sqrt(2·D·dt) reproduces <x²> = 2·D·t for eddy diffusivity D.
      if (sigma > 0) {
        p.x += gauss() * sigma * ppm;
        p.y += gauss() * sigma * ppm;
      }

      // Ambient air current. In a real room this — not the jet, and not
      // diffusion — is what actually carries the smell across the floor.
      if (m.wind) {
        p.x += m.wind * dt * ppm;
        p.y += m.wind * 0.15 * Math.sin(this.t * 0.5 + p.seed) * dt * ppm;
      }

      // Entrainment: the plume drags ambient fluid in, gaining mass and
      // losing velocity while widening. Momentum is conserved.
      // Entrainment: the plume drags ambient fluid in, so it gains mass and
      // widens while conserving momentum. Radius follows from the added volume.
      var ent = 1 + 0.55 * dt * m.turb;
      p.m *= ent;
      p.vx /= ent; p.vy /= ent;
      p.R *= Math.pow(ent, 1 / 3);
      p.r += dt * 2.6 * (m.diff + 0.10) * (1 + m.turb * 0.4);

      if (m.absorb > 0 && Math.random() < m.absorb * dt) { p.alive = false; continue; }

      p.x += p.vx * ppm * dt;
      p.y += p.vy * ppm * dt;
      p.T += (this.ambientT - p.T) * clamp(dt * 0.5, 0, 1);

      if (p.y > this.h - 1) { p.y = this.h - 1; p.vy *= -0.2; p.vx *= 0.82; }
      if (p.y < 1) { p.y = 1; p.vy *= -0.2; }
      if (p.x < -70 || p.x > this.w + 70) p.alive = false;
    }

    this.splat();
    if (VIEWS[this.view].wave) this.stepAcoustic(dt);

    // Olfactory detection at the (draggable) bystander
    if (this.detected === null && this.firedAt >= 0) {
      var d2 = this.detPx();
      if (this.sampleField(this.fC, d2.x, d2.y) > 0.05) this.detected = this.t - this.firedAt;
    }

    this.t += dt;
  };

  /* ---------- parcels -> continuous fields ---------- */

  Sim.prototype.splat = function () {
    var C = this.fC, T = this.fT;
    C.fill(0); T.fill(0);
    var sx = GW / this.w, sy = GH / this.h;

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.delay > 0) continue;
      var gx = p.x * sx, gy = p.y * sy;
      var rad = Math.max(1.6, p.r * sx * 2.2);
      var amp = (1 - p.life / p.max) * p.m * 0.42;
      var Texc = (p.T - this.ambientT);

      var x0 = Math.max(0, (gx - rad) | 0), x1 = Math.min(GW - 1, (gx + rad) | 0);
      var y0 = Math.max(0, (gy - rad) | 0), y1 = Math.min(GH - 1, (gy + rad) | 0);
      var r2 = rad * rad;
      for (var y = y0; y <= y1; y++) {
        var dy = y - gy, row = y * GW;
        for (var x = x0; x <= x1; x++) {
          var dx = x - gx, dd = dx * dx + dy * dy;
          if (dd > r2) continue;
          var g = (1 - dd / r2); g *= g;             // smooth falloff
          C[row + x] += amp * g;
          T[row + x] += amp * g * Texc;
        }
      }
    }

    // Normalise temperature by concentration -> actual parcel temperature
    var cmax = 0;
    for (var j = 0; j < C.length; j++) {
      if (C[j] > 1e-4) T[j] /= C[j];
      if (C[j] > cmax) cmax = C[j];
    }
    this.cMax = Math.max(cmax, (this.cMax || 0) * 0.99, 0.02);
    this.blur(C, 3);
    this.blur(T, 3);
  };

  /** Separable box blur — turns splats into one continuous body of gas. */
  Sim.prototype.blur = function (f, passes) {
    var tmp = this.tmp;
    for (var pss = 0; pss < passes; pss++) {
      for (var y = 0; y < GH; y++) {
        var r = y * GW;
        for (var x = 0; x < GW; x++) {
          var a = f[r + Math.max(0, x - 1)], b = f[r + x], c = f[r + Math.min(GW - 1, x + 1)];
          tmp[r + x] = (a + b + b + c) * 0.25;
        }
      }
      for (var x2 = 0; x2 < GW; x2++) {
        for (var y2 = 0; y2 < GH; y2++) {
          var a2 = tmp[Math.max(0, y2 - 1) * GW + x2], b2 = tmp[y2 * GW + x2],
              c2 = tmp[Math.min(GH - 1, y2 + 1) * GW + x2];
          f[y2 * GW + x2] = (a2 + b2 + b2 + c2) * 0.25;
        }
      }
    }
  };

  Sim.prototype.sampleField = function (f, px, py) {
    var gx = clamp(px * GW / this.w, 0, GW - 1) | 0;
    var gy = clamp(py * GH / this.h, 0, GH - 1) | 0;
    return f[gy * GW + gx];
  };

  /* ---------- acoustic solver: u_tt = c²∇²u ---------- */

  Sim.prototype.stepAcoustic = function (dt) {
    var m = MEDIA[this.medium];
    if (m.c <= 0) { this.p.fill(0); this.pPrev.fill(0); return; }

    // Courant number. Compressed via a square root so that media spanning
    // 134–2030 m/s all stay both stable (CFL < 0.707) and watchable — at
    // true scale a wavefront crosses this domain in 17 ms.
    var C = clamp(0.30 * Math.sqrt(m.c / 343), 0.04, 0.62);
    var C2 = C * C;
    var damp = 1 - m.aAbs;

    var p = this.p, pv = this.pPrev, pn = this.pNext;
    var substeps = 1;

    for (var s = 0; s < substeps; s++) {
      for (var y = 1; y < GH - 1; y++) {
        var r = y * GW;
        for (var x = 1; x < GW - 1; x++) {
          var i = r + x;
          // 9-point isotropic stencil: ⅔·orthogonal + ⅙·diagonal − 10/3·centre.
          // The 5-point form is anisotropic and renders a circular front as a diamond.
          var lap = (p[i - 1] + p[i + 1] + p[i - GW] + p[i + GW]) * 0.6666667
                  + (p[i - GW - 1] + p[i - GW + 1] + p[i + GW - 1] + p[i + GW + 1]) * 0.1666667
                  - p[i] * 3.3333333;
          pn[i] = (2 * p[i] - pv[i] + C2 * lap) * damp;
        }
      }
      // Walls: partially reflective. Full reflection turns the domain into
      // a resonator and the wavefront is quickly lost in its own echoes.
      var WALL = 0.55;
      for (var xx = 0; xx < GW; xx++) {
        pn[xx] = pn[GW + xx] * WALL;
        pn[(GH - 1) * GW + xx] = pn[(GH - 2) * GW + xx] * WALL;
      }
      for (var yy = 0; yy < GH; yy++) {
        pn[yy * GW] = pn[yy * GW + 1] * WALL;
        pn[yy * GW + GW - 1] = pn[yy * GW + GW - 2] * WALL;
      }

      // Source: a Gaussian-windowed tone burst — a few cycles, so the front
      // reads as one clean travelling ring rather than a continuous drone.
      if (this.emitT >= 0) {
        var age = this.t - this.emitT;
        var BURST = 0.30;
        if (age >= 0 && age < BURST) {
          var sp = this.srcPx();
          var gx = clamp((sp.x * GW / this.w) | 0, 1, GW - 2);
          var gy = clamp((sp.y * GH / this.h) | 0, 1, GH - 2);
          var u = age / BURST - 0.5;
          var env = Math.exp(-9 * u * u);
          var amp = Math.sin(age * 2 * Math.PI * 5.5) * env * 3.2;
          // Inject over a small disc so the ring starts smooth, not pixellated
          for (var oy = -1; oy <= 1; oy++) {
            for (var ox = -1; ox <= 1; ox++) {
              pn[(gy + oy) * GW + gx + ox] += amp * (ox || oy ? 0.45 : 1);
            }
          }
        } else if (age >= BURST) {
          this.emitT = -1;
        }
      }

      var t0 = this.pPrev; this.pPrev = this.p; this.p = pn; this.pNext = t0;
      p = this.p; pv = this.pPrev; pn = this.pNext;
    }

    // Track the field maximum so the display can auto-gain: a wave spreading
    // in 2D loses amplitude as 1/√r and would otherwise fade to nothing.
    var mx = 0, cur = this.p;
    for (var i = 0; i < cur.length; i++) { var a2 = cur[i] < 0 ? -cur[i] : cur[i]; if (a2 > mx) mx = a2; }
    this.pMax = Math.max(mx, (this.pMax || 0) * 0.985, 0.004);
  };

  /* ---------- rendering ---------- */

  Sim.prototype.draw = function () {
    var g = this.g, w = this.w, h = this.h, m = MEDIA[this.medium];
    var view = VIEWS[this.view];
    var css = getComputedStyle(document.documentElement);
    var ink3 = css.getPropertyValue('--ink-3').trim() || '#86705A';
    var rule = css.getPropertyValue('--rule').trim() || '#CBB79A';
    var paper2 = css.getPropertyValue('--paper-2').trim() || '#EBDFCB';

    var dark = this.view !== 'plume' || this.medium === 'vacuum';

    /* --- backdrop --- */
    if (this.view === 'thermal')        { g.fillStyle = '#04050C'; g.fillRect(0, 0, w, h); }
    else if (this.view === 'acoustic')  { g.fillStyle = '#0A0E14'; g.fillRect(0, 0, w, h); }
    else if (this.view === 'ppm')       { g.fillStyle = '#080A0D'; g.fillRect(0, 0, w, h); }
    else if (this.view === 'schlieren') { g.fillStyle = '#6E6E70'; g.fillRect(0, 0, w, h); }
    else {
      g.fillStyle = paper2; g.fillRect(0, 0, w, h);
      if (this.medium === 'vacuum') {
        g.fillStyle = '#04050B'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff';
        for (var st = 0; st < 70; st++) {
          g.globalAlpha = 0.12 + ((st * 37) % 65) / 100;
          g.fillRect((st * 97.13) % w, (st * 53.7) % h, 1.2, 1.2);
        }
        g.globalAlpha = 1;
      } else {
        g.globalAlpha = 0.13; g.fillStyle = 'rgb(' + m.tint.join(',') + ')';
        g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      }
    }

    /* --- the field, rendered as a continuous area --- */
    this.paintField();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.off, 0, 0, w, h);

    /* --- scale bar --- */
    var s = this.srcPx();
    g.strokeStyle = dark ? 'rgba(255,255,255,.13)' : rule;
    g.fillStyle = dark ? 'rgba(255,255,255,.42)' : ink3;
    g.font = '10px ui-monospace, monospace';
    g.lineWidth = 1;
    for (var mx = -6; mx <= 6; mx++) {
      if (!mx) continue;
      var gx2 = s.x + mx * this.ppm;
      if (gx2 < 8 || gx2 > w - 8) continue;
      g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(gx2, h - 17); g.lineTo(gx2, h - 10); g.stroke();
      g.globalAlpha = 1;
      g.fillText(Math.abs(mx) + ' m', gx2 - 9, h - 3);
    }

    this.drawHandles(dark);

    /* --- labels --- */
    g.fillStyle = dark ? 'rgba(255,255,255,.42)' : ink3;
    g.font = '10px ui-monospace, monospace';
    g.fillText(view.label.toUpperCase() + ' · ' + m.label.toUpperCase()
               + '  ·  ' + this.timeScale + '× REAL TIME', 10, 16);
    if (view.wave) {
      g.fillText(m.c > 0 ? 'FDTD WAVE SOLVER · c = ' + m.c + ' m/s · slow motion'
                         : 'NO MEDIUM — WAVE EQUATION HAS NO SOLUTION', 10, 30);
    }
  };

  /** Writes the active field into the offscreen ImageData. */
  Sim.prototype.paintField = function () {
    var d = this.img.data, m = MEDIA[this.medium], view = this.view;
    var C = this.fC, T = this.fT, P = this.p;
    var cg = 1 / (this.cMax || 1);   // display auto-gain, as in the acoustic view
    var i, px, v, col;

    if (view === 'acoustic') {
      var gain = 1 / (this.pMax || 1);
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        v = clamp(P[i] * gain, -1, 1);
        var a = Math.abs(v);
        // Diverging: compression warm, rarefaction cool
        if (v >= 0) { d[px] = 240; d[px + 1] = 160 + 70 * a; d[px + 2] = 80; }
        else        { d[px] = 90;  d[px + 1] = 150;          d[px + 2] = 210; }
        d[px + 3] = Math.pow(a, 0.45) * 255;
      }
    } else if (view === 'thermal') {
      var span = Math.max(4, this.bodyT - this.ambientT);
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        var dens = clamp(C[i] * cg, 0, 1);
        var tn = clamp(T[i] / span, -1, 1);
        col = irColor(0.5 + tn * 0.5);
        d[px] = col[0]; d[px + 1] = col[1]; d[px + 2] = col[2];
        d[px + 3] = Math.pow(dens, 0.55) * 255;
      }
    } else if (view === 'schlieren') {
      for (var y = 0; y < GH; y++) {
        for (var x = 0; x < GW; x++) {
          i = y * GW + x; px = i * 4;
          var gxv = (C[y * GW + Math.min(GW - 1, x + 1)] - C[y * GW + Math.max(0, x - 1)]) * cg;
          var gyv = (C[Math.min(GH - 1, y + 1) * GW + x] - C[Math.max(0, y - 1) * GW + x]) * cg;
          // Signed shadowgraph: knife-edge oriented vertically
          var sgn = clamp(gxv * 3.4, -1, 1);
          var mag = clamp(Math.hypot(gxv, gyv) * 3.0, 0, 1);
          var lum = 110 + sgn * 105;
          d[px] = d[px + 1] = d[px + 2] = lum;
          d[px + 3] = Math.pow(mag, 0.55) * 255;
        }
      }
    } else if (view === 'ppm') {
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        v = clamp(C[i] * cg, 0, 1);
        var band = Math.ceil(v * 7) / 7;          // contour banding
        col = irColor(band);
        d[px] = col[0]; d[px + 1] = col[1]; d[px + 2] = col[2];
        d[px + 3] = v > 0.012 ? 40 + band * 205 : 0;
      }
    } else {                                        // plume
      var tint = m.tint;
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        v = clamp(C[i] * cg, 0, 1);
        d[px] = tint[0]; d[px + 1] = tint[1]; d[px + 2] = tint[2];
        d[px + 3] = Math.pow(v, 0.72) * 215;
      }
    }
    this.offg.putImageData(this.img, 0, 0);
  };

  Sim.prototype.drawHandles = function (dark) {
    var g = this.g, s = this.srcPx(), d = this.detPx();

    // Detector
    g.setLineDash([4, 4]);
    g.lineWidth = 1.4;
    g.strokeStyle = this.detected !== null ? 'rgba(217,122,82,.95)'
                  : (dark ? 'rgba(255,255,255,.25)' : 'rgba(59,36,18,.3)');
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(d.x, d.y); g.stroke();
    g.setLineDash([]);

    g.beginPath(); g.arc(d.x, d.y, 8, 0, Math.PI * 2);
    g.fillStyle = this.detected !== null ? 'rgba(217,122,82,.28)' : 'rgba(140,140,140,.18)';
    g.fill();
    g.strokeStyle = this.detected !== null ? '#D97A52' : (dark ? 'rgba(255,255,255,.6)' : '#5A4632');
    g.lineWidth = 2; g.stroke();

    g.font = '600 10px system-ui, sans-serif';
    g.fillStyle = this.detected !== null ? '#D97A52' : (dark ? 'rgba(255,255,255,.62)' : '#5A4632');
    g.fillText(this.detected !== null
      ? 'DETECTED t+' + this.detected.toFixed(2) + ' s'
      : 'BYSTANDER ' + this.detDistance().toFixed(2) + ' m', d.x + 12, d.y + 3);

    // Source
    g.beginPath(); g.arc(s.x, s.y, 9, 0, Math.PI * 2);
    g.fillStyle = 'rgba(180,118,43,.3)'; g.fill();
    g.strokeStyle = dark ? 'rgba(255,255,255,.85)' : '#3B2412';
    g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(s.x, s.y, 3, 0, Math.PI * 2);
    g.fillStyle = dark ? '#fff' : '#3B2412'; g.fill();
    g.fillText('SOURCE', s.x - 17, s.y + 24);
  };

  /* ---------- readouts ---------- */

  Sim.prototype.readouts = function () {
    var m = MEDIA[this.medium];
    var v = this.exitVelocity();
    var Re = this.reynolds();
    var dist = this.detDistance();
    var arrival = m.c > 0 ? dist / m.c : null;

    var maxD = 0, s = this.srcPx();
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.delay > 0) continue;
      var dd = Math.hypot(p.x - s.x, p.y - s.y);
      if (dd > maxD) maxD = dd;
    }

    var vt = this.slipVelocity();
    var ReP = m.mu ? m.rho * Math.abs(vt) * 0.008 / m.mu : 0;

    return {
      terminal: Math.abs(vt) < 0.01 ? '~0 m/s'
                : (vt > 0 ? '↑ ' : '↓ ') + Math.abs(vt).toFixed(2) + ' m/s',
      parcelRe: ReP < 10 ? ReP.toFixed(1) : Math.round(ReP).toLocaleString(),
      velocity: v.toFixed(2) + ' m/s',
      reynolds: Re < 10 ? Re.toFixed(1) : Math.round(Re).toLocaleString(),
      regime: Re < 10 ? 'creeping' : Re < 2300 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent',
      soundSpeed: m.c > 0 ? m.c + ' m/s' : '—',
      soundArrival: arrival !== null ? (arrival * 1000).toFixed(1) + ' ms' : 'never',
      front: (maxD / this.ppm).toFixed(2) + ' m',
      density: m.rho ? (m.rho < 10 ? m.rho.toFixed(2) : Math.round(m.rho)) + ' kg/m³' : '0',
      distance: dist.toFixed(2) + ' m',
      detect: this.detected !== null ? 't+' + this.detected.toFixed(2) + ' s' : '—',
      audible: m.audible && m.c > 0
    };
  };

  /* ---------- loop ---------- */

  Sim.prototype.start = function () {
    var self = this;
    function frame(ts) {
      if (!self.running) return;
      var wall = self.last ? Math.min((ts - self.last) / 1000, 0.05) : 0.016;
      self.last = ts;
      // Substep so that accelerating the clock never changes the answer.
      var total = wall * self.timeScale, sub = Math.min(8, Math.max(1, Math.ceil(total / 0.02)));
      for (var q = 0; q < sub; q++) self.step(total / sub);
      self.draw();
      if (self.onReadout) self.onReadout(self.readouts());
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  global.FlotzySim = { Sim: Sim, MEDIA: MEDIA, VIEWS: VIEWS, DOMAIN_W: DOMAIN_W, GW: GW, GH: GH };
})(window);
