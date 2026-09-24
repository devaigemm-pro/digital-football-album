// Abstracción del temporizador/cron del Programador de Jobs (Task 22.1).
//
// El diseño ("Programador de Jobs") exige disparar la sincronización periódica
// (Req 9.1), los recordatorios (Req 14.2, 14.6) y el cierre automático en la
// Fecha_Límite_Cierre (Req 16.3). Para que ese cableado sea determinista y
// testeable SIN temporizadores reales, el comportamiento de "cuándo corre un
// job" se abstrae detrás de dos interfaces inyectables:
//
//   - `Clock`: fuente del instante actual (epoch ms, UTC). El reloj de
//     producción se respalda en `Date.now()`; en pruebas se usa un reloj falso
//     que avanza de forma controlada.
//   - `Scheduler`: registra callbacks para ejecutarse en intervalos o en un
//     instante concreto y devuelve un handle cancelable. El scheduler de
//     producción se respalda en `setInterval`/`setTimeout`; en pruebas, el
//     `FakeScheduler` guarda los jobs como datos y los dispara a demanda.
//
// De este modo el `JobScheduler` (ver `job-scheduler.ts`) sólo depende de estas
// interfaces y de los servicios inyectados, nunca de temporizadores globales.

/** Milisegundos en una hora (unidad base de las cadencias del programador). */
export const MS_POR_HORA = 60 * 60 * 1000;

/**
 * Reloj inyectable. Se abstrae `Date.now()` para anclar la evaluación de los
 * jobs a un instante determinista en pruebas.
 */
export interface Clock {
  /** Instante actual en epoch ms (UTC). */
  now(): number;
}

/** Reloj de producción respaldado por `Date.now()`. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/**
 * Handle de una tarea registrada en el `Scheduler`. Cancelar detiene los
 * disparos futuros de esa tarea (p. ej. al apagar el programador).
 */
export interface ScheduledHandle {
  /** Cancela la tarea; los disparos posteriores no ocurren. */
  cancel(): void;
}

/**
 * Programador de temporizadores inyectable. Modela sólo lo que el
 * `JobScheduler` necesita: correr una tarea de forma recurrente en un intervalo
 * fijo, o una sola vez tras un retraso. Se abstrae para poder controlar el
 * tiempo en pruebas sin `setInterval`/`setTimeout` reales.
 */
export interface Scheduler {
  /**
   * Ejecuta `task` de forma recurrente cada `intervalMs`. La primera ejecución
   * ocurre tras el primer intervalo (no inmediatamente).
   */
  every(intervalMs: number, task: () => void | Promise<void>): ScheduledHandle;
  /**
   * Ejecuta `task` una sola vez tras `delayMs`. Un `delayMs <= 0` ejecuta en el
   * siguiente turno disponible.
   */
  after(delayMs: number, task: () => void | Promise<void>): ScheduledHandle;
}

/**
 * `Scheduler` de producción respaldado por `setInterval`/`setTimeout`.
 *
 * Los errores de las tareas se aíslan (se capturan) para que un fallo en un
 * job no derribe el temporizador del proceso; el reporte concreto de errores
 * queda a cargo del `JobScheduler`, que envuelve cada job.
 */
export class TimerScheduler implements Scheduler {
  every(intervalMs: number, task: () => void | Promise<void>): ScheduledHandle {
    const id = setInterval(() => {
      void runIsolated(task);
    }, intervalMs);
    // `unref` evita que el timer mantenga vivo el proceso si existe (Node).
    (id as { unref?: () => void }).unref?.();
    return {
      cancel: () => {
        clearInterval(id);
      },
    };
  }

  after(delayMs: number, task: () => void | Promise<void>): ScheduledHandle {
    const id = setTimeout(
      () => {
        void runIsolated(task);
      },
      Math.max(0, delayMs),
    );
    (id as { unref?: () => void }).unref?.();
    return {
      cancel: () => {
        clearTimeout(id);
      },
    };
  }
}

/** Ejecuta una tarea aislando (tragando) su posible rechazo/excepción. */
async function runIsolated(task: () => void | Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // El `JobScheduler` envuelve cada job con su propio manejo/telemetría;
    // aquí sólo evitamos que un rechazo no capturado derribe el timer.
  }
}
