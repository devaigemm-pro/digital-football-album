/**
 * Pruebas unitarias del CaptureViewModel (Task 21.1 — Requirements: 5.1, 5.2, 6.1).
 *
 * Cubren que el flujo de captura compone las llamadas del backend en orden:
 *  - sube/captura la foto (galería o cámara) (Req 5.1, 5.2);
 *  - fija la Foto_Principal del Recuadro (Req 5.5);
 *  - marca el contexto de asistencia del Momento (Req 6.1);
 * y que los pasos opcionales (Foto_Principal / contexto) se omiten según entrada.
 */
import { describe, it, expect } from 'vitest';
import type { Foto, Momento, Recuadro, UUID } from '../domain/types.js';
import type { CaptureClient, MomentoContextoInput, UploadFotoInput } from './backend-clients.js';
import { CaptureViewModel } from './capture-view-model.js';

const PARTIDO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const RECUADRO_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const MOMENTO_ID = '33333333-3333-4333-8333-333333333333' as UUID;
const FOTO_ID = '44444444-4444-4444-8444-444444444444' as UUID;

/** Registro de invocaciones del cliente de captura. */
interface Registro {
  uploads: Array<{ partidoId: UUID; input: UploadFotoInput }>;
  principales: Array<{ recuadroId: UUID; fotoId: UUID }>;
  contextos: Array<{ momentoId: UUID; patch: MomentoContextoInput }>;
  orden: string[];
}

/** Cliente de captura doble que registra invocaciones y devuelve entidades fijas. */
class FakeCaptureClient implements CaptureClient {
  readonly registro: Registro = {
    uploads: [],
    principales: [],
    contextos: [],
    orden: [],
  };

  uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto> {
    this.registro.uploads.push({ partidoId, input });
    this.registro.orden.push('upload');
    const foto: Foto = {
      id: FOTO_ID,
      momentoId: MOMENTO_ID,
      objectKey: 'fotos/captura.jpg',
      anchoPx: input.anchoPx,
      altoPx: input.altoPx,
      estadoAsociacion: 'ASOCIADA',
    };
    return Promise.resolve(foto);
  }

  setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    this.registro.principales.push({ recuadroId, fotoId });
    this.registro.orden.push('foto-principal');
    const recuadro: Recuadro = {
      id: recuadroId,
      albumId: '55555555-5555-4555-8555-555555555555',
      partidoOficialId: PARTIDO_ID,
      plantillaId: '66666666-6666-4666-8666-666666666666',
      numero: 1,
      anchoMm: 60,
      altoMm: 80,
      fotoPrincipalId: fotoId,
      estadoRecordatorio: 'DETENIDO_POR_FOTO',
    };
    return Promise.resolve(recuadro);
  }

  updateMomento(momentoId: UUID, patch: MomentoContextoInput): Promise<Momento> {
    this.registro.contextos.push({ momentoId, patch });
    this.registro.orden.push('contexto');
    const momento: Momento = {
      id: momentoId,
      partidoOficialId: PARTIDO_ID,
      contextoAsistencia: patch.contextoAsistencia ?? 'TRANSMISION',
      subModalidad: patch.subModalidad ?? null,
      geoVerificado: patch.geoVerificado ?? false,
      notas: patch.notas ?? '',
      jugadorDelPartido: patch.jugadorDelPartido ?? null,
    };
    return Promise.resolve(momento);
  }
}

const fotoInput: UploadFotoInput = {
  fuente: 'galeria',
  binario: new Uint8Array([1, 2, 3]),
  anchoPx: 3000,
  altoPx: 4000,
};

describe('CaptureViewModel.capturarMomento (Req 5.1, 5.2, 5.5, 6.1)', () => {
  it('sube la foto, la fija como Foto_Principal y marca el contexto en orden', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);

    const result = await vm.capturarMomento({
      partidoId: PARTIDO_ID,
      recuadroId: RECUADRO_ID,
      momentoId: MOMENTO_ID,
      foto: fotoInput,
      contexto: { contextoAsistencia: 'EN_VIVO_LOCAL', notas: 'gran partido' },
    });

    // Invoca upload + foto-principal + contexto, en ese orden (Req 5.1, 5.5, 6.1).
    expect(client.registro.orden).toEqual(['upload', 'foto-principal', 'contexto']);
    expect(client.registro.uploads).toEqual([{ partidoId: PARTIDO_ID, input: fotoInput }]);
    expect(client.registro.principales).toEqual([{ recuadroId: RECUADRO_ID, fotoId: FOTO_ID }]);
    expect(client.registro.contextos).toEqual([
      {
        momentoId: MOMENTO_ID,
        patch: { contextoAsistencia: 'EN_VIVO_LOCAL', notas: 'gran partido' },
      },
    ]);

    expect(result.foto.id).toBe(FOTO_ID);
    expect(result.recuadro?.fotoPrincipalId).toBe(FOTO_ID);
    expect(result.momento?.contextoAsistencia).toBe('EN_VIVO_LOCAL');
  });

  it('captura desde cámara (Req 5.2)', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);

    await vm.capturarMomento({
      partidoId: PARTIDO_ID,
      recuadroId: RECUADRO_ID,
      momentoId: MOMENTO_ID,
      foto: { ...fotoInput, fuente: 'camara' },
    });

    expect(client.registro.uploads[0]?.input.fuente).toBe('camara');
  });

  it('omite la Foto_Principal cuando comoFotoPrincipal es false', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);

    const result = await vm.capturarMomento({
      partidoId: PARTIDO_ID,
      recuadroId: RECUADRO_ID,
      momentoId: MOMENTO_ID,
      foto: fotoInput,
      comoFotoPrincipal: false,
    });

    expect(client.registro.orden).toEqual(['upload']);
    expect(result.recuadro).toBeNull();
    expect(result.momento).toBeNull();
  });

  it('omite el contexto cuando no se proporciona', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);

    const result = await vm.capturarMomento({
      partidoId: PARTIDO_ID,
      recuadroId: RECUADRO_ID,
      momentoId: MOMENTO_ID,
      foto: fotoInput,
    });

    expect(client.registro.orden).toEqual(['upload', 'foto-principal']);
    expect(result.momento).toBeNull();
    expect(result.recuadro?.fotoPrincipalId).toBe(FOTO_ID);
  });
});

describe('CaptureViewModel — atajos (Req 5.1, 5.2, 5.5, 6.1)', () => {
  it('uploadFoto delega en el cliente', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);
    const foto = await vm.uploadFoto(PARTIDO_ID, fotoInput);
    expect(foto.id).toBe(FOTO_ID);
    expect(client.registro.uploads).toHaveLength(1);
  });

  it('setFotoPrincipal delega en el cliente (Req 5.5)', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);
    const recuadro = await vm.setFotoPrincipal(RECUADRO_ID, FOTO_ID);
    expect(recuadro.fotoPrincipalId).toBe(FOTO_ID);
    expect(client.registro.principales).toHaveLength(1);
  });

  it('marcarContexto delega en el cliente (Req 6.1)', async () => {
    const client = new FakeCaptureClient();
    const vm = new CaptureViewModel(client);
    const momento = await vm.marcarContexto(MOMENTO_ID, {
      contextoAsistencia: 'EN_VIVO_VISITA',
    });
    expect(momento.contextoAsistencia).toBe('EN_VIVO_VISITA');
    expect(client.registro.contextos).toHaveLength(1);
  });
});
