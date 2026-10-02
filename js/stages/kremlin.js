/* Stage: Red Square — bazooka assault on the Kremlin Defense Center.
   Move along the square, set range with UP/DOWN and lob rockets into the five
   armored bunker doors while troops and tanks counter-attack. */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;
  const Md = ROM.Models;
  ROM.Stages = ROM.Stages || {};

  const WALL_Y = 600, WALL_H = 110, WALL_D = 34;
  const DOOR_W = 44, DOOR_H = 58;
  const DOORS_X = [-400, -200, 0, 200, 400];
  const PX = 440;
  const G = 520; // gravity

  /* front face of the wall at lateral x (towers protrude) */
  function faceY(x) {
    if (Math.abs(x) < 45) return WALL_Y - 39;
    for (const tx of [-600, -300, 300, 600]) if (Math.abs(x - tx) < 32) return WALL_Y - 26;
    return WALL_Y - WALL_D / 2;
  }

  const enemyBody = Md.soldier('#5b6648', '#3f4733');
  const enemyLegs = Md.soldierLegs('#3c4430');
  const playerBody = Md.soldier('#3d5a78', '#2b3e52');
  const playerLegs = Md.soldierLegs('#24364a');

  function Kremlin(game, opts) {
    this.game = game;
    this.opts = opts || {};
    this.diff = game.diff();
    this.proj = ROM.Persp();
    this.fx = new ROM.FX();
    this.q = ROM.Queue();
    this.t = 0;
    this.p = { x: 0, aim: 380, fireT: 0, alive: true, walk: 0, inv: 1.5 };
    const dhp = 4 + Math.round(this.diff * 2);
    this.doors = DOORS_X.map((x, i) => ({ x, hp: dhp, hp0: dhp, open: 0, t: 2 + i * 1.3 + Math.random() * 2, release: 0 }));
    this.rockets = [];
    this.troops = [];
    this.tanks = [];
    this.eshots = [];
    this.tankT = 9;
    this.state = 'fight';
    this.endT = 0;
    this.lights = [0, 1, 2].map((i) => ({ x: -500 + i * 500, a: i * 2, sp: 0.4 + i * 0.13 }));
  }
  ROM.Stages.Kremlin = Kremlin;
  const K = Kremlin.prototype;
  K.name = 'RED SQUARE ASSAULT';
  K.hint = 'LEFT/RIGHT move · UP/DOWN set rocket range · FIRE bazooka at the bunker doors';

  K.respawn = function () {
    this.state = 'fight';
    this.p.alive = true;
    this.p.inv = 2;
    this.p.x = 0;
    this.eshots.length = 0;
    this.troops = this.troops.filter((tr) => tr.y > 300);
    this.reported = false;
  };

  /* rocket ballistic parameters for a target ground distance D */
  K.ballistic = function (D) {
    const Tf = 0.45 + D / 900;
    const vy = D / Tf;
    const vz = (G * Tf * Tf / 2 - 18) / Tf;
    return { vy, vz, Tf };
  };
  /* predicted impact point */
  K.predict = function () {
    const b = this.ballistic(this.p.aim);
    const fy = faceY(this.p.x + 4);
    const ty = Math.min(this.p.aim, fy);
    const t = ty / b.vy;
    const z = 18 + b.vz * t - G * t * t / 2;
    return { y: ty, z: Math.max(0, z), wall: this.p.aim >= fy };
  };

  K.update = function (dt, I) {
    this.t += dt;
    const p = this.p, g = this.game;
    this.fx.update(dt, 0);
    for (const l of this.lights) l.a += l.sp * dt;
    if (this.state === 'won') {
      this.endT += dt;
      if (Math.random() < dt * 8 && this.endT < 3) { this.fx.explode(ROM.rand(-450, 450), WALL_Y - 20, ROM.rand(10, 90), ROM.rand(1, 2)); ROM.Audio.sfx('boom'); }
      if (this.endT > 4 && !this.reported) { this.reported = true; g.stageClear({ bonus: 8000 }); }
      this.updateWorld(dt);
      return;
    }
    if (this.state === 'dead') {
      this.endT += dt;
      if (this.endT > 2 && !this.reported) { this.reported = true; g.onDeath({ ground: true }); }
      this.updateWorld(dt);
      return;
    }
    let mv = 0;
    if (I.is('left')) mv = -1;
    if (I.is('right')) mv = 1;
    p.x = ROM.clamp(p.x + mv * 170 * dt, -PX, PX);
    p.walk += Math.abs(mv) * dt * 10;
    p.mv = mv;
    if (I.is('up')) p.aim = Math.min(WALL_Y + 120, p.aim + 260 * dt);
    if (I.is('down')) p.aim = Math.max(120, p.aim - 260 * dt);
    p.inv = Math.max(0, p.inv - dt);
    p.fireT -= dt;
    if (I.is('fire') && p.fireT <= 0) {
      p.fireT = 0.85;
      const b = this.ballistic(p.aim);
      this.rockets.push({ x: p.x + 4, y: 6, z: 18, vy: b.vy, vz: b.vz, life: 4 });
      this.fx.puff(p.x - 2, -6, 18, 7, 0.5, '#c8c8c8');
      ROM.Audio.sfx('missile');
    }
    this.updateWorld(dt);
  };

  K.updateWorld = function (dt) {
    const p = this.p, g = this.game;
    const active = this.state === 'fight';
    const rate = 0.75 + this.diff * 0.35;
    // doors cycle & release troops
    for (const d of this.doors) {
      if (d.hp <= 0) { if (Math.random() < dt * 4) this.fx.puff(d.x + ROM.rand(-15, 15), faceY(d.x) - 2, ROM.rand(20, 50), 10, 1.6, '#2b2b2b'); continue; }
      d.t -= dt;
      if (d.t <= 0 && d.open === 0 && active) { d.opening = true; d.release = 1 + (Math.random() < 0.3 + this.diff * 0.3 ? 1 : 0); ROM.Audio.sfx('door'); }
      if (d.opening) {
        d.open = Math.min(1, d.open + dt * 1.5);
        const alive = this.troops.reduce((n, tr) => n + (tr.hp > 0 ? 1 : 0), 0);
        if (alive >= 4 + Math.round(this.diff * 3)) d.release = 0;
        if (d.open >= 1 && d.release > 0) {
          d.relT = (d.relT || 0) - dt;
          if (d.relT <= 0) {
            d.relT = 0.5;
            d.release--;
            this.troops.push({ x: d.x + ROM.rand(-10, 10), y: faceY(d.x) - 6, hp: 1, stopY: ROM.rand(220, 460), state: 'run', fireT: ROM.rand(0.6, 1.4), walk: 0, zig: Math.random() * 6 });
          }
        }
        if (d.open >= 1 && d.release <= 0) { d.opening = false; d.closing = true; }
      }
      if (d.closing) {
        d.open = Math.max(0, d.open - dt * 1.2);
        if (d.open <= 0) { d.closing = false; d.t = ROM.rand(4, 8) - this.diff * 1.5; }
      }
    }
    // tanks
    this.tankT -= dt;
    if (this.tankT <= 0 && active && this.tanks.length < 1 + (this.diff > 0.6 ? 1 : 0)) {
      this.tankT = ROM.rand(12, 18) - this.diff * 3;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.tanks.push({ x: -dir * 700, y: ROM.rand(380, 470), dir, hp: 2, fireT: 2, aim: 0 });
      ROM.Audio.sfx('door');
    }
    for (const tk of this.tanks) {
      if (tk.hp <= 0) { if (Math.random() < dt * 4) this.fx.puff(tk.x, tk.y, 14, 9, 1.5, '#2b2b2b'); continue; }
      tk.x += tk.dir * 40 * dt;
      tk.aim = Math.atan2(0 - tk.y, p.x - tk.x);
      tk.fireT -= dt * rate;
      if (active && tk.fireT <= 0 && Math.abs(tk.x) < 600) {
        tk.fireT = ROM.rand(2.5, 3.5);
        const d = Math.hypot(p.x - tk.x, tk.y) || 1;
        this.eshots.push({ k: 'shell', x: tk.x + Math.cos(tk.aim) * 26, y: tk.y + Math.sin(tk.aim) * 26, z: 10, vx: (p.x - tk.x) / d * 260, vy: -tk.y / d * 260, vz: 0, life: 3 });
        this.fx.puff(tk.x + Math.cos(tk.aim) * 28, tk.y + Math.sin(tk.aim) * 28, 10, 6, 0.6, '#bbbbbb');
        ROM.Audio.sfx('flak');
      }
      if (Math.abs(tk.x) > 760) tk.gone = true;
    }
    this.tanks = this.tanks.filter((tk) => !tk.gone);
    // troops
    for (const tr of this.troops) {
      if (tr.hp <= 0) { tr.dead = (tr.dead || 0) + dt; continue; }
      if (tr.state === 'run') {
        tr.y -= 70 * dt;
        tr.zig += dt * 2;
        tr.x += Math.sin(tr.zig) * 40 * dt + (p.x - tr.x) * 0.1 * dt;
        tr.walk += dt * 10;
        if (tr.y < tr.stopY) tr.state = 'shoot';
      } else {
        tr.fireT -= dt * rate;
        if (active && tr.fireT <= 0) {
          tr.fireT = ROM.rand(1.6, 2.6);
          const lead = (p.mv || 0) * 170 * (tr.y / 300) * 0.4;
          const d = Math.hypot(p.x + lead - tr.x, tr.y) || 1;
          this.eshots.push({ k: 'bullet', x: tr.x, y: tr.y - 4, z: 15, vx: (p.x + lead - tr.x) / d * 300, vy: -tr.y / d * 300, vz: 0, life: 2.5 });
          ROM.Audio.sfx('enemyShot');
        }
        if (Math.random() < dt * 0.25) tr.state = 'run', tr.stopY = Math.max(150, tr.y - ROM.rand(60, 120));
      }
    }
    this.troops = this.troops.filter((tr) => !(tr.dead > 4));
    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vz -= G * dt;
      r.y += r.vy * dt; r.z += r.vz * dt; r.life -= dt;
      if (Math.random() < 0.9) this.fx.trail(r.x, r.y - 6, r.z, 2.5);
      let boom = false;
      if (r.y >= faceY(r.x)) {
        boom = true;
        r.y = faceY(r.x) - 2;
        this.wallHit(r.x, r.z);
      } else if (r.z <= 0) {
        boom = true;
        r.z = 0;
      }
      // direct hits on tanks
      for (const tk of this.tanks) if (tk.hp > 0 && Math.abs(tk.x - r.x) < 26 && Math.abs(tk.y - r.y) < 18 && r.z < 22) boom = true;
      if (boom) {
        this.rockets.splice(i, 1);
        this.fx.explode(r.x, r.y, r.z, 1.1, { debris: '#6d5d50' });
        ROM.Audio.sfx('boom');
        for (const tr of this.troops) if (tr.hp > 0 && ROM.dist2(tr.x, tr.y, r.x, r.y) < 42 && r.z < 40) { tr.hp = 0; g.addScore(100); this.fx.text(tr.x, tr.y, 30, '+100'); }
        for (const tk of this.tanks) {
          if (tk.hp > 0 && ROM.dist2(tk.x, tk.y, r.x, r.y) < 40 && r.z < 30) {
            tk.hp--;
            if (tk.hp <= 0) { g.addScore(500); this.fx.text(tk.x, tk.y, 40, '+500'); this.fx.explode(tk.x, tk.y, 10, 1.4); }
          }
        }
      }
    }
    // enemy shots
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.k === 'shell' && s.y < 10 && active) {
        this.fx.explode(s.x, s.y, 4, 0.8);
        ROM.Audio.sfx('boom');
        if (Math.abs(s.x - p.x) < 34) this.kill();
        this.eshots.splice(i, 1);
        continue;
      }
      if (active && s.k === 'bullet' && Math.abs(s.y) < 8 && Math.abs(s.x - p.x) < 9) { this.kill(); this.eshots.splice(i, 1); continue; }
      if (s.life <= 0 || s.y < -60) this.eshots.splice(i, 1);
    }
  };

  K.wallHit = function (x, z) {
    const g = this.game;
    for (const d of this.doors) {
      if (d.hp <= 0) continue;
      if (Math.abs(x - d.x) < DOOR_W / 2 + 6 && z < DOOR_H + 6) {
        d.hp -= d.open > 0.5 ? 2 : 1;
        ROM.Audio.sfx('hit');
        if (d.hp <= 0) {
          d.hp = 0;
          g.addScore(1500);
          this.fx.text(d.x, WALL_Y - 30, 90, 'DOOR DESTROYED +1500', '#2fbf9b');
          this.fx.explode(d.x, faceY(d.x) - 4, 30, 2);
          ROM.Audio.sfx('bigboom');
          if (this.doors.every((q) => q.hp <= 0)) this.win();
        } else {
          g.addScore(200);
        }
        return;
      }
    }
    ROM.Audio.sfx('clank');
  };

  K.kill = function () {
    if (this.game.god || this.p.inv > 0 || this.state !== 'fight') return;
    this.state = 'dead';
    this.endT = 0;
    this.p.alive = false;
    this.fx.explode(this.p.x, 0, 12, 0.6);
    ROM.Audio.sfx('die');
  };

  K.win = function () {
    this.state = 'won';
    this.endT = 0;
    this.eshots.length = 0;
    this.troops.forEach((tr) => (tr.hp = 0));
    this.game.addScore(5000);
    this.game.banner('DEFENSE CENTER BREACHED', '#2fbf9b', 0, 3.5);
    ROM.Audio.sfx('clear');
  };

  K.auto = function () {
    const p = this.p;
    const a = {};
    const d = this.doors.find((q) => q.hp > 0) || this.doors[2];
    const tx = ROM.clamp(d.x - 4, -PX, PX);
    if (p.x < tx - 6) a.right = true; else if (p.x > tx + 6) a.left = true;
    const want = WALL_Y - 4;
    if (p.aim < want - 10) a.up = true; else if (p.aim > want + 10) a.down = true;
    // dodge bullets
    for (const s of this.eshots) if (s.y < 70 && s.y > 0 && Math.abs(s.x - p.x) < 16) { a.left = s.x > p.x; a.right = !a.left; }
    a.fire = Math.abs(p.aim - want) < 20;
    return a;
  };

  /* ---------------- draw ---------------- */
  K.draw = function (ctx) {
    const proj = this.proj, p = this.p, q = this.q, t = this.t;
    proj.x = p.x * 0.45 + (this.fx.shake > 0 ? ROM.rand(-1, 1) * this.fx.shake : 0);
    proj.y = -340; proj.z = 175; proj.pitch = 0.2; proj.f = 740; proj.oy = 300;
    proj.setup();
    // night sky
    const sky = ctx.createLinearGradient(0, 0, 0, ROM.H * 0.6);
    sky.addColorStop(0, '#060b16'); sky.addColorStop(0.7, '#14233a'); sky.addColorStop(1, '#2a3a52');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, ROM.W, ROM.H);
    for (let i = 0; i < 90; i++) {
      const x = ROM.hash2(i, 3, 5) * ROM.W, y = ROM.hash2(i, 4, 5) * ROM.H * 0.45;
      ctx.fillStyle = `rgba(230,240,255,${0.25 + ROM.hash2(i, 5, 5) * 0.6 * (0.7 + 0.3 * Math.sin(t * 2 + i))})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    // searchlights
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      const [sx, sy] = proj.p(l.x, WALL_Y + 200, 60);
      const ang = -Math.PI / 2 + Math.sin(l.a) * 0.7;
      const len = 700;
      const gr = ctx.createLinearGradient(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      gr.addColorStop(0, 'rgba(255,245,210,0.22)'); gr.addColorStop(1, 'rgba(255,245,210,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang - 0.06) * len, sy + Math.sin(ang - 0.06) * len);
      ctx.lineTo(sx + Math.cos(ang + 0.06) * len, sy + Math.sin(ang + 0.06) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // background: palace & cathedrals behind the wall
    this.drawBehind();
    // square cobbles
    const T2 = 50;
    for (let y = WALL_Y; y > -150; y -= T2) {
      for (let x = -900; x < 900; x += T2) {
        const h = ROM.hash2(x / T2, y / T2, 3);
        const col = h < 0.5 ? '#5a4f4a' : '#544a45';
        R.groundQuad(proj, x, y - T2, T2 + 0.5, T2 + 0.5, col);
      }
    }
    // pale lamplight pools
    for (const lx of [-640, -330, 0, 330, 640]) R.orb(proj, lx, 360, 0, 120, 'rgba(255,214,150,0.12)', 'rgba(255,214,150,0)');
    this.drawWall(q);
    // St Basil's on the right flank
    q.add(proj.near(760, 420, 0), () => this.drawStBasil(760, 420));
    // lamp posts
    for (const lx of [-640, 640]) q.add(proj.near(lx, 360, 0), () => {
      R.cbox(proj, lx, 360, 0, 4, 4, 70, '#2b2f33');
      R.orb(proj, lx, 360, 72, 10, 'rgba(255,230,170,1)', 'rgba(255,200,120,0)');
    });
    // tanks
    for (const tk of this.tanks) q.add(proj.near(tk.x, tk.y, 0), () => {
      const dead = tk.hp <= 0;
      R.shadow(proj, tk.x, tk.y, 22, 0.3);
      R.mesh(proj, Md.tankHull, tk.x, tk.y, 0, tk.dir > 0 ? 0 : Math.PI, 0, 0, 1.5, dead ? '#2a2a26' : null);
      R.mesh(proj, Md.tankTurret, tk.x, tk.y, 0, dead ? 0.4 : tk.aim, 0, 0, 1.5, dead ? '#2a2a26' : null);
    });
    // troops
    for (const tr of this.troops) q.add(proj.near(tr.x, tr.y, 0), () => this.drawSoldier(tr.x, tr.y, tr.hp > 0 ? (tr.state === 'run' ? tr.walk : 0) : -1, -Math.PI / 2, enemyBody, enemyLegs, tr.state === 'shoot', tr.dead));
    // player
    if (this.state !== 'dead' || this.endT < 0.1) {
      const blink = p.inv > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) q.add(proj.near(p.x, 0, 0), () => {
        this.drawSoldier(p.x, 0, p.walk, Math.PI / 2, playerBody, playerLegs, true);
        // bazooka tube on shoulder
        R.box(proj, p.x + 3, -14, 16, 4, 26, 4, '#3c4a3a');
      });
    }
    // rockets
    for (const r of this.rockets) q.add(proj.near(r.x, r.y, r.z), () => {
      R.mesh(proj, Md.missile, r.x, r.y, r.z, Math.PI / 2, Math.atan2(r.vz, r.vy), 0, 1.2);
      R.orb(proj, r.x, r.y - 8, r.z, 4, 'rgba(255,220,140,0.9)', 'rgba(255,100,40,0)');
    });
    for (const s of this.eshots) q.add(proj.near(s.x, s.y, s.z), () => R.orb(proj, s.x, s.y, s.z, s.k === 'shell' ? 5 : 3, '#fff6c8', 'rgba(255,90,50,0)'));
    this.fx.queue(proj, q);
    q.flush();
    this.fx.drawTexts(proj);
    // aim reticle
    if (this.state === 'fight') {
      const pr = this.predict();
      const [sx, sy] = proj.p(p.x + 4, pr.y, pr.z);
      ctx.strokeStyle = pr.wall ? '#ffb347' : '#2fbf9b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 16, sy); ctx.lineTo(sx - 5, sy); ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 16, sy);
      ctx.moveTo(sx, sy - 16); ctx.lineTo(sx, sy - 5); ctx.moveTo(sx, sy + 5); ctx.lineTo(sx, sy + 16); ctx.stroke();
      // dotted arc preview
      const b = this.ballistic(p.aim);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 1; k < 14; k++) {
        const tt = (k / 14) * (pr.y / b.vy);
        const [ax, ay] = proj.p(p.x + 4, b.vy * tt, 18 + b.vz * tt - G * tt * tt / 2);
        ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }
    }
    // snow
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 80; i++) {
      const x = (ROM.hash2(i, 1, 4) * ROM.W + t * 20 + Math.sin(t + i) * 10) % ROM.W;
      const y = (ROM.hash2(i, 2, 4) * ROM.H + t * (40 + (i % 6) * 10)) % ROM.H;
      ctx.fillRect(x, y, 2, 2);
    }
    if (this.state === 'dead') this.game.banner('SOLDIER DOWN', '#ff6b5a');
  };

  K.drawSoldier = function (x, y, walk, yaw, body, legs, aiming, deadT) {
    const proj = this.proj;
    if (walk < 0) {
      // fallen
      R.mesh(proj, body, x, y, 2, yaw, -Math.PI / 2, 0, 1.6, '#3a3f30');
      return;
    }
    R.shadow(proj, x, y, 8, 0.35);
    const sw = Math.sin(walk) * 0.35;
    R.mesh(proj, legs, x, y, 0, yaw, 0, sw, 1.6);
    R.mesh(proj, body, x, y, 0, yaw, 0, 0, 1.6);
    if (aiming && body === enemyBody) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      R.line3(proj, [x, y, 22], [x + c * 16, y + s * 16, 23], '#1d1f1a', 2.2);
    }
    void deadT;
  };

  K.drawBehind = function () {
    const proj = this.proj;
    // Grand Kremlin Palace
    R.box(proj, -620, WALL_Y + 90, 0, 520, 90, 135, '#cbb27a', { top: '#5f7a62' });
    for (let x = -600; x < -110; x += 30) R.box(proj, x, WALL_Y + 89, 112, 14, 1, 14, '#f3d58e');
    // cathedrals with golden domes
    for (const [cx, cy, s] of [[120, WALL_Y + 160, 1], [300, WALL_Y + 140, 0.85], [-60, WALL_Y + 260, 0.8]]) {
      R.cbox(proj, cx, cy, 0, 110 * s, 90 * s, 120 * s, '#e8e1d0');
      this.onion(cx, cy, 120 * s, 32 * s, '#d9a62a', '#7a5410');
      for (const [ox, oy] of [[-36, -26], [36, -26], [-36, 26], [36, 26]]) this.onion(cx + ox * s, cy + oy * s, 120 * s, 16 * s, '#d9a62a', '#7a5410');
    }
    // Ivan the Great bell tower
    R.prism(proj, 210, WALL_Y + 300, 0, 26, 260, 8, '#ece6d6');
    R.prism(proj, 210, WALL_Y + 300, 260, 20, 40, 8, '#ece6d6');
    this.onion(210, WALL_Y + 300, 300, 22, '#e3b23c', '#7a5410');
  };

  /* onion dome with spire (screen-space shape anchored in 3D) */
  K.onion = function (x, y, z, r, c1, c2) {
    const proj = this.proj;
    const [sx, sy, k] = proj.p(x, y, z);
    const w = r * k, h = r * 1.7 * k;
    const ctx = R.ctx;
    const g = ctx.createLinearGradient(sx - w, sy, sx + w, sy);
    g.addColorStop(0, c2); g.addColorStop(0.35, c1); g.addColorStop(0.55, ROM.shade(c1, 1.3)); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.75, sy);
    ctx.bezierCurveTo(sx - w * 1.25, sy - h * 0.45, sx - w * 0.3, sy - h * 0.6, sx, sy - h);
    ctx.bezierCurveTo(sx + w * 0.3, sy - h * 0.6, sx + w * 1.25, sy - h * 0.45, sx + w * 0.75, sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e8c45a'; ctx.lineWidth = Math.max(1, k * 2);
    ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy - h - r * 0.8 * k); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - r * 0.25 * k, sy - h - r * 0.55 * k); ctx.lineTo(sx + r * 0.25 * k, sy - h - r * 0.55 * k); ctx.stroke();
  };

  K.drawWall = function (q) {
    const proj = this.proj;
    const brick = '#9b3a2c', y0 = WALL_Y - WALL_D / 2;
    // wall segments between doors/towers, drawn as one long piece then features on top
    q.add(proj.near(0, WALL_Y + 40, 0) - 1, () => {
      R.box(proj, -900, y0, 0, 1800, WALL_D, WALL_H, brick, { top: '#7d2f24' });
      // brick courses
      const ctx = R.ctx;
      ctx.strokeStyle = 'rgba(40,10,6,0.25)'; ctx.lineWidth = 1;
      for (let z = 12; z < WALL_H; z += 12) {
        const a = proj.p(-900, y0, z), b = proj.p(900, y0, z);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      // swallowtail merlons
      for (let x = -890; x < 890; x += 26) {
        R.box(proj, x, y0 + 4, WALL_H, 14, WALL_D - 8, 14, brick, { top: '#7d2f24' });
        R.face(proj, [[x, y0 + 4, WALL_H + 14], [x + 7, y0 + 4, WALL_H + 9], [x + 14, y0 + 4, WALL_H + 14]], '#5a1f17', true);
      }
      // towers, then the bunker doors set into their faces
      for (const tx of [-600, -300, 300, 600]) this.drawTower(tx, 64, 140, false);
      this.drawTower(0, 90, 170, true);
      for (const d of this.doors) this.drawDoor(d);
    });
  };

  K.drawDoor = function (d) {
    const proj = this.proj, y = faceY(d.x) - 0.5;
    const x0 = d.x - DOOR_W / 2;
    // frame
    R.face(proj, [[x0 - 6, y, 0], [x0 + DOOR_W + 6, y, 0], [x0 + DOOR_W + 6, y, DOOR_H + 8], [x0 - 6, y, DOOR_H + 8]], '#5d6166');
    if (d.hp <= 0) {
      R.face(proj, [[x0, y - 0.3, 0], [x0 + DOOR_W, y - 0.3, 0], [x0 + DOOR_W, y - 0.3, DOOR_H], [x0, y - 0.3, DOOR_H]], '#120c0a');
      R.orb(proj, d.x, y - 2, 20, 26 + Math.sin(this.t * 9 + d.x) * 4, 'rgba(255,170,60,0.85)', 'rgba(255,80,20,0)');
      return;
    }
    // dark opening
    R.face(proj, [[x0, y - 0.3, 0], [x0 + DOOR_W, y - 0.3, 0], [x0 + DOOR_W, y - 0.3, DOOR_H], [x0, y - 0.3, DOOR_H]], '#1a1512');
    if (d.open > 0) R.orb(proj, d.x, y - 1, 20, 18 * d.open, 'rgba(255,200,120,0.5)', 'rgba(255,200,120,0)');
    // shutter
    const sz = d.open * (DOOR_H - 6);
    R.box(proj, x0, y - 4, sz, DOOR_W, 3, DOOR_H - sz, '#6c7379');
    for (let z = sz + 6; z < DOOR_H; z += 8) R.box(proj, x0, y - 4.5, z, DOOR_W, 1, 1.5, '#4a5056');
    // damage cracks & hp pips
    const dmg = 1 - d.hp / d.hp0;
    if (dmg > 0) R.orb(proj, d.x, y - 5, DOOR_H * 0.6, 14 * dmg + 4, 'rgba(30,20,15,0.8)', 'rgba(30,20,15,0)');
    for (let i = 0; i < d.hp0; i++) R.dot(proj, x0 + 6 + i * ((DOOR_W - 12) / Math.max(1, d.hp0 - 1)), y - 5, DOOR_H + 14, 2.2, i < d.hp ? '#2fbf9b' : '#2a2f35');
  };

  K.drawTower = function (x, w, h, clock) {
    const proj = this.proj;
    const y = WALL_Y - w / 2 + 6;
    R.box(proj, x - w / 2, y, 0, w, w, h, '#a3402f', { top: '#7d2f24' });
    R.box(proj, x - w / 2 - 3, y - 3, h * 0.55, w + 6, w + 6, 6, '#e6dccb');
    R.box(proj, x - w / 2 + 6, y + 6, h, w - 12, w - 12, h * 0.18, '#a3402f');
    // white trim + tent roof
    R.box(proj, x - w / 2 + 4, y + 4, h + h * 0.18, w - 8, w - 8, 4, '#e6dccb');
    R.cone(proj, x, y + w / 2, h + h * 0.18 + 4, (w - 8) * 0.72, h * 0.5, 4, '#3f6b4a', { rot: Math.PI / 4 });
    // red star
    const [sx, sy, k] = proj.p(x, y + w / 2, h * 1.68 + 18);
    this.star(sx, sy, 12 * k * (clock ? 1.4 : 1));
    if (clock) {
      const [cx, cy, ck] = proj.p(x, y - 1, h * 0.7);
      const ctx = R.ctx;
      ctx.fillStyle = '#1d2733'; ctx.beginPath(); ctx.arc(cx, cy, 20 * ck, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e3b23c'; ctx.lineWidth = 2 * ck; ctx.stroke();
      const a = this.t * 0.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 14 * ck, cy + Math.sin(a) * 14 * ck);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a * 12) * 18 * ck, cy + Math.sin(a * 12) * 18 * ck); ctx.stroke();
    }
  };

  K.star = function (sx, sy, r) {
    const ctx = R.ctx;
    ctx.save();
    ctx.shadowColor = '#ff3a2a'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#e8342a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  K.drawStBasil = function (x, y) {
    const proj = this.proj;
    R.cbox(proj, x, y, 0, 150, 110, 70, '#b34a36', { top: '#7d2f24' });
    R.prism(proj, x, y, 70, 22, 90, 8, '#c9b48a');
    R.cone(proj, x, y, 160, 22, 60, 8, '#3f6b4a');
    const domes = [[-50, -30, '#2f8f6a', '#145c40'], [50, -30, '#d9a62a', '#7a5410'], [-50, 30, '#2b7fb3', '#164e72'], [50, 30, '#c23b2e', '#6e1a12'], [0, -50, '#e0c060', '#7a5410']];
    for (const [ox, oy, c1, c2] of domes) {
      R.prism(proj, x + ox, y + oy, 70, 13, 40, 8, '#d8c7a0');
      this.onion(x + ox, y + oy, 110, 20, c1, c2);
    }
  };

  K.hud = function () {
    const alive = this.doors.filter((d) => d.hp > 0).length;
    return {
      stage: 'KREMLIN',
      progress: 1 - this.doors.reduce((a, d) => a + d.hp, 0) / this.doors.reduce((a, d) => a + d.hp0, 0),
      objective: alive ? `BUNKER DOORS REMAINING: ${alive}` : 'BREACHED',
      range: Math.round(this.p.aim),
    };
  };
})();
