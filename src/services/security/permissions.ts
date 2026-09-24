// Solicitud y revocación de permisos del dispositivo (Req 5.8, 6.3, 20.3, 20.4).
//
// Diseño (design.md · "Permisos del dispositivo"): la App_Móvil solicita el
// permiso antes de usar cámara/almacenamiento/geolocalización (Req 5.8, 6.3,
// 20.3); si el permiso está denegado la operación se cancela y las funciones
// dependientes quedan deshabilitadas; al revocarse un permiso se cesa de
// inmediato el uso del recurso asociado (Req 20.4).
//
// Este módulo modela ese flujo de forma **agnóstica del framework** (no depende
// de las APIs nativas de iOS/Android): las transiciones de estado se gestionan
// sobre un `PermissionStore` inyectable en memoria, de modo que la lógica sea
// pura y testeable sin un dispositivo. Una app real implementaría un
// `PermissionStore` que consulte/pida los permisos del sistema operativo, pero
// las reglas de negocio (solicitar antes de usar; no usar el recurso sin
// concesión; cesar el uso al revocar) viven aquí.
//
// Task 20.1 — Requirements: 5.8, 6.3, 20.3, 20.4

/**
 * Permisos del dispositivo que la App_Móvil puede requerir (Req 20.3): cámara y
 * almacenamiento (captura/carga de fotos, Req 5.8) y geolocalización
 * (verificación de asistencia En Vivo, Req 6.3).
 */
export enum Permiso {
  CAMARA = 'CAMARA',
  ALMACENAMIENTO = 'ALMACENAMIENTO',
  GEOLOCALIZACION = 'GEOLOCALIZACION',
}

/**
 * Estado de un permiso:
 * - `NO_SOLICITADO`: aún no se ha pedido al usuario (estado inicial).
 * - `CONCEDIDO`: el usuario otorgó el permiso; el recurso puede usarse.
 * - `DENEGADO`: el usuario denegó o revocó el permiso; el recurso NO puede
 *   usarse (Req 20.4).
 */
export enum EstadoPermiso {
  NO_SOLICITADO = 'NO_SOLICITADO',
  CONCEDIDO = 'CONCEDIDO',
  DENEGADO = 'DENEGADO',
}

/**
 * Almacén de estados de permisos inyectable. Permite sustituir la fuente de
 * verdad (memoria en pruebas, APIs nativas en producción) sin cambiar la lógica
 * del `PermissionManager`.
 */
export interface PermissionStore {
  /** Devuelve el estado actual del permiso. */
  get(permiso: Permiso): EstadoPermiso;
  /** Fija el estado del permiso. */
  set(permiso: Permiso, estado: EstadoPermiso): void;
}

/**
 * Implementación en memoria del `PermissionStore`. Todos los permisos comienzan
 * en `NO_SOLICITADO`. Es pura y determinista: ideal para pruebas sin dispositivo.
 */
export class InMemoryPermissionStore implements PermissionStore {
  private readonly estados = new Map<Permiso, EstadoPermiso>();

  constructor(iniciales: Partial<Record<Permiso, EstadoPermiso>> = {}) {
    for (const permiso of Object.values(Permiso)) {
      this.estados.set(permiso, iniciales[permiso] ?? EstadoPermiso.NO_SOLICITADO);
    }
  }

  get(permiso: Permiso): EstadoPermiso {
    return this.estados.get(permiso) ?? EstadoPermiso.NO_SOLICITADO;
  }

  set(permiso: Permiso, estado: EstadoPermiso): void {
    this.estados.set(permiso, estado);
  }
}

/**
 * Función que resuelve una solicitud de permiso ante el usuario/sistema,
 * devolviendo si el usuario lo concede. Modela el prompt nativo del sistema
 * operativo; en pruebas se inyecta un resolutor determinista. Puede ser
 * asíncrona (el prompt del SO es asíncrono).
 */
export type PermissionPrompt = (permiso: Permiso) => boolean | Promise<boolean>;

/**
 * Error lanzado al intentar usar un recurso cuyo permiso no está concedido
 * (Req 5.8, 6.3, 20.4). Modela que la operación dependiente se cancela.
 */
export class PermisoNoConcedidoError extends Error {
  constructor(public readonly permiso: Permiso) {
    super(
      `El uso del recurso requiere el permiso ${permiso}, que no está ` +
        `concedido. La operación se cancela (Req 5.8, 6.3, 20.4).`,
    );
    this.name = 'PermisoNoConcedidoError';
  }
}

/**
 * Gestor de permisos agnóstico del framework. Aplica las reglas GDPR/CCPA del
 * diseño sobre un `PermissionStore` inyectable:
 *   - `requestPermission`: solicita el permiso al usuario ANTES de usar el
 *     recurso (Req 5.8, 6.3, 20.3) y persiste el estado resultante.
 *   - `useResource`: solo procede si el permiso está `CONCEDIDO`; en otro caso
 *     falla/cancela la operación (Req 5.8, 6.3).
 *   - `revokePermission`: transiciona el permiso a `DENEGADO`, de modo que un
 *     `useResource` posterior deje de usar el recurso (Req 20.4).
 */
export class PermissionManager {
  constructor(
    private readonly store: PermissionStore,
    private readonly prompt: PermissionPrompt,
  ) {}

  /** Devuelve el estado actual de un permiso. */
  getEstado(permiso: Permiso): EstadoPermiso {
    return this.store.get(permiso);
  }

  /** Indica si un permiso está concedido en este momento. */
  isConcedido(permiso: Permiso): boolean {
    return this.store.get(permiso) === EstadoPermiso.CONCEDIDO;
  }

  /**
   * Solicita un permiso al usuario conforme a GDPR/CCPA (Req 20.3). Debe
   * invocarse antes de usar el recurso asociado (Req 5.8, 6.3).
   *
   * Si el permiso ya está `CONCEDIDO`, no vuelve a pedirlo y devuelve el estado
   * actual (evita prompts redundantes). En otro caso invoca el prompt del
   * sistema y persiste `CONCEDIDO`/`DENEGADO` según la respuesta del usuario.
   *
   * @returns El estado del permiso tras la solicitud.
   */
  async requestPermission(permiso: Permiso): Promise<EstadoPermiso> {
    if (this.store.get(permiso) === EstadoPermiso.CONCEDIDO) {
      return EstadoPermiso.CONCEDIDO;
    }
    const concedido = await this.prompt(permiso);
    const estado = concedido ? EstadoPermiso.CONCEDIDO : EstadoPermiso.DENEGADO;
    this.store.set(permiso, estado);
    return estado;
  }

  /**
   * Usa el recurso asociado a un permiso. Solo procede si el permiso está
   * `CONCEDIDO`; si está `NO_SOLICITADO` o `DENEGADO` (incluye revocado), lanza
   * `PermisoNoConcedidoError` y no usa el recurso (Req 5.8, 6.3, 20.4).
   *
   * Devuelve el resultado de la acción `usar` solo cuando el uso está permitido.
   */
  useResource<T>(permiso: Permiso, usar: () => T): T {
    if (this.store.get(permiso) !== EstadoPermiso.CONCEDIDO) {
      throw new PermisoNoConcedidoError(permiso);
    }
    return usar();
  }

  /**
   * Revoca un permiso previamente otorgado transicionándolo a `DENEGADO`. Tras
   * la revocación, un `useResource` posterior sobre ese permiso falla, cesando
   * el uso del recurso asociado (Req 20.4).
   */
  revokePermission(permiso: Permiso): void {
    this.store.set(permiso, EstadoPermiso.DENEGADO);
  }
}
