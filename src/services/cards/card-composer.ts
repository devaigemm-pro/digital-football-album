// Composición de imagen de la Digital_Card (Generador_Cards — Req 12.1, 12.2).
//
// La composición real de píxeles (renderizado de la fotografía del usuario, el
// marcador del partido y el escudo del Club en una imagen con estética de cromo)
// es I/O de imagen pesado y dependiente de la plataforma. Siguiendo el patrón de
// aislamiento del diseño (design.md · "La lógica de I/O ... se aísla con mocks"),
// se abstrae detrás de esta interfaz `CardComposer`, mockeable en pruebas, que
// recibe las piezas ya resueltas y devuelve un artefacto de imagen (referencia a
// object storage + formato), sin implementar el renderizado real.
//
// Task 13.1 — Requirements: 12.1, 12.2

/**
 * Piezas de contenido que la Digital_Card debe combinar (Req 12.1): la
 * fotografía del usuario, el marcador del partido y el escudo del Club.
 */
export interface CardContenido {
  /** `objectKey` de la fotografía del usuario (Foto_Principal del Momento) (Req 12.1). */
  fotoObjectKey: string;
  /** Marcador del partido, p. ej. "2-1" (Req 12.1). */
  marcador: string;
  /** URL del escudo del Club (Req 12.1). */
  escudoUrl: string;
}

/**
 * Artefacto de imagen resultante de componer una Digital_Card. Se identifica por
 * su `objectKey` en object storage y su `formato` compatible con las plataformas
 * de destino (Req 12.2). No se transportan píxeles por esta capa.
 */
export interface CardArtefacto {
  /** Referencia al binario de la imagen compuesta en object storage. */
  objectKey: string;
  /**
   * Formato de imagen compatible con las plataformas de destino (Req 12.2),
   * p. ej. `'PNG'` o `'JPEG'`.
   */
  formato: CardFormato;
}

/** Formatos de imagen compatibles con las plataformas de destino (Req 12.2). */
export type CardFormato = 'PNG' | 'JPEG';

/**
 * Abstracción de la composición de la imagen de la Digital_Card. La
 * implementación real (renderizado y subida a object storage) queda fuera del
 * dominio; en pruebas se sustituye por un doble que registra el contenido
 * recibido y devuelve un artefacto determinista.
 */
export interface CardComposer {
  /**
   * Compone la imagen de la Digital_Card a partir de sus piezas y devuelve el
   * artefacto resultante en un formato compatible (Req 12.1, 12.2).
   */
  componer(contenido: CardContenido): Promise<CardArtefacto>;
}
