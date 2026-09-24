// Barrel de los ADAPTADORES NATIVOS del cliente — implementaciones concretas de
// los puertos (`CaptureNativeBridge`, `PermissionPrompt`, `NativeSharePort`,
// `NativePushPort`, `IapPurchaser`, auth Apple/Google) sobre las librerías
// nativas de React Native.
//
// Todos estos archivos son `.tsx` porque importan módulos nativos y quedan
// EXCLUIDOS del typecheck de `app/tsconfig.json`; se compilan con Metro al
// construir la app. El wiring de la app (App.tsx / navegación) importa desde
// aquí para inyectar las implementaciones reales en los presentadores puros.

// Captura de fotos (galería/cámara) — Req 3.1/3.2.
export {
  ImagePickerCaptureBridge,
  imagePickerCaptureBridge,
} from './image-picker-capture-bridge';

// Prompt de permisos del SO — Req 24.
export { nativePermissionPrompt } from './permissions-prompt';

// Compartición a redes sociales — Req 6.
export { ReactNativeSharePort, reactNativeSharePort } from './share-port';

// Notificaciones push (permiso/token/display) — Req 26.
export { FirebaseNotifeePushPort, firebaseNotifeePushPort } from './push-port';

// Compra dentro de la app (IAP) — Req 25.
export {
  ReactNativeIapPurchaser,
  reactNativeIapPurchaser,
  initIapConnection,
  endIapConnection,
} from './iap-purchaser';

// Autenticación Apple ID / Google — Req 22.1.
export {
  configureGoogleSignIn,
  signInWithApple,
  signInWithGoogle,
} from './apple-google-auth';

import { configureGoogleSignIn } from './apple-google-auth';
import { initIapConnection } from './iap-purchaser';

/**
 * Inicializa de una sola vez los módulos nativos que requieren configuración al
 * arrancar la app:
 *   - `GoogleSignin.configure(...)` con el `webClientId` de la configuración.
 *   - Conexión con la tienda para IAP (`initConnection`).
 *
 * Se invoca una vez desde el arranque de la app (p. ej. en `App.tsx`, dentro de
 * un `useEffect` de montaje). No lanza: los fallos de IAP se registran y no
 * impiden el arranque (la compra fallará explícitamente más tarde si procede).
 */
export async function initNativeModules(): Promise<void> {
  configureGoogleSignIn();
  try {
    await initIapConnection();
  } catch (error) {
    // La conexión con la tienda puede no estar disponible (p. ej. emulador sin
    // cuenta de pruebas); no debe impedir el arranque de la app.
    // eslint-disable-next-line no-console
    console.warn('No se pudo inicializar la conexión IAP:', error);
  }
}
