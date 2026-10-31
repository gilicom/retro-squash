/**
 * @module entities/ai
 * Computer opponent. It predicts where the ball will be playable by running
 * a private copy of the ball physics forward, runs there (with a positional
 * error that shrinks at higher difficulty), and picks a shot based on where
 * the human is standing.
 */
import { Ball } from '../physics/ball.js';
import { SHOTS, forcedShot } from '../physics/shots.js';
import { COURT } from '../config/court.js';
import { RECOVERY_SPEED } from '../config/difficulty.js';
import { T_POSITION, recoverySpeed } from './player.js';

/** Lateral distance the player stands from the ball's path (m): racket arm's length. */
export const STANCE_OFFSET = 0.8;

/** Gaussian random number (Box-Muller). */
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}


export class AIController {
  /**
   * @param {import('./player.js').Player} player
   * @param {import('../config/difficulty.js').DIFFICULTY[keyof typeof DIFFICULTY]} difficulty
   * @param {() => number} [rand]
   */
  constructor(player, difficulty, rand = Math.random) {
    this.p = player;
    this.d = difficulty;
    this.rand = rand;
    this.timer = 0;
    this.prediction = null;
    this.err = { x: 0, z: 0 };
    this.scratch = new Ball();
  }

  /** Change difficulty mid-match (applies on the next prediction). */
  setDifficulty(d) {
    this.d = d;
    this.p.speed = d.speed;
    this.p.reach = d.reach;
  }

  /**
   * Decide where to run this frame.
   * @param {number} dt
   * @param {Ball} ball
   * @param {import('../rules/referee.js').Referee} ref
   * @param {import('./player.js').Player} opponent
   */
  update(dt, ball, ref, opponent) {
    this.timer -= dt;
    const myTurn = ball.inPlay && ref.turn === this.p.index;
    if (!myTurn) {
      this.prediction = null;
      // Jog back to the T (a relaxed recovery saves stamina), stepping aside from the opponent.
      const side = opponent.x > COURT.W / 2 ? -0.55 : 0.55;
      this.p.setTarget(T_POSITION.x + side, T_POSITION.z);
      this.p.speedCap = recoverySpeed(this.p, ball, opponent, RECOVERY_SPEED);
      return;
    }
    this.p.speedCap = Infinity;
    if (this.timer <= 0) {
      this.timer = this.d.reaction;
      const pred = this.predict(ball, ref);
      if (pred) {
        this.prediction = pred;
        // Positional error grows with the distance to cover and with fatigue.
        const far = 1 + Math.hypot(pred.x - this.p.x, pred.z - this.p.z) / 3;
        const tired = 1 + this.p.fatigue * 1.5;
        const e = this.d.error * far * tired;
        this.err = { x: gauss(this.rand) * e, z: gauss(this.rand) * e * 0.6 };
      }
    }
    if (this.prediction) {
      // Stand beside the ball, not on it: to the right of a ball on the left half
      // (backhand) and to the left of a ball on the right half (forehand), a little
      // behind it so the contact is in front of the body.
      const side = this.prediction.x < COURT.W / 2 ? 1 : -1;
      this.p.setTarget(this.prediction.x + side * STANCE_OFFSET + this.err.x, this.prediction.z + 0.15 + this.err.z);
    }
  }

  /**
   * Simulate the ball forward and return the first point where it is
   * comfortably playable (after the front wall, below shoulder height,
   * ideally after the first bounce).
   * @returns {{x:number,z:number,t:number}|null}
   */
  predict(ball, ref) {
    const b = this.scratch;
    b.copyFrom(ball);
    b.inPlay = true;
    let front = ref.frontWallHit;
    let bounces = 0;
    const onEv = (type) => {
      if (type === 'frontwall') front = true;
      if (type === 'floor' && front) bounces++;
    };
    const dt = 1 / 120;
    let t = 0;
    let volley = null;
    while (t < 3.5) {
      b.step(dt, onEv);
      t += dt;
      if (bounces >= 2) break;
      if (!front) continue;
      const low = b.y < 1.25 && b.y > 0.15;
      if (bounces >= 1 && low && b.vy <= 0.5) {
        return { x: b.x, z: b.z, t };
      }
      // Remember a volley option in case the ball never offers a bounce.
      if (!volley && bounces === 0 && low && b.z > 3.5) volley = { x: b.x, z: b.z, t };
    }
    return volley;
  }

  /**
   * Pick a shot and a target x on the front wall.
   * @param {Ball} ball
   * @param {import('./player.js').Player} opponent
   * @returns {{shot: import('../physics/shots.js').ShotType, tx: number}}
   */
  chooseShot(ball, opponent) {
    const r = this.rand();
    const farSide = opponent.x > COURT.W / 2 ? 0.7 : COURT.W - 0.7;
    const aimErr = gauss(this.rand) * this.d.aimError;

    const forced = forcedShot(this.p, ball);
    if (forced) return { shot: forced, tx: farSide };

    // Where the opponent is decides the shot: short balls when they are deep, deep balls
    // when they are forward, and a tired opponent is made to run.
    const oppDeep = opponent.z > T_POSITION.z + 1.0;
    const oppFront = opponent.z < T_POSITION.z - 1.0;
    // Attack more against a tired opponent; play safe (no touch shots) when tired oneself.
    const tiredSelf = this.p.stamina < 0.35;
    const attack = tiredSelf ? -1 : this.d.aggression + (opponent.stamina < 0.4 ? 0.3 : 0);
    const inBackCorner = ball.z > COURT.L - 1.8 && (ball.x < 1.0 || ball.x > COURT.W - 1.0);
    if (oppDeep) {
      // Drop from the front or mid-court, boast out of the back: they must run the full length.
      if (ball.z < 4.0 && r < 0.3 + attack * 0.4) return { shot: SHOTS.drop, tx: farSide + aimErr };
      if (inBackCorner && r < 0.35 + attack * 0.5) return { shot: SHOTS.boast, tx: farSide };
      if (ball.z > 5.5 && ball.z <= COURT.L - 1.8 && r < 0.1 + attack * 0.3) return { shot: SHOTS.boast, tx: farSide };
    }
    if (oppFront && r < 0.8) {
      // Over or past them, deep to the far corner.
      const shot = this.rand() < 0.6 ? SHOTS.lob : SHOTS.drive;
      const tx = shot === SHOTS.lob ? COURT.W / 2 + (farSide - COURT.W / 2) * 0.45 : farSide;
      return { shot, tx: tx + aimErr };
    }
    if (ball.z < 3.2 && !oppFront && r < attack + 0.35) return { shot: SHOTS.drop, tx: farSide + aimErr };
    if (ball.y > 1.0 && ball.z < 6.5 && r < attack) return { shot: SHOTS.smash, tx: farSide + aimErr };
    // Otherwise a drive: cross-court to the far side, or straight and tight to pin them back.
    const tx = r > 0.7 ? (ball.x < COURT.W / 2 ? 0.5 : COURT.W - 0.5) : farSide;
    return { shot: SHOTS.drive, tx: tx + aimErr };
  }

}
