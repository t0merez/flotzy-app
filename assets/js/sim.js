/* ============================================================
   FLOTZY — assets/js/sim.js
   The fart simulator.

   Gas comes out of a dot you can drag around, then floats,
   spreads and drifts depending on what it is floating in.
   Three ways to look at it: the cloud, the heat, the sound.

   Built to look right and be fun, not to pass an exam.
   ============================================================ */

(function (global) {
  'use strict';

  var DOMAIN_W = 6.0;      // how many metres wide the picture is
  var GW = 132, GH = 70;   // grid the cloud gets drawn into

  /* ---------- the places you can fart ---------- */

  var MEDIA = {
    air: {
      label: 'Normal Air', sub: 'a room, like a normal person',
      rise: 26, spread: 26, drift: 14, slow: 0.55,
      sound: 343, tint: [139, 94, 52],
      audio: { dampDb: 0, room: 0.18, rate: 1 },
      note: 'The usual. It floats up slowly, spreads out, and drifts across the room until somebody notices. Give it a few seconds to reach anyone standing nearby.'
    },
    water: {
      label: 'A Bath', sub: 'underwater',
      rise: 115, spread: 6, drift: 2, slow: 3.2,
      sound: 1482, tint: [78, 126, 155],
      audio: { dampDb: -14, room: 0.5, rate: 0.82 },
      note: 'Water is heavy, so the gas cannot spread out at all. It shoots straight up as bubbles and pops at the surface. The noise happens up there, not down here, so everyone hears it slightly after you did it.'
    },
    honey: {
      label: 'Honey', sub: 'please do not',
      rise: 5, spread: 2, drift: 0, slow: 12,
      sound: 2030, tint: [184, 134, 43],
      audio: { dampDb: -22, room: 0.05, rate: 0.70 },
      note: 'Honey is about half a million times thicker than air. The fart moves roughly one centimetre and then gives up. The sound gets swallowed almost immediately. Nothing happens. It is the saddest one.'
    },
    space: {
      label: 'Space', sub: 'no air at all',
      rise: 0, spread: 75, drift: 0, slow: 0,
      sound: 0, tint: [180, 190, 205],
      audio: { dampDb: -120, room: 0, rate: 1 },
      note: 'There is nothing out here to carry sound, so it is completely silent. The gas spreads in every direction and never stops, because there is nothing to slow it down. It also pushes you very gently the other way. You are now a rocket. A bad one.'
    },
    sofa: {
      label: 'A Sofa', sub: 'straight into the cushions',
      rise: 7, spread: 8, drift: 1, slow: 5, soaks: true,
      sound: 180, tint: [122, 90, 62],
      audio: { dampDb: -19, room: 0, rate: 0.95 },
      note: 'The cushions soak up the gas and the noise together. Very quiet, very deniable. The catch is that a sofa does not keep it forever. It lets go again later, usually when somebody else sits down.'
    },
    spaceship: {
      label: 'Zero Gravity', sub: 'on a spaceship',
      rise: 0, spread: 22, drift: 3, slow: 0.55,
      sound: 343, tint: [139, 94, 52],
      audio: { dampDb: 0, room: 0.35, rate: 1 },
      note: 'Nothing floats up, because nothing floats anywhere. The fart becomes a ball and stays exactly where you left it. This is a genuine problem on spacecraft, which is why they run the fans day and night.'
    },
    heavygas: {
      label: 'Heavy Gas', sub: 'a room full of sulfur hexafluoride',
      rise: 75, spread: 20, drift: 9, slow: 0.8,
      sound: 134, tint: [110, 127, 53],
      audio: { dampDb: -2, room: 0.22, rate: 0.62 },
      note: 'This gas is five times heavier than air, so for once your fart is the light one and shoots up like a balloon. Sound crawls through it, which drops everything about an octave and a half. You sound enormous.'
    },
    helium: {
      label: 'Helium', sub: 'a room full of party balloons',
      rise: -65, spread: 40, drift: 17, slow: 0.4,
      sound: 1007, tint: [192, 138, 78],
      audio: { dampDb: 0, room: 0.25, rate: 1.71 },
      note: 'Helium is lighter than a fart, so this is the one place a fart sinks. Sound also travels three times faster in here, which sends the pitch way up. Same reason helium makes your voice squeaky, just at the other end.'
    }
  };

  var VIEWS = {
    cloud: { label: 'The Cloud', wave: false, hint: 'Where the gas actually goes.' },
    heat:  { label: 'Heat Vision', wave: false, hint: 'A fart comes out at body temperature, so a thermal camera sees a warm cloud.' },
    sound: { label: 'The Sound', wave: true,  hint: 'The noise spreading out and bouncing off the walls, slowed right down so you can watch it.' }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function heatColor(t) {
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

  /* ---------- the simulator ---------- */

  function Sim(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.parts = [];
    this.t = 0;
    this.last = 0;
    this.running = true;

    this.medium = 'air';
    this.view = 'cloud';
    this.size = 50;                    // how big the fart is, 0-100

    this.srcN = { x: 0.12, y: 0.62 };
    this.detN = { x: 0.12 + 2.0 / DOMAIN_W, y: 0.50 };
    this.noticed = null;
    this.firedAt = -1;
    this.onReadout = null;

    var n = GW * GH;
    this.fC = new Float32Array(n);     // how much gas is in each cell
    this.fT = new Float32Array(n);     // how warm it is
    this.tmp = new Float32Array(n);
    this.p = new Float32Array(n);      // sound pressure
    this.pPrev = new Float32Array(n);
    this.pNext = new Float32Array(n);
    this.emitT = -1;

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
    if (!this.off) {
      this.off = document.createElement('canvas');
      this.off.width = GW; this.off.height = GH;
      this.offg = this.off.getContext('2d');
      this.img = this.offg.createImageData(GW, GH);
    }
  };

  /* ---------- dragging the two dots ---------- */

  Sim.prototype._bindDrag = function () {
    var self = this, dragging = null;
    function pos(ev) {
      var r = self.cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    }
    function near(p, t) {
      return Math.hypot((p.x - t.x) * self.w, (p.y - t.y) * self.h) < 28;
    }
    this.cv.style.touchAction = 'none';
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
      t.x = clamp(p.x, 0.03, 0.97);
      t.y = clamp(p.y, 0.05, 0.93);
      if (dragging === 'src') self.noticed = null;
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
  Sim.prototype.gap = function () {
    var s = this.srcPx(), d = this.detPx();
    return Math.hypot(d.x - s.x, d.y - s.y) / this.ppm;
  };

  Sim.prototype.clear = function () {
    this.parts.length = 0;
    this.fC.fill(0); this.fT.fill(0);
    this.p.fill(0); this.pPrev.fill(0); this.pNext.fill(0);
    this.noticed = null; this.firedAt = -1; this.emitT = -1;
  };

  Sim.prototype.fire = function () {
    var m = MEDIA[this.medium];
    var s = this.srcPx();
    var n = Math.round(260 + this.size * 4);

    this.noticed = null;
    this.firedAt = this.t;
    this.emitT = this.t;
    this.parts.length = 0;

    // a bigger fart comes out harder
    var push = (45 + this.size * 3.0) / Math.max(0.35, m.slow);
    var cone = this.medium === 'space' ? Math.PI
             : this.medium === 'spaceship' ? 1.5 : 0.55;

    for (var i = 0; i < n; i++) {
      var a = (Math.random() - 0.5) * cone * 2;
      var sp = push * (0.25 + Math.random() * 0.9);
      this.parts.push({
        x: s.x + (Math.random() - 0.5) * 4,
        y: s.y + (Math.random() - 0.5) * 4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 5 + Math.random() * 7,
        life: 0,
        max: 11 + Math.random() * 9,
        hot: 1,
        wob: Math.random() * 6.28,
        alive: true,
        wait: Math.random() * 0.35
      });
    }
  };

  Sim.prototype.step = function (dt) {
    var m = MEDIA[this.medium];

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive) continue;
      if (p.wait > 0) { p.wait -= dt; continue; }

      p.life += dt;
      if (p.life > p.max) { p.alive = false; continue; }

      // the initial push fades
      var k = Math.exp(-(1.6 + m.slow) * dt);
      p.vx *= k; p.vy *= k;

      // float up — or sink, in helium
      p.vy -= m.rise * dt;

      // wander, so it looks like gas and not a marble
      p.wob += dt * 1.4;
      p.vx += Math.sin(p.wob * 1.3) * m.spread * dt * 0.9;
      p.vy += Math.cos(p.wob) * m.spread * dt * 0.5;

      // slow drift across the room, which is what really carries the smell
      p.vx += m.drift * dt * 1.6;

      // cushions eat it
      if (m.soaks && Math.random() < 0.5 * dt) { p.alive = false; continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * (6 + m.spread * 0.35);
      p.hot += (0 - p.hot) * clamp(dt * 0.35, 0, 1);

      if (p.y > this.h - 2) { p.y = this.h - 2; p.vy *= -0.25; p.vx *= 0.85; }
      if (p.y < 2) { p.y = 2; p.vy *= -0.25; }
      if (p.x < -80 || p.x > this.w + 80) p.alive = false;
    }

    this.paint();
    if (VIEWS[this.view].wave) this.stepSound(dt);

    if (this.noticed === null && this.firedAt >= 0) {
      var d = this.detPx();
      if (this.sample(d.x, d.y) > 0.16) this.noticed = this.t - this.firedAt;
    }
    this.t += dt;
  };

  /* ---------- turn the puffs into one smooth cloud ---------- */

  Sim.prototype.paint = function () {
    var C = this.fC, T = this.fT;
    C.fill(0); T.fill(0);
    var sx = GW / this.w, sy = GH / this.h;

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.wait > 0) continue;
      var gx = p.x * sx, gy = p.y * sy;
      var rad = Math.max(2.2, p.r * sx * 2.4);
      var amp = 1 - p.life / p.max;
      var x0 = Math.max(0, Math.floor(gx - rad)), x1 = Math.min(GW - 1, Math.ceil(gx + rad));
      var y0 = Math.max(0, Math.floor(gy - rad)), y1 = Math.min(GH - 1, Math.ceil(gy + rad));
      var r2 = rad * rad;
      for (var y = y0; y <= y1; y++) {
        var dy = y - gy, row = y * GW;
        for (var x = x0; x <= x1; x++) {
          var dx = x - gx, dd = dx * dx + dy * dy;
          if (dd > r2) continue;
          var g = 1 - dd / r2; g *= g;
          C[row + x] += amp * g * 0.5;
          T[row + x] += amp * g * 0.5 * p.hot;
        }
      }
    }
    for (var j = 0; j < C.length; j++) if (C[j] > 1e-4) T[j] /= C[j];
    this.blur(C, 2);
    this.blur(T, 2);
  };

  Sim.prototype.blur = function (f, passes) {
    var tmp = this.tmp, x, y;
    for (var n = 0; n < passes; n++) {
      for (y = 0; y < GH; y++) {
        var r = y * GW;
        for (x = 0; x < GW; x++) {
          var a = f[r + Math.max(0, x - 1)], b = f[r + x], c = f[r + Math.min(GW - 1, x + 1)];
          tmp[r + x] = (a + b + b + c) * 0.25;
        }
      }
      for (x = 0; x < GW; x++) {
        for (y = 0; y < GH; y++) {
          var a2 = tmp[Math.max(0, y - 1) * GW + x], b2 = tmp[y * GW + x],
              c2 = tmp[Math.min(GH - 1, y + 1) * GW + x];
          f[y * GW + x] = (a2 + b2 + b2 + c2) * 0.25;
        }
      }
    }
  };

  Sim.prototype.sample = function (px, py) {
    var gx = clamp(Math.floor(px * GW / this.w), 0, GW - 1);
    var gy = clamp(Math.floor(py * GH / this.h), 0, GH - 1);
    return this.fC[gy * GW + gx];
  };

  /* ---------- the sound, as a real spreading wave ---------- */

  Sim.prototype.stepSound = function (dt) {
    var m = MEDIA[this.medium];
    if (!m.sound) { this.p.fill(0); this.pPrev.fill(0); return; }

    var C = clamp(0.30 * Math.sqrt(m.sound / 343), 0.04, 0.62), C2 = C * C;
    var p = this.p, pv = this.pPrev, pn = this.pNext;

    for (var y = 1; y < GH - 1; y++) {
      var r = y * GW;
      for (var x = 1; x < GW - 1; x++) {
        var i = r + x;
        var lap = (p[i - 1] + p[i + 1] + p[i - GW] + p[i + GW]) * 0.6666667
                + (p[i - GW - 1] + p[i - GW + 1] + p[i + GW - 1] + p[i + GW + 1]) * 0.1666667
                - p[i] * 3.3333333;
        pn[i] = (2 * p[i] - pv[i] + C2 * lap) * 0.9994;
      }
    }

    var WALL = m.soaks ? 0.2 : 0.55;
    for (var xx = 0; xx < GW; xx++) {
      pn[xx] = pn[GW + xx] * WALL;
      pn[(GH - 1) * GW + xx] = pn[(GH - 2) * GW + xx] * WALL;
    }
    for (var yy = 0; yy < GH; yy++) {
      pn[yy * GW] = pn[yy * GW + 1] * WALL;
      pn[yy * GW + GW - 1] = pn[yy * GW + GW - 2] * WALL;
    }

    if (this.emitT >= 0) {
      var age = this.t - this.emitT, BURST = 0.30;
      if (age >= 0 && age < BURST) {
        var s = this.srcPx();
        var gx = clamp(Math.floor(s.x * GW / this.w), 1, GW - 2);
        var gy = clamp(Math.floor(s.y * GH / this.h), 1, GH - 2);
        var u = age / BURST - 0.5;
        var amp = Math.sin(age * 2 * Math.PI * 5.5) * Math.exp(-9 * u * u) * 3.2;
        for (var oy = -1; oy <= 1; oy++)
          for (var ox = -1; ox <= 1; ox++)
            pn[(gy + oy) * GW + gx + ox] += amp * (ox || oy ? 0.45 : 1);
      } else if (age >= BURST) this.emitT = -1;
    }

    var t0 = this.pPrev; this.pPrev = this.p; this.p = pn; this.pNext = t0;

    var mx = 0, cur = this.p;
    for (var q = 0; q < cur.length; q++) { var a = cur[q] < 0 ? -cur[q] : cur[q]; if (a > mx) mx = a; }
    this.pMax = Math.max(mx, (this.pMax || 0) * 0.985, 0.004);
  };

  /* ---------- drawing ---------- */

  Sim.prototype.draw = function () {
    var g = this.g, w = this.w, h = this.h, m = MEDIA[this.medium];
    var css = getComputedStyle(document.documentElement);
    var ink3 = css.getPropertyValue('--ink-3').trim() || '#86705A';
    var rule = css.getPropertyValue('--rule').trim() || '#CBB79A';
    var paper2 = css.getPropertyValue('--paper-2').trim() || '#EBDFCB';
    var dark = this.view !== 'cloud' || this.medium === 'space';

    if (this.view === 'heat') { g.fillStyle = '#04050C'; g.fillRect(0, 0, w, h); }
    else if (this.view === 'sound') { g.fillStyle = '#0A0E14'; g.fillRect(0, 0, w, h); }
    else if (this.medium === 'space') {
      g.fillStyle = '#04050B'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (var st = 0; st < 70; st++) {
        g.globalAlpha = 0.12 + ((st * 37) % 65) / 100;
        g.fillRect((st * 97.13) % w, (st * 53.7) % h, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    } else {
      g.fillStyle = paper2; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.14; g.fillStyle = 'rgb(' + m.tint.join(',') + ')';
      g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    }

    this.paintField();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.off, 0, 0, w, h);

    var s = this.srcPx();
    g.strokeStyle = dark ? 'rgba(255,255,255,.13)' : rule;
    g.fillStyle = dark ? 'rgba(255,255,255,.4)' : ink3;
    g.font = '10px ui-monospace, monospace';
    g.lineWidth = 1;
    for (var mx = -6; mx <= 6; mx++) {
      if (!mx) continue;
      var gx = s.x + mx * this.ppm;
      if (gx < 10 || gx > w - 10) continue;
      g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(gx, h - 17); g.lineTo(gx, h - 10); g.stroke();
      g.globalAlpha = 1;
      g.fillText(Math.abs(mx) + ' m', gx - 9, h - 3);
    }

    this.drawDots(dark);

    g.fillStyle = dark ? 'rgba(255,255,255,.45)' : ink3;
    g.font = '11px ui-monospace, monospace';
    g.fillText(VIEWS[this.view].label + ' — ' + m.label, 10, 17);
    if (this.view === 'sound') {
      g.fillText(m.sound ? 'slowed right down so you can see it'
                         : 'nothing. there is no air out here.', 10, 32);
    }
  };

  Sim.prototype.paintField = function () {
    var d = this.img.data, m = MEDIA[this.medium];
    var C = this.fC, T = this.fT, P = this.p;
    var i, px, v, col;

    if (this.view === 'sound') {
      var gain = 1 / (this.pMax || 1);
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        v = clamp(P[i] * gain, -1, 1);
        var a = Math.abs(v);
        if (v >= 0) { d[px] = 240; d[px + 1] = 160 + 70 * a; d[px + 2] = 80; }
        else { d[px] = 90; d[px + 1] = 150; d[px + 2] = 210; }
        d[px + 3] = Math.pow(a, 0.45) * 255;
      }
    } else if (this.view === 'heat') {
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        var dens = clamp(C[i] * 2.2, 0, 1);
        col = heatColor(clamp(T[i], 0, 1) * 0.92 + 0.06);
        d[px] = col[0]; d[px + 1] = col[1]; d[px + 2] = col[2];
        d[px + 3] = Math.pow(dens, 0.5) * 255;
      }
    } else {
      var tint = m.tint;
      for (i = 0; i < GW * GH; i++) {
        px = i * 4;
        v = clamp(C[i] * 2.2, 0, 1);
        d[px] = tint[0]; d[px + 1] = tint[1]; d[px + 2] = tint[2];
        d[px + 3] = Math.pow(v, 0.5) * 240;
      }
    }
    this.offg.putImageData(this.img, 0, 0);
  };

  Sim.prototype.drawDots = function (dark) {
    var g = this.g, s = this.srcPx(), d = this.detPx();

    g.setLineDash([4, 4]); g.lineWidth = 1.4;
    g.strokeStyle = this.noticed !== null ? 'rgba(217,122,82,.95)'
                  : (dark ? 'rgba(255,255,255,.25)' : 'rgba(59,36,18,.3)');
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(d.x, d.y); g.stroke();
    g.setLineDash([]);

    g.beginPath(); g.arc(d.x, d.y, 9, 0, Math.PI * 2);
    g.fillStyle = this.noticed !== null ? 'rgba(217,122,82,.3)' : 'rgba(140,140,140,.2)';
    g.fill();
    g.strokeStyle = this.noticed !== null ? '#D97A52' : (dark ? 'rgba(255,255,255,.6)' : '#5A4632');
    g.lineWidth = 2; g.stroke();

    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = this.noticed !== null ? '#D97A52' : (dark ? 'rgba(255,255,255,.68)' : '#5A4632');
    g.fillText(this.noticed !== null
      ? 'they smelled it — ' + this.noticed.toFixed(1) + 's'
      : 'someone else, ' + this.gap().toFixed(1) + ' m away', d.x + 13, d.y + 4);

    g.beginPath(); g.arc(s.x, s.y, 10, 0, Math.PI * 2);
    g.fillStyle = 'rgba(180,118,43,.32)'; g.fill();
    g.strokeStyle = dark ? 'rgba(255,255,255,.85)' : '#3B2412';
    g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(s.x, s.y, 3, 0, Math.PI * 2);
    g.fillStyle = dark ? '#fff' : '#3B2412'; g.fill();
    g.fillText('you', s.x - 9, s.y + 26);
  };

  /* ---------- the numbers, in plain words ---------- */

  Sim.prototype.readouts = function () {
    var m = MEDIA[this.medium];
    var s = this.srcPx(), far = 0;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.alive || p.wait > 0) continue;
      var dd = Math.hypot(p.x - s.x, p.y - s.y);
      if (dd > far) far = dd;
    }
    return {
      spread: (far / this.ppm).toFixed(1) + ' m',
      gap: this.gap().toFixed(1) + ' m',
      heard: m.sound ? (this.gap() / m.sound * 1000).toFixed(0) + ' ms' : 'never',
      smelled: this.noticed !== null ? this.noticed.toFixed(1) + ' s' : 'not yet',
      speed: m.sound ? m.sound + ' m/s' : 'no sound'
    };
  };

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
