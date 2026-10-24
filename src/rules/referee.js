/**
 * @module rules/referee
 * Squash rules: rally legality, service faults, scoring (PAR 11, win by 2)
 * and match structure (best of N games).
 *
 * The referee is a pure state machine. The game loop feeds it ball collision
 * events and racket hits, and it answers with a {@link Decision} whenever a
 * rally ends. It never touches rendering or physics.
 *
 * Players are indexed 0 (human) and 1 (computer).
 */
import { COURT, sideOutHeight, inReceivingQuarter } from '../config/court.js';

/**
 * @typedef {Object} Decision
 * @property {number} winner       index of the player who won the rally
 * @property {number} loser
 * @property {FaultReason} reason
 * @property {boolean} gameOver    true when the game (set) ended on this point
 * @property {boolean} matchOver   true when the match ended on this point
 */

/**
 * @typedef {'tin'|'out'|'down'|'notUp'|'serviceFault'|'serviceLine'|'miss'|'dead'} FaultReason
 * - tin:          ball hit the board under the tin line
 * - out:          ball hit a wall above an out line, or the ceiling
 * - down:         ball hit the floor before reaching the front wall
 * - notUp:        receiver let the ball bounce twice
 * - serviceFault: serve did not land in the receiving quarter
 * - serviceLine:  serve hit the front wall below the service line
 * - miss:         receiver never reached the ball (it died or timed out)
 * - dead:         ball stopped rolling before it was returned
 */

export class Referee {
  /**
   * @param {{bestOf?: number, pointsToWin?: number}} [opts]
   */
  constructor(opts = {}) {
    this.bestOf = opts.bestOf ?? 3;
    this.pointsToWin = opts.pointsToWin ?? 11;
    this.newMatch();
  }

  /** Reset all scores and start a fresh match with player 0 serving. */
  newMatch() {
    this.points = [0, 0];
    this.games = [0, 0];
    this.server = 0;
    /** @type {'L'|'R'} */
    this.serveSide = 'R';
    this.matchOver = false;
    this.history = [];
    this.startRally();
  }

  /** Reset per-rally state. Called before every serve. */
  startRally() {
    this.serving = true;
    this.frontWallHit = false;
    this.floorBounces = 0;
    this.lastHitter = this.server;
    /** Index of the player who must play the ball next. */
    this.turn = 1 - this.server; // receiver plays after the serve
    this.rallyHits = 0;
  }

  /** Register a racket contact by `player`. */
  onHit(player) {
    this.lastHitter = player;
    this.frontWallHit = false;
    this.floorBounces = 0;
    this.turn = 1 - player;
    this.rallyHits++;
    // Any racket contact after the serve ends the service phase.
    this.serving = false;
  }

  /** The player who is allowed to strike the ball now. */
  get receiver() {
    return this.turn;
  }

  /**
   * Judge a ball collision event.
   * @param {import('../physics/ball.js').BallEventType} type
   * @param {import('../physics/ball.js').BallEventInfo} info
   * @returns {Decision|null} a decision when the rally ends, else null
   */
  onBallEvent(type, info) {
    switch (type) {
      case 'frontwall': {
        if (info.y < COURT.TIN) return this._fault(this.lastHitter, 'tin');
        if (info.y > COURT.FRONT_OUT) return this._fault(this.lastHitter, 'out');
        if (!this.frontWallHit) {
          if (this.serving && info.y < COURT.SERVICE_LINE) {
            return this._fault(this.lastHitter, 'serviceLine');
          }
          this.frontWallHit = true;
        }
        return null;
      }
      case 'sidewall':
        if (info.y > sideOutHeight(info.z)) return this._fault(this.lastHitter, 'out');
        return null;
      case 'backwall':
        if (info.y > COURT.BACK_OUT) return this._fault(this.lastHitter, 'out');
        return null;
      case 'ceiling':
        return this._fault(this.lastHitter, 'out');
      case 'floor': {
        if (!this.frontWallHit) return this._fault(this.lastHitter, 'down');
        this.floorBounces++;
        if (this.serving && this.floorBounces === 1) {
          if (!inReceivingQuarter(info.x, info.z, this.serveSide)) {
            return this._fault(this.lastHitter, 'serviceFault');
          }
        }
        if (this.floorBounces >= 2) return this._fault(this.turn, 'notUp');
        return null;
      }
      default:
        return null;
    }
  }

  /** The ball stopped or the receiver ran out of time. */
  onBallDead() {
    if (!this.frontWallHit) return this._fault(this.lastHitter, 'down');
    return this._fault(this.turn, 'dead');
  }

  /**
   * Award a point against `loser` and update the serving order.
   * @param {number} loser
   * @param {FaultReason} reason
   * @returns {Decision}
   */
  _fault(loser, reason) {
    const winner = 1 - loser;
    this.points[winner]++;
    this.history.push({ winner, reason, points: [...this.points] });

    // Point-a-rally scoring: the winner of the rally serves next.
    if (winner === this.server) {
      this.serveSide = this.serveSide === 'R' ? 'L' : 'R';
    } else {
      this.server = winner;
      this.serveSide = 'R';
    }

    let gameOver = false;
    let matchOver = false;
    const p = this.points;
    if (p[winner] >= this.pointsToWin && p[winner] - p[1 - winner] >= 2) {
      gameOver = true;
      this.games[winner]++;
      if (this.games[winner] > this.bestOf / 2) {
        matchOver = true;
        this.matchOver = true;
      }
    }
    return { winner, loser, reason, gameOver, matchOver };
  }

  /** Start the next game after a game ended. The game winner serves. */
  nextGame() {
    const winner = this.games[0] > this.games[1] ? 0 : 1;
    this.points = [0, 0];
    this.server = winner;
    this.serveSide = 'R';
    this.startRally();
  }

  /** Snapshot for the HUD. */
  getScore() {
    return {
      points: [...this.points],
      games: [...this.games],
      server: this.server,
      serveSide: this.serveSide,
      bestOf: this.bestOf,
      matchOver: this.matchOver,
    };
  }
}
