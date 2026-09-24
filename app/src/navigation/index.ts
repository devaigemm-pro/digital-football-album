// Navegación del cliente: grafo de pantallas (Login, Selección de Club,
// Home/Álbum, Captura, Detalle/Card, Suscripción, Envío/Pedido, Ajustes) y su
// cableado con React Navigation (stack + tabs).
//
// Task 27.2 — Requirements: 21.1, 21.2 (design.md · "Navegación y pantallas").
//
// Este barrel exporta únicamente el MODELO de navegación framework-agnóstico
// (`route-model.ts`): el registro tipado de rutas, la partición entre el stack
// de autenticación y las pestañas principales, y la validación de parámetros.
// Es TypeScript puro (sin React/React Native/@react-navigation) y por eso
// typechea en este entorno.
//
// El cableado real de React Navigation vive en `RootNavigator.tsx`, que se
// excluye del typecheck (app/tsconfig.json · "src/**/*.tsx") hasta instalar el
// toolchain del cliente. No se re-exporta aquí para no arrastrar imports de
// React a este barrel puro; la app raíz importa `RootNavigator` directamente.
export {
  ALL_ROUTE_NAMES,
  ROUTE_REGISTRY,
  isRouteName,
  resolveNavigationTarget,
  routesFor,
} from './route-model';
export type {
  NavigationTarget,
  NavigatorKind,
  ParamsForRoute,
  RouteDescriptor,
  RouteName,
  RouteParamList,
} from './route-model';
