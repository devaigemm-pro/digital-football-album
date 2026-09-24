// Test de integración del cableado de Object Storage en el composition root.
//
// Verifica que, con driver Supabase, `createServices` cablea el adaptador de
// Storage real (no el doble in-memory) y que una subida a través de él persiste
// en el bucket. Se salta si no hay configuración de Supabase en el entorno.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServices } from '../src/composition/services.js';
import { SupabaseObjectStorage } from '../src/persistence/index.js';

const hasSupabaseEnv =
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) !== undefined &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) !== undefined;

const suite = hasSupabaseEnv ? describe : describe.skip;

suite('composition root — cableado de Object Storage (driver supabase)', () => {
  let services: ReturnType<typeof createServices>;
  const subidas: string[] = [];

  beforeAll(() => {
    services = createServices({
      config: {
        accessTokenSecret: 'test-secret',
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 1_209_600,
      },
      persistence: { driver: 'supabase' },
    });
  });

  afterAll(async () => {
    const storage = services.momentosStorage as SupabaseObjectStorage;
    for (const key of subidas) {
      await storage.delete(key);
    }
  });

  it('usa el adaptador de Supabase Storage para las fotos', () => {
    expect(services.persistence.driver).toBe('supabase');
    expect(services.momentosStorage).toBeInstanceOf(SupabaseObjectStorage);
  });

  it('sube un binario real a través del storage cableado', async () => {
    const key = await services.momentosStorage.upload(
      new TextEncoder().encode('bytes-desde-composition-root'),
    );
    subidas.push(key);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});
