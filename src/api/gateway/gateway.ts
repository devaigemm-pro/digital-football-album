// Pipeline del API Gateway (borde): compone terminación TLS, límite de tasa,
// autenticación y enrutado en un único punto de entrada agnóstico del framework.
//
// Diseño (design.md · "API Gateway (borde)"): el gateway "termina TLS (Req
// 20.1), autentica peticiones con el access token (JWT) de sesión (Req 1.2),
// aplica límites de tasa y enruta a los servicios". El orden del pipeline es:
//
//   1. Terminación TLS  → rechaza texto plano (426) antes de tocar nada más.
//   2. Rate limiting    → protege el borde por clave de cliente (429).
//   3. Autenticación    → valida el access token y adjunta `userId` (401).
//   4. Enrutado         → resuelve la ruta y delega en el manejador del servicio
//                         (404 si no existe).
//
// El rate limiting se aplica antes de autenticar para proteger el borde de
// tráfico abusivo aún no autenticado, usando el `clientId` de la petición (p. ej.
// IP). Una vez autenticado, los servicios ven `context.userId`.
//
// Task 4.1 — Requirements: 1.2, 20.1

import { authenticate, type AuthMiddlewareConfig } from './auth-middleware.js';
import { TokenBucketRateLimiter } from './rate-limiter.js';
import { GatewayRouter } from './router.js';
import { createTlsTerminationConfig, enforceTls, type TlsTerminationConfig } from './tls.js';
import {
  buildSecurityHeaders,
  handlePreflight,
  type EdgeSecurityConfig,
} from './security-headers.js';
import type { GatewayContext, GatewayRequest, GatewayResponse } from './types.js';

/** Dependencias e inyección de configuración del gateway. */
export interface GatewayConfig {
  readonly router: GatewayRouter;
  readonly auth: AuthMiddlewareConfig;
  readonly rateLimiter: TokenBucketRateLimiter;
  /** Política de terminación TLS. Por defecto `createTlsTerminationConfig()`. */
  readonly tls?: TlsTerminationConfig;
  /**
   * Rutas públicas que NO requieren autenticación (p. ej. salud, o endpoints de
   * auth delegados a un proveedor externo). Se resuelven tras TLS y rate limit,
   * antes del middleware de autenticación. Opcional.
   */
  readonly publicRouter?: GatewayRouter;
  /**
   * Seguridad del borde: CORS y cabeceras de endurecimiento. Si se omite, no se
   * añaden cabeceras CORS (apto para clientes no-web) pero sí las de seguridad
   * base cuando esté configurado.
   */
  readonly security?: EdgeSecurityConfig;
}

/**
 * Deriva la clave de rate limiting de la petición: usa `clientId` cuando está
 * presente (p. ej. IP remota) y cae a `'anonymous'` si no. Al ser antes de
 * autenticar, no se dispone aún del `userId`.
 */
function rateLimitKey(request: GatewayRequest): string {
  return request.clientId ?? 'anonymous';
}

/**
 * API Gateway del borde. Expone `handle`, que ejecuta el pipeline completo y
 * devuelve la respuesta normalizada. No levanta ningún servidor HTTP: un
 * adaptador concreto traduce el request/response nativo a estos tipos.
 */
export class ApiGateway {
  private readonly router: GatewayRouter;
  private readonly auth: AuthMiddlewareConfig;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly tls: TlsTerminationConfig;
  private readonly publicRouter: GatewayRouter | undefined;
  private readonly security: EdgeSecurityConfig | undefined;

  constructor(config: GatewayConfig) {
    this.router = config.router;
    this.auth = config.auth;
    this.rateLimiter = config.rateLimiter;
    this.tls = config.tls ?? createTlsTerminationConfig();
    this.publicRouter = config.publicRouter;
    this.security = config.security;
  }

  /** Fusiona las cabeceras de seguridad/CORS en una respuesta del pipeline. */
  private withSecurityHeaders(request: GatewayRequest, response: GatewayResponse): GatewayResponse {
    if (!this.security) return response;
    const secHeaders = buildSecurityHeaders(request, this.security);
    return {
      ...response,
      headers: { ...secHeaders, ...(response.headers ?? {}) },
    };
  }

  /** Ejecuta el pipeline del borde para una petición entrante. */
  async handle(request: GatewayRequest): Promise<GatewayResponse> {
    const response = await this.runPipeline(request);
    return this.withSecurityHeaders(request, response);
  }

  /** Pipeline interno; su salida se envuelve con las cabeceras de seguridad. */
  private async runPipeline(request: GatewayRequest): Promise<GatewayResponse> {
    // 1. Terminación TLS: rechazar texto plano en el borde (Req 20.1).
    const tlsRejection = enforceTls(request, this.tls);
    if (tlsRejection !== null) {
      return tlsRejection;
    }

    // 2. Preflight CORS: responder OPTIONS antes de rate limit/auth.
    if (this.security) {
      const preflight = handlePreflight(request, this.security);
      if (preflight !== null) {
        return preflight;
      }
    }

    // 3. Límite de tasa por clave de cliente.
    const limit = this.rateLimiter.consume(rateLimitKey(request));
    if (!limit.allowed) {
      return {
        status: 429,
        headers: { 'retry-after': String(limit.retryAfterSeconds) },
        body: {
          error: 'rate_limited',
          message: 'Se superó el límite de tasa; reintente más tarde.',
        },
      };
    }

    // 4. Rutas públicas: se resuelven sin autenticación (salud, auth delegada).
    const baseContext: GatewayContext = { request };
    if (this.publicRouter) {
      const publicMatch = this.publicRouter.resolve(request.method, request.path);
      if (publicMatch !== null) {
        return publicMatch.handler(baseContext);
      }
    }

    // 5. Autenticación del access token JWT (Req 1.2).
    const authOutcome = await authenticate(baseContext, this.auth);
    if ('response' in authOutcome) {
      return authOutcome.response;
    }
    const context = authOutcome.context;

    // 6. Enrutado al manejador del servicio de backend (autenticado).
    const match = this.router.resolve(request.method, request.path);
    if (match === null) {
      return {
        status: 404,
        body: { error: 'not_found', message: `Sin ruta para ${request.method} ${request.path}` },
      };
    }

    return match.handler(context);
  }
}
