/**
 * World ranking: the rating formula, nickname validation and the offline
 * queue of the ranking client (with a fake adapter and in-memory storage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingDelta, nextRating, expectedScore, INITIAL_RATING, MIN_RATING, CPU_RATING } from '../src/ranking/rating.js';
import { validateNickname, loadIdentity, IDENTITY_KEY } from '../src/ranking/identity.js';
import { Ranking, RankingError, QUEUE_KEY } from '../src/ranking/ranking.js';
import { aimTargetX } from '../src/core/match.js';

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const result = (over = {}) => ({
  difficulty: 'normal', bestOf: 3, pace: 'normal', autoT: true, won: true,
  games: [2, 0], gameScores: [[11, 5], [11, 7]], rallies: 34, longestRally: 9, duration: 240, startedAt: Date.now(), ...over,
});

test('expected score is symmetric and 0.5 between equals', () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
  assert.ok(Math.abs(expectedScore(1000, 1200) + expectedScore(1200, 1000) - 1) < 1e-12);
  assert.ok(expectedScore(1500, 900) > 0.95);
});

test('beating a stronger computer is worth more than beating a weaker one', () => {
  const base = { rating: INITIAL_RATING, matches: 0, won: true, bestOf: 3 };
  const easy = ratingDelta({ ...base, difficulty: 'easy' });
  const normal = ratingDelta({ ...base, difficulty: 'normal' });
  const hard = ratingDelta({ ...base, difficulty: 'hard' });
  assert.ok(easy < normal && normal < hard, `${easy} < ${normal} < ${hard}`);
  assert.ok(hard > 30, 'a new player beating hard gains a lot');
});

test('losing to easy costs more than losing to hard; a loss is never a gain', () => {
  const base = { rating: INITIAL_RATING, matches: 0, won: false, bestOf: 3 };
  const easy = ratingDelta({ ...base, difficulty: 'easy' });
  const hard = ratingDelta({ ...base, difficulty: 'hard' });
  assert.ok(easy < hard && easy < 0 && hard <= 0);
});

test('match length and pace scale the K factor; provisional players move faster', () => {
  const base = { rating: INITIAL_RATING, matches: 0, difficulty: 'hard', won: true };
  assert.ok(ratingDelta({ ...base, bestOf: 1 }) < ratingDelta({ ...base, bestOf: 3 }));
  assert.ok(ratingDelta({ ...base, bestOf: 3 }) < ratingDelta({ ...base, bestOf: 5 }));
  assert.ok(ratingDelta({ ...base, bestOf: 3, pace: 'relaxed' }) < ratingDelta({ ...base, bestOf: 3, pace: 'normal' }));
  assert.ok(ratingDelta({ ...base, bestOf: 3, matches: 50 }) < ratingDelta({ ...base, bestOf: 3, matches: 0 }));
});

test('ratings converge toward the computer level and never drop below the floor', () => {
  let r = INITIAL_RATING, n = 0;
  for (; n < 200; n++) r = nextRating({ rating: r, matches: n, difficulty: 'hard', won: true, bestOf: 3 });
  assert.ok(r > CPU_RATING.hard, `always beating hard climbs above ${CPU_RATING.hard}: ${r}`);
  r = INITIAL_RATING;
  for (n = 0; n < 500; n++) r = nextRating({ rating: r, matches: n, difficulty: 'easy', won: false, bestOf: 5 });
  assert.ok(r >= MIN_RATING && r < 300, `always losing to easy settles far below ${CPU_RATING.easy} but never under ${MIN_RATING}: ${r}`);
  assert.equal(nextRating({ rating: MIN_RATING, matches: 0, difficulty: 'easy', won: false, bestOf: 5 }), MIN_RATING);
});

test('nickname validation', () => {
  assert.deepEqual(validateNickname('  Gili  '), { ok: true, value: 'Gili' });
  assert.deepEqual(validateNickname('גילי 42'), { ok: true, value: 'גילי 42' });
  assert.equal(validateNickname('a').reason, 'short');
  assert.equal(validateNickname('x'.repeat(17)).reason, 'long');
  assert.equal(validateNickname('<script>').reason, 'chars');
  assert.equal(validateNickname('drop;table').reason, 'chars');
});

test('identity is created once and reloaded', () => {
  const storage = new MemoryStorage();
  const a = loadIdentity(storage);
  const b = loadIdentity(storage);
  assert.equal(a.id, b.id);
  assert.equal(a.key, b.key);
  assert.match(a.key, /^[0-9a-f]{64}$/);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.ok(storage.getItem(IDENTITY_KEY));
});

test('results queue offline and flush in order when the backend is back', async () => {
  const storage = new MemoryStorage();
  const identity = loadIdentity(storage);
  const sent = [];
  let online = false;
  const adapter = {
    async submit({ playerId, key, nickname, result: r }) {
      if (!online) throw new RankingError('network', 'offline');
      sent.push(r.bestOf);
      assert.equal(playerId, identity.id); assert.equal(key, identity.key); assert.equal(nickname, 'Gili');
      return { rating: 1000 + sent.length, delta: 1, rank: 3, matches: sent.length, wins: sent.length };
    },
    async top() { return []; },
    async me() { return null; },
    async rename() {},
  };
  const ranking = new Ranking({ adapter, identity, storage });
  await ranking.setNickname('Gili');
  await ranking.submit(result({ bestOf: 1 }));
  await ranking.submit(result({ bestOf: 3 }));
  assert.equal(ranking.pending, 2);
  assert.equal(sent.length, 0);
  assert.ok(ranking.estimate().provisional);
  assert.ok(ranking.estimate().rating > INITIAL_RATING);

  // A fresh client on the same device picks the queue up from storage.
  online = true;
  const again = new Ranking({ adapter, identity, storage });
  assert.equal(again.pending, 2);
  await again.flush();
  assert.deepEqual(sent, [1, 3]);
  assert.equal(again.pending, 0);
  assert.equal(again.state.rating, 1002);
  assert.equal(again.state.rank, 3);
  assert.equal(JSON.parse(storage.getItem(QUEUE_KEY)).length, 0);
});

test('a rejected result is dropped without blocking the rest', async () => {
  const storage = new MemoryStorage();
  const identity = loadIdentity(storage);
  const sent = [];
  const adapter = {
    async submit({ result: r }) {
      if (r.bestOf === 1) throw new RankingError('rejected', 'bad shape', 400);
      sent.push(r.bestOf);
      return { rating: 1010, delta: 10, rank: 1, matches: 1, wins: 1 };
    },
    async top() { return []; }, async me() { return null; }, async rename() {},
  };
  const ranking = new Ranking({ adapter, identity, storage });
  const events = [];
  ranking.onChange((kind) => events.push(kind));
  await ranking.setNickname('Gili');
  await ranking.submit(result({ bestOf: 1 }));
  await ranking.submit(result({ bestOf: 5 }));
  assert.deepEqual(sent, [5]);
  assert.ok(events.includes('rejected'));
  assert.equal(ranking.pending, 0);
});

test('without a nickname nothing is sent; the queue waits', async () => {
  const storage = new MemoryStorage();
  const identity = loadIdentity(storage);
  let calls = 0;
  const adapter = { async submit() { calls++; return {}; }, async top() { return []; }, async me() { return null; }, async rename() {} };
  const ranking = new Ranking({ adapter, identity, storage });
  await ranking.submit(result());
  assert.equal(calls, 0);
  assert.equal(ranking.pending, 1);
});

test('aimed shots continue the drag direction to the front wall', () => {
  const ball = { x: 3.2, z: 6.0 };
  assert.ok(Math.abs(aimTargetX(ball, { dx: 0, dz: -1 }) - 3.2) < 1e-9, 'straight ahead');
  assert.ok(Math.abs(aimTargetX(ball, { dx: 1, dz: -2 }) - 6.2) < 1e-9, 'half a metre across per metre forward');
  assert.ok(aimTargetX(ball, { dx: -1, dz: -2 }) < 3.2, 'left drag goes left');
  // A sideways or backward drag is bent forward instead of producing an infinite target.
  const side = aimTargetX(ball, { dx: 1, dz: 0 });
  const back = aimTargetX(ball, { dx: 1, dz: 1 });
  assert.ok(Number.isFinite(side) && side > 3.2 && side < 40);
  assert.ok(Number.isFinite(back) && back > 3.2 && back < 40);
});
