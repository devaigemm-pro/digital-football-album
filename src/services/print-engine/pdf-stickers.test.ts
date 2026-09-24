/**
 * Pruebas unitarias de la composición del PDF_Stickers (Task 15.3 — Req 18.1,
 * 18.2, 18.3, 18.5, 18.6).
 *
 * Cubren:
 *  - Un sticker por Recuadro con Foto_Principal, omitiendo vacíos (Req 18.1, 18.2).
 *  - Numeración heredada del Recuadro, posiblemente NO contigua (Req 18.1, design.md).
 *  - Guías de troquelado con desviación ≤0,5 mm (Req 18.3, Property 26).
 *  - Efecto holograma por plan y clasificación (Req 18.5, 18.6, Property 27).
 *  - Fallo de procesamiento si una Foto_Principal no es resoluble (Req 18.8).
 */
import { describe, it, expect } from 'vitest';
import type { PartidoOficial, Recuadro, UUID } from '../../domain/types.js';
import { entitlementsForPlan } from '../subscription/entitlements.js';
import {
  buildPdfStickersSpec,
  debeAplicarHolograma,
  FotoPrincipalNoResoluble,
  TOLERANCIA_TROQUELADO_MM,
} from './pdf-stickers.js';

const TEMPORADA_ID = 'temp-1' as UUID;

function makeRecuadro(numero: number, fotoPrincipalId: UUID | null): Recuadro {
  return {
    id: `rec-${numero}`,
    albumId: 'album-1',
    partidoOficialId: `part-${numero}`,
    plantillaId: 'pl-1',
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId,
    estadoRecordatorio: fotoPrincipalId ? 'DETENIDO_POR_FOTO' : 'ACTIVO',
  };
}

function makePartido(numero: number, overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: `part-${numero}`,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: `ext-${numero}`,
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: { golesLocal: 1, golesVisita: 0 },
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

function partidoMap(partidos: PartidoOficial[]): ReadonlyMap<UUID, PartidoOficial> {
  return new Map(partidos.map((p) => [p.id, p]));
}

const resolver = (id: UUID): string | null => `fotos/${id}.jpg`;

describe('buildPdfStickersSpec — un sticker por Recuadro con foto, omitiendo vacíos (Req 18.1, 18.2)', () => {
  it('omite Recuadros vacíos y produce numeración heredada no contigua', () => {
    // Recuadros 1,3,4,7 con foto; 2,5,6 vacíos → secuencia 1,3,4,7 (con huecos).
    const recuadros = [
      makeRecuadro(1, 'f1'),
      makeRecuadro(2, null),
      makeRecuadro(3, 'f3'),
      makeRecuadro(4, 'f4'),
      makeRecuadro(5, null),
      makeRecuadro(6, null),
      makeRecuadro(7, 'f7'),
    ];
    const spec = buildPdfStickersSpec({
      temporadaId: TEMPORADA_ID,
      recuadros,
      partidoPorId: partidoMap(recuadros.map((r) => makePartido(r.numero))),
      entitlements: entitlementsForPlan('BASICO'),
      resolverFoto: resolver,
    });

    expect(spec.stickers.map((s) => s.numero)).toEqual([1, 3, 4, 7]);
    expect(spec.stickers).toHaveLength(4);
    // Numeración heredada, sin renumeración densa.
    expect(spec.stickers.map((s) => s.numero)).not.toEqual([1, 2, 3, 4]);
  });

  it('incluye guías de troquelado con desviación ≤0,5 mm (Property 26)', () => {
    const recuadros = [makeRecuadro(1, 'f1')];
    const spec = buildPdfStickersSpec({
      temporadaId: TEMPORADA_ID,
      recuadros,
      partidoPorId: partidoMap([makePartido(1)]),
      entitlements: entitlementsForPlan('PREMIUM'),
      resolverFoto: resolver,
    });
    for (const sticker of spec.stickers) {
      expect(sticker.guiaTroquelado.desviacionMm).toBeLessThanOrEqual(TOLERANCIA_TROQUELADO_MM);
      expect(sticker.guiaTroquelado.numero).toBe(sticker.numero);
    }
  });

  it('lanza fallo de procesamiento si una Foto_Principal no es resoluble (Req 18.8)', () => {
    const recuadros = [makeRecuadro(1, 'f1')];
    expect(() =>
      buildPdfStickersSpec({
        temporadaId: TEMPORADA_ID,
        recuadros,
        partidoPorId: partidoMap([makePartido(1)]),
        entitlements: entitlementsForPlan('PREMIUM'),
        resolverFoto: () => null,
      }),
    ).toThrow(FotoPrincipalNoResoluble);
  });
});

describe('debeAplicarHolograma — plan × clasificación (Property 27, Req 18.5, 18.6)', () => {
  const premium = entitlementsForPlan('PREMIUM');
  const basico = entitlementsForPlan('BASICO');

  it('aplica holograma a Clásico/Internacional SOLO con Plan_Premium', () => {
    expect(debeAplicarHolograma({ esClasico: true, esInternacional: false }, premium)).toBe(true);
    expect(debeAplicarHolograma({ esClasico: false, esInternacional: true }, premium)).toBe(true);
    expect(debeAplicarHolograma({ esClasico: true, esInternacional: false }, basico)).toBe(false);
    expect(debeAplicarHolograma({ esClasico: false, esInternacional: true }, basico)).toBe(false);
  });

  it('nunca aplica holograma a partidos no clasificados, ni siquiera con Premium', () => {
    expect(debeAplicarHolograma({ esClasico: false, esInternacional: false }, premium)).toBe(false);
    expect(debeAplicarHolograma({ esClasico: false, esInternacional: false }, basico)).toBe(false);
  });

  it('marca el holograma en la spec según clasificación y plan', () => {
    const recuadros = [
      makeRecuadro(1, 'f1'), // liga normal
      makeRecuadro(2, 'f2'), // clásico
      makeRecuadro(3, 'f3'), // internacional
    ];
    const partidos = [
      makePartido(1),
      makePartido(2, { esClasico: true }),
      makePartido(3, { esInternacional: true, tipoCompeticion: 'INTERNACIONAL' }),
    ];
    const specPremium = buildPdfStickersSpec({
      temporadaId: TEMPORADA_ID,
      recuadros,
      partidoPorId: partidoMap(partidos),
      entitlements: entitlementsForPlan('PREMIUM'),
      resolverFoto: resolver,
    });
    expect(specPremium.stickers.find((s) => s.numero === 1)?.holograma).toBe(false);
    expect(specPremium.stickers.find((s) => s.numero === 2)?.holograma).toBe(true);
    expect(specPremium.stickers.find((s) => s.numero === 3)?.holograma).toBe(true);

    const specBasico = buildPdfStickersSpec({
      temporadaId: TEMPORADA_ID,
      recuadros,
      partidoPorId: partidoMap(partidos),
      entitlements: entitlementsForPlan('BASICO'),
      resolverFoto: resolver,
    });
    // Plan_Básico: los mismos Clásico/Internacional se generan SIN holograma (Req 18.6).
    expect(specBasico.stickers.every((s) => s.holograma === false)).toBe(true);
  });
});
