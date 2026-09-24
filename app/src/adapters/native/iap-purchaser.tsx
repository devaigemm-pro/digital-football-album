// Adaptador NATIVO de compra dentro de la app (IAP) — implementa el
// `IapPurchaser` (declarado en `app/src/subscription/subscription-presenter.ts`)
// usando `react-native-iap`.
//
// Importa una librería nativa (`react-native-iap`), por lo que es `.tsx` y queda
// EXCLUIDO del typecheck de `app/tsconfig.json`; se compila con Metro.
//
// `IapPurchaser.buy(planId)` (planId: 'BASICO' | 'PREMIUM') ejecuta el flujo de
// compra de la tienda (App Store / Google Play) y resuelve el comprobante como
// string (`transactionReceipt` en iOS; `purchaseToken` en Android), que el
// presentador reenvía al backend para validarlo (Req 25.2, 25.3).
//
// El mapeo planId → SKU de la tienda se centraliza en `PLAN_SKUS`. En una app
// real estos SKUs deben coincidir con los productos de suscripción dados de alta
// en App Store Connect / Google Play Console; se dejan como constantes
// documentadas (configurables). `initNativeModules` (barrel) invoca
// `initIapConnection()` una vez al arrancar.

import {
  endConnection,
  getSubscriptions,
  initConnection,
  requestSubscription,
} from 'react-native-iap';
import type { SubscriptionPurchase } from 'react-native-iap';
import { Platform } from 'react-native';

import type {
  IapPurchaser,
  IapReceipt,
  PlanId,
} from '../../subscription/subscription-presenter';

/**
 * SKUs de las suscripciones en cada tienda, indexados por `PlanId`. Deben
 * coincidir con los IDs de producto configurados en App Store Connect / Google
 * Play Console. Se centralizan aquí para no dispersarlos.
 */
const PLAN_SKUS: Readonly<Record<PlanId, string>> = {
  BASICO: 'album_basico_anual',
  PREMIUM: 'album_premium_anual',
};

/** Extrae un comprobante en forma de string de una `SubscriptionPurchase`. */
function receiptFromPurchase(purchase: SubscriptionPurchase): IapReceipt {
  // iOS expone `transactionReceipt`; Android, `purchaseToken`. Se prefiere el
  // de la plataforma activa y se cae al otro por robustez.
  if (Platform.OS === 'android') {
    return purchase.purchaseToken ?? purchase.transactionReceipt ?? '';
  }
  return purchase.transactionReceipt ?? purchase.purchaseToken ?? '';
}

/** Normaliza el resultado (objeto | array | void) de `requestSubscription`. */
function firstPurchase(
  result: SubscriptionPurchase | SubscriptionPurchase[] | null | void,
): SubscriptionPurchase {
  if (Array.isArray(result)) {
    if (result.length === 0) {
      throw new Error('La compra no devolvió ningún comprobante.');
    }
    return result[0];
  }
  if (!result) {
    throw new Error('La compra no devolvió ningún comprobante.');
  }
  return result;
}

/**
 * Inicializa la conexión con la tienda. Idempotente en la práctica (la librería
 * tolera reconexiones); se invoca una vez al arrancar desde `initNativeModules`.
 */
export async function initIapConnection(): Promise<void> {
  await initConnection();
}

/** Cierra la conexión con la tienda (p. ej. al desmontar la app). */
export async function endIapConnection(): Promise<void> {
  await endConnection();
}

/**
 * Implementación del `IapPurchaser` sobre `react-native-iap`. Para el plan
 * indicado: consulta el producto (para asegurar que la tienda lo conoce) y lanza
 * el flujo de suscripción, devolviendo el comprobante como string.
 */
export class ReactNativeIapPurchaser implements IapPurchaser {
  async buy(planId: PlanId): Promise<IapReceipt> {
    const sku = PLAN_SKUS[planId];

    // Asegura que la tienda conoce el SKU antes de iniciar la compra. Su
    // resultado (catálogo con precios/ofertas) también alimenta, en Android, los
    // `subscriptionOffers` requeridos por el nuevo Billing.
    const products = await getSubscriptions({ skus: [sku] });
    if (products.length === 0) {
      throw new Error(
        `El producto de suscripción "${sku}" no está disponible en la tienda.`,
      );
    }

    const purchase = firstPurchase(
      await requestSubscription({
        sku,
        // Android Billing v5 requiere las ofertas del producto; se toman del
        // primer producto devuelto si las expone.
        subscriptionOffers:
          Platform.OS === 'android'
            ? ((products[0] as { subscriptionOfferDetails?: Array<{ offerToken: string }> })
                .subscriptionOfferDetails ?? []).map((offer) => ({
                sku,
                offerToken: offer.offerToken,
              }))
            : undefined,
      }),
    );

    return receiptFromPurchase(purchase);
  }
}

/** Instancia lista para inyectar en el `SubscriptionPresenter`. */
export const reactNativeIapPurchaser = new ReactNativeIapPurchaser();

export default reactNativeIapPurchaser;
