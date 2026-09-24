// Motor_Momentos — contexto de asistencia, sub-modalidad, notas y jugador
// (`updateMomento`).
//
// Un Momento registra cómo el hincha vivió un Partido_Oficial (design.md ·
// Motor_Momentos · `PATCH /momentos/{momentoId}`). Este módulo aplica un parche
// parcial sobre el Momento:
//   - `contextoAsistencia`: En Vivo Local / En Vivo Visita / Transmisión (Req 6.1);
//   - `subModalidad`: Televisión / Bar / Streaming, VÁLIDA únicamente cuando el
//     contexto resultante es `TRANSMISION` (Req 6.4). Fuera de Transmisión debe
//     ser `null`; especificar una sub-modalidad en otro contexto se rechaza con
//     error tipado (design.md · Property 10);
//   - `geoVerificado`: verificación opcional por geolocalización (Req 6.2);
//   - `notas`: bitácora personal, persistida y round-trippable (Req 7.1, 7.2);
//   - `jugadorDelPartido`: Jugador_del_Partido, limitado a la alineación
//     disponible del partido; un jugador fuera de la alineación se rechaza con
//     error tipado (Req 8.1, 8.2; design.md · Property 12).
//
// El parche es parcial: solo se validan y aplican los campos presentes. La
// sub-modalidad se valida contra el contexto **resultante** (el nuevo si el
// parche lo cambia, o el vigente en caso contrario) para mantener siempre la
// invariante "sub-modalidad ⇒ Transmisión". El módulo depende solo de las
// interfaces de repositorio y se ejercita con los dobles en memoria.
//
// Task 11.3 — Requirements: 6.1, 6.4, 7.1, 7.2, 8.1, 8.2

import type {
  ContextoAsistencia,
  Momento,
  SubModalidadTransmision,
  UUID,
} from '../../domain/types.js';
import type {
  MomentoRepository,
  PartidoOficialRepository,
} from '../../persistence/repositories.js';

/** Error base de la actualización de un Momento. */
export class UpdateMomentoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateMomentoError';
  }
}

/** Se lanza cuando el `momentoId` no corresponde a ningún Momento. */
export class MomentoNoEncontradoError extends UpdateMomentoError {
  constructor(public readonly momentoId: UUID) {
    super(`No existe un Momento con id ${momentoId}`);
    this.name = 'MomentoNoEncontradoError';
  }
}

/**
 * Se lanza cuando se especifica una `subModalidad` no nula pero el contexto de
 * asistencia resultante no es `TRANSMISION` (Req 6.4). La sub-modalidad
 * (Televisión/Bar/Streaming) solo es válida bajo Transmisión. La capa API la
 * mapea a `400 Bad Request`.
 */
export class SubModalidadInvalidaError extends UpdateMomentoError {
  constructor(
    public readonly contextoAsistencia: ContextoAsistencia,
    public readonly subModalidad: SubModalidadTransmision,
  ) {
    super(
      `La sub-modalidad "${subModalidad}" solo es válida con contexto TRANSMISION, no con "${contextoAsistencia}"`,
    );
    this.name = 'SubModalidadInvalidaError';
  }
}

/**
 * Se lanza cuando el `jugadorDelPartido` seleccionado no pertenece a la
 * alineación disponible del partido (Req 8.1). La capa API la mapea a
 * `400 Bad Request`.
 */
export class JugadorFueraDeAlineacionError extends UpdateMomentoError {
  constructor(
    public readonly momentoId: UUID,
    public readonly jugadorDelPartido: string,
  ) {
    super(
      `El Jugador_del_Partido "${jugadorDelPartido}" no pertenece a la alineación disponible del partido del Momento ${momentoId}`,
    );
    this.name = 'JugadorFueraDeAlineacionError';
  }
}

/**
 * Parche parcial de un Momento. Cada campo es opcional: solo los presentes se
 * validan y aplican. `undefined` significa "no tocar"; para limpiar la
 * sub-modalidad o el jugador se pasa explícitamente `null`.
 */
export interface UpdateMomentoPatch {
  /** Contexto de asistencia: En Vivo Local / Visita / Transmisión (Req 6.1). */
  readonly contextoAsistencia?: ContextoAsistencia;
  /**
   * Sub-modalidad de Transmisión (Req 6.4). Solo válida si el contexto
   * resultante es `TRANSMISION`; `null` la limpia.
   */
  readonly subModalidad?: SubModalidadTransmision | null;
  /** Verificación opcional por geolocalización en contextos En Vivo (Req 6.2). */
  readonly geoVerificado?: boolean;
  /** Notas / bitácora personal, persistidas tal cual (Req 7.1, 7.2). */
  readonly notas?: string;
  /**
   * Jugador_del_Partido (Man of the Match); debe pertenecer a la alineación
   * disponible del partido (Req 8.1, 8.2). `null` la limpia.
   */
  readonly jugadorDelPartido?: string | null;
}

/** Dependencias inyectadas de `updateMomento`. */
export interface UpdateMomentoDeps {
  /** Momentos; localiza y actualiza el Momento. Requerido. */
  readonly momentos: MomentoRepository;
  /** Partidos oficiales; provee la alineación para validar el jugador. Requerido. */
  readonly partidos: PartidoOficialRepository;
}

/**
 * Aplica un parche parcial a un Momento validando las reglas del dominio
 * (Req 6.1, 6.4, 7.1, 7.2, 8.1, 8.2).
 *
 * Reglas:
 *  - El Momento debe existir; si no, `MomentoNoEncontradoError`.
 *  - `subModalidad` no nula requiere que el contexto **resultante** sea
 *    `TRANSMISION`; si no, `SubModalidadInvalidaError` y no se escribe nada.
 *  - `jugadorDelPartido` no nulo debe pertenecer a la alineación del partido;
 *    si no, `JugadorFueraDeAlineacionError` y no se escribe nada.
 *  - `notas` se persiste tal cual (round-trip exacto).
 *
 * @param momentoId Momento a actualizar.
 * @param patch Campos a modificar (parcial).
 * @param deps Repositorios inyectados.
 * @returns El Momento actualizado.
 * @throws MomentoNoEncontradoError si el Momento no existe.
 * @throws SubModalidadInvalidaError si la sub-modalidad no cuadra con el contexto.
 * @throws JugadorFueraDeAlineacionError si el jugador no está en la alineación.
 */
export async function updateMomento(
  momentoId: UUID,
  patch: UpdateMomentoPatch,
  deps: UpdateMomentoDeps,
): Promise<Momento> {
  const momento = await deps.momentos.findById(momentoId);
  if (momento === null) {
    throw new MomentoNoEncontradoError(momentoId);
  }

  // Contexto resultante: el nuevo si el parche lo cambia, o el vigente.
  const contextoResultante = patch.contextoAsistencia ?? momento.contextoAsistencia;

  // Sub-modalidad resultante: la del parche si viene, o la vigente. Esto
  // garantiza que la invariante "sub-modalidad ⇒ Transmisión" se preserve
  // incluso cuando solo cambia el contexto y queda una sub-modalidad previa.
  const subModalidadResultante =
    patch.subModalidad !== undefined ? patch.subModalidad : momento.subModalidad;

  // Regla Req 6.4: una sub-modalidad no nula exige contexto TRANSMISION.
  if (subModalidadResultante !== null && contextoResultante !== 'TRANSMISION') {
    throw new SubModalidadInvalidaError(contextoResultante, subModalidadResultante);
  }

  // Regla Req 8.1: el Jugador_del_Partido debe estar en la alineación disponible.
  if (patch.jugadorDelPartido !== undefined && patch.jugadorDelPartido !== null) {
    const partido = await deps.partidos.findById(momento.partidoOficialId);
    const enAlineacion =
      partido !== null &&
      partido.alineacion.some(
        (j) => j.id === patch.jugadorDelPartido || j.nombre === patch.jugadorDelPartido,
      );
    if (!enAlineacion) {
      throw new JugadorFueraDeAlineacionError(momentoId, patch.jugadorDelPartido);
    }
  }

  // Construir el parche de persistencia solo con los campos presentes.
  const cambios: Partial<Omit<Momento, 'id'>> = {};
  if (patch.contextoAsistencia !== undefined) {
    cambios.contextoAsistencia = patch.contextoAsistencia;
  }
  if (patch.subModalidad !== undefined) {
    cambios.subModalidad = patch.subModalidad;
  }
  if (patch.geoVerificado !== undefined) {
    cambios.geoVerificado = patch.geoVerificado;
  }
  if (patch.notas !== undefined) {
    cambios.notas = patch.notas;
  }
  if (patch.jugadorDelPartido !== undefined) {
    cambios.jugadorDelPartido = patch.jugadorDelPartido;
  }

  return deps.momentos.update(momentoId, cambios);
}
