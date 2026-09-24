// Errores del cliente de la API deportiva (Servicio_Datos_Deportivos).
//
// Errores tipados para que los llamadores (p. ej. `syncFixture` en la Task 8.2)
// distingan un timeout de un error de transporte y decidan cómo continuar sin
// bloquear al usuario (Req 9.6).
//
// Task 8.1 — Requirements: 9.1, 9.6

/** Error base del cliente de la API deportiva. */
export class SportsApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SportsApiError';
    if (options && 'cause' in options) {
      // Preserva la causa original para diagnóstico sin perder el stack.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Se lanza cuando una petición individual excede el timeout configurado
 * (por defecto 30 s — Req 9.1). Es un fallo reintentable.
 */
export class SportsApiTimeoutError extends SportsApiError {
  constructor(public readonly timeoutMs: number) {
    super(`La API deportiva no respondió dentro de ${timeoutMs} ms`);
    this.name = 'SportsApiTimeoutError';
  }
}

/**
 * Se lanza cuando se agotan todos los intentos de reintento sin éxito
 * (≤3 intentos, backoff creciente — Req 9.6). Conserva el último error como
 * causa para diagnóstico.
 */
export class SportsApiRetriesExhaustedError extends SportsApiError {
  constructor(
    public readonly intentos: number,
    lastError: unknown,
  ) {
    super(`La sincronización falló tras ${intentos} intento(s)`, { cause: lastError });
    this.name = 'SportsApiRetriesExhaustedError';
  }
}
