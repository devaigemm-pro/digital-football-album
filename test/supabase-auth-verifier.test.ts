// Pruebas del verificador de JWT de Supabase Auth (unitarias, sin red).
//
// Genera un par de claves EC P-256, firma tokens ES256 como lo hace GoTrue, y
// sirve el JWKS mediante un `fetch` inyectado. Verifica aceptación de tokens
// válidos y rechazo de inválidos (firma, expiración, audiencia, kid, estructura).

import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSupabaseAuthVerifier } from '../src/api/gateway/supabase-auth.js';

const KID = 'test-kid-1';
const NOW = 1_700_000_000;

// Par de claves EC P-256 para firmar/verificar en las pruebas.
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Convierte una firma DER de ECDSA a formato JOSE (r||s, 64 bytes). */
function derToJose(der: Buffer): Buffer {
  // Estructura DER: 0x30 len 0x02 rlen r 0x02 slen s
  let offset = 2;
  if (der[1]! & 0x80) offset += der[1]! & 0x7f; // longitud larga (poco común aquí)
  const rLen = der[offset + 1]!;
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  const sStart = offset + 2 + rLen;
  const sLen = der[sStart + 1]!;
  let s = der.subarray(sStart + 2, sStart + 2 + sLen);
  const pad = (b: Buffer): Buffer =>
    b.length >= 32 ? b.subarray(b.length - 32) : Buffer.concat([Buffer.alloc(32 - b.length), b]);
  r = pad(r);
  s = pad(s);
  return Buffer.concat([r, s]);
}

/** Firma un JWT ES256 de prueba con los claims dados. */
function makeToken(
  claims: Record<string, unknown>,
  opts: { kid?: string; key?: KeyObject } = {},
): string {
  const header = b64url({ alg: 'ES256', kid: opts.kid ?? KID, typ: 'JWT' });
  const payload = b64url(claims);
  const signingInput = `${header}.${payload}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const der = signer.sign(opts.key ?? privateKey);
  const jose = derToJose(der);
  return `${signingInput}.${jose.toString('base64url')}`;
}

/** JWKS con la clave pública EC de prueba, servido por el fetch inyectado. */
function jwksResponse(): Response {
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const body = JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'ES256' }] });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

const fetchImpl = (() => Promise.resolve(jwksResponse())) as unknown as typeof fetch;

const validClaims = {
  sub: 'd406ece4-ef80-409c-8ce9-d7eaeb1b9430',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'authtest@example.com',
  exp: NOW + 3600,
  iat: NOW,
};

describe('createSupabaseAuthVerifier (ES256 / JWKS)', () => {
  const verifier = createSupabaseAuthVerifier({
    jwksUrl: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
    apikey: 'anon-key',
    fetchImpl,
  });

  it('acepta un token ES256 válido y extrae el sub', async () => {
    const result = await verifier.verify(makeToken(validClaims), NOW);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe(validClaims.sub);
      expect(result.expEpochSeconds).toBe(validClaims.exp);
    }
  });

  it('rechaza firma inválida (otra clave)', async () => {
    const otra = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const token = makeToken(validClaims, { key: otra.privateKey });
    const result = await verifier.verify(token, NOW);
    expect(result).toMatchObject({ valid: false, reason: 'bad_signature' });
  });

  it('rechaza token expirado', async () => {
    const result = await verifier.verify(makeToken({ ...validClaims, exp: NOW - 1 }), NOW);
    expect(result).toMatchObject({ valid: false, reason: 'expired' });
  });

  it('rechaza audiencia inesperada', async () => {
    const result = await verifier.verify(makeToken({ ...validClaims, aud: 'anon' }), NOW);
    expect(result).toMatchObject({ valid: false, reason: 'bad_signature' });
  });

  it('rechaza kid desconocido (no está en el JWKS)', async () => {
    const result = await verifier.verify(makeToken(validClaims, { kid: 'kid-inexistente' }), NOW);
    expect(result).toMatchObject({ valid: false, reason: 'bad_signature' });
  });

  it('rechaza estructura malformada', async () => {
    const result = await verifier.verify('no-es-un-jwt', NOW);
    expect(result).toMatchObject({ valid: false, reason: 'malformed' });
  });
});
