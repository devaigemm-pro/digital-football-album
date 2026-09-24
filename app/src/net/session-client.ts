// Cliente HTTP consciente de sesión: refresh single-flight con rotación y
// reintento del Módulo de red y sesión.
//
// Task 25.2 — Requirements: 22.4, 22.5, 27.1
// (design.md · "Módulo de red y sesión (Req 22, 27, 28)":
//   - "Ante un 401 por expiración del Access_Token, ejecuta un refresh
//     single-flight vía POST /auth/refresh que rota el refresh token y reintenta
//     la petición original; las solicitudes concurrentes de refresh se deduplican
//     (una sola en vuelo, las demás esperan su resultado)."
//   - "Si el refresh devuelve 401 (refresh inválido/rotado/expirado), purga el
//     Almacenamiento_Seguro y enruta al login.")
//
// Responsabilidades de ESTE archivo (solo Task 25.2):
//   - Decorar el pipeline componible `HttpClient.send` (Task 25.1).
//   - Ante un 401 en una petición autenticada (Access_Token expirado, Req 22.4):
//       * ejecutar un ÚNICO `POST /auth/refresh` en vuelo (single-flight); las
//         peticiones concurrentes que también reciban 401 esperan la MISMA
//         promesa de refresh (deduplicación, Req 27.1).
//       * al éxito, ROTAR el par de tokens: guardar el nuevo Access_Token en el
//         holder de sesión en memoria y el nuevo Refresh_Token en el
//         `SecureTokenStore` (Task 25.3), y REINTENTAR la petición original UNA
//         vez con el nuevo Access_Token.
//   - Ante un 401 del propio refresh (Req 22.5): purgar el Almacenamiento_Seguro
//     (`SecureTokenStore.clear()`), invocar `onSessionExpired()` (enrutar al
//     login) y propagar un error tipado {@link SessionExpiredError}.
//
// El mapeo de 409/gating y la resiliencia de red (timeouts/reintentos de GET)
// viven en errors.ts (Task 25.4) y se componen por encima o por debajo de este
// decorador según convenga; este archivo se ocupa EXCLUSIVAMENTE del 401/refresh.
//
// Determinista y testeable: no requiere temporizadores reales; el single-flight
// se basa en una promesa compartida. `fetch`, el store, el holder de sesión y la
// función de refresh son inyectables. No importa `react-native`.

import type { HttpRequest, HttpResponse } from './http-client';
import type { SecureTokenStore } from '../storage/secure-token-store';
import { ClientNetworkError } from './errors';

/**
 * Punto único del pipeline de petición que este decorador envuelve. Coincide con
 * la firma de `HttpClient.send`, de modo que `SessionHttpClient` es sustituible
 * por un `HttpClient` allá donde solo se necesite `send`.
 */
export type SendFn = <T = unknown>(
  request: HttpRequest,
) => Promise<HttpResponse<T>>;

/**
 * Par de tokens devuelto por `POST /auth/refresh` (design.md · Endpoints:
 * `POST /auth/refresh {refreshToken}` → `{ accessToken, refreshToken }`).
 */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Holder en memoria del Access_Token vigente. El Access_Token (JWT de vida corta)
 * NO se persiste (solo el Refresh_Token pasa por el Almacenamiento_Seguro); por
 * eso vive en memoria y se inyecta como get/set para desacoplar la sesión.
 */
export interface AccessTokenHolder {
  get(): string | null;
  set(token: string | null): void;
}

/**
 * Implementación en memoria por defecto del {@link AccessTokenHolder}.
 */
export class InMemoryAccessTokenHolder implements AccessTokenHolder {
  private token: string | null;

  constructor(initial: string | null = null) {
    this.token = initial;
  }

  get(): string | null {
    return this.token;
  }

  set(token: string | null): void {
    this.token = token;
  }
}

/**
 * Ejecuta el intercambio de refresh: dado el Refresh_Token vigente, invoca
 * `POST /auth/refresh` y devuelve el nuevo par de tokens; si el backend responde
 * 401 (refresh inválido/rotado/expirado), lanza {@link RefreshUnauthorizedError}
 * o resuelve con `null` para que el cliente ejecute el flujo de logout.
 */
export type RefreshFn = (refreshToken: string) => Promise<TokenPair | null>;

/**
 * Error interno que señala que `POST /auth/refresh` respondió 401.
 * Se usa entre {@link makeAuthRefreshFn} y {@link SessionHttpClient} para
 * distinguir el 401 de refresh (→ logout) de un fallo de red.
 */
export class RefreshUnauthorizedError extends Error {
  constructor(message = 'El refresh token es inválido, fue rotado o expiró.') {
    super(message);
    this.name = 'RefreshUnauthorizedError';
    Object.setPrototypeOf(this, RefreshUnauthorizedError.prototype);
  }
}

/**
 * Error tipado que se propaga a las capas superiores cuando la sesión expiró de
 * forma no recuperable (el refresh devolvió 401). Tras lanzarlo, el
 * Almacenamiento_Seguro ya fue purgado y `onSessionExpired()` fue invocado
 * (Req 22.5).
 */
export class SessionExpiredError extends ClientNetworkError {
  constructor(
    message = 'La sesión expiró; se requiere iniciar sesión nuevamente.',
  ) {
    super(message);
    this.name = 'SessionExpiredError';
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

/**
 * Configuración del cliente consciente de sesión. Todo inyectable para pruebas.
 */
export interface SessionHttpClientConfig {
  /** Pipeline base a decorar (típicamente `HttpClient.send` enlazado). */
  readonly send: SendFn;
  /** Almacenamiento_Seguro del Refresh_Token (Task 25.3). */
  readonly tokenStore: SecureTokenStore;
  /** Holder del Access_Token vigente en memoria. */
  readonly accessTokenHolder: AccessTokenHolder;
  /** Intercambio de refresh: refreshToken → nuevo par (o null si 401). */
  readonly refresh: RefreshFn;
  /**
   * Hook de enrutado al login. Se invoca UNA vez cuando el refresh falla con 401
   * y la sesión debe cerrarse (Req 22.5). No debe lanzar.
   */
  readonly onSessionExpired: () => void;
}

/**
 * Construye una {@link RefreshFn} sobre el pipeline base `send` que invoca
 * `POST /auth/refresh {refreshToken}` (endpoint público, no autenticado) y
 * devuelve el nuevo par de tokens. Un 401 del refresh se traduce en `null`
 * (sesión no recuperable). Path configurable (por defecto `/auth/refresh`).
 */
export function makeAuthRefreshFn(
  send: SendFn,
  path = '/auth/refresh',
): RefreshFn {
  return async (refreshToken: string): Promise<TokenPair | null> => {
    const response = await send<Partial<TokenPair>>({
      method: 'POST',
      path,
      body: JSON.stringify({ refreshToken }),
      // El refresh NO adjunta el Access_Token expirado: se autentica con el
      // Refresh_Token del cuerpo (endpoint público desde la óptica del Bearer).
      authenticated: false,
    });

    if (response.status === 401) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      // Fallo no-401 del refresh (5xx, red): se trata como fallo transitorio
      // para no cerrar la sesión indebidamente (Req 27.4).
      throw new Error(`El refresh falló con estado ${response.status}.`);
    }

    const body = response.body;
    if (
      !body ||
      typeof body.accessToken !== 'string' ||
      typeof body.refreshToken !== 'string'
    ) {
      throw new Error('La respuesta de refresh no contiene un par de tokens válido.');
    }
    return { accessToken: body.accessToken, refreshToken: body.refreshToken };
  };
}

/**
 * Decorador del pipeline `send` que añade refresh single-flight con rotación y
 * reintento ante 401 por expiración del Access_Token (Req 22.4, 22.5, 27.1).
 *
 * Diseño del single-flight: se mantiene una única promesa `refreshInFlight`.
 * El primer 401 la crea; las peticiones concurrentes que también reciban 401
 * esperan esa MISMA promesa en lugar de disparar refreshes paralelos. Al
 * resolverse (éxito o fallo), la promesa se limpia para permitir un futuro
 * refresh. Como una promesa compartida es intrínsecamente determinista, no se
 * necesitan temporizadores reales para probar la deduplicación.
 */
export class SessionHttpClient {
  private readonly send: SendFn;
  private readonly tokenStore: SecureTokenStore;
  private readonly accessTokenHolder: AccessTokenHolder;
  private readonly refresh: RefreshFn;
  private readonly onSessionExpired: () => void;

  /** Refresh en vuelo compartido (single-flight). `null` cuando no hay ninguno. */
  private refreshInFlight: Promise<TokenPair | null> | null = null;

  constructor(config: SessionHttpClientConfig) {
    this.send = config.send;
    this.tokenStore = config.tokenStore;
    this.accessTokenHolder = config.accessTokenHolder;
    this.refresh = config.refresh;
    this.onSessionExpired = config.onSessionExpired;
  }

  /**
   * Envía una petición a través del pipeline base y, ante un 401 en una petición
   * autenticada, ejecuta el refresh single-flight y reintenta UNA vez.
   */
  async send$<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    const first = await this.send<T>(request);

    // Solo un 401 en una petición AUTENTICADA dispara el refresh (Req 22.4).
    // Un 401 en un endpoint público (login/refresh) se deja pasar a la capa de
    // mapeo de errores (Task 25.4).
    if (first.status !== 401 || !request.authenticated) {
      return first;
    }

    const tokens = await this.runSingleFlightRefresh();

    if (tokens === null) {
      // Refresh 401: sesión no recuperable → purgar y enrutar al login (Req 22.5).
      await this.handleSessionExpired();
      throw new SessionExpiredError();
    }

    // Rotación aplicada por runSingleFlightRefresh(): reintentar UNA vez con el
    // nuevo Access_Token (Req 22.4). El holder ya contiene el token nuevo, así
    // que basta con reenviar la MISMA petición por el pipeline base, que vuelve
    // a leer el token vigente.
    return this.send<T>(request);
  }

  /**
   * Devuelve una {@link SendFn} ya enlazada a esta instancia para componer este
   * decorador con otras capas (p. ej. el reintento de GET de Task 25.4) o para
   * inyectarlo allí donde se espera un `send`.
   */
  asSend(): SendFn {
    return this.send$.bind(this);
  }

  /**
   * Ejecuta el refresh deduplicado: si ya hay uno en vuelo, devuelve su promesa;
   * si no, lo inicia. El resultado (nuevo par o `null` en 401) se comparte entre
   * todos los llamadores concurrentes (Req 27.1).
   */
  private runSingleFlightRefresh(): Promise<TokenPair | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const inFlight = this.performRefresh().finally(() => {
      // Limpia SIEMPRE al terminar para permitir un refresh posterior, tanto en
      // éxito como en fallo.
      this.refreshInFlight = null;
    });
    this.refreshInFlight = inFlight;
    return inFlight;
  }

  /**
   * Realiza el intercambio de refresh y, al éxito, ROTA el par de tokens:
   * guarda el nuevo Access_Token en el holder en memoria y el nuevo
   * Refresh_Token en el Almacenamiento_Seguro (Req 22.4). Devuelve `null` si el
   * refresh respondió 401 (o no hay Refresh_Token persistido).
   */
  private async performRefresh(): Promise<TokenPair | null> {
    const currentRefreshToken = await this.tokenStore.getRefreshToken();
    if (!currentRefreshToken) {
      // Sin Refresh_Token no hay sesión que renovar → tratar como expirada.
      return null;
    }

    let tokens: TokenPair | null;
    try {
      tokens = await this.refresh(currentRefreshToken);
    } catch (error) {
      if (error instanceof RefreshUnauthorizedError) {
        return null;
      }
      // Fallo transitorio (red/5xx): propagar para que NO se cierre la sesión.
      throw error;
    }

    if (tokens === null) {
      return null;
    }

    // Rotación del par (Req 22.4): Access_Token en memoria; Refresh_Token en el
    // Almacenamiento_Seguro (sobrescribe el anterior).
    this.accessTokenHolder.set(tokens.accessToken);
    await this.tokenStore.setRefreshToken(tokens.refreshToken);
    return tokens;
  }

  /**
   * Purga el Almacenamiento_Seguro y el Access_Token en memoria e invoca el hook
   * de enrutado al login (Req 22.5). Idempotente y a prueba de fallos: un error
   * en `onSessionExpired` no debe enmascarar el `SessionExpiredError`.
   */
  private async handleSessionExpired(): Promise<void> {
    this.accessTokenHolder.set(null);
    await this.tokenStore.clear();
    try {
      this.onSessionExpired();
    } catch {
      // El hook de navegación no debe romper la propagación del error de sesión.
    }
  }
}
