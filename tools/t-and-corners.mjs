// How well the computer holds the T and aims at the corners, from headless matches against the
// harness bot (node tools/t-and-corners.mjs [easy|normal|hard]): the computer's distance from the T
// at the moment the opponent strikes, and where its shots first bounce (distance to the nearest
// corner, split by shot type).
import { Match } from '../src/core/match.js';
import { AIController } from '../src/entities/ai.js';
import { DIFFICULTY, HUMAN } from '../src/config/difficulty.js';
import { T_POSITION } from '../src/entities/player.js';
import { COURT } from '../src/config/court.js';

function mulberry32(a) { return () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const level = process.argv[2] || 'normal';
const tDist = [];           // cpu distance from the T when the human strikes (rally hits, not serves)
const bounces = {};         // shot id -> [{x, z, corner}] first floor bounce of each cpu shot
let samples = 0;
const endings = {};          // 'who:reason' -> { shot id -> count } for the shot that ended the rally
const corners = [[0, 0], [COURT.W, 0], [0, COURT.L], [COURT.W, COURT.L]];
for (let seed = 1; seed <= 4; seed++) {
  const rand = mulberry32(seed);
  const m = new Match({ difficulty: level, bestOf: 1, autoT: true, rand });
  const bot = new AIController(m.human, { ...DIFFICULTY[level], speed: HUMAN.speed, reach: HUMAN.reach }, rand);
  let pending = null, hits = 0, last = null;
  m.on('serve', () => { hits = 0; pending = null; });
  m.on('hit', ({ player, shot }) => {
    hits++;
    last = { player, shot: shot.id };
    if (player === 0 && hits > 1) tDist.push(Math.hypot(m.cpu.x - T_POSITION.x, m.cpu.z - T_POSITION.z));
    pending = player === 1 ? { shot: shot.id, at: { x: +m.ball.x.toFixed(2), y: +m.ball.y.toFixed(2), z: +m.ball.z.toFixed(2) }, v: +m.ball.speed.toFixed(1), vy: +m.ball.vy.toFixed(1) } : null;
  });
  m.on('floor', ({ info }) => {
    if (!pending) return;
    const corner = Math.min(...corners.map(([cx, cz]) => Math.hypot(info.x - cx, info.z - cz)));
    (bounces[pending.shot] ||= []).push({ x: info.x, z: info.z, corner });
    if (process.env.VERBOSE && pending.shot === 'drive' && samples++ < 10) console.log(`drive from (${pending.at.x}, ${pending.at.y}, ${pending.at.z}) speed ${pending.v} vy ${pending.vy} -> first bounce (${info.x.toFixed(2)}, ${info.z.toFixed(2)})`);
    pending = null;
  });
  m.on('rallyEnd', ({ decision }) => {
    pending = null;
    if (last) { const key = `${decision.loser === 1 ? 'cpu' : 'bot'}:${decision.reason} after ${last.player === 1 ? 'cpu' : 'bot'}`; ((endings[key] ||= {})[last.shot] = (endings[key]?.[last.shot] || 0) + 1); }
    last = null;
  });
  m.on('serve', () => { last = null; });
  m.start(1);
  const dt = 1 / 60; let t = 0;
  while (t < 400 && m.state !== 'matchover') {
    if (m.state === 'serve' && m.referee.server === 0 && m.timer < 1.0) m.serve(rand() < 0.3 ? 'lobServe' : 'serve');
    if (m.state === 'rally') {
      bot.update(dt, m.ball, m.referee, m.cpu);
      if (m.referee.turn === 0) m.armed = bot.chooseShot(m.ball, m.cpu).shot;
      m.returnToT = m.referee.turn !== 0;
    }
    m.update(dt, dt); t += dt;
    if (m.state === 'serve') m.timer = Math.min(m.timer, 0.2);
    if (m.state === 'point') m.timer = Math.min(m.timer, 0.05);
  }
}
const q = (a, f) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))] : NaN;
console.log(`=== ${level}: computer at the opponent's strike (${tDist.length} strikes) ===`);
console.log(`distance from the T: median ${q(tDist, 0.5).toFixed(2)} m, 75% within ${q(tDist, 0.75).toFixed(2)} m, 90% within ${q(tDist, 0.9).toFixed(2)} m; on the T (< 0.6 m): ${(100 * tDist.filter((d) => d < 0.6).length / tDist.length).toFixed(0)} %`);
console.log('=== first bounce of the computer\'s shots ===');
for (const [shot, list] of Object.entries(bounces).sort((a, b) => b[1].length - a[1].length)) {
  const c = list.map((b) => b.corner), z = list.map((b) => b.z), side = list.map((b) => Math.min(b.x, COURT.W - b.x));
  console.log(`${shot.padEnd(9)} n ${String(list.length).padStart(3)}  to nearest corner: median ${q(c, 0.5).toFixed(2)} m (75% within ${q(c, 0.75).toFixed(2)})  off the side wall: median ${q(side, 0.5).toFixed(2)} m  depth z: median ${q(z, 0.5).toFixed(2)} (${q(z, 0.25).toFixed(1)}-${q(z, 0.75).toFixed(1)})`);
}
console.log('=== rally endings by the last shot played ===');
for (const [key, byShot] of Object.entries(endings).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) console.log(`${key.padEnd(24)} ${Object.entries(byShot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
