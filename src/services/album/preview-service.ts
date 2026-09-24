// Motor_Album — previsualización del álbum coleccionable (`getPreview`).
//
// Implementa el contrato lógico del design.md ("Motor_Album"):
//   - `GET /album/{temporadaId}/preview` → estructura de Recuadros con la
//     Foto_Principal montada, o silueta punteada para los vacíos (Req 11.1,
//     11.2), marcando además el conjunto de Recuadros sin Foto_Principal
//     (Req 11.3).
//
// La previsualización refleja fielmente el estado de cada Recuadro: por cada
// Recuadro del álbum se emite una entrada ordenada por `numero` que es, o bien
// `MONTADA` (con la clave de una miniatura optimizada de su Foto_Principal —
// Req 11.1), o bien `VACIO` (silueta punteada — Req 11.2). Adicionalmente se
// devuelve el conjunto de números de los Recuadros sin Foto_Principal, para que
// el cliente pueda indicar cuáles faltan antes del cierre (Req 11.3).
//
// La resolución de la miniatura optimizada se delega en `ThumbnailResolver`
// (mockeable) para no referenciar el binario original de alta resolución y
// mantener el render rápido (Req 19.2); este servicio orquesta la resolución de
// datos (Temporada → Álbum → Recuadros → Foto_Principal) y la construcción de la
// vista previa ordenada.
//
// Las dependencias (repositorios y el resolutor de miniaturas) se inyectan para
// ejercitar el servicio con los dobles en memoria, sin PostgreSQL ni object
// storage vivos.
//
// Task 12.1 — Requirements: 11.1, 11.2, 11.3

import type { Recuadro, UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  FotoRepository,
  RecuadroRepository,
} from '../../persistence/repositories.js';
import type { ThumbnailResolver } from './thumbnail-resolver.js';

/** Estado de un Recuadro en la previsualización. */
export type EstadoPreviewRecuadro =
  /** El Recuadro tiene Foto_Principal montada (Req 11.1). */
  | 'MONTADA'
  /** El Recuadro no tiene Foto_Principal: silueta punteada vacía (Req 11.2). */
  | 'VACIO';

/** Entrada de previsualización de un Recuadro con Foto_Principal montada (Req 11.1). */
export interface PreviewRecuadroMontada {
  /** Número del Recuadro; clave de correspondencia con el sticker (Req 17.4). */
  readonly numero: number;
  readonly estado: 'MONTADA';
  /**
   * Clave/URL de la miniatura optimizada de la Foto_Principal a mostrar en la
   * vista previa (Req 11.1; render rápido — Req 19.2).
   */
  readonly miniaturaKey: string;
}

/** Entrada de previsualización de un Recuadro vacío: silueta punteada (Req 11.2). */
export interface PreviewRecuadroVacio {
  /** Número del Recuadro faltante (Req 11.2, 11.3). */
  readonly numero: number;
  readonly estado: 'VACIO';
}

/**
 * Entrada de previsualización de un Recuadro: montada (con miniatura optimizada)
 * o vacía (silueta punteada). Unión discriminada por `estado`.
 */
export type PreviewRecuadro = PreviewRecuadroMontada | PreviewRecuadroVacio;

/**
 * Vista previa del álbum coleccionable (`GET /album/{temporadaId}/preview`).
 * Refleja fielmente el estado de cada Recuadro (Req 11.1, 11.2) e indica el
 * conjunto de Recuadros sin Foto_Principal (Req 11.3).
 */
export interface AlbumPreview {
  /** Identificador de la Temporada previsualizada. */
  readonly temporadaId: UUID;
  /** Identificador del Álbum previsualizado. */
  readonly albumId: UUID;
  /**
   * Entradas de previsualización, una por Recuadro del álbum, **ordenadas de
   * forma ascendente por `numero`** (Req 11.1).
   */
  readonly recuadros: readonly PreviewRecuadro[];
  /**
   * Números de los Recuadros sin Foto_Principal, ascendentes. Indica cuáles
   * Recuadros faltan antes del cierre (Req 11.3).
   */
  readonly recuadrosSinFotoPrincipal: readonly number[];
}

/** Códigos de error del Motor_Album. */
export type AlbumPreviewErrorCode =
  /** No existe Álbum para la Temporada indicada. */
  | 'ALBUM_NO_ENCONTRADO'
  /** El `fotoPrincipalId` de un Recuadro no resuelve a una Foto existente. */
  | 'FOTO_PRINCIPAL_NO_ENCONTRADA';

/** Error de dominio del Motor_Album al construir la previsualización. */
export class AlbumPreviewError extends Error {
  constructor(
    readonly code: AlbumPreviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AlbumPreviewError';
  }
}

/** Dependencias inyectadas del Motor_Album. */
export interface AlbumPreviewServiceDeps {
  /** Álbumes; resuelve el Álbum de la Temporada. Requerido. */
  readonly albums: AlbumRepository;
  /** Recuadros; provee los Recuadros del Álbum a previsualizar. Requerido. */
  readonly recuadros: RecuadroRepository;
  /** Fotos; resuelve la `objectKey` de cada Foto_Principal montada. Requerido. */
  readonly fotos: FotoRepository;
  /** Resolutor de miniaturas optimizadas (mockeable). Requerido. */
  readonly thumbnails: ThumbnailResolver;
}

/** Ordena Recuadros de forma ascendente por `numero` (Req 11.1). */
function porNumeroAscendente(a: Recuadro, b: Recuadro): number {
  return a.numero - b.numero;
}

/**
 * Motor_Album inyectable. Construye la previsualización del álbum coleccionable
 * a partir del estado persistido de sus Recuadros.
 */
export class AlbumPreviewService {
  private readonly albums: AlbumRepository;
  private readonly recuadros: RecuadroRepository;
  private readonly fotos: FotoRepository;
  private readonly thumbnails: ThumbnailResolver;

  constructor(deps: AlbumPreviewServiceDeps) {
    this.albums = deps.albums;
    this.recuadros = deps.recuadros;
    this.fotos = deps.fotos;
    this.thumbnails = deps.thumbnails;
  }

  /**
   * Construye la previsualización del álbum de una Temporada
   * (`GET /album/{temporadaId}/preview`).
   *
   * Por cada Recuadro del álbum emite una entrada, ordenadas ascendentemente por
   * `numero` (Req 11.1):
   *  - `MONTADA` con la clave de la miniatura optimizada de su Foto_Principal
   *    cuando el Recuadro tiene `fotoPrincipalId` (Req 11.1; miniaturas
   *    optimizadas — Req 19.2).
   *  - `VACIO` (silueta punteada) cuando el Recuadro no tiene Foto_Principal
   *    (Req 11.2).
   *
   * Además devuelve los números de los Recuadros sin Foto_Principal, para
   * indicar cuáles faltan antes del cierre (Req 11.3).
   *
   * Un álbum sin Recuadros produce una vista previa vacía (sin entradas y sin
   * faltantes), no un error.
   *
   * @param temporadaId Temporada cuyo álbum se previsualiza.
   * @returns La previsualización ordenada del álbum (Req 11.1, 11.2, 11.3).
   * @throws {AlbumPreviewError} `ALBUM_NO_ENCONTRADO` si la Temporada no tiene
   *   Álbum; `FOTO_PRINCIPAL_NO_ENCONTRADA` si un `fotoPrincipalId` no resuelve.
   */
  async getPreview(temporadaId: UUID): Promise<AlbumPreview> {
    const album = await this.albums.findByTemporadaId(temporadaId);
    if (album === null) {
      throw new AlbumPreviewError(
        'ALBUM_NO_ENCONTRADO',
        `No existe un Álbum para la Temporada ${temporadaId}.`,
      );
    }

    const recuadros = await this.recuadros.findByAlbumId(album.id);
    // Copia defensiva antes de ordenar: `findByAlbumId` puede devolver una vista
    // interna del doble en memoria y no debe mutarse (Req 11.1 · orden por numero).
    const ordenados = [...recuadros].sort(porNumeroAscendente);

    const entradas: PreviewRecuadro[] = [];
    const sinFotoPrincipal: number[] = [];

    for (const recuadro of ordenados) {
      if (recuadro.fotoPrincipalId === null) {
        // Recuadro vacío: silueta punteada (Req 11.2) y reportado como faltante
        // (Req 11.3).
        entradas.push({ numero: recuadro.numero, estado: 'VACIO' });
        sinFotoPrincipal.push(recuadro.numero);
        continue;
      }

      // Recuadro con Foto_Principal montada (Req 11.1): resolver la miniatura
      // optimizada a partir de la `objectKey` del binario original.
      const foto = await this.fotos.findById(recuadro.fotoPrincipalId);
      if (foto === null) {
        throw new AlbumPreviewError(
          'FOTO_PRINCIPAL_NO_ENCONTRADA',
          `El Recuadro ${recuadro.numero} referencia una Foto_Principal ${recuadro.fotoPrincipalId} inexistente.`,
        );
      }
      const miniaturaKey = await this.thumbnails.resolveThumbnail(foto.objectKey);
      entradas.push({
        numero: recuadro.numero,
        estado: 'MONTADA',
        miniaturaKey,
      });
    }

    return {
      temporadaId,
      albumId: album.id,
      recuadros: entradas,
      recuadrosSinFotoPrincipal: sinFotoPrincipal,
    };
  }
}
