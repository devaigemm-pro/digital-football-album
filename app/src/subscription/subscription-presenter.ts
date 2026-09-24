// SubscriptionPresenter — núcleo framework-agnóstico de la pantalla de
// suscripción (compra y upgrade vía IAP) del cliente.
//
// Task 30.1 — Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
// (backend Req 3.1/3.2/3.3/3.4 — Servicio_Suscripción `GET /subscription`,
//  `POST /subscription/purchase`, `POST /subscription/upgrade`,
//  `GET /entitlements`).
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `SuscripcionScreen.tsx` enlaza. Orquesta:
//
//   - la carga del plan actual, su estado y el catálogo de planes disponibles
//     vía `SubscriptionClient.getSubscription()` (Req 25.1);
//   - la compra de un plan: primero ejecuta el flujo de compra dentro de la app
//     (App Store / Google Play) a través del puerto `IapPurchaser` para obtener
//     el comprobante, y luego lo envía al Sistema con
//     `SubscriptionClient.purchase(planId, receipt)` (Req 25.2);
//   - el upgrade a Plan_Premium: ejecuta el flujo de compra dentro de la app y
//     envía el comprobante con `SubscriptionClient.upgrade(receipt)` (Req 25.3);
//   - el reflejo de los Entitlements devueltos por el Sistema vía
//     `SubscriptionClient.getEntitlements()` (Req 25.4).
//
// PRINCIPIO CLAVE (Req 25.5): el cliente NUNCA recalcula los derechos del plan.
// El estado de suscripción y los Entitlements se reflejan EXACTAMENTE como los
// devuelve el Sistema; el presentador no deriva `holograma`/`digitalCards` a
// partir del plan ni de ningún otro dato local.
//
// TOLERANCIA A FALLOS (Req 25.6): si una compra o upgrade responde con un error
// del Sistema, el presentador expone el mensaje de error devuelto y conserva el
// estado de suscripción/catálogo mostrado previamente (no lo borra ni lo
// recalcula). Las operaciones nunca lanzan a la UI: siempre resuelven y
// reflejan el resultado como estado observable.

/**
 * Identificador de plan de suscripción tal como lo maneja el backend
 * (`PlanSuscripcion`). El cliente lo trata como opaco y no interpreta sus
 * valores para decidir derechos (Req 25.5).
 */
export type PlanId = 'BASICO' | 'PREMIUM';

/** Estado de la suscripción tal como lo devuelve el Sistema (`EstadoSuscripcion`). */
export type EstadoSuscripcion = 'ACTIVA' | 'EN_GRACIA' | 'VENCIDA';

/**
 * Comprobante de compra dentro de la app (App Store / Google Play). Es opaco
 * para el cliente: se obtiene del `IapPurchaser` y se reenvía al Sistema tal
 * cual para su validación (Req 25.2, 25.3).
 */
export type IapReceipt = string;

/**
 * Suscripción del usuario tal como la devuelve el Sistema (espeja la forma del
 * backend `Suscripcion`). El cliente la refleja sin recalcular nada (Req 25.5).
 */
export interface Suscripcion {
  readonly plan: PlanId;
  readonly estado: EstadoSuscripcion;
  /** Fecha ISO hasta la que el plan está vigente. */
  readonly vigenciaHasta: string;
}

/**
 * Entrada del catálogo de planes disponibles devuelta por el Sistema (espeja
 * `PlanCatalogoEntrada`). El cliente la presenta tal cual (Req 25.1).
 */
export interface PlanCatalogoEntrada {
  readonly plan: PlanId;
  readonly precioAnual: number;
  readonly moneda: string;
  readonly descripcion: string;
}

/**
 * Vista de la suscripción devuelta por `GET /subscription`: la suscripción
 * actual (o `null` si el usuario aún no tiene) y el catálogo de planes
 * disponibles (Req 25.1).
 */
export interface SubscriptionView {
  readonly suscripcion: Suscripcion | null;
  readonly catalogo: readonly PlanCatalogoEntrada[];
}

/**
 * Entitlements (derechos) devueltos por `GET /entitlements` (Req 25.4). El
 * cliente los refleja EXACTAMENTE como los decide el Sistema, sin derivarlos del
 * plan ni recalcularlos (Req 25.5).
 */
export interface Entitlements {
  readonly digitalCardsInternacional: boolean;
  readonly holograma: boolean;
}

/**
 * Contrato del cliente de suscripción del lado de la app. La UI/adaptadores lo
 * implementan (adaptador HTTP en producción, doble en memoria en pruebas) y se
 * inyecta en el presentador. Consume los endpoints del Servicio_Suscripción.
 */
export interface SubscriptionClient {
  /** `GET /subscription`: plan actual, estado y catálogo disponible (Req 25.1). */
  getSubscription(): Promise<SubscriptionView>;
  /**
   * `POST /subscription/purchase` con `{ planId, receipt }` (Req 25.2). Puede
   * rechazar con un error del Sistema; el presentador refleja el mensaje y
   * conserva el estado previo (Req 25.6).
   */
  purchase(planId: PlanId, receipt: IapReceipt): Promise<Suscripcion>;
  /**
   * `POST /subscription/upgrade` con `{ receipt }` (Req 25.3). Puede rechazar
   * con un error del Sistema; el presentador refleja el mensaje y conserva el
   * estado previo (Req 25.6).
   */
  upgrade(receipt: IapReceipt): Promise<Suscripcion>;
  /** `GET /entitlements`: derechos decididos por el Sistema (Req 25.4, 25.5). */
  getEntitlements(): Promise<Entitlements>;
}

/**
 * Puerto de compra dentro de la app (In-App Purchase). Ejecuta el flujo nativo
 * de App Store (StoreKit) o Google Play (BillingClient) para el plan indicado y
 * devuelve el comprobante resultante, que luego se envía al Sistema (Req 25.2,
 * 25.3).
 *
 * La implementación real es específica de la plataforma y queda FUERA de este
 * entorno; aquí se mantiene como interfaz inyectable para poder ejercitar el
 * presentador con un doble en pruebas y enlazar el adaptador nativo en
 * producción.
 */
export interface IapPurchaser {
  /**
   * Lanza el flujo de compra dentro de la app para `planId` y resuelve con el
   * comprobante de la tienda. Puede rechazar si el usuario cancela o la tienda
   * falla; el presentador refleja ese fallo como error sin lanzar a la UI.
   */
  buy(planId: PlanId): Promise<IapReceipt>;
}

/** Fase de una operación asíncrona del presentador (carga / compra / upgrade). */
export type SubscriptionStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Estado observable listo para pintar que expone el presentador. La UI se enlaza
 * a él vía `getState`/`subscribe` sin conocer los clientes ni bloquearse.
 *
 * `suscripcion`, `catalogo` y `entitlements` reflejan SIEMPRE lo último devuelto
 * por el Sistema; el presentador nunca los recalcula localmente (Req 25.5).
 */
export interface SubscriptionState {
  /** Fase de carga/operación actual. */
  readonly status: SubscriptionStatus;
  /** Suscripción actual reflejada del Sistema, o `null` si aún no hay (Req 25.1). */
  readonly suscripcion: Suscripcion | null;
  /** Catálogo de planes disponibles reflejado del Sistema (Req 25.1). */
  readonly catalogo: readonly PlanCatalogoEntrada[];
  /**
   * Entitlements reflejados del Sistema, o `null` si aún no se han consultado
   * (Req 25.4, 25.5). Nunca se derivan del plan en el cliente.
   */
  readonly entitlements: Entitlements | null;
  /**
   * `true` mientras una compra o upgrade está en curso (flujo IAP + envío del
   * comprobante), para que la UI pueda deshabilitar los botones sin perder el
   * estado mostrado (Req 25.6).
   */
  readonly operando: boolean;
  /**
   * Mensaje de error legible cuando la última operación falló, o `null` en otro
   * caso. Ante fallo de compra/upgrade se muestra este mensaje conservando el
   * estado previo (Req 25.6).
   */
  readonly error: string | null;
}

/** Oyente del estado de la suscripción; recibe el estado actual completo. */
export type SubscriptionStateListener = (state: SubscriptionState) => void;

/** Estado inicial: nada cargado aún. */
const INITIAL_STATE: SubscriptionState = {
  status: 'idle',
  suscripcion: null,
  catalogo: [],
  entitlements: null,
  operando: false,
  error: null,
};

/** Mensaje por defecto ante un fallo al cargar la suscripción (Req 25.1). */
export const SUBSCRIPTION_LOAD_ERROR_MESSAGE =
  'No se pudo cargar tu suscripción. Intenta de nuevo.';

/** Mensaje por defecto ante un fallo de compra/upgrade sin mensaje del Sistema (Req 25.6). */
export const SUBSCRIPTION_OP_ERROR_MESSAGE =
  'No se pudo completar la operación. Intenta de nuevo.';

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
 * Presentador de la pantalla de suscripción: fuente de verdad observable que la
 * pantalla `SuscripcionScreen` enlaza. Orquesta la carga, la compra y el upgrade
 * a través del `SubscriptionClient` y del `IapPurchaser` inyectados, y expone
 * `getState`/`subscribe` estables.
 *
 * Reglas invariantes:
 *   - NUNCA recalcula el estado del plan ni los Entitlements: los refleja tal
 *     como los devuelve el Sistema (Req 25.5).
 *   - Ante error de compra/upgrade conserva la suscripción/catálogo previos y
 *     solo expone el mensaje de error (Req 25.6).
 *   - Ninguna operación pública lanza a la UI: todas resuelven y reflejan el
 *     resultado como estado.
 */
export class SubscriptionPresenter {
  private state: SubscriptionState = INITIAL_STATE;
  private readonly listeners = new Set<SubscriptionStateListener>();
  /**
   * Marca de la carga en curso: solo la última `load` aplica su resultado, para
   * evitar carreras si el usuario recarga mientras una petición sigue en vuelo.
   */
  private loadToken = 0;

  /**
   * @param client Cliente de suscripción (endpoints del Servicio_Suscripción).
   * @param iap Puerto de compra dentro de la app (StoreKit / BillingClient).
   *   Ambos se inyectan para permitir dobles en pruebas y adaptadores reales en
   *   producción.
   */
  constructor(
    private readonly client: SubscriptionClient,
    private readonly iap: IapPurchaser,
  ) {}

  /** Estado actual listo para pintar (Req 25.1, 25.4, 25.5, 25.6). */
  getState(): SubscriptionState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: SubscriptionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Carga el plan actual, su estado y el catálogo disponible (Req 25.1) y, a
   * continuación, refleja los Entitlements decididos por el Sistema (Req 25.4).
   *
   *   1. transiciona a `loading` (conservando lo ya mostrado);
   *   2. al resolver, refleja `suscripcion`, `catalogo` y `entitlements` tal como
   *      los devuelve el Sistema (sin recalcular — Req 25.5) y pasa a `loaded`;
   *   3. si alguna petición rechaza, transiciona a `error` con un mensaje
   *      legible SIN lanzar a la UI.
   *
   * Es idempotente ante recargas: solo el resultado de la última invocación
   * aplica (protección contra carreras).
   *
   * @returns una promesa que siempre resuelve (nunca rechaza).
   */
  async load(): Promise<void> {
    const token = ++this.loadToken;
    this.emit({
      ...this.state,
      status: 'loading',
      error: null,
    });

    try {
      // Se refleja el estado y los derechos EXACTAMENTE como los decide el
      // Sistema; el cliente no deriva entitlements del plan (Req 25.5).
      const view = await this.client.getSubscription();
      const entitlements = await this.client.getEntitlements();
      if (token !== this.loadToken) {
        // Una carga más reciente la reemplazó: descartar este resultado.
        return;
      }
      this.emit({
        status: 'loaded',
        suscripcion: view.suscripcion,
        catalogo: view.catalogo,
        entitlements,
        operando: false,
        error: null,
      });
    } catch (err) {
      if (token !== this.loadToken) {
        return;
      }
      // Fallo no bloqueante: se refleja como estado, conservando lo mostrado.
      this.emit({
        ...this.state,
        status: 'error',
        operando: false,
        error: toErrorMessage(err, SUBSCRIPTION_LOAD_ERROR_MESSAGE),
      });
    }
  }

  /**
   * Compra un plan (Req 25.2): ejecuta el flujo de compra dentro de la app
   * (`IapPurchaser.buy(planId)`) para obtener el comprobante y luego lo envía al
   * Sistema con `SubscriptionClient.purchase(planId, receipt)`.
   *
   * Con éxito, refleja la suscripción devuelta por el Sistema y vuelve a
   * consultar los Entitlements para reflejarlos actualizados (Req 25.4, 25.5).
   * Si el flujo IAP o el backend fallan, expone el mensaje de error devuelto y
   * CONSERVA la suscripción/catálogo/entitlements mostrados previamente
   * (Req 25.6). Nunca lanza a la UI.
   */
  async purchase(planId: PlanId): Promise<void> {
    return this.ejecutarCompra(() => this.iap.buy(planId).then((receipt) =>
      this.client.purchase(planId, receipt),
    ));
  }

  /**
   * Actualiza (upgrade) la suscripción a Plan_Premium (Req 25.3): ejecuta el
   * flujo de compra dentro de la app para el plan Premium
   * (`IapPurchaser.buy('PREMIUM')`) y envía el comprobante al Sistema con
   * `SubscriptionClient.upgrade(receipt)`.
   *
   * Con éxito, refleja la suscripción devuelta y reconsulta los Entitlements
   * (Req 25.4, 25.5). Ante fallo, expone el mensaje y conserva el estado previo
   * (Req 25.6). Nunca lanza a la UI.
   */
  async upgrade(): Promise<void> {
    return this.ejecutarCompra(() => this.iap.buy('PREMIUM').then((receipt) =>
      this.client.upgrade(receipt),
    ));
  }

  /**
   * Camino común de compra/upgrade: marca `operando`, ejecuta la operación
   * (flujo IAP + envío del comprobante), y refleja el resultado. Ante éxito
   * actualiza la suscripción y reconsulta los Entitlements; ante fallo conserva
   * el estado previo y expone el mensaje (Req 25.6).
   */
  private async ejecutarCompra(
    run: () => Promise<Suscripcion>,
  ): Promise<void> {
    // Snapshot del estado previo para conservarlo ante fallo (Req 25.6).
    const previo = this.state;
    this.emit({
      ...previo,
      operando: true,
      error: null,
    });

    let suscripcion: Suscripcion;
    try {
      suscripcion = await run();
    } catch (err) {
      // Fallo de compra/upgrade: conservar el estado mostrado previamente y solo
      // exponer el mensaje de error devuelto por el Sistema (Req 25.6).
      this.emit({
        status: previo.status === 'idle' ? 'error' : previo.status,
        suscripcion: previo.suscripcion,
        catalogo: previo.catalogo,
        entitlements: previo.entitlements,
        operando: false,
        error: toErrorMessage(err, SUBSCRIPTION_OP_ERROR_MESSAGE),
      });
      return;
    }

    // Éxito: reflejar la nueva suscripción y reconsultar los Entitlements para
    // mostrarlos según el Sistema, sin recalcularlos localmente (Req 25.4, 25.5).
    let entitlements = previo.entitlements;
    try {
      entitlements = await this.client.getEntitlements();
    } catch {
      // Si la reconsulta de derechos falla, se conservan los previos (no se
      // recalculan a partir del plan — Req 25.5); la compra ya fue confirmada.
      entitlements = previo.entitlements;
    }

    this.emit({
      status: 'loaded',
      suscripcion,
      catalogo: previo.catalogo,
      entitlements,
      operando: false,
      error: null,
    });
  }

  private emit(state: SubscriptionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
