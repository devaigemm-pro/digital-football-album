/**
 * Pruebas unitarias del cifrado en reposo de objetos (Task 20.1 —
 * Requirements: 20.2).
 *
 * Cubren:
 *  - `createAtRestEncryptionConfig` fija AES-256 y completa por defecto.
 *  - El algoritmo AES-256 no es sobreescribible desde overrides.
 *  - `isAtRestEncryptionCompliant` / `assertAtRestEncryptionCompliant` aceptan
 *    una configuración cifrada con AES-256 y rechazan las no conformes
 *    (deshabilitada, algoritmo distinto, referencia de clave vacía).
 */
import { describe, it, expect } from 'vitest';
import {
  AT_REST_ENCRYPTION_ALGORITHM,
  DEFAULT_AT_REST_ENCRYPTION_CONFIG,
  AtRestEncryptionError,
  assertAtRestEncryptionCompliant,
  createAtRestEncryptionConfig,
  isAtRestEncryptionCompliant,
  type AtRestEncryptionConfig,
} from './at-rest-encryption.js';

describe('createAtRestEncryptionConfig', () => {
  it('usa AES-256 y valores por defecto sin overrides', () => {
    const config = createAtRestEncryptionConfig();

    expect(config).toEqual(DEFAULT_AT_REST_ENCRYPTION_CONFIG);
    expect(config.algorithm).toBe('AES-256');
    expect(config.enabled).toBe(true);
    expect(config.keyReference.length).toBeGreaterThan(0);
  });

  it('permite personalizar la referencia de clave y el flag enabled', () => {
    const config = createAtRestEncryptionConfig({
      keyReference: 'arn:aws:kms:region:acct:key/abc',
      enabled: true,
    });

    expect(config.keyReference).toBe('arn:aws:kms:region:acct:key/abc');
    expect(config.algorithm).toBe(AT_REST_ENCRYPTION_ALGORITHM);
  });

  it('mantiene AES-256 aunque se intente sobreescribir el algoritmo', () => {
    // Se fuerza un algoritmo inválido por casting para simular un override.
    const config = createAtRestEncryptionConfig({
      // @ts-expect-error algorithm no forma parte de los overrides admitidos.
      algorithm: 'AES-128',
    });

    expect(config.algorithm).toBe('AES-256');
  });
});

describe('isAtRestEncryptionCompliant', () => {
  it('es true para la configuración por defecto (AES-256, habilitado)', () => {
    expect(isAtRestEncryptionCompliant(DEFAULT_AT_REST_ENCRYPTION_CONFIG)).toBe(true);
  });

  it('es false cuando el cifrado está deshabilitado', () => {
    const config = createAtRestEncryptionConfig({ enabled: false });
    expect(isAtRestEncryptionCompliant(config)).toBe(false);
  });

  it('es false cuando el algoritmo no es AES-256', () => {
    const config: AtRestEncryptionConfig = {
      ...DEFAULT_AT_REST_ENCRYPTION_CONFIG,
      // @ts-expect-error algoritmo no admitido, simula configuración corrupta.
      algorithm: 'AES-128',
    };
    expect(isAtRestEncryptionCompliant(config)).toBe(false);
  });

  it('es false cuando la referencia de clave está vacía', () => {
    const config = createAtRestEncryptionConfig({ keyReference: '   ' });
    expect(isAtRestEncryptionCompliant(config)).toBe(false);
  });
});

describe('assertAtRestEncryptionCompliant', () => {
  it('no lanza para una configuración AES-256 habilitada y con clave', () => {
    expect(() => assertAtRestEncryptionCompliant(DEFAULT_AT_REST_ENCRYPTION_CONFIG)).not.toThrow();
  });

  it('lanza AtRestEncryptionError si el cifrado está deshabilitado', () => {
    const config = createAtRestEncryptionConfig({ enabled: false });
    expect(() => assertAtRestEncryptionCompliant(config)).toThrow(AtRestEncryptionError);
  });

  it('lanza AtRestEncryptionError si el algoritmo no es AES-256', () => {
    const config: AtRestEncryptionConfig = {
      ...DEFAULT_AT_REST_ENCRYPTION_CONFIG,
      // @ts-expect-error algoritmo no admitido, simula configuración corrupta.
      algorithm: 'ChaCha20',
    };
    expect(() => assertAtRestEncryptionCompliant(config)).toThrow(AtRestEncryptionError);
  });

  it('lanza AtRestEncryptionError si falta la referencia de clave', () => {
    const config = createAtRestEncryptionConfig({ keyReference: '' });
    expect(() => assertAtRestEncryptionCompliant(config)).toThrow(AtRestEncryptionError);
  });
});
