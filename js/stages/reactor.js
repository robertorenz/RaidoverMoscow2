/* Stage: the reactor room beneath the Kremlin.
   A defence robot hurls discs at you. Throw your own discs back — the robot's
   shield deflects straight shots, so bank them off the side walls. Destroy the
   robot, then the reactor core. */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;
  const Md = ROM.Models;
  ROM.Stages = ROM.Stages || {};

  const RW = 250;          // half width of room (walls at +-RW)
  const PY = 40;           // player line
  const BY = 470;          // robot line
  const CORE_Y = 610;
  const DZ = 26;           // disc flight height

  const pBody = Md.soldier('#3d5a78', '#2b3e52');
  const pLegs = Md.soldierLegs('#24364a');

  function Reactor(game, opts) {
    this.game = game;
    this.opts = opts || {};
    this.diff = game.diff();
    this.proj = ROM.Persp();
    this.fx = new ROM.FX();
    this.q = ROM.Queue();
    this.t = 0;
    this.p = { x: 0, walk: 0, fireT: 0, inv: 1.5, mv: 0 };
    const rhp = 8 + Math.round(this.diff * 3);
    this.bot = { x: 0, hp: rhp, hp0: rhp, throwT: 2, arm: 0, hitT: 0, vx: 0 };
    this.core = { hp: 6, hp0: 6, shield: 1 };
    this.discs = [];
    this.state = 'fight'; // fight -> core -> melt | dead
    this.endT = 0;
  }
  ROM.Stages.Reactor = Reactor;
  const X = Reactor.prototype;
  X.name = 'REACTOR ROOM';
  X.hint = 'Throw discs with FIRE (move while throwing to angle them) · bank shots off the walls past the robot\'s shield';

  X.respawn = function () {
    this.state = this.bot.hp > 0 ? 'fight' : 'core';
    this.p.inv = 2;
    this.p.x = 0;
    this.discs = this.discs.filter((d) => d.mine);
    this.reported = false;
  };

  X.update = function (dt, I) {
    this.t += dt;
    const p = this.p, g = this.game;
    this.fx.update(dt, 0);
    if (this.state === 'melt') {
      this.endT += dt;
      this.fx.shake = Math.max(this.fx.shake, 6);
      if (Math.random() < dt * 12) { this.fx.explode(ROM.rand(-RW, RW), ROM.rand(200, CORE_Y), ROM.rand(10, 120), ROM.rand(1, 2.5)); ROM.Audio.sfx('boom'); }
      if (Math.floor(this.endT * 2) !== Math.floor((this.endT - dt) * 2)) ROM.Audio.sfx('alarm');
      if (this.endT > 4.5 && !this.reported) { this.reported = true; g.stageClear({ bonus: 25000, final: true }); }
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
    p.mv = mv;
    p.x = ROM.clamp(p.x + mv * 190 * dt, -RW + 20, RW - 20);
    p.walk += Math.abs(mv) * dt * 10;
    p.inv = Math.max(0, p.inv - dt);
    p.fireT -= dt;
    // aim: UP straight, holding a direction angles the throw
    if (I.is('fire') && p.fireT <= 0 && this.discs.filter((d) => d.mine).length < 2) {
      p.fireT = 0.45;
      const ang = mv * 0.62 + (I.is('up') ? 0 : 0);
      const sp = 430;
      this.discs.push({ mine: true, x: p.x, y: PY + 10, vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp, bounces: 0, spin: 0 });
      ROM.Audio.sfx('throw');
    }
    this.updateWorld(dt);
  };

  X.updateWorld = function (dt) {
    const p = this.p, b = this.bot, g = this.game;
    const active = this.state === 'fight' || this.state === 'core';
    // robot movement & throws
    if (b.hp > 0) {
      const target = ROM.clamp(p.x * 0.7 + Math.sin(this.t * 0.9) * 120, -RW + 50, RW - 50);
      b.vx = ROM.approach(b.vx, ROM.clamp((target - b.x) * 2, -150, 150), 300 * dt);
      b.x += b.vx * dt;
      b.hitT = Math.max(0, b.hitT - dt);
      b.throwT -= dt * (0.8 + this.diff * 0.4);
      b.arm = Math.max(0, b.arm - dt * 3);
      if (this.state === 'fight' && b.throwT <= 0) {
        b.throwT = ROM.rand(1.1, 2.0) - (1 - b.hp / b.hp0) * 0.5;
        b.arm = 1;
        const sp = 300 + this.diff * 60 + (1 - b.hp / b.hp0) * 60;
        // aim directly or via a wall bank shot
        let tx = p.x;
        if (Math.random() < 0.45) {
          const wall = Math.random() < 0.5 ? -RW : RW;
          tx = 2 * wall - p.x; // mirror target through a wall
        }
        const dx = tx - b.x, dy = PY - (BY - 20);
        const l = Math.hypot(dx, dy);
        this.discs.push({ mine: false, x: b.x + 20, y: BY - 20, vx: dx / l * sp, vy: dy / l * sp, bounces: 0, spin: 0 });
        ROM.Audio.sfx('throw');
      }
    }
    // discs
    for (let i = this.discs.length - 1; i >= 0; i--) {
      const d = this.discs[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.spin += dt * 20;
      if (Math.abs(d.x) > RW - 10) {
        d.x = Math.sign(d.x) * (RW - 10);
        d.vx = -d.vx;
        d.bounces++;
        this.fx.spark(d.x, d.y, DZ, d.mine ? '#7fe3ff' : '#ff8a6a');
        ROM.Audio.sfx('bounce');
      }
      let remove = d.y < -60 || d.y > CORE_Y + 20 || d.bounces > 4;
      if (!remove && d.mine) {
        // robot
        if (b.hp > 0 && Math.abs(d.y - BY) < 18 && Math.abs(d.x - b.x) < 34) {
          const angled = Math.abs(d.vx) > 130 || d.bounces > 0 && Math.abs(d.vx) > 90;
          if (!angled) {
            // shield deflects it back at the player
            d.mine = false; d.vy = -Math.abs(d.vy) * 0.9; d.vx += ROM.rand(-60, 60);
            this.fx.spark(d.x, d.y - 10, DZ, '#cfe8ff');
            ROM.Audio.sfx('clank');
            g.banner('SHIELD DEFLECT — BANK IT OFF A WALL', '#ffb347', 0, 1.2);
          } else {
            remove = true;
            b.hp--; b.hitT = 0.25;
            this.fx.explode(d.x, d.y - 10, 40, 0.6);
            ROM.Audio.sfx('hit');
            g.addScore(500);
            this.fx.text(b.x, BY, 90, '+500');
            if (b.hp <= 0) this.botDown();
          }
        }
        // core
        if (!remove && this.state === 'core' && d.y > CORE_Y - 40 && Math.abs(d.x) < 46) {
          remove = true;
          this.core.hp--;
          this.fx.explode(d.x, CORE_Y - 40, 40, 0.9);
          ROM.Audio.sfx('hit');
          g.addScore(1000);
          if (this.core.hp <= 0) this.meltdown();
        }
        // vs enemy discs
        if (!remove) {
          for (let j = 0; j < this.discs.length; j++) {
            const e = this.discs[j];
            if (e.mine || e.dead) continue;
            if (Math.hypot(e.x - d.x, e.y - d.y) < 20) { e.dead = true; remove = true; this.fx.spark(d.x, d.y, DZ, '#ffffff'); ROM.Audio.sfx('clank'); g.addScore(100); break; }
          }
        }
      } else if (!remove && !d.mine && active) {
        if (Math.abs(d.y - PY) < 14 && Math.abs(d.x - p.x) < 16) { remove = true; this.kill(); }
      }
      if (remove || d.dead) this.discs.splice(i, 1);
    }
    this.discs = this.discs.filter((d) => !d.dead);
  };

  X.botDown = function () {
    this.state = 'core';
    this.fx.explode(this.bot.x, BY, 40, 2.4);
    this.fx.flash = 0.8;
    ROM.Audio.sfx('bigboom');
    this.game.addScore(10000);
    this.discs = this.discs.filter((d) => d.mine);
    this.game.banner('ROBOT DESTROYED — HIT THE REACTOR CORE', '#2fbf9b', 0, 3);
  };
  X.meltdown = function () {
    this.state = 'melt';
    this.endT = 0;
    this.fx.flash = 1;
    ROM.Audio.sfx('bigboom');
    this.game.addScore(20000);
    this.game.banner('REACTOR CRITICAL — GET OUT!', '#ff6b5a', 0, 4.5);
  };
  X.kill = function () {
    if (this.game.god || this.p.inv > 0 || (this.state !== 'fight' && this.state !== 'core')) return;
    this.state = 'dead';
    this.endT = 0;
    this.fx.explode(this.p.x, PY, 14, 0.6);
    ROM.Audio.sfx('die');
  };

  X.auto = function () {
    const p = this.p, b = this.bot;
    const a = {};
    // dodge incoming
    for (const d of this.discs) {
      if (d.mine || d.vy > 0) continue;
      const tt = (d.y - PY) / -d.vy;
      if (tt < 0.8) {
        let fx = d.x + d.vx * tt;
        if (fx > RW - 10) fx = 2 * (RW - 10) - fx; else if (fx < -RW + 10) fx = 2 * (-RW + 10) - fx;
        if (Math.abs(fx - p.x) < 30) { if (fx > p.x) a.left = true; else a.right = true; return a; }
      }
    }
    // bank shot: stand off to one side and throw toward the far wall
    const tx = this.state === 'core' ? 0 : (b.x > 0 ? -140 : 140);
    if (p.x < tx - 10) a.right = true; else if (p.x > tx + 10) a.left = true;
    else { a.fire = true; if (this.state !== 'core') { if (p.x < 0) a.left = true; else a.right = true; } }
    return a;
  };

  /* ---------------- draw ---------------- */
  X.draw = function (ctx) {
    const proj = this.proj, p = this.p, q = this.q, t = this.t, b = this.bot;
    proj.x = p.x * 0.3 + (this.fx.shake > 0 ? ROM.rand(-1, 1) * this.fx.shake : 0);
    proj.y = -250; proj.z = 200; proj.pitch = 0.3; proj.f = 720;
    proj.light = [0.2, -0.6, 0.77];
    proj.setup();
    ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, ROM.W, ROM.H);
    // floor grid
    for (let y = -100; y < CORE_Y + 60; y += 40) {
      for (let x = -RW; x < RW; x += 50) {
        const h = ROM.hash2(x / 50, y / 40, 8);
        R.groundQuad(proj, x, y, 50.5, 40.5, h < 0.5 ? '#2a333c' : '#262e36');
      }
    }
    // hazard lines
    R.groundQuad(proj, -RW, PY + 30, RW * 2, 4, '#c9a227', 0.2);
    R.groundQuad(proj, -RW, BY - 50, RW * 2, 4, '#c9a227', 0.2);
    // back wall + reactor chamber
    R.box(proj, -RW - 20, CORE_Y + 40, 0, RW * 2 + 40, 20, 240, '#38424c');
    for (let x = -RW; x <= RW; x += 70) R.box(proj, x - 6, CORE_Y + 34, 0, 12, 8, 240, '#4a5560');
    this.drawCore();
    // side walls with light strips
    for (const sx of [-1, 1]) {
      const wx = sx < 0 ? -RW - 30 : RW;
      R.box(proj, wx, -120, 0, 30, CORE_Y + 180, 160, '#323b45', { top: '#3c4752' });
      for (let y = -80; y < CORE_Y; y += 90) {
        const on = (Math.floor(t * 4) + y / 90) % 4 < 1;
        R.box(proj, sx < 0 ? -RW - 1 : RW, y, 70, 1.5, 40, 6, on ? '#2fd6c0' : '#1c5e57', { top: '#2fd6c0' });
      }
    }
    // robot
    if (b.hp > 0 || this.state === 'fight') {
      q.add(proj.near(b.x, BY, 0), () => this.drawBot());
    } else {
      q.add(proj.near(b.x, BY, 0), () => {
        R.mesh(proj, Md.robotBody, b.x, BY, 0, -Math.PI / 2, 0, 0.35, 1, '#2b2f33');
        if (Math.random() < 0.2) this.fx.puff(b.x, BY, 40, 10, 1.4, '#222');
      });
    }
    // player
    if (this.state !== 'dead') {
      const blink = p.inv > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) q.add(proj.near(p.x, PY, 0), () => {
        R.shadow(proj, p.x, PY, 9, 0.35);
        R.mesh(proj, pLegs, p.x, PY, 0, Math.PI / 2, 0, Math.sin(p.walk) * 0.35, 1.7);
        R.mesh(proj, pBody, p.x, PY, 0, Math.PI / 2, 0, 0, 1.7);
      });
    }
    for (const d of this.discs) q.add(proj.near(d.x, d.y, DZ), () => this.drawDisc(d));
    this.fx.queue(proj, q);
    q.flush();
    this.fx.drawTexts(proj);
    // red alarm wash during meltdown
    if (this.state === 'melt') {
      ctx.fillStyle = `rgba(255,40,20,${0.15 + 0.12 * Math.sin(t * 10)})`;
      ctx.fillRect(0, 0, ROM.W, ROM.H);
      if (this.endT > 3) { ctx.fillStyle = `rgba(255,255,255,${(this.endT - 3) / 1.5})`; ctx.fillRect(0, 0, ROM.W, ROM.H); }
    }
    if (this.state === 'dead') this.game.banner('SOLDIER DOWN', '#ff6b5a');
  };

  X.drawCore = function () {
    const proj = this.proj, c = this.core, t = this.t;
    const exposed = this.state === 'core' || this.state === 'melt';
    // pedestal
    R.prism(proj, 0, CORE_Y, 0, 60, 14, 12, '#4e5964', { top: '#5d6975' });
    const pulse = 0.75 + 0.25 * Math.sin(t * (exposed ? 8 : 3));
    // core column (glowing)
    R.orb(proj, 0, CORE_Y, 90, 110 * pulse, 'rgba(120,240,255,0.35)', 'rgba(120,240,255,0)');
    R.prism(proj, 0, CORE_Y, 14, 26, 150, 12, '#7fe3ff', { top: '#d8fbff' });
    for (let z = 30; z < 160; z += 26) R.prism(proj, 0, CORE_Y, z, 30, 5, 12, '#5a6672', { noTop: true });
    // shield cage until the robot is down
    if (!exposed) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        R.cbox(proj, Math.cos(a) * 46, CORE_Y + Math.sin(a) * 46, 14, 6, 6, 160, '#8a959f');
      }
      R.prism(proj, 0, CORE_Y, 170, 50, 10, 12, '#6b7680');
    } else {
      for (let i = 0; i < c.hp0; i++) {
        const [sx, sy] = proj.p(-40 + i * 16, CORE_Y - 60, 200);
        R.ctx.fillStyle = i < c.hp ? '#ff6b5a' : '#2a2f35';
        R.ctx.fillRect(sx - 5, sy - 5, 10, 10);
      }
    }
  };

  X.drawBot = function () {
    const proj = this.proj, b = this.bot;
    R.shadow(proj, b.x, BY, 34, 0.4);
    const tint = b.hitT > 0 ? '#ffffff' : null;
    // throwing arm (behind body on the right) then body, then shield arm on the left
    const lift = b.arm * 34;
    R.box(proj, b.x + 26, BY - 6, 34 + lift, 10, 12, 30, '#8a959f');
    R.box(proj, b.x + 24, BY - 8, 30 + lift + 28, 14, 16, 8, '#ff6b5a');
    R.mesh(proj, Md.robotBody, b.x, BY, 0, -Math.PI / 2, 0, 0, 1.3, tint);
    R.box(proj, b.x - 52, BY - 40, 22, 30, 6, 44, '#c9a227', { top: '#e2c35a' });
    R.box(proj, b.x - 48, BY - 41, 26, 22, 1, 36, '#8a6d1a');
    // health bar
    const [sx, sy] = proj.p(b.x, BY, 120);
    const ctx = R.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - 40, sy, 80, 7);
    ctx.fillStyle = '#ff6b5a'; ctx.fillRect(sx - 39, sy + 1, 78 * (b.hp / b.hp0), 5);
  };

  X.drawDisc = function (d) {
    const proj = this.proj;
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push(proj.p(d.x + Math.cos(a) * 11, d.y + Math.sin(a) * 11, DZ));
    }
    R.shadow(proj, d.x, d.y, 10, 0.3);
    const ctx = R.ctx;
    ctx.save();
    ctx.shadowColor = d.mine ? '#7fe3ff' : '#ff6b5a';
    ctx.shadowBlur = 14;
    R.fillPoly(pts, d.mine ? '#bff3ff' : '#ffb09c', d.mine ? '#2fd6c0' : '#ff3a2a', 2);
    ctx.restore();
    const c = proj.p(d.x, d.y, DZ);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(c[0], c[1], 2.5 * c[2] * 2, 0, Math.PI * 2); ctx.fill();
  };

  X.hud = function () {
    return {
      stage: 'REACTOR',
      progress: this.state === 'fight' ? 0.5 * (1 - this.bot.hp / this.bot.hp0) : 0.5 + 0.5 * (1 - this.core.hp / this.core.hp0),
      objective: this.state === 'fight' ? 'DEFEAT THE DEFENCE ROBOT' : this.state === 'melt' ? 'MELTDOWN' : 'DESTROY THE REACTOR CORE',
    };
  };
})();
