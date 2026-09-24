/**
 * Pruebas de las utilidades de token del Servicio_Autenticación.
 * (Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4).
 *
 * Cubren la firma/verificación del access token (JWT HS256), su expiración y la
 * detección de manipulación, y la generación/hash de refresh tokens.
 */
import { describe, it, expect } from 'vitest';
import { fc, pbtAssert } from '../../../test/pbt.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from './tokens.js';

const SECRET = 'secreto-de-prueba';

function claims(now: number, ttl: number): AccessTokenClaims {
  return { sub: 'usuario-1', iat: now, exp: now + ttl };
}

describe('access token (JWT HS256)', () => {
  it('firma y verifica un token válido antes de expirar', () => {
    const now = 1_700_000_000;
    const token = signAccessToken(claims(now, 900), SECRET);
    const result = verifyAccessToken(token, SECRET, now + 1);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.sub).toBe('usuario-1');
    }
  });

  it('rechaza un token expirado', () => {
    const now = 1_700_000_000;
    const token = signAccessToken(claims(now, 900), SECRET);
    const result = verifyAccessToken(token, SECRET, now + 900);
    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('rechaza un token con firma inválida (otro secreto)', () => {
    const now = 1_700_000_000;
    const token = signAccessToken(claims(now, 900), SECRET);
    const result = verifyAccessToken(token, 'otro-secreto', now + 1);
    expect(result).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rechaza un token manipulado en el payload', () => {
    const now = 1_700_000_000;
    const token = signAccessToken(claims(now, 900), SECRET);
    const [h, , s] = token.split('.');
    const tampered = `${h}.${Buffer.from('{"sub":"otro","iat":1,"exp":9999999999}').toString('base64url')}.${s}`;
    const result = verifyAccessToken(tampered, SECRET, now + 1);
    expect(result).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rechaza un token malformado', () => {
    expect(verifyAccessToken('no-es-un-jwt', SECRET, 0)).toEqual({
      valid: false,
      reason: 'malformed',
    });
  });

  it('property: todo token recién firmado se verifica antes de exp y falla en/después de exp', () => {
    pbtAssert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 0, max: 2_000_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (sub, iat, ttl) => {
          const token = signAccessToken({ sub, iat, exp: iat + ttl }, SECRET);
          const antes = verifyAccessToken(token, SECRET, iat + ttl - 1);
          const despues = verifyAccessToken(token, SECRET, iat + ttl);
          expect(antes.valid).toBe(true);
          expect(despues.valid).toBe(false);
        },
      ),
    );
  });
});

describe('refresh token', () => {
  it('genera un valor y su hash consistente', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(tokenHash).toBe(hashRefreshToken(token));
  });

  it('produce valores únicos en emisiones sucesivas', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('property: el hash es determinista y distinto del valor en claro', () => {
    pbtAssert(
      fc.property(fc.string(), (value) => {
        expect(hashRefreshToken(value)).toBe(hashRefreshToken(value));
        if (value.length > 0) {
          expect(hashRefreshToken(value)).not.toBe(value);
        }
      }),
    );
  });
});
