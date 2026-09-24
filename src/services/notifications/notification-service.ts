// Servicio_Notificaciones anclado a hora local (Task 18.1 y 18.2 — Req 14, 15.3).
//
// Orquesta las reglas puras de `reminder-rules.ts` con la persistencia y la
// entrega push. Sigue el diseño ("Servicio_Notificaciones anclado a hora local"):
//
//   - Notificaciones BASADAS EN ESTADO, no en disparos sueltos: en cada tick del
//     job se recalcula, a partir del estado persistido (Recuadro vacío /
//     Foto_Principal asignada / recordatorio silenciado, y proximidad al cierre),
//     qué recordatorios corresponden. Así pueden detenerse de forma determinista.
//   - Ancladas a la ZONA HORARIA del usuario (`Usuario.zonaHoraria`, IANA) a una
//     hora de envío definida, no a UTC crudo.
//   - Entrega push detrás de la interfaz mockeable `PushNotifier`.
//
// Dependencias (repositorios, reloj y PushNotifier) se inyectan, de modo que el
// servicio se ejercita con los dobles en memoria y un `PushNotifier` mock, sin
// PostgreSQL ni APNs/FCM vivos.

import type { Recuadro, UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  DireccionEnvioRepository,
  RecuadroRepository,
  TemporadaRepository,
  UsuarioRepository,
} from '../../persistence/repositories.js';
import type { NotificacionPush, PushNotifier } from './push-notifier.js';
import {
  decidirRecordatorioCierre,
  decidirRecordatorioRecuadro,
  HORA_ENVIO_POR_DEFECTO,
  type EstadoRecuadroRecordatorio,
} from './reminder-rules.js';

/**
 * Reloj inyectable. Se abstrae `Date.now()` para que la evaluación de
 * recordatorios sea determinista en pruebas (hora local anclada a un instante).
 */
export interface Clock {
  /** Instante actual en epoch ms (UTC). */
  now(): number;
}

/** Reloj por defecto respaldado por `Date.now()` (para producción/jobs). */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Dependencias inyectadas del Servicio_Notificaciones. */
export interface NotificationServiceDeps {
  /** Usuarios: fuente de `zonaHoraria` para anclar la hora local (Req 14). */
  readonly usuarios: UsuarioRepository;
  /** Temporadas: `fechaLimiteCierre` para los offsets de cierre (Req 14.6). */
  readonly temporadas: TemporadaRepository;
  /** Álbumes: localizar el Álbum de la Temporada (relación 1:1). */
  readonly albums: AlbumRepository;
  /** Recuadros: estado de vacío/Foto_Principal/recordatorio (Req 14.1–14.4). */
  readonly recuadros: RecuadroRepository;
  /** Direcciones: existencia de Dirección_Envío válida (Req 15.3). */
  readonly direcciones: DireccionEnvioRepository;
  /** Entrega push (mockeable). */
  readonly pushNotifier: PushNotifier;
  /** Reloj inyectable (por defecto, `systemClock`). */
  readonly clock?: Clock;
  /** Hora de envío local (0..23; por defecto 10:00 — ver design). */
  readonly horaEnvio?: number;
}

/**
 * Registro del envío de recordatorios de un Recuadro para evaluar la cadencia
 * ~24h (Req 14.2). El estado persistente del Recuadro no guarda la marca del
 * último recordatorio, por lo que el servicio la lleva en memoria del proceso
 * del job. Al reiniciarse, el peor caso es un reenvío adicional a la hora de
 * envío local, aceptable para un recordatorio.
 */
export interface RecordatorioTracker {
  /** Último instante (epoch ms) en que se envió un recordatorio del Recuadro. */
  obtener(recuadroId: UUID): number | null;
  /** Registra el instante del último recordatorio enviado del Recuadro. */
  registrar(recuadroId: UUID, instanteMs: number): void;
}

/** Tracker en memoria por defecto (respaldado por un `Map`). */
export class InMemoryRecordatorioTracker implements RecordatorioTracker {
  private readonly ultimos = new Map<UUID, number>();

  obtener(recuadroId: UUID): number | null {
    return this.ultimos.get(recuadroId) ?? null;
  }

  registrar(recuadroId: UUID, instanteMs: number): void {
    this.ultimos.set(recuadroId, instanteMs);
  }
}

/**
 * Servicio_Notificaciones. Expone dos operaciones de evaluación (una por
 * subtask) que el Programador de Jobs invoca en cada tick, más el disparo del
 * recordatorio inicial al finalizar un partido.
 */
export class NotificationService {
  private readonly usuarios: UsuarioRepository;
  private readonly temporadas: TemporadaRepository;
  private readonly albums: AlbumRepository;
  private readonly recuadros: RecuadroRepository;
  private readonly direcciones: DireccionEnvioRepository;
  private readonly pushNotifier: PushNotifier;
  private readonly clock: Clock;
  private readonly horaEnvio: number;
  private readonly tracker: RecordatorioTracker;
  /**
   * Instante de finalización por Recuadro, anclado por `onPartidoFinalizadoSinFoto`.
   * Vive en la memoria del proceso del job (el dominio no lo persiste en el
   * Recuadro). Fija el inicio de la ventana de recordatorios y la base del
   * reenvío ~24h en la zona horaria del usuario.
   */
  private readonly finalizaciones = new Map<UUID, number>();

  constructor(deps: NotificationServiceDeps, tracker?: RecordatorioTracker) {
    this.usuarios = deps.usuarios;
    this.temporadas = deps.temporadas;
    this.albums = deps.albums;
    this.recuadros = deps.recuadros;
    this.direcciones = deps.direcciones;
    this.pushNotifier = deps.pushNotifier;
    this.clock = deps.clock ?? systemClock;
    this.horaEnvio = deps.horaEnvio ?? HORA_ENVIO_POR_DEFECTO;
    this.tracker = tracker ?? new InMemoryRecordatorioTracker();
  }

  // -------------------------------------------------------------------------
  // Task 18.1 — Recordatorios recurrentes de Recuadro vacío (Req 14.1–14.4)
  // -------------------------------------------------------------------------

  /**
   * Punto de entrada del evento "Partido_Oficial finalizado sin Foto_Principal"
   * (Req 14.1). Ancla el instante de finalización del Recuadro (para calcular la
   * ventana de recordatorios y la cadencia ~24h) e intenta emitir el
   * recordatorio inicial si la evaluación cae dentro de la hora de envío local.
   *
   * Es idempotente respecto al estado: si el Recuadro ya tiene Foto_Principal o
   * su recordatorio no está ACTIVO, no se programa ni envía nada.
   *
   * @param recuadroId Recuadro del Partido_Oficial recién finalizado.
   * @param finalizadoEnMs Instante de finalización del partido en epoch ms.
   *   Por defecto, el instante del reloj (el evento se procesa al finalizar).
   * @returns La notificación enviada, o `null` si no correspondió emitir ahora.
   */
  async onPartidoFinalizadoSinFoto(
    recuadroId: UUID,
    finalizadoEnMs: number = this.clock.now(),
  ): Promise<NotificacionPush | null> {
    const recuadro = await this.recuadros.findById(recuadroId);
    if (recuadro === null) {
      return null;
    }
    if (recuadro.fotoPrincipalId !== null || recuadro.estadoRecordatorio !== 'ACTIVO') {
      return null;
    }
    // Ancla la finalización para los reenvíos recurrentes posteriores.
    this.finalizaciones.set(recuadro.id, finalizadoEnMs);
    return this.evaluarRecordatorioRecuadro(recuadro, finalizadoEnMs);
  }

  /**
   * Tick del job (Req 14.2): recorre los Recuadros vacíos de un Álbum y, para
   * cada uno, emite el recordatorio inicial o el reenvío ~24h que corresponda,
   * anclado a la hora de envío local del usuario, deteniéndose de forma
   * determinista cuando hay Foto_Principal (Req 14.3) o está silenciado (Req 14.4).
   *
   * Devuelve las notificaciones efectivamente enviadas (para observabilidad/tests).
   */
  async evaluarRecordatoriosRecuadros(albumId: UUID): Promise<NotificacionPush[]> {
    const vacios = await this.recuadros.findSinFotoPrincipalByAlbumId(albumId);
    const enviadas: NotificacionPush[] = [];
    for (const recuadro of vacios) {
      const notificacion = await this.evaluarRecordatorioRecuadro(
        recuadro,
        this.finalizadoEnMs(recuadro),
      );
      if (notificacion !== null) {
        enviadas.push(notificacion);
      }
    }
    return enviadas;
  }

  /**
   * Evalúa y (si corresponde) emite el recordatorio de un único Recuadro. Común
   * al evento de finalización y al tick recurrente.
   */
  private async evaluarRecordatorioRecuadro(
    recuadro: Recuadro,
    finalizadoEnMs: number,
  ): Promise<NotificacionPush | null> {
    const usuario = await this.usuarioDeAlbum(recuadro.albumId);
    if (usuario === null) {
      return null;
    }

    const ahoraMs = this.clock.now();
    const estado: EstadoRecuadroRecordatorio = {
      tieneFotoPrincipal: recuadro.fotoPrincipalId !== null,
      estadoRecordatorio: recuadro.estadoRecordatorio,
      finalizadoEnMs,
      ultimoRecordatorioMs: this.tracker.obtener(recuadro.id),
    };

    const decision = decidirRecordatorioRecuadro(
      estado,
      ahoraMs,
      usuario.zonaHoraria,
      this.horaEnvio,
    );
    if (!decision.debeEnviar) {
      return null;
    }

    const notificacion: NotificacionPush = {
      usuarioId: usuario.id,
      tipo: decision.esInicial ? 'RECUADRO_VACIO_INICIAL' : 'RECUADRO_VACIO_RECURRENTE',
      recuadroId: recuadro.id,
      temporadaId: null,
      diasParaCierre: null,
    };
    await this.pushNotifier.enviar(notificacion);
    this.tracker.registrar(recuadro.id, ahoraMs);
    return notificacion;
  }

  // -------------------------------------------------------------------------
  // Task 18.2 — Recordatorios de cierre escalonados y dirección (Req 14.6, 15.3)
  // -------------------------------------------------------------------------

  /**
   * Tick del job de cierre (Req 14.6, 15.3): evalúa una Temporada y emite, si
   * corresponde a la hora de envío local del usuario, el recordatorio de cierre
   * escalonado (30/15/7/1 día) y/o el aviso de Dirección_Envío válida faltante.
   *
   * Devuelve las notificaciones efectivamente enviadas.
   */
  async evaluarRecordatoriosCierre(temporadaId: UUID): Promise<NotificacionPush[]> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada === null) {
      return [];
    }
    const usuario = await this.usuarios.findById(temporada.usuarioId);
    if (usuario === null) {
      return [];
    }

    const direccion = await this.direcciones.findByUsuarioId(usuario.id);
    const tieneDireccionValida = direccion !== null && direccion.validada;

    const fechaLimiteMs = Date.parse(temporada.fechaLimiteCierre);
    if (Number.isNaN(fechaLimiteMs)) {
      return [];
    }

    const decision = decidirRecordatorioCierre(
      fechaLimiteMs,
      tieneDireccionValida,
      this.clock.now(),
      usuario.zonaHoraria,
      this.horaEnvio,
    );

    const enviadas: NotificacionPush[] = [];

    if (decision.offsetCierre !== null) {
      const notificacion: NotificacionPush = {
        usuarioId: usuario.id,
        tipo: 'CIERRE_ESCALONADO',
        recuadroId: null,
        temporadaId: temporada.id,
        diasParaCierre: decision.offsetCierre,
      };
      await this.pushNotifier.enviar(notificacion);
      enviadas.push(notificacion);
    }

    if (decision.avisarDireccionFaltante) {
      const notificacion: NotificacionPush = {
        usuarioId: usuario.id,
        tipo: 'DIRECCION_ENVIO_FALTANTE',
        recuadroId: null,
        temporadaId: temporada.id,
        diasParaCierre: null,
      };
      await this.pushNotifier.enviar(notificacion);
      enviadas.push(notificacion);
    }

    return enviadas;
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  /** Localiza al Usuario dueño de la Temporada del Álbum dado (o `null`). */
  private async usuarioDeAlbum(albumId: UUID) {
    const album = await this.albums.findById(albumId);
    if (album === null) {
      return null;
    }
    const temporada = await this.temporadas.findById(album.temporadaId);
    if (temporada === null) {
      return null;
    }
    return this.usuarios.findById(temporada.usuarioId);
  }

  /**
   * Instante de finalización asociado al Recuadro para el tick recurrente. Se
   * usa el anclado por `onPartidoFinalizadoSinFoto`; si el proceso del job se
   * reinició y se perdió el anclaje, se recurre al último recordatorio conocido
   * o, en su ausencia, al instante actual (peor caso: un recordatorio inicial
   * adicional a la hora de envío local, aceptable para un recordatorio).
   */
  private finalizadoEnMs(recuadro: Recuadro): number {
    return (
      this.finalizaciones.get(recuadro.id) ?? this.tracker.obtener(recuadro.id) ?? this.clock.now()
    );
  }
}
