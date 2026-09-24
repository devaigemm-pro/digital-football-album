// Clasificador de Partidos (Req 10).
//
// Barrel del servicio de clasificación de cada Partido_Oficial que fija
// `esClasico` y `esInternacional` para alimentar holograma y Digital Cards
// premium (Task 9.1 — Requirements: 10.1, 10.2, 10.3, 10.4).

export { ClassifierService, clasificar, aplicarClasificacion } from './classifier-service.js';
export type { ClasificacionPartido } from './classifier-service.js';
