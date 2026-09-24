// Configuración del backend: lectura y validación centralizada del entorno.
//
// Se valida TODA la configuración obligatoria al arranque (fail-fast): si algo
// falta o es incoherente, se acumulan todos los errores y se lanza uno solo con
// el detalle, en lugar de fallar a mitad de ejecución. Esto evita arranques
// "a medias" en producción y da mensajes accionables.

/** Entorno de ejecución. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Configuración validada del backend. */
export interface BackendConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly host: string;
  /** Relaja TLS en el borde (solo permitido fuera de producción). */
  readonly allowInsecure: boolean;
  /** Orígenes CORS permitidos: '*' | lista | undefined (sin CORS). */
  readonly corsOrigins?: '*' | readonly string[];

  readonly auth: {
    /** Secreto HMAC del JWT propio del AuthService (fallback). */
    readonly accessTokenSecret: string;
    readonly accessTokenTtlSeconds: number;
    readonly refreshTokenTtlSeconds: number;
    /** Si está definido, se delega la verificación en Supabase Auth. */
    readonly supabase?: {
      readonly url: string;
      readonly apikey: string;
      readonly hs256Secret?: string;
    };
  };

  readonly persistence: {
    readonly driver: 'memory' | 'supabase';
    /** Presente cuando el driver es 'supabase'. */
    readonly supabase?: {
      readonly url: string;
      readonly key: string;
    };
  };

  /**
   * API deportiva (Servicio_Datos_Deportivos). Opcional: si no hay `apiKey`, la
   * sincronización de temporada queda NO disponible (el servicio lo indica con
   * un error claro, sin fingir éxito). No bloquea el arranque del backend.
   */
  readonly sports: {
    /** Proveedor configurado. `none` cuando no hay API key. */
    readonly provider: 'none' | 'api-football';
    /** Base URL del proveedor (p. ej. https://v3.football.api-sports.io). */
    readonly baseUrl?: string;
    /** API key del proveedor (secreto; se carga en el entorno, nunca en el repo). */
    readonly apiKey?: string;
  };
}

/** Error de configuración que agrega todos los problemas detectados. */
export class ConfigError extends Error {
  constructor(public readonly problemas: readonly string[]) {
    super(
      `Configuración inválida (${problemas.length} problema(s)):\n` +
        problemas.map((p) => `  - ${p}`).join('\n'),
    );
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

function readInt(env: Env, name: string, fallback: number, problemas: string[]): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    problemas.push(`${name} debe ser un entero positivo (recibido: "${raw}").`);
    return fallback;
  }
  return parsed;
}

function resolveNodeEnv(env: Env): NodeEnv {
  const raw = (env.NODE_ENV ?? 'development').toLowerCase();
  if (raw === 'production' || raw === 'test' || raw === 'development') return raw;
  return 'development';
}

/**
 * Carga y valida la configuración desde el entorno. Lanza `ConfigError` con
 * TODOS los problemas si la configuración es inválida.
 */
export function loadConfig(env: Env = process.env): BackendConfig {
  const problemas: string[] = [];
  const nodeEnv = resolveNodeEnv(env);
  const isProd = nodeEnv === 'production';

  const port = readInt(env, 'PORT', 3000, problemas);
  const host = env.HOST ?? '0.0.0.0';
  const allowInsecure = env.ALLOW_INSECURE === 'true';

  // CORS: 'CORS_ORIGINS' = "*" o lista separada por comas. Vacío => sin CORS.
  const corsRaw = (env.CORS_ORIGINS ?? '').trim();
  let corsOrigins: '*' | readonly string[] | undefined;
  if (corsRaw === '*') {
    corsOrigins = '*';
  } else if (corsRaw.length > 0) {
    corsOrigins = corsRaw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }
  if (isProd && corsOrigins === '*') {
    problemas.push('CORS_ORIGINS="*" no se recomienda en producción; especifica orígenes.');
  }

  // En producción no se permite relajar TLS.
  if (isProd && allowInsecure) {
    problemas.push('ALLOW_INSECURE=true no está permitido con NODE_ENV=production.');
  }

  // --- Persistencia ---
  const driverRaw = (env.PERSISTENCE_DRIVER ?? 'memory').toLowerCase();
  let driver: 'memory' | 'supabase' = 'memory';
  if (driverRaw === 'memory' || driverRaw === 'supabase') {
    driver = driverRaw;
  } else {
    problemas.push(`PERSISTENCE_DRIVER inválido: "${driverRaw}" (válidos: memory | supabase).`);
  }
  if (isProd && driver === 'memory') {
    problemas.push('PERSISTENCE_DRIVER=memory no es apto para producción (usa supabase).');
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_KEY;

  let persistenceSupabase: { url: string; key: string } | undefined;
  if (driver === 'supabase') {
    if (!supabaseUrl || !supabaseKey) {
      problemas.push(
        'PERSISTENCE_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
      );
    } else {
      persistenceSupabase = { url: supabaseUrl, key: supabaseKey };
    }
  }

  // --- Auth ---
  const accessTokenSecret = env.ACCESS_TOKEN_SECRET ?? '';
  const authProvider = (env.AUTH_PROVIDER ?? '').toLowerCase();
  const supabaseAnon =
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let authSupabase: { url: string; apikey: string; hs256Secret?: string } | undefined;

  if (authProvider === 'supabase') {
    if (!supabaseUrl || !supabaseAnon) {
      problemas.push('AUTH_PROVIDER=supabase requiere SUPABASE_URL y una anon/publishable key.');
    } else {
      authSupabase = {
        url: supabaseUrl,
        apikey: supabaseAnon,
        ...(env.SUPABASE_JWT_SECRET ? { hs256Secret: env.SUPABASE_JWT_SECRET } : {}),
      };
    }
  } else {
    // Sin Supabase Auth se usa el JWT HMAC propio: el secreto es obligatorio.
    if (!accessTokenSecret) {
      problemas.push('ACCESS_TOKEN_SECRET es obligatorio cuando AUTH_PROVIDER no es "supabase".');
    } else if (isProd && accessTokenSecret.length < 32) {
      problemas.push('ACCESS_TOKEN_SECRET debe tener al menos 32 caracteres en producción.');
    }
  }

  const accessTokenTtlSeconds = readInt(env, 'ACCESS_TOKEN_TTL_SECONDS', 900, problemas);
  const refreshTokenTtlSeconds = readInt(env, 'REFRESH_TOKEN_TTL_SECONDS', 1_209_600, problemas);

  // --- API deportiva (opcional; no bloquea el arranque) ---
  // Solo se soporta 'api-football' por ahora. Sin API key, el proveedor es
  // 'none' y la sincronización de temporada responde "no disponible".
  const sportsProviderRaw = (env.SPORTS_API_PROVIDER ?? '').toLowerCase();
  const sportsApiKey = env.SPORTS_API_KEY?.trim();
  let sports: BackendConfig['sports'];
  if (sportsApiKey && sportsApiKey.length > 0) {
    if (sportsProviderRaw !== '' && sportsProviderRaw !== 'api-football') {
      problemas.push(
        `SPORTS_API_PROVIDER inválido: "${sportsProviderRaw}" (soportado: api-football).`,
      );
    }
    sports = {
      provider: 'api-football',
      baseUrl: (env.SPORTS_API_BASE_URL ?? 'https://v3.football.api-sports.io').trim(),
      apiKey: sportsApiKey,
    };
  } else {
    sports = { provider: 'none' };
  }

  if (problemas.length > 0) {
    throw new ConfigError(problemas);
  }

  return {
    nodeEnv,
    port,
    host,
    allowInsecure,
    ...(corsOrigins !== undefined ? { corsOrigins } : {}),
    auth: {
      // Placeholder seguro cuando se delega en Supabase Auth (no se usa el HMAC).
      accessTokenSecret: accessTokenSecret || 'unused-supabase-auth',
      accessTokenTtlSeconds,
      refreshTokenTtlSeconds,
      ...(authSupabase ? { supabase: authSupabase } : {}),
    },
    persistence: {
      driver,
      ...(persistenceSupabase ? { supabase: persistenceSupabase } : {}),
    },
    sports,
  };
}
