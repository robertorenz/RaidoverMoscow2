/* Raid Over Moscow II — "1984 mode": a recreation of the original C64 levels.
   Renders at 320x200 with a C64-style palette, pixel sprites and an 8x8 font,
   then scales up inside a C64 border. Flow follows the original game:
   command map + launch countdown -> hangar -> flight -> launch site, repeated
   for each Soviet city, then Moscow: flight -> Kremlin -> reactor room. */
'use strict';
(function () {
  const ROM = window.ROM;
  const A = ROM.Audio;
  const W = 320, H = 200, PH = 184;
  const FONT = '8px "Press Start 2P", monospace';

  /* C64-inspired 16 colour palette (blues pushed away from violet) */
  const PAL = {
    k: '#000000', w: '#ffffff', r: '#a0443a', c: '#70c8cc', g: '#4fa84f', b: '#2b3fb0', y: '#d8dc7a', o: '#b06a30',
    n: '#6d5412', R: '#e07b70', d: '#555555', m: '#888888', G: '#9ae29b', B: '#6c8cff', l: '#bbbbbb',
  };
  const col = (k) => PAL[k] || k;

  let c = null; // active 2D context (320x200 buffer)
  const rect = (x, y, w, h, k) => { c.fillStyle = col(k); c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const text = (s, x, y, k, align) => {
    c.font = FONT; c.textAlign = align || 'left'; c.textBaseline = 'top';
    c.fillStyle = col(k); c.fillText(s, Math.round(x), Math.round(y));
  };
  const circle = (x, y, r, k) => {
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); rect(x - w, y + dy, w * 2 + 1, 1, k); }
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const blink = (t, hz) => Math.floor(t * (hz || 2)) % 2 === 0;

  /* ---------- hi-res vector sprites (drawn at BS x the logical resolution) ---------- */
  const BS = 3;
  const sprCache = new Map();
  function vsprite(key, w, h, fn) {
    let s = sprCache.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = w * BS; s.height = h * BS;
    const g = s.getContext('2d');
    g.scale(BS, BS);
    g.lineJoin = 'round';
    fn(g);
    sprCache.set(key, s);
    return s;
  }
  function blit(s, x, y, flip, sc) {
    sc = sc || 1;
    const w = s.width / BS * sc, h = s.height / BS * sc;
    // scaled sprites stay centred on their logical (unscaled) box
    x -= (w - s.width / BS) / 2; y -= (h - s.height / BS) / 2;
    if (flip) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(s, 0, 0, w, h); c.restore(); }
    else c.drawImage(s, x, y, w, h);
  }
  const poly = (g, pts, fill, stroke, lw) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    if (fill) { g.fillStyle = col(fill); g.fill(); }
    if (stroke) { g.strokeStyle = col(stroke); g.lineWidth = lw || 0.35; g.stroke(); }
  };
  const ell = (g, x, y, rx, ry, fill) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = col(fill); g.fill(); };

  /* player strike bomber, facing right (16x7) */
  function planeSpr(hull, wing, glass) {
    return vsprite('plane' + hull + wing + glass, 16, 7, (g) => {
      poly(g, [[6, 2.6], [9.2, 2.6], [7.4, 0.4], [6.2, 0.4]], wing, 'k');
      poly(g, [[0.2, 2.9], [2.6, 2.9], [1.4, 0.2], [0.2, 0.2]], wing, 'k');
      poly(g, [[0, 3.2], [3, 2.5], [12, 2.3], [15.8, 3.5], [12, 4.6], [2, 4.7], [0, 4.2]], hull, 'k');
      poly(g, [[0.4, 3.9], [15, 3.7], [12, 4.5], [2, 4.6]], 'd');
      poly(g, [[4.6, 3.8], [9.6, 3.8], [6.8, 6.8], [4.4, 6.8]], wing, 'k');
      ell(g, 11, 2.75, 2.1, 0.85, glass);
      ell(g, 11.5, 2.5, 0.9, 0.3, 'w');
      g.fillStyle = col('R'); g.fillRect(3.2, 3.15, 6, 0.45);
    });
  }
  /* MiG interceptor, facing right (16x6) */
  const migSpr = () => vsprite('mig', 16, 6, (g) => {
    poly(g, [[0.4, 2.8], [3, 2.8], [1.8, 0], [0.6, 0]], 'r', 'k');
    poly(g, [[0, 3], [3, 2.4], [11, 2.3], [15.8, 3.3], [11, 4.4], [1.5, 4.5]], 'm', 'k');
    poly(g, [[5, 3.6], [9.5, 3.6], [6, 5.9], [4.2, 5.9]], 'd', 'k');
    ell(g, 10.2, 2.6, 1.8, 0.75, 'c');
    ell(g, 0.4, 3.6, 0.6, 0.7, 'o');
    g.fillStyle = col('r'); g.beginPath(); g.arc(6, 3.4, 0.6, 0, Math.PI * 2); g.fill();
  });
  /* attack helicopter, facing right (16x8), two rotor frames */
  const heliSpr = (f) => vsprite('heli' + f, 16, 8, (g) => {
    g.fillStyle = col('k');
    if (f) g.fillRect(0.5, 0.4, 14, 0.6); else g.fillRect(4, 0.4, 7, 0.6);
    g.fillRect(7.2, 0.8, 0.8, 1.6);
    poly(g, [[0, 3.6], [6, 3.4], [6, 4.4], [0.6, 4.4]], 'g', 'k');
    poly(g, [[0, 2], [1.2, 2], [1.2, 4], [0, 4]], 'G');
    ell(g, 10, 4.2, 5, 2.2, 'g');
    poly(g, [[11, 2.4], [14.4, 3.4], [15.2, 4.6], [12, 4.6]], 'c', 'k');
    g.strokeStyle = col('k'); g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(7, 6.3); g.lineTo(8, 7.4); g.moveTo(12, 6.3); g.lineTo(11.5, 7.4); g.moveTo(6.5, 7.5); g.lineTo(14.5, 7.5); g.stroke();
    g.fillStyle = col('d'); g.fillRect(8, 5.4, 4, 1);
  });
  /* tank, facing right (16x8) */
  const tankSpr = (dead) => vsprite('tank' + dead, 16, 8, (g) => {
    const body = dead ? 'd' : 'g', dark = dead ? 'k' : 'n';
    poly(g, [[0.5, 4.6], [15.5, 4.6], [14.5, 7.6], [1.5, 7.6]], 'd', 'k');
    for (let i = 0; i < 6; i++) ell(g, 2.4 + i * 2.25, 6.2, 0.9, 0.9, 'k');
    poly(g, [[1, 3], [15, 3], [15.6, 4.8], [0.4, 4.8]], body, 'k');
    poly(g, [[4.5, 1], [9.5, 1], [10.5, 3], [4, 3]], body, 'k');
    poly(g, [[10, 1.7], [16, 1.7], [16, 2.3], [10, 2.3]], dark);
    if (!dead) { g.fillStyle = col('G'); g.globalAlpha = 0.5; g.fillRect(5, 1.3, 3, 0.4); g.globalAlpha = 1; }
  });
  /* infantry (8x12), two walk frames */
  const soldierSpr = (f, body, helmet) => vsprite('sold' + f + body + helmet, 8, 12, (g) => {
    g.lineCap = 'round';
    g.strokeStyle = col(body); g.lineWidth = 1.5;
    g.beginPath();
    if (f) { g.moveTo(3.4, 7.5); g.lineTo(2.6, 11); g.moveTo(4.4, 7.5); g.lineTo(5.6, 11); }
    else { g.moveTo(3.6, 7.5); g.lineTo(3.2, 11); g.moveTo(4.2, 7.5); g.lineTo(4.6, 11); }
    g.stroke();
    g.fillStyle = col('k'); g.fillRect(f ? 1.8 : 2.4, 11, 1.8, 1); g.fillRect(f ? 4.8 : 4, 11, 1.8, 1);
    poly(g, [[2.2, 3.6], [5.8, 3.6], [5.6, 8], [2.4, 8]], body, 'k');
    g.fillStyle = col('k'); g.fillRect(2.3, 6.6, 3.4, 0.6);
    ell(g, 4, 2.3, 1.3, 1.3, 'R');
    poly(g, [[2.4, 2.1], [2.8, 0.6], [5.2, 0.6], [5.7, 2.1]], helmet, 'k');
    g.strokeStyle = col(body); g.lineWidth = 1; g.beginPath(); g.moveTo(5.4, 4.4); g.lineTo(6.6, 6.4); g.stroke();
  });
  /* reactor defence robot (16x16) */
  const robotSpr = (hit) => vsprite('robot' + hit, 16, 16, (g) => {
    const m = hit ? 'w' : 'm', l = hit ? 'w' : 'l';
    poly(g, [[2, 12.5], [7, 12.5], [7, 15.5], [2, 15.5]], 'd', 'k');
    poly(g, [[9, 12.5], [14, 12.5], [14, 15.5], [9, 15.5]], 'd', 'k');
    poly(g, [[3, 5], [13, 5], [12.4, 12.6], [3.6, 12.6]], l, 'k');
    poly(g, [[0.6, 5.4], [3, 5.4], [3, 10.6], [0.6, 10.6]], m, 'k');
    poly(g, [[13, 5.4], [15.4, 5.4], [15.4, 10.6], [13, 10.6]], m, 'k');
    poly(g, [[5, 0.4], [11, 0.4], [11, 4.2], [5, 4.2]], m, 'k');
    g.fillStyle = col('R'); g.fillRect(5.8, 1.6, 4.4, 1.2);
    g.fillStyle = col('y'); g.fillRect(4.5, 7, 7, 1); g.fillRect(4.5, 9, 7, 1);
    ell(g, 8, 11, 1.2, 0.8, 'c');
  });
  const drawSoldier = (x, y, f, body, helmet) => blit(soldierSpr(f, body, helmet), x, y);

  /* ---------- explosions ---------- */
  function Booms() { this.l = []; }
  Booms.prototype.add = function (x, y, s) {
    s = s || 1;
    const d = [];
    for (let i = 0; i < 6 * s; i++) d.push({ x: 0, y: 0, vx: rnd(-50, 50) * s, vy: rnd(-70, -10) * s });
    this.l.push({ x, y, s, t: 0, d });
  };
  Booms.prototype.update = function (dt, scroll) {
    for (const b of this.l) {
      b.t += dt; b.x -= (scroll || 0) * dt;
      for (const p of b.d) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; }
    }
    this.l = this.l.filter((b) => b.t < 0.9);
  };
  Booms.prototype.draw = function () {
    for (const b of this.l) {
      if (b.t < 0.55) {
        const r = Math.round(Math.min(1, b.t / 0.2) * 6 * b.s * (b.t > 0.4 ? 0.6 : 1));
        circle(b.x, b.y, r, b.t < 0.12 ? 'w' : b.t < 0.28 ? 'y' : b.t < 0.42 ? 'o' : 'r');
      }
      for (const p of b.d) rect(b.x + p.x, b.y + p.y, 1, 1, b.t < 0.4 ? 'y' : 'd');
    }
  };

  const TARGETS = [
    { name: 'LENINGRAD', x: 96, y: 50, biome: 'coast' },
    { name: 'MINSK', x: 70, y: 90, biome: 'forest' },
    { name: 'KIEV', x: 92, y: 122, biome: 'farm' },
    { name: 'SARATOV', x: 214, y: 110, biome: 'steppe' },
    { name: 'MOSCOW', x: 138, y: 80, biome: 'winter', final: true },
  ];
  const US = ['SEATTLE', 'HOUSTON', 'LOS ANGELES', 'CHICAGO', 'WASHINGTON', 'NEW YORK'];
  const BIOME = {
    coast: { ground: 'g', stripe: 'G', far: 'm', tree: 'g', water: true },
    forest: { ground: 'g', stripe: 'n', far: 'd', tree: 'g' },
    farm: { ground: 'G', stripe: 'y', far: 'm', tree: 'g' },
    steppe: { ground: 'y', stripe: 'o', far: 'o', tree: 'n' },
    winter: { ground: 'w', stripe: 'l', far: 'l', tree: 'g', snow: true },
  };

  /* =====================================================================
     Controller
     ===================================================================== */
  function Classic(game, opts) {
    opts = opts || {};
    this.game = game;
    this.cv = document.createElement('canvas');
    this.cv.width = W * BS; this.cv.height = H * BS;
    this.cx = this.cv.getContext('2d');
    this.t = 0;
    this.skill = ROM.store.get('classicSkill', 1);
    this.hi = ROM.store.get('hiClassic', 10000);
    this.scr = 'title';
    this.alert = null;
    this.stars = [];
    for (let i = 0; i < 60; i++) this.stars.push([Math.random() * W, Math.random() * PH, Math.random() < 0.3 ? 'w' : 'l']);
    try { if (document.fonts) document.fonts.load(FONT); } catch (e) { /* ignore */ }
    if (opts.level === 'map') { this.newGame(); this.target = opts.mission || 0; this.scr = 'map'; this.mapT = 1; }
    else if (opts.level && opts.level !== 'title') {
      this.newGame();
      this.target = opts.mission || 0;
      this.after = opts.level === 'hangar' ? 'flight' : null;
      this.startLevel(opts.level);
    } else A.music('title');
  }
  ROM.Classic = Classic;
  const K = Classic.prototype;
  K.classic = true;
  K.name = 'RAID OVER MOSCOW — 1984';
  K.hint = '';

  K.newGame = function () {
    this.score = 0;
    this.planes = [6, 5, 4][this.skill];
    this.cities = US.slice();
    this.target = 0;
    this.resumeX = 0;
    this.silo = null;
    this.launchT = this.launchTime();
  };
  K.launchTime = function () { return 170 - this.skill * 25 - this.target * 8; };
  K.tgt = function () { return TARGETS[this.target]; };
  K.addScore = function (n) {
    this.score += n;
    if (this.score > this.hi) { this.hi = this.score; ROM.store.set('hiClassic', this.hi); }
  };

  K.startLevel = function (name) {
    this.levelName = name;
    this.lv = new LEVELS[name](this);
    this.scr = 'level';
    A.stopMusic();
  };
  K.show = function (lines, dur, then, colr) {
    this.scr = 'msg';
    this.msg = { lines, t: dur, then, col: colr || 'w' };
    A.engine(false);
  };
  K.levelDone = function (bonus) {
    if (bonus) this.addScore(bonus);
    A.engine(false);
    A.sfx('clear');
    const n = this.levelName, T = this.tgt();
    if (n === 'hangar') {
      const next = this.after || 'flight';
      this.after = null;
      this.show(['LAUNCH SUCCESSFUL', '', 'PROCEED TO ' + T.name], 2, () => this.startLevel(next), 'G');
    } else if (n === 'flight') {
      this.resumeX = 0;
      this.show([T.name + ' IN SIGHT', '', T.final ? 'ATTACK THE KREMLIN' : 'DESTROY THE LAUNCH SITE'], 2.2, () => this.startLevel(T.final ? 'kremlin' : 'silo'), 'y');
    } else if (n === 'silo') {
      this.silo = null;
      this.target++;
      this.launchT = this.launchTime();
      this.show([T.name + ' LAUNCH SITE', 'DESTROYED', '', 'BONUS ' + (bonus || 0)], 2.8, () => { this.scr = 'map'; this.mapT = 0; }, 'G');
    } else if (n === 'kremlin') {
      this.show(['DEFENSE CENTER BREACHED', '', 'ENTER THE REACTOR ROOM'], 2.5, () => this.startLevel('reactor'), 'G');
    } else if (n === 'reactor') {
      const b = this.cities.length * 5000 + this.planes * 2000;
      this.addScore(b);
      this.winBonus = b;
      this.scr = 'win'; this.endT = 0;
      A.music('victory');
    }
  };
  K.die = function (ground) {
    this.planes--;
    A.engine(false);
    A.sfx('die');
    if (this.planes <= 0) { this.gameOver(); return; }
    if (ground) {
      this.show(['SOLDIER DOWN', '', this.planes + ' LEFT'], 2, () => { this.scr = 'level'; this.lv.respawn(); }, 'R');
      return;
    }
    if (this.levelName !== 'hangar') this.after = this.levelName;
    if (this.levelName === 'silo') this.silo = this.lv.persist();
    this.show(['PLANE LOST', '', this.planes + ' PLANES REMAINING'], 2.2, () => this.startLevel('hangar'), 'R');
  };
  K.cityLost = function (from) {
    const city = this.cities.pop();
    A.sfx('alarm');
    this.alert = { text: 'ICBM FROM ' + (from || this.tgt().name), text2: (city || 'A U.S. CITY') + ' DESTROYED', t: 3.5 };
    if (!this.cities.length) setTimeout(() => this.gameOver('ALL U.S. CITIES DESTROYED'), 1200);
  };
  K.gameOver = function (why) {
    if (this.scr === 'over') return;
    this.scr = 'over'; this.endT = 0; this.overWhy = why || 'YOUR SQUADRON IS LOST';
    A.engine(false);
  };

  K.onPause = function () {
    if (this.scr === 'title' || this.scr === 'over' || this.scr === 'win') { this.game.toModeSelect(); return true; }
    return false;
  };

  K.auto = function () { return this.lv && this.lv.auto ? this.lv.auto() : {}; };

  K.update = function (dt, I) {
    this.t += dt;
    if (this.alert) { this.alert.t -= dt; if (this.alert.t <= 0) this.alert = null; }
    switch (this.scr) {
      case 'title':
        if (this.t < 0.4) break; // ignore the key press that opened this mode
        if (I.hit('left')) { this.skill = Math.max(0, this.skill - 1); A.sfx('select'); ROM.store.set('classicSkill', this.skill); }
        if (I.hit('right')) { this.skill = Math.min(2, this.skill + 1); A.sfx('select'); ROM.store.set('classicSkill', this.skill); }
        if (I.hit('fire') || I.hit('start')) { A.sfx('select'); this.newGame(); this.scr = 'map'; this.mapT = 0; A.stopMusic(); }
        break;
      case 'map':
        this.mapT += dt;
        if (this.mapT > 0.6 && (I.hit('fire') || I.hit('start'))) { A.sfx('select'); this.after = 'flight'; this.startLevel('hangar'); }
        break;
      case 'msg':
        this.msg.t -= dt;
        if (this.msg.t <= 0) { const f = this.msg.then; this.msg = null; f(); }
        break;
      case 'level': {
        const air = this.levelName === 'hangar' || this.levelName === 'flight';
        if (air && !this.tgt().final && this.game.state !== 'shot') {
          this.launchT -= dt;
          if (this.launchT <= 0) { this.launchT = 75; this.cityLost(); }
        }
        this.lv.update(dt, I);
        break;
      }
      case 'over':
      case 'win':
        this.endT += dt;
        if (this.endT > 1.5 && (I.hit('fire') || I.hit('start'))) { this.scr = 'title'; A.music('title'); }
        break;
      default: break;
    }
  };

  /* ---------- drawing ---------- */
  K.draw = function (ctx) {
    c = this.cx;
    c.setTransform(BS, 0, 0, BS, 0, 0);
    c.imageSmoothingEnabled = true;
    let border = '#000000';
    switch (this.scr) {
      case 'title': this.drawTitle(); border = PAL.B; break;
      case 'map': this.drawMap(); border = PAL.B; break;
      case 'msg':
        if (this.lv) { this.lv.draw(); this.drawHud(); }
        else rect(0, 0, W, H, 'k');
        this.drawMsg();
        break;
      case 'level': this.lv.draw(); this.drawHud(); break;
      case 'over': this.drawOver(); border = PAL.r; break;
      case 'win': this.drawWin(); border = blink(this.t, 4) ? PAL.y : PAL.B; break;
      default: break;
    }
    if (this.alert && this.scr !== 'title') {
      rect(0, 70, W, 34, 'k');
      rect(0, 70, W, 1, 'R'); rect(0, 103, W, 1, 'R');
      text(this.alert.text, W / 2, 76, blink(this.t, 4) ? 'R' : 'w', 'center');
      text(this.alert.text2, W / 2, 90, 'y', 'center');
    }
    // blit with C64 border
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.fillStyle = border;
    ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / (W + 32), ch / (H + 20));
    const dw = W * s, dh = H * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cv, Math.round((cw - dw) / 2), Math.round((ch - dh) / 2), Math.round(dw), Math.round(dh));
    ctx.restore();
  };

  K.drawHud = function () {
    rect(0, PH, W, H - PH, 'k');
    rect(0, PH, W, 1, 'b');
    text('SC' + String(this.score).padStart(6, '0'), 2, PH + 5, 'w');
    // planes / soldiers
    const ground = this.levelName === 'kremlin' || this.levelName === 'reactor';
    for (let i = 0; i < Math.min(this.planes, 6); i++) {
      if (ground) drawSoldier(74 + i * 7, PH + 3, 0, 'B', 'b');
      else { rect(76 + i * 9, PH + 8, 7, 2, 'l'); rect(78 + i * 9, PH + 6, 2, 6, 'l'); }
    }
    text('USA', 132, PH + 5, 'B');
    for (let i = 0; i < 6; i++) rect(158 + i * 5, PH + 5, 3, 7, i < this.cities.length ? 'B' : 'r');
    if (this.levelName === 'hangar' || this.levelName === 'flight') {
      if (this.tgt().final) text('MOSCOW', W - 2, PH + 5, 'R', 'right');
      else {
        const s = Math.max(0, Math.ceil(this.launchT));
        const str = 'T-' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        text(str, W - 2, PH + 5, s < 30 && blink(this.t, 3) ? 'R' : 'y', 'right');
      }
    } else text(this.tgt().name.slice(0, 7), W - 2, PH + 5, 'y', 'right');
  };

  K.drawMsg = function () {
    const m = this.msg;
    const h = m.lines.length * 12 + 16;
    const y = Math.round(80 - h / 2);
    rect(24, y, W - 48, h, 'k');
    rect(24, y, W - 48, 1, m.col); rect(24, y + h - 1, W - 48, 1, m.col);
    m.lines.forEach((l, i) => text(l, W / 2, y + 8 + i * 12, i === 0 ? m.col : 'w', 'center'));
  };

  K.drawKremlinSkyline = function (y0, k1, k2) {
    // crude pixel Kremlin silhouette for title/win screens
    rect(0, y0 + 30, W, 40, k1);
    for (let x = 0; x < W; x += 8) rect(x, y0 + 26, 5, 4, k1);
    const towers = [[30, 18, 36], [100, 18, 30], [160, 26, 54], [220, 18, 30], [290, 18, 36]];
    for (const [x, w, h] of towers) {
      rect(x - w / 2, y0 + 30 - h, w, h, k1);
      for (let i = 0; i < 16; i++) rect(x - (w / 2) * (1 - i / 16), y0 + 30 - h - i, w * (1 - i / 16), 1, k2);
      rect(x - 1, y0 + 30 - h - 22, 3, 5, 'R');
    }
    rect(155, y0 - 6, 10, 10, 'w'); rect(159, y0 - 4, 1, 4, 'k'); rect(159, y0, 4, 1, 'k');
  };

  K.drawTitle = function () {
    rect(0, 0, W, H, 'b');
    for (const [x, y, k] of this.stars) if (y < 110) rect(x, y, 1, 1, blink(this.t + x, 0.5) ? k : 'b');
    this.drawKremlinSkyline(128, 'r', 'g');
    rect(0, 158, W, 42, 'k');
    c.save();
    c.font = '16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = PAL.k; c.fillText('RAID OVER', W / 2 + 2, 20); c.fillText('MOSCOW', W / 2 + 2, 42);
    c.fillStyle = PAL.R; c.fillText('RAID OVER', W / 2, 18);
    c.fillStyle = PAL.y; c.fillText('MOSCOW', W / 2, 40);
    c.restore();
    text('1984 MODE', W / 2, 64, 'w', 'center');
    text('A TRIBUTE TO ACCESS SOFTWARE', W / 2, 78, 'c', 'center');
    const sk = ['CADET', 'PILOT', 'ACE'][this.skill];
    text('SKILL  < ' + sk + ' >', W / 2, 164, 'w', 'center');
    text('HIGH SCORE ' + String(this.hi).padStart(6, '0'), W / 2, 176, 'c', 'center');
    if (blink(this.t, 1.5)) text('PRESS FIRE TO BEGIN', W / 2, 188, 'y', 'center');
  };

  K.drawMap = function () {
    rect(0, 0, W, H, 'k');
    text('STRATEGIC COMMAND', W / 2, 4, 'c', 'center');
    // sea and land masses (crude western USSR)
    rect(8, 16, 304, 140, 'b');
    c.fillStyle = PAL.g;
    c.beginPath();
    const land = [[8, 70], [30, 60], [60, 66], [80, 56], [88, 42], [70, 30], [90, 18], [140, 22], [180, 16], [240, 22], [312, 18], [312, 156], [250, 156], [252, 128], [234, 120], [226, 140], [176, 150], [150, 132], [110, 136], [90, 150], [8, 150]];
    land.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fill();
    // border lines
    // station
    rect(12, 20, 12, 4, 'l'); rect(16, 16, 4, 12, 'l'); text('STN', 28, 18, 'l');
    TARGETS.forEach((T, i) => {
      const done = i < this.target, cur = i === this.target;
      const k = done ? 'd' : cur ? (blink(this.t, 3) ? 'R' : 'y') : 'w';
      rect(T.x - 2, T.y - 2, 5, 5, k);
      if (done) { rect(T.x - 3, T.y, 7, 1, 'R'); rect(T.x, T.y - 3, 1, 7, 'R'); }
      text(T.name.slice(0, 9), T.x + 5, T.y - 3, done ? 'd' : 'w');
    });
    // flight path
    const T = this.tgt();
    const n = 24;
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(this.mapT * 8)) % 3) continue;
      rect(18 + (T.x - 18) * (i / n), 22 + (T.y - 22) * (i / n), 2, 2, 'y');
    }
    rect(0, 158, W, 42, 'k');
    text('MISSION ' + (this.target + 1) + ': ' + T.name, 4, 160, 'y');
    if (T.final) text('DESTROY THE DEFENSE CENTER', 4, 172, 'w');
    else {
      const s = Math.ceil(this.launchT);
      text('ICBM LAUNCH IN ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), 4, 172, 'R');
    }
    text('USA ' + this.cities.length, W - 4, 160, 'B', 'right');
    if (blink(this.t, 1.5) && this.mapT > 0.6) text('FIRE TO LAUNCH', W - 4, 188, 'w', 'right');
  };

  K.drawOver = function () {
    rect(0, 0, W, H, 'k');
    for (const [x, y, k] of this.stars) rect(x, y, 1, 1, k);
    c.save();
    c.font = '16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = PAL.R; c.fillText('GAME OVER', W / 2, 56);
    c.restore();
    text(this.overWhy, W / 2, 88, 'w', 'center');
    text('SCORE ' + String(this.score).padStart(6, '0'), W / 2, 112, 'y', 'center');
    text('HIGH  ' + String(this.hi).padStart(6, '0'), W / 2, 126, 'c', 'center');
    if (this.endT > 1.5 && blink(this.t, 1.5)) text('PRESS FIRE', W / 2, 160, 'w', 'center');
  };

  K.drawWin = function () {
    rect(0, 0, W, H, 'k');
    for (const [x, y, k] of this.stars) if (y < 120) rect(x, y, 1, 1, k);
    // fireworks over the Kremlin
    for (let i = 0; i < 5; i++) {
      const ph = (this.t * 0.7 + i * 0.37) % 1;
      const fx = 40 + ((i * 71) % 240), fy = 30 + ((i * 37) % 50);
      const k = ['y', 'R', 'G', 'c', 'w'][i];
      for (let a = 0; a < 12; a++) {
        const an = a / 12 * Math.PI * 2;
        rect(fx + Math.cos(an) * ph * 24, fy + Math.sin(an) * ph * 24 + ph * ph * 10, 1, 1, ph < 0.8 ? k : 'd');
      }
    }
    this.drawKremlinSkyline(128, 'r', 'g');
    rect(0, 136, W, 64, 'k');
    text('MISSION ACCOMPLISHED', W / 2, 140, blink(this.t, 4) ? 'y' : 'w', 'center');
    text('U.S. CITIES SAVED ' + this.cities.length, W / 2, 154, 'B', 'center');
    text('BONUS ' + this.winBonus + '  SCORE ' + this.score, W / 2, 166, 'w', 'center');
    if (this.endT > 1.5 && blink(this.t, 1.5)) text('PRESS FIRE', W / 2, 184, 'c', 'center');
  };

  /* =====================================================================
     LEVEL 1 — Hangar launch (side view)
     ===================================================================== */
  const FLOOR = 150, CEIL = 26, DOOR_X = 286, SILL = 138;
  function Hangar(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.x = 22; this.y = FLOOR - 6; this.vx = 0; this.state = 'ready';
    this.ph = Math.random() * 6;
  }
  Hangar.prototype.doorBot = function () {
    const sp = 0.9 + this.k.skill * 0.25;
    const open = (Math.sin(this.t * sp + this.ph) + 1) / 2;
    return SILL - open * 104;
  };
  Hangar.prototype.update = function (dt, I) {
    this.t += dt;
    this.booms.update(dt);
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 1.6 && !this.rep) { this.rep = true; this.k.die(); } return; }
    if (this.state === 'out') { this.x += this.vx * dt; this.outT += dt; if (this.outT > 0.6 && !this.rep) { this.rep = true; this.k.levelDone(250); } return; }
    if (I.is('fire') || I.is('right')) { this.state = 'roll'; this.vx = Math.min(115, this.vx + 60 * dt); }
    else if (I.is('left')) this.vx = Math.max(0, this.vx - 80 * dt);
    else this.vx = Math.max(0, this.vx - 8 * dt);
    if (this.vx > 65) {
      if (I.is('up')) this.y -= 42 * dt;
      if (I.is('down')) this.y += 42 * dt;
    } else if (this.y < FLOOR - 6) this.y += 30 * dt;
    this.y = Math.min(FLOOR - 6, this.y);
    this.x += this.vx * dt;
    A.engine(this.vx > 0, 0.8 + this.vx / 150);
    let hit = this.y < CEIL;
    if (this.x + 15 > DOOR_X && this.x < DOOR_X + 16) {
      if (this.y < this.doorBot() || this.y + 6 > SILL) hit = true;
    }
    if (hit && !this.k.game.god) {
      this.state = 'dead'; this.deadT = 0;
      this.booms.add(this.x + 8, this.y + 3, 2);
      A.sfx('bigboom'); A.engine(false);
      return;
    }
    if (this.x > DOOR_X + 18) { this.state = 'out'; this.outT = 0; }
  };
  Hangar.prototype.auto = function () {
    const a = { fire: true };
    const target = (Math.max(CEIL, this.doorBot()) + SILL) / 2 - 3;
    if (this.vx > 70) { if (this.y > target + 2) a.up = true; else if (this.y < target - 2) a.down = true; }
    return a;
  };
  Hangar.prototype.draw = function () {
    // space outside
    rect(0, 0, W, PH, 'k');
    for (const [x, y] of this.k.stars) if (x > DOOR_X + 10) rect(x, y, 1, 1, 'w');
    circle(360, 250, 120, 'b'); circle(360, 250, 112, 'B');
    // hangar interior
    rect(0, CEIL, DOOR_X, FLOOR - CEIL, 'd');
    for (let x = 10; x < DOOR_X; x += 40) { rect(x, CEIL, 4, FLOOR - CEIL, 'm'); rect(x + 14, 60, 12, 4, blink(this.t + x, 1) ? 'c' : 'B'); }
    rect(0, 0, DOOR_X + 18, CEIL, 'm');
    for (let x = 0; x < DOOR_X + 18; x += 12) { rect(x, CEIL - 6, 12, 1, 'd'); rect(x, CEIL - 6, 1, 6, 'd'); }
    rect(0, FLOOR, DOOR_X + 18, PH - FLOOR, 'l');
    rect(0, FLOOR, DOOR_X + 18, 2, 'w');
    for (let x = 6; x < DOOR_X; x += 24) rect(x, FLOOR + 6, 12, 2, 'y');
    // door: frame, panel and sill
    const db = this.doorBot();
    rect(DOOR_X, CEIL, 16, Math.max(0, db - CEIL), 'o');
    for (let y = CEIL + 4; y < db - 2; y += 8) rect(DOOR_X, y, 16, 1, 'n');
    for (let x = 0; x < 16; x += 4) rect(DOOR_X + x, db - 3, 2, 3, x % 8 ? 'k' : 'y');
    rect(DOOR_X, SILL, 16, FLOOR - SILL, 'o');
    rect(DOOR_X, SILL, 16, 2, 'y');
    rect(DOOR_X + 16, 0, 2, PH, 'm');
    // planes parked in the back (the squadron)
    c.globalAlpha = 0.55;
    for (let i = 0; i < Math.min(4, this.k.planes - 1); i++) { rect(36 + i * 50, 52, 26, 2, 'm'); blit(planeSpr('m', 'd', 'b'), 40 + i * 50, 44, false, 1.4); }
    c.globalAlpha = 1;
    // player
    if (this.state !== 'dead') {
      blit(planeSpr('l', 'm', 'B'), this.x, this.y, false, 1.4);
      if (this.vx > 10) rect(this.x - 3 - Math.random() * 3, this.y + 3, 3, 1, blink(this.t, 12) ? 'y' : 'o');
    }
    this.booms.draw();
    // speed gauge
    rect(4, 4, 62, 14, 'k');
    text('SPD', 6, 7, 'w');
    rect(32, 8, 30, 6, 'd'); rect(32, 8, Math.min(30, this.vx / 115 * 30), 6, this.vx > 65 ? 'G' : 'y');
    if (this.state === 'ready' && blink(this.t, 2)) text('FIRE: THROTTLE', W / 2 - 10, 40, 'y', 'center');
    if (this.state === 'roll' && this.vx > 65 && this.y >= FLOOR - 7) text('PULL UP!', W / 2 - 10, 40, 'G', 'center');
  };

  /* =====================================================================
     LEVEL 2 — Flight to the target (horizontal scroller, oblique ground)
     ===================================================================== */
  const HORIZON = 64, ROW = 162, RADAR = 70;
  function Flight(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    const T = k.tgt();
    this.B = BIOME[T.biome];
    this.L = 4600 + k.target * 500;
    this.speed = 62 + k.target * 3;
    this.wx = k.resumeX || 0;
    this.px = 60; this.a = 40; this.fireT = 0; this.bombT = 0; this.alert = 0; this.jetT = 0;
    this.bul = []; this.bombs = []; this.shots = []; this.air = [];
    this.state = 'fly'; this.inv = this.wx > 0 ? 1.5 : 0;
    this.gen();
  }
  Flight.prototype.gen = function () {
    const r = ROM.RNG(4242 + this.k.target * 97);
    const objs = (this.objs = []);
    const decor = (this.decor = []);
    const L = this.L, lv = this.k.target, sk = this.k.skill;
    for (let x = 0; x < L + 600; x += r.range(14, 40)) decor.push({ x, d: r(), k: r() < 0.7 ? 'tree' : 'house', water: this.B.water && r() < 0.25 });
    let x = 340;
    const pool = ['trees', 'trees', 'village', 'tanks', 'tanks', 'sam', 'flak', 'radar', 'balloons', 'heli', 'jets', 'blocks'];
    while (x < L - 300) {
      const seg = r.pick(pool);
      switch (seg) {
        case 'trees': for (let i = 0, n = r.int(2, 5); i < n; i++) objs.push({ k: 'tree', x: x + i * 11, w: 8, h: 14, hp: 3 }); x += 60; break;
        case 'village': for (let i = 0, n = r.int(2, 4); i < n; i++) objs.push({ k: 'house', x: x + i * 26, w: 16, h: 12, hp: 2, sc: 50 }); x += 100; break;
        case 'blocks': for (let i = 0, n = r.int(1, 3); i < n; i++) objs.push({ k: 'block', x: x + i * 30, w: 14, h: r.int(26, 40), hp: 4, sc: 200 }); x += 90; break;
        case 'tanks': for (let i = 0, n = r.int(1, 2 + (lv > 1 ? 1 : 0)); i < n; i++) objs.push({ k: 'tank', x: x + i * 34, w: 16, h: 8, hp: 2, sc: 300, ft: r.range(0.5, 2) }); x += 90; break;
        case 'sam': objs.push({ k: 'sam', x, w: 12, h: 8, hp: 2, sc: 400, ft: 1 }); objs.push({ k: 'tree', x: x + 24, w: 8, h: 14, hp: 3 }); x += 70; break;
        case 'flak': objs.push({ k: 'flak', x, w: 10, h: 8, hp: 2, sc: 350, ft: r.range(0.5, 2) }); x += 60; break;
        case 'radar': objs.push({ k: 'radar', x, w: 12, h: 18, hp: 3, sc: 500 }); x += 60; break;
        case 'balloons': for (let i = 0, n = r.int(1, 3); i < n; i++) objs.push({ k: 'balloon', x: x + i * 40, w: 8, h: 0, ba: r.int(60, 105), hp: 1, sc: 100 }); x += 120; break;
        case 'heli': this.air.push({ at: x, k: 'heli', n: r.int(1, 2) }); x += 40; break;
        case 'jets': this.air.push({ at: x, k: 'jet', n: r.int(1, 2 + (sk > 1 ? 1 : 0)) }); x += 40; break;
        default: break;
      }
      x += r.range(30, 110) - lv * 4;
    }
    // target city skyline
    for (let cx = L - 200; cx < L + 400; cx += r.range(18, 34)) objs.push({ k: 'block', x: cx, w: 14, h: r.int(14, 34), hp: 4, sc: 200, city: true });
    const start = this.wx;
    this.objs = objs.filter((o) => o.x > start + 300 || o.k === 'tree');
    this.air = this.air.filter((a) => a.at > start + 300);
  };
  Flight.prototype.sx = function (o) { return o.x - this.wx; };
  Flight.prototype.kill = function () {
    if (this.k.game.god || this.inv > 0 || this.state !== 'fly') return;
    this.state = 'dead'; this.deadT = 0;
    this.booms.add(this.px + 8, ROW - this.a - 3, 2);
    A.sfx('bigboom'); A.engine(false);
  };
  Flight.prototype.hitObj = function (o, n) {
    if (o.hp <= 0) return;
    o.hp -= n;
    if (o.hp <= 0) {
      if (o.sc) this.k.addScore(o.sc);
      const sx = this.sx(o);
      this.booms.add(sx + o.w / 2, o.k === 'balloon' ? ROW - o.ba : ROW - o.h / 2, o.k === 'block' ? 1.6 : 1);
      A.sfx('boom');
    } else A.sfx('clank');
  };
  Flight.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    const scroll = this.state === 'dead' ? this.speed * 0.4 : this.speed;
    this.wx += scroll * dt;
    this.booms.update(dt, scroll);
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 1.8 && !this.rep) { this.rep = true; k.resumeX = this.wx > this.L / 2 ? this.L / 2 : 0; k.die(); } this.world(dt, scroll); return; }
    if (this.state === 'end') { this.endT += dt; this.px += 80 * dt; if (this.endT > 1.2 && !this.rep) { this.rep = true; k.levelDone(1000); } return; }
    this.inv = Math.max(0, this.inv - dt);
    if (I.is('up')) this.a = Math.min(122, this.a + 62 * dt);
    if (I.is('down')) this.a = Math.max(5, this.a - 62 * dt);
    if (I.is('left')) this.px = Math.max(16, this.px - 70 * dt);
    if (I.is('right')) this.px = Math.min(190, this.px + 70 * dt);
    A.engine(true, 1 + this.a / 200);
    this.fireT -= dt; this.bombT -= dt;
    if (I.is('fire') && this.fireT <= 0) { this.fireT = 0.14; this.bul.push({ x: this.px + 16, a: this.a + 1 }); A.sfx('shot'); }
    if (I.is('bomb') && this.bombT <= 0) { this.bombT = 0.6; this.bombs.push({ x: this.px + 6, a: this.a - 2, va: 0 }); A.sfx('bomb'); }
    // radar
    const radar = this.objs.some((o) => o.k === 'radar' && o.hp > 0 && this.sx(o) > -20 && this.sx(o) < 340);
    if (this.a > RADAR) this.alert = Math.min(3, this.alert + dt * (radar ? 1.6 : 0.6));
    else this.alert = Math.max(0, this.alert - dt);
    this.jetT -= dt;
    if (this.alert >= 2 && this.jetT <= 0) { this.jetT = 3.2 - k.skill * 0.6; this.spawn('jet', 2); A.sfx('alarm'); }
    for (const a of this.air) if (!a.done && this.wx + W > a.at) { a.done = true; this.spawn(a.k, a.n); }
    this.world(dt, scroll);
    this.collide();
    if (this.wx > this.L) { this.state = 'end'; this.endT = 0; }
  };
  Flight.prototype.spawn = function (kind, n) {
    for (let i = 0; i < n; i++) {
      if (kind === 'heli') this.airUnits().push({ k: 'heli', x: W + 10 + i * 30, a: rnd(40, 100), hp: 2, ft: rnd(1, 2), bob: Math.random() * 6 });
      else this.airUnits().push({ k: 'jet', x: W + 10 + i * 24, a: Math.max(15, Math.min(115, this.a + rnd(-25, 25))), hp: 1, ft: rnd(0.2, 0.6), shots: 2 });
    }
  };
  Flight.prototype.airUnits = function () { return this.units || (this.units = []); };
  Flight.prototype.fireAt = function (x, a, sp) {
    const tx = this.px + 8, ta = this.a;
    const d = Math.hypot(tx - x, ta - a) || 1;
    this.shots.push({ x, a, vx: (tx - x) / d * sp, va: (ta - a) / d * sp, life: 3 });
    A.sfx('enemyShot');
  };
  Flight.prototype.world = function (dt, scroll) {
    const sk = this.k.skill, rate = 0.8 + sk * 0.3 + this.k.target * 0.08;
    const live = this.state === 'fly';
    for (const o of this.objs) {
      const sx = this.sx(o);
      if (sx < -40 || sx > W + 20 || o.hp <= 0) continue;
      const ahead = sx > this.px + 30 && sx < W - 10;
      if (o.k === 'tank') {
        o.x -= 8 * dt;
        o.ft -= dt * rate;
        if (live && ahead && o.ft <= 0) { o.ft = rnd(1.6, 2.8); this.fireAt(sx + 2, 8, 80); }
      } else if (o.k === 'sam') {
        o.ft -= dt * rate;
        if (live && ahead && (this.a > RADAR || this.alert > 1) && o.ft <= 0) {
          o.ft = rnd(2.8, 4);
          this.shots.push({ k: 'missile', x: sx + 6, a: 10, vx: -10, va: 70, life: 4.5, hp: 1 });
          A.sfx('missile');
        }
      } else if (o.k === 'flak') {
        o.ft -= dt * rate;
        if (live && sx > this.px + 20 && o.ft <= 0) {
          o.ft = rnd(1.4, 2.4);
          const tt = 1;
          const tx = this.px + 8 + rnd(-14, 14), ta = this.a + rnd(-10, 10);
          this.shots.push({ k: 'flak', x: sx + 5, a: 8, vx: (tx - sx) / tt, va: (ta - 8) / tt, life: tt });
          A.sfx('enemyShot');
        }
      }
    }
    for (const u of this.airUnits()) {
      if (u.hp <= 0) continue;
      if (u.k === 'heli') {
        u.x -= 22 * dt; u.bob += dt * 3; u.a += Math.sin(u.bob) * 10 * dt;
        u.a += Math.sign(this.a - u.a) * 8 * dt;
        u.ft -= dt * rate;
        if (live && u.x > this.px + 20 && u.ft <= 0) { u.ft = rnd(1.2, 2); this.fireAt(u.x, u.a + 3, 90); }
      } else {
        u.x -= 150 * dt;
        u.a += Math.sign(this.a - u.a) * 18 * dt;
        u.ft -= dt * rate;
        if (live && u.shots > 0 && u.x > this.px + 30 && u.ft <= 0) { u.shots--; u.ft = 0.4; this.fireAt(u.x, u.a + 3, 140); }
      }
    }
    this.units = this.airUnits().filter((u) => u.x > -30 && u.hp > 0);
    for (const b of this.bul) b.x += 230 * dt;
    this.bul = this.bul.filter((b) => b.x < W && !b.dead);
    for (const b of this.bombs) { b.va -= 110 * dt; b.a += b.va * dt; b.x += 4 * dt; }
    for (const b of this.bombs) {
      if (b.a > 0) continue;
      b.dead = true;
      this.booms.add(b.x, ROW - 2, 1); A.sfx('boom');
      for (const o of this.objs) if (o.hp > 0 && Math.abs(this.sx(o) + o.w / 2 - b.x) < o.w / 2 + 8) this.hitObj(o, 3);
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
    stepShots(this, dt, live);
  };
  /* enemy fire shared by the flight and launch-site levels (screen x, altitude a) */
  function stepShots(L, dt, live) {
    for (const s of L.shots) {
      s.life -= dt;
      if (s.k === 'missile') {
        const dx = L.px + 8 - s.x, da = L.a - s.a, d = Math.hypot(dx, da) || 1;
        s.vx += (dx / d * 95 - s.vx) * dt * 1.8; s.va += (da / d * 95 - s.va) * dt * 1.8;
      }
      s.x += s.vx * dt; s.a += s.va * dt;
      if (s.k === 'flak' && s.life <= 0) {
        s.dead = true;
        L.booms.add(s.x, ROW - s.a, 0.6); A.sfx('flak');
        if (live && Math.hypot(s.x - L.px - 8, s.a - L.a) < 8) L.kill();
      }
    }
    L.shots = L.shots.filter((s) => !s.dead && s.life > 0 && s.a > -2 && s.x > -10 && s.x < W + 10);
  }
  Flight.prototype.collide = function () {
    const px = this.px, a = this.a;
    for (const b of this.bul) {
      for (const o of this.objs) {
        if (o.hp <= 0) continue;
        const sx = this.sx(o);
        if (b.x < sx || b.x > sx + o.w + 3) continue;
        if (o.k === 'balloon') { if (Math.abs(b.a - o.ba) < 6) { b.dead = true; this.hitObj(o, 1); } continue; }
        if (b.a <= o.h + 2) { b.dead = true; if (o.k !== 'tree') this.hitObj(o, 1); break; }
      }
      for (const u of this.airUnits()) if (u.hp > 0 && b.x > u.x - 3 && b.x < u.x + 19 && Math.abs(b.a - u.a - 3) < 7) { b.dead = true; u.hp--; if (u.hp <= 0) { this.k.addScore(u.k === 'jet' ? 800 : 500); this.booms.add(u.x + 8, ROW - u.a - 3, 1.2); A.sfx('boom'); } }
      for (const s of this.shots) if (s.k === 'missile' && Math.abs(b.x - s.x) < 5 && Math.abs(b.a - s.a) < 4) { s.dead = true; b.dead = true; this.k.addScore(150); A.sfx('small'); }
    }
    if (this.state !== 'fly') return;
    for (const o of this.objs) {
      if (o.k !== 'balloon' && o.hp <= 0) continue;
      const sx = this.sx(o);
      if (px + 15 < sx || px + 1 > sx + o.w) continue;
      if (o.k === 'balloon') { if (o.hp > 0 && a < o.ba + 8 && Math.abs(sx + 4 - (px + 8)) < 6) this.kill(); continue; }
      if (a < o.h + 1) this.kill();
    }
    for (const u of this.airUnits()) if (u.hp > 0 && Math.abs(u.x - px) < 13 && Math.abs(u.a - a) < 6) { u.hp = 0; this.kill(); }
    for (const s of this.shots) if (s.k !== 'flak' && s.x > px && s.x < px + 16 && Math.abs(s.a - a - 3) < 4) { s.dead = true; this.kill(); }
  };
  Flight.prototype.auto = function () {
    const a = { fire: true };
    let need = 18;
    for (const o of this.objs) {
      if (o.hp <= 0) continue;
      const sx = this.sx(o);
      if (sx > this.px - 10 && sx < this.px + 90) need = Math.max(need, o.k === 'balloon' ? o.ba + 14 : o.h + 10);
    }
    if (this.a < need) a.up = true; else if (this.a > need + 8) a.down = true;
    a.bomb = this.objs.some((o) => o.hp > 0 && (o.k === 'tank' || o.k === 'sam') && Math.abs(this.sx(o) - this.px - 20) < 12);
    for (const s of this.shots) if (s.x > this.px && s.x < this.px + 40 && Math.abs(s.a - this.a) < 10) { a.up = s.a < this.a; a.down = !a.up; }
    return a;
  };
  Flight.prototype.drawGround = function () {
    const B = this.B;
    // sky bands (C64 style)
    const bands = B.snow ? ['l', 'w'] : ['B', 'c'];
    rect(0, 0, W, HORIZON, bands[0]);
    rect(0, HORIZON - 14, W, 8, bands[1]); rect(0, HORIZON - 4, W, 4, bands[1]);
    // far hills (parallax)
    for (let i = -1; i < 12; i++) {
      const x = i * 40 - ((this.wx * 0.2) % 40);
      const h = 6 + ((i * 7 + Math.floor(this.wx * 0.2 / 40)) % 4) * 3;
      for (let j = 0; j < h; j++) rect(x + j * 2, HORIZON - j, 40 - j * 4, 1, B.far);
    }
    rect(0, HORIZON, W, PH - HORIZON, B.ground);
    // oblique stripes give the ground its depth
    for (let i = -2; i < 22; i++) {
      const x0 = i * 24 - (this.wx % 24);
      for (let y = HORIZON; y < PH; y += 3) {
        const sh = (y - HORIZON) * 0.35;
        rect(x0 - sh, y, 3 + (y - HORIZON) * 0.04, 1, B.stripe);
      }
    }
    // background decor (non-colliding) with depth parallax
    for (const d of this.decor) {
      const f = 0.45 + d.d * 0.45;
      const sx = d.x - this.wx * f;
      if (sx < -20 || sx > W + 10) continue;
      const y = HORIZON + 6 + d.d * 70;
      if (d.water) { rect(sx - 6, y + 4, 24, 3, 'b'); rect(sx - 2, y + 5, 10, 1, 'B'); continue; }
      if (d.k === 'tree') this.drawTree(sx, y, 0.7);
      else { rect(sx, y + 2, 10, 6, 'l'); rect(sx - 1, y, 12, 2, 'r'); }
    }
    // main row track
    rect(0, ROW, W, 4, B.snow ? 'l' : 'n');
    rect(0, ROW + 4, W, 1, 'k');
  };
  Flight.prototype.drawTree = function (x, base, s) {
    const B = this.B;
    s = s || 1;
    const h = Math.round(12 * s);
    rect(x + 3, base + h - 2, 2, 3, 'n');
    for (let j = 0; j < h; j++) {
      const w = Math.max(1, Math.round((j % 4 + j / 2) * s));
      rect(x + 4 - w / 2, base + j, w, 1, B.snow && j % 4 === 0 ? 'w' : B.tree);
    }
  };
  Flight.prototype.drawObj = function (o) {
    const sx = this.sx(o), base = ROW;
    const dead = o.hp <= 0;
    switch (o.k) {
      case 'tree': if (!dead) this.drawTree(sx, base - 14, 1.15); break;
      case 'house':
        if (dead) { rect(sx, base - 3, 16, 3, 'd'); break; }
        rect(sx + 1, base - 9, 14, 9, this.B.snow ? 'o' : 'l');
        for (let j = 0; j < 4; j++) rect(sx - 1 + j, base - 12 + j, 18 - j * 2, 1, this.B.snow ? 'w' : 'r');
        rect(sx + 3, base - 6, 3, 3, 'b'); rect(sx + 10, base - 6, 3, 6, 'n');
        break;
      case 'block':
        if (dead) { rect(sx, base - 6, o.w, 6, 'd'); break; }
        rect(sx, base - o.h, o.w, o.h, 'm');
        rect(sx, base - o.h, o.w, 1, 'l');
        for (let y = base - o.h + 3; y < base - 3; y += 5) for (let x = sx + 2; x < sx + o.w - 2; x += 4) rect(x, y, 2, 2, (x + y) % 3 ? 'k' : 'y');
        break;
      case 'tank': blit(tankSpr(dead), sx, base - 9, true, 1.25); break;
      case 'sam':
        rect(sx, base - 3, 12, 3, dead ? 'd' : 'n');
        if (!dead) { rect(sx + 2, base - 8, 8, 2, 'w'); rect(sx + 3, base - 10, 8, 2, 'w'); rect(sx + 10, base - 10, 2, 2, 'R'); }
        break;
      case 'flak':
        rect(sx, base - 4, 10, 4, dead ? 'd' : 'o');
        if (!dead) { rect(sx + 4, base - 7, 3, 3, 'd'); for (let i = 0; i < 5; i++) rect(sx + 3 - i, base - 8 - i, 1, 1, 'k'); }
        break;
      case 'radar':
        rect(sx + 5, base - 12, 2, 12, dead ? 'd' : 'm');
        if (!dead) {
          const w = Math.round(Math.abs(Math.cos(this.t * 3)) * 6) + 1;
          rect(sx + 6 - w, base - 18, w * 2, 5, 'l');
          if (blink(this.t, 3)) rect(sx + 5, base - 20, 2, 2, 'R');
        }
        break;
      case 'balloon':
        if (dead) break;
        for (let y = base - o.ba + 6; y < base; y += 2) rect(sx + 4, y, 1, 1, 'd');
        circle(sx + 4, base - o.ba, 4, 'l');
        rect(sx + 2, base - o.ba + 4, 5, 2, 'm');
        break;
      default: break;
    }
  };
  Flight.prototype.draw = function () {
    this.drawGround();
    for (const o of this.objs) { const sx = this.sx(o); if (sx > -40 && sx < W + 10) this.drawObj(o); }
    // shadows
    for (const u of this.airUnits()) rect(u.x + 2, ROW + 1, 12, 2, 'k');
    if (this.state !== 'dead') {
      const sw = Math.max(4, 14 - this.a / 12);
      rect(this.px + 8 - sw / 2, ROW + 1, sw, 2, 'k');
    }
    for (const u of this.airUnits()) {
      const y = ROW - u.a - 6;
      if (u.k === 'heli') blit(heliSpr(blink(this.t, 12) ? 1 : 0), u.x, y - 2, true, 1.4);
      else blit(migSpr(), u.x, y, true, 1.4);
    }
    if (this.state !== 'dead' && !(this.inv > 0 && blink(this.t, 10))) {
      blit(planeSpr('l', 'm', 'B'), this.px, ROW - this.a - 6, false, 1.4);
      rect(this.px - 2 - Math.random() * 2, ROW - this.a - 3, 2, 1, 'y');
    }
    for (const b of this.bul) rect(b.x, ROW - b.a - 3, 3, 1, 'w');
    for (const b of this.bombs) rect(b.x, ROW - b.a - 2, 2, 3, 'k');
    for (const s of this.shots) {
      const y = ROW - s.a - 3;
      if (s.k === 'missile') { rect(s.x - 2, y, 4, 2, 'w'); rect(s.x + 2, y, 2, 2, blink(this.t, 10) ? 'y' : 'o'); }
      else if (s.k === 'flak') { rect(s.x - 1, y - 1, 2, 2, 'd'); rect(s.x, y - 1, 1, 1, 'y'); }
      else rect(s.x - 1, y - 1, 2, 2, 'R');
    }
    this.booms.draw();
    // altimeter with radar floor
    rect(W - 8, 30, 5, 124, 'k');
    rect(W - 8, ROW - RADAR - 6, 5, 1, 'R');
    rect(W - 8, Math.max(30, ROW - this.a - 6), 5, 2, 'G');
    // progress
    rect(4, 4, 102, 6, 'k');
    rect(5, 5, 100 * Math.min(1, this.wx / this.L), 4, 'y');
    if (this.state === 'fly' && this.a > RADAR) text(this.alert > 1.5 ? 'RADAR LOCK!' : 'RADAR', W / 2, 16, blink(this.t, 4) ? 'R' : 'w', 'center');
  };

  /* =====================================================================
     LEVEL 3 — Launch site (looping strafing passes over the base)
     ===================================================================== */
  const BW = 640;
  function Silo(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.B = BIOME[k.tgt().biome];
    this.wx = 0; this.px = 50; this.a = 50; this.fireT = 0; this.bombT = 0;
    this.bul = []; this.bombs = []; this.shots = [];
    this.state = 'fly'; this.inv = 1.5; this.pass = 1;
    const p = k.silo || {};
    this.ctrl = { x: 300, w: 56, h: 30, hp: p.ctrl !== undefined ? p.ctrl : 3 + k.skill, vent: 0, vt: 0 };
    this.silos = [110, 450, 560].map((x, i) => ({ x, st: p.silos && p.silos[i] === 'dead' ? 'dead' : 'closed', t: 3 + i * 4, mh: 0, hp: 3, open: 0 }));
    this.guns = [[40, 'flak'], [200, 'flak'], [400, 'flak'], [520, 'sam'], [610, 'flak']].map(([x, k2]) => ({ x, k: k2, hp: 2, ft: rnd(0.5, 2) }));
  }
  Silo.prototype.persist = function () { return { ctrl: this.ctrl.hp, silos: this.silos.map((s) => (s.st === 'dead' ? 'dead' : 'ok')) }; };
  Silo.prototype.sxs = function (x) { // world -> screen positions (two copies for wrap)
    const off = this.wx % BW;
    return [x - off, x - off + BW];
  };
  Silo.prototype.kill = Flight.prototype.kill;
  Silo.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    const scroll = this.speed = 55;
    this.wx += scroll * (this.state === 'dead' ? 0.4 : 1) * dt;
    this.booms.update(dt, scroll);
    if (Math.floor(this.wx / BW) + 1 !== this.pass) { this.pass = Math.floor(this.wx / BW) + 1; this.passMsg = 2; }
    this.passMsg = Math.max(0, (this.passMsg || 0) - dt);
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 1.8 && !this.rep) { this.rep = true; k.die(); } this.world(dt); return; }
    if (this.state === 'won') {
      this.endT += dt;
      if (Math.random() < dt * 8) { const [sx] = this.sxs(this.ctrl.x); this.booms.add(sx + rnd(0, 56), ROW - rnd(0, 30), rnd(1, 2)); A.sfx('boom'); }
      if (this.endT > 2.5 && !this.rep) { this.rep = true; k.levelDone(5000); }
      return;
    }
    this.inv = Math.max(0, this.inv - dt);
    if (I.is('up')) this.a = Math.min(110, this.a + 60 * dt);
    if (I.is('down')) this.a = Math.max(8, this.a - 60 * dt);
    if (I.is('left')) this.px = Math.max(16, this.px - 70 * dt);
    if (I.is('right')) this.px = Math.min(200, this.px + 70 * dt);
    A.engine(true, 1 + this.a / 200);
    this.fireT -= dt; this.bombT -= dt;
    if (I.is('fire') && this.fireT <= 0) { this.fireT = 0.14; this.bul.push({ x: this.px + 16, a: this.a + 1 }); A.sfx('shot'); }
    if (I.is('bomb') && this.bombT <= 0) { this.bombT = 0.5; this.bombs.push({ x: this.px + 6, a: this.a - 2, va: 0 }); A.sfx('bomb'); }
    this.world(dt);
    this.collide();
  };
  Silo.prototype.world = function (dt) {
    const k = this.k, rate = 0.8 + k.skill * 0.3, live = this.state === 'fly';
    const C = this.ctrl;
    C.vt += dt;
    const per = 5 - k.skill * 0.5;
    C.vent = (C.vt % per) < per * 0.4 ? Math.min(1, C.vent + dt * 4) : Math.max(0, C.vent - dt * 4);
    for (const s of this.silos) {
      if (s.st === 'dead') continue;
      s.t -= dt;
      if (s.st === 'closed') { s.open = Math.max(0, s.open - dt * 2); if (s.t <= 0 && live) { s.st = 'opening'; A.sfx('door'); } }
      if (s.st === 'opening') { s.open = Math.min(1, s.open + dt); if (s.open >= 1) { s.st = 'rising'; s.mh = 0; s.hp = 3; } }
      if (s.st === 'rising') { s.mh += dt * (40 / (8 - k.skill - k.target * 0.4)); if (s.mh >= 40) { s.st = 'launch'; s.v = 10; A.sfx('launch'); } }
      if (s.st === 'launch') {
        s.v += 90 * dt; s.mh += s.v * dt;
        if (s.mh > 220) { s.st = 'closed'; s.t = 14 + Math.random() * 5; s.mh = 0; if (live) k.cityLost(k.tgt().name); }
      }
    }
    for (const g of this.guns) {
      if (g.hp <= 0) continue;
      g.ft -= dt * rate;
      const [sx] = this.sxs(g.x).filter((v) => v > -20 && v < W + 20);
      if (sx === undefined || !live || g.ft > 0) continue;
      if (g.k === 'flak') {
        g.ft = rnd(2.2, 3.4);
        if (sx < this.px + 10) continue;
        const tt = 1, tx = this.px + 8 + rnd(-14, 14), ta = this.a + rnd(-10, 10);
        this.shots.push({ k: 'flak', x: sx + 5, a: 8, vx: (tx - sx) / tt, va: (ta - 8) / tt, life: tt });
        A.sfx('enemyShot');
      } else if (sx > this.px + 20) {
        g.ft = rnd(3, 4.5);
        this.shots.push({ k: 'missile', x: sx + 6, a: 10, vx: -10, va: 70, life: 4.5 });
        A.sfx('missile');
      }
    }
    for (const b of this.bul) b.x += 230 * dt;
    this.bul = this.bul.filter((b) => b.x < W && !b.dead);
    for (const b of this.bombs) {
      b.va -= 110 * dt; b.a += b.va * dt; b.x += 4 * dt;
      if (b.a > 0) continue;
      b.dead = true;
      this.booms.add(b.x, ROW - 2, 1); A.sfx('boom');
      const [cx] = this.sxs(C.x).filter((v) => v > -80 && v < W + 20).concat([9999]);
      if (b.x > cx && b.x < cx + C.w) {
        if (C.vent > 0.5 && Math.abs(b.x - (cx + C.w / 2)) < 9 && C.hp > 0) {
          C.hp--; this.k.addScore(1000); A.sfx('hit');
          this.booms.add(cx + C.w / 2, ROW - C.h, 1.6);
          if (C.hp <= 0) { this.state = 'won'; this.endT = 0; this.rep = false; A.sfx('bigboom'); A.engine(false); }
        } else A.sfx('clank');
      }
      for (const g of this.guns) for (const gx of this.sxs(g.x)) if (g.hp > 0 && Math.abs(gx + 5 - b.x) < 12) { g.hp = 0; this.k.addScore(350); this.booms.add(gx + 5, ROW - 4, 1); }
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
    stepShots(this, dt, live);
  };
  Silo.prototype.collide = function () {
    const C = this.ctrl;
    for (const b of this.bul) {
      for (const s of this.silos) {
        if (s.st !== 'rising' && s.st !== 'launch') continue;
        for (const sx of this.sxs(s.x)) {
          if (b.x > sx + 3 && b.x < sx + 11 && b.a < s.mh + 2 && b.a > s.mh - 40) {
            b.dead = true; s.hp--; A.sfx('clank');
            if (s.hp <= 0) { s.st = 'dead'; this.k.addScore(2000); this.booms.add(sx + 7, ROW - s.mh + 20, 2); A.sfx('bigboom'); }
          }
        }
      }
      for (const cx of this.sxs(C.x)) if (b.x > cx && b.x < cx + C.w && b.a < C.h + 1) { b.dead = true; A.sfx('clank'); }
      for (const g of this.guns) for (const gx of this.sxs(g.x)) if (g.hp > 0 && b.x > gx && b.x < gx + 12 && b.a < 10) { b.dead = true; g.hp--; if (g.hp <= 0) { this.k.addScore(350); this.booms.add(gx + 5, ROW - 4, 1); A.sfx('boom'); } }
      for (const s of this.shots) if (s.k === 'missile' && Math.abs(b.x - s.x) < 5 && Math.abs(b.a - s.a) < 4) { s.dead = true; b.dead = true; this.k.addScore(150); }
    }
    if (this.state !== 'fly') return;
    for (const cx of this.sxs(C.x)) if (this.px + 15 > cx && this.px < cx + C.w && this.a < C.h + 2) this.kill();
    for (const s of this.silos) if (s.st === 'launch') for (const sx of this.sxs(s.x)) if (this.px + 15 > sx + 3 && this.px < sx + 11 && this.a < s.mh && this.a > s.mh - 40) this.kill();
    for (const s of this.shots) if (s.k !== 'flak' && s.x > this.px && s.x < this.px + 16 && Math.abs(s.a - this.a - 3) < 4) { s.dead = true; this.kill(); }
  };
  Silo.prototype.auto = function () {
    const a = { fire: true };
    const C = this.ctrl;
    const [cx] = this.sxs(C.x).filter((v) => v > this.px - 20).concat([9999]);
    // bomb lead: time to fall ~ sqrt(2a/110), screen drift 55px/s backwards relative
    const tf = Math.sqrt(2 * this.a / 110);
    const land = this.px + 6 + 4 * tf + 55 * tf;
    const want = cx + C.w / 2 - 55 * tf * 0; void want;
    const rising = this.silos.find((s) => s.st === 'rising');
    let alt = C.h + 18;
    if (rising) alt = Math.max(alt, 20);
    if (this.a < alt) a.up = true; else if (this.a > alt + 6) a.down = true;
    // released when the vent will be under the bomb at impact
    const ventAtImpact = cx + C.w / 2 - 55 * tf;
    a.bomb = Math.abs(land - 55 * tf - ventAtImpact) < 6 && C.vent > 0.3;
    void land;
    for (const s of this.shots) if (s.x > this.px && s.x < this.px + 40 && Math.abs(s.a - this.a) < 10) { a.up = s.a < this.a; a.down = !a.up; }
    return a;
  };
  Silo.prototype.draw = function () {
    const B = this.B, C = this.ctrl;
    Flight.prototype.drawGround.call(Object.assign(this.__g || (this.__g = { decor: [] }), { B, wx: this.wx }));
    // fence
    for (let x = -((this.wx) % 16); x < W; x += 16) { rect(x, ROW - 6, 1, 6, 'd'); }
    rect(0, ROW - 5, W, 1, 'd');
    // control building
    for (const cx of this.sxs(C.x)) {
      if (cx < -80 || cx > W + 10) continue;
      if (C.hp <= 0 && this.state !== 'won') { rect(cx, ROW - 8, C.w, 8, 'd'); continue; }
      rect(cx - 4, ROW - 4, C.w + 8, 4, 'n');
      rect(cx, ROW - C.h, C.w, C.h, 'm');
      rect(cx, ROW - C.h, C.w, 2, 'l');
      rect(cx + 4, ROW - C.h + 8, C.w - 8, 3, 'r');
      for (let x = cx + 6; x < cx + C.w - 6; x += 8) rect(x, ROW - 12, 4, 6, 'k');
      // roof vent
      const vx = cx + C.w / 2 - 7;
      rect(vx, ROW - C.h - 2, 14, 2, C.vent > 0.5 ? (blink(this.t, 8) ? 'y' : 'o') : 'k');
      rect(vx - C.vent * 6, ROW - C.h - 4, 7, 2, 'l'); rect(vx + 7 + C.vent * 6, ROW - C.h - 4, 7, 2, 'l');
      rect(cx + 4, ROW - C.h - 14, 1, 14, 'd'); if (blink(this.t, 2)) rect(cx + 3, ROW - C.h - 16, 3, 2, 'R');
      for (let i = 0; i < 3 + this.k.skill; i++) rect(cx + 20 + i * 5, ROW - C.h + 14, 3, 3, i < C.hp ? 'G' : 'd');
    }
    // silos and ICBMs
    for (const s of this.silos) for (const sx of this.sxs(s.x)) {
      if (sx < -20 || sx > W + 10) continue;
      rect(sx - 2, ROW - 3, 18, 3, 'l');
      if (s.st === 'dead') { rect(sx + 1, ROW - 3, 12, 2, 'k'); if (blink(this.t + s.x, 3)) rect(sx + 5, ROW - 8, 3, 3, 'd'); continue; }
      rect(sx + 1 - s.open * 6, ROW - 4, 6, 2, 'y'); rect(sx + 7 + s.open * 6, ROW - 4, 6, 2, 'y');
      if (s.st === 'rising' || s.st === 'launch') {
        const top = ROW - 3 - s.mh;
        const vis = Math.min(40, s.mh);
        rect(sx + 4, top + 6, 6, vis - 6, 'w');
        rect(sx + 5, top + 2, 4, 4, 'w'); rect(sx + 6, top, 2, 2, 'w');
        if (vis > 20) rect(sx + 4, top + 16, 6, 2, 'r');
        if (s.st === 'launch') { rect(sx + 4, top + 40, 6, 4, blink(this.t, 12) ? 'y' : 'o'); rect(sx + 5, top + 44, 4, 4, 'r'); }
        if (s.st === 'rising' && blink(this.t, 4)) text('!', sx + 4, top - 12, 'R');
      }
    }
    for (const g of this.guns) for (const gx of this.sxs(g.x)) {
      if (gx < -20 || gx > W + 10) continue;
      Flight.prototype.drawObj.call(Object.assign(this.__d || (this.__d = {}), { sx: () => gx, B, t: this.t }), { k: g.k, x: 0, w: 12, h: 8, hp: g.hp });
    }
    if (this.state !== 'dead') {
      rect(this.px + 8 - 6, ROW + 1, 12, 2, 'k');
      if (!(this.inv > 0 && blink(this.t, 10))) blit(planeSpr('l', 'm', 'B'), this.px, ROW - this.a - 6, false, 1.4);
    }
    for (const b of this.bul) rect(b.x, ROW - b.a - 3, 3, 1, 'w');
    for (const b of this.bombs) rect(b.x, ROW - b.a - 2, 2, 3, 'k');
    for (const s of this.shots) {
      const y = ROW - s.a - 3;
      if (s.k === 'missile') { rect(s.x - 2, y, 4, 2, 'w'); rect(s.x + 2, y, 2, 2, 'o'); }
      else if (s.k === 'flak') { rect(s.x - 1, y - 1, 2, 2, 'd'); rect(s.x, y - 1, 1, 1, 'y'); }
      else rect(s.x - 1, y - 1, 2, 2, 'R');
    }
    this.booms.draw();
    text('PASS ' + this.pass, 4, 4, 'w');
    if (this.passMsg > 0 && this.pass > 1) text('MAKE ANOTHER PASS', W / 2, 20, 'y', 'center');
    if (C.vent > 0.5 && this.state === 'fly') text('VENT OPEN', W - 4, 4, blink(this.t, 6) ? 'y' : 'o', 'right');
  };

  /* =====================================================================
     LEVEL 4 — The Kremlin (frontal, bazooka)
     ===================================================================== */
  const DOORS = [44, 118, 190, 262];
  const WALL_TOP = 78, WALL_BOT = 140;
  function Kremlin(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.px = 150; this.cy = 128; this.fireT = 0; this.walk = 0;
    this.doors = DOORS.map((x, i) => ({ x, hp: 3 + k.skill, hp0: 3 + k.skill, open: 0, t: 2 + i * 1.5, rel: 0 }));
    this.rockets = []; this.troops = []; this.tanks = []; this.shots = [];
    this.state = 'fight'; this.inv = 1; this.tankT = 8;
  }
  Kremlin.prototype.respawn = function () { this.state = 'fight'; this.inv = 2; this.shots = []; this.troops = this.troops.filter((t) => t.y < 150); this.rep = false; };
  Kremlin.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    this.booms.update(dt);
    if (this.state === 'won') { this.endT += dt; if (Math.random() < dt * 6) { this.booms.add(rnd(20, 300), rnd(WALL_TOP, WALL_BOT), rnd(1, 2)); A.sfx('boom'); } if (this.endT > 2.5 && !this.rep) { this.rep = true; k.levelDone(8000); } return; }
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 1.5 && !this.rep) { this.rep = true; k.die(true); } this.world(dt); return; }
    this.inv = Math.max(0, this.inv - dt);
    let mv = 0;
    if (I.is('left')) mv = -1;
    if (I.is('right')) mv = 1;
    this.px = Math.max(4, Math.min(W - 12, this.px + mv * 60 * dt));
    this.walk += Math.abs(mv) * dt * 8;
    if (I.is('up')) this.cy = Math.max(56, this.cy - 70 * dt);
    if (I.is('down')) this.cy = Math.min(176, this.cy + 70 * dt);
    this.fireT -= dt;
    if (I.is('fire') && this.fireT <= 0 && !this.rockets.length) {
      this.fireT = 0.4;
      this.rockets.push({ x: this.px + 4, y: 168, ty: this.cy });
      A.sfx('missile');
    }
    this.world(dt);
  };
  Kremlin.prototype.world = function (dt) {
    const k = this.k, live = this.state === 'fight', rate = 0.8 + k.skill * 0.3;
    for (const d of this.doors) {
      if (d.hp <= 0) continue;
      d.t -= dt;
      if (d.t <= 0 && !d.opening && d.open === 0 && live) { d.opening = true; d.rel = 1 + (Math.random() < 0.3 + k.skill * 0.2 ? 1 : 0); A.sfx('door'); }
      if (d.opening) {
        d.open = Math.min(1, d.open + dt * 2);
        if (d.open >= 1) {
          d.relT = (d.relT || 0) - dt;
          if (d.rel > 0 && d.relT <= 0 && this.troops.filter((t) => t.hp > 0).length < 3 + k.skill) { d.rel--; d.relT = 0.6; this.troops.push({ x: d.x + 5, y: WALL_BOT - 12, hp: 1, stop: rnd(146, 166), ft: rnd(0.8, 1.6), walk: 0 }); }
          if (d.rel <= 0 || d.relT > 0.5 && d.rel === 0) { d.opening = false; d.closing = true; }
        }
      }
      if (d.closing) { d.open = Math.max(0, d.open - dt * 1.5); if (d.open <= 0) { d.closing = false; d.t = rnd(3, 6) - k.skill; } }
    }
    for (const t of this.troops) {
      if (t.hp <= 0) { t.dead = (t.dead || 0) + dt; continue; }
      if (t.y < t.stop) { t.y += 14 * dt; t.walk += dt * 8; t.x += Math.sin(t.walk * 0.4) * 6 * dt; }
      else {
        t.ft -= dt * rate;
        if (live && t.ft <= 0) {
          t.ft = rnd(1.6, 2.6);
          const dx = this.px + 4 - t.x, dy = 172 - t.y, d = Math.hypot(dx, dy) || 1;
          this.shots.push({ x: t.x + 3, y: t.y + 4, vx: dx / d * 80, vy: dy / d * 80 });
          A.sfx('enemyShot');
        }
      }
    }
    this.troops = this.troops.filter((t) => !(t.dead > 3));
    this.tankT -= dt;
    if (live && this.tankT <= 0 && !this.tanks.some((t) => t.hp > 0)) {
      this.tankT = rnd(12, 18);
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.tanks.push({ x: dir > 0 ? -20 : W + 4, dir, hp: 2, ft: 2 });
    }
    for (const t of this.tanks) {
      if (t.hp <= 0) continue;
      t.x += t.dir * 16 * dt;
      t.ft -= dt * rate;
      if (live && t.ft <= 0 && t.x > 0 && t.x < W - 16) {
        t.ft = rnd(2.5, 3.5);
        const dx = this.px + 4 - t.x - 8, dy = 172 - 150, d = Math.hypot(dx, dy) || 1;
        this.shots.push({ x: t.x + 8, y: 150, vx: dx / d * 70, vy: dy / d * 70, big: true });
        A.sfx('flak');
      }
    }
    this.tanks = this.tanks.filter((t) => t.x > -30 && t.x < W + 30);
    for (const r of this.rockets) {
      r.y -= 170 * dt;
      if (r.y <= r.ty) {
        r.dead = true;
        this.booms.add(r.x, r.ty, 1.2); A.sfx('boom');
        for (const d of this.doors) {
          if (d.hp > 0 && r.x >= d.x - 1 && r.x <= d.x + 19 && r.ty >= WALL_BOT - 26 && r.ty <= WALL_BOT) {
            d.hp -= d.open > 0.5 ? 2 : 1;
            A.sfx('hit');
            if (d.hp <= 0) { d.hp = 0; k.addScore(1500); this.booms.add(d.x + 9, WALL_BOT - 12, 2.2); A.sfx('bigboom'); if (this.doors.every((q) => q.hp <= 0)) { this.state = 'won'; this.endT = 0; this.rep = false; k.addScore(5000); } }
            else k.addScore(200);
          }
        }
        for (const t of this.troops) if (t.hp > 0 && Math.abs(t.x + 4 - r.x) < 10 && Math.abs(t.y + 6 - r.ty) < 12) { t.hp = 0; k.addScore(100); }
        for (const t of this.tanks) if (t.hp > 0 && Math.abs(t.x + 8 - r.x) < 14 && Math.abs(150 - r.ty) < 10) { t.hp--; if (t.hp <= 0) { k.addScore(500); this.booms.add(t.x + 8, 150, 1.5); } }
      }
    }
    this.rockets = this.rockets.filter((r) => !r.dead);
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (live && this.inv <= 0 && !k.game.god && s.x > this.px && s.x < this.px + 8 && s.y > 168 && s.y < 182) {
        s.dead = true; this.state = 'dead'; this.deadT = 0; this.booms.add(this.px + 4, 174, 1); A.sfx('die');
      }
    }
    this.shots = this.shots.filter((s) => !s.dead && s.y < PH && s.x > -4 && s.x < W + 4);
  };
  Kremlin.prototype.auto = function () {
    const a = {};
    const d = this.doors.find((q) => q.hp > 0);
    if (!d) return a;
    const tx = d.x + 5;
    if (this.px < tx - 2) a.right = true; else if (this.px > tx + 2) a.left = true;
    const ty = WALL_BOT - 12;
    if (this.cy > ty + 2) a.up = true; else if (this.cy < ty - 2) a.down = true;
    a.fire = Math.abs(this.px - tx) < 4;
    return a;
  };
  Kremlin.prototype.draw = function () {
    rect(0, 0, W, PH, 'k');
    for (const [x, y] of this.k.stars) if (y < WALL_TOP) rect(x, y, 1, 1, 'w');
    rect(0, WALL_TOP - 24, W, 24, 'b');
    // domes of cathedrals behind the wall
    for (const [x, r] of [[70, 7], [92, 5], [228, 8], [250, 5]]) { circle(x, WALL_TOP - 8, r, 'y'); rect(x, WALL_TOP - 8 - r - 6, 1, 6, 'y'); rect(x - r, WALL_TOP - 8, r * 2 + 1, 8, 'l'); }
    // wall
    rect(0, WALL_TOP, W, WALL_BOT - WALL_TOP, 'r');
    for (let y = WALL_TOP + 4; y < WALL_BOT; y += 6) for (let x = ((y / 6) % 2) * 6; x < W; x += 12) rect(x, y, 1, 3, 'n');
    for (let y = WALL_TOP + 3; y < WALL_BOT; y += 6) rect(0, y, W, 1, 'n');
    for (let x = 0; x < W; x += 10) { rect(x, WALL_TOP - 6, 6, 6, 'r'); rect(x + 2, WALL_TOP - 6, 2, 2, 'k'); }
    // towers
    const tower = (x, w, h, clock) => {
      rect(x, WALL_TOP - h, w, h + (WALL_BOT - WALL_TOP), 'r');
      rect(x - 1, WALL_TOP - h, w + 2, 2, 'l');
      for (let i = 0; i < 18; i++) rect(x + (w / 2) * (i / 18), WALL_TOP - h - i, w * (1 - i / 18), 1, 'g');
      rect(x + w / 2 - 1, WALL_TOP - h - 24, 3, 4, blink(this.t, 1) ? 'R' : 'r');
      if (clock) { circle(x + w / 2, WALL_TOP - h + 12, 5, 'w'); rect(x + w / 2, WALL_TOP - h + 8, 1, 4, 'k'); rect(x + w / 2, WALL_TOP - h + 12, 3, 1, 'k'); }
    };
    tower(4, 16, 16); tower(86, 16, 20); tower(146, 28, 40, true); tower(220, 16, 20); tower(300, 16, 16);
    // doors of the defense center
    for (const d of this.doors) {
      const y = WALL_BOT - 26;
      rect(d.x - 2, y - 3, 22, 29, 'd');
      if (d.hp <= 0) { rect(d.x, y, 18, 26, 'k'); circle(d.x + 9, y + 14, 4 + (blink(this.t, 8) ? 1 : 0), blink(this.t, 6) ? 'o' : 'y'); continue; }
      rect(d.x, y, 18, 26, 'k');
      const sh = Math.round(d.open * 22);
      rect(d.x, y, 18, 26 - sh, 'm');
      for (let yy = y + 3; yy < y + 26 - sh; yy += 4) rect(d.x, yy, 18, 1, 'd');
      for (let i = 0; i < d.hp0; i++) rect(d.x + 1 + i * 3, y - 6, 2, 2, i < d.hp ? 'G' : 'd');
    }
    // square
    rect(0, WALL_BOT, W, PH - WALL_BOT, 'd');
    for (let y = WALL_BOT + 3; y < PH; y += 5) for (let x = (y % 2) * 4; x < W; x += 9) rect(x, y, 4, 1, 'm');
    for (const t of this.tanks) blit(tankSpr(t.hp <= 0), t.x, 143, t.dir < 0);
    for (const t of this.troops) {
      if (t.hp <= 0) { rect(t.x, t.y + 9, 8, 3, 'g'); continue; }
      drawSoldier(t.x, t.y, Math.floor(t.walk) % 2, 'g', 'n');
    }
    for (const s of this.shots) rect(s.x - 1, s.y - 1, s.big ? 3 : 2, s.big ? 3 : 2, s.big ? 'y' : 'R');
    for (const r of this.rockets) { rect(r.x - 1, r.y, 2, 4, 'w'); rect(r.x - 1, r.y + 4, 2, 2, blink(this.t, 12) ? 'y' : 'o'); }
    this.booms.draw();
    if (this.state !== 'dead' && !(this.inv > 0 && blink(this.t, 10))) {
      drawSoldier(this.px, 170, Math.floor(this.walk) % 2, 'B', 'b');
      rect(this.px + 5, 168, 2, 8, 'g');
      // crosshair
      const x = this.px + 4, y = Math.round(this.cy);
      rect(x - 4, y, 3, 1, 'y'); rect(x + 2, y, 3, 1, 'y'); rect(x, y - 4, 1, 3, 'y'); rect(x, y + 2, 1, 3, 'y');
    }
  };

  /* =====================================================================
     LEVEL 5 — Reactor room (top-down disc duel)
     ===================================================================== */
  const RL = 32, RR = 288;
  function Reactor(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.px = 156; this.walk = 0; this.mv = 0; this.fireT = 0;
    this.rx = 152; this.rvx = 0; this.rhp = 6 + k.skill * 2; this.rhp0 = this.rhp; this.throwT = 2; this.hitT = 0;
    this.core = 3; this.discs = [];
    this.state = 'fight'; this.inv = 1;
  }
  Reactor.prototype.respawn = function () { this.state = this.rhp > 0 ? 'fight' : 'core'; this.inv = 2; this.discs = this.discs.filter((d) => d.mine); this.rep = false; };
  Reactor.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    this.booms.update(dt);
    if (this.state === 'melt') { this.endT += dt; if (Math.random() < dt * 10) { this.booms.add(rnd(RL, RR), rnd(10, 170), rnd(1, 2.5)); A.sfx('boom'); } if (this.endT > 3 && !this.rep) { this.rep = true; k.levelDone(25000); } return; }
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 1.5 && !this.rep) { this.rep = true; k.die(true); } this.world(dt); return; }
    this.inv = Math.max(0, this.inv - dt);
    this.mv = 0;
    if (I.is('left')) this.mv = -1;
    if (I.is('right')) this.mv = 1;
    this.px = Math.max(RL + 2, Math.min(RR - 10, this.px + this.mv * 75 * dt));
    this.walk += Math.abs(this.mv) * dt * 8;
    this.fireT -= dt;
    if (I.is('fire') && this.fireT <= 0 && this.discs.filter((d) => d.mine).length < 2) {
      this.fireT = 0.45;
      this.discs.push({ mine: true, x: this.px + 4, y: 164, vx: this.mv * 75, vy: -140, b: 0 });
      A.sfx('throw');
    }
    this.world(dt);
  };
  Reactor.prototype.world = function (dt) {
    const k = this.k, live = this.state === 'fight' || this.state === 'core';
    if (this.rhp > 0) {
      const target = Math.max(RL + 4, Math.min(RR - 20, this.px - 4 + Math.sin(this.t) * 50));
      this.rvx += Math.sign(target - this.rx) * 140 * dt;
      this.rvx = Math.max(-55, Math.min(55, this.rvx * (1 - dt)));
      this.rx = Math.max(RL + 2, Math.min(RR - 18, this.rx + this.rvx * dt));
      this.hitT = Math.max(0, this.hitT - dt);
      this.throwT -= dt * (0.8 + k.skill * 0.3);
      if (this.state === 'fight' && this.throwT <= 0) {
        this.throwT = rnd(1.1, 2);
        let tx = this.px + 4;
        if (Math.random() < 0.45) tx = Math.random() < 0.5 ? 2 * RL - tx : 2 * RR - tx;
        const dx = tx - (this.rx + 8), dy = 170 - 52, d = Math.hypot(dx, dy);
        const sp = 105 + k.skill * 15;
        this.discs.push({ mine: false, x: this.rx + 8, y: 52, vx: dx / d * sp, vy: dy / d * sp, b: 0 });
        A.sfx('throw');
      }
    }
    for (const d of this.discs) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < RL + 2 || d.x > RR - 2) { d.vx = -d.vx; d.x = Math.max(RL + 2, Math.min(RR - 2, d.x)); d.b++; A.sfx('bounce'); }
      if (d.mine) {
        if (this.rhp > 0 && d.y < 56 && d.y > 28 && d.x > this.rx - 6 && d.x < this.rx + 22) {
          if (Math.abs(d.vx) < 40) { d.mine = false; d.vy = Math.abs(d.vy); d.vx += rnd(-30, 30); A.sfx('clank'); }
          else {
            d.dead = true; this.rhp--; this.hitT = 0.2; k.addScore(500); A.sfx('hit'); this.booms.add(d.x, d.y, 0.8);
            if (this.rhp <= 0) { this.state = this.state === 'dead' ? 'dead' : 'core'; this.booms.add(this.rx + 8, 42, 2.5); A.sfx('bigboom'); k.addScore(10000); this.discs = this.discs.filter((q) => q.mine); }
          }
        }
        if (this.rhp <= 0 && d.y < 26 && d.x > 148 && d.x < 172) {
          d.dead = true; this.core--; A.sfx('hit'); this.booms.add(d.x, 22, 1.2); k.addScore(1000);
          if (this.core <= 0) { this.state = 'melt'; this.endT = 0; this.rep = false; A.sfx('bigboom'); }
        }
        for (const e of this.discs) if (!e.mine && !e.dead && Math.abs(e.x - d.x) < 5 && Math.abs(e.y - d.y) < 4) { e.dead = true; d.dead = true; k.addScore(100); A.sfx('clank'); }
      } else if (live && this.inv <= 0 && !k.game.god && d.y > 160 && d.y < 182 && d.x > this.px - 2 && d.x < this.px + 10) {
        d.dead = true; this.state = 'dead'; this.deadT = 0; this.booms.add(this.px + 4, 174, 1); A.sfx('die');
      }
    }
    this.discs = this.discs.filter((d) => !d.dead && d.y > 4 && d.y < PH && d.b < 5);
  };
  Reactor.prototype.auto = function () {
    const a = {};
    for (const d of this.discs) if (!d.mine && d.vy > 0 && d.y > 110 && Math.abs(d.x - this.px - 4) < 14) { if (d.x > this.px + 4) a.left = true; else a.right = true; return a; }
    if (this.rhp <= 0) {
      if (this.px < 152) a.right = true; else if (this.px > 160) a.left = true; else a.fire = true;
      return a;
    }
    // predict where an angled throw meets the robot line (with wall bounces)
    const at = (mv) => {
      let x = this.px + 4, vx = mv * 75;
      const tt = (164 - 42) / 140;
      x += vx * tt;
      while (x < RL + 2 || x > RR - 2) x = x < RL + 2 ? 2 * (RL + 2) - x : 2 * (RR - 2) - x;
      return x;
    };
    const rxAt = this.rx + this.rvx * 0.6 + 8;
    for (const mv of [-1, 1]) {
      if (Math.abs(at(mv) - rxAt) < 7) { a.fire = true; if (mv < 0) a.left = true; else a.right = true; return a; }
    }
    const tx = this.rx > 160 ? 70 : 240;
    if (this.px < tx - 4) a.right = true; else if (this.px > tx + 4) a.left = true;
    return a;
  };
  Reactor.prototype.draw = function () {
    rect(0, 0, W, PH, 'k');
    // floor grid
    rect(RL, 26, RR - RL, PH - 26, 'd');
    for (let y = 30; y < PH; y += 12) rect(RL, y, RR - RL, 1, 'k');
    for (let x = RL + 8; x < RR; x += 16) rect(x, 26, 1, PH - 26, 'k');
    rect(RL, 150, RR - RL, 1, 'y');
    // walls
    rect(0, 0, RL, PH, 'm'); rect(RR, 0, W - RR, PH, 'm');
    for (let y = 8; y < PH; y += 24) { rect(RL - 4, y, 3, 10, blink(this.t + y, 1) ? 'c' : 'b'); rect(RR + 1, y, 3, 10, blink(this.t + y, 1) ? 'c' : 'b'); }
    // back wall + reactor core
    rect(RL, 0, RR - RL, 26, 'l');
    for (let x = RL; x < RR; x += 20) rect(x, 0, 2, 26, 'm');
    const pulse = blink(this.t, this.state === 'melt' ? 10 : 2);
    rect(146, 2, 28, 24, 'k');
    rect(150, 4, 20, 22, pulse ? 'c' : 'B');
    rect(156, 4, 8, 22, 'w');
    if (this.rhp > 0) for (let x = 147; x < 174; x += 4) rect(x, 2, 2, 24, 'm');
    else for (let i = 0; i < this.core; i++) rect(150 + i * 7, 28, 5, 3, 'R');
    // robot
    if (this.rhp > 0) {
      blit(robotSpr(this.hitT > 0), this.rx, 34, false, 1.5);
      rect(this.rx - 10, 36, 6, 18, 'y'); rect(this.rx - 9, 37, 4, 16, 'o'); // shield
      for (let i = 0; i < this.rhp0; i++) rect(this.rx - 4 + i * 3, 58, 2, 2, i < this.rhp ? 'R' : 'k');
    } else rect(this.rx, 44, 16, 6, 'k');
    for (const d of this.discs) { rect(d.x - 4, d.y - 1, 8, 3, d.mine ? 'c' : 'R'); rect(d.x - 2, d.y - 2, 4, 1, d.mine ? 'c' : 'R'); rect(d.x - 1, d.y - 1, 2, 2, 'w'); }
    if (this.state !== 'dead' && !(this.inv > 0 && blink(this.t, 10))) blit(soldierSpr(Math.floor(this.walk) % 2, 'B', 'b'), this.px, 166, false, 1.5);
    this.booms.draw();
    if (this.state === 'melt') { if (blink(this.t, 6)) rect(0, 0, W, PH, 'R'); text('MELTDOWN!', W / 2, 80, 'w', 'center'); }
    else if (this.state === 'core' && blink(this.t, 2)) text('HIT THE CORE', W / 2, 60, 'y', 'center');
  };

  const LEVELS = { hangar: Hangar, flight: Flight, silo: Silo, kremlin: Kremlin, reactor: Reactor };
  Classic.LEVELS = LEVELS;
})();
