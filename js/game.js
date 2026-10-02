/* Raid Over Moscow II — campaign flow, HUD, modal UI and main loop */
'use strict';
(function () {
  const ROM = window.ROM;
  const I = ROM.Input;
  const A = ROM.Audio;

  const MISSIONS = [
    { city: 'Leningrad', biome: 'coast', terrain: 'Baltic coast', brief: 'A missile site near the Gulf of Finland is fuelling ICBMs. Cross the coastline at wave-top height and knock out its launch control center.' },
    { city: 'Minsk', biome: 'forest', terrain: 'Belarusian forest', brief: 'Dense forest hides armour columns and SAM batteries. Thread through the treeline and strike the Minsk launch complex.' },
    { city: 'Kiev', biome: 'farm', terrain: 'Dnieper farmland', brief: 'Open farmland and the Dnieper river. Little cover, heavy armour. Destroy the Kiev silos before they launch.' },
    { city: 'Saratov', biome: 'steppe', terrain: 'Volga steppe', brief: 'Fly the Volga steppe. Expect radar pickets and interceptors scrambling the moment you climb.' },
    { city: 'Moscow', biome: 'winter', terrain: 'Moscow winter', brief: 'The defence command itself. Reach the city, breach the Kremlin Defense Center on foot and destroy the reactor that powers the launch network.', final: true },
  ];
  const PHASES = { normal: ['hangar', 'flight', 'silo'], final: ['hangar', 'flight', 'kremlin', 'reactor'] };
  const STAGE_CLASS = { hangar: 'Hangar', flight: 'Flight', silo: 'Silo', kremlin: 'Kremlin', reactor: 'Reactor' };
  const PHASE_NAMES = { hangar: 'Hangar Launch', flight: 'Low-Level Flight', silo: 'Launch Site Strike', kremlin: 'Red Square Assault', reactor: 'Reactor Room' };
  const US_CITIES = ['Seattle', 'Houston', 'Los Angeles', 'Chicago', 'Washington', 'New York'];
  const DIFFS = [{ name: 'Cadet', v: 0, planes: 7 }, { name: 'Pilot', v: 0.5, planes: 5 }, { name: 'Ace', v: 1, planes: 4 }];
  ROM.MISSIONS = MISSIONS;

  const $ = (id) => document.getElementById(id);

  const Game = (ROM.Game = {
    stage: null,
    state: 'title',
    campaign: null,
    god: false,
    banners: [],
    frameBanners: [],
    fade: 0,
    fadeTarget: 0,
    intro: 0,
    hi: ROM.store.get('hi', 25000),
    diffIdx: ROM.store.get('diff', 1),

    diff() { return this.campaign ? this.campaign.diff : 0.5; },
    missionInfo() {
      const c = this.campaign;
      const m = MISSIONS[c ? c.mission : 0];
      return Object.assign({ index: c ? c.mission : 0 }, m);
    },
    phaseList() { return this.missionInfo().final ? PHASES.final : PHASES.normal; },
    phase() { return this.phaseList()[this.campaign.phaseIdx]; },

    banner(text, color, size, dur, blink) {
      if (dur) {
        this.banners = this.banners.filter((b) => b.text !== text);
        this.banners.push({ text, color, size, until: this.time + dur });
      } else this.frameBanners.push({ text, color, size, blink });
    },

    addScore(n) {
      if (!this.campaign || this.attract) return;
      const c = this.campaign;
      const before = Math.floor(c.score / 40000);
      c.score += n;
      if (Math.floor(c.score / 40000) > before) { c.planes++; this.banner('BONUS BOMBER', '#2fbf9b', 0, 2); A.sfx('clear'); }
      if (c.score > this.hi) { this.hi = c.score; ROM.store.set('hi', this.hi); }
    },

    cityHit() {
      const c = this.campaign;
      if (!c || this.attract) return;
      const name = c.cities.pop();
      this.banner(`${(name || 'US CITY').toUpperCase()} HAS BEEN HIT`, '#ff6b5a', 0, 3);
      A.sfx('alarm');
      if (c.cities.length === 0) setTimeout(() => this.gameOver('Every American city has been destroyed.'), 1500);
    },

    /* ---------- campaign flow ---------- */
    newCampaign(opts) {
      const d = DIFFS[this.diffIdx];
      this.campaign = {
        mission: opts.mission || 0, phaseIdx: opts.phaseIdx || 0, planes: d.planes, diff: d.v, diffName: d.name,
        cities: US_CITIES.slice(), score: 0, resumeY: 0, returnPhase: null, silo: null, practice: !!opts.practice,
      };
    },
    startCampaign() {
      this.attract = false;
      this.god = false;
      this.newCampaign({});
      this.showBrief();
    },
    startPractice(mission, phase) {
      this.attract = false;
      this.god = false;
      const list = MISSIONS[mission].final ? PHASES.final : PHASES.normal;
      this.newCampaign({ mission, phaseIdx: Math.max(0, list.indexOf(phase)), practice: true });
      this.showBrief();
    },

    showBrief() {
      const m = this.missionInfo();
      const ph = this.phase();
      $('brief-kicker').textContent = this.campaign.practice ? 'PRACTICE · ' + this.campaign.diffName.toUpperCase() : `MISSION ${m.index + 1} OF ${MISSIONS.length} · ${this.campaign.diffName.toUpperCase()}`;
      $('brief-title').textContent = m.final ? 'Moscow' : m.city;
      $('brief-sub').textContent = m.terrain;
      $('brief-text').textContent = m.brief;
      const steps = this.phaseList().map((p, i) => `<li class="${i < this.campaign.phaseIdx ? 'done' : i === this.campaign.phaseIdx ? 'now' : ''}"><span>${i + 1}</span>${PHASE_NAMES[p]}</li>`).join('');
      $('brief-steps').innerHTML = steps;
      $('brief-hint').textContent = ROM.Stages[STAGE_CLASS[ph]].prototype.hint;
      this.openModal('m-brief');
      this.state = 'brief';
    },

    startPhase(keepUI) {
      if (!keepUI) this.closeModals();
      const ph = this.phase();
      const Cls = ROM.Stages[STAGE_CLASS[ph]];
      const opts = {};
      if (ph === 'flight') opts.startY = this.campaign.resumeY || 0;
      this.stage = new Cls(this, opts);
      this.stage.phase = ph;
      this.state = 'play';
      this.intro = this.attract ? 0 : 2.2;
      this.fade = 1; this.fadeTarget = 0;
      this.banners = [];
      A.stopMusic();
      A.engine(false);
    },

    stageClear(info) {
      const c = this.campaign;
      if (this.attract) { this.startAttract(); return; }
      this.addScore((info && info.bonus) || 0);
      A.engine(false);
      const ph = this.phase();
      const list = this.phaseList();
      if (info && info.final) { this.victory(); return; }
      if (c.practice && ph !== 'hangar') { this.practiceDone(); return; }
      if (ph === 'hangar' && c.returnPhase) {
        c.phaseIdx = list.indexOf(c.returnPhase);
        c.returnPhase = null;
      } else {
        c.phaseIdx++;
        if (ph === 'flight') c.resumeY = 0;
      }
      if (c.phaseIdx >= list.length) {
        c.mission++;
        c.phaseIdx = 0;
        c.resumeY = 0;
        c.silo = null;
        A.sfx('clear');
        this.transition(() => this.showBrief());
        return;
      }
      this.transition(() => this.startPhase());
    },

    onDeath(info) {
      const c = this.campaign;
      if (this.attract) { this.startAttract(); return; }
      c.planes--;
      A.engine(false);
      if (c.planes <= 0) { this.gameOver('Your squadron has been lost.'); return; }
      const ph = this.phase();
      if (info && info.ground) {
        this.banner(`${c.planes} ${c.planes === 1 ? 'SOLDIER' : 'SOLDIERS'} LEFT`, '#ffd27a', 0, 2);
        this.stage.respawn();
        return;
      }
      if (ph === 'flight') c.resumeY = (info && info.checkpoint) || 0;
      if (ph !== 'hangar') c.returnPhase = ph;
      c.phaseIdx = 0; // a fresh bomber must launch from the station
      this.transition(() => this.startPhase());
    },

    transition(fn) {
      this.fadeTarget = 1;
      this.afterFade = fn;
    },

    gameOver(why) {
      if (this.state === 'over') return;
      this.state = 'over';
      A.engine(false);
      $('over-title').textContent = 'Mission Failed';
      $('over-why').textContent = why;
      $('over-score').textContent = this.campaign.score.toLocaleString();
      $('over-hi').textContent = this.hi.toLocaleString();
      $('over-reached').textContent = `${this.missionInfo().city} — ${PHASE_NAMES[this.phase()]}`;
      this.openModal('m-over');
      A.sfx('die');
    },
    victory() {
      this.state = 'over';
      A.engine(false);
      const c = this.campaign;
      const bonus = c.cities.length * 5000 + c.planes * 2500;
      this.addScore(bonus);
      $('win-score').textContent = c.score.toLocaleString();
      $('win-cities').textContent = `${c.cities.length} / ${US_CITIES.length}`;
      $('win-bonus').textContent = '+' + bonus.toLocaleString();
      $('win-hi').textContent = this.hi.toLocaleString();
      this.openModal('m-win');
      A.music('victory');
    },
    practiceDone() {
      this.state = 'over';
      $('over-title').textContent = 'Stage Complete';
      $('over-why').textContent = 'Practice run finished. Ready for the real thing?';
      $('over-score').textContent = this.campaign.score.toLocaleString();
      $('over-hi').textContent = this.hi.toLocaleString();
      $('over-reached').textContent = `${this.missionInfo().city} — ${PHASE_NAMES[this.phase()]}`;
      this.openModal('m-over');
      A.sfx('clear');
    },

    /* attract mode on the title screen: autopilot flight */
    startAttract(forced) {
      this.attract = true;
      this.god = true;
      const m = forced ? forced.mission : (Math.random() * MISSIONS.length) | 0;
      this.newCampaign({ mission: m });
      const ph = forced ? forced.phase : 'flight';
      const list = this.phaseList();
      this.campaign.phaseIdx = Math.max(0, list.indexOf(ph));
      if (forced && forced.startY) this.campaign.resumeY = forced.startY;
      this.startPhase(true);
      this.intro = 0;
      this.state = 'attract';
    },

    toTitle() {
      this.closeModals();
      this.startAttract();
      this.openModal('m-title');
      $('title-hi').textContent = this.hi.toLocaleString();
      A.music('title');
    },

    pause() {
      if (this.state !== 'play') return;
      this.state = 'paused';
      A.engine(false);
      this.openModal('m-pause');
    },
    resume() {
      this.closeModals();
      this.state = 'play';
    },

    /* ---------- modals ---------- */
    openModal(id) {
      document.querySelectorAll('.modal').forEach((m) => m.classList.toggle('open', m.id === id));
      const first = $(id).querySelector('[data-focus]') || $(id).querySelector('button');
      if (first) setTimeout(() => first.focus(), 30);
    },
    closeModals() { document.querySelectorAll('.modal').forEach((m) => m.classList.remove('open')); },

    /* ---------- loop ---------- */
    time: 0,
    update(dt) {
      this.time += dt;
      I.pollPad();
      if (I.hit('mute')) { A.setMuted(!A.muted); this.syncMute(); }
      if (this.state === 'play' && I.hit('pause')) { this.pause(); }
      else if (this.state === 'paused' && I.hit('pause')) { this.resume(); }
      // fade
      if (this.fadeTarget > this.fade) {
        this.fade = Math.min(1, this.fade + dt * 3);
        if (this.fade >= 1 && this.afterFade) { const f = this.afterFade; this.afterFade = null; f(); }
      } else this.fade = Math.max(this.fadeTarget, this.fade - dt * 2);

      if (!this.stage) return;
      if (this.state === 'play' || this.state === 'attract' || this.state === 'shot') {
        if (this.intro > 0) { this.intro -= dt; return; }
        if (this.state !== 'play' || this.autoplay) I.auto = this.stage.auto ? this.stage.auto() : {};
        else I.auto = null;
        this.stage.update(dt, I);
        I.auto = null;
      } else if (this.state === 'over' || this.state === 'brief') {
        // keep the world animating softly behind modals
        if (this.stage.fx) this.stage.fx.update(dt, 0);
      }
    },

    draw(ctx) {
      this.frameBanners = this.frameBanners || [];
      ctx.save();
      if (this.stage) this.stage.draw(ctx);
      else { ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, ROM.W, ROM.H); }
      ctx.restore();
      if (this.stage && this.stage.fx && this.stage.fx.flash > 0) {
        ctx.fillStyle = `rgba(255,255,240,${this.stage.fx.flash * 0.7})`;
        ctx.fillRect(0, 0, ROM.W, ROM.H);
      }
      const showHud = !this.hideHud && (this.state === 'play' || this.state === 'paused' || this.state === 'shot');
      if (showHud) this.drawHUD(ctx);
      if (this.state === 'play' && this.intro > 0) this.drawIntro(ctx);
      if (showHud || this.state === 'attract') this.drawBanners(ctx);
      else this.frameBanners.length = 0;
      if (this.fade > 0) { ctx.fillStyle = `rgba(5,8,14,${this.fade})`; ctx.fillRect(0, 0, ROM.W, ROM.H); }
    },

    drawBanners(ctx) {
      const list = this.frameBanners.concat(this.banners.filter((b) => b.until > this.time));
      this.banners = this.banners.filter((b) => b.until > this.time);
      let y = 96;
      ctx.save();
      ctx.textAlign = 'center';
      for (const b of list) {
        if (b.blink && Math.floor(this.time * 4) % 2) { y += 34; continue; }
        const size = b.size || 22;
        ctx.font = `700 ${size}px "Rajdhani", "Segoe UI", sans-serif`;
        const w = ctx.measureText(b.text).width + 36;
        ctx.fillStyle = 'rgba(8,12,20,0.72)';
        roundRect(ctx, ROM.W / 2 - w / 2, y - size + 2, w, size + 12, 6);
        ctx.fill();
        ctx.fillStyle = b.color || '#ffd27a';
        ctx.fillRect(ROM.W / 2 - w / 2, y - size + 2, 3, size + 12);
        ctx.fillText(b.text, ROM.W / 2, y + 2);
        y += size + 18;
      }
      ctx.restore();
      this.frameBanners.length = 0;
    },

    drawIntro(ctx) {
      const st = this.stage;
      const k = Math.min(1, this.intro / 0.4, (2.2 - this.intro) / 0.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = 'rgba(8,12,20,0.78)';
      ctx.fillRect(0, ROM.H / 2 - 62, ROM.W, 124);
      ctx.fillStyle = '#e0a526';
      ctx.fillRect(0, ROM.H / 2 - 62, ROM.W, 2);
      ctx.fillRect(0, ROM.H / 2 + 60, ROM.W, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8fa3b8';
      ctx.font = '600 14px "Rajdhani", sans-serif';
      const m = this.missionInfo();
      ctx.fillText(`MISSION ${m.index + 1} · ${m.city.toUpperCase()}`, ROM.W / 2, ROM.H / 2 - 30);
      ctx.fillStyle = '#f2f5f8';
      ctx.font = '400 38px "Black Ops One", "Rajdhani", sans-serif';
      ctx.fillText(st.name, ROM.W / 2, ROM.H / 2 + 10);
      ctx.fillStyle = '#c7d3df';
      ctx.font = '500 15px "Rajdhani", sans-serif';
      ctx.fillText(st.hint, ROM.W / 2, ROM.H / 2 + 40);
      ctx.restore();
    },

    drawHUD(ctx) {
      const c = this.campaign;
      if (!c) return;
      const h = this.stage.hud ? this.stage.hud() : {};
      ctx.save();
      // top bar
      const g = ctx.createLinearGradient(0, 0, 0, 44);
      g.addColorStop(0, 'rgba(8,13,22,0.92)'); g.addColorStop(1, 'rgba(8,13,22,0.7)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, ROM.W, 44);
      ctx.fillStyle = 'rgba(224,165,38,0.8)'; ctx.fillRect(0, 44, ROM.W, 1.5);
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px "Rajdhani", sans-serif';
      ctx.fillStyle = '#7f93a8';
      ctx.textAlign = 'left';
      ctx.fillText('SCORE', 16, 14);
      ctx.fillText('HIGH', 150, 14);
      ctx.font = '700 20px "Rajdhani", sans-serif';
      ctx.fillStyle = '#f2f5f8';
      ctx.fillText(String(c.score).padStart(7, '0'), 16, 31);
      ctx.fillStyle = '#9fb3c8';
      ctx.fillText(String(this.hi).padStart(7, '0'), 150, 31);
      // centre
      ctx.textAlign = 'center';
      ctx.font = '600 11px "Rajdhani", sans-serif';
      ctx.fillStyle = '#e0a526';
      const m = this.missionInfo();
      ctx.fillText(`MISSION ${m.index + 1} · ${m.city.toUpperCase()}`, ROM.W / 2, 14);
      ctx.font = '700 17px "Rajdhani", sans-serif';
      ctx.fillStyle = '#f2f5f8';
      ctx.fillText(this.stage.name, ROM.W / 2, 31);
      // right: squadron + cities
      ctx.textAlign = 'right';
      ctx.font = '600 11px "Rajdhani", sans-serif';
      ctx.fillStyle = '#7f93a8';
      const ground = this.phase() === 'kremlin' || this.phase() === 'reactor';
      ctx.fillText(ground ? 'SQUAD' : 'BOMBERS', ROM.W - 150, 14);
      ctx.fillText('US CITIES', ROM.W - 16, 14);
      for (let i = 0; i < Math.min(c.planes, 8); i++) {
        const x = ROM.W - 160 - i * 15, y = 31;
        ctx.fillStyle = '#2fbf9b';
        ctx.beginPath();
        if (ground) { ctx.arc(x, y - 3, 3, 0, Math.PI * 2); ctx.fillRect(x - 3, y, 6, 7); }
        else { ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 6); ctx.lineTo(x, y + 3); ctx.lineTo(x - 6, y + 6); ctx.closePath(); }
        ctx.fill();
      }
      for (let i = 0; i < US_CITIES.length; i++) {
        const x = ROM.W - 22 - i * 13, y = 31;
        ctx.fillStyle = i < c.cities.length ? '#5fb4ff' : '#3a2a2a';
        ctx.fillRect(x - 4, y - 5, 8, 10);
        if (i >= c.cities.length) { ctx.strokeStyle = '#ff6b5a'; ctx.beginPath(); ctx.moveTo(x - 5, y - 6); ctx.lineTo(x + 5, y + 6); ctx.stroke(); }
      }
      // bottom progress
      if (h.progress !== undefined) {
        const w = 320, x = ROM.W / 2 - w / 2, y = ROM.H - 22;
        ctx.fillStyle = 'rgba(8,13,22,0.75)';
        roundRect(ctx, x - 12, y - 18, w + 24, 32, 6); ctx.fill();
        ctx.fillStyle = '#26313e'; ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = '#e0a526'; ctx.fillRect(x, y, w * h.progress, 5);
        if (h.checkpoints) { ctx.fillStyle = '#c7d3df'; for (const cp of h.checkpoints) ctx.fillRect(x + w * cp - 1, y - 3, 2, 11); }
        ctx.textAlign = 'center'; ctx.font = '600 11px "Rajdhani", sans-serif'; ctx.fillStyle = '#c7d3df';
        ctx.fillText(h.objective || (h.stage === 'FLIGHT' ? `DISTANCE TO ${m.city.toUpperCase()}` : 'PROGRESS'), ROM.W / 2, y - 8);
      }
      // flight altimeter
      if (h.alt !== undefined) {
        const x = 18, y = 80, hh = 220;
        ctx.fillStyle = 'rgba(8,13,22,0.75)'; roundRect(ctx, x - 8, y - 26, 52, hh + 52, 6); ctx.fill();
        ctx.textAlign = 'center'; ctx.font = '600 11px "Rajdhani", sans-serif'; ctx.fillStyle = '#9fb3c8';
        ctx.fillText('ALT', x + 18, y - 12);
        ctx.fillStyle = '#26313e'; ctx.fillRect(x + 10, y, 16, hh);
        const ry = y + hh - hh * h.radarAlt;
        ctx.fillStyle = 'rgba(255,107,90,0.28)'; ctx.fillRect(x + 10, y, 16, ry - y);
        ctx.fillStyle = '#ff6b5a'; ctx.fillRect(x + 4, ry - 1, 28, 2);
        const py = y + hh - hh * h.alt;
        ctx.fillStyle = '#2fbf9b'; ctx.beginPath(); ctx.moveTo(x + 4, py - 5); ctx.lineTo(x + 14, py); ctx.lineTo(x + 4, py + 5); ctx.fill();
        ctx.fillRect(x + 10, py - 1, 16, 2);
        ctx.fillStyle = '#9fb3c8'; ctx.fillText('RADAR', x + 18, y + hh + 14);
        ctx.fillStyle = '#26313e'; ctx.fillRect(x + 2, y + hh + 20, 32, 4);
        ctx.fillStyle = h.alert > 0.6 ? '#ff6b5a' : '#e0a526'; ctx.fillRect(x + 2, y + hh + 20, 32 * h.alert, 4);
      }
      if (h.range !== undefined) {
        ctx.textAlign = 'left'; ctx.font = '600 12px "Rajdhani", sans-serif'; ctx.fillStyle = '#c7d3df';
        ctx.fillStyle = 'rgba(8,13,22,0.75)'; roundRect(ctx, 12, ROM.H - 44, 120, 30, 6); ctx.fill();
        ctx.fillStyle = '#c7d3df'; ctx.fillText('RANGE  ' + h.range + ' m', 24, ROM.H - 29);
      }
      ctx.restore();
    },

    syncMute() {
      const b = $('btn-mute');
      if (b) b.textContent = A.muted ? 'Sound: Off' : 'Sound: On';
      const t = $('t-mute');
      if (t) t.textContent = A.muted ? '🔇' : '🔊';
    },
  });

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  ROM.roundRect = roundRect;

  /* ---------- boot ---------- */
  function boot() {
    const canvas = $('game');
    const ctx = canvas.getContext('2d');
    ROM.R.ctx = ctx;
    const wrap = $('wrap');

    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const s = Math.min(vw / ROM.W, vh / ROM.H);
      const cw = Math.floor(ROM.W * s), ch = Math.floor(ROM.H * s);
      wrap.style.width = cw + 'px';
      wrap.style.height = ch + 'px';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.min(1920, Math.round(cw * dpr));
      canvas.height = Math.round(canvas.width * ROM.H / ROM.W);
      wrap.style.setProperty('--ui-scale', Math.max(0.6, Math.min(1.4, s)).toFixed(3));
    }
    window.addEventListener('resize', resize);
    resize();

    wireUI();

    const P = ROM.params;
    if (P.shot) {
      // screenshot / demo mode: jump straight into a stage on autopilot
      Game.diffIdx = 1;
      Game.startAttract({ mission: parseInt(P.m || '0', 10), phase: P.shot, startY: P.y ? -parseFloat(P.y) : 0 });
      Game.attract = false;
      Game.campaign.score = parseInt(P.score || '48250', 10);
      Game.state = 'shot';
      Game.hideHud = P.hud === '0';
      Game.closeModals();
      // pre-roll simulation so the scene is busy
      const pre = parseFloat(P.t || '6');
      for (let t = 0; t < pre; t += 1 / 60) Game.update(1 / 60);
      Game.fade = 0; Game.fadeTarget = 0;
    } else {
      Game.toTitle();
      if (P.m !== undefined) Game.startAttract({ mission: parseInt(P.m, 10), phase: 'flight' });
      const pre = parseFloat(P.t || '0');
      for (let t = 0; t < pre; t += 1 / 60) Game.update(1 / 60);
    }

    let last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (P.shot) dt = 1 / 60;
      Game.update(dt);
      ctx.setTransform(canvas.width / ROM.W, 0, 0, canvas.height / ROM.H, 0, 0);
      Game.draw(ctx);
      I.endFrame();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function wireUI() {
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', () => { A.init(); A.sfx('select'); fn(); }); };
    click('btn-start', () => Game.startCampaign());
    click('btn-select', () => { buildSelect(); Game.openModal('m-select'); });
    click('btn-help', () => Game.openModal('m-help'));
    click('btn-help-back', () => Game.openModal('m-title'));
    click('btn-select-back', () => Game.openModal('m-title'));
    click('btn-brief-go', () => Game.startPhase());
    click('btn-brief-quit', () => Game.toTitle());
    click('btn-resume', () => Game.resume());
    click('btn-quit', () => Game.toTitle());
    click('btn-over-title', () => Game.toTitle());
    click('btn-over-retry', () => Game.startCampaign());
    click('btn-win-title', () => Game.toTitle());
    click('btn-mute', () => { A.setMuted(!A.muted); Game.syncMute(); });
    click('t-mute', () => { A.setMuted(!A.muted); Game.syncMute(); });
    click('t-pause', () => Game.pause());
    const diffBtns = document.querySelectorAll('[data-diff]');
    const syncDiff = () => diffBtns.forEach((b) => b.classList.toggle('active', +b.dataset.diff === Game.diffIdx));
    diffBtns.forEach((b) => b.addEventListener('click', () => { A.init(); A.sfx('select'); Game.diffIdx = +b.dataset.diff; ROM.store.set('diff', Game.diffIdx); syncDiff(); }));
    syncDiff();
    Game.syncMute();

    // Enter / Fire activates the focused modal button
    window.addEventListener('keydown', (e) => {
      A.init();
      if (Game.state === 'brief' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); A.sfx('select'); Game.startPhase(); return; }
      const open = document.querySelector('.modal.open');
      if (!open) return;
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const btns = Array.from(open.querySelectorAll('button:not([disabled])'));
        const i = btns.indexOf(document.activeElement);
        const n = e.code === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
        if (btns[n]) { btns[n].focus(); e.preventDefault(); }
      }
      if (e.code === 'Escape' && open.id !== 'm-title' && open.id !== 'm-pause' && Game.state !== 'play') {
        if (open.id === 'm-help' || open.id === 'm-select') Game.openModal('m-title');
      }
    });

    // touch controls
    document.querySelectorAll('[data-key]').forEach((el) => {
      const k = el.dataset.key;
      const on = (e) => { e.preventDefault(); A.init(); I.setVirtual(k, true); el.classList.add('down'); };
      const off = (e) => { e.preventDefault(); I.setVirtual(k, false); el.classList.remove('down'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
  }

  function buildSelect() {
    const box = $('select-grid');
    box.innerHTML = '';
    MISSIONS.forEach((m, mi) => {
      const list = m.final ? PHASES.final : PHASES.normal;
      const card = document.createElement('div');
      card.className = 'sel-card';
      card.innerHTML = `<div class="sel-head"><span class="sel-num">${mi + 1}</span><div><b>${m.city}</b><small>${m.terrain}</small></div></div>`;
      const row = document.createElement('div');
      row.className = 'sel-row';
      list.forEach((ph) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = PHASE_NAMES[ph];
        b.addEventListener('click', () => { A.init(); A.sfx('select'); Game.startPractice(mi, ph); });
        row.appendChild(b);
      });
      card.appendChild(row);
      box.appendChild(card);
    });
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
