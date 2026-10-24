import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimAt, strikeVelocity, SHOTS } from '../src/physics/shots.js';
import { Ball } from '../src/physics/ball.js';
import { PHYSICS } from '../src/config/physics.js';
import { COURT } from '../src/config/court.js';

/** Fly a ball with velocity v from `from` and return its height when it reaches the front wall. */
function heightAtFrontWall(from, v) {
  const b = new Ball();
  b.reset(from.x, from.y, from.z);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.inPlay = true;
  let hit = null;
  for (let i = 0; i < 3 / PHYSICS.STEP && !hit; i++) {
    b.step(PHYSICS.STEP, (type, info) => { if (type === 'frontwall') hit = info; });
  }
  return hit;
}

test('aimAt reaches the requested height within a few centimetres despite drag', () => {
  for (const [from, ty, speed] of [
    [{ x: 1, y: 0.6, z: 8.5 }, 1.3, 25],
    [{ x: 5, y: 0.4, z: 3 }, 0.7, 12],
    [{ x: 3.2, y: 1.2, z: 7 }, 3.8, 13],
  ]) {
    const v = aimAt(from, 3.2, ty, speed);
    const hit = heightAtFrontWall(from, v);
    assert.ok(hit, 'ball reaches the front wall');
    assert.ok(Math.abs(hit.y - ty) < 0.06, `height ${hit.y.toFixed(3)} close to ${ty}`);
    assert.ok(Math.abs(hit.x - 3.2) < 0.05, `x ${hit.x.toFixed(3)} close to target`);
  }
});

test('every shot type lands legally from the back of the court', () => {
  for (const id of ['drive', 'smash', 'lob', 'drop']) {
    const from = { x: 3.2, y: 0.7, z: 7.5 };
    const v = strikeVelocity(from, SHOTS[id], 3.2, () => 0.5);
    const hit = heightAtFrontWall(from, v);
    assert.ok(hit, `${id} reaches the front wall`);
    assert.ok(hit.y > COURT.TIN && hit.y < COURT.FRONT_OUT, `${id} between tin and out line (${hit.y.toFixed(2)})`);
  }
});

test('target x is clamped inside the court', () => {
  const from = { x: 6.0, y: 0.7, z: 7.5 };
  const v = strikeVelocity(from, SHOTS.drive, 9, () => 0.5);
  const hit = heightAtFrontWall(from, v);
  assert.ok(hit.x <= COURT.W && hit.x >= COURT.W - 0.3);
});
