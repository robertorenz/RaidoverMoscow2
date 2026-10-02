/* Raid Over Moscow II — 2.5D renderer: isometric + perspective projections,
   shaded boxes, prisms, cones, meshes, shadows and sprites-from-geometry. */
'use strict';
(function () {
  const ROM = window.ROM;

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  /* Isometric (2:1) projection. World: x,y ground plane, z up. */
  ROM.Iso = function (scale) {
    return {
      kind: 'iso', hand: 1, cx: 0, cy: 0, ox: ROM.W / 2, oy: ROM.H / 2, s: scale || 1,
      light: norm([0.5, 0.2, 1]),
      p(x, y, z) {
        const X = x - this.cx, Y = y - this.cy;
        return [this.ox + (X - Y) * this.s, this.oy + ((X + Y) * 0.5 - z) * this.s, this.s];
      },
      near(x, y, z) { return x + y + z; },
      unproject(sx, sy) { // screen -> ground (z=0)
        const a = (sx - this.ox) / this.s, b = (sy - this.oy) / this.s * 2;
        return [(a + b) / 2 + this.cx, (b - a) / 2 + this.cy];
      },
    };
  };

  /* Perspective camera looking along +y, pitched down. */
  ROM.Persp = function () {
    return {
      kind: 'persp', hand: -1, x: 0, y: -500, z: 220, pitch: 0.32, f: 760, ox: ROM.W / 2, oy: ROM.H / 2,
      light: norm([0.35, -0.65, 0.75]), cp: 1, sp: 0,
      setup() { this.cp = Math.cos(this.pitch); this.sp = Math.sin(this.pitch); },
      p(x, y, z) {
        const dx = x - this.x, dy = y - this.y, dz = z - this.z;
        let d = dy * this.cp - dz * this.sp;
        const u = dy * this.sp + dz * this.cp;
        if (d < 4) d = 4;
        const k = this.f / d;
        return [this.ox + dx * k, this.oy - u * k, k];
      },
      near(x, y, z) { return -((y - this.y) * this.cp - (z - this.z) * this.sp); },
    };
  };

  const R = (ROM.R = { ctx: null });

  function area(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a;
  }
  R.area = area;

  R.path = function (pts) {
    const c = R.ctx;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  R.fillPoly = function (pts, fill, stroke, lw) {
    R.path(pts);
    R.ctx.fillStyle = fill;
    R.ctx.fill();
    if (stroke) { R.ctx.strokeStyle = stroke; R.ctx.lineWidth = lw || 1; R.ctx.stroke(); }
  };

  function lightF(proj, n) {
    const L = proj.light;
    const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    return 0.52 + 0.5 * Math.max(0, d);
  }
  R.lightF = lightF;

  /* faces of an axis aligned box, wound CCW from outside */
  const BOX_FACES = [
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],   // top
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],  // y0
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],   // y1
    [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1], [-1, 0, 0]],  // x0
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],   // x1
  ];

  /* opts: {top: colorForTop, edge: strokeColor, glow} */
  R.box = function (proj, x, y, z, w, d, h, color, opts) {
    const c = R.ctx;
    const X = [x, x + w], Y = [y, y + d], Z = [z, z + h];
    for (let f = 0; f < BOX_FACES.length; f++) {
      const F = BOX_FACES[f];
      const pts = [];
      for (let i = 0; i < 4; i++) pts.push(proj.p(X[F[i][0]], Y[F[i][1]], Z[F[i][2]]));
      if (area(pts) * proj.hand <= 0) continue;
      const col = f === 0 && opts && opts.top ? opts.top : color;
      R.path(pts);
      c.fillStyle = ROM.shade(col, lightF(proj, F[4]));
      c.fill();
      if (opts && opts.edge) { c.strokeStyle = opts.edge; c.lineWidth = 1; c.stroke(); }
    }
  };

  /* centred box helper */
  R.cbox = function (proj, cx, cy, z, w, d, h, color, opts) {
    R.box(proj, cx - w / 2, cy - d / 2, z, w, d, h, color, opts);
  };

  /* vertical regular prism (cylinder approximation) */
  R.prism = function (proj, cx, cy, z, r, h, n, color, opts) {
    const c = R.ctx;
    const top = [], bot = [];
    const rot = (opts && opts.rot) || 0;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      bot.push([px, py, z]);
      top.push([px, py, z + h]);
    }
    const faces = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pts = [proj.p(...bot[i]), proj.p(...bot[j]), proj.p(...top[j]), proj.p(...top[i])];
      if (area(pts) * proj.hand <= 0) continue;
      const a = rot + ((i + 0.5) / n) * Math.PI * 2;
      faces.push([pts, [Math.cos(a), Math.sin(a), 0]]);
    }
    for (const [pts, nrm] of faces) {
      R.path(pts);
      c.fillStyle = ROM.shade(color, lightF(proj, nrm));
      c.fill();
      if (opts && opts.edge) { c.strokeStyle = opts.edge; c.lineWidth = 1; c.stroke(); }
    }
    if (!(opts && opts.noTop)) {
      const tp = top.map((q) => proj.p(...q));
      if (area(tp) * proj.hand > 0) R.fillPoly(tp, ROM.shade((opts && opts.top) || color, lightF(proj, [0, 0, 1])), opts && opts.edge);
    }
  };

  /* cone / pyramid */
  R.cone = function (proj, cx, cy, z, r, h, n, color, opts) {
    const c = R.ctx;
    const apex = [cx, cy, z + h];
    const ap = proj.p(...apex);
    const base = [];
    const rot = (opts && opts.rot) || 0;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      base.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pts = [proj.p(...base[i]), proj.p(...base[j]), ap];
      if (area(pts) * proj.hand <= 0) continue;
      const a = rot + ((i + 0.5) / n) * Math.PI * 2;
      const nrm = norm([Math.cos(a) * h, Math.sin(a) * h, r]);
      R.path(pts);
      c.fillStyle = ROM.shade(color, lightF(proj, nrm));
      c.fill();
      if (opts && opts.edge) { c.strokeStyle = opts.edge; c.lineWidth = 1; c.stroke(); }
    }
  };

  /* single polygon in world space, wound CCW from its visible side */
  R.face = function (proj, pts3, color, two) {
    const pts = pts3.map((q) => proj.p(q[0], q[1], q[2]));
    const a = area(pts) * proj.hand;
    if (a <= 0 && !two) return;
    const v0 = pts3[0], v1 = pts3[1], v2 = pts3[2];
    const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
    const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
    let n = norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
    if (a <= 0) n = [-n[0], -n[1], -n[2]];
    R.fillPoly(pts, ROM.shade(color, lightF(proj, n)));
  };
  /* gable roof with ridge along x */
  R.gable = function (proj, x, y, z, w, d, rh, color, endColor) {
    const m = y + d / 2, t = z + rh;
    R.face(proj, [[x, y, z], [x + w, y, z], [x + w, m, t], [x, m, t]], color);
    R.face(proj, [[x, y + d, z], [x, m, t], [x + w, m, t], [x + w, y + d, z]], color);
    R.face(proj, [[x, y, z], [x, m, t], [x, y + d, z]], endColor || color);
    R.face(proj, [[x + w, y, z], [x + w, y + d, z], [x + w, m, t]], endColor || color);
  };

  /* soft ground shadow (circle on z=gz) */
  R.shadow = function (proj, x, y, r, alpha, gz) {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(proj.p(x + Math.cos(a) * r, y + Math.sin(a) * r, gz || 0));
    }
    R.path(pts);
    R.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    R.ctx.fill();
  };
  /* soft blurred ground shadow for isometric views (cloud shadows) */
  R.softShadow = function (proj, x, y, r, alpha) {
    const [sx, sy, k] = proj.p(x, y, 0);
    const c = R.ctx;
    const rr = r * k * 1.41;
    if (sx < -rr || sx > ROM.W + rr || sy < -rr || sy > ROM.H + rr) return;
    c.save();
    c.translate(sx, sy);
    c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.fill();
    c.restore();
  };
  /* flat quad on the ground */
  R.groundQuad = function (proj, x, y, w, d, color, z) {
    const zz = z || 0;
    R.fillPoly([proj.p(x, y, zz), proj.p(x + w, y, zz), proj.p(x + w, y + d, zz), proj.p(x, y + d, zz)], color);
  };

  /* glowing orb (bullets, fireballs, domes) */
  R.orb = function (proj, x, y, z, r, inner, outer) {
    const [sx, sy, k] = proj.p(x, y, z);
    const rr = Math.max(0.8, r * k);
    const c = R.ctx;
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, rr);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.beginPath();
    c.arc(sx, sy, rr, 0, Math.PI * 2);
    c.fill();
  };
  R.dot = function (proj, x, y, z, r, color) {
    const [sx, sy, k] = proj.p(x, y, z);
    R.ctx.fillStyle = color;
    R.ctx.beginPath();
    R.ctx.arc(sx, sy, Math.max(0.8, r * k), 0, Math.PI * 2);
    R.ctx.fill();
  };
  R.line3 = function (proj, a, b, color, w) {
    const p = proj.p(...a), q = proj.p(...b);
    const c = R.ctx;
    c.strokeStyle = color;
    c.lineWidth = w || 1;
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.lineTo(q[0], q[1]);
    c.stroke();
  };

  /* ---------- meshes ----------
     model = { v: [[x,y,z]...], f: [{i:[..], c:'#hex', two:bool, glow:bool}] }
     local axes: +x forward, +y left, +z up */
  ROM.Mesh = function () { return { v: [], f: [] }; };
  ROM.Mesh.box = function (m, x0, y0, z0, x1, y1, z1, color, extra) {
    const b = m.v.length;
    for (let i = 0; i < 8; i++) m.v.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    const idx = (xi, yi, zi) => b + xi + yi * 2 + zi * 4;
    for (let f = 0; f < BOX_FACES.length; f++) {
      const F = BOX_FACES[f];
      m.f.push(Object.assign({ i: F.slice(0, 4).map((q) => idx(q[0], q[1], q[2])), c: color }, extra || {}));
    }
    // bottom (needed for airborne objects)
    m.f.push(Object.assign({ i: [idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0), idx(1, 0, 0)], c: color }, extra || {}));
    return m;
  };
  ROM.Mesh.poly = function (m, pts, color, extra) {
    const b = m.v.length;
    pts.forEach((p) => m.v.push(p));
    m.f.push(Object.assign({ i: pts.map((_, k) => b + k), c: color, two: true }, extra || {}));
    return m;
  };
  /* tapered prism from a 2D cross-section list along x (for fuselages, missiles) */
  ROM.Mesh.loft = function (m, sections, n, color, extra) {
    // sections: [[x, r, zOffset]]
    const base = m.v.length;
    sections.forEach(([x, r, zo]) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        m.v.push([x, Math.cos(a) * r, Math.sin(a) * r + (zo || 0)]);
      }
    });
    for (let s = 0; s < sections.length - 1; s++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = base + s * n, b2 = base + (s + 1) * n;
        m.f.push(Object.assign({ i: [a + i, a + j, b2 + j, b2 + i], c: color }, extra || {}));
      }
    }
    // caps
    const first = [], last = [];
    for (let i = 0; i < n; i++) { first.push(base + i); last.push(base + (sections.length - 1) * n + n - 1 - i); }
    m.f.push(Object.assign({ i: first.slice().reverse(), c: color }, extra || {}));
    m.f.push(Object.assign({ i: last.slice().reverse(), c: color }, extra || {}));
    return m;
  };

  const _tv = [];
  /* draw mesh. rot = {yaw, pitch, roll}; s = scale */
  R.mesh = function (proj, m, x, y, z, yaw, pitch, roll, s, tint) {
    const c = R.ctx;
    s = s || 1;
    const cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0);
    const cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0);
    const cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    const W = [], P = [];
    for (let i = 0; i < m.v.length; i++) {
      let [lx, ly, lz] = m.v[i];
      lx *= s; ly *= s; lz *= s;
      // roll about x
      let y1 = ly * cr - lz * sr, z1 = ly * sr + lz * cr;
      // pitch about y (nose up positive)
      let x2 = lx * cp - z1 * sp, z2 = lx * sp + z1 * cp;
      // yaw about z
      const wx = x + x2 * cy - y1 * sy, wy = y + x2 * sy + y1 * cy, wz = z + z2;
      W.push([wx, wy, wz]);
      P.push(proj.p(wx, wy, wz));
    }
    const list = _tv; list.length = 0;
    for (const f of m.f) {
      const pts = f.i.map((k) => P[k]);
      const a = area(pts) * proj.hand;
      if (a <= 0 && !f.two) continue;
      const v0 = W[f.i[0]], v1 = W[f.i[1]], v2 = W[f.i[2]];
      const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
      const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
      let n = norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
      if (a <= 0) n = [-n[0], -n[1], -n[2]];
      let nr = 0, cx2 = 0, cy2 = 0, cz2 = 0;
      for (const k of f.i) { cx2 += W[k][0]; cy2 += W[k][1]; cz2 += W[k][2]; }
      const L = f.i.length;
      nr = proj.near(cx2 / L, cy2 / L, cz2 / L);
      list.push({ pts, nr, f, n });
    }
    list.sort((a, b) => a.nr - b.nr);
    for (const it of list) {
      R.path(it.pts);
      const col = tint && !it.f.keep ? tint : it.f.c;
      c.fillStyle = it.f.glow ? col : ROM.shade(col, lightF(proj, it.n));
      c.fill();
      if (it.f.edge) { c.strokeStyle = it.f.edge; c.lineWidth = 1; c.stroke(); }
    }
  };

  /* depth-sorted draw queue */
  ROM.Queue = function () {
    const items = [];
    return {
      add(near, fn) { items.push({ near, fn }); },
      flush() {
        items.sort((a, b) => a.near - b.near);
        for (const it of items) it.fn();
        items.length = 0;
      },
    };
  };
})();
