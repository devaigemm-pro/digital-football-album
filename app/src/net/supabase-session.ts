// Decorador de sesión respaldado por un proveedor de token EXTERNO (Supabase).
//
// docs/FRONTEND_INTEGRATION.md · §2/§3: la app autentica contra Supabase Auth y
// envía el `access_token` de Supabase al backend como `Authorization: Bearer`.
// El refresh del token lo gestiona supabase-js (NO hay `POST /auth/refresh` en
// el backend). Este decorador reemplaza al `SessionHttpClient` (que asumía un
// refresh contra el backend) por uno que, ante un 401 del backend:
//   1. pide un token FRESCO al proveedor de refresh inyectado (en producción,
//      `supabase.auth.refreshSession()`),
//   2. lo publica en el holder en memoria (que alimenta `HttpClient.getAccessToken`),
//   3. reintenta la petición original UNA vez,
//   4. si sigue 401 (o no hay token), invoca `onSessionExpired()` y propaga
//      `SessionExpiredError` (la UI cierra sesión / vuelve al login).
//
// Es TypeScript PURO y framework-agnóstico: el proveedor de refresh y el holder
// son inyectables (una función `() => Promise<string|null>` y un
// `AccessTokenHolder`). NO importa `react-native` ni `@supabase/supabase-js`; el
// wiring nativo pasa el refresh real de supabase-js desde `App.tsx` (`.tsx`).
// Reutiliza el mismo `AccessTokenHolder`, `SendFn` y `SessionExpiredError` del
// resto del módulo de red, manteniendo el mapeo de errores reutilizable.

import type { HttpRequest, HttpResponse } from './http-client';
import type { AccessTokenHolder, SendFn } from './session-client';
import { SessionExpiredError } from './session-client';

/**
 * Proveedor de refresh de token externo. Devuelve un Access_Token nuevo, o
 * `null` si la sesión ya no es recuperable (el usuario debe volver a iniciar
 * sesión). En producción envuelve `supabase.auth.refreshSession()`.
 */
export type ExternalRefreshFn = () => Promise<string | null>;

/**
 * Configuración del decorador de sesión Supabase. Todo inyectable para pruebas.
 */
export interface SupabaseSessionHttpClientConfig {
  /** Pipeline base a decorar (`HttpClient.send` enlazado). */
  readonly send: SendFn;
  /** Holder del Access_Token vigente en memoria (sincronizado con Supabase). */
  readonly accessTokenHolder: AccessTokenHolder;
  /** Refresh externo (supabase-js) invocado ante un 401 del backend. */
  readonly refresh: ExternalRefreshFn;
  /** Hook de cierre de sesión/enrutado al login (Req 22.5). No debe lanzar. */
  readonly onSessionExpired: () => void;
}

/**
 * Decorador de `send` que refresca el token vía Supabase ante un 401 del backend
 * y reintenta UNA vez. Refresh single-flight: un único refresh en vuelo que las
 * peticiones concurrentes con 401 comparten (evita refrescos paralelos).
 */
export class SupabaseSessionHttpClient {
  private readonly send: SendFn;
  private readonly accessTokenHolder: AccessTokenHolder;
  private readonly refresh: ExternalRefreshFn;
  private readonly onSessionExpired: () => void;

  /** Refresh en vuelo compartido (single-flight). `null` si no hay ninguno. */
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(config: SupabaseSessionHttpClientConfig) {
    this.send = config.send;
    this.accessTokenHolder = config.accessTokenHolder;
    this.refresh = config.refresh;
    this.onSessionExpired = config.onSessionExpired;
  }

  /**
   * Envía la petición y, ante un 401 en una petición autenticada, refresca el
   * token vía Supabase y reintenta UNA vez. Si el refresh no devuelve token o el
   * reintento vuelve a dar 401, cierra la sesión (Req 22.5).
   */
  async send$<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    const first = await this.send<T>(request);

    if (first.status !== 401 || !request.authenticated) {
      return first;
    }

    const freshToken = await this.runSingleFlightRefresh();
    if (freshToken === null) {
      this.handleSessionExpired();
      throw new SessionExpiredError();
    }

    // El holder ya contiene el token nuevo; reenviar la MISMA petición (el
    // pipeline base vuelve a leer el token vigente).
    const retried = await this.send<T>(request);
    if (retried.status === 401 && request.authenticated) {
      // Sigue no autorizado tras refrescar → sesión no recuperable.
      this.handleSessionExpired();
      throw new SessionExpiredError();
    }
    return retried;
  }

  /** Devuelve una `SendFn` enlazada para componer con otras capas. */
  asSend(): SendFn {
    return this.send$.bind(this);
  }

  /** Refresh deduplicado: comparte el mismo refresh en vuelo. */
  private runSingleFlightRefresh(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const inFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    this.refreshInFlight = inFlight;
    return inFlight;
  }

  /** Pide el token a Supabase y lo publica en el holder; `null` si falla. */
  private async performRefresh(): Promise<string | null> {
    let token: string | null;
    try {
      token = await this.refresh();
    } catch {
      // Fallo del refresh (red/estado): tratar como sesión no recuperable.
      token = null;
    }
    this.accessTokenHolder.set(token);
    return token;
  }

  /** Purga el token en memoria e invoca el hook de cierre de sesión. */
  private handleSessionExpired(): void {
    this.accessTokenHolder.set(null);
    try {
      this.onSessionExpired();
    } catch {
      // El hook de navegación no debe romper la propagación del error.
    }
  }
}
