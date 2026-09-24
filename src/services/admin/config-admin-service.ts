// Servicio de configuración administrativa (Config_Admin) (Req 14.5, 16).
//
// Implementa el flujo back-office por el que un operador/administrador fija la
// `fechaLimiteCierre` por Temporada/liga. La Fecha_Límite_Cierre NO la calcula
// el sistema ni la fija el usuario final: es un parámetro administrativo (ver
// design.md · "Roles del sistema" y "Config_Admin").
//
// Diseño (design.md · Data Models · Config_Admin):
//   - Existe a lo sumo una `Config_Admin` por Temporada (relación 1:1
//     TEMPORADA ||--|| CONFIG_ADMIN). El servicio crea la configuración la
//     primera vez y la actualiza en llamadas posteriores (upsert por
//     `temporadaId`).
//   - Tras fijar/actualizar la `fechaLimiteCierre`, la
//     `Temporada.fechaLimiteCierre` se SINCRONIZA para reflejar el valor
//     administrativo. El sistema consume ese valor para el cierre automático y
//     los recordatorios escalonados; nunca lo deriva por su cuenta.
//
// El servicio es puro respecto a la infraestructura: recibe los repositorios y
// el generador de ids por inyección, de modo que puede ejercitarse con los
// dobles en memoria sin PostgreSQL vivo.
//
// Task 16.1 — Requirements: 14.5, 16 (config admin)

import type { ConfigAdmin, ISODateTime, Temporada, UUID } from '../../domain/types.js';
import type { ConfigAdminRepository, TemporadaRepository } from '../../persistence/repositories.js';

/** Generador de UUID inyectable para las entidades nuevas (paridad con el resto de servicios). */
export type IdGenerator = () => UUID;

/**
 * Resultado de fijar la Fecha_Límite_Cierre: la `Config_Admin` persistida y la
 * `Temporada` con su `fechaLimiteCierre` ya sincronizada. `creada` indica si se
 * creó una nueva `Config_Admin` (primera configuración de la Temporada) o si se
 * actualizó la existente.
 */
export interface SetFechaLimiteCierreResultado {
  readonly configAdmin: ConfigAdmin;
  readonly temporada: Temporada;
  readonly creada: boolean;
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
 * Se lanza cuando la `fechaLimiteCierre` provista no es una marca de tiempo ISO
 * 8601 válida y futura. La capa API la mapea a `400 Bad Request`.
 *
 * Decisión de validación (documentada aquí):
 *   - La fecha debe ser un ISO 8601 parseable (`Date.parse` finito). Se rechaza
 *     cualquier cadena que no represente un instante válido.
 *   - La fecha debe ser estrictamente futura respecto al instante de referencia
 *     (`ahora`, inyectable para pruebas deterministas). Una Fecha_Límite_Cierre
 *     en el pasado dispararía el cierre inmediatamente y carece de sentido
 *     operativo, por lo que se rechaza.
 */
export class FechaLimiteInvalidaError extends Error {
  constructor(
    public readonly fechaLimiteCierre: string,
    public readonly motivo: 'NO_ES_ISO' | 'NO_ES_FUTURA',
  ) {
    super(
      motivo === 'NO_ES_ISO'
        ? `La Fecha_Límite_Cierre "${fechaLimiteCierre}" no es una marca de tiempo ISO 8601 válida`
        : `La Fecha_Límite_Cierre "${fechaLimiteCierre}" debe ser una fecha futura`,
    );
    this.name = 'FechaLimiteInvalidaError';
  }
}

/** Dependencias inyectadas del servicio de configuración administrativa. */
export interface ConfigAdminServiceDeps {
  /** Configuración administrativa por Temporada (Req 16). */
  readonly configAdmins: ConfigAdminRepository;
  /** Temporadas: su `fechaLimiteCierre` refleja el valor administrativo (Req 16). */
  readonly temporadas: TemporadaRepository;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  readonly newId?: IdGenerator;
  /** Reloj inyectable para validar "fecha futura" de forma determinista; por defecto `Date.now`. */
  readonly now?: () => number;
}

/**
 * Servicio de configuración administrativa de la Fecha_Límite_Cierre.
 *
 * Depende únicamente de las interfaces de repositorio, no de implementaciones
 * concretas, para ser testeable con los dobles en memoria.
 */
export class ConfigAdminService {
  private readonly configAdmins: ConfigAdminRepository;
  private readonly temporadas: TemporadaRepository;
  private readonly newId: IdGenerator;
  private readonly now: () => number;

  constructor(deps: ConfigAdminServiceDeps) {
    this.configAdmins = deps.configAdmins;
    this.temporadas = deps.temporadas;
    this.newId = deps.newId ?? ((): UUID => crypto.randomUUID());
    this.now = deps.now ?? ((): number => Date.now());
  }

  /**
   * Fija (crea o actualiza) la `fechaLimiteCierre` administrativa de una
   * Temporada/liga y sincroniza `Temporada.fechaLimiteCierre` con ese valor.
   *
   * Reglas (Req 14.5, 16):
   *  - La Temporada debe existir; si no, se lanza `TemporadaNoEncontradaError`.
   *  - La `fechaLimiteCierre` debe ser un ISO 8601 válido y futuro; si no, se
   *    lanza `FechaLimiteInvalidaError` sin escribir nada.
   *  - Si la Temporada aún no tiene `Config_Admin`, se crea una nueva (1:1). Si
   *    ya existe, se actualiza con el nuevo `operadorId`, `liga` y
   *    `fechaLimiteCierre`.
   *  - En ambos casos, `Temporada.fechaLimiteCierre` se actualiza para reflejar
   *    el valor administrativo (el sistema/usuario final nunca lo calcula).
   *
   * @throws {TemporadaNoEncontradaError} si la Temporada no existe.
   * @throws {FechaLimiteInvalidaError} si la fecha no es ISO válida o no es futura.
   */
  async setFechaLimiteCierre(
    operadorId: UUID,
    temporadaId: UUID,
    liga: string,
    fechaLimiteCierre: ISODateTime,
  ): Promise<SetFechaLimiteCierreResultado> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada === null) {
      throw new TemporadaNoEncontradaError(temporadaId);
    }

    const fechaValidada = this.validarFecha(fechaLimiteCierre);

    // Upsert de la Config_Admin por Temporada (relación 1:1).
    const existente = await this.configAdmins.findByTemporadaId(temporadaId);
    let configAdmin: ConfigAdmin;
    let creada: boolean;

    if (existente === null) {
      configAdmin = await this.configAdmins.create({
        id: this.newId(),
        temporadaId,
        liga,
        fechaLimiteCierre: fechaValidada,
        operadorId,
      });
      creada = true;
    } else {
      configAdmin = await this.configAdmins.update(existente.id, {
        liga,
        fechaLimiteCierre: fechaValidada,
        operadorId,
      });
      creada = false;
    }

    // Sincroniza la Temporada para que refleje el valor administrativo (Req 16).
    const temporadaSincronizada = await this.temporadas.update(temporadaId, {
      fechaLimiteCierre: fechaValidada,
    });

    return { configAdmin, temporada: temporadaSincronizada, creada };
  }

  /**
   * Valida que `fechaLimiteCierre` sea un ISO 8601 parseable y estrictamente
   * futuro respecto al reloj inyectado. Devuelve la fecha original si es válida.
   */
  private validarFecha(fechaLimiteCierre: ISODateTime): ISODateTime {
    const epoch = Date.parse(fechaLimiteCierre);
    if (Number.isNaN(epoch)) {
      throw new FechaLimiteInvalidaError(fechaLimiteCierre, 'NO_ES_ISO');
    }
    if (epoch <= this.now()) {
      throw new FechaLimiteInvalidaError(fechaLimiteCierre, 'NO_ES_FUTURA');
    }
    return fechaLimiteCierre;
  }
}
