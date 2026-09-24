/**
 * Prueba de humo del helper de PBT y del runner de pruebas.
 * Verifica que el scaffold (Task 1) esté operativo: fast-check integrado,
 * `numRuns: 100` por defecto y generadores base disponibles.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_NUM_RUNS, DEFAULT_PBT_PARAMS, pbtAssert, fc, gen } from './pbt';

describe('helper de PBT', () => {
  it('fija numRuns=100 por defecto', () => {
    expect(DEFAULT_NUM_RUNS).toBe(100);
    expect(DEFAULT_PBT_PARAMS.numRuns).toBe(100);
  });

  it('pbtAssert ejecuta una propiedad trivial con los parámetros por defecto', () => {
    pbtAssert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      }),
    );
  });

  it('permite sobreescribir parámetros puntuales (numRuns)', () => {
    let runs = 0;
    pbtAssert(
      fc.property(fc.integer(), () => {
        runs += 1;
        return true;
      }),
      { numRuns: 10 },
    );
    expect(runs).toBe(10);
  });

  it('expone generadores base reutilizables', () => {
    const arbitraries: fc.Arbitrary<unknown>[] = [
      gen.uuid(),
      gen.timezone(),
      gen.plan(),
      gen.tipoCompeticion(),
      gen.tipoCompeticionOficial(),
      gen.dimensionMm(),
      gen.dimensionPx(),
      gen.estadoTemporada(),
    ];
    for (const arb of arbitraries) {
      const sample = fc.sample(arb, 1);
      expect(sample).toHaveLength(1);
    }
  });

  it('el generador de tipo oficial nunca produce AMISTOSO', () => {
    pbtAssert(
      fc.property(gen.tipoCompeticionOficial(), (tipo) => {
        return (tipo as string) !== 'AMISTOSO';
      }),
    );
  });
});
