/**
 * @module physics/ball
 * Ball state and integration. The ball is a point mass with quadratic air
 * drag, gravity and inelastic collisions with the six court surfaces.
 *
 * The ball knows nothing about the rules; it reports every collision through
 * an event callback so the referee can judge it.
 */
import { COURT } from '../config/court.js';
import { PHYSICS } from '../config/physics.js';

/**
 * @typedef {'floor'|'frontwall'|'backwall'|'sidewall'|'ceiling'} BallEventType
 * @typedef {{x:number,y:number,z:number,speed:number,side?:'left'|'right'}} BallEventInfo
 * @typedef {(type: BallEventType, info: BallEventInfo) => void} BallEventHandler
 */

export class Ball {
  constructor() {
    this.r = PHYSICS.BALL_RADIUS;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    /** false while the ball is held by the server. */
    this.inPlay = false;
    /** Recent positions for the motion trail renderer. */
    this.trail = [];
    this.trailTimer = 0;
  }

  /** Place the ball at rest. */
  reset(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.inPlay = false;
    this.trail.length = 0;
  }

  /** Copy kinematic state from another ball (used for AI prediction). */
  copyFrom(other) {
    this.x = other.x; this.y = other.y; this.z = other.z;
    this.vx = other.vx; this.vy = other.vy; this.vz = other.vz;
    this.inPlay = other.inPlay;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  /** Horizontal speed (m/s). */
  get groundSpeed() {
    return Math.hypot(this.vx, this.vz);
  }

  /**
   * Advance the simulation by dt seconds.
   * @param {number} dt time step (s)
   * @param {BallEventHandler} [onEvent] collision callback
   */
  step(dt, onEvent) {
    if (!this.inPlay) return;
    const r = this.r;

    // Air drag (quadratic) and gravity.
    const sp = this.speed;
    const k = PHYSICS.DRAG * sp * dt;
    this.vx -= this.vx * k;
    this.vy -= this.vy * k;
    this.vz -= this.vz * k;
    this.vy -= PHYSICS.G * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    // Floor.
    if (this.y < r && this.vy < 0) {
      this.y = r;
      this.vy = -this.vy * PHYSICS.FLOOR_BOUNCE;
      this.vx *= PHYSICS.FLOOR_FRICTION;
      this.vz *= PHYSICS.FLOOR_FRICTION;
      if (this.vy < 0.25) this.vy = 0; // stop micro-bounces
      if (onEvent) onEvent('floor', this._info());
    }
    // Front wall.
    if (this.z < r && this.vz < 0) {
      const info = this._info();
      this.z = r;
      this.vz = -this.vz * PHYSICS.WALL_BOUNCE;
      this.vx *= PHYSICS.WALL_FRICTION;
      this.vy *= PHYSICS.WALL_FRICTION;
      if (onEvent) onEvent('frontwall', info);
    }
    // Back wall.
    if (this.z > COURT.L - r && this.vz > 0) {
      const info = this._info();
      this.z = COURT.L - r;
      this.vz = -this.vz * PHYSICS.WALL_BOUNCE;
      this.vx *= PHYSICS.WALL_FRICTION;
      this.vy *= PHYSICS.WALL_FRICTION;
      if (onEvent) onEvent('backwall', info);
    }
    // Side walls.
    if (this.x < r && this.vx < 0) {
      const info = this._info(); info.side = 'left';
      this.x = r;
      this.vx = -this.vx * PHYSICS.WALL_BOUNCE;
      this.vz *= PHYSICS.WALL_FRICTION;
      if (onEvent) onEvent('sidewall', info);
    } else if (this.x > COURT.W - r && this.vx > 0) {
      const info = this._info(); info.side = 'right';
      this.x = COURT.W - r;
      this.vx = -this.vx * PHYSICS.WALL_BOUNCE;
      this.vz *= PHYSICS.WALL_FRICTION;
      if (onEvent) onEvent('sidewall', info);
    }
    // Ceiling.
    if (this.y > COURT.CEILING && this.vy > 0) {
      const info = this._info();
      this.vy = -this.vy * 0.5;
      this.y = COURT.CEILING;
      if (onEvent) onEvent('ceiling', info);
    }

    // Trail sampling (every ~12 ms).
    this.trailTimer += dt;
    if (this.trailTimer > 0.012) {
      this.trailTimer = 0;
      this.trail.push({ x: this.x, y: this.y, z: this.z });
      if (this.trail.length > 14) this.trail.shift();
    }
  }

  /** True when the ball is resting (or nearly so) on the floor. */
  isDead() {
    return this.y <= this.r + 0.002 && this.speed < PHYSICS.DEAD_SPEED;
  }

  _info() {
    return { x: this.x, y: this.y, z: this.z, speed: this.speed };
  }
}
