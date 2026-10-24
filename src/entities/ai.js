/**
 * @module entities/ai
 * Computer opponent. It predicts where the ball will be playable by running
 * a private copy of the ball physics forward, runs there (with a positional
 * error that shrinks at higher difficulty), and picks a shot based on where
 * the human is standing.
 */
import { Ball } from '../physics/ball.js';
import { SHOTS } from '../physics/shots.js';
import { COURT } from '../config/court.js';

/** Gaussian random number (Box-Muller). */
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Centre of the court ("the T"), where a player waits between shots. */
const T_POSITION = { x: COURT.W / 2, z: COURT.SHORT_LINE_Z + 0.9 };

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
      // Wait on the T, stepping aside from the opponent.
      const side = opponent.x > COURT.W / 2 ? -0.55 : 0.55;
      this.p.setTarget(T_POSITION.x + side, T_POSITION.z);
      return;
    }
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
      this.p.setTarget(this.prediction.x + this.err.x, this.prediction.z + this.err.z);
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
    let shot = SHOTS.drive;
    let tx = farSide;

    if (ball.z < 3.2 && r < this.d.aggression + 0.35) {
      // Close to the front wall: drop shot away from the opponent.
      shot = SHOTS.drop;
      tx = farSide;
    } else if (opponent.z < 4.8 && r < 0.75) {
      // Opponent is forward: lob over them, or drive hard past them.
      shot = this.rand() < 0.65 ? SHOTS.lob : SHOTS.drive;
      tx = shot === SHOTS.lob ? COURT.W / 2 + (farSide - COURT.W / 2) * 0.45 : farSide;
    } else if (ball.y > 1.0 && ball.z < 6.5 && r < this.d.aggression) {
      shot = SHOTS.smash;
      tx = farSide;
    } else if (r > 0.82) {
      // Occasionally a cross-court or a straight drive down the near wall.
      tx = ball.x < COURT.W / 2 ? COURT.W - 0.6 : 0.6;
    }
    return { shot, tx: tx + aimErr };
  }
}
