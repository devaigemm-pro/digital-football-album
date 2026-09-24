// Seguridad y privacidad transversales (Req 20).
//
// Barrel del módulo de seguridad que agrupa:
//   - Cifrado en reposo de objetos con AES-256 (Task 20.1 — Req 20.2).
//   - Solicitud/revocación de permisos del dispositivo conforme a GDPR/CCPA
//     (Task 20.1 — Req 5.8, 6.3, 20.3, 20.4).

export {
  AT_REST_ENCRYPTION_ALGORITHM,
  DEFAULT_AT_REST_ENCRYPTION_CONFIG,
  AtRestEncryptionError,
  createAtRestEncryptionConfig,
  isAtRestEncryptionCompliant,
  assertAtRestEncryptionCompliant,
} from './at-rest-encryption.js';
export type { AtRestEncryptionAlgorithm, AtRestEncryptionConfig } from './at-rest-encryption.js';

export {
  Permiso,
  EstadoPermiso,
  InMemoryPermissionStore,
  PermissionManager,
  PermisoNoConcedidoError,
} from './permissions.js';
export type { PermissionStore, PermissionPrompt } from './permissions.js';
