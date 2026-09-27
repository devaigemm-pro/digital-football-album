// Adaptador HTTP del `CaptureClient` (Motor_Momentos: captura y contexto).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md · `POST /partidos/:partidoId/fotos`):
//   - `POST /partidos/:partidoId/fotos` body
//       `{ binarioBase64, anchoPx, altoPx, fuente }` → 201
//       `{ foto, momentoId, momentoCreado }`.
//
// CAMBIO respecto al contrato anterior (`POST /momentos/{partidoId}/fotos`):
//   - La ruta real es `/partidos/:partidoId/fotos` (la foto se agrupa en el
//     Momento del partido del lado del backend).
//   - Las claves del cuerpo (`binarioBase64`, `anchoPx`, `altoPx`, `fuente`)
//     coinciden EXACTAMENTE con lo que espera el backend.
//   - La respuesta envuelve la `Foto` en `{ foto, momentoId, momentoCreado }`;
//     se devuelve el campo `foto`.
//
// `setFotoPrincipal` (`PUT /recuadros/.../foto-principal`) y `updateMomento`
// (`PATCH /momentos/...`) NO están disponibles todavía (docs · §7): el registro
// de contexto/notas/votación y la selección de Foto_Principal desde el cliente
// aún no se exponen. Ambos métodos lanzan `NotAvailableError`; la UI de
// edición del Momento (Detalle/Card más allá de subir la foto) se oculta.
//
// El binario de la foto (`Uint8Array` en `UploadFotoInput`) se codifica a Base64
// dentro del cuerpo JSON mediante `encodeBase64` (byte→base64 puro, sin `Buffer`
// ni `btoa`, para funcionar en React Native).
//
// TypeScript PURO: no importa `react-native`.

import type {
  CaptureClient,
  MomentoContextoInput,
  UploadFotoInput,
} from '../viewmodels';
import type { Foto, Momento, Recuadro, UUID } from '../../../src/domain/types';
import {
  buildRequest,
  encodeBase64,
  readOkBody,
  type SendFn,
} from './http-adapter-utils';

/**
 * Cuerpo JSON de `POST /partidos/:partidoId/fotos`. El binario viaja como una
 * cadena Base64 (`binarioBase64`) junto con sus metadatos; el backend decodifica
 * y usa `anchoPx`/`altoPx` para verificar los 300 DPI mínimos de impresión.
 */
interface UploadFotoBody {
  readonly fuente: UploadFotoInput['fuente'];
  readonly binarioBase64: string;
  readonly anchoPx: number;
  readonly altoPx: number;
}

/**
 * Envoltura de la respuesta 201 de `POST /partidos/:partidoId/fotos`: la `Foto`
 * creada junto con el `Momento` al que se asoció.
 */
interface UploadFotoResponse {
  readonly foto: Foto;
  readonly momentoId: UUID;
  readonly momentoCreado: boolean;
}

/**
 * Adaptador HTTP concreto del `CaptureClient`. Todas las operaciones son
 * autenticadas (adjuntan el Access_Token vigente).
 */
export class HttpCaptureClient implements CaptureClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `POST /partidos/:partidoId/fotos` (Req 5.1, 5.2). Serializa el binario de la
   * foto a Base64 en el cuerpo JSON y devuelve la `Foto` creada (extraída de
   * `{ foto, momentoId, momentoCreado }`).
   */
  async uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto> {
    const body: UploadFotoBody = {
      fuente: input.fuente,
      binarioBase64: encodeBase64(input.binario),
      anchoPx: input.anchoPx,
      altoPx: input.altoPx,
    };
    const response = await this.send<UploadFotoResponse>(
      buildRequest(
        'POST',
        `/partidos/${encodeURIComponent(partidoId)}/fotos`,
        { body },
      ),
    );
    const parsed = readOkBody(response, 'POST /partidos/{partidoId}/fotos');
    return parsed.foto;
  }

  /**
   * `PUT /recuadros/:recuadroId/foto-principal` (Req 5.5): marca la foto de la
   * lámina. Devuelve el Recuadro actualizado (`{ recuadro }`). Un `409` de
   * edición cerrada se propaga como error de API para que la UI lo muestre.
   */
  async setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    const response = await this.send<{ recuadro: Recuadro }>(
      buildRequest('PUT', `/recuadros/${encodeURIComponent(recuadroId)}/foto-principal`, {
        body: { fotoId },
      }),
    );
    return readOkBody(response, 'PUT /recuadros/{id}/foto-principal').recuadro;
  }

  /**
   * `PATCH /momentos/:momentoId` (Req 6.1, 7.1): aplica el parche de contexto/
   * notas (reseña) al Momento. Devuelve el Momento actualizado (`{ momento }`).
   */
  async updateMomento(
    momentoId: UUID,
    patch: MomentoContextoInput,
  ): Promise<Momento> {
    const response = await this.send<{ momento: Momento }>(
      buildRequest('PATCH', `/momentos/${encodeURIComponent(momentoId)}`, { body: patch }),
    );
    return readOkBody(response, 'PATCH /momentos/{id}').momento;
  }
}
