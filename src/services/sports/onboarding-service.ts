// Servicio de onboarding con datos REALES de la API deportiva.
//
// Permite que, en el alta, el usuario busque su equipo real (API-Football),
// lo elija y quede persistido como `Club` en la base (con nombre y escudo
// reales) y asignado al usuario. Después, la lista de ligas del equipo alimenta
// la elección de la competición a sincronizar (`SeasonSyncService`).
//
// Decisiones de diseño:
//   - El `Club` se identifica de forma estable con un UUID DETERMINISTA derivado
//     del id externo del equipo en la API (namespace fijo). Así elegir el mismo
//     equipo es idempotente: no duplica clubes.
//   - API-Football no expone los colores del club; se usan colores por defecto
//     (el usuario/mantenimiento puede ajustarlos luego). El escudo sí es real.
//   - Se asegura una `Plantilla_Album` por Club (dimensiones del Recuadro) que
//     necesita la derivación del álbum.
//
// Si la API deportiva no está configurada, el `SportsApiClient` subyacente
// rechaza con "no disponible" y este servicio propaga el error (no finge éxito).

import { createHash } from 'node:crypto';

import type { Club, UUID } from '../../domain/types.js';
import type {
  ClubRepository,
  PlantillaAlbumRepository,
  UsuarioRepository,
} from '../../persistence/repositories.js';
import type {
  RawEquipo,
  RawLigaEquipo,
  RawLigaPais,
  RawPais,
  SportsApiClient,
} from './types.js';

/** Se lanza cuando el usuario no existe. */
export class OnboardingNotFoundError extends Error {
  readonly code = 'ONBOARDING_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingNotFoundError';
  }
}

/** Colores por defecto de un Club creado desde la API (sin datos de color). */
const COLORES_DEFECTO = { primario: '#15181F', secundario: '#FFFFFF', acento: '#C8102E' } as const;

/** Dimensiones por defecto del Recuadro (mm) para la plantilla del Club. */
const RECUADRO_ANCHO_MM = 60;
const RECUADRO_ALTO_MM = 85;

/**
 * Deriva un UUID v5-like DETERMINISTA a partir del id externo del equipo, para
 * que el mismo equipo mapee siempre al mismo `Club.id` (upsert idempotente).
 */
function clubIdParaEquipo(teamId: string): UUID {
  const h = createHash('sha1').update(`api-football:team:${teamId}`).digest('hex');
  // Formatea 32 hex como UUID (no es un v5 estricto, pero es estable y válido).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Dependencias del servicio de onboarding. */
export interface OnboardingDeps {
  readonly usuarios: UsuarioRepository;
  readonly clubes: ClubRepository;
  readonly plantillas: PlantillaAlbumRepository;
  readonly sportsClient: SportsApiClient;
  readonly newId?: () => UUID;
}

/** Club asignado al usuario tras elegir su equipo real. */
export interface EquipoSeleccionadoResult {
  readonly clubId: UUID;
  readonly nombre: string;
  readonly escudoUrl: string;
}

/**
 * Servicio de onboarding con datos reales de la API deportiva.
 */
export class OnboardingService {
  constructor(private readonly deps: OnboardingDeps) {}

  /** Busca equipos reales por nombre (`GET /equipos?buscar=`). */
  searchClubs(query: string): Promise<readonly RawEquipo[]> {
    return this.deps.sportsClient.searchTeams(query);
  }

  /** Lista las ligas del equipo para una temporada (`GET /equipos/:id/ligas`). */
  leaguesForClub(teamId: string, season: number): Promise<readonly RawLigaEquipo[]> {
    return this.deps.sportsClient.leaguesForTeam(teamId, season);
  }

  /** Lista los países disponibles (onboarding por país). */
  listCountries(): Promise<readonly RawPais[]> {
    return this.deps.sportsClient.listCountries();
  }

  /** Lista las ligas/divisiones de un país para una temporada. */
  leaguesByCountry(country: string, season: number): Promise<readonly RawLigaPais[]> {
    return this.deps.sportsClient.leaguesByCountry(country, season);
  }

  /** Lista los equipos (con logo) de una liga/temporada. */
  teamsByLeague(ligaId: string, season: number): Promise<readonly RawEquipo[]> {
    return this.deps.sportsClient.teamsByLeague(ligaId, season);
  }

  /**
   * Persiste (upsert) el equipo real elegido como `Club` y lo asigna al usuario.
   * Idempotente por el UUID determinista derivado del id externo del equipo.
   */
  async selectEquipoReal(usuarioId: UUID, equipo: RawEquipo): Promise<EquipoSeleccionadoResult> {
    const usuario = await this.deps.usuarios.findById(usuarioId);
    if (usuario === null) {
      throw new OnboardingNotFoundError('Perfil de usuario no encontrado.');
    }

    const clubId = clubIdParaEquipo(equipo.id);
    const escudoUrl = equipo.escudoUrl ?? '';
    const nombre = equipo.nombre;

    const existente = await this.deps.clubes.findById(clubId);
    if (existente === null) {
      const club: Club = {
        id: clubId,
        nombre,
        paletaColores: { ...COLORES_DEFECTO },
        escudoUrl,
        activosVisuales: { estadioUrls: [], camisetaUrls: [] },
      };
      await this.deps.clubes.create(club);
    } else {
      // Actualiza nombre/escudo por si cambiaron en la API.
      await this.deps.clubes.update(clubId, { nombre, escudoUrl });
    }

    // Asegura una plantilla de dimensiones para el Club (la usa deriveAlbum).
    const plantillas = await this.deps.plantillas.findByClubId(clubId);
    if (plantillas.length === 0) {
      const newId = this.deps.newId ?? ((): UUID => crypto.randomUUID());
      await this.deps.plantillas.create({
        id: newId(),
        clubId,
        recuadroAnchoMm: RECUADRO_ANCHO_MM,
        recuadroAltoMm: RECUADRO_ALTO_MM,
      });
    }

    // Asigna el Club al usuario.
    await this.deps.usuarios.update(usuarioId, { clubId });

    return { clubId, nombre, escudoUrl };
  }
}
