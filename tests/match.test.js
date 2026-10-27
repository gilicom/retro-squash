/**
 * Headless integration test: a full match between the computer opponent and
 * a bot driving the human player, run with a seeded random source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, POINT_PAUSE } from '../src/core/match.js';
import { AIController } from '../src/entities/ai.js';
import { DIFFICULTY, HUMAN } from '../src/config/difficulty.js';
import { COURT } from '../src/config/court.js';

/** Seeded PRNG so failures are reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run a match for up to `seconds` of simulated time.
 * The human is driven by an AIController of the given difficulty.
 */
function playMatch({ seed = 1, seconds = 600, difficulty = 'normal', botDifficulty = 'normal', bestOf = 1 } = {}) {
  const rand = mulberry32(seed);
  const m = new Match({ difficulty, bestOf, autoT: true, rand });
  const bot = new AIController(m.human, { ...DIFFICULTY[botDifficulty], speed: HUMAN.speed, reach: HUMAN.reach }, rand);
  const stats = { rallies: [], hits: 0, maxHits: 0, minStamina: [1, 1], outOfCourt: 0, serves: 0 };
  m.on('hit', () => stats.hits++);
  m.on('serve', () => stats.serves++);
  m.on('rallyEnd', ({ decision }) => {
    stats.rallies.push({ winner: decision.winner, reason: decision.reason, hits: stats.hits });
    stats.maxHits = Math.max(stats.maxHits, stats.hits);
    stats.hits = 0;
  });
  m.on('gameOver', () => m.nextGame());
  m.start(bestOf);

  const dt = 1 / 60;
  let t = 0;
  while (t < seconds && m.state !== 'matchover') {
    // The bot plays the human's part; serve as soon as the ball is ready.
    if (m.state === 'serve' && m.referee.server === 0 && m.timer < 1.0) m.serve(rand() < 0.3 ? 'lobServe' : 'serve');
    if (m.state === 'rally') {
      bot.update(dt, m.ball, m.referee, m.cpu);
      m.returnToT = false; // the bot counts as player input, which cancels the T assist
    }
    m.update(dt, dt);
    t += dt;
    for (const p of m.players) {
      if (p.x < 0 || p.x > COURT.W || p.z < 0 || p.z > COURT.L) stats.outOfCourt++;
    }
    stats.minStamina[0] = Math.min(stats.minStamina[0], m.human.stamina);
    stats.minStamina[1] = Math.min(stats.minStamina[1], m.cpu.stamina);
    if (m.state === 'serve') m.timer = Math.min(m.timer, 0.2); // skip the serve pause
    if (m.state === 'point') m.timer = Math.min(m.timer, 0.05); // skip the message pause
  }
  return { m, stats, elapsed: t };
}

test('a single game completes with realistic rallies', () => {
  const { m, stats, elapsed } = playMatch({ seed: 7, seconds: 900, bestOf: 1 });
  assert.equal(m.state, 'matchover', `match should finish (elapsed ${elapsed.toFixed(0)}s, score ${m.referee.points})`);
  const n = stats.rallies.length;
  assert.ok(n >= 11, `at least 11 rallies (${n})`);
  const avg = stats.rallies.reduce((a, r) => a + r.hits, 0) / n;
  assert.ok(avg >= 2, `rallies average at least 2 racket contacts (${avg.toFixed(2)})`);
  assert.ok(stats.maxHits >= 6, `some rallies are long (${stats.maxHits})`);
  const reasons = new Set(stats.rallies.map((r) => r.reason));
  assert.ok(reasons.size >= 2, `rallies end for more than one reason (${[...reasons]})`);
  assert.equal(stats.outOfCourt, 0, 'players never leave the court');
  const [h, c] = stats.minStamina;
  assert.ok(h < 0.97 && c < 0.97, `stamina is actually used (${h.toFixed(2)}, ${c.toFixed(2)})`);
  assert.ok(h > 0 && c > 0, 'stamina never pins at zero for a whole game');
});

test('both sides win points: the match is not one-sided', () => {
  const { stats } = playMatch({ seed: 3, seconds: 900, bestOf: 1 });
  const wins = [0, 0];
  for (const r of stats.rallies) wins[r.winner]++;
  assert.ok(wins[0] >= 3 && wins[1] >= 3, `both players win rallies (${wins})`);
});

test('easy opponent loses more often than hard opponent', () => {
  const ratio = (difficulty) => {
    let won = 0, total = 0;
    for (const seed of [11, 12, 13]) {
      const { stats } = playMatch({ seed, seconds: 600, difficulty, botDifficulty: 'normal', bestOf: 1 });
      for (const r of stats.rallies) { total++; if (r.winner === 0) won++; }
    }
    return won / total;
  };
  const easy = ratio('easy');
  const hard = ratio('hard');
  assert.ok(easy > hard, `human wins more vs easy (${easy.toFixed(2)}) than vs hard (${hard.toFixed(2)})`);
});

test('point pause then the next serve is set up with the ball in the server hand', () => {
  const rand = mulberry32(5);
  const m = new Match({ rand, bestOf: 1 });
  m.start(1);
  assert.equal(m.state, 'serve');
  m._endRally({ winner: 1, loser: 0, reason: 'tin', gameOver: false, matchOver: false });
  assert.equal(m.state, 'point');
  m.update(POINT_PAUSE + 0.1, POINT_PAUSE + 0.1);
  assert.equal(m.state, 'serve');
  const server = m.players[m.referee.server];
  const hand = m.handPosition(server, m.referee.serveSide);
  assert.ok(Math.abs(m.ball.x - hand.x) < 1e-6 && Math.abs(m.ball.z - hand.z) < 1e-6);
  assert.equal(m.ball.inPlay, false);
});

test('after a rally ends the ball keeps moving under physics', () => {
  const rand = mulberry32(9);
  const m = new Match({ rand, bestOf: 1 });
  m.start(1);
  m.serve('serve');
  // Force a decision while the ball is in flight.
  const before = { x: m.ball.x, z: m.ball.z };
  m._endRally({ winner: 1, loser: 0, reason: 'tin', gameOver: false, matchOver: false });
  assert.equal(m.state, 'point');
  for (let i = 0; i < 30; i++) m.update(1 / 60, 0); // real = 0 so the point pause never expires
  assert.ok(Math.hypot(m.ball.x - before.x, m.ball.z - before.z) > 0.5, 'ball travelled after the decision');
  assert.ok(m.ball.inPlay, 'ball still in play');
});
