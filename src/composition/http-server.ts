// Adaptador HTTP de Node para el `ApiGateway`.
//
// El `ApiGateway` es agnóstico del framework: opera sobre `GatewayRequest` /
// `GatewayResponse` planos. Este módulo traduce el `http.IncomingMessage` /
// `ServerResponse` nativos de Node a esos tipos y de vuelta, de modo que el
// gateway pueda atender tráfico HTTP real. No añade lógica de negocio.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ApiGateway } from '../api/gateway/gateway.js';
import type { GatewayRequest, GatewayResponse, HttpMethod } from '../api/gateway/types.js';
import type { Logger } from './logger.js';

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Lee el cuerpo completo de la petición (con tope de tamaño) y lo devuelve como texto. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Normaliza las cabeceras de Node (que pueden ser string | string[]) a Record<string,string>. */
function normalizeHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/** Convierte un `IncomingMessage` (ya con el body leído) en un `GatewayRequest`. */
function toGatewayRequest(
  req: IncomingMessage,
  rawBody: string,
  trustForwardedProto: boolean,
): GatewayRequest {
  const headers = normalizeHeaders(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = (req.method ?? 'GET').toUpperCase();
  const httpMethod = (HTTP_METHODS as readonly string[]).includes(method)
    ? (method as HttpMethod)
    : 'GET';

  // TLS: en un despliegue real lo fija el proxy vía x-forwarded-proto, o el
  // socket. Aquí lo derivamos de la cabecera cuando se confía en el proxy.
  const forwardedProto = headers['x-forwarded-proto'];
  const isSecure =
    (trustForwardedProto && forwardedProto === 'https') ||
    (req.socket as { encrypted?: boolean }).encrypted === true;

  let body: unknown;
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody; // cuerpo no-JSON: se pasa como texto crudo
    }
  }

  const clientId = req.socket.remoteAddress;
  const base = {
    method: httpMethod,
    path: url.pathname,
    headers,
    isSecure,
    body,
  };
  // `exactOptionalPropertyTypes`: solo incluir clientId si está definido.
  return clientId === undefined ? base : { ...base, clientId };
}

/** Escribe un `GatewayResponse` en el `ServerResponse` de Node. */
function writeResponse(res: ServerResponse, gwRes: GatewayResponse): void {
  const headers = { ...(gwRes.headers ?? {}) };
  let payload = '';
  if (gwRes.body !== undefined) {
    payload = typeof gwRes.body === 'string' ? gwRes.body : JSON.stringify(gwRes.body);
    if (headers['content-type'] === undefined) {
      headers['content-type'] = 'application/json';
    }
  }
  res.writeHead(gwRes.status, headers);
  res.end(payload);
}

/** Opciones del servidor HTTP. */
export interface HttpServerOptions {
  /** Tamaño máximo del cuerpo en bytes. Por defecto 1 MiB. */
  readonly maxBodyBytes?: number;
  /** Confía en `x-forwarded-proto` para derivar TLS. Por defecto true. */
  readonly trustForwardedProto?: boolean;
  /** Logger para trazar peticiones. Si se omite, no se registra nada. */
  readonly logger?: Logger;
}

/**
 * Crea un servidor HTTP de Node que delega cada petición en `gateway.handle`.
 * No llama a `listen`; el llamador decide el puerto y el ciclo de vida.
 */
export function createHttpServer(gateway: ApiGateway, options: HttpServerOptions = {}): Server {
  const maxBytes = options.maxBodyBytes ?? 1024 * 1024;
  const trustForwardedProto = options.trustForwardedProto ?? true;
  const logger = options.logger;

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const startedAt = Date.now();
    void (async () => {
      let status = 500;
      try {
        const rawBody = await readBody(req, maxBytes);
        const gwReq = toGatewayRequest(req, rawBody, trustForwardedProto);
        const gwRes = await gateway.handle(gwReq);
        status = gwRes.status;
        writeResponse(res, gwRes);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error';
        status = message === 'payload_too_large' ? 413 : 500;
        writeResponse(res, {
          status,
          body: { error: status === 413 ? 'payload_too_large' : 'internal_error' },
        });
      } finally {
        if (logger) {
          const durationMs = Date.now() - startedAt;
          // Path sin querystring, sin cuerpos ni cabeceras (evita registrar secretos).
          const path = (req.url ?? '/').split('?')[0];
          const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
          logger[level]('http_request', {
            method: req.method,
            path,
            status,
            durationMs,
          });
        }
      }
    })();
  });
}
