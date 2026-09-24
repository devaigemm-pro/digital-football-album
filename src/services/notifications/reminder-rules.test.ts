/**
 * Pruebas de las reglas puras de decisión de recordatorios (Task 18.1/18.2).
 *
 * Cubre:
 *  - Req 14.1–14.4: recordatorio inicial + reenvío ~24h de Recuadro vacío y las
 *    condiciones de paro (Foto_Principal asignada / silenciado o descartado).
 *  - Req 14.6, 15.3: offsets de cierre exactos 30/15/7/1 en hora local y aviso
 *    de Dirección_Envío faltante al aproximarse el cierre.
 *
 * Incluye los property tests de las Correctness Properties 22 y 23 del diseño.
 */
import { describe, it, expect } from 'vitest';
import { fc, pbtAssert, gen } from '../../../test/pbt.js';
import type { EstadoRecordatorio } from '../../domain/types.js';
import { localDaysUntil, toLocalParts } from './local-time.js';
import {
  decidirRecordatorioCierre,
  decidirRecordatorioRecuadro,
  OFFSETS_CIERRE_DIAS,
  type EstadoRecuadroRecordatorio,
} from './reminder-rules.js';

const TZ = 'America/Bogota'; // UTC-5, sin DST → aritmética local predecible.
const HORA_ENVIO = 10;

/** Instante UTC cuya hora local en Bogotá es la hora de envío del día dado. */
function bogotaEnviarEl(fechaLocal: string): number {
  // 10:00 Bogotá = 15:00Z.
  return Date.parse(`${fechaLocal}T15:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// Task 18.1 — decidirRecordatorioRecuadro (Req 14.1–14.4)
// ---------------------------------------------------------------------------

describe('decidirRecordatorioRecuadro', () => {
  const finalizado = bogotaEnviarEl('2025-06-01');

  function estado(over: Partial<EstadoRecuadroRecordatorio> = {}): EstadoRecuadroRecordatorio {
    return {
      tieneFotoPrincipal: false,
      estadoRecordatorio: 'ACTIVO',
      finalizadoEnMs: finalizado,
      ultimoRecordatorioMs: null,
      ...over,
    };
  }

  it('emite el recordatorio inicial en la hora de envío local tras finalizar (Req 14.1)', () => {
    const d = decidirRecordatorioRecuadro(estado(), finalizado, TZ, HORA_ENVIO);
    expect(d).toMatchObject({ debeEnviar: true, esInicial: true, detenido: false });
  });

  it('NO emite fuera de la hora de envío local', () => {
    const fueraDeHora = finalizado + 3_600_000; // 11:00 Bogotá
    const d = decidirRecordatorioRecuadro(estado(), fueraDeHora, TZ, HORA_ENVIO);
    expect(d.debeEnviar).toBe(false);
  });

  it('reenvía al día local siguiente a la hora de envío (Req 14.2)', () => {
    const ayer = bogotaEnviarEl('2025-06-01');
    const hoy = bogotaEnviarEl('2025-06-02');
    const d = decidirRecordatorioRecuadro(
      estado({ ultimoRecordatorioMs: ayer }),
      hoy,
      TZ,
      HORA_ENVIO,
    );
    expect(d).toMatchObject({ debeEnviar: true, esInicial: false });
  });

  it('NO reenvía dos veces el mismo día local (dedup de la cadencia diaria)', () => {
    const inicialHoy = bogotaEnviarEl('2025-06-02');
    const masTardeHoy = inicialHoy; // mismo día local
    const d = decidirRecordatorioRecuadro(
      estado({ ultimoRecordatorioMs: inicialHoy }),
      masTardeHoy,
      TZ,
      HORA_ENVIO,
    );
    expect(d.debeEnviar).toBe(false);
  });

  it('se detiene al asignar Foto_Principal (Req 14.3)', () => {
    const d = decidirRecordatorioRecuadro(
      estado({ tieneFotoPrincipal: true, estadoRecordatorio: 'DETENIDO_POR_FOTO' }),
      bogotaEnviarEl('2025-06-05'),
      TZ,
      HORA_ENVIO,
    );
    expect(d).toMatchObject({ debeEnviar: false, detenido: true });
  });

  it('se detiene al silenciar/descartar el recordatorio (Req 14.4)', () => {
    const d = decidirRecordatorioRecuadro(
      estado({ estadoRecordatorio: 'SILENCIADO' }),
      bogotaEnviarEl('2025-06-05'),
      TZ,
      HORA_ENVIO,
    );
    expect(d).toMatchObject({ debeEnviar: false, detenido: true });
  });

  // Feature: digital-football-album, Property 22: Recordatorio recurrente de
  // Recuadro con condiciones de paro. Para cualquier línea temporal posterior a
  // la finalización se emite un recordatorio cada 24h mientras el Recuadro siga
  // vacío y no silenciado/descartado; deja de emitirse al asignar Foto_Principal
  // o al silenciar/descartar.
  // Validates: Requirements 14.1, 14.2, 14.3, 14.4
  it('Property 22: recurrencia diaria en hora local con paro determinista', () => {
    const estadoParado = fc.constantFrom<EstadoRecordatorio>('DETENIDO_POR_FOTO', 'SILENCIADO');
    pbtAssert(
      fc.property(
        gen.timezone(),
        fc.integer({ min: 0, max: 60 }), // días locales tras la finalización
        fc.boolean(), // tiene Foto_Principal
        fc.oneof(fc.constant<EstadoRecordatorio>('ACTIVO'), estadoParado),
        (tz, diasDespues, tieneFoto, estadoRec) => {
          const finMs = Date.parse('2025-03-01T13:00:00.000Z');
          // Instante candidato: `diasDespues` días después, a mediodía UTC.
          const candidato = finMs + diasDespues * 86_400_000;
          // Forzamos que el candidato caiga en la hora de envío LOCAL.
          const { hour } = toLocalParts(candidato, tz);
          const enHoraLocal = candidato + ((HORA_ENVIO - hour + 24) % 24) * 3_600_000;

          // Último recordatorio: null para probar el inicial; un día local
          // estrictamente anterior para probar el reenvío (usamos 5 días atrás
          // para garantizar, en cualquier zona/DST, un gap ≥ 1 día civil local).
          const ultimoRecordatorioMs = diasDespues === 0 ? null : enHoraLocal - 5 * 86_400_000;

          const st: EstadoRecuadroRecordatorio = {
            tieneFotoPrincipal: tieneFoto,
            estadoRecordatorio: estadoRec,
            finalizadoEnMs: finMs,
            ultimoRecordatorioMs,
          };

          const d = decidirRecordatorioRecuadro(st, enHoraLocal, tz, HORA_ENVIO);

          const debeEstarParado = tieneFoto || estadoRec !== 'ACTIVO';
          if (debeEstarParado) {
            // Paro determinista: nunca se emite (Req 14.3, 14.4).
            expect(d.debeEnviar).toBe(false);
            expect(d.detenido).toBe(true);
          } else {
            // Activo y vacío en la hora de envío local: se emite el inicial
            // (sin previo) o el reenvío (gap ≥ 1 día local) — Req 14.1, 14.2.
            expect(d.detenido).toBe(false);
            expect(d.debeEnviar).toBe(true);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 18.2 — decidirRecordatorioCierre (Req 14.6, 15.3)
// ---------------------------------------------------------------------------

describe('decidirRecordatorioCierre', () => {
  const LIMITE_LOCAL = '2025-07-31'; // día local del cierre en Bogotá
  const fechaLimiteMs = Date.parse('2025-08-01T04:59:59.000Z'); // 2025-07-31 23:59 Bogotá

  it('emite recordatorio de cierre exactamente en los offsets 30/15/7/1 (Req 14.6)', () => {
    for (const offset of OFFSETS_CIERRE_DIAS) {
      // día local = límite - offset
      const diaLocal = restarDiasLocal(LIMITE_LOCAL, offset);
      const ahora = bogotaEnviarEl(diaLocal);
      const d = decidirRecordatorioCierre(fechaLimiteMs, true, ahora, TZ, HORA_ENVIO);
      expect(d.offsetCierre).toBe(offset);
    }
  });

  it('NO emite recordatorio de cierre en offsets no escalonados (Req 14.6)', () => {
    for (const offset of [29, 20, 10, 5, 2, 0]) {
      const diaLocal = restarDiasLocal(LIMITE_LOCAL, offset);
      const ahora = bogotaEnviarEl(diaLocal);
      const d = decidirRecordatorioCierre(fechaLimiteMs, true, ahora, TZ, HORA_ENVIO);
      expect(d.offsetCierre).toBeNull();
    }
  });

  it('NO emite fuera de la hora de envío local aunque falte un offset exacto', () => {
    const diaLocal = restarDiasLocal(LIMITE_LOCAL, 7);
    const fueraDeHora = bogotaEnviarEl(diaLocal) + 2 * 3_600_000; // 12:00 Bogotá
    const d = decidirRecordatorioCierre(fechaLimiteMs, true, fueraDeHora, TZ, HORA_ENVIO);
    expect(d.offsetCierre).toBeNull();
  });

  it('avisa de Dirección_Envío faltante al aproximarse el cierre (Req 15.3)', () => {
    const diaLocal = restarDiasLocal(LIMITE_LOCAL, 15);
    const ahora = bogotaEnviarEl(diaLocal);
    const d = decidirRecordatorioCierre(fechaLimiteMs, false, ahora, TZ, HORA_ENVIO);
    expect(d.avisarDireccionFaltante).toBe(true);
  });

  it('NO avisa de dirección faltante si ya hay Dirección_Envío válida (Req 15.3)', () => {
    const diaLocal = restarDiasLocal(LIMITE_LOCAL, 15);
    const ahora = bogotaEnviarEl(diaLocal);
    const d = decidirRecordatorioCierre(fechaLimiteMs, true, ahora, TZ, HORA_ENVIO);
    expect(d.avisarDireccionFaltante).toBe(false);
  });

  it('NO avisa de dirección faltante si el cierre aún no se aproxima (>30 días)', () => {
    const diaLocal = restarDiasLocal(LIMITE_LOCAL, 45);
    const ahora = bogotaEnviarEl(diaLocal);
    const d = decidirRecordatorioCierre(fechaLimiteMs, false, ahora, TZ, HORA_ENVIO);
    expect(d.avisarDireccionFaltante).toBe(false);
  });

  // Feature: digital-football-album, Property 23: Recordatorios de cierre en los
  // offsets exactos (hora local del usuario). Se emite recordatorio de cierre
  // exactamente cuando faltan 30, 15, 7 y 1 día, y no en otros offsets,
  // evaluado en la hora local del usuario.
  // Validates: Requirements 14.6
  it('Property 23: offsets de cierre exactos en hora local, en cualquier zona', () => {
    pbtAssert(
      fc.property(
        gen.timezone(),
        fc.integer({ min: 0, max: 40 }), // días locales que faltan (aproximados)
        (tz, diasAprox) => {
          // Fecha límite: fin del día local (~23:00 local) de un día base.
          const cierreBase = Date.parse('2025-09-30T12:00:00.000Z');
          const { hour: hCierre } = toLocalParts(cierreBase, tz);
          const fechaLimite = cierreBase + ((23 - hCierre + 24) % 24) * 3_600_000;

          // "Ahora" a la hora de envío local, `diasAprox` días antes.
          const ahoraBase = fechaLimite - diasAprox * 86_400_000;
          const { hour: hAhora } = toLocalParts(ahoraBase, tz);
          const ahora = ahoraBase + ((HORA_ENVIO - hAhora + 24) % 24) * 3_600_000;

          const d = decidirRecordatorioCierre(fechaLimite, true, ahora, tz, HORA_ENVIO);

          // El invariante honesto: la decisión emite SÍ Y SÓLO SI el número real
          // de días locales que faltan (calculado por la misma regla de hora
          // local) es un offset escalonado exacto. Snapping a la hora de envío
          // puede desplazar el día civil respecto a `diasAprox`, así que se mide
          // el gap real en lugar de asumir que es `diasAprox`.
          const gapReal = localDaysUntil(ahora, fechaLimite, tz);
          if (OFFSETS_CIERRE_DIAS.includes(gapReal)) {
            expect(d.offsetCierre).toBe(gapReal);
          } else {
            expect(d.offsetCierre).toBeNull();
          }
        },
      ),
    );
  });
});

/**
 * Resta `dias` a un día local en formato `YYYY-MM-DD` y devuelve el día local
 * resultante. Cálculo por UTC de mediodía para evitar cruces de día por husos.
 */
function restarDiasLocal(fechaLocal: string, dias: number): string {
  const base = Date.parse(`${fechaLocal}T12:00:00.000Z`);
  const resultado = new Date(base - dias * 86_400_000);
  return resultado.toISOString().slice(0, 10);
}
