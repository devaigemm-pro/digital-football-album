// Pruebas de SeasonSyncService — sincronización de la Temporada desde la API.
//
// Usa los repositorios in-memory reales y un `SportsApiClient` falso (sin red).
// Verifica que, dado un usuario con Club y una plantilla, `syncSeason`:
//   - crea una Temporada ACTIVA para la `temporadaExterna`,
//   - deriva el álbum con un Recuadro por Partido_Oficial (excluyendo amistosos),
//   - clasifica esClásico según las rivalidades del Club,
//   - es idempotente (no duplica temporada al re-sincronizar),
//   - y falla con un error claro si el usuario no tiene Club.

import { describe, expect, it } from 'vitest';

import { createInMemoryRepositories } from '../../persistence/in-memory/index.js';
import { ClassifierService } from '../classifier/classifier-service.js';
import { SeasonSyncNotFoundError, SeasonSyncService } from './season-sync-service.js';
import type { RawFichaPartido, RawFixture, SportsApiClient } from './types.js';

const TEMP_EXTERNA = '39:2023';

/** Cliente de API deportiva falso: devuelve un fixture fijo. */
class FakeSportsClient implements SportsApiClient {
  constructor(private readonly fixtures: readonly RawFixture[]) {}
  fetchFixtures(): Promise<readonly RawFixture[]> {
    return Promise.resolve(this.fixtures);
  }
  fetchFichaPartido(): Promise<RawFichaPartido> {
    return Promise.reject(new Error('no usado en este test'));
  }
  searchTeams(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
  leaguesForTeam(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
}

async function setup(fixtures: readonly RawFixture[], conClub = true) {
  const repos = createInMemoryRepositories();
  await repos.clubes.create({
    id: 'club-1',
    nombre: 'Test FC',
    paletaColores: { primario: '#111111', secundario: '#FFFFFF' },
    escudoUrl: 'https://cdn/e.png',
    activosVisuales: { estadioUrls: [], camisetaUrls: [] },
  });
  await repos.plantillas.create({
    id: 'plantilla-1',
    clubId: 'club-1',
    recuadroAnchoMm: 60,
    recuadroAltoMm: 85,
  });
  // Rivalidad para probar la clasificación de Clásico.
  await repos.rivalidades.create({
    id: 'riv-1',
    clubId: 'club-1',
    rivalNombre: 'Rival Clasico',
  });
  await repos.usuarios.create({
    id: 'user-1',
    proveedorAuth: 'email',
    email: 'u@x.com',
    clubId: conClub ? 'club-1' : null,
    zonaHoraria: 'UTC',
  });

  const classifier = new ClassifierService(repos.rivalidades);
  const service = new SeasonSyncService({
    usuarios: repos.usuarios,
    clubes: repos.clubes,
    temporadas: repos.temporadas,
    albumes: repos.albumes,
    partidos: repos.partidos,
    recuadros: repos.recuadros,
    plantillas: repos.plantillas,
    classifier,
    sportsClient: new FakeSportsClient(fixtures),
  });
  return { repos, service };
}

describe('SeasonSyncService.syncSeason', () => {
  it('crea la temporada ACTIVA y deriva un recuadro por partido oficial', async () => {
    const { repos, service } = await setup([
      { partidoExternoId: 'p1', competicion: 'Premier League', rival: 'Rival Clasico', fechaHora: '2023-08-10T20:00:00Z', estado: 'FINISHED' },
      { partidoExternoId: 'p2', competicion: 'Premier League', rival: 'Otro', fechaHora: '2023-08-17T20:00:00Z', estado: 'NS' },
    ]);

    const result = await service.syncSeason('user-1', TEMP_EXTERNA);

    expect(result.recuadros).toBe(2);
    expect(result.partidos).toBe(2);

    const temps = await repos.temporadas.findByUsuarioId('user-1');
    expect(temps).toHaveLength(1);
    expect(temps[0]?.estado).toBe('ACTIVA');
    expect(temps[0]?.temporadaExterna).toBe(TEMP_EXTERNA);
  });

  it('clasifica esClasico según las rivalidades del club', async () => {
    const { repos, service } = await setup([
      { partidoExternoId: 'p1', competicion: 'Premier League', rival: 'Rival Clasico', fechaHora: '2023-08-10T20:00:00Z', estado: 'FINISHED' },
    ]);
    await service.syncSeason('user-1', TEMP_EXTERNA);
    const partidos = await repos.partidos.findByTemporadaId(
      (await repos.temporadas.findByUsuarioId('user-1'))[0]!.id,
    );
    expect(partidos[0]?.esClasico).toBe(true);
  });

  it('es idempotente: re-sincronizar no duplica la temporada', async () => {
    const { repos, service } = await setup([
      { partidoExternoId: 'p1', competicion: 'Premier League', rival: 'Otro', fechaHora: '2023-08-10T20:00:00Z', estado: 'NS' },
    ]);
    await service.syncSeason('user-1', TEMP_EXTERNA);
    await service.syncSeason('user-1', TEMP_EXTERNA);
    const temps = await repos.temporadas.findByUsuarioId('user-1');
    expect(temps).toHaveLength(1);
  });

  it('falla con error claro si el usuario no tiene club', async () => {
    const { service } = await setup([], false);
    await expect(service.syncSeason('user-1', TEMP_EXTERNA)).rejects.toBeInstanceOf(
      SeasonSyncNotFoundError,
    );
  });
});
