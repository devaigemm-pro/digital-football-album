// Validación de la correspondencia biunívoca Recuadro↔Sticker
// (Print_Engine — Req 18.4, 18.7; Property 25).
//
// Verifica que entre el conjunto de Recuadros con Foto_Principal del PDF_Libro y
// el conjunto de stickers del PDF_Stickers existe una biyección: misma cantidad,
// cada sticker lleva exactamente el `numero` de su Recuadro (numeración heredada,
// posiblemente no contigua), ningún número duplicado y ningún Recuadro con
// Foto_Principal sin su sticker (ni sticker sin Recuadro). Los huecos en la
// secuencia (por Recuadros vacíos omitidos) son válidos y NO cuentan como
// faltantes (design.md · "los huecos ... no representan números faltantes").
//
// Dominio puro (sin I/O). Ante cualquier violación, el orquestador aborta la
// generación de forma atómica y notifica (Req 18.7, Property 28).
//
// Task 15.4 — Requirements: 18.4, 18.7

import type { Recuadro } from '../../domain/types.js';
import type { StickerSpec } from './renderer.js';

/** Tipo de discrepancia de correspondencia biunívoca (Req 18.7). */
export type TipoDiscrepancia =
  /** La cantidad de stickers difiere de la de Recuadros con Foto_Principal. */
  | 'CONTEO'
  /** Falta el sticker de algún Recuadro con Foto_Principal. */
  | 'FALTANTE'
  /** Un número de sticker aparece más de una vez. */
  | 'DUPLICADO'
  /** Existe un sticker cuyo número no corresponde a ningún Recuadro con foto. */
  | 'SOBRANTE';

/** Detalle de una discrepancia detectada, para la notificación de error (Req 18.7). */
export interface Discrepancia {
  readonly tipo: TipoDiscrepancia;
  readonly mensaje: string;
}

/** Resultado de la validación de biunivocidad. */
export interface BiunivocidadResultado {
  /** `true` si hay biyección exacta (sin discrepancias) — Property 25. */
  readonly esBiunivoca: boolean;
  /** Discrepancias detectadas (vacío si `esBiunivoca`). */
  readonly discrepancias: readonly Discrepancia[];
  /** Cantidad de Recuadros con Foto_Principal esperados. */
  readonly esperados: number;
  /** Cantidad de stickers generados. */
  readonly generados: number;
}

/**
 * Valida la correspondencia biunívoca entre los Recuadros con Foto_Principal y
 * los stickers generados (Req 18.4, Property 25). No lanza: devuelve el detalle
 * para que el orquestador aborte y notifique con precisión (Req 18.7).
 *
 * Comprueba, en este orden:
 *  1. Conteo: `#stickers === #recuadrosConFoto` (Req 18.4).
 *  2. Duplicados: ningún `numero` de sticker se repite (Req 18.7).
 *  3. Faltantes: todo Recuadro con Foto_Principal tiene un sticker con su
 *     `numero` (Req 18.4). Los huecos por Recuadros vacíos NO son faltantes.
 *  4. Sobrantes: ningún sticker referencia un número sin Recuadro con foto.
 */
export function validarBiunivocidad(
  recuadros: readonly Recuadro[],
  stickers: readonly StickerSpec[],
): BiunivocidadResultado {
  const recuadrosConFoto = recuadros.filter((r) => r.fotoPrincipalId !== null);
  const numerosEsperados = recuadrosConFoto.map((r) => r.numero);
  const setEsperados = new Set(numerosEsperados);

  const discrepancias: Discrepancia[] = [];

  // 1. Conteo (Req 18.4).
  if (stickers.length !== recuadrosConFoto.length) {
    discrepancias.push({
      tipo: 'CONTEO',
      mensaje: `Se generaron ${stickers.length} stickers pero hay ${recuadrosConFoto.length} Recuadros con Foto_Principal.`,
    });
  }

  // 2. Duplicados de número de sticker (Req 18.7).
  const vistos = new Set<number>();
  for (const sticker of stickers) {
    if (vistos.has(sticker.numero)) {
      discrepancias.push({
        tipo: 'DUPLICADO',
        mensaje: `El número de sticker ${sticker.numero} aparece más de una vez.`,
      });
    }
    vistos.add(sticker.numero);
  }

  // 3. Faltantes: cada Recuadro con Foto_Principal debe tener su sticker (Req 18.4).
  for (const numero of setEsperados) {
    if (!vistos.has(numero)) {
      discrepancias.push({
        tipo: 'FALTANTE',
        mensaje: `Falta el sticker del Recuadro número ${numero} (tiene Foto_Principal).`,
      });
    }
  }

  // 4. Sobrantes: ningún sticker sin Recuadro con foto equivalente.
  for (const numero of vistos) {
    if (!setEsperados.has(numero)) {
      discrepancias.push({
        tipo: 'SOBRANTE',
        mensaje: `El sticker número ${numero} no corresponde a ningún Recuadro con Foto_Principal.`,
      });
    }
  }

  return {
    esBiunivoca: discrepancias.length === 0,
    discrepancias,
    esperados: recuadrosConFoto.length,
    generados: stickers.length,
  };
}
