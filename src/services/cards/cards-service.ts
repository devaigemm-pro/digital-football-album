// Generador_Cards: generación de Digital Cards con gating premium (Req 12).
//
// Implementa el contrato lógico del design.md ("Generador_Cards"):
//   - `POST /cards {momentoId}` → imagen con la fotografía del usuario + el
//     marcador del partido + el escudo del Club (Req 12.1) en formato compatible
//     (Req 12.2). Si el Momento es de un Partido_Internacional y el usuario es
//     Básico, rechaza con "requiere Plan_Premium" (Req 12.4); Premium lo permite
//     (Req 12.3). Las Digital Cards de partidos no internacionales se permiten a
//     todos los planes.
//
// Gating (Req 12.3, 12.4): el derecho a generar Digital Cards de
// Partidos_Internacionales se consulta en el punto único de entitlements
// (`digitalCardsInternacional`), no se deriva del plan aquí. Así la regla de
// gating es consistente con el resto del sistema (design.md · "Gating de
// funciones premium centralizado"). Para partidos no internacionales el
// entitlement es irrelevante y la generación siempre procede.
//
// La composición real de la imagen se delega en `CardComposer` (mockeable); este
// servicio orquesta la resolución de datos (Momento → Partido → Foto_Principal →
// Club), la decisión de gating y la invocación del compositor.
//
// Las dependencias (repositorios, entitlements y compositor) se inyectan para
// ejercitar el servicio con los dobles en memoria.
//
// Task 13.1 — Requirements: 12.1, 12.2, 12.3, 12.4

import type { UUID } from '../../domain/types.js';
import type {
  ClubRepository,
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
  RecuadroRepository,
} from '../../persistence/repositories.js';
import type { Entitlements } from '../subscription/entitlements.js';
import type { CardArtefacto, CardComposer } from './card-composer.js';

/** Códigos de error del Generador_Cards. */
export type CardsErrorCode =
  /** El usuario Básico solicitó una card de Partido_Internacional (Req 12.4). */
  | 'REQUIERE_PLAN_PREMIUM'
  /** El Momento indicado no existe. */
  | 'MOMENTO_NO_ENCONTRADO'
  /** No se halló el Partido_Oficial asociado al Momento. */
  | 'PARTIDO_NO_ENCONTRADO'
  /** El partido aún no tiene resultado (marcador) para componer la card (Req 12.1). */
  | 'MARCADOR_NO_DISPONIBLE'
  /** No hay Foto_Principal seleccionada para componer la card (Req 12.1). */
  | 'FOTO_PRINCIPAL_NO_DISPONIBLE'
  /** No se halló el Club para aportar el escudo (Req 12.1). */
  | 'CLUB_NO_ENCONTRADO';

/**
 * Error de dominio del Generador_Cards. El mensaje del código
 * `REQUIERE_PLAN_PREMIUM` informa explícitamente que la función requiere
 * Plan_Premium (Req 12.4).
 */
export class CardsError extends Error {
  constructor(
    readonly code: CardsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CardsError';
  }
}

/**
 * Fuente de entitlements del usuario. Se acepta cualquier objeto con
 * `getEntitlements(usuarioId)` (p. ej. `EntitlementsService`) para desacoplar el
 * Generador_Cards de la implementación concreta del punto de gating.
 */
export interface EntitlementsSource {
  getEntitlements(usuarioId: UUID): Promise<Entitlements>;
}

/** Dependencias inyectadas del Generador_Cards. */
export interface CardsServiceDeps {
  momentos: MomentoRepository;
  partidos: PartidoOficialRepository;
  recuadros: RecuadroRepository;
  fotos: FotoRepository;
  clubs: ClubRepository;
  entitlements: EntitlementsSource;
  composer: CardComposer;
  /**
   * `clubId` a usar para el escudo. En el diseño el Club es el del usuario dueño
   * del Momento; se recibe explícitamente para no acoplar este servicio a la
   * resolución de Temporada→usuario→Club, que vive en otras capas.
   */
  resolverClubId: (momentoId: UUID) => Promise<UUID | null>;
}

/**
 * Formatea el marcador de un partido finalizado como "golesLocal-golesVisita",
 * p. ej. `{ golesLocal: 2, golesVisita: 1 }` → "2-1" (Req 12.1).
 */
function formatearMarcador(golesLocal: number, golesVisita: number): string {
  return `${golesLocal}-${golesVisita}`;
}

/**
 * Generador_Cards inyectable. Orquesta la resolución de datos, el gating por
 * entitlements y la composición de la Digital_Card.
 */
export class CardsService {
  private readonly momentos: MomentoRepository;
  private readonly partidos: PartidoOficialRepository;
  private readonly recuadros: RecuadroRepository;
  private readonly fotos: FotoRepository;
  private readonly clubs: ClubRepository;
  private readonly entitlements: EntitlementsSource;
  private readonly composer: CardComposer;
  private readonly resolverClubId: (momentoId: UUID) => Promise<UUID | null>;

  constructor(deps: CardsServiceDeps) {
    this.momentos = deps.momentos;
    this.partidos = deps.partidos;
    this.recuadros = deps.recuadros;
    this.fotos = deps.fotos;
    this.clubs = deps.clubs;
    this.entitlements = deps.entitlements;
    this.composer = deps.composer;
    this.resolverClubId = deps.resolverClubId;
  }

  /**
   * Genera la Digital_Card de un Momento (`POST /cards`).
   *
   * Reglas:
   *  - Compone foto del usuario + marcador + escudo del Club en un formato
   *    compatible con las plataformas de destino (Req 12.1, 12.2).
   *  - Gating (Req 12.3, 12.4): si el Partido_Oficial del Momento es
   *    internacional (`esInternacional`) y el usuario NO tiene el derecho
   *    `digitalCardsInternacional` (Plan_Básico), rechaza informando que
   *    requiere Plan_Premium; Premium lo permite. Los partidos no
   *    internacionales se permiten a todos los planes.
   *
   * @param usuarioId Usuario que solicita la card (para consultar entitlements).
   * @param momentoId Momento a partir del cual se genera la card.
   * @returns El artefacto de imagen compuesto (Req 12.1, 12.2).
   * @throws {CardsError} `REQUIERE_PLAN_PREMIUM` si el gating rechaza (Req 12.4);
   *   o los códigos de datos ausentes cuando falta información para componer.
   */
  async generateCard(usuarioId: UUID, momentoId: UUID): Promise<CardArtefacto> {
    const momento = await this.momentos.findById(momentoId);
    if (momento === null) {
      throw new CardsError('MOMENTO_NO_ENCONTRADO', `No existe el Momento ${momentoId}.`);
    }

    const partido = await this.partidos.findById(momento.partidoOficialId);
    if (partido === null) {
      throw new CardsError(
        'PARTIDO_NO_ENCONTRADO',
        `No existe el Partido_Oficial ${momento.partidoOficialId} del Momento.`,
      );
    }

    // Gating por entitlements (Req 12.3, 12.4): solo aplica a partidos
    // internacionales. Para partidos no internacionales la card se permite a
    // todos los planes, así que ni siquiera se consulta el derecho.
    if (partido.esInternacional) {
      const entitlements = await this.entitlements.getEntitlements(usuarioId);
      if (!entitlements.digitalCardsInternacional) {
        throw new CardsError(
          'REQUIERE_PLAN_PREMIUM',
          'La generación de Digital Cards de Partidos_Internacionales requiere Plan_Premium.',
        );
      }
    }

    // Marcador: requiere resultado del partido (Req 12.1).
    if (partido.resultado === null) {
      throw new CardsError(
        'MARCADOR_NO_DISPONIBLE',
        `El Partido_Oficial ${partido.id} no tiene resultado; no hay marcador para la Digital_Card.`,
      );
    }
    const marcador = formatearMarcador(partido.resultado.golesLocal, partido.resultado.golesVisita);

    // Foto_Principal: se resuelve vía el Recuadro del partido (Req 12.1, 5.6).
    const recuadro = await this.recuadros.findByPartidoOficialId(partido.id);
    if (recuadro === null || recuadro.fotoPrincipalId === null) {
      throw new CardsError(
        'FOTO_PRINCIPAL_NO_DISPONIBLE',
        'No hay Foto_Principal seleccionada para el Momento; no se puede componer la Digital_Card.',
      );
    }
    const foto = await this.fotos.findById(recuadro.fotoPrincipalId);
    if (foto === null) {
      throw new CardsError(
        'FOTO_PRINCIPAL_NO_DISPONIBLE',
        `No existe la Foto_Principal ${recuadro.fotoPrincipalId} del Recuadro.`,
      );
    }

    // Escudo del Club (Req 12.1).
    const clubId = await this.resolverClubId(momentoId);
    const club = clubId === null ? null : await this.clubs.findById(clubId);
    if (club === null) {
      throw new CardsError(
        'CLUB_NO_ENCONTRADO',
        'No se encontró el Club para aportar el escudo de la Digital_Card.',
      );
    }

    // Composición delegada (Req 12.1, 12.2).
    return this.composer.componer({
      fotoObjectKey: foto.objectKey,
      marcador,
      escudoUrl: club.escudoUrl,
    });
  }
}
