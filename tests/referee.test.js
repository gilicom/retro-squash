import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Referee } from '../src/rules/referee.js';
import { COURT } from '../src/config/court.js';

const ev = (x, y, z) => ({ x, y, z, speed: 10 });

/** Play a legal serve so the rally is live and it is player 1's turn. */
function liveRally(ref) {
  assert.equal(ref.onBallEvent('frontwall', ev(3, 2.5, 0)), null);
  assert.equal(ref.onBallEvent('floor', ev(1.5, 0, 7)), null); // lands in the left back quarter (server on R)
}

test('tin: ball below the board loses the point for the hitter', () => {
  const ref = new Referee();
  const d = ref.onBallEvent('frontwall', ev(3, COURT.TIN - 0.1, 0));
  assert.equal(d.reason, 'tin');
  assert.equal(d.loser, 0);
  assert.deepEqual(ref.points, [0, 1]);
});

test('serve under the service line is a fault', () => {
  const ref = new Referee();
  const d = ref.onBallEvent('frontwall', ev(3, 1.0, 0));
  assert.equal(d.reason, 'serviceLine');
  assert.equal(d.loser, 0);
});

test('serve landing in the wrong quarter is a fault', () => {
  const ref = new Referee();
  ref.onBallEvent('frontwall', ev(3, 2.5, 0));
  const d = ref.onBallEvent('floor', ev(5.5, 0, 7)); // right side, server also on the right
  assert.equal(d.reason, 'serviceFault');
});

test('legal serve then double bounce: point to the server', () => {
  const ref = new Referee();
  liveRally(ref);
  const d = ref.onBallEvent('floor', ev(1.5, 0, 8));
  assert.equal(d.reason, 'notUp');
  assert.equal(d.loser, 1);
  assert.deepEqual(ref.points, [1, 0]);
});

test('a return of serve under the service line but above the tin is legal', () => {
  const ref = new Referee();
  liveRally(ref);
  ref.onHit(1);
  assert.equal(ref.serving, false);
  assert.equal(ref.onBallEvent('frontwall', ev(3, 1.0, 0)), null);
  assert.equal(ref.onBallEvent('floor', ev(3, 0, 3)), null, 'first bounce anywhere is fine');
});

test('hitting the floor before the front wall is down', () => {
  const ref = new Referee();
  liveRally(ref);
  ref.onHit(1);
  const d = ref.onBallEvent('floor', ev(3, 0, 4));
  assert.equal(d.reason, 'down');
  assert.equal(d.loser, 1);
});

test('side wall above the diagonal out line is out', () => {
  const ref = new Referee();
  liveRally(ref);
  ref.onHit(1);
  // Near the back the line is at ~2.3 m; 3 m is out.
  const d = ref.onBallEvent('sidewall', { x: 0, y: 3, z: 9, speed: 10, side: 'left' });
  assert.equal(d.reason, 'out');
  assert.equal(d.loser, 1);
  // Near the front the line is at ~4.4 m; 3 m is fine.
  const ref2 = new Referee();
  liveRally(ref2);
  ref2.onHit(1);
  assert.equal(ref2.onBallEvent('sidewall', { x: 0, y: 3, z: 0.5, speed: 10, side: 'left' }), null);
});

test('server keeps serving and alternates boxes after winning a rally', () => {
  const ref = new Referee();
  assert.equal(ref.serveSide, 'R');
  liveRally(ref);
  ref.onBallEvent('floor', ev(1.5, 0, 8)); // server wins
  assert.equal(ref.server, 0);
  assert.equal(ref.serveSide, 'L');
});

test('serve changes hands when the receiver wins', () => {
  const ref = new Referee();
  ref.onBallEvent('frontwall', ev(3, COURT.TIN - 0.1, 0));
  assert.equal(ref.server, 1);
  assert.equal(ref.serveSide, 'R');
});

test('game ends at 11 with a 2-point margin, match in best of 3', () => {
  const ref = new Referee({ bestOf: 3 });
  ref.points = [10, 10];
  let d = ref._fault(1, 'tin');
  assert.equal(d.gameOver, false, '11-10 is not over');
  d = ref._fault(1, 'tin');
  assert.equal(d.gameOver, true, '12-10 wins the game');
  assert.equal(d.matchOver, false);
  assert.deepEqual(ref.games, [1, 0]);
  ref.nextGame();
  assert.deepEqual(ref.points, [0, 0]);
  assert.equal(ref.server, 0, 'game winner serves');
  ref.points = [10, 3];
  d = ref._fault(1, 'out');
  assert.equal(d.matchOver, true);
  assert.equal(ref.matchOver, true);
});
