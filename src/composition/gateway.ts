// Montaje del API Gateway sobre los servicios ensamblados.
//
// Registra en el `GatewayRouter` un conjunto de handlers adaptadores que
// traducen el `GatewayContext` (petición + userId autenticado) a llamadas a los
// métodos de dominio de `AppServices`, y mapean el resultado/errores a
// `GatewayResponse`. Construye el `ApiGateway` con rate limiting, autenticación
// (mismo secreto que `AuthService`) y terminación TLS.
//
// Nota de diseño: el pipeline del `ApiGateway` autentica TODAS las rutas antes
// de enrutar (Req 1.2). Por eso aquí se exponen endpoints de lectura/acción para
// usuarios ya autenticados (p. ej. previsualización del álbum, generación de
// cards). El registro/login, que son públicos por naturaleza, requieren un flujo
// que no pase por el middleware de auth del borde y se dejan fuera de este router.

import { ApiGateway } from '../api/gateway/gateway.js';
import { GatewayRouter } from '../api/gateway/router.js';
import { TokenBucketRateLimiter } from '../api/gateway/rate-limiter.js';
import { createTlsTerminationConfig } from '../api/gateway/tls.js';
import { createSupabaseAuthVerifier } from '../api/gateway/supabase-auth.js';
import type { AuthMiddlewareConfig } from '../api/gateway/auth-middleware.js';
import type { GatewayContext, GatewayResponse } from '../api/gateway/types.js';
import type { AppServices } from './services.js';

/** Opciones de montaje del gateway. */
export interface GatewayMountOptions {
  /** Secreto HMAC del access token propio del `AuthService` (fallback). */
  readonly accessTokenSecret: string;
  /**
   * Verificación vía Supabase Auth. Si se provee, el gateway valida los tokens
   * emitidos por Supabase Auth (GoTrue) contra su JWKS (ES256), en lugar del JWT
   * HMAC propio. Es la vía recomendada cuando la autenticación se delega en
   * Supabase Auth.
   */
  readonly supabaseAuth?: {
    /** URL base del proyecto Supabase (p. ej. http://127.0.0.1:54321). */
    readonly url: string;
    /** anon/publishable key para consultar el endpoint JWKS de GoTrue. */
    readonly apikey: string;
    /** Secreto HS256 legacy opcional (compatibilidad con tokens antiguos). */
    readonly hs256Secret?: string;
  };
  /** Capacidad de ráfaga del rate limiter (fichas). Por defecto 60. */
  readonly rateLimitBurst?: number;
  /** Reposición del rate limiter (fichas/segundo). Por defecto 10. */
  readonly rateLimitRefillPerSecond?: number;
  /**
   * Si `true`, relaja la terminación TLS (útil en dev local sin HTTPS). En
   * producción debe quedar `false` para exigir TLS en el borde (Req 20.1).
   */
  readonly allowInsecure?: boolean;
  /**
   * Orígenes CORS permitidos: `'*'` o una lista. Si se omite, no se emiten
   * cabeceras CORS (apto para clientes no-web); las de seguridad base sí.
   */
  readonly corsOrigins?: '*' | readonly string[];
}

/** Respuesta JSON de conveniencia. */
function json(status: number, body: unknown): GatewayResponse {
  return { status, headers: { 'content-type': 'application/json' }, body };
}

/**
 * Extrae un segmento posicional del path (0-indexed). El router no expone los
 * params al handler, así que los handlers con `:id` re-parsean el path.
 */
function pathSegment(context: GatewayContext, index: number): string | undefined {
  const segments = context.request.path.split('/').filter((s) => s.length > 0);
  return segments[index];
}

/** Traduce un error de dominio a una respuesta; 400 con el mensaje, o 500. */
function errorResponse(err: unknown): GatewayResponse {
  const message = err instanceof Error ? err.message : 'Error desconocido';
  // Los errores de dominio con `code` se exponen como 400; el resto como 500.
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string') {
    return json(400, { error: code, message });
  }
  return json(500, { error: 'internal_error', message });
}

/**
 * Registra las rutas de servicio en el router. Todas asumen un usuario
 * autenticado (`context.userId` presente, garantizado por el pipeline).
 */
function registerRoutes(router: GatewayRouter, services: AppServices): void {
  // Previsualización del álbum de una temporada: GET /album/:temporadaId/preview
  router.get('/album/:temporadaId/preview', async (context) => {
    const temporadaId = pathSegment(context, 1);
    if (!temporadaId) return json(400, { error: 'bad_request' });
    try {
      const preview = await services.albumPreview.getPreview(temporadaId);
      return json(200, preview);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Carga de una foto para un partido: POST /partidos/:partidoId/fotos
  // Body JSON: { binarioBase64: string, anchoPx: number, altoPx: number,
  //             fuente?: 'galeria' | 'camara' }
  router.post('/partidos/:partidoId/fotos', async (context) => {
    const partidoId = pathSegment(context, 1);
    if (!partidoId || !context.userId) return json(400, { error: 'bad_request' });

    const body = context.request.body;
    if (typeof body !== 'object' || body === null) {
      return json(400, { error: 'bad_request', message: 'Cuerpo JSON requerido.' });
    }
    const b = body as Record<string, unknown>;
    const binarioBase64 = b['binarioBase64'];
    const anchoPx = b['anchoPx'];
    const altoPx = b['altoPx'];
    const fuente = b['fuente'] === 'camara' ? 'camara' : 'galeria';
    if (
      typeof binarioBase64 !== 'string' ||
      typeof anchoPx !== 'number' ||
      typeof altoPx !== 'number' ||
      anchoPx <= 0 ||
      altoPx <= 0
    ) {
      return json(400, {
        error: 'bad_request',
        message: 'binarioBase64 (string), anchoPx y altoPx (números > 0) son requeridos.',
      });
    }

    let binario: Uint8Array;
    try {
      binario = new Uint8Array(Buffer.from(binarioBase64, 'base64'));
    } catch {
      return json(400, { error: 'bad_request', message: 'binarioBase64 inválido.' });
    }

    try {
      const result = await services.uploadFoto(partidoId, {
        fuente,
        binario,
        anchoPx,
        altoPx,
      });
      return json(201, {
        foto: result.foto,
        momentoId: result.momento.id,
        momentoCreado: result.momentoCreado,
      });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Generación de una Digital Card de un Momento: POST /cards/:momentoId
  router.post('/cards/:momentoId', async (context) => {
    const momentoId = pathSegment(context, 1);
    if (!momentoId || !context.userId) return json(400, { error: 'bad_request' });
    try {
      const card = await services.cards.generateCard(context.userId, momentoId);
      return json(201, card);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Catálogo de clubes disponibles: GET /clubs
  router.get('/clubs', async () => {
    try {
      const clubes = await services.persistence.repositories.clubes.findAll();
      return json(200, { clubs: clubes });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Selección/cambio de club del usuario autenticado: PUT /me/club
  // Body JSON: { clubId: string }
  router.put('/me/club', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const body = context.request.body;
    const clubId =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)['clubId']
        : undefined;
    if (typeof clubId !== 'string') {
      return json(400, { error: 'bad_request', message: 'clubId (string) requerido.' });
    }
    try {
      const resultado = await services.club.asignarClub(context.userId, clubId);
      return json(200, resultado);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Derechos (entitlements) del usuario autenticado: GET /me/entitlements
  router.get('/me/entitlements', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    try {
      const ent = await services.entitlements.getEntitlements(context.userId);
      return json(200, ent);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Perfil del usuario autenticado: GET /me
  // Devuelve el usuario, su Club actual (si tiene) y su Temporada ACTIVA (si la
  // hay), para que la app resuelva onboarding, personalización y el `temporadaId`
  // que necesitan el álbum y la lista de partidos. Solo lectura; el usuario se
  // deriva del JWT (no se acepta id por parámetro).
  router.get('/me', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    try {
      const repos = services.persistence.repositories;
      const usuario = await repos.usuarios.findById(context.userId);
      if (usuario === null) {
        return json(404, { error: 'usuario_no_encontrado', message: 'Perfil no encontrado.' });
      }
      const club =
        usuario.clubId !== null ? await repos.clubes.findById(usuario.clubId) : null;
      // Temporada ACTIVA (a lo sumo una relevante para el flujo del álbum). Si
      // hubiera varias, se toma la primera; el ciclo de vida garantiza una activa.
      const activas = await repos.temporadas.findActivasByUsuarioId(context.userId);
      const temporadaActiva = activas.length > 0 ? activas[0] : null;
      return json(200, {
        usuario: {
          id: usuario.id,
          email: usuario.email,
          clubId: usuario.clubId,
          zonaHoraria: usuario.zonaHoraria,
        },
        club,
        temporadaActiva,
      });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Sincroniza/crea la Temporada del usuario desde la API deportiva:
  // POST /me/temporada  body { temporadaExterna: string }
  // Descarga el fixture del proveedor, clasifica y deriva el álbum (un Recuadro
  // por Partido_Oficial). Si la API deportiva no está configurada, el servicio
  // falla con un mensaje "no disponible" (no finge éxito) → 400 con el detalle.
  router.post('/me/temporada', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const body = context.request.body;
    const temporadaExterna =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)['temporadaExterna']
        : undefined;
    if (typeof temporadaExterna !== 'string' || temporadaExterna.trim() === '') {
      return json(400, {
        error: 'bad_request',
        message: 'temporadaExterna (string, "<leagueId>:<season>") requerido.',
      });
    }
    try {
      const result = await services.seasonSync.syncSeason(
        context.userId,
        temporadaExterna.trim(),
      );
      return json(201, result);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Búsqueda de equipos reales (onboarding): GET /equipos?buscar=<nombre>
  router.get('/equipos', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const buscar = context.request.query?.['buscar'];
    if (buscar === undefined || buscar.trim().length < 2) {
      return json(400, { error: 'bad_request', message: 'buscar (>= 2 caracteres) requerido.' });
    }
    try {
      const equipos = await services.onboarding.searchClubs(buscar.trim());
      return json(200, { equipos });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Ligas de un equipo para una temporada: GET /equipos/:teamId/ligas?season=YYYY
  router.get('/equipos/:teamId/ligas', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const teamId = pathSegment(context, 1);
    if (!teamId) return json(400, { error: 'bad_request' });
    const seasonRaw = context.request.query?.['season'] ?? '';
    const season = Number.parseInt(seasonRaw, 10);
    if (!Number.isInteger(season) || season < 2000) {
      return json(400, { error: 'bad_request', message: 'season (año) requerido.' });
    }
    try {
      const ligas = await services.onboarding.leaguesForClub(teamId, season);
      return json(200, { ligas });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Selección del equipo real del usuario (onboarding): POST /me/equipo
  // Body { id, nombre, pais?, escudoUrl? } (el equipo elegido de la búsqueda).
  router.post('/me/equipo', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const body = context.request.body;
    if (typeof body !== 'object' || body === null) {
      return json(400, { error: 'bad_request', message: 'Cuerpo JSON requerido.' });
    }
    const b = body as Record<string, unknown>;
    const id = b['id'];
    const nombre = b['nombre'];
    if (typeof id !== 'string' || typeof nombre !== 'string') {
      return json(400, { error: 'bad_request', message: 'id y nombre (string) requeridos.' });
    }
    const equipo = {
      id,
      nombre,
      ...(typeof b['pais'] === 'string' ? { pais: b['pais'] } : {}),
      ...(typeof b['escudoUrl'] === 'string' ? { escudoUrl: b['escudoUrl'] } : {}),
    };
    try {
      const result = await services.onboarding.selectEquipoReal(context.userId, equipo);
      return json(201, result);
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Temporadas del usuario autenticado: GET /me/temporadas
  router.get('/me/temporadas', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    try {
      const temporadas =
        await services.persistence.repositories.temporadas.findByUsuarioId(context.userId);
      return json(200, { temporadas });
    } catch (err) {
      return errorResponse(err);
    }
  });

  // Partidos oficiales de una Temporada: GET /temporadas/:temporadaId/partidos
  // Cada partido se enriquece con el número de su Recuadro y si ya tiene
  // Foto_Principal, para que la app liste las "láminas" y navegue a la captura
  // con el `partidoId` correcto. Valida que la Temporada pertenezca al usuario.
  router.get('/temporadas/:temporadaId/partidos', async (context) => {
    if (!context.userId) return json(400, { error: 'bad_request' });
    const temporadaId = pathSegment(context, 1);
    if (!temporadaId) return json(400, { error: 'bad_request' });
    try {
      const repos = services.persistence.repositories;
      const temporada = await repos.temporadas.findById(temporadaId);
      if (temporada === null) {
        return json(404, {
          error: 'temporada_no_encontrada',
          message: 'Temporada no encontrada.',
        });
      }
      // Aislamiento por usuario: la Temporada debe ser del usuario autenticado.
      if (temporada.usuarioId !== context.userId) {
        return json(404, {
          error: 'temporada_no_encontrada',
          message: 'Temporada no encontrada.',
        });
      }

      const partidos = await repos.partidos.findByTemporadaId(temporadaId);

      // Mapa partidoOficialId -> Recuadro (numero, fotoPrincipal) para enriquecer.
      const album = await repos.albumes.findByTemporadaId(temporadaId);
      const recuadros = album !== null ? await repos.recuadros.findByAlbumId(album.id) : [];
      const recuadroPorPartido = new Map(
        recuadros.map((r) => [r.partidoOficialId, r]),
      );

      const items = partidos.map((p) => {
        const recuadro = recuadroPorPartido.get(p.id) ?? null;
        return {
          partidoId: p.id,
          rival: p.rival,
          competicion: p.competicion,
          tipoCompeticion: p.tipoCompeticion,
          fechaHora: p.fechaHora,
          estado: p.estado,
          esClasico: p.esClasico,
          esInternacional: p.esInternacional,
          resultado: p.resultado,
          numeroRecuadro: recuadro?.numero ?? null,
          tieneFotoPrincipal: recuadro?.fotoPrincipalId != null,
        };
      });

      return json(200, { temporadaId, partidos: items });
    } catch (err) {
      return errorResponse(err);
    }
  });
}

/** Registra las rutas públicas (sin autenticación): salud del servicio. */
function registerPublicRoutes(router: GatewayRouter, services: AppServices): void {
  router.get('/health', () =>
    json(200, {
      status: 'ok',
      driver: services.persistence.driver,
      auth: 'supabase-or-hmac',
    }),
  );
}

/** Construye el `ApiGateway` con sus rutas, rate limiter, auth y TLS. */
export function mountGateway(services: AppServices, options: GatewayMountOptions): ApiGateway {
  const router = new GatewayRouter();
  registerRoutes(router, services);

  const publicRouter = new GatewayRouter();
  registerPublicRoutes(publicRouter, services);

  const rateLimiter = new TokenBucketRateLimiter({
    burst: options.rateLimitBurst ?? 60,
    refillPerSecond: options.rateLimitRefillPerSecond ?? 10,
  });

  // Verificador de tokens: si se configura Supabase Auth, se validan los tokens
  // de GoTrue contra su JWKS (ES256); si no, el JWT HMAC propio del AuthService.
  const auth: AuthMiddlewareConfig = options.supabaseAuth
    ? {
        verifier: createSupabaseAuthVerifier({
          jwksUrl: `${options.supabaseAuth.url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
          apikey: options.supabaseAuth.apikey,
          ...(options.supabaseAuth.hs256Secret
            ? { hs256Secret: options.supabaseAuth.hs256Secret }
            : {}),
        }),
      }
    : { accessTokenSecret: options.accessTokenSecret };

  return new ApiGateway({
    router,
    publicRouter,
    auth,
    rateLimiter,
    tls: createTlsTerminationConfig(options.allowInsecure ? { enforceHttps: false } : {}),
    ...(options.corsOrigins !== undefined
      ? {
          security: {
            allowedOrigins: options.corsOrigins,
            allowCredentials: options.corsOrigins !== '*',
          },
        }
      : {}),
  });
}
