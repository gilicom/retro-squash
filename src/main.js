/**
 * @module main
 * Entry point: loads persisted settings, builds the UI and the Game and
 * wires them together.
 */
import { Game } from './core/game.js';
import { UI } from './ui/ui.js';

const STORAGE_KEY = 'retro-squash.settings.v2';

/** @type {import('./ui/ui.js').Settings} */
const DEFAULTS = {
  difficulty: 'normal',
  bestOf: 3,
  sound: true,
  lang: (navigator.language || 'en').toLowerCase().startsWith('he') ? 'he' : 'en',
  pace: 'normal',
  graphics: '3d',
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

let game;
const ui = new UI(document, settings, {
  onPlay: () => { game.stopDemo(); game.startMatch(); },
  onDemo: () => game.startDemo(),
  onResume: () => game.resume(),
  onRestart: () => { game.resume(); game.startMatch(); },
  onMenu: () => game.toMenu(),
  onAction: (a) => game.input.pushAction(a),
  onSettings: (s) => { saveSettings(s); game.applySettings(s); },
});
game = new Game({
  canvas3d: document.getElementById('court3d'),
  canvas2d: document.getElementById('court2d'),
  surface: document.getElementById('stage'),
  ui,
  settings,
});
ui.showMenu();

// Expose for debugging in the console.
window.squash = game;
