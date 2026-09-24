// Abstracción de Object Storage para el Servicio_Autenticación.
//
// Las fotos originales viven en object storage (S3 / Firebase Storage), separado
// de la base relacional (design.md — "Almacenamiento de objetos separado de la
// base relacional", Req 5, 19, 20). El borrado de cuenta (derecho al olvido)
// debe eliminar de forma permanente esos binarios además de los metadatos.
//
// Se modela detrás de una interfaz mockeable para poder ejercitar el borrado con
// dobles en memoria, sin un backend de almacenamiento vivo, y para aislar el I/O
// del núcleo de lógica (permite 100+ iteraciones de PBT a bajo costo — design.md
// Testing Strategy).
//
// Task 3.2 — Requirements: 20 (borrado de cuenta)

/**
 * Contrato mínimo de almacenamiento de objetos requerido por el borrado de
 * cuenta. Solo expone la operación de borrado por clave (`objectKey`), que es la
 * que persiste `Foto.objectKey`.
 */
export interface ObjectStorage {
  /**
   * Elimina el objeto identificado por `objectKey`. Debe ser **idempotente**:
   * borrar una clave inexistente (p. ej. en un reintento tras fallo parcial) no
   * es un error. Devuelve `true` si el objeto existía y se eliminó, `false` si
   * ya no estaba presente.
   */
  delete(objectKey: string): Promise<boolean>;
}

/**
 * Doble en memoria de `ObjectStorage` para pruebas. Registra las claves
 * presentes y el historial de borrados solicitados, de modo que las pruebas
 * puedan verificar que cada `Foto.objectKey` se eliminó y que el borrado es
 * idempotente ante reintentos.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objetos: Set<string>;

  /** Historial de todas las claves cuyo borrado se solicitó (incluye repetidos). */
  readonly borradosSolicitados: string[] = [];

  constructor(clavesIniciales: Iterable<string> = []) {
    this.objetos = new Set(clavesIniciales);
  }

  delete(objectKey: string): Promise<boolean> {
    this.borradosSolicitados.push(objectKey);
    return Promise.resolve(this.objetos.delete(objectKey));
  }

  /** ¿Sigue presente el objeto? (utilidad para aserciones de pruebas). */
  has(objectKey: string): boolean {
    return this.objetos.has(objectKey);
  }

  /** Cantidad de objetos presentes (utilidad para aserciones de pruebas). */
  get size(): number {
    return this.objetos.size;
  }
}
