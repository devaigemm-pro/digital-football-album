// Pruebas del flujo de permisos del cliente (Task 28.3 — Requerimiento 24).
//
// Cubren:
//  - request → grant → use ok (Req 24.1, 24.2): explica el motivo, solicita,
//    concede y ejecuta la acción sobre el recurso.
//  - use-without-grant blocked (Req 24.2): si el usuario deniega, la acción no
//    se ejecuta y se cancela con PermisoNoConcedidoError.
//  - revoke → use ceases (Req 24.4): tras revocar, un uso posterior deja de
//    ejecutar la acción si el usuario no reconcede.
//
// Usan el shim central de Jest (app/src/testing/jest-globals.d.ts): las
// comprobaciones de instancia síncronas se hacen con
// `expect(x instanceof Y).toBe(true)`.

import {
  EstadoPermiso,
  InMemoryPermissionStore,
  MOTIVOS_PERMISO,
  Permiso,
  PermisoNoConcedidoError,
  PermissionGate,
} from './index';
import type { PermissionPrompt } from './index';

/** Prompt del sistema doble: responde según un mapa fijo y registra lo pedido. */
function fakePrompt(
  respuestas: Partial<Record<Permiso, boolean>>,
  registro?: Permiso[],
): PermissionPrompt {
  return (permiso: Permiso) => {
    registro?.push(permiso);
    return respuestas[permiso] ?? false;
  };
}

describe('PermissionGate.ensure (Req 24.1, 24.2, 24.3)', () => {
  it('explica el motivo y solicita el permiso antes de concederlo', async () => {
    const store = new InMemoryPermissionStore();
    const pedidos: Permiso[] = [];
    const explicados: Array<{ permiso: Permiso; motivo: string }> = [];
    const gate = new PermissionGate(
      store,
      fakePrompt({ [Permiso.CAMARA]: true }, pedidos),
      { explainer: (permiso, motivo) => void explicados.push({ permiso, motivo }) },
    );

    const res = await gate.ensure(Permiso.CAMARA);

    // Se explicó el motivo (Req 24.1) ANTES del prompt del sistema.
    expect(explicados).toEqual([
      { permiso: Permiso.CAMARA, motivo: MOTIVOS_PERMISO[Permiso.CAMARA] },
    ]);
    expect(pedidos).toEqual([Permiso.CAMARA]);
    expect(res.concedido).toBe(true);
    expect(res.solicitado).toBe(true);
    expect(res.estado).toBe(EstadoPermiso.CONCEDIDO);
    expect(gate.isConcedido(Permiso.CAMARA)).toBe(true);
  });

  it('no vuelve a solicitar ni explicar si ya está concedido', async () => {
    const store = new InMemoryPermissionStore({
      [Permiso.ALMACENAMIENTO]: EstadoPermiso.CONCEDIDO,
    });
    const pedidos: Permiso[] = [];
    let explicaciones = 0;
    const gate = new PermissionGate(
      store,
      fakePrompt({}, pedidos),
      { explainer: () => void (explicaciones += 1) },
    );

    const res = await gate.ensure(Permiso.ALMACENAMIENTO);

    expect(res.concedido).toBe(true);
    expect(res.solicitado).toBe(false);
    expect(pedidos).toHaveLength(0);
    expect(explicaciones).toBe(0);
  });
});

describe('PermissionGate.runWithPermission (Req 24.2)', () => {
  it('request → grant → use: ejecuta la acción cuando se concede', async () => {
    const store = new InMemoryPermissionStore();
    const gate = new PermissionGate(store, fakePrompt({ [Permiso.CAMARA]: true }));
    let ejecutado = false;

    const resultado = await gate.runWithPermission(Permiso.CAMARA, () => {
      ejecutado = true;
      return 'foto-tomada';
    });

    expect(ejecutado).toBe(true);
    expect(resultado).toBe('foto-tomada');
  });

  it('use-without-grant: si se deniega, NO ejecuta la acción y cancela', async () => {
    const store = new InMemoryPermissionStore();
    const gate = new PermissionGate(store, fakePrompt({ [Permiso.ALMACENAMIENTO]: false }));
    let ejecutado = false;

    let capturado: unknown;
    try {
      await gate.runWithPermission(Permiso.ALMACENAMIENTO, () => {
        ejecutado = true;
      });
    } catch (e) {
      capturado = e;
    }

    expect(ejecutado).toBe(false);
    expect(capturado instanceof PermisoNoConcedidoError).toBe(true);
    expect((capturado as PermisoNoConcedidoError).permiso).toBe(Permiso.ALMACENAMIENTO);
    expect(gate.getEstado(Permiso.ALMACENAMIENTO)).toBe(EstadoPermiso.DENEGADO);
  });
});

describe('PermissionGate.revoke (Req 24.4)', () => {
  it('revoke → use cesa: tras revocar, un uso posterior deja de ejecutarse', async () => {
    const store = new InMemoryPermissionStore();
    // El usuario concede primero y luego (tras revocar) no reconcede.
    const respuestas: Record<string, boolean> = { primera: true, segunda: false };
    let llamada = 0;
    const prompt: PermissionPrompt = () => {
      llamada += 1;
      return llamada === 1 ? respuestas.primera : respuestas.segunda;
    };
    const gate = new PermissionGate(store, prompt);

    let usos = 0;
    // Primer uso: concede y ejecuta.
    await gate.runWithPermission(Permiso.CAMARA, () => void (usos += 1));
    expect(usos).toBe(1);

    // El usuario revoca el permiso (Req 24.4).
    gate.revoke(Permiso.CAMARA);
    expect(gate.getEstado(Permiso.CAMARA)).toBe(EstadoPermiso.DENEGADO);

    // Segundo uso: re-solicita, el usuario no reconcede → no ejecuta y cancela.
    let capturado: unknown;
    try {
      await gate.runWithPermission(Permiso.CAMARA, () => void (usos += 1));
    } catch (e) {
      capturado = e;
    }
    expect(capturado instanceof PermisoNoConcedidoError).toBe(true);
    expect(usos).toBe(1); // el uso del recurso cesó tras la revocación.
  });
});
