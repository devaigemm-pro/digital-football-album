// Pruebas del selector de driver de persistencia (composition root).
//
// No requieren base ni stack: verifican la resolución del driver por entorno,
// el valor por defecto y el manejo de configuración inválida/ausente. El driver
// 'supabase' se ejercita con un cliente inyectado (sin red).

import { describe, expect, it, vi } from 'vitest';
import { createRepositories } from '../src/persistence/index.js';
import type { TypedSupabaseClient } from '../src/persistence/index.js';

describe('createRepositories (selector de driver)', () => {
  it('usa el driver en memoria por defecto (sin PERSISTENCE_DRIVER)', () => {
    const ctx = createRepositories({ env: {} });
    expect(ctx.driver).toBe('memory');
    expect(ctx.repositories.clubes).toBeDefined();
    expect(ctx.supabase).toBeUndefined();
  });

  it('selecciona memoria con PERSISTENCE_DRIVER=memory', () => {
    const ctx = createRepositories({ env: { PERSISTENCE_DRIVER: 'memory' } });
    expect(ctx.driver).toBe('memory');
  });

  it('acepta el override explícito de driver', () => {
    const ctx = createRepositories({ driver: 'memory', env: {} });
    expect(ctx.driver).toBe('memory');
  });

  it('es insensible a mayúsculas en PERSISTENCE_DRIVER', () => {
    const ctx = createRepositories({ env: { PERSISTENCE_DRIVER: 'MEMORY' } });
    expect(ctx.driver).toBe('memory');
  });

  it('lanza ante un driver inválido', () => {
    expect(() => createRepositories({ env: { PERSISTENCE_DRIVER: 'mysql' } })).toThrow(
      /PERSISTENCE_DRIVER inválido/,
    );
  });

  it('arma el driver supabase reutilizando un cliente inyectado (sin red)', () => {
    // Cliente mínimo simulado: el selector solo lo pasa a los repositorios,
    // que no hacen llamadas hasta que se invoca un método.
    const fakeClient = { from: vi.fn() } as unknown as TypedSupabaseClient;
    const ctx = createRepositories({
      driver: 'supabase',
      env: {},
      supabaseClient: fakeClient,
    });
    expect(ctx.driver).toBe('supabase');
    expect(ctx.supabase).toBe(fakeClient);
    expect(ctx.repositories.temporadas).toBeDefined();
  });

  it('exige configuración de Supabase si no se inyecta cliente', () => {
    expect(() => createRepositories({ driver: 'supabase', env: {} })).toThrow(
      /Configuración de Supabase ausente/,
    );
  });
});
