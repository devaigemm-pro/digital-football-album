// Programador de Jobs: sincronización deportiva (6h), recordatorios (recurrentes
// y de cierre) y cierre automático, cableados con el Servicio_Datos_Deportivos,
// el Servicio_Notificaciones y el TemporadaClosingService/Print_Engine.
//
// Task 22.1 — Requirements: 9.1, 14.2, 14.6, 16.3

export { JobScheduler, DEFAULT_JOB_SCHEDULE, SPORTS_SYNC_INTERVAL_MS } from './job-scheduler.js';
export type {
  JobSchedulerDeps,
  JobSchedule,
  SportsSyncJob,
  ActiveWorkProvider,
  JobErrorReporter,
} from './job-scheduler.js';

export { MS_POR_HORA, systemClock, TimerScheduler } from './scheduler.js';
export type { Clock, Scheduler, ScheduledHandle } from './scheduler.js';
