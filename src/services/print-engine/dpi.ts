// Escalado a 300 DPI y su validación (Print_Engine — Req 19.1).
//
// Implementa el punto 1 del contrato `generarKit` del design.md ("Print_Engine"):
// "Escala cada Foto_Principal a ≥300 DPI (Req 19.1)".
//
// Regla verificable (Property 29 del diseño): para cualquier fotografía y
// cualquier tamaño físico objetivo del Recuadro (`anchoMm`/`altoMm` de la
// Plantilla_Album o del Recuadro), el DPI resultante —calculado como los píxeles
// divididos por la dimensión física en pulgadas, `px / (mm / 25,4)`— debe ser
// mayor o igual a 300 en AMBAS dimensiones antes de enviar a imprenta.
//
// Este módulo es dominio puro (sin I/O): expone
//   - `mmToInches` / `computeDpi`: la aritmética del cálculo de DPI.
//   - `validateDpi`: verifica que ambas dimensiones alcanzan el mínimo.
//   - `computeScaleFactor`: el factor de escala necesario para que una foto que
//     no llega al mínimo alcance exactamente los 300 DPI (o >1 sólo si hace
//     falta; nunca reduce por debajo del original).
//
// Task 15.1 — Requirements: 19.1

import type { Foto, Recuadro } from '../../domain/types.js';

/** DPI mínimo exigido por la imprenta (Req 19.1, Property 29). */
export const MIN_DPI = 300;

/** Milímetros por pulgada (constante física exacta). */
export const MM_PER_INCH = 25.4;

/** Convierte una dimensión física de milímetros a pulgadas. */
export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

/**
 * DPI resultante de renderizar `px` píxeles sobre una dimensión física de `mm`
 * milímetros: `px / (mm / 25,4)` (Property 29). Si `mm <= 0` el DPI es infinito
 * (no hay superficie física sobre la que "estirar" los píxeles), por lo que
 * cualquier resolución positiva satisface el mínimo.
 */
export function computeDpi(px: number, mm: number): number {
  if (mm <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return px / mmToInches(mm);
}

/** Dimensiones físicas (mm) del destino de impresión de una foto. */
export interface DimensionesFisicasMm {
  readonly anchoMm: number;
  readonly altoMm: number;
}

/** Dimensiones en píxeles de una foto. */
export interface DimensionesPx {
  readonly anchoPx: number;
  readonly altoPx: number;
}

/**
 * Resultado de la validación de DPI de una foto contra un tamaño físico. Incluye
 * el DPI calculado en cada dimensión para poder auditar/notificar la causa
 * exacta de una discrepancia (Req 18.7 al abortar por fallo de DPI).
 */
export interface DpiValidacion {
  /** `true` si AMBAS dimensiones alcanzan `MIN_DPI` (Property 29). */
  readonly cumple: boolean;
  /** DPI horizontal calculado (`anchoPx / (anchoMm / 25,4)`). */
  readonly dpiAncho: number;
  /** DPI vertical calculado (`altoPx / (altoMm / 25,4)`). */
  readonly dpiAlto: number;
  /** DPI mínimo exigido (siempre `MIN_DPI`); expuesto para mensajes/auditoría. */
  readonly minimo: number;
}

/**
 * Valida que una foto alcanza el mínimo de 300 DPI en ambas dimensiones sobre el
 * tamaño físico objetivo (Req 19.1, Property 29). No lanza: devuelve el detalle
 * para que el orquestador decida (validar antes de publicar — Req 18.4/18.7).
 */
export function validateDpi(px: DimensionesPx, mm: DimensionesFisicasMm): DpiValidacion {
  const dpiAncho = computeDpi(px.anchoPx, mm.anchoMm);
  const dpiAlto = computeDpi(px.altoPx, mm.altoMm);
  return {
    cumple: dpiAncho >= MIN_DPI && dpiAlto >= MIN_DPI,
    dpiAncho,
    dpiAlto,
    minimo: MIN_DPI,
  };
}

/**
 * Valida el DPI de una `Foto` contra las dimensiones físicas de su `Recuadro`
 * (`anchoMm`/`altoMm`), que a su vez provienen de la Plantilla_Album (Req 19.1).
 * Atajo tipado sobre `validateDpi` para el flujo del Print_Engine.
 */
export function validateFotoDpi(foto: Foto, recuadro: Recuadro): DpiValidacion {
  return validateDpi(
    { anchoPx: foto.anchoPx, altoPx: foto.altoPx },
    { anchoMm: recuadro.anchoMm, altoMm: recuadro.altoMm },
  );
}

/**
 * Factor de escala que debe aplicarse a una foto para que alcance exactamente el
 * mínimo de 300 DPI en su dimensión más deficitaria, sin reducir nunca por
 * debajo del original.
 *
 * - Devuelve `1` si la foto ya cumple los 300 DPI en ambas dimensiones (no se
 *   reescala; escalar hacia arriba sin necesidad sólo degradaría por
 *   interpolación).
 * - Devuelve `> 1` (el máximo de los dos ratios de déficit) si alguna dimensión
 *   no llega, de modo que tras multiplicar los píxeles por el factor AMBAS
 *   dimensiones queden en `>= 300` DPI.
 *
 * El escalado real de píxeles (resampleo) lo realiza el renderer; aquí sólo se
 * calcula cuánto hay que escalar (dominio puro, verificable — Property 29).
 */
export function computeScaleFactor(px: DimensionesPx, mm: DimensionesFisicasMm): number {
  const dpiAncho = computeDpi(px.anchoPx, mm.anchoMm);
  const dpiAlto = computeDpi(px.altoPx, mm.altoMm);
  // Ratio de déficit por dimensión: cuánto habría que multiplicar los píxeles de
  // esa dimensión para llegar a 300 DPI. <=1 significa que ya cumple.
  const ratioAncho = MIN_DPI / dpiAncho;
  const ratioAlto = MIN_DPI / dpiAlto;
  const factor = Math.max(ratioAncho, ratioAlto, 1);
  // `dpi` infinito (mm<=0) produce ratio 0 → el `Math.max(..., 1)` lo neutraliza.
  return Number.isFinite(factor) ? factor : 1;
}

/**
 * Aplica `computeScaleFactor` y devuelve las dimensiones en píxeles ya escaladas
 * (redondeadas hacia arriba para no perder resolución) que garantizan `>=300`
 * DPI. Útil para instruir al renderer sobre el tamaño de resampleo objetivo.
 */
export function scaleToMinDpi(px: DimensionesPx, mm: DimensionesFisicasMm): DimensionesPx {
  const factor = computeScaleFactor(px, mm);
  if (factor === 1) {
    return { anchoPx: px.anchoPx, altoPx: px.altoPx };
  }
  return {
    anchoPx: Math.ceil(px.anchoPx * factor),
    altoPx: Math.ceil(px.altoPx * factor),
  };
}
