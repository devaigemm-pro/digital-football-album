// Adaptador HTTP del `SeasonCloseClient` (cierre anticipado de la Temporada).
//
// Task 30.4 (wiring) — Requirements: 10.2, 10.3, 10.4
//
// Implementa el contrato `SeasonCloseClient`
// (app/src/season/early-close-presenter.ts) sobre el Módulo de red:
//   - `getRecuadrosFaltantes` → reutiliza `GET /album/{temporadaId}/preview`
//     (misma fuente que la previsualización del álbum) y mapea
//     `recuadrosSinFotoPrincipal: number[]` a `RecuadroFaltante[]` (Req 10.2).
//   - `requestEarlyClose`     → `POST /temporadas/{temporadaId}/cierre-anticipado`
//     body `{ fotosListasConfirmadas }` → `TemporadaCierreData` (Req 10.4 / SRS 16.4).
//
// El backend es la autoridad del cierre; el adaptador solo mapea la respuesta y
// deja que el mapeo de errores central clasifique los rechazos.
//
// TypeScript PURO: no importa `react-native`.

import type { AlbumPreviewData } from '../album';
import type {
  RecuadrosFaltantesData,
  SeasonCloseClient,
  TemporadaCierreData,
} from '../season';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `SeasonCloseClient`. Autenticado.
 */
export class HttpSeasonCloseClient implements SeasonCloseClient {
  constructor(private readonly send: SendFn) {}

  /**
   * Obtiene los Recuadros sin Foto_Principal a informar antes del cierre
   * (Req 10.2). Reutiliza `GET /album/{temporadaId}/preview` y mapea la lista de
   * números `recuadrosSinFotoPrincipal` a la forma `RecuadroFaltante[]` que el
   * presentador espera, conservando el orden emitido por el backend.
   */
  async getRecuadrosFaltantes(
    temporadaId: string,
  ): Promise<RecuadrosFaltantesData> {
    const response = await this.send<AlbumPreviewData>(
      buildRequest('GET', `/album/${encodeURIComponent(temporadaId)}/preview`),
    );
    const data = readOkBody(
      response,
      'GET /album/{temporadaId}/preview (recuadros faltantes)',
    );
    return {
      recuadros: data.recuadrosSinFotoPrincipal.map((numero) => ({ numero })),
    };
  }

  /**
   * Solicita el cierre anticipado de la Temporada (Req 10.4 / SRS 16.4). Reenvía
   * la confirmación OPCIONAL de "fotos listas para imprenta" tal cual y devuelve
   * el estado de la Temporada que el presentador espeja (Req 10.3, 10.4).
   */
  async requestEarlyClose(
    temporadaId: string,
    params: { readonly fotosListasConfirmadas: boolean },
  ): Promise<TemporadaCierreData> {
    const response = await this.send<TemporadaCierreData>(
      buildRequest(
        'POST',
        `/temporadas/${encodeURIComponent(temporadaId)}/cierre-anticipado`,
        { body: { fotosListasConfirmadas: params.fotosListasConfirmadas } },
      ),
    );
    return readOkBody(
      response,
      'POST /temporadas/{temporadaId}/cierre-anticipado',
    );
  }
}
