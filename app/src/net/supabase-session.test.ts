// Pruebas del decorador de sesión respaldado por Supabase (refresh externo).
//
// Verifican el flujo 401 → refresh vía Supabase → reintento único → cierre de
// sesión si sigue 401 (docs/FRONTEND_INTEGRATION.md §2/§3). Todo con dobles en
// memoria: sin red, sin supabase-js, sin `react-native`.
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts).

import type { HttpRequest, HttpResponse } from './http-client';
import {
  InMemoryAccessTokenHolder,
  SessionExpiredError,
  type SendFn,
} from './session-client';
import { SupabaseSessionHttpClient } from './supabase-session';

/** Petición autenticada mínima. */
const AUTHED: HttpRequest = {
  method: 'GET',
  path: '/album/t1/preview',
  authenticated: true,
};

/**
 * Construye una `SendFn` (genérica) que responde con los estados de la secuencia
 * dada (el último se repite si se agotan) y cuenta las llamadas.
 */
function makeSend(statuses: number[]): { send: SendFn; getCalls: () => number } {
  let i = 0;
  const send: SendFn = async <T,>(): Promise<HttpResponse<T>> => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    return { status, body: null as T } as HttpResponse<T>;
  };
  return { send, getCalls: () => i };
}

describe('SupabaseSessionHttpClient', () => {
  it('adjunta y devuelve la respuesta directamente si no hay 401', async () => {
    const holder = new InMemoryAccessTokenHolder('tok');
    const { send, getCalls } = makeSend([200]);
    const client = new SupabaseSessionHttpClient({
      send,
      accessTokenHolder: holder,
      refresh: async () => 'nuevo',
      onSessionExpired: () => {},
    });
    const r = await client.send$(AUTHED);
    expect(r.status).toBe(200);
    expect(getCalls()).toBe(1);
  });

  it('ante 401 refresca vía Supabase, actualiza el holder y reintenta con éxito', async () => {
    const holder = new InMemoryAccessTokenHolder('viejo');
    const { send, getCalls } = makeSend([401, 200]);
    const client = new SupabaseSessionHttpClient({
      send,
      accessTokenHolder: holder,
      refresh: async () => 'fresco',
      onSessionExpired: () => {},
    });
    const r = await client.send$(AUTHED);
    expect(r.status).toBe(200);
    expect(getCalls()).toBe(2);
    expect(holder.get()).toBe('fresco');
  });

  it('si el refresh no devuelve token, cierra sesión y lanza SessionExpiredError', async () => {
    const holder = new InMemoryAccessTokenHolder('viejo');
    let expired = 0;
    const { send } = makeSend([401]);
    const client = new SupabaseSessionHttpClient({
      send,
      accessTokenHolder: holder,
      refresh: async () => null,
      onSessionExpired: () => {
        expired += 1;
      },
    });
    await expect(client.send$(AUTHED)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(expired).toBe(1);
    expect(holder.get()).toBeNull();
  });

  it('si el reintento vuelve a dar 401, cierra sesión', async () => {
    const holder = new InMemoryAccessTokenHolder('viejo');
    let expired = 0;
    const { send } = makeSend([401]);
    const client = new SupabaseSessionHttpClient({
      send,
      accessTokenHolder: holder,
      refresh: async () => 'fresco',
      onSessionExpired: () => {
        expired += 1;
      },
    });
    await expect(client.send$(AUTHED)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(expired).toBe(1);
  });

  it('no refresca ante 401 en peticiones públicas (authenticated:false)', async () => {
    const holder = new InMemoryAccessTokenHolder('tok');
    let refreshed = 0;
    const { send } = makeSend([401]);
    const client = new SupabaseSessionHttpClient({
      send,
      accessTokenHolder: holder,
      refresh: async () => {
        refreshed += 1;
        return 'fresco';
      },
      onSessionExpired: () => {},
    });
    const r = await client.send$({ ...AUTHED, authenticated: false });
    expect(r.status).toBe(401);
    expect(refreshed).toBe(0);
  });
});
