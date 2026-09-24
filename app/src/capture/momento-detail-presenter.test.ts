// Pruebas del presentador de detalle del Momento (Task 28.2 — Req 3.5, 3.8, 3.9,
// 3.13).
//
// Cubren:
//  - setFotoPrincipal delega en el cliente con los argumentos correctos y
//    devuelve el Recuadro (`PUT /recuadros/{id}/foto-principal`, Req 3.5).
//  - updateContexto envía el parche de contexto al cliente
//    (`PATCH /momentos/{id}`, Req 3.8, 3.9).
//  - normalizarContexto limpia la sub-modalidad cuando el contexto NO es
//    Transmisión (ayuda de UI; la autoridad de la regla sigue en el backend).
//  - un error de negocio del backend se SURFACEA como `MomentoBusinessError`
//    tipado que CONSERVA el mensaje del backend (NO se re-deriva la regla en el
//    cliente) — Req 3.13.
//
// Usan el shim central de Jest (app/src/testing/jest-globals.d.ts): las
// comprobaciones de instancia síncronas usan `expect(x instanceof Y).toBe(true)`.

import type {
  ContextoAsistencia,
  Foto,
  Momento,
  Recuadro,
  UUID,
} from '../../../src/domain/types';
import type {
  CaptureClient,
  MomentoContextoInput,
  UploadFotoInput,
} from '../viewmodels';
import { ClientNetworkError } from '../net/errors';
import {
  MomentoBusinessError,
  MomentoDetailPresenter,
  normalizarContexto,
} from './momento-detail-presenter';

const RECUADRO_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const FOTO_ID = '44444444-4444-4444-8444-444444444444' as UUID;
const MOMENTO_ID = '33333333-3333-4333-8333-333333333333' as UUID;

/**
 * Cliente de captura doble. Registra las llamadas a setFotoPrincipal y
 * updateMomento y permite inyectar un error de "negocio" que simula el rechazo
 * del backend (Req 3.13). `uploadFoto` no se usa en estas pruebas.
 */
class FakeCaptureClient implements CaptureClient {
  readonly principales: Array<{ recuadroId: UUID; fotoId: UUID }> = [];
  readonly patches: Array<{ momentoId: UUID; patch: MomentoContextoInput }> = [];

  /** Si se define, setFotoPrincipal rechaza con este error (backend). */
  errorSetFotoPrincipal: Error | null = null;
  /** Si se define, updateMomento rechaza con este error (backend). */
  errorUpdateMomento: Error | null = null;

  uploadFoto(partidoId: UUID, _input: UploadFotoInput): Promise<Foto> {
    return Promise.reject(new Error(`no usado en estas pruebas (${partidoId})`));
  }

  setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    if (this.errorSetFotoPrincipal) {
      return Promise.reject(this.errorSetFotoPrincipal);
    }
    this.principales.push({ recuadroId, fotoId });
    const recuadro: Recuadro = {
      id: recuadroId,
      albumId: '55555555-5555-4555-8555-555555555555' as UUID,
      partidoOficialId: '66666666-6666-4666-8666-666666666666' as UUID,
      plantillaId: '77777777-7777-4777-8777-777777777777' as UUID,
      numero: 7,
      anchoMm: 50,
      altoMm: 70,
      fotoPrincipalId: fotoId,
      estadoRecordatorio: 'DETENIDO_POR_FOTO',
    };
    return Promise.resolve(recuadro);
  }

  updateMomento(momentoId: UUID, patch: MomentoContextoInput): Promise<Momento> {
    if (this.errorUpdateMomento) {
      return Promise.reject(this.errorUpdateMomento);
    }
    this.patches.push({ momentoId, patch });
    const momento: Momento = {
      id: momentoId,
      partidoOficialId: '66666666-6666-4666-8666-666666666666' as UUID,
      contextoAsistencia: patch.contextoAsistencia ?? 'EN_VIVO_LOCAL',
      subModalidad: patch.subModalidad ?? null,
      geoVerificado: patch.geoVerificado ?? false,
      notas: patch.notas ?? '',
      jugadorDelPartido: patch.jugadorDelPartido ?? null,
    };
    return Promise.resolve(momento);
  }
}

describe('MomentoDetailPresenter.setFotoPrincipal (Req 3.5)', () => {
  it('delega en el cliente con recuadroId y fotoId y devuelve el Recuadro', async () => {
    const client = new FakeCaptureClient();
    const presenter = new MomentoDetailPresenter(client);

    const recuadro = await presenter.setFotoPrincipal(RECUADRO_ID, FOTO_ID);

    expect(client.principales).toHaveLength(1);
    expect(client.principales[0]?.recuadroId).toBe(RECUADRO_ID);
    expect(client.principales[0]?.fotoId).toBe(FOTO_ID);
    expect(recuadro.fotoPrincipalId).toBe(FOTO_ID);
  });

  it('acepta un CaptureViewModel ya construido además de un CaptureClient', async () => {
    const { CaptureViewModel } = await import('../viewmodels');
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);
    const presenter = new MomentoDetailPresenter(vm);

    await presenter.setFotoPrincipal(RECUADRO_ID, FOTO_ID);

    expect(client.principales).toHaveLength(1);
  });
});

describe('MomentoDetailPresenter.updateContexto (Req 3.8, 3.9)', () => {
  it('envía el parche de contexto (Transmisión + sub-modalidad + notas + jugador)', async () => {
    const client = new FakeCaptureClient();
    const presenter = new MomentoDetailPresenter(client);

    const patch: MomentoContextoInput = {
      contextoAsistencia: 'TRANSMISION',
      subModalidad: 'BAR',
      notas: 'Partidazo en el bar del barrio.',
      jugadorDelPartido: 'jugador-10',
    };
    const momento = await presenter.updateContexto(MOMENTO_ID, patch);

    expect(client.patches).toHaveLength(1);
    expect(client.patches[0]?.momentoId).toBe(MOMENTO_ID);
    expect(client.patches[0]?.patch.contextoAsistencia).toBe('TRANSMISION');
    expect(client.patches[0]?.patch.subModalidad).toBe('BAR');
    expect(client.patches[0]?.patch.notas).toBe('Partidazo en el bar del barrio.');
    expect(client.patches[0]?.patch.jugadorDelPartido).toBe('jugador-10');
    expect(momento.contextoAsistencia).toBe('TRANSMISION');
  });

  it('En Vivo con geolocalización: envía geoVerificado (Req 3.9)', async () => {
    const client = new FakeCaptureClient();
    const presenter = new MomentoDetailPresenter(client);

    await presenter.updateContexto(MOMENTO_ID, {
      contextoAsistencia: 'EN_VIVO_LOCAL',
      geoVerificado: true,
    });

    expect(client.patches[0]?.patch.geoVerificado).toBe(true);
  });
});

describe('normalizarContexto — ayuda de UI, autoridad en el backend (Req 3.8)', () => {
  it('limpia subModalidad cuando el contexto cambia a uno NO-Transmisión', () => {
    const patch: MomentoContextoInput = {
      contextoAsistencia: 'EN_VIVO_VISITA',
      subModalidad: 'STREAMING',
    };
    const normalizado = normalizarContexto(patch);
    expect(normalizado.subModalidad).toBeNull();
    expect(normalizado.contextoAsistencia).toBe('EN_VIVO_VISITA');
  });

  it('conserva subModalidad cuando el contexto es Transmisión', () => {
    const patch: MomentoContextoInput = {
      contextoAsistencia: 'TRANSMISION',
      subModalidad: 'TELEVISION',
    };
    expect(normalizarContexto(patch).subModalidad).toBe('TELEVISION');
  });

  it('no toca subModalidad si el parche no cambia el contexto (el backend decide)', () => {
    const patch: MomentoContextoInput = { subModalidad: 'BAR' };
    expect(normalizarContexto(patch).subModalidad).toBe('BAR');
  });

  it('updateContexto aplica la normalización antes de llamar al cliente', async () => {
    const client = new FakeCaptureClient();
    const presenter = new MomentoDetailPresenter(client);

    const contextoNoTransmision: ContextoAsistencia = 'EN_VIVO_LOCAL';
    await presenter.updateContexto(MOMENTO_ID, {
      contextoAsistencia: contextoNoTransmision,
      subModalidad: 'STREAMING',
    });

    expect(client.patches[0]?.patch.subModalidad).toBeNull();
  });
});

describe('reflejo de errores de negocio del backend (Req 3.13)', () => {
  it('setFotoPrincipal: surfacea el mensaje del backend como MomentoBusinessError', async () => {
    const client = new FakeCaptureClient();
    // El backend decide la regla (ventana de edición cerrada) y devuelve el mensaje.
    client.errorSetFotoPrincipal = new Error(
      'La Temporada está cerrada; no se puede cambiar la Foto_Principal.',
    );
    const presenter = new MomentoDetailPresenter(client);

    let capturado: unknown;
    try {
      await presenter.setFotoPrincipal(RECUADRO_ID, FOTO_ID);
    } catch (e) {
      capturado = e;
    }

    expect(capturado instanceof MomentoBusinessError).toBe(true);
    expect(capturado instanceof ClientNetworkError).toBe(true);
    const err = capturado as MomentoBusinessError;
    // El mensaje se CONSERVA tal cual del backend (no se re-deriva la regla).
    expect(err.message).toBe(
      'La Temporada está cerrada; no se puede cambiar la Foto_Principal.',
    );
    expect(err.operacion).toBe('setFotoPrincipal');
    // No se registró ninguna llamada exitosa.
    expect(client.principales).toHaveLength(0);
  });

  it('updateContexto: surfacea el mensaje del backend como MomentoBusinessError', async () => {
    const client = new FakeCaptureClient();
    client.errorUpdateMomento = new Error(
      'El Jugador_del_Partido no pertenece a la alineación del partido.',
    );
    const presenter = new MomentoDetailPresenter(client);

    let capturado: unknown;
    try {
      await presenter.updateContexto(MOMENTO_ID, {
        contextoAsistencia: 'TRANSMISION',
        jugadorDelPartido: 'jugador-inexistente',
      });
    } catch (e) {
      capturado = e;
    }

    expect(capturado instanceof MomentoBusinessError).toBe(true);
    const err = capturado as MomentoBusinessError;
    expect(err.message).toBe(
      'El Jugador_del_Partido no pertenece a la alineación del partido.',
    );
    expect(err.operacion).toBe('updateContexto');
    // La causa original se conserva para trazabilidad.
    expect(err.cause instanceof Error).toBe(true);
    expect(client.patches).toHaveLength(0);
  });

  it('usa un mensaje por defecto si el error del backend no trae texto', async () => {
    const client = new FakeCaptureClient();
    client.errorSetFotoPrincipal = new Error('');
    const presenter = new MomentoDetailPresenter(client);

    let capturado: unknown;
    try {
      await presenter.setFotoPrincipal(RECUADRO_ID, FOTO_ID);
    } catch (e) {
      capturado = e;
    }

    const err = capturado as MomentoBusinessError;
    expect(err.message).toBe('No se pudo fijar la Foto_Principal.');
  });
});
