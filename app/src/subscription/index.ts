// Barrel de la capa de suscripción (compra y upgrade vía IAP) del cliente.
//
// Task 30.1 — Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
// Expone el presentador framework-agnóstico, sus puertos inyectables
// (`SubscriptionClient`, `IapPurchaser`) y sus tipos para que la pantalla
// `SuscripcionScreen.tsx` y los adaptadores los consuman.
export {
  SubscriptionPresenter,
  SUBSCRIPTION_LOAD_ERROR_MESSAGE,
  SUBSCRIPTION_OP_ERROR_MESSAGE,
} from './subscription-presenter';
export type {
  Entitlements,
  EstadoSuscripcion,
  IapPurchaser,
  IapReceipt,
  PlanCatalogoEntrada,
  PlanId,
  SubscriptionClient,
  SubscriptionState,
  SubscriptionStateListener,
  SubscriptionStatus,
  SubscriptionView,
  Suscripcion,
} from './subscription-presenter';
