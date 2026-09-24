/**
 * Pruebas de las utilidades puras de hora local (Task 18.1/18.2 — Req 14).
 *
 * Verifican que el anclaje a la zona horaria del usuario (vía
 * `Intl.DateTimeFormat`) produce la hora/día local correctos y que la cuenta de
 * días locales que faltan para el cierre es coherente entre zonas horarias.
 */
import { describe, it, expect } from 'vitest';
import { fc, pbtAssert, gen } from '../../../test/pbt.js';
import { civilDayNumber, isWithinSendHour, localDaysUntil, toLocalParts } from './local-time.js';

describe('toLocalParts', () => {
  it('convierte un instante UTC a la hora local de Bogotá (UTC-5, sin DST)', () => {
    // 2025-06-15T15:00:00Z → 10:00 en America/Bogota (UTC-5).
    const ms = Date.parse('2025-06-15T15:00:00.000Z');
    const parts = toLocalParts(ms, 'America/Bogota');
    expect(parts).toMatchObject({
      year: 2025,
      month: 6,
      day: 15,
      hour: 10,
      minute: 0,
    });
  });

  it('convierte a la hora local de Tokio (UTC+9), cruzando al día siguiente', () => {
    // 2025-06-15T23:00:00Z → 2025-06-16 08:00 en Asia/Tokyo (UTC+9).
    const ms = Date.parse('2025-06-15T23:00:00.000Z');
    const parts = toLocalParts(ms, 'Asia/Tokyo');
    expect(parts).toMatchObject({ year: 2025, month: 6, day: 16, hour: 8 });
  });

  it('respeta el horario de verano (Europe/Madrid en verano es UTC+2)', () => {
    // En julio Madrid está en CEST (UTC+2): 08:00Z → 10:00 local.
    const ms = Date.parse('2025-07-01T08:00:00.000Z');
    const parts = toLocalParts(ms, 'Europe/Madrid');
    expect(parts.hour).toBe(10);
  });

  it('usa medianoche como hora 0 (hourCycle h23), no 24', () => {
    // 2025-06-15T05:00:00Z → 00:00 en America/Bogota (UTC-5).
    const ms = Date.parse('2025-06-15T05:00:00.000Z');
    const parts = toLocalParts(ms, 'America/Bogota');
    expect(parts.hour).toBe(0);
  });
});

describe('civilDayNumber', () => {
  it('asigna 0 a la época 1970-01-01 y días consecutivos a fechas consecutivas', () => {
    expect(civilDayNumber(1970, 1, 1)).toBe(0);
    expect(civilDayNumber(1970, 1, 2)).toBe(1);
    expect(civilDayNumber(1969, 12, 31)).toBe(-1);
  });

  it('cuenta correctamente a través de un año bisiesto', () => {
    // 2024 es bisiesto: del 2024-02-28 al 2024-03-01 hay 2 días (29 de por medio).
    expect(civilDayNumber(2024, 3, 1) - civilDayNumber(2024, 2, 28)).toBe(2);
  });
});

describe('localDaysUntil', () => {
  it('cuenta los días locales que faltan para el cierre en la zona del usuario', () => {
    const ahora = Date.parse('2025-06-01T15:00:00.000Z'); // 10:00 en Bogotá
    const limite = Date.parse('2025-07-01T04:59:59.000Z'); // 2025-06-30 23:59 Bogotá
    expect(localDaysUntil(ahora, limite, 'America/Bogota')).toBe(29);
  });

  it('el mismo instante puede caer en días locales distintos según la zona', () => {
    // 2025-06-15T02:00:00Z: en Bogotá (UTC-5) es aún el 14; en Tokio (UTC+9) es el 15.
    const ahora = Date.parse('2025-06-15T02:00:00.000Z');
    const limite = Date.parse('2025-06-20T12:00:00.000Z');
    const enBogota = localDaysUntil(ahora, limite, 'America/Bogota');
    const enTokio = localDaysUntil(ahora, limite, 'Asia/Tokyo');
    // El límite (2025-06-20) cae el día 20 en ambas; el "ahora" difiere de día.
    expect(enBogota).toBe(6); // desde el 14
    expect(enTokio).toBe(5); // desde el 15
  });
});

describe('isWithinSendHour', () => {
  it('es verdadero sólo cuando la hora local coincide con la hora de envío', () => {
    const enVentana = Date.parse('2025-06-15T15:30:00.000Z'); // 10:30 Bogotá
    const fueraVentana = Date.parse('2025-06-15T16:30:00.000Z'); // 11:30 Bogotá
    expect(isWithinSendHour(enVentana, 'America/Bogota', 10)).toBe(true);
    expect(isWithinSendHour(fueraVentana, 'America/Bogota', 10)).toBe(false);
  });

  // Feature: digital-football-album, Property 23 (soporte): la hora de envío se
  // evalúa en la zona local del usuario, nunca en UTC crudo.
  it('la ventana de envío depende de la zona horaria, no de UTC', () => {
    pbtAssert(
      fc.property(gen.timezone(), fc.integer({ min: 0, max: 23 }), (tz, horaEnvio) => {
        // Construimos un instante cuya hora LOCAL es exactamente `horaEnvio`.
        const base = Date.parse('2025-06-15T12:00:00.000Z');
        const { hour } = toLocalParts(base, tz);
        const ajusteHoras = (horaEnvio - hour + 24) % 24;
        const instante = base + ajusteHoras * 3_600_000;
        expect(isWithinSendHour(instante, tz, horaEnvio)).toBe(true);
      }),
    );
  });
});
