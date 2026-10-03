/* Raid Over Moscow II — "1984 mode": a recreation of the original C64 game,
   built from the original manual and the C64 screens.
   Sequences: I SAC HQ (orbital overview) · II Hangar (thrusters, F7 doors) ·
   III Attack run · IV Missile silos · V Defense Center · VI Reactor · VII Ending.
   Logical screen 320x200 (playfield 0-159, five text rows below) rendered at
   3x for crisp, higher-resolution sprites inside the C64 brown border. */
'use strict';
(function () {
  const ROM = window.ROM;
  const A = ROM.Audio;
  const W = 320, H = 200, PF = 160, BS = 3;
  const FONT = '8px "Press Start 2P", monospace';

  /* colours sampled from the C64 version */
  const P = {
    k: '#000000', w: '#ffffff', N: '#7f5307', n: '#5e3d05', d: '#575753', D: '#626262', l: '#a3a7a7',
    b: '#4f44d8', B: '#4f44ff', y: '#fbfb8b', Y: '#e8d870', m: '#8a283e', r: '#b8342c', R: '#e07b70',
    o: '#d89c5b', O: '#d9a43c', G: '#b3ffbf', c: '#b6fbfc', C: '#94effe', g: '#6af06f', h: '#3f9a45',
    L: '#a799ff',
  };
  const col = (k) => P[k] || k;
  let c = null;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const blink = (t, hz) => Math.floor(t * (hz || 2)) % 2 === 0;
  const rect = (x, y, w, h, k) => { c.fillStyle = col(k); c.fillRect(x, y, w, h); };
  const ell = (x, y, rx, ry, k) => { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fillStyle = col(k); c.fill(); };
  const poly = (pts, k) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = col(k); c.fill(); };
  const line = (x1, y1, x2, y2, k, w) => { c.strokeStyle = col(k); c.lineWidth = w || 1; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
  const text = (s, x, y, k, align) => {
    c.font = FONT; c.textAlign = align || 'left'; c.textBaseline = 'top';
    c.fillStyle = col(k); c.fillText(s, x, y);
  };
  const row = (i) => PF + i * 8;
  const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
  const sgn = (v, w) => (v < 0 ? '-' : ' ') + pad(Math.abs(Math.round(v)), w);
  const clock = (t, tenths) => {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return pad(m, 2) + ':' + (tenths ? s.toFixed(1).padStart(4, '0') : pad(s, 2));
  };

  /* ---------- hi-res vector sprites ---------- */
  const cache = new Map();
  function spr(key, w, h, fn) {
    let s = cache.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = w * BS; s.height = h * BS;
    const g = s.getContext('2d');
    g.scale(BS, BS); g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    cache.set(key, s);
    return s;
  }
  function blit(s, x, y, o) {
    o = o || {};
    const sc = o.sc || 1;
    const w = (s.width / BS) * sc, h = (s.height / BS) * sc;
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    c.drawImage(s, -w / 2, -h / 2, w, h);
    c.restore();
  }
  const gp = (g, pts, fill, stroke, lw) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    if (fill) { g.fillStyle = col(fill); g.fill(); }
    if (stroke) { g.strokeStyle = col(stroke); g.lineWidth = lw || 0.4; g.stroke(); }
  };
  const ge = (g, x, y, rx, ry, fill) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = col(fill); g.fill(); };

  /* stealth fighter seen from above, nose up (hangar) */
  const topPlane = (k) => spr('top' + k, 16, 16, (g) => {
    gp(g, [[8, 0.4], [9.6, 5], [15.6, 11.5], [15.6, 13.4], [10, 11.6], [9.6, 15.4], [6.4, 15.4], [6, 11.6], [0.4, 13.4], [0.4, 11.5], [6.4, 5]], k, k === 'k' ? null : 'k', 0.5);
    if (k !== 'k') {
      gp(g, [[8, 2], [8.9, 6], [8, 9], [7.1, 6]], 'k');
      gp(g, [[3, 12], [6, 10.6], [6, 11.6]], 'k'); gp(g, [[13, 12], [10, 10.6], [10, 11.6]], 'k');
    }
  });
  /* side view facing right (attack run) */
  const sidePlane = (k) => spr('side' + k, 22, 9, (g) => {
    gp(g, [[0.4, 3.6], [3, 3.6], [1.6, 0.4], [0.4, 0.4]], k, 'k');
    gp(g, [[0, 4], [4, 3.2], [15, 3], [21.6, 4.6], [15, 6], [3, 6.2], [0, 5.6]], k, 'k', 0.5);
    gp(g, [[6.5, 5], [12, 5], [8.6, 8.6], [5.6, 8.6]], 'k');
    ge(g, 14.6, 3.6, 2.2, 0.8, 'k');
  });
  /* rear view (silo attack) */
  const rearPlane = (k) => spr('rear' + k, 18, 9, (g) => {
    gp(g, [[0.3, 6.4], [9, 2.6], [17.7, 6.4], [17.7, 7.6], [9, 5.6], [0.3, 7.6]], k, 'k', 0.45);
    gp(g, [[8.3, 0.3], [9.7, 0.3], [9.8, 5.4], [8.2, 5.4]], k, 'k', 0.4);
    ge(g, 9, 5.2, 1.4, 1.1, k); ge(g, 9, 5.4, 0.7, 0.55, 'o');
  });
  const enemyRear = () => spr('erear', 14, 7, (g) => {
    gp(g, [[0.3, 4.6], [7, 1.6], [13.7, 4.6], [13.7, 5.6], [7, 4.4], [0.3, 5.6]], 'w', 'k', 0.4);
    gp(g, [[6.3, 0.3], [7.7, 0.3], [7.6, 4.4], [6.4, 4.4]], 'm');
    ge(g, 7, 4.2, 1, 0.9, 'm');
  });
  const enemySide = () => spr('eside', 18, 7, (g) => {
    gp(g, [[0.4, 3], [2.6, 3], [1.4, 0.2], [0.4, 0.2]], 'm', 'k');
    gp(g, [[0, 3.2], [3, 2.6], [12, 2.4], [17.6, 3.6], [12, 4.8], [2, 5], [0, 4.4]], 'w', 'k', 0.45);
    gp(g, [[5, 4], [9.5, 4], [6.6, 6.8], [4.4, 6.8]], 'l', 'k', 0.3);
  });
  const seeker = () => spr('seek', 16, 4, (g) => {
    gp(g, [[0, 1.2], [3, 1.2], [3, 2.8], [0, 2.8]], 'o');
    gp(g, [[3, 1.1], [13, 1.1], [15.8, 2], [13, 2.9], [3, 2.9]], 'w', 'k', 0.3);
    gp(g, [[3, 1.1], [5, 0], [6, 1.1]], 'w'); gp(g, [[3, 2.9], [5, 4], [6, 2.9]], 'w');
  });
  /* tank facing left */
  const tankSpr = () => spr('tank', 16, 10, (g) => {
    gp(g, [[1, 6], [15, 6], [14, 9.6], [2, 9.6]], 'k');
    gp(g, [[0.6, 3.6], [15.4, 3.6], [15.4, 6.6], [0.6, 6.6]], 'y', 'k', 0.4);
    gp(g, [[5, 1], [11, 1], [12, 3.8], [4.6, 3.8]], 'O', 'k', 0.4);
    gp(g, [[0, 1.8], [5.5, 1.8], [5.5, 2.6], [0, 2.6]], 'k');
    for (let i = 0; i < 5; i++) ge(g, 3 + i * 2.5, 8, 0.8, 0.8, 'd');
  });
  const robotSpr = (hit) => spr('robot' + hit, 18, 18, (g) => {
    const b = hit ? 'w' : 'o';
    gp(g, [[2, 14], [16, 14], [16, 17.6], [2, 17.6]], 'k');
    gp(g, [[1, 4], [17, 4], [16, 14.4], [2, 14.4]], b, 'k', 0.5);
    gp(g, [[4, 0.6], [14, 0.6], [14, 4.4], [4, 4.4]], b, 'k', 0.5);
    gp(g, [[5, 1.8], [13, 1.8], [13, 3.2], [5, 3.2]], 'k');
    gp(g, [[4, 7], [14, 7], [14, 11], [4, 11]], 'k');
    gp(g, [[6, 8], [12, 8], [12, 10], [6, 10]], hit ? 'w' : 'O');
    ge(g, 0.8, 9, 1.2, 2.4, 'k'); ge(g, 17.2, 9, 1.2, 2.4, 'k');
  });
  const figure = (k) => spr('fig' + k, 6, 10, (g) => {
    g.strokeStyle = col(k); g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(3, 3); g.lineTo(3, 6.5); g.lineTo(1.4, 9.6); g.moveTo(3, 6.5); g.lineTo(4.6, 9.6);
    g.moveTo(0.6, 4); g.lineTo(5.4, 4); g.stroke();
    ge(g, 3, 1.5, 1.3, 1.3, k);
  });
  const station = () => spr('station', 14, 7, (g) => {
    gp(g, [[0, 1], [3, 1], [3, 6], [0, 6]], 'w'); gp(g, [[11, 1], [14, 1], [14, 6], [11, 6]], 'w');
    gp(g, [[3, 3], [11, 3], [11, 4], [3, 4]], 'w'); ge(g, 7, 3.5, 1.8, 1.8, 'w');
  });

  function planeIcon(x, y, k) {
    poly([[x + 3, y], [x + 4, y + 3], [x + 7, y + 6], [x + 4, y + 5.4], [x + 3, y + 7], [x + 2, y + 5.4], [x - 1, y + 6], [x + 2, y + 3]], k);
  }

  /* explosions */
  function Booms() { this.l = []; }
  Booms.prototype.add = function (x, y, s, sc) {
    const d = [];
    for (let i = 0; i < 8 * (s || 1); i++) d.push({ x: 0, y: 0, vx: rnd(-40, 40) * (s || 1), vy: rnd(-55, -5) * (s || 1) });
    this.l.push({ x, y, s: s || 1, t: 0, d, sc: sc || 0 });
  };
  Booms.prototype.update = function (dt) {
    for (const b of this.l) { b.t += dt; b.x -= b.sc * dt; for (const p of b.d) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; } }
    this.l = this.l.filter((b) => b.t < 1);
  };
  Booms.prototype.draw = function () {
    for (const b of this.l) {
      if (b.t < 0.6) {
        const r = Math.min(1, b.t / 0.18) * 6 * b.s * (b.t > 0.4 ? 0.6 : 1);
        ell(b.x, b.y, r * 1.2, r, b.t < 0.12 ? 'w' : b.t < 0.3 ? 'y' : b.t < 0.45 ? 'o' : 'r');
      }
      for (const p of b.d) rect(b.x + p.x, b.y + p.y, 1, 1, b.t < 0.5 ? 'y' : 'k');
    }
  };

  /* geography for the SAC overview (playfield coordinates) */
  const LAND = [
    ['l', [[0, 80], [30, 77], [60, 75], [86, 74], [100, 77], [94, 83], [80, 87], [60, 89], [40, 87], [20, 89], [0, 91]]],
    ['l', [[102, 73], [126, 72], [129, 77], [116, 82], [105, 80]]],
    ['y', [[0, 91], [20, 89], [40, 87], [60, 89], [80, 87], [84, 92], [77, 98], [71, 103], [67, 109], [63, 114], [59, 121], [52, 118], [44, 119], [36, 125], [28, 121], [18, 115], [8, 113], [0, 111]]],
    ['y', [[56, 118], [63, 114], [65, 124], [61, 129]]],
    ['l', [[0, 111], [8, 113], [18, 115], [28, 121], [36, 125], [40, 133], [48, 139], [44, 143], [34, 137], [22, 129], [10, 123], [0, 119]]],
    ['l', [[46, 149], [60, 145], [80, 147], [97, 153], [101, 160], [50, 160], [44, 155]]],
    ['l', [[150, 81], [156, 79], [158, 87], [152, 89]]],
    ['l', [[178, 72], [196, 70], [199, 76], [189, 81], [181, 79]]],
    ['l', [[160, 82], [168, 76], [186, 74], [206, 75], [208, 83], [201, 89], [197, 98], [191, 104], [183, 100], [177, 107], [169, 104], [161, 98], [154, 96], [150, 90]]],
    ['l', [[138, 113], [160, 109], [180, 111], [200, 107], [220, 111], [240, 113], [262, 121], [276, 131], [286, 146], [291, 160], [150, 160], [140, 149], [134, 131]]],
    ['l', [[220, 111], [240, 105], [260, 101], [290, 99], [320, 97], [320, 160], [300, 160], [291, 141], [276, 125], [256, 115]]],
    ['m', [[206, 75], [230, 73], [260, 74], [290, 73], [320, 75], [320, 101], [300, 99], [290, 105], [270, 103], [256, 109], [243, 113], [231, 105], [219, 99], [206, 97], [201, 89], [208, 83]]],
  ];
  const horizon = (x) => 70 + 10 * Math.pow((x - 175) / 175, 2);
  const US = { SEATTLE: [7, 94], 'LOS ANGELES': [9, 107], DENVER: [25, 99], DALLAS: [35, 113], CHICAGO: [50, 94], ATLANTA: [53, 107], 'NEW YORK': [71, 94], WASHINGTON: [67, 100], MIAMI: [60, 123] };
  const SITES = { LENINGRAD: [229, 79], MINSK: [219, 90], KIEV: [229, 101], SARATOV: [263, 96], MOSCOW: [241, 86] };
  const STATION = [175, 16];

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
    this.lvl = ROM.store.get('classicLevel', 0);
    this.hi = ROM.store.get('hiClassic', 0);
    this.score = 0;
    this.invert = ROM.store.get('classicArcade', false);
    this.stars = [];
    for (let i = 0; i < 70; i++) this.stars.push([Math.random() * W, Math.random() * 70, Math.random() < 0.3]);
    this.fkeys = {};
    this.scr = 'title';
    this.seq = null;
    this.maxImpacts = 3;
    try { if (document.fonts) document.fonts.load(FONT); } catch (e) { /* ignore */ }
    this.hold = opts.level === 'title' || opts.level === 'sac';
    if (opts.level && opts.level !== 'title') this.jump(opts.level, opts.mission || 0);
    else A.music('title');
  }
  ROM.Classic = Classic;
  const K = Classic.prototype;
  K.classic = true;
  K.name = 'RAID OVER MOSCOW — 1984';
  K.hint = '';

  /* F-keys: F1/F3/F5 select the level, F7 opens the hangar doors */
  window.addEventListener('keydown', (e) => {
    const st = ROM.Game && ROM.Game.stage;
    if (!st || !st.classic) return;
    if (['F1', 'F3', 'F5', 'F7'].includes(e.code)) { e.preventDefault(); st.fkeys[e.code] = true; }
    if (e.code === 'KeyC' && st.scr === 'title') st.fkeys.C = true;
  });
  K.fkey = function (k) { const v = this.fkeys[k]; this.fkeys[k] = false; return !!v; };

  K.newGame = function () {
    this.score = 0;
    this.station = [8, 7, 6][this.lvl];
    this.out = 0;
    this.impacts = 0;
    this.hits = [];
    this.alive = { LENINGRAD: 1, MINSK: 1, KIEV: 1, SARATOV: 1 };
    this.final = false;
    this.launch = null;
    this.men = 0;
    this.discs = 0;
    this.robotsLeft = undefined; this.robotHits = 0;
    this.newLaunch();
    this.go(new Sac(this, 'alert'));
    this.scr = 'play';
    A.stopMusic();
  };
  K.jump = function (lv, m) { // demo / screenshot entry points
    this.newGame();
    const names = Object.keys(this.alive);
    this.launch.site = names[m % 4] || 'SARATOV';
    if (lv === 'sac') return;
    if (lv === 'nav') { this.station--; this.out = 1; this.go(new Sac(this, 'nav')); return; }
    if (lv === 'hangar') { this.go(new Hangar(this)); return; }
    if (lv === 'run') { this.station--; this.go(new Run(this)); return; }
    if (lv === 'silo') { this.station--; this.go(new Silo(this)); return; }
    this.final = true; this.launch = null;
    for (const s of names) this.alive[s] = 0;
    this.men = 6;
    if (lv === 'mrun') this.go(new Run(this));
    else if (lv === 'center') this.go(new Center(this));
    else if (lv === 'reactor') { this.discs = 7; this.go(new Reactor(this)); }
    else if (lv === 'end') this.go(new Ending(this, true, 5));
  };
  K.go = function (s) { this.seq = s; A.engine(false); };
  K.addScore = function (n) {
    this.score += n;
    if (this.score > this.hi) { this.hi = this.score; ROM.store.set('hiClassic', this.hi); }
  };
  K.siteName = function () { return this.final ? 'MOSCOW' : this.launch ? this.launch.site : ''; };
  K.newLaunch = function () {
    const sites = Object.keys(this.alive).filter((s) => this.alive[s]);
    const targets = Object.keys(US).filter((t) => !this.hits.includes(t));
    const t0 = [420, 330, 270][this.lvl] - (4 - sites.length) * 20;
    this.launch = { site: sites[(Math.random() * sites.length) | 0], target: targets[(Math.random() * targets.length) | 0], t: t0, t0 };
  };
  K.tickLaunch = function (dt) {
    if (!this.launch || this.final || this.game.state === 'shot') return;
    this.launch.t -= dt;
    if (this.launch.t <= 0) this.impact();
  };
  K.impact = function () {
    const L = this.launch;
    this.hits.push(L.target);
    this.impacts++;
    A.sfx('bigboom');
    if (this.seq && this.seq.flying) this.out++; // the aircraft waits outside for the next attack
    if (this.impacts >= this.maxImpacts) { this.gameOver('THE U.S. HAS SUFFERED ' + this.impacts + ' NUCLEAR HITS'); return; }
    const site = L.site;
    this.newLaunch();
    this.launch.site = site; // the site is still operational and launches again
    this.go(new Sac(this, 'impact', L));
  };
  K.enterStation = function () {
    if (this.station > 0) { this.go(new Hangar(this)); return; }
    if (this.out > 0) { this.go(new Sac(this, 'nav')); return; }
    this.gameOver('YOUR SQUADRON HAS BEEN LOST');
  };
  K.hangarDone = function () { this.station--; this.out++; A.sfx('clear'); this.go(new Sac(this, 'nav')); };
  K.hangarCrash = function () {
    this.station--;
    if (this.station > 0) this.go(new Hangar(this));
    else if (this.out > 0) this.go(new Sac(this, 'nav'));
    else this.gameOver('YOUR SQUADRON HAS BEEN LOST');
  };
  K.navArrive = function () { this.out--; this.go(new Run(this)); };
  K.planeLost = function () {
    A.engine(false);
    if (this.out > 0) { this.out--; this.go(new Run(this, true)); return; } // a waiting aircraft takes over
    if (this.station > 0) { this.go(new Sac(this, this.final ? 'final' : 'alert')); return; }
    this.gameOver('YOUR SQUADRON HAS BEEN LOST');
  };
  K.extraPlane = function () { if (this.station + this.out < 8) this.station++; };
  K.siteDestroyed = function () {
    this.alive[this.launch.site] = 0;
    this.station = Math.min(9, this.station + this.out + 1); // every aircraft returns to the station
    this.out = 0;
    if (!Object.values(this.alive).some(Boolean)) {
      this.final = true;
      this.launch = null;
      this.go(new Sac(this, 'final'));
    } else {
      this.newLaunch();
      this.go(new Sac(this, 'alert'));
    }
  };
  K.runDone = function () {
    if (this.final) { this.men = Math.min(9, this.station + this.out + 1); this.go(new Center(this)); }
    else this.go(new Silo(this));
  };
  K.centerDone = function () { if (this.discs <= 0) this.discs = 7; this.go(new Reactor(this)); };
  K.gameOver = function (why) {
    if (this.scr === 'over') return;
    this.scr = 'over'; this.overWhy = why; this.overT = 0;
    A.engine(false); A.sfx('die');
  };

  K.onPause = function () {
    if (this.scr === 'title' || this.scr === 'over' || (this.seq && this.seq.isEnding)) { this.game.toModeSelect(); return true; }
    return false;
  };
  K.auto = function () {
    if (this.hold) return {}; // screenshot of a static screen
    if (this.scr === 'title') return { _fire: true, fire: true };
    if (this.scr === 'over') return {};
    return this.seq && this.seq.auto ? this.seq.auto() : {};
  };
  /* joystick forward = dive, back = climb (original); the Arcade option swaps it */
  K.dive = function (I) {
    const up = I.is('up'), down = I.is('down');
    return this.invert ? (up ? 1 : down ? -1 : 0) : (up ? -1 : down ? 1 : 0);
  };

  K.update = function (dt, I) {
    this.t += dt;
    if (this.scr === 'title') {
      const before = this.lvl;
      if (this.fkey('F1')) this.lvl = 0;
      if (this.fkey('F3')) this.lvl = 1;
      if (this.fkey('F5')) this.lvl = 2;
      if (I.hit('left')) this.lvl = Math.max(0, this.lvl - 1);
      if (I.hit('right')) this.lvl = Math.min(2, this.lvl + 1);
      if (this.lvl !== before) { ROM.store.set('classicLevel', this.lvl); A.sfx('select'); }
      if (this.fkey('C') || I.hit('down') || I.hit('up')) { this.invert = !this.invert; ROM.store.set('classicArcade', this.invert); A.sfx('select'); }
      if (this.t > 0.4 && (I.hit('fire') || I.hit('start'))) { A.sfx('select'); this.newGame(); }
      return;
    }
    if (this.scr === 'over') {
      this.overT += dt;
      if (this.overT > 1.5 && (I.hit('fire') || I.hit('start'))) { this.scr = 'title'; this.t = 0; A.music('title'); }
      return;
    }
    if (this.seq.timed !== false) this.tickLaunch(dt);
    if (this.scr === 'over') return;
    this.seq.update(dt, I);
  };

  K.draw = function (ctx) {
    c = this.cx;
    c.setTransform(BS, 0, 0, BS, 0, 0);
    c.imageSmoothingEnabled = true;
    rect(0, 0, W, H, 'k');
    if (this.scr === 'title') this.drawTitle();
    else if (this.scr === 'over') this.drawOver();
    else {
      c.save(); c.beginPath(); c.rect(0, 0, W, PF); c.clip();
      this.seq.draw();
      c.restore();
      rect(0, PF, W, H - PF, 'k');
      this.seq.hud();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.fillStyle = P.N;
    ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / (W + 40), ch / (H + 28));
    const dw = W * s, dh = H * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cv, Math.round((cw - dw) / 2), Math.round((ch - dh) / 2), Math.round(dw), Math.round(dh));
    ctx.restore();
  };

  K.aircraftRow = function (r, men) {
    text(men ? 'MEN' : 'AIRCRAFT', 0, row(r), 'y');
    if (men) {
      for (let i = 0; i < Math.min(8, this.men || 0); i++) blit(figure('w'), 70 + i * 13, row(r) + 4, { sc: 0.8 });
    } else {
      let i = 0;
      const active = this.seq && this.seq.flying ? 1 : 0;
      for (let j = 0; j < active && i < 10; j++, i++) planeIcon(68 + i * 12, row(r), 'w');
      for (let j = 0; j < this.out && i < 10; j++, i++) planeIcon(68 + i * 12, row(r), 'l');
      for (let j = 0; j < this.station && i < 10; j++, i++) planeIcon(68 + i * 12, row(r), 'o');
    }
    text('SCORE:', 208, row(r), 'C');
    text(pad(this.score, 6), 320, row(r), 'w', 'right');
  };
  K.impactRow = function (r) {
    text('TIME TO IMPACT:', 0, row(r), 'G');
    if (this.launch && !this.final) text(clock(this.launch.t, true), 128, row(r), this.launch.t < 30 && blink(this.t, 3) ? 'R' : 'w');
    else text('--:--.-', 128, row(r), 'w');
  };

  /* ---------- title (after the C64 menu screen) ---------- */
  K.drawTitle = function () {
    const sx = 160, sy = 20;
    c.save(); c.translate(sx, sy); c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5 : 12; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = P.O; c.fill(); c.strokeStyle = P.n; c.lineWidth = 1; c.stroke(); c.restore();
    const logo = (s, y, face, top, side, size) => {
      c.font = size + 'px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'top';
      for (let i = 5; i >= 1; i--) { c.fillStyle = col(side); c.fillText(s, 160 + i * 0.7, y + i * 0.9); }
      c.fillStyle = col(top); c.fillText(s, 160, y - 0.6);
      c.fillStyle = col(face); c.fillText(s, 160, y);
    };
    logo('RAID OVER', 40, 'L', 'w', 'b', 16);
    logo('MOSCOW', 60, 'y', 'w', 'n', 22);
    text('HIGH SCORE', 96, 98, 'C', 'center'); text('YOUR SCORE', 224, 98, 'C', 'center');
    text(pad(this.hi, 6), 96, 107, 'w', 'center'); text(pad(this.score, 6), 224, 107, 'w', 'center');
    [['F1', 'BEGINNER', 'G'], ['F3', 'ADVANCED', 'O'], ['F5', 'SUICIDAL', 'R']].forEach(([k, n, cl], i) => {
      const x = 14 + i * 102;
      rect(x, 121, 18, 10, i === this.lvl ? 'y' : 'D');
      text(k, x + 2, 122, 'k');
      text(n, x + 21, 122, i === this.lvl ? cl : 'D');
    });
    text('JOYSTICK: ' + (this.invert ? 'ARCADE (UP=CLIMB)' : 'PILOT (UP=DIVE)'), 160, 138, 'l', 'center');
    text('A TRIBUTE TO ACCESS SOFTWARE 1984', 160, 152, 'D', 'center');
    if (blink(this.t, 1.4)) text('PRESS FIRE TO BEGIN', 160, 172, 'w', 'center');
    text('C = CONTROLS   ESC = MENU', 160, 188, 'D', 'center');
  };
  K.drawOver = function () {
    for (const [x, y] of this.stars) rect(x, y * 2, 1, 1, 'l');
    c.font = '16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = P.R; c.fillText('GAME OVER', 160, 50);
    text(this.overWhy, 160, 84, 'w', 'center');
    text('SCORE ' + pad(this.score, 6), 160, 104, 'y', 'center');
    text('HIGH  ' + pad(this.hi, 6), 160, 116, 'C', 'center');
    if (this.overT > 1.5 && blink(this.t, 1.4)) text('PRESS FIRE', 160, 150, 'w', 'center');
  };

  /* =====================================================================
     SEQUENCE I — SAC headquarters: orbital overview
     ===================================================================== */
  function Sac(k, mode, hit) {
    this.k = k; this.mode = mode; this.t = 0; this.hit = hit;
    if (mode === 'nav') this.dot = { x: STATION[0], y: STATION[1] + 8 };
  }
  Sac.prototype.target = function () { return SITES[this.k.siteName()]; };
  Sac.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    if (this.mode === 'impact') {
      if (this.t > 4) {
        this.mode = k.out > 0 ? 'nav' : 'alert'; this.t = 0;
        if (this.mode === 'nav') this.dot = { x: STATION[0], y: STATION[1] + 8 };
      }
      return;
    }
    if (this.mode === 'alert' || this.mode === 'final') {
      if (this.t > 0.6 && (I.hit('fire') || I.hit('start'))) { A.sfx('door'); k.enterStation(); }
      return;
    }
    // guide the flashing aircraft to the launch site
    const d = this.dot, T = this.target();
    const sp = 42;
    if (I.is('left')) d.x -= sp * dt;
    if (I.is('right')) d.x += sp * dt;
    if (I.is('up')) d.y -= sp * dt;
    if (I.is('down')) d.y += sp * dt;
    d.x = clamp(d.x, 2, 318); d.y = clamp(d.y, 4, 156);
    if (Math.hypot(d.x - T[0], d.y - T[1]) < 6) { A.sfx('alarm'); k.navArrive(); return; }
    const nearStation = Math.hypot(d.x - STATION[0], d.y - STATION[1]) < 26;
    if (nearStation && k.station > 0 && this.t > 0.5 && (I.hit('fire') || I.hit('bomb'))) { A.sfx('door'); k.go(new Hangar(k)); }
  };
  Sac.prototype.auto = function () {
    if (this.mode !== 'nav') return { _fire: true };
    const T = this.target(), d = this.dot;
    return { left: d.x > T[0] + 1, right: d.x < T[0] - 1, up: d.y > T[1] + 1, down: d.y < T[1] - 1 };
  };
  Sac.prototype.draw = function () {
    const k = this.k;
    for (const [x, y, br] of k.stars) rect(x, y, 1, 1, br ? 'w' : 'D');
    const ocean = [];
    for (let x = 0; x <= 320; x += 8) ocean.push([x, horizon(x)]);
    ocean.push([320, 160], [0, 160]);
    poly(ocean, 'B');
    for (const [k2, pts] of LAND) poly(pts, k2);
    for (let x = 6; x < 320; x += 9) if ((x < 120 || (x > 150 && x < 260)) && (x * 7) % 5 < 3) rect(x, horizon(x) - 1.5, 6, 2, 'w');
    for (const name in US) {
      const [x, y] = US[name];
      const hitC = k.hits.includes(name);
      poly([[x, y - 2], [x + 2.5, y + 1.5], [x - 2.5, y + 1.5]], hitC ? (blink(this.t, 3) ? 'R' : 'r') : 'k');
    }
    for (const name in SITES) {
      const [x, y] = SITES[name];
      const active = name === k.siteName();
      const dead = name !== 'MOSCOW' && !k.alive[name];
      if (dead) { line(x - 2, y - 2, x + 2, y + 2, 'k'); line(x + 2, y - 2, x - 2, y + 2, 'k'); continue; }
      poly([[x, y - 2], [x + 3, y + 1.5], [x - 3, y + 1.5]], active ? (blink(this.t, 4) ? 'w' : 'l') : 'k');
    }
    blit(station(), STATION[0], STATION[1]);
    const L = this.hit || k.launch;
    if (L && !k.final) {
      const f = this.mode === 'impact' ? Math.min(1, 0.7 + this.t / 3) : 1 - L.t / L.t0;
      const [x0, y0] = SITES[L.site], [x1, y1] = US[L.target];
      const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f - Math.sin(Math.PI * f) * 58;
      for (let i = 0; i < 4; i++) rect(x + (i % 2) * 2 - 1, y + (i >> 1) * 2 - 1, 1, 1, 'w');
      if (this.mode === 'impact' && this.t > 0.9) {
        const r = Math.min(9, (this.t - 0.9) * 10);
        ell(x1, y1, r, r * 0.6, blink(this.t, 8) ? 'w' : 'y');
      }
    }
    if (this.dot && blink(this.t, 4)) rect(this.dot.x - 1, this.dot.y - 1, 3, 3, 'w');
    if (this.mode === 'alert' || this.mode === 'final') { if (blink(this.t, 1.5)) text('PRESS FIRE TO ENTER STATION', 160, 34, 'w', 'center'); }
    else if (this.mode === 'nav') {
      text('GUIDE AIRCRAFT TO ' + k.siteName(), 160, 32, 'G', 'center');
      if (k.station > 0 && Math.hypot(this.dot.x - STATION[0], this.dot.y - STATION[1]) < 26) text('FIRE: TAKE OUT ANOTHER PLANE', 160, 44, 'l', 'center');
    }
  };
  Sac.prototype.hud = function () {
    const k = this.k;
    if (this.mode === 'impact') {
      text('CONFIRMATION:', 0, row(0), 'G'); text('NUCLEAR DETONATION', 128, row(0), blink(this.t, 3) ? 'R' : 'r');
      text('LAUNCH SITE:', 0, row(1), 'G'); text(this.hit.site, 128, row(1), 'o');
      text('TARGET HIT:', 0, row(2), 'G'); text(this.hit.target, 128, row(2), 'y');
      text('U.S. CITIES HIT:', 0, row(3), 'G'); text(k.impacts + ' OF ' + k.maxImpacts, 136, row(3), 'w');
    } else if (k.final) {
      text('CONFIRMATION:', 0, row(0), 'G'); text('SITES DESTROYED', 128, row(0), 'G');
      text('NEXT TARGET:', 0, row(1), 'G'); text('MOSCOW', 128, row(1), 'o');
      text('OBJECTIVE:', 0, row(2), 'G'); text('DEFENSE CENTER', 128, row(2), 'y');
      k.impactRow(3);
    } else {
      text('CONFIRMATION:', 0, row(0), 'G'); text('ENEMY LAUNCH DETECTED', 128, row(0), 'G');
      text('LAUNCH SITE:', 0, row(1), 'G'); text(k.launch.site, 128, row(1), 'o');
      text('TARGET:', 0, row(2), 'G'); text(k.launch.target, 128, row(2), 'y');
      k.impactRow(3);
    }
    k.aircraftRow(4);
  };

  /* =====================================================================
     SEQUENCE II — the space station hangar (semi-weightless flight)
     ===================================================================== */
  const HW = 250, HL = 400, WH = 180, DW = 44, DH = 64;
  const hp = (X, Y, Z) => { const s = 300 / (Y + 300); return [160 + X * s, -63 + 223 * s - Z * s, s]; };
  const SLOTS = [[205, 60], [205, 85], [180, 135], [180, 160], [150, 215], [150, 240], [122, 300], [122, 325]];
  function Hangar(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.X = 0; this.Y = 130; this.Z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.th = 0;
    this.door = 0; this.doorT = 0;
    this.state = 'intro';
  }
  Hangar.prototype.update = function (dt, I) {
    this.t += dt;
    this.booms.update(dt);
    const k = this.k;
    if (this.doorT > 0) { this.doorT -= dt; this.door = Math.min(1, this.door + dt * 1.6); } else this.door = Math.max(0, this.door - dt * 1.2);
    if (this.state === 'intro') { if (this.t > 1.8) this.state = 'fly'; return; }
    if (this.state === 'crash') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.hangarCrash(); } return; }
    if (this.state === 'out') { this.Y += 140 * dt; this.ct += dt; if (this.ct > 0.8 && !this.rep) { this.rep = true; k.hangarDone(); } return; }
    if (I.is('left')) this.th -= 2.4 * dt;
    if (I.is('right')) this.th += 2.4 * dt;
    const eng = I.is('up'), thr = I.is('fire');
    if (eng) { this.vx += Math.sin(this.th) * 42 * dt; this.vy += Math.cos(this.th) * 42 * dt; }
    if (thr) this.vz += 32 * dt;
    this.vz -= 9 * dt;
    A.engine(eng || thr, eng ? 1.4 : 1);
    if ((I.hit('bomb') || k.fkey('F7')) && this.Z > 0.5) { this.doorT = 7 - k.lvl * 1.5; A.sfx('door'); }
    this.X += this.vx * dt; this.Y += this.vy * dt; this.Z += this.vz * dt;
    const god = k.game.god;
    if (this.Z <= 0) {
      if (this.vz < -16 && !god) return this.crash('HIT THE DECK TOO HARD');
      this.Z = 0; this.vz = 0;
      this.vx *= 1 - 1.5 * dt; this.vy *= 1 - 1.5 * dt;
    }
    if (!god) {
      if (Math.abs(this.X) > HW - 10 || this.Y < 6) return this.crash('HIT THE HANGAR WALL');
      if (this.Z > WH - 8) return this.crash('HIT THE CEILING');
      if (this.Y > HL - 8 && !(this.door > 0.9 && Math.abs(this.X) < DW - 10 && this.Z < DH - 8)) return this.crash(this.door > 0.9 ? 'MISSED THE DOORWAY' : 'HIT THE HANGAR DOORS');
    }
    if (this.Y > HL + 20) { this.state = 'out'; this.ct = 0; A.engine(false); }
  };
  Hangar.prototype.crash = function (why) {
    this.state = 'crash'; this.ct = 0; this.why = why;
    const [x, y] = hp(this.X, this.Y, this.Z);
    this.booms.add(x, y, 2.2);
    A.sfx('bigboom'); A.engine(false);
  };
  Hangar.prototype.auto = function () {
    const a = {};
    if (this.state !== 'fly') return a;
    a.fire = this.Z < 24 && this.vz < 6;
    if (this.Z > 2 && this.doorT <= 0 && this.Y > 160) a._bomb = true;
    const want = Math.atan2(-this.X - this.vx * 1.5, HL + 60 - this.Y);
    let d = want - this.th;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (d > 0.06) a.right = true; else if (d < -0.06) a.left = true;
    const along = this.vx * Math.sin(this.th) + this.vy * Math.cos(this.th);
    a.up = Math.abs(d) < 0.3 && along < (this.door > 0.8 || this.Y < 250 ? 60 : 10) && this.Z > 6;
    return a;
  };
  Hangar.prototype.draw = function () {
    const k = this.k;
    rect(0, 0, W, PF, 'w');
    const q = (a, b, cc, d, kk) => poly([hp(...a), hp(...b), hp(...cc), hp(...d)], kk);
    q([-HW, 0, WH], [HW, 0, WH], [HW, HL, WH], [-HW, HL, WH], 'N');
    q([-HW, 0, 0], [-HW, HL, 0], [-HW, HL, WH], [-HW, 0, WH], 'w');
    q([HW, 0, 0], [HW, HL, 0], [HW, HL, WH], [HW, 0, WH], 'w');
    q([-HW, HL, 0], [HW, HL, 0], [HW, HL, WH], [-HW, HL, WH], 'w');
    for (const side of [-1, 1]) {
      for (let Y = 0; Y <= HL; Y += 100) { const a = hp(side * HW, Y, 0), b = hp(side * HW, Y, WH); line(a[0], a[1], b[0], b[1], 'N', 6 * a[2]); }
      const a = hp(side * HW, 0, 140), b = hp(side * HW, HL, 140); line(a[0], a[1], b[0], b[1], 'N', 5);
      for (let Y = 20; Y < HL; Y += 50) { const p = hp(side * HW, Y, 140); rect(p[0] - 1, p[1] - 1, 2.5 * p[2] + 1, 1.5, 'w'); }
    }
    for (let X = -HW; X <= HW; X += 100) { const a = hp(X, HL, 0), b = hp(X, HL, WH); line(a[0], a[1], b[0], b[1], 'N', 6 * a[2]); }
    { const a = hp(-HW, HL, 140), b = hp(HW, HL, 140); line(a[0], a[1], b[0], b[1], 'N', 4); }
    // doorway into space; the door leaves slide apart
    const d0 = hp(-DW, HL, 0), d1 = hp(DW, HL, DH);
    rect(d0[0], d1[1], d1[0] - d0[0], d0[1] - d1[1], 'k');
    for (let i = 0; i < 6; i++) rect(d0[0] + ((i * 37) % (d1[0] - d0[0])), d1[1] + ((i * 23) % (d0[1] - d1[1])), 1, 1, 'w');
    const dw = ((d1[0] - d0[0]) / 2) * (1 - this.door);
    rect(d0[0], d1[1], dw, d0[1] - d1[1], 'l'); rect(d1[0] - dw, d1[1], dw, d0[1] - d1[1], 'l');
    if (this.doorT > 0 && this.doorT < 2 && blink(this.t, 6)) rect(d0[0], d1[1] - 3, d1[0] - d0[0], 2, 'R');
    // floor and markings
    q([-HW, 0, 0], [HW, 0, 0], [HW, HL, 0], [-HW, HL, 0], 'd');
    for (let X = -HW + 10; X < HW; X += 34) { const a = hp(X, 22, 0); rect(a[0], a[1], 6 * a[2], 1.5, 'y'); }
    const pad0 = [[-36, 105], [36, 105], [36, 160], [-36, 160]].map(([x, y]) => hp(x, y, 0));
    c.setLineDash([3, 2]);
    for (let i = 0; i < 4; i++) { const a = pad0[i], b = pad0[(i + 1) % 4]; line(a[0], a[1], b[0], b[1], 'w', 1); }
    c.setLineDash([]);
    { const a = hp(-8, 132, 0), b = hp(8, 132, 0), e = hp(0, 125, 0), f = hp(0, 139, 0); line(a[0], a[1], b[0], b[1], 'w'); line(e[0], e[1], f[0], f[1], 'w'); }
    for (let Y = 185; Y < HL - 10; Y += 32) { const a = hp(0, Y, 0), b = hp(0, Y + 14, 0); line(a[0], a[1], b[0], b[1], 'w', 2.2 * a[2]); }
    // parked fighters
    for (let i = 0; i < Math.min(8, Math.max(0, k.station - 1)); i++) {
      const [X, Y] = SLOTS[i];
      const [x, y, s] = hp(X, Y, 0);
      ell(x + 1, y + 1, 6 * s * 1.6, 2.5 * s * 1.6, 'k');
      blit(topPlane('y'), x, y - 2 * s, { rot: -Math.PI / 2, sc: s * 1.25 });
    }
    if (this.state === 'intro') {
      const f = Math.min(1, this.t / 1.5);
      const [x, y, s] = hp(-170 + 160 * f, 60 + 60 * f, 0);
      blit(figure('k'), x, y - 4 * s, { sc: s * 1.2 });
    }
    if (this.state !== 'crash') {
      const [sx, sy, ss] = hp(this.X, this.Y, 0);
      ell(sx, sy, 7 * ss * 1.4, 2.6 * ss * 1.4, 'k');
      const [x, y, s] = hp(this.X, this.Y, this.Z);
      blit(topPlane('y'), x, y - 3 * s, { rot: this.th, sc: s * 1.35 });
      if (this.state === 'fly' && this.vz > 0 && blink(this.t, 14)) ell(x, y + 3 * s, 2 * s, 1 * s, 'o');
    }
    this.booms.draw();
    if (this.state === 'intro') text('PILOT SCRAMBLING...', 160, 8, 'k', 'center');
    else if (this.state === 'fly' && this.Z > 0.5 && this.door < 0.1 && blink(this.t, 1.5)) text('F7 / X: OPEN HANGAR DOORS', 160, 8, 'k', 'center');
    else if (this.state === 'fly' && this.Z <= 0.1 && this.t < 8) text('FIRE:LIFT  UP:ENGINE  L/R:ROTATE', 160, 8, 'k', 'center');
    if (this.state === 'crash') text(this.why, 160, 8, 'r', 'center');
  };
  Hangar.prototype.hud = function () {
    const k = this.k;
    text('VELOCITY X', 0, row(0), 'G'); text(sgn(this.vx * 0.6, 2) + ' K/H', 88, row(0), 'w');
    text('Y', 72, row(1), 'G'); text(sgn(this.vy * 0.6, 2) + ' K/H', 88, row(1), 'w');
    text('VERT', 48, row(2), 'G'); text(sgn(this.vz * 0.6, 2) + ' K/H', 88, row(2), 'w');
    text('COORDINATES X', 168, row(0), 'o'); text(sgn(this.X / 2, 3) + ' M', 320, row(0), 'w', 'right');
    text('Y', 264, row(1), 'o'); text(sgn(this.Y / 2, 3) + ' M', 320, row(1), 'w', 'right');
    text('ALTITUDE', 200, row(2), 'o'); text(pad(this.Z / 2, 2) + ' M', 320, row(2), 'w', 'right');
    k.impactRow(3);
    k.aircraftRow(4);
  };

  /* =====================================================================
     SEQUENCE III — attack run through enemy territory
     ===================================================================== */
  const PX = 70; // plane screen x
  function Run(k, relief) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.flying = true;
    this.final = k.final;
    this.L = this.final ? 3300 : 2500 + (4 - Object.values(k.alive).filter(Boolean).length) * 150;
    this.wx = 0; this.speed = 56;
    this.gy = 80; this.A = 6; this.fireT = 0;
    this.bul = []; this.seek = []; this.jets = []; this.shells = [];
    this.seekT = 4; this.jetT = 8; this.radar = 0;
    this.state = 'fly'; this.inv = relief ? 1.5 : 0;
    this.gen();
  }
  Run.prototype.gen = function () {
    const r = ROM.RNG(77 + this.k.siteName().length * 131 + (this.final ? 999 : 0));
    const o = (this.objs = []);
    for (let x = 260; x < this.L; x += r.range(16, 34)) {
      const y = r.range(12, 150);
      const p = r();
      if (p < 0.24) o.push({ k: 'pillar', x, y, h: 14, w: 8, d: 6, hp: 99 });
      else if (p < 0.40) o.push({ k: 'tank', x, y, h: 3, w: 18, d: 8, hp: 2, sc: 150 });
      else if (p < 0.62) o.push({ k: 'trees', x, y, h: 6, w: 16, d: 9, hp: 99, n: r.int(1, 3), s: r() * 9 });
      else if (p < 0.76) o.push({ k: 'armor', x, y, h: 2.5, w: 16, d: 7, hp: 1, sc: 250, ft: r.range(1, 3), vy: r.range(-8, 8) });
      else if (p < 0.82) o.push({ k: 'bldg', x, y: clamp(y, 24, 140), h: 12, w: 36, d: 16, hp: 4, sc: 500 });
      else x += 10;
    }
    if (this.final) for (let x = 600; x < this.L; x += r.range(200, 420)) o.push({ k: 'bldg', x, y: r.range(30, 130), h: 12, w: 36, d: 16, hp: 4, sc: 500 });
  };
  Run.prototype.sx = function (o) { return o.x - this.wx; };
  Run.prototype.die = function (why) {
    if (this.k.game.god || this.inv > 0 || this.state !== 'fly') return;
    this.state = 'dead'; this.ct = 0; this.why = why;
    this.booms.add(PX + 10, this.gy - this.A * 2.2 - 4, 2);
    A.sfx('bigboom'); A.engine(false);
  };
  Run.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    const live = this.state === 'fly';
    this.wx += this.speed * (live ? 1 : 0.3) * dt;
    this.booms.update(dt);
    if (this.state === 'dead') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.planeLost(); } }
    if (this.state === 'arrive') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.addScore(1000); k.runDone(); } return; }
    if (live) {
      this.inv = Math.max(0, this.inv - dt);
      if (I.is('left')) this.gy -= 46 * dt;
      if (I.is('right')) this.gy += 46 * dt;
      this.gy = clamp(this.gy, 12, 152);
      this.A = clamp(this.A + k.dive(I) * 9 * dt, k.lvl === 0 ? 1 : 0, 24);
      A.engine(true, 1 + this.A / 30);
      if (this.A <= 0 && k.lvl > 0) this.die('CRASHED INTO THE GROUND');
      this.fireT -= dt;
      if (I.is('fire') && this.fireT <= 0) { this.fireT = 0.16; this.bul.push({ x: PX + 22, gy: this.gy, A: this.A }); A.sfx('shot'); }
      // flying above the radar floor brings more heat seekers from behind
      this.radar = this.A > 11 ? this.radar + dt : Math.max(0, this.radar - dt);
      this.seekT -= dt * (this.radar > 1.2 ? 2.5 : 1);
      if (this.seekT <= 0) {
        this.seekT = [7, 5.5, 4.5][k.lvl];
        this.seek.push({ x: -20, gy: this.gy + rnd(-10, 10), A: 5, v: 70 });
        A.sfx('missile');
      }
      this.jetT -= dt;
      if (this.jetT <= 0) { this.jetT = rnd(7, 11) - k.lvl; this.jets.push({ x: 330, gy: rnd(20, 140), A: rnd(6, 14), ft: 0.6, n: 2 }); }
      if (this.wx > this.L) { this.state = 'arrive'; this.ct = 0; A.sfx('clear'); }
    }
    for (const b of this.bul) b.x += 190 * dt;
    for (const s of this.seek) {
      s.x += s.v * dt;
      if (s.x < PX) s.gy += clamp(this.gy - s.gy, -1, 1) * 22 * dt;
    }
    for (const j of this.jets) {
      j.x -= (70 + this.speed) * dt;
      j.gy += clamp(this.gy - j.gy, -1, 1) * 14 * dt;
      j.ft -= dt;
      if (live && j.n > 0 && j.ft <= 0 && j.x > PX + 40) { j.n--; j.ft = 0.7; this.fireAt(j.x, j.gy, j.A, 125); }
    }
    for (const o of this.objs) {
      if (o.k !== 'armor' || o.hp <= 0) continue;
      const sx = this.sx(o);
      if (sx < -20 || sx > 330) continue;
      o.y = clamp(o.y + o.vy * dt, 14, 150);
      o.ft -= dt * (0.8 + k.lvl * 0.35);
      if (live && o.ft <= 0 && sx > PX + 30 && sx < PX + 230) { o.ft = rnd(1.8, 3); this.fireAt(sx, o.y, 2, 78); }
    }
    for (const s of this.shells) { s.x += s.vx * dt; s.gy += s.vy * dt; s.A += s.va * dt; s.life -= dt; }
    this.collide();
    this.bul = this.bul.filter((b) => !b.dead && b.x < 330);
    this.seek = this.seek.filter((s) => !s.dead && s.x < 340);
    this.jets = this.jets.filter((j) => !j.dead && j.x > -30);
    this.shells = this.shells.filter((s) => !s.dead && s.life > 0);
  };
  Run.prototype.fireAt = function (x, gy, a, sp) {
    const tx = PX + 10, d = Math.hypot(tx - x, this.gy - gy) || 1, tt = d / sp;
    this.shells.push({ x, gy, A: a, vx: (tx - x) / tt, vy: (this.gy - gy) / tt, va: (this.A - a) / tt, life: tt + 0.4 });
    A.sfx('enemyShot');
  };
  Run.prototype.collide = function () {
    const k = this.k;
    for (const b of this.bul) {
      for (const o of this.objs) {
        if (o.hp <= 0) continue;
        const sx = this.sx(o);
        if (b.x < sx - o.w / 2 || b.x > sx + o.w / 2 || Math.abs(b.gy - o.y) > o.d / 2 + 3 || b.A > o.h + 1) continue;
        b.dead = true;
        if (o.hp < 50) { o.hp--; if (o.hp <= 0) { k.addScore(o.sc); this.booms.add(sx, o.y - 4, o.k === 'bldg' ? 1.8 : 1, this.speed); A.sfx('boom'); } else A.sfx('clank'); }
        break;
      }
      for (const s of this.seek) if (!s.dead && s.x > PX + 20 && Math.abs(b.x - s.x - 8) < 9 && Math.abs(b.gy - s.gy) < 5) { s.dead = b.dead = true; k.addScore(200); this.booms.add(s.x + 8, s.gy - s.A * 2.2, 0.8); A.sfx('small'); }
      for (const j of this.jets) if (!j.dead && Math.abs(b.x - j.x) < 10 && Math.abs(b.gy - j.gy) < 6 && Math.abs(b.A - j.A) < 4) { j.dead = b.dead = true; k.addScore(300); this.booms.add(j.x, j.gy - j.A * 2.2, 1.2); A.sfx('boom'); }
    }
    if (this.state !== 'fly') return;
    for (const o of this.objs) {
      if (o.hp <= 0) continue;
      const sx = this.sx(o);
      if (sx + o.w / 2 < PX || sx - o.w / 2 > PX + 20 || Math.abs(this.gy - o.y) > o.d / 2 + 3) continue;
      if (this.A < o.h) this.die(o.k === 'pillar' ? 'HIT A TOWER' : 'CRASHED');
    }
    for (const s of this.seek) if (!s.dead && Math.abs(s.x + 8 - (PX + 10)) < 10 && Math.abs(s.gy - this.gy) < 6 && this.A > 2.6 && Math.abs(s.A - this.A) < 2.6) { s.dead = true; this.die('HEAT SEEKING MISSILE'); }
    for (const j of this.jets) if (!j.dead && Math.abs(j.x - PX - 10) < 12 && Math.abs(j.gy - this.gy) < 6 && Math.abs(j.A - this.A) < 4) { j.dead = true; this.die('MID-AIR COLLISION'); }
    for (const s of this.shells) if (Math.abs(s.x - PX - 10) < 8 && Math.abs(s.gy - this.gy) < 5 && Math.abs(s.A - this.A) < 3) { s.dead = true; this.die('SHOT DOWN'); }
  };
  Run.prototype.auto = function () {
    const a = { fire: true };
    const seekerBehind = this.seek.some((q) => q.x < PX + 4 && q.x > PX - 140);
    // score candidate lanes: obstacles (tall ones are impassable), incoming fire
    const lane = (gy) => {
      if (gy < 14 || gy > 150) return { cost: 1e9, need: 0 };
      let cost = Math.abs(gy - this.gy) * 0.05, need = 1.2;
      for (const o of this.objs) {
        if (o.hp <= 0) continue;
        const sx = this.sx(o);
        if (sx + o.w / 2 < PX - 4 || sx - o.w / 2 > PX + 64) continue;
        if (Math.abs(gy - o.y) > o.d / 2 + 7) continue;
        if (o.h > 8 || (seekerBehind && o.h > 2)) cost += 1000; else need = Math.max(need, o.h + 1.6);
      }
      for (const q of this.shells.concat(this.jets)) if (q.x > PX - 6 && q.x < PX + 80 && Math.abs(q.gy - gy) < 10) cost += 500;
      return { cost, need };
    };
    let best = null;
    for (const off of [0, -8, 8, -16, 16, -26, 26, -38, 38]) {
      const L = lane(this.gy + off);
      if (!best || L.cost < best.cost) best = Object.assign({ off }, L);
    }
    if (best.off < -2) a.left = true; else if (best.off > 2) a.right = true;
    const here = lane(this.gy);
    const need = Math.max(here.need, best.need);
    const diveIsUp = !this.k.invert;
    if (this.A > need + 0.5) { if (diveIsUp) a.up = true; else a.down = true; }
    else if (this.A < need) { if (diveIsUp) a.down = true; else a.up = true; }
    return a;
  };
  Run.prototype.drawObj = function (o) {
    const sx = this.sx(o), y = o.y;
    if (o.hp <= 0) { ell(sx, y, o.w / 2, o.d / 3, 'k'); return; }
    switch (o.k) {
      case 'pillar':
        poly([[sx + 2, y + 1], [sx + 9, y + 3], [sx + 6, y + 5], [sx - 1, y + 3]], 'k');
        rect(sx - 3, y - 22, 7, 23, 'y'); rect(sx + 2, y - 22, 2, 23, 'Y');
        ell(sx + 0.5, y - 22, 3.5, 1.4, 'O');
        break;
      case 'tank':
        ell(sx + 3, y + 1, 10, 4, 'k');
        ell(sx, y, 9, 3.8, 'b'); rect(sx - 9, y - 3, 18, 3, 'b'); ell(sx, y - 3, 9, 3.6, 'B'); ell(sx, y - 3, 6.6, 2.4, 'k');
        break;
      case 'trees':
        for (let i = 0; i < o.n; i++) {
          const ox = (i - (o.n - 1) / 2) * 7 + Math.sin(o.s + i) * 2, oy = Math.cos(o.s + i * 2) * 3;
          ell(sx + ox + 3, y + oy + 2, 5, 2, 'k');
          rect(sx + ox - 0.5, y + oy - 3, 1.5, 4, 'n');
          ell(sx + ox, y + oy - 7, 5, 4.4, 'g'); ell(sx + ox - 1.4, y + oy - 8, 2.2, 1.8, 'G');
        }
        break;
      case 'armor':
        ell(sx + 2, y + 2, 9, 2.6, 'k');
        blit(tankSpr(), sx, y - 3);
        break;
      case 'bldg': {
        poly([[sx + 18, y - 4], [sx + 28, y + 2], [sx + 28, y + 10], [sx - 10, y + 10], [sx - 18, y + 4]], 'k');
        rect(sx - 18, y - 18, 30, 22, 'o'); poly([[sx + 12, y - 18], [sx + 18, y - 22], [sx + 18, y], [sx + 12, y + 4]], 'n');
        poly([[sx - 18, y - 18], [sx - 12, y - 22], [sx + 18, y - 22], [sx + 12, y - 18]], 'O');
        for (let i = 0; i < 4; i++) rect(sx - 15 + i * 7, y - 12, 2.5, 5, 'k');
        for (const tx of [-14, -2, 9]) { rect(sx + tx, y - 27, 4, 8, 'o'); poly([[sx + tx, y - 27], [sx + tx + 2, y - 33], [sx + tx + 4, y - 27]], 'w'); }
        for (let i = 0; i < 3; i++) rect(sx - 15 + i * 9, y - 2, 4, 6, 'y');
        break;
      }
      default: break;
    }
  };
  Run.prototype.draw = function () {
    rect(0, 0, W, PF, 'd');
    for (let i = 0; i < 40; i++) { const x = ((i * 53 - this.wx) % 340 + 340) % 340 - 10, y = (i * 37) % 156; rect(x, y, 2, 1, 'D'); }
    const items = [];
    for (const o of this.objs) { const sx = this.sx(o); if (sx > -40 && sx < 360) items.push([o.y, () => this.drawObj(o)]); }
    if (this.state !== 'dead') items.push([this.gy, () => {
      const sw = Math.max(5, 11 - this.A * 0.25);
      ell(PX + 12, this.gy + 1, sw, 2, 'k');
      if (!(this.inv > 0 && blink(this.t, 10))) blit(sidePlane('y'), PX + 11, this.gy - this.A * 2.2 - 4);
    }]);
    for (const s of this.seek) items.push([s.gy, () => { ell(s.x + 8, s.gy + 1, 6, 1.4, 'k'); blit(seeker(), s.x + 8, s.gy - s.A * 2.2 - 2); }]);
    for (const j of this.jets) items.push([j.gy, () => { ell(j.x, j.gy + 1, 7, 1.6, 'k'); blit(enemySide(), j.x, j.gy - j.A * 2.2 - 3, { flip: true }); }]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, f] of items) f();
    for (const b of this.bul) rect(b.x, b.gy - b.A * 2.2 - 3, 4, 1, 'w');
    for (const s of this.shells) rect(s.x - 1, s.gy - s.A * 2.2 - 1, 2, 2, 'w');
    this.booms.draw();
    if (this.state === 'arrive') text('APPROACHING ' + (this.final ? 'MOSCOW' : 'LAUNCH SITE'), 160, 70, 'w', 'center');
    if (this.state === 'dead') text(this.why, 160, 70, 'R', 'center');
    if (this.state === 'fly' && this.radar > 0.5 && blink(this.t, 4)) text('RADAR CONTACT - FLY LOWER', 160, 4, 'R', 'center');
    else if (this.state === 'fly' && this.seek.some((q) => q.x < PX) && blink(this.t, 3)) text('MISSILE BEHIND YOU - GET LOW!', 160, 4, 'y', 'center');
  };
  Run.prototype.hud = function () {
    const k = this.k;
    text(k.siteName(), 0, row(0), 'o');
    text(pad(Math.max(0, (this.L - this.wx) / 10), 3) + ' KM', 320, row(0), 'D', 'right');
    text('ALTITUDE', 104, row(1), 'L'); text(pad(this.A, 2) + ' M', 184, row(1), this.A > 11 ? 'R' : 'w');
    k.impactRow(3);
    k.aircraftRow(4);
  };

  /* =====================================================================
     SEQUENCE IV — the missile silos (one control silo, four launch silos)
     ===================================================================== */
  const SILO_X = [28, 92, 160, 228, 292];
  const PY0 = 134; // plane screen y at zero altitude
  function Silo(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.flying = true;
    this.silos = SILO_X.map((x, i) => ({ x, center: i === 2, alive: true, wa: i === 2 ? 9 : 13 + (i % 2) * 3, ft: 2 + i * 0.7 }));
    this.x = 160; this.A = 4; this.rockets = []; this.erockets = []; this.jets = []; this.shots = [];
    this.fireT = 0; this.jetT = 6; this.state = 'fly'; this.inv = 1;
  }
  Silo.prototype.py = function () { return PY0 - this.A * 3; };
  Silo.prototype.aligned = function () {
    const tx = 4 - this.k.lvl, ta = 2 - this.k.lvl * 0.4;
    return this.silos.find((s) => s.alive && Math.abs(this.x - s.x) <= tx && Math.abs(this.A - s.wa) <= ta);
  };
  Silo.prototype.die = function (why) {
    if (this.k.game.god || this.inv > 0 || this.state !== 'fly') return;
    this.state = 'dead'; this.ct = 0; this.why = why;
    this.booms.add(this.x, this.py(), 2); A.sfx('bigboom'); A.engine(false);
  };
  Silo.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    this.booms.update(dt);
    const live = this.state === 'fly';
    if (this.state === 'dead') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.planeLost(); } return; }
    if (this.state === 'done') {
      this.ct += dt;
      if (Math.random() < dt * 6) { this.booms.add(160 + rnd(-30, 30), 22 + rnd(-8, 8), rnd(1, 2)); A.sfx('boom'); }
      if (this.ct > 2.6 && !this.rep) { this.rep = true; k.siteDestroyed(); }
      return;
    }
    this.inv = Math.max(0, this.inv - dt);
    if (I.is('left')) this.x -= 60 * dt;
    if (I.is('right')) this.x += 60 * dt;
    this.x = clamp(this.x, 10, 310);
    this.A = clamp(this.A + k.dive(I) * 10 * dt, 1, 30);
    A.engine(true, 1.2);
    this.fireT -= dt;
    if (I.is('fire') && this.fireT <= 0 && this.rockets.length < 2) {
      this.fireT = 0.45;
      this.rockets.push({ x: this.x, y: this.py() - 4, tgt: this.aligned() });
      A.sfx('missile');
    }
    // silo defences fire at the elevation the aircraft has when they fire
    for (const s of this.silos) {
      if (!s.alive) continue;
      s.ft -= dt * (0.8 + k.lvl * 0.3);
      if (live && s.ft <= 0) {
        s.ft = rnd(2.4, 4);
        this.erockets.push({ x0: s.x, tx: this.x, A: this.A, t: 0, dur: 1.6 - k.lvl * 0.2 });
        A.sfx('enemyShot');
      }
    }
    // enemy aircraft enter from the left
    this.jetT -= dt;
    if (this.jetT <= 0) { this.jetT = rnd(6, 9) - k.lvl; this.jets.push({ x: -12, y: rnd(40, 90), vx: rnd(60, 85), ft: 1, n: 2 }); }
    for (const j of this.jets) {
      j.x += j.vx * dt; j.y += Math.sin(this.t * 2 + j.vx) * 10 * dt;
      j.ft -= dt;
      if (live && j.n > 0 && j.ft <= 0) { j.n--; j.ft = 0.9; const dx = this.x - j.x, dy = this.py() - j.y, d = Math.hypot(dx, dy) || 1; this.shots.push({ x: j.x, y: j.y, vx: (dx / d) * 110, vy: (dy / d) * 110 }); A.sfx('enemyShot'); }
    }
    for (const s of this.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
    for (const r of this.rockets) {
      r.y -= 200 * dt;
      for (const j of this.jets) if (!j.dead && Math.abs(r.x - j.x) < 7 && Math.abs(r.y - j.y) < 5) { j.dead = r.dead = true; k.addScore(300); this.booms.add(j.x, j.y, 1); A.sfx('boom'); }
      if (!r.dead && r.y <= 24) {
        r.dead = true;
        if (r.tgt && r.tgt.alive) this.hitSilo(r.tgt);
        else { this.booms.add(r.x, 30, 0.4); A.sfx('clank'); }
      }
    }
    for (const e of this.erockets) {
      e.t += dt;
      if (e.t >= e.dur) {
        e.dead = true;
        if (live && Math.abs(this.x - e.tx) < 7 && Math.abs(this.A - e.A) < 2.5) this.die('HIT BY SILO DEFENSES');
      }
    }
    for (const s of this.shots) if (live && Math.abs(s.x - this.x) < 6 && Math.abs(s.y - this.py()) < 4) { s.dead = true; this.die('SHOT DOWN'); }
    for (const j of this.jets) if (live && !j.dead && Math.abs(j.x - this.x) < 10 && Math.abs(j.y - this.py()) < 5) { j.dead = true; this.die('MID-AIR COLLISION'); }
    this.rockets = this.rockets.filter((r) => !r.dead);
    this.erockets = this.erockets.filter((e) => !e.dead);
    this.jets = this.jets.filter((j) => !j.dead && j.x < 340);
    this.shots = this.shots.filter((s) => !s.dead && s.y < 160 && s.x > -10 && s.x < 330);
  };
  Silo.prototype.hitSilo = function (s) {
    const k = this.k;
    s.alive = false;
    this.booms.add(s.x, 18, s.center ? 2.4 : 1.8);
    A.sfx('bigboom');
    if (s.center) {
      k.addScore(5000);
      if (this.silos.every((q) => !q.alive)) k.addScore(10000);
      this.state = 'done'; this.ct = 0; A.engine(false);
    } else { k.addScore(2000); k.extraPlane(); }
  };
  Silo.prototype.auto = function () {
    const a = {};
    const side = this.silos.filter((s) => s.alive && !s.center);
    const tgt = (side.length && this.k.launch && this.k.launch.t > 60 ? side.sort((p, q) => Math.abs(p.x - this.x) - Math.abs(q.x - this.x))[0] : null) || this.silos[2];
    if (this.x < tgt.x - 1) a.right = true; else if (this.x > tgt.x + 1) a.left = true;
    const diveIsUp = !this.k.invert;
    let wantA = tgt.wa;
    for (const e of this.erockets) if (e.dur - e.t < 0.6 && Math.abs(this.x - e.tx) < 9 && Math.abs(this.A - e.A) < 3) wantA = e.A > 15 ? e.A - 4 : e.A + 4;
    if (this.A > wantA + 0.4) { if (diveIsUp) a.up = true; else a.down = true; }
    else if (this.A < wantA - 0.4) { if (diveIsUp) a.down = true; else a.up = true; }
    a.fire = !!this.aligned();
    return a;
  };
  Silo.prototype.draw = function () {
    rect(0, 0, W, PF, 'd');
    for (const s of this.silos) {
      const big = s.center;
      const w = big ? 13 : 10;
      if (big) { ell(s.x + 4, 26, 26, 6, 'k'); ell(s.x, 24, 25, 6, 'c'); ell(s.x, 22, 22, 5, 'C'); }
      else ell(s.x + 5, 25, 12, 3.6, 'k');
      if (!s.alive) { ell(s.x, 20, w, 4, 'k'); rect(s.x - w * 0.8, 14, w * 1.6, 6, 'n'); if (blink(this.t + s.x, 3)) ell(s.x, 10, 3, 2, 'D'); continue; }
      rect(s.x - w, 6, w * 2, 16, 'N');
      rect(s.x + w * 0.4, 6, w * 0.6, 16, 'n');
      ell(s.x, 22, w, 3, 'N');
      ell(s.x, 6, w, 3.2, 'w'); ell(s.x, 6, w * 0.45, 1.4, 'k');
      if (big) for (let i = -2; i <= 2; i++) rect(s.x + i * 5 - 1, 21, 2, 2, 'k');
      rect(s.x - 2, 12, 4, 4, 'k'); // the window
    }
    for (const e of this.erockets) {
      const f = e.t / e.dur;
      rect(e.x0 + (e.tx - e.x0) * f - 0.5, 26 + (PY0 - e.A * 3 - 26) * f - 2, 1.5, 4, 'w');
    }
    for (const j of this.jets) { ell(j.x + 4, j.y + 18, 5, 1.2, 'k'); blit(enemyRear(), j.x, j.y, { sc: 1.1 }); }
    for (const s of this.shots) rect(s.x - 0.5, s.y - 0.5, 1.5, 1.5, 'w');
    for (const r of this.rockets) { rect(r.x - 0.5, r.y - 3, 1.5, 4, 'w'); rect(r.x - 0.5, r.y + 1, 1.5, 1.5, 'o'); }
    if (this.state !== 'dead') {
      ell(this.x + 1, PY0 + 8, Math.max(4, 9 - this.A * 0.12), 1.8, 'k');
      if (!(this.inv > 0 && blink(this.t, 10))) blit(rearPlane(this.aligned() ? 'B' : 'y'), this.x, this.py(), { sc: 1.15 });
    }
    this.booms.draw();
    if (this.state === 'dead') text(this.why, 160, 80, 'R', 'center');
    if (this.state === 'done') text('CONTROL SILO DESTROYED', 160, 80, 'w', 'center');
  };
  Silo.prototype.hud = function () {
    const k = this.k;
    text('LAUNCH SITE:', 0, row(0), 'G'); text(k.siteName(), 104, row(0), 'o');
    text('ALTITUDE', 0, row(1), 'L'); text(pad(this.A, 2) + ' M', 72, row(1), 'w');
    k.impactRow(3);
    k.aircraftRow(4);
  };

  /* =====================================================================
     SEQUENCE V — the Soviet Defense Center
     ===================================================================== */
  const DOOR_X = [126, 142, 158, 174, 190];
  const dY = (d) => 140 - d * 47;
  const DCONV = 0.45;
  const dX = (x0, d) => 160 + (x0 - 160) * (1 - DCONV * d);
  const wallTop = (x) => (x < 160 ? 46 + (x / 102) * 24 : 46 + ((320 - x) / 102) * 24);
  function Center(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.x = 160; this.elev = 6; this.load = 0;
    this.right = (Math.random() * 5) | 0;
    this.doors = DOOR_X.map(() => 'shut');
    this.found = false;
    this.soldiers = [
      { sx: 82, d: 0.88, alive: true, rt: 0, ft: 2 }, { sx: 238, d: 0.88, alive: true, rt: 0, ft: 2.8 },
      { sx: 96, d: 0.93, alive: true, rt: 0, ft: 3.5 }, { sx: 224, d: 0.93, alive: true, rt: 0, ft: 4 },
    ].slice(0, 2 + k.lvl);
    this.towers = [{ x: 84, y: 50, alive: true }, { x: 236, y: 50, alive: true }, { x: 136, y: 6, alive: true }, { x: 184, y: 6, alive: true }];
    this.tank = null; this.tankT = 6;
    this.shells = []; this.bullets = [];
    this.state = 'fight'; this.inv = 1;
  }
  Center.prototype.timed = false;
  Center.prototype.respawn = function () { this.state = 'fight'; this.inv = 2; this.bullets = []; this.rep = false; };
  Center.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k;
    this.booms.update(dt);
    if (this.state === 'dead') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.men--; if (k.men <= 0) k.gameOver('THE COMMANDO TEAM WAS LOST'); else this.respawn(); } return; }
    if (this.state === 'enter') { this.ct += dt; if (this.ct > 2.4 && !this.rep) { this.rep = true; k.addScore(5000); k.centerDone(); } return; }
    this.inv = Math.max(0, this.inv - dt);
    if (I.is('left')) this.x -= 64 * dt;
    if (I.is('right')) this.x += 64 * dt;
    this.x = clamp(this.x, 14, 306);
    this.eT = (this.eT || 0) - dt;
    if (this.eT <= 0) {
      if (I.is('up')) { this.elev = Math.min(12, this.elev + 1); this.eT = 0.14; }
      else if (I.is('down')) { this.elev = Math.max(1, this.elev - 1); this.eT = 0.14; }
    }
    this.load = Math.max(0, this.load - dt);
    if (I.is('fire') && this.load <= 0) {
      this.load = 1.3;
      const d = this.elev / 12;
      this.shells.push({ x0: this.x, d, t: 0, dur: 0.6 + d * 0.5 });
      A.sfx('missile');
    }
    for (const s of this.soldiers) {
      if (!s.alive) { s.rt -= dt; if (s.rt <= 0) { s.alive = true; s.ft = 2; } continue; }
      s.ft -= dt * (0.7 + k.lvl * 0.3);
      if (s.ft <= 0) { s.ft = rnd(2.5, 4.2); this.bullets.push({ x0: s.sx, y0: wallTop(s.sx) - 4, tx: this.x, t: 0, dur: 1.1 }); A.sfx('enemyShot'); }
    }
    this.tankT -= dt;
    if (!this.tank && this.tankT <= 0) {
      const left = Math.random() < 0.5;
      this.tank = { side: left ? -1 : 1, d: 0.82, sx: left ? 60 : 260, hp: 2, ft: 2.5 };
      A.sfx('door');
    }
    if (this.tank) {
      const T = this.tank;
      T.d = Math.max(0.45, T.d - 0.05 * dt);
      T.sx += -T.side * 9 * dt;
      T.ft -= dt;
      if (T.ft <= 0) { T.ft = rnd(2.6, 3.6); this.bullets.push({ x0: T.sx, y0: dY(T.d) - 4, tx: this.x, t: 0, dur: 1.3, big: true }); A.sfx('flak'); }
    }
    for (const sh of this.shells) { sh.t += dt; if (sh.t >= sh.dur) { sh.dead = true; this.land(sh); } }
    for (const b of this.bullets) {
      b.t += dt;
      if (b.t >= b.dur) {
        b.dead = true;
        if (this.state === 'fight' && this.inv <= 0 && !k.game.god && Math.abs(this.x - b.tx) < (b.big ? 10 : 7)) {
          this.state = 'dead'; this.ct = 0; this.booms.add(this.x, 146, 1.2); A.sfx('die');
        }
      }
    }
    this.shells = this.shells.filter((s) => !s.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    if (this.found && !this.tank && this.soldiers.every((s) => !s.alive) && this.state === 'fight') { this.state = 'enter'; this.ct = 0; A.sfx('clear'); }
  };
  Center.prototype.land = function (sh) {
    const k = this.k;
    const x = dX(sh.x0, sh.d), y = dY(sh.d);
    this.booms.add(x, y - 2, 1);
    A.sfx('boom');
    for (const s of this.soldiers) if (s.alive && Math.abs(x - s.sx) < 7 && Math.abs(sh.d - s.d) < 0.1) { this.booms.add(s.sx, wallTop(s.sx) - 4, 0.9); s.alive = false; s.rt = rnd(12, 16) - k.lvl; k.addScore(300); }
    if (this.tank && Math.abs(x - this.tank.sx) < 11 && Math.abs(sh.d - this.tank.d) < 0.12) {
      this.tank.hp--;
      if (this.tank.hp <= 0) { k.addScore(800); this.booms.add(this.tank.sx, dY(this.tank.d) - 4, 1.8); this.tank = null; this.tankT = rnd(12, 18) - k.lvl * 2; }
    }
    if (sh.d > 0.9) for (const t of this.towers) if (t.alive && Math.abs(x - t.x) < 6) { t.alive = false; k.addScore(500); this.booms.add(t.x, t.y + 6, 1.4); }
    if (sh.d >= 0.96) {
      DOOR_X.forEach((dx, i) => {
        if (Math.abs(x - dx) <= 6 && this.doors[i] === 'shut') {
          if (i === this.right) { this.doors[i] = 'open'; this.found = true; k.addScore(2000); A.sfx('clear'); }
          else { this.doors[i] = 'red'; k.addScore(100); A.sfx('hit'); }
        }
      });
    }
  };
  Center.prototype.auto = function () {
    const a = {};
    let tx, d;
    const alive = this.soldiers.filter((s) => s.alive);
    if (this.tank) { tx = this.tank.sx; d = this.tank.d; }
    else if (!this.found) { tx = DOOR_X[this.doors.findIndex((s) => s === 'shut')]; d = 1; }
    else if (alive.length) { const n = alive.map((q) => [Math.abs(160 + (q.sx - 160) / (1 - DCONV * q.d) - this.x), q]).sort((p, q) => p[0] - q[0])[0][1]; tx = n.sx; d = n.d; }
    else return a;
    const x0 = 160 + (tx - 160) / (1 - DCONV * d);
    const e = clamp(Math.round(d * 12), 1, 12);
    if (this.x < x0 - 1.5) a.right = true; else if (this.x > x0 + 1.5) a.left = true;
    if (this.elev < e) a.up = true; else if (this.elev > e) a.down = true;
    a.fire = Math.abs(this.x - x0) < 3 && this.elev === e;
    for (const b of this.bullets) if (b.dur - b.t < 0.4 && Math.abs(this.x - b.tx) < 10) { a.left = this.x > 160; a.right = !a.left; a.fire = false; }
    return a;
  };
  Center.prototype.draw = function () {
    rect(0, 0, W, PF, 'k');
    rect(0, 0, W, 76, 'b');
    for (let x = 0; x < 320; x += 4) {
      const h = 14 + Math.abs(Math.sin(x * 0.07) * 14) + ((x * 13) % 7) + (Math.sin(x * 0.31) > 0.6 ? 10 : 0);
      rect(x, 76 - h, 4, h, 'k');
      if ((x * 7) % 9 < 4) rect(x, 76 - h, 3, 2, 'w');
    }
    poly([[0, 46], [102, 70], [102, 96], [0, 106]], 'N');
    poly([[320, 46], [218, 70], [218, 96], [320, 106]], 'N');
    rect(46, 88, 26, 10, 'B'); rect(248, 88, 26, 10, 'B');
    for (const t of this.towers.slice(0, 2)) {
      if (!t.alive) { rect(t.x - 4, t.y + 8, 8, 4, 'D'); continue; }
      rect(t.x - 4, t.y + 6, 8, 8, 'w'); ell(t.x, t.y + 5, 4.5, 4, 'g'); rect(t.x - 0.5, t.y - 3, 1, 4, 'g');
    }
    // the Defense Center (the State Historical Museum)
    rect(110, 40, 100, 56, 'N');
    rect(110, 82, 100, 14, 'n');
    poly([[140, 40], [160, 28], [180, 40]], 'O'); poly([[146, 40], [160, 32], [174, 40]], 'y');
    for (const [x, w, top] of [[114, 14, 44], [196, 14, 44], [128, 16, 24], [176, 16, 24]]) {
      rect(x, top, w, 56 - (top - 40), 'N');
      for (let yy = top + 6; yy < 80; yy += 9) rect(x + 3, yy, w - 6, 4, Math.floor(yy / 9) % 2 ? 'Y' : 'w');
    }
    for (const t of this.towers.slice(2)) {
      if (!t.alive) { rect(t.x - 3, 22, 6, 4, 'D'); continue; }
      rect(t.x - 3, 14, 6, 12, 'w'); rect(t.x - 1.5, 8, 3, 6, 'w'); rect(t.x - 0.5, 2, 1, 6, 'w');
      rect(t.x - 2, 18, 4, 4, 'k');
    }
    for (let x = 148; x < 174; x += 6) rect(x, 50, 4, 6, 'c');
    for (let x = 116; x < 206; x += 10) rect(x, 66, 6, 2, 'w');
    DOOR_X.forEach((dx, i) => {
      const st = this.doors[i];
      const k2 = st === 'open' ? 'w' : st === 'red' ? 'r' : 'm';
      rect(dx - 5, 84, 10, 12, k2); ell(dx, 84, 5, 3, k2);
      if (st === 'open') rect(dx - 2, 87, 4, 4, blink(this.t, 3) ? 'k' : 'w');
      else rect(dx - 3, 86, 6, 10, 'k');
    });
    for (const s of this.soldiers) if (s.alive) blit(figure('w'), s.sx, wallTop(s.sx) - 4, { sc: 0.75 });
    if (this.tank) { const T = this.tank, s = 0.7 + (1 - T.d) * 0.9; ell(T.sx + 2, dY(T.d) + 1, 8 * s, 2 * s, 'D'); blit(tankSpr(), T.sx, dY(T.d) - 4 * s, { sc: s, flip: T.side < 0 }); }
    for (const sh of this.shells) {
      const f = sh.t / sh.dur;
      const x = sh.x0 + (dX(sh.x0, sh.d) - sh.x0) * f, y = 140 + (dY(sh.d) - 140) * f - Math.sin(Math.PI * f) * (30 + sh.d * 40);
      ell(x, y, 1.6 * (1 - f * 0.5), 1.6 * (1 - f * 0.5), 'w');
    }
    for (const b of this.bullets) { const f = b.t / b.dur; rect(b.x0 + (b.tx - b.x0) * f - 0.5, b.y0 + (146 - b.y0) * f, b.big ? 2 : 1.5, b.big ? 2 : 1.5, b.big ? 'y' : 'w'); }
    this.booms.draw();
    // commando behind the trench wall
    if (this.state !== 'dead' && !(this.inv > 0 && blink(this.t, 10))) {
      const ang = -0.25 - (this.elev / 12) * 0.9;
      line(this.x + 2, 140, this.x + 2 + Math.cos(ang) * 12, 140 + Math.sin(ang) * 12, 'G', 2.6);
      ell(this.x - 3, 140, 6, 5, 'o'); ell(this.x - 3, 134, 3.6, 3.4, 'l');
    }
    rect(0, 143, W, 9, 'c');
    for (let x = 6; x < W; x += 16) rect(x, 143, 1.5, 9, 'b');
    rect(0, 152, W, 8, 'w');
    if (this.state === 'enter') text('THE DEFENSE CENTER IS OPEN', 160, 120, 'w', 'center');
    else if (this.found && blink(this.t, 2)) text('DOOR FOUND - CLEAR THE AREA', 160, 120, 'G', 'center');
  };
  Center.prototype.hud = function () {
    const k = this.k;
    text('ELEVATION', 0, row(1), 'L'); text(pad(this.elev, 2), 80, row(1), 'w');
    text('STATUS:', 128, row(1), 'y'); text(this.load > 0 ? 'LOADING' : 'READY', 192, row(1), this.load > 0 ? 'm' : 'G');
    k.aircraftRow(4, true);
  };

  /* =====================================================================
     SEQUENCE VI — inside the reactor room
     ===================================================================== */
  const ZP = -0.35, ZR = 0.45;
  const fz = (z) => 1 / (1 + 0.806 * z);
  const rY = (z) => (z >= 0 ? 70 + (47 * (fz(z) - fz(1))) / (1 - fz(1)) : 117 + (z / ZP) * 33);
  const rHW = (z) => (z >= 0 ? 112 * fz(z) : 112 + (z / ZP) * 26);
  const rX = (x, z) => 160 + x * rHW(z);
  function Reactor(k) {
    this.k = k; this.t = 0; this.booms = new Booms();
    this.px = 0; this.aim = 0.3; this.disc = null; this.shots = [];
    // robot progress survives a trip back outside for more discs
    this.robotsLeft = k.robotsLeft !== undefined ? k.robotsLeft : [2, 4, 5][k.lvl];
    this.etcm = null;
    this.newRobot();
    if (k.robotHits) this.robot.hits = k.robotHits;
    this.state = 'fight'; this.inv = 1;
  }
  Reactor.prototype.timed = false;
  Reactor.prototype.newRobot = function () {
    const n = [2, 4, 5][this.k.lvl] - this.robotsLeft;
    this.robot = { x: rnd(-0.6, 0.6), v: 0.32 + n * 0.06, dir: Math.random() < 0.5 ? -1 : 1, hits: 0, ft: 2.5, flash: 0 };
    if (this.robotsLeft === 1) { this.etcm = [100, 85, 70][this.k.lvl]; A.sfx('alarm'); }
  };
  Reactor.prototype.respawn = function () { this.state = 'fight'; this.inv = 2; this.shots = []; this.rep = false; };
  Reactor.prototype.update = function (dt, I) {
    this.t += dt;
    const k = this.k, R = this.robot;
    this.booms.update(dt);
    if (this.etcm !== null && this.state !== 'won') {
      this.etcm -= dt;
      if (this.etcm <= 0 && this.state !== 'boom') { this.state = 'boom'; this.ct = 0; this.rep = false; A.sfx('bigboom'); }
    }
    if (this.state === 'boom') {
      this.ct += dt;
      if (Math.random() < dt * 10) { this.booms.add(rnd(60, 260), rnd(20, 140), rnd(1.5, 3)); A.sfx('boom'); }
      if (this.ct > 3 && !this.rep) { this.rep = true; k.go(new Ending(k, false, 0)); }
      return;
    }
    if (this.state === 'won') {
      this.ct += dt;
      if (this.ct > 2.5 && !this.rep) { this.rep = true; const safe = this.etcm === null || this.etcm > 15; k.go(new Ending(k, safe, safe ? k.men : 0)); }
      return;
    }
    if (this.state === 'dead') { this.ct += dt; if (this.ct > 2 && !this.rep) { this.rep = true; k.men--; if (k.men <= 0) k.gameOver('THE COMMANDO TEAM WAS LOST'); else this.respawn(); } }
    if (this.state === 'nodisc') { this.ct += dt; if (this.ct > 2.5 && !this.rep) { this.rep = true; k.go(new Center(k)); } return; }
    const live = this.state === 'fight';
    this.inv = Math.max(0, this.inv - dt);
    if (live) {
      if (I.is('left')) this.px -= 0.8 * dt;
      if (I.is('right')) this.px += 0.8 * dt;
      this.px = clamp(this.px, -1, 1);
      // laser guidance: forward moves the dot right, back moves it left
      if (I.is('up')) this.aim += 0.7 * dt;
      if (I.is('down')) this.aim -= 0.7 * dt;
      this.aim = clamp(this.aim, -1, 1);
      if (I.is('fire') && !this.disc && k.discs > 0) {
        k.discs--;
        this.disc = { x0: this.px, xt: this.aim, z: ZP, dir: 1, x: this.px };
        A.sfx('throw');
      }
    }
    R.x += R.dir * R.v * dt;
    if (Math.abs(R.x) > 0.82) { R.x = Math.sign(R.x) * 0.82; R.dir *= -1; }
    if (Math.random() < dt * 0.12) R.dir *= -1;
    R.flash = Math.max(0, R.flash - dt);
    R.ft -= dt * (1 + R.hits * 0.25);
    if (live && R.ft <= 0) { R.ft = rnd(1.8, 3) - k.lvl * 0.3; this.shots.push({ x0: R.x, tx: this.px, t: 0, dur: 1.4 - R.hits * 0.12 }); A.sfx('enemyShot'); }
    for (const s of this.shots) {
      s.t += dt;
      if (s.t >= s.dur) {
        s.dead = true;
        if (live && this.inv <= 0 && !k.game.god && Math.abs(this.px - s.tx) < 0.09) { this.state = 'dead'; this.ct = 0; this.booms.add(rX(this.px, ZP), 140, 1); A.sfx('die'); }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
    // disc: out to the back wall, bounce, and back towards the ledge
    const d = this.disc;
    if (d) {
      const prevZ = d.z;
      d.z += d.dir * 1.05 * dt;
      if (d.dir > 0 && d.z >= 1) { d.z = 1; d.dir = -1; A.sfx('bounce'); }
      const span = 1 - ZP;
      d.x = d.dir > 0 ? d.x0 + ((d.xt - d.x0) * (d.z - ZP)) / span : d.xt + ((d.xt - d.x0) * (1 - d.z)) / span;
      if (Math.abs(d.x) > 1) d.x = Math.sign(d.x) * 2 - d.x;
      const crossed = (prevZ - ZR) * (d.z - ZR) <= 0 && prevZ !== d.z;
      if (crossed && Math.abs(d.x - R.x) < 0.13) {
        this.disc = null;
        if (d.dir > 0) { A.sfx('clank'); this.booms.add(rX(d.x, ZR), rY(ZR) - 8, 0.4); } // armoured front
        else { R.hits++; R.flash = 0.25; k.addScore(500); A.sfx('hit'); if (R.hits >= 4) this.robotDown(); }
      } else if (d.dir < 0 && d.z <= ZP) {
        if (Math.abs(d.x - this.px) < 0.13 && live) { k.discs++; A.sfx('select'); }
        this.disc = null;
      }
    }
    if (live && !this.disc && k.discs <= 0 && this.state === 'fight') { this.state = 'nodisc'; this.ct = 0; this.rep = false; k.robotsLeft = this.robotsLeft; k.robotHits = this.robot.hits; }
  };
  Reactor.prototype.robotDown = function () {
    const k = this.k;
    this.booms.add(rX(this.robot.x, ZR), rY(ZR) - 10, 2);
    A.sfx('bigboom');
    k.addScore(3000);
    k.discs++;
    this.robotsLeft--;
    k.robotsLeft = this.robotsLeft; k.robotHits = 0;
    if (this.robotsLeft <= 0) { this.state = 'won'; this.ct = 0; this.rep = false; k.addScore(10000); return; }
    this.newRobot();
  };
  Reactor.prototype.auto = function () {
    const a = {};
    const R = this.robot;
    for (const s of this.shots) if (s.dur - s.t < 0.5 && Math.abs(this.px - s.tx) < 0.14) { if (this.px > 0) a.left = true; else a.right = true; return a; }
    if (this.disc) {
      if (this.disc.dir < 0) { const land = clamp(2 * this.disc.xt - this.disc.x0, -1, 1); if (this.px < land - 0.04) a.right = true; else if (this.px > land + 0.04) a.left = true; }
      return a;
    }
    // aim so the return path crosses the robot's predicted position
    const at = (tt) => { let x = R.x + R.dir * R.v * tt; for (let i = 0; i < 3; i++) { if (x > 0.82) x = 1.64 - x; else if (x < -0.82) x = -1.64 - x; } return x; };
    const rx = at((1 - ZP) / 1.05 + (1 - ZR) / 1.05);
    const k2 = (1 - ZR) / (1 - ZP);
    const want = clamp((rx + k2 * this.px) / (1 + k2), -1, 1);
    const outX = this.px + ((want - this.px) * (ZR - ZP)) / (1 - ZP);
    if (Math.abs(outX - at((ZR - ZP) / 1.05)) < 0.2) { if (this.px > 0) a.left = true; else a.right = true; return a; }
    if (this.aim < want - 0.03) a.up = true; else if (this.aim > want + 0.03) a.down = true;
    else a.fire = true;
    return a;
  };
  Reactor.prototype.draw = function () {
    rect(0, 0, W, PF, 'N');
    poly([[30, 3], [290, 3], [226, 13], [94, 13]], 'k');
    rect(98, 13, 124, 57, this.etcm !== null && this.etcm < 20 && blink(this.t, 4) ? 'R' : 'y');
    rect(160 + this.aim * 62 - 1, 58, 2.5, 2, 'k'); // laser guidance dot
    poly([[48, 117], [272, 117], [222, 70], [98, 70]], 'd');
    for (const z of [0.15, 0.45, 0.78]) for (const x of [-0.62, 0, 0.62]) {
      const y = rY(z), w = rHW(z) * 0.09;
      poly([[rX(x, z) - w, y - 1.5], [rX(x, z) + w, y - 1.5], [rX(x, z) + w * 1.15, y + 1.5], [rX(x, z) - w * 1.15, y + 1.5]], 'c');
    }
    rect(48, 117, 224, 31, 'k');
    poly([[4, 148], [316, 148], [320, 160], [0, 160]], 'd');
    for (const x of [8, 312]) { rect(x - 1, 138, 2.5, 14, 'w'); line(x, 138, x + (x < 160 ? 6 : -6), 132, 'k', 1); }
    for (const x of [22, 298]) { line(x, 100, x + (x < 160 ? 4 : -4), 92, 'k', 1.5); line(x - 3, 108, x + (x < 160 ? 1 : -1), 102, 'k', 1.5); }
    const R = this.robot;
    if (this.state !== 'won') {
      const s = fz(ZR) * 0.95;
      ell(rX(R.x, ZR), rY(ZR) + 1, 9 * s, 2 * s, 'k');
      blit(robotSpr(R.flash > 0), rX(R.x, ZR), rY(ZR) - 8 * s, { sc: s });
    }
    for (const sh of this.shots) {
      const f = sh.t / sh.dur, z = ZR + (ZP - ZR) * f, x = sh.x0 + (sh.tx - sh.x0) * f;
      rect(rX(x, z) - 0.6, rY(z) - 6, 1.5, 3, 'w');
    }
    const d = this.disc;
    if (d) { const s = d.z >= 0 ? fz(d.z) : 1.2; ell(rX(d.x, d.z), rY(d.z) - 4 * s, 3 * s, 1.1 * s, 'L'); }
    if (this.state !== 'dead' && !(this.inv > 0 && blink(this.t, 10))) blit(figure('w'), rX(this.px, ZP), 142, { sc: 1.25 });
    this.booms.draw();
    if (this.state === 'boom') { if (blink(this.t, 8)) rect(0, 0, W, PF, 'w'); text('CRITICAL MASS', 160, 80, 'r', 'center'); }
    if (this.state === 'won') text('REACTOR IS CRITICAL - RUN!', 160, 80, 'k', 'center');
    if (this.state === 'nodisc') text('OUT OF DISCS - FIGHT BACK IN', 160, 80, 'k', 'center');
  };
  Reactor.prototype.hud = function () {
    const k = this.k;
    text('DISCS', 0, row(0), 'G');
    for (let i = 0; i < Math.min(12, k.discs); i++) ell(52 + i * 12, row(0) + 3.5, 3.6, 1.6, 'L');
    text('ROBOTS ' + this.robotsLeft, 0, row(2), 'o');
    if (this.etcm !== null) { text('ETCM', 224, row(1), 'R'); text(clock(this.etcm), 320, row(2), blink(this.t, 2) ? 'R' : 'w', 'right'); }
    k.aircraftRow(4, true);
  };

  /* =====================================================================
     SEQUENCE VII — the final chapter
     ===================================================================== */
  function Ending(k, ok, pilots) {
    this.k = k; this.ok = ok; this.pilots = pilots; this.t = 0; this.booms = new Booms();
    this.isEnding = true; this.timed = false;
    if (ok) k.addScore(25000 + pilots * 5000);
    A.engine(false);
    if (ok) A.music('victory');
  }
  Ending.prototype.update = function (dt, I) {
    this.t += dt;
    this.booms.update(dt);
    if (this.t < 2.5 && Math.random() < dt * 8) { this.booms.add(160 + rnd(-30, 30), 92 - rnd(0, 18), rnd(1, 2.6)); A.sfx('boom'); }
    if (this.t > 4 && (I.hit('fire') || I.hit('start'))) { this.k.scr = 'title'; this.k.t = 0; A.music('title'); }
  };
  Ending.prototype.auto = function () { return {}; };
  Ending.prototype.draw = function () {
    rect(0, 0, W, 96, 'L');
    rect(0, 96, W, 64, 'd');
    for (const [x, y, s] of [[40, 20, 1], [120, 34, 0.7], [220, 16, 1.2], [280, 40, 0.8], [180, 52, 0.6]]) {
      const cx2 = ((x + this.t * 6) % 340) - 10;
      ell(cx2, y, 12 * s, 4 * s, 'w'); ell(cx2 + 7 * s, y - 3 * s, 7 * s, 4 * s, 'w'); ell(cx2 - 2 * s, y + 1 * s, 9 * s, 3 * s, this.ok ? 'l' : 'm');
    }
    for (let x = 60; x < 260; x += 3) { const h = 2 + ((x * 7) % 5) + (Math.abs(x - 160) < 30 ? 4 : 0); rect(x, 96 - h, 3, h, 'k'); }
    this.booms.draw();
    if (this.ok && this.t > 2.5) {
      const f = Math.min(1, (this.t - 2.5) / 6);
      const x = 40 + f * 240;
      blit(topPlane('k'), x, 18 - f * 6, { rot: Math.PI / 2, sc: 1.1 });
      ell(x, 130 - f * 10, 9, 2.4, 'k');
    }
  };
  Ending.prototype.hud = function () {
    const k = this.k;
    text('AP/UPI - IN HEAVY FIGHTING TODAY U.S.', 0, row(0), 'w');
    if (this.ok) {
      text('COMMANDOS DESTROYED THE SOVIET', 0, row(1), 'w');
      text('DEFENSE CENTER IN MOSCOW', 0, row(2), 'w');
      text(this.pilots + ' PILOTS RETURNED SAFELY', 16, row(3), 'y');
    } else {
      text('COMMANDOS DESTROYED THE DEFENSE', 0, row(1), 'w');
      text('CENTER. NO SURVIVORS WERE FOUND.', 0, row(2), 'w');
      text('WE WILL NOTIFY YOUR FAMILY', 16, row(3), 'R');
    }
    text('SCORE:', 208, row(4), 'C'); text(pad(k.score, 6), 320, row(4), 'w', 'right');
    if (this.t > 4 && blink(this.t, 1.4)) text('FIRE', 0, row(4), 'G');
  };

  Classic.SEQ = { Sac, Hangar, Run, Silo, Center, Reactor, Ending };
})();
