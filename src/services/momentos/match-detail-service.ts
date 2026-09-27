// MatchDetailService — detalle de un partido para la vista de "lámina".
//
// Compone, para un `PartidoOficial` de la base:
//   - datos del partido (rival, competición, fecha, estado, resultado);
//   - el Recuadro asociado (número de lámina, si ya tiene Foto_Principal);
//   - el Momento (notas/reseña, contexto, jugador del partido) si existe;
//   - la ficha en vivo desde la API deportiva: goleadores y formaciones.
//
// La ficha en vivo se tolera vacía (si la API no la tiene o falla), para que el
// detalle del partido se muestre igualmente con lo persistido.

import type { UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
  RecuadroRepository,
} from '../../persistence/repositories.js';
import type { RawFormacionEquipo, RawGoleador, SportsApiClient } from '../sports/types.js';

/** Se lanza cuando el partido no existe. */
export class PartidoDetalleNoEncontradoError extends Error {
  readonly code = 'PARTIDO_NO_ENCONTRADO';
  constructor(partidoId: UUID) {
    super(`No se encontró el partido "${partidoId}".`);
    this.name = 'PartidoDetalleNoEncontradoError';
  }
}

/** Foto asociada al momento (para mostrar/elegir la de la lámina). */
export interface FotoMomento {
  readonly id: UUID;
  readonly objectKey: string;
  readonly esPrincipal: boolean;
}

/** Detalle completo del partido/lámina. */
export interface MatchDetail {
  readonly partidoId: UUID;
  readonly rival: string;
  readonly competicion: string;
  readonly fechaHora: string;
  readonly estado: string;
  readonly esClasico: boolean;
  readonly esInternacional: boolean;
  readonly resultado: { readonly golesLocal: number; readonly golesVisita: number } | null;
  readonly numeroRecuadro: number | null;
  /** Id del Recuadro asociado (para fijar la Foto_Principal), o null si aún no existe. */
  readonly recuadroId: UUID | null;
  readonly momentoId: UUID | null;
  readonly notas: string;
  readonly jugadorDelPartido: string | null;
  readonly fotoPrincipalId: UUID | null;
  readonly fotos: readonly FotoMomento[];
  readonly goleadores: readonly RawGoleador[];
  readonly formaciones: readonly RawFormacionEquipo[];
}

export interface MatchDetailDeps {
  readonly partidos: PartidoOficialRepository;
  readonly albumes: AlbumRepository;
  readonly recuadros: RecuadroRepository;
  readonly momentos: MomentoRepository;
  readonly fotos: FotoRepository;
  readonly sportsClient: SportsApiClient;
  /**
   * Si es `false`, se OMITE la llamada a la ficha en vivo (goleadores/
   * formaciones): sin proveedor deportivo configurado no tiene sentido intentar
   * (y evita el backoff de reintentos del cliente resiliente). Por defecto true.
   */
  readonly sportsEnabled?: boolean;
}

/** Servicio de detalle de partido/lámina. */
export class MatchDetailService {
  constructor(private readonly deps: MatchDetailDeps) {}

  /**
   * Compone el detalle de un partido: datos persistidos + Recuadro + Momento +
   * ficha en vivo (goleadores/formaciones). Valida que el partido exista.
   *
   * @throws {PartidoDetalleNoEncontradoError} si el partido no existe.
   */
  async getDetalle(partidoId: UUID): Promise<MatchDetail> {
    const { partidos, albumes, recuadros, momentos, fotos, sportsClient } = this.deps;

    const partido = await partidos.findById(partidoId);
    if (partido === null) {
      throw new PartidoDetalleNoEncontradoError(partidoId);
    }

    // Recuadro asociado (número de lámina + foto principal).
    const album = await albumes.findByTemporadaId(partido.temporadaId);
    const recuadro =
      album !== null
        ? ((await recuadros.findByAlbumId(album.id)).find(
            (r) => r.partidoOficialId === partidoId,
          ) ?? null)
        : null;

    // Momento (reseña/notas) y sus fotos.
    const momento = await momentos.findByPartidoOficialId(partidoId);
    const fotosMomento: FotoMomento[] = [];
    if (momento !== null) {
      const lista = await fotos.findByMomentoId(momento.id);
      for (const f of lista) {
        fotosMomento.push({
          id: f.id,
          objectKey: f.objectKey,
          esPrincipal: recuadro?.fotoPrincipalId === f.id,
        });
      }
    }

    // Ficha en vivo desde la API deportiva (tolerante a fallos). Se omite si el
    // proveedor no está configurado, para no incurrir en el backoff de reintentos.
    let goleadores: readonly RawGoleador[] = [];
    let formaciones: readonly RawFormacionEquipo[] = [];
    if (this.deps.sportsEnabled !== false) {
      try {
        const ficha = await sportsClient.fetchFichaPartido(partido.partidoExternoId);
        goleadores = ficha.goleadores ?? [];
        formaciones = ficha.formaciones ?? [];
      } catch {
        // La ficha en vivo no está disponible: se devuelve el detalle sin ella.
      }
    }

    return {
      partidoId: partido.id,
      rival: partido.rival,
      competicion: partido.competicion,
      fechaHora: partido.fechaHora,
      estado: partido.estado,
      esClasico: partido.esClasico,
      esInternacional: partido.esInternacional,
      resultado: partido.resultado,
      numeroRecuadro: recuadro?.numero ?? null,
      recuadroId: recuadro?.id ?? null,
      momentoId: momento?.id ?? null,
      notas: momento?.notas ?? '',
      jugadorDelPartido: momento?.jugadorDelPartido ?? null,
      fotoPrincipalId: recuadro?.fotoPrincipalId ?? null,
      fotos: fotosMomento,
      goleadores,
      formaciones,
    };
  }
}
