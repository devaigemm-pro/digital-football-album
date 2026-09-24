// Adaptadores de cliente: implementaciones concretas HTTP de los contratos que
// consumen los view-models/presentadores del cliente.
//
// Task 24 (scaffold) / Tasks 21/25/26/29/30 (wiring) — Requirements: 21.1, 21.2
// y los de cada contrato.
//
// Hablan HTTP con el backend a través del Módulo de red del cliente
// (`HttpClient.send` / `SessionHttpClient.asSend()`), que usa `fetch` y NO
// `react-native`. Por eso son TypeScript PURO (`.ts`) y typechean bajo
// `app/tsconfig.json`. El wiring nativo (Keychain, IAP, share nativo, bridge de
// notificaciones) y el montaje de navegación viven en `.tsx` (App.tsx, etc.).

// Utilidades compartidas (base64, mapeo de errores, construcción de peticiones).
export {
  encodeBase64,
  decodeBase64,
  ensureOk,
  readOkBody,
  buildRequest,
  jsonBody,
  type SendFn,
} from './http-adapter-utils';

// Autenticación / sesión (Req 22).
export { HttpAuthClient } from './http-auth-client';

// Personalización / Club (Req 2).
export { HttpClubClient } from './http-club-client';

// Captura de momentos y contexto (Req 5, 6).
export { HttpCaptureClient } from './http-capture-client';

// Generador_Cards (Req 12).
export { HttpCardsClient } from './http-cards-client';

// Previsualización del álbum (Req 4).
export { HttpAlbumPreviewClient } from './http-album-preview-client';

// Suscripción / IAP (Req 25).
export { HttpSubscriptionClient } from './http-subscription-client';

// Envío / Pedido (Req 8).
export { HttpShippingClient } from './http-shipping-client';

// Cierre anticipado de la Temporada (Req 10).
export { HttpSeasonCloseClient } from './http-season-close-client';

// Registro de notificaciones push (Req 26).
export { HttpPushRegistrationClient } from './http-push-registration-client';
