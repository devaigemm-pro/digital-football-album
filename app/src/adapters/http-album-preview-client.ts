// Adaptador HTTP del `AlbumPreviewClient` (Motor_Album · previsualización).
//
// Task 29.1 (wiring) — Requirements: 4.1, 4.2, 4.3
//
// Implementa el contrato `AlbumPreviewClient`
// (app/src/album/album-preview-presenter.ts) sobre el Módulo de red del cliente:
//   - `GET /album/{temporadaId}/preview` → `AlbumPreviewData`
//       { recuadros: AlbumPreviewEntry[], recuadrosSinFotoPrincipal: number[] }.
//
// El backend ya emite la forma de `AlbumPreviewData` (design.md · Motor_Album);
// el adaptador la refleja tal cual sin re-derivar entradas ni faltantes.
//
// TypeScript PURO: no importa `react-native`.

import type {
  AlbumPreviewClient,
  AlbumPreviewData,
} from '../album';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `AlbumPreviewClient`. Autenticado.
 */
export class HttpAlbumPreviewClient implements AlbumPreviewClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `GET /album/{temporadaId}/preview` (Req 4.1, 4.2, 4.3). Devuelve la
   * previsualización: entradas ordenadas por `numero` y los Recuadros sin
   * Foto_Principal. El presentador la refleja sin recalcular.
   */
  async getPreview(temporadaId: string): Promise<AlbumPreviewData> {
    const response = await this.send<AlbumPreviewData>(
      buildRequest(
        'GET',
        `/album/${encodeURIComponent(temporadaId)}/preview`,
      ),
    );
    return readOkBody(response, 'GET /album/{temporadaId}/preview');
  }
}
