/* Stage: low-level flight to the target city (diagonal isometric scroller).
   Fly low to stay under the radar, dodge trees, buildings and power lines,
   shoot tanks, SAM sites, flak guns, helicopters and MiG interceptors. */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;
  const Md = ROM.Models;
  ROM.Stages = ROM.Stages || {};

  const T = 40;               // ground tile size
  const LAT = 230;            // lateral flight corridor half-width
  const ZMIN = 8, ZMAX = 140;
  const RADAR_ALT = 72;

  const BIOMES = {
    coast: {
      ground: ['#4f7c47', '#56844d'], water: ['#255f8c', '#3378a8'], shore: '#c9b98c',
      lakes: 0.37, pine: '#2f5b36', round: '#3f7a3c', snow: false, houseWall: ['#c9b9a0', '#a9b3bb', '#d4c49e'], roof: ['#8e3b2f', '#556877', '#6b4a35'],
      weights: { forest: 3, village: 3, armor: 2, sam: 2, flak: 2, radar: 1, boats: 3, pylons: 1, fuel: 1 },
    },
    forest: {
      ground: ['#3b6536', '#416c3b'], water: ['#2a5876', '#356b8c'], shore: '#6f7d4a',
      lakes: 0.24, pine: '#244a2c', round: '#2f6131', snow: false, houseWall: ['#9c8566', '#b19b78'], roof: ['#5a4434', '#7a3a2c'],
      weights: { forest: 6, village: 2, armor: 3, sam: 2, flak: 2, radar: 1, boats: 1, pylons: 2, fuel: 1 },
    },
    farm: {
      ground: ['#7e9a48', '#86a24e'], fields: ['#c8b25a', '#91a94c', '#a68a52', '#6f9a45', '#b9a157', '#7c8f3d'],
      water: ['#2b6189', '#3a77a3'], shore: '#a49a6a', lakes: 0.0, pine: '#355e31', round: '#467f3b', snow: false,
      houseWall: ['#e3dcc8', '#d8cfb4'], roof: ['#7d4a2e', '#8e3b2f'], river: true,
      weights: { forest: 2, village: 4, armor: 4, sam: 2, flak: 2, radar: 1, boats: 2, pylons: 2, fuel: 2 },
    },
    steppe: {
      ground: ['#b8a46d', '#b09b64'], water: ['#2d6488', '#3b789e'], shore: '#d8c896',
      lakes: 0.0, pine: '#5d6b3a', round: '#6f7d42', snow: false, houseWall: ['#cdbf9c', '#bfae88'], roof: ['#6b4a35', '#5d6168'], river: true, wideRiver: true,
      weights: { forest: 1, village: 2, armor: 5, sam: 3, flak: 3, radar: 2, boats: 2, pylons: 2, fuel: 3 },
    },
    winter: {
      ground: ['#dde5ec', '#d3dce5'], water: ['#9cb9cf', '#aac5d8'], shore: '#c4d2de',
      lakes: 0.27, pine: '#2e4c3d', round: '#3c5a49', snow: true, houseWall: ['#b9a58a', '#9e8f80'], roof: ['#eef3f7', '#e3eaf0'], frozen: true,
      weights: { forest: 4, village: 2, armor: 4, sam: 3, flak: 3, radar: 2, boats: 0, pylons: 2, fuel: 2 },
    },
  };
  ROM.BIOMES = BIOMES;

  function Flight(game, opts) {
    this.game = game;
    this.opts = opts || {};
    const mi = game.missionInfo();
    this.mission = mi;
    this.biome = BIOMES[mi.biome];
    this.seed = 1000 + mi.index * 7919;
    this.L = 9000 + mi.index * 1600;
    this.diff = game.diff();
    this.proj = ROM.Iso(1);
    this.fx = new ROM.FX();
    this.q = ROM.Queue();
    this.t = 0;
    this.speed = 210 + mi.index * 8;
    const startY = this.opts.startY || 0;
    this.p = { x: 0, y: startY, z: 40, vx: 0, vz: 0, fireT: 0, bombT: 0, alive: true, inv: startY < 0 ? 2 : 0 };
    this.bullets = [];
    this.bombs = [];
    this.eshots = [];
    this.objs = [];
    this.air = [];
    this.alert = 0;
    this.migT = 0;
    this.state = 'fly';
    this.endT = 0;
    this.checkpoints = [0.25, 0.5, 0.75].map((f) => -this.L * f);
    this.cpPassed = this.checkpoints.filter((c) => c >= startY).length;
    this.rivers = [];
    this.waterCols = [];
    for (let i = 0; i < 8; i++) this.waterCols.push(ROM.mixHex(this.biome.water[0], this.biome.water[1], i / 7));
    this.generate();
    this.clouds = [];
    const rng = ROM.RNG(this.seed + 3);
    for (let y = 200; y > -this.L - 1500; y -= rng.range(250, 600)) {
      this.clouds.push({ x: rng.range(-700, 700), y, z: rng.range(170, 230), r: rng.range(50, 110), n: rng.int(3, 6), s: rng() * 1000 });
    }
  }
  ROM.Stages.Flight = Flight;
  const F = Flight.prototype;
  F.name = 'LOW-LEVEL FLIGHT';
  F.hint = 'Fly LOW to stay under radar · UP/DOWN altitude · FIRE guns · BOMB (X) for ground targets';

  /* ---------------- terrain ---------------- */
  F.tile = function (i, j) {
    const B = this.biome;
    const x = i * T, y = j * T;
    let water = false, shore = false;
    if (B.lakes) {
      const n = ROM.fbm(i * 0.075, j * 0.055, this.seed);
      if (n < B.lakes) water = true; else if (n < B.lakes + 0.03) shore = true;
    }
    for (const r of this.rivers) {
      const cy = r.y + r.amp * Math.sin(x * r.f + r.ph);
      const d = Math.abs(y + T / 2 - cy);
      if (d < r.w / 2) water = true; else if (d < r.w / 2 + 18) shore = true;
    }
    if (y < -this.L + 900 && y > -this.L - 1400 && !water) return { city: true };
    return { water, shore };
  };
  F.isWater = function (x, y) { return this.tile(Math.floor(x / T), Math.floor(y / T)).water; };
  F.isCity = function (y) { return y < -this.L + 900; };

  F.drawGround = function (ctx) {
    const proj = this.proj, s = proj.s, B = this.biome;
    const i0 = Math.floor((proj.cx - 580) / T), i1 = Math.ceil((proj.cx + 580) / T);
    const j0 = Math.floor((proj.cy - 580) / T), j1 = Math.ceil((proj.cy + 580) / T);
    const hw = T * s, hh = T * s * 0.5;
    const wt = this.t;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = i * T - proj.cx, Y = j * T - proj.cy;
        const sx = proj.ox + (X - Y) * s, sy = proj.oy + (X + Y) * 0.5 * s;
        if (sx < -hw - 2 || sx > ROM.W + hw + 2 || sy < -2 * hh - 2 || sy > ROM.H + 2) continue;
        const info = this.tile(i, j);
        const h = ROM.hash2(i, j, this.seed);
        let col;
        if (info.water) {
          const k = (Math.sin(wt * 2 + i * 0.7 + j * 0.45) * 0.5 + 0.5) * 7;
          col = this.waterCols[k | 0];
        } else if (info.city) {
          const road = ((i % 6) + 6) % 6 === 0 || ((j % 5) + 5) % 5 === 0;
          col = road ? '#4a4f55' : (h < 0.5 ? '#8d939a' : '#858b92');
          if (B.snow && !road) col = h < 0.5 ? '#cfd7df' : '#c6ced7';
        } else if (info.shore) {
          col = B.shore;
        } else if (B.fields) {
          const fi = Math.floor(i / 5), fj = Math.floor(j / 4);
          const fh = ROM.hash2(fi, fj, this.seed + 5);
          col = fh < 0.25 ? B.ground[h < 0.5 ? 0 : 1] : B.fields[(fh * 97 | 0) % B.fields.length];
          if (((j % 4) + 4) % 4 === 0 && h < 0.6) col = ROM.shade(col, 0.92);
        } else {
          col = B.ground[h < 0.5 ? 0 : 1];
          if (h > 0.93) col = ROM.shade(B.ground[0], 0.9);
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy - 0.6);
        ctx.lineTo(sx + hw + 0.6, sy + hh);
        ctx.lineTo(sx, sy + 2 * hh + 0.6);
        ctx.lineTo(sx - hw - 0.6, sy + hh);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      }
    }
    // roads (projected ribbons)
    for (const rd of this.roads) {
      if (rd.y0 < proj.cy - 700 || rd.y1 > proj.cy + 700) continue;
      ctx.strokeStyle = B.snow ? '#9aa4ad' : '#5d5f5c';
      ctx.lineWidth = 14 * s;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let first = true;
      for (let y = Math.min(rd.y0, proj.cy + 700); y >= Math.max(rd.y1, proj.cy - 700); y -= 30) {
        const x = this.roadX(rd, y);
        if (this.isWater(x, y)) { first = true; continue; }
        const [sx, sy] = proj.p(x, y, 0);
        if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,220,170,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  F.roadX = function (rd, y) { return rd.x + rd.amp * Math.sin(y * rd.f + rd.ph); };

  /* ---------------- level generation ---------------- */
  F.generate = function () {
    const rng = ROM.RNG(this.seed);
    const B = this.biome;
    const L = this.L;
    const objs = this.objs;
    // rivers
    if (B.river) {
      const n = B.wideRiver ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const y = -L * (0.2 + 0.6 * (k + rng() * 0.6) / n);
        this.rivers.push({ y, w: B.wideRiver && k === n - 1 ? 260 : rng.range(70, 110), amp: rng.range(40, 120), f: rng.range(0.004, 0.01), ph: rng() * 6 });
      }
    }
    // roads
    this.roads = [];
    for (let y = 0; y > -L - 1400; y -= rng.range(2500, 4200)) {
      this.roads.push({ y0: y, y1: y - rng.range(2200, 4000), x: rng.range(-150, 150), amp: rng.range(60, 200), f: rng.range(0.0008, 0.002), ph: rng() * 6 });
    }
    const add = (o) => { o.hp0 = o.hp; objs.push(o); return o; };
    const land = (x, y) => !this.isWater(x, y) && !this.isCity(y);
    const tree = (x, y) => { if (land(x, y)) add({ k: 'tree', x, y, z: 0, r: 9, h: rng.range(26, 40), hp: 3, round: !B.snow && rng() < (B.fields ? 0.7 : 0.25), solid: true }); };
    const roadAt = (y) => {
      for (const rd of this.roads) if (y <= rd.y0 && y >= rd.y1) return rd;
      return null;
    };
    const W = B.weights;
    const pool = [];
    for (const k in W) for (let i = 0; i < W[k]; i++) pool.push(k);
    const lvl = this.mission.index;
    const mil = 0.8 + lvl * 0.2 + this.diff * 0.25;

    // scatter background trees everywhere
    for (let y = -200; y > -L + 900; y -= 22) {
      const tx = rng.range(-520, 520);
      const dens = (B.weights.forest > 3 ? 0.9 : 0.55) * (Math.abs(tx) < LAT + 20 ? 0.3 : 1);
      if (rng() < dens) tree(tx, y + rng.range(-10, 10));
    }

    let y = -650;
    let segIndex = 0;
    while (y > -L + 1100) {
      const seg = segIndex < 1 ? 'forest' : rng.pick(pool);
      segIndex++;
      const len = rng.range(380, 620);
      const cx = rng.range(-LAT + 40, LAT - 40);
      const rd = roadAt(y);
      switch (seg) {
        case 'forest': {
          const n = rng.int(14, 30);
          for (let i = 0; i < n; i++) tree(cx + rng.range(-150, 150), y - rng.range(0, len * 0.8));
          break;
        }
        case 'village': {
          const vx = rd ? this.roadX(rd, y - len / 2) : cx;
          const n = rng.int(4, 8);
          for (let i = 0; i < n; i++) {
            const hy = y - rng.range(20, len * 0.8);
            const hx = (rd ? this.roadX(rd, hy) : vx) + (rng() < 0.5 ? -1 : 1) * rng.range(30, 110);
            if (land(hx, hy)) add({ k: 'house', x: hx, y: hy, z: 0, r: 15, h: rng.range(14, 22), hp: 2, score: 50, solid: true, wall: rng.pick(B.houseWall), roof: rng.pick(B.roof), w: rng.range(22, 34), d: rng.range(18, 24) });
          }
          if (rd && rng() < 0.6) add({ k: 'truck', x: this.roadX(rd, y - len / 2), y: y - len / 2, z: 0, r: 12, h: 14, hp: 1, score: 150, road: rd, dir: 1, sp: rng.range(25, 45) });
          break;
        }
        case 'armor': {
          const n = Math.round(rng.int(2, 3) * mil);
          for (let i = 0; i < n; i++) {
            let tx, ty = y - rng.range(0, len * 0.8);
            if (rd && rng() < 0.6) tx = this.roadX(rd, ty); else tx = ROM.clamp(cx + rng.range(-120, 120), -LAT, LAT);
            if (land(tx, ty)) add({ k: 'tank', x: tx, y: ty, z: 0, r: 15, h: 14, hp: 2, score: 300, yaw: rng() * 6, aim: 0, fireT: rng.range(0.5, 2.5), road: rd && Math.abs(tx - this.roadX(rd, ty)) < 1 ? rd : null, dir: rng() < 0.5 ? 1 : -1, sp: rng.range(12, 22) });
          }
          break;
        }
        case 'sam': {
          const n = rng.int(1, mil > 1.2 ? 2 : 1);
          for (let i = 0; i < n; i++) {
            const sx = ROM.clamp(cx + rng.range(-100, 100), -LAT, LAT), sy = y - rng.range(50, len * 0.7);
            if (land(sx, sy)) add({ k: 'sam', x: sx, y: sy, z: 0, r: 15, h: 16, hp: 2, score: 400, fireT: rng.range(0.5, 2), yaw: 0 });
          }
          for (let i = 0; i < 6; i++) tree(cx + rng.range(-160, 160), y - rng.range(0, len));
          break;
        }
        case 'flak': {
          const n = Math.round(rng.int(1, 3) * mil);
          for (let i = 0; i < n; i++) {
            const fx2 = rng.range(-LAT, LAT), fy = y - rng.range(30, len * 0.8);
            if (land(fx2, fy)) add({ k: 'flak', x: fx2, y: fy, z: 0, r: 13, h: 12, hp: 2, score: 350, fireT: rng.range(0.4, 2), yaw: 0 });
          }
          break;
        }
        case 'radar': {
          const rx = rng.range(-LAT + 30, LAT - 30), ry = y - len / 2;
          if (land(rx, ry)) add({ k: 'radar', x: rx, y: ry, z: 0, r: 13, h: 52, hp: 3, score: 600, solid: true });
          for (let i = 0; i < 2; i++) {
            const fx2 = rx + rng.range(-90, 90), fy = ry + rng.range(-90, 90);
            if (land(fx2, fy)) add({ k: 'flak', x: fx2, y: fy, z: 0, r: 13, h: 12, hp: 2, score: 350, fireT: rng.range(0.4, 2), yaw: 0 });
          }
          break;
        }
        case 'boats': {
          let placed = 0;
          for (let i = 0; i < 30 && placed < 3; i++) {
            const bx = rng.range(-LAT, LAT), by = y - rng.range(0, len);
            if (this.isWater(bx, by) && this.isWater(bx + 20, by) && this.isWater(bx - 20, by)) {
              add({ k: 'boat', x: bx, y: by, z: 0, r: 16, h: 12, hp: 2, score: 400, fireT: rng.range(0.5, 2), yaw: rng() * 6, sp: rng.range(10, 25) });
              placed++;
            }
          }
          if (!placed) for (let i = 0; i < 10; i++) tree(cx + rng.range(-150, 150), y - rng.range(0, len));
          break;
        }
        case 'pylons': {
          const py = y - len / 2;
          add({ k: 'wires', x: 0, y: py, z: 0, r: 0, h: 0, hp: Infinity, solid: false, wz: rng.range(46, 62) });
          if (rng() < 0.5) add({ k: 'pylon', x: rng.range(-LAT + 40, LAT - 40), y: py, z: 0, r: 7, h: 80, hp: Infinity, solid: true });
          break;
        }
        case 'fuel': {
          const fx2 = ROM.clamp(cx, -LAT + 30, LAT - 30), fy = y - len / 2;
          for (let i = 0; i < 3; i++) {
            const ox = fx2 + (i - 1) * 34, oy = fy + rng.range(-10, 10);
            if (land(ox, oy)) add({ k: 'fuel', x: ox, y: oy, z: 0, r: 14, h: 22, hp: 2, score: 200, solid: true });
          }
          if (land(fx2 + 60, fy - 50)) add({ k: 'flak', x: fx2 + 60, y: fy - 50, z: 0, r: 13, h: 12, hp: 2, score: 350, fireT: 1, yaw: 0 });
          break;
        }
        default: break;
      }
      // airborne threats
      if (rng() < 0.28 + lvl * 0.06) {
        this.air.push({ k: 'helispawn', y: y - len * 0.5, n: rng.int(1, 2 + (lvl > 2 ? 1 : 0)) });
      }
      if (rng() < 0.18 + lvl * 0.05) this.air.push({ k: 'migspawn', y: y - len * 0.3, n: rng.int(1, 2) });
      y -= len;
    }
    // city outskirts: apartment blocks with gaps
    for (let cy = -L + 850; cy > -L - 1300; cy -= 95) {
      for (let cx = -560; cx < 560; cx += 85) {
        if (rng() < 0.38) continue;
        const inCorr = Math.abs(cx) < LAT + 30;
        const h = inCorr ? rng.range(18, 58) : rng.range(30, 110);
        add({ k: 'block', x: cx + rng.range(-12, 12), y: cy + rng.range(-10, 10), z: 0, r: 22, h, hp: inCorr ? 3 : Infinity, score: 100, solid: true, w: rng.range(34, 52), d: rng.range(30, 46), c: rng.pick(['#9aa0a6', '#a8a196', '#8f9aa5', '#b0a58f']) });
      }
      if (rng() < 0.5) add({ k: 'flak', x: rng.range(-LAT, LAT), y: cy - 40, z: 0, r: 13, h: 12, hp: 2, score: 350, fireT: 1, yaw: 0 });
    }
    // remove objects behind the start point when resuming
    const sy = this.p.y;
    this.objs = objs.filter((o) => o.y < sy - 250 || o.k === 'tree' || o.k === 'house' || o.k === 'block');
    this.air = this.air.filter((a) => a.y < sy - 250);
    this.objs.forEach((o, i) => (o.id = i));
  };

  /* ---------------- update ---------------- */
  F.update = function (dt, I) {
    this.t += dt;
    const p = this.p;
    const g = this.game;
    this.fx.update(dt, 0);

    if (this.state === 'dead') {
      this.endT += dt;
      p.y -= this.speed * 0.3 * dt;
      if (this.endT > 2.4 && !this.reported) { this.reported = true; g.onDeath({ checkpoint: this.lastCheckpoint() }); }
      this.updateWorld(dt);
      return;
    }
    if (this.state === 'arrive') {
      this.endT += dt;
      p.y -= this.speed * dt;
      p.z = ROM.approach(p.z, 60, 40 * dt);
      if (this.endT > 2.2 && !this.reported) { this.reported = true; g.stageClear({ bonus: 1000 + this.mission.index * 500 }); }
      this.updateWorld(dt);
      return;
    }

    // controls
    const acc = 900;
    if (I.is('left')) p.vx = ROM.approach(p.vx, -170, acc * dt);
    else if (I.is('right')) p.vx = ROM.approach(p.vx, 170, acc * dt);
    else p.vx = ROM.approach(p.vx, 0, acc * 0.8 * dt);
    if (I.is('up')) p.vz = ROM.approach(p.vz, 95, 500 * dt);
    else if (I.is('down')) p.vz = ROM.approach(p.vz, -95, 500 * dt);
    else p.vz = ROM.approach(p.vz, 0, 420 * dt);
    p.x = ROM.clamp(p.x + p.vx * dt, -LAT, LAT);
    p.z = ROM.clamp(p.z + p.vz * dt, ZMIN, ZMAX);
    if ((p.z === ZMIN && p.vz < 0) || (p.z === ZMAX && p.vz > 0)) p.vz = 0;
    p.y -= this.speed * dt;
    p.inv = Math.max(0, p.inv - dt);
    ROM.Audio.engine(true, 1.15 + p.z / 300);

    // fire
    p.fireT -= dt;
    if (I.is('fire') && p.fireT <= 0) {
      p.fireT = 0.11;
      const side = (this.t * 9 | 0) % 2 ? 6 : -6;
      this.bullets.push({ x: p.x + side, y: p.y - 18, z: p.z, vy: -(this.speed + 620), vz: -Math.min(30, p.z * 0.5), life: 0.85 });
      ROM.Audio.sfx('shot');
    }
    p.bombT -= dt;
    if (I.is('bomb') && p.bombT <= 0) {
      p.bombT = 0.55;
      this.bombs.push({ x: p.x, y: p.y, z: p.z - 4, vy: -this.speed * 0.95, vz: 0 });
      ROM.Audio.sfx('bomb');
    }

    // checkpoints
    while (this.cpPassed < this.checkpoints.length && p.y < this.checkpoints[this.cpPassed]) {
      this.cpPassed++;
      this.cpFlash = 2;
      ROM.Audio.sfx('select');
    }
    this.cpFlash = Math.max(0, (this.cpFlash || 0) - dt);

    // radar
    const high = p.z > RADAR_ALT;
    let nearRadar = false;
    for (const o of this.objs) if (o.k === 'radar' && o.hp > 0 && Math.abs(o.y - p.y) < 900) { nearRadar = true; break; }
    const prevAlert = this.alert;
    if (high) this.alert = Math.min(1, this.alert + dt * (nearRadar ? 0.9 : 0.28));
    else this.alert = Math.max(0, this.alert - dt * 0.35);
    if (this.alert >= 1 && prevAlert < 1) { g.banner('INTERCEPTORS SCRAMBLED', '#ff6b5a', 0, 2); ROM.Audio.sfx('alarm'); }
    if (high && Math.floor(this.t * 2.5) !== Math.floor((this.t - dt) * 2.5)) ROM.Audio.sfx('lock');
    this.migT -= dt;
    if (this.alert > 0.6 && this.migT <= 0 && !this.isCityAhead()) {
      this.migT = 3.2 - this.diff;
      this.spawnMig(2);
    }

    // scripted air spawns
    for (const a of this.air) {
      if (!a.done && p.y < a.y + 700) {
        a.done = true;
        if (a.k === 'helispawn') for (let i = 0; i < a.n; i++) this.objs.push({ k: 'heli', x: ROM.rand(-LAT, LAT), y: a.y - i * 70, z: ROM.rand(45, 75), r: 16, h: 14, hp: 2, hp0: 2, score: 500, fireT: ROM.rand(0.8, 2), air: true, rot: 0, bob: Math.random() * 6 });
        else this.spawnMig(a.n);
      }
    }

    this.updateWorld(dt);
    this.collide();

    if (p.y < -this.L && this.state === 'fly') {
      this.state = 'arrive';
      this.endT = 0;
      ROM.Audio.sfx('clear');
    }
  };
  F.isCityAhead = function () { return this.p.y < -this.L + 400; };
  F.lastCheckpoint = function () { return this.cpPassed > 0 ? this.checkpoints[this.cpPassed - 1] : 0; };

  F.spawnMig = function (n) {
    const p = this.p;
    for (let i = 0; i < n; i++) {
      this.objs.push({ k: 'mig', x: ROM.clamp(p.x + ROM.rand(-160, 160), -LAT, LAT), y: p.y - 760 - i * 60, z: ROM.clamp(p.z + ROM.rand(-20, 30), 30, 120), r: 16, h: 10, hp: 1, hp0: 1, score: 800, fireT: ROM.rand(0.3, 0.8), air: true, vx: 0, shots: 3 });
    }
    ROM.Audio.sfx('missile');
  };

  F.updateWorld = function (dt) {
    const p = this.p, d = this.diff, lvl = this.mission.index;
    const rate = 0.75 + d * 0.35 + lvl * 0.08;
    const dying = this.state !== 'fly';
    // player bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0 || b.z < 0) this.bullets.splice(i, 1);
    }
    // bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vz -= 300 * dt;
      b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.z <= 0) {
        this.bombs.splice(i, 1);
        this.fx.explode(b.x, b.y, 0, this.isWater(b.x, b.y) ? 0.7 : 1.1, { debris: '#5b4a3a' });
        ROM.Audio.sfx('boom');
        for (const o of this.objs) {
          if (o.hp <= 0 || o.air || o.hp === Infinity) continue;
          if (ROM.dist2(o.x, o.y, b.x, b.y) < 36 + o.r) this.damage(o, 3);
        }
      }
    }
    // objects
    for (const o of this.objs) {
      const ahead = p.y - o.y; // positive = in front of player
      if (ahead < -400 || ahead > 1100) { if (o.air && ahead < -400) o.gone = true; continue; }
      if (o.hp <= 0) { if (o.smoke !== undefined && (o.smoke -= dt) < 0) { o.smoke = 0.25; this.fx.puff(o.x, o.y, o.h * 0.6, 7, 1.4, '#3a3a3a'); } continue; }
      const canFire = !dying && ahead > 90 && ahead < 620;
      switch (o.k) {
        case 'tank': {
          if (o.road) { o.y += o.dir * o.sp * dt; o.x = this.roadX(o.road, o.y); o.yaw = o.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
          o.aim = Math.atan2(p.y - o.y, p.x - o.x);
          o.fireT -= dt * rate;
          if (canFire && o.fireT <= 0) { o.fireT = ROM.rand(1.6, 3); this.enemyFire(o, 'shell', 230, 12); }
          break;
        }
        case 'truck': {
          o.y += o.dir * o.sp * dt; o.x = this.roadX(o.road, o.y);
          break;
        }
        case 'boat': {
          o.yaw += 0.15 * dt;
          const nx = o.x + Math.cos(o.yaw) * o.sp * dt, ny = o.y + Math.sin(o.yaw) * o.sp * dt;
          if (this.isWater(nx + Math.cos(o.yaw) * 20, ny + Math.sin(o.yaw) * 20)) { o.x = nx; o.y = ny; } else o.yaw += 1.5;
          o.fireT -= dt * rate;
          if (canFire && o.fireT <= 0) { o.fireT = ROM.rand(1.2, 2.4); this.enemyFire(o, 'bullet', 300, 10); }
          break;
        }
        case 'sam': {
          o.yaw = Math.atan2(p.y - o.y, p.x - o.x);
          o.fireT -= dt * rate;
          if (canFire && (p.z > 45 || this.alert > 0.5) && o.fireT <= 0) {
            o.fireT = ROM.rand(2.8, 4.2);
            this.eshots.push({ k: 'missile', x: o.x, y: o.y, z: 14, vx: 0, vy: 30, vz: 120, sp: 150, life: 5.5, hp: 1 });
            ROM.Audio.sfx('missile');
          }
          break;
        }
        case 'flak': {
          o.yaw = Math.atan2(p.y - o.y, p.x - o.x);
          o.fireT -= dt * rate;
          if (canFire && o.fireT <= 0) {
            o.fireT = ROM.rand(1.4, 2.6);
            const tt = 0.9;
            const tx = p.x + p.vx * tt * 0.6 + ROM.rand(-25, 25), ty = p.y - this.speed * tt + ROM.rand(-30, 30), tz = p.z + ROM.rand(-12, 12);
            this.eshots.push({ k: 'flak', x: o.x, y: o.y, z: 14, vx: (tx - o.x) / tt, vy: (ty - o.y) / tt, vz: (tz - 14) / tt, life: tt });
            ROM.Audio.sfx('enemyShot');
          }
          break;
        }
        case 'heli': {
          o.rot += dt * 30;
          o.bob += dt * 2;
          o.x = ROM.approach(o.x, p.x, 35 * dt);
          o.y -= 50 * dt;
          o.z += Math.sin(o.bob) * 8 * dt;
          o.fireT -= dt * rate;
          if (canFire && o.fireT <= 0) { o.fireT = ROM.rand(1, 1.8); this.enemyFire(o, 'bullet', 320, o.z - 2); }
          break;
        }
        case 'mig': {
          o.y += 300 * dt;
          o.x = ROM.approach(o.x, p.x, 70 * dt);
          o.z = ROM.approach(o.z, p.z, 25 * dt);
          o.fireT -= dt * rate;
          if (canFire && o.shots > 0 && o.fireT <= 0) { o.shots--; o.fireT = 0.35; this.enemyFire(o, 'bullet', 420, o.z); }
          if (Math.random() < 0.5) this.fx.trail(o.x, o.y - 18, o.z, 2);
          break;
        }
        default: break;
      }
    }
    this.objs = this.objs.filter((o) => !o.gone);
    // enemy shots
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.life -= dt;
      if (s.k === 'missile') {
        // homing
        const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
        const dl = Math.hypot(dx, dy, dz) || 1;
        s.sp = Math.min(320, s.sp + 160 * dt);
        const turn = 2.2 * dt;
        s.vx += (dx / dl * s.sp - s.vx) * turn;
        s.vy += (dy / dl * s.sp - s.vy) * turn;
        s.vz += (dz / dl * s.sp - s.vz) * turn;
        const vl = Math.hypot(s.vx, s.vy, s.vz) || 1;
        s.vx = s.vx / vl * s.sp; s.vy = s.vy / vl * s.sp; s.vz = s.vz / vl * s.sp;
        if (Math.random() < 0.8) this.fx.trail(s.x, s.y, s.z, 2.4);
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.k === 'flak' && s.life <= 0) {
        this.fx.flak(s.x, s.y, s.z);
        ROM.Audio.sfx('flak');
        if (!dying && ROM.dist3(s.x, s.y, s.z, p.x, p.y, p.z) < 24) this.kill('flak');
        this.eshots.splice(i, 1);
        continue;
      }
      if (s.life <= 0 || s.z < 0) {
        if (s.k === 'missile') this.fx.explode(s.x, s.y, Math.max(0, s.z), 0.5);
        this.eshots.splice(i, 1);
      }
    }
  };

  F.enemyFire = function (o, kind, speed, z0) {
    const p = this.p;
    let tx = p.x, ty = p.y, tz = p.z;
    for (let k = 0; k < 2; k++) {
      const tt = ROM.dist3(o.x, o.y, z0, tx, ty, tz) / speed;
      tx = p.x + p.vx * tt * 0.5; ty = p.y - this.speed * tt; tz = p.z;
    }
    const d = ROM.dist3(o.x, o.y, z0, tx, ty, tz) || 1;
    this.eshots.push({ k: kind, x: o.x, y: o.y, z: z0, vx: (tx - o.x) / d * speed, vy: (ty - o.y) / d * speed, vz: (tz - z0) / d * speed, life: 2.6 });
    ROM.Audio.sfx('enemyShot');
  };

  F.damage = function (o, n) {
    if (o.hp <= 0 || o.hp === Infinity) return;
    o.hp -= n;
    if (o.hp > 0) { this.fx.spark(o.x, o.y, (o.z || 0) + o.h * 0.6); ROM.Audio.sfx('clank'); return; }
    const big = o.k === 'fuel' ? 2.2 : o.k === 'block' ? 1.6 : o.air ? 1.1 : 1;
    this.fx.explode(o.x, o.y, (o.z || 0) + o.h * 0.4, big);
    ROM.Audio.sfx(big > 1.5 ? 'bigboom' : 'boom');
    if (o.score) { this.game.addScore(o.score); this.fx.text(o.x, o.y, (o.z || 0) + o.h + 10, '+' + o.score); }
    if (o.air) o.gone = true;
    else o.smoke = 0.1;
  };

  F.kill = function (why) {
    if (this.game.god || this.p.inv > 0 || this.state !== 'fly') return;
    const p = this.p;
    this.state = 'dead';
    this.endT = 0;
    this.deathWhy = why;
    this.fx.explode(p.x, p.y, p.z, 1.7);
    this.fx.flash = 1;
    ROM.Audio.sfx('bigboom');
    ROM.Audio.engine(false);
  };

  F.collide = function () {
    const p = this.p;
    // bullets vs objects / shots
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let hit = false;
      for (const o of this.objs) {
        if (o.hp <= 0 || o.k === 'wires') continue;
        if (Math.abs(o.y - b.y) > o.r + 14 || Math.abs(o.x - b.x) > o.r + 5) continue;
        const oz = o.z || 0;
        if (b.z < oz - 4 || b.z > oz + o.h + (o.air ? 6 : 12)) continue;
        hit = true;
        if (o.k === 'tree' || o.hp === Infinity) { this.fx.spark(b.x, b.y, b.z, '#c9d6a0'); break; }
        this.damage(o, 1);
        break;
      }
      if (!hit) {
        for (const s of this.eshots) {
          if (s.k !== 'missile') continue;
          if (ROM.dist3(s.x, s.y, s.z, b.x, b.y, b.z) < 16) { s.life = 0; hit = true; this.game.addScore(150); this.fx.text(s.x, s.y, s.z + 10, '+150'); ROM.Audio.sfx('small'); break; }
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }
    if (this.state !== 'fly') return;
    // player vs world
    for (const o of this.objs) {
      if (o.hp <= 0 && !o.solid) continue;
      if (o.k === 'wires') {
        if (Math.abs(o.y - p.y) < 8 && p.z > o.wz - 5 && p.z < o.wz + 6) this.kill('wires');
        continue;
      }
      if (Math.abs(o.y - p.y) > o.r + 14 || Math.abs(o.x - p.x) > o.r + 16) continue;
      const oz = o.z || 0;
      const top = o.hp <= 0 ? (o.k === 'block' ? o.h * 0.3 : 4) : o.h;
      if (o.air) {
        if (Math.abs(oz - p.z) < 12) { this.damage(o, 9); this.kill('collision'); }
      } else if (p.z < oz + top + 3) this.kill(o.k === 'tree' ? 'tree' : 'crash');
    }
    for (const s of this.eshots) {
      if (s.k === 'flak') continue;
      if (ROM.dist3(s.x, s.y, s.z, p.x, p.y, p.z) < (s.k === 'missile' ? 14 : 11)) { s.life = 0; this.kill(s.k); }
    }
  };

  /* autopilot: weave toward targets, keep low but over obstacles */
  F.auto = function () {
    const p = this.p;
    const a = { fire: true };
    let best = null, bd = 1e9;
    for (const o of this.objs) {
      if (o.hp <= 0 || !o.score || o.k === 'house' || o.k === 'block') continue;
      const ah = p.y - o.y;
      if (ah < 120 || ah > 520) continue;
      if (ah < bd) { bd = ah; best = o; }
    }
    let tx = best ? best.x : Math.sin(this.t * 0.4) * 120;
    // clearance needed over everything in the swept path for the next ~1.2s
    const need = (x) => {
      let n = 22;
      for (const o of this.objs) {
        if (!o.solid || (o.hp <= 0 && o.k !== 'block')) continue;
        const ah = p.y - o.y;
        if (ah > -30 && ah < 260 && Math.abs(o.x - x) < o.r + 30) n = Math.max(n, (o.hp <= 0 ? o.h * 0.3 : o.h) + 18);
        if (o.k === 'wires' && ah > -20 && ah < 220) n = Math.max(n, o.wz + 16);
      }
      for (const o of this.objs) if (o.k === 'wires' && p.y - o.y > -20 && p.y - o.y < 220) n = Math.max(n, o.wz + 16);
      return Math.min(n, 70);
    };
    const here = need(p.x), there = need(tx);
    if (there > here + 10 && there > p.z + 5) tx = p.x; // don't steer into something we can't clear
    // dodge incoming fire
    for (const s of this.eshots) {
      if (s.k === 'flak') continue;
      const rel = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
      if (rel < 180 && s.y > p.y - 220) { tx = s.x > p.x ? p.x - 80 : p.x + 80; break; }
    }
    if (p.x < tx - 8) a.right = true; else if (p.x > tx + 8) a.left = true;
    let want = Math.max(here, Math.min(there, 70));
    if (best && best.air) want = Math.max(want, Math.min(70, best.z));
    if (p.z < want - 2) a.up = true; else if (p.z > want + 6) a.down = true;
    if (best && !best.air && bd < 300 && Math.abs(best.x - p.x) < 20) a.bomb = true;
    return a;
  };

  /* ---------------- draw ---------------- */
  F.draw = function (ctx) {
    const proj = this.proj, p = this.p, q = this.q, B = this.biome;
    proj.cx = 0;
    proj.cy = p.y - 210;
    if (this.fx.shake > 0) { proj.cx += ROM.rand(-1, 1) * this.fx.shake; proj.cy += ROM.rand(-1, 1) * this.fx.shake; }
    this.drawGround(ctx);
    // cloud shadows
    for (const c of this.clouds) {
      if (Math.abs(c.y - proj.cy) > 900) continue;
      R.softShadow(proj, c.x + 60, c.y + 60, c.r * 1.2, 0.12);
    }
    // objects
    for (const o of this.objs) {
      const ah = p.y - o.y;
      if (ah < -420 || ah > 1050) continue;
      if (o.k === 'wires') { q.add(proj.near(0, o.y, o.wz) - 300, () => this.drawWires(o)); continue; }
      const oz = o.z || 0;
      if (o.air && o.hp > 0) R.shadow(proj, o.x, o.y, o.r * 0.8, 0.22);
      else if (o.hp > 0 && o.k !== 'tree') R.shadow(proj, o.x + 4, o.y + 3, o.r * 1.05, 0.25);
      q.add(proj.near(o.x, o.y, oz + (o.air ? 0 : o.h * 0.3)), () => this.drawObj(o));
    }
    // player
    if (this.state !== 'dead') {
      R.shadow(proj, p.x, p.y + 4, 15, Math.max(0.12, 0.45 - p.z / 400));
      const blink = p.inv > 0 && Math.floor(this.t * 12) % 2 === 0;
      q.add(proj.near(p.x, p.y, p.z), () => {
        if (!blink) R.mesh(proj, Md.bomber, p.x, p.y, p.z, -Math.PI / 2, p.vz / 260, -p.vx / 260, 1.15);
        R.orb(proj, p.x, p.y + 20, p.z + 1, 5 + Math.random() * 2, 'rgba(255,230,160,0.9)', 'rgba(255,120,40,0)');
      });
      // altitude line
      const a1 = proj.p(p.x, p.y, 0), a2 = proj.p(p.x, p.y, p.z - 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const b of this.bullets) q.add(proj.near(b.x, b.y, b.z), () => {
      R.line3(proj, [b.x, b.y, b.z], [b.x, b.y + 16, b.z - b.vz * 16 / b.vy], '#fff3b0', 2.2);
    });
    for (const b of this.bombs) { R.shadow(proj, b.x, b.y, 3, 0.3); q.add(proj.near(b.x, b.y, b.z), () => R.orb(proj, b.x, b.y, b.z, 3.2, '#e9eef2', '#4a525a')); }
    for (const s of this.eshots) {
      q.add(proj.near(s.x, s.y, s.z), () => {
        if (s.k === 'missile') R.mesh(proj, Md.missile, s.x, s.y, s.z, Math.atan2(s.vy, s.vx), Math.atan2(s.vz, Math.hypot(s.vx, s.vy)), 0, 1.3);
        else if (s.k === 'flak') R.dot(proj, s.x, s.y, s.z, 1.6, '#202020');
        else R.orb(proj, s.x, s.y, s.z, s.k === 'shell' ? 4.2 : 3.4, '#fff6c8', s.k === 'shell' ? 'rgba(255,120,40,0)' : 'rgba(255,70,50,0)');
      });
    }
    this.fx.queue(proj, q);
    q.flush();
    // clouds above everything
    for (const c of this.clouds) {
      if (Math.abs(c.y - proj.cy) > 900) continue;
      for (let i = 0; i < c.n; i++) {
        const ox = Math.sin(c.s + i * 2.1) * c.r * 0.6, oy = Math.cos(c.s + i * 1.7) * c.r * 0.5;
        R.orb(proj, c.x + ox, c.y + oy, c.z + i * 3, c.r * 0.55, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)');
      }
    }
    this.fx.drawTexts(proj);
    // haze toward the horizon (top-right)
    const hz = ctx.createLinearGradient(ROM.W, 0, ROM.W * 0.55, ROM.H * 0.45);
    hz.addColorStop(0, B.snow ? 'rgba(235,242,248,0.45)' : 'rgba(200,220,235,0.32)');
    hz.addColorStop(1, 'rgba(200,220,235,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, ROM.W, ROM.H);
    if (B.snow) this.drawSnow(ctx);

    if (this.state === 'fly') {
      if (p.z > RADAR_ALT) this.game.banner(this.alert > 0.6 ? 'RADAR LOCK — DESCEND!' : 'ABOVE RADAR FLOOR', '#ff6b5a', 0, 0, true);
      if (this.cpFlash > 0) this.game.banner('CHECKPOINT ' + this.cpPassed, '#2fbf9b');
    } else if (this.state === 'arrive') {
      this.game.banner(this.mission.city.toUpperCase() + ' LAUNCH SITE AHEAD', '#2fbf9b');
    } else if (this.state === 'dead') {
      const why = { tree: 'CLIPPED THE TREES', crash: 'CRASHED', wires: 'CAUGHT IN POWER LINES', flak: 'HIT BY FLAK', missile: 'SAM HIT', collision: 'MID-AIR COLLISION' }[this.deathWhy] || 'SHOT DOWN';
      this.game.banner(why, '#ff6b5a');
    }
  };

  F.drawSnow = function (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 70; i++) {
      const x = (ROM.hash2(i, 1, 9) * ROM.W + this.t * 40 + i * 13) % ROM.W;
      const y = (ROM.hash2(i, 2, 9) * ROM.H + this.t * (50 + (i % 5) * 12)) % ROM.H;
      ctx.fillRect(x, y, 2, 2);
    }
  };

  F.drawWires = function (o) {
    const proj = this.proj;
    const xs = [-560, -280, 0, 280, 560];
    for (const x of xs) R.cbox(proj, x, o.y, 0, 6, 6, o.wz + 8, '#6e757c');
    for (const dz of [0, 5]) {
      for (let k = 0; k < xs.length - 1; k++) {
        let prev = null;
        for (let s = 0; s <= 8; s++) {
          const x = ROM.lerp(xs[k], xs[k + 1], s / 8);
          const sag = Math.sin((s / 8) * Math.PI) * 9;
          const pt = [x, o.y, o.wz + dz - sag + 8];
          if (prev) R.line3(proj, prev, pt, 'rgba(30,30,30,0.85)', 1.2);
          prev = pt;
        }
      }
    }
  };

  F.drawObj = function (o) {
    const proj = this.proj, B = this.biome, t = this.t;
    const dead = o.hp <= 0;
    switch (o.k) {
      case 'tree':
        if (dead) { R.cbox(proj, o.x, o.y, 0, 4, 4, 6, '#3b2f25'); break; }
        R.cbox(proj, o.x, o.y, 0, 3.4, 3.4, 8, '#5a4330');
        if (o.round) {
          R.orb(proj, o.x, o.y, o.h * 0.65, o.h * 0.38, ROM.shade(B.round, 1.25), ROM.shade(B.round, 0.75));
        } else {
          R.cone(proj, o.x, o.y, 5, 10, o.h * 0.65, 6, B.pine);
          R.cone(proj, o.x, o.y, o.h * 0.38, 7.5, o.h * 0.62, 6, B.snow ? '#e8eef3' : ROM.shadeHex(B.pine, 1.15));
        }
        break;
      case 'house':
        if (dead) { R.cbox(proj, o.x, o.y, 0, o.w, o.d, 4, '#3d3a36'); break; }
        R.cbox(proj, o.x, o.y, 0, o.w, o.d, o.h, o.wall);
        R.gable(proj, o.x - o.w / 2 - 1, o.y - o.d / 2 - 2, o.h, o.w + 2, o.d + 4, 10, o.roof, o.wall);
        break;
      case 'block':
        if (dead) { R.cbox(proj, o.x, o.y, 0, o.w, o.d, o.h * 0.3, '#4a4744'); break; }
        R.cbox(proj, o.x, o.y, 0, o.w, o.d, o.h, o.c, { top: B.snow ? '#e8eef3' : '#6d7278' });
        // windows
        for (let z = 6; z < o.h - 4; z += 9) {
          const pts = [proj.p(o.x + o.w / 2 + 0.3, o.y - o.d / 2 + 4, z), proj.p(o.x + o.w / 2 + 0.3, o.y + o.d / 2 - 4, z), proj.p(o.x + o.w / 2 + 0.3, o.y + o.d / 2 - 4, z + 3), proj.p(o.x + o.w / 2 + 0.3, o.y - o.d / 2 + 4, z + 3)];
          R.fillPoly(pts, (z * 7 + o.id) % 3 ? 'rgba(40,52,64,0.55)' : 'rgba(255,214,120,0.6)');
        }
        break;
      case 'tank':
        R.mesh(proj, Md.tankHull, o.x, o.y, 0, o.yaw, 0, 0, 1, dead ? '#2a2a26' : null);
        R.mesh(proj, Md.tankTurret, o.x, o.y, 0, dead ? o.yaw + 0.6 : o.aim, 0, 0, 1, dead ? '#2a2a26' : null);
        break;
      case 'truck':
        R.mesh(proj, Md.truck, o.x, o.y, 0, o.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0, 1, dead ? '#2a2a26' : null);
        break;
      case 'boat':
        if (dead) { R.orb(proj, o.x, o.y, 1, 16, 'rgba(30,30,30,0.6)', 'rgba(30,30,30,0)'); break; }
        R.mesh(proj, Md.boat, o.x, o.y, 0, o.yaw, 0, Math.sin(t * 2 + o.x) * 0.06, 1);
        break;
      case 'sam':
        R.cbox(proj, o.x, o.y, 0, 26, 26, 5, dead ? '#2c2c2a' : '#6b6f55', { top: dead ? '#2c2c2a' : '#7a7e60' });
        if (dead) break;
        R.cbox(proj, o.x, o.y, 5, 10, 10, 6, '#55593f');
        for (const s of [-5, 5]) {
          const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
          R.mesh(proj, Md.missile, o.x - sn * s, o.y + c * s, 13, o.yaw, 0.7, 0, 1.4);
        }
        break;
      case 'flak':
        R.prism(proj, o.x, o.y, 0, 13, 5, 8, dead ? '#2c2c2a' : '#a4936a');
        if (dead) break;
        R.cbox(proj, o.x, o.y, 5, 9, 9, 6, '#4f5641');
        for (const s of [-2.5, 2.5]) {
          const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
          R.line3(proj, [o.x - sn * s, o.y + c * s, 9], [o.x - sn * s + c * 16, o.y + c * s + sn * 16, 22], '#2a2d24', 2.2);
        }
        break;
      case 'radar': {
        R.cbox(proj, o.x, o.y, 0, 14, 14, dead ? 8 : o.h - 8, dead ? '#2c2c2a' : '#80878e');
        if (dead) break;
        for (let z = 8; z < o.h - 10; z += 10) R.cbox(proj, o.x, o.y, z, 15, 15, 1.5, '#5a6067');
        const a = t * 2.4;
        const c = Math.cos(a), s = Math.sin(a);
        const top = o.h - 6;
        const pts = [[-13, 0], [13, 0]].map(([u]) => [o.x - s * u, o.y + c * u]);
        R.face(proj, [[pts[0][0], pts[0][1], top - 4], [pts[1][0], pts[1][1], top - 4], [pts[1][0] + c * 5, pts[1][1] + s * 5, top + 8], [pts[0][0] + c * 5, pts[0][1] + s * 5, top + 8]], '#c9d0d6', true);
        if (Math.floor(t * 3) % 2) R.orb(proj, o.x, o.y, o.h + 6, 3, '#ff6b5a', 'rgba(255,60,40,0)');
        break;
      }
      case 'fuel':
        R.prism(proj, o.x, o.y, 0, dead ? 15 : 14, dead ? 5 : o.h, 10, dead ? '#2c2c2a' : '#b9bfc5', { top: '#d0d5da' });
        if (!dead) R.prism(proj, o.x, o.y, o.h * 0.55, 14.3, 3, 10, '#c23b2e', { noTop: true });
        break;
      case 'pylon':
        R.cbox(proj, o.x, o.y, 0, 8, 8, o.h, '#6e757c');
        R.cbox(proj, o.x, o.y, o.h - 14, 40, 4, 3, '#6e757c');
        break;
      case 'heli': {
        R.mesh(proj, Md.heli, o.x, o.y, o.z - 6, Math.PI / 2, 0.12, 0, 1, dead ? '#2a2a26' : null);
        const a = o.rot;
        for (const off of [0, Math.PI / 2]) {
          const c = Math.cos(a + off) * 26, s = Math.sin(a + off) * 26;
          R.line3(proj, [o.x - c, o.y - s, o.z + 8], [o.x + c, o.y + s, o.z + 8], 'rgba(25,25,25,0.7)', 2);
        }
        break;
      }
      case 'mig':
        R.mesh(proj, Md.mig, o.x, o.y, o.z, Math.PI / 2, 0, Math.sin(t * 3 + o.x) * 0.2, 1.1);
        break;
      default: break;
    }
  };

  F.hud = function () {
    return {
      stage: 'FLIGHT',
      progress: ROM.clamp(-this.p.y / this.L, 0, 1),
      checkpoints: this.checkpoints.map((c) => -c / this.L),
      alt: this.p.z / ZMAX,
      radarAlt: RADAR_ALT / ZMAX,
      alert: this.alert,
    };
  };
})();
