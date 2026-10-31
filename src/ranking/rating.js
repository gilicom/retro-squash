/**
 * @module ranking/rating
 * The rating formula of the world ranking (Elo against fixed-strength
 * computer opponents). The server computes the rating that counts; this
 * module is the reference implementation used by the tests, by the docs and
 * by the client to show a provisional estimate while a result is queued
 * offline. docs/RANKING.md describes it; the SQL function in that document
 * must stay identical to this.
 *
 * Every new player starts at {@link INITIAL_RATING}. The three computer
 * levels have fixed ratings; beating a stronger opponent is worth more. The
 * K factor is larger for the first matches (so a new player finds their
 * level quickly) and scales with match length: a best-of-5 says more about a
 * player than a single game. Relaxed pace is easier and counts a little
 * less. Ratings cannot drop below {@link MIN_RATING}.
 */

export const INITIAL_RATING = 1000;
export const MIN_RATING = 100;

/** Fixed rating of each computer level. */
export const CPU_RATING = Object.freeze({ easy: 900, normal: 1200, hard: 1500 });

/** K factor: provisional players move faster. */
export const K_PROVISIONAL = 40;
export const K_ESTABLISHED = 24;
/** Matches before the K factor drops to the established value. */
export const PROVISIONAL_MATCHES = 20;

/** Multiplier by match length. */
export const LENGTH_FACTOR = Object.freeze({ 1: 0.6, 3: 1.0, 5: 1.2 });
/** Multiplier by game pace. */
export const PACE_FACTOR = Object.freeze({ relaxed: 0.8, normal: 1.0, fast: 1.0 });

/** Probability that a player rated `rating` beats an opponent rated `opp`. */
export function expectedScore(rating, opp) {
  return 1 / (1 + 10 ** ((opp - rating) / 400));
}

/**
 * Rating change for one finished match.
 * @param {{rating:number, matches:number, difficulty:'easy'|'normal'|'hard', won:boolean, bestOf:1|3|5, pace?:'relaxed'|'normal'|'fast'}} m
 *   `matches` is the number of rated matches played before this one.
 * @returns {number} signed delta, rounded to an integer
 */
export function ratingDelta({ rating, matches, difficulty, won, bestOf, pace = 'normal' }) {
  const opp = CPU_RATING[difficulty];
  if (opp === undefined) throw new Error(`unknown difficulty ${difficulty}`);
  const k = (matches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_ESTABLISHED)
    * (LENGTH_FACTOR[bestOf] ?? 1) * (PACE_FACTOR[pace] ?? 1);
  const e = expectedScore(rating, opp);
  return Math.round(k * ((won ? 1 : 0) - e));
}

/** New rating after a match (applies the floor). */
export function nextRating(m) {
  return Math.max(MIN_RATING, m.rating + ratingDelta(m));
}
