// Pruebas de la capa PURA de configuración (`resolveConfig`).
//
// Verifican la validación de las variables obligatorias y de TLS, incluyendo las
// nuevas de Supabase Auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) que la app usa
// para autenticar directamente contra Supabase (docs/FRONTEND_INTEGRATION.md).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo (misma convención que el resto de tests).

import { ConfigError, resolveConfig } from './env';

/** Variables crudas válidas mínimas para un `resolveConfig` exitoso. */
const RAW_OK: Record<string, string | undefined> = {
  APP_ENV: 'production',
  API_BASE_URL: 'https://album-backend-smr4.onrender.com',
  SUPABASE_URL: 'https://nliltolgmocerrwhjivi.supabase.co',
  SUPABASE_ANON_KEY: 'anon-public-key',
};

describe('resolveConfig', () => {
  it('resuelve la configuración con las variables obligatorias válidas', () => {
    const config = resolveConfig(RAW_OK);
    expect(config.environment).toBe('production');
    expect(config.apiBaseUrl).toBe('https://album-backend-smr4.onrender.com');
    expect(config.supabaseUrl).toBe('https://nliltolgmocerrwhjivi.supabase.co');
    expect(config.supabaseAnonKey).toBe('anon-public-key');
    expect(config.googleWebClientId).toBe('');
    expect(config.iosUrlScheme).toBe('');
  });

  it('normaliza SUPABASE_URL quitando la barra final', () => {
    const config = resolveConfig({
      ...RAW_OK,
      SUPABASE_URL: 'https://proj.supabase.co/',
    });
    expect(config.supabaseUrl).toBe('https://proj.supabase.co');
  });

  it('lanza ConfigError si falta SUPABASE_URL', () => {
    const raw = { ...RAW_OK, SUPABASE_URL: undefined };
    expect(() => resolveConfig(raw)).toThrow(ConfigError);
  });

  it('lanza ConfigError si SUPABASE_URL no viaja sobre TLS', () => {
    expect(() =>
      resolveConfig({ ...RAW_OK, SUPABASE_URL: 'http://proj.supabase.co' }),
    ).toThrow(ConfigError);
  });

  it('lanza ConfigError si falta SUPABASE_ANON_KEY', () => {
    const raw = { ...RAW_OK, SUPABASE_ANON_KEY: undefined };
    expect(() => resolveConfig(raw)).toThrow(ConfigError);
  });

  it('sigue exigiendo API_BASE_URL con TLS', () => {
    expect(() =>
      resolveConfig({ ...RAW_OK, API_BASE_URL: 'http://insecure.example.com' }),
    ).toThrow(ConfigError);
  });
});
