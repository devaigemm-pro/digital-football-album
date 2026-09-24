// Driver de persistencia respaldado por Supabase.
//
// Implementa las mismas interfaces de `../repositories.ts` y `../unit-of-work.ts`
// que el driver en memoria, pero contra un PostgreSQL real vía PostgREST.

export {
  createSupabaseClient,
  supabaseConfigFromEnv,
  type SupabaseConfig,
  type TypedSupabaseClient,
} from './client.js';
export { SupabaseRepository } from './base.js';
export { createSupabaseRepositories } from './factory.js';
export * from './repositories.js';
export { SupabaseObjectStorage, type SupabaseObjectStorageOptions } from './object-storage.js';
