// Pruebas unitarias del cliente resiliente de la API deportiva (Task 8.1).
//
// Cubren: éxito directo, timeout por petición (30 s por defecto), reintentos
// acotados con backoff creciente, éxito en un reintento intermedio, agotamiento
// de reintentos, no bloqueo (async), cancelación por el llamador y validación de
// opciones. El transporte se inyecta como doble en memoria: nunca se toca la red.
//
// Requirements: 9.1, 9.6

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MAX_ATTEMPTS, DEFAULT_TIMEOUT_MS, ResilientSportsApiClient } from './client.js';
import { SportsApiError, SportsApiRetriesExhaustedError, SportsApiTimeoutError } from './errors.js';
import type { RawFixture, SportsApiTransport } from './types.js';

/** Transporte de prueba controlado por una cola de comportamientos por llamada. */
type Behavior<T> =
  { kind: 'resolve'; value: T } | { kind: 'reject'; error: unknown } | { kind: 'hang' }; // nunca resuelve por sí solo: fuerza el camino de timeout

function makeTransport(behaviors: Array<Behavior<unknown>>): {
  transport: SportsApiTransport;
  calls: () => number;
} {
  let index = 0;
  const transport: SportsApiTransport = {
    get: <T>(_path: string, signal: AbortSignal): Promise<T> => {
      const behavior: Behavior<unknown> = behaviors[index++] ?? {
        kind: 'reject',
        error: new Error('sin comportamiento'),
      };
      return new Promise<T>((resolve, reject) => {
        if (behavior.kind === 'resolve') {
          resolve(behavior.value as T);
          return;
        }
        if (behavior.kind === 'reject') {
          reject(
            behavior.error instanceof Error ? behavior.error : new Error(String(behavior.error)),
          );
          return;
        }
        // 'hang': solo se resuelve/rechaza si lo aborta el cliente (timeout/cancel).
        signal.addEventListener('abort', () => reject(new Error('abortado por el cliente')), {
          once: true,
        });
      });
    },
  };
  return { transport, calls: () => index };
}

const FIXTURES: readonly RawFixture[] = [
  {
    partidoExternoId: 'p1',
    competicion: 'Liga',
    rival: 'Rival',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'PROGRAMADO',
  },
];

describe('ResilientSportsApiClient', () => {
  it('devuelve el resultado del transporte al primer intento exitoso', async () => {
    const { transport, calls } = makeTransport([{ kind: 'resolve', value: FIXTURES }]);
    const client = new ResilientSportsApiClient({ transport });

    await expect(client.fetchFixtures('2024-2025')).resolves.toEqual(FIXTURES);
    expect(calls()).toBe(1);
  });

  it('reintenta ante fallo y tiene éxito en un intento posterior (backoff creciente)', async () => {
    vi.useFakeTimers();
    const { transport, calls } = makeTransport([
      { kind: 'reject', error: new Error('boom-1') },
      { kind: 'reject', error: new Error('boom-2') },
      { kind: 'resolve', value: FIXTURES },
    ]);
    const client = new ResilientSportsApiClient({
      transport,
      backoffScheduleMs: [10, 20],
    });

    const promise = client.fetchFixtures('2024-2025');
    // Avanza el backoff entre reintentos.
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(promise).resolves.toEqual(FIXTURES);
    expect(calls()).toBe(3);
  });

  it('agota los reintentos acotados (≤3) y rechaza con SportsApiRetriesExhaustedError', async () => {
    vi.useFakeTimers();
    const { transport, calls } = makeTransport([
      { kind: 'reject', error: new Error('boom-1') },
      { kind: 'reject', error: new Error('boom-2') },
      { kind: 'reject', error: new Error('boom-3') },
    ]);
    const client = new ResilientSportsApiClient({ transport, backoffScheduleMs: [5, 5] });

    const promise = client.fetchFixtures('2024-2025');
    const assertion = expect(promise).rejects.toBeInstanceOf(SportsApiRetriesExhaustedError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls()).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('aplica timeout por petición y lo trata como fallo reintentable', async () => {
    vi.useFakeTimers();
    // Primer intento cuelga -> timeout; segundo intento resuelve.
    const { transport } = makeTransport([{ kind: 'hang' }, { kind: 'resolve', value: FIXTURES }]);
    const client = new ResilientSportsApiClient({
      transport,
      timeoutMs: 30_000,
      backoffScheduleMs: [0],
    });

    const promise = client.fetchFixtures('2024-2025');
    // Vence el timeout de 30 s del primer intento.
    await vi.advanceTimersByTimeAsync(30_000);
    // Corre el backoff (0 ms) hacia el segundo intento.
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(FIXTURES);
  });

  it('agota reintentos por timeout y conserva el timeout como causa', async () => {
    vi.useFakeTimers();
    const { transport } = makeTransport([{ kind: 'hang' }]);
    const client = new ResilientSportsApiClient({
      transport,
      maxAttempts: 1,
      timeoutMs: 1_000,
    });

    const promise = client.fetchFixtures('2024-2025').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await promise;

    expect(error).toBeInstanceOf(SportsApiRetriesExhaustedError);
    expect((error as SportsApiRetriesExhaustedError).cause).toBeInstanceOf(SportsApiTimeoutError);
  });

  it('no bloquea: devuelve una promesa de inmediato mientras el transporte cuelga', async () => {
    vi.useFakeTimers();
    const { transport } = makeTransport([{ kind: 'hang' }]);
    const client = new ResilientSportsApiClient({ transport, maxAttempts: 1 });

    let settled = false;
    const promise = client
      .fetchFixtures('2024-2025')
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });

    // Sin avanzar el reloj, la operación sigue pendiente (no bloqueó el hilo).
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await promise;
    expect(settled).toBe(true);
  });

  it('sale limpio si el llamador aborta antes de empezar', async () => {
    const { transport, calls } = makeTransport([{ kind: 'resolve', value: FIXTURES }]);
    const client = new ResilientSportsApiClient({ transport });
    const controller = new AbortController();
    controller.abort();

    await expect(client.fetchFixtures('2024-2025', controller.signal)).rejects.toBeInstanceOf(
      SportsApiError,
    );
    expect(calls()).toBe(0);
  });

  it('construye la ruta de ficha de partido y devuelve la ficha', async () => {
    const ficha = {
      partidoExternoId: 'p1',
      resultado: { golesLocal: 2, golesVisita: 1 },
      alineacion: [{ id: 'j1', nombre: 'Jugador' }],
      eventos: [{ minuto: 12, tipo: 'GOL' }],
    };
    const { transport } = makeTransport([{ kind: 'resolve', value: ficha }]);
    const client = new ResilientSportsApiClient({ transport });

    await expect(client.fetchFichaPartido('p1')).resolves.toEqual(ficha);
  });

  describe('validación de opciones', () => {
    const { transport } = makeTransport([]);

    it('rechaza timeoutMs no positivo', () => {
      expect(() => new ResilientSportsApiClient({ transport, timeoutMs: 0 })).toThrow(
        SportsApiError,
      );
    });

    it('rechaza maxAttempts < 1', () => {
      expect(() => new ResilientSportsApiClient({ transport, maxAttempts: 0 })).toThrow(
        SportsApiError,
      );
    });

    it('rechaza backoff con valores negativos', () => {
      expect(() => new ResilientSportsApiClient({ transport, backoffScheduleMs: [-1] })).toThrow(
        SportsApiError,
      );
    });
  });

  beforeEach(() => {
    // asegura estado limpio por si un test previo dejó fake timers.
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
