// Abstracciones de infraestructura del Print_Engine (renderer, almacenamiento
// temporal, alerta al operador) y los modelos de layout que describen el
// contenido de los PDFs (Req 16, 17, 18).
//
// El renderizado real de bytes de PDF/imagen es I/O pesado y dependiente de la
// plataforma; siguiendo el patrón del diseño ("La lógica de I/O ... se aísla con
// mocks"), se abstrae detrás de interfaces mockeables. Este módulo NO produce
// bytes de PDF reales: describe QUÉ debe contener cada PDF (páginas, recuadros,
// stickers, guías, holograma) mediante estructuras de datos verificables, y
// delega la materialización en un `PdfRenderer` inyectable.
//
// Task 15.2, 15.3, 15.4, 15.5 — Requirements: 16.5, 17.1–17.4, 18.1–18.8

import type { UUID } from '../../domain/types.js';

// ---------------------------------------------------------------------------
// Modelos de layout del PDF_Libro (Req 17.1–17.4, 16.5)
// ---------------------------------------------------------------------------

/**
 * Cómo se representa un Recuadro en el PDF_Libro:
 *  - `MONTAJE`: tiene Foto_Principal y se monta con guías de pegado (Req 17.2).
 *  - `SILUETA`: sin Foto_Principal; silueta punteada + guías numeradas (Req 17.3, 16.5).
 */
export type RenderRecuadro = 'MONTAJE' | 'SILUETA';

/**
 * Guía de pegado/corte con su desviación respecto de la posición nominal, en mm.
 * La tolerancia de troquelado exige `desviacionMm <= 0,5` (Req 18.3, Property 26).
 */
export interface GuiaNumerada {
  /** Número del Recuadro/sticker al que pertenece la guía (Req 17.2, 17.3). */
  readonly numero: number;
  /** Desviación respecto de la posición nominal, en mm (Req 18.3). */
  readonly desviacionMm: number;
}

/** Descripción de un Recuadro tal como aparecerá en una página del PDF_Libro. */
export interface RecuadroLibro {
  readonly recuadroId: UUID;
  /** Número heredado del Recuadro (corresponde con el sticker — Req 17.4). */
  readonly numero: number;
  /** Montaje (con foto) o silueta punteada (vacío) — Req 17.2, 17.3, 16.5. */
  readonly modo: RenderRecuadro;
  /** `objectKey` de la Foto_Principal montada, o `null` si es silueta. */
  readonly fotoObjectKey: string | null;
  /** Guía de pegado numerada del Recuadro (Req 17.2, 17.3). */
  readonly guiaPegado: GuiaNumerada;
}

/** Sección de una página del PDF_Libro con los fondos/estadísticas del Club (Req 17.1). */
export interface PaginaLibro {
  /** Referencia al fondo del Club de la página (Req 17.1). */
  readonly fondoClubUrl: string;
  /** Bloque de estadísticas de la página (texto ya compuesto) (Req 17.1). */
  readonly estadisticas: string;
  /** Recuadros numerados contenidos en la página (Req 17.1). */
  readonly recuadros: readonly RecuadroLibro[];
}

/** Especificación completa del PDF_Libro a renderizar (Req 17.1–17.4, 16.5). */
export interface PdfLibroSpec {
  readonly temporadaId: UUID;
  readonly paginas: readonly PaginaLibro[];
}

// ---------------------------------------------------------------------------
// Modelos de layout del PDF_Stickers (Req 18.1–18.6)
// ---------------------------------------------------------------------------

/** Descripción de un sticker del PDF_Stickers. */
export interface StickerSpec {
  readonly recuadroId: UUID;
  /** Número heredado del Recuadro; la secuencia puede tener huecos (Req 18.1). */
  readonly numero: number;
  /** `objectKey` de la Foto_Principal del sticker (siempre presente — Req 18.1). */
  readonly fotoObjectKey: string;
  /** Guía de corte/troquelado con desviación ≤0,5 mm (Req 18.3, Property 26). */
  readonly guiaTroquelado: GuiaNumerada;
  /** `true` si el sticker lleva efecto holograma (Req 18.5, 18.6, Property 27). */
  readonly holograma: boolean;
}

/** Especificación completa del PDF_Stickers a renderizar (Req 18.1–18.6). */
export interface PdfStickersSpec {
  readonly temporadaId: UUID;
  /** Stickers, uno por Recuadro con Foto_Principal, numeración posiblemente no contigua. */
  readonly stickers: readonly StickerSpec[];
}

// ---------------------------------------------------------------------------
// Artefactos y almacenamiento temporal (atomicidad — Req 18.7, 18.8)
// ---------------------------------------------------------------------------

/** Tipo de archivo de impresión generado. */
export type TipoPdf = 'PDF_LIBRO' | 'PDF_STICKERS';

/**
 * Artefacto de PDF ya materializado por el renderer, referenciado por su
 * ubicación temporal en `TempStorage`. No transporta bytes; la publicación
 * atómica sólo mueve/confirma estas referencias (Req 18.7, 18.8).
 */
export interface PdfArtefacto {
  readonly tipo: TipoPdf;
  /** Ubicación del binario en el almacenamiento temporal. */
  readonly tempKey: string;
}

/**
 * Renderer de PDF inyectable. Materializa las specs en artefactos ubicados en
 * almacenamiento temporal. Puede fallar (lanzar) para simular fallos de
 * procesamiento que el orquestador debe manejar de forma atómica (Req 18.8).
 * No implementa el renderizado real de bytes.
 */
export interface PdfRenderer {
  /** Renderiza el PDF_Libro a almacenamiento temporal (Req 17.1–17.4). */
  renderLibro(spec: PdfLibroSpec): Promise<PdfArtefacto>;
  /** Renderiza el PDF_Stickers a almacenamiento temporal (Req 18.1–18.6). */
  renderStickers(spec: PdfStickersSpec): Promise<PdfArtefacto>;
}

/**
 * Almacenamiento temporal + publicación atómica de los artefactos (Req 18.7,
 * 18.8). La generación se ejecuta contra almacenamiento temporal y sólo se
 * publica el kit completo cuando TODAS las validaciones pasan (design.md ·
 * "Print_Engine ... se ejecuta contra almacenamiento temporal y solo se publica
 * el resultado si ambas validaciones ... pasan"). Nunca se publica un PDF
 * parcial (Property 28).
 */
export interface TempStorage {
  /**
   * Publica atómicamente el conjunto completo de artefactos temporales como el
   * kit definitivo de la Temporada. Se invoca sólo tras validar biunivocidad y
   * DPI (Req 18.4, 18.7). Devuelve las claves definitivas publicadas.
   */
  publish(temporadaId: UUID, artefactos: readonly PdfArtefacto[]): Promise<PublishResult>;
  /**
   * Descarta los artefactos temporales de un intento abortado, garantizando que
   * no queda ningún PDF parcial (Property 28). Idempotente.
   */
  discard(artefactos: readonly PdfArtefacto[]): Promise<void>;
}

/** Resultado de una publicación atómica del kit (Req 18.7, 18.8). */
export interface PublishResult {
  readonly temporadaId: UUID;
  /** Clave definitiva del PDF_Libro publicado. */
  readonly libroKey: string;
  /** Clave definitiva del PDF_Stickers publicado. */
  readonly stickersKey: string;
}

// ---------------------------------------------------------------------------
// Alerta al operador (recuperación de impresión fallida — Req 18.7, 18.8)
// ---------------------------------------------------------------------------

/** Motivo por el que un intento de generación abortó (auditoría/alerta). */
export type MotivoAborto =
  /** Discrepancia de correspondencia biunívoca (conteo/faltante/duplicado) (Req 18.7). */
  | 'BIUNIVOCIDAD'
  /** Alguna Foto_Principal no alcanza los 300 DPI (Req 19.1, 18.7). */
  | 'DPI'
  /** Fallo durante el procesamiento/render del PDF (Req 18.8). */
  | 'PROCESAMIENTO';

/**
 * Alerta que se emite al operador cuando la generación falla de forma
 * persistente tras agotar los reintentos (Req 18.7, 18.8; design.md · "se emite
 * una alerta al operador para revisión manual").
 */
export interface OperatorAlerta {
  readonly temporadaId: UUID;
  readonly motivo: MotivoAborto;
  /** Mensaje legible que describe la discrepancia/fallo detectado. */
  readonly mensaje: string;
  /** Número de intentos consumidos antes de alertar (`Pedido.intentosImpresion`). */
  readonly intentos: number;
  /** Instante de emisión de la alerta (epoch ms), del reloj inyectado. */
  readonly emitidaEn: number;
}

/**
 * Notificador inyectable de alertas al operador y al usuario (Req 18.7, 18.8).
 * En pruebas se sustituye por un doble que registra las alertas emitidas.
 */
export interface OperatorNotifier {
  /** Emite una alerta al operador para revisión manual tras agotar reintentos. */
  alertarOperador(alerta: OperatorAlerta): Promise<void>;
  /**
   * Notifica al usuario que la generación no se completó, con el mensaje de la
   * discrepancia/fallo detectado (Req 18.7, 18.8).
   */
  notificarUsuario(temporadaId: UUID, mensaje: string): Promise<void>;
}
