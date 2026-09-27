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
 * Código de dominio (campo `error` del backend) que señala gating por
 * Plan_Premium en un error de negocio HTTP 400 (docs/FRONTEND_INTEGRATION.md ·
 * `POST /cards/:momentoId` → 400 `REQUIERE_PLAN_PREMIUM`).
 */
export const PREMIUM_REQUIRED_CODE = 'REQUIERE_PLAN_PREMIUM';

/**
 * Códigos de dominio (campo `error` del backend) que representan un conflicto de
 * cambio de Club con Temporada ACTIVA. El backend deployado lo reporta como un
 * error de negocio HTTP 400 (no 409); se listan varias grafías tolerantes para
 * cubrir la variante exacta que emita el backend.
 */
const CLUB_CHANGE_CONFLICT_CODES: readonly string[] = [
  'CAMBIO_CLUB_BLOQUEADO',
  'CLUB_CHANGE_CONFLICT',
  'TEMPORADA_ACTIVA',
  'CAMBIO_CLUB_TEMPORADA_ACTIVA',
];

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
 * Funcionalidad todavía NO disponible en el backend deployado
 * (docs/FRONTEND_INTEGRATION.md · §7 "Lo que aún NO está disponible"): IAP/
 * suscripción, envío/pedido/tracking, push, cierre anticipado y edición de
 * contexto/notas/votación del Momento (más allá de subir la foto y generar la
 * Card). Los adaptadores de esos endpoints lanzan este error en lugar de
 * llamar a rutas inexistentes; la UI de esas pantallas se oculta/deshabilita.
 *
 * NO es un error de red ni de API: es un contrato marcado explícitamente como
 * no-producción (preferencia del usuario: los stubs sin implementación real se
 * marcan como no-producción, nunca fingen éxito).
 */
export class NotAvailableError extends ClientNetworkError {
  /** Identificador de la operación no disponible (para diagnóstico/logs). */
  readonly feature: string;

  constructor(feature: string) {
    super(
      `La función "${feature}" aún no está disponible en el backend ` +
        '(ver docs/FRONTEND_INTEGRATION.md §7). No se realizó ninguna llamada.',
    );
    this.name = 'NotAvailableError';
    this.feature = feature;
    Object.setPrototypeOf(this, NotAvailableError.prototype);
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
 * Extrae el código de dominio del cuerpo de un error del backend. El formato
 * uniforme del backend deployado es `{ error: "CODIGO", message: "..." }`
 * (docs/FRONTEND_INTEGRATION.md · §3); también se tolera `{ code: "..." }`.
 * Devuelve `null` si no hay un código legible.
 */
function extractErrorCode(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const raw = record['error'] ?? record['code'];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }
  return null;
}

/**
 * Heurística de detección de gating de plan en el cuerpo de la respuesta.
 *
 * El backend deployado reporta el gating como error de NEGOCIO HTTP 400 con
 * `error: "REQUIERE_PLAN_PREMIUM"` (docs/FRONTEND_INTEGRATION.md ·
 * `POST /cards/:momentoId`). Se conserva además la tolerancia previa: 402
 * (Payment Required), códigos `code`/`error` que mencionen premium/plan y
 * mensajes que citen Plan_Premium.
 */
function isPremiumGating(status: number, body: unknown): boolean {
  if (status === 402) {
    return true;
  }
  const domainCode = extractErrorCode(body);
  if (domainCode !== null) {
    if (
      domainCode === PREMIUM_REQUIRED_CODE ||
      /premium|plan[_-]?required|entitlement/i.test(domainCode)
    ) {
      return true;
    }
  }
  const text = typeof body === 'string' ? body : extractMessage(body, '');
  return /plan_premium|plan premium|premium/i.test(text);
}

/**
 * ¿El cuerpo del error señala un conflicto de cambio de Club (Temporada ACTIVA)?
 * En el backend deployado llega como error de negocio HTTP 400 con un `error`
 * de dominio (docs/FRONTEND_INTEGRATION.md · `PUT /me/club`), no como 409.
 */
function isClubChangeConflict(body: unknown): boolean {
  const domainCode = extractErrorCode(body);
  if (domainCode === null) {
    return false;
  }
  if (CLUB_CHANGE_CONFLICT_CODES.includes(domainCode)) {
    return true;
  }
  // Tolerancia semántica: código que mencione club + (temporada activa/cambio).
  return /club/i.test(domainCode) && /(activa|conflict|bloq|cambio)/i.test(domainCode);
}

/**
 * Clasifica una respuesta HTTP en un error de cliente tipado, o devuelve `null`
 * si la respuesta NO es un error (2xx) o es un 401 (cuya recuperación se delega
 * al refresh single-flight de Task 25.2; el llamador decide si el 401 llega aquí
 * ya como no recuperable).
 *
 * Mapeo (Req 27.2/27.3, alineado con docs/FRONTEND_INTEGRATION.md §3):
 *   - 401                                  → refresh (null) o {@link ApiError}
 *   - gating de plan (400 `REQUIERE_PLAN_PREMIUM`, 402, …) → {@link PremiumRequiredError}
 *   - conflicto de cambio de Club (400 con código de dominio, o 409 legado)
 *                                          → {@link ClubChangeConflictError}
 *   - resto de 4xx/5xx (incl. otros errores de negocio 400) → {@link ApiError}
 *     conservando el `error` de dominio en `message`.
 *
 * NOTA (backend deployado): los errores de NEGOCIO llegan como HTTP 400 con
 * `{ error: "codigo", message: "..." }`. Por eso el gating y el conflicto de
 * Club se detectan por el CÓDIGO de dominio del cuerpo, no por el estado 409.
 * Se mantiene el mapeo de 409 por compatibilidad hacia atrás.
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

  // Gating por plan: el backend deployado lo emite como 400
  // `REQUIERE_PLAN_PREMIUM`; también se cubren 402 y mensajes/códigos previos.
  if (isPremiumGating(status, body)) {
    return new PremiumRequiredError(
      extractMessage(body, PREMIUM_REQUIRED_MESSAGE),
      status,
      body,
    );
  }

  // Conflicto de cambio de Club: 400 con código de dominio (deployado) o 409
  // (compatibilidad con el contrato anterior).
  if (status === 409 || isClubChangeConflict(body)) {
    return new ClubChangeConflictError(
      extractMessage(body, 'Conflicto de cambio de Club.'),
      body,
    );
  }

  // Resto de errores (incluidos otros errores de negocio 400): ApiError
  // genérico que conserva el `error`/`message` de dominio para la UI.
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
