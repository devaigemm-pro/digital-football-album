/**
 * Pruebas unitarias del API Gateway del borde (Task 4.1 — Requirements: 1.2, 20.1).
 *
 * Cubren, con objetos de petición/respuesta planos (sin servidor HTTP real):
 *  - Middleware de autenticación: extracción del bearer, 401 por token
 *    ausente/malformado/firma inválida/expirado, y `userId` adjunto en éxito.
 *  - Terminación TLS: rechazo de texto plano (426), aceptación por TLS directo o
 *    por `x-forwarded-proto: https`, y desactivación del enforcement.
 *  - Limitador token bucket: ráfaga, agotamiento (429), rellenado con el tiempo
 *    y aislamiento por clave.
 *  - Enrutador: matching literal y con parámetros, método incorrecto, 404 y
 *    detección de rutas duplicadas.
 *  - Pipeline compuesto: orden TLS → rate limit → auth → routing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { signAccessToken } from '../../services/auth/tokens.js';
import { authenticateRequest, type AuthMiddlewareConfig } from './auth-middleware.js';
import { InMemoryRateLimiterStore, TokenBucketRateLimiter } from './rate-limiter.js';
import { GatewayRouter } from './router.js';
import { createTlsTerminationConfig, enforceTls, isRequestOverTls } from './tls.js';
import { ApiGateway } from './gateway.js';
import type { GatewayRequest, GatewayResponse } from './types.js';

const SECRET = 'test-secret-hs256';
const NOW = 1_000_000; // segundos epoch de referencia

function makeToken(sub: string, expEpochSeconds: number): string {
  return signAccessToken({ sub, iat: NOW - 60, exp: expEpochSeconds }, SECRET);
}

function makeRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    method: 'GET',
    path: '/album/abc/preview',
    headers: {},
    isSecure: true,
    ...overrides,
  };
}

const authConfig: AuthMiddlewareConfig = {
  accessTokenSecret: SECRET,
  now: () => NOW,
};

// ---------------------------------------------------------------------------
// Middleware de autenticación (Req 1.2)
// ---------------------------------------------------------------------------

describe('authenticateRequest', () => {
  it('acepta un access token válido y extrae el userId (sub)', async () => {
    const token = makeToken('user-123', NOW + 900);
    const result = await authenticateRequest(
      makeRequest({ headers: { authorization: `Bearer ${token}` } }),
      authConfig,
    );

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.userId).toBe('user-123');
      expect(result.expEpochSeconds).toBe(NOW + 900);
    }
  });

  it('rechaza con 401 cuando falta el encabezado Authorization', async () => {
    const result = await authenticateRequest(makeRequest({ headers: {} }), authConfig);
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers?.['www-authenticate']).toBe('Bearer');
      expect(result.response.body).toMatchObject({ reason: 'missing_authorization' });
    }
  });

  it('rechaza con 401 cuando el encabezado no usa el esquema Bearer', async () => {
    const result = await authenticateRequest(
      makeRequest({ headers: { authorization: 'Basic Zm9vOmJhcg==' } }),
      authConfig,
    );
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.body).toMatchObject({ reason: 'malformed_authorization' });
    }
  });

  it('rechaza con 401 un token con firma inválida', async () => {
    const token = makeToken('user-123', NOW + 900);
    const result = await authenticateRequest(
      makeRequest({ headers: { authorization: `Bearer ${token}` } }),
      { accessTokenSecret: 'otro-secreto', now: () => NOW },
    );
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.body).toMatchObject({ reason: 'bad_signature' });
    }
  });

  it('rechaza con 401 un token expirado', async () => {
    const token = makeToken('user-123', NOW - 1);
    const result = await authenticateRequest(
      makeRequest({ headers: { authorization: `Bearer ${token}` } }),
      authConfig,
    );
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.body).toMatchObject({ reason: 'expired' });
    }
  });

  it('rechaza con 401 un token malformado (no es un JWT)', async () => {
    const result = await authenticateRequest(
      makeRequest({ headers: { authorization: 'Bearer no-es-un-jwt' } }),
      authConfig,
    );
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.body).toMatchObject({ reason: 'malformed' });
    }
  });
});

// ---------------------------------------------------------------------------
// Terminación TLS (Req 20.1)
// ---------------------------------------------------------------------------

describe('terminación TLS', () => {
  it('acepta una petición que llega por TLS directo', () => {
    const config = createTlsTerminationConfig();
    expect(isRequestOverTls(makeRequest({ isSecure: true }), config)).toBe(true);
    expect(enforceTls(makeRequest({ isSecure: true }), config)).toBeNull();
  });

  it('rechaza con 426 una petición en texto plano (sin TLS)', () => {
    const config = createTlsTerminationConfig();
    const rejection = enforceTls(makeRequest({ isSecure: false, headers: {} }), config);
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(426);
    expect(rejection?.body).toMatchObject({ error: 'tls_required' });
  });

  it('acepta por x-forwarded-proto: https cuando se confía en el proxy', () => {
    const config = createTlsTerminationConfig({ trustForwardedProto: true });
    const request = makeRequest({ isSecure: false, headers: { 'x-forwarded-proto': 'https' } });
    expect(isRequestOverTls(request, config)).toBe(true);
    expect(enforceTls(request, config)).toBeNull();
  });

  it('ignora x-forwarded-proto cuando NO se confía en el proxy', () => {
    const config = createTlsTerminationConfig({ trustForwardedProto: false });
    const request = makeRequest({ isSecure: false, headers: { 'x-forwarded-proto': 'https' } });
    expect(isRequestOverTls(request, config)).toBe(false);
    expect(enforceTls(request, config)?.status).toBe(426);
  });

  it('no rechaza cuando enforceHttps está desactivado', () => {
    const config = createTlsTerminationConfig({ enforceHttps: false });
    expect(enforceTls(makeRequest({ isSecure: false }), config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Limitador de tasa token bucket
// ---------------------------------------------------------------------------

describe('TokenBucketRateLimiter', () => {
  let clock: number;
  const now = (): number => clock;

  beforeEach(() => {
    clock = 0;
  });

  it('admite hasta `burst` peticiones en ráfaga y luego rechaza con 429/Retry-After', () => {
    const limiter = new TokenBucketRateLimiter({ burst: 3, refillPerSecond: 1, now });

    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(true);

    const rejected = limiter.consume('ip-1');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('rellena fichas con el paso del tiempo', () => {
    const limiter = new TokenBucketRateLimiter({ burst: 2, refillPerSecond: 1, now });
    limiter.consume('ip-1');
    limiter.consume('ip-1');
    expect(limiter.consume('ip-1').allowed).toBe(false);

    // Tras 1 segundo se repone 1 ficha.
    clock += 1000;
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(false);
  });

  it('no excede la capacidad al rellenar tras una inactividad larga', () => {
    const limiter = new TokenBucketRateLimiter({ burst: 2, refillPerSecond: 5, now });
    limiter.consume('ip-1');
    limiter.consume('ip-1');
    clock += 60_000; // mucho tiempo: no debe superar burst=2
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(false);
  });

  it('aísla los cubos por clave (cliente/usuario)', () => {
    const limiter = new TokenBucketRateLimiter({ burst: 1, refillPerSecond: 1, now });
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(false);
    // Otra clave conserva su propia ráfaga.
    expect(limiter.consume('ip-2').allowed).toBe(true);
  });

  it('usa el almacén inyectado', () => {
    const store = new InMemoryRateLimiterStore();
    const limiter = new TokenBucketRateLimiter({ burst: 1, refillPerSecond: 1, now, store });
    limiter.consume('ip-1');
    expect(store.get('ip-1')).toBeDefined();
  });

  it('valida la configuración', () => {
    expect(() => new TokenBucketRateLimiter({ burst: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new TokenBucketRateLimiter({ burst: 1, refillPerSecond: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Enrutador
// ---------------------------------------------------------------------------

describe('GatewayRouter', () => {
  const handler = (): GatewayResponse => ({ status: 200 });

  it('resuelve rutas literales por método y path', () => {
    const router = new GatewayRouter().get('/entitlements', handler);
    expect(router.resolve('GET', '/entitlements')).not.toBeNull();
    expect(router.resolve('POST', '/entitlements')).toBeNull();
    expect(router.resolve('GET', '/otra')).toBeNull();
  });

  it('captura parámetros de path', () => {
    const router = new GatewayRouter().get('/album/:temporadaId/preview', handler);
    const match = router.resolve('GET', '/album/temp-42/preview');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ temporadaId: 'temp-42' });
  });

  it('decodifica parámetros percent-encoded', () => {
    const router = new GatewayRouter().put('/usuario/club/:clubId', handler);
    const match = router.resolve('PUT', '/usuario/club/club%20a');
    expect(match?.params).toEqual({ clubId: 'club a' });
  });

  it('no casa cuando difiere el número de segmentos', () => {
    const router = new GatewayRouter().get('/album/:id/preview', handler);
    expect(router.resolve('GET', '/album/1')).toBeNull();
    expect(router.resolve('GET', '/album/1/preview/extra')).toBeNull();
  });

  it('detecta rutas duplicadas', () => {
    const router = new GatewayRouter().get('/a', handler);
    expect(() => router.get('/a', handler)).toThrow(/duplicada/);
  });
});

// ---------------------------------------------------------------------------
// Pipeline compuesto (ApiGateway)
// ---------------------------------------------------------------------------

describe('ApiGateway.handle', () => {
  function makeGateway(): ApiGateway {
    const router = new GatewayRouter().get('/album/:temporadaId/preview', (ctx) => ({
      status: 200,
      body: { userId: ctx.userId, path: ctx.request.path },
    }));
    return new ApiGateway({
      router,
      auth: authConfig,
      rateLimiter: new TokenBucketRateLimiter({ burst: 5, refillPerSecond: 5, now: () => 0 }),
    });
  }

  it('flujo feliz: TLS + rate limit + auth + routing entrega al handler con userId', async () => {
    const token = makeToken('user-9', NOW + 900);
    const res = await makeGateway().handle(
      makeRequest({
        isSecure: true,
        headers: { authorization: `Bearer ${token}` },
        path: '/album/temp-1/preview',
        clientId: 'ip-x',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'user-9', path: '/album/temp-1/preview' });
  });

  it('rechaza texto plano con 426 antes de autenticar', async () => {
    const res = await makeGateway().handle(makeRequest({ isSecure: false, headers: {} }));
    expect(res.status).toBe(426);
  });

  it('rechaza con 401 cuando el token falta (tras pasar TLS y rate limit)', async () => {
    const res = await makeGateway().handle(makeRequest({ isSecure: true, headers: {} }));
    expect(res.status).toBe(401);
  });

  it('devuelve 404 cuando no hay ruta para el path autenticado', async () => {
    const token = makeToken('user-9', NOW + 900);
    const res = await makeGateway().handle(
      makeRequest({
        isSecure: true,
        headers: { authorization: `Bearer ${token}` },
        path: '/no-existe',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('aplica el límite de tasa antes de autenticar (429 por clave de cliente)', async () => {
    const router = new GatewayRouter().get('/x', () => ({ status: 200 }));
    const gateway = new ApiGateway({
      router,
      auth: authConfig,
      rateLimiter: new TokenBucketRateLimiter({ burst: 1, refillPerSecond: 1, now: () => 0 }),
    });
    // Sin token: la primera consume la ficha y llega a auth (401);
    // la segunda se corta antes por rate limit (429).
    const first = await gateway.handle(
      makeRequest({ isSecure: true, headers: {}, path: '/x', clientId: 'ip-1' }),
    );
    expect(first.status).toBe(401);
    const second = await gateway.handle(
      makeRequest({ isSecure: true, headers: {}, path: '/x', clientId: 'ip-1' }),
    );
    expect(second.status).toBe(429);
    expect(second.headers?.['retry-after']).toBeDefined();
  });
});
