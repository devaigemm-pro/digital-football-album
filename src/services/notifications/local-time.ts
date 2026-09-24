// Utilidades puras de hora local para el Servicio_Notificaciones (Req 14).
//
// El diseño ("Recordatorios anclados a la hora local del usuario") exige que
// TODOS los recordatorios se evalúen respecto a la zona horaria persistida del
// usuario (`Usuario.zonaHoraria`, IANA) a una hora de envío definida (p. ej.
// 10:00 hora local), NO en UTC crudo. Como no se permiten nuevas dependencias,
// la aritmética de zona horaria se apoya en `Intl.DateTimeFormat` con la opción
// `timeZone`, disponible de fábrica en Node (ICU incluido).
//
// Enfoque (documentado):
//   - Para obtener la "hora local" de un instante UTC en una zona IANA, se
//     formatea el instante con `Intl.DateTimeFormat` fijando `timeZone` y se
//     leen las partes (año, mes, día, hora, minuto). Esto respeta horario de
//     verano (DST) porque el formateador aplica las reglas de la zona.
//   - El "día civil local" (year-month-day en la zona del usuario) es la unidad
//     con la que se cuentan los offsets de cierre (30/15/7/1 día) y la cadencia
//     diaria (~24h) de los recordatorios recurrentes: ambos se anclan a un día
//     local concreto a la hora de envío, no a múltiplos exactos de 86 400 000 ms
//     en UTC (que se desalinearían con la hora local en los cambios de DST).
//
// Todas las funciones son puras y deterministas: dependen sólo de sus entradas
// (instante + zona horaria), por lo que son idóneas para property-based testing.

import type { ZonaHoraria } from '../../domain/types.js';

/** Partes de la hora local de un instante en una zona horaria dada. */
export interface LocalDateTimeParts {
  /** Año civil local (p. ej. 2025). */
  readonly year: number;
  /** Mes civil local en base 1 (1 = enero … 12 = diciembre). */
  readonly month: number;
  /** Día del mes civil local (1..31). */
  readonly day: number;
  /** Hora local en formato 24h (0..23). */
  readonly hour: number;
  /** Minuto local (0..59). */
  readonly minute: number;
}

/**
 * Cache de formateadores por zona horaria. Construir un `Intl.DateTimeFormat`
 * es relativamente costoso; como las zonas son pocas y se reutilizan mucho
 * (evaluaciones repetidas del job y 100+ iteraciones de PBT), se memoizan.
 */
const formatterCache = new Map<ZonaHoraria, Intl.DateTimeFormat>();

function getFormatter(zonaHoraria: ZonaHoraria): Intl.DateTimeFormat {
  const cached = formatterCache.get(zonaHoraria);
  if (cached !== undefined) {
    return cached;
  }
  // `hourCycle: 'h23'` fuerza horas 0..23 (evita el "24" de medianoche de h24).
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(zonaHoraria, formatter);
  return formatter;
}

/**
 * Descompone un instante UTC en las partes de su hora local en la zona dada.
 *
 * @param instanteMs Instante en epoch ms (UTC).
 * @param zonaHoraria Zona horaria IANA del usuario (p. ej. "America/Bogota").
 * @throws {RangeError} si `zonaHoraria` no es una zona IANA válida (propagado
 *   por `Intl.DateTimeFormat`); el llamador decide cómo tratar zonas inválidas.
 */
export function toLocalParts(instanteMs: number, zonaHoraria: ZonaHoraria): LocalDateTimeParts {
  const parts = getFormatter(zonaHoraria).formatToParts(new Date(instanteMs));
  const lookup: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

/**
 * Número de día ordinal proléptico gregoriano (días desde una época fija) a
 * partir de un año/mes/día civiles. Permite restar dos días civiles locales y
 * obtener la diferencia exacta en días sin verse afectado por husos ni DST
 * (porque opera sobre el calendario civil ya resuelto, no sobre instantes UTC).
 *
 * Usa el algoritmo de "days from civil" de Howard Hinnant (dominio público):
 * cuenta días respecto a 1970-01-01. El valor absoluto no importa; sólo se usa
 * para diferencias.
 */
export function civilDayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Número de día civil local (en la zona del usuario) de un instante UTC. */
export function localCivilDayNumber(instanteMs: number, zonaHoraria: ZonaHoraria): number {
  const { year, month, day } = toLocalParts(instanteMs, zonaHoraria);
  return civilDayNumber(year, month, day);
}

/**
 * Días civiles locales que faltan entre dos instantes, medidos en la zona del
 * usuario: `diaLocal(objetivo) - diaLocal(desde)`. Positivo si el objetivo es
 * un día local futuro, 0 el mismo día local, negativo si ya pasó.
 *
 * Se cuenta por día civil (no por múltiplos de 24h en UTC) porque los offsets
 * de cierre (30/15/7/1) son "días que faltan" en el calendario del usuario.
 */
export function localDaysUntil(
  desdeMs: number,
  objetivoMs: number,
  zonaHoraria: ZonaHoraria,
): number {
  return localCivilDayNumber(objetivoMs, zonaHoraria) - localCivilDayNumber(desdeMs, zonaHoraria);
}

/**
 * Indica si un instante cae dentro de la "ventana de envío" de un día local:
 * la hora local está en `[horaEnvio, horaEnvio + 1)`. El job de recordatorios
 * se ejecuta periódicamente (p. ej. cada hora); esta ventana selecciona la
 * ejecución que coincide con la hora de envío local del usuario, de modo que el
 * recordatorio se emita a esa hora local y una sola vez por día local.
 */
export function isWithinSendHour(
  instanteMs: number,
  zonaHoraria: ZonaHoraria,
  horaEnvio: number,
): boolean {
  const { hour } = toLocalParts(instanteMs, zonaHoraria);
  return hour === horaEnvio;
}
