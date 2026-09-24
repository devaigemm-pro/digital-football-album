// Configuración por entorno de la App_Móvil — capa PURA (TypeScript sin React).
//
// Este módulo NO importa `react-native-config` ni ningún módulo nativo: define
// el contrato tipado `AppConfig` y una función PURA `resolveConfig(raw)` que
// toma un mapa de variables de entorno crudas (`Record<string, string |
// undefined>`, la forma que expone `react-native-config`) y produce un
// `AppConfig` validado con valores por defecto.
//
// Al mantenerse puro, typechea bajo `app/tsconfig.json` y es unit-testable sin
// dispositivo. El adaptador nativo (`app/src/config/index.tsx`) importa
// `Config` de `react-native-config` y llama a `resolveConfig(Config)` para
// obtener el `appConfig` en tiempo de ejecución.
//
// TLS obligatorio (Req 28.1): `apiBaseUrl` DEBE viajar sobre `https://`; de lo
// contrario `resolveConfig` lanza `ConfigError`, aplicando la misma idea de
// rechazo de transporte no cifrado que el `HttpClient` (`net/http-client.ts`).

/**
 * Entornos de ejecución soportados. Determinan qué archivo `.env` carga
 * `react-native-config` en el toolchain nativo (dev vs. prod) y permiten
 * ramificar comportamiento no sensible (p. ej. logging) en la app.
 */
export type AppEnvironment = 'development' | 'production';

/**
 * Configuración de la App_Móvil resuelta y validada. Es el único contrato que
 * el resto del cliente consume; ninguna capa lee `process.env` ni
 * `react-native-config` directamente.
 */
export interface AppConfig {
  /** Entorno activo (development/production). */
  readonly environment: AppEnvironment;
  /**
   * URL base del backend (Servicios). DEBE ser `https://` (TLS obligatorio,
   * Req 28.1). Sin barra final (se normaliza).
   */
  readonly apiBaseUrl: string;
  /**
   * Client ID web de Google usado por `@react-native-google-signin/google-signin`
   * (`GoogleSignin.configure({ webClientId })`) para obtener el `idToken` que el
   * backend valida en el login con Google (Req 22.1). Cadena vacía si no se
   * configuró (el login con Google quedará deshabilitado).
   */
  readonly googleWebClientId: string;
  /**
   * URL scheme inverso de iOS para el Sign-In de Google (del `GoogleService-Info`
   * / OAuth client de iOS). Requerido solo en iOS; cadena vacía si no aplica.
   */
  readonly iosUrlScheme: string;
}

/**
 * Error de configuración: se lanza cuando una variable obligatoria falta o es
 * inválida (p. ej. `apiBaseUrl` no viaja sobre TLS). Falla rápido en el arranque
 * en lugar de dejar la app en un estado inconsistente.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/** Valores por defecto aplicados cuando la variable cruda viene ausente/vacía. */
const DEFAULTS = {
  /** Entorno por defecto si `APP_ENV` no está definido. */
  environment: 'development' as AppEnvironment,
} as const;

/** Comprueba si una cadena viaja sobre TLS (`https://`, insensible a mayúsculas). */
function isHttps(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/** Normaliza una URL base quitando espacios y una eventual barra final. */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Devuelve el valor recortado si es una cadena no vacía; si no, `undefined`. */
function readOptional(
  raw: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Resuelve el entorno a partir de `APP_ENV`; valores desconocidos → default. */
function resolveEnvironment(
  raw: Record<string, string | undefined>,
): AppEnvironment {
  const value = readOptional(raw, 'APP_ENV');
  return value === 'production' || value === 'development'
    ? value
    : DEFAULTS.environment;
}

/**
 * Resuelve y valida la configuración de la app a partir de las variables de
 * entorno crudas (la forma que expone `react-native-config`). Función PURA:
 * sin efectos secundarios, determinista y unit-testable.
 *
 * Reglas:
 *   - `API_BASE_URL` es OBLIGATORIA y DEBE ser `https://` (TLS, Req 28.1); en
 *     otro caso lanza `ConfigError`. Se normaliza sin barra final.
 *   - `GOOGLE_WEB_CLIENT_ID` e `IOS_URL_SCHEME` son opcionales; por defecto ''.
 *   - `APP_ENV` opcional: 'development' | 'production' (default 'development').
 *
 * @param raw Variables de entorno crudas (`Config` de react-native-config).
 * @throws {ConfigError} si falta `API_BASE_URL` o no viaja sobre TLS.
 */
export function resolveConfig(
  raw: Record<string, string | undefined>,
): AppConfig {
  const apiBaseUrlRaw = readOptional(raw, 'API_BASE_URL');
  if (!apiBaseUrlRaw) {
    throw new ConfigError(
      'Falta la variable de entorno obligatoria API_BASE_URL. ' +
        'Defínela en el archivo .env correspondiente.',
    );
  }
  if (!isHttps(apiBaseUrlRaw)) {
    throw new ConfigError(
      `API_BASE_URL debe usar TLS (https://) pero se recibió "${apiBaseUrlRaw}" ` +
        '(Req 28.1: se rechazan transportes no cifrados).',
    );
  }

  return {
    environment: resolveEnvironment(raw),
    apiBaseUrl: normalizeBaseUrl(apiBaseUrlRaw),
    googleWebClientId: readOptional(raw, 'GOOGLE_WEB_CLIENT_ID') ?? '',
    iosUrlScheme: readOptional(raw, 'IOS_URL_SCHEME') ?? '',
  };
}
