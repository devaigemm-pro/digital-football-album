// ShippingPresenter — núcleo framework-agnóstico de la pantalla de Envío/Pedido.
//
// Task 30.2 — Requirements: 8.1, 8.2, 8.3, 8.4
// (Requerimiento 15 del SRS — Servicio_Envío: `PUT /envio/direccion` registra y
//  valida la Dirección_Envío antes de la Fecha_Límite_Cierre; `GET /pedido/
//  {temporadaId}` devuelve estado del Pedido y tracking tras el despacho).
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `EnvioPedidoScreen.tsx` enlaza. Consume el Servicio_Envío a través de un
// `ShippingClient` inyectable (doble en memoria en pruebas, adaptador HTTP en
// producción) y expone un estado observable listo para pintar:
//
//   - el registro/validación de la Dirección_Envío (Req 8.1, 8.2): en éxito
//     confirma que quedó registrada; ante un error de validación de la dirección
//     o por Fecha_Límite_Cierre alcanzada, ESPEJA el mensaje que devuelve el
//     backend sin reimplementar ni re-derivar las reglas (Req 8.3);
//   - el estado del Pedido y su información de seguimiento (Req 8.4): el
//     `tracking` solo se expone cuando el kit ya fue despachado (`despachado`);
//     mientras no lo esté, queda oculto (null).
//
// El CLIENTE refleja la validación y los errores del backend; NO valida la
// dirección ni compara contra la Fecha_Límite_Cierre por su cuenta. Toda la
// lógica sensible a la corrección de ESTA capa (transiciones de estado, espejo
// de errores, ocultamiento del tracking) vive aquí y es unit-testable; el `.tsx`
// de la pantalla es una envoltura delgada.

// ---------------------------------------------------------------------------
// Contrato del cliente (Servicio_Envío) y formas de datos que espeja el backend
// ---------------------------------------------------------------------------

/**
 * Campos de la Dirección_Envío que captura el formulario y envía el cliente al
 * backend con `PUT /envio/direccion` (Req 8.1). La forma exacta la define el
 * Servicio_Envío; el cliente los reenvía tal cual sin validarlos localmente.
 */
export interface DireccionEnvioCampos {
  readonly nombreDestinatario: string;
  readonly linea1: string;
  readonly linea2?: string;
  readonly ciudad: string;
  readonly region: string;
  readonly codigoPostal: string;
  readonly pais: string;
  readonly telefono?: string;
}

/**
 * Resultado exitoso de `PUT /envio/direccion` tal como lo devuelve el backend:
 * la Dirección_Envío quedó registrada/validada (Req 8.1, 8.2). Puede traer un
 * mensaje de confirmación legible provisto por el backend.
 */
export interface RegistroDireccionOk {
  readonly registrada: true;
  /** Mensaje de confirmación del backend, si lo provee (Req 8.2). */
  readonly mensaje?: string;
}

/**
 * Estado del Pedido tal como lo devuelve `GET /pedido/{temporadaId}` (Req 8.4).
 * El backend indica el `estado`, si el kit fue `despachado` y el `tracking`
 * (presente solo cuando fue despachado / estado `ENVIADA`; en otro caso `null`).
 */
export interface PedidoData {
  /** Estado del Pedido según el backend (p. ej. `ENVIADA`, `LISTA`, ...). */
  readonly estado: string;
  /** El kit ya fue despachado (Req 8.4). Gobierna la visibilidad del tracking. */
  readonly despachado: boolean;
  /**
   * Información de seguimiento del envío; el backend la entrega SOLO tras el
   * despacho. `null` cuando aún no se ha despachado (Req 8.4).
   */
  readonly tracking: string | null;
}

/**
 * Error de negocio devuelto por el Servicio_Envío en `PUT /envio/direccion`:
 * dirección inválida (`DireccionInvalida`) o Fecha_Límite_Cierre alcanzada
 * (`FechaLimiteCierreAlcanzada`). El cliente lo rechaza con esta forma y el
 * presentador ESPEJA su `message` sin re-derivar la regla (Req 8.3).
 */
export type ShippingErrorCode =
  | 'DireccionInvalida'
  | 'FechaLimiteCierreAlcanzada';

/**
 * Error tipado que el `ShippingClient` puede lanzar/rechazar para señalar un
 * fallo de negocio del backend. `code` distingue la causa; `message` es el texto
 * legible del backend que el presentador refleja tal cual (Req 8.3).
 */
export class ShippingError extends Error {
  readonly code: ShippingErrorCode;
  constructor(code: ShippingErrorCode, message: string) {
    super(message);
    this.name = 'ShippingError';
    this.code = code;
    // Mantiene la cadena de prototipos correcta al transpilar a ES5/ESNext.
    Object.setPrototypeOf(this, ShippingError.prototype);
  }
}

/**
 * Contrato del cliente de envío del lado de la app. La UI/adaptadores lo
 * implementan (adaptador HTTP en producción, doble en memoria en pruebas) y se
 * inyecta en el presentador. Es el ÚNICO punto que contacta al Servicio_Envío;
 * el presentador nunca reimplementa sus reglas.
 */
export interface ShippingClient {
  /**
   * `PUT /envio/direccion` — registra/valida la Dirección_Envío (Req 8.1, 8.2).
   * En éxito resuelve con `RegistroDireccionOk`. Ante dirección inválida o
   * Fecha_Límite_Cierre alcanzada, RECHAZA (idealmente con `ShippingError`)
   * llevando el mensaje del backend, que el presentador refleja (Req 8.3).
   */
  registerAddress(campos: DireccionEnvioCampos): Promise<RegistroDireccionOk>;

  /**
   * `GET /pedido/{temporadaId}` — estado del Pedido y tracking (Req 8.4).
   * Puede rechazar ante fallos de red/backend; el presentador lo refleja como
   * estado `error` sin propagar la excepción a la UI.
   */
  getOrder(temporadaId: string): Promise<PedidoData>;
}

// ---------------------------------------------------------------------------
// Estado observable listo para pintar
// ---------------------------------------------------------------------------

/** Fase del registro de la Dirección_Envío (Req 8.1, 8.2, 8.3). */
export type RegistroStatus = 'idle' | 'submitting' | 'registered' | 'error';

/** Fase de la carga del estado del Pedido (Req 8.4). */
export type PedidoStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Estado observable que expone el presentador. La UI se enlaza vía
 * `getState`/`subscribe` sin conocer al cliente ni bloquearse. Reúne las dos
 * preocupaciones de la pantalla: registro de dirección y estado del Pedido.
 */
export interface ShippingState {
  // --- Registro de la Dirección_Envío (Req 8.1, 8.2, 8.3) ---
  /** Fase del registro de la dirección. */
  readonly registroStatus: RegistroStatus;
  /**
   * Mensaje de confirmación del backend cuando la dirección quedó registrada
   * (Req 8.2), o `null`. La UI lo muestra como confirmación.
   */
  readonly registroConfirmacion: string | null;
  /**
   * Mensaje de error ESPEJADO del backend cuando el registro falló por dirección
   * inválida o Fecha_Límite_Cierre alcanzada (Req 8.3), o `null`. NO se re-deriva
   * localmente: es el texto tal cual del backend.
   */
  readonly registroError: string | null;
  /**
   * Código del error de negocio del último registro fallido (Req 8.3), o `null`.
   * Permite a la UI matizar el mensaje (dirección vs. cierre) sin re-derivar la
   * regla; el texto mostrado sigue siendo el del backend.
   */
  readonly registroErrorCode: ShippingErrorCode | null;

  // --- Estado del Pedido y tracking (Req 8.4) ---
  /** Fase de la carga del Pedido. */
  readonly pedidoStatus: PedidoStatus;
  /** Estado del Pedido según el backend, o `null` si aún no se cargó (Req 8.4). */
  readonly pedidoEstado: string | null;
  /** El kit ya fue despachado (Req 8.4). */
  readonly despachado: boolean;
  /**
   * Información de seguimiento a mostrar: presente SOLO cuando el kit fue
   * despachado; `null` en otro caso (oculto — Req 8.4).
   */
  readonly tracking: string | null;
  /** Mensaje de error legible cuando `pedidoStatus === 'error'`, o `null`. */
  readonly pedidoError: string | null;
}

/** Oyente del estado del envío; recibe el estado actual completo. */
export type ShippingStateListener = (state: ShippingState) => void;

/** Estado inicial: nada registrado ni cargado, sin bloquear la UI. */
const INITIAL_STATE: ShippingState = {
  registroStatus: 'idle',
  registroConfirmacion: null,
  registroError: null,
  registroErrorCode: null,
  pedidoStatus: 'idle',
  pedidoEstado: null,
  despachado: false,
  tracking: null,
  pedidoError: null,
};

/** Confirmación por defecto cuando el backend no aporta un mensaje (Req 8.2). */
export const REGISTRO_CONFIRMACION_DEFAULT =
  'Dirección de envío registrada correctamente.';

/** Mensaje por defecto ante un fallo genérico al registrar la dirección. */
export const REGISTRO_ERROR_DEFAULT =
  'No se pudo registrar la dirección de envío. Intenta de nuevo.';

/** Mensaje por defecto ante un fallo al cargar el estado del Pedido (Req 8.4). */
export const PEDIDO_ERROR_DEFAULT =
  'No se pudo cargar el estado del pedido. Intenta de nuevo.';

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
 * Extrae el código de error de negocio si el rechazo es un `ShippingError`.
 * Devuelve `null` para cualquier otro error (red genérica, etc.).
 */
function toErrorCode(err: unknown): ShippingErrorCode | null {
  if (err instanceof ShippingError) {
    return err.code;
  }
  return null;
}

/**
 * Presentador de Envío/Pedido: fuente de verdad observable que enlaza la pantalla
 * `EnvioPedidoScreen`. Orquesta el registro de la Dirección_Envío y la carga del
 * estado del Pedido a través del `ShippingClient` inyectado, y expone
 * `getState`/`subscribe` estables más `registerAddress`/`getOrder`.
 */
export class ShippingPresenter {
  private state: ShippingState = INITIAL_STATE;
  private readonly listeners = new Set<ShippingStateListener>();
  /** Marca de registro en curso: solo el último `registerAddress` aplica. */
  private registroToken = 0;
  /** Marca de carga de Pedido en curso: solo el último `getOrder` aplica. */
  private pedidoToken = 0;

  /**
   * @param client Cliente del Servicio_Envío (`PUT /envio/direccion`,
   *   `GET /pedido/{temporadaId}`). Se inyecta para permitir un doble en pruebas
   *   y un adaptador HTTP en producción.
   */
  constructor(private readonly client: ShippingClient) {}

  /** Estado actual listo para pintar (Req 8.1, 8.2, 8.3, 8.4). */
  getState(): ShippingState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: ShippingStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Registra/valida la Dirección_Envío vía `PUT /envio/direccion` (Req 8.1, 8.2):
   *   1. transiciona a `submitting`;
   *   2. en éxito, confirma que quedó registrada con el mensaje del backend (o
   *      uno por defecto) y transiciona a `registered` (Req 8.1, 8.2);
   *   3. ante dirección inválida o Fecha_Límite_Cierre alcanzada, ESPEJA el
   *      mensaje del backend (Req 8.3) y transiciona a `error` SIN re-derivar la
   *      regla ni lanzar a la UI.
   *
   * Idempotente ante reenvíos: solo el resultado del último aplica.
   *
   * @returns una promesa que siempre resuelve (nunca rechaza), para que la UI
   *   pueda `await` sin envolver en try/catch.
   */
  async registerAddress(campos: DireccionEnvioCampos): Promise<void> {
    const token = ++this.registroToken;
    this.emit({
      ...this.state,
      registroStatus: 'submitting',
      registroConfirmacion: null,
      registroError: null,
      registroErrorCode: null,
    });

    try {
      const ok = await this.client.registerAddress(campos);
      if (token !== this.registroToken) {
        return;
      }
      this.emit({
        ...this.state,
        registroStatus: 'registered',
        registroConfirmacion:
          ok.mensaje && ok.mensaje.trim().length > 0
            ? ok.mensaje
            : REGISTRO_CONFIRMACION_DEFAULT,
        registroError: null,
        registroErrorCode: null,
      });
    } catch (err) {
      if (token !== this.registroToken) {
        return;
      }
      // Espeja el error del backend (validación / cierre) sin re-derivarlo (Req 8.3).
      this.emit({
        ...this.state,
        registroStatus: 'error',
        registroConfirmacion: null,
        registroError: toErrorMessage(err, REGISTRO_ERROR_DEFAULT),
        registroErrorCode: toErrorCode(err),
      });
    }
  }

  /**
   * Carga el estado del Pedido vía `GET /pedido/{temporadaId}` (Req 8.4):
   *   1. transiciona a `loading` (conservando lo ya mostrado);
   *   2. en éxito, expone `estado` y — SOLO si `despachado` — el `tracking`;
   *      mientras no esté despachado, el tracking queda oculto (`null`);
   *   3. si el cliente rechaza, transiciona a `error` con un mensaje legible SIN
   *      lanzar a la UI.
   *
   * Idempotente ante recargas: solo el resultado de la última invocación aplica.
   *
   * @returns una promesa que siempre resuelve (nunca rechaza).
   */
  async getOrder(temporadaId: string): Promise<void> {
    const token = ++this.pedidoToken;
    this.emit({
      ...this.state,
      pedidoStatus: 'loading',
      pedidoError: null,
    });

    try {
      const data = await this.client.getOrder(temporadaId);
      if (token !== this.pedidoToken) {
        return;
      }
      // El tracking se muestra únicamente cuando el kit fue despachado (Req 8.4).
      // Refleja al backend: no se re-deriva la visibilidad a partir del estado.
      const tracking = data.despachado ? data.tracking : null;
      this.emit({
        ...this.state,
        pedidoStatus: 'loaded',
        pedidoEstado: data.estado,
        despachado: data.despachado,
        tracking,
        pedidoError: null,
      });
    } catch (err) {
      if (token !== this.pedidoToken) {
        return;
      }
      this.emit({
        ...this.state,
        pedidoStatus: 'error',
        pedidoError: toErrorMessage(err, PEDIDO_ERROR_DEFAULT),
      });
    }
  }

  private emit(state: ShippingState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
