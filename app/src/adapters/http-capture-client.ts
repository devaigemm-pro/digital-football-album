// Adaptador HTTP del `CaptureClient` (Motor_Momentos: captura y contexto).
//
// Task 21.1 (wiring) — Requirements: 5.1, 5.2, 6.1
//
// Implementa el contrato `CaptureClient` (src/app/backend-clients.ts) sobre el
// Módulo de red del cliente:
//   - `POST /momentos/{partidoId}/fotos`        (subir/capturar foto) → `Foto`
//   - `PUT  /recuadros/{recuadroId}/foto-principal` body `{ fotoId }` → `Recuadro`
//   - `PATCH /momentos/{momentoId}`              (parche de contexto) → `Momento`
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
 * Cuerpo JSON de `POST /momentos/{partidoId}/fotos`. El binario viaja como una
 * cadena Base64 (`binarioBase64`) junto con sus metadatos; el backend decodifica.
 */
interface UploadFotoBody {
  readonly fuente: UploadFotoInput['fuente'];
  readonly binarioBase64: string;
  readonly anchoPx: number;
  readonly altoPx: number;
}

/**
 * Adaptador HTTP concreto del `CaptureClient`. Todas las operaciones son
 * autenticadas (adjuntan el Access_Token vigente).
 */
export class HttpCaptureClient implements CaptureClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `POST /momentos/{partidoId}/fotos` (Req 5.1, 5.2). Serializa el binario de la
   * foto a Base64 en el cuerpo JSON y devuelve la `Foto` creada.
   */
  async uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto> {
    const body: UploadFotoBody = {
      fuente: input.fuente,
      binarioBase64: encodeBase64(input.binario),
      anchoPx: input.anchoPx,
      altoPx: input.altoPx,
    };
    const response = await this.send<Foto>(
      buildRequest(
        'POST',
        `/momentos/${encodeURIComponent(partidoId)}/fotos`,
        { body },
      ),
    );
    return readOkBody(response, 'POST /momentos/{partidoId}/fotos');
  }

  /**
   * `PUT /recuadros/{recuadroId}/foto-principal` con `{ fotoId }` (Req 5.5).
   * Devuelve el `Recuadro` actualizado con su Foto_Principal.
   */
  async setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    const response = await this.send<Recuadro>(
      buildRequest(
        'PUT',
        `/recuadros/${encodeURIComponent(recuadroId)}/foto-principal`,
        { body: { fotoId } },
      ),
    );
    return readOkBody(response, 'PUT /recuadros/{recuadroId}/foto-principal');
  }

  /**
   * `PATCH /momentos/{momentoId}` con el parche de contexto de asistencia
   * (Req 6.1). Solo los campos presentes en `patch` se envían. Devuelve el
   * `Momento` actualizado.
   */
  async updateMomento(
    momentoId: UUID,
    patch: MomentoContextoInput,
  ): Promise<Momento> {
    const response = await this.send<Momento>(
      buildRequest('PATCH', `/momentos/${encodeURIComponent(momentoId)}`, {
        body: patch,
      }),
    );
    return readOkBody(response, 'PATCH /momentos/{momentoId}');
  }
}
