// Barrel del Servicio_Suscripción (Req 3).
//
// Expone el servicio, sus tipos de contrato, el catálogo de planes y la
// abstracción de validación de recibos IAP (mockeable en pruebas).
//
// Task 6.1 — Requirements: 3.1, 3.2, 3.3, 3.4

export {
  SubscriptionService,
  SubscriptionError,
  type SubscriptionErrorCode,
  type SubscriptionView,
  type SubscriptionServiceDeps,
} from './subscription-service.js';

export {
  PLAN_CATALOGO,
  MONEDA_CATALOGO,
  listarCatalogo,
  obtenerPlan,
  type PlanCatalogoEntrada,
} from './plan-catalog.js';

export {
  type IAPPlataforma,
  type IAPReceipt,
  type IAPValidationResult,
  type IAPReceiptValidator,
} from './iap-receipt-validator.js';

export {
  RevenueCatWebhookHandler,
  InMemoryProcessedEventStore,
  InMemoryLastEventTimestampStore,
  type RevenueCatEventType,
  type RevenueCatEvent,
  type WebhookSignatureVerifier,
  type ProcessedEventStore,
  type LastEventTimestampStore,
  type Notifier,
  type WebhookOutcome,
  type WebhookResult,
  type RevenueCatWebhookHandlerDeps,
} from './revenuecat-webhook.js';

// Punto único de entitlements (gating por plan).
//
// Task 6.3 — Requirements: 3.6, 3.7

export {
  EntitlementsService,
  entitlementsForPlan,
  type Entitlements,
  type EntitlementsServiceDeps,
} from './entitlements.js';
