/**
 * Pruebas unitarias de la validación de biunivocidad Recuadro↔Sticker
 * (Task 15.4 — Req 18.4, 18.7; Property 25).
 *
 * Cubren:
 *  - Biyección válida con numeración no contigua (huecos NO son faltantes).
 *  - Discrepancia de conteo.
 *  - Número faltante (Recuadro con foto sin su sticker).
 *  - Número duplicado.
 *  - Número sobrante (sticker sin Recuadro con foto).
 */
import { describe, it, expect } from 'vitest';
import type { Recuadro } from '../../domain/types.js';
import { validarBiunivocidad } from './biunivocity.js';
import type { StickerSpec } from './renderer.js';

function makeRecuadro(numero: number, conFoto: boolean): Recuadro {
  return {
    id: `rec-${numero}`,
    albumId: 'album-1',
    partidoOficialId: `part-${numero}`,
    plantillaId: 'pl-1',
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: conFoto ? `f${numero}` : null,
    estadoRecordatorio: conFoto ? 'DETENIDO_POR_FOTO' : 'ACTIVO',
  };
}

function sticker(numero: number): StickerSpec {
  return {
    recuadroId: `rec-${numero}`,
    numero,
    fotoObjectKey: `fotos/f${numero}.jpg`,
    guiaTroquelado: { numero, desviacionMm: 0 },
    holograma: false,
  };
}

describe('validarBiunivocidad — biyección exacta (Property 25)', () => {
  it('acepta la biyección con numeración no contigua (huecos válidos)', () => {
    const recuadros = [
      makeRecuadro(1, true),
      makeRecuadro(2, false), // vacío: hueco esperado
      makeRecuadro(3, true),
      makeRecuadro(4, true),
    ];
    const stickers = [sticker(1), sticker(3), sticker(4)];
    const r = validarBiunivocidad(recuadros, stickers);
    expect(r.esBiunivoca).toBe(true);
    expect(r.discrepancias).toHaveLength(0);
    expect(r.esperados).toBe(3);
    expect(r.generados).toBe(3);
  });

  it('acepta el álbum vacío (0 stickers, 0 recuadros con foto)', () => {
    const r = validarBiunivocidad([makeRecuadro(1, false)], []);
    expect(r.esBiunivoca).toBe(true);
  });
});

describe('validarBiunivocidad — discrepancias (Req 18.7)', () => {
  it('detecta discrepancia de conteo', () => {
    const recuadros = [makeRecuadro(1, true), makeRecuadro(2, true)];
    const r = validarBiunivocidad(recuadros, [sticker(1)]);
    expect(r.esBiunivoca).toBe(false);
    expect(r.discrepancias.some((d) => d.tipo === 'CONTEO')).toBe(true);
  });

  it('detecta número faltante', () => {
    const recuadros = [makeRecuadro(1, true), makeRecuadro(2, true)];
    // Mismo conteo pero el 2 falta y aparece un 9 sobrante.
    const r = validarBiunivocidad(recuadros, [sticker(1), sticker(9)]);
    expect(r.esBiunivoca).toBe(false);
    expect(r.discrepancias.some((d) => d.tipo === 'FALTANTE')).toBe(true);
    expect(r.discrepancias.some((d) => d.tipo === 'SOBRANTE')).toBe(true);
  });

  it('detecta número duplicado', () => {
    const recuadros = [makeRecuadro(1, true), makeRecuadro(2, true)];
    const r = validarBiunivocidad(recuadros, [sticker(1), sticker(1)]);
    expect(r.esBiunivoca).toBe(false);
    expect(r.discrepancias.some((d) => d.tipo === 'DUPLICADO')).toBe(true);
  });
});
