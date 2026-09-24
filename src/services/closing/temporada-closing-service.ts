// Servicio de cierre de Temporada y disparo del Print_Engine (Req 16.1–16.5).
//
// Implementa las dos vías de cierre del ciclo de vida de la Temporada
// (design.md · "Flujo del ciclo de vida de la Temporada"):
//
//   Activa → Cerrada por Fecha_Límite_Cierre admin (Req 16.3)   [automático, sin confirmación]
//   Activa → Cerrada por cierre anticipado confirmado (Req 16.4) [confirmado por el usuario]
//
// En ambos casos, tras dejar la Temporada en estado `CERRADA`, se dispara la
// generación de los archivos de impresión mediante el `Print_Engine`
// (transición `Cerrada → Impresion`). Este servicio NO implementa el
// Print_Engine (esa es la Task 15): sólo lo dispara a través de la interfaz
// inyectable `PrintEngineTrigger`, de modo que el motor real y su avance de
// estado (`CERRADA → IMPRESION → …`) queden desacoplados y mockeables.
//
// Reglas de negocio (Req 16):
//   - 16.1/16.2: antes de una confirmación de cierre anticipado, el sistema
//     informa qué Recuadros están sin Foto_Principal (helper
//     `listRecuadrosSinFotoPrincipal`).
//   - 16.3: al alcanzarse la Fecha_Límite_Cierre, la Temporada se cierra
//     automáticamente SIN requerir confirmación del usuario y se dispara el
//     Print_Engine.
//   - 16.4: cuando el usuario confirma el cierre anticipado (antes de la fecha
//     límite), la Temporada se cierra y se dispara el Print_Engine.
//   - 16.5: si al momento del cierre existen Recuadros sin Foto_Principal, el
//     cierre y la impresión proceden de todas formas y esos Recuadros se
//     mantienen vacíos (nunca se rellenan ni se eliminan).
//
// El servicio es puro respecto a la infraestructura: recibe los repositorios,
// el reloj y el disparador del Print_Engine por inyección, de modo que puede
// ejercitarse con los dobles en memoria sin PostgreSQL ni motor de PDF vivos.
//
// Task 16.2 — Requirements: 16.1, 16.2, 16.3, 16.4, 16.5

import type { Recuadro, Temporada, UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  RecuadroRepository,
  TemporadaRepository,
} from '../../persistence/repositories.js';

/**
 * Vía por la que se cerró la Temporada. Se propaga al `Print_Engine` como
 * contexto de auditoría del disparo.
 *
 *  - `AUTOMATICO`: alcanzada la Fecha_Límite_Cierre, sin confirmación (Req 16.3).
 *  - `ANTICIPADO_CONFIRMADO`: cierre anticipado confirmado por el usuario (Req 16.4).
 */
export type MotivoCierre = 'AUTOMATICO' | 'ANTICIPADO_CONFIRMADO';

/**
 * Disparador del `Print_Engine` (inyectable). Este servicio sólo señala que la
 * generación de los archivos de impresión debe comenzar para una Temporada ya
 * cerrada; el motor real (Task 15) implementa la generación transaccional del
 * PDF_Libro/PDF_Stickers y el avance de estado `CERRADA → IMPRESION → …`.
 *
 * Se modela como interfaz para poder mockearlo en pruebas (no se instancia el
 * Print_Engine real desde este módulo).
 */
export interface PrintEngineTrigger {
  /**
   * Dispara la generación de los archivos de impresión de la Temporada dada.
   * Se invoca DESPUÉS de dejar la Temporada en estado `CERRADA` (Req 16.3, 16.4).
   */
  triggerGeneracion(entrada: PrintEngineTriggerInput): Promise<void>;
}

/** Contexto que recibe el `Print_Engine` al ser disparado. */
export interface PrintEngineTriggerInput {
  /** Temporada cerrada cuyos archivos de impresión deben generarse. */
  readonly temporadaId: UUID;
  /** Vía de cierre que originó el disparo (auditoría). */
  readonly motivo: MotivoCierre;
}

/**
 * Resultado de un cierre de Temporada. Incluye la Temporada ya en estado
 * `CERRADA` y los Recuadros que quedaron sin Foto_Principal al cierre (se
 * mantienen vacíos — Req 16.5), como registro de lo que se imprimirá vacío.
 */
export interface CierreResultado {
  /** Temporada tras la transición `ACTIVA → CERRADA`. */
  readonly temporada: Temporada;
  /** Vía por la que se cerró. */
  readonly motivo: MotivoCierre;
  /** Recuadros sin Foto_Principal conservados vacíos al cierre (Req 16.5). */
  readonly recuadrosSinFotoPrincipal: readonly Recuadro[];
  /** `true` si se disparó el Print_Engine (siempre en un cierre efectivo). */
  readonly printEngineDisparado: boolean;
}

/**
 * Se lanza cuando la Temporada referenciada no existe. La capa API la mapea a
 * `404 Not Found`.
 */
export class TemporadaNoEncontradaError extends Error {
  constructor(public readonly temporadaId: UUID) {
    super(`No se encontró Temporada con id "${temporadaId}"`);
    this.name = 'TemporadaNoEncontradaError';
  }
}

/**
 * Se lanza cuando la Temporada no puede cerrarse porque no está en estado
 * `ACTIVA` (el cierre sólo procede desde `ACTIVA` — ver diagrama de estados del
 * design.md). Evita re-cerrar o disparar dos veces el Print_Engine sobre una
 * Temporada ya cerrada/en impresión. La capa API la mapea a `409 Conflict`.
 */
export class TemporadaNoActivaError extends Error {
  constructor(
    public readonly temporadaId: UUID,
    public readonly estadoActual: Temporada['estado'],
  ) {
    super(
      `La Temporada "${temporadaId}" no está ACTIVA (estado actual: ${estadoActual}); no puede cerrarse`,
    );
    this.name = 'TemporadaNoActivaError';
  }
}

/**
 * Se lanza en el cierre automático cuando aún no se ha alcanzado la
 * Fecha_Límite_Cierre. El cierre automático (Req 16.3) sólo procede cuando
 * `ahora >= fechaLimiteCierre`; adelantarlo requeriría un cierre anticipado
 * confirmado (Req 16.4). La capa API/el job la mapea a "aún no corresponde".
 */
export class FechaLimiteNoAlcanzadaError extends Error {
  constructor(
    public readonly temporadaId: UUID,
    public readonly fechaLimiteCierre: string,
    public readonly ahora: string,
  ) {
    super(
      `La Fecha_Límite_Cierre de la Temporada "${temporadaId}" (${fechaLimiteCierre}) aún no se ha alcanzado (ahora: ${ahora})`,
    );
    this.name = 'FechaLimiteNoAlcanzadaError';
  }
}

/** Dependencias inyectadas del servicio de cierre de Temporada. */
export interface TemporadaClosingServiceDeps {
  /** Temporadas: su `estado` se transiciona a `CERRADA` (Req 16.3, 16.4). */
  readonly temporadas: TemporadaRepository;
  /** Álbumes: para localizar el Álbum de la Temporada (relación 1:1). */
  readonly albums: AlbumRepository;
  /** Recuadros: para informar/registrar los vacíos al cierre (Req 16.1, 16.2, 16.5). */
  readonly recuadros: RecuadroRepository;
  /** Disparador del Print_Engine (inyectable; el motor real es Task 15). */
  readonly printEngine: PrintEngineTrigger;
}

/**
 * Servicio de cierre de Temporada y disparo del Print_Engine.
 *
 * Depende únicamente de las interfaces de repositorio y del disparador del
 * Print_Engine, no de implementaciones concretas, para ser testeable con los
 * dobles en memoria y un `PrintEngineTrigger` mock.
 */
export class TemporadaClosingService {
  private readonly temporadas: TemporadaRepository;
  private readonly albums: AlbumRepository;
  private readonly recuadros: RecuadroRepository;
  private readonly printEngine: PrintEngineTrigger;

  constructor(deps: TemporadaClosingServiceDeps) {
    this.temporadas = deps.temporadas;
    this.albums = deps.albums;
    this.recuadros = deps.recuadros;
    this.printEngine = deps.printEngine;
  }

  /**
   * Job de cierre automático en la Fecha_Límite_Cierre (Req 16.3).
   *
   * Cuando `ahora >= fechaLimiteCierre`, transiciona la Temporada
   * `ACTIVA → CERRADA` SIN requerir confirmación del usuario y dispara la
   * generación de los archivos de impresión mediante el Print_Engine. Si aún no
   * se ha alcanzado la fecha límite, no cierra nada y lanza
   * `FechaLimiteNoAlcanzadaError` (protege al job de disparos prematuros).
   *
   * Los Recuadros sin Foto_Principal se mantienen vacíos y se reportan en el
   * resultado (Req 16.5).
   *
   * @param temporadaId Temporada a evaluar/cerrar.
   * @param now Instante de evaluación en epoch ms (inyectable para determinismo).
   * @throws {TemporadaNoEncontradaError} si la Temporada no existe.
   * @throws {TemporadaNoActivaError} si la Temporada no está `ACTIVA`.
   * @throws {FechaLimiteNoAlcanzadaError} si `now < fechaLimiteCierre`.
   */
  async automaticClose(temporadaId: UUID, now: number): Promise<CierreResultado> {
    const temporada = await this.cargarTemporadaActiva(temporadaId);

    const limite = Date.parse(temporada.fechaLimiteCierre);
    // `now < limite` ⇒ aún no corresponde el cierre automático (Req 16.3).
    // Se cierra al alcanzarse la fecha (`now >= limite`).
    if (!Number.isNaN(limite) && now < limite) {
      throw new FechaLimiteNoAlcanzadaError(
        temporadaId,
        temporada.fechaLimiteCierre,
        new Date(now).toISOString(),
      );
    }

    return this.cerrarYDispararPrintEngine(temporada, 'AUTOMATICO');
  }

  /**
   * Flujo de cierre anticipado confirmado por el usuario (Req 16.4).
   *
   * Cierra la Temporada `ACTIVA → CERRADA` y dispara el Print_Engine ANTES de la
   * Fecha_Límite_Cierre. Este método asume que el usuario ya confirmó (Req 16.1);
   * la lista de Recuadros vacíos para informar antes de confirmar se obtiene con
   * `listRecuadrosSinFotoPrincipal` (Req 16.2). Los vacíos se mantienen (Req 16.5).
   *
   * @param temporadaId Temporada a cerrar anticipadamente.
   * @throws {TemporadaNoEncontradaError} si la Temporada no existe.
   * @throws {TemporadaNoActivaError} si la Temporada no está `ACTIVA`.
   */
  async confirmedEarlyClose(temporadaId: UUID): Promise<CierreResultado> {
    const temporada = await this.cargarTemporadaActiva(temporadaId);
    return this.cerrarYDispararPrintEngine(temporada, 'ANTICIPADO_CONFIRMADO');
  }

  /**
   * Informa qué Recuadros del Álbum de la Temporada están sin Foto_Principal
   * (Req 16.1, 16.2). Pensado para presentárselo al usuario ANTES de confirmar
   * un cierre anticipado. Es una consulta de sólo lectura: no cambia el estado
   * de la Temporada ni de los Recuadros.
   *
   * Si la Temporada no tiene Álbum todavía, devuelve una lista vacía (no hay
   * Recuadros que reportar).
   *
   * @throws {TemporadaNoEncontradaError} si la Temporada no existe.
   */
  async listRecuadrosSinFotoPrincipal(temporadaId: UUID): Promise<Recuadro[]> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada === null) {
      throw new TemporadaNoEncontradaError(temporadaId);
    }
    return this.obtenerRecuadrosVacios(temporadaId);
  }

  /**
   * Carga la Temporada y valida que exista y esté `ACTIVA`. Punto único de
   * validación compartido por ambas vías de cierre.
   */
  private async cargarTemporadaActiva(temporadaId: UUID): Promise<Temporada> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada === null) {
      throw new TemporadaNoEncontradaError(temporadaId);
    }
    if (temporada.estado !== 'ACTIVA') {
      throw new TemporadaNoActivaError(temporadaId, temporada.estado);
    }
    return temporada;
  }

  /**
   * Transición `ACTIVA → CERRADA` seguida del disparo del Print_Engine, común a
   * ambas vías de cierre. Los Recuadros sin Foto_Principal se consultan y
   * reportan sin modificarse (se mantienen vacíos — Req 16.5).
   */
  private async cerrarYDispararPrintEngine(
    temporada: Temporada,
    motivo: MotivoCierre,
  ): Promise<CierreResultado> {
    // Registrar los vacíos ANTES de disparar la impresión: se mantienen tal cual
    // (no se rellenan ni se eliminan) y proceden a imprimirse vacíos (Req 16.5).
    const recuadrosSinFotoPrincipal = await this.obtenerRecuadrosVacios(temporada.id);

    // Transición de estado: cierre sin confirmación (16.3) o confirmado (16.4).
    const temporadaCerrada = await this.temporadas.update(temporada.id, {
      estado: 'CERRADA',
    });

    // Disparar el Print_Engine (Task 15 avanza CERRADA → IMPRESION → …).
    await this.printEngine.triggerGeneracion({
      temporadaId: temporada.id,
      motivo,
    });

    return {
      temporada: temporadaCerrada,
      motivo,
      recuadrosSinFotoPrincipal,
      printEngineDisparado: true,
    };
  }

  /**
   * Localiza el Álbum de la Temporada y devuelve sus Recuadros sin
   * Foto_Principal. Si no hay Álbum, devuelve lista vacía.
   */
  private async obtenerRecuadrosVacios(temporadaId: UUID): Promise<Recuadro[]> {
    const album = await this.albums.findByTemporadaId(temporadaId);
    if (album === null) {
      return [];
    }
    return this.recuadros.findSinFotoPrincipalByAlbumId(album.id);
  }
}
