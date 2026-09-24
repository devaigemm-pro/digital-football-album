// Barrel del Servicio_Autenticación.
//
// Expone el servicio, sus tipos de contrato y las utilidades de token/proveedor
// para inyección y pruebas, más el borrado de cuenta (derecho al olvido).
//
// Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4
// Task 3.2 — Requirements: 20 (borrado de cuenta)

export {
  AccountDeletionService,
  type AccountDeletionDeps,
  type AccountDeletionResult,
} from './account-deletion-service.js';

export { type ObjectStorage, InMemoryObjectStorage } from './object-storage.js';

export {
  AuthService,
  AuthError,
  type AuthErrorCode,
  type AuthRequest,
  type AuthServiceConfig,
  type AuthServiceDeps,
  type Clock,
  type IdGenerator,
  type RefreshTokenFactory,
  type TokenPair,
} from './auth-service.js';

export {
  type ProviderVerifier,
  type ProviderVerificationResult,
  type VerifiedIdentity,
} from './providers.js';

export {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  type AccessTokenClaims,
  type VerifyResult,
} from './tokens.js';
