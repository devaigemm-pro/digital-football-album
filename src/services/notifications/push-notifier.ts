// Abstracción de entrega push del Servicio_Notificaciones (Req 14, 15.3).
//
// El diseño exige "abstraer la entrega push detrás de una interfaz mockeable":
// el servicio decide QUÉ notificaciones corresponden (lógica pura, testeable)
// y delega el CÓMO enviarlas en esta interfaz, que en producción hablaría con
// APNs/FCM y en pruebas es un doble que registra los envíos.

import type { UUID } from '../../domain/types.js';

/**
 * Tipo de recordatorio push emitido por el Servicio_Notificaciones. Cada tipo
 * mapea a un criterio de aceptación del Req 14/15.3.
 */
export type TipoNotificacion =
  /** Recordatorio inicial de Recuadro vacío al finalizar el partido (Req 14.1). */
  | 'RECUADRO_VACIO_INICIAL'
  /** Reenvío recurrente (~24h) del recordatorio de Recuadro vacío (Req 14.2). */
  | 'RECUADRO_VACIO_RECURRENTE'
  /** Recordatorio escalonado de cierre en offset 30/15/7/1 día (Req 14.6). */
  | 'CIERRE_ESCALONADO'
  /** Aviso de Dirección_Envío válida faltante al aproximarse el cierre (Req 15.3). */
  | 'DIRECCION_ENVIO_FALTANTE';

/**
 * Notificación push concreta a entregar. Es el resultado de la decisión pura
 * del servicio; el `PushNotifier` sólo la transporta.
 */
export interface NotificacionPush {
  /** Usuario destinatario. */
  readonly usuarioId: UUID;
  /** Tipo de recordatorio (criterio de aceptación que lo origina). */
  readonly tipo: TipoNotificacion;
  /**
   * Recuadro relacionado, cuando aplica (recordatorios de Recuadro vacío —
   * Req 14.1, 14.2). `null` para recordatorios a nivel de Temporada.
   */
  readonly recuadroId: UUID | null;
  /**
   * Temporada relacionada, cuando aplica (recordatorios de cierre y de
   * dirección — Req 14.6, 15.3). `null` para recordatorios a nivel de Recuadro.
   */
  readonly temporadaId: UUID | null;
  /**
   * Días locales que faltan para la Fecha_Límite_Cierre en los recordatorios de
   * cierre escalonados (30/15/7/1 — Req 14.6). `null` cuando no aplica.
   */
  readonly diasParaCierre: number | null;
}

/**
 * Interfaz mockeable de entrega push. En producción envía vía APNs/FCM; en
 * pruebas, un doble registra las notificaciones para verificarlas.
 */
export interface PushNotifier {
  /** Entrega una notificación push al dispositivo del usuario. */
  enviar(notificacion: NotificacionPush): Promise<void>;
}
