// Adaptador HTTP del `ShippingClient` (Servicio_Envío).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md · §7): la Dirección_Envío, el
// Pedido y el tracking del kit físico NO están disponibles todavía. Se conservan
// los métodos del contrato `ShippingClient` para no romper la interfaz, pero
// lanzan `NotAvailableError` en lugar de llamar a rutas inexistentes. La UI de
// Envío/Pedido se oculta.
//
// TypeScript PURO: no importa `react-native`.

import {
  type DireccionEnvioCampos,
  type PedidoData,
  type RegistroDireccionOk,
  type ShippingClient,
} from '../shipping';
import { NotAvailableError } from '../net/errors';
import { type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `ShippingClient`. NO operativo en el backend
 * deployado: todos los métodos lanzan `NotAvailableError` (§7).
 */
export class HttpShippingClient implements ShippingClient {
  // Acepta la `SendFn` por consistencia con los demás adaptadores (y para no
  // cambiar el sitio de construcción), pero no la usa: no hay endpoints reales.
  constructor(_send: SendFn) {}

  /**
   * NO disponible: registro de Dirección_Envío no expuesto (§7).
   * @throws {NotAvailableError}
   */
  async registerAddress(
    _campos: DireccionEnvioCampos,
  ): Promise<RegistroDireccionOk> {
    throw new NotAvailableError('registro de dirección de envío (PUT /envio/direccion)');
  }

  /**
   * NO disponible: estado del Pedido/tracking no expuesto (§7).
   * @throws {NotAvailableError}
   */
  async getOrder(_temporadaId: string): Promise<PedidoData> {
    throw new NotAvailableError('estado del pedido (GET /pedido/{temporadaId})');
  }
}
