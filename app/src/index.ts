// Barrel raíz de la App_Móvil (cliente React Native + TypeScript).
//
// Task 24 — Requirements: 21.1, 21.2
// Estructura de capas (design.md · "Arquitectura de la App_Móvil"):
//   - viewmodels/: RE-EXPORT de los view-models framework-agnósticos de src/app.
//   - theme/:      mapeo IdentidadVisual -> ClubTheme y (Task 27) provider React.
//   - net/:        cliente HTTP con auth/refresh/TLS (Task 25).
//   - adapters/:   implementaciones de ClubClient/CaptureClient/CardsClient/
//                  NativeShareBridge (Task 25/28/29).
//   - storage/:    Almacenamiento_Seguro del Refresh_Token (Task 25.3).
//   - navigation/: React Navigation (Task 27.2).
//   - screens/:    pantallas UI (Task 26–29).
export * from './viewmodels';
export * from './theme';
// Previsualización del álbum coleccionable (Home/Álbum) — Task 29.1.
export * from './album';
// Cierre anticipado de la Temporada (cliente) — Task 30.4.
export * from './season';
