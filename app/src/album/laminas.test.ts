// Pruebas unitarias de la lógica pura de láminas (laminas.ts):
//   - Feature 5 · realce Clásico/Internacional (con prioridad del Clásico).
//   - Feature 1 · progreso real de la temporada (solo cuenta recuadros).
//   - Feature 4 · agrupación por competición (orden y progreso por grupo).
//
// TypeScript puro sin React Native ni red. Usa el shim central de globales de
// Jest (app/src/testing/jest-globals.d.ts).

import type { PartidoLamina, TipoCompeticion } from '../adapters/http-profile-client';
import {
  agruparLaminasPorCompeticion,
  derivarProgresoTemporada,
  etiquetaProgreso,
  etiquetaRealce,
  realceLamina,
  tieneRealceEspecial,
} from './laminas';

/** Construye una `PartidoLamina` mínima; sobrescribe solo lo relevante al test. */
function lamina(overrides: Partial<PartidoLamina> = {}): PartidoLamina {
  return {
    partidoId: overrides.partidoId ?? 'p-1',
    rival: overrides.rival ?? 'Rival FC',
    competicion: overrides.competicion ?? 'Liga',
    tipoCompeticion: overrides.tipoCompeticion ?? 'LIGA',
    fechaHora: overrides.fechaHora ?? '2026-03-10T22:00:00.000Z',
    estado: overrides.estado ?? 'FINALIZADO',
    esClasico: overrides.esClasico ?? false,
    esInternacional: overrides.esInternacional ?? false,
    resultado: overrides.resultado ?? null,
    numeroRecuadro:
      overrides.numeroRecuadro === undefined ? 1 : overrides.numeroRecuadro,
    tieneFotoPrincipal: overrides.tieneFotoPrincipal ?? false,
  };
}

describe('realceLamina (Feature 5)', () => {
  it('marca "clasico" cuando el partido es clásico', () => {
    expect(realceLamina({ esClasico: true, esInternacional: false })).toBe(
      'clasico',
    );
  });

  it('marca "internacional" cuando es internacional pero no clásico', () => {
    expect(realceLamina({ esClasico: false, esInternacional: true })).toBe(
      'internacional',
    );
  });

  it('prioriza "clasico" cuando es clásico E internacional a la vez', () => {
    expect(realceLamina({ esClasico: true, esInternacional: true })).toBe(
      'clasico',
    );
  });

  it('marca "normal" cuando no es ni clásico ni internacional', () => {
    expect(realceLamina({ esClasico: false, esInternacional: false })).toBe(
      'normal',
    );
  });

  it('tieneRealceEspecial es true salvo para láminas normales', () => {
    expect(tieneRealceEspecial({ esClasico: true, esInternacional: false })).toBe(true);
    expect(tieneRealceEspecial({ esClasico: false, esInternacional: true })).toBe(true);
    expect(tieneRealceEspecial({ esClasico: false, esInternacional: false })).toBe(false);
  });

  it('etiquetaRealce devuelve el texto del badge o null', () => {
    expect(etiquetaRealce({ esClasico: true, esInternacional: false })).toBe('CLÁSICO');
    expect(etiquetaRealce({ esClasico: false, esInternacional: true })).toBe('INTERNACIONAL');
    expect(etiquetaRealce({ esClasico: false, esInternacional: false })).toBeNull();
  });
});

describe('derivarProgresoTemporada (Feature 1)', () => {
  it('cuenta montadas sobre el total de recuadros', () => {
    const partidos = [
      lamina({ partidoId: 'a', numeroRecuadro: 1, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'b', numeroRecuadro: 2, tieneFotoPrincipal: false }),
      lamina({ partidoId: 'c', numeroRecuadro: 3, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'd', numeroRecuadro: 4, tieneFotoPrincipal: false }),
    ];
    const progreso = derivarProgresoTemporada(partidos);
    expect(progreso.montadas).toBe(2);
    expect(progreso.total).toBe(4);
    expect(progreso.faltantes).toBe(2);
    expect(progreso.ratio).toBeCloseTo(0.5, 5);
    expect(progreso.porcentaje).toBe(50);
  });

  it('IGNORA los partidos sin recuadro derivado (numeroRecuadro null)', () => {
    const partidos = [
      lamina({ partidoId: 'a', numeroRecuadro: 1, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'b', numeroRecuadro: null, tieneFotoPrincipal: false }),
      lamina({ partidoId: 'c', numeroRecuadro: null, tieneFotoPrincipal: true }),
    ];
    const progreso = derivarProgresoTemporada(partidos);
    // Solo 1 recuadro real, montado.
    expect(progreso.total).toBe(1);
    expect(progreso.montadas).toBe(1);
    expect(progreso.porcentaje).toBe(100);
  });

  it('devuelve progreso vacío (sin NaN) cuando no hay recuadros', () => {
    const progreso = derivarProgresoTemporada([
      lamina({ numeroRecuadro: null }),
    ]);
    expect(progreso).toEqual({
      montadas: 0,
      total: 0,
      faltantes: 0,
      ratio: 0,
      porcentaje: 0,
    });
  });

  it('nunca produce faltantes negativos ni ratio fuera de [0,1]', () => {
    const partidos = [
      lamina({ partidoId: 'a', numeroRecuadro: 1, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'b', numeroRecuadro: 2, tieneFotoPrincipal: true }),
    ];
    const progreso = derivarProgresoTemporada(partidos);
    expect(progreso.faltantes).toBe(0);
    expect(progreso.ratio).toBeGreaterThanOrEqual(0);
    expect(progreso.ratio).toBeLessThanOrEqual(1);
    expect(progreso.porcentaje).toBe(100);
  });

  it('etiquetaProgreso arma "X de Y láminas · temporada Z"', () => {
    const progreso = derivarProgresoTemporada([
      lamina({ numeroRecuadro: 1, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'b', numeroRecuadro: 2, tieneFotoPrincipal: false }),
    ]);
    expect(etiquetaProgreso(progreso, '2026')).toBe(
      '1 de 2 láminas · temporada 2026',
    );
  });

  it('etiquetaProgreso omite la temporada cuando es null o vacía', () => {
    const progreso = derivarProgresoTemporada([
      lamina({ numeroRecuadro: 1, tieneFotoPrincipal: true }),
    ]);
    expect(etiquetaProgreso(progreso, null)).toBe('1 de 1 láminas');
    expect(etiquetaProgreso(progreso, '   ')).toBe('1 de 1 láminas');
  });
});

describe('agruparLaminasPorCompeticion (Feature 4)', () => {
  it('agrupa por competición en el orden Liga → Copa → Internacional', () => {
    const partidos = [
      lamina({ partidoId: 'i', tipoCompeticion: 'INTERNACIONAL', numeroRecuadro: 5 }),
      lamina({ partidoId: 'l', tipoCompeticion: 'LIGA', numeroRecuadro: 1 }),
      lamina({ partidoId: 'c', tipoCompeticion: 'COPA_NACIONAL', numeroRecuadro: 3 }),
    ];
    const grupos = agruparLaminasPorCompeticion(partidos);
    expect(grupos.map((g) => g.tipo)).toEqual([
      'LIGA',
      'COPA_NACIONAL',
      'INTERNACIONAL',
    ]);
    expect(grupos.map((g) => g.titulo)).toEqual([
      'Liga',
      'Copa nacional',
      'Internacional',
    ]);
  });

  it('ordena las láminas de cada grupo por número de recuadro ascendente', () => {
    const partidos = [
      lamina({ partidoId: 'l3', tipoCompeticion: 'LIGA', numeroRecuadro: 7 }),
      lamina({ partidoId: 'l1', tipoCompeticion: 'LIGA', numeroRecuadro: 2 }),
      lamina({ partidoId: 'l2', tipoCompeticion: 'LIGA', numeroRecuadro: 4 }),
    ];
    const [liga] = agruparLaminasPorCompeticion(partidos);
    expect(liga?.laminas.map((l) => l.numeroRecuadro)).toEqual([2, 4, 7]);
  });

  it('calcula el progreso de cada grupo por separado', () => {
    const partidos = [
      lamina({ partidoId: 'l1', tipoCompeticion: 'LIGA', numeroRecuadro: 1, tieneFotoPrincipal: true }),
      lamina({ partidoId: 'l2', tipoCompeticion: 'LIGA', numeroRecuadro: 2, tieneFotoPrincipal: false }),
      lamina({ partidoId: 'c1', tipoCompeticion: 'COPA_NACIONAL', numeroRecuadro: 3, tieneFotoPrincipal: true }),
    ];
    const grupos = agruparLaminasPorCompeticion(partidos);
    const liga = grupos.find((g) => g.tipo === 'LIGA');
    const copa = grupos.find((g) => g.tipo === 'COPA_NACIONAL');
    expect(liga?.progreso.montadas).toBe(1);
    expect(liga?.progreso.total).toBe(2);
    expect(copa?.progreso.montadas).toBe(1);
    expect(copa?.progreso.total).toBe(1);
  });

  it('omite competiciones sin láminas y partidos sin recuadro', () => {
    const partidos = [
      lamina({ partidoId: 'l1', tipoCompeticion: 'LIGA', numeroRecuadro: 1 }),
      lamina({ partidoId: 'x', tipoCompeticion: 'COPA_NACIONAL', numeroRecuadro: null }),
    ];
    const grupos = agruparLaminasPorCompeticion(partidos);
    expect(grupos.map((g) => g.tipo)).toEqual(['LIGA']);
  });

  it('no muta el arreglo de entrada al ordenar', () => {
    const partidos: readonly PartidoLamina[] = [
      lamina({ partidoId: 'l2', tipoCompeticion: 'LIGA', numeroRecuadro: 5 }),
      lamina({ partidoId: 'l1', tipoCompeticion: 'LIGA', numeroRecuadro: 1 }),
    ];
    const antes = partidos.map((p) => p.partidoId);
    agruparLaminasPorCompeticion(partidos);
    expect(partidos.map((p) => p.partidoId)).toEqual(antes);
  });

  it('devuelve arreglo vacío cuando no hay láminas con recuadro', () => {
    const tipos: TipoCompeticion[] = ['LIGA', 'COPA_NACIONAL', 'INTERNACIONAL'];
    const partidos = tipos.map((t, i) =>
      lamina({ partidoId: `x${i}`, tipoCompeticion: t, numeroRecuadro: null }),
    );
    expect(agruparLaminasPorCompeticion(partidos)).toEqual([]);
  });
});
