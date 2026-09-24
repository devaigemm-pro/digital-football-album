/**
 * Pruebas unitarias del escalado/validación a 300 DPI (Task 15.1 — Req 19.1).
 *
 * Cubren:
 *  - `computeDpi`: aritmética `px / (mm / 25,4)`.
 *  - `validateDpi`: pasa cuando ambas dimensiones alcanzan 300 DPI; falla cuando
 *    alguna no llega (Property 29).
 *  - `computeScaleFactor` / `scaleToMinDpi`: no reescala si ya cumple; escala lo
 *    justo para alcanzar 300 DPI en ambas dimensiones cuando no llega.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_DPI,
  computeDpi,
  computeScaleFactor,
  scaleToMinDpi,
  validateDpi,
  validateFotoDpi,
} from './dpi.js';
import type { Foto, Recuadro, UUID } from '../../domain/types.js';

/** Píxeles exactos para alcanzar `dpi` en `mm` milímetros. */
function pxParaDpi(mm: number, dpi: number): number {
  return Math.ceil((mm / 25.4) * dpi);
}

describe('computeDpi — px / (mm / 25,4) (Req 19.1)', () => {
  it('calcula 300 DPI para 25,4 mm con 300 px', () => {
    expect(computeDpi(300, 25.4)).toBeCloseTo(300, 5);
  });

  it('devuelve infinito cuando el tamaño físico es 0 (sin superficie física)', () => {
    expect(computeDpi(1000, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('validateDpi — mínimo de 300 DPI en ambas dimensiones (Property 29)', () => {
  it('cumple cuando ambas dimensiones alcanzan exactamente 300 DPI', () => {
    const mm = { anchoMm: 50, altoMm: 70 };
    const px = {
      anchoPx: pxParaDpi(50, MIN_DPI),
      altoPx: pxParaDpi(70, MIN_DPI),
    };
    const r = validateDpi(px, mm);
    expect(r.cumple).toBe(true);
    expect(r.dpiAncho).toBeGreaterThanOrEqual(MIN_DPI);
    expect(r.dpiAlto).toBeGreaterThanOrEqual(MIN_DPI);
  });

  it('falla cuando la dimensión de alto no alcanza 300 DPI', () => {
    const mm = { anchoMm: 50, altoMm: 70 };
    const px = { anchoPx: pxParaDpi(50, MIN_DPI), altoPx: 100 };
    const r = validateDpi(px, mm);
    expect(r.cumple).toBe(false);
    expect(r.dpiAlto).toBeLessThan(MIN_DPI);
  });

  it('falla cuando ambas dimensiones son de baja resolución', () => {
    const r = validateDpi({ anchoPx: 100, altoPx: 100 }, { anchoMm: 100, altoMm: 100 });
    expect(r.cumple).toBe(false);
  });
});

describe('computeScaleFactor / scaleToMinDpi', () => {
  it('no reescala (factor 1) si la foto ya cumple 300 DPI', () => {
    const mm = { anchoMm: 40, altoMm: 40 };
    const px = { anchoPx: pxParaDpi(40, 600), altoPx: pxParaDpi(40, 600) };
    expect(computeScaleFactor(px, mm)).toBe(1);
    expect(scaleToMinDpi(px, mm)).toEqual(px);
  });

  it('escala lo justo para que la dimensión deficitaria alcance 300 DPI', () => {
    const mm = { anchoMm: 100, altoMm: 100 };
    const px = { anchoPx: 600, altoPx: 300 }; // alto muy por debajo
    const factor = computeScaleFactor(px, mm);
    expect(factor).toBeGreaterThan(1);
    const escalado = scaleToMinDpi(px, mm);
    const r = validateDpi(escalado, mm);
    expect(r.cumple).toBe(true);
  });
});

describe('validateFotoDpi — atajo sobre Foto/Recuadro', () => {
  it('valida la foto contra las dimensiones físicas del Recuadro', () => {
    const recuadro = {
      id: 'r' as UUID,
      albumId: 'a' as UUID,
      partidoOficialId: 'p' as UUID,
      plantillaId: 'pl' as UUID,
      numero: 1,
      anchoMm: 50,
      altoMm: 70,
      fotoPrincipalId: 'f' as UUID,
      estadoRecordatorio: 'DETENIDO_POR_FOTO',
    } satisfies Recuadro;
    const foto = {
      id: 'f' as UUID,
      momentoId: 'm' as UUID,
      objectKey: 'k',
      anchoPx: pxParaDpi(50, MIN_DPI),
      altoPx: pxParaDpi(70, MIN_DPI),
      estadoAsociacion: 'ASOCIADA',
    } satisfies Foto;
    expect(validateFotoDpi(foto, recuadro).cumple).toBe(true);
  });
});
