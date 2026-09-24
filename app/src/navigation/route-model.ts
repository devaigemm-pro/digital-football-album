// Modelo de navegación FRAMEWORK-AGNÓSTICO del cliente (Task 27.2)
// — Requirements: 21.1, 21.2
//
// Este archivo describe el GRAFO DE PANTALLAS como DATOS puros en TypeScript,
// sin importar React, React Native ni `@react-navigation/*`. Así la lógica
// relevante para la corrección (qué pantallas existen, cómo se particionan
// entre el stack de autenticación y el navegador de pestañas principal, y qué
// parámetros exige cada ruta) es verificable con `tsc`/Jest sin instalar el
// toolchain nativo del cliente.
//
// El cableado real de React Navigation (stack + tabs) vive en
// `RootNavigator.tsx` (excluido del typecheck hasta instalar dependencias) y
// consume estos tipos/datos como única fuente de verdad del grafo.
//
// Grafo (design.md · "Navegación y pantallas"):
//   - Login              (Req 22)  · stack de autenticación
//   - SeleccionClub      (Req 23)  · stack de autenticación (onboarding)
//   - HomeAlbum          (Req 4)   · pestaña principal
//   - Captura            (Req 24)  · pestaña principal
//   - DetalleCard        (Req 5/6) · pestaña principal (detalle con params)
//   - Suscripcion        (Req 25)  · pestaña principal
//   - EnvioPedido        (Req 8)   · pestaña principal
//   - Ajustes            (Req 22)  · pestaña principal

/** Nombre único de cada pantalla del grafo de navegación. */
export type RouteName =
  | 'Login'
  | 'SeleccionClub'
  | 'HomeAlbum'
  | 'Partidos'
  | 'Captura'
  | 'DetalleCard'
  | 'Suscripcion'
  | 'EnvioPedido'
  | 'Perfil'
  | 'Ajustes';

/**
 * Mapa de parámetros por ruta (equivalente a un `RootStackParamList` de React
 * Navigation, pero agnóstico del framework). `undefined` indica que la ruta no
 * recibe parámetros; un objeto describe los parámetros requeridos/opcionales.
 */
export interface RouteParamList {
  Login: undefined;
  SeleccionClub: undefined;
  HomeAlbum: { temporadaId: string };
  Partidos: { temporadaId: string };
  Captura: { partidoId: string; recuadroId?: string };
  DetalleCard: { recuadroId: string };
  Suscripcion: undefined;
  EnvioPedido: { temporadaId: string };
  Perfil: undefined;
  Ajustes: undefined;
}

/** Parámetros de una ruta concreta (o `undefined` si no lleva parámetros). */
export type ParamsForRoute<R extends RouteName> = RouteParamList[R];

/** Contenedor de navegación al que pertenece cada ruta. */
export type NavigatorKind = 'authStack' | 'mainTabs';

/** Descriptor de una entrada del registro de rutas. */
export interface RouteDescriptor<R extends RouteName = RouteName> {
  /** Nombre único de la ruta. */
  readonly name: R;
  /** Contenedor al que pertenece: stack de auth o pestañas principales. */
  readonly navigator: NavigatorKind;
  /**
   * Claves de parámetros REQUERIDOS para navegar a la ruta. Vacío si la ruta no
   * exige parámetros. Se usa para validar objetivos de navegación en runtime.
   */
  readonly requiredParams: readonly string[];
}

/**
 * Registro tipado del grafo de pantallas. Es la única fuente de verdad que el
 * `RootNavigator` de React Navigation consume para construir el stack de
 * autenticación y el navegador de pestañas.
 */
export const ROUTE_REGISTRY: {
  readonly [R in RouteName]: RouteDescriptor<R>;
} = {
  Login: { name: 'Login', navigator: 'authStack', requiredParams: [] },
  SeleccionClub: {
    name: 'SeleccionClub',
    navigator: 'authStack',
    requiredParams: [],
  },
  HomeAlbum: {
    name: 'HomeAlbum',
    navigator: 'mainTabs',
    requiredParams: ['temporadaId'],
  },
  Partidos: {
    name: 'Partidos',
    navigator: 'mainTabs',
    requiredParams: ['temporadaId'],
  },
  Captura: {
    name: 'Captura',
    navigator: 'mainTabs',
    requiredParams: ['partidoId'],
  },
  DetalleCard: {
    name: 'DetalleCard',
    navigator: 'mainTabs',
    requiredParams: ['recuadroId'],
  },
  Suscripcion: {
    name: 'Suscripcion',
    navigator: 'mainTabs',
    requiredParams: [],
  },
  EnvioPedido: {
    name: 'EnvioPedido',
    navigator: 'mainTabs',
    requiredParams: ['temporadaId'],
  },
  Perfil: { name: 'Perfil', navigator: 'mainTabs', requiredParams: [] },
  Ajustes: { name: 'Ajustes', navigator: 'mainTabs', requiredParams: [] },
};

/** Lista de todos los nombres de ruta del grafo. */
export const ALL_ROUTE_NAMES = Object.keys(ROUTE_REGISTRY) as RouteName[];

/** ¿Es `value` un nombre de ruta conocido del grafo? */
export function isRouteName(value: unknown): value is RouteName {
  return typeof value === 'string' && value in ROUTE_REGISTRY;
}

/** Nombres de las rutas que pertenecen al contenedor indicado. */
export function routesFor(navigator: NavigatorKind): RouteName[] {
  return ALL_ROUTE_NAMES.filter(
    (name) => ROUTE_REGISTRY[name].navigator === navigator,
  );
}

/** Objetivo de navegación validado: ruta + parámetros. */
export interface NavigationTarget<R extends RouteName = RouteName> {
  readonly name: R;
  readonly params: ParamsForRoute<R>;
}

/**
 * Resuelve y valida un objetivo de navegación en runtime. Comprueba que la
 * ruta exista y que estén presentes todos los parámetros requeridos por su
 * descriptor. Devuelve el objetivo validado o lanza un `Error` descriptivo.
 *
 * Complementa la seguridad de tipos en compilación para los casos en que el
 * nombre/params provienen de datos dinámicos (deep links, navegación por
 * nombre) que el compilador no puede verificar.
 */
export function resolveNavigationTarget(
  name: unknown,
  params?: Record<string, unknown>,
): NavigationTarget {
  if (!isRouteName(name)) {
    throw new Error(`Ruta desconocida: ${String(name)}`);
  }
  const descriptor = ROUTE_REGISTRY[name];
  const provided = params ?? {};
  const missing = descriptor.requiredParams.filter(
    (key) => provided[key] === undefined || provided[key] === null,
  );
  if (missing.length > 0) {
    throw new Error(
      `Faltan parámetros requeridos para la ruta ${name}: ${missing.join(', ')}`,
    );
  }
  return { name, params: params as NavigationTarget['params'] };
}
