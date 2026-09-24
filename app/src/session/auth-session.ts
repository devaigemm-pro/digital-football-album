// Presenter puro (TypeScript, framework-agnóstico) de autenticación y sesión de
// la App_Móvil: login/registro multiproveedor, logout y borrado de cuenta.
//
// Task 26.1 — Requirements: 22.1, 22.2, 22.6
// Task 26.2 — Requirements: 22.7, 22.8
// (design.md · "Módulo de red y sesión (Req 22, 27, 28)" y requirements.md ·
//  "Requerimiento 22: Sesión y Manejo de Tokens en el Cliente")
//
// Responsabilidades de ESTE archivo:
//   - login/register(provider, credential) → invoca el `AuthClient` inyectable
//     (POST /auth/login | POST /auth/register) contra el Servicio_Autenticación
//     con Apple ID / Google / correo (Req 22.1). Al recibir el par
//     {Access_Token, Refresh_Token} válido, PERSISTE el Refresh_Token en el
//     Almacenamiento_Seguro (`SecureTokenStore`), coloca el Access_Token en el
//     `AccessTokenHolder` en memoria y marca la sesión como autenticada,
//     dando acceso a las pantallas autenticadas (Req 22.2).
//   - logout() → invoca el logout del Servicio_Autenticación (invalida el
//     Refresh_Token en el backend) y luego purga el Almacenamiento_Seguro y el
//     Access_Token en memoria (Req 22.6).
//   - deleteAccount({ confirmed }) → EXIGE confirmación explícita de que el
//     borrado es permanente ANTES de invocar `DELETE /cuenta` (Req 22.7); si no
//     está confirmado, NO llama al backend y devuelve un resultado tipado de
//     "confirmación requerida". Si está confirmado, invoca `DELETE /cuenta`,
//     purga los tokens y señala la redirección al login (Req 22.8).
//
// Por qué presenter puro: `app/tsconfig.json` excluye `.tsx` (React Native no
// está instalado en este entorno). Toda la lógica relevante para la corrección
// vive aquí (sin imports de react/react-native) para que compile y se pruebe
// unitariamente; las pantallas `.tsx` son delgadas y delegan en este presenter.
//
// Todo lo externo (AuthClient, SecureTokenStore, AccessTokenHolder) es
// inyectable → testeable con dobles en memoria, sin red ni dispositivo.

import type { SecureTokenStore } from '../storage/secure-token-store';
import type {
  AccessTokenHolder,
  TokenPair,
} from '../net/session-client';

/**
 * Proveedores de identidad soportados por el Servicio_Autenticación (Req 22.1):
 * Apple ID, cuenta de Google y correo electrónico.
 */
export type AuthProvider = 'apple' | 'google' | 'email';

/**
 * Credencial de login/registro. Su forma depende del proveedor:
 *   - `apple` / `google`: token de identidad del proveedor OAuth/OIDC.
 *   - `email`: correo + contraseña.
 * Se modela como unión discriminada por `provider` para que el `AuthClient`
 * concreto la despache correctamente y para forzar credenciales coherentes.
 */
export type AuthCredential =
  | { readonly provider: 'apple'; readonly identityToken: string }
  | { readonly provider: 'google'; readonly identityToken: string }
  | {
      readonly provider: 'email';
      readonly email: string;
      readonly password: string;
    };

/**
 * Contrato del cliente de autenticación contra el Servicio_Autenticación.
 * Se declara como interfaz inyectable para desacoplar el presenter del
 * transporte HTTP concreto: en pruebas se usa un doble en memoria; en producción
 * un adaptador que envuelve el `HttpClient`/`SessionHttpClient` (POST /auth/login,
 * POST /auth/register, logout, DELETE /cuenta).
 */
export interface AuthClient {
  /**
   * `POST /auth/login` con la credencial del proveedor (Req 22.1, 22.2).
   * Devuelve el par de tokens si las credenciales son válidas.
   */
  login(credential: AuthCredential): Promise<TokenPair>;

  /**
   * `POST /auth/register` para crear una cuenta nueva (Req 22.1); para correo,
   * asocia la cuenta al email. Devuelve el par de tokens de la sesión creada.
   */
  register(credential: AuthCredential): Promise<TokenPair>;

  /**
   * Logout del Servicio_Autenticación: invalida el Refresh_Token en el backend
   * (Req 22.6). Recibe el Refresh_Token vigente para poder revocarlo.
   */
  logout(refreshToken: string): Promise<void>;

  /**
   * `DELETE /cuenta`: borra la cuenta de forma permanente en el backend
   * (Req 22.8). Solo debe invocarse tras confirmación explícita del usuario.
   */
  deleteAccount(): Promise<void>;
}

/**
 * Estado de sesión observable por la UI. `authenticated` habilita las pantallas
 * autenticadas (Req 22.2); `unauthenticated` enruta al login.
 */
export type SessionStatus = 'unauthenticated' | 'authenticated';

/**
 * Resultado tipado de una operación de sesión. Un discriminador `outcome`
 * permite a la UI reaccionar sin depender de excepciones para el flujo normal.
 */
export type SessionResult =
  | { readonly outcome: 'authenticated' }
  | { readonly outcome: 'signed-out' }
  /**
   * Devuelto por `deleteAccount` cuando falta la confirmación explícita de que
   * el borrado es permanente (Req 22.7). NO se tocó el backend ni los tokens.
   */
  | { readonly outcome: 'confirmation-required' }
  /**
   * Devuelto por `deleteAccount` tras un borrado confirmado: la cuenta se borró,
   * los tokens se purgaron y la UI debe redirigir al login (Req 22.8).
   */
  | { readonly outcome: 'account-deleted'; readonly redirectToLogin: true };

/**
 * Parámetros del borrado de cuenta. `confirmed` DEBE ser `true` para que el
 * presenter invoque `DELETE /cuenta` (confirmación explícita, Req 22.7).
 */
export interface DeleteAccountParams {
  /** Confirmación explícita de que el borrado de cuenta es permanente. */
  readonly confirmed: boolean;
}

/**
 * Dependencias inyectables del presenter. Todas tienen dobles en memoria para
 * pruebas (InMemorySecureTokenStore, InMemoryAccessTokenHolder, AuthClient fake).
 */
export interface AuthSessionConfig {
  /** Cliente contra el Servicio_Autenticación. */
  readonly authClient: AuthClient;
  /** Almacenamiento_Seguro del Refresh_Token (Keychain/Keystore en producción). */
  readonly tokenStore: SecureTokenStore;
  /** Holder en memoria del Access_Token vigente. */
  readonly accessTokenHolder: AccessTokenHolder;
  /**
   * Hook opcional de notificación de cambios de estado de sesión, para que la
   * capa de navegación (RootNavigator) reaccione (mostrar login / entrar a la
   * app). No debe lanzar.
   */
  readonly onSessionChange?: (status: SessionStatus) => void;
}

/**
 * Error tipado que envuelve un fallo del login/registro (credenciales inválidas,
 * Req 22.3, o error de red). La UI muestra un mensaje descriptivo; el presenter
 * NO marca la sesión como autenticada ni persiste tokens cuando esto ocurre.
 */
export class AuthenticationError extends Error {
  /** Error subyacente (del AuthClient/transporte), si lo hubo. */
  readonly cause?: unknown;

  constructor(message = 'No se pudo iniciar sesión.', cause?: unknown) {
    super(message);
    this.name = 'AuthenticationError';
    this.cause = cause;
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Presenter de sesión: orquesta login/registro/logout/borrado de cuenta sobre
 * las dependencias inyectadas, manteniendo el estado de sesión observable.
 *
 * Invariantes:
 *   - Solo tras un par de tokens válido se persiste el Refresh_Token y se marca
 *     la sesión como autenticada (Req 22.2).
 *   - Al cerrar sesión o borrar la cuenta, el Access_Token en memoria y el
 *     Refresh_Token del Almacenamiento_Seguro se purgan siempre (Req 22.6/22.8).
 *   - `deleteAccount` no contacta el backend sin confirmación explícita (Req 22.7).
 */
export class AuthSessionPresenter {
  private readonly authClient: AuthClient;
  private readonly tokenStore: SecureTokenStore;
  private readonly accessTokenHolder: AccessTokenHolder;
  private readonly onSessionChange?: (status: SessionStatus) => void;

  private status: SessionStatus = 'unauthenticated';

  constructor(config: AuthSessionConfig) {
    this.authClient = config.authClient;
    this.tokenStore = config.tokenStore;
    this.accessTokenHolder = config.accessTokenHolder;
    this.onSessionChange = config.onSessionChange;
  }

  /**
   * Estado de sesión actual. La UI lo consulta para decidir el grafo de
   * navegación (login vs. pantallas autenticadas).
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /** `true` si hay una sesión autenticada (Req 22.2). */
  isAuthenticated(): boolean {
    return this.status === 'authenticated';
  }

  /**
   * Inicia sesión contra el Servicio_Autenticación con la credencial del
   * proveedor (Apple/Google/email, Req 22.1). Al éxito, aplica el par de tokens
   * y marca la sesión autenticada (Req 22.2).
   */
  async login(credential: AuthCredential): Promise<SessionResult> {
    return this.authenticate(() => this.authClient.login(credential));
  }

  /**
   * Registra una cuenta nueva contra el Servicio_Autenticación (Req 22.1) y, al
   * éxito, deja la sesión autenticada (Req 22.2). Para `email`, crea la cuenta
   * asociada al correo.
   */
  async register(credential: AuthCredential): Promise<SessionResult> {
    return this.authenticate(() => this.authClient.register(credential));
  }

  /**
   * Cierra la sesión: invoca el logout del Servicio_Autenticación para invalidar
   * el Refresh_Token en el backend y luego purga los tokens locales (Req 22.6).
   *
   * El purgado local se ejecuta SIEMPRE, incluso si la llamada de logout al
   * backend falla, para no dejar tokens huérfanos en el dispositivo.
   */
  async logout(): Promise<SessionResult> {
    const refreshToken = await this.tokenStore.getRefreshToken();
    try {
      if (refreshToken) {
        await this.authClient.logout(refreshToken);
      }
    } finally {
      await this.clearSession();
    }
    return { outcome: 'signed-out' };
  }

  /**
   * Borra la cuenta del usuario. EXIGE confirmación explícita de que el borrado
   * es permanente (Req 22.7): si `confirmed` no es `true`, NO invoca el backend
   * ni toca los tokens y devuelve `confirmation-required`.
   *
   * Con la confirmación, invoca `DELETE /cuenta`, purga el Almacenamiento_Seguro
   * y el Access_Token en memoria, y señala la redirección al login (Req 22.8).
   */
  async deleteAccount(params: DeleteAccountParams): Promise<SessionResult> {
    if (!params.confirmed) {
      // Sin confirmación explícita no se contacta el backend (Req 22.7).
      return { outcome: 'confirmation-required' };
    }

    await this.authClient.deleteAccount();
    await this.clearSession();
    return { outcome: 'account-deleted', redirectToLogin: true };
  }

  /**
   * Ejecuta un flujo de autenticación (login o registro) y aplica el par de
   * tokens al éxito. Cualquier fallo se traduce en {@link AuthenticationError}
   * SIN alterar el estado de sesión ni persistir tokens (Req 22.3).
   */
  private async authenticate(
    exchange: () => Promise<TokenPair>,
  ): Promise<SessionResult> {
    let tokens: TokenPair;
    try {
      tokens = await exchange();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      throw new AuthenticationError(message, error);
    }

    if (
      !tokens ||
      typeof tokens.accessToken !== 'string' ||
      tokens.accessToken === '' ||
      typeof tokens.refreshToken !== 'string' ||
      tokens.refreshToken === ''
    ) {
      // Par de tokens inválido: no se autentica ni se persiste (Req 22.2).
      throw new AuthenticationError(
        'El Servicio_Autenticación no devolvió un par de tokens válido.',
      );
    }

    // Persistir Refresh_Token en el Almacenamiento_Seguro y Access_Token en
    // memoria; marcar la sesión autenticada (Req 22.2).
    await this.tokenStore.setRefreshToken(tokens.refreshToken);
    this.accessTokenHolder.set(tokens.accessToken);
    this.setStatus('authenticated');
    return { outcome: 'authenticated' };
  }

  /**
   * Purga el Access_Token en memoria y el Refresh_Token del Almacenamiento_Seguro
   * y marca la sesión como no autenticada (Req 22.6/22.8). Idempotente.
   */
  private async clearSession(): Promise<void> {
    this.accessTokenHolder.set(null);
    await this.tokenStore.clear();
    this.setStatus('unauthenticated');
  }

  /**
   * Actualiza el estado de sesión y notifica al hook de navegación si cambió.
   */
  private setStatus(status: SessionStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.onSessionChange?.(status);
  }
}
