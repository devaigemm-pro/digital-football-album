// Selector de driver de persistencia (composition root de la capa).
//
// Devuelve el conjunto de repositorios (Unit of Work) según el driver elegido,
// para que el arranque de la app componga los servicios sin conocer el backend
// concreto. Ambos drivers implementan las mismas interfaces de `Repositories`,
// así que cambiar de uno a otro no toca la lógica de negocio.
//
// Selección por `PERSISTENCE_DRIVER`:
//   - 'memory'   (por defecto): implementaciones en memoria (dev/pruebas).
//   - 'supabase':               driver real contra Supabase (PostgreSQL).

import { createInMemoryRepositories } from './in-memory/factory.js';
import {
  createSupabaseClient,
  supabaseConfigFromEnv,
  type TypedSupabaseClient,
} from './supabase/index.js';
import { createSupabaseRepositories } from './supabase/factory.js';
import type { Repositories } from './unit-of-work.js';

/** Drivers de persistencia soportados. */
export type PersistenceDriver = 'memory' | 'supabase';

/** Resultado del ensamblado: los repositorios y, si aplica, el cliente creado. */
export interface PersistenceContext {
  /** Driver efectivamente seleccionado. */
  readonly driver: PersistenceDriver;
  /** Conjunto de repositorios listo para inyectar en los servicios. */
  readonly repositories: Repositories;
  /**
   * Cliente de Supabase subyacente cuando `driver === 'supabase'`; `undefined`
   * para el driver en memoria. Útil si el arranque necesita el cliente para
   * otras capacidades (auth, storage, realtime).
   */
  readonly supabase?: TypedSupabaseClient;
}

/** Opciones de ensamblado; por defecto se leen del entorno. */
export interface CreateRepositoriesOptions {
  /** Fuerza el driver, ignorando `PERSISTENCE_DRIVER`. */
  readonly driver?: PersistenceDriver;
  /** Entorno de donde leer la configuración (por defecto `process.env`). */
  readonly env?: Record<string, string | undefined>;
  /**
   * Cliente de Supabase preexistente a reutilizar (p. ej. uno por usuario con su
   * JWT para que apliquen las políticas RLS). Solo aplica al driver 'supabase'.
   */
  readonly supabaseClient?: TypedSupabaseClient;
}

function resolveDriver(
  env: Record<string, string | undefined>,
  override?: PersistenceDriver,
): PersistenceDriver {
  const raw = (override ?? env.PERSISTENCE_DRIVER ?? 'memory').toLowerCase();
  if (raw === 'memory' || raw === 'supabase') return raw;
  throw new Error(`PERSISTENCE_DRIVER inválido: "${raw}". Valores válidos: memory | supabase.`);
}

/**
 * Ensambla el `Repositories` según el driver seleccionado. Este es el único
 * punto que conoce las factorías concretas; el resto de la app depende solo de
 * las interfaces.
 */
export function createRepositories(options: CreateRepositoriesOptions = {}): PersistenceContext {
  const env = options.env ?? process.env;
  const driver = resolveDriver(env, options.driver);

  if (driver === 'memory') {
    return { driver, repositories: createInMemoryRepositories() };
  }

  // driver === 'supabase'
  const client = options.supabaseClient ?? createSupabaseClient(supabaseConfigFromEnv(env));
  return {
    driver,
    repositories: createSupabaseRepositories(client),
    supabase: client,
  };
}
