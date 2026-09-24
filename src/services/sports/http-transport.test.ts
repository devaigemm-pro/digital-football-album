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
