// Errores de la capa de persistencia.
//
// Se definen errores tipados para que tanto las implementaciones en memoria
// (test doubles) como los futuros drivers reales (PostgreSQL) reporten fallos
// de forma homogénea y verificable en pruebas.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

/** Error base de la capa de persistencia. */
export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

/**
 * Se lanza al intentar crear una entidad con un `id` que ya existe en el
 * repositorio. Preserva la biunivocidad de la clave primaria.
 */
export class DuplicateIdError extends PersistenceError {
  constructor(
    public readonly entidad: string,
    public readonly id: string,
  ) {
    super(`Ya existe ${entidad} con id "${id}"`);
    this.name = 'DuplicateIdError';
  }
}

/**
 * Se lanza al intentar actualizar o eliminar una entidad inexistente. Permite a
 * los servicios de dominio distinguir "no encontrado" de otros fallos.
 */
export class NotFoundError extends PersistenceError {
  constructor(
    public readonly entidad: string,
    public readonly id: string,
  ) {
    super(`No se encontró ${entidad} con id "${id}"`);
    this.name = 'NotFoundError';
  }
}

/**
 * Se lanza al violar una restricción de unicidad distinta de la clave primaria
 * (p. ej. a lo sumo una Foto_Principal por Recuadro, unicidad Partido↔Recuadro).
 */
export class UniqueConstraintError extends PersistenceError {
  constructor(
    public readonly entidad: string,
    public readonly restriccion: string,
  ) {
    super(`Violación de unicidad en ${entidad}: ${restriccion}`);
    this.name = 'UniqueConstraintError';
  }
}
