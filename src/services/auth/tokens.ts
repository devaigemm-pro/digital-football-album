// Utilidades de tokens del Servicio_Autenticación.
//
// El diseño (design.md, "Servicio_Autenticación") define la sesión como:
//   - un access token (JWT) de vida corta firmado por el backend, y
//   - un refresh token opaco de vida larga, persistido de forma segura.
//
// Para no añadir dependencias, el access token se implementa como un JWT
// HS256 (HMAC-SHA256) con el módulo `crypto` nativo de Node, y el refresh token
// se genera como un valor opaco aleatorio del que solo se persiste su hash
// SHA-256 (`tokenHash`), nunca el valor en claro.
//
// Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Codifica un `Buffer`/`string` en base64url (sin padding). */
function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Claims mínimos del access token (JWT) de sesión. */
export interface AccessTokenClaims {
  /** `sub`: identificador del usuario (Req 1.2). */
  sub: string;
  /** `iat`: emitido en (segundos epoch). */
  iat: number;
  /** `exp`: expiración (segundos epoch); vida corta (Req 1). */
  exp: number;
}

/** Cabecera fija del JWT HS256. */
const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

/**
 * Firma un access token (JWT HS256) con los claims dados. El secreto no se
 * incluye en el token; solo su HMAC. Determinista dados los mismos claims.
 */
export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  const headerPart = base64url(JSON.stringify(JWT_HEADER));
  const payloadPart = base64url(JSON.stringify(claims));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

/** Resultado de verificar un access token. */
export type VerifyResult =
  | { valid: true; claims: AccessTokenClaims }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verifica la firma y la expiración de un access token (JWT HS256).
 * `nowSeconds` se inyecta para poder probar la expiración de forma determinista.
 */
export function verifyAccessToken(token: string, secret: string, nowSeconds: number): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'malformed' };
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const signingInput = `${headerPart}.${payloadPart}`;
  const expected = base64url(createHmac('sha256', secret).update(signingInput).digest());
  if (!constantTimeEquals(signaturePart, expected)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let claims: AccessTokenClaims;
  try {
    const json = Buffer.from(payloadPart, 'base64').toString('utf8');
    claims = JSON.parse(json) as AccessTokenClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    return { valid: false, reason: 'malformed' };
  }
  if (nowSeconds >= claims.exp) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, claims };
}

/**
 * Genera un refresh token opaco (valor en claro para el cliente) y su hash
 * SHA-256 para persistir. Solo el hash se almacena (nunca el valor en claro),
 * de modo que una filtración de la base de datos no expone tokens usables.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = base64url(randomBytes(32));
  return { token, tokenHash: hashRefreshToken(token) };
}

/** Hash SHA-256 (hex) de un refresh token en claro, para búsqueda y comparación. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparación en tiempo constante de dos strings de igual propósito. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
