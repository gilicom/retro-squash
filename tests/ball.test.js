import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ball } from '../src/physics/ball.js';
import { COURT } from '../src/config/court.js';
import { PHYSICS } from '../src/config/physics.js';

function simulate(ball, seconds, onEvent) {
  const n = Math.round(seconds / PHYSICS.STEP);
  for (let i = 0; i < n; i++) ball.step(PHYSICS.STEP, onEvent);
}

test('a dropped ball bounces lower each time and settles', () => {
  const b = new Ball();
  b.reset(3, 1.5, 5);
  b.inPlay = true;
  const peaks = [];
  let lastY = b.y, rising = false;
  simulate(b, 4, () => {});
  // Re-run tracking peaks.
  b.reset(3, 1.5, 5); b.inPlay = true;
  for (let i = 0; i < 4 / PHYSICS.STEP; i++) {
    b.step(PHYSICS.STEP);
    if (b.vy > 0) rising = true;
    if (rising && b.vy <= 0) { peaks.push(b.y); rising = false; }
    lastY = b.y;
  }
  assert.ok(peaks.length >= 2, 'should bounce at least twice');
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], 'peaks decrease');
  assert.ok(lastY < 0.05, 'ball ends on the floor');
  assert.ok(b.isDead(), 'ball is reported dead');
});

test('ball stays inside the court', () => {
  const b = new Ball();
  b.reset(3.2, 1, 7);
  b.vx = 9; b.vy = 6; b.vz = -20;
  b.inPlay = true;
  for (let i = 0; i < 5 / PHYSICS.STEP; i++) {
    b.step(PHYSICS.STEP);
    assert.ok(b.x >= 0 && b.x <= COURT.W, `x in court (${b.x})`);
    assert.ok(b.z >= 0 && b.z <= COURT.L, `z in court (${b.z})`);
    assert.ok(b.y >= 0, 'never below the floor');
  }
});

test('collision events are reported with the pre-impact position', () => {
  const b = new Ball();
  b.reset(3.2, 1.0, 2);
  b.vz = -15;
  b.inPlay = true;
  const events = [];
  simulate(b, 0.5, (type, info) => events.push({ type, info }));
  const fw = events.find((e) => e.type === 'frontwall');
  assert.ok(fw, 'front wall event fired');
  assert.ok(fw.info.y > 0.5 && fw.info.y < 1.0, `impact height plausible (${fw.info.y})`);
  assert.ok(fw.info.speed > 10, 'impact speed reported');
});

test('air drag slows the ball', () => {
  const b = new Ball();
  b.reset(3.2, 3, 9);
  b.vz = -25;
  b.inPlay = true;
  const v0 = b.speed;
  simulate(b, 0.25);
  assert.ok(b.speed < v0, 'speed decreases in flight');
});
