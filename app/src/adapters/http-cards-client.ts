// Adaptador HTTP del `CardsClient` (Generador_Cards).
//
// Task 21.2 (wiring) — Requirements: 12.1, 12.2
//
// Implementa el contrato `CardsClient` (src/app/backend-clients.ts) sobre el
// Módulo de red del cliente. Backend deployado
// (docs/FRONTEND_INTEGRATION.md · `POST /cards/:momentoId`):
//   - `POST /cards/:momentoId` (sin cuerpo) → `{ objectKey, formato }`.
//
// CAMBIO respecto al contrato anterior (`POST /cards {usuarioId, momentoId}`):
//   - El `momentoId` viaja en la RUTA, no en el cuerpo.
//   - NO se envía `usuarioId`: el backend lo deriva del JWT. El parámetro
//     `usuarioId` de la firma `generateCard` se conserva (interfaz inalterada,
//     definida en `src/app/backend-clients.ts`) pero se IGNORA.
//
// El gating por plan lo decide el BACKEND: las cards internacionales requieren
// Plan_Premium y el backend rechaza con HTTP 400 `REQUIERE_PLAN_PREMIUM`
// (docs · `POST /cards/:momentoId`). `classifyResponse` lo mapea a
// `PremiumRequiredError` (Req 27.3), que el `CardPresenter` reconoce para
// mostrar "requiere Plan_Premium" SIN re-derivar el plan en el cliente.
//
// TypeScript PURO: no importa `react-native`.

import type { CardsClient, DigitalCard } from '../viewmodels';
import type { UUID } from '../../../src/domain/types';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `CardsClient`. Autenticado (adjunta Access_Token).
 */
export class HttpCardsClient implements CardsClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `POST /cards/:momentoId` (Req 12.1, 12.2). El `momentoId` va en la ruta y el
   * backend deriva el usuario del JWT (`usuarioId` se ignora). Devuelve la
   * `DigitalCard` generada. Un rechazo por gating de plan (400
   * `REQUIERE_PLAN_PREMIUM`) se propaga como `PremiumRequiredError`.
   */
  async generateCard(_usuarioId: UUID, momentoId: UUID): Promise<DigitalCard> {
    const response = await this.send<DigitalCard>(
      buildRequest('POST', `/cards/${encodeURIComponent(momentoId)}`),
    );
    return readOkBody(response, 'POST /cards/{momentoId}');
  }
}
