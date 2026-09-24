// Pruebas de la validación de configuración (fail-fast).

import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/composition/config.js';

const baseEnv = { ACCESS_TOKEN_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('carga valores por defecto en desarrollo con secreto presente', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.port).toBe(3000);
    expect(cfg.persistence.driver).toBe('memory');
    expect(cfg.auth.supabase).toBeUndefined();
  });

  it('exige ACCESS_TOKEN_SECRET cuando no se usa Supabase Auth', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    try {
      loadConfig({});
    } catch (err) {
      expect((err as ConfigError).problemas.join(' ')).toContain('ACCESS_TOKEN_SECRET');
    }
  });

  it('rechaza PERSISTENCE_DRIVER inválido', () => {
    expect(() => loadConfig({ ...baseEnv, PERSISTENCE_DRIVER: 'mysql' })).toThrowError(
      /PERSISTENCE_DRIVER inválido/,
    );
  });

  it('exige credenciales cuando el driver es supabase', () => {
    expect(() => loadConfig({ ...baseEnv, PERSISTENCE_DRIVER: 'supabase' })).toThrowError(
      /SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('exige URL + anon key cuando AUTH_PROVIDER=supabase', () => {
    expect(() => loadConfig({ AUTH_PROVIDER: 'supabase' })).toThrowError(
      /AUTH_PROVIDER=supabase requiere/,
    );
  });

  it('acepta configuración completa de Supabase (auth + persistencia)', () => {
    const cfg = loadConfig({
      AUTH_PROVIDER: 'supabase',
      PERSISTENCE_DRIVER: 'supabase',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    expect(cfg.auth.supabase?.url).toBe('http://127.0.0.1:54321');
    expect(cfg.persistence.supabase?.key).toBe('service');
  });

  it('en producción prohíbe ALLOW_INSECURE, driver memory y secreto corto', () => {
    let problemas: string[] = [];
    try {
      loadConfig({
        NODE_ENV: 'production',
        ALLOW_INSECURE: 'true',
        PERSISTENCE_DRIVER: 'memory',
        ACCESS_TOKEN_SECRET: 'corto',
      });
    } catch (err) {
      problemas = [...(err as ConfigError).problemas];
    }
    const joined = problemas.join(' ');
    expect(joined).toContain('ALLOW_INSECURE');
    expect(joined).toContain('memory');
    expect(joined).toContain('32 caracteres');
  });

  it('acumula múltiples problemas en un solo error', () => {
    try {
      loadConfig({ PERSISTENCE_DRIVER: 'x', ACCESS_TOKEN_TTL_SECONDS: '-5' });
    } catch (err) {
      expect((err as ConfigError).problemas.length).toBeGreaterThanOrEqual(2);
    }
  });
});
