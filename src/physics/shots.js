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
  /** Boast: into the nearer side wall first, then the front wall. Target height is on the side wall. */
  boast: { id: 'boast', ty: 1.3, speed: 16, tyJitter: 0.1, wall: 'side' },
  /** Back-wall boast: lifted into the back wall at 35° so it loops to the front wall (launch angle, not a target). */
  backBoast: { id: 'backBoast', ty: 0, speed: 15.5, tyJitter: 0, wall: 'back', elevation: 35 },
});

/**
 * Velocity for a boast: aim at a point on the nearer side wall, about 2.5 m
 * from the front wall, so the rebound carries to the front wall.
 * @param {{x:number,y:number,z:number}} ball
 * @param {ShotType} shot
 * @param {() => number} [rand]
 * @param {number} [error=0]
 */
export function boastVelocity(ball, shot, rand = Math.random, error = 0) {
  const wallX = ball.x < COURT.W / 2 ? 0.02 : COURT.W - 0.02;
  const tz = Math.max(1.2, Math.min(3.2, ball.z * 0.32)) + (rand() - 0.5) * 0.4 * (1 + error);
  const ty = shot.ty - error * 0.3 + (rand() - 0.5) * 2 * shot.tyJitter * (1 + error * 2);
  return aimAt(ball, wallX, Math.max(ty, 0.3), shot.speed * (1 - Math.min(error, 1.5) * 0.12), tz);
}

/**
 * Velocity for a back-wall boast: lift the ball into the back wall so it
 * rebounds high and forward to the front wall.
 */
export function backBoastVelocity(ball, shot, rand = Math.random, error = 0) {
  const el = (shot.elevation + (rand() - 0.5) * 8 * (1 + error)) * Math.PI / 180;
  const speed = shot.speed * (1 - Math.min(error, 1.5) * 0.1) * (1 + (rand() - 0.5) * 0.08);
  return {
    vx: (COURT.W / 2 - ball.x) * 0.3 + (rand() - 0.5) * 1.5,
    vy: speed * Math.sin(el),
    vz: speed * Math.cos(el), // toward the back wall
  };
}

/**
 * The shot a player is forced into when the ball is behind the body deep in
 * the back of the court: a boast into the near side wall when the ball is
 * in a back corner, a back-wall boast when it is deep in the middle.
 * @param {{x:number,z:number}} p player
 * @param {{x:number,z:number}} ball
 * @returns {ShotType|null} the forced shot, or null when a normal shot is possible
 */
export function forcedShot(p, ball) {
  const behind = ball.z > p.z + 0.12;
  const deep = ball.z > COURT.L - 1.0;
  if (!behind || !deep) return null;
  const nearSide = ball.x < 1.0 || ball.x > COURT.W - 1.0;
  return nearSide ? SHOTS.boast : SHOTS.backBoast;
}

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
  if (shot.wall === 'side') return boastVelocity(ball, shot, rand, error);
  if (shot.wall === 'back') return backBoastVelocity(ball, shot, rand, error);
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
  // An arm plus a racket beside the ball (about 0.95 m) is the clean position; stretching starts
  // beyond it, and so does cramping when the ball comes in on the body.
  const dx = Math.abs(ball.x - p.x);
  const stretch = Math.min(1, Math.max(0, dx - 0.95) / p.reach) + Math.max(0, 0.45 - dx) * 1.5;
  const low = ball.y < 0.3 ? 0.35 : 0;
  const rushing = Math.min(1, Math.hypot(p.vx, p.vz) / p.speed) * 0.4;
  const behind = ball.z > p.z + 0.2 ? 0.3 : 0;
  return stretch * 0.5 + low + rushing + behind;
}
