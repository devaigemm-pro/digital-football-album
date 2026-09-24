/**
 * Pruebas unitarias del gestor de permisos del dispositivo (Task 20.1 —
 * Requirements: 5.8, 6.3, 20.3, 20.4).
 *
 * Cubren el flujo GDPR/CCPA sobre un `InMemoryPermissionStore`:
 *  - request → grant → use OK (solicitar antes de usar; usar tras conceder).
 *  - use sin conceder (NO_SOLICITADO) queda bloqueado y no usa el recurso.
 *  - request denegado deja el permiso en DENEGADO y el use queda bloqueado.
 *  - revoke → un use posterior cesa el uso del recurso (Req 20.4).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EstadoPermiso,
  InMemoryPermissionStore,
  PermisoNoConcedidoError,
  PermissionManager,
  Permiso,
} from './permissions.js';

function makeManager(concede: boolean): {
  manager: PermissionManager;
  store: InMemoryPermissionStore;
} {
  const store = new InMemoryPermissionStore();
  const manager = new PermissionManager(store, () => concede);
  return { manager, store };
}

describe('InMemoryPermissionStore', () => {
  it('inicia todos los permisos en NO_SOLICITADO', () => {
    const store = new InMemoryPermissionStore();
    expect(store.get(Permiso.CAMARA)).toBe(EstadoPermiso.NO_SOLICITADO);
    expect(store.get(Permiso.ALMACENAMIENTO)).toBe(EstadoPermiso.NO_SOLICITADO);
    expect(store.get(Permiso.GEOLOCALIZACION)).toBe(EstadoPermiso.NO_SOLICITADO);
  });
});

describe('PermissionManager.requestPermission', () => {
  it('concede el permiso cuando el usuario acepta (Req 20.3)', async () => {
    const { manager } = makeManager(true);

    const estado = await manager.requestPermission(Permiso.CAMARA);

    expect(estado).toBe(EstadoPermiso.CONCEDIDO);
    expect(manager.isConcedido(Permiso.CAMARA)).toBe(true);
  });

  it('deniega el permiso cuando el usuario rechaza', async () => {
    const { manager } = makeManager(false);

    const estado = await manager.requestPermission(Permiso.GEOLOCALIZACION);

    expect(estado).toBe(EstadoPermiso.DENEGADO);
    expect(manager.isConcedido(Permiso.GEOLOCALIZACION)).toBe(false);
  });

  it('no vuelve a pedir un permiso ya concedido (evita prompts redundantes)', async () => {
    const store = new InMemoryPermissionStore({
      [Permiso.ALMACENAMIENTO]: EstadoPermiso.CONCEDIDO,
    });
    const prompt = vi.fn(() => true);
    const manager = new PermissionManager(store, prompt);

    const estado = await manager.requestPermission(Permiso.ALMACENAMIENTO);

    expect(estado).toBe(EstadoPermiso.CONCEDIDO);
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('PermissionManager.useResource', () => {
  it('request → grant → use ejecuta la acción del recurso', async () => {
    const { manager } = makeManager(true);
    await manager.requestPermission(Permiso.CAMARA);

    const resultado = manager.useResource(Permiso.CAMARA, () => 'foto-capturada');

    expect(resultado).toBe('foto-capturada');
  });

  it('bloquea el uso si el permiso no se ha solicitado (Req 5.8, 6.3)', () => {
    const { manager } = makeManager(true);
    const usar = vi.fn(() => 'recurso');

    expect(() => manager.useResource(Permiso.ALMACENAMIENTO, usar)).toThrow(
      PermisoNoConcedidoError,
    );
    expect(usar).not.toHaveBeenCalled();
  });

  it('bloquea el uso si el permiso fue denegado', async () => {
    const { manager } = makeManager(false);
    await manager.requestPermission(Permiso.GEOLOCALIZACION);
    const usar = vi.fn(() => 'ubicacion');

    expect(() => manager.useResource(Permiso.GEOLOCALIZACION, usar)).toThrow(
      PermisoNoConcedidoError,
    );
    expect(usar).not.toHaveBeenCalled();
  });
});

describe('PermissionManager.revokePermission (Req 20.4)', () => {
  it('un use posterior a la revocación cesa el uso del recurso', async () => {
    const { manager } = makeManager(true);
    await manager.requestPermission(Permiso.CAMARA);
    // Antes de revocar, el uso está permitido.
    expect(manager.useResource(Permiso.CAMARA, () => 'ok')).toBe('ok');

    manager.revokePermission(Permiso.CAMARA);

    expect(manager.getEstado(Permiso.CAMARA)).toBe(EstadoPermiso.DENEGADO);
    const usar = vi.fn(() => 'no-deberia-usarse');
    expect(() => manager.useResource(Permiso.CAMARA, usar)).toThrow(PermisoNoConcedidoError);
    expect(usar).not.toHaveBeenCalled();
  });
});
