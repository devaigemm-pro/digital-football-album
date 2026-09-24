// Punto de arranque ejecutable del backend del Álbum de Fútbol Digital.
//
// Ensambla la app (persistencia + servicios), monta el API Gateway y levanta un
// servidor HTTP de Node. Toda la configuración se lee y valida al arranque
// (fail-fast) en `./composition/config.ts`.
//
// Variables de entorno (ver config.ts para las reglas de validación):
//   NODE_ENV                 development | test | production.
//   PORT                     Puerto de escucha (por defecto 3000).
//   HOST                     Host de escucha (por defecto 0.0.0.0).
//   ACCESS_TOKEN_SECRET      Secreto HMAC del JWT propio (si no se usa Supabase Auth).
//   ACCESS_TOKEN_TTL_SECONDS / REFRESH_TOKEN_TTL_SECONDS  TTLs de los tokens.
//   ALLOW_INSECURE           'true' relaja TLS (prohibido en producción).
//   PERSISTENCE_DRIVER       memory | supabase.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  Persistencia con driver supabase.
//   AUTH_PROVIDER=supabase + SUPABASE_URL + SUPABASE_ANON_KEY  Verificación GoTrue.

import { createServices } from './composition/services.js';
import { mountGateway } from './composition/gateway.js';
import { createHttpServer } from './composition/http-server.js';
import { ConfigError, loadConfig } from './composition/config.js';
import { createLogger } from './composition/logger.js';

function main(): void {
  const bootLogger = createLogger();

  // 0. Cargar y validar la configuración (fail-fast).
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      bootLogger.error('Configuración inválida al arranque', {
        problemas: err.problemas,
      });
      process.exit(1);
      return;
    }
    throw err;
  }

  const logger = createLogger({
    base: { service: 'album-backend', env: config.nodeEnv },
  });

  // 1. Ensamblar servicios (persistencia + colaboradores + dominio).
  const services = createServices({
    config: {
      accessTokenSecret: config.auth.accessTokenSecret,
      accessTokenTtlSeconds: config.auth.accessTokenTtlSeconds,
      refreshTokenTtlSeconds: config.auth.refreshTokenTtlSeconds,
      sports: config.sports,
    },
    persistence: { driver: config.persistence.driver },
  });

  // 2. Montar el gateway. Si hay config de Supabase Auth, valida tokens de
  // GoTrue contra su JWKS; si no, usa el JWT HMAC propio del AuthService.
  const gateway = mountGateway(services, {
    accessTokenSecret: config.auth.accessTokenSecret,
    allowInsecure: config.allowInsecure,
    ...(config.auth.supabase ? { supabaseAuth: config.auth.supabase } : {}),
    ...(config.corsOrigins !== undefined ? { corsOrigins: config.corsOrigins } : {}),
  });

  // 3. Levantar el servidor HTTP (con logging de peticiones).
  const server = createHttpServer(gateway, { logger });

  server.listen(config.port, config.host, () => {
    logger.info('Backend escuchando', {
      host: config.host,
      port: config.port,
      persistencia: services.persistence.driver,
      auth: config.auth.supabase ? 'supabase' : 'hmac',
      tls: config.allowInsecure ? 'relajado' : 'exigido',
    });
  });

  // 4. Apagado ordenado.
  const shutdown = (signal: string): void => {
    logger.info('Cerrando servidor', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
