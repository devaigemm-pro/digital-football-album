// Pruebas del presenter de sesión: login/registro multiproveedor, logout y
// borrado de cuenta con confirmación (Task 26.1/26.2).
//
// Requirements: 22.1, 22.2, 22.6 (login/logout) · 22.7, 22.8 (borrado de cuenta)
//
// TypeScript puro con dobles inyectados (AuthClient fake en memoria,
// InMemorySecureTokenStore, InMemoryAccessTokenHolder): NO requieren red,
// dispositivo ni dependencias nativas. Cubren:
//   - login/registro válido → persiste Refresh_Token + Access_Token en memoria +
//     sesión autenticada (Req 22.2).
//   - login inválido → AuthenticationError, sin autenticar ni persistir (Req 22.3).
//   - logout → invalida el refresh en el backend + purga tokens locales (Req 22.6).
//   - deleteAccount SIN confirmación → no toca backend ni tokens; devuelve
//     'confirmation-required' (Req 22.7).
//   - deleteAccount CON confirmación → invoca DELETE /cuenta, purga tokens y
//     señala redirect al login (Req 22.8).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts).
// Para comprobaciones síncronas de instancia se usa
// `expect(x instanceof Y).toBe(true)` (el shim solo expone toBeInstanceOf bajo
// `.rejects`).

import { InMemorySecureTokenStore } from '../storage/secure-token-store';
import { InMemoryAccessTokenHolder } from '../net/session-client';
import type { TokenPair } from '../net/session-client';
import {
  AuthSessionPresenter,
  AuthenticationError,
  type AuthClient,
  type AuthCredential,
  type SessionStatus,
} from './auth-session';

/**
 * AuthClient fake programable y observable. Registra las llamadas para poder
 * verificar que el presenter invoca el Servicio_Autenticación con lo esperado.
 */
class FakeAuthClient implements AuthClient {
  loginCalls: AuthCredential[] = [];
  registerCalls: AuthCredential[] = [];
  logoutCalls: string[] = [];
  deleteAccountCalls = 0;

  /** Par de tokens devuelto por login/register en el caso feliz. */
  tokens: TokenPair = {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };
  /** Si se define, login/register lanzan este error (credenciales inválidas). */
  loginError: Error | null = null;

  async login(credential: AuthCredential): Promise<TokenPair> {
    this.loginCalls.push(credential);
    if (this.loginError) {
      throw this.loginError;
    }
    return this.tokens;
  }

  async register(credential: AuthCredential): Promise<TokenPair> {
    this.registerCalls.push(credential);
    if (this.loginError) {
      throw this.loginError;
    }
    return this.tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    this.logoutCalls.push(refreshToken);
  }

  async deleteAccount(): Promise<void> {
    this.deleteAccountCalls += 1;
  }
}

/** Arma un presenter con dobles en memoria y expone las piezas para asertar. */
function makePresenter() {
  const authClient = new FakeAuthClient();
  const tokenStore = new InMemorySecureTokenStore();
  const accessTokenHolder = new InMemoryAccessTokenHolder();
  const statusChanges: SessionStatus[] = [];
  const presenter = new AuthSessionPresenter({
    authClient,
    tokenStore,
    accessTokenHolder,
    onSessionChange: (status) => statusChanges.push(status),
  });
  return { presenter, authClient, tokenStore, accessTokenHolder, statusChanges };
}

const emailCredential: AuthCredential = {
  provider: 'email',
  email: 'hincha@example.com',
  password: 'secreto',
};

describe('AuthSessionPresenter — login multiproveedor (Req 22.1, 22.2)', () => {
  it('login válido persiste el Refresh_Token, coloca el Access_Token y autentica', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder, statusChanges } =
      makePresenter();

    const result = await presenter.login(emailCredential);

    expect(result).toEqual({ outcome: 'authenticated' });
    expect(presenter.isAuthenticated()).toBe(true);
    expect(presenter.getStatus()).toBe('authenticated');
    // Refresh_Token en el Almacenamiento_Seguro (Req 22.2).
    expect(await tokenStore.getRefreshToken()).toBe('refresh-1');
    // Access_Token en el holder en memoria.
    expect(accessTokenHolder.get()).toBe('access-1');
    // El AuthClient recibió la credencial del proveedor (Req 22.1).
    expect(authClient.loginCalls).toHaveLength(1);
    expect(authClient.loginCalls[0]).toEqual(emailCredential);
    // Notificación de cambio a la navegación.
    expect(statusChanges).toEqual(['authenticated']);
  });

  it('acepta credenciales de Apple y Google (multiproveedor, Req 22.1)', async () => {
    const { presenter, authClient } = makePresenter();

    await presenter.login({ provider: 'apple', identityToken: 'apple-tok' });
    await presenter.login({ provider: 'google', identityToken: 'google-tok' });

    expect(authClient.loginCalls.map((c) => c.provider)).toEqual([
      'apple',
      'google',
    ]);
    expect(presenter.isAuthenticated()).toBe(true);
  });

  it('register válido crea la sesión y autentica (Req 22.1, 22.2)', async () => {
    const { presenter, authClient, tokenStore } = makePresenter();

    const result = await presenter.register(emailCredential);

    expect(result).toEqual({ outcome: 'authenticated' });
    expect(authClient.registerCalls).toHaveLength(1);
    expect(await tokenStore.getRefreshToken()).toBe('refresh-1');
    expect(presenter.isAuthenticated()).toBe(true);
  });

  it('login inválido no autentica ni persiste y lanza AuthenticationError (Req 22.3)', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder, statusChanges } =
      makePresenter();
    authClient.loginError = new Error('credenciales inválidas');

    let caught: unknown;
    try {
      await presenter.login(emailCredential);
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof AuthenticationError).toBe(true);
    // Sin sesión ni tokens tras el fallo.
    expect(presenter.isAuthenticated()).toBe(false);
    expect(await tokenStore.getRefreshToken()).toBeNull();
    expect(accessTokenHolder.get()).toBeNull();
    expect(statusChanges).toEqual([]);
  });

  it('un par de tokens inválido (refresh vacío) no autentica (Req 22.2)', async () => {
    const { presenter, authClient, tokenStore } = makePresenter();
    authClient.tokens = { accessToken: 'access-1', refreshToken: '' };

    let caught: unknown;
    try {
      await presenter.login(emailCredential);
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof AuthenticationError).toBe(true);
    expect(presenter.isAuthenticated()).toBe(false);
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });
});

describe('AuthSessionPresenter — logout (Req 22.6)', () => {
  it('invalida el Refresh_Token en el backend y purga los tokens locales', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder, statusChanges } =
      makePresenter();
    await presenter.login(emailCredential);

    const result = await presenter.logout();

    expect(result).toEqual({ outcome: 'signed-out' });
    // Logout invocado con el Refresh_Token vigente (invalidación en backend).
    expect(authClient.logoutCalls).toEqual(['refresh-1']);
    // Tokens purgados localmente.
    expect(await tokenStore.getRefreshToken()).toBeNull();
    expect(accessTokenHolder.get()).toBeNull();
    expect(presenter.isAuthenticated()).toBe(false);
    expect(statusChanges).toEqual(['authenticated', 'unauthenticated']);
  });

  it('purga los tokens locales aunque el logout del backend falle', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder } = makePresenter();
    await presenter.login(emailCredential);
    authClient.logout = async () => {
      throw new Error('backend caído');
    };

    let caught: unknown;
    try {
      await presenter.logout();
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof Error).toBe(true);
    // El estado local queda limpio pese al fallo del backend.
    expect(await tokenStore.getRefreshToken()).toBeNull();
    expect(accessTokenHolder.get()).toBeNull();
    expect(presenter.isAuthenticated()).toBe(false);
  });
});

describe('AuthSessionPresenter — borrado de cuenta con confirmación (Req 22.7, 22.8)', () => {
  it('sin confirmación NO invoca el backend ni toca los tokens (Req 22.7)', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder } = makePresenter();
    await presenter.login(emailCredential);

    const result = await presenter.deleteAccount({ confirmed: false });

    expect(result).toEqual({ outcome: 'confirmation-required' });
    // DELETE /cuenta NO se invocó.
    expect(authClient.deleteAccountCalls).toBe(0);
    // Tokens y sesión intactos.
    expect(await tokenStore.getRefreshToken()).toBe('refresh-1');
    expect(accessTokenHolder.get()).toBe('access-1');
    expect(presenter.isAuthenticated()).toBe(true);
  });

  it('con confirmación invoca DELETE /cuenta, purga tokens y señala redirect al login (Req 22.8)', async () => {
    const { presenter, authClient, tokenStore, accessTokenHolder, statusChanges } =
      makePresenter();
    await presenter.login(emailCredential);

    const result = await presenter.deleteAccount({ confirmed: true });

    expect(result).toEqual({ outcome: 'account-deleted', redirectToLogin: true });
    expect(authClient.deleteAccountCalls).toBe(1);
    // Tokens purgados y sesión cerrada → redirección al login.
    expect(await tokenStore.getRefreshToken()).toBeNull();
    expect(accessTokenHolder.get()).toBeNull();
    expect(presenter.isAuthenticated()).toBe(false);
    expect(statusChanges).toEqual(['authenticated', 'unauthenticated']);
  });
});
