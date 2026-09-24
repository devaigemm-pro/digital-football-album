/**
 * Pruebas del NotificationService (Task 18.1/18.2 — Req 14.1–14.4, 14.6, 15.3).
 *
 * Ejercitan el servicio con los dobles en memoria y un `PushNotifier` espía:
 *  - Recordatorio inicial + reenvío 24h de Recuadro vacío, con paro por
 *    Foto_Principal y por silenciado (Req 14.1–14.4).
 *  - Recordatorios de cierre escalonados 30/15/7/1 en hora local en varias
 *    zonas horarias (Req 14.6).
 *  - Aviso de Dirección_Envío válida faltante al aproximarse el cierre (Req 15.3).
 */
import { describe, it, expect } from 'vitest';
import type {
  Album,
  DireccionEnvio,
  Recuadro,
  Temporada,
  Usuario,
  UUID,
} from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryDireccionEnvioRepository,
  InMemoryRecuadroRepository,
  InMemoryTemporadaRepository,
  InMemoryUsuarioRepository,
} from '../../persistence/in-memory/repositories.js';
import {
  NotificationService,
  type Clock,
  type NotificationServiceDeps,
} from './notification-service.js';
import type { NotificacionPush, PushNotifier } from './push-notifier.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const CLUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID;
const TEMPORADA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const ALBUM_ID = 'a1b0b0b0-0000-4000-8000-000000000001' as UUID;
const PLANTILLA_ID = 'p1a0a0a0-0000-4000-8000-000000000001' as UUID;
const RECUADRO_ID = 'r0000001-0000-4000-8000-000000000001' as UUID;
const FOTO_ID = 'f0000001-0000-4000-8000-000000000001' as UUID;
const DIRECCION_ID = 'd0000001-0000-4000-8000-000000000001' as UUID;

const TZ = 'America/Bogota';
const HORA_ENVIO = 10;

/** PushNotifier espía que registra los envíos sin transportarlos. */
class SpyPushNotifier implements PushNotifier {
  readonly enviadas: NotificacionPush[] = [];
  enviar(notificacion: NotificacionPush): Promise<void> {
    this.enviadas.push(notificacion);
    return Promise.resolve();
  }
}

/** Reloj controlable para fijar el instante de evaluación. */
class FakeClock implements Clock {
  constructor(public ms: number) {}
  now(): number {
    return this.ms;
  }
}

/** Instante UTC cuya hora local en Bogotá es la hora de envío del día dado. */
function bogotaEnviarEl(fechaLocal: string): number {
  return Date.parse(`${fechaLocal}T15:00:00.000Z`);
}

function makeUsuario(zonaHoraria = TZ): Usuario {
  return {
    id: USUARIO_ID,
    proveedorAuth: 'email',
    email: 'hincha@example.com',
    clubId: CLUB_ID,
    zonaHoraria,
  };
}

function makeTemporada(fechaLimiteCierre: string): Temporada {
  return {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: CLUB_ID,
    temporadaExterna: '2024-2025',
    estado: 'ACTIVA',
    fechaLimiteCierre,
  };
}

function makeAlbum(): Album {
  return { id: ALBUM_ID, temporadaId: TEMPORADA_ID };
}

function makeRecuadro(over: Partial<Recuadro> = {}): Recuadro {
  return {
    id: RECUADRO_ID,
    albumId: ALBUM_ID,
    partidoOficialId: 'partido-1',
    plantillaId: PLANTILLA_ID,
    numero: 1,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: null,
    estadoRecordatorio: 'ACTIVO',
    ...over,
  };
}

function makeDireccion(validada: boolean): DireccionEnvio {
  return {
    id: DIRECCION_ID,
    usuarioId: USUARIO_ID,
    campos: {
      nombre: 'Hincha',
      linea1: 'Calle 1',
      ciudad: 'Bogotá',
      region: 'Cundinamarca',
      codigoPostal: '110111',
      pais: 'CO',
    },
    validada,
  };
}

function makeService(options: {
  usuario?: Usuario;
  temporada?: Temporada;
  album?: Album | null;
  recuadros?: readonly Recuadro[];
  direccion?: DireccionEnvio | null;
  clock: Clock;
}): { service: NotificationService; push: SpyPushNotifier } {
  const push = new SpyPushNotifier();
  const deps: NotificationServiceDeps = {
    usuarios: new InMemoryUsuarioRepository([options.usuario ?? makeUsuario()]),
    temporadas: new InMemoryTemporadaRepository([
      options.temporada ?? makeTemporada('2025-08-01T04:59:59.000Z'),
    ]),
    albums: new InMemoryAlbumRepository(
      options.album === null ? [] : [options.album ?? makeAlbum()],
    ),
    recuadros: new InMemoryRecuadroRepository(options.recuadros ?? []),
    direcciones: new InMemoryDireccionEnvioRepository(
      options.direccion == null ? [] : [options.direccion],
    ),
    pushNotifier: push,
    clock: options.clock,
    horaEnvio: HORA_ENVIO,
  };
  return { service: new NotificationService(deps), push };
}

// ---------------------------------------------------------------------------
// Task 18.1 — Recuadro vacío (Req 14.1–14.4)
// ---------------------------------------------------------------------------

describe('NotificationService — recordatorios de Recuadro vacío', () => {
  it('envía el recordatorio inicial al finalizar sin Foto_Principal (Req 14.1)', async () => {
    const finalizado = bogotaEnviarEl('2025-06-01');
    const clock = new FakeClock(finalizado);
    const { service, push } = makeService({
      recuadros: [makeRecuadro()],
      clock,
    });

    const enviada = await service.onPartidoFinalizadoSinFoto(RECUADRO_ID, finalizado);

    expect(enviada?.tipo).toBe('RECUADRO_VACIO_INICIAL');
    expect(push.enviadas).toHaveLength(1);
    expect(push.enviadas[0]).toMatchObject({
      usuarioId: USUARIO_ID,
      recuadroId: RECUADRO_ID,
      tipo: 'RECUADRO_VACIO_INICIAL',
    });
  });

  it('NO envía el inicial si el Recuadro ya tiene Foto_Principal (Req 14.3)', async () => {
    const finalizado = bogotaEnviarEl('2025-06-01');
    const clock = new FakeClock(finalizado);
    const { service, push } = makeService({
      recuadros: [
        makeRecuadro({ fotoPrincipalId: FOTO_ID, estadoRecordatorio: 'DETENIDO_POR_FOTO' }),
      ],
      clock,
    });

    const enviada = await service.onPartidoFinalizadoSinFoto(RECUADRO_ID, finalizado);
    expect(enviada).toBeNull();
    expect(push.enviadas).toHaveLength(0);
  });

  it('reenvía ~cada 24h a la hora local mientras siga vacío (Req 14.2)', async () => {
    const finalizado = bogotaEnviarEl('2025-06-01');
    const clock = new FakeClock(finalizado);
    const { service, push } = makeService({
      recuadros: [makeRecuadro()],
      clock,
    });

    // Día 1: inicial.
    await service.onPartidoFinalizadoSinFoto(RECUADRO_ID, finalizado);
    // Mismo día, fuera de hora: no reenvía.
    clock.ms = finalizado + 3 * 3_600_000; // 13:00 Bogotá
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);
    // Día 2 a la hora de envío: reenvía.
    clock.ms = bogotaEnviarEl('2025-06-02');
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);
    // Día 3 a la hora de envío: reenvía de nuevo.
    clock.ms = bogotaEnviarEl('2025-06-03');
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);

    expect(push.enviadas.map((n) => n.tipo)).toEqual([
      'RECUADRO_VACIO_INICIAL',
      'RECUADRO_VACIO_RECURRENTE',
      'RECUADRO_VACIO_RECURRENTE',
    ]);
  });

  it('deja de reenviar cuando se asigna Foto_Principal (Req 14.3)', async () => {
    const finalizado = bogotaEnviarEl('2025-06-01');
    const clock = new FakeClock(finalizado);
    const recuadroRepo = new InMemoryRecuadroRepository([makeRecuadro()]);
    const push = new SpyPushNotifier();
    const service = new NotificationService({
      usuarios: new InMemoryUsuarioRepository([makeUsuario()]),
      temporadas: new InMemoryTemporadaRepository([makeTemporada('2025-08-01T04:59:59.000Z')]),
      albums: new InMemoryAlbumRepository([makeAlbum()]),
      recuadros: recuadroRepo,
      direcciones: new InMemoryDireccionEnvioRepository([]),
      pushNotifier: push,
      clock,
      horaEnvio: HORA_ENVIO,
    });

    await service.onPartidoFinalizadoSinFoto(RECUADRO_ID, finalizado);

    // Se asigna Foto_Principal: el recordatorio debe detenerse (Req 14.3).
    await recuadroRepo.update(RECUADRO_ID, {
      fotoPrincipalId: FOTO_ID,
      estadoRecordatorio: 'DETENIDO_POR_FOTO',
    });

    clock.ms = bogotaEnviarEl('2025-06-02');
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);
    clock.ms = bogotaEnviarEl('2025-06-03');
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);

    // Sólo el inicial: sin reenvíos tras asignar la foto.
    expect(push.enviadas).toHaveLength(1);
    expect(push.enviadas[0]?.tipo).toBe('RECUADRO_VACIO_INICIAL');
  });

  it('deja de reenviar cuando el usuario silencia el recordatorio (Req 14.4)', async () => {
    const finalizado = bogotaEnviarEl('2025-06-01');
    const clock = new FakeClock(finalizado);
    const recuadroRepo = new InMemoryRecuadroRepository([makeRecuadro()]);
    const push = new SpyPushNotifier();
    const service = new NotificationService({
      usuarios: new InMemoryUsuarioRepository([makeUsuario()]),
      temporadas: new InMemoryTemporadaRepository([makeTemporada('2025-08-01T04:59:59.000Z')]),
      albums: new InMemoryAlbumRepository([makeAlbum()]),
      recuadros: recuadroRepo,
      direcciones: new InMemoryDireccionEnvioRepository([]),
      pushNotifier: push,
      clock,
      horaEnvio: HORA_ENVIO,
    });

    await service.onPartidoFinalizadoSinFoto(RECUADRO_ID, finalizado);
    await recuadroRepo.update(RECUADRO_ID, { estadoRecordatorio: 'SILENCIADO' });

    clock.ms = bogotaEnviarEl('2025-06-02');
    await service.evaluarRecordatoriosRecuadros(ALBUM_ID);

    expect(push.enviadas).toHaveLength(1);
    expect(push.enviadas[0]?.tipo).toBe('RECUADRO_VACIO_INICIAL');
  });

  it('los Recuadros con Foto_Principal no generan recordatorios en el tick', async () => {
    const clock = new FakeClock(bogotaEnviarEl('2025-06-02'));
    const { service, push } = makeService({
      recuadros: [makeRecuadro({ fotoPrincipalId: FOTO_ID })],
      clock,
    });

    const enviadas = await service.evaluarRecordatoriosRecuadros(ALBUM_ID);
    expect(enviadas).toHaveLength(0);
    expect(push.enviadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 18.2 — Cierre escalonado + dirección faltante (Req 14.6, 15.3)
// ---------------------------------------------------------------------------

describe('NotificationService — recordatorios de cierre', () => {
  // Cierre: 2025-07-31 23:59 Bogotá.
  const fechaLimite = '2025-08-01T04:59:59.000Z';

  it('emite recordatorio de cierre en cada offset 30/15/7/1 (Req 14.6)', async () => {
    const offsetsADiaLocal: Record<number, string> = {
      30: '2025-07-01',
      15: '2025-07-16',
      7: '2025-07-24',
      1: '2025-07-30',
    };
    for (const [offsetStr, diaLocal] of Object.entries(offsetsADiaLocal)) {
      const offset = Number(offsetStr);
      const clock = new FakeClock(bogotaEnviarEl(diaLocal));
      const { service, push } = makeService({
        temporada: makeTemporada(fechaLimite),
        direccion: makeDireccion(true),
        clock,
      });

      await service.evaluarRecordatoriosCierre(TEMPORADA_ID);

      const cierre = push.enviadas.find((n) => n.tipo === 'CIERRE_ESCALONADO');
      expect(cierre, `offset ${offset}`).toBeDefined();
      expect(cierre?.diasParaCierre).toBe(offset);
    }
  });

  it('NO emite recordatorio de cierre en un offset no escalonado', async () => {
    const clock = new FakeClock(bogotaEnviarEl('2025-07-11')); // faltan 20 días
    const { service, push } = makeService({
      temporada: makeTemporada(fechaLimite),
      direccion: makeDireccion(true),
      clock,
    });

    await service.evaluarRecordatoriosCierre(TEMPORADA_ID);
    expect(push.enviadas.find((n) => n.tipo === 'CIERRE_ESCALONADO')).toBeUndefined();
  });

  it('avisa de Dirección_Envío válida faltante al aproximarse el cierre (Req 15.3)', async () => {
    const clock = new FakeClock(bogotaEnviarEl('2025-07-16')); // faltan 15 días
    const { service, push } = makeService({
      temporada: makeTemporada(fechaLimite),
      direccion: null, // sin dirección registrada
      clock,
    });

    await service.evaluarRecordatoriosCierre(TEMPORADA_ID);
    expect(push.enviadas.find((n) => n.tipo === 'DIRECCION_ENVIO_FALTANTE')).toBeDefined();
  });

  it('trata una dirección no validada como faltante (Req 15.3)', async () => {
    const clock = new FakeClock(bogotaEnviarEl('2025-07-16'));
    const { service, push } = makeService({
      temporada: makeTemporada(fechaLimite),
      direccion: makeDireccion(false),
      clock,
    });

    await service.evaluarRecordatoriosCierre(TEMPORADA_ID);
    expect(push.enviadas.find((n) => n.tipo === 'DIRECCION_ENVIO_FALTANTE')).toBeDefined();
  });

  it('NO avisa de dirección faltante si ya hay una válida', async () => {
    const clock = new FakeClock(bogotaEnviarEl('2025-07-16'));
    const { service, push } = makeService({
      temporada: makeTemporada(fechaLimite),
      direccion: makeDireccion(true),
      clock,
    });

    await service.evaluarRecordatoriosCierre(TEMPORADA_ID);
    expect(push.enviadas.find((n) => n.tipo === 'DIRECCION_ENVIO_FALTANTE')).toBeUndefined();
  });

  it('evalúa los offsets en la hora local del usuario en distintas zonas horarias (Req 14.6)', async () => {
    // Para Tokio (UTC+9), el cierre 2025-07-31 fin de día local corresponde a
    // 2025-07-31T14:59:59Z. A 7 días locales antes, la hora de envío local
    // (10:00 JST = 01:00Z del 2025-07-24) debe disparar el offset 7.
    const usuarioTokio = makeUsuario('Asia/Tokyo');
    const fechaLimiteTokio = '2025-07-31T14:59:59.000Z'; // 2025-07-31 23:59 JST
    const ahoraTokio = Date.parse('2025-07-24T01:00:00.000Z'); // 10:00 JST del 24
    const clock = new FakeClock(ahoraTokio);
    const { service, push } = makeService({
      usuario: usuarioTokio,
      temporada: makeTemporada(fechaLimiteTokio),
      direccion: makeDireccion(true),
      clock,
    });

    await service.evaluarRecordatoriosCierre(TEMPORADA_ID);
    const cierre = push.enviadas.find((n) => n.tipo === 'CIERRE_ESCALONADO');
    expect(cierre?.diasParaCierre).toBe(7);
  });
});
