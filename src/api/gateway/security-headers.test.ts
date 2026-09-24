// Pruebas de CORS y cabeceras de seguridad del borde.

import { describe, expect, it } from 'vitest';
import {
  buildSecurityHeaders,
  handlePreflight,
  type EdgeSecurityConfig,
} from './security-headers.js';
import type { GatewayRequest } from './types.js';

function req(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    method: 'GET',
    path: '/x',
    headers: {},
    isSecure: true,
    ...overrides,
  };
}

describe('buildSecurityHeaders', () => {
  it('incluye cabeceras de endurecimiento y HSTS bajo TLS', () => {
    const h = buildSecurityHeaders(req(), { allowedOrigins: '*' });
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['strict-transport-security']).toContain('max-age=');
  });

  it('no añade HSTS si la petición no es segura', () => {
    const h = buildSecurityHeaders(req({ isSecure: false }), {
      allowedOrigins: '*',
    });
    expect(h['strict-transport-security']).toBeUndefined();
  });

  it('refleja el origen permitido de una lista', () => {
    const config: EdgeSecurityConfig = {
      allowedOrigins: ['https://app.example.com'],
      allowCredentials: true,
    };
    const h = buildSecurityHeaders(req({ headers: { origin: 'https://app.example.com' } }), config);
    expect(h['access-control-allow-origin']).toBe('https://app.example.com');
    expect(h['access-control-allow-credentials']).toBe('true');
  });

  it('no emite CORS para un origen no permitido', () => {
    const h = buildSecurityHeaders(req({ headers: { origin: 'https://malicioso.com' } }), {
      allowedOrigins: ['https://app.example.com'],
    });
    expect(h['access-control-allow-origin']).toBeUndefined();
  });
});

describe('handlePreflight', () => {
  const config: EdgeSecurityConfig = {
    allowedOrigins: ['https://app.example.com'],
  };

  it('devuelve 204 con cabeceras para un preflight de origen permitido', () => {
    const res = handlePreflight(
      req({ method: 'OPTIONS', headers: { origin: 'https://app.example.com' } }),
      config,
    );
    expect(res?.status).toBe(204);
    expect(res?.headers?.['access-control-allow-methods']).toContain('POST');
  });

  it('rechaza con 403 un preflight de origen no permitido', () => {
    const res = handlePreflight(
      req({ method: 'OPTIONS', headers: { origin: 'https://malicioso.com' } }),
      config,
    );
    expect(res?.status).toBe(403);
  });

  it('devuelve null si no es OPTIONS', () => {
    expect(handlePreflight(req({ method: 'GET' }), config)).toBeNull();
  });
});
