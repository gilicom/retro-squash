/**
 * @module ui/ui
 * DOM overlay: main menu with settings, HUD (score, stamina bars, messages,
 * touch buttons), pause and end-of-game panels. The UI never touches game
 * state directly; it raises callbacks that the Game wires up.
 */
import { t } from './i18n.js';

/**
 * @typedef {Object} Settings
 * @property {'easy'|'normal'|'hard'} difficulty
 * @property {1|3|5} bestOf
 * @property {boolean} sound
 * @property {'en'|'he'} lang
 * @property {'relaxed'|'normal'|'fast'} pace
 * @property {'3d'|'classic'} graphics
 * @property {boolean} autoT   return-to-T assist
 */

export class UI {
  /**
   * @param {Document} doc
   * @param {Settings} settings
   * @param {{onPlay:Function,onResume:Function,onRestart:Function,onMenu:Function,onAction:(a:string)=>void,onSettings:(s:Settings)=>void}} cb
   */
  constructor(doc, settings, cb) {
    this.doc = doc;
    this.settings = settings;
    this.cb = cb;
    this.$ = (id) => doc.getElementById(id);
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this._msgTimer = 0;
    this._build();
    this.applyLanguage();
  }

  _build() {
    const $ = this.$;
    $('btnPlay').addEventListener('click', () => this.cb.onPlay());
    $('btnResume').addEventListener('click', () => this.cb.onResume());
    $('btnRestart').addEventListener('click', () => this.cb.onRestart());
    $('btnMenu').addEventListener('click', () => this.cb.onMenu());
    $('btnMenu2').addEventListener('click', () => this.cb.onMenu());
    $('btnPause').addEventListener('click', () => this.cb.onAction('pause'));
    for (const b of this.doc.querySelectorAll('#touchButtons button')) {
      const fire = (e) => { e.preventDefault(); this.cb.onAction(b.dataset.action); };
      b.addEventListener('pointerdown', fire);
    }
    // Segmented settings controls.
    for (const group of this.doc.querySelectorAll('.seg')) {
      const key = group.dataset.key;
      for (const b of group.querySelectorAll('button')) {
        b.addEventListener('click', () => {
          let v = b.dataset.value;
          if (key === 'bestOf') v = Number(v);
          if (key === 'sound' || key === 'autoT') v = v === 'true';
          this.settings[key] = v;
          this.cb.onSettings(this.settings);
          this.applyLanguage();
        });
      }
    }
  }

  /** Refresh every translatable element and the active settings buttons. */
  applyLanguage() {
    const lang = this.settings.lang;
    this.doc.documentElement.lang = lang;
    this.doc.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    for (const el of this.doc.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n, lang);
    }
    this.$('howTo').textContent = t(this.isTouch ? 'howTouch' : 'howDesktop', lang);
    for (const group of this.doc.querySelectorAll('.seg')) {
      const key = group.dataset.key;
      for (const b of group.querySelectorAll('button')) {
        b.classList.toggle('active', String(this.settings[key]) === b.dataset.value);
      }
    }
    this.doc.body.classList.toggle('touch', this.isTouch);
  }

  _show(id, on) {
    this.$(id).classList.toggle('hidden', !on);
  }

  showMenu() {
    this._show('menu', true);
    this._show('pause', false);
    this._show('gameover', false);
    this._show('hud', false);
  }

  showHud() {
    this._show('menu', false);
    this._show('pause', false);
    this._show('gameover', false);
    this._show('hud', true);
  }

  showPause(on) {
    this._show('pause', on);
  }

  /**
   * End of game / match panel.
   * @param {string} title
   * @param {string} body
   * @param {string} buttonLabel
   * @param {Function} onContinue
   */
  showGameOver(title, body, buttonLabel, onContinue) {
    this.$('goTitle').textContent = title;
    this.$('goBody').textContent = body;
    const b = this.$('btnContinue');
    b.textContent = buttonLabel;
    b.onclick = () => { this._show('gameover', false); onContinue(); };
    this._show('gameover', true);
  }

  /**
   * Update the scoreboard.
   * @param {ReturnType<import('../rules/referee.js').Referee['getScore']>} score
   */
  updateScore(score) {
    const lang = this.settings.lang;
    this.$('ptsYou').textContent = String(score.points[0]);
    this.$('ptsCpu').textContent = String(score.points[1]);
    this.$('gamesLabel').textContent = score.bestOf > 1 ? `${t('games', lang)} ${score.games[0]} - ${score.games[1]}` : '';
    this.$('serveYou').classList.toggle('on', score.server === 0);
    this.$('serveCpu').classList.toggle('on', score.server === 1);
  }

  /**
   * Update the stamina bars (0..1 each).
   */
  updateStamina(you, cpu) {
    const a = this.$('stYou'), b = this.$('stCpu');
    a.style.width = `${Math.round(you * 100)}%`;
    b.style.width = `${Math.round(cpu * 100)}%`;
    a.classList.toggle('low', you < 0.3);
    b.classList.toggle('low', cpu < 0.3);
  }

  /**
   * Show a centre-screen message.
   * @param {string} text empty string hides it
   * @param {number} [seconds] auto-hide after this long; omit to keep it
   */
  message(text, seconds) {
    const el = this.$('msg');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
    clearTimeout(this._msgTimer);
    if (text && seconds) this._msgTimer = setTimeout(() => el.classList.add('hidden'), seconds * 1000);
  }

  /** Translate helper for the game. */
  t(key, vars) {
    return t(key, this.settings.lang, vars);
  }
}
