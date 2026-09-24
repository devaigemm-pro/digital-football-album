// Adaptador NATIVO de permisos — implementa el `PermissionPrompt` que consume
// el `PermissionGate`/`PermissionManager` (modelo puro reutilizado en
// `app/src/permissions`), usando `react-native-permissions`.
//
// Importa una librería nativa (`react-native-permissions`), por lo que es `.tsx`
// y queda EXCLUIDO del typecheck de `app/tsconfig.json`; se compila con Metro.
//
// El `PermissionPrompt` tiene la firma `(permiso: Permiso) => Promise<boolean>`:
// solicita al SO el permiso correspondiente y resuelve `true` si queda concedido
// (Req 24.1/24.2/24.3). El `PermissionManager` persiste el `EstadoPermiso`
// resultante; este adaptador solo traduce el permiso lógico al permiso nativo
// por plataforma y ejecuta `request(...)`.

import { Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  request,
} from 'react-native-permissions';
import type { Permission, PermissionStatus } from 'react-native-permissions';

import { Permiso } from '../../permissions';

/**
 * Mapea el `Permiso` lógico del dominio al `Permission` nativo por plataforma:
 *   - CAMARA         → iOS CAMERA / Android CAMERA.
 *   - ALMACENAMIENTO → iOS PHOTO_LIBRARY / Android READ_MEDIA_IMAGES (API 33+)
 *     con respaldo READ_EXTERNAL_STORAGE en dispositivos anteriores.
 *   - GEOLOCALIZACION→ iOS/Android LOCATION_WHEN_IN_USE / ACCESS_FINE_LOCATION.
 *
 * Devuelve `null` si la plataforma no expone un permiso aplicable (p. ej. web),
 * en cuyo caso el prompt se resuelve como no concedido.
 */
function nativePermissionFor(permiso: Permiso): Permission | null {
  if (Platform.OS === 'ios') {
    switch (permiso) {
      case Permiso.CAMARA:
        return PERMISSIONS.IOS.CAMERA;
      case Permiso.ALMACENAMIENTO:
        return PERMISSIONS.IOS.PHOTO_LIBRARY;
      case Permiso.GEOLOCALIZACION:
        return PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
      default:
        return null;
    }
  }

  if (Platform.OS === 'android') {
    switch (permiso) {
      case Permiso.CAMARA:
        return PERMISSIONS.ANDROID.CAMERA;
      case Permiso.ALMACENAMIENTO:
        // Android 13+ (API 33) usa READ_MEDIA_IMAGES; versiones anteriores,
        // READ_EXTERNAL_STORAGE. `Platform.Version` es el nivel de API.
        return typeof Platform.Version === 'number' && Platform.Version >= 33
          ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
          : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
      case Permiso.GEOLOCALIZACION:
        return PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
      default:
        return null;
    }
  }

  return null;
}

/**
 * Interpreta el `PermissionStatus` de `react-native-permissions` como concesión
 * booleana para el `PermissionPrompt`. `GRANTED` y `LIMITED` (acceso parcial a
 * la fototeca en iOS) se consideran concedidos; `DENIED`, `BLOCKED` y
 * `UNAVAILABLE`, no.
 */
function isGranted(status: PermissionStatus): boolean {
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

/**
 * `PermissionPrompt` nativo: solicita al SO el permiso mapeado y resuelve si
 * quedó concedido. Se inyecta al construir el `PermissionGate` en el wiring de
 * la app.
 */
export async function nativePermissionPrompt(
  permiso: Permiso,
): Promise<boolean> {
  const nativePermission = nativePermissionFor(permiso);
  if (nativePermission == null) {
    // La plataforma no expone un permiso aplicable: se trata como no concedido.
    return false;
  }
  const status = await request(nativePermission);
  return isGranted(status);
}

export default nativePermissionPrompt;
