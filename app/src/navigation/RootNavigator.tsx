// Cableado real de React Navigation (stack + tabs) — Task 27.2 + wiring.
// — Requirements: 21.1, 21.2
//
// ⚠️ Este archivo importa React, React Native y `@react-navigation/*`, que NO
// están instalados en este entorno. Por eso `app/tsconfig.json` EXCLUYE los
// `.tsx` ("src/**/*.tsx"): así `tsc --noEmit -p app/tsconfig.json` valida el
// modelo puro (`route-model.ts`) y sus pruebas sin fallar por imports
// ausentes. Al instalar el toolchain del cliente, este navegador typechea y
// se ejecuta normalmente. Ver app/README.md.
//
// La única fuente de verdad del grafo es `route-model.ts`: los tipos de
// parámetros (`RouteParamList`) y la partición auth/tabs derivan de allí.
//
// CAMBIO DE WIRING: las pantallas ya NO se importan/hardcodean aquí porque
// requieren clientes/presentadores concretos inyectados. En su lugar,
// `RootNavigator` recibe un paquete de COMPONENTES YA ENLAZADOS (`ScreenBundle`)
// que la composición raíz (App.tsx) construye con los adaptadores HTTP y los
// presentadores (ver `navigation/screen-bindings.tsx`). Así este archivo solo
// aporta el montaje de UI y permanece desacoplado del wiring concreto.

import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import type { RouteParamList } from './route-model';
import { palette } from '../theme/design-tokens';

/**
 * Tipo de un componente de pantalla de React Navigation: recibe las `props` de
 * navegación (`navigation`, `route`) que el navegador inyecta. Se deja laxo
 * (`any`) a propósito porque las pantallas ya vienen enlazadas y solo consumen
 * `route.params`; el tipado fino de cada `route` lo aporta `RouteParamList`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoundScreen = React.ComponentType<any>;

/**
 * Paquete de pantallas YA ENLAZADAS a sus clientes/presentadores. La composición
 * raíz (App.tsx) lo construye a partir de los adaptadores HTTP y lo pasa al
 * navegador. Cada entrada corresponde a una ruta de `route-model.ts`.
 */
export interface ScreenBundle {
  readonly Login: BoundScreen;
  readonly SeleccionClub: BoundScreen;
  readonly HomeAlbum: BoundScreen;
  readonly Partidos: BoundScreen;
  readonly Captura: BoundScreen;
  readonly DetalleCard: BoundScreen;
  readonly Suscripcion: BoundScreen;
  readonly EnvioPedido: BoundScreen;
  readonly Perfil: BoundScreen;
  readonly Ajustes: BoundScreen;
  /**
   * Compuerta de onboarding: se renderiza en la zona autenticada y decide si
   * mostrar el flujo de alta (sin club/temporada) o `children` (las pestañas).
   * Recibe el navegador principal como `children`. Si no se provee, se muestran
   * las pestañas directamente.
   */
  readonly OnboardingGate?: React.ComponentType<{ children: React.ReactNode }>;
}

// Stack de autenticación/onboarding (Login → Selección de Club).
type AuthStackParamList = Pick<RouteParamList, 'Login' | 'SeleccionClub'>;
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator({ screens }: { screens: ScreenBundle }): React.JSX.Element {
  return (
    <AuthStack.Navigator>
      <AuthStack.Screen
        name="Login"
        component={screens.Login}
        options={{ title: 'Iniciar sesión' }}
      />
      <AuthStack.Screen
        name="SeleccionClub"
        component={screens.SeleccionClub}
        options={{ title: 'Elige tu club' }}
      />
    </AuthStack.Navigator>
  );
}

// Navegador de pestañas principal (Home/Álbum, Captura, Detalle/Card,
// Suscripción, Envío/Pedido, Ajustes).
type MainTabsParamList = Omit<RouteParamList, 'Login' | 'SeleccionClub'>;
const MainTabs = createBottomTabNavigator<MainTabsParamList>();

/**
 * Icono (Ionicons) de cada pestaña, en variante `-outline` cuando está inactiva
 * y sólida cuando está activa. El nombre del route determina el glifo.
 */
const TAB_ICONS: Record<string, string> = {
  HomeAlbum: 'book',
  Partidos: 'football',
  Captura: 'camera',
  DetalleCard: 'sparkles',
  Suscripcion: 'card',
  EnvioPedido: 'cube',
  Perfil: 'person',
  Ajustes: 'settings',
};

/** Opciones comunes de las pestañas: iconos vectoriales + colores del sistema. */
function tabScreenOptions({
  route,
}: {
  route: { name: string };
}): BottomTabNavigationOptions {
  const base = TAB_ICONS[route.name] ?? 'ellipse';
  return {
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: palette.textMutedOnLight,
    tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.borderOnLight },
    tabBarIcon: ({ color, size, focused }) => (
      <Icon name={focused ? base : `${base}-outline`} size={size} color={color} />
    ),
  };
}

function MainNavigator({ screens }: { screens: ScreenBundle }): React.JSX.Element {
  return (
    <MainTabs.Navigator screenOptions={tabScreenOptions}>
      <MainTabs.Screen
        name="HomeAlbum"
        component={screens.HomeAlbum}
        options={{ title: 'Álbum' }}
      />
      <MainTabs.Screen
        name="Partidos"
        component={screens.Partidos}
        options={{ title: 'Partidos' }}
      />
      <MainTabs.Screen
        name="Captura"
        component={screens.Captura}
        options={{ title: 'Captura' }}
      />
      <MainTabs.Screen
        name="DetalleCard"
        component={screens.DetalleCard}
        options={{ title: 'Detalle' }}
      />
      <MainTabs.Screen
        name="Suscripcion"
        component={screens.Suscripcion}
        options={{ title: 'Suscripción' }}
      />
      <MainTabs.Screen
        name="EnvioPedido"
        component={screens.EnvioPedido}
        options={{ title: 'Envío' }}
      />
      <MainTabs.Screen
        name="Perfil"
        component={screens.Perfil}
        options={{ title: 'Perfil' }}
      />
      <MainTabs.Screen
        name="Ajustes"
        component={screens.Ajustes}
        options={{ title: 'Ajustes' }}
      />
    </MainTabs.Navigator>
  );
}

// Raíz que alterna entre el stack de autenticación y las pestañas principales
// según la sesión. El estado de sesión y las pantallas enlazadas se inyectan
// desde arriba (App.tsx / Task 25).
type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
const RootStack = createNativeStackNavigator<RootStackParamList>();

export interface RootNavigatorProps {
  /** Indica si hay una sesión autenticada activa (Req 22). */
  readonly isAuthenticated: boolean;
  /** Pantallas YA ENLAZADAS a sus clientes/presentadores (ver screen-bindings). */
  readonly screens: ScreenBundle;
}

export function RootNavigator({
  isAuthenticated,
  screens,
}: RootNavigatorProps): React.JSX.Element {
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main">
            {() => {
              const Gate = screens.OnboardingGate;
              const tabs = <MainNavigator screens={screens} />;
              return Gate ? <Gate>{tabs}</Gate> : tabs;
            }}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="Auth">
            {() => <AuthNavigator screens={screens} />}
          </RootStack.Screen>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
