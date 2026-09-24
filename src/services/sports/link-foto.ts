// Servicio_Datos_Deportivos — enlace foto↔partido (`linkFoto`).
//
// `linkFoto` enlaza una `Foto` con la ficha técnica del `PartidoOficial`
// correspondiente **solo cuando el partido se identifica de forma unívoca**
// (exactamente un candidato — Req 9.4). Si no hay coincidencia (cero candidatos)
// o hay ambigüedad (múltiples candidatos), conserva la foto sin enlace, la marca
// `PENDIENTE_ASOCIACION` y notifica al usuario que el enlace automático no fue
// posible (Req 9.5).
//
// La resolución de candidatos se inyecta como una función `CandidateResolver`:
// mantiene esta lógica pura y agnóstica de cómo se calculan las coincidencias
// (por Momento, por fecha, por metadatos de la foto), y permite ejercitar los
// tres casos (cero / uno / múltiples) con dobles en pruebas.
//
// Task 8.4 — Requirements: 9.4, 9.5

import type { EstadoAsociacionFoto, Foto, PartidoOficial, UUID } from '../../domain/types.js';
import type { FotoRepository } from '../../persistence/repositories.js';
import type { Notifier } from './notifier.js';

/** Error base del enlace foto↔partido. */
export class LinkFotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkFotoError';
  }
}

/** Se lanza cuando el `fotoId` no corresponde a ninguna `Foto`. */
export class FotoNoEncontradaError extends LinkFotoError {
  constructor(public readonly fotoId: UUID) {
    super(`No existe una Foto con id ${fotoId}`);
    this.name = 'FotoNoEncontradaError';
  }
}

/**
 * Resuelve los `PartidoOficial` candidatos a los que una foto podría enlazarse.
 *
 * El enlace solo procede si devuelve **exactamente un** candidato (coincidencia
 * única — Req 9.4). Devolver 0 o ≥2 candidatos deja la foto pendiente de
 * asociación (Req 9.5). La estrategia concreta de coincidencia (por Momento,
 * por fecha/hora, por metadatos) es responsabilidad del llamador.
 */
export type CandidateResolver = (
  foto: Foto,
  signal?: AbortSignal,
) => Promise<readonly PartidoOficial[]>;

/** Resultado del enlace: enlazado con éxito a un partido único. */
export interface LinkFotoEnlazada {
  readonly resultado: 'ENLAZADA';
  /** Foto ya marcada como `ASOCIADA`. */
  readonly foto: Foto;
  /** Partido único con el que se enlazó la foto. */
  readonly partidoId: UUID;
}

/** Resultado del enlace: pendiente por cero o múltiples coincidencias. */
export interface LinkFotoPendiente {
  readonly resultado: 'PENDIENTE_ASOCIACION';
  /** Foto conservada sin enlace y marcada como `PENDIENTE_ASOCIACION`. */
  readonly foto: Foto;
  /** Número de candidatos hallados: `0` (sin coincidencia) o `≥2` (ambiguo). */
  readonly candidatos: number;
}

/** Resultado de `linkFoto`: enlace exitoso o foto pendiente de asociación. */
export type LinkFotoResult = LinkFotoEnlazada | LinkFotoPendiente;

/** Dependencias inyectables de `linkFoto`. */
export interface LinkFotoOptions {
  /** Repositorio de fotos para leer/persistir el estado de asociación. Requerido. */
  readonly fotoRepository: FotoRepository;
  /** Resolver de partidos candidatos para la foto. Requerido. */
  readonly resolveCandidates: CandidateResolver;
  /** Canal de notificación al usuario (Req 9.5). Requerido. */
  readonly notifier: Notifier;
  /** Señal de cancelación propagada al resolver. */
  readonly signal?: AbortSignal;
}

const ASOCIADA: EstadoAsociacionFoto = 'ASOCIADA';
const PENDIENTE: EstadoAsociacionFoto = 'PENDIENTE_ASOCIACION';

/**
 * Enlaza una foto con la ficha del `PartidoOficial` correspondiente solo si se
 * identifica de forma unívoca (Req 9.4); en caso contrario la deja pendiente de
 * asociación y notifica (Req 9.5).
 *
 * @param fotoId Identificador de la `Foto` a enlazar.
 * @param options Repositorio de fotos, resolver de candidatos, notificador y señal.
 * @returns El resultado del enlace (`ENLAZADA` o `PENDIENTE_ASOCIACION`).
 * @throws FotoNoEncontradaError si `fotoId` no existe.
 */
export async function linkFoto(fotoId: UUID, options: LinkFotoOptions): Promise<LinkFotoResult> {
  const { fotoRepository, resolveCandidates, notifier, signal } = options;

  const foto = await fotoRepository.findById(fotoId);
  if (foto === null) {
    throw new FotoNoEncontradaError(fotoId);
  }

  const candidatos = await resolveCandidates(foto, signal);

  // Coincidencia única: enlazar y marcar ASOCIADA (Req 9.4).
  if (candidatos.length === 1) {
    const partido = candidatos[0] as PartidoOficial;
    const fotoActualizada = await fotoRepository.update(fotoId, {
      estadoAsociacion: ASOCIADA,
    });
    return {
      resultado: 'ENLAZADA',
      foto: fotoActualizada,
      partidoId: partido.id,
    };
  }

  // Cero o múltiples coincidencias: conservar sin enlace, marcar pendiente y
  // notificar (Req 9.5).
  const fotoActualizada = await fotoRepository.update(fotoId, {
    estadoAsociacion: PENDIENTE,
  });
  await notifier.notificarAsociacionPendiente({
    fotoId,
    motivo: candidatos.length === 0 ? 'SIN_COINCIDENCIA' : 'MULTIPLES_COINCIDENCIAS',
    candidatos: candidatos.length,
  });

  return {
    resultado: 'PENDIENTE_ASOCIACION',
    foto: fotoActualizada,
    candidatos: candidatos.length,
  };
}
