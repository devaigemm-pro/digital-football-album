// Pruebas del OnboardingService — filtro de divisiones y upsert de equipo.
//
// Usa repos in-memory reales y un `SportsApiClient` falso. Cubre:
//   - leaguesByCountry devuelve SOLO divisiones (type League), sin copas, y
//     como mucho las 2 principales;
//   - selectEquipoReal crea el Club real (idempotente) y lo asigna al usuario.

import { describe, expect, it } from 'vitest';

import { createInMemoryRepositories } from '../../persistence/in-memory/index.js';
import { OnboardingService } from './onboarding-service.js';
import type {
  RawEquipo,
  RawFichaPartido,
  RawFixture,
  RawLigaEquipo,
  RawLigaPais,
  RawPais,
  SportsApiClient,
} from './types.js';

/** Cliente falso configurable para las ligas por país. */
class FakeSportsClient implements SportsApiClient {
  constructor(private readonly ligasPais: readonly RawLigaPais[] = []) {}
  fetchFixtures(): Promise<readonly RawFixture[]> {
    return Promise.resolve([]);
  }
  fetchFichaPartido(): Promise<RawFichaPartido> {
    return Promise.reject(new Error('no usado'));
  }
  searchTeams(): Promise<readonly RawEquipo[]> {
    return Promise.resolve([]);
  }
  leaguesForTeam(): Promise<readonly RawLigaEquipo[]> {
    return Promise.resolve([]);
  }
  listCountries(): Promise<readonly RawPais[]> {
    return Promise.resolve([]);
  }
  leaguesByCountry(): Promise<readonly RawLigaPais[]> {
    return Promise.resolve(this.ligasPais);
  }
  teamsByLeague(): Promise<readonly RawEquipo[]> {
    return Promise.resolve([]);
  }
}

function servicio(ligasPais: readonly RawLigaPais[] = []): OnboardingService {
  const repos = createInMemoryRepositories();
  return new OnboardingService({
    usuarios: repos.usuarios,
    clubes: repos.clubes,
    plantillas: repos.plantillas,
    sportsClient: new FakeSportsClient(ligasPais),
  });
}

describe('OnboardingService.leaguesByCountry', () => {
  it('excluye copas y deja solo divisiones de liga', async () => {
    const svc = servicio([
      { ligaId: '527', nombre: 'Super Cup', tipo: 'Cup', temporadas: [] } as unknown as RawLigaPais,
      { ligaId: '265', nombre: 'Primera División', tipo: 'League', temporadas: [] } as unknown as RawLigaPais,
      { ligaId: '267', nombre: 'Copa Chile', tipo: 'Cup', temporadas: [] } as unknown as RawLigaPais,
      { ligaId: '266', nombre: 'Primera B', tipo: 'League', temporadas: [] } as unknown as RawLigaPais,
    ]);
    const ligas = await svc.leaguesByCountry('Chile', 2023);
    expect(ligas.map((l) => l.nombre)).toEqual(['Primera División', 'Primera B']);
  });

  it('limita a las 2 divisiones principales aunque haya más', async () => {
    const svc = servicio([
      { ligaId: '265', nombre: 'Primera', tipo: 'League', temporadas: [] } as unknown as RawLigaPais,
      { ligaId: '266', nombre: 'Segunda', tipo: 'League', temporadas: [] } as unknown as RawLigaPais,
      { ligaId: '711', nombre: 'Tercera', tipo: 'League', temporadas: [] } as unknown as RawLigaPais,
    ]);
    const ligas = await svc.leaguesByCountry('X', 2023);
    expect(ligas).toHaveLength(2);
    expect(ligas.map((l) => l.nombre)).toEqual(['Primera', 'Segunda']);
  });
});

describe('OnboardingService.selectEquipoReal', () => {
  it('crea el club real y lo asigna al usuario (idempotente)', async () => {
    const repos = createInMemoryRepositories();
    await repos.usuarios.create({
      id: 'u1',
      proveedorAuth: 'email',
      email: 'u@x.com',
      clubId: null,
      zonaHoraria: 'UTC',
    });
    const svc = new OnboardingService({
      usuarios: repos.usuarios,
      clubes: repos.clubes,
      plantillas: repos.plantillas,
      sportsClient: new FakeSportsClient(),
    });
    const equipo: RawEquipo = { id: '2315', nombre: 'Colo Colo', escudoUrl: 'https://x/e.png' };

    const r1 = await svc.selectEquipoReal('u1', equipo);
    const r2 = await svc.selectEquipoReal('u1', equipo); // idempotente

    expect(r1.clubId).toBe(r2.clubId);
    expect(r1.nombre).toBe('Colo Colo');
    const usuario = await repos.usuarios.findById('u1');
    expect(usuario?.clubId).toBe(r1.clubId);
    // Una sola plantilla creada (no duplicada en la segunda llamada).
    expect(await repos.plantillas.findByClubId(r1.clubId)).toHaveLength(1);
  });
});
