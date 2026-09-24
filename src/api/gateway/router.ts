// Enrutador del API Gateway (borde).
//
// Diseño (design.md · "API Gateway (borde)"): el gateway "enruta a los
// servicios". Esta abstracción mapea rutas (método + patrón de path) a
// manejadores de servicio de backend. Soporta segmentos con parámetros de la
// forma `:nombre` (p. ej. `/album/:temporadaId/preview`) y expone los parámetros
// capturados al manejador vía el path original.
//
// Es una tabla de rutas mínima y determinista (sin dependencias de framework):
// la resolución compara el método y hace matching segmento a segmento del path.
//
// Task 4.1 — Requirements: 1.2, 20.1 (borde del gateway)

import type { HttpMethod, ServiceHandler } from './types.js';

/** Ruta registrada: método, patrón de path y manejador de servicio. */
interface RegisteredRoute {
  readonly method: HttpMethod;
  /** Segmentos del patrón, p. ej. `['album', ':temporadaId', 'preview']`. */
  readonly segments: readonly string[];
  readonly handler: ServiceHandler;
}

/**
 * Resultado de resolver una ruta: el manejador correspondiente y los parámetros
 * de path capturados (`{ temporadaId: '123' }`).
 */
export interface RouteMatch {
  readonly handler: ServiceHandler;
  readonly params: Readonly<Record<string, string>>;
}

/** Divide un path en segmentos no vacíos, normalizando barras. */
function toSegments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/**
 * Enrutador que mapea (método, patrón) → manejador. Registro explícito y
 * resolución determinista; sin efectos colaterales.
 */
export class GatewayRouter {
  private readonly routes: RegisteredRoute[] = [];

  /**
   * Registra una ruta. El `pattern` admite segmentos de parámetro con `:nombre`.
   * Lanza si se registra la misma (método + patrón) dos veces.
   */
  register(method: HttpMethod, pattern: string, handler: ServiceHandler): this {
    const segments = toSegments(pattern);
    const duplicate = this.routes.some(
      (route) => route.method === method && segmentsEqual(route.segments, segments),
    );
    if (duplicate) {
      throw new Error(`Ruta duplicada: ${method} ${pattern}`);
    }
    this.routes.push({ method, segments, handler });
    return this;
  }

  /** Azúcar para registrar rutas por método. */
  get(pattern: string, handler: ServiceHandler): this {
    return this.register('GET', pattern, handler);
  }
  post(pattern: string, handler: ServiceHandler): this {
    return this.register('POST', pattern, handler);
  }
  put(pattern: string, handler: ServiceHandler): this {
    return this.register('PUT', pattern, handler);
  }
  patch(pattern: string, handler: ServiceHandler): this {
    return this.register('PATCH', pattern, handler);
  }
  delete(pattern: string, handler: ServiceHandler): this {
    return this.register('DELETE', pattern, handler);
  }

  /**
   * Resuelve (método, path) contra las rutas registradas. Devuelve el match con
   * los parámetros capturados, o `null` si no hay coincidencia.
   */
  resolve(method: HttpMethod, path: string): RouteMatch | null {
    const pathSegments = toSegments(path);
    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }
      const params = matchSegments(route.segments, pathSegments);
      if (params !== null) {
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

/** Compara dos listas de segmentos de patrón por igualdad estructural. */
function segmentsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((segment, index) => segment === b[index]);
}

/**
 * Intenta casar los segmentos del patrón contra los del path. Devuelve los
 * parámetros capturados (`:nombre`) si casa, o `null` si no. Los segmentos
 * literales deben coincidir exactamente.
 */
function matchSegments(
  patternSegments: readonly string[],
  pathSegments: readonly string[],
): Record<string, string> | null {
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i] as string;
    const pathSegment = pathSegments[i] as string;
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }
    if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return params;
}
