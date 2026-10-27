/**
 * @module physics/shots
 * Shot catalogue and ballistic aiming.
 *
 * A shot is described by a target height on the front wall (`ty`) and a
 * launch speed. `aimAt` finds the launch velocity that makes the ball reach
 * the target under gravity and air drag by simulating a drag-only flight and
 * correcting the vertical component iteratively (3 passes give centimetre
 * accuracy).
 *
 * Speeds are deliberately below professional pace (a pro drive exceeds
 * 40 m/s) so that a player who returns to the T can reach every ball.
 */
import { PHYSICS } from '../config/physics.js';
import { COURT } from '../config/court.js';

/**
 * @typedef {Object} ShotType
 * @property {string} id
 * @property {number} ty        target height on the front wall (m)
 * @property {number} speed     launch speed (m/s), horizontal component
 * @property {number} tyJitter  random height variation (m)
 */

/** @type {Record<string, ShotType>} */
export const SHOTS = Object.freeze({
  drive: { id: 'drive', ty: 1.7, speed: 19, tyJitter: 0.15 },
  smash: { id: 'smash', ty: 0.78, speed: 26, tyJitter: 0.08 },
  lob: { id: 'lob', ty: 3.9, speed: 12.2, tyJitter: 0.2 },
  drop: { id: 'drop', ty: 0.62, speed: 9.5, tyJitter: 0.05 },
  serve: { id: 'serve', ty: 3.3, speed: 13, tyJitter: 0.1 },
  lobServe: { id: 'lobServe', ty: 4.3, speed: 11, tyJitter: 0.1 },
});

/**
 * Simulate a drag+gravity flight (ignoring walls) from `from` with velocity
 * `v` until z reaches `tz`. Returns the height at arrival and time taken.
 */
function flightHeightAt(from, v, tz) {
  let { y, z } = from;
  let { vx, vy, vz } = v;
  const dt = 1 / 480;
  let t = 0;
  for (let i = 0; i < 4000; i++) {
    const sp = Math.hypot(vx, vy, vz);
    const k = PHYSICS.DRAG * sp * dt;
    vx -= vx * k; vy -= vy * k; vz -= vz * k;
    vy -= PHYSICS.G * dt;
    y += vy * dt; z += vz * dt;
    t += dt;
    if ((vz < 0 && z <= tz) || (vz > 0 && z >= tz)) break;
  }
  return { y, t };
}

/**
 * Compute a launch velocity from `from` to the point (tx, ty, tz).
 * @param {{x:number,y:number,z:number}} from
 * @param {number} tx target x (m)
 * @param {number} ty target height (m)
 * @param {number} speed launch speed (m/s), applied to the horizontal component
 * @param {number} [tz=0] target depth (default: the front wall)
 * @returns {{vx:number,vy:number,vz:number}}
 */
export function aimAt(from, tx, ty, speed, tz = 0) {
  const dx = tx - from.x;
  const dz = tz - from.z;
  const dh = Math.max(Math.hypot(dx, dz), 0.05);
  const t0 = dh / speed;
  const v = {
    vx: dx / t0,
    vz: dz / t0,
    vy: (ty - from.y) / t0 + 0.5 * PHYSICS.G * t0,
  };
  // Iteratively correct vy for drag.
  for (let i = 0; i < 3; i++) {
    const { y, t } = flightHeightAt(from, v, tz);
    v.vy += (ty - y) / Math.max(t, 0.02);
  }
  return v;
}

/**
 * Build the velocity for a racket shot aimed at the front wall.
 * @param {{x:number,y:number,z:number}} ball ball position at contact
 * @param {ShotType} shot
 * @param {number} tx desired x on the front wall
 * @param {() => number} [rand] random source in [0,1)
 * @param {number} [fatigue=0] 0 = fresh, 1 = exhausted; adds height scatter and takes pace off the shot
 */
export function strikeVelocity(ball, shot, tx, rand = Math.random, error = 0) {
  // Under pressure the contact is less clean: the ball goes lower on
  // average (tin risk), scatters more in height and width, and loses pace.
  const jitter = shot.tyJitter * (1 + error * 2.5);
  const ty = shot.ty - error * 0.45 + (rand() - 0.5) * 2 * jitter;
  const speed = shot.speed * (1 - Math.min(error, 1.5) * 0.15);
  const x = tx + (rand() - 0.5) * 2 * 0.6 * error;
  const clampedX = Math.min(Math.max(x, 0.15), COURT.W - 0.15);
  return aimAt(ball, clampedX, Math.max(ty, 0.05), speed, 0);
}

/**
 * How awkward a contact is: reaching wide, scraping the floor, hitting on
 * the run or with the ball behind the body. 0 = clean, ~1.5 = desperate.
 * @param {import('../entities/player.js').Player} p
 * @param {{x:number,y:number,z:number}} ball
 */
export function contactPressure(p, ball) {
  // Standing an arm's length beside the ball is the clean position; stretching starts beyond it.
  const stretch = Math.min(1, Math.max(0, Math.abs(ball.x - p.x) - 0.4) / p.reach);
  const low = ball.y < 0.3 ? 0.35 : 0;
  const rushing = Math.min(1, Math.hypot(p.vx, p.vz) / p.speed) * 0.4;
  const behind = ball.z > p.z + 0.2 ? 0.3 : 0;
  return stretch * 0.5 + low + rushing + behind;
}
