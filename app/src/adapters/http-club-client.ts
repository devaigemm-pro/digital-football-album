// Adaptador HTTP del `ClubClient` (Servicio de Personalización / Club).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md · `PUT /me/club`):
//   - `PUT /me/club` body `{ clubId }` → `{ usuario, identidadVisual }`.
//
// CAMBIO respecto al contrato anterior (`PUT /usuario/club {usuarioId,clubId}`):
//   - La ruta real es `/me/club` y el backend DERIVA el usuario del JWT (no se
//     envía `usuarioId`).
//   - La respuesta ya no es directamente `IdentidadVisual`, sino
//     `{ usuario, identidadVisual }`: se devuelve el campo `identidadVisual`.
//
// El contrato `ClubClient.asignarClub(usuarioId, clubId)` (definido en
// `src/app/backend-clients.ts`, que NO se modifica) conserva su firma; el
// parámetro `usuarioId` se IGNORA de forma deliberada (el backend lo deriva del
// token). Es el cambio mínimo que no toca la interfaz ni sus consumidores.
//
// El conflicto de cambio de Club con Temporada ACTIVA llega ahora como error de
// NEGOCIO HTTP 400 con código de dominio (no 409); `classifyResponse` lo mapea a
// `ClubChangeConflictError` (Req 27.2), que el `ClubThemeController` reconoce.
//
// TypeScript PURO: no importa `react-native`.

import type { IdentidadVisual, ClubClient } from '../viewmodels';
import type { UUID } from '../../../src/domain/types';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Envoltura de la respuesta de `PUT /me/club`: el backend devuelve el usuario
 * actualizado junto con la identidad visual del Club a aplicar en la UI.
 */
interface AsignarClubResponse {
  readonly usuario: unknown;
  readonly identidadVisual: IdentidadVisual;
}

/**
 * Adaptador HTTP concreto del `ClubClient`. Autenticado (adjunta Access_Token).
 */
export class HttpClubClient implements ClubClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `PUT /me/club` con `{ clubId }` (Req 2.1, 2.2). El backend deriva el usuario
   * del JWT, por lo que `usuarioId` se ignora (se conserva por compatibilidad de
   * la interfaz). Devuelve la `IdentidadVisual` extraída de la respuesta. Un
   * conflicto (Temporada ACTIVA) se propaga como `ClubChangeConflictError`.
   */
  async asignarClub(_usuarioId: UUID, clubId: UUID): Promise<IdentidadVisual> {
    const response = await this.send<AsignarClubResponse>(
      buildRequest('PUT', '/me/club', { body: { clubId } }),
    );
    const body = readOkBody(response, 'PUT /me/club');
    return body.identidadVisual;
  }
}
