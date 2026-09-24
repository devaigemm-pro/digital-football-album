// Cliente HTTP del Módulo de red del cliente (design.md · "Módulo de red y
// sesión (Req 22, 27, 28)").
//
// Task 25.1 — Requirements: 22.3, 28.1
//
// Responsabilidades de ESTE archivo (solo Task 25.1):
//   - Imponer TLS: rechazar cualquier URL que no sea `https://` (Req 28.1,
//     "usar conexiones cifradas mediante TLS y rechazar las que no sean TLS").
//   - Adjuntar el Access_Token vigente en las peticiones autenticadas mediante
//     `Authorization: Bearer <token>` (Req 22.3, "adjuntar el Access_Token
//     vigente en cada petición autenticada").
//
// El refresh single-flight con rotación y reintento (Task 25.2), el
// almacenamiento seguro de tokens (Task 25.3) y el mapeo de errores/resiliencia
// (Task 25.4) NO se implementan aquí. Para permitir que un interceptor de
// refresh envuelva a este cliente más adelante, el pipeline de petición se
// expone de forma componible: `HttpClient.send(request)` recibe una petición
// ya normalizada y devuelve una respuesta normalizada, de modo que un futuro
// interceptor pueda decorar `send` (reintentar tras un 401, etc.) sin reescribir
// esta capa.
//
// TypeScript puro y framework-agnóstico: depende únicamente de la API estándar
// `fetch` (disponible en React Native y en Node). No importa `react-native` ni
// ningún paquete no instalado. Tanto `fetch` como el proveedor de token son
// inyectables para poder probarse sin una sesión ni red reales.

/**
 * Métodos HTTP soportados por el cliente.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Proveedor del Access_Token vigente. Se inyecta para desacoplar el cliente de
 * la sesión concreta y del Almacenamiento_Seguro (Task 25.3): devuelve el token
 * actual o `null` cuando no hay sesión activa.
 */
export type AccessTokenProvider = () => string | null;

/**
 * Subconjunto mínimo de la API estándar `fetch` del que depende el cliente.
 * Declararlo aquí (en lugar de referenciar el tipo global) hace explícito el
 * contrato inyectable y permite pasar un fake en las pruebas.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchLikeResponse>;

/**
 * Respuesta mínima que el cliente consume de `fetch`.
 */
export interface FetchLikeResponse {
  readonly status: number;
  text(): Promise<string>;
}

/**
 * Opciones de una petición individual.
 */
export interface RequestOptions {
  /** Cabeceras adicionales; se combinan con las que agrega el cliente. */
  readonly headers?: Record<string, string>;
  /**
   * Si es `true` (por defecto), se adjunta el Access_Token vigente (Req 22.3).
   * Se puede desactivar para endpoints públicos (p. ej. login/refresh).
   */
  readonly authenticated?: boolean;
}

/**
 * Petición ya normalizada que atraviesa el pipeline componible `send`.
 * Un futuro interceptor de refresh (Task 25.2) puede inspeccionarla/reintentarla.
 */
export interface HttpRequest {
  readonly method: HttpMethod;
  /** Ruta relativa al `baseUrl` o URL absoluta `https://…`. */
  readonly path: string;
  readonly headers?: Record<string, string>;
  /** Cuerpo ya serializado (JSON). `undefined` si no aplica. */
  readonly body?: string;
  readonly authenticated: boolean;
}

/**
 * Respuesta normalizada. `body` es el JSON parseado (o `null` si el cuerpo está
 * vacío o no es JSON válido). El estado se expone crudo para que capas
 * superiores mapeen 401/409/gating (Task 25.4).
 */
export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly body: T | null;
}

/**
 * Error tipado que se lanza cuando una petición apunta a un transporte no-TLS
 * (URL que no comienza por `https://`). Satisface el rechazo de conexiones no
 * cifradas (Req 28.1 / 22.3).
 */
export class InsecureTransportError extends Error {
  /** URL rechazada por no viajar sobre TLS. */
  readonly url: string;

  constructor(url: string) {
    super(
      `Transporte inseguro rechazado: se requiere TLS (https://) pero se recibió "${url}".`,
    );
    this.name = 'InsecureTransportError';
    this.url = url;
    // Mantiene la cadena de prototipos al transpilar a ES5/ESNext.
    Object.setPrototypeOf(this, InsecureTransportError.prototype);
  }
}

/**
 * Configuración del cliente HTTP. Todo es inyectable para hacerlo mockeable en
 * pruebas (fetch fake, proveedor de token, base URL de test).
 */
export interface HttpClientConfig {
  /** Base URL del backend; DEBE ser `https://` (se valida por petición). */
  readonly baseUrl: string;
  /** Proveedor del Access_Token vigente (Req 22.3). Por defecto: sin token. */
  readonly getAccessToken?: AccessTokenProvider;
  /** Implementación de fetch a usar; por defecto la global. */
  readonly fetchImpl?: FetchLike;
}

/**
 * Comprueba que una URL viaje sobre TLS. Lanza `InsecureTransportError` si no.
 * Se centraliza aquí para reutilizarse en la validación de `baseUrl` y de URLs
 * absolutas.
 */
function assertTls(url: string): void {
  // Comparación de esquema insensible a mayúsculas, sin depender de `URL` (no
  // siempre disponible de forma uniforme en RN); basta con el prefijo de esquema.
  if (!/^https:\/\//i.test(url.trim())) {
    throw new InsecureTransportError(url);
  }
}

/**
 * Resuelve la implementación de fetch a utilizar: la inyectada o la global.
 * Se resuelve de forma perezosa (por instancia) para no capturar una global
 * inexistente en tiempo de import.
 */
function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (!globalFetch) {
    throw new Error(
      'No hay una implementación de fetch disponible; inyecte una vía HttpClientConfig.fetchImpl.',
    );
  }
  return globalFetch;
}

/**
 * Une la base con una ruta relativa, evitando barras duplicadas o faltantes.
 * Si `path` ya es absoluta (`https://…` u `http://…`) se devuelve tal cual para
 * que la validación de TLS la evalúe directamente.
 */
function resolveUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.replace(/^\/+/, '');
  return rel ? `${base}/${rel}` : base;
}

/**
 * Cliente HTTP con TLS obligatorio y adjunto del Access_Token.
 *
 * Diseñado para ser componible: `send()` es el punto único del pipeline que un
 * interceptor de refresh (Task 25.2) puede envolver. Los métodos tipados
 * (`get`/`post`/…) son azúcar sobre `send()`.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: FetchLike;

  constructor(config: HttpClientConfig) {
    // Validación temprana de la base: falla rápido ante una base no-TLS (Req 28.1).
    assertTls(config.baseUrl);
    this.baseUrl = config.baseUrl;
    this.getAccessToken = config.getAccessToken ?? (() => null);
    this.fetchImpl = resolveFetch(config.fetchImpl);
  }

  /**
   * Punto único del pipeline de petición. Impone TLS, adjunta el Access_Token
   * cuando corresponde y normaliza la respuesta. Un interceptor de refresh
   * puede envolver este método para reintentar tras un 401 (Task 25.2).
   */
  async send<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    const url = resolveUrl(this.baseUrl, request.path);

    // Impone TLS también sobre URLs absolutas provistas por el llamador (Req 28.1).
    assertTls(url);

    const headers: Record<string, string> = { ...(request.headers ?? {}) };

    if (request.body !== undefined && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // Adjunta el Access_Token vigente en peticiones autenticadas (Req 22.3).
    if (request.authenticated) {
      const token = this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await this.fetchImpl(url, {
      method: request.method,
      headers,
      body: request.body,
    });

    return {
      status: response.status,
      body: await parseBody<T>(response),
    };
  }

  get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.send<T>(this.buildRequest('GET', path, undefined, options));
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>> {
    return this.send<T>(this.buildRequest('POST', path, body, options));
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>> {
    return this.send<T>(this.buildRequest('PUT', path, body, options));
  }

  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>> {
    return this.send<T>(this.buildRequest('PATCH', path, body, options));
  }

  delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.send<T>(this.buildRequest('DELETE', path, undefined, options));
  }

  /**
   * Normaliza los argumentos de los métodos tipados a un `HttpRequest`.
   * Por defecto las peticiones son autenticadas (Req 22.3); se puede desactivar
   * vía `options.authenticated = false` para endpoints públicos.
   */
  private buildRequest(
    method: HttpMethod,
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): HttpRequest {
    return {
      method,
      path,
      headers: options?.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      authenticated: options?.authenticated ?? true,
    };
  }
}

/**
 * Parsea el cuerpo como JSON. Devuelve `null` ante cuerpo vacío o JSON inválido,
 * para no romper el pipeline ante respuestas sin contenido (204, errores planos).
 */
async function parseBody<T>(response: FetchLikeResponse): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
