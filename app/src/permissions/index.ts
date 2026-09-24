// Flujo de permisos del dispositivo en el cliente (GDPR/CCPA) — Task 28.3.
//
// Requirements (cliente · Requerimiento 24):
//   24.1 Al solicitar un permiso, explicar al usuario el motivo del acceso
//        conforme a GDPR/CCPA.
//   24.2 Si se intenta capturar/cargar una foto sin permiso de cámara o
//        almacenamiento, solicitar el permiso correspondiente antes de continuar.
//   24.3 Si se solicita verificación por geolocalización sin permiso de
//        ubicación, solicitar el permiso de geolocalización antes de continuar.
//   24.4 Al revocar un permiso previamente otorgado, dejar de usar el recurso
//        asociado.
//
// REUTILIZACIÓN: el modelo de permisos (Permiso / EstadoPermiso / PermissionStore
// / PermissionManager con requestPermission·useResource·revokePermission) ya
// existe como TypeScript PURO y agnóstico del framework en el backend
// (`src/services/security/permissions.ts`, Task 20.1). No lo reimplementamos:
// lo RE-EXPORTAMOS aquí y lo ENVOLVEMOS en un `PermissionGate` que añade la
// explicación del motivo (Req 24.1) y el patrón "solicitar-antes-de-usar"
// (Req 24.2, 24.3) que la capa de captura consume.
//
// La ruta `../../../src/services/security/permissions` resuelve, desde
// `app/src/permissions/`, al módulo puro en la raíz del repositorio:
//   app/src/permissions/index.ts
//   app/src/            -> ..
//   app/                -> ../..
//   <raíz repo>         -> ../../..
//   <raíz repo>/src/services/security/permissions -> ../../../src/services/security/permissions
// La resolución sin extensión funciona con `moduleResolution: "bundler"` del
// tsconfig del cliente (igual que el re-export de view-models). El módulo es
// TypeScript puro (no importa APIs nativas ni Node), por lo que es seguro
// reutilizarlo directamente.

import {
  EstadoPermiso,
  InMemoryPermissionStore,
  Permiso,
  PermisoNoConcedidoError,
  PermissionManager,
} from '../../../src/services/security/permissions';
import type {
  PermissionPrompt,
  PermissionStore,
} from '../../../src/services/security/permissions';

// Re-export del modelo puro reutilizado, para que el resto del cliente lo
// consuma desde `app/src/permissions` sin conocer su ubicación en el backend.
export {
  EstadoPermiso,
  InMemoryPermissionStore,
  Permiso,
  PermisoNoConcedidoError,
  PermissionManager,
};
export type { PermissionPrompt, PermissionStore };

/**
 * Motivos de acceso mostrados al usuario al solicitar cada permiso (Req 24.1).
 * Explican, conforme a GDPR/CCPA, por qué la App_Móvil necesita el recurso.
 * Son los textos por defecto; pueden sobreescribirse al construir el gate para
 * localización o mensajería específica de pantalla.
 */
export const MOTIVOS_PERMISO: Readonly<Record<Permiso, string>> = {
  [Permiso.CAMARA]:
    'Se usa la cámara para tomar fotos del partido y montarlas en tu álbum.',
  [Permiso.ALMACENAMIENTO]:
    'Se accede a tu galería para cargar fotos del partido en tu álbum.',
  [Permiso.GEOLOCALIZACION]:
    'Se usa tu ubicación solo para verificar tu asistencia En Vivo al partido.',
};

/**
 * Función que muestra al usuario la explicación del motivo antes del prompt del
 * sistema (Req 24.1). La app real presentaría un diálogo previo (pre-prompt);
 * en pruebas se inyecta un espía. Puede ser asíncrona.
 */
export type MotivoExplainer = (
  permiso: Permiso,
  motivo: string,
) => void | Promise<void>;

/** Resultado de asegurar un permiso antes de usar un recurso (Req 24.2, 24.3). */
export interface EnsureResult {
  /** Estado final del permiso tras la solicitud. */
  readonly estado: EstadoPermiso;
  /** `true` si el permiso quedó concedido y el recurso puede usarse. */
  readonly concedido: boolean;
  /** `true` si se mostró la explicación del motivo y se pidió al sistema. */
  readonly solicitado: boolean;
}

/**
 * Puerta de permisos del cliente. Envuelve el `PermissionManager` puro
 * reutilizado del backend y añade el comportamiento propio del cliente
 * (Req 24):
 *
 *   - `ensure(permiso)`: patrón "solicitar-antes-de-usar" (Req 24.2, 24.3). Si
 *     el permiso ya está CONCEDIDO, no molesta al usuario. Si NO está concedido,
 *     PRIMERO explica el motivo (Req 24.1) y LUEGO invoca el prompt del sistema;
 *     devuelve si quedó concedido.
 *   - `runWithPermission(permiso, accion)`: asegura el permiso y solo entonces
 *     ejecuta la acción sobre el recurso; si no se concede, lanza
 *     `PermisoNoConcedidoError` (la operación dependiente se cancela).
 *   - `revoke(permiso)`: revoca el permiso; un `runWithPermission` posterior
 *     sobre ese recurso deja de ejecutarse (Req 24.4).
 *
 * Es inyectable/testeable: recibe un `PermissionStore` y un `PermissionPrompt`
 * (el prompt del sistema) y, opcionalmente, un `MotivoExplainer` (pre-prompt) y
 * un mapa de motivos.
 */
export class PermissionGate {
  private readonly manager: PermissionManager;

  constructor(
    store: PermissionStore,
    prompt: PermissionPrompt,
    private readonly options: {
      readonly explainer?: MotivoExplainer;
      readonly motivos?: Readonly<Record<Permiso, string>>;
    } = {},
  ) {
    this.manager = new PermissionManager(store, prompt);
  }

  /** Motivo mostrado al usuario para un permiso (Req 24.1). */
  motivoDe(permiso: Permiso): string {
    return (this.options.motivos ?? MOTIVOS_PERMISO)[permiso];
  }

  /** Estado actual del permiso. */
  getEstado(permiso: Permiso): EstadoPermiso {
    return this.manager.getEstado(permiso);
  }

  /** Indica si el permiso está concedido ahora mismo. */
  isConcedido(permiso: Permiso): boolean {
    return this.manager.isConcedido(permiso);
  }

  /**
   * Asegura un permiso ANTES de usar el recurso (Req 24.2, 24.3):
   *   - Si ya está CONCEDIDO, devuelve concedido sin re-solicitar.
   *   - Si NO está concedido, explica el motivo (Req 24.1) y solicita el permiso
   *     al sistema; persiste y devuelve el estado resultante.
   */
  async ensure(permiso: Permiso): Promise<EnsureResult> {
    if (this.manager.isConcedido(permiso)) {
      return { estado: EstadoPermiso.CONCEDIDO, concedido: true, solicitado: false };
    }
    // Req 24.1: explicar el motivo del acceso antes del prompt del sistema.
    if (this.options.explainer) {
      await this.options.explainer(permiso, this.motivoDe(permiso));
    }
    const estado = await this.manager.requestPermission(permiso);
    return {
      estado,
      concedido: estado === EstadoPermiso.CONCEDIDO,
      solicitado: true,
    };
  }

  /**
   * Asegura el permiso y ejecuta la acción sobre el recurso solo si queda
   * concedido (Req 24.2, 24.3). Si no se concede, lanza
   * `PermisoNoConcedidoError` sin ejecutar la acción (la operación se cancela).
   * Tras `revoke`, este método vuelve a solicitar y, si sigue denegado, no
   * ejecuta la acción (Req 24.4).
   */
  async runWithPermission<T>(
    permiso: Permiso,
    accion: () => T | Promise<T>,
  ): Promise<T> {
    const { concedido } = await this.ensure(permiso);
    if (!concedido) {
      throw new PermisoNoConcedidoError(permiso);
    }
    // `useResource` re-verifica el estado en el store (defensa ante revocación
    // concurrente) y solo entonces ejecuta la acción (Req 24.4).
    return this.manager.useResource(permiso, accion);
  }

  /**
   * Revoca un permiso previamente otorgado (Req 24.4). Un `runWithPermission`
   * posterior volverá a solicitarlo y, si el usuario no lo reconcede, no usará
   * el recurso.
   */
  revoke(permiso: Permiso): void {
    this.manager.revokePermission(permiso);
  }
}
