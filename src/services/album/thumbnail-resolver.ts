// Motor_Album — abstracción de resolución de miniaturas optimizadas.
//
// La previsualización del álbum coleccionable monta la Foto_Principal de cada
// Recuadro sobre su Recuadro numerado (Req 11.1). Para que el render en red
// móvil sea rápido (objetivo <2s — Req 19.2), la previsualización NO referencia
// el binario original de alta resolución de la foto, sino una **miniatura
// optimizada** derivada de su `objectKey` (design.md · Motor_Album ·
// "mediante miniaturas optimizadas").
//
// La derivación real de la miniatura (redimensionado, recompresión, generación
// de una URL/clave firmada en el object storage o en un CDN) es I/O y depende
// de infraestructura viva. Se modela detrás de una interfaz mockeable para
// aislar el núcleo de lógica de previsualización de ese I/O y poder ejercitar el
// servicio con dobles en memoria (design.md · Testing Strategy).
//
// Task 12.1 — Requirements: 11.1, 11.2, 11.3

/**
 * Contrato mínimo de resolución de miniaturas requerido por el Motor_Album.
 * Dada la `objectKey` del binario original de una Foto_Principal, devuelve la
 * clave/URL de una **miniatura optimizada** apta para la previsualización
 * (Req 11.1; render rápido — Req 19.2).
 *
 * Se define como una operación potencialmente asíncrona para permitir
 * implementaciones que consulten un CDN, firmen URLs o materialicen la
 * miniatura bajo demanda, sin acoplar el servicio a ninguna de esas estrategias.
 */
export interface ThumbnailResolver {
  /**
   * Resuelve la clave/URL de la miniatura optimizada a partir de la `objectKey`
   * del binario original de la foto.
   *
   * @param objectKey Clave del binario original en el object storage.
   * @returns La clave/URL de la miniatura optimizada a mostrar en la vista previa.
   */
  resolveThumbnail(objectKey: string): Promise<string> | string;
}

/**
 * Resolutor de miniaturas determinista para pruebas y como estrategia base
 * simple: deriva la clave de la miniatura anteponiendo un prefijo optimizado a
 * la `objectKey` original (p. ej. `fotos/1` → `thumbs/optimized/fotos/1`).
 *
 * Es puro y determinista, de modo que las pruebas puedan verificar que la
 * previsualización referencia una clave optimizada distinta del binario
 * original sin infraestructura viva.
 */
export class PrefixThumbnailResolver implements ThumbnailResolver {
  /**
   * @param prefijo Prefijo aplicado a la `objectKey` original (por defecto
   *   `thumbs/optimized/`).
   */
  constructor(private readonly prefijo = 'thumbs/optimized/') {}

  resolveThumbnail(objectKey: string): string {
    return `${this.prefijo}${objectKey}`;
  }
}
