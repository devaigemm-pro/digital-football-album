// Pruebas del mapeo de errores del backend y la resiliencia de red (Task 25.4)
// — Requirements: 27.2, 27.3, 27.4, 27.5
//
// TypeScript puro con `sleep` inyectable: NO esperan tiempo real ni requieren
// dependencias nativas. Cubren:
//   - 409 → ClubChangeConflictError con el mensaje del backend (Req 27.2).
//   - gating de plan → PremiumRequiredError con "requiere Plan_Premium" (Req 27.3).
//   - error genérico → ApiError; 2xx → null.
//   - reintento acotado con backoff en GET ante timeout, y NO reintento en POST
//     (Req 27.4, 27.5).
//   - timeout inyectable → TimeoutError.
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import type { HttpRequest, HttpResponse } from './http-client';
import {
  ApiError,
  ClubChangeConflictError,
  NetworkError,
  PremiumRequiredError,
  PREMIUM_REQUIRED_MESSAGE,
  TimeoutError,
  backoffDelay,
  classifyResponse,
  classifyTransportError,
  isRetriableMethod,
  withRetry,
  withTimeout,
  type Sleep,
} from './errors';

/** Construye una respuesta HTTP normalizada mínima para las pruebas. */
function res(status: number, body: unknown = null): HttpResponse {
  return { status, body };
}

/** GET/POST mínimos para dirigir la política de reintentos. */
const getRequest: Pick<HttpRequest, 'method'> = { method: 'GET' };
const postRequest: Pick<HttpRequest, 'method'> = { method: 'POST' };

/** `sleep` fake que registra los retardos solicitados sin esperar. */
function makeFakeSleep(): { sleep: Sleep; delays: number[] } {
  const delays: number[] = [];
  const sleep: Sleep = async (ms) => {
    delays.push(ms);
  };
  return { sleep, delays };
}

describe('classifyResponse — mapeo de estados (Req 27.2, 27.3)', () => {
  it('devuelve null para respuestas 2xx', () => {
    expect(classifyResponse(res(200, { ok: true }))).toBeNull();
    expect(classifyResponse(res(204))).toBeNull();
  });

  it('mapea 409 a ClubChangeConflictError con el mensaje del backend', () => {
    const error = classifyResponse(
      res(409, { message: 'No puedes cambiar de Club con una Temporada activa.' }),
    );
    expect(error instanceof ClubChangeConflictError).toBe(true);
    expect((error as ClubChangeConflictError).message).toBe(
      'No puedes cambiar de Club con una Temporada activa.',
    );
    expect((error as ClubChangeConflictError).status).toBe(409);
  });

  it('mapea un rechazo por gating (403 con código premium) a PremiumRequiredError', () => {
    const error = classifyResponse(res(403, { code: 'PREMIUM_REQUIRED' }));
    expect(error instanceof PremiumRequiredError).toBe(true);
    expect((error as PremiumRequiredError).message).toBe(PREMIUM_REQUIRED_MESSAGE);
  });

  it('mapea un gating expresado en el mensaje a PremiumRequiredError', () => {
    const error = classifyResponse(
      res(403, { message: 'Esta función requiere Plan_Premium' }),
    );
    expect(error instanceof PremiumRequiredError).toBe(true);
    expect((error as PremiumRequiredError).message).toBe(
      'Esta función requiere Plan_Premium',
    );
  });

  it('mapea 402 Payment Required a PremiumRequiredError', () => {
    const error = classifyResponse(res(402, null));
    expect(error instanceof PremiumRequiredError).toBe(true);
  });

  it('mapea otros estados de error a ApiError genérico', () => {
    const error = classifyResponse(res(500, { message: 'Error interno' }));
    expect(error instanceof ApiError).toBe(true);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toBe('Error interno');
  });

  it('ignora 401 por defecto (se delega al refresh) pero lo tipa si se solicita', () => {
    expect(classifyResponse(res(401))).toBeNull();
    const error = classifyResponse(res(401, { message: 'No autorizado' }), {
      treat401AsApiError: true,
    });
    expect(error instanceof ApiError).toBe(true);
    expect((error as ApiError).status).toBe(401);
  });
});

describe('classifyTransportError — fallos de conexión (Req 27.4)', () => {
  it('envuelve un error genérico en NetworkError', () => {
    const error = classifyTransportError(new Error('conexión rechazada'));
    expect(error instanceof NetworkError).toBe(true);
    expect(error.message).toBe('conexión rechazada');
  });

  it('preserva un TimeoutError ya tipado', () => {
    const original = new TimeoutError(1000);
    expect(classifyTransportError(original)).toBe(original);
  });
});

describe('backoffDelay — backoff exponencial acotado', () => {
  it('crece exponencialmente y respeta el máximo', () => {
    expect(backoffDelay(1, 100, 2000)).toBe(100);
    expect(backoffDelay(2, 100, 2000)).toBe(200);
    expect(backoffDelay(3, 100, 2000)).toBe(400);
    expect(backoffDelay(10, 100, 2000)).toBe(2000);
  });
});

describe('isRetriableMethod — solo GET es idempotente (Req 27.5)', () => {
  it('acepta GET y rechaza mutaciones', () => {
    expect(isRetriableMethod({ method: 'GET' })).toBe(true);
    expect(isRetriableMethod({ method: 'POST' })).toBe(false);
    expect(isRetriableMethod({ method: 'DELETE' })).toBe(false);
  });
});

describe('withRetry — reintentos acotados (Req 27.4, 27.5)', () => {
  it('reintenta un GET ante fallos de red y termina con éxito', async () => {
    const { sleep, delays } = makeFakeSleep();
    let attempts = 0;
    const result = await withRetry(
      getRequest,
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new TimeoutError(1000);
        }
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000, sleep },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    // Dos esperas entre los tres intentos, con backoff creciente.
    expect(delays).toEqual([100, 200]);
  });

  it('agota los intentos de un GET y propaga el último NetworkError', async () => {
    const { sleep, delays } = makeFakeSleep();
    let attempts = 0;
    await expect(
      withRetry(
        getRequest,
        async () => {
          attempts += 1;
          throw new NetworkError('caída de red');
        },
        { maxAttempts: 3, baseDelayMs: 50, sleep },
      ),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it('NO reintenta un POST: se ejecuta una sola vez (Req 27.5)', async () => {
    const { sleep, delays } = makeFakeSleep();
    let attempts = 0;
    await expect(
      withRetry(
        postRequest,
        async () => {
          attempts += 1;
          throw new NetworkError('caída de red');
        },
        { maxAttempts: 3, sleep },
      ),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(1);
    expect(delays).toHaveLength(0);
  });

  it('NO reintenta errores no transitorios (ApiError) aunque sea GET', async () => {
    const { sleep } = makeFakeSleep();
    let attempts = 0;
    await expect(
      withRetry(
        getRequest,
        async () => {
          attempts += 1;
          throw new ApiError(500, 'boom');
        },
        { maxAttempts: 3, sleep },
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(attempts).toBe(1);
  });
});

describe('withTimeout — límite de espera inyectable (Req 27.4)', () => {
  it('resuelve la operación si termina antes del timeout', async () => {
    const value = await withTimeout(async () => 'listo', 1000, async () => {
      // Nunca dispara: la operación resuelve de inmediato.
    });
    expect(value).toBe('listo');
  });

  it('rechaza con TimeoutError si el timer inyectado gana la carrera', async () => {
    // La operación nunca resuelve; el `sleep` inyectado resuelve de inmediato,
    // por lo que el timeout gana de forma determinista.
    const immediateSleep: Sleep = async () => {};
    await expect(
      withTimeout(() => new Promise<string>(() => {}), 1000, immediateSleep),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('ejecuta sin timeout cuando el límite no es positivo', async () => {
    const value = await withTimeout(async () => 42, 0);
    expect(value).toBe(42);
  });
});
