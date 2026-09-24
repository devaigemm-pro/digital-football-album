// Tipos base del API Gateway (borde) — objetos de petición/respuesta agnósticos
// del framework HTTP.
//
// El diseño (design.md · "API Gateway (borde)") define el gateway como la capa
// que: termina TLS (Req 20.1), autentica peticiones con el access token JWT de
// sesión (Req 1.2), aplica límites de tasa y enruta a los servicios. Para que la
// lógica sea testeable sin levantar un servidor HTTP real, modelamos la petición
// y la respuesta como objetos planos: cualquier adaptador concreto (Express,
// Fastify, Lambda, etc.) solo debe traducir su request/response nativo a estos
// tipos.
//
// Task 4.1 — Requirements: 1.2, 20.1

/**
 * Métodos HTTP soportados por el enrutador del gateway. `OPTIONS` se admite para
 * las peticiones preflight de CORS (no se registra como ruta de servicio).
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/**
 * Petición entrante normalizada que atraviesa el gateway.
 *
 * Es inmutable de cara al llamador; el pipeline produce un `GatewayContext`
 * enriquecido en lugar de mutar la petición.
 */
export interface GatewayRequest {
  /** Método HTTP de la petición. */
  readonly method: HttpMethod;
  /**
   * Ruta (path) sin querystring, p. ej. `/album/123/preview`. El enrutador la
   * compara contra los patrones registrados.
   */
  readonly path: string;
  /**
   * Parámetros de la query string ya parseados (p. ej. `{ buscar: 'barcelona' }`),
   * o `undefined` si la petición no traía query. El enrutador ignora la query;
   * los handlers que la necesiten la leen de aquí (no del `path`).
   */
  readonly query?: Readonly<Record<string, string>>;
  /**
   * Cabeceras normalizadas a minúsculas. El middleware de autenticación lee
   * `authorization`; la terminación TLS lee `x-forwarded-proto` cuando aplica.
   */
  readonly headers: Readonly<Record<string, string>>;
  /**
   * Indica si la conexión que llegó al gateway usa TLS. En un despliegue real
   * lo fija el adaptador a partir del socket o de `x-forwarded-proto` (Req 20.1).
   */
  readonly isSecure: boolean;
  /**
   * Identificador de cliente para el rate limiting cuando la petición aún no
   * está autenticada (p. ej. IP remota). Opcional.
   */
  readonly clientId?: string;
  /** Cuerpo ya deserializado, opaco para el gateway. */
  readonly body?: unknown;
}

/**
 * Contexto que el pipeline del gateway va enriqueciendo. Empieza con la petición
 * y le agrega la identidad autenticada y la clave de rate limiting a medida que
 * atraviesa cada etapa.
 */
export interface GatewayContext {
  readonly request: GatewayRequest;
  /**
   * Identificador del usuario autenticado (`sub` del access token) una vez que
   * el middleware de autenticación valida el token (Req 1.2). Ausente en rutas
   * públicas o antes de autenticar.
   */
  readonly userId?: string;
  /** Claim de expiración del token autenticado, útil para trazabilidad. */
  readonly tokenExpEpochSeconds?: number;
}

/** Respuesta normalizada que el gateway devuelve al adaptador. */
export interface GatewayResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

/**
 * Manejador de un servicio de backend detrás del gateway. Recibe el contexto ya
 * autenticado/enrutado y produce una respuesta. Los servicios reales
 * (Motor_Momentos, Motor_Album, etc.) exponen adaptadores que cumplen esta
 * firma.
 */
export type ServiceHandler = (
  context: GatewayContext,
) => GatewayResponse | Promise<GatewayResponse>;
