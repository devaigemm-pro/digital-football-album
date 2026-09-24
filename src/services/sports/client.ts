// Cliente resiliente de la API deportiva (Servicio_Datos_Deportivos).
//
// Envuelve un `SportsApiTransport` inyectable con:
//   - un timeout por petición (por defecto 30 s — Req 9.1), y
//   - una política de reintentos acotada (≤3 intentos, backoff creciente — Req 9.6).
//
// El diseño es asíncrono y no bloqueante: la resolución/rechazo ocurre en
// background (jobs de sincronización), de modo que el usuario puede seguir
// registrando su Momento sin esperar a la API (Req 9.6). El transporte se
// inyecta para que las pruebas unitarias nunca alcancen la red, y el timeout,
// el número de reintentos, el calendario de backoff, el `sleep` y el reloj son
// inyectables para permitir temporizadores falsos y valores pequeños en tests.
//
// Task 8.1 — Requirements: 9.1, 9.6

import { SportsApiError, SportsApiRetriesExhaustedError, SportsApiTimeoutError } from './errors.js';
import type { RawFichaPartido, RawFixture, SportsApiClient, SportsApiTransport } from './types.js';

/** Timeout por defecto por petición: 30 segundos (Req 9.1). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Número máximo de intentos por defecto: ≤3 (Req 9.6). */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Calendario de backoff creciente por defecto, en milisegundos (Req 9.6).
 * `backoffScheduleMs[i]` es la espera **antes** del intento `i+2` (es decir, la
 * espera tras fallar el intento `i+1`). Debe ser no decreciente.
 */
export const DEFAULT_BACKOFF_SCHEDULE_MS: readonly number[] = [1_000, 5_000];

/** Espera cancelable usada entre reintentos; inyectable para usar fake timers. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/**
 * Opciones de configuración del cliente resiliente. Todas son inyectables para
 * pruebas (timeouts cortos, backoff cero, temporizadores falsos, transporte
 * simulado).
 */
export interface ResilientSportsApiClientOptions {
  /** Transporte HTTP de bajo nivel (in-memory en pruebas). Requerido. */
  readonly transport: SportsApiTransport;
  /** Timeout por petición en ms. Por defecto 30 000 (Req 9.1). */
  readonly timeoutMs?: number;
  /** Número máximo de intentos (incluye el primero). Por defecto 3 (Req 9.6). */
  readonly maxAttempts?: number;
  /** Calendario de backoff creciente en ms entre reintentos (Req 9.6). */
  readonly backoffScheduleMs?: readonly number[];
  /** Espera cancelable entre reintentos. Por defecto usa `setTimeout`. */
  readonly sleep?: Sleep;
  /**
   * Registrador de errores. Cada fallo se registra antes de reintentar
   * (Req 9.6, "registrar el error"). Por defecto no hace nada.
   */
  readonly logger?: (message: string, error: unknown) => void;
}

/** `sleep` por defecto basado en `setTimeout`, cancelable vía `AbortSignal`. */
const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SportsApiError('Espera de backoff abortada'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new SportsApiError('Espera de backoff abortada'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Cliente concreto de la API deportiva con timeout y reintentos.
 *
 * No bloquea al usuario: expone métodos `async` que se ejecutan en background
 * (jobs / colas); mientras se resuelven, el usuario puede continuar (Req 9.6).
 */
export class ResilientSportsApiClient implements SportsApiClient {
  private readonly transport: SportsApiTransport;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffScheduleMs: readonly number[];
  private readonly sleep: Sleep;
  private readonly logger: (message: string, error: unknown) => void;

  constructor(options: ResilientSportsApiClientOptions) {
    const {
      transport,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxAttempts = DEFAULT_MAX_ATTEMPTS,
      backoffScheduleMs = DEFAULT_BACKOFF_SCHEDULE_MS,
      sleep = defaultSleep,
      logger = (): void => undefined,
    } = options;

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new SportsApiError(`timeoutMs debe ser un número positivo, recibido: ${timeoutMs}`);
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new SportsApiError(`maxAttempts debe ser un entero ≥ 1, recibido: ${maxAttempts}`);
    }
    if (backoffScheduleMs.some((ms) => !Number.isFinite(ms) || ms < 0)) {
      throw new SportsApiError('backoffScheduleMs debe contener solo números ≥ 0');
    }

    this.transport = transport;
    this.timeoutMs = timeoutMs;
    this.maxAttempts = maxAttempts;
    this.backoffScheduleMs = backoffScheduleMs;
    this.sleep = sleep;
    this.logger = logger;
  }

  fetchFixtures(temporadaExterna: string, signal?: AbortSignal): Promise<readonly RawFixture[]> {
    const path = `/temporadas/${encodeURIComponent(temporadaExterna)}/fixtures`;
    return this.executeWithResilience<readonly RawFixture[]>(path, signal);
  }

  fetchFichaPartido(partidoExternoId: string, signal?: AbortSignal): Promise<RawFichaPartido> {
    const path = `/partidos/${encodeURIComponent(partidoExternoId)}/ficha`;
    return this.executeWithResilience<RawFichaPartido>(path, signal);
  }

  /**
   * Ejecuta una petición con timeout por intento y reintentos acotados con
   * backoff creciente. Cada intento se envuelve en su propio `AbortSignal` para
   * cancelar el transporte al vencer el timeout. Registra cada fallo antes de
   * reintentar y, agotados los intentos, rechaza con
   * `SportsApiRetriesExhaustedError` (Req 9.6).
   */
  private async executeWithResilience<T>(path: string, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      // Aborta si el llamador canceló la operación completa (no bloquea: sale limpio).
      if (signal?.aborted) {
        throw new SportsApiError('Operación abortada por el llamador', { cause: signal.reason });
      }

      try {
        return await this.withTimeout<T>(path, signal);
      } catch (error) {
        lastError = error;
        this.logger(`Fallo al llamar a ${path} (intento ${attempt}/${this.maxAttempts})`, error);

        const isLastAttempt = attempt === this.maxAttempts;
        if (isLastAttempt) {
          break;
        }

        const backoffMs = this.backoffFor(attempt);
        await this.sleep(backoffMs, signal);
      }
    }

    throw new SportsApiRetriesExhaustedError(this.maxAttempts, lastError);
  }

  /**
   * Envuelve una única petición del transporte con el timeout configurado.
   * Al vencer el timeout aborta el transporte y rechaza con
   * `SportsApiTimeoutError` (Req 9.1). Encadena la cancelación del llamador.
   */
  private async withTimeout<T>(path: string, outerSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;

    const onOuterAbort = (): void => controller.abort(outerSignal?.reason);
    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort(outerSignal.reason);
      } else {
        outerSignal.addEventListener('abort', onOuterAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      return await this.transport.get<T>(path, controller.signal);
    } catch (error) {
      if (timedOut) {
        throw new SportsApiTimeoutError(this.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (outerSignal) {
        outerSignal.removeEventListener('abort', onOuterAbort);
      }
    }
  }

  /**
   * Devuelve la espera de backoff (ms) antes del reintento que sigue al
   * `attempt` dado. Si el intento excede el calendario, reutiliza el último
   * valor (mantiene el backoff creciente/estable — Req 9.6).
   */
  private backoffFor(attempt: number): number {
    if (this.backoffScheduleMs.length === 0) {
      return 0;
    }
    const index = Math.min(attempt - 1, this.backoffScheduleMs.length - 1);
    return this.backoffScheduleMs[index] ?? 0;
  }
}
