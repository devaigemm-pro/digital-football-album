// Adaptador HTTP del `ShippingClient` (Servicio_Envío).
//
// Task 30.2 (wiring) — Requirements: 8.1, 8.2, 8.3, 8.4
//
// Implementa el contrato `ShippingClient`
// (app/src/shipping/shipping-presenter.ts) sobre el Módulo de red:
//   - `PUT /envio/direccion`      body = campos de la Dirección_Envío → `RegistroDireccionOk`
//   - `GET /pedido/{temporadaId}`                                     → `PedidoData`
//
// Ante un rechazo de negocio de `PUT /envio/direccion` (dirección inválida o
// Fecha_Límite_Cierre alcanzada), el adaptador RECHAZA con un `ShippingError`
// que lleva el `code` y el `message` del backend (Req 8.3); el presentador los
// ESPEJA sin re-derivar la regla. El backend es la autoridad de la validación.
//
// TypeScript PURO: no importa `react-native`.

import {
  ShippingError,
  type DireccionEnvioCampos,
  type PedidoData,
  type RegistroDireccionOk,
  type ShippingClient,
  type ShippingErrorCode,
} from '../shipping';
import { buildRequest, ensureOk, readOkBody, type SendFn } from './http-adapter-utils';

/** Códigos de error de negocio válidos que el backend puede devolver (Req 8.3). */
const SHIPPING_ERROR_CODES: readonly ShippingErrorCode[] = [
  'DireccionInvalida',
  'FechaLimiteCierreAlcanzada',
];

/** ¿Es `value` un `ShippingErrorCode` conocido? */
function isShippingErrorCode(value: unknown): value is ShippingErrorCode {
  return (
    typeof value === 'string' &&
    (SHIPPING_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Extrae, del cuerpo de un rechazo de `PUT /envio/direccion`, el `code` de
 * negocio (si el backend lo trae) y un `message` legible. El cliente refleja el
 * mensaje del backend sin re-derivarlo (Req 8.3).
 */
function parseShippingError(
  status: number,
  body: unknown,
): { code: ShippingErrorCode | null; message: string } {
  let code: ShippingErrorCode | null = null;
  let message = '';
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (isShippingErrorCode(record['code'])) {
      code = record['code'];
    }
    const rawMessage = record['message'] ?? record['error'] ?? record['detail'];
    if (typeof rawMessage === 'string' && rawMessage.trim() !== '') {
      message = rawMessage;
    }
  } else if (typeof body === 'string' && body.trim() !== '') {
    message = body;
  }
  if (message === '') {
    message = `No se pudo registrar la dirección de envío (HTTP ${status}).`;
  }
  return { code, message };
}

/**
 * Adaptador HTTP concreto del `ShippingClient`. Autenticado.
 */
export class HttpShippingClient implements ShippingClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `PUT /envio/direccion` (Req 8.1, 8.2). En éxito devuelve `RegistroDireccionOk`
   * (con el mensaje de confirmación del backend si lo hay). Ante un rechazo de
   * negocio (dirección inválida o cierre alcanzado), RECHAZA con `ShippingError`
   * llevando el `code`/`message` del backend (Req 8.3).
   */
  async registerAddress(
    campos: DireccionEnvioCampos,
  ): Promise<RegistroDireccionOk> {
    const response = await this.send<{ mensaje?: string }>(
      buildRequest('PUT', '/envio/direccion', { body: campos }),
    );

    if (response.status < 200 || response.status >= 300) {
      const { code, message } = parseShippingError(
        response.status,
        response.body,
      );
      // Un rechazo de negocio conocido se tipa como ShippingError con su código;
      // el presentador matiza el mensaje (dirección vs. cierre) sin re-derivarlo.
      throw new ShippingError(code ?? 'DireccionInvalida', message);
    }

    const mensaje = response.body?.mensaje;
    return {
      registrada: true,
      ...(typeof mensaje === 'string' && mensaje.trim() !== ''
        ? { mensaje }
        : {}),
    };
  }

  /**
   * `GET /pedido/{temporadaId}` (Req 8.4). Devuelve el estado del Pedido; el
   * `tracking` solo lo entrega el backend cuando fue despachado. El presentador
   * lo oculta mientras `despachado` sea falso.
   */
  async getOrder(temporadaId: string): Promise<PedidoData> {
    const response = await this.send<PedidoData>(
      buildRequest('GET', `/pedido/${encodeURIComponent(temporadaId)}`),
    );
    // Errores de red/backend se propagan vía el mapeo central; el presentador
    // los refleja como estado `error` sin lanzar a la UI.
    ensureOk(response);
    return readOkBody(response, 'GET /pedido/{temporadaId}');
  }
}
