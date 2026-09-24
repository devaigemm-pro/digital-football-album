// View-models de la App_Móvil — RE-EXPORT de los framework-agnósticos del repo.
//
// Task 24 — Requirements: 21.1, 21.2
//
// Los view-models framework-agnósticos ya existen en el backend en
// `src/app` (design.md · "Arquitectura de la App_Móvil (cliente React Native)"
// · "Capas del cliente" y "Estructura de carpetas propuesta"). Son TypeScript
// puro sin dependencias de React Native, por lo que se REUTILIZAN directamente
// —no se reimplementan— re-exportándolos desde aquí para que la UI del cliente
// los consuma como su capa de view-models.
//
// Ruta de re-export: `../../../src/app` resuelve, desde
// `app/src/viewmodels/`, al directorio `src/app` en la raíz del repositorio:
//   app/src/viewmodels/index.ts
//   app/src/         -> ..
//   app/             -> ../..
//   <raíz repo>      -> ../../..
//   <raíz repo>/src/app  -> ../../../src/app
//
// La resolución sin extensión funciona con `moduleResolution: "bundler"` (Metro)
// del tsconfig del cliente. Los symbols provienen del barrel `src/app/index.ts`.

// Personalización visual por Club (Req 23 cliente / Req 2 backend).
export {
  ClubThemeViewModel,
  mapIdentidadVisualToTheme,
} from '../../../src/app';
export type { ClubTheme, ThemeListener } from '../../../src/app';

// Captura de momentos: carga/captura, Foto_Principal y contexto (Req 3 cliente).
export { CaptureViewModel } from '../../../src/app';
export type {
  CaptureMomentInput,
  CaptureMomentResult,
} from '../../../src/app';

// Compartición nativa a redes (Req 6 cliente / Req 13 backend).
export {
  PlataformaNoSoportadaError,
  SHARE_PLATFORMS,
  ShareViewModel,
} from '../../../src/app';
export type { NativeShareBridge, SharePlatform } from '../../../src/app';

// Contratos de cliente del backend que consumen los view-models (interfaces
// inyectables): la UI/adaptadores implementan estos contratos y se inyectan.
export type {
  CaptureClient,
  CardsClient,
  ClubClient,
  DigitalCard,
  FuenteFoto,
  IdentidadVisual,
  MomentoContextoInput,
  UploadFotoInput,
} from '../../../src/app';
