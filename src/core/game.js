/**
 * @module core/game
 * Browser glue around {@link Match}: the frame loop, the WebGL renderer,
 * input mapping, sound, HUD and panels.
 *
 * Game states layered on top of the match: 'menu' and 'paused' are owned
 * here; everything else is the match's own state.
 *
 * Pace: all simulation time is multiplied by the pace setting, so "relaxed"
 * literally slows the ball and the players together.
 */
import { Match } from './match.js';
import { Renderer3D } from '../render3d/renderer3d.js';
import { Input } from '../input/input.js';
import { Sound } from '../audio/sound.js';
import { PACE, DIFFICULTY, HUMAN } from '../config/difficulty.js';
import { AIController } from '../entities/ai.js';

/** Seconds a demo waits before serving and before continuing after a game. */
const DEMO_SERVE_DELAY = 1.2;
const DEMO_CONTINUE_DELAY = 2.5;

export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement, surface: HTMLElement, ui: import('../ui/ui.js').UI, settings: import('../ui/ui.js').Settings}} opts
   * @throws when WebGL is unavailable
   */
  constructor({ canvas, surface, ui, settings }) {
    this.canvas = canvas;
    this.surface = surface;
    this.ui = ui;
    this.settings = settings;

    this.renderer = new Renderer3D(canvas);

    this.input = new Input(surface, (sx, sy) => {
      const r = surface.getBoundingClientRect();
      return this.renderer.floorPoint(sx - r.left, sy - r.top);
    });
    this.sound = new Sound();
    this.sound.setEnabled(settings.sound);

    this.match = new Match({ difficulty: settings.difficulty, bestOf: settings.bestOf, autoT: settings.autoT });
    this._wireMatchEvents();

    /** 'menu' | 'paused' | 'play' (the match state applies) */
    this.mode = 'menu';
    /** Demo: a bot plays the human's part so both sides are computer controlled. */
    this.demo = false;
    this.demoBot = null;
    this.demoTimer = 0;
    this.demoContinue = null;
    this.lastTime = 0;
    this.staminaHudTimer = 0;

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 150));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause();
    });
    surface.addEventListener('pointerdown', () => this.sound.unlock(), { passive: true });

    requestAnimationFrame((ts) => this._frame(ts));
  }

  // Convenience accessors used by the UI and debugging.
  get human() { return this.match.human; }
  get cpu() { return this.match.cpu; }
  get ball() { return this.match.ball; }
  get referee() { return this.match.referee; }
  /** Combined state for consumers that want one string. */
  get state() { return this.mode === 'play' ? this.match.state : this.mode; }

  _wireMatchEvents() {
    const m = this.match;
    const ui = this.ui;
    m.on('serveReady', ({ server }) => {
      ui.updateScore(m.referee.getScore());
      ui.message(this.demo ? '' : ui.t(server === 0 ? 'yourServe' : 'cpuServe'));
      this.demoTimer = DEMO_SERVE_DELAY;
    });
    m.on('serve', ({ shot }) => { this.sound.racket(shot.speed); ui.message(''); });
    m.on('hit', ({ shot }) => this.sound.racket(shot.speed));
    m.on('wall', ({ info }) => this.sound.wall(info.speed));
    m.on('floor', ({ info }) => { if (info.speed > 1.5) this.sound.floor(info.speed); });
    m.on('rallyEnd', ({ decision }) => {
      const won = decision.winner === 0;
      ui.message(`${ui.t(`reason_${decision.reason}`)}  ·  ${ui.t(won ? 'pointYou' : 'pointCpu')}`);
      if (won) this.sound.pointWon(); else this.sound.pointLost();
      ui.updateScore(m.referee.getScore());
    });
    m.on('gameOver', ({ decision, score }) => {
      const games = `${ui.t('games')} ${score.games[0]} - ${score.games[1]}`;
      if (decision.winner === 0) this.sound.fanfare();
      ui.message('');
      ui.showGameOver(ui.t('gameTo', { who: ui.t(decision.winner === 0 ? 'you' : 'cpu') }), games, ui.t('nextGame'), () => m.nextGame());
      this._demoAutoContinue(() => { ui.hideGameOver(); m.nextGame(); });
    });
    m.on('matchOver', ({ decision, score }) => {
      const games = `${ui.t('games')} ${score.games[0]} - ${score.games[1]}`;
      if (decision.winner === 0) this.sound.fanfare();
      ui.message('');
      ui.showGameOver(ui.t(decision.winner === 0 ? 'matchWon' : 'matchLost'), games, ui.t('newMatch'), () => this.startMatch());
      this._demoAutoContinue(() => { ui.hideGameOver(); this.startMatch(); });
    });
  }

  /** In demo mode, continue automatically after a short pause. */
  _demoAutoContinue(fn) {
    if (!this.demo) return;
    this.demoTimer = DEMO_CONTINUE_DELAY;
    this.demoContinue = fn;
  }

  // ---------------------------------------------------------------- settings

  /** Apply changed settings; everything except match length takes effect immediately. */
  applySettings(s) {
    this.settings = s;
    this.match.setDifficulty(s.difficulty);
    this.match.autoT = s.autoT;
    this.sound.setEnabled(s.sound);
    this.ui.applyLanguage();
    if (this.mode !== 'menu') this.ui.updateScore(this.match.referee.getScore());
  }

  get timeScale() {
    return PACE[this.settings.pace] ?? 1;
  }

  // ------------------------------------------------------------- match flow

  startMatch() {
    this.sound.unlock();
    this.match.setDifficulty(this.settings.difficulty);
    this.match.autoT = this.settings.autoT;
    this.mode = 'play';
    this.ui.showHud();
    this.ui.setDemo(this.demo);
    this.match.start(this.settings.bestOf);
  }

  /** Start a match in which a bot plays the human's part (both sides computer controlled). */
  startDemo() {
    this.demo = true;
    const d = DIFFICULTY[this.settings.difficulty];
    this.demoBot = new AIController(this.match.human, { ...d, speed: HUMAN.speed, reach: HUMAN.reach, fitness: HUMAN.fitness });
    this.startMatch();
  }

  /** Leave demo mode (the next match is played by the user). */
  stopDemo() {
    this.demo = false;
    this.demoBot = null;
    this.demoContinue = null;
    this.ui.setDemo(false);
  }

  pause() {
    if (this.mode !== 'play') return;
    const s = this.match.state;
    if (s === 'gameover' || s === 'matchover') return;
    this.mode = 'paused';
    this.ui.showPause(true);
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.ui.showPause(false);
    this.input.keys.clear();
  }

  toMenu() {
    this.mode = 'menu';
    this.stopDemo();
    this.ui.showMenu();
    this.ui.message('');
  }

  // ------------------------------------------------------------------- loop

  _frame(ts) {
    const real = Math.min(0.05, this.lastTime ? (ts - this.lastTime) / 1000 : 1 / 60);
    this.lastTime = ts;
    const dt = real * this.timeScale;
    this.update(dt, real);
    const m = this.match;
    this.renderer.draw({
      ball: m.ball,
      players: m.players,
      effects: m.effects,
      dt,
      inPlay: this.mode === 'play' && (m.state === 'rally' || m.state === 'serve'),
      turn: m.referee.turn,
    });
    requestAnimationFrame((t) => this._frame(t));
  }

  /**
   * Advance game logic.
   * @param {number} dt simulation seconds (pace-scaled)
   * @param {number} real wall-clock seconds
   */
  update(dt, real) {
    for (const a of this.input.takeActions()) this._handleAction(a);
    if (this.mode !== 'play') {
      this.input.takeDrag();
      this.input.pointerTarget = null;
      for (const p of this.match.players) p.update(dt, { resting: true });
      return;
    }
    if (this.demo) this._controlDemo(dt, real); else this._controlHuman(dt);
    this.match.update(dt, real);

    this.staminaHudTimer -= real;
    if (this.staminaHudTimer <= 0) {
      this.staminaHudTimer = 0.1;
      this.ui.updateStamina(this.match.human.stamina, this.match.cpu.stamina);
    }
  }

  /** Demo: the bot moves the human, serves after a pause and continues after a game. */
  _controlDemo(dt, real) {
    const m = this.match;
    const inp = this.input;
    inp.takeDrag();
    inp.pointerTarget = null;
    if (m.state === 'rally') {
      this.demoBot.update(dt, m.ball, m.referee, m.cpu);
      m.returnToT = false;
    } else if (m.state === 'serve' && m.referee.server === 0) {
      this.demoTimer -= dt;
      if (this.demoTimer <= 0) m.serve(Math.random() < 0.3 ? 'lobServe' : 'serve');
    } else if ((m.state === 'gameover' || m.state === 'matchover') && this.demoContinue) {
      this.demoTimer -= real;
      if (this.demoTimer <= 0) { const fn = this.demoContinue; this.demoContinue = null; fn(); }
    }
  }

  /** Translate pointer / keyboard state into the human player's target. */
  _controlHuman(dt) {
    const h = this.match.human;
    const inp = this.input;
    if (h.frozen) { inp.takeDrag(); inp.pointerTarget = null; return; }
    let moved = false;
    if (inp.isTouch) {
      const d = inp.takeDrag();
      if (d.x || d.z) { h.setTarget(h.targetX + d.x, h.targetZ + d.z); moved = true; }
    } else if (inp.pointerTarget) {
      h.setTarget(inp.pointerTarget.x, inp.pointerTarget.z);
      inp.pointerTarget = null;
      moved = true;
    }
    const ax = inp.keyboardAxis();
    if (ax.x || ax.z) {
      // Keyboard moves from the current position so it never fights a stale mouse target.
      h.setTarget(h.x + ax.x * h.speed * dt * 1.5 + ax.x * 0.25, h.z + ax.z * h.speed * dt * 1.5 + ax.z * 0.25);
      moved = true;
    }
    if (moved) this.match.returnToT = false;
  }

  _handleAction(a) {
    this.sound.unlock();
    if (a === 'pause') {
      if (this.mode === 'paused') this.resume(); else this.pause();
      return;
    }
    if (this.mode !== 'play' || this.demo) return;
    if (a === 'primary') this.match.arm('smash');
    else if (a === 'lob') this.match.arm('lob');
    else if (a === 'drop') this.match.arm('drop');
  }
}
