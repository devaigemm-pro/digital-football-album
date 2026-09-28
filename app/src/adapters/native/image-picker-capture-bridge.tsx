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
// `maxWidth`/`maxHeight`: redimensiona la imagen antes de devolverla. Es CLAVE:
//   1) garantiza que el asset traiga `width`/`height` (el Photo Picker de
//      Android 13+ a veces NO los devuelve para el original), evitando que la
//      foto se descarte silenciosamente;
//   2) reduce el peso del base64, evitando el 502 por cuerpo grande.
// `quality: 0.85` recomprime lo justo para bajar tamaño sin perder calidad
// visible. 2000 px de lado largo es más que suficiente para foto de perfil y
// para imprenta a 300 DPI en el recuadro.
const COMMON_OPTIONS = {
  mediaType: 'photo',
  includeBase64: true,
  quality: 0.85,
  maxWidth: 2000,
  maxHeight: 2000,
} as const;

const LIBRARY_OPTIONS: ImageLibraryOptions = {
  ...COMMON_OPTIONS,
  selectionLimit: 1,
};

const CAMERA_OPTIONS: CameraOptions = {
  ...COMMON_OPTIONS,
  saveToPhotos: false,
};

/** Error de selección de imagen (para distinguir cancelación de fallo real). */
export class ImagePickerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePickerError';
  }
}

/**
 * Traduce una `ImagePickerResponse` al `PickedPhoto` del contrato.
 *   - Devuelve `null` SOLO si el usuario canceló (para no propagar nada).
 *   - Si el picker reporta un error, o el asset no trae `base64`, LANZA
 *     `ImagePickerError` (antes se tragaba como cancelado, lo que hacía que la
 *     subida no ocurriera SIN AVISO — causa del "no se reemplaza la foto").
 *   - `width`/`height` son opcionales: si faltan, se usa un cuadrado por defecto
 *     (el binario es lo que importa; las dimensiones son metadato). Con
 *     `maxWidth/maxHeight` normalmente vienen presentes.
 */
function toPickedPhoto(response: ImagePickerResponse): PickedPhoto | null {
  if (response.didCancel) {
    return null; // el usuario canceló: no es un error.
  }
  if (response.errorCode) {
    throw new ImagePickerError(
      `No se pudo abrir la galería/cámara: ${response.errorMessage ?? response.errorCode}`,
    );
  }
  const asset: Asset | undefined = response.assets?.[0];
  if (!asset || !asset.base64) {
    throw new ImagePickerError(
      'La imagen seleccionada no se pudo leer (sin datos). Intenta con otra foto.',
    );
  }
  return {
    binario: decodeBase64(asset.base64),
    anchoPx: asset.width ?? 1000,
    altoPx: asset.height ?? 1000,
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
