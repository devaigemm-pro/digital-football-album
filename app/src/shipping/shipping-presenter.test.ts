// Pruebas unitarias del ShippingPresenter (Task 30.2 — Requirements: 8.1, 8.2,
// 8.3, 8.4).
//
// TypeScript puro con un `ShippingClient` doble en memoria: NO requieren React
// Native ni red real. Cubren:
//   - dirección válida → confirmación de registro (Req 8.1, 8.2);
//   - error de dirección inválida → mensaje del backend ESPEJADO, no registrada
//     (Req 8.3);
//   - error por Fecha_Límite_Cierre alcanzada → mensaje del backend ESPEJADO, no
//     registrada (Req 8.3);
//   - getOrder antes del despacho → tracking null/oculto (Req 8.4);
//   - getOrder con estado ENVIADA (despachado) → estado + tracking visibles
//     (Req 8.4).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import {
  PEDIDO_ERROR_DEFAULT,
  REGISTRO_CONFIRMACION_DEFAULT,
  ShippingError,
  ShippingPresenter,
  type DireccionEnvioCampos,
  type PedidoData,
  type RegistroDireccionOk,
  type ShippingClient,
  type ShippingState,
} from './shipping-presenter';

const TEMPORADA_ID = 'temporada-2024';

const DIRECCION_VALIDA: DireccionEnvioCampos = {
  nombreDestinatario: 'Ada Lovelace',
  linea1: 'Calle 123',
  ciudad: 'Bogotá',
  region: 'Cundinamarca',
  codigoPostal: '110111',
  pais: 'CO',
};

/**
 * Cliente de envío doble totalmente configurable. Cada método resuelve o rechaza
 * según lo que se inyecte, sin reimplementar ninguna regla del backend: los
 * tests deciden qué devuelve el Servicio_Envío.
 */
class FakeShippingClient implements ShippingClient {
  registerCalls = 0;
  getOrderCalls = 0;
  lastCampos: DireccionEnvioCampos | null = null;

  constructor(
    private readonly onRegister: () => Promise<RegistroDireccionOk>,
    private readonly onGetOrder: () => Promise<PedidoData>,
  ) {}

  registerAddress(campos: DireccionEnvioCampos): Promise<RegistroDireccionOk> {
    this.registerCalls += 1;
    this.lastCampos = campos;
    return this.onRegister();
  }

  getOrder(_temporadaId: string): Promise<PedidoData> {
    this.getOrderCalls += 1;
    return this.onGetOrder();
  }
}

/** Rechazo genérico (no usado directamente) para satisfacer el otro método. */
function neverOrder(): Promise<PedidoData> {
  return Promise.reject(new Error('no usado'));
}
function neverRegister(): Promise<RegistroDireccionOk> {
  return Promise.reject(new Error('no usado'));
}

describe('ShippingPresenter — estado inicial', () => {
  it('arranca inactivo, sin confirmación, sin error y sin tracking', () => {
    const client = new FakeShippingClient(neverRegister, neverOrder);
    const presenter = new ShippingPresenter(client);

    const state = presenter.getState();
    expect(state.registroStatus).toBe('idle');
    expect(state.registroConfirmacion).toBeNull();
    expect(state.registroError).toBeNull();
    expect(state.registroErrorCode).toBeNull();
    expect(state.pedidoStatus).toBe('idle');
    expect(state.pedidoEstado).toBeNull();
    expect(state.despachado).toBe(false);
    expect(state.tracking).toBeNull();
    expect(state.pedidoError).toBeNull();
  });

  it('subscribe emite el estado actual de inmediato', () => {
    const client = new FakeShippingClient(neverRegister, neverOrder);
    const presenter = new ShippingPresenter(client);

    let seen: ShippingState | null = null;
    presenter.subscribe((s) => {
      seen = s;
    });
    expect(seen !== null).toBe(true);
    expect((seen as unknown as ShippingState).registroStatus).toBe('idle');
  });
});

describe('ShippingPresenter.registerAddress — éxito (Req 8.1, 8.2)', () => {
  it('confirma el registro con el mensaje del backend', async () => {
    const client = new FakeShippingClient(
      () =>
        Promise.resolve({
          registrada: true,
          mensaje: 'Tu dirección quedó lista para el envío.',
        }),
      neverOrder,
    );
    const presenter = new ShippingPresenter(client);

    await presenter.registerAddress(DIRECCION_VALIDA);

    const state = presenter.getState();
    expect(state.registroStatus).toBe('registered');
    expect(state.registroConfirmacion).toBe(
      'Tu dirección quedó lista para el envío.',
    );
    expect(state.registroError).toBeNull();
    expect(state.registroErrorCode).toBeNull();
    // El cliente recibió los campos tal cual (el cliente no valida localmente).
    expect(client.registerCalls).toBe(1);
    expect(client.lastCampos).toEqual(DIRECCION_VALIDA);
  });

  it('usa una confirmación por defecto cuando el backend no aporta mensaje', async () => {
    const client = new FakeShippingClient(
      () => Promise.resolve({ registrada: true }),
      neverOrder,
    );
    const presenter = new ShippingPresenter(client);

    await presenter.registerAddress(DIRECCION_VALIDA);

    const state = presenter.getState();
    expect(state.registroStatus).toBe('registered');
    expect(state.registroConfirmacion).toBe(REGISTRO_CONFIRMACION_DEFAULT);
  });
});

describe('ShippingPresenter.registerAddress — errores del backend (Req 8.3)', () => {
  it('espeja el mensaje de dirección inválida y NO queda registrada', async () => {
    const backendMsg = 'El código postal no corresponde a la ciudad.';
    const client = new FakeShippingClient(
      () => Promise.reject(new ShippingError('DireccionInvalida', backendMsg)),
      neverOrder,
    );
    const presenter = new ShippingPresenter(client);

    // `registerAddress` nunca rechaza: refleja el error como estado (Req 8.3).
    await presenter.registerAddress(DIRECCION_VALIDA);

    const state = presenter.getState();
    expect(state.registroStatus).toBe('error');
    // El texto mostrado es EXACTAMENTE el del backend (no re-derivado).
    expect(state.registroError).toBe(backendMsg);
    expect(state.registroErrorCode).toBe('DireccionInvalida');
    // No se confirma registro alguno.
    expect(state.registroConfirmacion).toBeNull();
  });

  it('espeja el mensaje de Fecha_Límite_Cierre alcanzada y NO queda registrada', async () => {
    const backendMsg =
      'La temporada ya cerró: no es posible modificar la dirección.';
    const err = new ShippingError('FechaLimiteCierreAlcanzada', backendMsg);
    const client = new FakeShippingClient(() => Promise.reject(err), neverOrder);
    const presenter = new ShippingPresenter(client);

    await presenter.registerAddress(DIRECCION_VALIDA);

    const state = presenter.getState();
    expect(state.registroStatus).toBe('error');
    expect(state.registroError).toBe(backendMsg);
    expect(state.registroErrorCode).toBe('FechaLimiteCierreAlcanzada');
    expect(state.registroConfirmacion).toBeNull();
    // El error propagado es un ShippingError (chequeo de instancia síncrono).
    expect(err instanceof ShippingError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('permite reintentar con éxito tras un error de registro', async () => {
    let call = 0;
    const client = new FakeShippingClient(() => {
      call += 1;
      if (call === 1) {
        return Promise.reject(
          new ShippingError('DireccionInvalida', 'Falta la ciudad.'),
        );
      }
      return Promise.resolve({ registrada: true });
    }, neverOrder);
    const presenter = new ShippingPresenter(client);

    await presenter.registerAddress(DIRECCION_VALIDA);
    expect(presenter.getState().registroStatus).toBe('error');

    await presenter.registerAddress(DIRECCION_VALIDA);
    const state = presenter.getState();
    expect(state.registroStatus).toBe('registered');
    expect(state.registroError).toBeNull();
    expect(state.registroErrorCode).toBeNull();
    expect(state.registroConfirmacion).toBe(REGISTRO_CONFIRMACION_DEFAULT);
  });
});

describe('ShippingPresenter.getOrder — antes del despacho (Req 8.4)', () => {
  it('expone el estado pero mantiene el tracking oculto (null)', async () => {
    const client = new FakeShippingClient(neverRegister, () =>
      Promise.resolve({ estado: 'LISTA', despachado: false, tracking: null }),
    );
    const presenter = new ShippingPresenter(client);

    await presenter.getOrder(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.pedidoStatus).toBe('loaded');
    expect(state.pedidoEstado).toBe('LISTA');
    expect(state.despachado).toBe(false);
    expect(state.tracking).toBeNull();
  });

  it('oculta el tracking aunque el backend lo enviara sin marcar despachado', async () => {
    // Refuerza que la visibilidad la gobierna `despachado` (Req 8.4): si no está
    // despachado, el tracking NO se muestra aunque venga en la respuesta.
    const client = new FakeShippingClient(neverRegister, () =>
      Promise.resolve({
        estado: 'IMPRESION',
        despachado: false,
        tracking: 'TRK-early-999',
      }),
    );
    const presenter = new ShippingPresenter(client);

    await presenter.getOrder(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.despachado).toBe(false);
    expect(state.tracking).toBeNull();
  });
});

describe('ShippingPresenter.getOrder — despachado / ENVIADA (Req 8.4)', () => {
  it('expone estado ENVIADA y el tracking visible', async () => {
    const client = new FakeShippingClient(neverRegister, () =>
      Promise.resolve({
        estado: 'ENVIADA',
        despachado: true,
        tracking: 'TRK-123456',
      }),
    );
    const presenter = new ShippingPresenter(client);

    await presenter.getOrder(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.pedidoStatus).toBe('loaded');
    expect(state.pedidoEstado).toBe('ENVIADA');
    expect(state.despachado).toBe(true);
    expect(state.tracking).toBe('TRK-123456');
  });
});

describe('ShippingPresenter.getOrder — fallo no bloqueante (Req 8.4)', () => {
  it('refleja el error como estado sin lanzar a la UI', async () => {
    const client = new FakeShippingClient(neverRegister, () =>
      Promise.reject(new Error('fallo de red')),
    );
    const presenter = new ShippingPresenter(client);

    await presenter.getOrder(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.pedidoStatus).toBe('error');
    expect(state.pedidoError).toBe('fallo de red');
  });

  it('usa un mensaje por defecto cuando el error no aporta uno legible', async () => {
    const client = new FakeShippingClient(neverRegister, () =>
      Promise.reject({}),
    );
    const presenter = new ShippingPresenter(client);

    await presenter.getOrder(TEMPORADA_ID);

    expect(presenter.getState().pedidoError).toBe(PEDIDO_ERROR_DEFAULT);
  });
});
