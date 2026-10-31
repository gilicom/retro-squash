/**
 * @module main
 * Entry point: loads persisted settings, builds the UI, the Game, the PWA
 * plumbing and the ranking client, and wires them together.
 */
import { Game } from './core/game.js';
import { UI } from './ui/ui.js';
import { Pwa } from './pwa/pwa.js';
import { BACKEND } from './config/backend.js';
import { loadIdentity } from './ranking/identity.js';
import { Ranking } from './ranking/ranking.js';
import { createAdapter } from './ranking/providers/index.js';

const STORAGE_KEY = 'retro-squash.settings.v2';

/** @type {import('./ui/ui.js').Settings} */
const DEFAULTS = {
  difficulty: 'normal',
  bestOf: 3,
  sound: true,
  lang: (navigator.language || 'en').toLowerCase().startsWith('he') ? 'he' : 'en',
  pace: 'normal',
  autoT: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode etc. */ }
}

const settings = loadSettings();

// ------------------------------------------------------------------ ranking

const identity = loadIdentity();
const ranking = new Ranking({ identity });
createAdapter(BACKEND).then((adapter) => { ranking.setAdapter(adapter); refreshPlayerLine(); });

/** Nickname, rating and rank under the Play button. */
function refreshPlayerLine() {
  if (!identity.nickname) { ui.setPlayerLine(''); return; }
  const est = ranking.estimate();
  const parts = [identity.nickname];
  if (!ranking.available) {
    // no backend: name only
  } else if (est.provisional) {
    parts.push(ui.t('ratingEstimate', { rating: est.rating }));
  } else {
    parts.push(ui.t('ratingLine', { rating: ranking.state.rating }));
    if (ranking.state.rank) parts.push(ui.t('rankLine', { rank: ranking.state.rank }));
  }
  if (ranking.pending) parts.push(ui.t('pendingResults', { n: ranking.pending }));
  ui.setPlayerLine(parts.join('  ·  '));
}

/** Make sure a nickname exists, asking once; resolves false if the dialog was cancelled. */
async function ensureNickname() {
  if (identity.nickname) return true;
  const name = await ui.showNickname({ cancellable: false });
  return !!name;
}

async function openLeaderboard() {
  ui.showLeaderboard();
  if (!ranking.available) {
    ui.renderLeaderboard({ status: ui.t('rankingNotConfigured') });
    return;
  }
  try {
    const { top, me } = await ranking.leaderboard(100);
    const meLine = me
      ? `${ui.t('yourRank')}: #${me.rank}  ·  ${me.nickname}  ·  ${ui.t('ratingLine', { rating: me.rating })}`
      : ui.t('unranked');
    const status = ranking.pending ? ui.t('pendingResults', { n: ranking.pending }) : '';
    ui.renderLeaderboard({ top, me, meLine, status });
    refreshPlayerLine();
  } catch (err) {
    console.warn('leaderboard', err);
    ui.renderLeaderboard({ status: ui.t('rankingUnavailable') });
  }
}

// --------------------------------------------------------------------- PWA

const pwa = new Pwa({
  onInstallable: (can, manual) => ui.setInstallable(can, manual),
  onUpdate: () => ui.showUpdate(true),
});

// ---------------------------------------------------------------------- UI

let game;
const ui = new UI(document, settings, {
  onPlay: async () => {
    if (!(await ensureNickname())) return;
    refreshPlayerLine();
    pwa.enterFullscreen();
    game.stopDemo();
    game.startMatch();
  },
  onDemo: () => game.startDemo(),
  onResume: () => game.resume(),
  onRestart: () => { game.resume(); game.startMatch(); },
  onMenu: () => game.toMenu(),
  onAction: (a) => game.input.pushAction(a),
  onSettings: (s) => { saveSettings(s); game.applySettings(s); refreshPlayerLine(); },
  onRanking: () => openLeaderboard(),
  onInstall: () => pwa.promptInstall(),
  onUpdate: () => pwa.applyUpdate(),
  onNickname: async (name) => {
    const res = await ranking.setNickname(name);
    if (res.ok) refreshPlayerLine();
    return res;
  },
});

try {
  game = new Game({
    canvas: document.getElementById('court3d'),
    surface: document.getElementById('stage'),
    ui,
    settings,
    onPlaying: (on) => pwa.keepAwake(on),
    onMatchFinished: (result) => {
      if (!ranking.available) return;
      ui.setGameOverRank(ui.t('resultQueued'));
      ranking.submit(result);
    },
  });
} catch (err) {
  console.error(err);
  document.getElementById('webglError').classList.remove('hidden');
}

ranking.onChange((kind, detail) => {
  if (kind === 'standing' && game && game.state === 'matchover') {
    const d = detail.delta ?? 0;
    ui.setGameOverRank(ui.t('resultRating', { rating: detail.rating, delta: `${d >= 0 ? '+' : ''}${d}`, rank: detail.rank ?? '-' }));
  } else if (kind === 'rejected' && game && game.state === 'matchover') {
    ui.setGameOverRank(ui.t('resultRejected'));
  }
  refreshPlayerLine();
});

if (game) ui.showMenu();
refreshPlayerLine();

// Service worker: production builds only (the dev server serves no sw.js).
if (import.meta.env.PROD) pwa.register(`${import.meta.env.BASE_URL}sw.js`);

// Expose for debugging in the console.
window.squash = game;
window.squashRanking = ranking;
