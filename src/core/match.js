/**
 * @module core/match
 * Pure match simulation: ball physics, both players, the computer
 * opponent, the referee, shot selection and the rally state machine.
 *
 * It has no dependency on the DOM, rendering, audio or input, which lets the
 * same code run headlessly in Node for tests and tuning. The Game class
 * wraps it and translates its events into sound, HUD messages and panels.
 *
 * States: serve -> rally -> point -> (serve | gameover | matchover)
 *
 * Events (subscribe with {@link Match#on}):
 *   serveReady  { server }                 ball placed, waiting for the serve
 *   serve       { server, shot }
 *   hit         { player, shot, ball }     racket contact
 *   wall        { type, info }             frontwall / sidewall / backwall
 *   floor       { info }
 *   rallyEnd    { decision }
 *   gameOver    { decision, score }
 *   matchOver   { decision, score }
 */
import { Ball } from '../physics/ball.js';
import { SHOTS, strikeVelocity, contactPressure, forcedShot } from '../physics/shots.js';
import { Referee } from '../rules/referee.js';
import { Player, T_POSITION, recoverySpeed } from '../entities/player.js';
import { AIController } from '../entities/ai.js';
import { COURT, serviceBoxCentre } from '../config/court.js';
import { PHYSICS } from '../config/physics.js';
import { DIFFICULTY, HUMAN, RECOVERY_SPEED } from '../config/difficulty.js';

/** How long a queued shot type (smash/lob/drop) stays armed (s). */
export const ARM_DURATION = 0.9;
/** Seconds the result message stays before the next serve. */
export const POINT_PAUSE = 1.7;
/** Rally time without a racket contact after which the ball is called dead (s). */
export const RALLY_TIMEOUT = 9;

export class Match {
  /**
   * @param {{difficulty?: string, bestOf?: number, autoT?: boolean, rand?: () => number}} [opts]
   */
  constructor(opts = {}) {
    this.rand = opts.rand ?? Math.random;
    this.autoT = opts.autoT ?? true;
    this.bestOf = opts.bestOf ?? 3;
    const diff = DIFFICULTY[opts.difficulty ?? 'normal'];

    this.ball = new Ball();
    this.human = new Player(0, { speed: HUMAN.speed, reach: HUMAN.reach, fitness: HUMAN.fitness, color: '#2f7df6', name: 'you' });
    this.cpu = new Player(1, { speed: diff.speed, reach: diff.reach, fitness: diff.fitness, color: '#e5483c', name: 'cpu' });
    this.ai = new AIController(this.cpu, diff, this.rand);
    this.players = [this.human, this.cpu];
    this.referee = new Referee({ bestOf: this.bestOf });

    /** Transient visual effects, consumed by the renderer. */
    this.effects = [];
    /** @type {'idle'|'serve'|'rally'|'point'|'gameover'|'matchover'} */
    this.state = 'idle';
    this.armed = null;
    this.armedUntil = 0;
    this.timer = 0;
    this.rallyClock = 0;
    this.clock = 0;
    this.accumulator = 0;
    this.pendingDecision = null;
    /** True while the human is jogging back to the T automatically. */
    this.returnToT = false;
    this._listeners = new Map();

    // Idle pose.
    this.human.place(COURT.W * 0.35, 7.2);
    this.cpu.place(COURT.W * 0.65, 6.0);
    this.ball.reset(COURT.W / 2, 1.2, 4);
  }

  // ----------------------------------------------------------------- events

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(fn);
    return this;
  }

  emit(name, payload) {
    const l = this._listeners.get(name);
    if (l) for (const fn of l) fn(payload);
  }

  // --------------------------------------------------------------- settings

  setDifficulty(id) {
    this.ai.setDifficulty(DIFFICULTY[id]);
  }

  // ------------------------------------------------------------- match flow

  /** Reset scores and start the first rally. */
  start(bestOf = this.bestOf) {
    this.bestOf = bestOf;
    this.referee = new Referee({ bestOf });
    this.human.stamina = 1;
    this.cpu.stamina = 1;
    this.setupServe();
  }

  /** Put both players and the ball in position for the next serve. */
  setupServe() {
    const ref = this.referee;
    ref.startRally();
    const side = ref.serveSide;
    const box = serviceBoxCentre(side);
    const server = this.players[ref.server];
    const receiver = this.players[1 - ref.server];
    server.place(box.x, box.z + 0.1);
    server.frozen = true;
    receiver.place(side === 'R' ? COURT.W * 0.25 : COURT.W * 0.75, 7.6);
    receiver.frozen = false;
    const hand = this.handPosition(server, side);
    this.ball.reset(hand.x, hand.y, hand.z);
    this.armed = null;
    this.returnToT = false;
    this.state = 'serve';
    this.timer = 1.2 + this.rand() * 0.6;
    this.emit('serveReady', { server: ref.server });
  }

  /** Where the server holds the ball before serving. */
  handPosition(server, side) {
    const dir = side === 'R' ? -1 : 1; // the racket side faces the middle of the court
    return { x: server.x + dir * 0.35, y: 1.25, z: server.z + 0.15 };
  }

  /**
   * Strike the serve.
   * @param {'serve'|'lobServe'} shotId
   */
  serve(shotId = 'serve') {
    if (this.state !== 'serve') return;
    const ref = this.referee;
    const server = this.players[ref.server];
    const side = ref.serveSide;
    const shot = SHOTS[shotId];
    const dir = side === 'R' ? -1 : 1;
    const tx = COURT.W / 2 + dir * 0.4 + (this.rand() - 0.5) * 0.5;
    const v = strikeVelocity(this.ball, shot, tx, this.rand, server.fatigue * 0.5);
    this.ball.vx = v.vx; this.ball.vy = v.vy; this.ball.vz = v.vz;
    this.ball.inPlay = true;
    this.ball.trail.length = 0;
    server.frozen = false;
    server.startSwing(dir);
    this.state = 'rally';
    this.rallyClock = 0;
    this.accumulator = 0;
    if (server === this.human) this.returnToT = this.autoT;
    this.emit('serve', { server: ref.server, shot });
  }

  /** Queue a shot type for the human's next contact (or serve with it). */
  arm(shotId) {
    if (this.state === 'serve') {
      if (this.referee.server === 0) this.serve(shotId === 'lob' ? 'lobServe' : 'serve');
      return;
    }
    if (this.state !== 'rally') return;
    this.armed = SHOTS[shotId] ?? null;
    this.armedUntil = this.clock + ARM_DURATION;
  }

  /** Called after the game-over panel: start the next game. */
  nextGame() {
    this.referee.nextGame();
    this.human.stamina = Math.min(1, this.human.stamina + 0.5);
    this.cpu.stamina = Math.min(1, this.cpu.stamina + 0.5);
    this.setupServe();
  }

  // ------------------------------------------------------------------- loop

  /**
   * Advance the simulation.
   * @param {number} dt simulation seconds (pace-scaled)
   * @param {number} [real=dt] wall-clock seconds (for UI pauses)
   */
  update(dt, real = dt) {
    this.clock += dt;
    if (this.armed && this.clock > this.armedUntil) this.armed = null;
    const s = this.state;
    if (s === 'idle' || s === 'gameover' || s === 'matchover') {
      for (const p of this.players) p.update(dt, { resting: true });
      this._stepFreeBall(dt);
      return;
    }

    // Recovery to the T is a jog, not a sprint; any player input lifts the cap.
    if (this.returnToT && !this.human.frozen) {
      this.human.setTarget(T_POSITION.x, T_POSITION.z);
      this.human.speedCap = recoverySpeed(this.human, this.ball, this.cpu, RECOVERY_SPEED);
    } else {
      this.human.speedCap = Infinity;
    }
    this.ai.update(dt, this.ball, this.referee, this.human);
    for (const p of this.players) p.update(dt, { resting: s !== 'rally' });
    this._separatePlayers();

    if (s === 'serve') {
      const server = this.players[this.referee.server];
      const hand = this.handPosition(server, this.referee.serveSide);
      this.ball.x = hand.x; this.ball.y = hand.y; this.ball.z = hand.z;
      if (server === this.cpu) {
        this.timer -= dt;
        if (this.timer <= 0) this.serve(this.rand() < 0.3 ? 'lobServe' : 'serve');
      }
    } else if (s === 'rally') {
      this.accumulator += dt;
      while (this.accumulator >= PHYSICS.STEP && this.state === 'rally') {
        this.accumulator -= PHYSICS.STEP;
        this._stepPhysics(PHYSICS.STEP);
      }
    } else if (s === 'point') {
      // The rally is over but the ball keeps bouncing with the same physics until it dies.
      this._stepFreeBall(dt);
      this.timer -= real;
      if (this.timer <= 0) this._afterPoint();
    }
  }

  /** Integrate the ball after a rally has ended: no referee, no racket contact, just physics. */
  _stepFreeBall(dt) {
    if (!this.ball.inPlay || this.ball.isDead()) return;
    this.accumulator += dt;
    while (this.accumulator >= PHYSICS.STEP) {
      this.accumulator -= PHYSICS.STEP;
      this.ball.step(PHYSICS.STEP, (type, info) => {
        if (type === 'frontwall' || type === 'sidewall' || type === 'backwall') {
          this.effects.push({ x: info.x, y: info.y, z: info.z, age: 0, life: 0.9, kind: 'mark', color: 'rgba(60,60,60,ALPHA)' });
          this.emit('wall', { type, info });
        } else if (type === 'floor') {
          this.emit('floor', { info });
        }
      });
    }
  }

  /** Keep the two players from standing inside each other (soft push apart). */
  _separatePlayers() {
    const a = this.human, b = this.cpu;
    const minDist = 0.65;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d >= minDist || d < 1e-4) return;
    const push = (minDist - d) / 2;
    const nx = dx / d, nz = dz / d;
    // The player whose turn it is has right of way; the other yields more.
    const turn = this.referee.turn;
    const wa = turn === a.index ? 0.3 : 1.7;
    const wb = turn === b.index ? 0.3 : 1.7;
    if (!a.frozen) { a.x -= nx * push * wa; a.z -= nz * push * wa; }
    if (!b.frozen) { b.x += nx * push * wb; b.z += nz * push * wb; }
  }

  _stepPhysics(dt) {
    let decision = null;
    this.ball.step(dt, (type, info) => {
      if (decision) return;
      if (type === 'frontwall' || type === 'sidewall' || type === 'backwall') {
        this.effects.push({ x: info.x, y: info.y, z: info.z, age: 0, life: 0.9, kind: 'mark', color: 'rgba(60,60,60,ALPHA)' });
        this.emit('wall', { type, info });
      } else if (type === 'floor') {
        this.emit('floor', { info });
      }
      decision = this.referee.onBallEvent(type, info);
    });
    this.rallyClock += dt;

    if (!decision) {
      const ref = this.referee;
      for (const p of this.players) {
        if (ref.turn === p.index && ref.frontWallHit && p.canReach(this.ball)) {
          this._strike(p);
          break;
        }
      }
      if (this.ball.isDead() || this.rallyClock > RALLY_TIMEOUT) decision = this.referee.onBallDead();
    }
    if (decision) this._endRally(decision);
  }

  /** Racket contact by player p: choose a shot and launch the ball. */
  _strike(p) {
    const ball = this.ball;
    let shot, tx;
    if (p === this.human) {
      // Deep behind the body only a boast is possible, whatever was armed.
      shot = forcedShot(p, ball) || this.armed || SHOTS.drive;
      this.armed = null;
      // Angle comes from where the ball meets the racket and from body movement.
      tx = ball.x + (ball.x - p.x) * 2.2 + p.vx * 0.35;
      this.returnToT = this.autoT;
    } else {
      ({ shot, tx } = this.ai.chooseShot(ball, this.human));
    }
    // Tired or stretched players lose control: more scatter and less pace.
    const error = p.fatigue * 0.8 + contactPressure(p, ball);
    const v = strikeVelocity(ball, shot, tx, this.rand, error);
    ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
    this.referee.onHit(p.index);
    p.startSwing(ball.x - p.x);
    this.effects.push({ x: ball.x, y: ball.y, z: ball.z, age: 0, life: 0.35, kind: 'ring', color: 'rgba(255,255,255,ALPHA)' });
    this.rallyClock = 0;
    this.emit('hit', { player: p.index, shot, ball: { x: ball.x, y: ball.y, z: ball.z } });
  }

  _endRally(decision) {
    this.pendingDecision = decision;
    this.state = 'point';
    this.timer = POINT_PAUSE;
    this.returnToT = false;
    this.emit('rallyEnd', { decision });
  }

  _afterPoint() {
    const d = this.pendingDecision;
    this.pendingDecision = null;
    const score = this.referee.getScore();
    if (d.matchOver) {
      this.state = 'matchover';
      this.emit('matchOver', { decision: d, score });
    } else if (d.gameOver) {
      this.state = 'gameover';
      this.emit('gameOver', { decision: d, score });
    } else {
      this.setupServe();
    }
  }
}
