// Pruebas del presentador de captura (Task 28.1 — Req 3.1, 3.2, 3.3 + 24.2).
//
// Cubren:
//  - galeria requiere ALMACENAMIENTO y camara requiere CAMARA (Req 24.2):
//    se asegura el permiso correcto según la fuente antes de subir.
//  - un permiso denegado bloquea la subida (no se llama al backend) (Req 24.2).
//  - múltiples subidas para el mismo partido pasan al backend (Req 3.3).
//
// Usan el shim central de Jest (app/src/testing/jest-globals.d.ts): las
// comprobaciones de instancia síncronas usan `expect(x instanceof Y).toBe(true)`.

import type { Foto, Momento, Recuadro, UUID } from '../../../src/domain/types';
import type {
  CaptureClient,
  MomentoContextoInput,
  UploadFotoInput,
} from '../viewmodels';
import {
  EstadoPermiso,
  InMemoryPermissionStore,
  Permiso,
  PermisoNoConcedidoError,
  PermissionGate,
} from '../permissions';
import type { PermissionPrompt } from '../permissions';
import { CapturePresenter, permisoParaFuente } from './index';

const PARTIDO_ID = '11111111-1111-4111-8111-111111111111' as UUID;

/** Cliente de captura doble que registra las subidas y devuelve una Foto fija. */
class FakeCaptureClient implements CaptureClient {
  readonly uploads: Array<{ partidoId: UUID; input: UploadFotoInput }> = [];
  private seq = 0;

  uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto> {
    this.uploads.push({ partidoId, input });
    this.seq += 1;
    const foto: Foto = {
      id: `foto-${this.seq}` as UUID,
      momentoId: '33333333-3333-4333-8333-333333333333' as UUID,
      objectKey: `fotos/${this.seq}.jpg`,
      anchoPx: input.anchoPx,
      altoPx: input.altoPx,
      estadoAsociacion: 'ASOCIADA',
    };
    return Promise.resolve(foto);
  }

  setFotoPrincipal(recuadroId: UUID, _fotoId: UUID): Promise<Recuadro> {
    return Promise.reject(new Error(`no usado en estas pruebas (${recuadroId})`));
  }

  updateMomento(momentoId: UUID, _patch: MomentoContextoInput): Promise<Momento> {
    return Promise.reject(new Error(`no usado en estas pruebas (${momentoId})`));
  }
}

/** Prompt del sistema doble que responde según un mapa y registra lo pedido. */
function fakePrompt(
  respuestas: Partial<Record<Permiso, boolean>>,
  registro?: Permiso[],
): PermissionPrompt {
  return (permiso: Permiso) => {
    registro?.push(permiso);
    return respuestas[permiso] ?? false;
  };
}

const fotoGaleria: Omit<Parameters<CapturePresenter['capturePhoto']>[0], 'partidoId'> = {
  fuente: 'galeria',
  binario: new Uint8Array([1, 2, 3]),
  anchoPx: 3000,
  altoPx: 4000,
};

describe('permisoParaFuente (Req 24.2)', () => {
  it('galeria → ALMACENAMIENTO, camara → CAMARA', () => {
    expect(permisoParaFuente('galeria')).toBe(Permiso.ALMACENAMIENTO);
    expect(permisoParaFuente('camara')).toBe(Permiso.CAMARA);
  });
});

describe('CapturePresenter.capturePhoto — permiso por fuente (Req 24.2)', () => {
  it('galeria: asegura ALMACENAMIENTO y sube la foto', async () => {
    const client = new FakeCaptureClient();
    const store = new InMemoryPermissionStore();
    const pedidos: Permiso[] = [];
    const gate = new PermissionGate(
      store,
      fakePrompt({ [Permiso.ALMACENAMIENTO]: true }, pedidos),
    );
    const presenter = new CapturePresenter(client, gate);

    const foto = await presenter.capturePhoto({ ...fotoGaleria, partidoId: PARTIDO_ID });

    expect(pedidos).toEqual([Permiso.ALMACENAMIENTO]);
    expect(client.uploads).toHaveLength(1);
    expect(client.uploads[0]?.partidoId).toBe(PARTIDO_ID);
    expect(client.uploads[0]?.input.fuente).toBe('galeria');
    expect(foto.id).toBe('foto-1');
  });

  it('camara: asegura CAMARA y sube la foto', async () => {
    const client = new FakeCaptureClient();
    const store = new InMemoryPermissionStore();
    const pedidos: Permiso[] = [];
    const gate = new PermissionGate(
      store,
      fakePrompt({ [Permiso.CAMARA]: true }, pedidos),
    );
    const presenter = new CapturePresenter(client, gate);

    await presenter.capturePhoto({
      ...fotoGaleria,
      fuente: 'camara',
      partidoId: PARTIDO_ID,
    });

    expect(pedidos).toEqual([Permiso.CAMARA]);
    expect(client.uploads[0]?.input.fuente).toBe('camara');
  });
});

describe('CapturePresenter.capturePhoto — permiso denegado bloquea (Req 24.2)', () => {
  it('si se deniega el permiso, NO sube la foto y cancela', async () => {
    const client = new FakeCaptureClient();
    const store = new InMemoryPermissionStore();
    const gate = new PermissionGate(store, fakePrompt({ [Permiso.CAMARA]: false }));
    const presenter = new CapturePresenter(client, gate);

    let capturado: unknown;
    try {
      await presenter.capturePhoto({
        ...fotoGaleria,
        fuente: 'camara',
        partidoId: PARTIDO_ID,
      });
    } catch (e) {
      capturado = e;
    }

    expect(capturado instanceof PermisoNoConcedidoError).toBe(true);
    expect(client.uploads).toHaveLength(0); // no se llamó al backend.
    expect(gate.getEstado(Permiso.CAMARA)).toBe(EstadoPermiso.DENEGADO);
  });
});

describe('CapturePresenter.capturePhotos — varias fotos por partido (Req 3.3)', () => {
  it('sube múltiples fotos al mismo partido y devuelve todas', async () => {
    const client = new FakeCaptureClient();
    const store = new InMemoryPermissionStore({
      [Permiso.ALMACENAMIENTO]: EstadoPermiso.CONCEDIDO,
    });
    const gate = new PermissionGate(store, fakePrompt({}));
    const presenter = new CapturePresenter(client, gate);

    const fotos = await presenter.capturePhotos(PARTIDO_ID, [
      { fuente: 'galeria', binario: new Uint8Array([1]), anchoPx: 3000, altoPx: 4000 },
      { fuente: 'galeria', binario: new Uint8Array([2]), anchoPx: 3200, altoPx: 4200 },
      { fuente: 'galeria', binario: new Uint8Array([3]), anchoPx: 3400, altoPx: 4400 },
    ]);

    expect(fotos).toHaveLength(3);
    expect(client.uploads).toHaveLength(3);
    // Todas asociadas al MISMO partido (Req 3.3, backend Req 5.3/5.4).
    expect(client.uploads.every((u) => u.partidoId === PARTIDO_ID)).toBe(true);
    expect(fotos.map((f) => f.id)).toEqual(['foto-1', 'foto-2', 'foto-3']);
  });

  it('acepta un CaptureViewModel ya construido además de un CaptureClient', async () => {
    // Verifica el discriminador del constructor (instanceof CaptureViewModel).
    const { CaptureViewModel } = await import('../viewmodels');
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);
    const store = new InMemoryPermissionStore({
      [Permiso.CAMARA]: EstadoPermiso.CONCEDIDO,
    });
    const gate = new PermissionGate(store, fakePrompt({}));
    const presenter = new CapturePresenter(vm, gate);

    await presenter.capturePhoto({
      ...fotoGaleria,
      fuente: 'camara',
      partidoId: PARTIDO_ID,
    });

    expect(client.uploads).toHaveLength(1);
  });
});
