// Middleware de autenticación del API Gateway (borde).
//
// Diseño (design.md · "API Gateway (borde)"): el gateway autentica cada petición
// con el **access token (JWT) de sesión** (Req 1.2). Este middleware:
//   1. extrae el token del encabezado `Authorization: Bearer <token>`,
//   2. lo valida con `verifyAccessToken` del Servicio_Autenticación,
//   3. rechaza con `401` los casos de token ausente / malformado / firma
//      inválida / expirado, y
//   4. al validar, adjunta el `userId` (claim `sub`) al contexto para los
//      servicios de backend (Req 1.2).
//
// Es agnóstico del framework: opera sobre `GatewayRequest`/`GatewayContext` y no
// depende de ningún servidor HTTP. El secreto de firma y el reloj se inyectan
// para pruebas deterministas de expiración.
//
// Task 4.1 — Requirements: 1.2

import { verifyAccessToken } from '../../services/auth/tokens.js';
import type { GatewayContext, GatewayRequest, GatewayResponse } from './types.js';

/** Reloj inyectable (segundos epoch) para verificar la expiración del token. */
export type ClockSeconds = () => number;

/**
 * Resultado de verificar un token en el borde: éxito con el `userId` (claim
 * `sub`) y la expiración, o rechazo con su motivo. Es el contrato que cumplen
 * tanto el verificador HMAC propio como el de Supabase Auth.
 */
export type TokenVerifyResult =
  | { readonly valid: true; readonly userId: string; readonly expEpochSeconds: number }
  | {
      readonly valid: false;
      readonly reason: 'malformed' | 'bad_signature' | 'expired';
    };

/**
 * Verificador de tokens inyectable. Permite alternar entre el JWT HMAC propio
 * del `AuthService` y el de un proveedor externo (Supabase Auth / GoTrue) sin
 * cambiar el pipeline del gateway.
 */
export interface TokenVerifier {
  verify(token: string, nowSeconds: number): TokenVerifyResult | Promise<TokenVerifyResult>;
}

/** Configuración del middleware de autenticación. */
export interface AuthMiddlewareConfig {
  /**
   * Secreto HMAC con el que se firmó el access token (JWT HS256) propio del
   * `AuthService`. Se usa por el verificador por defecto cuando no se inyecta
   * un `verifier`. Opcional si se provee `verifier`.
   */
  readonly accessTokenSecret?: string;
  /**
   * Verificador de tokens a usar. Por defecto, el JWT HMAC propio con
   * `accessTokenSecret`. Se inyecta `createSupabaseAuthVerifier(...)` para
   * validar los tokens de Supabase Auth.
   */
  readonly verifier?: TokenVerifier;
  /**
   * Reloj en segundos epoch. Por defecto usa el reloj del sistema; se inyecta en
   * pruebas para ejercitar la expiración de forma determinista.
   */
  readonly now?: ClockSeconds;
}

/**
 * Resultado de autenticar una petición: éxito con el `userId` extraído del token
 * o rechazo con la respuesta `401` a devolver.
 */
export type AuthResult =
  | { readonly authenticated: true; readonly userId: string; readonly expEpochSeconds: number }
  | { readonly authenticated: false; readonly response: GatewayResponse };

/** Motivo del rechazo de autenticación, para trazabilidad y pruebas. */
export type AuthRejectionReason =
  'missing_authorization' | 'malformed_authorization' | 'malformed' | 'bad_signature' | 'expired';

/**
 * Construye una respuesta `401 Unauthorized` con `WWW-Authenticate: Bearer` y un
 * cuerpo descriptivo. No revela detalles sensibles del token.
 */
function unauthorized(reason: AuthRejectionReason): GatewayResponse {
  return {
    status: 401,
    headers: { 'www-authenticate': 'Bearer' },
    body: {
      error: 'unauthorized',
      reason,
      message: 'Se requiere un access token válido para acceder al recurso (Req 1.2).',
    },
  };
}

/**
 * Extrae el token bearer del encabezado `Authorization`. Devuelve el token, o el
 * motivo de rechazo cuando el encabezado falta o no sigue el esquema `Bearer`.
 */
function extractBearerToken(
  request: GatewayRequest,
): { token: string } | { reason: 'missing_authorization' | 'malformed_authorization' } {
  const header = request.headers['authorization'];
  if (header === undefined || header.trim() === '') {
    return { reason: 'missing_authorization' };
  }
  const match = /^Bearer[ ]+(\S+)$/.exec(header.trim());
  if (match === null) {
    return { reason: 'malformed_authorization' };
  }
  return { token: match[1] as string };
}

/**
 * Autentica una petición contra el access token JWT. No adjunta nada al
 * contexto; devuelve el resultado para que el pipeline decida (ver
 * `authenticate`).
 */
export async function authenticateRequest(
  request: GatewayRequest,
  config: AuthMiddlewareConfig,
): Promise<AuthResult> {
  const nowSeconds = (config.now ?? defaultNowSeconds)();

  const extracted = extractBearerToken(request);
  if ('reason' in extracted) {
    return { authenticated: false, response: unauthorized(extracted.reason) };
  }

  const verifier = resolveVerifier(config);
  const result = await verifier.verify(extracted.token, nowSeconds);
  if (!result.valid) {
    return { authenticated: false, response: unauthorized(result.reason) };
  }

  return {
    authenticated: true,
    userId: result.userId,
    expEpochSeconds: result.expEpochSeconds,
  };
}

/**
 * Resuelve el verificador a usar: el inyectado por configuración o, por defecto,
 * el JWT HMAC propio del `AuthService` con `accessTokenSecret`.
 */
function resolveVerifier(config: AuthMiddlewareConfig): TokenVerifier {
  if (config.verifier) return config.verifier;
  const secret = config.accessTokenSecret;
  if (secret === undefined) {
    throw new Error('AuthMiddlewareConfig requiere `accessTokenSecret` o un `verifier`.');
  }
  return {
    verify: (token, nowSeconds): TokenVerifyResult => {
      const result = verifyAccessToken(token, secret, nowSeconds);
      if (!result.valid) return { valid: false, reason: result.reason };
      return {
        valid: true,
        userId: result.claims.sub,
        expEpochSeconds: result.claims.exp,
      };
    },
  };
}

/**
 * Middleware de autenticación del pipeline: valida el token y, en éxito, devuelve
 * un `GatewayContext` enriquecido con `userId`. En fallo devuelve la respuesta
 * `401` para cortar el pipeline (Req 1.2).
 */
export async function authenticate(
  context: GatewayContext,
  config: AuthMiddlewareConfig,
): Promise<{ readonly context: GatewayContext } | { readonly response: GatewayResponse }> {
  const result = await authenticateRequest(context.request, config);
  if (!result.authenticated) {
    return { response: result.response };
  }
  return {
    context: {
      ...context,
      userId: result.userId,
      tokenExpEpochSeconds: result.expEpochSeconds,
    },
  };
}

/** Reloj por defecto en segundos epoch. */
function defaultNowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
