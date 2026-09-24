// Cifrado en reposo de objetos (Req 20.2).
//
// Diseño (design.md · "Seguridad y privacidad" y "Datos"): los binarios (fotos
// originales y PDFs de salida) viven en Object Storage **cifrados en reposo con
// AES-256** (Req 20.2). En un despliegue real el cifrado en reposo lo aplica la
// plataforma de almacenamiento (S3 SSE-KMS / SSE-S3, Firebase Storage): las
// claves las gestiona un KMS/plataforma y NUNCA se guardan en el código de los
// servicios.
//
// Al igual que el helper de terminación TLS del borde (src/api/gateway/tls.ts),
// este módulo NO implementa la criptografía (eso lo provee la plataforma).
// Aporta dos cosas verificables en pruebas:
//   1. Un helper de configuración declarativo que documenta y transporta los
//      parámetros de cifrado en reposo (algoritmo AES-256 y referencia a la
//      clave gestionada por la plataforma), sin contener material criptográfico
//      en claro.
//   2. Un guard/assert que rechaza una configuración de almacenamiento que no
//      cumpla el cifrado AES-256 en reposo, de modo que ningún bucket/objeto sin
//      cifrar pase la validación (Req 20.2).
//
// Task 20.1 — Requirements: 20.2

/**
 * Algoritmo de cifrado en reposo exigido por el diseño. Es una constante para
 * documentar y fijar el único valor admisible (Req 20.2).
 */
export const AT_REST_ENCRYPTION_ALGORITHM = 'AES-256' as const;

/** Tipo del algoritmo de cifrado en reposo admitido (solo `AES-256`). */
export type AtRestEncryptionAlgorithm = typeof AT_REST_ENCRYPTION_ALGORITHM;

/**
 * Configuración declarativa de cifrado en reposo para el Object Storage. No
 * contiene material criptográfico en claro: `keyReference` es un identificador
 * lógico de la clave gestionada por la plataforma/KMS (p. ej. un ARN de KMS o el
 * nombre de una clave gestionada), no la clave en sí.
 */
export interface AtRestEncryptionConfig {
  /**
   * Algoritmo de cifrado en reposo. Siempre `AES-256` conforme al diseño
   * (Req 20.2).
   */
  readonly algorithm: AtRestEncryptionAlgorithm;
  /**
   * Si es `true` (por defecto y recomendado), el cifrado en reposo es
   * obligatorio: la plataforma debe cifrar todo objeto almacenado y una lectura
   * sin descifrado válido falla de forma segura (Req 20.2).
   */
  readonly enabled: boolean;
  /**
   * Referencia lógica a la clave gestionada por la plataforma/KMS que se usa
   * para cifrar los objetos en reposo. Es una referencia (ARN/alias/nombre), no
   * la clave: el código de los servicios nunca custodia la clave en claro.
   */
  readonly keyReference: string;
}

/** Configuración por defecto: cifrado AES-256 en reposo habilitado. */
export const DEFAULT_AT_REST_ENCRYPTION_CONFIG: AtRestEncryptionConfig = {
  algorithm: AT_REST_ENCRYPTION_ALGORITHM,
  enabled: true,
  keyReference: 'platform-managed-default-key',
};

/**
 * Crea una configuración de cifrado en reposo a partir de valores parciales,
 * completando con `DEFAULT_AT_REST_ENCRYPTION_CONFIG`. El algoritmo queda fijado
 * en `AES-256`: cualquier `algorithm` provisto se ignora en favor del único
 * valor admisible, de modo que este helper sea el punto único y documentado de
 * la política de cifrado en reposo (Req 20.2).
 */
export function createAtRestEncryptionConfig(
  overrides: Partial<Omit<AtRestEncryptionConfig, 'algorithm'>> = {},
): AtRestEncryptionConfig {
  return {
    ...DEFAULT_AT_REST_ENCRYPTION_CONFIG,
    ...overrides,
    algorithm: AT_REST_ENCRYPTION_ALGORITHM,
  };
}

/**
 * Indica si una configuración de almacenamiento cumple el cifrado en reposo
 * exigido: cifrado habilitado, algoritmo `AES-256` y una referencia de clave no
 * vacía (Req 20.2).
 */
export function isAtRestEncryptionCompliant(config: AtRestEncryptionConfig): boolean {
  return (
    config.enabled === true &&
    config.algorithm === AT_REST_ENCRYPTION_ALGORITHM &&
    config.keyReference.trim().length > 0
  );
}

/**
 * Error lanzado cuando una configuración de almacenamiento no cumple el cifrado
 * AES-256 en reposo (Req 20.2).
 */
export class AtRestEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRestEncryptionError';
  }
}

/**
 * Guard/assert que exige que una configuración de almacenamiento cifre en reposo
 * con AES-256. Lanza `AtRestEncryptionError` si el cifrado está deshabilitado,
 * el algoritmo no es `AES-256` o falta la referencia de clave. Sirve para que
 * ningún destino de almacenamiento sin cifrar pase la validación previa a
 * persistir binarios (Req 20.2).
 */
export function assertAtRestEncryptionCompliant(config: AtRestEncryptionConfig): void {
  if (!config.enabled) {
    throw new AtRestEncryptionError(
      'El cifrado en reposo debe estar habilitado: no se admite almacenar ' +
        'objetos sin cifrar (Req 20.2).',
    );
  }
  if (config.algorithm !== AT_REST_ENCRYPTION_ALGORITHM) {
    throw new AtRestEncryptionError(
      'El algoritmo de cifrado en reposo debe ser AES-256 (Req 20.2).',
    );
  }
  if (config.keyReference.trim().length === 0) {
    throw new AtRestEncryptionError(
      'La configuración de cifrado en reposo debe referenciar una clave ' +
        'gestionada por la plataforma (Req 20.2).',
    );
  }
}
