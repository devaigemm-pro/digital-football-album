// Pruebas del modelo de navegación (Task 27.2) — Requirements: 21.1, 21.2
//
// TypeScript puro (shim central de globales de Jest en src/testing): NO
// requieren React, React Native ni `@react-navigation/*`. Verifican que el
// grafo de pantallas del cliente coincide con design.md · "Navegación y
// pantallas": las 8 pantallas esperadas, su partición entre el stack de
// autenticación y el navegador de pestañas, y la validación de parámetros
// requeridos al resolver objetivos de navegación.

import {
  ALL_ROUTE_NAMES,
  ROUTE_REGISTRY,
  isRouteName,
  resolveNavigationTarget,
  routesFor,
  type RouteName,
} from './route-model';

const EXPECTED_ROUTES: RouteName[] = [
  'Login',
  'SeleccionClub',
  'HomeAlbum',
  'Captura',
  'DetalleCard',
  'Suscripcion',
  'EnvioPedido',
  'Ajustes',
];

describe('grafo de rutas (design.md · Navegación y pantallas)', () => {
  it('contiene exactamente las 8 pantallas esperadas', () => {
    expect(ALL_ROUTE_NAMES.length).toBe(8);
    // Mismo conjunto, sin depender del orden.
    const sorted = [...ALL_ROUTE_NAMES].sort();
    const expectedSorted = [...EXPECTED_ROUTES].sort();
    expect(sorted).toEqual(expectedSorted);
  });

  it('cada descriptor declara su propio nombre de forma consistente', () => {
    for (const name of ALL_ROUTE_NAMES) {
      expect(ROUTE_REGISTRY[name].name).toBe(name);
    }
  });
});

describe('partición stack de autenticación vs pestañas principales', () => {
  it('el stack de autenticación es Login + Selección de Club', () => {
    expect([...routesFor('authStack')].sort()).toEqual(
      ['Login', 'SeleccionClub'].sort(),
    );
  });

  it('las pestañas principales son las 6 pantallas restantes', () => {
    expect([...routesFor('mainTabs')].sort()).toEqual(
      [
        'HomeAlbum',
        'Captura',
        'DetalleCard',
        'Suscripcion',
        'EnvioPedido',
        'Ajustes',
      ].sort(),
    );
  });

  it('cada ruta pertenece a exactamente un contenedor', () => {
    const auth = routesFor('authStack');
    const main = routesFor('mainTabs');
    expect(auth.length + main.length).toBe(ALL_ROUTE_NAMES.length);
    for (const name of auth) {
      expect(main.includes(name)).toBe(false);
    }
  });
});

describe('isRouteName', () => {
  it('acepta nombres conocidos y rechaza el resto', () => {
    expect(isRouteName('HomeAlbum')).toBe(true);
    expect(isRouteName('Desconocida')).toBe(false);
    expect(isRouteName(42)).toBe(false);
    expect(isRouteName(undefined)).toBe(false);
  });
});

describe('resolveNavigationTarget: validación de parámetros', () => {
  it('resuelve rutas sin parámetros requeridos', () => {
    const target = resolveNavigationTarget('Login');
    expect(target.name).toBe('Login');
  });

  it('resuelve rutas con todos los parámetros requeridos presentes', () => {
    const target = resolveNavigationTarget('DetalleCard', {
      recuadroId: 'r-1',
    });
    expect(target.name).toBe('DetalleCard');
  });

  it('rechaza una ruta desconocida', () => {
    expect(() => resolveNavigationTarget('NoExiste')).toThrow();
  });

  it('rechaza cuando faltan parámetros requeridos', () => {
    expect(() => resolveNavigationTarget('HomeAlbum')).toThrow();
    expect(() => resolveNavigationTarget('Captura', {})).toThrow();
    expect(() =>
      resolveNavigationTarget('EnvioPedido', { temporadaId: undefined }),
    ).toThrow();
  });
});
