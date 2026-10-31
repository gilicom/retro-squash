/**
 * @module entities/ai
 * Computer opponent. It predicts where the ball will be playable by running
 * a private copy of the ball physics forward, runs there (with a positional
 * error that shrinks at higher difficulty), and picks a shot based on where
 * the human is standing.
 */
import { Ball } from '../physics/ball.js';
import { SHOTS, forcedShot, contactPressure } from '../physics/shots.js';
import { COURT } from '../config/court.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
import { RECOVERY_SPEED } from '../config/difficulty.js';
import { T_POSITION, recoverySpeed } from './player.js';

/** Lateral distance the player stands from the ball's path (m): racket arm's length. */
export const STANCE_OFFSET = 0.95;
/** Slowest run to the ball, as a fraction of top speed: a brisk stride even with time to spare. */
const PACE_FRACTION = 0.7;

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
    this.predAge = 0;
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
      const side = opponent.x > COURT.W / 2 ? -0.3 : 0.3;
      this.p.setTarget(T_POSITION.x + side, T_POSITION.z);
      this.p.speedCap = recoverySpeed(this.p, ball, opponent, RECOVERY_SPEED);
      return;
    }
    this.predAge += dt;
    if (this.timer <= 0) {
      this.timer = this.d.reaction;
      const pred = this.predict(ball, ref);
      if (pred) {
        this.prediction = pred;
        this.predAge = 0;
        // Positional error grows with the distance to cover and with fatigue, and shrinks as the
        // ball gets close: the last look at an easy, slow ball is almost exact, so easy balls are
        // not missed; only the hard, far ones are.
        const far = 1 + Math.hypot(pred.x - this.p.x, pred.z - this.p.z) / 4;
        const tired = 1 + this.p.fatigue * 0.8;
        const late = clamp(pred.t / 1.2, 0.3, 1);
        const easy = clamp(ball.groundSpeed / 9, 0.6, 1);
        const e = this.d.error * far * tired * late * easy;
        this.err = { x: gauss(this.rand) * e, z: gauss(this.rand) * e * 0.6 };
      }
    }
    if (this.prediction) {
      // Stand beside the ball, not on it: to the right of a ball on the left half
      // (backhand) and to the left of a ball on the right half (forehand), a little
      // behind it so the contact is in front of the body.
      const side = this.prediction.x < COURT.W / 2 ? 1 : -1;
      this.p.setTarget(this.prediction.x + side * STANCE_OFFSET + this.err.x, this.prediction.z + 0.15 + this.err.z);
      // Pace the run to the ball: arrive a little early at the speed that gets there in time, not
      // at a sprint that ends in a shuffle; a brisk stride at least, never slower than needed.
      const timeLeft = Math.max(0.2, this.prediction.t - this.predAge - 0.25);
      const dist = Math.hypot(this.p.targetX - this.p.x, this.p.targetZ - this.p.z);
      this.p.speedCap = Math.max(this.p.speed * PACE_FRACTION, (dist / timeLeft) * 1.3);
    } else {
      this.p.speedCap = Infinity;
    }
  }

  /**
   * Simulate the ball forward and return the first point where it is
   * comfortably playable (after the front wall, below shoulder height,
   * ideally after the first bounce). Bounces the ball has already taken count,
   * so a re-read after the first bounce still plays this bounce, not the next
   * one. A ball that would only become playable deep by the back wall (or off
   * it) is taken earlier as a volley when it passes at a comfortable height;
   * failing that, a ball that reaches the back wall is let come off it and
   * played as it comes out (low, slowing, in front of the body), which allows
   * a straight drive where taking it on the way in would force a boast.
   * @returns {{x:number,z:number,t:number}|null}
   */
  predict(ball, ref) {
    const b = this.scratch;
    b.copyFrom(ball);
    b.inPlay = true;
    let front = ref.frontWallHit;
    let bounces = front ? ref.floorBounces : 0;
    let back = false;
    const onEv = (type) => {
      if (type === 'frontwall') front = true;
      if (type === 'floor' && front) bounces++;
      if (type === 'backwall' && front) back = true;
    };
    const dt = 1 / 120;
    let t = 0;
    let volley = null, first = null;
    while (t < 3.5) {
      b.step(dt, onEv);
      t += dt;
      if (bounces >= 2) break;
      if (!front) continue;
      const low = b.y < 1.25 && b.y > 0.15;
      if (bounces >= 1 && low && b.vy <= 0.5) {
        if (!first) {
          first = { x: b.x, z: b.z, t };
          const deep = back || b.z > COURT.L - 0.9;
          if (deep && volley && this.canMakeIt(volley)) return volley;
          if (b.vz <= 0.5) return first;   // not running on to the back wall: play it here
        }
        // Off the back wall: the ball coming out toward the front is the point to play.
        if (back && b.vz < 0) {
          const out = { x: b.x, z: b.z, t };
          return this.canMakeIt(out) ? out : first;
        }
      }
      // Remember a volley option: the ball passing at a comfortable height before it bounces.
      if (!volley && bounces === 0 && !back && b.y < 1.9 && b.y > 0.45 && b.vy <= 1.0 && b.z > 3.5) volley = { x: b.x, z: b.z, t };
    }
    return first || volley;
  }

  /** Whether the player can be at a predicted point in time for it (with the racket's reach). */
  canMakeIt(pt) {
    const dist = Math.hypot(pt.x - this.p.x, pt.z - this.p.z);
    return dist <= this.p.effectiveSpeed * Math.max(0, pt.t - 0.15) + this.p.reach * 0.6;
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
    // A touch shot needs a balanced contact: stretched, rushed, behind the body or tired, the
    // ball goes to a back corner instead (a drop from there would find the tin).
    const tight = contactPressure(this.p, ball) + this.p.fatigue * 0.8 > 0.45;
    if (oppDeep) {
      // Drop from the front or mid-court, boast out of the back: they must run the full length.
      if (ball.z < 4.0 && !tight && r < 0.3 + attack * 0.4) return { shot: SHOTS.drop, tx: farSide + aimErr };
      if (inBackCorner && r < 0.35 + attack * 0.5) return { shot: SHOTS.boast, tx: farSide };
      if (ball.z > 5.5 && ball.z <= COURT.L - 1.8 && r < 0.1 + attack * 0.3) return { shot: SHOTS.boast, tx: farSide };
    }
    if (oppFront && r < 0.8) {
      // Over or past them, deep to the far corner.
      const shot = this.rand() < 0.6 ? SHOTS.lob : SHOTS.drive;
      return { shot, tx: this.aimCorner(ball, farSide, shot === SHOTS.lob ? 8.8 : 8.2) + aimErr };
    }
    if (ball.z < 3.2 && !oppFront && !tight && r < attack + 0.35) return { shot: SHOTS.drop, tx: farSide + aimErr };
    if (ball.y > 1.0 && ball.z < 6.5 && r < attack) return { shot: SHOTS.smash, tx: farSide + aimErr };
    // Hard cross-court: low and fast to the opposite corner, mostly when the opponent is on the
    // ball's side of the court and has the whole width to cover; more when attacking.
    const oppSameSide = (opponent.x > COURT.W / 2) === (ball.x > COURT.W / 2);
    if (ball.z < 7.5 && r < (oppSameSide ? 0.35 : 0.15) + Math.max(0, attack) * 0.2) {
      return { shot: SHOTS.cross, tx: this.aimCorner(ball, ball.x < COURT.W / 2 ? COURT.W - 0.45 : 0.45, 8.2) + aimErr };
    }
    // Otherwise a drive: cross-court to the far side, or straight and tight to pin them back.
    const corner = r > 0.7 ? (ball.x < COURT.W / 2 ? 0.5 : COURT.W - 0.5) : farSide;
    return { shot: SHOTS.drive, tx: this.aimCorner(ball, corner, 8.2) + aimErr };
  }

  /**
   * Front-wall x that sends the ball from this contact point to a spot on the floor (cornerX at
   * depth): the ball leaves the front wall at the mirror of its incoming angle, so a straight
   * drive from mid-court is aimed a little out from the corner and a cross-court at the middle
   * of the front wall, not at the far corner itself (that would meet the side wall first).
   * @param {{x:number,z:number}} ball contact point
   * @param {number} cornerX x of the spot to land on
   * @param {number} [depth=8.2] z of the spot to land on
   */
  aimCorner(ball, cornerX, depth = 8.2) {
    const k = depth / Math.max(0.5, ball.z);
    return Math.min(COURT.W - 0.25, Math.max(0.25, (cornerX + k * ball.x) / (1 + k)));
  }

}
