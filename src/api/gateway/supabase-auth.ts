// Verificador de JWT emitidos por Supabase Auth (GoTrue).
//
// El backend delega la autenticación en Supabase Auth: el cliente obtiene un
// access token de GoTrue y lo envía en `Authorization: Bearer`. El gateway solo
// verifica ese token.
//
// Supabase Auth firma los access tokens con claves asimétricas ECC P-256
// (`alg: ES256`) y publica las claves públicas en un endpoint JWKS
// (`/auth/v1/.well-known/jwks.json`). Este verificador descarga y cachea el
// JWKS, empareja la clave por `kid`, verifica la firma ES256 con la clave
// pública y valida `exp`/`aud`. No requiere ningún secreto compartido en el
// borde (más seguro y con rotación de claves).
//
// Compatibilidad: si un despliegue usa el esquema legacy HS256 con `JWT secret`
// compartido, se puede pasar `hs256Secret` y el verificador validará esos
// tokens con HMAC-SHA256 en su lugar.

import {
  createPublicKey,
  createVerify,
  timingSafeEqual,
  verify as edVerify,
  createHmac,
  type KeyObject,
} from 'node:crypto';
import type { TokenVerifier, TokenVerifyResult } from './auth-middleware.js';

/** Estructura mínima de un JWK EC (P-256) del JWKS de GoTrue. */
interface Jwk {
  readonly kid?: string;
  readonly kty?: string;
  readonly crv?: string;
  readonly alg?: string;
  readonly x?: string;
  readonly y?: string;
}

/** Opciones del verificador de Supabase Auth. */
export interface SupabaseAuthVerifierOptions {
  /**
   * URL del endpoint JWKS de GoTrue, p. ej.
   * `http://127.0.0.1:54321/auth/v1/.well-known/jwks.json`.
   */
  readonly jwksUrl: string;
  /**
   * `apikey` (anon) requerida por el endpoint de GoTrue para servir el JWKS.
   */
  readonly apikey: string;
  /**
   * Audiencia esperada. Por defecto `'authenticated'`. `null` desactiva la
   * validación de audiencia.
   */
  readonly expectedAudience?: string | null;
  /**
   * Secreto legacy HS256. Si se provee, los tokens `alg: HS256` se validan con
   * HMAC-SHA256 usando este secreto (compatibilidad con el esquema antiguo).
   */
  readonly hs256Secret?: string;
  /** Inyección de `fetch` para pruebas. Por defecto el `fetch` global. */
  readonly fetchImpl?: typeof fetch;
}

function fromB64Url(segment: string): Buffer {
  return Buffer.from(segment, 'base64url');
}

/** Convierte una firma JWS (r||s, 64 bytes) a formato DER para `crypto.verify`. */
function joseToDer(signature: Buffer): Buffer {
  if (signature.length !== 64) return signature; // ya podría venir en DER
  const r = signature.subarray(0, 32);
  const s = signature.subarray(32, 64);
  const trim = (b: Buffer): Buffer => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i += 1;
    let out = b.subarray(i);
    // Si el bit alto está activo, anteponer 0x00 (entero positivo DER).
    if ((out[0] as number) & 0x80) out = Buffer.concat([Buffer.from([0]), out]);
    return out;
  };
  const rd = trim(r);
  const sd = trim(s);
  const seqLen = 2 + rd.length + 2 + sd.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rd.length]),
    rd,
    Buffer.from([0x02, sd.length]),
    sd,
  ]);
}

/**
 * Crea un `TokenVerifier` async que valida los access tokens de Supabase Auth
 * (ES256 vía JWKS; opcionalmente HS256 legacy). Cachea las claves por `kid`.
 */
export function createSupabaseAuthVerifier(options: SupabaseAuthVerifierOptions): TokenVerifier {
  const expectedAud =
    options.expectedAudience === undefined ? 'authenticated' : options.expectedAudience;
  const doFetch = options.fetchImpl ?? fetch;
  const keyCache = new Map<string, KeyObject>();

  async function keyForKid(kid: string): Promise<KeyObject | null> {
    const cached = keyCache.get(kid);
    if (cached) return cached;
    const res = await doFetch(options.jwksUrl, {
      headers: { apikey: options.apikey },
    });
    if (!res.ok) return null;
    const jwks = (await res.json()) as { keys?: Jwk[] };
    for (const jwk of jwks.keys ?? []) {
      if (jwk.kid && jwk.kty === 'EC') {
        const key = createPublicKey({
          key: jwk as unknown as import('node:crypto').JsonWebKey,
          format: 'jwk',
        });
        keyCache.set(jwk.kid, key);
      }
    }
    return keyCache.get(kid) ?? null;
  }

  function validateClaims(payloadPart: string, nowSeconds: number): TokenVerifyResult {
    let claims: { sub?: unknown; exp?: unknown; aud?: unknown };
    try {
      claims = JSON.parse(fromB64Url(payloadPart).toString('utf8')) as {
        sub?: unknown;
        exp?: unknown;
        aud?: unknown;
      };
    } catch {
      return { valid: false, reason: 'malformed' };
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      return { valid: false, reason: 'malformed' };
    }
    if (typeof claims.exp !== 'number') {
      return { valid: false, reason: 'malformed' };
    }
    if (nowSeconds >= claims.exp) {
      return { valid: false, reason: 'expired' };
    }
    if (expectedAud !== null && claims.aud !== expectedAud) {
      return { valid: false, reason: 'bad_signature' };
    }
    return { valid: true, userId: claims.sub, expEpochSeconds: claims.exp };
  }

  return {
    async verify(token: string, nowSeconds: number): Promise<TokenVerifyResult> {
      const parts = token.split('.');
      if (parts.length !== 3) return { valid: false, reason: 'malformed' };
      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

      let header: { alg?: unknown; kid?: unknown };
      try {
        header = JSON.parse(fromB64Url(headerPart).toString('utf8')) as {
          alg?: unknown;
          kid?: unknown;
        };
      } catch {
        return { valid: false, reason: 'malformed' };
      }

      const signingInput = `${headerPart}.${payloadPart}`;

      if (header.alg === 'HS256') {
        // Compatibilidad legacy con secreto compartido.
        if (!options.hs256Secret) return { valid: false, reason: 'bad_signature' };
        const expected = createHmac('sha256', options.hs256Secret).update(signingInput).digest();
        const got = fromB64Url(signaturePart);
        if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
          return { valid: false, reason: 'bad_signature' };
        }
        return validateClaims(payloadPart, nowSeconds);
      }

      if (header.alg === 'ES256') {
        if (typeof header.kid !== 'string') {
          return { valid: false, reason: 'malformed' };
        }
        const key = await keyForKid(header.kid);
        if (key === null) return { valid: false, reason: 'bad_signature' };
        const der = joseToDer(fromB64Url(signaturePart));
        const verifier = createVerify('SHA256');
        verifier.update(signingInput);
        verifier.end();
        const ok = verifier.verify({ key, dsaEncoding: 'der' }, der);
        if (!ok) return { valid: false, reason: 'bad_signature' };
        return validateClaims(payloadPart, nowSeconds);
      }

      // EdDSA u otros algoritmos no soportados: rechazar (defensa alg:none).
      void edVerify;
      return { valid: false, reason: 'bad_signature' };
    },
  };
}
