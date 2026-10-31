/**
 * @module config/backend
 * Public configuration of the ranking backend. These values are shipped to
 * every browser, so only *public* keys belong here (a Supabase anon key or a
 * Firebase web config); access is restricted server-side by row-level
 * security / database rules and the result-validating function described in
 * docs/RANKING.md.
 *
 * With `provider: null` the game runs without a backend: matches are played
 * normally, results are queued locally and the ranking screen says the
 * ranking is unavailable.
 */
export const BACKEND = Object.freeze({
  /** @type {'supabase'|'firebase'|null} */
  provider: null,
  /** Project URL, e.g. https://abcdefgh.supabase.co */
  url: '',
  /** Public (anon) API key. */
  anonKey: '',
});
