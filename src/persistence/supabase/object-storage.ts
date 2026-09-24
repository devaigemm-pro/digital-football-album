// Adaptador de Object Storage sobre Supabase Storage.
//
// Implementa las dos interfaces `ObjectStorage` del dominio contra un bucket de
// Supabase Storage real:
//   - `upload(binario)` (Motor_Momentos): sube los bytes y devuelve la objectKey.
//   - `delete(objectKey)` (borrado de cuenta): elimina el objeto (idempotente).
//
// Convención de ruta: `<prefijo>/<uuid>`, donde `<prefijo>` suele ser el id del
// usuario dueño. Así las políticas RLS del bucket (`storage.foldername(name)[1]
// = auth.uid()`) aíslan los objetos por usuario cuando se usa la clave pública
// + JWT; con la service_role (backend de confianza) se omite RLS.

import { randomUUID } from 'node:crypto';
import type { UUID } from '../../domain/types.js';
import type { TypedSupabaseClient } from './client.js';

/** Bytes de una foto. Alineado con `Binario` del Motor_Momentos. */
export type Binario = Uint8Array;

/** Opciones del adaptador de Storage. */
export interface SupabaseObjectStorageOptions {
  /** Nombre del bucket. Por defecto `fotos`. */
  readonly bucket?: string;
  /**
   * Prefijo de las claves generadas en `upload`, típicamente el id del usuario
   * dueño (para encajar con las políticas RLS por carpeta). Por defecto vacío.
   */
  readonly prefix?: string;
  /** Content-type de los binarios subidos. Por defecto `application/octet-stream`. */
  readonly contentType?: string;
  /** Generador de nombres únicos. Por defecto `crypto.randomUUID`. */
  readonly newId?: () => UUID;
}

/**
 * Adaptador de almacenamiento de objetos respaldado por Supabase Storage.
 * Cumple tanto la interfaz de subida (`upload`) del Motor_Momentos como la de
 * borrado (`delete`) del borrado de cuenta.
 */
export class SupabaseObjectStorage {
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly contentType: string;
  private readonly newId: () => UUID;

  constructor(
    private readonly client: TypedSupabaseClient,
    options: SupabaseObjectStorageOptions = {},
  ) {
    this.bucket = options.bucket ?? 'fotos';
    this.prefix = options.prefix ?? '';
    this.contentType = options.contentType ?? 'application/octet-stream';
    this.newId = options.newId ?? (() => randomUUID());
  }

  /**
   * Sube los bytes de un binario y devuelve la `objectKey` asignada. La clave se
   * deriva como `<prefix>/<uuid>` (sin doble barra si no hay prefijo).
   */
  async upload(binario: Binario): Promise<string> {
    const objectKey = this.prefix ? `${this.prefix}/${this.newId()}` : this.newId();

    const { error } = await this.client.storage.from(this.bucket).upload(objectKey, binario, {
      contentType: this.contentType,
      upsert: false,
    });

    if (error) {
      throw new Error(`[SupabaseObjectStorage] fallo al subir "${objectKey}": ${error.message}`);
    }
    return objectKey;
  }

  /**
   * Elimina el objeto identificado por `objectKey`. Idempotente: borrar una
   * clave inexistente no es error. Devuelve `true` si se eliminó algo.
   */
  async delete(objectKey: string): Promise<boolean> {
    const { data, error } = await this.client.storage.from(this.bucket).remove([objectKey]);

    if (error) {
      throw new Error(`[SupabaseObjectStorage] fallo al borrar "${objectKey}": ${error.message}`);
    }
    // `remove` devuelve la lista de objetos efectivamente eliminados.
    return (data?.length ?? 0) > 0;
  }
}
