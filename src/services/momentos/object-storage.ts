// Motor_Momentos — abstracción de Object Storage con capacidad de carga.
//
// Las fotos originales viven en object storage (S3 / Firebase Storage), separado
// de la base relacional (design.md — "Almacenamiento de objetos separado de la
// base relacional", Req 5, 19, 20). La carga/captura de una foto (Req 5.1, 5.2)
// sube los bytes del binario a este almacenamiento y persiste únicamente la
// `objectKey` resultante en `Foto.objectKey`.
//
// Se define una interfaz **propia del módulo `momentos`** con capacidad de
// subida (`upload`) en lugar de reutilizar la abstracción de solo-borrado del
// Servicio_Autenticación: el Motor_Momentos necesita escribir binarios, no
// borrarlos. Modelarla detrás de una interfaz mockeable permite ejercitar la
// carga con dobles en memoria, sin un backend de almacenamiento vivo, y aísla el
// I/O del núcleo de lógica (permite 100+ iteraciones de PBT a bajo costo —
// design.md Testing Strategy).
//
// Task 11.1 — Requirements: 5.1, 5.2, 5.3, 5.4

/** Bytes de una foto a subir al object storage. */
export type Binario = Uint8Array;

/**
 * Contrato mínimo de almacenamiento de objetos con capacidad de **carga**
 * requerido por el Motor_Momentos. Sube los bytes de una foto y devuelve la
 * `objectKey` bajo la que quedó almacenada, que luego se persiste en
 * `Foto.objectKey`.
 */
export interface ObjectStorage {
  /**
   * Sube los bytes de un binario al almacenamiento y devuelve la `objectKey`
   * asignada. La implementación es libre de derivar la clave (p. ej. por hash o
   * por prefijo/uuid); el llamador solo persiste la clave devuelta.
   */
  upload(binario: Binario): Promise<string>;
}

/**
 * Doble en memoria de `ObjectStorage` para pruebas. Almacena cada binario bajo
 * una `objectKey` generada de forma determinista e incremental, y registra el
 * historial de subidas para que las pruebas puedan verificar que cada carga de
 * foto subió sus bytes al almacenamiento.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objetos = new Map<string, Binario>();

  /** Historial de todas las `objectKey` cuya subida se completó, en orden. */
  readonly cargasSolicitadas: string[] = [];

  private contador = 0;

  /**
   * @param prefijo Prefijo de las claves generadas (por defecto `fotos/`).
   */
  constructor(private readonly prefijo = 'fotos/') {}

  upload(binario: Binario): Promise<string> {
    this.contador += 1;
    const objectKey = `${this.prefijo}${this.contador}`;
    this.objetos.set(objectKey, binario);
    this.cargasSolicitadas.push(objectKey);
    return Promise.resolve(objectKey);
  }

  /** Recupera los bytes almacenados bajo una clave (utilidad para pruebas). */
  get(objectKey: string): Binario | undefined {
    return this.objetos.get(objectKey);
  }

  /** ¿Existe un objeto con esa clave? (utilidad para pruebas). */
  has(objectKey: string): boolean {
    return this.objetos.has(objectKey);
  }

  /** Cantidad de objetos almacenados (utilidad para pruebas). */
  get size(): number {
    return this.objetos.size;
  }
}
