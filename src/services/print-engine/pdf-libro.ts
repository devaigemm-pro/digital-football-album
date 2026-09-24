// Composición de la especificación del PDF_Libro (Print_Engine — Req 16.5, 17.1–17.4).
//
// Implementa el punto 2 del contrato `generarKit` del design.md ("Print_Engine"):
// genera el PDF_Libro con fondos del Club, estadísticas, plantillas y Recuadros
// numerados (Req 17.1); monta la Foto_Principal con guías de pegado numeradas
// (Req 17.2); representa los Recuadros vacíos con silueta punteada y guías
// numeradas (Req 17.3, 16.5); y numera cada Recuadro de forma que corresponda al
// sticker del PDF_Stickers (Req 17.4).
//
// Este módulo es dominio puro: produce un `PdfLibroSpec` (QUÉ contiene el libro),
// que luego materializa el `PdfRenderer`. No renderiza bytes.
//
// Task 15.2 — Requirements: 16.5, 17.1, 17.2, 17.3, 17.4

import type { Recuadro, UUID } from '../../domain/types.js';
import type { PaginaLibro, PdfLibroSpec, RecuadroLibro } from './renderer.js';

/**
 * Desviación nominal (perfecta) de las guías de pegado del PDF_Libro. El libro
 * no está sujeto a la tolerancia de troquelado de los stickers; las guías se
 * emiten en su posición nominal (0 mm de desviación).
 */
const GUIA_PEGADO_DESVIACION_MM = 0;

/** Datos de página del Club para el PDF_Libro (fondos y estadísticas — Req 17.1). */
export interface PaginaClub {
  readonly fondoClubUrl: string;
  readonly estadisticas: string;
}

/**
 * Resuelve el `objectKey` de la Foto_Principal de un Recuadro. Se inyecta para
 * no acoplar la composición del libro a un repositorio concreto de fotos; el
 * orquestador provee el mapa ya resuelto.
 */
export type ResolverFotoObjectKey = (fotoPrincipalId: UUID) => string | null;

/**
 * Construye la representación de un Recuadro en el PDF_Libro (Req 17.2, 17.3,
 * 16.5):
 *  - Con Foto_Principal (y objectKey resoluble): `MONTAJE` con la foto y su guía
 *    de pegado numerada.
 *  - Sin Foto_Principal (o foto no resoluble): `SILUETA` punteada con su guía de
 *    pegado numerada; el Recuadro conserva su número (Req 16.5, Property 24).
 */
export function buildRecuadroLibro(
  recuadro: Recuadro,
  resolverFoto: ResolverFotoObjectKey,
): RecuadroLibro {
  const fotoObjectKey =
    recuadro.fotoPrincipalId === null ? null : resolverFoto(recuadro.fotoPrincipalId);

  const guiaPegado = {
    numero: recuadro.numero,
    desviacionMm: GUIA_PEGADO_DESVIACION_MM,
  };

  if (fotoObjectKey === null) {
    // Vacío (o foto no disponible): silueta punteada con guías numeradas (Req 17.3, 16.5).
    return {
      recuadroId: recuadro.id,
      numero: recuadro.numero,
      modo: 'SILUETA',
      fotoObjectKey: null,
      guiaPegado,
    };
  }

  // Con Foto_Principal: montaje con guías de pegado numeradas (Req 17.2).
  return {
    recuadroId: recuadro.id,
    numero: recuadro.numero,
    modo: 'MONTAJE',
    fotoObjectKey,
    guiaPegado,
  };
}

/** Parámetros de composición del PDF_Libro. */
export interface BuildPdfLibroInput {
  readonly temporadaId: UUID;
  /** Todos los Recuadros del Álbum (con y sin Foto_Principal). */
  readonly recuadros: readonly Recuadro[];
  /** Página(s) del Club con fondos y estadísticas (Req 17.1). */
  readonly paginasClub: readonly PaginaClub[];
  /** Resuelve el `objectKey` de una Foto_Principal por su id. */
  readonly resolverFoto: ResolverFotoObjectKey;
}

/**
 * Compone la especificación completa del PDF_Libro (Req 17.1–17.4, 16.5).
 *
 * - Ordena los Recuadros por `numero` para que la numeración impresa sea estable
 *   y corresponda con la del PDF_Stickers (Req 17.4).
 * - Todos los Recuadros del Álbum aparecen en el libro: los que tienen
 *   Foto_Principal se montan, los vacíos se representan con silueta punteada
 *   (Req 17.2, 17.3, 16.5). Los vacíos NO se omiten en el libro (a diferencia del
 *   PDF_Stickers, donde sí se omiten — Req 18.2).
 * - Distribuye los Recuadros en las páginas del Club provistas. Si hay más de una
 *   página, reparte de forma equilibrada; si hay una sola, todos van en ella.
 */
export function buildPdfLibroSpec(input: BuildPdfLibroInput): PdfLibroSpec {
  const { temporadaId, recuadros, paginasClub, resolverFoto } = input;

  // Numeración correspondiente al PDF_Stickers: orden estable por `numero` (Req 17.4).
  const ordenados = [...recuadros].sort((a, b) => a.numero - b.numero);
  const recuadrosLibro = ordenados.map((r) => buildRecuadroLibro(r, resolverFoto));

  const paginas = distribuirEnPaginas(recuadrosLibro, paginasClub);

  return { temporadaId, paginas };
}

/**
 * Reparte los Recuadros del libro entre las páginas del Club de forma
 * equilibrada. Siempre hay al menos una página (si no se provee ninguna, se
 * genera una página vacía sin fondo/estadísticas para no perder los Recuadros).
 */
function distribuirEnPaginas(
  recuadros: readonly RecuadroLibro[],
  paginasClub: readonly PaginaClub[],
): PaginaLibro[] {
  const plantillasPagina: readonly PaginaClub[] =
    paginasClub.length > 0 ? paginasClub : [{ fondoClubUrl: '', estadisticas: '' }];

  const totalPaginas = plantillasPagina.length;
  const porPagina = Math.ceil(recuadros.length / totalPaginas);

  return plantillasPagina.map((plantilla, indice) => {
    const inicio = indice * porPagina;
    const fin = inicio + porPagina;
    return {
      fondoClubUrl: plantilla.fondoClubUrl,
      estadisticas: plantilla.estadisticas,
      recuadros: recuadros.slice(inicio, fin),
    };
  });
}
