// Servicio_Datos_Deportivos — sincronización de un partido finalizado.
//
// `syncPartidoFinalizado` se dispara cuando un `Partido_Oficial` pasa a estado
// finalizado en la API deportiva externa: obtiene la ficha técnica (resultado
// final, alineación inicial y eventos clave) vía `SportsApiClient.fetchFichaPartido`
// y la **persiste** sobre el `PartidoOficial`, dejándolo en estado `FINALIZADO`
// (Req 9.3). El plazo de ≤5 min es una garantía del programador de jobs
// (Task 22), no de esta función pura de dominio.
//
// Task 8.4 — Requirements: 9.3

import type {
  EventoPartido,
  JugadorAlineacion,
  PartidoOficial,
  ResultadoPartido,
  UUID,
} from '../../domain/types.js';
import type { PartidoOficialRepository } from '../../persistence/repositories.js';
import type {
  RawEventoPartido,
  RawFichaPartido,
  RawJugadorAlineacion,
  RawResultado,
  SportsApiClient,
} from './types.js';

/** Error de sincronización de un partido finalizado. */
export class SyncFinalizadoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncFinalizadoError';
  }
}

/** Se lanza cuando el `partidoId` no corresponde a ningún `PartidoOficial`. */
export class PartidoNoEncontradoError extends SyncFinalizadoError {
  constructor(public readonly partidoId: UUID) {
    super(`No existe un Partido_Oficial con id ${partidoId}`);
    this.name = 'PartidoNoEncontradoError';
  }
}

/** Dependencias inyectables de `syncPartidoFinalizado`. */
export interface SyncPartidoFinalizadoOptions {
  /** Repositorio de partidos para leer/persistir la ficha (mockeable). Requerido. */
  readonly partidoRepository: PartidoOficialRepository;
  /** Cliente de la API deportiva para obtener la ficha (mockeable). Requerido. */
  readonly client: SportsApiClient;
  /** Señal de cancelación propagada al cliente (timeout/abort — Req 9.1). */
  readonly signal?: AbortSignal;
}

/** Mapea el resultado crudo de la API al tipo de dominio. */
function mapearResultado(raw: RawResultado): ResultadoPartido {
  return { golesLocal: raw.golesLocal, golesVisita: raw.golesVisita };
}

/** Mapea la alineación cruda de la API al tipo de dominio. */
function mapearAlineacion(raw: readonly RawJugadorAlineacion[]): JugadorAlineacion[] {
  return raw.map((jugador) => ({ id: jugador.id, nombre: jugador.nombre }));
}

/** Mapea los eventos crudos de la API al tipo de dominio. */
function mapearEventos(raw: readonly RawEventoPartido[]): EventoPartido[] {
  return raw.map((evento) => ({
    minuto: evento.minuto,
    tipo: evento.tipo,
    ...(evento.descripcion !== undefined ? { descripcion: evento.descripcion } : {}),
  }));
}

/**
 * Sincroniza la ficha de un partido finalizado y la persiste en el
 * `PartidoOficial`.
 *
 * Cuando un partido pasa a finalizado, obtiene de la API su resultado final,
 * alineación inicial y eventos clave (usando su `partidoExternoId`), y los
 * persiste dejando el partido en estado `FINALIZADO` (Req 9.3). Es idempotente:
 * reejecutarla sobre un partido ya sincronizado vuelve a fijar la misma ficha.
 *
 * @param partidoId Identificador interno del `PartidoOficial` (no el externo).
 * @param options Repositorio de partidos, cliente deportivo y señal opcional.
 * @returns El `PartidoOficial` actualizado con su ficha.
 * @throws PartidoNoEncontradoError si `partidoId` no existe.
 */
export async function syncPartidoFinalizado(
  partidoId: UUID,
  options: SyncPartidoFinalizadoOptions,
): Promise<PartidoOficial> {
  const { partidoRepository, client, signal } = options;

  const partido = await partidoRepository.findById(partidoId);
  if (partido === null) {
    throw new PartidoNoEncontradoError(partidoId);
  }

  const ficha: RawFichaPartido = await client.fetchFichaPartido(partido.partidoExternoId, signal);

  return partidoRepository.update(partidoId, {
    estado: 'FINALIZADO',
    resultado: mapearResultado(ficha.resultado),
    alineacion: mapearAlineacion(ficha.alineacion),
    eventos: mapearEventos(ficha.eventos),
  });
}
