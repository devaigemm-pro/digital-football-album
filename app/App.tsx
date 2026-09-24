/**
 * App.tsx — Componente raíz (buildable entry point) del Álbum de Fútbol Digital.
 *
 * Monta el grafo de navegación REAL (`RootNavigator`) con adaptadores HTTP
 * concretos y los PUENTES NATIVOS REALES (captura, permisos, IAP, push, share,
 * autenticación Apple/Google), sustituyendo por completo a los stubs anteriores.
 *
 * NOTA DE ARQUITECTURA (invariante del proyecto):
 *   - La lógica agnóstica del framework (adaptadores HTTP, presentadores,
 *     modelo de red/sesión) vive en `.ts` PUROS que typechean bajo
 *     `app/tsconfig.json` y NO importan `react-native`.
 *   - El wiring NATIVO (Keychain, IAP, share nativo, bridge de notificaciones,
 *     `useColorScheme`, montaje de navegación) vive en ESTE `.tsx`, que está
 *     EXCLUIDO del typecheck. Es código real para cuando se instale el toolchain
 *     del cliente; aquí no participa en `tsc --noEmit`.
 *
 * Este archivo compone el stack de red (holder de Access_Token en memoria +
 * Keychain para el Refresh_Token + `HttpClient` con TLS + `SessionHttpClient`
 * con refresh single-flight), instancia los adaptadores HTTP sobre `send`,
 * construye el `AuthSessionPresenter`, INYECTA los adaptadores nativos reales y
 * enlaza las pantallas a través de `createScreenBundle`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Keychain from 'react-native-keychain';

import {
  HttpClient,
  InMemoryAccessTokenHolder,
  SessionHttpClient,
  makeAuthRefreshFn,
} from './src/net';
import { KeychainSecureTokenStore } from './src/storage/secure-token-store';
import { AuthSessionPresenter } from './src/session';
import {
  InMemoryPermissionStore,
  PermissionGate,
} from './src/permissions';
import { CapturePresenter } from './src/capture';

import {
  HttpAlbumPreviewClient,
  HttpAuthClient,
  HttpCaptureClient,
  HttpCardsClient,
  HttpClubClient,
  HttpPushRegistrationClient,
  HttpSeasonCloseClient,
  HttpShippingClient,
  HttpSubscriptionClient,
} from './src/adapters';

import type { PushPlatform } from './src/notifications';
import { NativeNotificationBridgeAdapter } from './src/notifications';
import { SharePresenter, NativeShareBridgeAdapter } from './src/share';

// Configuración por entorno (dev/staging/prod), validada y con TLS obligatorio.
import { appConfig } from './src/config';

// Adaptadores NATIVOS REALES (todos `.tsx`, excluidos del typecheck): captura,
// permisos, IAP, push, share y la inicialización única de módulos nativos.
import {
  imagePickerCaptureBridge,
  nativePermissionPrompt,
  reactNativeIapPurchaser,
  firebaseNotifeePushPort,
  reactNativeSharePort,
  initNativeModules,
} from './src/adapters/native';

import { ClubThemeProvider } from './src/theme/ClubThemeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { createScreenBundle } from './src/navigation/screen-bindings';

/**
 * Base URL del backend (API Gateway) tomada de la configuración por entorno
 * (`appConfig.apiBaseUrl`). `resolveConfig` ya garantiza que viaja sobre
 * `https://` (TLS obligatorio, Req 28.1); el `.env` seleccionado por el build
 * (dev/staging/prod) determina su valor.
 */
const API_BASE_URL = appConfig.apiBaseUrl;

/**
 * Plataforma de push del dispositivo para el registro del Token_Push (Req 26.1).
 * El adaptador nativo usa `@react-native-firebase/messaging`, cuyo `getToken()`
 * devuelve un token FCM en ambas plataformas (en iOS envuelve el de APNs). Por
 * coherencia con esa implementación, se registra siempre como `'fcm'`.
 */
const PUSH_PLATFORM: PushPlatform = 'fcm';

/**
 * Puente nativo de captura de galería/cámara REAL
 * (`react-native-image-picker`). Implementa `CaptureNativeBridge`
 * (`pickFromGallery`/`takePhoto`) — Req 3.1/3.2.
 */
const captureNative = imagePickerCaptureBridge;

/**
 * Puerto de compra dentro de la app (IAP) REAL sobre `react-native-iap`
 * (StoreKit / BillingClient) — Req 25.
 */
const iapPurchaser = reactNativeIapPurchaser;

/**
 * Bridge nativo de notificaciones REAL: `NativeNotificationBridgeAdapter` sobre
 * el `NativePushPort` de Firebase Messaging + Notifee (permiso/token/display) —
 * Req 26.
 */
const notificationBridge = new NativeNotificationBridgeAdapter(
  firebaseNotifeePushPort,
);

/**
 * Presentador de compartición REAL: `NativeShareBridgeAdapter` sobre el
 * `NativeSharePort` de `react-native-share` (Instagram Stories / WhatsApp / X /
 * TikTok) — Req 6. Se construye una vez y lo consume la hoja `CompartirSheet`.
 */
const sharePresenter = new SharePresenter(
  new NativeShareBridgeAdapter(reactNativeSharePort),
);

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Id del usuario autenticado. El par de tokens del login no lo expone (la
  // sesión se identifica por el Access_Token); se poblará desde el endpoint de
  // perfil una vez disponible. Hasta entonces permanece `null` y los wrappers de
  // pantalla muestran un estado seguro. No se fabrica un id ficticio.
  const [usuarioId, setUsuarioId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Stack de red y sesión. Se construye UNA sola vez (useRef) para que el
  // holder de tokens, el store y los adaptadores sean estables entre renders.
  // ---------------------------------------------------------------------------
  const stack = useRef<ReturnType<typeof buildNetworkStack> | null>(null);
  if (stack.current === null) {
    stack.current = buildNetworkStack(setIsAuthenticated);
  }
  const {
    tokenStore,
    authPresenter,
    clubClient,
    albumPreviewClient,
    captureClient,
    cardsClient,
    subscriptionClient,
    shippingClient,
    seasonCloseClient,
    pushClient,
    capturePresenter,
    permissionGate,
  } = stack.current;

  // Inicialización ÚNICA de módulos nativos al montar: configura Google Sign-In
  // (webClientId de la config) e inicia la conexión IAP. `initNativeModules` no
  // lanza por IAP (lo registra), pero se envuelve igualmente para que ningún
  // fallo de arranque nativo tumbe la app: se registra y se continúa.
  useEffect(() => {
    void initNativeModules().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Fallo al inicializar módulos nativos:', error);
    });
  }, []);

  // Restauración de sesión al montar: si hay un Refresh_Token persistido en el
  // Almacenamiento_Seguro, se asume una sesión previa y se entra optimista a las
  // pantallas autenticadas; el `SessionHttpClient` validará/refrescará en la
  // primera petición y, si el refresh falla (401), `onSessionExpired` volverá a
  // marcar la sesión como no autenticada (Req 22.5). Documentado: entrada
  // optimista para no mostrar el login a un usuario con sesión válida.
  useEffect(() => {
    let cancelado = false;
    void tokenStore.getRefreshToken().then((refreshToken) => {
      if (!cancelado && refreshToken) {
        setIsAuthenticated(true);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [tokenStore]);

  const onRedirectToLogin = useCallback(() => {
    setIsAuthenticated(false);
    // Al salir de la sesión, se descarta el id de usuario cacheado.
    setUsuarioId(null);
  }, []);

  // Pantallas enlazadas a sus clientes/presentadores concretos.
  const screens = useMemo(
    () =>
      createScreenBundle({
        authPresenter,
        clubClient,
        albumPreviewClient,
        capturePresenter,
        captureClient,
        permissionGate,
        captureNative,
        cardsClient,
        subscriptionClient,
        iapPurchaser,
        shippingClient,
        seasonCloseClient,
        notificationBridge,
        pushClient,
        pushPlatform: PUSH_PLATFORM,
        sharePresenter,
        // `usuarioId` proviene del estado de sesión y se poblará desde el perfil
        // tras autenticar; hasta entonces `null` (estado seguro en los wrappers).
        usuarioId,
        onRedirectToLogin,
      }),
    [
      authPresenter,
      clubClient,
      albumPreviewClient,
      capturePresenter,
      captureClient,
      permissionGate,
      cardsClient,
      subscriptionClient,
      shippingClient,
      seasonCloseClient,
      pushClient,
      usuarioId,
      onRedirectToLogin,
    ],
  );

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ClubThemeProvider client={clubClient}>
        <RootNavigator isAuthenticated={isAuthenticated} screens={screens} />
      </ClubThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Construye el stack de red y sesión y los adaptadores HTTP, y arma el
 * `AuthSessionPresenter`. Se aísla en una función para mantener el componente
 * legible y garantizar una construcción única (vía `useRef`).
 *
 * @param onAuthChange callback que refleja el estado de sesión en React.
 */
function buildNetworkStack(onAuthChange: (authenticated: boolean) => void) {
  // Access_Token en memoria (vida corta; no se persiste) y Refresh_Token en el
  // Almacenamiento_Seguro nativo (Keychain iOS / Keystore Android) — Req 28.2/3.
  const accessTokenHolder = new InMemoryAccessTokenHolder();
  const tokenStore = new KeychainSecureTokenStore(Keychain);

  // Cliente HTTP base: TLS obligatorio + adjunto del Access_Token (Req 22.3/28.1).
  const httpClient = new HttpClient({
    baseUrl: API_BASE_URL,
    getAccessToken: () => accessTokenHolder.get(),
  });
  const baseSend = httpClient.send.bind(httpClient);

  // Decorador de sesión: refresh single-flight con rotación y reintento (Req 22.4).
  const sessionClient = new SessionHttpClient({
    send: baseSend,
    tokenStore,
    accessTokenHolder,
    refresh: makeAuthRefreshFn(baseSend),
    onSessionExpired: () => onAuthChange(false),
  });
  const send = sessionClient.asSend();

  // Adaptadores HTTP sobre `send`.
  const authClient = new HttpAuthClient(send);
  const clubClient = new HttpClubClient(send);
  const albumPreviewClient = new HttpAlbumPreviewClient(send);
  const captureClient = new HttpCaptureClient(send);
  const cardsClient = new HttpCardsClient(send);
  const subscriptionClient = new HttpSubscriptionClient(send);
  const shippingClient = new HttpShippingClient(send);
  const seasonCloseClient = new HttpSeasonCloseClient(send);
  const pushClient = new HttpPushRegistrationClient(send);

  // Presenter de sesión: al cambiar de estado, refleja `isAuthenticated`.
  const authPresenter = new AuthSessionPresenter({
    authClient,
    tokenStore,
    accessTokenHolder,
    onSessionChange: (status) => onAuthChange(status === 'authenticated'),
  });

  // Puerta de permisos (prompt nativo real) + presenter de captura.
  const permissionGate = new PermissionGate(
    new InMemoryPermissionStore(),
    nativePermissionPrompt,
  );
  const capturePresenter = new CapturePresenter(captureClient, permissionGate);

  return {
    accessTokenHolder,
    tokenStore,
    authPresenter,
    clubClient,
    albumPreviewClient,
    captureClient,
    cardsClient,
    subscriptionClient,
    shippingClient,
    seasonCloseClient,
    pushClient,
    capturePresenter,
    permissionGate,
  };
}

export default App;
