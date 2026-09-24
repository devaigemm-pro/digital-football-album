// Tema del Club del cliente: provider de Tema_Club.
//
// Task 24 (scaffold) — Requirements: 21.1, 21.2
// Task 27.1 — Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
//
// Re-exporta el mapeo framework-agnóstico IdentidadVisual -> ClubTheme del
// `ClubThemeViewModel` (design.md · "Aplicación del Tema del Club"), que es
// TypeScript puro y se reutiliza aquí, junto con el `ClubThemeController`: el
// núcleo puro (sin React) que envuelve ese view-model, expone el `ClubTheme`
// actual con API subscribe/getState, invoca `PUT /usuario/club` al seleccionar
// Club, aplica el tema y maneja el `409` por Temporada activa conservando el
// Club (Req 23.1–23.5).
//
// El context/provider de React que aplica el tema a la UI vive en
// `ClubThemeProvider.tsx`. Ese `.tsx` está EXCLUIDO del typecheck de
// `app/tsconfig.json` mientras React/React Native no estén instalados (ver
// `app/README.md`); toda la lógica sensible a la corrección reside en el
// controlador puro de este barrel, no en el `.tsx`.

// Mapeo puro reutilizado del backend.
export { mapIdentidadVisualToTheme } from '../viewmodels';
export type { ClubTheme } from '../viewmodels';

// Sistema de diseño (tokens puros derivados del mockup public/album.html).
// TypeScript puro (sin React) que SÍ participa del typecheck; las pantallas
// `.tsx` lo consumen para pintar con un lenguaje visual consistente.
export {
  buildTheme,
  fonts,
  fontSize,
  fontWeight,
  isHexColor,
  palette,
  radius,
  shadow,
  spacing,
} from './design-tokens';
export type {
  AppTheme,
  FontSizeToken,
  Palette,
  RadiusToken,
  SpacingToken,
} from './design-tokens';

// Núcleo puro del provider de Tema_Club (Task 27.1).
export {
  CLUB_CHANGE_CONFLICT,
  CLUB_CHANGE_CONFLICT_MESSAGE,
  ClubThemeController,
  contrastingTextColor,
} from './club-theme-controller';
export type {
  ClubThemeStateListener,
  ClubThemeUUID,
  SelectClubResult,
} from './club-theme-controller';
