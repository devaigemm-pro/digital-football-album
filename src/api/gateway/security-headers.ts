// Seguridad del borde: CORS y cabeceras de seguridad HTTP.
//
// Produce las cabeceras que el gateway añade a cada respuesta (CORS para
// clientes web + cabeceras de endurecimiento) y resuelve las peticiones
// preflight `OPTIONS`. Es configurable por entorno y agnóstico del framework:
// opera sobre `GatewayRequest`/`GatewayResponse`.

import type { GatewayRequest, GatewayResponse } from './types.js';

/** Configuración de CORS y cabeceras de seguridad. */
export interface EdgeSecurityConfig {
  /**
   * Orígenes permitidos para CORS. `'*'` permite cualquiera (solo apto para
   * APIs públicas sin credenciales). Una lista restringe a esos orígenes.
   */
  readonly allowedOrigins: '*' | readonly string[];
  /** Métodos permitidos. Por defecto los del router. */
  readonly allowedMethods?: readonly string[];
  /** Cabeceras de request permitidas. Por defecto `authorization, content-type`. */
  readonly allowedHeaders?: readonly string[];
  /** Permitir credenciales (cookies/autorización). Incompatible con origin `'*'`. */
  readonly allowCredentials?: boolean;
  /** Segundos de caché del preflight. Por defecto 600. */
  readonly maxAgeSeconds?: number;
  /**
   * Añadir HSTS (`Strict-Transport-Security`). Solo tiene sentido con TLS; por
   * defecto se activa cuando la petición es segura.
   */
  readonly enableHsts?: boolean;
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['authorization', 'content-type'];

/** Resuelve el valor de `Access-Control-Allow-Origin` para una petición. */
function resolveAllowOrigin(request: GatewayRequest, config: EdgeSecurityConfig): string | null {
  if (config.allowedOrigins === '*') return '*';
  const origin = request.headers['origin'];
  if (origin && config.allowedOrigins.includes(origin)) return origin;
  return null;
}

/**
 * Construye las cabeceras de seguridad + CORS para una petición dada. Se
 * fusionan con las cabeceras de la respuesta del handler.
 */
export function buildSecurityHeaders(
  request: GatewayRequest,
  config: EdgeSecurityConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    // Endurecimiento estándar.
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  };

  // HSTS solo bajo TLS (o si se fuerza explícitamente).
  if (config.enableHsts ?? request.isSecure) {
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  }

  // CORS.
  const allowOrigin = resolveAllowOrigin(request, config);
  if (allowOrigin !== null) {
    headers['access-control-allow-origin'] = allowOrigin;
    headers['vary'] = 'Origin';
    if (config.allowCredentials && allowOrigin !== '*') {
      headers['access-control-allow-credentials'] = 'true';
    }
  }

  return headers;
}

/**
 * Si la petición es un preflight CORS (`OPTIONS` con `Origin`), devuelve la
 * respuesta 204 con las cabeceras de negociación; si no, `null`.
 */
export function handlePreflight(
  request: GatewayRequest,
  config: EdgeSecurityConfig,
): GatewayResponse | null {
  if (request.method !== 'OPTIONS') return null;
  if (request.headers['origin'] === undefined) return null;

  const allowOrigin = resolveAllowOrigin(request, config);
  if (allowOrigin === null) {
    // Origen no permitido: preflight rechazado sin cabeceras CORS.
    return { status: 403, body: { error: 'cors_origin_not_allowed' } };
  }

  const methods = (config.allowedMethods ?? DEFAULT_METHODS).join(', ');
  const reqHeaders = request.headers['access-control-request-headers'];
  const headers: Record<string, string> = {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': methods,
    'access-control-allow-headers':
      reqHeaders ?? (config.allowedHeaders ?? DEFAULT_HEADERS).join(', '),
    'access-control-max-age': String(config.maxAgeSeconds ?? 600),
    vary: 'Origin',
  };
  if (config.allowCredentials && allowOrigin !== '*') {
    headers['access-control-allow-credentials'] = 'true';
  }
  return { status: 204, headers };
}
