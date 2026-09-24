// Servicio de Personalización / Selección de Club (Req 2).
//
// Implementa el contrato lógico de `PUT /usuario/club`: asigna el Club del
// usuario y aplica su identidad visual (paleta, escudo, activos visuales), con
// la regla de bloqueo por Temporada ACTIVA del Req 2.3.
//
// Diseño (design.md · "Servicio de Personalización / Selección de Club"):
//   - Asignar por primera vez un Club (usuario sin `clubId`) o re-asignar el
//     mismo Club siempre procede y aplica la identidad visual (Req 2.1, 2.2).
//   - Cambiar a un `clubId` distinto solo procede si el usuario NO tiene ninguna
//     Temporada en estado `ACTIVA`. Si la hay, se rechaza con un error de
//     conflicto (mapeable a `409 Conflict` en la capa API) SIN modificar el
//     `clubId`, para no invalidar el álbum en curso derivado del fixture del
//     Club actual (Req 2.3).
//
// El servicio es puro respecto a la infraestructura: recibe los repositorios por
// inyección (interfaces `UsuarioRepository`, `TemporadaRepository`,
// `ClubRepository`), de modo que puede ejercitarse con los dobles en memoria.
//
// Task 7.1 — Requirements: 2.1, 2.2, 2.3

import type { ActivosVisuales, Club, PaletaColores, Usuario, UUID } from '../../domain/types.js';
import type {
  ClubRepository,
  TemporadaRepository,
  UsuarioRepository,
} from '../../persistence/repositories.js';

/**
 * Identidad visual derivada del Club seleccionado que la App_Móvil aplica a la
 * interfaz: paleta de colores, escudo y activos visuales (estadio, camisetas)
 * (Req 2.1, 2.2).
 */
export interface IdentidadVisual {
  clubId: UUID;
  nombre: string;
  paletaColores: PaletaColores;
  escudoUrl: string;
  activosVisuales: ActivosVisuales;
}

/**
 * Resultado de asignar/cambiar el Club: el `Usuario` actualizado y la identidad
 * visual a aplicar. `cambiado` indica si el `clubId` efectivamente cambió (falso
 * cuando se re-asigna el mismo Club).
 */
export interface AsignarClubResultado {
  usuario: Usuario;
  identidadVisual: IdentidadVisual;
  cambiado: boolean;
}

/**
 * Se lanza cuando el usuario referenciado no existe. La capa API lo mapea a
 * `404 Not Found`.
 */
export class UsuarioNoEncontradoError extends Error {
  constructor(public readonly usuarioId: UUID) {
    super(`No se encontró Usuario con id "${usuarioId}"`);
    this.name = 'UsuarioNoEncontradoError';
  }
}

/**
 * Se lanza cuando el Club solicitado no existe. La capa API lo mapea a
 * `404 Not Found`.
 */
export class ClubNoEncontradoError extends Error {
  constructor(public readonly clubId: UUID) {
    super(`No se encontró Club con id "${clubId}"`);
    this.name = 'ClubNoEncontradoError';
  }
}

/**
 * Se lanza al intentar cambiar a un `clubId` distinto mientras el usuario tiene
 * al menos una Temporada en estado `ACTIVA`. La capa API la mapea a
 * `409 Conflict`. El `clubId` del usuario NO se modifica (Req 2.3).
 */
export class TemporadaActivaConflictError extends Error {
  constructor(
    public readonly usuarioId: UUID,
    public readonly clubActualId: UUID,
    public readonly clubSolicitadoId: UUID,
    public readonly temporadasActivasIds: readonly UUID[],
  ) {
    super(
      'No se puede cambiar de Club mientras exista una Temporada ACTIVA. ' +
        'Cierre (o no tenga) la Temporada activa antes de cambiar de Club.',
    );
    this.name = 'TemporadaActivaConflictError';
  }
}

/**
 * Servicio de selección de Club y personalización visual dinámica.
 *
 * Depende únicamente de las interfaces de repositorio, no de implementaciones
 * concretas, para ser testeable con los dobles en memoria.
 */
export class ClubService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly temporadas: TemporadaRepository,
    private readonly clubes: ClubRepository,
  ) {}

  /**
   * Asigna o cambia el Club del usuario y devuelve la identidad visual a
   * aplicar.
   *
   * Reglas (Req 2.1, 2.2, 2.3):
   *  - Si el usuario no tiene Club (`clubId === null`) o solicita el mismo Club
   *    que ya tiene, la operación siempre procede y aplica la identidad visual;
   *    el `clubId` solo se persiste cuando cambia (primera asignación).
   *  - Si solicita un Club distinto al actual, la operación solo procede cuando
   *    el usuario no tiene ninguna Temporada en estado `ACTIVA`; de lo contrario
   *    se lanza `TemporadaActivaConflictError` (→ 409) SIN modificar el `clubId`.
   *
   * @throws {UsuarioNoEncontradoError} si el usuario no existe.
   * @throws {ClubNoEncontradoError} si el Club solicitado no existe.
   * @throws {TemporadaActivaConflictError} si hay Temporada ACTIVA y se intenta
   *         cambiar a un Club distinto.
   */
  async asignarClub(usuarioId: UUID, clubId: UUID): Promise<AsignarClubResultado> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (usuario === null) {
      throw new UsuarioNoEncontradoError(usuarioId);
    }

    const club = await this.clubes.findById(clubId);
    if (club === null) {
      throw new ClubNoEncontradoError(clubId);
    }

    const esMismoClub = usuario.clubId === clubId;
    const esPrimeraAsignacion = usuario.clubId === null;

    // El cambio a un Club distinto (ni primera asignación ni mismo Club) está
    // sujeto a la regla de bloqueo por Temporada ACTIVA (Req 2.3).
    if (!esMismoClub && !esPrimeraAsignacion) {
      const activas = await this.temporadas.findActivasByUsuarioId(usuarioId);
      if (activas.length > 0) {
        // Rechazo sin modificar el clubId (Req 2.3).
        throw new TemporadaActivaConflictError(
          usuarioId,
          usuario.clubId as UUID,
          clubId,
          activas.map((t) => t.id),
        );
      }
    }

    const identidadVisual = this.derivarIdentidadVisual(club);

    // El mismo Club no requiere escritura del clubId; solo se re-aplica la
    // identidad visual. La primera asignación y el cambio permitido persisten.
    if (esMismoClub) {
      return { usuario, identidadVisual, cambiado: false };
    }

    const usuarioActualizado = await this.usuarios.update(usuarioId, { clubId });
    return { usuario: usuarioActualizado, identidadVisual, cambiado: true };
  }

  /**
   * Deriva la identidad visual (paleta, escudo, activos) desde el Club
   * seleccionado, que la App_Móvil aplica a la interfaz (Req 2.1, 2.2).
   */
  private derivarIdentidadVisual(club: Club): IdentidadVisual {
    return {
      clubId: club.id,
      nombre: club.nombre,
      paletaColores: club.paletaColores,
      escudoUrl: club.escudoUrl,
      activosVisuales: club.activosVisuales,
    };
  }
}
