// Rally-by-rally log of one headless match between the computer and the harness bot
// (node tools/match-log.mjs [seed] [easy|normal|hard]): who won each rally and how (the fault and
// the last shot played), the number of racket contacts, and both players' stamina afterwards.
// Useful to see a fatigue spiral or a shot type that keeps failing (e.g. boasts from the back).
import { Match } from '../src/core/match.js';
import { AIController } from '../src/entities/ai.js';
import { DIFFICULTY, HUMAN } from '../src/config/difficulty.js';

function mulberry32(a) { return () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seed = +(process.argv[2] || 3);
const level = process.argv[3] || 'normal';
const rand = mulberry32(seed);
const m = new Match({ difficulty: level, bestOf: 1, autoT: true, rand });
const bot = new AIController(m.human, { ...DIFFICULTY[level], speed: HUMAN.speed, reach: HUMAN.reach }, rand);
let hits = 0, last = '';
m.on('serve', () => { hits = 0; });
m.on('hit', ({ player, shot }) => { hits++; last = (player ? 'cpu ' : 'bot ') + shot.id; });
m.on('rallyEnd', ({ decision }) => console.log(`rally ${String(m.referee.history.length).padStart(2)}: ${decision.winner === 0 ? 'bot' : 'cpu'} wins (${decision.loser === 0 ? 'bot' : 'cpu'} ${decision.reason} after ${last})  hits ${String(hits).padStart(3)}  stamina bot ${m.human.stamina.toFixed(2)} cpu ${m.cpu.stamina.toFixed(2)}`));
m.start(1);
const dt = 1 / 60; let t = 0;
while (t < 900 && m.state !== 'matchover') {
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
console.log(`score bot ${m.referee.points[0]} - cpu ${m.referee.points[1]} after ${t.toFixed(0)} s (seed ${seed}, ${level})`);
