// Cliente de Supabase tipado con el esquema generado.
//
// Crea un `SupabaseClient<Database>` a partir de la configuración de entorno.
// El tipo `Database` proviene de `src/types/database.ts` (generado con
// `supabase gen types --local`), de modo que las consultas del driver quedan
// verificadas contra el esquema real.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.js';

/** Cliente de Supabase tipado con el esquema del proyecto. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/** Configuración mínima para crear el cliente. */
export interface SupabaseConfig {
  /** URL del proyecto (p. ej. http://127.0.0.1:54321 en local). */
  readonly url: string;
  /**
   * Clave de API. En un backend de confianza puede ser la `service_role`
   * (omite RLS); en un cliente por usuario, la `anon`/`publishable` combinada
   * con el JWT del usuario para que apliquen las políticas RLS.
   */
  readonly key: string;
}

/**
 * Crea un cliente de Supabase tipado. Se desactiva la persistencia de sesión
 * porque este driver se usa desde el backend/servidor, no desde un navegador.
 */
export function createSupabaseClient(config: SupabaseConfig): TypedSupabaseClient {
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Lee la configuración desde variables de entorno.
 * Usa `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` si están presentes; si no,
 * cae a las variables públicas del `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` y
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Lanza si no encuentra una URL y clave.
 */
export function supabaseConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseConfig {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Configuración de Supabase ausente: define SUPABASE_URL y una clave ' +
        '(SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).',
    );
  }
  return { url, key };
}
