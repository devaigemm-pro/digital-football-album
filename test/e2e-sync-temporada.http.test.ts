// Verificación e2e OPCIONAL de la sincronización de temporada contra la API
// deportiva REAL (API-Football). Solo se ejecuta si hay `SPORTS_API_KEY` en el
// entorno; en CI/local sin key queda SKIPPED (no acopla la suite a la red ni al
// límite de requests del plan free).
//
// Levanta el servidor Node real con driver memory + la API key, siembra un
// usuario con club y plantilla, y hace `POST /me/temporada` por HTTP real. Como
// verificación end-to-end auténtica: socket + auth + endpoint + transporte real
// a api-sports.io + derivación del álbum.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createServices, type AppServices } from '../src/composition/services.js';
import { mountGateway } from '../src/composition/gateway.js';
import { createHttpServer } from '../src/composition/http-server.js';
import { signAccessToken } from '../src/services/auth/tokens.js';

const SECRET = 'e2e-sync-secret';
const USER = 'e2e-sync-user';
const CLUB = 'e2e-sync-club';
// Premier League 2023 (verificado: 380 fixtures). Formato "<leagueId>:<season>".
const TEMPORADA_EXTERNA = '39:2023';

const apiKey = process.env.SPORTS_API_KEY;
const suite = apiKey ? describe : describe.skip;

let server: Server;
let baseUrl: string;

function token(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return signAccessToken({ sub: USER, iat: nowSec - 60, exp: nowSec + 900 }, SECRET);
}

suite('e2e sync temporada (API-Football real)', () => {
  let services: AppServices;

  beforeAll(async () => {
    services = createServices({
      config: {
        accessTokenSecret: SECRET,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 1_209_600,
        sports: { provider: 'api-football', apiKey: apiKey as string },
      },
      persistence: { driver: 'memory' },
    });
    const repos = services.persistence.repositories;
    await repos.clubes.create({
      id: CLUB,
      nombre: 'Test FC',
      paletaColores: { primario: '#111111', secundario: '#FFFFFF' },
      escudoUrl: 'https://cdn/e.png',
      activosVisuales: { estadioUrls: [], camisetaUrls: [] },
    });
    await repos.plantillas.create({
      id: 'e2e-sync-plantilla',
      clubId: CLUB,
      recuadroAnchoMm: 60,
      recuadroAltoMm: 85,
    });
    await repos.usuarios.create({
      id: USER,
      proveedorAuth: 'email',
      email: 'e2e-sync@example.com',
      clubId: CLUB,
      zonaHoraria: 'UTC',
    });

    const gateway = mountGateway(services, { accessTokenSecret: SECRET, allowInsecure: false });
    server = createHttpServer(gateway);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it(
    'POST /me/temporada carga el fixture real y deriva recuadros',
    async () => {
      const res = await fetch(`${baseUrl}/me/temporada`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token()}`,
          'content-type': 'application/json',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({ temporadaExterna: TEMPORADA_EXTERNA }),
      });
      const body = (await res.json()) as { recuadros?: number; partidos?: number };
      expect(res.status).toBe(201);
      expect((body.recuadros ?? 0)).toBeGreaterThan(0);
      expect((body.partidos ?? 0)).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    'flujo país → división → equipos (con logo) por HTTP real',
    async () => {
      const auth = { authorization: `Bearer ${token()}`, 'x-forwarded-proto': 'https' };
      const resP = await fetch(`${baseUrl}/paises`, { headers: auth });
      const pBody = (await resP.json()) as { paises?: Array<{ nombre: string }> };
      expect(resP.status).toBe(200);
      expect((pBody.paises ?? []).some((p) => p.nombre === 'Chile')).toBe(true);

      const resL = await fetch(`${baseUrl}/paises/Chile/ligas?season=2023`, { headers: auth });
      const lBody = (await resL.json()) as { ligas?: Array<{ ligaId: string; nombre: string }> };
      expect(resL.status).toBe(200);
      const primera = (lBody.ligas ?? []).find((l) => /primera divisi/i.test(l.nombre));
      expect(primera).toBeDefined();

      const resT = await fetch(`${baseUrl}/ligas/${primera!.ligaId}/equipos?season=2023`, { headers: auth });
      const tBody = (await resT.json()) as { equipos?: Array<{ nombre: string; escudoUrl?: string }> };
      expect(resT.status).toBe(200);
      expect((tBody.equipos ?? []).length).toBeGreaterThan(0);
      // Los equipos deben venir con logo (escudoUrl).
      expect((tBody.equipos ?? [])[0]?.escudoUrl).toBeTruthy();
    },
    60_000,
  );

  it(
    'GET /equipos?buscar= devuelve equipos reales y /equipos/:id/ligas sus ligas',
    async () => {
      const auth = { authorization: `Bearer ${token()}`, 'x-forwarded-proto': 'https' };
      const resEq = await fetch(`${baseUrl}/equipos?buscar=barcelona`, { headers: auth });
      const eqBody = (await resEq.json()) as { equipos?: Array<{ id: string; nombre: string }> };
      expect(resEq.status).toBe(200);
      expect((eqBody.equipos ?? []).length).toBeGreaterThan(0);

      const teamId = eqBody.equipos![0]!.id;
      const resLg = await fetch(`${baseUrl}/equipos/${teamId}/ligas?season=2023`, { headers: auth });
      const lgBody = (await resLg.json()) as { ligas?: Array<{ ligaId: string; nombre: string }> };
      expect(resLg.status).toBe(200);
      expect((lgBody.ligas ?? []).length).toBeGreaterThan(0);
    },
    60_000,
  );
});
