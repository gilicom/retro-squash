/**
 * @module ranking/identity
 * The local player: a random id, a secret key and a nickname, created once
 * and kept in localStorage. The id is public (it is what the leaderboard
 * rows are keyed by); the key never leaves the device except inside a result
 * submission, where the server checks it against the stored hash so nobody
 * can post results under someone else's id.
 */

export const IDENTITY_KEY = 'retro-squash.player.v1';
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
/** Letters (any script), digits, space, dot, dash and underscore. */
const NICKNAME_RE = /^[\p{L}\p{N} ._-]+$/u;

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Normalise and validate a nickname.
 * @returns {{ok:true, value:string}|{ok:false, reason:'short'|'long'|'chars'}}
 */
export function validateNickname(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < NICKNAME_MIN) return { ok: false, reason: 'short' };
  if (value.length > NICKNAME_MAX) return { ok: false, reason: 'long' };
  if (!NICKNAME_RE.test(value)) return { ok: false, reason: 'chars' };
  return { ok: true, value };
}

/**
 * @typedef {Object} Identity
 * @property {string} id        UUID, public
 * @property {string} key       64 hex chars, secret
 * @property {string|null} nickname  null until chosen
 * @property {number} createdAt epoch ms
 */

/**
 * Load the identity, creating one on first run.
 * @param {Storage} [storage]
 * @returns {Identity}
 */
export function loadIdentity(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(IDENTITY_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.id === 'string' && typeof p.key === 'string') return { nickname: null, ...p };
    }
  } catch { /* corrupt or unavailable storage: start fresh */ }
  const id = { id: uuid(), key: randomHex(32), nickname: null, createdAt: Date.now() };
  saveIdentity(id, storage);
  return id;
}

export function saveIdentity(identity, storage = globalThis.localStorage) {
  try { storage?.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* private mode */ }
}
