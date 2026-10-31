/**
 * @module ranking/providers
 * Picks the provider adapter named in src/config/backend.js. Adapters are
 * loaded lazily so a game without a backend ships none of their code.
 * @param {typeof import('../../config/backend.js').BACKEND} backend
 * @returns {Promise<object|null>}
 */
export async function createAdapter(backend) {
  if (!backend || !backend.provider || !backend.url) return null;
  switch (backend.provider) {
    case 'supabase': return (await import('./supabase.js')).createSupabaseAdapter(backend);
    default:
      console.warn(`unknown ranking provider ${backend.provider}`);
      return null;
  }
}
