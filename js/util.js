/* Raid Over Moscow II — core utilities, RNG, colour helpers and input */
'use strict';
const ROM = (window.ROM = window.ROM || {});

ROM.W = 960;
ROM.H = 540;

ROM.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
ROM.lerp = (a, b, t) => a + (b - a) * t;
ROM.rand = (a, b) => a + Math.random() * (b - a);
ROM.pick = (arr) => arr[(Math.random() * arr.length) | 0];
ROM.dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
ROM.dist3 = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz);
ROM.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

/* xorshift32 seeded RNG */
ROM.RNG = function (seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const r = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
};

/* integer hash -> [0,1) */
ROM.hash2 = function (x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 982451653;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
};

/* smooth value noise */
ROM.noise2 = function (x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ROM.hash2(xi, yi, seed), b = ROM.hash2(xi + 1, yi, seed);
  const c = ROM.hash2(xi, yi + 1, seed), d = ROM.hash2(xi + 1, yi + 1, seed);
  return ROM.lerp(ROM.lerp(a, b, u), ROM.lerp(c, d, u), v);
};
ROM.fbm = (x, y, seed) => ROM.noise2(x, y, seed) * 0.65 + ROM.noise2(x * 2.1, y * 2.1, seed + 17) * 0.35;

/* ---------- colour ---------- */
const _rgbCache = new Map();
ROM.hexToRgb = function (hex) {
  let c = _rgbCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((q) => q + q).join('') : h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(hex, c);
  return c;
};
const _shadeCache = new Map();
ROM.shade = function (hex, f) {
  const q = Math.round(f * 50);
  const key = hex + q;
  let s = _shadeCache.get(key);
  if (s) return s;
  const [r, g, b] = ROM.hexToRgb(hex);
  const k = q / 50;
  s = `rgb(${Math.min(255, (r * k) | 0)},${Math.min(255, (g * k) | 0)},${Math.min(255, (b * k) | 0)})`;
  _shadeCache.set(key, s);
  return s;
};
ROM.shadeHex = function (hex, f) {
  const [r, g, b] = ROM.hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
};
ROM.mixHex = function (a, b, t) {
  const A = ROM.hexToRgb(a), B = ROM.hexToRgb(b);
  const r = Math.round(ROM.lerp(A[0], B[0], t)), g = Math.round(ROM.lerp(A[1], B[1], t)), bl = Math.round(ROM.lerp(A[2], B[2], t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
};
ROM.rgba = function (hex, a) {
  const [r, g, b] = ROM.hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/* ---------- storage (always guarded) ---------- */
ROM.store = {
  get(k, d) { try { const v = localStorage.getItem('rom2.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rom2.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

/* ---------- URL params (demo / screenshot mode) ---------- */
ROM.params = (() => {
  const p = {};
  try { new URLSearchParams(location.search).forEach((v, k) => (p[k] = v)); } catch (e) { /* ignore */ }
  return p;
})();

/* ---------- input ---------- */
ROM.Input = (function () {
  const map = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'fire', KeyJ: 'fire', ControlLeft: 'fire', ControlRight: 'fire',
    KeyX: 'bomb', KeyK: 'bomb', ShiftLeft: 'bomb', ShiftRight: 'bomb',
    Escape: 'pause', KeyP: 'pause', Enter: 'start', NumpadEnter: 'start', KeyM: 'mute',
  };
  const down = {}, pressed = {}, virt = {};
  const prevPad = {};
  const I = { down, pressed, virt, enabled: true, auto: null };

  window.addEventListener('keydown', (e) => {
    const a = map[e.code];
    if (!a) return;
    if (['left', 'right', 'up', 'down', 'fire'].includes(a)) e.preventDefault();
    if (!down[a]) pressed[a] = true;
    down[a] = true;
  });
  window.addEventListener('keyup', (e) => {
    const a = map[e.code];
    if (a) down[a] = false;
  });
  window.addEventListener('blur', () => { for (const k in down) down[k] = false; });

  I.setVirtual = (a, on) => {
    if (on && !virt[a]) pressed[a] = true;
    virt[a] = on;
  };

  I.pollPad = function () {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const st = {};
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      st.left = st.left || ax < -0.4 || b(14);
      st.right = st.right || ax > 0.4 || b(15);
      st.up = st.up || ay < -0.4 || b(12);
      st.down = st.down || ay > 0.4 || b(13);
      st.fire = st.fire || b(0) || b(7);
      st.bomb = st.bomb || b(1) || b(2) || b(6);
      st.pause = st.pause || b(9);
      st.start = st.start || b(9) || b(0);
    }
    for (const k of ['left', 'right', 'up', 'down', 'fire', 'bomb', 'pause', 'start']) {
      if (st[k] && !prevPad[k]) pressed[k] = true;
      prevPad[k] = !!st[k];
    }
    I.pad = st;
  };

  I.is = (a) => {
    if (I.auto) return !!I.auto[a];
    return !!(down[a] || virt[a] || (I.pad && I.pad[a]));
  };
  I.hit = (a) => {
    if (I.auto) { const v = I.auto['_' + a]; I.auto['_' + a] = false; return !!v; }
    return !!pressed[a];
  };
  I.endFrame = () => { for (const k in pressed) pressed[k] = false; };
  return I;
})();
