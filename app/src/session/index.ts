// Módulo de sesión del cliente: presenter puro de autenticación, logout y
// borrado de cuenta (framework-agnóstico).
//
// Task 26.1 — Requirements: 22.1, 22.2, 22.6
// Task 26.2 — Requirements: 22.7, 22.8
// Expone el `AuthSessionPresenter` y sus tipos para que las pantallas `.tsx`
// (LoginScreen, AjustesScreen) y la navegación deleguen aquí la lógica.
export { AuthSessionPresenter, AuthenticationError } from './auth-session';
export type {
  AuthProvider,
  AuthCredential,
  AuthClient,
  AuthSessionConfig,
  DeleteAccountParams,
  SessionResult,
  SessionStatus,
} from './auth-session';
