/**
 * Pruebas unitarias del ShippingService (Task 19.1 — Requirements: 15.1, 15.2, 15.4).
 *
 * Cubren:
 *  - Registro y validación de la Dirección_Envío con campos válidos (Req 15.1, 15.2):
 *    upsert 1:1 por usuario y marca `validada`.
 *  - Rechazo de direcciones inválidas (campos obligatorios / formato — Req 15.2).
 *  - Ventana de registro respecto a la Fecha_Límite_Cierre: acepta antes,
 *    rechaza al alcanzarla; sin Temporada no impone ventana (Req 15.2).
 *  - Estado del Pedido y tracking: el seguimiento se muestra sólo tras el
 *    despacho (`ENVIADA`) y se oculta antes (Req 15.4).
 */
import { describe, it, expect } from 'vitest';
import type {
  CamposDireccion,
  DireccionEnvio,
  Pedido,
  Temporada,
  UUID,
} from '../../domain/types.js';
import {
  InMemoryDireccionEnvioRepository,
  InMemoryPedidoRepository,
  InMemoryTemporadaRepository,
} from '../../persistence/in-memory/repositories.js';
import {
  DireccionInvalidaError,
  FechaLimiteCierreAlcanzadaError,
  PedidoNoEncontradoError,
  ShippingService,
  TemporadaNoEncontradaError,
  validarCamposDireccion,
} from './shipping-service.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const TEMPORADA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const CLUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID;
const DIRECCION_ID = 'd0000001-0000-4000-8000-000000000001' as UUID;
const PEDIDO_ID = 'e0000001-0000-4000-8000-000000000001' as UUID;

const FECHA_LIMITE = '2025-06-30T23:59:59.000Z';
const LIMITE_MS = Date.parse(FECHA_LIMITE);
const ANTES_DEL_LIMITE = Date.parse('2025-06-01T00:00:00.000Z');
const DESPUES_DEL_LIMITE = Date.parse('2025-07-01T00:00:00.000Z');

function makeCampos(overrides: Partial<CamposDireccion> = {}): CamposDireccion {
  return {
    nombre: 'Ada Lovelace',
    linea1: 'Calle Falsa 123',
    linea2: 'Apto 4B',
    ciudad: 'Bogotá',
    region: 'Cundinamarca',
    codigoPostal: '110111',
    pais: 'CO',
    telefono: '+57 300 123 4567',
    ...overrides,
  };
}

function makeTemporada(overrides: Partial<Temporada> = {}): Temporada {
  return {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: CLUB_ID,
    temporadaExterna: '2024-2025',
    estado: 'ACTIVA',
    fechaLimiteCierre: FECHA_LIMITE,
    ...overrides,
  };
}

function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: PEDIDO_ID,
    temporadaId: TEMPORADA_ID,
    estado: 'PENDIENTE',
    tracking: null,
    datosFiscalesMinimos: null,
    intentosImpresion: 0,
    ...overrides,
  };
}

function makeService(
  options: {
    direcciones?: readonly DireccionEnvio[];
    pedidos?: readonly Pedido[];
    temporadas?: readonly Temporada[];
  } = {},
): {
  service: ShippingService;
  direccionRepo: InMemoryDireccionEnvioRepository;
  pedidoRepo: InMemoryPedidoRepository;
} {
  const direccionRepo = new InMemoryDireccionEnvioRepository(options.direcciones ?? []);
  const pedidoRepo = new InMemoryPedidoRepository(options.pedidos ?? []);
  const temporadaRepo = new InMemoryTemporadaRepository(options.temporadas ?? [makeTemporada()]);
  let contador = 0;
  const service = new ShippingService({
    direcciones: direccionRepo,
    pedidos: pedidoRepo,
    temporadas: temporadaRepo,
    newId: (): UUID => {
      contador += 1;
      const hex = contador.toString(16).padStart(12, '0');
      return `d0000000-0000-4000-8000-${hex}`;
    },
    now: () => ANTES_DEL_LIMITE,
  });
  return { service, direccionRepo, pedidoRepo };
}

// ---------------------------------------------------------------------------
// validarCamposDireccion (Req 15.2)
// ---------------------------------------------------------------------------

describe('validarCamposDireccion', () => {
  it('no devuelve errores para una dirección completa y bien formada', () => {
    expect(validarCamposDireccion(makeCampos())).toEqual([]);
  });

  it('reporta cada campo obligatorio ausente', () => {
    const errores = validarCamposDireccion(
      makeCampos({
        nombre: '',
        linea1: '   ',
        ciudad: '',
        region: '',
        codigoPostal: '',
        pais: '',
      }),
    );
    expect(errores.length).toBeGreaterThanOrEqual(6);
  });

  it('rechaza un país que no es código ISO alpha-2', () => {
    const errores = validarCamposDireccion(makeCampos({ pais: 'Colombia' }));
    expect(errores.some((e) => e.includes('ISO'))).toBe(true);
  });

  it('rechaza un código postal demasiado corto', () => {
    const errores = validarCamposDireccion(makeCampos({ codigoPostal: '1' }));
    expect(errores.some((e) => e.includes('código postal'))).toBe(true);
  });

  it('rechaza un teléfono con caracteres no válidos', () => {
    const errores = validarCamposDireccion(makeCampos({ telefono: 'llámame ya' }));
    expect(errores.some((e) => e.includes('teléfono'))).toBe(true);
  });

  it('acepta la ausencia de campos opcionales (linea2, telefono)', () => {
    const campos: CamposDireccion = {
      nombre: 'Ada Lovelace',
      linea1: 'Calle Falsa 123',
      ciudad: 'Bogotá',
      region: 'Cundinamarca',
      codigoPostal: '110111',
      pais: 'CO',
    };
    expect(validarCamposDireccion(campos)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// registerAddress (Req 15.1, 15.2)
// ---------------------------------------------------------------------------

describe('ShippingService.registerAddress', () => {
  it('crea y valida la Dirección_Envío con campos válidos (Req 15.1, 15.2)', async () => {
    const { service, direccionRepo } = makeService();

    const direccion = await service.registerAddress({
      usuarioId: USUARIO_ID,
      campos: makeCampos(),
    });

    expect(direccion.usuarioId).toBe(USUARIO_ID);
    expect(direccion.validada).toBe(true);
    expect(direccion.campos.ciudad).toBe('Bogotá');

    // Persistida y única por usuario.
    const persistida = await direccionRepo.findByUsuarioId(USUARIO_ID);
    expect(persistida?.id).toBe(direccion.id);
    expect(await direccionRepo.count()).toBe(1);
  });

  it('actualiza (upsert 1:1) la dirección existente del usuario en vez de crear otra', async () => {
    const existente: DireccionEnvio = {
      id: DIRECCION_ID,
      usuarioId: USUARIO_ID,
      campos: makeCampos({ ciudad: 'Cali' }),
      validada: false,
    };
    const { service, direccionRepo } = makeService({ direcciones: [existente] });

    const actualizada = await service.registerAddress({
      usuarioId: USUARIO_ID,
      campos: makeCampos({ ciudad: 'Medellín' }),
    });

    expect(actualizada.id).toBe(DIRECCION_ID);
    expect(actualizada.campos.ciudad).toBe('Medellín');
    expect(actualizada.validada).toBe(true);
    expect(await direccionRepo.count()).toBe(1);
  });

  it('lanza DireccionInvalidaError y no persiste nada cuando faltan campos (Req 15.2)', async () => {
    const { service, direccionRepo } = makeService();

    await expect(
      service.registerAddress({
        usuarioId: USUARIO_ID,
        campos: makeCampos({ linea1: '', pais: '' }),
      }),
    ).rejects.toBeInstanceOf(DireccionInvalidaError);

    expect(await direccionRepo.count()).toBe(0);
  });

  it('registra y valida la dirección ANTES de la Fecha_Límite_Cierre (Req 15.2)', async () => {
    const { service } = makeService();

    const direccion = await service.registerAddress({
      usuarioId: USUARIO_ID,
      campos: makeCampos(),
      temporadaId: TEMPORADA_ID,
      now: ANTES_DEL_LIMITE,
    });

    expect(direccion.validada).toBe(true);
  });

  it('rechaza el registro al alcanzarse la Fecha_Límite_Cierre (Req 15.2)', async () => {
    const { service, direccionRepo } = makeService();

    await expect(
      service.registerAddress({
        usuarioId: USUARIO_ID,
        campos: makeCampos(),
        temporadaId: TEMPORADA_ID,
        now: LIMITE_MS,
      }),
    ).rejects.toBeInstanceOf(FechaLimiteCierreAlcanzadaError);

    expect(await direccionRepo.count()).toBe(0);
  });

  it('rechaza el registro después de la Fecha_Límite_Cierre (Req 15.2)', async () => {
    const { service } = makeService();

    await expect(
      service.registerAddress({
        usuarioId: USUARIO_ID,
        campos: makeCampos(),
        temporadaId: TEMPORADA_ID,
        now: DESPUES_DEL_LIMITE,
      }),
    ).rejects.toBeInstanceOf(FechaLimiteCierreAlcanzadaError);
  });

  it('no impone ventana de registro cuando no se proporciona Temporada', async () => {
    const { service } = makeService();

    // Aunque el instante sea posterior a la fecha límite, sin temporadaId no
    // hay ventana que imponer: el registro procede.
    const direccion = await service.registerAddress({
      usuarioId: USUARIO_ID,
      campos: makeCampos(),
      now: DESPUES_DEL_LIMITE,
    });

    expect(direccion.validada).toBe(true);
  });

  it('lanza TemporadaNoEncontradaError si la Temporada de la ventana no existe', async () => {
    const { service } = makeService({ temporadas: [] });

    await expect(
      service.registerAddress({
        usuarioId: USUARIO_ID,
        campos: makeCampos(),
        temporadaId: TEMPORADA_ID,
        now: ANTES_DEL_LIMITE,
      }),
    ).rejects.toBeInstanceOf(TemporadaNoEncontradaError);
  });
});

// ---------------------------------------------------------------------------
// getOrder (Req 15.4)
// ---------------------------------------------------------------------------

describe('ShippingService.getOrder', () => {
  it('muestra el estado y el tracking una vez despachado el kit (ENVIADA — Req 15.4)', async () => {
    const pedido = makePedido({ estado: 'ENVIADA', tracking: 'TRK-12345' });
    const { service } = makeService({ pedidos: [pedido] });

    const vista = await service.getOrder(TEMPORADA_ID);

    expect(vista.temporadaId).toBe(TEMPORADA_ID);
    expect(vista.estado).toBe('ENVIADA');
    expect(vista.despachado).toBe(true);
    expect(vista.tracking).toBe('TRK-12345');
  });

  it('oculta el tracking mientras el Pedido no está despachado (Req 15.4)', async () => {
    const pedido = makePedido({ estado: 'EN_IMPRESION', tracking: 'TRK-OCULTO' });
    const { service } = makeService({ pedidos: [pedido] });

    const vista = await service.getOrder(TEMPORADA_ID);

    expect(vista.estado).toBe('EN_IMPRESION');
    expect(vista.despachado).toBe(false);
    expect(vista.tracking).toBeNull();
  });

  it('reporta tracking null cuando el Pedido está PENDIENTE', async () => {
    const { service } = makeService({ pedidos: [makePedido()] });

    const vista = await service.getOrder(TEMPORADA_ID);

    expect(vista.estado).toBe('PENDIENTE');
    expect(vista.despachado).toBe(false);
    expect(vista.tracking).toBeNull();
  });

  it('lanza PedidoNoEncontradoError si la Temporada no tiene Pedido', async () => {
    const { service } = makeService({ pedidos: [] });

    await expect(service.getOrder(TEMPORADA_ID)).rejects.toBeInstanceOf(PedidoNoEncontradoError);
  });
});
