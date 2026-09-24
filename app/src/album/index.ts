// Barrel de la capa de previsualización del álbum (Home/Álbum) del cliente.
//
// Task 29.1 — Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
// Expone el presentador framework-agnóstico y sus tipos para que la pantalla
// `HomeAlbumScreen.tsx` y los adaptadores los consuman.
export {
  ALBUM_PREVIEW_ERROR_MESSAGE,
  AlbumPreviewPresenter,
} from './album-preview-presenter';
export type {
  AlbumPreviewClient,
  AlbumPreviewData,
  AlbumPreviewEntry,
  AlbumPreviewEntryMontada,
  AlbumPreviewEntryVacio,
  AlbumPreviewState,
  AlbumPreviewStateListener,
  AlbumPreviewStatus,
  MiniaturaKey,
} from './album-preview-presenter';
