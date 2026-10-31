// Trace rallies in headless matches: event sequences with player positions, endings, and the serve returns that came off the back wall (node tools/rally-trace.mjs [easy|normal|hard]).
import { Match } from '../src/core/match.js';
import { AIController } from '../src/entities/ai.js';
import { DIFFICULTY, HUMAN } from '../src/config/difficulty.js';

function mulberry32(a) { return () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const level = process.argv[2] || 'normal';
const summary = { rallies: 0, returnOffBackWall: 0, endings: {}, returnEndings: {}, secondShot: {}, samples: [] };
for (let seed = 1; seed <= 4; seed++) {
  const rand = mulberry32(seed);
  const m = new Match({ difficulty: level, bestOf: 1, autoT: true, rand });
  const bot = new AIController(m.human, { ...DIFFICULTY[level], speed: HUMAN.speed, reach: HUMAN.reach }, rand);
  let events = [];
  m.on('serve', ({ server }) => { events = [{ t: 'serve', p: server }]; });
  m.on('wall', ({ type, info }) => events.push({ t: type, z: +info.z.toFixed(2), y: +info.y.toFixed(2), clock: +m.rallyClock.toFixed(2), h: [+m.human.x.toFixed(2), +m.human.z.toFixed(2), +m.human.targetX.toFixed(2), +m.human.targetZ.toFixed(2)], c: [+m.cpu.x.toFixed(2), +m.cpu.z.toFixed(2)] }));
  m.on('floor', ({ info }) => events.push({ t: 'floor', z: +info.z.toFixed(2), x: +info.x.toFixed(2), clock: +m.rallyClock.toFixed(2), h: [+m.human.x.toFixed(2), +m.human.z.toFixed(2), +m.human.targetX.toFixed(2), +m.human.targetZ.toFixed(2)], c: [+m.cpu.x.toFixed(2), +m.cpu.z.toFixed(2)], turn: m.referee.turn }));
  m.on('hit', ({ player, shot, ball }) => events.push({ t: 'hit', p: player, shot: shot.id, z: +ball.z.toFixed(2), x: +ball.x.toFixed(2), y: +ball.y.toFixed(2), vz: +m.ball.vz.toFixed(1) }));
  m.on('rallyEnd', ({ decision }) => {
    summary.rallies++;
    const hits = events.filter((e) => e.t === 'hit');
    const key = `${decision.loser}:${decision.reason}`;
    summary.endings[key] = (summary.endings[key] || 0) + 1;
    // The return of serve came after the ball hit the back wall.
    const firstHit = events.findIndex((e) => e.t === 'hit');
    const backBefore = firstHit > 0 && events.slice(0, firstHit).some((e) => e.t === 'backwall');
    if (key === '0:notUp' && summary.samples.length < 3) summary.samples.push({ seed, ending: key, events: events.slice(0, 14) });
    if (backBefore) {
      summary.returnOffBackWall++;
      summary.returnEndings[key] = (summary.returnEndings[key] || 0) + 1;
      const k2 = hits.length >= 2 ? 'returned' : 'not returned';
      summary.secondShot[k2] = (summary.secondShot[k2] || 0) + 1;
      summary.samples.push({ seed, ending: key, events: events.slice(0, 16) });
    }
  });
  m.on('gameOver', () => m.nextGame());
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
console.log(JSON.stringify(summary, null, 1));
