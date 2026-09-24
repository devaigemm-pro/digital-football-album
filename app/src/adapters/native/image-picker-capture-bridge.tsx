// Adaptador NATIVO de captura de fotos — implementa `CaptureNativeBridge`
// (contrato declarado en `app/src/screens/CapturaScreen.tsx`) usando
// `react-native-image-picker`.
//
// Este archivo importa una librería nativa (`react-native-image-picker`), por lo
// que es `.tsx` y queda EXCLUIDO del typecheck de `app/tsconfig.json`. Se compila
// con el toolchain del cliente (Metro) al construir la app en un dispositivo.
//
// Convierte el asset elegido (galería o cámara) en la forma que espera la capa
// de captura pura (`CapturePhotoInput` sin `partidoId`/`fuente`):
//   { binario: Uint8Array, anchoPx: number, altoPx: number }
// Los bytes se obtienen pidiendo Base64 al picker (`includeBase64: true`) y
// decodificándolo con el helper PURO `decodeBase64` (byte-exacto, sin `Buffer`
// ni `atob`). Devuelve `null` cuando el usuario cancela (Req 3.1/3.2).

import {
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import type {
  Asset,
  CameraOptions,
  ImageLibraryOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

import { decodeBase64 } from '../http-adapter-utils';
import type { CaptureNativeBridge } from '../../screens/CapturaScreen';

/** Resultado que la pantalla de captura espera del puente nativo. */
type PickedPhoto = {
  binario: Uint8Array;
  anchoPx: number;
  altoPx: number;
};

/**
 * Opciones comunes de la selección/captura. Se pide Base64 para obtener los
 * bytes de forma portable, `mediaType: 'photo'` (solo fotos, Req 3.1/3.2) y una
 * sola imagen por invocación (`selectionLimit: 1`).
 */
const COMMON_OPTIONS = {
  mediaType: 'photo',
  includeBase64: true,
  quality: 1,
} as const;

const LIBRARY_OPTIONS: ImageLibraryOptions = {
  ...COMMON_OPTIONS,
  selectionLimit: 1,
};

const CAMERA_OPTIONS: CameraOptions = {
  ...COMMON_OPTIONS,
  saveToPhotos: false,
};

/**
 * Traduce una `ImagePickerResponse` al `PickedPhoto` del contrato, o `null` si
 * el usuario canceló o no hay un asset con datos utilizables. Requiere que el
 * asset traiga `base64`, `width` y `height`; si faltan, se trata como cancelado
 * para no propagar datos incompletos a la subida.
 */
function toPickedPhoto(response: ImagePickerResponse): PickedPhoto | null {
  if (response.didCancel || response.errorCode) {
    return null;
  }
  const asset: Asset | undefined = response.assets?.[0];
  if (!asset || !asset.base64 || asset.width == null || asset.height == null) {
    return null;
  }
  return {
    binario: decodeBase64(asset.base64),
    anchoPx: asset.width,
    altoPx: asset.height,
  };
}

/**
 * Implementación del puente nativo de captura sobre `react-native-image-picker`.
 * Es una clase sin estado; puede instanciarse una vez y cablearse en el
 * `CapturePresenter`/pantalla.
 */
export class ImagePickerCaptureBridge implements CaptureNativeBridge {
  /** Abre la galería del dispositivo y devuelve la foto elegida (Req 3.1). */
  async pickFromGallery(): Promise<PickedPhoto | null> {
    const response = await launchImageLibrary(LIBRARY_OPTIONS);
    return toPickedPhoto(response);
  }

  /** Abre la cámara del dispositivo y devuelve la foto tomada (Req 3.2). */
  async takePhoto(): Promise<PickedPhoto | null> {
    const response = await launchCamera(CAMERA_OPTIONS);
    return toPickedPhoto(response);
  }
}

/** Instancia lista para inyectar en la pantalla de captura. */
export const imagePickerCaptureBridge = new ImagePickerCaptureBridge();

export default imagePickerCaptureBridge;
