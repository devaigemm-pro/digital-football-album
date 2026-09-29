// BackgroundProvider — provider de React del color de fondo elegido por el hincha.
//
// Aplica la preferencia de personalización (color del canvas) a toda la app: el
// `Screen` del kit consume `useBackgroundColor()` para pintar su fondo. La
// elección se persiste localmente (AsyncStorage) vía el puerto
// `BackgroundPreferenceStore`; toda la lógica (paleta, validación, resolución al
// defecto) vive en `background-preference.ts` (TS puro, testeado).
//
// `.tsx` EXCLUIDO del typecheck (`app/tsconfig.json`): importa React y el
// adaptador nativo de AsyncStorage. La corrección testeable está en el `.ts`.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BACKGROUND_STORAGE_KEY,
  COLOR_FONDO_POR_DEFECTO,
  resolverColorFondo,
  type BackgroundPreferenceStore,
} from './background-preference';

/** Adaptador de persistencia sobre AsyncStorage. No lanza hacia la UI. */
const asyncStorageBackgroundStore: BackgroundPreferenceStore = {
  async get() {
    try {
      return await AsyncStorage.getItem(BACKGROUND_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async set(color: string) {
    try {
      await AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, color);
    } catch {
      // Persistencia best-effort: si falla, el color se mantiene en memoria
      // durante la sesión pero no se guarda. No rompemos la UI por esto.
    }
  },
};

interface BackgroundContextValue {
  /** Color de fondo efectivo (siempre válido; cae al defecto si no hay). */
  readonly color: string;
  /** Cambia el color de fondo y lo persiste (no lanza). */
  readonly setColor: (color: string) => void;
}

const BackgroundContext = createContext<BackgroundContextValue | null>(null);

export interface BackgroundProviderProps {
  readonly children: React.ReactNode;
  /** Store inyectable (útil en tests/Storybook). Por defecto, AsyncStorage. */
  readonly store?: BackgroundPreferenceStore;
}

/**
 * Provee el color de fondo elegido por el hincha. Al montar, carga la
 * preferencia persistida (resolviéndola al defecto si es inválida/ausente).
 */
export function BackgroundProvider({
  children,
  store = asyncStorageBackgroundStore,
}: BackgroundProviderProps): React.ReactElement {
  const [color, setColorState] = useState<string>(COLOR_FONDO_POR_DEFECTO);

  useEffect(() => {
    let activo = true;
    void store.get().then((persistido) => {
      if (activo) {
        setColorState(resolverColorFondo(persistido));
      }
    });
    return () => {
      activo = false;
    };
  }, [store]);

  const setColor = useCallback(
    (nuevo: string) => {
      const resuelto = resolverColorFondo(nuevo);
      setColorState(resuelto);
      void store.set(resuelto);
    },
    [store],
  );

  const value = useMemo<BackgroundContextValue>(
    () => ({ color, setColor }),
    [color, setColor],
  );

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

/**
 * Color de fondo efectivo. Devuelve el defecto si se usa fuera del provider (no
 * lanza), para que pantallas aisladas/tests sigan pintando un fondo válido.
 */
export function useBackgroundColor(): string {
  return useContext(BackgroundContext)?.color ?? COLOR_FONDO_POR_DEFECTO;
}

/**
 * Control del color de fondo (color actual + setter). Lanza si se usa fuera del
 * provider, para detectar cableados incorrectos en la pantalla de ajustes.
 */
export function useBackgroundControl(): BackgroundContextValue {
  const value = useContext(BackgroundContext);
  if (value === null) {
    throw new Error('useBackgroundControl debe usarse dentro de <BackgroundProvider>.');
  }
  return value;
}
