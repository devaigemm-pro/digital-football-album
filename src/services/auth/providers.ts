// Verificación de credenciales de proveedores de autenticación.
//
// El registro/login es multiproveedor (Apple ID, Google, email — Req 1.1). La
// verificación real de credenciales (validar un id_token de Apple/Google contra
// sus JWKS, o comprobar la contraseña de una cuenta por email) es I/O externa y
// específica de cada proveedor. Aquí se abstrae detrás de una interfaz
// `ProviderVerifier` para que el `AuthService` sea puro y testeable con dobles.
//
// Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4

import type { ProveedorAuth } from '../../domain/types.js';

/** Identidad verificada devuelta por un proveedor tras validar la credencial. */
export interface VerifiedIdentity {
  /** Proveedor que emitió/validó la credencial. */
  proveedor: ProveedorAuth;
  /**
   * Correo asociado a la identidad. Es la clave de vinculación de cuenta:
   * el registro por email crea una cuenta nueva para este correo (Req 1.4) y el
   * login localiza la cuenta existente por él (Req 1.2).
   */
  email: string;
}

/** Resultado de verificar una credencial de proveedor. */
export type ProviderVerificationResult = { ok: true; identity: VerifiedIdentity } | { ok: false };

/**
 * Contrato de verificación de credenciales por proveedor. Las implementaciones
 * concretas (Apple/Google/email) validan la credencial contra el proveedor; en
 * pruebas se inyecta un doble determinista.
 *
 * Devuelve `{ ok: false }` cuando la credencial es inválida, lo que el servicio
 * traduce a un rechazo de acceso con mensaje descriptivo (Req 1.3).
 */
export interface ProviderVerifier {
  verify(provider: ProveedorAuth, credential: string): Promise<ProviderVerificationResult>;
}
