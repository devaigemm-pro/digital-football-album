// Pruebas del cliente consciente de sesión: refresh single-flight con rotación
// y reintento (Task 25.2) — Requirements: 22.4, 22.5, 27.1
//
// TypeScript puro con fakes inyectados (send fake, InMemorySecureTokenStore,
// holder en memoria): NO requieren dependencias nativas ni temporizadores reales.
// Cubren:
//   - single-flight: N peticiones concurrentes con 401 → UN solo refresh (Req 27.1).
//   - rotación persistida + reintento de la petición original con el token nuevo
//     (Req 22.4).
//   - refresh 401 → clear() del Almacenamiento_Seguro + onSessionExpired()
//     + SessionExpiredError (Req 22.5).
//   - un 401 en petición NO autenticada no dispara refresh.
//   - makeAuthRefreshFn: mapea 401 del endpoint a "sesión no recuperable".
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import type { HttpRequest, HttpResponse } from './http-client';
import { InMemorySecureTokenStore } from '../storage/secure-token-store';
import {
  InMemoryAccessTokenHolder,
  SessionExpiredError,
  SessionHttpClient,
  makeAuthRefreshFn,
  type RefreshFn,
  type SendFn,
  type TokenPair,
} from './session-client';

/**
 * Construye un `send` fake programable: la primera respuesta a una petición
 * autenticada devuelve 401 (Access_Token expirado); tras el refresh, devuelve
 * 200. Registra las llamadas y el Authorization observado en cada una.
 */
interface FakeSend {
  send: SendFn;
  calls: Array<{ request: HttpRequest }>;
  /** Access_Token que el fake "verá" como válido tras el refresh. */
  setValidAccessToken(token: string): void;
}

function makeFakeSend(accessTokenHolder: InMemoryAccessTokenHolder): FakeSend {
  const calls: Array<{ request: HttpRequest }> = [];
  let validToken: string | null = null;

  const send: SendFn = async <T,>(
    request: HttpRequest,
  ): Promise<HttpResponse<T>> => {
    calls.push({ request });
    // Endpoints no autenticados (p. ej. refresh) siempre 200 en este fake base;
    // el refresh real se inyecta aparte en la mayoría de las pruebas.
    if (!request.authenticated) {
      return { status: 200, body: null as T };
    }
    const current = accessTokenHolder.get();
    if (validToken !== null && current === validToken) {
      return { status: 200, body: { ok: true } as T };
    }
    return { status: 401, body: null as T };
  };

  return {
    send,
    calls,
    setValidAccessToken: (token) => {
      validToken = token;
    },
  };
}

/** Petición autenticada de ejemplo. */
const authedGet: HttpRequest = {
  method: 'GET',
  path: '/perfil',
  authenticated: true,
};

describe('SessionHttpClient — refresh, rotación y reintento (Req 22.4)', () => {
  it('renueva ante 401, rota el par y reintenta la petición original con el token nuevo', async () => {
    const holder = new InMemoryAccessTokenHolder('access-viejo');
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-viejo');
    const fake = makeFakeSend(holder);

    let refreshCalls = 0;
    const refresh: RefreshFn = async (refreshToken) => {
      refreshCalls += 1;
      expect(refreshToken).toBe('refresh-viejo');
      // Tras rotar, el fake aceptará este Access_Token como válido.
      fake.setValidAccessToken('access-nuevo');
      return { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo' };
    };
    let sessionExpired = false;

    const client = new SessionHttpClient({
      send: fake.send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh,
      onSessionExpired: () => {
        sessionExpired = true;
      },
    });

    const response = await client.send$(authedGet);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    // Rotación: Access_Token en memoria y Refresh_Token en el store.
    expect(holder.get()).toBe('access-nuevo');
    expect(await store.getRefreshToken()).toBe('refresh-nuevo');
    // Petición original + reintento tras el refresh = 2 envíos de la autenticada.
    expect(fake.calls).toHaveLength(2);
    expect(sessionExpired).toBe(false);
  });

  it('deduplica el refresh: N peticiones concurrentes con 401 → un solo refresh (Req 27.1)', async () => {
    const holder = new InMemoryAccessTokenHolder('access-viejo');
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-viejo');
    const fake = makeFakeSend(holder);

    let refreshCalls = 0;
    // El refresh no resuelve hasta que lo liberamos, para forzar concurrencia real.
    let releaseRefresh: (value: TokenPair) => void = () => {};
    const refreshGate = new Promise<TokenPair>((resolve) => {
      releaseRefresh = resolve;
    });
    const refresh: RefreshFn = async () => {
      refreshCalls += 1;
      const tokens = await refreshGate;
      fake.setValidAccessToken(tokens.accessToken);
      return tokens;
    };

    const client = new SessionHttpClient({
      send: fake.send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh,
      onSessionExpired: () => {},
    });

    // Lanza 4 peticiones concurrentes que reciben 401 antes de que el refresh
    // se complete: todas deben esperar la MISMA promesa de refresh.
    const pending = [
      client.send$(authedGet),
      client.send$(authedGet),
      client.send$(authedGet),
      client.send$(authedGet),
    ];

    // Deja que los 401 iniciales se procesen antes de liberar el refresh.
    await Promise.resolve();
    releaseRefresh({ accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo' });

    const responses = await Promise.all(pending);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    // Clave del single-flight: un único intercambio de refresh para las 4.
    expect(refreshCalls).toBe(1);
    expect(await store.getRefreshToken()).toBe('refresh-nuevo');
  });

  it('permite un nuevo refresh después de que el anterior finalizó', async () => {
    const holder = new InMemoryAccessTokenHolder('t0');
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('r0');
    const fake = makeFakeSend(holder);

    let refreshCalls = 0;
    const refresh: RefreshFn = async () => {
      refreshCalls += 1;
      const next = `t${refreshCalls}`;
      fake.setValidAccessToken(next);
      return { accessToken: next, refreshToken: `r${refreshCalls}` };
    };

    const client = new SessionHttpClient({
      send: fake.send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh,
      onSessionExpired: () => {},
    });

    await client.send$(authedGet);
    // El segundo ciclo empieza con un token que el fake ya no acepta (nuevo 401).
    fake.setValidAccessToken('inexistente');
    await client.send$(authedGet);

    expect(refreshCalls).toBe(2);
  });
});

describe('SessionHttpClient — refresh 401 → logout (Req 22.5)', () => {
  it('purga el Almacenamiento_Seguro, invoca onSessionExpired y lanza SessionExpiredError', async () => {
    const holder = new InMemoryAccessTokenHolder('access-viejo');
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-viejo');
    const fake = makeFakeSend(holder);

    // El refresh devuelve null (equivale a 401 del endpoint de refresh).
    const refresh: RefreshFn = async () => null;
    let sessionExpired = false;

    const client = new SessionHttpClient({
      send: fake.send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh,
      onSessionExpired: () => {
        sessionExpired = true;
      },
    });

    await expect(client.send$(authedGet)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(sessionExpired).toBe(true);
    expect(await store.getRefreshToken()).toBeNull();
    expect(holder.get()).toBeNull();
  });

  it('trata la ausencia de Refresh_Token como sesión expirada', async () => {
    const holder = new InMemoryAccessTokenHolder('access-viejo');
    const store = new InMemorySecureTokenStore(); // sin refresh token
    const fake = makeFakeSend(holder);
    let sessionExpired = false;

    const client = new SessionHttpClient({
      send: fake.send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh: async () => {
        throw new Error('no debería invocarse sin refresh token');
      },
      onSessionExpired: () => {
        sessionExpired = true;
      },
    });

    await expect(client.send$(authedGet)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(sessionExpired).toBe(true);
  });
});

describe('SessionHttpClient — límites del disparo de refresh', () => {
  it('no dispara refresh ante 401 en una petición NO autenticada', async () => {
    const holder = new InMemoryAccessTokenHolder(null);
    const store = new InMemorySecureTokenStore();
    // send fake que siempre responde 401, sea autenticada o no.
    const calls: HttpRequest[] = [];
    const send: SendFn = async <T,>(request: HttpRequest) => {
      calls.push(request);
      return { status: 401, body: null as T } as HttpResponse<T>;
    };
    let refreshCalls = 0;

    const client = new SessionHttpClient({
      send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh: async () => {
        refreshCalls += 1;
        return null;
      },
      onSessionExpired: () => {},
    });

    const response = await client.send$({
      method: 'POST',
      path: '/auth/login',
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('propaga respuestas de éxito sin tocar el refresh', async () => {
    const holder = new InMemoryAccessTokenHolder('tok');
    const store = new InMemorySecureTokenStore();
    const send: SendFn = async <T,>() =>
      ({ status: 200, body: { ok: true } as T } as HttpResponse<T>);
    let refreshCalls = 0;

    const client = new SessionHttpClient({
      send,
      tokenStore: store,
      accessTokenHolder: holder,
      refresh: async () => {
        refreshCalls += 1;
        return null;
      },
      onSessionExpired: () => {},
    });

    const response = await client.send$(authedGet);
    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(0);
  });
});

describe('makeAuthRefreshFn — intercambio contra POST /auth/refresh', () => {
  it('devuelve el par de tokens ante 200', async () => {
    const send: SendFn = async <T,>(request: HttpRequest) => {
      expect(request.path).toBe('/auth/refresh');
      expect(request.authenticated).toBe(false);
      return {
        status: 200,
        body: { accessToken: 'a2', refreshToken: 'r2' } as T,
      } as HttpResponse<T>;
    };
    const refresh = makeAuthRefreshFn(send);
    const tokens = await refresh('r1');
    expect(tokens).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('devuelve null ante 401 del endpoint de refresh', async () => {
    const send: SendFn = async <T,>() =>
      ({ status: 401, body: null as T } as HttpResponse<T>);
    const refresh = makeAuthRefreshFn(send);
    expect(await refresh('r1')).toBeNull();
  });

  it('lanza ante un fallo transitorio (5xx) para no cerrar sesión', async () => {
    const send: SendFn = async <T,>() =>
      ({ status: 503, body: null as T } as HttpResponse<T>);
    const refresh = makeAuthRefreshFn(send);
    await expect(refresh('r1')).rejects.toThrow();
  });
});
