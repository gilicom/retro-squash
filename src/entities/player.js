/**
 * @module entities/player
 * A player on court: position, movement toward a target, stamina, racket
 * reach and swing animation state. Shared by the human and the computer
 * opponent; only the controller differs.
 */
import { COURT } from '../config/court.js';
import { STAMINA } from '../config/difficulty.js';

/** Movement bounds (m). Players may not stand inside the walls. */
export const BOUNDS = Object.freeze({
  minX: 0.35, maxX: COURT.W - 0.35,
  minZ: 0.8, maxZ: COURT.L - 0.35,
});

/** The T: where the short line meets the half-court line. Players recover here. */
export const T_POSITION = Object.freeze({ x: COURT.W / 2, z: COURT.SHORT_LINE_Z + 0.55 });

/** Swing animation length (s) and the fraction of it at which the racket meets the ball. */
export const SWING_DURATION = 0.5;
export const SWING_CONTACT = 0.24;
/** How long before the racket reaches the ball the swing must start (s). */
export const SWING_LEAD = SWING_DURATION * SWING_CONTACT;

/**
 * How fast a player should recover to the T: a jog when there is time, a
 * sprint when the opponent is about to strike and the T is far away.
 * "Time available" is roughly how long the ball takes to reach the opponent.
 * @param {Player} player
 * @param {{x:number,z:number,groundSpeed:number}} ball
 * @param {Player} opponent
 * @param {number} jog relaxed recovery speed (m/s)
 * @returns {number} speed cap (m/s)
 */
export function recoverySpeed(player, ball, opponent, jog) {
  // Path the ball still has to travel: via the front wall when it is heading there.
  const path = ball.vz < 0
    ? Math.hypot(ball.x - opponent.x, ball.z + opponent.z)
    : Math.hypot(ball.x - opponent.x, ball.z - opponent.z);
  // Wall and floor contacts take pace off, so the average speed is below the current one.
  const timeAvailable = Math.max(0.25, path / Math.max(1, ball.groundSpeed * 0.8)) + 0.1;
  const needed = (player.distanceFromT / timeAvailable) * 1.2;
  // Even an urgent recovery stays below the sprint to the ball.
  return Math.min(Math.max(jog, needed), player.effectiveSpeed * 0.75);
}

export class Player {
  /**
   * @param {number} index 0 = human, 1 = computer
   * @param {{speed:number, reach:number, color:string, name:string, fitness?:number}} opts
   */
  constructor(index, opts) {
    this.index = index;
    /** Top speed when fresh (m/s). */
    this.speed = opts.speed;
    this.reach = opts.reach;
    this.color = opts.color;
    this.name = opts.name;
    this.fitness = opts.fitness ?? 1;
    this.x = COURT.W / 2;
    this.z = 7;
    this.vx = 0;
    this.vz = 0;
    this.targetX = this.x;
    this.targetZ = this.z;
    /** Stamina reservoir, 0..1. */
    this.stamina = 1;
    /** Optional speed limit set by the controller (e.g. jogging back to the T). */
    this.speedCap = Infinity;
    /** Swing progress: 1 at contact, decays to 0. */
    this.swing = 0;
    /** +1 forehand side (right), -1 backhand side (left). */
    this.swingSide = 1;
    /** Running animation phase (radians). */
    this.runPhase = 0;
    /** When true the player stays where they are (e.g. the server before serving). */
    this.frozen = false;
  }

  /** Teleport to a spot and stop. */
  place(x, z) {
    this.x = this.targetX = x;
    this.z = this.targetZ = z;
    this.vx = this.vz = 0;
    this.swing = 0;
  }

  /** Set the point the player runs toward (clamped to the court). */
  setTarget(x, z) {
    this.targetX = Math.min(Math.max(x, BOUNDS.minX), BOUNDS.maxX);
    this.targetZ = Math.min(Math.max(z, BOUNDS.minZ), BOUNDS.maxZ);
  }

  /** Nudge the target (keyboard movement). */
  moveTarget(dx, dz) {
    this.setTarget(this.targetX + dx, this.targetZ + dz);
  }

  /** Current top speed after fatigue. */
  get effectiveSpeed() {
    return this.speed * (STAMINA.minSpeedFactor + (1 - STAMINA.minSpeedFactor) * this.stamina);
  }

  /** 0 when fresh, 1 when exhausted. */
  get fatigue() {
    return 1 - this.stamina;
  }

  /** Distance from the T (m). */
  get distanceFromT() {
    return Math.hypot(this.x - T_POSITION.x, this.z - T_POSITION.z);
  }

  /**
   * Advance movement, stamina and animation.
   * @param {number} dt seconds
   * @param {{resting?: boolean}} [opts] resting = between rallies (fast recovery)
   */
  update(dt, opts = {}) {
    let moved = 0;
    if (this.frozen) {
      this.vx = this.vz = 0;
    } else {
      const dx = this.targetX - this.x;
      const dz = this.targetZ - this.z;
      const dist = Math.hypot(dx, dz);
      const top = Math.min(this.effectiveSpeed, this.speedCap);
      // Approach speed: full speed when far, eased when within 20 cm.
      const sp = dist < 1e-4 ? 0 : Math.min(top, dist / 0.08);
      const nvx = dist < 1e-4 ? 0 : (dx / dist) * sp;
      const nvz = dist < 1e-4 ? 0 : (dz / dist) * sp;
      // Smooth velocity so animation and shot angles are not jittery.
      const blend = Math.min(1, dt * 12);
      this.vx += (nvx - this.vx) * blend;
      this.vz += (nvz - this.vz) * blend;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      moved = Math.hypot(this.vx, this.vz) * dt;
      if (Math.abs(this.x - this.targetX) < 0.01 && Math.abs(this.z - this.targetZ) < 0.01) {
        this.x = this.targetX; this.z = this.targetZ;
      }
    }

    // Stamina: effort is the fraction of top speed, squared (sprinting costs far more than jogging).
    const speedNow = Math.hypot(this.vx, this.vz);
    const effort = Math.min(1, speedNow / Math.max(0.1, this.speed));
    if (opts.resting) {
      this.stamina += STAMINA.recoverBetweenPoints * this.fitness * dt;
    } else if (effort > 0.45) {
      this.stamina -= STAMINA.drainPerMetre * effort * effort * moved;
    } else {
      const onT = this.distanceFromT < STAMINA.tRadius;
      this.stamina += (onT ? STAMINA.recoverOnT : STAMINA.recoverIdle) * this.fitness * dt;
    }
    this.stamina = Math.min(1, Math.max(0, this.stamina));

    this.runPhase += speedNow * dt * 4.5;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / SWING_DURATION);
  }

  /**
   * True when the ball is within racket reach.
   * @param {{x:number,y:number,z:number}} ball
   */
  canReach(ball) {
    const dz = ball.z - this.z;
    const dx = ball.x - this.x;
    // A right-hander reaches further when the ball is on the natural side for
    // that half of the court (backhand on the left half, forehand on the right)
    // and standing beside it; a ball on the body's wrong side is cramped.
    const naturalSide = ball.x < COURT.W / 2 ? -1 : 1;
    const limit = this.reach * (Math.sign(dx) === naturalSide ? 1.4 : 0.85);
    return Math.abs(dz) < 0.5 && Math.abs(dx) < limit && ball.y > 0 && ball.y < 2.35;
  }

  /**
   * Begin the swing animation. A swing that was started early (see
   * {@link anticipateSwing}) and has not reached contact yet is kept, so the
   * racket meets the ball at the contact keyframe instead of restarting.
   */
  startSwing(side) {
    if (this.swing > 1 - SWING_CONTACT - 0.02) return;
    this.swing = 1;
    this.swingSide = side >= 0 ? 1 : -1;
  }

  /**
   * Start the swing SWING_LEAD seconds before the ball comes within reach, so
   * the contact keyframe lands on the hit: the ball's straight-line position
   * SWING_LEAD ahead is tested with {@link canReach}.
   * @param {{x:number,y:number,z:number,vx:number,vy:number,vz:number}} ball
   */
  anticipateSwing(ball) {
    if (this.swing > 0) return;
    const ahead = { x: ball.x + ball.vx * SWING_LEAD, y: ball.y + ball.vy * SWING_LEAD, z: ball.z + ball.vz * SWING_LEAD };
    if (this.canReach(ahead)) this.startSwing(ahead.x - this.x);
  }
}
