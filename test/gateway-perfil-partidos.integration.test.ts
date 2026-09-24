// Test de integración de los endpoints de perfil y partidos del gateway.
//
// Monta el gateway REAL (`mountGateway`) sobre servicios con persistencia
// in-memory, siembra un usuario con club, temporada ACTIVA, álbum, un partido y
// su recuadro, y verifica de extremo a extremo (a través del pipeline de
// auth/routing) los endpoints nuevos:
//   - GET /me                          -> usuario + club + temporadaActiva
//   - GET /me/temporadas               -> temporadas del usuario
//   - GET /temporadas/:id/partidos     -> partidos enriquecidos (numeroRecuadro,
//                                         tieneFotoPrincipal), con aislamiento por
//                                         usuario (404 si no es dueño).
//
// El usuario se autentica con un JWT HMAC propio (mismo secreto que el gateway),
// tal como hacen las pruebas del gateway del borde.

import { beforeEach, describe, expect, it } from 'vitest';

import { createServices, type AppServices } from '../src/composition/services.js';
import { mountGateway } from '../src/composition/gateway.js';
import { signAccessToken } from '../src/services/auth/tokens.js';
import type { ApiGateway } from '../src/api/gateway/gateway.js';
import type { GatewayRequest } from '../src/api/gateway/types.js';
import type {
  Album,
  Club,
  PartidoOficial,
  Recuadro,
  Temporada,
  Usuario,
} from '../src/domain/types.js';

const SECRET = 'test-secret-hs256';

const USUARIO_ID = 'user-1';
const OTRO_USUARIO_ID = 'user-2';
const CLUB_ID = 'club-1';
const TEMPORADA_ID = 'temp-1';
const ALBUM_ID = 'album-1';
const PARTIDO_ID = 'partido-1';

function token(sub: string): string {
  // Vigente contra el reloj real (mountGateway usa Date.now() para expiración).
  const nowSec = Math.floor(Date.now() / 1000);
  return signAccessToken({ sub, iat: nowSec - 60, exp: nowSec + 900 }, SECRET);
}

function request(path: string, sub: string = USUARIO_ID): GatewayRequest {
  return {
    method: 'GET',
    path,
    headers: { authorization: `Bearer ${token(sub)}` },
    isSecure: true,
    clientId: 'ip-test',
  };
}

/** Siembra el grafo mínimo Usuario→Club→Temporada→Album→Partido→Recuadro. */
async function seed(services: AppServices): Promise<void> {
  const repos = services.persistence.repositories;

  const club: Club = {
    id: CLUB_ID,
    nombre: 'Atlético Kiro',
    paletaColores: { primario: '#C8102E', secundario: '#FFFFFF' },
    escudoUrl: 'https://cdn.example/escudo.png',
    activosVisuales: { estadioUrls: [], camisetaUrls: [] },
  };
  await repos.clubes.create(club);

  const usuario: Usuario = {
    id: USUARIO_ID,
    proveedorAuth: 'email',
    email: 'hincha@example.com',
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

  const album: Album = { id: ALBUM_ID, temporadaId: TEMPORADA_ID };
  await repos.albumes.create(album);

  const partido: PartidoOficial = {
    id: PARTIDO_ID,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
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
    id: 'recuadro-1',
    albumId: ALBUM_ID,
    partidoOficialId: PARTIDO_ID,
    plantillaId: 'plantilla-1',
    numero: 1,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: null,
    estadoRecordatorio: 'ACTIVO',
  };
  await repos.recuadros.create(recuadro);
}

describe('gateway — perfil y partidos (in-memory)', () => {
  let services: AppServices;
  let gateway: ApiGateway;

  beforeEach(async () => {
    services = createServices({
      config: {
        accessTokenSecret: SECRET,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 1_209_600,
      },
      persistence: { driver: 'memory' },
    });
    gateway = mountGateway(services, {
      accessTokenSecret: SECRET,
      allowInsecure: true,
    });
    await seed(services);
  });

  it('GET /me devuelve usuario, club y temporada activa', async () => {
    const res = await gateway.handle(request('/me'));
    expect(res.status).toBe(200);
    const body = res.body as {
      usuario: { id: string; clubId: string | null; email: string };
      club: { id: string; nombre: string } | null;
      temporadaActiva: { id: string; estado: string } | null;
    };
    expect(body.usuario.id).toBe(USUARIO_ID);
    expect(body.usuario.clubId).toBe(CLUB_ID);
    expect(body.club?.id).toBe(CLUB_ID);
    expect(body.temporadaActiva?.id).toBe(TEMPORADA_ID);
    expect(body.temporadaActiva?.estado).toBe('ACTIVA');
  });

  it('GET /me/temporadas lista las temporadas del usuario', async () => {
    const res = await gateway.handle(request('/me/temporadas'));
    expect(res.status).toBe(200);
    const body = res.body as { temporadas: Temporada[] };
    expect(body.temporadas).toHaveLength(1);
    expect(body.temporadas[0]?.id).toBe(TEMPORADA_ID);
  });

  it('GET /temporadas/:id/partidos enriquece con numeroRecuadro y tieneFotoPrincipal', async () => {
    const res = await gateway.handle(request(`/temporadas/${TEMPORADA_ID}/partidos`));
    expect(res.status).toBe(200);
    const body = res.body as {
      temporadaId: string;
      partidos: Array<{
        partidoId: string;
        rival: string;
        numeroRecuadro: number | null;
        tieneFotoPrincipal: boolean;
      }>;
    };
    expect(body.temporadaId).toBe(TEMPORADA_ID);
    expect(body.partidos).toHaveLength(1);
    const p = body.partidos[0];
    expect(p?.partidoId).toBe(PARTIDO_ID);
    expect(p?.rival).toBe('Rival FC');
    expect(p?.numeroRecuadro).toBe(1);
    expect(p?.tieneFotoPrincipal).toBe(false);
  });

  it('GET /temporadas/:id/partidos devuelve 404 si la temporada no es del usuario', async () => {
    // El OTRO usuario (autenticado) intenta leer la temporada del primero.
    const res = await gateway.handle(
      request(`/temporadas/${TEMPORADA_ID}/partidos`, OTRO_USUARIO_ID),
    );
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'temporada_no_encontrada' });
  });

  it('GET /me devuelve 404 cuando el usuario autenticado no tiene perfil', async () => {
    const res = await gateway.handle(request('/me', OTRO_USUARIO_ID));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'usuario_no_encontrado' });
  });
});
