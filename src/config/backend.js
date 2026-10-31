/**
 * @module config/backend
 * Public configuration of the ranking backend. These values are shipped to
 * every browser, so only *public* keys belong here: the Supabase **anon
 * public** key. Never the `service_role` key, never the database password.
 * Access is restricted server-side by row-level security and the
 * result-validating function `submit_match` (supabase/schema.sql, explained
 * in docs/RANKING.md).
 *
 * Until `url` and `anonKey` are filled in (or while they still hold the
 * placeholders below) the game runs without a backend: matches are played
 * normally, results are queued locally and the ranking screen says the
 * ranking is unavailable.
 *
 * Where to find the two values in the Supabase dashboard:
 * Project Settings → API (or the "Connect" button) → **Project URL** and
 * **anon public** key.
 */
export const BACKEND = Object.freeze({
  /** @type {'supabase'|'firebase'|null} */
  provider: 'supabase',
  /** Project URL, e.g. https://abcdefghijkl.supabase.co (no trailing slash). */
  url: 'https://PROJECT_REF.supabase.co',
  /** The anon public key (a long string starting with "eyJ" or "sb_publishable_"). */
  anonKey: 'YOUR_ANON_PUBLIC_KEY',
});

/** Placeholder fragments that mean "not configured yet". */
const PLACEHOLDERS = ['PROJECT_REF', 'YOUR_ANON_PUBLIC_KEY'];

/**
 * Whether the backend configuration points at a real project.
 * @param {typeof BACKEND} backend
 * @returns {boolean}
 */
export function isBackendConfigured(backend = BACKEND) {
  if (!backend || !backend.provider || !backend.url || !backend.anonKey) return false;
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(backend.url)) return false;
  return !PLACEHOLDERS.some((p) => backend.url.includes(p) || backend.anonKey.includes(p));
}
