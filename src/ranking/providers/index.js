/**
 * @module ranking/providers
 * Picks the provider adapter named in src/config/backend.js. Adapters are
 * loaded lazily so a game without a backend ships none of their code. A
 * configuration that still holds the placeholders (or is incomplete) yields
 * `null`, which the Ranking treats as "no backend".
 * @param {typeof import('../../config/backend.js').BACKEND} backend
 * @returns {Promise<object|null>}
 */
import { isBackendConfigured } from '../../config/backend.js';

export async function createAdapter(backend) {
  if (!isBackendConfigured(backend)) return null;
  switch (backend.provider) {
    case 'supabase': return (await import('./supabase.js')).createSupabaseAdapter(backend);
    default:
      console.warn(`unknown ranking provider ${backend.provider}`);
      return null;
  }
}
