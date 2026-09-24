// Barrel del Generador_Cards (Req 12).
//
// Expone el servicio de generación de Digital Cards con gating premium y la
// abstracción de composición de imagen (mockeable en pruebas).
//
// Task 13.1 — Requirements: 12.1, 12.2, 12.3, 12.4

export {
  CardsService,
  CardsError,
  type CardsErrorCode,
  type CardsServiceDeps,
  type EntitlementsSource,
} from './cards-service.js';

export {
  type CardComposer,
  type CardContenido,
  type CardArtefacto,
  type CardFormato,
} from './card-composer.js';
