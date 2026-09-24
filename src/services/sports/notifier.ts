// Servicio_Datos_Deportivos — interfaz de notificación al usuario.
//
// `linkFoto` (Task 8.4) debe notificar al usuario cuando el enlace automático
// foto↔partido no fue posible (cero o múltiples coincidencias — Req 9.5). Para
// no acoplar la lógica de enlace al canal concreto (push, email, cola de
// eventos), se depende de esta abstracción **inyectable y mockeable**.
//
// Se define una interfaz local propia del módulo `sports` para evitar acoplarse
// a un `Servicio_Notificaciones` transversal que puede no existir todavía
// (Task 18). En producción se cablea un adaptador que delegue al canal real.
//
// Task 8.4 — Requirements: 9.5

import type { UUID } from '../../domain/types.js';

/** Motivo por el que el enlace automático foto↔partido no fue posible (Req 9.5). */
export type MotivoAsociacionFallida = 'SIN_COINCIDENCIA' | 'MULTIPLES_COINCIDENCIAS';

/**
 * Aviso emitido al usuario cuando una foto queda pendiente de asociación porque
 * no pudo enlazarse a un partido identificado de forma unívoca (Req 9.5).
 */
export interface AvisoAsociacionPendiente {
  /** Foto que quedó sin enlace y marcada como `PENDIENTE_ASOCIACION`. */
  readonly fotoId: UUID;
  /** Motivo estructurado del fallo del enlace automático. */
  readonly motivo: MotivoAsociacionFallida;
  /**
   * Cantidad de partidos candidatos hallados: `0` para `SIN_COINCIDENCIA`,
   * `≥2` para `MULTIPLES_COINCIDENCIAS`. Útil para el mensaje al usuario.
   */
  readonly candidatos: number;
}

/**
 * Canal de notificación al usuario, inyectable y mockeable. `linkFoto` lo invoca
 * únicamente cuando la foto queda pendiente de asociación (Req 9.5). La
 * implementación concreta (push/email/cola) vive fuera de este módulo.
 */
export interface Notifier {
  /**
   * Notifica al usuario que el enlace automático de una foto con un partido no
   * fue posible y que la foto quedó pendiente de asociación (Req 9.5).
   */
  notificarAsociacionPendiente(aviso: AvisoAsociacionPendiente): Promise<void>;
}
