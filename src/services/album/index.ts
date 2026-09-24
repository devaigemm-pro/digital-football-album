// Barrel del Motor_Album (Req 11, 19.2).
//
// Expone el servicio de previsualización del álbum coleccionable y la
// abstracción de resolución de miniaturas optimizadas (mockeable en pruebas).
//
// Task 12.1 — Requirements: 11.1, 11.2, 11.3

export {
  AlbumPreviewService,
  AlbumPreviewError,
  type AlbumPreviewErrorCode,
  type AlbumPreviewServiceDeps,
  type AlbumPreview,
  type PreviewRecuadro,
  type PreviewRecuadroMontada,
  type PreviewRecuadroVacio,
  type EstadoPreviewRecuadro,
} from './preview-service.js';

export { type ThumbnailResolver, PrefixThumbnailResolver } from './thumbnail-resolver.js';
