// Servicio_Envío (Req 15): dirección de envío, pedido y tracking del kit físico.
//
// Barrel del servicio que registra/valida la Dirección_Envío antes de la
// Fecha_Límite_Cierre (`PUT /envio/direccion`) y expone el estado del Pedido y
// su información de seguimiento tras el despacho (`GET /pedido/{temporadaId}`).
//
// Task 19.1 — Requirements: 15.1, 15.2, 15.4

export {
  ShippingService,
  DireccionInvalidaError,
  FechaLimiteCierreAlcanzadaError,
  TemporadaNoEncontradaError,
  PedidoNoEncontradoError,
  validarCamposDireccion,
  ESTADO_DESPACHADO,
} from './shipping-service.js';
export type {
  ShippingServiceDeps,
  RegisterAddressInput,
  OrderView,
  IdGenerator,
  Clock,
} from './shipping-service.js';
