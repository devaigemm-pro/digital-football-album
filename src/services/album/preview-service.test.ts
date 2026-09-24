/**
 * Pruebas unitarias del Motor_Album — previsualización del álbum coleccionable
 * (Task 12.1 — Requirements: 11.1, 11.2, 11.3).
 *
 * Cubren:
 *  - Render montado vs vacío: un Recuadro con Foto_Principal se previsualiza como
 *    `MONTADA` con la clave de una miniatura optimizada; uno sin Foto_Principal
 *    como `VACIO` (silueta punteada) (Req 11.1, 11.2).
 *  - Reporte de vacíos: los Recuadros sin Foto_Principal se listan en
 *    `recuadrosSinFotoPrincipal` (Req 11.3).
 *  - Orden por `numero`: las entradas se emiten ascendentemente por número,
 *    aun con Recuadros sembrados desordenados (Req 11.1).
 *  - Álbum vacío: un álbum sin Recuadros produce una vista previa vacía.
 */
import { describe, it, expect } from 'vitest';
import type { Album, Foto, Recuadro, UUID } from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryFotoRepository,
  InMemoryRecuadroRepository,
} from '../../persistence/in-memory/repositories.js';
import { AlbumPreviewError, AlbumPreviewService } from './preview-service.js';
import { PrefixThumbnailResolver } from './thumbnail-resolver.js';

const TEMPORADA_ID = '10000000-0000-4000-8000-000000000001' as UUID;
const ALBUM_ID = '20000000-0000-4000-8000-000000000002' as UUID;
const MOMENTO_ID = '30000000-0000-4000-8000-000000000003' as UUID;
const PLANTILLA_ID = '40000000-0000-4000-8000-000000000004' as UUID;

const THUMB_PREFIX = 'thumbs/optimized/';

/** Genera un UUID determinista a partir de un índice para sembrar entidades. */
function idFor(prefijo: string, n: number): UUID {
  const id: UUID = `${prefijo}-${String(n).padStart(12, '0')}`;
  return id;
}

function makeRecuadro(
  numero: number,
  fotoPrincipalId: UUID | null,
  overrides: Partial<Recuadro> = {},
): Recuadro {
  return {
    id: idFor('recuadro', numero),
    albumId: ALBUM_ID,
    partidoOficialId: idFor('partido', numero),
    plantillaId: PLANTILLA_ID,
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId,
    estadoRecordatorio: fotoPrincipalId === null ? 'ACTIVO' : 'DETENIDO_POR_FOTO',
    ...overrides,
  };
}

function makeFoto(id: UUID, objectKey: string): Foto {
  return {
    id,
    momentoId: MOMENTO_ID,
    objectKey,
    anchoPx: 2000,
    altoPx: 2800,
    estadoAsociacion: 'ASOCIADA',
  };
}

/** Construye el servicio con los dobles en memoria sembrados. */
function makeService(
  recuadros: readonly Recuadro[],
  fotos: readonly Foto[],
): {
  service: AlbumPreviewService;
} {
  const albums = new InMemoryAlbumRepository([
    { id: ALBUM_ID, temporadaId: TEMPORADA_ID } satisfies Album,
  ]);
  const service = new AlbumPreviewService({
    albums,
    recuadros: new InMemoryRecuadroRepository(recuadros),
    fotos: new InMemoryFotoRepository(fotos),
    thumbnails: new PrefixThumbnailResolver(THUMB_PREFIX),
  });
  return { service };
}

describe('AlbumPreviewService.getPreview — montaje vs silueta (Req 11.1, 11.2)', () => {
  it('monta la Foto_Principal con miniatura optimizada y deja silueta en los vacíos', async () => {
    const fotoId = idFor('foto', 1);
    const recuadros = [makeRecuadro(1, fotoId), makeRecuadro(2, null)];
    const fotos = [makeFoto(fotoId, 'fotos/momento-1/principal.jpg')];
    const { service } = makeService(recuadros, fotos);

    const preview = await service.getPreview(TEMPORADA_ID);

    expect(preview.temporadaId).toBe(TEMPORADA_ID);
    expect(preview.albumId).toBe(ALBUM_ID);
    expect(preview.recuadros).toHaveLength(2);

    // Recuadro 1: montado con miniatura optimizada (no el binario original) (Req 11.1).
    expect(preview.recuadros[0]).toEqual({
      numero: 1,
      estado: 'MONTADA',
      miniaturaKey: `${THUMB_PREFIX}fotos/momento-1/principal.jpg`,
    });

    // Recuadro 2: silueta punteada vacía (Req 11.2).
    expect(preview.recuadros[1]).toEqual({ numero: 2, estado: 'VACIO' });
  });
});

describe('AlbumPreviewService.getPreview — reporte de vacíos (Req 11.3)', () => {
  it('lista los números de los Recuadros sin Foto_Principal', async () => {
    const fotoId = idFor('foto', 3);
    const recuadros = [makeRecuadro(1, null), makeRecuadro(2, null), makeRecuadro(3, fotoId)];
    const fotos = [makeFoto(fotoId, 'fotos/momento-3/principal.jpg')];
    const { service } = makeService(recuadros, fotos);

    const preview = await service.getPreview(TEMPORADA_ID);

    // Solo 1 y 2 están sin Foto_Principal (Req 11.3).
    expect(preview.recuadrosSinFotoPrincipal).toEqual([1, 2]);
    // El Recuadro 3 montado no aparece entre los faltantes.
    expect(preview.recuadrosSinFotoPrincipal).not.toContain(3);
  });

  it('reporta lista vacía de faltantes cuando todos los Recuadros están montados', async () => {
    const fotoA = idFor('foto', 1);
    const fotoB = idFor('foto', 2);
    const recuadros = [makeRecuadro(1, fotoA), makeRecuadro(2, fotoB)];
    const fotos = [makeFoto(fotoA, 'fotos/a.jpg'), makeFoto(fotoB, 'fotos/b.jpg')];
    const { service } = makeService(recuadros, fotos);

    const preview = await service.getPreview(TEMPORADA_ID);

    expect(preview.recuadrosSinFotoPrincipal).toEqual([]);
    expect(preview.recuadros.every((r) => r.estado === 'MONTADA')).toBe(true);
  });
});

describe('AlbumPreviewService.getPreview — orden por numero (Req 11.1)', () => {
  it('emite las entradas ascendentemente por numero aunque se siembren desordenadas', async () => {
    const fotoId = idFor('foto', 2);
    // Sembrados fuera de orden: 3, 1, 2.
    const recuadros = [makeRecuadro(3, null), makeRecuadro(1, null), makeRecuadro(2, fotoId)];
    const fotos = [makeFoto(fotoId, 'fotos/momento-2/principal.jpg')];
    const { service } = makeService(recuadros, fotos);

    const preview = await service.getPreview(TEMPORADA_ID);

    expect(preview.recuadros.map((r) => r.numero)).toEqual([1, 2, 3]);
    // Los faltantes también quedan ordenados.
    expect(preview.recuadrosSinFotoPrincipal).toEqual([1, 3]);
  });
});

describe('AlbumPreviewService.getPreview — álbum vacío y errores', () => {
  it('produce una vista previa vacía para un álbum sin Recuadros', async () => {
    const { service } = makeService([], []);

    const preview = await service.getPreview(TEMPORADA_ID);

    expect(preview.recuadros).toEqual([]);
    expect(preview.recuadrosSinFotoPrincipal).toEqual([]);
    expect(preview.albumId).toBe(ALBUM_ID);
  });

  it('lanza ALBUM_NO_ENCONTRADO cuando la Temporada no tiene Álbum', async () => {
    const { service } = makeService([], []);
    const otraTemporada = '99999999-9999-4999-8999-999999999999' as UUID;

    await expect(service.getPreview(otraTemporada)).rejects.toMatchObject({
      name: 'AlbumPreviewError',
      code: 'ALBUM_NO_ENCONTRADO',
    });
  });

  it('lanza FOTO_PRINCIPAL_NO_ENCONTRADA cuando el fotoPrincipalId no resuelve', async () => {
    const fotoInexistente = idFor('foto', 99);
    const recuadros = [makeRecuadro(1, fotoInexistente)];
    const { service } = makeService(recuadros, []);

    await expect(service.getPreview(TEMPORADA_ID)).rejects.toBeInstanceOf(AlbumPreviewError);
  });
});
