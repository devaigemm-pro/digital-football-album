// Servicio_Datos_Deportivos — saneamiento de fixtures (`syncFixture`).
//
// `syncFixture` obtiene los fixtures/fechas/horarios de una temporada desde la
// API deportiva externa (vía `SportsApiClient`, mockeable) y **sanea** los
// registros recibidos: descarta ÚNICAMENTE los registros inválidos —aquellos
// con `partidoExternoId` o `fechaHora` ausente o inválido— y conserva los
// válidos, registrando el motivo de cada descarte (Req 9.1, 9.2).
//
// Este módulo NO deriva el álbum (Task 8.3) ni clasifica los partidos (Task 9.1):
// se limita a producir formas listas para `PartidoOficial` a partir de los
// registros válidos. La clasificación (`tipoCompeticion`, `esClasico`,
// `esInternacional`), la asignación de `id`/`temporadaId` y la ficha del partido
// finalizado (resultado/alineación/eventos) son responsabilidad de otras tareas.
//
// Task 8.2 — Requirements: 9.1, 9.2

import type { EstadoPartido, ISODateTime } from '../../domain/types.js';
import type { RawFixture, SportsApiClient } from './types.js';

/**
 * Forma "lista para `PartidoOficial`" derivada de un `RawFixture` válido.
 *
 * Contiene únicamente los campos que provienen del fixture y que este servicio
 * puede sanear con seguridad. Se omiten deliberadamente:
 *   - `id` / `temporadaId`: los asigna la derivación del álbum (Task 8.3);
 *   - `tipoCompeticion`, `esClasico`, `esInternacional`: los fija el
 *     Clasificador (Task 9.1);
 *   - `resultado` / `alineacion` / `eventos`: los obtiene `syncPartidoFinalizado`
 *     (Task 8.4).
 */
export interface FixtureSaneado {
  /** Identificador externo del partido (obligatorio, ya validado). */
  readonly partidoExternoId: string;
  /** Competición reportada por la API (cadena vacía si la API no la reporta). */
  readonly competicion: string;
  /** Rival reportado por la API (cadena vacía si la API no lo reporta). */
  readonly rival: string;
  /** Fecha/hora ISO 8601 normalizada del partido (obligatoria, ya validada). */
  readonly fechaHora: ISODateTime;
  /** Estado del partido; por defecto `PROGRAMADO` si la API no lo reporta o es desconocido. */
  readonly estado: EstadoPartido;
}

/** Motivo por el que se descartó un registro de fixture inválido (Req 9.2). */
export type MotivoDescarte =
  'ID_AUSENTE' | 'ID_INVALIDO' | 'FECHA_HORA_AUSENTE' | 'FECHA_HORA_INVALIDA';

/** Registro descartado junto con el motivo del descarte (Req 9.2). */
export interface FixtureDescartado {
  /** El registro crudo tal como llegó de la API, para diagnóstico/auditoría. */
  readonly rawRecord: RawFixture;
  /** Motivo estructurado del descarte. */
  readonly motivo: MotivoDescarte;
}

/**
 * Resultado del saneamiento: los fixtures válidos listos para derivar el álbum
 * y la lista de registros descartados con su motivo (Req 9.2).
 */
export interface SyncFixtureResult {
  /** Fixtures válidos, mapeados a formas listas para `PartidoOficial`. */
  readonly validos: readonly FixtureSaneado[];
  /** Registros descartados con el motivo de cada descarte. */
  readonly descartados: readonly FixtureDescartado[];
}

/** Registrador opcional del motivo de cada descarte (Req 9.2, "registrar el error"). */
export type DiscardLogger = (descartado: FixtureDescartado) => void;

/** Opciones de `syncFixture`. */
export interface SyncFixtureOptions {
  /** Cliente de la API deportiva (mockeable). Requerido. */
  readonly client: SportsApiClient;
  /**
   * Registrador invocado por cada registro descartado. Por defecto no hace
   * nada; en producción se cablea a la telemetría/registro de errores (Req 9.2).
   */
  readonly logger?: DiscardLogger;
  /** Señal de cancelación propagada al cliente (timeout/abort — Req 9.1). */
  readonly signal?: AbortSignal;
}

/** Estados de partido reconocidos que la API puede reportar. */
const ESTADOS_VALIDOS: readonly EstadoPartido[] = ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'];

/**
 * Normaliza el estado crudo reportado por la API a un `EstadoPartido`. Un
 * estado ausente o no reconocido se degrada a `PROGRAMADO` (no es un campo
 * obligatorio para el saneamiento — Req 9.2 solo exige fecha/horario/id).
 */
function normalizarEstado(estado: string | undefined): EstadoPartido {
  if (estado === undefined) {
    return 'PROGRAMADO';
  }
  const normalizado = estado.trim().toUpperCase();
  const coincidencia = ESTADOS_VALIDOS.find((valido) => valido === normalizado);
  return coincidencia ?? 'PROGRAMADO';
}

/**
 * Determina el motivo de descarte de un `RawFixture`, o `null` si es válido.
 *
 * Reglas de validez (Req 9.2, campos obligatorios): un fixture es válido cuando
 * tiene un `partidoExternoId` no vacío y una `fechaHora` que representa un
 * instante ISO 8601 parseable. El orden de comprobación prioriza el id y luego
 * la fecha/hora para reportar el primer motivo encontrado.
 */
function motivoDeDescarte(raw: RawFixture): MotivoDescarte | null {
  const { partidoExternoId, fechaHora } = raw;

  if (partidoExternoId === undefined || partidoExternoId === null) {
    return 'ID_AUSENTE';
  }
  if (typeof partidoExternoId !== 'string' || partidoExternoId.trim() === '') {
    return 'ID_INVALIDO';
  }

  if (fechaHora === undefined || fechaHora === null) {
    return 'FECHA_HORA_AUSENTE';
  }
  if (typeof fechaHora !== 'string' || fechaHora.trim() === '') {
    return 'FECHA_HORA_INVALIDA';
  }
  const instante = Date.parse(fechaHora);
  if (Number.isNaN(instante)) {
    return 'FECHA_HORA_INVALIDA';
  }

  return null;
}

/**
 * Mapea un `RawFixture` ya validado a su forma lista para `PartidoOficial`.
 * Normaliza la fecha/hora a ISO 8601 canónico (UTC) y recorta las cadenas de
 * texto; `competicion`/`rival` ausentes se representan como cadena vacía.
 */
function mapearFixtureValido(raw: RawFixture): FixtureSaneado {
  // `motivoDeDescarte` garantiza que ambos están presentes y son válidos.
  const partidoExternoId = (raw.partidoExternoId as string).trim();
  const fechaHora = new Date(Date.parse(raw.fechaHora as string)).toISOString();

  return {
    partidoExternoId,
    competicion: raw.competicion?.trim() ?? '',
    rival: raw.rival?.trim() ?? '',
    fechaHora,
    estado: normalizarEstado(raw.estado),
  };
}

/**
 * Obtiene los fixtures de una temporada externa y los sanea.
 *
 * Descarta únicamente los registros inválidos (id o fecha/horario ausente o
 * inválido), conserva los válidos mapeados a formas listas para `PartidoOficial`
 * y registra el motivo de cada descarte mediante `logger` (Req 9.1, 9.2).
 *
 * No deriva el álbum ni clasifica los partidos: esas responsabilidades
 * corresponden a las Tasks 8.3 y 9.1 respectivamente.
 *
 * @param temporadaExterna Identificador de la temporada en la API deportiva.
 * @param options Cliente (mockeable), registrador opcional y señal de cancelación.
 */
export async function syncFixture(
  temporadaExterna: string,
  options: SyncFixtureOptions,
): Promise<SyncFixtureResult> {
  const { client, logger, signal } = options;

  const crudos = await client.fetchFixtures(temporadaExterna, signal);

  const validos: FixtureSaneado[] = [];
  const descartados: FixtureDescartado[] = [];

  for (const raw of crudos) {
    const motivo = motivoDeDescarte(raw);
    if (motivo === null) {
      validos.push(mapearFixtureValido(raw));
      continue;
    }
    const descartado: FixtureDescartado = { rawRecord: raw, motivo };
    descartados.push(descartado);
    logger?.(descartado);
  }

  return { validos, descartados };
}
