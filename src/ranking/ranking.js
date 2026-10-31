/**
 * @module ranking/ranking
 * Client side of the world ranking: queues finished-match results, sends
 * them to the backend through a provider adapter, keeps the last known
 * rating and rank for offline display, and fetches the leaderboard.
 *
 * The game never depends on the backend being there: with no adapter (or
 * no network) results wait in localStorage and are flushed on the next
 * start, on `online`, or when the next result is submitted. The server
 * computes the rating (docs/RANKING.md); the client only shows it, plus a
 * provisional estimate from {@link ratingDelta} for results still queued.
 *
 * Provider adapters implement:
 *   submit({playerId, key, nickname, result})  -> {rating, delta, rank, matches, wins}
 *   top(limit)                                  -> [{rank, nickname, rating, matches, wins}]
 *   me(playerId)                                -> {rank, nickname, rating, matches, wins} | null
 *   rename({playerId, key, nickname})           -> void
 * and throw {@link RankingError} with kind 'network' (retry later),
 * 'rejected' (the server refused this result: drop it) or 'server'.
 */
import { INITIAL_RATING, MIN_RATING, ratingDelta } from './rating.js';
import { saveIdentity, validateNickname } from './identity.js';

export const QUEUE_KEY = 'retro-squash.ranking.queue.v1';
export const STATE_KEY = 'retro-squash.ranking.state.v1';
/** Queued results older than this are dropped (the server rejects them anyway). */
export const MAX_QUEUE_AGE_MS = 7 * 24 * 3600 * 1000;
export const MAX_QUEUE = 50;

export class RankingError extends Error {
  /** @param {'network'|'rejected'|'server'} kind */
  constructor(kind, message, status) {
    super(message || kind);
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @typedef {Object} MatchResult  built by the Game when a match ends
 * @property {'easy'|'normal'|'hard'} difficulty
 * @property {1|3|5} bestOf
 * @property {'relaxed'|'normal'|'fast'} pace
 * @property {boolean} autoT
 * @property {boolean} won
 * @property {[number, number]} games        games won, [you, cpu]
 * @property {Array<[number, number]>} gameScores  points per game
 * @property {number} rallies
 * @property {number} longestRally   hits in the longest rally
 * @property {number} duration       seconds of wall-clock play
 * @property {number} startedAt      epoch ms
 */

export class Ranking {
  /**
   * @param {{adapter?: object|null, identity: import('./identity.js').Identity, storage?: Storage}} opts
   */
  constructor({ adapter = null, identity, storage = globalThis.localStorage }) {
    this.adapter = adapter;
    this.identity = identity;
    this.storage = storage;
    this.queue = this._load(QUEUE_KEY, []);
    /** Last known standing from the server (null fields until the first submission). */
    this.state = { rating: null, rank: null, matches: 0, wins: 0, delta: null, ...this._load(STATE_KEY, {}) };
    this.flushing = null;
    this._listeners = new Set();
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.flush());
  }

  /** Swap the adapter in (it is loaded asynchronously) and send what is waiting. */
  setAdapter(adapter) {
    this.adapter = adapter;
    if (adapter) this.flush();
  }

  /** True when a backend is configured (not necessarily reachable). */
  get available() {
    return !!this.adapter;
  }

  /** True once the player has chosen a nickname. */
  get hasNickname() {
    return !!this.identity.nickname;
  }

  /** Number of results waiting to be sent. */
  get pending() {
    return this.queue.length;
  }

  /** Subscribe to changes: fn(kind, detail) with kind 'queued' | 'standing' | 'rejected' | 'offline' | 'nickname'. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(kind, detail) {
    for (const fn of this._listeners) fn(kind, detail);
  }

  /** Rating including a provisional estimate for queued results. */
  estimate() {
    let rating = this.state.rating ?? INITIAL_RATING;
    let matches = this.state.matches;
    for (const q of this.queue) {
      const r = q.result;
      rating = Math.max(MIN_RATING, rating + ratingDelta({ rating, matches, difficulty: r.difficulty, won: r.won, bestOf: r.bestOf, pace: r.pace }));
      matches++;
    }
    return { rating, matches, provisional: this.queue.length > 0 || this.state.rating === null };
  }

  /**
   * Set the nickname (validated); pushes it to the server when possible.
   * @returns {Promise<{ok:true, value:string}|{ok:false, reason:string}>}
   */
  async setNickname(raw) {
    const v = validateNickname(raw);
    if (!v.ok) return v;
    this.identity.nickname = v.value;
    saveIdentity(this.identity, this.storage);
    this._emit('nickname', v.value);
    if (this.adapter && this.state.rating !== null) {
      try { await this.adapter.rename({ playerId: this.identity.id, key: this.identity.key, nickname: v.value }); }
      catch (err) { if (err && err.kind === 'rejected') return { ok: false, reason: 'taken' }; }
    }
    return { ok: true, value: v.value };
  }

  /**
   * Queue a finished match and try to send it.
   * @param {MatchResult} result
   */
  submit(result) {
    this.queue.push({ result, queuedAt: Date.now() });
    while (this.queue.length > MAX_QUEUE) this.queue.shift();
    this._save(QUEUE_KEY, this.queue);
    this._emit('queued', result);
    return this.flush();
  }

  /** Send queued results in order; stops at the first network failure. */
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this._flush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async _flush() {
    if (!this.adapter || !this.identity.nickname) return;
    const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
    this.queue = this.queue.filter((q) => q.queuedAt > cutoff);
    while (this.queue.length) {
      const item = this.queue[0];
      try {
        const standing = await this.adapter.submit({
          playerId: this.identity.id,
          key: this.identity.key,
          nickname: this.identity.nickname,
          result: item.result,
        });
        this.queue.shift();
        this._save(QUEUE_KEY, this.queue);
        this.state = { ...this.state, ...standing };
        this._save(STATE_KEY, this.state);
        this._emit('standing', this.state);
      } catch (err) {
        if (err && err.kind === 'rejected') {
          // The server will never accept this one; do not block the rest.
          this.queue.shift();
          this._save(QUEUE_KEY, this.queue);
          this._emit('rejected', err);
          continue;
        }
        this._emit('offline', err);
        return;
      }
    }
  }

  /**
   * Fetch the top of the table and the player's own row.
   * @returns {Promise<{top: Array, me: object|null}>}
   */
  async leaderboard(limit = 100) {
    if (!this.adapter) throw new RankingError('network', 'no backend configured');
    const [top, me] = await Promise.all([this.adapter.top(limit), this.adapter.me(this.identity.id)]);
    if (me) {
      this.state = { ...this.state, rating: me.rating, rank: me.rank, matches: me.matches, wins: me.wins };
      this._save(STATE_KEY, this.state);
    }
    return { top, me };
  }

  _load(key, fallback) {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  _save(key, value) {
    try { this.storage?.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
  }
}
