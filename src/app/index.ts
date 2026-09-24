// Capa de App_Móvil (presentación y captura) — barrel del módulo `app`.
//
// Reúne los view-models framework-agnósticos que la App_Móvil (Flutter / React
// Native / web) consume como su capa de presentación/lógica, sobre los contratos
// de cliente del backend (design.md · "App_Móvil (presentación y captura)"):
//   - Personalización visual por Club (Req 2.1, 2.2): `ClubThemeViewModel`.
//   - Captura de momentos: carga/captura, Foto_Principal y contexto (Req 5.1,
//     5.2, 6.1): `CaptureViewModel`.
//   - Compartición nativa a redes (Req 13.1, 13.2): `ShareViewModel` +
//     `NativeShareBridge`.
//
// Task 21.1 — Requirements: 2.1, 2.2, 5.1, 5.2, 6.1
// Task 21.2 — Requirements: 13.1, 13.2

// Contratos de cliente del backend que consume la app (interfaces inyectables).
export type {
  CaptureClient,
  CardsClient,
  ClubClient,
  DigitalCard,
  FuenteFoto,
  IdentidadVisual,
  MomentoContextoInput,
  UploadFotoInput,
} from './backend-clients.js';

// Personalización visual por Club (Task 21.1 — Req 2.1, 2.2).
export { ClubThemeViewModel, mapIdentidadVisualToTheme } from './club-theme-view-model.js';
export type { ClubTheme, ThemeListener } from './club-theme-view-model.js';

// Captura de momentos (Task 21.1 — Req 5.1, 5.2, 6.1).
export { CaptureViewModel } from './capture-view-model.js';
export type { CaptureMomentInput, CaptureMomentResult } from './capture-view-model.js';

// Compartición nativa a redes (Task 21.2 — Req 13.1, 13.2).
export { SHARE_PLATFORMS } from './native-share-bridge.js';
export type { NativeShareBridge, SharePlatform } from './native-share-bridge.js';
export { PlataformaNoSoportadaError, ShareViewModel } from './share-view-model.js';
