// Barrel del Print_Engine (Req 16.5, 17, 18, 19.1).
//
// Expone la orquestación transaccional `generarKit` (que ata escala a 300 DPI,
// generación de PDF_Libro y PDF_Stickers, validación de biunivocidad, publicación
// atómica y recuperación acotada), junto con las abstracciones mockeables de
// infraestructura (renderer, almacenamiento temporal, notificador) y los helpers
// de dominio puro (DPI, composición de specs, biunivocidad, holograma).
//
// Se reexporta desde `../index.ts` bajo el espacio de nombres `printEngine` para
// evitar colisiones de nombres compartidos (p. ej. `Clock`, errores).
//
// Task 15.1–15.5 — Requirements: 16.5, 17.1–17.4, 18.1–18.8, 19.1

// Orquestación (Task 15.4, 15.5).
export {
  PrintEngineService,
  PrintEngineFallidaError,
  AlbumNoEncontradoError,
  MAX_INTENTOS_IMPRESION,
  BACKOFF_BASE_MS,
} from './print-engine-service.js';
export type {
  PrintEngineDeps,
  GenerarKitResultado,
  Clock,
  Sleep,
  PaginasClubProvider,
} from './print-engine-service.js';

// Escala/validación a 300 DPI (Task 15.1 — Req 19.1).
export {
  MIN_DPI,
  MM_PER_INCH,
  mmToInches,
  computeDpi,
  validateDpi,
  validateFotoDpi,
  computeScaleFactor,
  scaleToMinDpi,
} from './dpi.js';
export type { DpiValidacion, DimensionesPx, DimensionesFisicasMm } from './dpi.js';

// Composición del PDF_Libro (Task 15.2 — Req 16.5, 17.1–17.4).
export { buildPdfLibroSpec, buildRecuadroLibro } from './pdf-libro.js';
export type { BuildPdfLibroInput, PaginaClub, ResolverFotoObjectKey } from './pdf-libro.js';

// Composición del PDF_Stickers (Task 15.3 — Req 18.1–18.3, 18.5, 18.6).
export {
  buildPdfStickersSpec,
  debeAplicarHolograma,
  FotoPrincipalNoResoluble,
  TROQUELADO_DESVIACION_MM,
  TOLERANCIA_TROQUELADO_MM,
} from './pdf-stickers.js';
export type { BuildPdfStickersInput } from './pdf-stickers.js';

// Validación de biunivocidad (Task 15.4 — Req 18.4, 18.7).
export { validarBiunivocidad } from './biunivocity.js';
export type { BiunivocidadResultado, Discrepancia, TipoDiscrepancia } from './biunivocity.js';

// Abstracciones de infraestructura y modelos de layout (mockeables).
export type {
  PdfRenderer,
  TempStorage,
  OperatorNotifier,
  OperatorAlerta,
  PublishResult,
  PdfArtefacto,
  TipoPdf,
  MotivoAborto,
  PdfLibroSpec,
  PaginaLibro,
  RecuadroLibro,
  RenderRecuadro,
  GuiaNumerada,
  PdfStickersSpec,
  StickerSpec,
} from './renderer.js';
