/**
 * App.tsx — Componente raíz (buildable entry point) del Álbum de Fútbol Digital.
 *
 * Monta el grafo de navegación REAL (`RootNavigator`) con adaptadores HTTP
 * concretos y los PUENTES NATIVOS REALES (captura, permisos, share), apuntando
 * al BACKEND DEPLOYADO (Render) y a Supabase Auth (ver docs/FRONTEND_INTEGRATION.md).
 *
 * AUTENTICACIÓN (cambio de arquitectura, docs · §2):
 *   - La app autentica DIRECTAMENTE contra Supabase Auth con `@supabase/supabase-js`
 *     (email/password). El backend NO expone login/registro/refresh; solo
 *     consume el `access_token` de Supabase como `Authorization: Bearer`.
 *   - El Access_Token vigente vive en un holder en memoria que se SINCRONIZA con
 *     la sesión de Supabase vía `onAuthStateChange` (login/logout/refresh). El
 *     `HttpClient` lee ese holder para adjuntar el Bearer en cada petición.
 *   - Ante un 401 del backend, `SupabaseSessionHttpClient` pide un token fresco a
 *     supabase-js (`refreshSession`), actualiza el holder y reintenta UNA vez; si
 *     sigue 401, cierra la sesión (Supabase `signOut` vía el presentador).
 *
 * FUNCIONES OCULTAS (docs · §7): suscripción/IAP, envío/pedido, notificaciones
 * push, cierre anticipado y edición de contexto del Momento NO están disponibles
 * en el backend deployado. Sus pantallas se sustituyen por un placeholder
 * "No disponible todavía" en el navegador (ver screen-bindings / RootNavigator).
 *
 * NOTA DE ARQUITECTURA (invariante del proyecto):
 *   - La lógica agnóstica del framework (adaptadores HTTP, presentadores, red)
 *     vive en `.ts` PUROS que typechean bajo `app/tsconfig.json` y NO importan
 *     `react-native` ni `@supabase/supabase-js`.
 *   - El wiring NATIVO/Supabase (`.tsx`) está EXCLUIDO del typecheck. Es código
 *     real para cuando se instale el toolchain del cliente; aquí no participa en
 *     `tsc --noEmit` ni se ejecuta en dispositivo.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  HttpClient,
  InMemoryAccessTokenHolder,
  SupabaseSessionHttpClient,
} from './src/net';
import { AuthSessionPresenter } from './src/session';
import { InMemorySecureTokenStore } from './src/storage/secure-token-store';
import {
  InMemoryPermissionStore,
  PermissionGate,
} from './src/permissions';
import { CapturePresenter } from './src/capture';

import {
  HttpAlbumPreviewClient,
  HttpCaptureClient,
  HttpCardsClient,
  HttpClubClient,
  HttpClubsCatalogClient,
  HttpProfileClient,
  HttpSubscriptionClient,
} from './src/adapters';

import { SharePresenter, NativeShareBridgeAdapter } from './src/share';

// Configuración por entorno (dev/prod), validada y con TLS obligatorio.
import { appConfig } from './src/config';

// Capa de autenticación Supabase (`.tsx`): cliente, helpers de sesión y el
// `SupabaseAuthClient` que respalda el `AuthSessionPresenter`.
import {
  SupabaseAuthClient,
  getAccessToken as getSupabaseAccessToken,
  refreshAccessToken as refreshSupabaseAccessToken,
  subscribeToAuthState,
} from './src/auth';

// Adaptadores NATIVOS REALES (todos `.tsx`, excluidos del typecheck): captura,
// permisos, share y la inicialización única de módulos nativos.
import {
  imagePickerCaptureBridge,
  nativePermissionPrompt,
  reactNativeSharePort,
  initNativeModules,
} from './src/adapters/native';

import { ClubThemeProvider } from './src/theme/ClubThemeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { createScreenBundle } from './src/navigation/screen-bindings';

/**
 * Base URL del backend deployado (Render), tomada de `appConfig.apiBaseUrl`.
 * `resolveConfig` garantiza `https://` (TLS obligatorio, Req 28.1).
 */
const API_BASE_URL = appConfig.apiBaseUrl;

/** Puente nativo de captura de galería/cámara REAL (`react-native-image-picker`). */
const captureNative = imagePickerCaptureBridge;

/**
 * Presentador de compartición REAL sobre `react-native-share`. Se construye una
 * vez y lo consume la hoja `CompartirSheet` (Req 6).
 */
const sharePresenter = new SharePresenter(
  new NativeShareBridgeAdapter(reactNativeSharePort),
);

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Id del usuario autenticado. El backend deriva el usuario del JWT y no hay
  // endpoint de perfil expuesto aún; permanece `null` (los wrappers muestran un
  // estado seguro). No se fabrica un id ficticio.
  const [usuarioId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Stack de red y sesión. Se construye UNA sola vez (useRef).
  // ---------------------------------------------------------------------------
  const stack = useRef<ReturnType<typeof buildNetworkStack> | null>(null);
  if (stack.current === null) {
    stack.current = buildNetworkStack(setIsAuthenticated);
  }
  const {
    accessTokenHolder,
    authPresenter,
    clubClient,
    clubsCatalogClient,
    albumPreviewClient,
    captureClient,
    cardsClient,
    subscriptionClient,
    profileClient,
    capturePresenter,
    permissionGate,
  } = stack.current;

  // Inicialización ÚNICA de módulos nativos al montar. No debe tumbar la app.
  useEffect(() => {
    void initNativeModules().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Fallo al inicializar módulos nativos:', error);
    });
  }, []);

  // Sincroniza el holder de Access_Token con la sesión de Supabase. supabase-js
  // refresca el token automáticamente y emite `onAuthStateChange`; aquí se
  // publica el token vigente en el holder (que alimenta `HttpClient`) y se
  // refleja el estado de autenticación en React. Al montar, se restaura la
  // sesión persistida (si la hay) leyendo el token actual de Supabase.
  useEffect(() => {
    let cancelado = false;

    void getSupabaseAccessToken().then((token) => {
      if (cancelado) {
        return;
      }
      accessTokenHolder.set(token);
      setIsAuthenticated(token !== null);
    });

    const unsubscribe = subscribeToAuthState((token) => {
      accessTokenHolder.set(token);
      setIsAuthenticated(token !== null);
    });

    return () => {
      cancelado = true;
      unsubscribe();
    };
  }, [accessTokenHolder]);

  const onRedirectToLogin = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  // Pantallas enlazadas a sus clientes/presentadores concretos.
  const screens = useMemo(
    () =>
      createScreenBundle({
        authPresenter,
        clubClient,
        clubsCatalogClient,
        albumPreviewClient,
        capturePresenter,
        captureClient,
        permissionGate,
        captureNative,
        cardsClient,
        subscriptionClient,
        profileClient,
        sharePresenter,
        usuarioId,
        onRedirectToLogin,
      }),
    [
      authPresenter,
      clubClient,
      clubsCatalogClient,
      albumPreviewClient,
      capturePresenter,
      captureClient,
      permissionGate,
      cardsClient,
      subscriptionClient,
      profileClient,
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
 * `AuthSessionPresenter` respaldado por Supabase. Se aísla en una función para
 * mantener el componente legible y garantizar una construcción única (useRef).
 *
 * @param onAuthChange callback que refleja el estado de sesión en React.
 */
function buildNetworkStack(onAuthChange: (authenticated: boolean) => void) {
  // Access_Token en memoria, sincronizado con la sesión de Supabase (no se
  // persiste aparte: la sesión persistida la gestiona supabase-js/AsyncStorage).
  const accessTokenHolder = new InMemoryAccessTokenHolder();

  // Cliente HTTP base: TLS obligatorio + adjunto del Access_Token (Req 22.3/28.1).
  const httpClient = new HttpClient({
    baseUrl: API_BASE_URL,
    getAccessToken: () => accessTokenHolder.get(),
  });
  const baseSend = httpClient.send.bind(httpClient);

  // Decorador de sesión Supabase: ante 401 refresca vía supabase-js y reintenta.
  const sessionClient = new SupabaseSessionHttpClient({
    send: baseSend,
    accessTokenHolder,
    refresh: () => refreshSupabaseAccessToken(),
    onSessionExpired: () => onAuthChange(false),
  });
  const send = sessionClient.asSend();

  // Adaptadores HTTP sobre `send` (endpoints REALES del backend deployado).
  const clubClient = new HttpClubClient(send);
  const clubsCatalogClient = new HttpClubsCatalogClient(send);
  const albumPreviewClient = new HttpAlbumPreviewClient(send);
  const captureClient = new HttpCaptureClient(send);
  const cardsClient = new HttpCardsClient(send);
  const subscriptionClient = new HttpSubscriptionClient(send);
  const profileClient = new HttpProfileClient(send);

  // Presenter de sesión respaldado por Supabase Auth (email/password).
  const authPresenter = new AuthSessionPresenter({
    authClient: new SupabaseAuthClient(),
    // El Refresh_Token ya no se gestiona aquí: Supabase persiste su propia
    // sesión (AsyncStorage) y refresca el token. Se usa un store EN MEMORIA
    // no-persistente solo para satisfacer el contrato del presentador; la
    // fuente de verdad de la sesión es Supabase. `logout` purga el holder y
    // llama a `supabase.auth.signOut()` vía el `SupabaseAuthClient`.
    tokenStore: new InMemorySecureTokenStore(),
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
    authPresenter,
    clubClient,
    clubsCatalogClient,
    albumPreviewClient,
    captureClient,
    cardsClient,
    subscriptionClient,
    profileClient,
    capturePresenter,
    permissionGate,
  };
}

export default App;
