// Pruebas unitarias de `syncPartidoFinalizado` (Task 8.4).
//
// Cubren: obtención de la ficha (resultado, alineación, eventos) desde la API y
// su persistencia sobre el `PartidoOficial`, con transición del estado a
// `FINALIZADO`; uso del `partidoExternoId` correcto al llamar al cliente;
// propagación de la señal de cancelación; idempotencia; y error cuando el
// partido no existe. El repositorio y el cliente se inyectan como dobles: nunca
// se toca la red ni una base de datos viva.
//
// Requirements: 9.3

import { describe, expect, it } from 'vitest';

import type { PartidoOficial } from '../../domain/types.js';
import { createInMemoryRepositories } from '../../persistence/in-memory/factory.js';
import type { PartidoOficialRepository } from '../../persistence/repositories.js';
import { PartidoNoEncontradoError, syncPartidoFinalizado } from './sync-finalizado.js';
import type { RawFichaPartido, RawFixture, SportsApiClient } from './types.js';

function makePartido(overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: 'partido-1',
    temporadaId: 'temp-1',
    partidoExternoId: 'ext-99',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'EN_CURSO',
    esClasico: false,
    esInternacional: false,
    resultado: null,
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

const FICHA: RawFichaPartido = {
  partidoExternoId: 'ext-99',
  resultado: { golesLocal: 2, golesVisita: 1 },
  alineacion: [
    { id: 'j1', nombre: 'Jugador Uno' },
    { id: 'j2', nombre: 'Jugador Dos' },
  ],
  eventos: [
    { minuto: 12, tipo: 'GOL', descripcion: 'Cabezazo' },
    { minuto: 60, tipo: 'TARJETA_AMARILLA' },
  ],
};

/** Cliente de prueba que devuelve una ficha fija y registra las llamadas. */
function makeClient(ficha: RawFichaPartido): {
  client: SportsApiClient;
  calls: () => { id: string; signal: AbortSignal | undefined }[];
} {
  const calls: { id: string; signal: AbortSignal | undefined }[] = [];
  const client: SportsApiClient = {
    fetchFixtures: (): Promise<readonly RawFixture[]> => {
      throw new Error('no usado en estas pruebas');
    },
    fetchFichaPartido: (partidoExternoId: string, signal?: AbortSignal) => {
      calls.push({ id: partidoExternoId, signal });
      return Promise.resolve(ficha);
    },
    searchTeams: () => Promise.resolve([]),
    leaguesForTeam: () => Promise.resolve([]),
    listCountries: () => Promise.resolve([]),
    leaguesByCountry: () => Promise.resolve([]),
    teamsByLeague: () => Promise.resolve([]),
  };
  return { client, calls: () => calls };
}

async function seedPartido(partido: PartidoOficial): Promise<PartidoOficialRepository> {
  const repos = createInMemoryRepositories();
  await repos.partidos.create(partido);
  return repos.partidos;
}

describe('syncPartidoFinalizado', () => {
  it('obtiene la ficha y la persiste dejando el partido FINALIZADO', async () => {
    const partidoRepository = await seedPartido(makePartido());
    const { client, calls } = makeClient(FICHA);

    const actualizado = await syncPartidoFinalizado('partido-1', {
      partidoRepository,
      client,
    });

    // Llama a la API con el identificador EXTERNO del partido.
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.id).toBe('ext-99');

    // Persiste la ficha y transiciona el estado.
    expect(actualizado.estado).toBe('FINALIZADO');
    expect(actualizado.resultado).toEqual({ golesLocal: 2, golesVisita: 1 });
    expect(actualizado.alineacion).toEqual([
      { id: 'j1', nombre: 'Jugador Uno' },
      { id: 'j2', nombre: 'Jugador Dos' },
    ]);
    expect(actualizado.eventos).toEqual([
      { minuto: 12, tipo: 'GOL', descripcion: 'Cabezazo' },
      { minuto: 60, tipo: 'TARJETA_AMARILLA' },
    ]);

    // El cambio quedó persistido (no solo devuelto).
    const persistido = await partidoRepository.findById('partido-1');
    expect(persistido?.estado).toBe('FINALIZADO');
    expect(persistido?.resultado).toEqual({ golesLocal: 2, golesVisita: 1 });
  });

  it('omite la descripción del evento cuando la API no la reporta', async () => {
    const partidoRepository = await seedPartido(makePartido());
    const ficha: RawFichaPartido = {
      ...FICHA,
      eventos: [{ minuto: 30, tipo: 'GOL' }],
    };
    const { client } = makeClient(ficha);

    const actualizado = await syncPartidoFinalizado('partido-1', {
      partidoRepository,
      client,
    });

    expect(actualizado.eventos).toEqual([{ minuto: 30, tipo: 'GOL' }]);
    expect(actualizado.eventos[0]).not.toHaveProperty('descripcion');
  });

  it('propaga la señal de cancelación al cliente', async () => {
    const partidoRepository = await seedPartido(makePartido());
    const { client, calls } = makeClient(FICHA);
    const controller = new AbortController();

    await syncPartidoFinalizado('partido-1', {
      partidoRepository,
      client,
      signal: controller.signal,
    });

    expect(calls()[0]?.signal).toBe(controller.signal);
  });

  it('es idempotente: reejecutar fija la misma ficha', async () => {
    const partidoRepository = await seedPartido(makePartido());
    const { client } = makeClient(FICHA);

    const primero = await syncPartidoFinalizado('partido-1', {
      partidoRepository,
      client,
    });
    const segundo = await syncPartidoFinalizado('partido-1', {
      partidoRepository,
      client,
    });

    expect(segundo).toEqual(primero);
  });

  it('lanza PartidoNoEncontradoError si el partido no existe', async () => {
    const partidoRepository = await seedPartido(makePartido());
    const { client, calls } = makeClient(FICHA);

    await expect(
      syncPartidoFinalizado('inexistente', { partidoRepository, client }),
    ).rejects.toBeInstanceOf(PartidoNoEncontradoError);

    // No debe llamar a la API si el partido no existe.
    expect(calls()).toHaveLength(0);
  });
});
