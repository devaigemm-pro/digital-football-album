// Programador de Jobs — cableado de los jobs de fondo con los servicios (Task 22.1).
//
// design.md · "Programador de Jobs": dispara la sincronización periódica
// (Req 9.1), los recordatorios recurrentes y de cierre (Req 14.2, 14.6) y el
// cierre automático en la Fecha_Límite_Cierre (Req 16.3), evaluando los offsets
// respecto a la zona horaria persistida del usuario a una hora de envío definida.
//
// Este módulo NO reimplementa la lógica de negocio: la delega en
// `Servicio_Datos_Deportivos` (sync), `Servicio_Notificaciones` (recordatorios)
// y `TemporadaClosingService`/`Print_Engine` (cierre + impresión), que se
// inyectan. El `JobScheduler`:
//   1. mantiene referencias a los servicios inyectados;
//   2. expone funciones de job ejecutables (`runSportsSync`, `runReminders…`,
//      `runAutomaticClose…`) que invocan al servicio correcto;
//   3. registra esos jobs en un `Scheduler` inyectable a partir de una
//      configuración de cadencias/vencimientos declarada como DATOS
//      (`JobSchedule`), de modo que los intervalos (p. ej. 6h) y el disparo por
//      Fecha_Límite_Cierre sean deterministas y verificables sin timers reales.
//
// El temporizador real (`setInterval`/`setTimeout`) queda detrás de la interfaz
// `Scheduler` (ver `scheduler.ts`), y el instante actual detrás de `Clock`, para
// que las pruebas controlen el tiempo con dobles.

import type { UUID } from '../domain/types.js';
import type { NotificacionPush } from '../services/notifications/index.js';
import type { NotificationService } from '../services/notifications/index.js';
import type { CierreResultado } from '../services/closing/index.js';
import type { TemporadaClosingService } from '../services/closing/index.js';
import {
  MS_POR_HORA,
  systemClock,
  type Clock,
  type ScheduledHandle,
  type Scheduler,
} from './scheduler.js';

/** Cadencia por defecto de la sincronización deportiva: cada 6 horas (Req 9.1). */
export const SPORTS_SYNC_INTERVAL_MS = 6 * MS_POR_HORA;

/**
 * Job de sincronización deportiva (Req 9.1). El `JobScheduler` no conoce los
 * detalles de `syncFixture`/`syncPartidoFinalizado` ni sus repositorios/cliente;
 * el cableado concreto los aporta a través de esta interfaz mockeable, que el
 * job simplemente ejecuta en cada tick del intervalo de 6h.
 *
 * Se modela como interfaz (no como referencia directa a las funciones libres del
 * `Servicio_Datos_Deportivos`) para desacoplar la cadencia del transporte y
 * permitir espiarlo en pruebas.
 */
export interface SportsSyncJob {
  /**
   * Ejecuta un ciclo de sincronización deportiva: refresca fixtures y sincroniza
   * los partidos finalizados pendientes (Req 9.1, 9.3). La implementación real
   * envuelve `syncFixture`/`syncPartidoFinalizado` con su cliente y repositorios.
   */
  run(signal?: AbortSignal): Promise<void>;
}

/**
 * Proveedor de las Temporadas activas a evaluar en cada tick de recordatorios y
 * cierre. El programador itera Temporadas/Álbumes activos; obtenerlos es una
 * consulta de infraestructura que se inyecta para no acoplar el scheduler a un
 * repositorio concreto y poder controlarla en pruebas.
 */
export interface ActiveWorkProvider {
  /** Temporadas en estado `ACTIVA` candidatas a recordatorios de cierre y cierre automático. */
  temporadasActivas(): Promise<readonly UUID[]>;
  /** Álbumes de Temporadas activas candidatos a recordatorios de Recuadro vacío. */
  albumesActivos(): Promise<readonly UUID[]>;
}

/**
 * Reportero de errores de job (inyectable). Un fallo en un tick no debe detener
 * al programador; se reporta y se continúa con el resto de los jobs/entidades.
 */
export type JobErrorReporter = (contexto: string, error: unknown) => void;

/** Dependencias inyectadas del `JobScheduler`. */
export interface JobSchedulerDeps {
  /** Job de sincronización deportiva de 6h (Req 9.1). */
  readonly sportsSync: SportsSyncJob;
  /** Servicio_Notificaciones para recordatorios recurrentes y de cierre (Req 14.2, 14.6). */
  readonly notifications: NotificationService;
  /** Servicio de cierre de Temporada que dispara el Print_Engine (Req 16.3). */
  readonly closing: TemporadaClosingService;
  /** Proveedor de Temporadas/Álbumes activos a evaluar en cada tick. */
  readonly activeWork: ActiveWorkProvider;
  /** Reloj inyectable (por defecto `systemClock`). */
  readonly clock?: Clock;
  /** Reportero de errores (por defecto, silencioso). */
  readonly onError?: JobErrorReporter;
}

/**
 * Configuración de cadencias declarada como DATOS. Registrar los jobs a partir
 * de esta estructura (en vez de números incrustados) hace verificable que la
 * sincronización deportiva corre cada 6h y permite ajustar cadencias sin tocar
 * la lógica.
 */
export interface JobSchedule {
  /** Intervalo del job de sincronización deportiva (Req 9.1). */
  readonly sportsSyncIntervalMs: number;
  /** Intervalo de evaluación de recordatorios de Recuadro vacío (Req 14.2). */
  readonly remindersRecuadrosIntervalMs: number;
  /** Intervalo de evaluación de recordatorios de cierre (Req 14.6). */
  readonly remindersCierreIntervalMs: number;
  /** Intervalo de evaluación del cierre automático por fecha (Req 16.3). */
  readonly automaticCloseIntervalMs: number;
}

/**
 * Cadencias por defecto. La sincronización deportiva es cada 6h (Req 9.1). Los
 * recordatorios y el cierre automático se evalúan cada hora: la decisión de
 * enviar/cerrar está anclada a la hora de envío local del usuario y a la
 * Fecha_Límite_Cierre dentro de los propios servicios, por lo que un tick
 * horario basta para acertar el instante correcto sin depender del intervalo.
 */
export const DEFAULT_JOB_SCHEDULE: JobSchedule = {
  sportsSyncIntervalMs: SPORTS_SYNC_INTERVAL_MS,
  remindersRecuadrosIntervalMs: MS_POR_HORA,
  remindersCierreIntervalMs: MS_POR_HORA,
  automaticCloseIntervalMs: MS_POR_HORA,
};

/**
 * Programador de Jobs. Cablea la sincronización deportiva (6h), los
 * recordatorios (recurrentes y de cierre) y el cierre automático con sus
 * servicios, y los registra en un `Scheduler` inyectable.
 */
export class JobScheduler {
  private readonly sportsSync: SportsSyncJob;
  private readonly notifications: NotificationService;
  private readonly closing: TemporadaClosingService;
  private readonly activeWork: ActiveWorkProvider;
  private readonly clock: Clock;
  private readonly onError: JobErrorReporter;
  private readonly handles: ScheduledHandle[] = [];

  constructor(deps: JobSchedulerDeps) {
    this.sportsSync = deps.sportsSync;
    this.notifications = deps.notifications;
    this.closing = deps.closing;
    this.activeWork = deps.activeWork;
    this.clock = deps.clock ?? systemClock;
    this.onError = deps.onError ?? (() => undefined);
  }

  // -------------------------------------------------------------------------
  // Funciones de job ejecutables (invocables por el scheduler o a demanda)
  // -------------------------------------------------------------------------

  /**
   * Job de sincronización deportiva (Req 9.1). Delega en el `SportsSyncJob`
   * inyectado, que envuelve `syncFixture`/`syncPartidoFinalizado`.
   */
  async runSportsSync(signal?: AbortSignal): Promise<void> {
    await this.sportsSync.run(signal);
  }

  /**
   * Tick de recordatorios de Recuadro vacío (Req 14.2). Evalúa cada Álbum activo
   * mediante `NotificationService.evaluarRecordatoriosRecuadros`; un fallo en un
   * Álbum se reporta y no interrumpe la evaluación del resto.
   *
   * @returns Todas las notificaciones efectivamente enviadas en este tick.
   */
  async runRemindersRecuadros(): Promise<NotificacionPush[]> {
    const albumes = await this.activeWork.albumesActivos();
    const enviadas: NotificacionPush[] = [];
    for (const albumId of albumes) {
      try {
        const notificaciones = await this.notifications.evaluarRecordatoriosRecuadros(albumId);
        enviadas.push(...notificaciones);
      } catch (error) {
        this.onError(`recordatorios-recuadros:${albumId}`, error);
      }
    }
    return enviadas;
  }

  /**
   * Tick de recordatorios de cierre escalonados y aviso de dirección (Req 14.6,
   * 15.3). Evalúa cada Temporada activa mediante
   * `NotificationService.evaluarRecordatoriosCierre`.
   *
   * @returns Todas las notificaciones efectivamente enviadas en este tick.
   */
  async runRemindersCierre(): Promise<NotificacionPush[]> {
    const temporadas = await this.activeWork.temporadasActivas();
    const enviadas: NotificacionPush[] = [];
    for (const temporadaId of temporadas) {
      try {
        const notificaciones = await this.notifications.evaluarRecordatoriosCierre(temporadaId);
        enviadas.push(...notificaciones);
      } catch (error) {
        this.onError(`recordatorios-cierre:${temporadaId}`, error);
      }
    }
    return enviadas;
  }

  /**
   * Tick del cierre automático (Req 16.3). Para cada Temporada activa intenta
   * `TemporadaClosingService.automaticClose` con el instante del reloj; el
   * servicio cierra y dispara el Print_Engine sólo si se alcanzó la
   * Fecha_Límite_Cierre y, de lo contrario, lanza `FechaLimiteNoAlcanzadaError`,
   * que aquí es un no-op esperado (aún no corresponde cerrar).
   *
   * @returns Los resultados de los cierres efectivamente realizados en este tick.
   */
  async runAutomaticClose(): Promise<CierreResultado[]> {
    const temporadas = await this.activeWork.temporadasActivas();
    const cerradas: CierreResultado[] = [];
    const ahora = this.clock.now();
    for (const temporadaId of temporadas) {
      try {
        const resultado = await this.closing.automaticClose(temporadaId, ahora);
        cerradas.push(resultado);
      } catch (error) {
        if (isFechaLimiteNoAlcanzada(error)) {
          // Aún no corresponde cerrar esta Temporada: no es un fallo.
          continue;
        }
        this.onError(`cierre-automatico:${temporadaId}`, error);
      }
    }
    return cerradas;
  }

  // -------------------------------------------------------------------------
  // Registro en el Scheduler (cadencias declaradas como datos)
  // -------------------------------------------------------------------------

  /**
   * Registra los cuatro jobs en el `Scheduler` inyectado según `schedule`
   * (por defecto `DEFAULT_JOB_SCHEDULE`): sincronización deportiva cada 6h,
   * recordatorios de Recuadro y de cierre, y cierre automático por fecha. Cada
   * job se envuelve para aislar sus errores. Devuelve `this` para encadenar.
   *
   * Llamar a `start` no ejecuta los jobs inmediatamente; el `Scheduler` los
   * dispara según su cadencia (o, en pruebas, cuando el `FakeScheduler` los
   * dispara a demanda).
   */
  start(scheduler: Scheduler, schedule: JobSchedule = DEFAULT_JOB_SCHEDULE): this {
    this.handles.push(
      scheduler.every(schedule.sportsSyncIntervalMs, () =>
        this.guard('sports-sync', () => this.runSportsSync()),
      ),
      scheduler.every(schedule.remindersRecuadrosIntervalMs, () =>
        this.guard('recordatorios-recuadros', () => this.runRemindersRecuadros()),
      ),
      scheduler.every(schedule.remindersCierreIntervalMs, () =>
        this.guard('recordatorios-cierre', () => this.runRemindersCierre()),
      ),
      scheduler.every(schedule.automaticCloseIntervalMs, () =>
        this.guard('cierre-automatico', () => this.runAutomaticClose()),
      ),
    );
    return this;
  }

  /** Cancela todos los jobs registrados (apagado ordenado del programador). */
  stop(): void {
    for (const handle of this.handles) {
      handle.cancel();
    }
    this.handles.length = 0;
  }

  /** Ejecuta un job aislando su error (lo reporta y no lo propaga al timer). */
  private async guard(contexto: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.onError(contexto, error);
    }
  }
}

/**
 * Determina si un error es el `FechaLimiteNoAlcanzadaError` del servicio de
 * cierre sin acoplar por identidad de clase (se compara por `name`, robusto a
 * reexportaciones/duplicados de módulo).
 */
function isFechaLimiteNoAlcanzada(error: unknown): boolean {
  return error instanceof Error && error.name === 'FechaLimiteNoAlcanzadaError';
}
