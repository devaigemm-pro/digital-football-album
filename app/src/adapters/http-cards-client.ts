// Adaptador HTTP del `CardsClient` (Generador_Cards).
//
// Task 21.2 (wiring) — Requirements: 12.1, 12.2
//
// Implementa el contrato `CardsClient` (src/app/backend-clients.ts) sobre el
// Módulo de red del cliente:
//   - `POST /cards` body `{ usuarioId, momentoId }` → `DigitalCard`.
//
// El gating por plan lo decide el BACKEND (Req 5.3/5.4): un rechazo por plan se
// mapea vía `classifyResponse` a `PremiumRequiredError` (Req 27.3), que el
// `CardPresenter` reconoce para mostrar "requiere Plan_Premium" SIN re-derivar
// el plan en el cliente.
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
   * `POST /cards` con `{ usuarioId, momentoId }` (Req 12.1, 12.2). Devuelve la
   * `DigitalCard` generada por el backend. Un rechazo por gating de plan se
   * propaga como `PremiumRequiredError` (vía el mapeo central).
   */
  async generateCard(usuarioId: UUID, momentoId: UUID): Promise<DigitalCard> {
    const response = await this.send<DigitalCard>(
      buildRequest('POST', '/cards', { body: { usuarioId, momentoId } }),
    );
    return readOkBody(response, 'POST /cards');
  }
}
