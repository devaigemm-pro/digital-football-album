// Pruebas del ApiFootballSportsTransport — mapeo y filtro de fixtures por equipo.
//
// Usa un `fetchImpl` inyectado (sin red) que captura la URL solicitada y
// devuelve una respuesta de API-Football simulada. Verifica que:
//   - con teamId en temporadaExterna ("liga:season:team") se añade `&team=`;
//   - el `rival` se resuelve como el equipo CONTRARIO al del usuario (local o
//     visitante), no siempre el visitante;
//   - sin teamId, no se filtra por equipo (retrocompatibilidad).

import { describe, expect, it } from 'vitest';

import { ApiFootballSportsTransport } from './http-transport.js';
import { ResilientSportsApiClient } from './client.js';

const TEAM_ID = 2315; // p. ej. Colo Colo

/** Respuesta simulada de API-Football con un partido local y uno de visita. */
function fakeFixturesResponse() {
  return {
    response: [
      {
        fixture: { id: 1, date: '2023-08-10T20:00:00Z', status: { short: 'FT' } },
        league: { name: 'Primera División' },
        teams: {
          home: { id: TEAM_ID, name: 'Colo Colo' },
          away: { id: 999, name: 'Rival Visita' },
        },
        goals: { home: 2, away: 1 },
      },
      {
        fixture: { id: 2, date: '2023-08-17T20:00:00Z', status: { short: 'NS' } },
        league: { name: 'Primera División' },
        teams: {
          home: { id: 888, name: 'Rival Local' },
          away: { id: TEAM_ID, name: 'Colo Colo' },
        },
        goals: { home: null, away: null },
      },
    ],
  };
}

/** Crea un cliente resiliente sobre el transporte con un fetch capturado. */
function makeClient(): { client: ResilientSportsApiClient; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = ((url: string) => {
    urls.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeFixturesResponse()),
    } as unknown as Response);
  }) as unknown as typeof fetch;

  const transport = new ApiFootballSportsTransport({
    baseUrl: 'https://v3.football.api-sports.io',
    apiKey: 'test-key',
    fetchImpl,
  });
  // Sin reintentos/backoff para que el test sea inmediato.
  const client = new ResilientSportsApiClient({ transport, maxAttempts: 1 });
  return { client, urls };
}

describe('ApiFootballSportsTransport — fixtures filtrados por equipo', () => {
  it('añade &team= cuando temporadaExterna incluye teamId', async () => {
    const { client, urls } = makeClient();
    await client.fetchFixtures(`265:2023:${TEAM_ID}`);
    expect(urls[0]).toContain('league=265');
    expect(urls[0]).toContain('season=2023');
    expect(urls[0]).toContain(`team=${TEAM_ID}`);
  });

  it('NO filtra por equipo cuando no hay teamId (retrocompatibilidad)', async () => {
    const { client, urls } = makeClient();
    await client.fetchFixtures('265:2023');
    expect(urls[0]).toContain('league=265');
    expect(urls[0]).not.toContain('team=');
  });

  it('formato "team:<teamId>:<season>" consulta por equipo SIN liga (todas las competiciones: liga + copa)', async () => {
    const { client, urls } = makeClient();
    await client.fetchFixtures(`team:${TEAM_ID}:2023`);
    // Sin `league=`: trae TODOS los partidos del equipo (Primera + Copa Chile + internacional).
    expect(urls[0]).not.toContain('league=');
    expect(urls[0]).toContain(`team=${TEAM_ID}`);
    expect(urls[0]).toContain('season=2023');
    expect(urls[0]).toContain('page=1');
  });

  it('recorre TODAS las páginas (no pierde partidos de páginas siguientes, p. ej. Copa Chile)', async () => {
    const urls: string[] = [];
    // Página 1: un partido de Primera; página 2: un partido de Copa Chile.
    const fetchImpl = ((url: string) => {
      urls.push(String(url));
      const current = url.includes('page=2') ? 2 : 1;
      const item =
        current === 1
          ? {
              fixture: { id: 10, date: '2023-03-01T20:00:00Z', status: { short: 'FT' } },
              league: { name: 'Primera División' },
              teams: { home: { id: TEAM_ID, name: 'Colo Colo' }, away: { id: 99, name: 'Rival' } },
            }
          : {
              fixture: { id: 20, date: '2023-04-01T20:00:00Z', status: { short: 'NS' } },
              league: { name: 'Copa Chile' },
              teams: { home: { id: 88, name: 'Otro' }, away: { id: TEAM_ID, name: 'Colo Colo' } },
            };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: [item], paging: { current, total: 2 } }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    const transport = new ApiFootballSportsTransport({
      baseUrl: 'https://v3.football.api-sports.io',
      apiKey: 'test-key',
      fetchImpl,
    });
    const client = new ResilientSportsApiClient({ transport, maxAttempts: 1 });

    const fixtures = await client.fetchFixtures(`team:${TEAM_ID}:2023`);
    // Se pidieron 2 páginas y se unieron ambos partidos (incluida la Copa Chile).
    expect(urls.some((u) => u.includes('page=1'))).toBe(true);
    expect(urls.some((u) => u.includes('page=2'))).toBe(true);
    expect(fixtures).toHaveLength(2);
    expect(fixtures.map((f) => f.competicion)).toContain('Copa Chile');
  });

  it('lanza si API-Football reporta errores (no los enmascara como "sin partidos")', async () => {
    const fetchImpl = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            response: [],
            errors: { token: 'cuota excedida' },
            paging: { current: 1, total: 1 },
          }),
      } as unknown as Response)) as unknown as typeof fetch;

    const transport = new ApiFootballSportsTransport({
      baseUrl: 'https://v3.football.api-sports.io',
      apiKey: 'test-key',
      fetchImpl,
    });
    const client = new ResilientSportsApiClient({ transport, maxAttempts: 1 });

    await expect(client.fetchFixtures(`team:${TEAM_ID}:2023`)).rejects.toThrow();
  });

  it('resuelve el rival como el equipo contrario (local y visitante)', async () => {
    const { client } = makeClient();
    const fixtures = await client.fetchFixtures(`265:2023:${TEAM_ID}`);
    expect(fixtures).toHaveLength(2);
    // Partido 1: el usuario (Colo Colo) es LOCAL -> rival = visitante.
    expect(fixtures[0]?.rival).toBe('Rival Visita');
    // Partido 2: el usuario es VISITANTE -> rival = local.
    expect(fixtures[1]?.rival).toBe('Rival Local');
  });
});
