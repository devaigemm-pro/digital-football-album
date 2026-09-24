// Contrato genérico de repositorio (CRUD) para la capa de persistencia.
//
// Cada entidad del dominio expone un repositorio tipado que extiende este
// contrato con los métodos de consulta que implican sus relaciones del ER.
// El contrato es agnóstico del backend: lo implementan tanto los test doubles
// en memoria (este módulo) como los futuros drivers de PostgreSQL.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

import type { UUID } from '../domain/types.js';

/**
 * Entidad persistible: toda entidad del dominio tiene un `id` UUID como clave
 * primaria. Restringir el genérico a `{ id: UUID }` permite implementar el CRUD
 * de forma uniforme.
 */
export interface Entity {
  readonly id: UUID;
}

/**
 * Parche de actualización: campos parciales de la entidad, excluyendo el `id`
 * (la clave primaria es inmutable). Se usa en `update` para modificaciones
 * parciales sin exigir el objeto completo.
 */
export type Patch<T extends Entity> = Partial<Omit<T, 'id'>>;

/**
 * Contrato CRUD genérico y tipado. Todas las operaciones son asíncronas para
 * ser compatibles con drivers reales (PostgreSQL / red) sin cambiar la firma;
 * las implementaciones en memoria resuelven de inmediato.
 *
 * Diseñado para ser mockeable en pruebas de dominio puro: los servicios
 * dependen de esta interfaz, no de una implementación concreta.
 */
export interface Repository<T extends Entity> {
  /** Persiste una entidad nueva. Falla con `DuplicateIdError` si el `id` ya existe. */
  create(entity: T): Promise<T>;

  /** Devuelve la entidad por su `id`, o `null` si no existe. */
  findById(id: UUID): Promise<T | null>;

  /** Devuelve todas las entidades almacenadas. */
  findAll(): Promise<T[]>;

  /**
   * Aplica un parche parcial a la entidad identificada por `id` y devuelve la
   * entidad resultante. Falla con `NotFoundError` si no existe.
   */
  update(id: UUID, patch: Patch<T>): Promise<T>;

  /**
   * Elimina la entidad por `id`. Devuelve `true` si eliminó algo, `false` si no
   * existía (borrado idempotente, útil para el derecho al olvido — Req 20).
   */
  delete(id: UUID): Promise<boolean>;

  /** Cantidad de entidades almacenadas. */
  count(): Promise<number>;
}
