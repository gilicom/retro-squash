/**
 * @module ranking/providers/supabase
 * Supabase adapter: plain `fetch` against the PostgREST API, no SDK.
 *
 *   submit  -> POST /rest/v1/rpc/submit_match   (SQL function validates, rates, ranks)
 *   top     -> GET  /rest/v1/leaderboard        (view: rank, nickname, rating, matches, wins)
 *   me      -> GET  /rest/v1/leaderboard?player_id=eq.<id>
 *   rename  -> POST /rest/v1/rpc/set_nickname
 *
 * The anon key only grants what docs/RANKING.md's SQL allows: reading the
 * leaderboard view and calling the two functions. A function that raises
 * (bad result shape, wrong key, rate limit, taken nickname) comes back as
 * HTTP 400 with a PostgREST error body and is surfaced as a 'rejected'
 * RankingError; connectivity problems and 5xx are 'network' so the result
 * is retried later.
 */
import { RankingError } from '../ranking.js';

const TIMEOUT_MS = 12000;

export function createSupabaseAdapter({ url, anonKey }) {
  const base = url.replace(/\/+$/, '');
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  async function call(path, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: ctrl.signal });
    } catch (err) {
      throw new RankingError('network', err?.message || 'fetch failed');
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const msg = body?.message || body?.hint || `${res.status} ${res.statusText}`;
    if (res.status >= 500 || res.status === 429) throw new RankingError('network', msg, res.status);
    throw new RankingError('rejected', msg, res.status);
  }

  const SELECT = 'select=rank,nickname,rating,matches,wins,player_id';

  return {
    async submit({ playerId, key, nickname, result }) {
      const row = await call('/rest/v1/rpc/submit_match', {
        method: 'POST',
        body: JSON.stringify({ p_player: playerId, p_key: key, p_nickname: nickname, p_result: result }),
      });
      const r = Array.isArray(row) ? row[0] : row;
      if (!r || typeof r.rating !== 'number') throw new RankingError('server', 'unexpected response');
      return { rating: r.rating, delta: r.delta, rank: r.rank, matches: r.matches, wins: r.wins };
    },

    async top(limit = 100) {
      const rows = await call(`/rest/v1/leaderboard?${SELECT}&order=rank.asc&limit=${Math.min(100, limit | 0)}`);
      return (rows || []).map((r) => ({ rank: r.rank, nickname: r.nickname, rating: r.rating, matches: r.matches, wins: r.wins }));
    },

    async me(playerId) {
      const rows = await call(`/rest/v1/leaderboard?${SELECT}&player_id=eq.${encodeURIComponent(playerId)}&limit=1`);
      const r = rows && rows[0];
      return r ? { rank: r.rank, nickname: r.nickname, rating: r.rating, matches: r.matches, wins: r.wins } : null;
    },

    async rename({ playerId, key, nickname }) {
      await call('/rest/v1/rpc/set_nickname', {
        method: 'POST',
        body: JSON.stringify({ p_player: playerId, p_key: key, p_nickname: nickname }),
      });
    },
  };
}
