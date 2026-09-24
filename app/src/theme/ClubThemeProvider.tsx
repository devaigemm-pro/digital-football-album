// ClubThemeProvider — provider de React (context) delgado del Tema_Club.
//
// Task 27.1 — Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO
// están instaladas en este entorno, por lo que este archivo `.tsx` está
// EXCLUIDO del typecheck de `app/tsconfig.json` (ver "exclude"). Es código real,
// listo para compilar cuando se instale el toolchain RN/React; hasta entonces
// no participa en `tsc --noEmit`. Consulta `app/README.md`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (invocar `PUT /usuario/club`, derivar el
// Tema_Club, manejar el `409` de Temporada activa conservando el Club, estado
// observable y contraste) vive en `ClubThemeController` (TypeScript puro,
// unit-testado en `club-theme-controller.test.ts`). Aquí solo se cablea ese
// controlador a un React Context y se re-renderiza al cambiar el estado.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { ClubClient, ClubTheme } from '../viewmodels';
import {
  ClubThemeController,
  contrastingTextColor,
  type SelectClubResult,
} from './club-theme-controller';

/** Valor expuesto por el contexto del Tema_Club a los componentes de la UI. */
export interface ClubThemeContextValue {
  /** Tema aplicado, o `null` si aún no se seleccionó Club (Req 23.3). */
  readonly theme: ClubTheme | null;
  /**
   * Selecciona/cambia el Club (`PUT /usuario/club`). Aplica el nuevo Tema_Club
   * o, ante el `409` de Temporada activa, conserva el Club y devuelve el
   * conflicto para que la pantalla muestre el mensaje (Req 23.1, 23.4, 23.5).
   */
  readonly selectClub: (
    usuarioId: string,
    clubId: string,
  ) => Promise<SelectClubResult>;
  /** Color de texto con contraste seguro sobre un color de fondo del tema (Req 29). */
  readonly contrastingTextColor: (backgroundHex: string) => '#000000' | '#FFFFFF';
}

const ClubThemeContext = createContext<ClubThemeContextValue | null>(null);

export interface ClubThemeProviderProps {
  /** Adaptador HTTP de `ClubClient` inyectado (`PUT /usuario/club`). */
  readonly client: ClubClient;
  /** Controlador ya construido (opcional, útil en tests/Storybook). */
  readonly controller?: ClubThemeController;
  readonly children?: React.ReactNode;
}

/**
 * Provee el Tema_Club a la app. Suscribe el árbol de React al estado del
 * `ClubThemeController` y re-renderiza cuando el tema cambia (Req 23.2, 23.3).
 */
export function ClubThemeProvider({
  client,
  controller,
  children,
}: ClubThemeProviderProps): React.ReactElement {
  const ctrl = useMemo(
    () => controller ?? new ClubThemeController(client),
    [controller, client],
  );

  const [theme, setTheme] = useState<ClubTheme | null>(() => ctrl.getState());

  useEffect(() => {
    // `subscribe` emite el estado actual de inmediato y en cada cambio.
    const unsubscribe = ctrl.subscribe(setTheme);
    return unsubscribe;
  }, [ctrl]);

  const value = useMemo<ClubThemeContextValue>(
    () => ({
      theme,
      selectClub: (usuarioId: string, clubId: string) =>
        ctrl.selectClub(usuarioId, clubId),
      contrastingTextColor,
    }),
    [ctrl, theme],
  );

  return (
    <ClubThemeContext.Provider value={value}>
      {children}
    </ClubThemeContext.Provider>
  );
}

/**
 * Hook para consumir el Tema_Club desde cualquier componente. Lanza si se usa
 * fuera de `ClubThemeProvider` para detectar cableados incorrectos.
 */
export function useClubTheme(): ClubThemeContextValue {
  const value = useContext(ClubThemeContext);
  if (value === null) {
    throw new Error('useClubTheme debe usarse dentro de <ClubThemeProvider>.');
  }
  return value;
}
