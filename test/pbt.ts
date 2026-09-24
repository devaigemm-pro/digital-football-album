/**
 * Helper compartido de Property-Based Testing (PBT) para el Álbum de Fútbol Digital.
 *
 * - Fija `numRuns: 100` por defecto (mínimo requerido por el diseño para cada Correctness Property).
 * - Expone `pbtAssert`, un envoltorio delgado sobre `fc.assert` que aplica los parámetros por defecto.
 * - Expone generadores base reutilizables (`gen`) que cubren edge cases del espacio de entrada
 *   descritos en el plan: fixtures con amistosos y campos inválidos, dimensiones extremas de fotos
 *   contra dimensiones físicas de Recuadro, planes, estados de Temporada/Partido, zonas horarias, etc.
 *
 * Requirements: 21.1, 21.2 (cimientos de pruebas del backend).
 */
import fc from 'fast-check';

/** Número mínimo de iteraciones por propiedad, según el diseño. */
export const DEFAULT_NUM_RUNS = 100;

/** Parámetros por defecto aplicados a todas las propiedades del proyecto. */
export const DEFAULT_PBT_PARAMS: fc.Parameters<unknown> = {
  numRuns: DEFAULT_NUM_RUNS,
};

/**
 * Envoltorio sobre `fc.assert` para propiedades **síncronas** que fija
 * `numRuns: 100` por defecto. Permite sobreescribir parámetros puntuales
 * (p. ej. `seed`, `numRuns`) por propiedad.
 */
export function pbtAssert(
  property: fc.IProperty<unknown>,
  params: fc.Parameters<unknown> = {},
): void {
  fc.assert(property, { ...DEFAULT_PBT_PARAMS, ...params });
}

/**
 * Variante para propiedades **asíncronas**; devuelve la `Promise` de `fc.assert`
 * para poder hacer `await` en la suite. Fija `numRuns: 100` por defecto.
 */
export function pbtAssertAsync(
  property: fc.IAsyncProperty<unknown>,
  params: fc.Parameters<unknown> = {},
): Promise<void> {
  return fc.assert(property, { ...DEFAULT_PBT_PARAMS, ...params });
}

/** Re-export de fast-check para que las suites usen una única fuente. */
export { fc };

// ---------------------------------------------------------------------------
// Generadores base reutilizables
// ---------------------------------------------------------------------------

const IANA_TIMEZONES = [
  'America/Bogota',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/Madrid',
  'Europe/London',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'UTC',
] as const;

const TIPO_COMPETICION = ['LIGA', 'COPA_NACIONAL', 'INTERNACIONAL', 'AMISTOSO'] as const;
const TIPO_COMPETICION_OFICIAL = ['LIGA', 'COPA_NACIONAL', 'INTERNACIONAL'] as const;
const PLAN = ['BASICO', 'PREMIUM'] as const;
const ESTADO_SUSCRIPCION = ['ACTIVA', 'EN_GRACIA', 'VENCIDA'] as const;
const ESTADO_TEMPORADA = [
  'CONFIGURACION',
  'ACTIVA',
  'CERRADA',
  'IMPRESION',
  'LISTA',
  'ENVIADA',
  'FALLIDA',
] as const;
const ESTADO_PARTIDO = ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'] as const;

export const gen = {
  /** UUID v4 sintético. */
  uuid(): fc.Arbitrary<string> {
    return fc.uuid();
  },

  /** Zona horaria IANA de un catálogo representativo (incluye UTC). */
  timezone(): fc.Arbitrary<string> {
    return fc.constantFrom(...IANA_TIMEZONES);
  },

  /** Plan de suscripción. */
  plan(): fc.Arbitrary<(typeof PLAN)[number]> {
    return fc.constantFrom(...PLAN);
  },

  /** Estado de suscripción. */
  estadoSuscripcion(): fc.Arbitrary<(typeof ESTADO_SUSCRIPCION)[number]> {
    return fc.constantFrom(...ESTADO_SUSCRIPCION);
  },

  /** Estado de Temporada (incluye todos los estados del ciclo de vida). */
  estadoTemporada(): fc.Arbitrary<(typeof ESTADO_TEMPORADA)[number]> {
    return fc.constantFrom(...ESTADO_TEMPORADA);
  },

  /** Estado de un Partido_Oficial. */
  estadoPartido(): fc.Arbitrary<(typeof ESTADO_PARTIDO)[number]> {
    return fc.constantFrom(...ESTADO_PARTIDO);
  },

  /** Tipo de competición, incluyendo AMISTOSO (que no debe generar Recuadro). */
  tipoCompeticion(): fc.Arbitrary<(typeof TIPO_COMPETICION)[number]> {
    return fc.constantFrom(...TIPO_COMPETICION);
  },

  /** Tipo de competición oficial (excluye AMISTOSO). */
  tipoCompeticionOficial(): fc.Arbitrary<(typeof TIPO_COMPETICION_OFICIAL)[number]> {
    return fc.constantFrom(...TIPO_COMPETICION_OFICIAL);
  },

  /** Dimensión física en milímetros para Recuadros/Plantillas (rango de imprenta razonable + extremos). */
  dimensionMm(): fc.Arbitrary<number> {
    return fc.integer({ min: 10, max: 400 });
  },

  /** Dimensión en píxeles de una foto, cubriendo desde muy baja resolución hasta muy alta. */
  dimensionPx(): fc.Arbitrary<number> {
    return fc.integer({ min: 1, max: 12_000 });
  },

  /** Texto arbitrario para notas / bitácora (round-trip). Incluye vacío y unicode. */
  texto(): fc.Arbitrary<string> {
    return fc.string();
  },

  /** Instante (timestamp epoch ms) dentro de un rango amplio pero acotado. */
  instante(): fc.Arbitrary<Date> {
    return fc.date({
      min: new Date('2000-01-01T00:00:00.000Z'),
      max: new Date('2100-01-01T00:00:00.000Z'),
    });
  },

  /** Nombre corto (club, rival, jugador). */
  nombre(): fc.Arbitrary<string> {
    return fc.string({ minLength: 1, maxLength: 40 });
  },
};
