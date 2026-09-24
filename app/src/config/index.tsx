// Configuración de la App_Móvil en tiempo de ejecución — capa NATIVA (.tsx).
//
// Este archivo SÍ importa `react-native-config`, por lo que vive en `.tsx`
// (EXCLUIDO del typecheck de `app/tsconfig.json`, que no tiene el toolchain
// nativo instalado en este entorno). Toma las variables de entorno crudas que
// `react-native-config` inyecta desde el `.env` seleccionado por el build
// (dev/prod) y las valida con la función PURA `resolveConfig` de `./env`.
//
// El resto del cliente importa `appConfig` desde `app/src/config` sin conocer
// `react-native-config`, manteniendo la lógica desacoplada y testeable.
//
// react-native-config expone las claves declaradas en `.env` como propiedades
// de su export por defecto (todas string | undefined). Ver README del paquete:
//   https://github.com/lugg/react-native-config

import Config from 'react-native-config';

import { resolveConfig } from './env';
import type { AppConfig, AppEnvironment } from './env';

export type { AppConfig, AppEnvironment };
export { resolveConfig, ConfigError } from './env';

/**
 * Configuración resuelta y validada de la app. Se calcula UNA vez al cargar el
 * módulo, a partir de las variables inyectadas por `react-native-config`.
 *
 * `Config` se tipa como `Record<string, string | undefined>` (su forma real),
 * de modo que `resolveConfig` reciba exactamente lo que espera. Si la
 * configuración es inválida (p. ej. `API_BASE_URL` sin TLS), `resolveConfig`
 * lanza `ConfigError` en el arranque — un fallo temprano y explícito.
 */
export const appConfig: AppConfig = resolveConfig(
  Config as unknown as Record<string, string | undefined>,
);

export default appConfig;
