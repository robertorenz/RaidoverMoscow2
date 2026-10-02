/* Headless campaign simulator: plays the whole game on autopilot against a
   mock canvas to verify stage flow and catch runtime errors.
   usage: node tools/simulate.js [difficulty 0-2] [god 0/1] [mission 0-4] [phase] */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stubEl = () => new Proxy({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} }, {
  get(t, k) { if (k in t) return t[k]; if (k === 'querySelector') return () => null; if (k === 'querySelectorAll') return () => []; return typeof k === 'string' && /^(add|remove|focus|append|set)/.test(k) ? () => {} : undefined; },
  set(t, k, v) { t[k] = v; return true; },
});
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const sandbox = {
  console, Math, JSON, Map, Set, Array, Object, String, Number, Proxy, Infinity, NaN, parseInt, parseFloat, isNaN,
  setTimeout: (f) => { pending.push(f); return 0; }, clearInterval() {}, setInterval() { return 0; },
  performance: { now: () => 0 },
  location: { search: '' },
  URLSearchParams,
  navigator: {},
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => stubEl(), querySelectorAll: () => [], querySelector: () => null, body: stubEl() },
};
const pending = [];
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox);
const files = ['util', 'render3d', 'models', 'fx', 'audio', 'stages/hangar', 'stages/flight', 'stages/silo', 'stages/kremlin', 'stages/reactor', 'game'];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });

const ROM = sandbox.ROM, G = ROM.Game;
ROM.R.ctx = ctx;
G.diffIdx = parseInt(process.argv[2] || '1', 10);
if (process.argv[4]) { G.startPractice(parseInt(process.argv[4], 10), process.argv[5]); G.campaign.practice = false; } else G.startCampaign();
G.campaign.planes = 60;
G.campaign.cities = Array(40).fill('Testville');
G.god = process.argv[3] === '1';
G.autoplay = true;

const dt = 1 / 60;
let t = 0, lastKey = '', log = [], deaths = 0, phaseT = 0;
const origDeath = G.onDeath.bind(G);
G.onDeath = (info) => { deaths++; log.push(`  ✗ died in ${G.phase()} (${G.stage.deathWhy || 'ground'}) at t=${t.toFixed(1)}`); origDeath(info); };
while (t < 60 * 60) {
  if (G.state === 'brief') G.startPhase();
  if (G.state === 'over') break;
  G.update(dt);
  while (pending.length) pending.shift()();
  if (Math.round(t * 60) % 20 === 0) G.draw(ctx);
  const key = G.campaign.mission + ':' + G.phase();
  if (key !== lastKey) { log.push(`[${t.toFixed(1)}s] mission ${G.campaign.mission + 1} ${G.missionInfo().city} -> ${G.phase()} (score ${G.campaign.score})`); lastKey = key; phaseT = 0; }
  phaseT += dt;
  if (phaseT > 600) { log.push('!! stuck in ' + key); break; }
  t += dt;
}
console.log(log.join('\n'));
console.log(`final state=${G.state} t=${t.toFixed(0)}s score=${G.campaign.score} deaths=${deaths} cities lost=${40 - G.campaign.cities.length}`);
