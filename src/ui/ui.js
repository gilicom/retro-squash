/**
 * @module ui/ui
 * DOM overlay: main menu with settings, HUD (score, stamina bars, messages,
 * touch buttons), pause and end-of-game panels, the nickname dialog, the
 * world-ranking table, and the install / update controls of the PWA. The UI
 * never touches game state directly; it raises callbacks that main.js wires
 * to the Game, the Ranking and the Pwa objects.
 */
import { t } from './i18n.js';

/**
 * @typedef {Object} Settings
 * @property {'easy'|'normal'|'hard'} difficulty
 * @property {1|3|5} bestOf
 * @property {boolean} sound
 * @property {'en'|'he'} lang
 * @property {'relaxed'|'normal'|'fast'} pace
 * @property {boolean} autoT   return-to-T assist
 */

/**
 * @typedef {Object} UICallbacks
 * @property {Function} onPlay
 * @property {Function} onDemo
 * @property {Function} onResume
 * @property {Function} onRestart
 * @property {Function} onMenu
 * @property {(a:string)=>void} onAction
 * @property {(s:Settings)=>void} onSettings
 * @property {Function} [onRanking]      open the leaderboard
 * @property {Function} [onInstall]      install button pressed
 * @property {Function} [onUpdate]       update button pressed
 * @property {(name:string)=>Promise<{ok:boolean, reason?:string}>} [onNickname]
 */

export class UI {
  /**
   * @param {Document} doc
   * @param {Settings} settings
   * @param {UICallbacks} cb
   */
  constructor(doc, settings, cb) {
    this.doc = doc;
    this.settings = settings;
    this.cb = cb;
    this.$ = (id) => doc.getElementById(id);
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this._msgTimer = 0;
    this._nicknameDone = null;
    this._build();
    this.applyLanguage();
  }

  _build() {
    const $ = this.$;
    $('btnPlay').addEventListener('click', () => this.cb.onPlay());
    $('btnDemo').addEventListener('click', () => this.cb.onDemo());
    $('btnResume').addEventListener('click', () => this.cb.onResume());
    $('btnRestart').addEventListener('click', () => this.cb.onRestart());
    $('btnMenu').addEventListener('click', () => this.cb.onMenu());
    $('btnMenu2').addEventListener('click', () => this.cb.onMenu());
    $('btnPause').addEventListener('click', () => this.cb.onAction('pause'));
    $('btnRanking').addEventListener('click', () => this.cb.onRanking?.());
    $('btnInstall').addEventListener('click', () => this.cb.onInstall?.());
    $('btnUpdate').addEventListener('click', () => this.cb.onUpdate?.());
    $('btnBoardClose').addEventListener('click', () => this._show('leaderboard', false));
    $('btnBoardRefresh').addEventListener('click', () => this.cb.onRanking?.());
    $('btnChangeName').addEventListener('click', () => this.showNickname({ cancellable: true }));
    $('btnNicknameCancel').addEventListener('click', () => this._finishNickname(false));
    $('nicknameForm').addEventListener('submit', (e) => { e.preventDefault(); this._submitNickname(); });
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
    this._show('leaderboard', false);
    this._show('hud', true);
  }

  showPause(on) {
    this._show('pause', on);
  }

  hideGameOver() {
    this._show('gameover', false);
  }

  /** Show or hide the demo badge in the HUD. */
  setDemo(on) {
    this._show('demoBadge', on);
    this.doc.body.classList.toggle('demo', on);
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
    this.setGameOverRank('');
    const b = this.$('btnContinue');
    b.textContent = buttonLabel;
    b.onclick = () => { this._show('gameover', false); onContinue(); };
    this._show('gameover', true);
  }

  /** Rating line under the match result (empty hides it). */
  setGameOverRank(text) {
    const el = this.$('goRank');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
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

  // ------------------------------------------------------------------- PWA

  /**
   * Show the install button (`can`), as instructions only when `manual`
   * (iOS has no install prompt).
   */
  setInstallable(can, manual) {
    this._show('btnInstall', can && !manual);
    this._show('installHint', can && manual);
  }

  /** Show the "new version" banner. */
  showUpdate(on = true) {
    this._show('updateBar', on);
  }

  // --------------------------------------------------------------- ranking

  /** Line under the Play button: nickname, rating and rank (empty hides it). */
  setPlayerLine(text) {
    const el = this.$('playerLine');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  /**
   * Ask for a nickname. Resolves with the saved name, or null if cancelled.
   * @param {{current?: string|null, cancellable?: boolean}} [opts]
   * @returns {Promise<string|null>}
   */
  showNickname({ current = null, cancellable = false } = {}) {
    const input = this.$('nicknameInput');
    input.value = current ?? this.$('playerLine').dataset.nick ?? '';
    this.$('nicknameError').classList.add('hidden');
    this._show('btnNicknameCancel', cancellable);
    this._show('nickname', true);
    setTimeout(() => input.focus(), 50);
    return new Promise((resolve) => { this._nicknameDone = resolve; });
  }

  async _submitNickname() {
    const input = this.$('nicknameInput');
    const err = this.$('nicknameError');
    const res = this.cb.onNickname ? await this.cb.onNickname(input.value) : { ok: true, value: input.value };
    if (!res.ok) {
      const key = { short: 'nickShort', long: 'nickLong', chars: 'nickChars', taken: 'nickTaken' }[res.reason] || 'nickChars';
      err.textContent = this.t(key);
      err.classList.remove('hidden');
      input.focus();
      return;
    }
    this.$('playerLine').dataset.nick = res.value;
    this._finishNickname(res.value);
  }

  _finishNickname(value) {
    this._show('nickname', false);
    const done = this._nicknameDone;
    this._nicknameDone = null;
    done?.(value || null);
  }

  /** Open the leaderboard panel in its loading state. */
  showLeaderboard() {
    this.$('boardBody').innerHTML = '';
    this.$('boardMe').textContent = '';
    this.$('boardStatus').textContent = this.t('loading');
    this._show('leaderboard', true);
  }

  /**
   * Fill the leaderboard.
   * @param {{top?: Array<{rank:number,nickname:string,rating:number,matches:number,wins:number}>, me?: object|null, status?: string, meLine?: string}} data
   */
  renderLeaderboard({ top = [], me = null, status = '', meLine = '' }) {
    const body = this.$('boardBody');
    body.innerHTML = '';
    for (const row of top) {
      const tr = this.doc.createElement('tr');
      if (me && row.rank === me.rank && row.nickname === me.nickname) tr.className = 'me';
      for (const v of [row.rank, row.nickname, row.rating, row.matches, row.wins]) {
        const td = this.doc.createElement('td');
        td.textContent = String(v);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    this.$('boardMe').textContent = meLine;
    this.$('boardStatus').textContent = status || (top.length ? '' : this.t('emptyBoard'));
  }

  /** Translate helper for the game. */
  t(key, vars) {
    return t(key, this.settings.lang, vars);
  }
}
