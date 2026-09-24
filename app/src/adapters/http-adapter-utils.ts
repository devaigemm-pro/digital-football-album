// Utilidades compartidas por los adaptadores HTTP del cliente.
//
// Task 25/28/29/30 (wiring) — Requirements: 21.1, 21.2 y los de cada contrato.
//
// TypeScript PURO y framework-agnóstico: no importa `react-native` ni ningún
// módulo nativo. Solo depende del Módulo de red del cliente (`SendFn`/
// `HttpRequest`/`HttpResponse`) y del mapeo de errores (`net/errors`), que a su
// vez usan únicamente `fetch`. Por eso este archivo typechea bajo
// `app/tsconfig.json` y valida con `tsc --noEmit`.
//
// Contiene:
//   - `encodeBase64`: codificador de bytes → base64 sin depender de `Buffer`
//     (que puede no existir en React Native) ni de `btoa`. Se usa para enviar el
//     binario de una foto (`Uint8Array`) dentro del cuerpo JSON (Req 5.1/5.2).
//   - `ensureOk` / `readOkBody`: helpers que aplican el mapeo de errores central
//     (`classifyResponse` de `net/errors`) sobre una `HttpResponse`, para que los
//     adaptadores no reinventen la clasificación de 409/gating/errores de API.

import type {
  HttpRequest,
  HttpResponse,
} from '../net/http-client';
import type { SendFn } from '../net/session-client';
import { classifyResponse } from '../net/errors';

/**
 * Firma de envío del pipeline de red. Coincide con `HttpClient.send` y con
 * `SessionHttpClient.asSend()`, de modo que un adaptador puede envolver
 * cualquiera de los dos.
 */
export type { SendFn };

/**
 * Alfabeto estándar Base64 (RFC 4648). Se usa para el codificador manual, que no
 * depende de `Buffer` (ausente en RN) ni de `btoa` (no garantizado en RN).
 */
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Codifica un `Uint8Array` a una cadena Base64 estándar (con relleno `=`).
 *
 * Implementación pura de byte→base64 procesando los bytes en grupos de 3 (24
 * bits) → 4 caracteres de 6 bits, con el relleno adecuado para 1 o 2 bytes
 * finales. No usa `Buffer` ni `btoa` para funcionar de forma uniforme en React
 * Native y Node (Req 5.1/5.2: enviar el binario de la foto en el cuerpo JSON).
 */
export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  const len = bytes.length;

  // Procesa bloques completos de 3 bytes.
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    output += BASE64_ALPHABET[b0 >> 2];
    output += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    output += BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    output += BASE64_ALPHABET[b2 & 0x3f];
  }

  // Maneja los 1 o 2 bytes finales con el relleno estándar.
  const remaining = len - i;
  if (remaining === 1) {
    const b0 = bytes[i];
    output += BASE64_ALPHABET[b0 >> 2];
    output += BASE64_ALPHABET[(b0 & 0x03) << 4];
    output += '==';
  } else if (remaining === 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    output += BASE64_ALPHABET[b0 >> 2];
    output += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    output += BASE64_ALPHABET[(b1 & 0x0f) << 2];
    output += '=';
  }

  return output;
}

/**
 * Tabla inversa del alfabeto Base64: mapea el código de carácter (0–127) a su
 * valor de 6 bits, o -1 si el carácter no pertenece al alfabeto. Se construye
 * una vez a nivel de módulo para decodificar sin `atob` ni `Buffer` (ausentes o
 * no garantizados en React Native).
 */
const BASE64_LOOKUP: readonly number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decodifica una cadena Base64 estándar (RFC 4648, con o sin relleno `=`) a un
 * `Uint8Array`. Implementación pura inversa de {@link encodeBase64}: procesa la
 * entrada en grupos de 4 caracteres (24 bits) → 3 bytes, descartando espacios y
 * saltos de línea. No usa `atob` ni `Buffer`, para funcionar de forma uniforme
 * en React Native y Node.
 *
 * Se usa para convertir el binario Base64 que devuelve `react-native-image-
 * picker` (`asset.base64`) en los bytes (`Uint8Array`) que espera la capa de
 * captura (`CapturePhotoInput.binario`).
 *
 * @throws {Error} si la entrada contiene un carácter fuera del alfabeto Base64.
 */
export function decodeBase64(base64: string): Uint8Array {
  // Elimina espacios/saltos y el relleno final para calcular la longitud real.
  const clean = base64.replace(/[\s]/g, '').replace(/=+$/, '');
  const len = clean.length;
  const byteLength = Math.floor((len * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < len; i++) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? BASE64_LOOKUP[code] : -1;
    if (value === -1) {
      throw new Error(
        `Carácter Base64 inválido en la posición ${i}: "${clean[i]}".`,
      );
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex++] = (buffer >> bitsCollected) & 0xff;
    }
  }

  return bytes;
}

/**
 * Codifica un valor a JSON para el cuerpo de una petición. Centralizado para que
 * todos los adaptadores serialicen igual (los métodos tipados de `HttpClient`
 * también hacen `JSON.stringify`, pero los adaptadores construyen `HttpRequest`
 * directamente sobre `SendFn`).
 */
export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Aplica el mapeo de errores central sobre una respuesta y lanza el error tipado
 * correspondiente (409/gating/API) si NO es 2xx. Devuelve la misma respuesta
 * cuando es exitosa, para encadenar. Un 401 no recuperable (tras el refresh del
 * `SessionHttpClient`) se trata como `ApiError` para que el llamador lo maneje.
 */
export function ensureOk<T>(response: HttpResponse<T>): HttpResponse<T> {
  const error = classifyResponse(response, { treat401AsApiError: true });
  if (error) {
    throw error;
  }
  return response;
}

/**
 * Verifica que la respuesta sea 2xx (vía {@link ensureOk}) y devuelve su cuerpo
 * ya parseado. Lanza un `Error` descriptivo si el cuerpo esperado viene vacío,
 * para no propagar `null` a contratos que exigen un objeto de dominio.
 */
export function readOkBody<T>(response: HttpResponse<T>, context: string): T {
  ensureOk(response);
  if (response.body === null) {
    throw new Error(`Respuesta vacía inesperada del backend en ${context}.`);
  }
  return response.body;
}

/**
 * Construye un `HttpRequest` autenticado (por defecto) con cuerpo JSON opcional.
 * Azúcar para que los adaptadores sean cortos y consistentes.
 */
export function buildRequest(
  method: HttpRequest['method'],
  path: string,
  options: {
    readonly body?: unknown;
    readonly authenticated?: boolean;
  } = {},
): HttpRequest {
  return {
    method,
    path,
    body: options.body === undefined ? undefined : jsonBody(options.body),
    authenticated: options.authenticated ?? true,
  };
}
