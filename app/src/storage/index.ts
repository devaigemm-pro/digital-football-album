// Almacenamiento_Seguro del cliente: Keychain (iOS) / Keystore (Android) para el
// Refresh_Token (Req 28).
//
// Task 25.3 — Requirements: 28.2, 28.3, 28.4
// Expone el puerto `SecureTokenStore` y sus implementaciones (en memoria para
// pruebas/contextos no nativos, y el adaptador de Keychain para producción).
export {
  InMemorySecureTokenStore,
  KeychainSecureTokenStore,
} from './secure-token-store';
export type { SecureTokenStore, KeychainModule } from './secure-token-store';
