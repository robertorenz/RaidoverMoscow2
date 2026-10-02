/* Stage: attack on the missile launch site.
   Destroy the Launch Control Center by shooting its roof hatches while they are
   open. Meanwhile ICBMs rise out of their silos — shoot them before they launch
   or an American city is lost. */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;
  const Md = ROM.Models;
  ROM.Stages = ROM.Stages || {};

  const AX = 300, AY = 250;   // arena half extents
  const PZ = 46;              // strike altitude (above the bunker roof)
  const BVZ = -40;            // gun depression: rounds dive onto the roof ~125 units ahead
  const CENTER = { x: -70, y: -90, w: 150, d: 110, h: 34 };

  function Silo(game, opts) {
    this.game = game;
    this.opts = opts || {};
    const mi = game.missionInfo();
    this.mission = mi;
    this.biome = ROM.BIOMES[mi.biome];
    this.diff = game.diff();
    this.proj = ROM.Iso(0.8);
    this.fx = new ROM.FX();
    this.q = ROM.Queue();
    this.t = 0;
    this.p = { x: 160, y: 190, z: PZ, vx: 0, vy: 0, head: -Math.PI * 0.75, fireT: 0, inv: 1.5 };
    this.bullets = [];
    this.eshots = [];
    this.state = 'fight';
    this.endT = 0;
    const persist = (this.persist = game.campaign.silo || (game.campaign.silo = { hatches: null, silos: null }));
    const hhp = 6 + Math.round(this.diff * 2);
    this.hatches = [-45, 0, 45].map((o, i) => ({ x: CENTER.x + o, y: CENTER.y, hp: persist.hatches ? persist.hatches[i] : hhp, hp0: hhp, open: 0, t: i * 1.7, period: 5.4 - this.diff * 0.6 }));
    const spots = [[-220, 60], [-110, 150], [40, 140], [190, -30]];
    this.silos = spots.map(([x, y], i) => ({
      x, y, state: persist.silos && persist.silos[i] === 'dead' ? 'dead' : 'closed',
      t: 4 + i * 6 + Math.random() * 2, open: 0, mz: -100, hp: 4, rise: 11.5 - this.diff * 2 - mi.index * 0.5,
    }));
    this.guns = [[-260, -210], [250, -220], [-270, 200], [260, 170], [60, -230]].slice(0, 3 + Math.min(2, mi.index)).map(([x, y]) => ({ k: 'aa', x, y, hp: 3, fireT: 1 + Math.random() * 2, yaw: 0 }));
    this.sams = [[150, -150]].concat(mi.index >= 2 ? [[-230, -40]] : []).map(([x, y]) => ({ k: 'sam', x, y, hp: 3, fireT: 3 + Math.random() * 2, yaw: 0 }));
    this.tanks = [{ x: -200, y: -200, dir: 1, hp: 2, yaw: 0, fireT: 2 }].concat(mi.index >= 1 ? [{ x: 220, y: 230, dir: -1, hp: 2, yaw: 0, fireT: 3, alongY: true }] : []);
    this.props = [
      { k: 'fuel', x: 210, y: 80, hp: 2 }, { k: 'fuel', x: 245, y: 110, hp: 2 },
      { k: 'barracks', x: -240, y: -110, hp: Infinity }, { k: 'barracks', x: 120, y: -205, hp: Infinity },
      { k: 'dish', x: 30, y: -170, hp: 3 },
    ];
    this.stars = null;
  }
  ROM.Stages.Silo = Silo;
  const S = Silo.prototype;
  S.name = 'LAUNCH SITE STRIKE';
  S.hint = 'Hit the Control Center hatches while OPEN · shoot rising ICBMs before they launch';

  S.save = function () {
    this.persist.hatches = this.hatches.map((h) => h.hp);
    this.persist.silos = this.silos.map((s) => (s.state === 'dead' ? 'dead' : 'ok'));
  };

  S.update = function (dt, I) {
    this.t += dt;
    const p = this.p, g = this.game;
    this.fx.update(dt, 0);
    if (this.state === 'dead') {
      this.endT += dt;
      if (this.endT > 2.4 && !this.reported) { this.reported = true; this.save(); g.onDeath({}); }
      this.updateWorld(dt);
      return;
    }
    if (this.state === 'won') {
      this.endT += dt;
      if (Math.random() < dt * 10 && this.endT < 2.5) {
        this.fx.explode(CENTER.x + ROM.rand(-70, 70), CENTER.y + ROM.rand(-50, 50), ROM.rand(10, 40), ROM.rand(1, 2.2));
        ROM.Audio.sfx('boom');
      }
      p.x += Math.cos(p.head) * 200 * dt; p.y += Math.sin(p.head) * 200 * dt; p.z += 40 * dt;
      if (this.endT > 3.6 && !this.reported) { this.reported = true; this.game.campaign.silo = null; g.stageClear({ bonus: 5000 }); }
      this.updateWorld(dt);
      return;
    }
    // screen-relative 8-way movement
    let ix = 0, iy = 0;
    if (I.is('up')) { ix -= 1; iy -= 1; }
    if (I.is('down')) { ix += 1; iy += 1; }
    if (I.is('left')) { ix -= 1; iy += 1; }
    if (I.is('right')) { ix += 1; iy -= 1; }
    const il = Math.hypot(ix, iy);
    const spd = 200;
    if (il > 0) {
      p.vx = ROM.approach(p.vx, ix / il * spd, 700 * dt);
      p.vy = ROM.approach(p.vy, iy / il * spd, 700 * dt);
    } else {
      // planes keep moving: drift forward slowly along heading
      p.vx = ROM.approach(p.vx, Math.cos(p.head) * 70, 300 * dt);
      p.vy = ROM.approach(p.vy, Math.sin(p.head) * 70, 300 * dt);
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 20) {
      const target = Math.atan2(p.vy, p.vx);
      let d = target - p.head;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.head += d * Math.min(1, dt * 8);
      p.bank = ROM.clamp(d, -0.7, 0.7);
    }
    p.x = ROM.clamp(p.x + p.vx * dt, -AX - 20, AX + 20);
    p.y = ROM.clamp(p.y + p.vy * dt, -AY - 20, AY + 20);
    p.inv = Math.max(0, p.inv - dt);
    ROM.Audio.engine(true, 1.1 + sp / 400);

    p.fireT -= dt;
    if ((I.is('fire') || I.is('bomb')) && p.fireT <= 0) {
      p.fireT = 0.1;
      const c = Math.cos(p.head), s = Math.sin(p.head);
      const side = (this.t * 10 | 0) % 2 ? 5 : -5;
      this.bullets.push({ x: p.x + c * 16 - s * side, y: p.y + s * 16 + c * side, z: p.z - 2, vx: c * 560 + p.vx * 0.3, vy: s * 560 + p.vy * 0.3, vz: BVZ, life: 0.75 });
      ROM.Audio.sfx('shot');
    }
    this.updateWorld(dt);
    this.collide();
  };

  S.updateWorld = function (dt) {
    const p = this.p, g = this.game;
    const rate = 0.8 + this.diff * 0.35 + this.mission.index * 0.08;
    const active = this.state === 'fight';
    // hatches
    for (const h of this.hatches) {
      if (h.hp <= 0) continue;
      h.t += dt;
      const ph = (h.t % h.period) / h.period;
      const target = ph < 0.42 ? 1 : 0;
      h.open = ROM.approach(h.open, target, dt * 2.5);
    }
    // silos
    for (const s of this.silos) {
      if (s.state === 'dead') continue;
      s.t -= dt;
      if (s.state === 'closed' && s.t <= 0 && active) { s.state = 'opening'; ROM.Audio.sfx('door'); }
      if (s.state === 'opening') { s.open = Math.min(1, s.open + dt * 0.8); if (s.open >= 1) { s.state = 'rising'; s.hp = 4; } }
      if (s.state === 'rising') {
        s.mz += (100 / s.rise) * dt;
        if (Math.random() < 0.3) this.fx.puff(s.x + ROM.rand(-10, 10), s.y + ROM.rand(-10, 10), 4, 8, 1, '#9a9a9a');
        if (s.mz >= 0) { s.state = 'launch'; s.v = 20; ROM.Audio.sfx('launch'); g.banner('ICBM LAUNCH DETECTED!', '#ff6b5a', 0, 1.5); }
      }
      if (s.state === 'launch') {
        s.v += 140 * dt;
        s.mz += s.v * dt;
        this.fx.puff(s.x, s.y, s.mz, 12, 1.5, '#cfcfcf');
        this.fx.parts.push({ t: 'fire', x: s.x, y: s.y, z: s.mz - 4, vx: 0, vy: 0, vz: -40, life: 0.3, max: 0.4, r: 9 });
        if (s.mz > 520) {
          s.state = 'closed'; s.open = 0; s.mz = -100; s.t = 15 + Math.random() * 6;
          if (active) g.cityHit();
        }
      }
      if (s.state === 'closed') s.open = Math.max(0, s.open - dt);
    }
    // AA guns / sams
    for (const a of this.guns) {
      if (a.hp <= 0) continue;
      a.yaw = Math.atan2(p.y - a.y, p.x - a.x);
      a.fireT -= dt * rate;
      if (active && a.fireT <= 0) {
        a.fireT = ROM.rand(1.6, 2.8);
        const tt = 0.85;
        const tx = p.x + p.vx * tt + ROM.rand(-42, 42), ty = p.y + p.vy * tt + ROM.rand(-42, 42), tz = PZ + ROM.rand(-6, 6);
        this.eshots.push({ k: 'flak', x: a.x, y: a.y, z: 12, vx: (tx - a.x) / tt, vy: (ty - a.y) / tt, vz: (tz - 12) / tt, life: tt });
        ROM.Audio.sfx('enemyShot');
      }
    }
    for (const a of this.sams) {
      if (a.hp <= 0) continue;
      a.yaw = Math.atan2(p.y - a.y, p.x - a.x);
      a.fireT -= dt * rate;
      if (active && a.fireT <= 0) {
        a.fireT = ROM.rand(4.5, 6.5);
        this.eshots.push({ k: 'missile', x: a.x, y: a.y, z: 14, vx: 0, vy: 0, vz: 100, sp: 120, life: 5, hp: 1 });
        ROM.Audio.sfx('missile');
      }
    }
    for (const tk of this.tanks) {
      if (tk.hp <= 0) continue;
      if (tk.alongY) { tk.y += tk.dir * 18 * dt; if (Math.abs(tk.y) > 230) tk.dir *= -1; tk.yaw = tk.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { tk.x += tk.dir * 18 * dt; if (Math.abs(tk.x) > 240) tk.dir *= -1; tk.yaw = tk.dir > 0 ? 0 : Math.PI; }
      tk.aim = Math.atan2(p.y - tk.y, p.x - tk.x);
      tk.fireT -= dt * rate;
      if (active && tk.fireT <= 0) {
        tk.fireT = ROM.rand(2.2, 3.4);
        const d = ROM.dist3(tk.x, tk.y, 12, p.x, p.y, PZ) || 1;
        const sp = 220;
        this.eshots.push({ k: 'shell', x: tk.x, y: tk.y, z: 12, vx: (p.x + p.vx * 0.4 - tk.x) / d * sp, vy: (p.y + p.vy * 0.4 - tk.y) / d * sp, vz: (PZ - 12) / d * sp, life: 2.5 });
        ROM.Audio.sfx('enemyShot');
      }
    }
    // bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.life <= 0) this.bullets.splice(i, 1);
    }
    // enemy shots
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.life -= dt;
      if (s.k === 'missile') {
        const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
        const dl = Math.hypot(dx, dy, dz) || 1;
        s.sp = Math.min(250, s.sp + 120 * dt);
        const turn = 2.0 * dt;
        s.vx += (dx / dl * s.sp - s.vx) * turn; s.vy += (dy / dl * s.sp - s.vy) * turn; s.vz += (dz / dl * s.sp - s.vz) * turn;
        const vl = Math.hypot(s.vx, s.vy, s.vz) || 1;
        s.vx = s.vx / vl * s.sp; s.vy = s.vy / vl * s.sp; s.vz = s.vz / vl * s.sp;
        if (Math.random() < 0.8) this.fx.trail(s.x, s.y, s.z, 2.4);
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.k === 'flak' && s.life <= 0) {
        this.fx.flak(s.x, s.y, s.z);
        ROM.Audio.sfx('flak');
        if (active && ROM.dist3(s.x, s.y, s.z, p.x, p.y, p.z) < 19) this.kill('flak');
        this.eshots.splice(i, 1);
        continue;
      }
      if (s.life <= 0) { if (s.k === 'missile') this.fx.explode(s.x, s.y, s.z, 0.5); this.eshots.splice(i, 1); }
    }
    for (const pr of this.props) if (pr.hp <= 0 && Math.random() < dt * 3) this.fx.puff(pr.x, pr.y, 10, 7, 1.4, '#333');
  };

  S.kill = function (why) {
    if (this.game.god || this.p.inv > 0 || this.state !== 'fight') return;
    this.state = 'dead';
    this.endT = 0;
    this.deathWhy = why;
    this.fx.explode(this.p.x, this.p.y, this.p.z, 1.7);
    ROM.Audio.sfx('bigboom');
    ROM.Audio.engine(false);
  };

  S.collide = function () {
    const p = this.p, g = this.game;
    const hitTarget = (b) => {
      // control center
      if (Math.abs(b.x - CENTER.x) < CENTER.w / 2 && Math.abs(b.y - CENTER.y) < CENTER.d / 2 && b.z <= CENTER.h + 1) {
        for (const h of this.hatches) {
          if (h.hp > 0 && Math.abs(b.x - h.x) < 15 && Math.abs(b.y - h.y) < 17) {
            if (h.open > 0.6) {
              h.hp--;
              this.fx.spark(h.x, h.y, CENTER.h + 2, '#ffb347');
              ROM.Audio.sfx('hit');
              if (h.hp <= 0) {
                this.fx.explode(h.x, h.y, CENTER.h, 1.4);
                ROM.Audio.sfx('bigboom');
                g.addScore(1000);
                this.fx.text(h.x, h.y, CENTER.h + 20, '+1000');
                if (this.hatches.every((q) => q.hp <= 0)) this.win();
              }
            } else { this.fx.spark(h.x, h.y, CENTER.h + 2, '#cfd8e0'); ROM.Audio.sfx('clank'); }
            return true;
          }
        }
        this.fx.spark(b.x, b.y, Math.min(b.z, CENTER.h), '#cfd8e0');
        ROM.Audio.sfx('clank');
        return true;
      }
      for (const s of this.silos) {
        if ((s.state === 'rising' || s.state === 'launch') && s.mz > -70 && Math.abs(b.x - s.x) < 12 && Math.abs(b.y - s.y) < 12) {
          s.hp--;
          this.fx.spark(s.x, s.y, Math.max(10, s.mz + 60), '#ffd27a');
          ROM.Audio.sfx('clank');
          if (s.hp <= 0) {
            this.fx.explode(s.x, s.y, Math.max(10, s.mz + 50), 2);
            ROM.Audio.sfx('bigboom');
            s.state = 'dead';
            g.addScore(2000);
            this.fx.text(s.x, s.y, 80, 'ICBM DESTROYED +2000', '#2fbf9b');
          }
          return true;
        }
      }
      const groups = [this.guns, this.sams, this.tanks, this.props];
      for (const grp of groups) {
        for (const o of grp) {
          if (o.hp <= 0 || o.hp === Infinity) continue;
          if (Math.abs(b.x - o.x) < 14 && Math.abs(b.y - o.y) < 14) {
            o.hp--;
            if (o.hp <= 0) {
              const sc = o.k === 'aa' ? 350 : o.k === 'sam' ? 400 : o.k === 'fuel' ? 200 : o.k === 'dish' ? 600 : 300;
              this.fx.explode(o.x, o.y, 10, o.k === 'fuel' ? 2 : 1);
              ROM.Audio.sfx('boom');
              g.addScore(sc);
              this.fx.text(o.x, o.y, 30, '+' + sc);
            } else { this.fx.spark(o.x, o.y, 12); ROM.Audio.sfx('clank'); }
            return true;
          }
        }
      }
      for (const s of this.eshots) {
        if (s.k === 'missile' && ROM.dist2(s.x, s.y, b.x, b.y) < 14 && Math.abs(s.z - b.z) < 20) {
          s.life = 0; g.addScore(150); ROM.Audio.sfx('small'); return true;
        }
      }
      return false;
    };
    for (let i = this.bullets.length - 1; i >= 0; i--) if (hitTarget(this.bullets[i])) this.bullets.splice(i, 1);
    if (this.state !== 'fight') return;
    for (const s of this.eshots) {
      if (s.k === 'flak') continue;
      if (ROM.dist3(s.x, s.y, s.z, p.x, p.y, p.z) < (s.k === 'missile' ? 14 : 11)) { s.life = 0; this.kill(s.k); }
    }
    for (const s of this.silos) {
      if (s.state === 'launch' && s.mz < PZ + 10 && s.mz + 96 > PZ - 6 && ROM.dist2(s.x, s.y, p.x, p.y) < 18) this.kill('icbm');
    }
    for (const pr of this.props) if (pr.k === 'dish' && pr.hp > 0 && ROM.dist2(pr.x, pr.y, p.x, p.y) < 16) this.kill('crash');
  };

  S.win = function () {
    this.state = 'won';
    this.endT = 0;
    this.eshots.length = 0;
    this.game.addScore(5000);
    ROM.Audio.sfx('bigboom');
    this.fx.flash = 1;
    this.game.banner('LAUNCH CONTROL DESTROYED', '#2fbf9b', 0, 3);
  };

  /* autopilot: strafing runs at rising ICBMs first, then open hatches */
  S.auto = function () {
    const p = this.p;
    const a = {};
    const rising = this.silos.find((s) => (s.state === 'rising' && s.mz > -75) || s.state === 'launch' && s.mz < 60);
    const hatch = this.hatches.filter((h) => h.hp > 0).sort((h1, h2) => h2.open - h1.open)[0];
    const tgt = rising || hatch;
    if (!tgt) return a;
    const ap = this.ap || (this.ap = { mode: 'approach', ang: 0.8 });
    if (ap.tgt !== tgt) { ap.tgt = tgt; ap.mode = 'approach'; ap.ang = Math.atan2(p.y - tgt.y, p.x - tgt.x); }
    let tx, ty;
    const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
    if (ap.mode === 'approach') {
      tx = tgt.x + Math.cos(ap.ang) * 230; ty = tgt.y + Math.sin(ap.ang) * 230;
      tx = ROM.clamp(tx, -AX + 10, AX - 10); ty = ROM.clamp(ty, -AY + 10, AY - 10);
      if (Math.hypot(tx - p.x, ty - p.y) < 30) ap.mode = 'run';
    } else {
      tx = tgt.x; ty = tgt.y;
      a.fire = rising ? d < 330 : d < 190;
      if (d < 60) { ap.mode = 'approach'; ap.ang += 2.2 + Math.random(); }
    }
    let dx = tx - p.x, dy = ty - p.y;
    // dodge shells and missiles
    for (const s of this.eshots) {
      if (s.k === 'flak') continue;
      const rx = s.x - p.x, ry = s.y - p.y;
      if (Math.hypot(rx, ry) < 70) { dx = -ry; dy = rx; break; }
    }
    const sxv = dx - dy, syv = dx + dy;
    const m = Math.max(Math.abs(sxv), Math.abs(syv)) || 1;
    if (sxv / m > 0.35) a.right = true; else if (sxv / m < -0.35) a.left = true;
    if (syv / m > 0.35) a.down = true; else if (syv / m < -0.35) a.up = true;
    return a;
  };

  /* ---------------- draw ---------------- */
  S.draw = function (ctx) {
    const proj = this.proj, p = this.p, q = this.q, B = this.biome, t = this.t;
    proj.cx = 0; proj.cy = 0; proj.oy = 300; proj.ox = ROM.W / 2;
    if (this.fx.shake > 0) { proj.ox += ROM.rand(-1, 1) * this.fx.shake; proj.oy += ROM.rand(-1, 1) * this.fx.shake; }
    // surrounding terrain
    ctx.fillStyle = B.ground[0];
    ctx.fillRect(0, 0, ROM.W, ROM.H);
    const T2 = 50;
    for (let j = -12; j < 12; j++) for (let i = -12; i < 12; i++) {
      const x = i * T2, y = j * T2;
      const inside = Math.abs(x + T2 / 2) < AX + 10 && Math.abs(y + T2 / 2) < AY + 10;
      const h = ROM.hash2(i, j, 77);
      const col = inside ? (B.snow ? (h < 0.5 ? '#c9d2da' : '#c1cbd4') : (h < 0.5 ? '#8a8f8a' : '#838883')) : B.ground[h < 0.5 ? 0 : 1];
      R.groundQuad(proj, x - 0.5, y - 0.5, T2 + 1, T2 + 1, col);
    }
    // painted lines & helipad markings
    ctx.strokeStyle = 'rgba(230,200,90,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    const a1 = proj.p(-AX, 20, 0), a2 = proj.p(AX, 20, 0);
    ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
    // fence
    const fenceCol = '#4c5359';
    const fence = [[-AX - 14, -AY - 14], [AX + 14, -AY - 14], [AX + 14, AY + 14], [-AX - 14, AY + 14]];
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = fence[k], [x1, y1] = fence[(k + 1) % 4];
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 30);
      for (let s = 0; s <= n; s++) {
        const x = ROM.lerp(x0, x1, s / n), y = ROM.lerp(y0, y1, s / n);
        q.add(proj.near(x, y, 0), () => R.cbox(proj, x, y, 0, 3, 3, 14, fenceCol));
      }
      q.add(proj.near((x0 + x1) / 2, (y0 + y1) / 2, 0) - 40, () => {
        R.line3(proj, [x0, y0, 12], [x1, y1, 12], 'rgba(60,66,72,0.8)', 1);
        R.line3(proj, [x0, y0, 7], [x1, y1, 7], 'rgba(60,66,72,0.8)', 1);
      });
    }
    // control center
    q.add(proj.near(CENTER.x, CENTER.y, 10), () => this.drawCenter());
    // silos
    for (const s of this.silos) {
      q.add(proj.near(s.x, s.y, 0) - 20, () => this.drawSiloBase(s));
      if (s.state === 'rising' || s.state === 'launch') {
        q.add(proj.near(s.x, s.y, Math.max(0, s.mz + 48)), () => this.drawIcbm(s));
      }
    }
    // guns, sams, tanks, props
    for (const a of this.guns) q.add(proj.near(a.x, a.y, 6), () => {
      R.prism(proj, a.x, a.y, 0, 14, 6, 8, a.hp > 0 ? '#a4936a' : '#2f2f2c');
      if (a.hp <= 0) return;
      R.cbox(proj, a.x, a.y, 6, 9, 9, 6, '#4f5641');
      const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
      for (const s of [-2.5, 2.5]) R.line3(proj, [a.x - sn * s, a.y + c * s, 10], [a.x - sn * s + c * 15, a.y + c * s + sn * 15, 24], '#2a2d24', 2.4);
    });
    for (const a of this.sams) q.add(proj.near(a.x, a.y, 6), () => {
      R.cbox(proj, a.x, a.y, 0, 26, 26, 5, a.hp > 0 ? '#6b6f55' : '#2f2f2c');
      if (a.hp <= 0) return;
      R.cbox(proj, a.x, a.y, 5, 10, 10, 6, '#55593f');
      for (const s of [-5, 5]) {
        const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
        R.mesh(proj, Md.missile, a.x - sn * s, a.y + c * s, 13, a.yaw, 0.7, 0, 1.4);
      }
    });
    for (const tk of this.tanks) q.add(proj.near(tk.x, tk.y, 5), () => {
      const dead = tk.hp <= 0;
      R.mesh(proj, Md.tankHull, tk.x, tk.y, 0, tk.yaw, 0, 0, 1, dead ? '#2a2a26' : null);
      R.mesh(proj, Md.tankTurret, tk.x, tk.y, 0, dead ? tk.yaw : tk.aim, 0, 0, 1, dead ? '#2a2a26' : null);
    });
    for (const pr of this.props) q.add(proj.near(pr.x, pr.y, 8), () => this.drawProp(pr));
    // player
    if (this.state !== 'dead') {
      R.shadow(proj, p.x, p.y, 15, 0.35);
      const blink = p.inv > 0 && Math.floor(t * 12) % 2 === 0;
      q.add(proj.near(p.x, p.y, p.z), () => {
        if (!blink) R.mesh(proj, Md.bomber, p.x, p.y, p.z, p.head, 0, -(p.bank || 0), 1.15);
      });
    }
    if (this.state === 'fight') {
      const reach = (p.z - 2 - CENTER.h) / -BVZ * 560;
      const gx = p.x + Math.cos(p.head) * reach, gy = p.y + Math.sin(p.head) * reach;
      const [sx, sy] = proj.p(gx, gy, CENTER.h);
      ctx.strokeStyle = 'rgba(255,214,120,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 13, sy); ctx.lineTo(sx - 5, sy); ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 13, sy); ctx.stroke();
    }
    for (const b of this.bullets) q.add(proj.near(b.x, b.y, b.z), () => {
      const l = Math.hypot(b.vx, b.vy);
      R.line3(proj, [b.x, b.y, b.z], [b.x - b.vx / l * 14, b.y - b.vy / l * 14, b.z], '#fff3b0', 2.2);
    });
    for (const s of this.eshots) q.add(proj.near(s.x, s.y, s.z), () => {
      if (s.k === 'missile') R.mesh(proj, Md.missile, s.x, s.y, s.z, Math.atan2(s.vy, s.vx), Math.atan2(s.vz, Math.hypot(s.vx, s.vy)), 0, 1.3);
      else if (s.k === 'flak') R.dot(proj, s.x, s.y, s.z, 1.6, '#202020');
      else R.orb(proj, s.x, s.y, s.z, 4, '#fff6c8', 'rgba(255,120,40,0)');
    });
    this.fx.queue(proj, q);
    q.flush();
    this.fx.drawTexts(proj);
    // vignette
    const v = ctx.createRadialGradient(ROM.W / 2, ROM.H / 2, ROM.H * 0.45, ROM.W / 2, ROM.H / 2, ROM.H);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, ROM.W, ROM.H);

    if (this.state === 'dead') this.game.banner(this.deathWhy === 'icbm' ? 'HIT BY A LAUNCHING ICBM' : 'SHOT DOWN', '#ff6b5a');
  };

  S.drawCenter = function () {
    const proj = this.proj, C = CENTER;
    const x0 = C.x - C.w / 2, y0 = C.y - C.d / 2;
    const dead = this.state === 'won' && this.endT > 1.2;
    if (dead) { R.box(proj, x0, y0, 0, C.w, C.d, 8, '#2c2b29'); return; }
    // sloped earth berm
    R.box(proj, x0 - 10, y0 - 10, 0, C.w + 20, C.d + 20, 6, '#6c7158');
    R.box(proj, x0, y0, 6, C.w, C.d, C.h - 6, '#7d848a', { top: '#8d949a' });
    // label stripe
    R.box(proj, x0 + C.w - 0.5, y0 + 10, 14, 1, C.d - 20, 6, '#c23b2e');
    // antenna
    R.cbox(proj, x0 + 14, y0 + 14, C.h, 3, 3, 40, '#55595e');
    if (Math.floor(this.t * 2) % 2) R.orb(proj, x0 + 14, y0 + 14, C.h + 42, 3, '#ff6b5a', 'rgba(255,60,40,0)');
    // hatches
    for (const h of this.hatches) {
      const z = C.h;
      if (h.hp <= 0) {
        R.groundQuad(proj, h.x - 13, h.y - 15, 26, 30, '#1b1a19', z + 0.3);
        if (Math.random() < 0.3) this.fx.puff(h.x, h.y, z + 4, 7, 1.2, '#2a2a2a');
        continue;
      }
      R.groundQuad(proj, h.x - 13, h.y - 15, 26, 30, '#121417', z + 0.2);
      if (h.open > 0.05) {
        // glowing reactor core under hatch
        R.orb(proj, h.x, h.y, z + 1, 11 * h.open, 'rgba(255,214,120,0.95)', 'rgba(255,90,40,0)');
      }
      const off = h.open * 13;
      R.box(proj, h.x - 13 - off, h.y - 15, z, 13, 30, 3, '#9aa3ab', { top: '#c8a24a' });
      R.box(proj, h.x + off, h.y - 15, z, 13, 30, 3, '#9aa3ab', { top: '#c8a24a' });
      // hp pips
      for (let i = 0; i < h.hp0; i++) R.dot(proj, h.x - 12 + i * (24 / Math.max(1, h.hp0 - 1)), h.y + 20, z + 1, 1.6, i < h.hp ? '#2fbf9b' : '#3a3f45');
    }
  };

  S.drawSiloBase = function (s) {
    const proj = this.proj;
    R.prism(proj, s.x, s.y, 0, 24, 5, 12, '#9aa0a6', { top: '#a9afb5' });
    R.prism(proj, s.x, s.y, 4.9, 16, 0.4, 12, '#0f1012', { noTop: false, top: '#0f1012' });
    if (s.state === 'dead') {
      R.prism(proj, s.x, s.y, 5, 15, 0.6, 12, '#2a1d14', { top: '#2a1d14' });
      if (Math.random() < 0.2) this.fx.puff(s.x, s.y, 8, 8, 1.6, '#2c2c2c');
      return;
    }
    const off = s.open * 16;
    R.box(proj, s.x - 16 - off, s.y - 16, 5, 16, 32, 2.5, '#6f767c', { top: '#d0a43a' });
    R.box(proj, s.x + off, s.y - 16, 5, 16, 32, 2.5, '#6f767c', { top: '#d0a43a' });
    if (s.state === 'opening' || s.state === 'rising') {
      if (Math.floor(this.t * 6) % 2) R.orb(proj, s.x + 22, s.y - 18, 8, 4, '#ff6b5a', 'rgba(255,60,40,0)');
    }
  };

  S.drawIcbm = function (s) {
    const proj = this.proj;
    // ICBM drawn as stacked solids, sliced at the silo mouth (z=5) while rising
    const z0 = Math.max(5, s.mz), bodyTop = s.mz + 70, tip = s.mz + 96;
    if (bodyTop > z0) {
      R.prism(proj, s.x, s.y, z0, 7, bodyTop - z0, 10, '#e6e8ea', { noTop: true });
      const b0 = Math.max(z0, s.mz + 50), b1 = s.mz + 57;
      if (b1 > b0) R.prism(proj, s.x, s.y, b0, 7.3, b1 - b0, 10, '#c23b2e', { noTop: true });
      R.cone(proj, s.x, s.y, bodyTop, 7, tip - bodyTop, 10, '#e6e8ea');
    } else if (tip > z0) {
      R.cone(proj, s.x, s.y, z0, 7 * (tip - z0) / 26, tip - z0, 10, '#e6e8ea');
    }
    if (s.state === 'rising') {
      // progress ring
      const k = ROM.clamp((s.mz + 100) / 100, 0, 1);
      const [sx, sy] = proj.p(s.x, s.y, 120);
      const c = R.ctx;
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 5;
      c.beginPath(); c.arc(sx, sy, 12, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = k > 0.75 ? '#ff6b5a' : '#ffb347'; c.lineWidth = 3;
      c.beginPath(); c.arc(sx, sy, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.font = '700 10px Rajdhani, sans-serif'; c.textAlign = 'center';
      c.fillText(s.hp, sx, sy + 4);
    }
  };

  S.drawProp = function (pr) {
    const proj = this.proj;
    if (pr.k === 'fuel') {
      R.prism(proj, pr.x, pr.y, 0, pr.hp > 0 ? 15 : 16, pr.hp > 0 ? 24 : 5, 10, pr.hp > 0 ? '#b9bfc5' : '#2c2c2a', { top: '#d0d5da' });
      if (pr.hp > 0) R.prism(proj, pr.x, pr.y, 13, 15.3, 3, 10, '#c23b2e', { noTop: true });
    } else if (pr.k === 'barracks') {
      R.cbox(proj, pr.x, pr.y, 0, 60, 30, 16, '#8b8a72');
      R.gable(proj, pr.x - 31, pr.y - 17, 16, 62, 34, 9, '#5a6150', '#8b8a72');
    } else if (pr.k === 'dish') {
      R.cbox(proj, pr.x, pr.y, 0, 10, 10, pr.hp > 0 ? 26 : 6, pr.hp > 0 ? '#80878e' : '#2c2c2a');
      if (pr.hp > 0) {
        const a = this.t * 1.5, c = Math.cos(a), s = Math.sin(a);
        R.face(proj, [[pr.x - s * 16, pr.y + c * 16, 22], [pr.x + s * 16, pr.y - c * 16, 22], [pr.x + s * 16 + c * 6, pr.y - c * 16 + s * 6, 38], [pr.x - s * 16 + c * 6, pr.y + c * 16 + s * 6, 38]], '#c9d0d6', true);
      }
    }
  };

  S.hud = function () {
    const alive = this.hatches.filter((h) => h.hp > 0).length;
    return {
      stage: 'STRIKE',
      progress: 1 - this.hatches.reduce((a, h) => a + Math.max(0, h.hp), 0) / this.hatches.reduce((a, h) => a + h.hp0, 0),
      objective: alive ? `CONTROL CENTER HATCHES: ${alive}` : 'TARGET DESTROYED',
    };
  };
})();
