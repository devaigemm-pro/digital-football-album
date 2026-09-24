// Adaptador HTTP del `ClubClient` (Servicio de Personalización / Club).
//
// Task 21.1 (wiring) — Requirements: 2.1, 2.2
//
// Implementa el contrato `ClubClient` (src/app/backend-clients.ts, reexportado
// por app/src/viewmodels) sobre el Módulo de red del cliente:
//   - `PUT /usuario/club` body `{ usuarioId, clubId }` → `IdentidadVisual`.
//
// El `409` de conflicto de cambio de Club (Temporada activa) se mapea vía
// `classifyResponse` a `ClubChangeConflictError` (Req 27.2), que el
// `ClubThemeController` reconoce para conservar el Club y mostrar el mensaje.
//
// TypeScript PURO: no importa `react-native`.

import type { IdentidadVisual, ClubClient } from '../viewmodels';
import type { UUID } from '../../../src/domain/types';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `ClubClient`. Autenticado (adjunta Access_Token).
 */
export class HttpClubClient implements ClubClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `PUT /usuario/club` con `{ usuarioId, clubId }` (Req 2.1, 2.2). Devuelve la
   * `IdentidadVisual` del Club para personalizar la UI. Un `409` se propaga como
   * `ClubChangeConflictError` (vía el mapeo central), preservando el Club actual.
   */
  async asignarClub(usuarioId: UUID, clubId: UUID): Promise<IdentidadVisual> {
    const response = await this.send<IdentidadVisual>(
      buildRequest('PUT', '/usuario/club', { body: { usuarioId, clubId } }),
    );
    return readOkBody(response, 'PUT /usuario/club');
  }
}
