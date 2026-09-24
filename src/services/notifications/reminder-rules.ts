// Reglas puras de decisión de recordatorios del Servicio_Notificaciones.
//
// El diseño pide "funciones puras que, dado now + zona horaria + estado, decidan
// qué notificaciones corresponden (deterministas y PBT-friendly)". Este módulo
// contiene esa lógica sin I/O: no consulta repositorios ni envía push, sólo
// calcula, para un instante de evaluación, qué recordatorios están vencidos.
//
// Cubre:
//   - Task 18.1 (Req 14.1–14.4): recordatorio inicial + reenvío ~cada 24h de
//     Recuadro vacío, anclado a la hora de envío local, con condiciones de paro
//     (Foto_Principal asignada ⇒ DETENIDO_POR_FOTO; silenciado/descartado ⇒
//     SILENCIADO).
//   - Task 18.2 (Req 14.6, 15.3): recordatorios de cierre en offsets locales
//     exactos 30/15/7/1 día y aviso de Dirección_Envío faltante al aproximarse
//     el cierre.

import type { EstadoRecordatorio, ZonaHoraria } from '../../domain/types.js';
import { isWithinSendHour, localCivilDayNumber, localDaysUntil } from './local-time.js';

/** Hora de envío local por defecto de los recordatorios (10:00, ver design). */
export const HORA_ENVIO_POR_DEFECTO = 10;

/**
 * Offsets exactos (en días locales que faltan) en los que se emite un
 * recordatorio de cierre escalonado (Req 14.6). En ningún otro offset se emite.
 */
export const OFFSETS_CIERRE_DIAS: readonly number[] = [30, 15, 7, 1];

/**
 * Umbral (en días locales) a partir del cual se considera que "se aproxima el
 * cierre" para avisar de Dirección_Envío faltante (Req 15.3). Coincide con el
 * primer offset escalonado: desde 30 días o menos (y antes del cierre).
 */
export const DIAS_APROXIMACION_CIERRE = 30;

// ---------------------------------------------------------------------------
// Task 18.1 — Recordatorios recurrentes de Recuadro vacío (Req 14.1–14.4)
// ---------------------------------------------------------------------------

/** Estado del recordatorio de un Recuadro para decidir su recurrencia. */
export interface EstadoRecuadroRecordatorio {
  /** `true` si el Recuadro tiene Foto_Principal asignada (Req 14.3 ⇒ paro). */
  readonly tieneFotoPrincipal: boolean;
  /** Estado del recordatorio persistido (Req 14.3/14.4 ⇒ paro si no ACTIVO). */
  readonly estadoRecordatorio: EstadoRecordatorio;
  /**
   * Instante (epoch ms) en que el Partido_Oficial pasó a finalizado. Ancla el
   * inicio de la ventana de recordatorios (Req 14.1) y la base del reenvío
   * diario (Req 14.2).
   */
  readonly finalizadoEnMs: number;
  /**
   * Instante (epoch ms) del último recordatorio enviado para este Recuadro, o
   * `null` si aún no se envió ninguno (recordatorio inicial pendiente).
   */
  readonly ultimoRecordatorioMs: number | null;
}

/** Decisión sobre el recordatorio recurrente de un Recuadro vacío. */
export interface DecisionRecuadro {
  /** `true` si corresponde enviar un recordatorio en este instante. */
  readonly debeEnviar: boolean;
  /** `true` si el recordatorio recurrente está detenido de forma permanente. */
  readonly detenido: boolean;
  /** `true` si el envío sería el recordatorio inicial (Req 14.1). */
  readonly esInicial: boolean;
}

/**
 * Decide si corresponde emitir un recordatorio de Recuadro vacío en `ahoraMs`.
 *
 * Reglas (Req 14.1–14.4):
 *   - Paro permanente si el Recuadro ya tiene Foto_Principal (Req 14.3) o si el
 *     recordatorio está SILENCIADO/descartado, o marcado DETENIDO_POR_FOTO
 *     (Req 14.4). En esos casos `debeEnviar = false` y `detenido = true`.
 *   - Mientras siga vacío y ACTIVO (Req 14.2), se emite:
 *       * el recordatorio inicial cuando aún no se envió ninguno y ya se alcanzó
 *         la hora de envío local del día de finalización o posterior (Req 14.1);
 *       * un reenvío cuando ha transcurrido al menos un día civil local desde el
 *         último recordatorio (cadencia ~24h anclada a la hora local — Req 14.2).
 *   - El envío sólo ocurre dentro de la ventana de la hora de envío local, de
 *     modo que los recordatorios respetan la zona horaria del usuario, no UTC.
 *
 * Función pura y determinista: sólo depende de sus argumentos.
 */
export function decidirRecordatorioRecuadro(
  estado: EstadoRecuadroRecordatorio,
  ahoraMs: number,
  zonaHoraria: ZonaHoraria,
  horaEnvio: number = HORA_ENVIO_POR_DEFECTO,
): DecisionRecuadro {
  // Condiciones de paro (Req 14.3, 14.4): tienen prioridad sobre todo lo demás.
  const detenido = estado.tieneFotoPrincipal || estado.estadoRecordatorio !== 'ACTIVO';
  if (detenido) {
    return { debeEnviar: false, detenido: true, esInicial: false };
  }

  // Aún no ha finalizado el partido: no hay recordatorio que emitir todavía.
  if (ahoraMs < estado.finalizadoEnMs) {
    return { debeEnviar: false, detenido: false, esInicial: false };
  }

  // Sólo se emite dentro de la ventana de la hora de envío local del usuario.
  if (!isWithinSendHour(ahoraMs, zonaHoraria, horaEnvio)) {
    return { debeEnviar: false, detenido: false, esInicial: false };
  }

  const ultimoMs = estado.ultimoRecordatorioMs;
  if (ultimoMs === null) {
    // Recordatorio inicial (Req 14.1): en el día local de finalización a la hora
    // de envío, o cualquier día local posterior a esa hora si aún no se envió.
    return { debeEnviar: true, detenido: false, esInicial: true };
  }

  // Reenvío recurrente (Req 14.2): al menos un día civil local desde el último.
  const diasDesdeUltimo =
    localCivilDayNumber(ahoraMs, zonaHoraria) - localCivilDayNumber(ultimoMs, zonaHoraria);
  const debeEnviar = diasDesdeUltimo >= 1;
  return { debeEnviar, detenido: false, esInicial: false };
}

// ---------------------------------------------------------------------------
// Task 18.2 — Recordatorios de cierre escalonados y dirección (Req 14.6, 15.3)
// ---------------------------------------------------------------------------

/** Decisión sobre los recordatorios a nivel de Temporada en un instante. */
export interface DecisionCierre {
  /**
   * Días locales que faltan para la Fecha_Límite_Cierre y que además son un
   * offset escalonado exacto (30/15/7/1), o `null` si el instante no cae en un
   * offset de recordatorio. Sólo tiene valor dentro de la hora de envío local.
   */
  readonly offsetCierre: number | null;
  /** `true` si corresponde avisar de Dirección_Envío válida faltante (Req 15.3). */
  readonly avisarDireccionFaltante: boolean;
}

/**
 * Decide, para un instante `ahoraMs`, si corresponde un recordatorio de cierre
 * escalonado y/o el aviso de Dirección_Envío faltante.
 *
 * Reglas:
 *   - Recordatorio de cierre (Req 14.6): se emite exactamente cuando faltan
 *     30, 15, 7 o 1 día LOCALES para la Fecha_Límite_Cierre, evaluado a la hora
 *     de envío local del usuario. En ningún otro offset se emite (Property 23).
 *   - Aviso de dirección (Req 15.3): si NO existe Dirección_Envío válida y el
 *     cierre se aproxima (faltan `1..DIAS_APROXIMACION_CIERRE` días locales,
 *     antes del cierre), se avisa a la hora de envío local.
 *
 * Ambas decisiones se anclan a la hora de envío local (no a UTC) y son puras.
 *
 * @param fechaLimiteMs Fecha_Límite_Cierre en epoch ms.
 * @param tieneDireccionValida `true` si el usuario ya tiene Dirección_Envío válida.
 */
export function decidirRecordatorioCierre(
  fechaLimiteMs: number,
  tieneDireccionValida: boolean,
  ahoraMs: number,
  zonaHoraria: ZonaHoraria,
  horaEnvio: number = HORA_ENVIO_POR_DEFECTO,
): DecisionCierre {
  // Fuera de la hora de envío local no se emite ningún recordatorio de cierre.
  if (!isWithinSendHour(ahoraMs, zonaHoraria, horaEnvio)) {
    return { offsetCierre: null, avisarDireccionFaltante: false };
  }

  const diasFaltantes = localDaysUntil(ahoraMs, fechaLimiteMs, zonaHoraria);

  // Offset escalonado exacto (Req 14.6): sólo 30/15/7/1.
  const offsetCierre = OFFSETS_CIERRE_DIAS.includes(diasFaltantes) ? diasFaltantes : null;

  // Aviso de dirección faltante al aproximarse el cierre (Req 15.3): sólo si no
  // hay dirección válida y quedan entre 1 y 30 días locales (antes del cierre).
  const avisarDireccionFaltante =
    !tieneDireccionValida && diasFaltantes >= 1 && diasFaltantes <= DIAS_APROXIMACION_CIERRE;

  return { offsetCierre, avisarDireccionFaltante };
}
