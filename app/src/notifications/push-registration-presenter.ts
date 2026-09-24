// PushRegistrationPresenter — núcleo framework-agnóstico del registro de
// notificaciones push del cliente y del renderizado de los recordatorios.
//
// Task 30.3 — Requirements: 26.1, 26.2, 26.3, 26.4, 26.5
// (design.md · "Permisos, IAP, Push y Compartición (Req 24, 25, 26, 6/13)" →
//  "Push (Req 26): registro del Token_Push (APNs/FCM) en el backend y
//   renderizado de los recordatorios recibidos"; Integraciones → "Push: APNs/FCM
//   para el Token_Push (Req 26)").
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `NotificacionesScreen.tsx` enlaza. Aísla las capacidades NATIVAS
// (solicitar permiso de notificaciones, obtener el Token_Push de APNs/FCM y
// renderizar/mostrar el recordatorio en el sistema) detrás de un puerto
// inyectable `NativeNotificationBridge`, de modo que la lógica de corrección
// (flujo de permiso, registro en backend, silenciar, operar sin permiso y
// derivación del contenido del recordatorio) sea unit-testeable y typechee sin
// dependencias nativas. Sigue el mismo patrón puerto/adaptador que
// `SharePresenter`/`NativeShareBridge` y `SecureTokenStore`.
//
// Responsabilidades (más allá del bridge nativo):
//   - Obtener el permiso de notificaciones y, si se concede, el Token_Push del
//     SO, y REGISTRARLO en el backend (Req 26.1).
//   - Al recibir una notificación de Recuadro vacío, MOSTRAR el recordatorio de
//     subir la Foto_Principal del Recuadro indicado (Req 26.2).
//   - Al recibir una notificación de cierre escalonado, MOSTRAR el recordatorio
//     de completar el álbum antes de la Fecha_Límite_Cierre (Req 26.3).
//   - Al silenciar los recordatorios de un Recuadro, COMUNICAR al backend la
//     solicitud de silenciar ese recordatorio (Req 26.4).
//   - Si el usuario NO concede el permiso, CONTINUAR operando sin registrar el
//     Token_Push (Req 26.5): no se contacta al backend de registro y el estado
//     lo refleja para que la app siga usable.
//
// El presentador NO reimplementa las reglas del Servicio_Notificaciones (cadencia
// de 24h, offsets de cierre 30/15/7/1 día): esas decisiones viven en el backend
// (Req 14). El cliente solo registra el Token_Push, renderiza lo que recibe y
// comunica la solicitud de silenciar; el backend decide qué y cuándo enviar.

// ---------------------------------------------------------------------------
// Contratos nativos (puerto) y del backend (cliente de registro)
// ---------------------------------------------------------------------------

/**
 * Resultado de solicitar al SO el permiso de notificaciones. `'concedido'`
 * habilita la obtención del Token_Push; `'denegado'` activa el camino de operar
 * sin permiso (Req 26.5). `'no_determinado'` indica que el usuario aún no
 * respondió (p. ej. cerró el prompt) y puede volver a solicitarse.
 */
export type EstadoPermisoPush = 'concedido' | 'denegado' | 'no_determinado';

/**
 * Puerto framework-agnóstico a las capacidades NATIVAS de notificaciones
 * (APNs en iOS / FCM en Android). Se inyecta para permitir un doble en pruebas y
 * el adaptador nativo real en producción, manteniendo este presentador sin
 * `react-native`. El adaptador de producción vive en un `.tsx`/wiring que sí
 * importa las APIs nativas (ver `native-notification-bridge-adapter.ts`).
 */
export interface NativeNotificationBridge {
  /**
   * Solicita al SO el permiso de notificaciones y devuelve el estado resultante
   * (Req 26.1, 26.5). No debe lanzar por una denegación: la denegación se
   * representa como `'denegado'`.
   */
  requestPermission(): Promise<EstadoPermisoPush>;

  /**
   * Obtiene el Token_Push de APNs/FCM del dispositivo. Solo se invoca cuando el
   * permiso fue concedido (Req 26.1). Devuelve `null` si el SO no pudo emitir un
   * token (p. ej. sin conectividad con el servicio push).
   */
  getPushToken(): Promise<string | null>;

  /**
   * Renderiza/muestra un recordatorio en el sistema (bandeja de notificaciones,
   * banner o UI in-app) a partir del contenido ya derivado (Req 26.2, 26.3).
   * Es la única frontera de I/O de presentación de notificaciones.
   */
  presentReminder(reminder: RenderedReminder): Promise<void>;
}

/**
 * Cliente del backend para el registro y silenciado de recordatorios. Lo
 * implementa un adaptador HTTP sobre `HttpClient`/`SessionHttpClient`
 * (`POST /notificaciones/token`, `POST /notificaciones/recuadros/{id}/silenciar`)
 * en producción y un doble en pruebas. Es el ÚNICO punto que contacta al
 * Servicio_Notificaciones; el presentador nunca reimplementa sus reglas.
 */
export interface PushRegistrationClient {
  /**
   * Registra el Token_Push del dispositivo en el Sistema (Req 26.1). La forma
   * del cuerpo (plataforma, token) la define el Servicio_Notificaciones; el
   * cliente lo reenvía. Rechaza ante fallos de red/backend.
   */
  registerPushToken(input: RegisterPushTokenInput): Promise<void>;

  /**
   * Comunica al Sistema la solicitud de silenciar los recordatorios de un
   * Recuadro (Req 26.4). Rechaza ante fallos de red/backend.
   */
  muteRecuadroReminder(recuadroId: string): Promise<void>;
}

/** Plataforma de push del dispositivo, para que el backend enrute por APNs/FCM. */
export type PushPlatform = 'apns' | 'fcm';

/** Cuerpo de `POST /notificaciones/token` (Req 26.1). */
export interface RegisterPushTokenInput {
  /** Token_Push emitido por el SO (APNs/FCM). */
  readonly token: string;
  /** Plataforma emisora, para enrutado del backend. */
  readonly platform: PushPlatform;
}

// ---------------------------------------------------------------------------
// Notificaciones entrantes y su renderizado (Req 26.2, 26.3)
// ---------------------------------------------------------------------------

/** Tipo de notificación push entrante que el cliente sabe renderizar. */
export type PushNotificationType = 'recuadro_vacio' | 'cierre_escalonado';

/**
 * Notificación push de Recuadro vacío (Req 26.2): recuerda subir la
 * Foto_Principal del Recuadro indicado. El backend envía el identificador del
 * Recuadro y, opcionalmente, una etiqueta legible (p. ej. el nombre del partido)
 * para enriquecer el mensaje sin que el cliente la derive.
 */
export interface RecuadroVacioNotification {
  readonly type: 'recuadro_vacio';
  /** Recuadro cuya Foto_Principal falta (Req 26.2). */
  readonly recuadroId: string;
  /** Etiqueta legible del Recuadro/partido provista por el backend, si la hay. */
  readonly recuadroEtiqueta?: string;
}

/**
 * Notificación push de cierre escalonado (Req 26.3): recuerda completar el álbum
 * antes de la Fecha_Límite_Cierre. El backend decide la cadencia (30/15/7/1 día)
 * y envía la Fecha_Límite_Cierre ya formateada para mostrar; el cliente no la
 * re-deriva.
 */
export interface CierreEscalonadoNotification {
  readonly type: 'cierre_escalonado';
  /** Temporada cuyo cierre se aproxima. */
  readonly temporadaId: string;
  /**
   * Fecha_Límite_Cierre a mostrar, tal como la envía el backend (ya anclada a la
   * zona horaria del usuario). El cliente la refleja sin recalcularla (Req 26.3).
   */
  readonly fechaLimiteCierre: string;
  /** Días restantes hasta el cierre según el backend, si los provee. */
  readonly diasRestantes?: number;
}

/**
 * Notificación push entrante que el cliente sabe renderizar. Union discriminada
 * por `type` para garantizar en tiempo de compilación el manejo exhaustivo.
 */
export type PushNotification =
  | RecuadroVacioNotification
  | CierreEscalonadoNotification;

/**
 * Recordatorio ya renderizado (título + cuerpo + metadatos) que el presentador
 * deriva de una `PushNotification` y entrega al bridge nativo para mostrarlo
 * (Req 26.2, 26.3). Es contenido puro, sin dependencias de plataforma.
 */
export interface RenderedReminder {
  /** Tipo de origen, para que la UI/bridge lo enrute o estilice. */
  readonly type: PushNotificationType;
  /** Título corto del recordatorio. */
  readonly titulo: string;
  /** Cuerpo legible del recordatorio. */
  readonly cuerpo: string;
  /**
   * Recuadro asociado cuando aplica (recordatorio de Recuadro vacío), para el
   * deep link / la acción de silenciar. `null` para el cierre escalonado.
   */
  readonly recuadroId: string | null;
}

/** Título por defecto del recordatorio de Recuadro vacío (Req 26.2). */
export const RECUADRO_VACIO_TITULO = 'Recuadro vacío';

/** Título por defecto del recordatorio de cierre escalonado (Req 26.3). */
export const CIERRE_ESCALONADO_TITULO = 'El álbum está por cerrarse';

/**
 * Deriva el contenido a mostrar de una notificación de Recuadro vacío (Req 26.2):
 * recuerda subir la Foto_Principal del Recuadro indicado, usando la etiqueta del
 * backend si viene.
 */
function renderRecuadroVacio(n: RecuadroVacioNotification): RenderedReminder {
  const referencia =
    n.recuadroEtiqueta && n.recuadroEtiqueta.trim().length > 0
      ? n.recuadroEtiqueta
      : `el recuadro ${n.recuadroId}`;
  return {
    type: 'recuadro_vacio',
    titulo: RECUADRO_VACIO_TITULO,
    cuerpo: `Sube la Foto Principal de ${referencia} para completar tu álbum.`,
    recuadroId: n.recuadroId,
  };
}

/**
 * Deriva el contenido a mostrar de una notificación de cierre escalonado
 * (Req 26.3): recuerda completar el álbum antes de la Fecha_Límite_Cierre,
 * reflejando la fecha (y los días restantes, si vienen) provistos por el backend.
 */
function renderCierreEscalonado(
  n: CierreEscalonadoNotification,
): RenderedReminder {
  const prefijo =
    typeof n.diasRestantes === 'number'
      ? `Faltan ${n.diasRestantes} día(s): completa`
      : 'Completa';
  return {
    type: 'cierre_escalonado',
    titulo: CIERRE_ESCALONADO_TITULO,
    cuerpo: `${prefijo} tu álbum antes de la fecha límite de cierre (${n.fechaLimiteCierre}).`,
    recuadroId: null,
  };
}

/**
 * Deriva el `RenderedReminder` de una `PushNotification` entrante (Req 26.2,
 * 26.3). Función pura reutilizable de forma independiente al estado del
 * presentador (útil para pruebas del contenido del recordatorio).
 */
export function renderNotification(
  notification: PushNotification,
): RenderedReminder {
  switch (notification.type) {
    case 'recuadro_vacio':
      return renderRecuadroVacio(notification);
    case 'cierre_escalonado':
      return renderCierreEscalonado(notification);
    default: {
      // Exhaustividad: si se añade un tipo nuevo sin manejarlo, esto no compila.
      const _exhaustive: never = notification;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Estado observable listo para pintar
// ---------------------------------------------------------------------------

/**
 * Fase del registro del Token_Push (Req 26.1, 26.5):
 *   - `idle`: aún no se intentó registrar.
 *   - `requesting`: solicitando permiso u obteniendo el token.
 *   - `registered`: permiso concedido y Token_Push registrado en el backend.
 *   - `denied`: el usuario no concedió el permiso; se opera sin registrar
 *     (Req 26.5).
 *   - `unavailable`: permiso concedido pero el SO no emitió Token_Push.
 *   - `error`: fallo al registrar el token en el backend.
 */
export type RegistroPushStatus =
  | 'idle'
  | 'requesting'
  | 'registered'
  | 'denied'
  | 'unavailable'
  | 'error';

/**
 * Estado observable que expone el presentador. La UI se enlaza vía
 * `getState`/`subscribe` sin conocer al bridge ni al cliente, y sin bloquearse.
 */
export interface PushRegistrationState {
  /** Fase del registro del Token_Push (Req 26.1, 26.5). */
  readonly registroStatus: RegistroPushStatus;
  /** Estado del permiso del SO tras la última solicitud, o `null` si no se pidió. */
  readonly permiso: EstadoPermisoPush | null;
  /**
   * Token_Push registrado, o `null` si no se registró (sin permiso, sin token o
   * error). Se conserva para diagnóstico/reenvío; no es sensible como un secreto.
   */
  readonly token: string | null;
  /** Mensaje de error legible cuando `registroStatus === 'error'`, o `null`. */
  readonly error: string | null;
  /**
   * Últimos recordatorios renderizados (Req 26.2, 26.3), del más reciente al más
   * antiguo, para que la UI in-app los liste además de mostrarlos por el sistema.
   */
  readonly recordatorios: readonly RenderedReminder[];
  /**
   * Conjunto de Recuadros cuyos recordatorios el usuario silenció localmente
   * (Req 26.4). Refleja la intención del usuario ya comunicada al backend; la
   * decisión final de no enviar la toma el Servicio_Notificaciones.
   */
  readonly recuadrosSilenciados: readonly string[];
}

/** Oyente del estado de push; recibe el estado actual completo. */
export type PushRegistrationStateListener = (
  state: PushRegistrationState,
) => void;

/** Estado inicial: nada registrado, sin permiso pedido, sin recordatorios. */
const INITIAL_STATE: PushRegistrationState = {
  registroStatus: 'idle',
  permiso: null,
  token: null,
  error: null,
  recordatorios: [],
  recuadrosSilenciados: [],
};

/** Cantidad máxima de recordatorios in-app que se conservan en el estado. */
const MAX_RECORDATORIOS = 20;

/** Mensaje por defecto ante un fallo al registrar el Token_Push (Req 26.1). */
export const REGISTRO_ERROR_DEFAULT =
  'No se pudo registrar el dispositivo para recibir notificaciones. Intenta de nuevo.';

/** Mensaje por defecto ante un fallo al silenciar un recordatorio (Req 26.4). */
export const SILENCIAR_ERROR_DEFAULT =
  'No se pudo silenciar el recordatorio. Intenta de nuevo.';

/** Extrae un mensaje legible de un error desconocido, con respaldo por defecto. */
function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return fallback;
}

/**
 * Configuración del presentador. Todo inyectable para pruebas y wiring.
 */
export interface PushRegistrationConfig {
  /** Puerto a las capacidades nativas de notificaciones (APNs/FCM). */
  readonly bridge: NativeNotificationBridge;
  /** Cliente del backend de notificaciones (registro / silenciar). */
  readonly client: PushRegistrationClient;
  /**
   * Plataforma de push del dispositivo, para el registro (Req 26.1). El wiring
   * la fija según el SO (`apns` en iOS, `fcm` en Android).
   */
  readonly platform: PushPlatform;
}

/**
 * Presentador del registro de notificaciones push y del renderizado de
 * recordatorios: fuente de verdad observable que enlaza la pantalla
 * `NotificacionesScreen`. Orquesta permiso → token → registro en backend
 * (Req 26.1), renderiza los recordatorios recibidos (Req 26.2, 26.3), comunica
 * el silenciado (Req 26.4) y expone el camino de operar sin permiso (Req 26.5).
 */
export class PushRegistrationPresenter {
  private state: PushRegistrationState = INITIAL_STATE;
  private readonly listeners = new Set<PushRegistrationStateListener>();
  private readonly bridge: NativeNotificationBridge;
  private readonly client: PushRegistrationClient;
  private readonly platform: PushPlatform;
  /** Marca de registro en curso: solo el resultado del último `register` aplica. */
  private registroToken = 0;

  constructor(config: PushRegistrationConfig) {
    this.bridge = config.bridge;
    this.client = config.client;
    this.platform = config.platform;
  }

  /** Estado actual listo para pintar (Req 26.1–26.5). */
  getState(): PushRegistrationState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: PushRegistrationStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Flujo completo de registro del Token_Push (Req 26.1, 26.5):
   *   1. transiciona a `requesting` y solicita el permiso de notificaciones al SO;
   *   2. si NO se concede, transiciona a `denied` y NO contacta al backend: la
   *      app sigue operando sin Token_Push (Req 26.5);
   *   3. si se concede, obtiene el Token_Push (APNs/FCM). Si el SO no lo emite,
   *      transiciona a `unavailable`;
   *   4. con token, lo registra en el backend (`POST /notificaciones/token`) y
   *      transiciona a `registered` (Req 26.1); ante fallo del backend, refleja
   *      el error en estado sin lanzar a la UI.
   *
   * Idempotente ante reintentos: solo el resultado del último `register` aplica.
   *
   * @returns una promesa que siempre resuelve (nunca rechaza), para que la UI
   *   pueda `await` sin envolver en try/catch.
   */
  async register(): Promise<void> {
    const token = ++this.registroToken;
    this.emit({
      ...this.state,
      registroStatus: 'requesting',
      error: null,
    });

    let permiso: EstadoPermisoPush;
    try {
      permiso = await this.bridge.requestPermission();
    } catch (err) {
      if (token !== this.registroToken) {
        return;
      }
      // Un fallo al solicitar el permiso no debe bloquear la app: se refleja
      // como error recuperable y se sigue operando (Req 26.5).
      this.emit({
        ...this.state,
        registroStatus: 'error',
        permiso: null,
        error: toErrorMessage(err, REGISTRO_ERROR_DEFAULT),
      });
      return;
    }

    if (token !== this.registroToken) {
      return;
    }

    // Sin permiso: operar sin registrar el Token_Push (Req 26.5). No se contacta
    // al backend; el estado lo refleja para que la UI siga usable.
    if (permiso !== 'concedido') {
      this.emit({
        ...this.state,
        registroStatus: 'denied',
        permiso,
        token: null,
        error: null,
      });
      return;
    }

    // Permiso concedido: obtener el Token_Push del SO (Req 26.1).
    let pushToken: string | null;
    try {
      pushToken = await this.bridge.getPushToken();
    } catch (err) {
      if (token !== this.registroToken) {
        return;
      }
      this.emit({
        ...this.state,
        registroStatus: 'error',
        permiso,
        error: toErrorMessage(err, REGISTRO_ERROR_DEFAULT),
      });
      return;
    }

    if (token !== this.registroToken) {
      return;
    }

    if (!pushToken) {
      // Permiso concedido pero el SO no emitió token: no hay nada que registrar.
      this.emit({
        ...this.state,
        registroStatus: 'unavailable',
        permiso,
        token: null,
        error: null,
      });
      return;
    }

    // Registrar el Token_Push en el Sistema (Req 26.1).
    try {
      await this.client.registerPushToken({
        token: pushToken,
        platform: this.platform,
      });
      if (token !== this.registroToken) {
        return;
      }
      this.emit({
        ...this.state,
        registroStatus: 'registered',
        permiso,
        token: pushToken,
        error: null,
      });
    } catch (err) {
      if (token !== this.registroToken) {
        return;
      }
      this.emit({
        ...this.state,
        registroStatus: 'error',
        permiso,
        token: null,
        error: toErrorMessage(err, REGISTRO_ERROR_DEFAULT),
      });
    }
  }

  /**
   * Recibe una notificación push entrante, deriva su contenido y la MUESTRA a
   * través del bridge nativo (Req 26.2, 26.3). Añade el recordatorio a la lista
   * in-app observable (acotada) para que la UI también lo liste. No lanza a la
   * UI aunque el bridge falle al presentar: el recordatorio ya quedó registrado
   * en el estado.
   *
   * @returns el `RenderedReminder` derivado y mostrado.
   */
  async handleIncomingNotification(
    notification: PushNotification,
  ): Promise<RenderedReminder> {
    const reminder = renderNotification(notification);

    // Registrar en el estado in-app (más reciente primero, acotado).
    this.emit({
      ...this.state,
      recordatorios: [reminder, ...this.state.recordatorios].slice(
        0,
        MAX_RECORDATORIOS,
      ),
    });

    try {
      await this.bridge.presentReminder(reminder);
    } catch {
      // La presentación nativa es best-effort: un fallo al mostrar el banner no
      // debe romper el flujo ni ocultar el recordatorio ya listado en la app.
    }

    return reminder;
  }

  /**
   * Silencia los recordatorios de un Recuadro y COMUNICA la solicitud al Sistema
   * (Req 26.4). Marca el Recuadro como silenciado en el estado (intención del
   * usuario) y llama al backend; si el backend rechaza, revierte la marca local
   * y refleja el error, sin lanzar a la UI.
   *
   * Idempotente: silenciar un Recuadro ya silenciado no lo duplica.
   *
   * @returns una promesa que siempre resuelve (nunca rechaza).
   */
  async silenciarRecuadro(recuadroId: string): Promise<void> {
    const yaSilenciado = this.state.recuadrosSilenciados.includes(recuadroId);

    // Marca optimista de la intención del usuario (Req 26.4).
    if (!yaSilenciado) {
      this.emit({
        ...this.state,
        recuadrosSilenciados: [...this.state.recuadrosSilenciados, recuadroId],
        error: null,
      });
    } else {
      this.emit({ ...this.state, error: null });
    }

    try {
      await this.client.muteRecuadroReminder(recuadroId);
    } catch (err) {
      // Revertir la marca optimista si el backend rechazó la solicitud, salvo que
      // ya estuviera silenciado antes de este intento.
      const revertidos = yaSilenciado
        ? this.state.recuadrosSilenciados
        : this.state.recuadrosSilenciados.filter((id) => id !== recuadroId);
      this.emit({
        ...this.state,
        recuadrosSilenciados: revertidos,
        error: toErrorMessage(err, SILENCIAR_ERROR_DEFAULT),
      });
    }
  }

  private emit(state: PushRegistrationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
