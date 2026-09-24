// Pruebas unitarias del SubscriptionPresenter (Task 30.1 — Requirements: 25.1,
// 25.2, 25.3, 25.4, 25.5, 25.6).
//
// TypeScript puro con un `SubscriptionClient` y un `IapPurchaser` dobles en
// memoria: NO requieren React Native ni red/tienda real. Cubren:
//   - `getSubscription` puebla plan/estado + catálogo (Req 25.1);
//   - `purchase` ejecuta primero el flujo IAP y luego envía el comprobante
//     obtenido al Sistema (Req 25.2);
//   - `upgrade` ejecuta el flujo IAP para Premium y envía el comprobante (Req 25.3);
//   - los Entitlements se reflejan TAL CUAL los devuelve el Sistema, sin
//     recalcularlos a partir del plan (Req 25.4, 25.5);
//   - un error del Sistema en la compra expone el mensaje devuelto y CONSERVA el
//     estado de suscripción mostrado previamente (Req 25.6).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import {
  SUBSCRIPTION_OP_ERROR_MESSAGE,
  SubscriptionPresenter,
  type Entitlements,
  type IapPurchaser,
  type IapReceipt,
  type PlanId,
  type SubscriptionClient,
  type SubscriptionState,
  type SubscriptionView,
  type Suscripcion,
} from './subscription-presenter';

// --- Datos de referencia --------------------------------------------------

const CATALOGO = [
  {
    plan: 'BASICO' as PlanId,
    precioAnual: 39.99,
    moneda: 'USD',
    descripcion: 'Plan Básico anual',
  },
  {
    plan: 'PREMIUM' as PlanId,
    precioAnual: 79.99,
    moneda: 'USD',
    descripcion: 'Plan Premium anual',
  },
];

const SUSCRIPCION_BASICA: Suscripcion = {
  plan: 'BASICO',
  estado: 'ACTIVA',
  vigenciaHasta: '2025-01-01',
};

const SUSCRIPCION_PREMIUM: Suscripcion = {
  plan: 'PREMIUM',
  estado: 'ACTIVA',
  vigenciaHasta: '2025-06-01',
};

const ENTITLEMENTS_BASICO: Entitlements = {
  digitalCardsInternacional: false,
  holograma: false,
};

const ENTITLEMENTS_PREMIUM: Entitlements = {
  digitalCardsInternacional: true,
  holograma: true,
};

// --- Dobles en memoria ----------------------------------------------------

/**
 * Cliente de suscripción doble, totalmente configurable. Registra las llamadas
 * para poder aseverar el orden y los argumentos (Req 25.2, 25.3).
 */
class FakeSubscriptionClient implements SubscriptionClient {
  view: SubscriptionView;
  entitlements: Entitlements;
  purchaseResult: Suscripcion;
  upgradeResult: Suscripcion;

  /** Si se define, `purchase`/`upgrade` rechazan con este error (Req 25.6). */
  purchaseError: unknown = null;
  upgradeError: unknown = null;
  getSubscriptionError: unknown = null;

  readonly calls: string[] = [];
  purchaseArgs: { planId: PlanId; receipt: IapReceipt } | null = null;
  upgradeArgs: { receipt: IapReceipt } | null = null;

  constructor(init?: Partial<{
    view: SubscriptionView;
    entitlements: Entitlements;
    purchaseResult: Suscripcion;
    upgradeResult: Suscripcion;
  }>) {
    this.view = init?.view ?? { suscripcion: null, catalogo: CATALOGO };
    this.entitlements = init?.entitlements ?? ENTITLEMENTS_BASICO;
    this.purchaseResult = init?.purchaseResult ?? SUSCRIPCION_BASICA;
    this.upgradeResult = init?.upgradeResult ?? SUSCRIPCION_PREMIUM;
  }

  getSubscription(): Promise<SubscriptionView> {
    this.calls.push('getSubscription');
    if (this.getSubscriptionError !== null) {
      return Promise.reject(this.getSubscriptionError);
    }
    return Promise.resolve(this.view);
  }

  purchase(planId: PlanId, receipt: IapReceipt): Promise<Suscripcion> {
    this.calls.push('purchase');
    this.purchaseArgs = { planId, receipt };
    if (this.purchaseError !== null) {
      return Promise.reject(this.purchaseError);
    }
    return Promise.resolve(this.purchaseResult);
  }

  upgrade(receipt: IapReceipt): Promise<Suscripcion> {
    this.calls.push('upgrade');
    this.upgradeArgs = { receipt };
    if (this.upgradeError !== null) {
      return Promise.reject(this.upgradeError);
    }
    return Promise.resolve(this.upgradeResult);
  }

  getEntitlements(): Promise<Entitlements> {
    this.calls.push('getEntitlements');
    return Promise.resolve(this.entitlements);
  }
}

/**
 * Puerto de compra dentro de la app doble. Registra el orden de llamada y el
 * plan solicitado; devuelve un comprobante fijo (o rechaza si se configura).
 */
class FakeIapPurchaser implements IapPurchaser {
  readonly calls: string[] = [];
  lastPlanId: PlanId | null = null;
  receipt: IapReceipt = 'receipt-tienda';
  buyError: unknown = null;

  buy(planId: PlanId): Promise<IapReceipt> {
    this.calls.push('buy');
    this.lastPlanId = planId;
    if (this.buyError !== null) {
      return Promise.reject(this.buyError);
    }
    return Promise.resolve(this.receipt);
  }
}

const TEST_RECEIPT = 'receipt-tienda';

// --- Estado inicial (Req 25.1) --------------------------------------------

describe('SubscriptionPresenter — estado inicial', () => {
  it('arranca en idle, sin suscripción, catálogo ni entitlements y sin error', () => {
    const client = new FakeSubscriptionClient();
    const iap = new FakeIapPurchaser();
    const presenter = new SubscriptionPresenter(client, iap);

    const state = presenter.getState();
    expect(state.status).toBe('idle');
    expect(state.suscripcion).toBeNull();
    expect(state.catalogo).toEqual([]);
    expect(state.entitlements).toBeNull();
    expect(state.operando).toBe(false);
    expect(state.error).toBeNull();
  });

  it('subscribe emite el estado actual de inmediato', () => {
    const presenter = new SubscriptionPresenter(
      new FakeSubscriptionClient(),
      new FakeIapPurchaser(),
    );

    let seen: SubscriptionState | null = null;
    presenter.subscribe((s) => {
      seen = s;
    });
    expect(seen !== null).toBe(true);
    expect((seen as unknown as SubscriptionState).status).toBe('idle');
  });
});

// --- Carga: plan + catálogo + entitlements (Req 25.1, 25.4, 25.5) ---------

describe('SubscriptionPresenter.load — plan, catálogo y entitlements', () => {
  it('puebla el plan/estado y el catálogo devueltos por el Sistema (Req 25.1)', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
      entitlements: ENTITLEMENTS_BASICO,
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());

    await presenter.load();

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    expect(state.suscripcion).toEqual(SUSCRIPCION_BASICA);
    expect(state.catalogo).toEqual(CATALOGO);
    expect(state.error).toBeNull();
  });

  it('presenta el catálogo aunque aún no exista suscripción (suscripcion=null)', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: null, catalogo: CATALOGO },
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());

    await presenter.load();

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    expect(state.suscripcion).toBeNull();
    expect(state.catalogo).toEqual(CATALOGO);
  });

  it('refleja los Entitlements EXACTAMENTE como los devuelve el Sistema, sin recalcular (Req 25.4, 25.5)', async () => {
    // Caso deliberadamente "inconsistente" con el plan: la suscripción es BASICO
    // pero el Sistema devuelve derechos premium. El cliente NO debe recalcular a
    // partir del plan; debe reflejar lo devuelto tal cual (Req 25.5).
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
      entitlements: ENTITLEMENTS_PREMIUM,
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());

    await presenter.load();

    const state = presenter.getState();
    expect(state.suscripcion).toEqual(SUSCRIPCION_BASICA);
    // Reflejado tal cual: derechos premium pese al plan básico.
    expect(state.entitlements).toEqual(ENTITLEMENTS_PREMIUM);
  });

  it('transiciona idle → loading → loaded emitiendo cada fase', async () => {
    const presenter = new SubscriptionPresenter(
      new FakeSubscriptionClient(),
      new FakeIapPurchaser(),
    );
    const statuses: string[] = [];
    presenter.subscribe((s) => {
      statuses.push(s.status);
    });

    await presenter.load();

    expect(statuses).toEqual(['idle', 'loading', 'loaded']);
  });
});

// --- Compra: IAP primero, luego envío del comprobante (Req 25.2) ----------

describe('SubscriptionPresenter.purchase — IAP + envío del comprobante (Req 25.2)', () => {
  it('ejecuta el flujo IAP y luego envía el comprobante obtenido al Sistema', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: null, catalogo: CATALOGO },
      purchaseResult: SUSCRIPCION_BASICA,
      entitlements: ENTITLEMENTS_BASICO,
    });
    const iap = new FakeIapPurchaser();
    iap.receipt = TEST_RECEIPT;
    const presenter = new SubscriptionPresenter(client, iap);

    await presenter.purchase('BASICO');

    // El IAP corrió antes que el envío del comprobante al backend.
    expect(iap.calls).toEqual(['buy']);
    expect(iap.lastPlanId).toBe('BASICO');
    // Se envió al Sistema el plan y el comprobante devuelto por la tienda.
    expect(client.purchaseArgs).toEqual({
      planId: 'BASICO',
      receipt: TEST_RECEIPT,
    });
    // Orden: primero purchase(backend) y luego getEntitlements para reflejar.
    expect(client.calls).toEqual(['purchase', 'getEntitlements']);
  });

  it('refleja la suscripción devuelta y reconsulta los entitlements del Sistema (Req 25.4)', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: null, catalogo: CATALOGO },
      purchaseResult: SUSCRIPCION_PREMIUM,
      entitlements: ENTITLEMENTS_PREMIUM,
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());

    await presenter.purchase('PREMIUM');

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    expect(state.suscripcion).toEqual(SUSCRIPCION_PREMIUM);
    expect(state.entitlements).toEqual(ENTITLEMENTS_PREMIUM);
    expect(state.operando).toBe(false);
    expect(state.error).toBeNull();
  });
});

// --- Upgrade: IAP Premium + envío del comprobante (Req 25.3) --------------

describe('SubscriptionPresenter.upgrade — IAP Premium + envío del comprobante (Req 25.3)', () => {
  it('ejecuta el flujo IAP para PREMIUM y envía el comprobante vía upgrade', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
      upgradeResult: SUSCRIPCION_PREMIUM,
      entitlements: ENTITLEMENTS_PREMIUM,
    });
    const iap = new FakeIapPurchaser();
    iap.receipt = TEST_RECEIPT;
    const presenter = new SubscriptionPresenter(client, iap);

    await presenter.upgrade();

    // El flujo de compra dentro de la app se ejecuta para el plan Premium.
    expect(iap.calls).toEqual(['buy']);
    expect(iap.lastPlanId).toBe('PREMIUM');
    // Se envía el comprobante devuelto a `POST /subscription/upgrade`.
    expect(client.upgradeArgs).toEqual({ receipt: TEST_RECEIPT });
    expect(client.calls).toEqual(['upgrade', 'getEntitlements']);

    const state = presenter.getState();
    expect(state.suscripcion).toEqual(SUSCRIPCION_PREMIUM);
    expect(state.entitlements).toEqual(ENTITLEMENTS_PREMIUM);
  });
});

// --- Error del Sistema en compra: mensaje + estado previo (Req 25.6) ------

describe('SubscriptionPresenter — error del Sistema conserva el estado previo (Req 25.6)', () => {
  it('un error del backend en purchase expone el mensaje y mantiene la suscripción mostrada', async () => {
    // Estado previo cargado: suscripción básica + catálogo + entitlements.
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
      entitlements: ENTITLEMENTS_BASICO,
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());
    await presenter.load();

    // Ahora la compra falla en el backend.
    client.purchaseError = new Error('Recibo IAP inválido');

    await presenter.purchase('PREMIUM');

    const state = presenter.getState();
    // Se muestra el mensaje del Sistema…
    expect(state.error).toBe('Recibo IAP inválido');
    // …y se conserva la suscripción/catálogo/entitlements previos (no se borran).
    expect(state.suscripcion).toEqual(SUSCRIPCION_BASICA);
    expect(state.catalogo).toEqual(CATALOGO);
    expect(state.entitlements).toEqual(ENTITLEMENTS_BASICO);
    expect(state.operando).toBe(false);
  });

  it('un fallo del flujo IAP en purchase conserva el estado previo y muestra un mensaje', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
      entitlements: ENTITLEMENTS_BASICO,
    });
    const iap = new FakeIapPurchaser();
    const presenter = new SubscriptionPresenter(client, iap);
    await presenter.load();

    // La tienda falla / el usuario cancela: no debe enviarse comprobante al backend.
    iap.buyError = new Error('Compra cancelada por el usuario');

    await presenter.purchase('PREMIUM');

    const state = presenter.getState();
    expect(state.error).toBe('Compra cancelada por el usuario');
    expect(state.suscripcion).toEqual(SUSCRIPCION_BASICA);
    expect(state.entitlements).toEqual(ENTITLEMENTS_BASICO);
    // No se llamó al endpoint de compra del backend porque el IAP falló antes.
    expect(client.purchaseArgs).toBeNull();
  });

  it('usa un mensaje por defecto cuando el error del backend no aporta uno legible', async () => {
    const client = new FakeSubscriptionClient({
      view: { suscripcion: SUSCRIPCION_BASICA, catalogo: CATALOGO },
    });
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());
    await presenter.load();

    client.purchaseError = {};
    await presenter.purchase('PREMIUM');

    expect(presenter.getState().error).toBe(SUBSCRIPTION_OP_ERROR_MESSAGE);
  });

  it('load nunca lanza a la UI: refleja el error del Sistema como estado', async () => {
    const client = new FakeSubscriptionClient();
    client.getSubscriptionError = new Error('fallo de red');
    const presenter = new SubscriptionPresenter(client, new FakeIapPurchaser());

    await presenter.load();

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('fallo de red');
  });
});
