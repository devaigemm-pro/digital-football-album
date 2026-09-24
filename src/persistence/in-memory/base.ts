// Implementación en memoria del contrato CRUD genérico.
//
// Sirve como test double para pruebas de dominio puro y permite ejercitar la
// lógica de negocio sin un PostgreSQL vivo. No es un driver de producción: el
// estado vive en un `Map` en proceso y se pierde al finalizar.
//
// Las entidades se clonan a la entrada y a la salida (copia superficial) para
// evitar que el llamador mute el estado interno por referencia compartida.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

import type { UUID } from '../../domain/types.js';
import { DuplicateIdError, NotFoundError } from '../errors.js';
import type { Entity, Patch, Repository } from '../repository.js';

/**
 * Repositorio genérico en memoria. Las subclases por entidad heredan el CRUD y
 * añaden los métodos de consulta propios de sus relaciones del ER.
 */
export class InMemoryRepository<T extends Entity> implements Repository<T> {
  /** Nombre de la entidad, usado en los mensajes de error. */
  protected readonly nombreEntidad: string;

  /** Almacén clave→entidad. `protected` para que las subclases hagan consultas. */
  protected readonly store = new Map<UUID, T>();

  constructor(nombreEntidad: string, seed: readonly T[] = []) {
    this.nombreEntidad = nombreEntidad;
    for (const entity of seed) {
      this.store.set(entity.id, { ...entity });
    }
  }

  create(entity: T): Promise<T> {
    if (this.store.has(entity.id)) {
      throw new DuplicateIdError(this.nombreEntidad, entity.id);
    }
    const stored = { ...entity };
    this.store.set(entity.id, stored);
    return Promise.resolve({ ...stored });
  }

  findById(id: UUID): Promise<T | null> {
    const found = this.store.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }

  findAll(): Promise<T[]> {
    return Promise.resolve(Array.from(this.store.values(), (e) => ({ ...e })));
  }

  update(id: UUID, patch: Patch<T>): Promise<T> {
    const current = this.store.get(id);
    if (!current) {
      throw new NotFoundError(this.nombreEntidad, id);
    }
    // El `id` es inmutable: se preserva el original aunque el parche lo incluya.
    const updated = { ...current, ...patch, id: current.id };
    this.store.set(id, updated);
    return Promise.resolve({ ...updated });
  }

  delete(id: UUID): Promise<boolean> {
    return Promise.resolve(this.store.delete(id));
  }

  count(): Promise<number> {
    return Promise.resolve(this.store.size);
  }

  /**
   * Utilidad protegida: devuelve copias de las entidades que cumplen el
   * predicado. Base para los métodos de consulta por relación de las subclases.
   */
  protected filter(predicate: (entity: T) => boolean): T[] {
    const result: T[] = [];
    for (const entity of this.store.values()) {
      if (predicate(entity)) {
        result.push({ ...entity });
      }
    }
    return result;
  }

  /** Utilidad protegida: primera entidad que cumple el predicado, o `null`. */
  protected findOne(predicate: (entity: T) => boolean): T | null {
    for (const entity of this.store.values()) {
      if (predicate(entity)) {
        return { ...entity };
      }
    }
    return null;
  }
}
