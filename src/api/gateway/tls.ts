// Terminación TLS en el borde (API Gateway).
//
// Diseño (design.md · "API Gateway (borde)"): el gateway **termina TLS**
// (Req 20.1), de modo que toda la comunicación entre la App_Móvil y los
// servicios de respaldo viaja cifrada por SSL/TLS. En un despliegue real el TLS
// lo termina el balanceador/gateway (ALB, Nginx, API Gateway administrado): el
// certificado y las claves se configuran en esa capa, no en el código de los
// servicios.
//
// Este módulo NO implementa el handshake TLS (eso lo provee la plataforma).
// Aporta dos cosas verificables en pruebas:
//   1. Un helper de configuración que documenta y transporta los parámetros de
//      terminación TLS del borde.
//   2. Un guard que, dentro del pipeline del gateway, **rechaza peticiones no
//      TLS** (texto plano) para que ninguna petición sin cifrar alcance los
//      servicios (Req 20.1).
//
// Task 4.1 — Requirements: 20.1

import type { GatewayRequest, GatewayResponse } from './types.js';

/**
 * Configuración de terminación TLS del borde. Es declarativa: describe cómo la
 * plataforma debe terminar TLS y qué política aplica el gateway ante peticiones
 * no cifradas. No contiene material criptográfico en claro (las rutas apuntan a
 * secretos gestionados por la plataforma).
 */
export interface TlsTerminationConfig {
  /**
   * Si es `true` (por defecto y recomendado), el gateway rechaza toda petición
   * que no llegue por TLS (Req 20.1). Solo debería desactivarse en pruebas
   * locales controladas.
   */
  readonly enforceHttps: boolean;
  /**
   * Versión mínima de TLS que la plataforma debe negociar en el borde. Es un
   * dato de configuración/documentación para el operador; el gateway no negocia
   * el handshake.
   */
  readonly minVersion: 'TLSv1.2' | 'TLSv1.3';
  /**
   * Cuando el gateway está detrás de un proxy/balanceador que ya terminó TLS,
   * la conexión al gateway puede ser en claro dentro de la red privada pero el
   * origen del cliente sí fue TLS. Si es `true`, el guard confía en la cabecera
   * `x-forwarded-proto: https` como evidencia de TLS de extremo del cliente.
   */
  readonly trustForwardedProto: boolean;
}

/** Configuración por defecto: HTTPS forzado, TLS 1.2+ y confianza en el proxy. */
export const DEFAULT_TLS_CONFIG: TlsTerminationConfig = {
  enforceHttps: true,
  minVersion: 'TLSv1.2',
  trustForwardedProto: true,
};

/**
 * Crea una configuración de terminación TLS a partir de valores parciales,
 * completando con `DEFAULT_TLS_CONFIG`. Sirve como punto único y documentado de
 * la política TLS del borde (Req 20.1).
 */
export function createTlsTerminationConfig(
  overrides: Partial<TlsTerminationConfig> = {},
): TlsTerminationConfig {
  return { ...DEFAULT_TLS_CONFIG, ...overrides };
}

/**
 * Determina si una petición llegó por un canal TLS según la configuración.
 *
 * Es TLS cuando `request.isSecure` es `true` o, si se confía en el proxy, cuando
 * `x-forwarded-proto` es `https` (Req 20.1).
 */
export function isRequestOverTls(request: GatewayRequest, config: TlsTerminationConfig): boolean {
  if (request.isSecure) {
    return true;
  }
  if (config.trustForwardedProto) {
    return request.headers['x-forwarded-proto']?.toLowerCase() === 'https';
  }
  return false;
}

/**
 * Guard de terminación TLS del gateway. Devuelve `null` cuando la petición puede
 * continuar, o una respuesta de rechazo cuando debe cortarse por no venir
 * cifrada.
 *
 * Con `enforceHttps` activo, una petición no TLS se rechaza con `426 Upgrade
 * Required` (el estándar para exigir un cambio de protocolo) e indica que se
 * requiere HTTPS (Req 20.1).
 */
export function enforceTls(
  request: GatewayRequest,
  config: TlsTerminationConfig,
): GatewayResponse | null {
  if (!config.enforceHttps) {
    return null;
  }
  if (isRequestOverTls(request, config)) {
    return null;
  }
  return {
    status: 426,
    headers: { upgrade: 'TLS/1.2, HTTP/1.1' },
    body: {
      error: 'tls_required',
      message:
        'La comunicación debe realizarse sobre TLS/HTTPS; las peticiones en ' +
        'texto plano se rechazan en el borde (Req 20.1).',
    },
  };
}
