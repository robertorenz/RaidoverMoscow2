/* Raid Over Moscow II — particles, explosions, smoke, floating text, screen shake */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;

  ROM.FX = function () {
    this.parts = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
  };
  const FX = ROM.FX.prototype;

  FX.clear = function () { this.parts.length = 0; this.texts.length = 0; };

  FX.explode = function (x, y, z, size, opts) {
    size = size || 1;
    const n = Math.round(10 * size);
    this.parts.push({ t: 'flash', x, y, z, life: 0.25, max: 0.25, r: 26 * size });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const sp = ROM.rand(30, 120) * size;
      this.parts.push({
        t: 'fire', x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(a) * Math.cos(e) * sp, vz: Math.sin(e) * sp + 20,
        life: ROM.rand(0.35, 0.8), max: 0.8, r: ROM.rand(5, 11) * size,
      });
    }
    for (let i = 0; i < n * 0.8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = ROM.rand(20, 60) * size;
      this.parts.push({
        t: 'smoke', x: x + ROM.rand(-6, 6), y: y + ROM.rand(-6, 6), z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: ROM.rand(20, 50),
        life: ROM.rand(0.9, 1.8), max: 1.8, r: ROM.rand(7, 13) * size,
      });
    }
    const debris = (opts && opts.debris) || '#4a4f55';
    for (let i = 0; i < n * 0.7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = ROM.rand(40, 160) * size;
      this.parts.push({
        t: 'debris', x, y, z: z + 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: ROM.rand(60, 200) * size,
        life: ROM.rand(0.8, 1.6), max: 1.6, r: ROM.rand(1.5, 3.5) * Math.sqrt(size), c: debris, g: true,
      });
    }
    this.shake = Math.max(this.shake, 4 * size);
  };

  FX.puff = function (x, y, z, r, life, color) {
    this.parts.push({ t: 'smoke', x, y, z, vx: ROM.rand(-5, 5), vy: ROM.rand(-5, 5), vz: ROM.rand(4, 14), life: life || 0.8, max: life || 0.8, r: r || 5, c: color });
  };
  FX.spark = function (x, y, z, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ t: 'spark', x, y, z, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, vz: ROM.rand(20, 120), life: 0.3, max: 0.3, r: 1.6, c: color || '#ffd27a', g: true });
    }
  };
  FX.flak = function (x, y, z) {
    this.parts.push({ t: 'flash', x, y, z, life: 0.15, max: 0.15, r: 18 });
    for (let i = 0; i < 5; i++) this.parts.push({ t: 'smoke', x: x + ROM.rand(-8, 8), y: y + ROM.rand(-8, 8), z: z + ROM.rand(-6, 6), vx: 0, vy: 0, vz: 3, life: 1.1, max: 1.1, r: ROM.rand(6, 10), c: '#2b2b2b' });
  };
  FX.text = function (x, y, z, str, color) {
    this.texts.push({ x, y, z, str, c: color || '#ffd27a', life: 1.1 });
  };

  FX.update = function (dt, groundZ) {
    const gz = groundZ || 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      if (p.vx !== undefined) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.g) {
          p.vz -= 420 * dt;
          if (p.z < gz) { p.z = gz; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
        } else {
          p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; p.vz *= 1 - 1.2 * dt;
        }
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.z += 30 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  };

  /* add particles to a depth queue */
  FX.queue = function (proj, q) {
    for (const p of this.parts) {
      q.add(proj.near(p.x, p.y, p.z) + 2, () => FX.drawPart(proj, p));
    }
  };
  FX.drawPart = function (proj, p) {
    const k = p.life / p.max;
    const c = R.ctx;
    if (p.t === 'fire') {
      R.orb(proj, p.x, p.y, p.z, p.r * (1.4 - k * 0.6), `rgba(255,${(200 * k + 40) | 0},80,${0.9 * k + 0.1})`, 'rgba(200,60,20,0)');
    } else if (p.t === 'flash') {
      R.orb(proj, p.x, p.y, p.z, p.r * (1.5 - k), `rgba(255,250,220,${k})`, 'rgba(255,160,60,0)');
    } else if (p.t === 'smoke') {
      const col = p.c || '#3c3c3c';
      const [r, g, b] = ROM.hexToRgb(col);
      R.orb(proj, p.x, p.y, p.z, p.r * (1.6 - k * 0.8), `rgba(${r},${g},${b},${0.55 * k})`, `rgba(${r},${g},${b},0)`);
    } else if (p.t === 'spark' || p.t === 'debris') {
      R.dot(proj, p.x, p.y, p.z, p.r, p.c);
    } else if (p.t === 'trail') {
      R.orb(proj, p.x, p.y, p.z, p.r * (2 - k), `rgba(230,230,230,${0.45 * k})`, 'rgba(230,230,230,0)');
    }
    void c;
  };
  FX.trail = function (x, y, z, r) {
    this.parts.push({ t: 'trail', x, y, z, life: 0.7, max: 0.7, r: r || 3 });
  };

  FX.drawTexts = function (proj) {
    const c = R.ctx;
    c.save();
    c.font = '700 13px "Rajdhani", "Segoe UI", sans-serif';
    c.textAlign = 'center';
    for (const t of this.texts) {
      const [sx, sy] = proj.p(t.x, t.y, t.z);
      c.globalAlpha = Math.min(1, t.life * 2);
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillText(t.str, sx + 1, sy + 1);
      c.fillStyle = t.c;
      c.fillText(t.str, sx, sy);
    }
    c.restore();
  };
})();
