// Adaptadores NATIVOS de autenticación con Apple ID y Google — producen el
// `identityToken` / `idToken` que el `AuthSessionPresenter`
// (`app/src/session/auth-session.ts`) necesita para construir la `AuthCredential`
// de los proveedores `apple` y `google` (Req 22.1).
//
// Importan librerías nativas (`@invertase/react-native-apple-authentication`,
// `@react-native-google-signin/google-signin`), por lo que este archivo es
// `.tsx` y queda EXCLUIDO del typecheck de `app/tsconfig.json`; se compila con
// Metro.
//
// Uso en el wiring (ejemplo):
//   const identityToken = await signInWithApple();
//   await auth.login({ provider: 'apple', identityToken });
//
//   const idToken = await signInWithGoogle();
//   await auth.login({ provider: 'google', identityToken: idToken });
//
// `configureGoogleSignIn()` (llamado desde `initNativeModules`) debe ejecutarse
// una vez antes de `signInWithGoogle`, usando `appConfig.googleWebClientId` /
// `appConfig.iosUrlScheme` de `app/src/config`.

import { appleAuth } from '@invertase/react-native-apple-authentication';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { appConfig } from '../../config';

/**
 * Configura Google Sign-In con el Client ID web (para obtener el `idToken` que
 * el backend valida) y el URL scheme inverso de iOS. Debe llamarse una vez al
 * arrancar (desde `initNativeModules`).
 */
export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: appConfig.googleWebClientId,
    iosClientId: undefined,
    offlineAccess: false,
  });
}

/**
 * Lanza el flujo de Sign In with Apple y resuelve el `identityToken` (JWT) que
 * el backend valida (Req 22.1). Lanza si Apple no devuelve token o si el usuario
 * cancela.
 */
export async function signInWithApple(): Promise<string> {
  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  });

  const identityToken = response.identityToken;
  if (!identityToken) {
    throw new Error(
      'Sign In with Apple no devolvió un identityToken. Inténtalo de nuevo.',
    );
  }
  return identityToken;
}

/**
 * Lanza el flujo de Google Sign-In y resuelve el `idToken` que el backend
 * valida (Req 22.1). Verifica Google Play Services (Android) antes de continuar.
 * Lanza si el usuario cancela o no se obtiene `idToken`.
 */
export async function signInWithGoogle(): Promise<string> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    // El usuario canceló el flujo.
    throw new Error('El inicio de sesión con Google fue cancelado.');
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error(
      'Google Sign-In no devolvió un idToken. Verifica el webClientId configurado.',
    );
  }
  return idToken;
}
