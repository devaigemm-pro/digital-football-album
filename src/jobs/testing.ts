// Dobles deterministas del reloj y el programador para probar el Programador de
// Jobs sin temporizadores reales (Task 22.1).
//
// `FakeClock` y `FakeScheduler` permiten avanzar el tiempo "a mano" y disparar
// las tareas registradas como datos, de modo que los tests verifican la cadencia
// (p. ej. 6h) y los disparos por fecha (cierre en la Fecha_Límite_Cierre) sin
// depender de `setInterval`/`setTimeout` ni de relojes de pared.
//
// Vive en `src/jobs` (no en `src/services`) y no forma parte del cableado de
// producción; sólo lo consumen las pruebas del `JobScheduler`.

import type { Clock, ScheduledHandle, Scheduler } from './scheduler.js';

/** Reloj falso cuyo instante avanza únicamente cuando la prueba lo indica. */
export class FakeClock implements Clock {
  private current: number;

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  /** Fija el instante actual a un valor absoluto (epoch ms). */
  set(ms: number): void {
    this.current = ms;
  }

  /** Avanza el instante actual `deltaMs` milisegundos. */
  advance(deltaMs: number): void {
    this.current += deltaMs;
  }
}

/** Tarea recurrente registrada en el `FakeScheduler`. */
interface RecurringTask {
  readonly kind: 'every';
  readonly intervalMs: number;
  readonly task: () => void | Promise<void>;
  cancelled: boolean;
}

/** Tarea de una sola vez registrada en el `FakeScheduler`. */
interface OneShotTask {
  readonly kind: 'after';
  readonly delayMs: number;
  readonly task: () => void | Promise<void>;
  cancelled: boolean;
  fired: boolean;
}

/**
 * `Scheduler` falso que guarda las tareas como datos en lugar de programar
 * temporizadores reales. Las pruebas las disparan explícitamente:
 *   - `tickEvery(n)` ejecuta `n` veces cada tarea recurrente activa.
 *   - `fireDue()` ejecuta las tareas de una sola vez aún no disparadas.
 *
 * Todas las ejecuciones son `await`-eadas para que las aserciones vean el efecto
 * completo de los jobs asíncronos.
 */
export class FakeScheduler implements Scheduler {
  readonly recurring: RecurringTask[] = [];
  readonly oneShots: OneShotTask[] = [];

  every(intervalMs: number, task: () => void | Promise<void>): ScheduledHandle {
    const entry: RecurringTask = {
      kind: 'every',
      intervalMs,
      task,
      cancelled: false,
    };
    this.recurring.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  }

  after(delayMs: number, task: () => void | Promise<void>): ScheduledHandle {
    const entry: OneShotTask = {
      kind: 'after',
      delayMs,
      task,
      cancelled: false,
      fired: false,
    };
    this.oneShots.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  }

  /** Intervalos configurados de las tareas recurrentes activas (para aserciones). */
  intervalsMs(): number[] {
    return this.recurring.filter((entry) => !entry.cancelled).map((entry) => entry.intervalMs);
  }

  /** Dispara `times` veces cada tarea recurrente activa (por defecto, 1). */
  async tickEvery(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      for (const entry of this.recurring) {
        if (!entry.cancelled) {
          await entry.task();
        }
      }
    }
  }

  /** Dispara las tareas de una sola vez activas y aún no disparadas. */
  async fireDue(): Promise<void> {
    for (const entry of this.oneShots) {
      if (!entry.cancelled && !entry.fired) {
        entry.fired = true;
        await entry.task();
      }
    }
  }
}
