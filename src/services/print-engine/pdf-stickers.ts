// Composición de la especificación del PDF_Stickers con numeración heredada
// (Print_Engine — Req 18.1, 18.2, 18.3, 18.5, 18.6).
//
// Implementa el punto 3 del contrato `generarKit` del design.md ("Print_Engine"):
// un sticker numerado por cada Recuadro con Foto_Principal (Req 18.1), omitiendo
// los vacíos (Req 18.2); cada sticker HEREDA el `numero` de su Recuadro, por lo
// que la secuencia de números impresos puede tener huecos (no contigua) sin
// renumeración densa (Req 18.1, design.md); guías de corte/troquelado con
// desviación ≤0,5 mm (Req 18.3, Property 26); y efecto holograma según plan y
// clasificación (Req 18.5, 18.6, Property 27).
//
// Dominio puro: produce un `PdfStickersSpec`; el `PdfRenderer` lo materializa.
//
// Task 15.3 — Requirements: 18.1, 18.2, 18.3, 18.5, 18.6

import type { PartidoOficial, Recuadro, UUID } from '../../domain/types.js';
import type { Entitlements } from '../subscription/entitlements.js';
import type { PdfStickersSpec, StickerSpec } from './renderer.js';

/**
 * Desviación de la guía de troquelado que emite este compositor, en mm. Se fija
 * en 0 (posición nominal exacta): garantiza `<= 0,5 mm` (Req 18.3, Property 26).
 * El renderer real puede introducir su propia desviación física; la
 * especificación describe la posición nominal objetivo.
 */
export const TROQUELADO_DESVIACION_MM = 0;

/** Tolerancia máxima de troquelado admitida (Req 18.3, Property 26). */
export const TOLERANCIA_TROQUELADO_MM = 0.5;

/**
 * Decide si un sticker lleva efecto holograma (Req 18.5, 18.6, Property 27):
 * SI Y SOLO SI el usuario tiene el derecho `holograma` (Plan_Premium, derivado en
 * el punto único de entitlements) Y el Recuadro está clasificado como Clásico o
 * Partido_Internacional. Los Recuadros no clasificados como Clásico ni
 * Internacional NUNCA llevan holograma, con cualquier plan.
 */
export function debeAplicarHolograma(
  partido: Pick<PartidoOficial, 'esClasico' | 'esInternacional'>,
  entitlements: Entitlements,
): boolean {
  const esPremiable = partido.esClasico || partido.esInternacional;
  return esPremiable && entitlements.holograma;
}

/**
 * Resuelve el `objectKey` de la Foto_Principal de un Recuadro. Inyectable para
 * no acoplar la composición a un repositorio concreto.
 */
export type ResolverFotoObjectKey = (fotoPrincipalId: UUID) => string | null;

/** Parámetros de composición del PDF_Stickers. */
export interface BuildPdfStickersInput {
  readonly temporadaId: UUID;
  /** Todos los Recuadros del Álbum (los vacíos se omitirán — Req 18.2). */
  readonly recuadros: readonly Recuadro[];
  /** Partido_Oficial por `id`, para la clasificación Clásico/Internacional (Req 18.5, 18.6). */
  readonly partidoPorId: ReadonlyMap<UUID, PartidoOficial>;
  /** Derechos del usuario (holograma) derivados del plan (Req 18.5, 18.6). */
  readonly entitlements: Entitlements;
  /** Resuelve el `objectKey` de una Foto_Principal por su id. */
  readonly resolverFoto: ResolverFotoObjectKey;
}

/**
 * Se lanza cuando un Recuadro con Foto_Principal no tiene un `objectKey`
 * resoluble (dato inconsistente): es un fallo de procesamiento que debe abortar
 * la generación de forma atómica (Req 18.8), no producir un sticker sin imagen.
 */
export class FotoPrincipalNoResoluble extends Error {
  constructor(
    public readonly recuadroId: UUID,
    public readonly fotoPrincipalId: UUID,
  ) {
    super(
      `No se pudo resolver la Foto_Principal ${fotoPrincipalId} del Recuadro ${recuadroId} para el PDF_Stickers`,
    );
    this.name = 'FotoPrincipalNoResoluble';
  }
}

/**
 * Compone la especificación del PDF_Stickers (Req 18.1, 18.2, 18.3, 18.5, 18.6).
 *
 * - Genera un sticker SOLO por cada Recuadro con `fotoPrincipalId !== null`;
 *   omite los vacíos (Req 18.1, 18.2).
 * - Cada sticker hereda el `numero` de su Recuadro; la salida se ordena por
 *   `numero`, por lo que la secuencia puede quedar no contigua (p. ej. 1, 3, 4,
 *   7) cuando hay Recuadros vacíos, sin renumeración densa (Req 18.1, design.md).
 * - Añade guías de troquelado en su posición nominal (desviación 0 ≤ 0,5 mm)
 *   (Req 18.3).
 * - Marca `holograma` según plan y clasificación (Req 18.5, 18.6).
 *
 * @throws {FotoPrincipalNoResoluble} si un Recuadro con Foto_Principal no tiene
 *   `objectKey` resoluble (fallo de procesamiento — Req 18.8).
 */
export function buildPdfStickersSpec(input: BuildPdfStickersInput): PdfStickersSpec {
  const { temporadaId, recuadros, partidoPorId, entitlements, resolverFoto } = input;

  const conFoto = recuadros
    .filter((r) => r.fotoPrincipalId !== null)
    // Numeración heredada, orden estable por `numero` (puede tener huecos).
    .sort((a, b) => a.numero - b.numero);

  const stickers: StickerSpec[] = conFoto.map((recuadro) => {
    // `fotoPrincipalId` es no nulo por el filtro anterior.
    const fotoPrincipalId = recuadro.fotoPrincipalId as UUID;
    const fotoObjectKey = resolverFoto(fotoPrincipalId);
    if (fotoObjectKey === null) {
      throw new FotoPrincipalNoResoluble(recuadro.id, fotoPrincipalId);
    }

    const partido = partidoPorId.get(recuadro.partidoOficialId);
    // Sin partido conocido no puede clasificarse como premiable → sin holograma.
    const holograma = partido === undefined ? false : debeAplicarHolograma(partido, entitlements);

    return {
      recuadroId: recuadro.id,
      numero: recuadro.numero,
      fotoObjectKey,
      guiaTroquelado: {
        numero: recuadro.numero,
        desviacionMm: TROQUELADO_DESVIACION_MM,
      },
      holograma,
    };
  });

  return { temporadaId, stickers };
}
