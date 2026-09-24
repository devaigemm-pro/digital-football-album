// Verificación END-TO-END real por SOCKET HTTP de los endpoints de perfil y
// partidos. A diferencia del test de integración (que llama `gateway.handle`
// en memoria), este levanta el servidor Node REAL (`createHttpServer`) en un
// puerto efímero y hace peticiones `fetch` de verdad por la red, ejercitando el
// pipeline completo: parseo HTTP → TLS (x-forwarded-proto) → auth → routing →
// serialización JSON de vuelta.
//
// Usa el driver de persistencia in-memory sembrado en el MISMO proceso (para no
// depender de credenciales de Supabase) y el JWT HMAC propio del gateway.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createServices, type AppServices } from '../src/composition/services.js';
import { mountGateway } from '../src/composition/gateway.js';
import { createHttpServer } from '../src/composition/http-server.js';
import { signAccessToken } from '../src/services/auth/tokens.js';
import type { Album, Club, PartidoOficial, Recuadro, Temporada, Usuario } from '../src/domain/types.js';

const SECRET = 'e2e-secret-hs256';
const USUARIO_ID = 'e2e-user-1';
const CLUB_ID = 'e2e-club-1';
const TEMPORADA_ID = 'e2e-temp-1';

let server: Server;
let baseUrl: string;

function token(sub: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return signAccessToken({ sub, iat: nowSec - 60, exp: nowSec + 900 }, SECRET);
}

async function seed(services: AppServices): Promise<void> {
  const repos = services.persistence.repositories;
  const club: Club = {
    id: CLUB_ID,
    nombre: 'Atlético E2E',
    paletaColores: { primario: '#C8102E', secundario: '#FFFFFF' },
    escudoUrl: 'https://cdn.example/e2e.png',
    activosVisuales: { estadioUrls: [], camisetaUrls: [] },
  };
  await repos.clubes.create(club);
  const usuario: Usuario = {
    id: USUARIO_ID,
    proveedorAuth: 'email',
    email: 'e2e@example.com',
    clubId: CLUB_ID,
    zonaHoraria: 'America/Bogota',
  };
  await repos.usuarios.create(usuario);
  const temporada: Temporada = {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: CLUB_ID,
    temporadaExterna: '2026',
    estado: 'ACTIVA',
    fechaLimiteCierre: '2026-12-15T00:00:00.000Z',
  };
  await repos.temporadas.create(temporada);
  const album: Album = { id: 'e2e-album-1', temporadaId: TEMPORADA_ID };
  await repos.albumes.create(album);
  const partido: PartidoOficial = {
    id: 'e2e-partido-1',
    temporadaId: TEMPORADA_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival E2E',
    fechaHora: '2026-03-10T22:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: { golesLocal: 2, golesVisita: 1 },
    alineacion: [],
    eventos: [],
  };
  await repos.partidos.create(partido);
  const recuadro: Recuadro = {
    id: 'e2e-recuadro-1',
    albumId: 'e2e-album-1',
    partidoOficialId: 'e2e-partido-1',
    plantillaId: 'e2e-plantilla-1',
    numero: 1,
    anchoMm: 60,
    altoMm: 85,
    fotoPrincipalId: null,
    estadoRecordatorio: 'ACTIVO',
  };
  await repos.recuadros.create(recuadro);
}

/** Petición HTTP real autenticada contra el servidor levantado. */
async function get(path: string, sub: string = USUARIO_ID): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token(sub)}`,
      // El servidor confía en x-forwarded-proto para derivar TLS en tests.
      'x-forwarded-proto': 'https',
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('e2e HTTP — perfil y partidos (servidor Node real)', () => {
  beforeAll(async () => {
    const services = createServices({
      config: {
        accessTokenSecret: SECRET,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 1_209_600,
      },
      persistence: { driver: 'memory' },
    });
    await seed(services);
    const gateway = mountGateway(services, { accessTokenSecret: SECRET, allowInsecure: false });
    server = createHttpServer(gateway);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /me devuelve el perfil por HTTP real', async () => {
    const { status, body } = await get('/me');
    expect(status).toBe(200);
    const b = body as { usuario: { id: string }; club: { nombre: string } | null; temporadaActiva: { id: string } | null };
    expect(b.usuario.id).toBe(USUARIO_ID);
    expect(b.club?.nombre).toBe('Atlético E2E');
    expect(b.temporadaActiva?.id).toBe(TEMPORADA_ID);
  });

  it('GET /temporadas/:id/partidos devuelve los partidos por HTTP real', async () => {
    const { status, body } = await get(`/temporadas/${TEMPORADA_ID}/partidos`);
    expect(status).toBe(200);
    const b = body as { partidos: Array<{ partidoId: string; numeroRecuadro: number | null; tieneFotoPrincipal: boolean }> };
    expect(b.partidos).toHaveLength(1);
    expect(b.partidos[0]?.partidoId).toBe('e2e-partido-1');
    expect(b.partidos[0]?.numeroRecuadro).toBe(1);
    expect(b.partidos[0]?.tieneFotoPrincipal).toBe(false);
  });

  it('rechaza sin token (401) por HTTP real', async () => {
    const res = await fetch(`${baseUrl}/me`, { headers: { 'x-forwarded-proto': 'https' } });
    expect(res.status).toBe(401);
  });
});
