/**
 * @module core/game
 * Browser glue around {@link Match}: the frame loop, renderer selection
 * (3D WebGL or classic canvas), input mapping, sound, HUD and panels.
 *
 * Game states layered on top of the match: 'menu' and 'paused' are owned
 * here; everything else is the match's own state.
 *
 * Pace: all simulation time is multiplied by the pace setting, so "relaxed"
 * literally slows the ball and the players together.
 */
import { Match } from './match.js';
import { Renderer } from '../render/renderer.js';
import { Renderer3D } from '../render3d/renderer3d.js';
import { Input } from '../input/input.js';
import { Sound } from '../audio/sound.js';
import { PACE } from '../config/difficulty.js';

export class Game {
  /**
   * @param {{canvas3d: HTMLCanvasElement, canvas2d: HTMLCanvasElement, surface: HTMLElement, ui: import('../ui/ui.js').UI, settings: import('../ui/ui.js').Settings}} opts
   */
  constructor({ canvas3d, canvas2d, surface, ui, settings }) {
    this.canvas3d = canvas3d;
    this.canvas2d = canvas2d;
    this.surface = surface;
    this.ui = ui;
    this.settings = settings;

    this.renderer = null;
    this.rendererKind = null;
    this._webglFailed = false;
    this._createRenderer(settings.graphics);

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
      ui.message(ui.t(server === 0 ? 'yourServe' : 'cpuServe'));
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
    });
    m.on('matchOver', ({ decision, score }) => {
      const games = `${ui.t('games')} ${score.games[0]} - ${score.games[1]}`;
      if (decision.winner === 0) this.sound.fanfare();
      ui.message('');
      ui.showGameOver(ui.t(decision.winner === 0 ? 'matchWon' : 'matchLost'), games, ui.t('newMatch'), () => this.startMatch());
    });
  }

  // --------------------------------------------------------------- renderer

  /**
   * Create the renderer. '3d' uses WebGL (Three.js) and falls back to the
   * classic canvas renderer when WebGL is unavailable.
   * @param {'3d'|'classic'} kind
   */
  _createRenderer(kind) {
    if (this.renderer && this.renderer.dispose) this.renderer.dispose();
    let r = null;
    if (kind === '3d' && !this._webglFailed) {
      try { r = new Renderer3D(this.canvas3d); } catch (err) {
        console.warn('WebGL unavailable, using classic renderer', err);
        this._webglFailed = true;
      }
    }
    if (!r) { r = new Renderer(this.canvas2d); kind = 'classic'; }
    this.renderer = r;
    this.rendererKind = kind;
    this.canvas3d.classList.toggle('hidden', kind !== '3d');
    this.canvas2d.classList.toggle('hidden', kind !== 'classic');
    this.renderer.resize();
  }

  // ---------------------------------------------------------------- settings

  /** Apply changed settings; everything except match length takes effect immediately. */
  applySettings(s) {
    this.settings = s;
    this.match.setDifficulty(s.difficulty);
    this.match.autoT = s.autoT;
    this.sound.setEnabled(s.sound);
    this.ui.applyLanguage();
    if (s.graphics !== this.rendererKind) this._createRenderer(s.graphics);
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
    this.match.start(this.settings.bestOf);
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
    this._controlHuman(dt);
    this.match.update(dt, real);

    this.staminaHudTimer -= real;
    if (this.staminaHudTimer <= 0) {
      this.staminaHudTimer = 0.1;
      this.ui.updateStamina(this.match.human.stamina, this.match.cpu.stamina);
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
    if (this.mode !== 'play') return;
    if (a === 'primary') this.match.arm('smash');
    else if (a === 'lob') this.match.arm('lob');
    else if (a === 'drop') this.match.arm('drop');
  }
}
