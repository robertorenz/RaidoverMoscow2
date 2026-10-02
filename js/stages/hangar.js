/* Stage: Space-station hangar launch.
   Like the original: build up speed, lift off and thread the bomber through the
   bay doors without touching walls, ceiling or the moving blast door. */
'use strict';
(function () {
  const ROM = window.ROM;
  const R = ROM.R;
  ROM.Stages = ROM.Stages || {};

  const LEN = 1100;       // hangar length (along -y)
  const HALF_W = 90;      // half width
  const CEIL = 120;
  const DOOR_Y = -LEN;

  function Hangar(game, opts) {
    this.game = game;
    this.opts = opts || {};
    this.proj = ROM.Iso(1);
    this.fx = new ROM.FX();
    this.q = ROM.Queue();
    this.t = 0;
    this.p = { x: 0, y: -40, z: 6, vy: 0, vz: 0, vx: 0, alive: true, out: false };
    this.doorPhase = Math.random() * 6;
    this.state = 'ready'; // ready -> rolling -> out | crashed
    this.msgT = 0;
    this.deadT = 0;
    this.stars = [];
    for (let i = 0; i < 120; i++) this.stars.push([Math.random() * ROM.W, Math.random() * ROM.H, Math.random()]);
    this.lights = 0;
    this.diff = game.diff();
  }
  ROM.Stages.Hangar = Hangar;
  const H = Hangar.prototype;

  H.name = 'HANGAR LAUNCH';
  H.hint = 'Hold FIRE/UP to throttle · UP/DOWN to lift · LEFT/RIGHT to steer · clear the blast door!';

  /* blast door bottom edge height (door slides up/down) */
  H.doorGap = function () {
    const speed = 0.55 + this.diff * 0.12;
    const s = (Math.sin((this.t + this.doorPhase) * speed) + 1) / 2; // 0..1
    const bottom = 20 + s * 85;      // gap from bottom of door to ...
    return { lo: bottom - 55, hi: bottom }; // opening between door bottom edge and floor plate lip
  };

  H.update = function (dt, I) {
    this.t += dt;
    this.fx.update(dt, 0);
    const p = this.p;
    const g = this.doorGap();
    if (this.state === 'crashed') {
      this.deadT += dt;
      if (this.deadT > 2.2 && !this.reported) { this.reported = true; this.game.onDeath(); }
      return;
    }
    if (this.state === 'out') {
      p.y -= p.vy * dt;
      p.z += 30 * dt;
      this.msgT += dt;
      if (this.msgT > 1.6 && !this.reported) { this.reported = true; this.game.stageClear({ bonus: Math.round(500 + Math.max(0, 8 - this.t) * 100) }); }
      return;
    }
    // throttle
    const throttle = I.is('fire') || (I.is('up') && this.state === 'ready');
    if (throttle) { this.state = 'rolling'; }
    if (this.state === 'rolling') p.vy = Math.min(320, p.vy + (throttle ? 140 : 40) * dt);
    // lift needs speed
    const canLift = p.vy > 140;
    if (canLift) {
      if (I.is('up')) p.vz = ROM.approach(p.vz, 70, 220 * dt);
      else if (I.is('down')) p.vz = ROM.approach(p.vz, -70, 220 * dt);
      else p.vz = ROM.approach(p.vz, 0, 200 * dt);
    } else {
      p.vz = ROM.approach(p.vz, p.z > 6 ? -40 : 0, 200 * dt);
    }
    if (I.is('left')) p.vx = ROM.approach(p.vx, -70, 260 * dt);
    else if (I.is('right')) p.vx = ROM.approach(p.vx, 70, 260 * dt);
    else p.vx = ROM.approach(p.vx, 0, 200 * dt);
    p.x += p.vx * dt;
    p.y -= p.vy * dt;
    p.z = Math.max(6, p.z + p.vz * dt);
    ROM.Audio.engine(true, 1 + p.vy / 300);

    // collisions
    const wing = 20;
    let crash = false;
    if (Math.abs(p.x) + wing > HALF_W) crash = 'wall';
    if (p.z + 10 > CEIL) crash = 'ceiling';
    if (p.y < DOOR_Y + 10 && p.y > DOOR_Y - 20) {
      if (p.z + 6 > g.hi || p.z - 2 < Math.max(0, g.lo)) crash = 'door';
      if (Math.abs(p.x) + wing > 70) crash = 'door';
    }
    if (crash && !this.game.god) {
      this.state = 'crashed';
      this.fx.explode(p.x, p.y, p.z, 1.6);
      ROM.Audio.sfx('bigboom');
      ROM.Audio.engine(false);
      this.crashWhy = crash;
      return;
    }
    if (p.y < DOOR_Y - 30) {
      this.state = 'out';
      ROM.Audio.sfx('clear');
    }
    if (p.y < DOOR_Y + 300 && p.vy < 90 && this.state === 'rolling' && !I.is('fire')) { /* coasting */ }
  };

  /* autopilot for demo / attract mode */
  H.auto = function () {
    const p = this.p, g = this.doorGap();
    const a = { fire: true };
    const target = ROM.clamp((Math.max(0, g.lo) + g.hi) / 2 - 3, 10, 90);
    if (p.vy > 150) { if (p.z < target - 4) a.up = true; else if (p.z > target + 4) a.down = true; }
    if (p.x > 4) a.left = true; else if (p.x < -4) a.right = true;
    return a;
  };

  H.draw = function (ctx) {
    const proj = this.proj;
    const p = this.p;
    proj.cx = 40;
    proj.cy = Math.max(DOOR_Y - 150, p.y - 180);
    proj.s = 1.05;
    // space backdrop
    const sky = ctx.createLinearGradient(0, 0, 0, ROM.H);
    sky.addColorStop(0, '#05070d'); sky.addColorStop(1, '#0d1422');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, ROM.W, ROM.H);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(220,235,255,${0.3 + s[2] * 0.7})`;
      ctx.fillRect(s[0], s[1], s[2] > 0.8 ? 2 : 1, s[2] > 0.8 ? 2 : 1);
    }
    // Earth limb beyond the door
    const ex = 860, ey = 1000, er = 820;
    const eg = ctx.createRadialGradient(ex - 120, ey - 200, er * 0.5, ex, ey, er);
    eg.addColorStop(0, '#173f63'); eg.addColorStop(0.8, '#2a72a6'); eg.addColorStop(0.95, '#9ed4ff'); eg.addColorStop(1, 'rgba(158,212,255,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();

    const q = this.q;
    // floor
    const floorCol = '#3a424c';
    for (let y = 0; y > -LEN; y -= 50) {
      const shadeA = (Math.abs(y / 50) % 2) ? '#363d46' : floorCol;
      R.groundQuad(proj, -HALF_W, y - 50, HALF_W * 2, 50, shadeA);
    }
    // runway stripes & lights
    for (let y = -20; y > -LEN + 20; y -= 60) {
      R.groundQuad(proj, -3, y - 24, 6, 24, '#d9b44a', 0.2);
      const on = ((this.t * 6 - y / 60) | 0) % 6 === 0;
      R.dot(proj, -HALF_W + 8, y, 1, 2.2, on ? '#ffdf6e' : '#6b5a2a');
      R.dot(proj, HALF_W - 8, y, 1, 2.2, on ? '#ffdf6e' : '#6b5a2a');
    }
    // back wall (x = -HALF_W) and far side wall with ribs
    R.box(proj, -HALF_W - 14, DOOR_Y, 0, 14, LEN, CEIL, '#4b5561');
    for (let y = 0; y > DOOR_Y; y -= 110) {
      R.box(proj, -HALF_W - 2, y - 8, 0, 6, 8, CEIL, '#5c6876');
      R.box(proj, -HALF_W + 2, y - 60, 70, 2, 30, 14, '#7bd1ff', { top: '#7bd1ff' });
    }
    // door frame (two pillars + lintel), door slab
    const g = this.doorGap();
    q.add(proj.near(-HALF_W, DOOR_Y, 0), () => {
      R.box(proj, -HALF_W - 14, DOOR_Y - 18, 0, 24, 18, CEIL + 10, '#58626e');
    });
    q.add(proj.near(HALF_W, DOOR_Y, 0), () => {
      R.box(proj, 70, DOOR_Y - 18, 0, 24, 18, CEIL + 10, '#58626e');
    });
    q.add(proj.near(0, DOOR_Y - 18, CEIL), () => {
      R.box(proj, -HALF_W - 14, DOOR_Y - 18, CEIL, HALF_W * 2 + 18, 18, 14, '#606b78');
    });
    // door slab: from g.hi up to ceiling; floor lip from 0 to g.lo
    q.add(proj.near(0, DOOR_Y - 6, g.hi), () => {
      R.box(proj, -76, DOOR_Y - 12, g.hi, 148, 8, CEIL - g.hi, '#8a6d2f', { top: '#a8873d' });
      // hazard stripes on the lower edge
      for (let i = 0; i < 8; i++) R.box(proj, -76 + i * 18.5, DOOR_Y - 12.5, g.hi, 9, 1, 8, i % 2 ? '#1b1b1b' : '#e2b33c');
      if (g.lo > 0) R.box(proj, -76, DOOR_Y - 12, 0, 148, 8, g.lo, '#8a6d2f', { top: '#e2b33c' });
    });
    // player
    if (this.state !== 'crashed') {
      const h = Math.max(0.15, 0.5 - p.z / 300);
      R.shadow(proj, p.x, p.y, 16, h * 0.8);
      q.add(proj.near(p.x, p.y, p.z), () => {
        R.mesh(proj, ROM.Models.bomber, p.x, p.y, p.z + 3, -Math.PI / 2, p.vz / 300, -p.vx / 200, 1.1);
        if (p.vy > 30) R.orb(proj, p.x, p.y + 20, p.z + 4, 6 + Math.random() * 3, 'rgba(255,220,140,0.9)', 'rgba(255,120,40,0)');
      });
    }
    // near wall (cutaway, low lip only)
    q.add(proj.near(HALF_W, 0, 0) - 2000, () => {});
    this.fx.queue(proj, q);
    q.flush();
    // near cutaway lip
    R.box(proj, HALF_W, DOOR_Y, 0, 10, LEN, 10, '#4b5561');
    this.fx.drawTexts(proj);

    // door gap indicator
    const c = ctx;
    c.save();
    const gx = ROM.W - 70, gy = 120, gh = 180;
    c.fillStyle = 'rgba(10,16,26,0.75)'; c.fillRect(gx - 14, gy - 26, 60, gh + 52);
    c.strokeStyle = '#2b3a4d'; c.strokeRect(gx - 14, gy - 26, 60, gh + 52);
    c.fillStyle = '#9fb3c8'; c.font = '600 11px Rajdhani, sans-serif'; c.textAlign = 'center';
    c.fillText('BAY DOOR', gx + 16, gy - 10);
    c.fillStyle = '#2a333f'; c.fillRect(gx, gy, 32, gh);
    const sc = gh / CEIL;
    c.fillStyle = '#2fbf9b'; c.fillRect(gx, gy + gh - g.hi * sc, 32, (g.hi - Math.max(0, g.lo)) * sc);
    c.fillStyle = '#ffb347'; c.fillRect(gx - 6, gy + gh - p.z * sc - 2, 44, 4);
    c.fillStyle = '#9fb3c8'; c.fillText('SPD ' + Math.round(p.vy), gx + 16, gy + gh + 18);
    c.restore();

    if (this.state === 'ready' && Math.floor(this.t * 2) % 2 === 0) this.game.banner('PRESS FIRE TO THROTTLE UP', '#ffd27a');
    if (this.state === 'rolling' && p.vy > 140 && p.z < 8) this.game.banner('ROTATE — PULL UP', '#2fbf9b', 18);
    if (this.state === 'out') this.game.banner('LAUNCH SUCCESSFUL', '#2fbf9b');
    if (this.state === 'crashed') this.game.banner(this.crashWhy === 'door' ? 'HIT THE BLAST DOOR' : 'CRASHED IN THE HANGAR', '#ff6b5a');
  };

  H.hud = function () { return { stage: 'HANGAR', progress: ROM.clamp(-this.p.y / LEN, 0, 1) }; };
})();
