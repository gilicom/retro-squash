/**
 * Headless match statistics for balancing the AI and the shot model.
 *
 * Usage:  node tools/play-match.js [difficulty] [seeds]
 *   difficulty: easy | normal | hard   (default: all three)
 *   seeds:      how many matches per difficulty (default 3)
 *
 * The human is driven by a bot of normal strength. Prints rally counts,
 * average rally length, win ratio and how rallies end.
 */
import { Match } from '../src/core/match.js';
import { AIController } from '../src/entities/ai.js';
import { DIFFICULTY, HUMAN } from '../src/config/difficulty.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function playMatch({ seed = 1, seconds = 900, difficulty = 'normal', botDifficulty = 'normal', bestOf = 1 } = {}) {
  const rand = mulberry32(seed);
  const m = new Match({ difficulty, bestOf, autoT: true, rand });
  const bot = new AIController(m.human, { ...DIFFICULTY[botDifficulty], speed: HUMAN.speed, reach: HUMAN.reach }, rand);
  const stats = { rallies: [], hits: 0, maxHits: 0, minStamina: [1, 1], longest: 0, rallyTime: 0 };
  m.on('hit', () => stats.hits++);
  m.on('rallyEnd', ({ decision }) => {
    stats.rallies.push({ winner: decision.winner, reason: decision.reason, hits: stats.hits, time: stats.rallyTime });
    stats.maxHits = Math.max(stats.maxHits, stats.hits);
    stats.longest = Math.max(stats.longest, stats.rallyTime);
    stats.hits = 0;
    stats.rallyTime = 0;
  });
  m.on('gameOver', () => m.nextGame());
  m.start(bestOf);
  const dt = 1 / 60;
  let t = 0;
  while (t < seconds && m.state !== 'matchover') {
    if (m.state === 'serve' && m.referee.server === 0 && m.timer < 1.0) m.serve(rand() < 0.3 ? 'lobServe' : 'serve');
    if (m.state === 'rally') { bot.update(dt, m.ball, m.referee, m.cpu); m.returnToT = false; stats.rallyTime += dt; }
    m.update(dt, dt);
    t += dt;
    stats.minStamina[0] = Math.min(stats.minStamina[0], m.human.stamina);
    stats.minStamina[1] = Math.min(stats.minStamina[1], m.cpu.stamina);
    if (m.state === 'serve') m.timer = Math.min(m.timer, 0.2);
    if (m.state === 'point') m.timer = Math.min(m.timer, 0.05);
  }
  return { m, stats, elapsed: t };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('play-match.js')) {
  const which = process.argv[2] ? [process.argv[2]] : ['easy', 'normal', 'hard'];
  const seeds = Number(process.argv[3] || 3);
  for (const difficulty of which) {
    let rallies = [], wins = 0, minSt = [1, 1], longest = 0, finished = 0;
    for (let s = 1; s <= seeds; s++) {
      const { m, stats } = playMatch({ seed: s, difficulty });
      rallies = rallies.concat(stats.rallies);
      wins += stats.rallies.filter((r) => r.winner === 0).length;
      minSt = [Math.min(minSt[0], stats.minStamina[0]), Math.min(minSt[1], stats.minStamina[1])];
      longest = Math.max(longest, stats.longest);
      if (m.state === 'matchover') finished++;
    }
    const by = {};
    for (const r of rallies) { const k = `${r.winner === 0 ? 'you' : 'cpu'}:${r.reason}`; by[k] = (by[k] || 0) + 1; }
    const avg = rallies.reduce((a, r) => a + r.hits, 0) / Math.max(1, rallies.length);
    console.log(`\n=== ${difficulty} (${seeds} matches, ${finished} finished) ===`);
    console.log(`rallies ${rallies.length}, human win ratio ${(wins / Math.max(1, rallies.length)).toFixed(2)}, avg hits ${avg.toFixed(1)}, longest rally ${longest.toFixed(1)}s, min stamina ${minSt.map((v) => v.toFixed(2))}`);
    console.log('endings:', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
  }
}
