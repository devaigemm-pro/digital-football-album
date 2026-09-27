// Adaptador HTTP del `SeasonCloseClient` (cierre anticipado de la Temporada).
//
// Task 30.4 (wiring) — Requirements: 10.2, 10.3, 10.4
//
// Implementa el contrato `SeasonCloseClient`
// (app/src/season/early-close-presenter.ts) sobre el Módulo de red:
//   - `getRecuadrosFaltantes` → reutiliza `GET /album/{temporadaId}/preview`
//     (endpoint REAL del backend deployado) y mapea
//     `recuadrosSinFotoPrincipal: number[]` a `RecuadroFaltante[]` (Req 10.2).
//   - `requestEarlyClose`     → NO disponible en el backend deployado
//     (docs/FRONTEND_INTEGRATION.md · §7: el cierre anticipado no se expone
//     todavía). Lanza `NotAvailableError`; la UI de cierre se oculta.
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
import { NotAvailableError } from '../net/errors';
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
   * NO disponible: el cierre anticipado de la Temporada no está expuesto en el
   * backend deployado (docs · §7). La UI de cierre se oculta.
   * @throws {NotAvailableError}
   */
  async requestEarlyClose(
    _temporadaId: string,
    _params: { readonly fotosListasConfirmadas: boolean },
  ): Promise<TemporadaCierreData> {
    throw new NotAvailableError(
      'cierre anticipado de Temporada (POST /temporadas/{id}/cierre-anticipado)',
    );
  }
}
