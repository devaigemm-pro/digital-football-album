// Mapeo de errores del backend y resiliencia de red del Módulo de red y sesión.
//
// Task 25.4 — Requirements: 27.2, 27.3, 27.4, 27.5
// (design.md · "Módulo de red y sesión (Req 22, 27, 28)":
//   - "Mapea los códigos de error del backend a manejo visible: 401 → refresh
//     transparente o logout; 409 de conflicto de Club → mensaje explicativo;
//     gating/plan insuficiente → mensaje 'requiere Plan_Premium'."
//   - "Aplica timeouts y reintentos acotados solo para GET idempotentes, con
//     backoff, sin bloquear la UI.")
//
// Responsabilidades de ESTE archivo (solo Task 25.4):
//   - Clasificar una `HttpResponse` (o un error de transporte lanzado por fetch)
//     en errores de cliente tipados: 409 (conflicto de cambio de Club, Req 27.2),
//     gating/plan ("requiere Plan_Premium", Req 27.3), error de API genérico y
//     fallo de red/timeout (Req 27.4).
//   - Ofrecer un reintento acotado con backoff SOLO para GET idempotentes
//     (Req 27.4/27.5), con `sleep` y `now` inyectables para no esperar en pruebas
//     y sin bloquear la UI (el pipeline es asíncrono; la UI decide si espera).
//
// El refresh single-flight (401 por expiración) NO se resuelve aquí: se delega
// al `SessionHttpClient` (Task 25.2, session-client.ts). Aquí solo se tipa el
// 401 no recuperable como `ApiError` para que capas superiores enruten a relogin.
//
// TypeScript puro y framework-agnóstico: depende solo de la librería estándar y
// de los tipos del cliente HTTP (Task 25.1). No importa `react-native`.

import type { HttpRequest, HttpResponse } from './http-client';

/**
 * Mensaje canónico de gating de plan que la UI debe mostrar cuando una función
 * requiere Plan_Premium (Req 27.3, "mostrar el mensaje que indica que la función
 * requiere Plan_Premium"). Alineado con Req 3.6/12.4 ("requiere Plan_Premium").
 */
export const PREMIUM_REQUIRED_MESSAGE = 'requiere Plan_Premium';

/**
 * Raíz de la jerarquía de errores del cliente de red. Permite a las capas
 * superiores distinguir un error de red/negocio ya clasificado de un error
 * inesperado del entorno.
 */
export abstract class ClientNetworkError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = 'ClientNetworkError';
  }
}

/**
 * Error genérico de API: el backend respondió con un estado de error que no
 * corresponde a un caso específico (409 / gating / 401-refresh). Conserva el
 * estado y el mensaje devuelto para trazabilidad y presentación.
 */
export class ApiError extends ClientNetworkError {
  /** Código de estado HTTP crudo devuelto por el backend. */
  readonly status: number;
  /** Cuerpo de la respuesta (JSON parseado) para diagnóstico opcional. */
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Conflicto (409) al intentar cambiar de Club con una Temporada activa (Req 27.2,
 * "conflicto de cambio de Club"). La UI DEBE mostrar el `message` devuelto por el
 * backend y mantener el estado anterior.
 */
export class ClubChangeConflictError extends ClientNetworkError {
  readonly status = 409 as const;
  /** Cuerpo devuelto por el backend, por si aporta detalle adicional. */
  readonly body: unknown;

  constructor(message: string, body: unknown = null) {
    super(message);
    this.name = 'ClubChangeConflictError';
    this.body = body;
    Object.setPrototypeOf(this, ClubChangeConflictError.prototype);
  }
}

/**
 * Rechazo por gating de plan: la función solicitada requiere Plan_Premium
 * (Req 27.3). Se mapea desde un rechazo del backend (típicamente 403 con un
 * código/mensaje de gating). La UI muestra el mensaje SIN bloquear el resto de
 * las funciones.
 */
export class PremiumRequiredError extends ClientNetworkError {
  readonly status: number;
  readonly body: unknown;

  constructor(
    message: string = PREMIUM_REQUIRED_MESSAGE,
    status = 403,
    body: unknown = null,
  ) {
    super(message);
    this.name = 'PremiumRequiredError';
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, PremiumRequiredError.prototype);
  }
}

/**
 * Fallo de conexión (no hubo respuesta del backend): la petición no obtuvo
 * respuesta por un error de transporte (Req 27.4). Es reintentable para GET
 * idempotentes y NO debe cerrar la sesión del usuario.
 */
export class NetworkError extends ClientNetworkError {
  /** Error original de transporte, si lo hubo. */
  readonly cause?: unknown;

  constructor(message = 'Fallo de conexión de red.', cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * La petición no obtuvo respuesta dentro del tiempo de espera (Req 27.4).
 * Subtipo de fallo de red: reintentable para GET, sin cerrar sesión.
 */
export class TimeoutError extends NetworkError {
  /** Milisegundos de espera agotados. */
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`La petición superó el tiempo de espera de ${timeoutMs} ms.`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Extrae un mensaje legible del cuerpo de una respuesta de error. El backend
 * puede devolver `{ message }`, `{ error }` o texto plano; se cae con elegancia
 * a un valor por defecto.
 */
function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim() !== '') {
    return body;
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record['message'] ?? record['error'] ?? record['detail'];
    if (typeof message === 'string' && message.trim() !== '') {
      return message;
    }
  }
  return fallback;
}

/**
 * Heurística de detección de gating de plan en el cuerpo de la respuesta.
 * El backend puede señalar el gating con un código (`code: 'PLAN_REQUIRED'`,
 * `PREMIUM_REQUIRED`, ...) o con un mensaje que menciona Plan_Premium. Se acepta
 * también 402 (Payment Required) como señal explícita de plan insuficiente.
 */
function isPremiumGating(status: number, body: unknown): boolean {
  if (status === 402) {
    return true;
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const code = record['code'];
    if (
      typeof code === 'string' &&
      /premium|plan[_-]?required|entitlement/i.test(code)
    ) {
      return true;
    }
  }
  const text =
    typeof body === 'string'
      ? body
      : extractMessage(body, '');
  return /plan_premium|plan premium|premium/i.test(text);
}

/**
 * Clasifica una respuesta HTTP en un error de cliente tipado, o devuelve `null`
 * si la respuesta NO es un error (2xx) o es un 401 (cuya recuperación se delega
 * al refresh single-flight de Task 25.2; el llamador decide si el 401 llega aquí
 * ya como no recuperable).
 *
 * Mapeo (Req 27.2/27.3):
 *   - 409                    → {@link ClubChangeConflictError} (mensaje del backend)
 *   - gating de plan / 402   → {@link PremiumRequiredError} ("requiere Plan_Premium")
 *   - 403 sin gating explícito y otros 4xx/5xx → {@link ApiError}
 *
 * El 401 se trata como `ApiError` SOLO si `treat401AsApiError` es `true`; por
 * defecto se ignora (devuelve `null`) porque su manejo canónico es el refresh.
 */
export function classifyResponse(
  response: HttpResponse,
  options: { treat401AsApiError?: boolean } = {},
): ClientNetworkError | null {
  const { status, body } = response;

  if (status >= 200 && status < 300) {
    return null;
  }

  if (status === 401) {
    return options.treat401AsApiError
      ? new ApiError(401, extractMessage(body, 'No autorizado.'), body)
      : null;
  }

  if (status === 409) {
    return new ClubChangeConflictError(
      extractMessage(body, 'Conflicto de cambio de Club.'),
      body,
    );
  }

  if (isPremiumGating(status, body)) {
    return new PremiumRequiredError(
      extractMessage(body, PREMIUM_REQUIRED_MESSAGE),
      status,
      body,
    );
  }

  return new ApiError(status, extractMessage(body, `Error HTTP ${status}.`), body);
}

/**
 * Normaliza un error lanzado por el transporte (fetch) a un {@link NetworkError}.
 * Un `TimeoutError` ya tipado se preserva. Otros errores de conexión se envuelven.
 */
export function classifyTransportError(error: unknown): NetworkError {
  if (error instanceof TimeoutError || error instanceof NetworkError) {
    return error;
  }
  const message =
    error instanceof Error ? error.message : 'Fallo de conexión de red.';
  return new NetworkError(message, error);
}

/**
 * Función de espera inyectable (para no esperar de verdad en pruebas).
 */
export type Sleep = (ms: number) => Promise<void>;

/**
 * Reloj monótono inyectable (para timeouts deterministas en pruebas).
 */
export type Now = () => number;

/**
 * Política de reintentos acotados con backoff, SOLO para GET idempotentes
 * (Req 27.4/27.5). Todo es inyectable para que las pruebas no esperen tiempo real.
 */
export interface RetryPolicy {
  /** Número máximo de intentos (incluye el primero). Por defecto 3. */
  readonly maxAttempts?: number;
  /** Retardo base del backoff en ms. Por defecto 200. */
  readonly baseDelayMs?: number;
  /** Retardo máximo del backoff en ms. Por defecto 2000. */
  readonly maxDelayMs?: number;
  /** Espera inyectable; por defecto usa `setTimeout`. */
  readonly sleep?: Sleep;
}

/** Espera por defecto basada en `setTimeout` (única dependencia temporal real). */
const defaultSleep: Sleep = (ms) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Calcula el retardo de backoff exponencial acotado para el intento `attempt`
 * (1-based). Exportado para poder verificarlo en pruebas.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exp = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exp, maxDelayMs);
}

/**
 * Indica si una petición es idempotente y, por tanto, elegible para reintento
 * automático (Req 27.5): solo GET. Un POST/PUT/PATCH/DELETE NO se reintenta
 * automáticamente para no duplicar efectos.
 */
export function isRetriableMethod(request: Pick<HttpRequest, 'method'>): boolean {
  return request.method === 'GET';
}

/**
 * Ejecuta `operation` aplicando reintentos acotados con backoff SOLO cuando la
 * petición es un GET idempotente y el fallo es de red/timeout (Req 27.4/27.5).
 *
 * - Si `request` NO es un GET, se ejecuta UNA sola vez: cualquier fallo se
 *   propaga sin reintentar (evita duplicar efectos de mutaciones).
 * - Si es un GET, se reintenta hasta `maxAttempts` mientras el error sea de red
 *   ({@link NetworkError} / {@link TimeoutError}); los errores de API (4xx/5xx ya
 *   clasificados) NO se reintentan (no son transitorios) y se propagan.
 * - No bloquea la UI: la espera entre intentos usa el `sleep` inyectable y el
 *   pipeline es asíncrono, por lo que la UI puede seguir operable (Req 27.5).
 */
export async function withRetry<T>(
  request: Pick<HttpRequest, 'method'>,
  operation: () => Promise<T>,
  policy: RetryPolicy = {},
): Promise<T> {
  const maxAttempts = Math.max(1, policy.maxAttempts ?? 3);
  const baseDelayMs = policy.baseDelayMs ?? 200;
  const maxDelayMs = policy.maxDelayMs ?? 2000;
  const sleep = policy.sleep ?? defaultSleep;

  // Las mutaciones (no-GET) no se reintentan automáticamente (Req 27.5).
  const attempts = isRetriableMethod(request) ? maxAttempts : 1;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      // Solo los fallos de red/timeout son transitorios y reintentables.
      const isTransient = error instanceof NetworkError;
      if (!isTransient || attempt >= attempts) {
        throw error;
      }
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  // Inalcanzable en la práctica (el bucle relanza o retorna), pero satisface el
  // control de flujo tipado.
  throw lastError;
}

/**
 * Envuelve una promesa de petición con un timeout inyectable (Req 27.4). Si la
 * operación no resuelve antes de `timeoutMs`, se rechaza con {@link TimeoutError}.
 *
 * El temporizador se implementa como una carrera contra `sleep`, inyectable, de
 * modo que las pruebas no dependan del reloj real. En producción, `sleep` por
 * defecto usa `setTimeout` (que no bloquea la UI: la promesa se resuelve fuera
 * del hilo de render).
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  sleep: Sleep = defaultSleep,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation();
  }
  const timeout = sleep(timeoutMs).then(() => {
    throw new TimeoutError(timeoutMs);
  });
  return Promise.race([operation(), timeout]);
}
