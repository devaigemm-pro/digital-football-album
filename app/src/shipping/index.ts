// Envío / Pedido (cliente) — Servicio_Envío del lado de la app.
//
// Task 30.2 — Requirements: 8.1, 8.2, 8.3, 8.4
// (Requerimiento 15 del SRS — registro/validación de la Dirección_Envío y estado
//  del Pedido con tracking tras el despacho).
//
// Punto de entrada de la capa de lógica pura (framework-agnóstica). La pantalla
// `EnvioPedidoScreen.tsx` importa desde aquí. El adaptador HTTP de producción
// implementa `ShippingClient` (`PUT /envio/direccion`, `GET /pedido/{temporadaId}`).
export {
  ShippingPresenter,
  ShippingError,
  REGISTRO_CONFIRMACION_DEFAULT,
  REGISTRO_ERROR_DEFAULT,
  PEDIDO_ERROR_DEFAULT,
  type ShippingClient,
  type DireccionEnvioCampos,
  type RegistroDireccionOk,
  type PedidoData,
  type ShippingErrorCode,
  type ShippingState,
  type ShippingStateListener,
  type RegistroStatus,
  type PedidoStatus,
} from './shipping-presenter';
