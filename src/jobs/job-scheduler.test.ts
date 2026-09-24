/**
 * Pruebas unitarias del JobScheduler (Task 22.1 — Requirements: 9.1, 14.2, 14.6, 16.3).
 *
 * Verifican el CABLEADO del Programador de Jobs con los servicios, sin
 * temporizadores reales (usan `FakeClock`/`FakeScheduler`):
 *
 *  - Sincronización deportiva: el job invoca al `SportsSyncJob` inyectado y se
 *    registra con una cadencia de 6h (Req 9.1).
 *  - Recordatorios recurrentes: el job invoca
 *    `NotificationService.evaluarRecordatoriosRecuadros` por cada Álbum activo
 *    (Req 14.2).
 *  - Recordatorios de cierre: el job invoca
 *    `NotificationService.evaluarRecordatoriosCierre` por cada Temporada activa
 *    (Req 14.6).
 *  - Cierre automático: el job invoca `TemporadaClosingService.automaticClose`
 *    con el instante del reloj y sólo cierra al alcanzar la Fecha_Límite_Cierre
 *    (Req 16.3); antes de la fecha es un no-op.
 *
 * Los servicios se sustituyen por dobles/espías; sólo se ejercita el cableado.
 */
import { describe, it, expect } from 'vitest';
import type { UUID } from '../domain/types.js';
import type { NotificacionPush, NotificationService } from '../services/notifications/index.js';
import type { CierreResultado, TemporadaClosingService } from '../services/closing/index.js';
import { FakeLimiteNoAlcanzadaError } from './job-scheduler.test.helpers.js';
import {
  JobScheduler,
  SPORTS_SYNC_INTERVAL_MS,
  type ActiveWorkProvider,
  type JobSchedulerDeps,
  type SportsSyncJob,
} from './job-scheduler.js';
import { MS_POR_HORA } from './scheduler.js';
import { FakeClock, FakeScheduler } from './testing.js';

const ALBUM_A = 'a0000001-0000-4000-8000-000000000001' as UUID;
const ALBUM_B = 'a0000002-0000-4000-8000-000000000002' as UUID;
const TEMPORADA_A = 'b0000001-0000-4000-8000-000000000001' as UUID;
const TEMPORADA_B = 'b0000002-0000-4000-8000-000000000002' as UUID;

/** Espía del job de sincronización deportiva. */
class SpySportsSyncJob implements SportsSyncJob {
  calls = 0;
  lastSignal: AbortSignal | undefined;
  run(signal?: AbortSignal): Promise<void> {
    this.calls += 1;
    this.lastSignal = signal;
    return Promise.resolve();
  }
}

/** Proveedor de trabajo activo con listas fijas. */
class FixedActiveWork implements ActiveWorkProvider {
  constructor(
    private readonly temporadas: readonly UUID[],
    private readonly albumes: readonly UUID[],
  ) {}
  temporadasActivas(): Promise<readonly UUID[]> {
    return Promise.resolve(this.temporadas);
  }
  albumesActivos(): Promise<readonly UUID[]> {
    return Promise.resolve(this.albumes);
  }
}

/** Espía del NotificationService: registra las llamadas por entidad. */
class SpyNotificationService {
  readonly recuadrosCalls: UUID[] = [];
  readonly cierreCalls: UUID[] = [];

  evaluarRecordatoriosRecuadros(albumId: UUID): Promise<NotificacionPush[]> {
    this.recuadrosCalls.push(albumId);
    return Promise.resolve([
      {
        usuarioId: `u-${albumId}`,
        tipo: 'RECUADRO_VACIO_RECURRENTE',
        recuadroId: `r-${albumId}`,
        temporadaId: null,
        diasParaCierre: null,
      },
    ]);
  }

  evaluarRecordatoriosCierre(temporadaId: UUID): Promise<NotificacionPush[]> {
    this.cierreCalls.push(temporadaId);
    return Promise.resolve([
      {
        usuarioId: `u-${temporadaId}`,
        tipo: 'CIERRE_ESCALONADO',
        recuadroId: null,
        temporadaId,
        diasParaCierre: 7,
      },
    ]);
  }

  asService(): NotificationService {
    return this as unknown as NotificationService;
  }
}

/**
 * Espía del TemporadaClosingService: cierra sólo las Temporadas cuya fecha
 * límite (`limitesMs`) sea `<= now`; para el resto lanza el error de
 * "fecha no alcanzada", como el servicio real.
 */
class SpyClosingService {
  readonly closeCalls: Array<{ temporadaId: UUID; now: number }> = [];

  constructor(private readonly limitesMs: ReadonlyMap<UUID, number>) {}

  automaticClose(temporadaId: UUID, now: number): Promise<CierreResultado> {
    this.closeCalls.push({ temporadaId, now });
    const limite = this.limitesMs.get(temporadaId) ?? Number.POSITIVE_INFINITY;
    if (now < limite) {
      return Promise.reject(new FakeLimiteNoAlcanzadaError());
    }
    const resultado: CierreResultado = {
      temporada: {
        id: temporadaId,
        usuarioId: `u-${temporadaId}`,
        clubId: `c-${temporadaId}`,
        temporadaExterna: '2024-2025',
        estado: 'CERRADA',
        fechaLimiteCierre: new Date(limite).toISOString(),
      },
      motivo: 'AUTOMATICO',
      recuadrosSinFotoPrincipal: [],
      printEngineDisparado: true,
    };
    return Promise.resolve(resultado);
  }

  asService(): TemporadaClosingService {
    return this as unknown as TemporadaClosingService;
  }
}

function makeScheduler(overrides: Partial<JobSchedulerDeps> = {}): {
  scheduler: JobScheduler;
  sportsSync: SpySportsSyncJob;
  notifications: SpyNotificationService;
  closing: SpyClosingService;
  clock: FakeClock;
  errors: Array<{ contexto: string; error: unknown }>;
} {
  const sportsSync = new SpySportsSyncJob();
  const notifications = new SpyNotificationService();
  const closing = new SpyClosingService(new Map());
  const clock = new FakeClock(0);
  const errors: Array<{ contexto: string; error: unknown }> = [];
  const deps: JobSchedulerDeps = {
    sportsSync,
    notifications: notifications.asService(),
    closing: closing.asService(),
    activeWork: new FixedActiveWork([], []),
    clock,
    onError: (contexto, error) => errors.push({ contexto, error }),
    ...overrides,
  };
  const scheduler = new JobScheduler(deps);
  return { scheduler, sportsSync, notifications, closing, clock, errors };
}

describe('JobScheduler — sincronización deportiva (Req 9.1)', () => {
  it('el job invoca al SportsSyncJob inyectado', async () => {
    const { scheduler, sportsSync } = makeScheduler();
    await scheduler.runSportsSync();
    expect(sportsSync.calls).toBe(1);
  });

  it('se registra con una cadencia de 6h', () => {
    const { scheduler } = makeScheduler();
    const fake = new FakeScheduler();

    scheduler.start(fake);

    expect(SPORTS_SYNC_INTERVAL_MS).toBe(6 * MS_POR_HORA);
    // El intervalo de 6h está entre los registrados.
    expect(fake.intervalsMs()).toContain(6 * MS_POR_HORA);
  });

  it('cada tick del intervalo dispara una sincronización', async () => {
    const sportsSync = new SpySportsSyncJob();
    const { scheduler } = makeScheduler({ sportsSync });
    const fake = new FakeScheduler();
    scheduler.start(fake);

    await fake.tickEvery(3);

    expect(sportsSync.calls).toBe(3);
  });
});

describe('JobScheduler — recordatorios recurrentes de Recuadro (Req 14.2)', () => {
  it('invoca evaluarRecordatoriosRecuadros por cada Álbum activo', async () => {
    const notifications = new SpyNotificationService();
    const { scheduler } = makeScheduler({
      notifications: notifications.asService(),
      activeWork: new FixedActiveWork([], [ALBUM_A, ALBUM_B]),
    });

    const enviadas = await scheduler.runRemindersRecuadros();

    expect(notifications.recuadrosCalls).toEqual([ALBUM_A, ALBUM_B]);
    expect(enviadas).toHaveLength(2);
    expect(enviadas[0]?.tipo).toBe('RECUADRO_VACIO_RECURRENTE');
  });

  it('un fallo en un Álbum se reporta y no interrumpe los demás', async () => {
    const failing = ALBUM_A;
    const notifications = {
      evaluarRecordatoriosRecuadros(albumId: UUID): Promise<NotificacionPush[]> {
        if (albumId === failing) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve([]);
      },
    } as unknown as NotificationService;
    const { scheduler, errors } = makeScheduler({
      notifications,
      activeWork: new FixedActiveWork([], [ALBUM_A, ALBUM_B]),
    });

    await scheduler.runRemindersRecuadros();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.contexto).toContain(ALBUM_A);
  });
});

describe('JobScheduler — recordatorios de cierre (Req 14.6)', () => {
  it('invoca evaluarRecordatoriosCierre por cada Temporada activa', async () => {
    const notifications = new SpyNotificationService();
    const { scheduler } = makeScheduler({
      notifications: notifications.asService(),
      activeWork: new FixedActiveWork([TEMPORADA_A, TEMPORADA_B], []),
    });

    const enviadas = await scheduler.runRemindersCierre();

    expect(notifications.cierreCalls).toEqual([TEMPORADA_A, TEMPORADA_B]);
    expect(enviadas).toHaveLength(2);
    expect(enviadas[0]?.tipo).toBe('CIERRE_ESCALONADO');
  });
});

describe('JobScheduler — cierre automático (Req 16.3)', () => {
  it('invoca automaticClose con el instante del reloj y cierra al alcanzar la fecha límite', async () => {
    const limiteMs = 10 * MS_POR_HORA;
    const closing = new SpyClosingService(new Map([[TEMPORADA_A, limiteMs]]));
    const clock = new FakeClock(limiteMs); // now == fecha límite
    const { scheduler } = makeScheduler({
      closing: closing.asService(),
      clock,
      activeWork: new FixedActiveWork([TEMPORADA_A], []),
    });

    const cerradas = await scheduler.runAutomaticClose();

    expect(closing.closeCalls).toEqual([{ temporadaId: TEMPORADA_A, now: limiteMs }]);
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0]?.temporada.estado).toBe('CERRADA');
    expect(cerradas[0]?.printEngineDisparado).toBe(true);
  });

  it('antes de la fecha límite es un no-op (no cierra, no reporta error)', async () => {
    const limiteMs = 100 * MS_POR_HORA;
    const closing = new SpyClosingService(new Map([[TEMPORADA_A, limiteMs]]));
    const clock = new FakeClock(5 * MS_POR_HORA); // now < fecha límite
    const { scheduler, errors } = makeScheduler({
      closing: closing.asService(),
      clock,
      activeWork: new FixedActiveWork([TEMPORADA_A], []),
    });

    const cerradas = await scheduler.runAutomaticClose();

    expect(closing.closeCalls).toHaveLength(1); // se intentó
    expect(cerradas).toHaveLength(0); // pero no cerró
    expect(errors).toHaveLength(0); // "fecha no alcanzada" no es error
  });

  it('cierra sólo las Temporadas cuya fecha límite ya se alcanzó', async () => {
    const now = 50 * MS_POR_HORA;
    const closing = new SpyClosingService(
      new Map([
        [TEMPORADA_A, 10 * MS_POR_HORA], // ya vencida → cierra
        [TEMPORADA_B, 90 * MS_POR_HORA], // futura → no cierra
      ]),
    );
    const { scheduler } = makeScheduler({
      closing: closing.asService(),
      clock: new FakeClock(now),
      activeWork: new FixedActiveWork([TEMPORADA_A, TEMPORADA_B], []),
    });

    const cerradas = await scheduler.runAutomaticClose();

    expect(cerradas.map((c) => c.temporada.id)).toEqual([TEMPORADA_A]);
  });

  it('un error real de cierre se reporta (no se traga como fecha no alcanzada)', async () => {
    const closing = {
      automaticClose(): Promise<CierreResultado> {
        return Promise.reject(new Error('fallo de repositorio'));
      },
    } as unknown as TemporadaClosingService;
    const { scheduler, errors } = makeScheduler({
      closing,
      activeWork: new FixedActiveWork([TEMPORADA_A], []),
    });

    const cerradas = await scheduler.runAutomaticClose();

    expect(cerradas).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.contexto).toContain('cierre-automatico');
  });
});

describe('JobScheduler — registro y ciclo de vida', () => {
  it('registra los cuatro jobs y stop cancela todas las cadencias', async () => {
    const sportsSync = new SpySportsSyncJob();
    const notifications = new SpyNotificationService();
    const { scheduler } = makeScheduler({
      sportsSync,
      notifications: notifications.asService(),
      activeWork: new FixedActiveWork([TEMPORADA_A], [ALBUM_A]),
    });
    const fake = new FakeScheduler();

    scheduler.start(fake);
    expect(fake.recurring).toHaveLength(4);

    // Un tick dispara todos los jobs una vez.
    await fake.tickEvery(1);
    expect(sportsSync.calls).toBe(1);
    expect(notifications.recuadrosCalls).toEqual([ALBUM_A]);
    expect(notifications.cierreCalls).toEqual([TEMPORADA_A]);

    // Tras stop, las cadencias quedan canceladas.
    scheduler.stop();
    expect(fake.intervalsMs()).toHaveLength(0);
    await fake.tickEvery(1);
    expect(sportsSync.calls).toBe(1); // sin nuevos disparos
  });

  it('un fallo en un job no derriba al scheduler (se aísla vía guard)', async () => {
    const sportsSync: SportsSyncJob = {
      run: () => Promise.reject(new Error('sync roto')),
    };
    const { scheduler, errors } = makeScheduler({ sportsSync });
    const fake = new FakeScheduler();
    scheduler.start(fake);

    await expect(fake.tickEvery(1)).resolves.toBeUndefined();
    expect(errors.some((e) => e.contexto === 'sports-sync')).toBe(true);
  });
});
