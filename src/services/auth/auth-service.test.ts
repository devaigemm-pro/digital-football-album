/**
 * Pruebas del Servicio_Autenticación (Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4).
 *
 * Cubren, con los dobles en memoria de la persistencia:
 *  - register/login multiproveedor que emiten { accessToken, refreshToken }.
 *  - Registro por email crea cuenta nueva; email ya registrado se rechaza.
 *  - Credenciales inválidas → INVALID_CREDENTIALS (base del 401 — Req 1.3).
 *  - refresh con rotación: el token usado queda rotado y se emite uno nuevo en
 *    la misma familia; refresh expirado/revocado se rechaza.
 *  - Reutilización de un refresh token ya rotado invalida toda la familia.
 *  - logout revoca el refresh vigente (idempotente).
 *  - Property-based: robustez del ciclo login → refresh* → logout y unicidad de
 *    la Foto... (no aplica aquí) — ver propiedades de token abajo.
 *
 * Los property tests de esta tarea no corresponden a Correctness Properties
 * numeradas del diseño (el borrado de cuenta es la Property 31, Task 3.3); aquí
 * se usan como pruebas robustas de invariantes del ciclo de tokens.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ProveedorAuth } from '../../domain/types.js';
import {
  InMemoryRefreshTokenRepository,
  InMemoryUsuarioRepository,
} from '../../persistence/in-memory/repositories.js';
import { fc, pbtAssertAsync } from '../../../test/pbt.js';
import { AuthService, type AuthServiceConfig } from './auth-service.js';
import type { ProviderVerifier } from './providers.js';
import { hashRefreshToken, verifyAccessToken } from './tokens.js';

const CONFIG: AuthServiceConfig = {
  accessTokenSecret: 'test-secret-not-for-production',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
};

/** Verifier que acepta cualquier credencial no vacía y deriva el email de ella. */
class AcceptingVerifier implements ProviderVerifier {
  verify(provider: ProveedorAuth, credential: string) {
    if (credential.length === 0) {
      return Promise.resolve({ ok: false as const });
    }
    return Promise.resolve({
      ok: true as const,
      identity: { proveedor: provider, email: `${credential}@example.com` },
    });
  }
}

/** Verifier que rechaza toda credencial (para probar INVALID_CREDENTIALS). */
class RejectingVerifier implements ProviderVerifier {
  verify() {
    return Promise.resolve({ ok: false as const });
  }
}

interface Harness {
  service: AuthService;
  usuarios: InMemoryUsuarioRepository;
  refreshTokens: InMemoryRefreshTokenRepository;
  advance(ms: number): void;
}

function makeHarness(verifier: ProviderVerifier = new AcceptingVerifier()): Harness {
  const usuarios = new InMemoryUsuarioRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();

  let clockMs = Date.parse('2025-01-01T00:00:00.000Z');
  let idCounter = 0;
  let tokenCounter = 0;

  const service = new AuthService({
    usuarios,
    refreshTokens,
    verifier,
    config: CONFIG,
    now: () => clockMs,
    // UUID v4 determinista basado en contador (formato válido).
    newId: () => {
      idCounter += 1;
      const hex = idCounter.toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}`;
    },
    // Refresh token determinista y único por emisión.
    newRefreshToken: () => {
      tokenCounter += 1;
      const token = `refresh-${tokenCounter}`;
      return { token, tokenHash: hashRefreshToken(token) };
    },
  });

  return {
    service,
    usuarios,
    refreshTokens,
    advance: (ms: number) => {
      clockMs += ms;
    },
  };
}

describe('AuthService — emisión de tokens (register/login)', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('registra una cuenta nueva por email y emite el par de tokens (Req 1.1, 1.4)', async () => {
    const pair = await h.service.register({ provider: 'email', credential: 'nuevo' });

    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(await h.usuarios.count()).toBe(1);

    const usuario = await h.usuarios.findByEmail('nuevo@example.com');
    expect(usuario).not.toBeNull();
    expect(usuario?.proveedorAuth).toBe('email');
  });

  it('rechaza el registro por email de un correo ya registrado (Req 1.4)', async () => {
    await h.service.register({ provider: 'email', credential: 'dup' });
    await expect(
      h.service.register({ provider: 'email', credential: 'dup' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
  });

  it('emite un access token verificable cuyo sub es el usuario (Req 1.2)', async () => {
    const pair = await h.service.login({ provider: 'google', credential: 'ana' });
    const usuario = await h.usuarios.findByEmail('ana@example.com');
    const nowSeconds = Math.floor(Date.parse('2025-01-01T00:00:00.000Z') / 1000);

    const result = verifyAccessToken(pair.accessToken, CONFIG.accessTokenSecret, nowSeconds);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.sub).toBe(usuario?.id);
    }
  });

  it('login por email de un correo nuevo crea la cuenta (Req 1.2, 1.4)', async () => {
    await h.service.login({ provider: 'email', credential: 'primeriza' });
    expect(await h.usuarios.findByEmail('primeriza@example.com')).not.toBeNull();
  });

  it('login reutiliza la cuenta existente para el mismo correo (Req 1.2)', async () => {
    await h.service.register({ provider: 'email', credential: 'bea' });
    await h.service.login({ provider: 'email', credential: 'bea' });
    expect(await h.usuarios.count()).toBe(1);
  });

  it('rechaza credenciales inválidas con INVALID_CREDENTIALS (Req 1.3)', async () => {
    const rej = makeHarness(new RejectingVerifier());
    await expect(
      rej.service.login({ provider: 'apple', credential: 'lo-que-sea' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('AuthService — refresh con rotación y familia', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('rota el refresh: marca el usado y emite uno nuevo en la misma familia (Req 1)', async () => {
    const first = await h.service.login({ provider: 'email', credential: 'rot' });
    const second = await h.service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const usado = await h.refreshTokens.findByTokenHash(hashRefreshToken(first.refreshToken));
    const nuevo = await h.refreshTokens.findByTokenHash(hashRefreshToken(second.refreshToken));
    expect(usado?.rotado).toBe(true);
    expect(nuevo?.rotado).toBe(false);
    expect(nuevo?.familiaId).toBe(usado?.familiaId);
  });

  it('rechaza un refresh token inexistente (Req 1)', async () => {
    await expect(h.service.refresh('no-existe')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rechaza un refresh token expirado (Req 1)', async () => {
    const pair = await h.service.login({ provider: 'email', credential: 'exp' });
    h.advance((CONFIG.refreshTokenTtlSeconds + 1) * 1000);
    await expect(h.service.refresh(pair.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('reutilizar un refresh ya rotado invalida toda la familia (Req 1)', async () => {
    const first = await h.service.login({ provider: 'email', credential: 'robo' });
    const second = await h.service.refresh(first.refreshToken);

    // Reutilización del token viejo (ya rotado): debe rechazarse.
    await expect(h.service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    // Y el token nuevo emitido en la familia también queda revocado.
    await expect(h.service.refresh(second.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    const usado = await h.refreshTokens.findByTokenHash(hashRefreshToken(first.refreshToken));
    const familia = await h.refreshTokens.findByFamiliaId(usado!.familiaId);
    expect(familia.every((t) => t.revocado)).toBe(true);
  });
});

describe('AuthService — logout', () => {
  it('revoca el refresh vigente y bloquea su uso posterior (Req 1)', async () => {
    const h = makeHarness();
    const pair = await h.service.login({ provider: 'email', credential: 'out' });

    await h.service.logout(pair.refreshToken);

    const stored = await h.refreshTokens.findByTokenHash(hashRefreshToken(pair.refreshToken));
    expect(stored?.revocado).toBe(true);
    await expect(h.service.refresh(pair.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('es idempotente ante un refresh token inexistente (Req 1)', async () => {
    const h = makeHarness();
    await expect(h.service.logout('no-existe')).resolves.toBeUndefined();
  });
});

describe('AuthService — propiedades del ciclo de tokens', () => {
  it('una cadena de N rotaciones deja exactamente un refresh vigente por sesión', async () => {
    await pbtAssertAsync(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (rotaciones, credencial) => {
          const h = makeHarness();
          let pair = await h.service.login({ provider: 'email', credential: credencial });

          for (let i = 0; i < rotaciones; i += 1) {
            pair = await h.service.refresh(pair.refreshToken);
          }

          const usuario = await h.usuarios.findByEmail(`${credencial}@example.com`);
          const tokens = await h.refreshTokens.findByUsuarioId(usuario!.id);
          const vigentes = tokens.filter((t) => !t.rotado && !t.revocado);

          // Tras N rotaciones existe exactamente un refresh token vigente...
          expect(vigentes).toHaveLength(1);
          // ...y coincide con el último emitido.
          expect(vigentes[0]?.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
        },
      ),
    );
  });

  it('tras logout ningún refresh de la sesión queda vigente', async () => {
    await pbtAssertAsync(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (rotaciones, credencial) => {
          const h = makeHarness();
          let pair = await h.service.login({ provider: 'email', credential: credencial });
          for (let i = 0; i < rotaciones; i += 1) {
            pair = await h.service.refresh(pair.refreshToken);
          }

          await h.service.logout(pair.refreshToken);

          const stored = await h.refreshTokens.findByTokenHash(hashRefreshToken(pair.refreshToken));
          expect(stored?.revocado).toBe(true);
        },
      ),
    );
  });
});
