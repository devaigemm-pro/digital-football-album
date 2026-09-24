// Pruebas unitarias del saneamiento de fixtures (`syncFixture`, Task 8.2).
//
// Cubren: conservación de registros válidos, descarte selectivo de inválidos
// (id/fecha ausente o inválido) con su motivo, registro del motivo vía logger,
// mapeo a formas listas para `PartidoOficial` (normalización de fecha, recorte
// de texto, estado por defecto), fixtures mixtos y casos de borde (lista vacía).
// El cliente se inyecta como doble en memoria: nunca se toca la red.
//
// Requirements: 9.1, 9.2

import { describe, expect, it, vi } from 'vitest';

import type { RawFichaPartido, RawFixture, SportsApiClient } from './types.js';
import { type FixtureDescartado, syncFixture } from './sync-fixture.js';

/** Cliente de prueba que devuelve una lista fija de fixtures crudos. */
function makeClient(fixtures: readonly RawFixture[]): {
  client: SportsApiClient;
  fetchCalls: () => number;
} {
  let fetchCalls = 0;
  const client: SportsApiClient = {
    fetchFixtures: (_temporadaExterna: string): Promise<readonly RawFixture[]> => {
      fetchCalls++;
      return Promise.resolve(fixtures);
    },
    fetchFichaPartido: (): Promise<RawFichaPartido> => {
      throw new Error('no usado en estas pruebas');
    },
    searchTeams: () => Promise.resolve([]),
    leaguesForTeam: () => Promise.resolve([]),
  };
  return { client, fetchCalls: () => fetchCalls };
}

const VALIDO: RawFixture = {
  partidoExternoId: 'p1',
  competicion: 'Liga',
  rival: 'Rival FC',
  fechaHora: '2025-05-01T20:00:00.000Z',
  estado: 'PROGRAMADO',
};

describe('syncFixture', () => {
  it('conserva los fixtures válidos y los mapea a formas listas para PartidoOficial', async () => {
    const { client, fetchCalls } = makeClient([VALIDO]);

    const result = await syncFixture('2024-2025', { client });

    expect(fetchCalls()).toBe(1);
    expect(result.descartados).toEqual([]);
    expect(result.validos).toEqual([
      {
        partidoExternoId: 'p1',
        competicion: 'Liga',
        rival: 'Rival FC',
        fechaHora: '2025-05-01T20:00:00.000Z',
        estado: 'PROGRAMADO',
      },
    ]);
  });

  it('descarta solo los inválidos y conserva los válidos en un fixture mixto', async () => {
    const idAusente = { competicion: 'Liga', fechaHora: '2025-05-02T20:00:00.000Z' } as RawFixture;
    const fechaAusente = { partidoExternoId: 'p3', competicion: 'Copa' } as RawFixture;
    const fechaInvalida: RawFixture = {
      partidoExternoId: 'p4',
      fechaHora: 'no-es-una-fecha',
    };
    const otroValido: RawFixture = {
      partidoExternoId: 'p5',
      competicion: 'Internacional',
      rival: 'Otro',
      fechaHora: '2025-06-10T18:30:00.000Z',
      estado: 'FINALIZADO',
    };

    const { client } = makeClient([VALIDO, idAusente, fechaAusente, fechaInvalida, otroValido]);

    const result = await syncFixture('2024-2025', { client });

    // Los dos válidos se conservan (orden preservado).
    expect(result.validos.map((v) => v.partidoExternoId)).toEqual(['p1', 'p5']);
    // Los tres inválidos se descartan con su motivo.
    expect(result.descartados).toEqual<FixtureDescartado[]>([
      { rawRecord: idAusente, motivo: 'ID_AUSENTE' },
      { rawRecord: fechaAusente, motivo: 'FECHA_HORA_AUSENTE' },
      { rawRecord: fechaInvalida, motivo: 'FECHA_HORA_INVALIDA' },
    ]);
  });

  it('clasifica el motivo de un id vacío o en blanco como ID_INVALIDO', async () => {
    const idVacio: RawFixture = { partidoExternoId: '', fechaHora: '2025-05-01T20:00:00.000Z' };
    const idBlanco: RawFixture = { partidoExternoId: '   ', fechaHora: '2025-05-01T20:00:00.000Z' };
    const { client } = makeClient([idVacio, idBlanco]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos).toEqual([]);
    expect(result.descartados.map((d) => d.motivo)).toEqual(['ID_INVALIDO', 'ID_INVALIDO']);
  });

  it('descarta registros con valores nulos o de tipo incorrecto (API no confiable)', async () => {
    // La API externa no es confiable: puede violar el tipo declarado en runtime.
    const idNulo = {
      partidoExternoId: null,
      fechaHora: '2025-05-01T20:00:00.000Z',
    } as unknown as RawFixture;
    const fechaNumerica = { partidoExternoId: 'p9', fechaHora: 12345 } as unknown as RawFixture;
    const { client } = makeClient([idNulo, fechaNumerica]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos).toEqual([]);
    expect(result.descartados.map((d) => d.motivo)).toEqual(['ID_AUSENTE', 'FECHA_HORA_INVALIDA']);
  });

  it('registra el motivo de cada descarte mediante el logger', async () => {
    const idAusente = { fechaHora: '2025-05-02T20:00:00.000Z' } as RawFixture;
    const fechaInvalida: RawFixture = { partidoExternoId: 'p2', fechaHora: 'xxx' };
    const { client } = makeClient([VALIDO, idAusente, fechaInvalida]);
    const logger = vi.fn();

    const result = await syncFixture('2024-2025', { client, logger });

    expect(logger).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenNthCalledWith(1, { rawRecord: idAusente, motivo: 'ID_AUSENTE' });
    expect(logger).toHaveBeenNthCalledWith(2, {
      rawRecord: fechaInvalida,
      motivo: 'FECHA_HORA_INVALIDA',
    });
    // El logger no se invoca por los válidos.
    expect(result.validos).toHaveLength(1);
  });

  it('normaliza la fecha/hora a ISO 8601 canónico (UTC)', async () => {
    const conOffset: RawFixture = {
      partidoExternoId: 'p1',
      fechaHora: '2025-05-01T15:00:00-05:00',
    };
    const { client } = makeClient([conOffset]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos[0]?.fechaHora).toBe('2025-05-01T20:00:00.000Z');
  });

  it('recorta el texto y usa cadena vacía para competicion/rival ausentes', async () => {
    const parcial: RawFixture = {
      partidoExternoId: '  p1  ',
      fechaHora: '2025-05-01T20:00:00.000Z',
    };
    const { client } = makeClient([parcial]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos[0]).toMatchObject({
      partidoExternoId: 'p1',
      competicion: '',
      rival: '',
    });
  });

  it('degrada un estado ausente o desconocido a PROGRAMADO', async () => {
    const sinEstado: RawFixture = { partidoExternoId: 'p1', fechaHora: '2025-05-01T20:00:00.000Z' };
    const estadoRaro: RawFixture = {
      partidoExternoId: 'p2',
      fechaHora: '2025-05-02T20:00:00.000Z',
      estado: 'SUSPENDIDO',
    };
    const finalizado: RawFixture = {
      partidoExternoId: 'p3',
      fechaHora: '2025-05-03T20:00:00.000Z',
      estado: 'finalizado',
    };
    const { client } = makeClient([sinEstado, estadoRaro, finalizado]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos.map((v) => v.estado)).toEqual(['PROGRAMADO', 'PROGRAMADO', 'FINALIZADO']);
  });

  it('devuelve listas vacías cuando la API no retorna fixtures', async () => {
    const { client } = makeClient([]);

    const result = await syncFixture('2024-2025', { client });

    expect(result.validos).toEqual([]);
    expect(result.descartados).toEqual([]);
  });

  it('propaga la señal de cancelación al cliente', async () => {
    const controller = new AbortController();
    let recibida: AbortSignal | undefined;
    const client: SportsApiClient = {
      fetchFixtures: (_temporada: string, signal?: AbortSignal) => {
        recibida = signal;
        return Promise.resolve([VALIDO]);
      },
      fetchFichaPartido: (): Promise<RawFichaPartido> => {
        throw new Error('no usado');
      },
      searchTeams: () => Promise.resolve([]),
      leaguesForTeam: () => Promise.resolve([]),
    };

    await syncFixture('2024-2025', { client, signal: controller.signal });

    expect(recibida).toBe(controller.signal);
  });
});
