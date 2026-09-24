// Barrel de la capa de generación de Digital Cards y su gating visible del
// cliente (Detalle/Card).
//
// Task 29.2 — Requirements: 5.1, 5.2, 5.3, 5.4
// Expone el presentador framework-agnóstico y sus tipos para que la pantalla
// `DigitalCardScreen.tsx` y los adaptadores los consuman.
export {
  CARD_GENERIC_ERROR_MESSAGE,
  CardPresenter,
  PREMIUM_REQUIRED_CARD_MESSAGE,
} from './card-presenter';
export type {
  CardErrorKind,
  CardState,
  CardStateListener,
  CardStatus,
} from './card-presenter';
