/* Raid Over Moscow II — procedural WebAudio sound effects and chiptune music */
'use strict';
(function () {
  const ROM = window.ROM;
  const A = (ROM.Audio = { ctx: null, muted: ROM.store.get('muted', false), master: null, sfxGain: null, musicGain: null });
  let noiseBuf = null;
  let engine = null;
  let musicTimer = null;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.7;
      A.master.connect(A.ctx.destination);
      A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = 0.8; A.sfxGain.connect(A.master);
      A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.22; A.musicGain.connect(A.master);
      const len = A.ctx.sampleRate * 1.5;
      noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { A.ctx = null; }
  };

  A.setMuted = function (m) {
    A.muted = m;
    ROM.store.set('muted', m);
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.7, A.ctx.currentTime, 0.02);
  };

  function noise(dur, filterType, f0, f1, vol, q) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const src = A.ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = A.ctx.createBiquadFilter();
    f.type = filterType; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(A.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, delay, dest) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || A.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  let lastShot = 0;
  A.sfx = function (name) {
    if (!A.ctx || A.muted) return;
    const now = A.ctx.currentTime;
    switch (name) {
      case 'shot':
        if (now - lastShot < 0.05) return;
        lastShot = now;
        noise(0.07, 'highpass', 3000, 1200, 0.25);
        tone('square', 900, 300, 0.06, 0.06);
        break;
      case 'enemyShot': tone('square', 520, 180, 0.1, 0.05); break;
      case 'bomb': tone('sine', 900, 200, 0.5, 0.12); break;
      case 'boom': noise(0.9, 'lowpass', 1400, 60, 0.9); tone('sine', 120, 30, 0.6, 0.5); break;
      case 'bigboom': noise(1.8, 'lowpass', 1800, 40, 1.0); tone('sine', 90, 20, 1.4, 0.7); break;
      case 'small': noise(0.25, 'bandpass', 1800, 400, 0.4, 2); break;
      case 'clank': tone('triangle', 1600, 1500, 0.08, 0.12); tone('square', 2400, 2300, 0.05, 0.05); break;
      case 'missile': noise(0.9, 'bandpass', 600, 2400, 0.35, 3); break;
      case 'flak': noise(0.35, 'lowpass', 900, 100, 0.5); break;
      case 'alarm': tone('square', 880, 880, 0.12, 0.08); tone('square', 660, 660, 0.12, 0.08, 0.14); break;
      case 'lock': tone('square', 1320, 1320, 0.05, 0.05); break;
      case 'throw': tone('triangle', 300, 1200, 0.18, 0.15); break;
      case 'bounce': tone('triangle', 700, 500, 0.08, 0.12); break;
      case 'hit': tone('square', 220, 80, 0.2, 0.15); noise(0.15, 'highpass', 2000, 800, 0.3); break;
      case 'launch': noise(1.6, 'bandpass', 200, 1200, 0.5, 1.5); tone('sawtooth', 60, 220, 1.5, 0.08); break;
      case 'door': tone('sawtooth', 70, 50, 0.8, 0.07); noise(0.8, 'lowpass', 300, 100, 0.2); break;
      case 'select': tone('square', 660, 660, 0.06, 0.06); tone('square', 990, 990, 0.08, 0.06, 0.06); break;
      case 'clear':
        [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.18, 0.07, i * 0.12));
        break;
      case 'die':
        [400, 300, 220, 150].forEach((f, i) => tone('square', f, f * 0.9, 0.2, 0.08, i * 0.15));
        break;
      default: break;
    }
  };

  /* continuous engine drone */
  A.engine = function (on, pitch) {
    if (!A.ctx) return;
    if (on && !engine) {
      const o = A.ctx.createOscillator(), o2 = A.ctx.createOscillator();
      o.type = 'sawtooth'; o2.type = 'square';
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = A.ctx.createGain(); g.gain.value = 0.0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(A.sfxGain);
      o.start(); o2.start();
      engine = { o, o2, g, f };
      g.gain.setTargetAtTime(0.045, A.ctx.currentTime, 0.2);
    }
    if (engine) {
      if (!on) {
        const e = engine; engine = null;
        e.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.1);
        setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (err) { /* ignore */ } }, 400);
        return;
      }
      const p = pitch || 1;
      engine.o.frequency.setTargetAtTime(55 * p, A.ctx.currentTime, 0.1);
      engine.o2.frequency.setTargetAtTime(55.7 * p, A.ctx.currentTime, 0.1);
    }
  };

  /* ---- music: short original march loops (not the 1984 score) ---- */
  const N = (s) => { // note name to freq, e.g. 'A4'
    const m = /^([A-G])(#?)(\d)$/.exec(s);
    if (!m) return 0;
    const idx = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) - 4) * 12;
    return 440 * Math.pow(2, idx / 12);
  };
  const SONGS = {
    title: {
      bpm: 112,
      lead: 'D4 - F4 A4 D5 - C5 A4 | A#4 - A4 G4 F4 - E4 - | D4 - F4 A4 D5 - E5 F5 | E5 - D5 C5 D5 - - - |',
      bass: 'D2 D2 A2 D2 D2 A2 D2 A2 | A#1 A#1 F2 A#1 C2 C2 G2 C2 | D2 D2 A2 D2 F2 F2 C3 F2 | A1 A1 E2 A1 D2 D2 A2 D2 |',
    },
    victory: {
      bpm: 126,
      lead: 'G4 - C5 - E5 - G5 - | F5 E5 D5 C5 D5 - - - | E5 - D5 C5 A4 - C5 - | G4 - C5 - C5 - - - |',
      bass: 'C3 G2 C3 G2 C3 G2 C3 G2 | F2 C3 F2 C3 G2 D3 G2 D3 | A2 E3 A2 E3 F2 C3 G2 D3 | C3 G2 C3 G2 C3 - - - |',
    },
  };
  function parse(str) { return str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean); }

  A.music = function (name) {
    A.stopMusic();
    if (!A.ctx || !SONGS[name]) return;
    const s = SONGS[name];
    const lead = parse(s.lead), bass = parse(s.bass);
    const step = 60 / s.bpm / 2;
    let i = 0;
    let next = A.ctx.currentTime + 0.05;
    const sched = () => {
      while (next < A.ctx.currentTime + 0.25) {
        const l = lead[i % lead.length], b = bass[i % bass.length];
        const dt = next - A.ctx.currentTime;
        if (l !== '-') {
          let len = 1; while (lead[(i + len) % lead.length] === '-' && len < 4) len++;
          tone('square', N(l), N(l), step * len * 0.95, 0.09, dt, A.musicGain);
          tone('triangle', N(l) * 2, N(l) * 2, step * 0.4, 0.025, dt, A.musicGain);
        }
        if (b !== '-') tone('triangle', N(b), N(b), step * 0.9, 0.2, dt, A.musicGain);
        if (i % 2 === 0) noise(0.03, 'highpass', 6000, 5000, i % 8 === 4 ? 0.12 : 0.04);
        i++;
        next += step;
        if (name === 'victory' && i >= lead.length * 2) { A.stopMusic(); return; }
      }
    };
    musicTimer = setInterval(sched, 60);
    sched();
  };
  A.stopMusic = function () { if (musicTimer) clearInterval(musicTimer); musicTimer = null; };
})();
