// Almacenamiento_Seguro del Refresh_Token del cliente.
//
// Task 25.3 — Requirements: 28.2, 28.3, 28.4
// (design.md · "Arquitectura de la App_Móvil" → "Módulo de red y sesión" y
//  "Estructura de carpetas propuesta" → src/storage · Almacenamiento_Seguro)
//
// Patrón puerto/adaptador: el resto de la App_Móvil (p. ej. el módulo de red y
// sesión) depende únicamente de la interfaz `SecureTokenStore`, no de una
// librería nativa concreta. Esto mantiene la lógica de sesión testeable sin
// dispositivo/emulador y permite intercambiar la implementación (Keychain iOS /
// Keystore Android en producción; en memoria en pruebas).

/**
 * Puerto framework-agnóstico para guardar de forma segura el Refresh_Token.
 *
 * En producción se resuelve con {@link KeychainSecureTokenStore}, que delega en
 * el Almacenamiento_Seguro del sistema operativo (Keychain de iOS / Keystore de
 * Android) — cumpliendo el cifrado en reposo (Req 28.3). El access token (JWT)
 * es de vida corta y NO se persiste; solo el Refresh_Token pasa por este puerto.
 */
export interface SecureTokenStore {
  /**
   * Persiste el Refresh_Token en el Almacenamiento_Seguro (Req 28.2).
   * Sobrescribe cualquier token previamente almacenado (rotación).
   */
  setRefreshToken(token: string): Promise<void>;

  /**
   * Devuelve el Refresh_Token almacenado, o `null` si no hay sesión persistida.
   */
  getRefreshToken(): Promise<string | null>;

  /**
   * Elimina el Refresh_Token del dispositivo. Se invoca al cerrar sesión o al
   * borrar la cuenta (Req 28.4), y también cuando `POST /auth/refresh` responde
   * 401 (refresh inválido/rotado/expirado).
   */
  clear(): Promise<void>;
}

/**
 * Implementación en memoria (TypeScript puro) del puerto {@link SecureTokenStore}.
 *
 * Sirve como doble de prueba y como implementación por defecto en contextos no
 * nativos (p. ej. pruebas unitarias, herramientas). NO ofrece cifrado en reposo
 * ni persistencia entre ejecuciones: en producción debe usarse
 * {@link KeychainSecureTokenStore}.
 */
export class InMemorySecureTokenStore implements SecureTokenStore {
  private token: string | null = null;

  async setRefreshToken(token: string): Promise<void> {
    this.token = token;
  }

  async getRefreshToken(): Promise<string | null> {
    return this.token;
  }

  async clear(): Promise<void> {
    this.token = null;
  }
}

/**
 * Subconjunto mínimo de la API de `react-native-keychain` usado por el adaptador.
 *
 * Se declara localmente (en lugar de importar el paquete) para que este módulo
 * compile con `app/tsconfig.json` aun cuando `react-native-keychain` no esté
 * instalado en este entorno. En producción, el módulo real satisface esta forma.
 */
export interface KeychainModule {
  setGenericPassword(
    username: string,
    password: string,
    options?: unknown,
  ): Promise<unknown>;
  getGenericPassword(
    options?: unknown,
  ): Promise<false | { password: string; username: string }>;
  resetGenericPassword(options?: unknown): Promise<boolean>;
}

/**
 * Nombre de usuario lógico bajo el que se guarda el Refresh_Token en el
 * Almacenamiento_Seguro. El valor sensible es la contraseña (el token).
 */
const REFRESH_TOKEN_ACCOUNT = 'refresh_token';

/**
 * Adaptador que respalda {@link SecureTokenStore} con el Almacenamiento_Seguro
 * nativo (Keychain de iOS / Keystore de Android) vía `react-native-keychain`
 * (Req 28.2, 28.3).
 *
 * La dependencia nativa se inyecta por constructor y se tipa con la interfaz
 * local {@link KeychainModule}, de modo que este archivo compila sin un import
 * de nivel superior del paquete `react-native-keychain` (que no está instalado
 * en este entorno). En producción se construye con el módulo real:
 *
 * ```ts
 * import * as Keychain from 'react-native-keychain';
 * const store = new KeychainSecureTokenStore(Keychain);
 * ```
 */
export class KeychainSecureTokenStore implements SecureTokenStore {
  private readonly account: string;

  constructor(
    private readonly keychain: KeychainModule,
    account: string = REFRESH_TOKEN_ACCOUNT,
  ) {
    this.account = account;
  }

  async setRefreshToken(token: string): Promise<void> {
    await this.keychain.setGenericPassword(this.account, token, {
      service: this.account,
    });
  }

  async getRefreshToken(): Promise<string | null> {
    const result = await this.keychain.getGenericPassword({
      service: this.account,
    });
    if (result === false) {
      return null;
    }
    return result.password;
  }

  async clear(): Promise<void> {
    await this.keychain.resetGenericPassword({ service: this.account });
  }
}
