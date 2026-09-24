// Servicio_Datos_Deportivos — sincronización de la Temporada del usuario desde
// la API deportiva (`SeasonSyncService`).
//
// Orquesta el flujo de alto nivel que faltaba para que "se cargue la temporada
// del equipo conectándose a la API":
//   1. Resolver el usuario y su Club (el Club aporta las rivalidades y la
//      plantilla de dimensiones del Recuadro).
//   2. Asegurar una Temporada del usuario para `temporadaExterna` (la crea en
//      estado ACTIVA si no existe).
//   3. Descargar el fixture desde la API deportiva (`syncFixture`), clasificar
//      cada partido (Clásico/Internacional) y derivar el álbum (`deriveAlbum`),
//      que crea exactamente un Recuadro por Partido_Oficial (Req 4.1, 4.2).
//
// Si la API deportiva no está configurada (transporte "no disponible"), el
// cliente resiliente rechaza y este servicio propaga el error para que el
// gateway responda "sincronización no disponible" — NUNCA finge éxito
// (preferencia del usuario sobre adaptadores sin implementación real).

import type { TipoCompeticion, UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  ClubRepository,
  PartidoOficialRepository,
  PlantillaAlbumRepository,
  RecuadroRepository,
  TemporadaRepository,
  UsuarioRepository,
} from '../../persistence/repositories.js';
import type { ClassifierService } from '../classifier/classifier-service.js';
import { deriveAlbum, type FixtureEntry } from './album-derivation.js';
import { syncFixture } from './sync-fixture.js';
import type { SportsApiClient } from './types.js';

/** Se lanza cuando el usuario o su Club no existen. */
export class SeasonSyncNotFoundError extends Error {
  readonly code = 'SEASON_SYNC_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'SeasonSyncNotFoundError';
  }
}

/** Resultado de sincronizar la Temporada. */
export interface SeasonSyncResult {
  readonly temporadaId: UUID;
  readonly albumId: UUID;
  readonly partidos: number;
  readonly recuadros: number;
}

/** Dependencias del servicio de sincronización de temporada. */
export interface SeasonSyncDeps {
  readonly usuarios: UsuarioRepository;
  readonly clubes: ClubRepository;
  readonly temporadas: TemporadaRepository;
  readonly albumes: AlbumRepository;
  readonly partidos: PartidoOficialRepository;
  readonly recuadros: RecuadroRepository;
  readonly plantillas: PlantillaAlbumRepository;
  readonly classifier: ClassifierService;
  readonly sportsClient: SportsApiClient;
  readonly newId?: () => UUID;
}

/**
 * Deriva el `tipoCompeticion` a partir del nombre de competición reportado por
 * la API. Heurística simple y explícita; por defecto LIGA. La clasificación de
 * Clásico/Internacional fina la hace el Clasificador con las rivalidades.
 */
function inferTipoCompeticion(competicion: string): TipoCompeticion {
  const c = competicion.toLocaleLowerCase();
  if (/(champions|libertadores|sudamericana|europa|internacional|world|mundial)/.test(c)) {
    return 'INTERNACIONAL';
  }
  if (/(copa|cup)/.test(c)) {
    return 'COPA_NACIONAL';
  }
  return 'LIGA';
}

/**
 * Servicio de sincronización de la Temporada del usuario con la API deportiva.
 */
export class SeasonSyncService {
  constructor(private readonly deps: SeasonSyncDeps) {}

  /**
   * Sincroniza (crea/actualiza) la Temporada del usuario para `temporadaExterna`
   * y deriva su álbum desde el fixture oficial.
   *
   * @param usuarioId Usuario autenticado.
   * @param temporadaExterna Identificador de la temporada en la API deportiva
   *   (para API-Football: "<leagueId>:<season>", p. ej. "39:2024").
   */
  async syncSeason(usuarioId: UUID, temporadaExterna: string): Promise<SeasonSyncResult> {
    const { usuarios, clubes, temporadas, classifier, sportsClient } = this.deps;
    const newId = this.deps.newId ?? ((): UUID => crypto.randomUUID());

    const usuario = await usuarios.findById(usuarioId);
    if (usuario === null) {
      throw new SeasonSyncNotFoundError('Perfil de usuario no encontrado.');
    }
    if (usuario.clubId === null) {
      throw new SeasonSyncNotFoundError(
        'Debes seleccionar un club antes de cargar la temporada.',
      );
    }
    const club = await clubes.findById(usuario.clubId);
    if (club === null) {
      throw new SeasonSyncNotFoundError('El club del usuario no existe.');
    }

    // 1. Asegurar la Temporada (ACTIVA) del usuario para esa temporada externa.
    const existentes = await temporadas.findByUsuarioId(usuarioId);
    let temporada =
      existentes.find((t) => t.temporadaExterna === temporadaExterna) ?? null;
    if (temporada === null) {
      temporada = await temporadas.create({
        id: newId(),
        usuarioId,
        clubId: club.id,
        temporadaExterna,
        estado: 'ACTIVA',
        // Fecha límite por defecto (configurable por Config_Admin más adelante).
        fechaLimiteCierre: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // 2. Descargar y sanear el fixture desde la API deportiva.
    const { validos } = await syncFixture(temporadaExterna, { client: sportsClient });

    // 3. Preparar las entradas del fixture con su tipoCompeticion inferido. La
    //    clasificación fina (esClásico/esInternacional) se persiste en el paso 5
    //    con el Clasificador; `deriveAlbum` solo necesita `tipoCompeticion`.
    const entries: FixtureEntry[] = validos.map((f) => ({
      partidoExternoId: f.partidoExternoId,
      competicion: f.competicion,
      tipoCompeticion: inferTipoCompeticion(f.competicion),
      rival: f.rival,
      fechaHora: f.fechaHora,
      estado: f.estado,
      esAmistoso: false,
    }));

    // 4. Derivar el álbum (un Recuadro por Partido_Oficial).
    const derived = await deriveAlbum(temporada.id, club.id, entries, {
      albumes: this.deps.albumes,
      partidos: this.deps.partidos,
      recuadros: this.deps.recuadros,
      plantillas: this.deps.plantillas,
      newId,
    });

    // 5. Fijar esClasico/esInternacional en los partidos derivados (Clasificador).
    const partidosTemporada = await this.deps.partidos.findByTemporadaId(temporada.id);
    for (const p of partidosTemporada) {
      const clasificado = await classifier.clasificar(
        { rival: p.rival, tipoCompeticion: p.tipoCompeticion },
        { id: club.id },
      );
      if (p.esClasico !== clasificado.esClasico || p.esInternacional !== clasificado.esInternacional) {
        await this.deps.partidos.update(p.id, {
          esClasico: clasificado.esClasico,
          esInternacional: clasificado.esInternacional,
        });
      }
    }

    return {
      temporadaId: temporada.id,
      albumId: derived.albumId,
      partidos: partidosTemporada.length,
      recuadros: derived.recuadros.length,
    };
  }
}
