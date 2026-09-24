// Servicio_Envío: dirección de envío, pedido y tracking del kit físico (Req 15).
//
// Traduce la sección "Servicio_Envío (Req 15)" del design.md a lógica de negocio:
//
//   PUT /envio/direccion  → registra/valida la Dirección_Envío ANTES de la
//                            Fecha_Límite_Cierre (Req 15.1, 15.2)  → registerAddress
//   GET /pedido/{id}      → estado del Pedido e información de seguimiento tras el
//                            despacho (Req 15.4)                    → getOrder
//
// El servicio es puro respecto a la infraestructura: recibe los repositorios y
// el reloj por inyección, de modo que puede ejercitarse con los dobles en
// memoria sin PostgreSQL. Sigue el patrón del resto de servicios (clase con
// `deps`, `newId`/`now` inyectables y errores tipados que la capa API mapea a
// códigos HTTP).
//
// Decisiones de diseño (documentadas):
//
//   - Ventana de registro (Req 15.2): la validación de la Dirección_Envío debe
//     ocurrir ANTES de la Fecha_Límite_Cierre. `registerAddress` acepta una
//     `temporadaId` opcional; SI se proporciona, se resuelve su
//     `fechaLimiteCierre` y se RECHAZA el registro cuando `now >=` esa fecha
//     (`FechaLimiteCierreAlcanzadaError`). Sin `temporadaId` no hay ventana que
//     imponer y el registro procede (p. ej. captura temprana de dirección sin
//     Temporada asociada aún). Se prefiere rechazar (en vez de aceptar sin
//     validar) para no persistir una dirección `validada` fuera de plazo.
//
//   - Superficie del tracking (Req 15.4): `getOrder` sólo expone la información
//     de seguimiento cuando el Pedido está despachado (`estado === 'ENVIADA'`).
//     Antes del despacho `tracking` se reporta como `null` aunque el registro
//     persistido lo tuviera, para reflejar que el seguimiento se "muestra" al
//     despacharse (WHEN … se despacha → mostrar tracking).
//
// Task 19.1 — Requirements: 15.1, 15.2, 15.4

import type {
  CamposDireccion,
  DireccionEnvio,
  EstadoPedido,
  Temporada,
  UUID,
} from '../../domain/types.js';
import type {
  DireccionEnvioRepository,
  PedidoRepository,
  TemporadaRepository,
} from '../../persistence/repositories.js';

/** Generador de UUID inyectable para las direcciones nuevas (paridad con el resto de servicios). */
export type IdGenerator = () => UUID;

/** Reloj inyectable en epoch ms; por defecto `Date.now` (determinismo en pruebas). */
export type Clock = () => number;

/**
 * Estado de despacho a partir del cual el kit se considera enviado y, por tanto,
 * su información de seguimiento debe mostrarse al usuario (Req 15.4).
 */
export const ESTADO_DESPACHADO: EstadoPedido = 'ENVIADA';

// ---------------------------------------------------------------------------
// Errores tipados (la capa API los mapea a códigos HTTP)
// ---------------------------------------------------------------------------

/**
 * Se lanza cuando los campos de la Dirección_Envío no superan la validación
 * (Req 15.2): faltan campos obligatorios o violan las reglas de formato. La
 * capa API la mapea a `422 Unprocessable Entity`. `errores` enumera cada campo
 * inválido para retroalimentar al usuario.
 */
export class DireccionInvalidaError extends Error {
  constructor(public readonly errores: readonly string[]) {
    super(`La Dirección_Envío no es válida: ${errores.join('; ')}`);
    this.name = 'DireccionInvalidaError';
  }
}

/**
 * Se lanza cuando se intenta registrar/validar una Dirección_Envío una vez
 * alcanzada la Fecha_Límite_Cierre de la Temporada asociada (Req 15.2): la
 * validación sólo procede ANTES de la fecha límite. La capa API la mapea a
 * `409 Conflict`.
 */
export class FechaLimiteCierreAlcanzadaError extends Error {
  constructor(
    public readonly temporadaId: UUID,
    public readonly fechaLimiteCierre: string,
    public readonly ahora: string,
  ) {
    super(
      `La Fecha_Límite_Cierre de la Temporada "${temporadaId}" (${fechaLimiteCierre}) ya se alcanzó (ahora: ${ahora}); no se puede registrar la Dirección_Envío`,
    );
    this.name = 'FechaLimiteCierreAlcanzadaError';
  }
}

/**
 * Se lanza cuando la Temporada referenciada (para acotar la ventana de registro)
 * no existe. La capa API la mapea a `404 Not Found`.
 */
export class TemporadaNoEncontradaError extends Error {
  constructor(public readonly temporadaId: UUID) {
    super(`No se encontró Temporada con id "${temporadaId}"`);
    this.name = 'TemporadaNoEncontradaError';
  }
}

/**
 * Se lanza cuando se consulta el Pedido de una Temporada que aún no tiene uno.
 * La capa API la mapea a `404 Not Found`.
 */
export class PedidoNoEncontradoError extends Error {
  constructor(public readonly temporadaId: UUID) {
    super(`No existe Pedido para la Temporada "${temporadaId}"`);
    this.name = 'PedidoNoEncontradoError';
  }
}

// ---------------------------------------------------------------------------
// Entradas / salidas
// ---------------------------------------------------------------------------

/** Entrada de `registerAddress`. */
export interface RegisterAddressInput {
  /** Usuario dueño de la Dirección_Envío (Req 15.1). */
  readonly usuarioId: UUID;
  /** Campos de la dirección a validar y persistir. */
  readonly campos: CamposDireccion;
  /**
   * Instante de la operación en epoch ms (inyectable). Por defecto usa el reloj
   * del servicio. Se compara contra la Fecha_Límite_Cierre (Req 15.2).
   */
  readonly now?: number;
  /**
   * Temporada opcional cuya Fecha_Límite_Cierre acota la ventana de registro
   * (Req 15.2). Si se omite, no se impone ventana.
   */
  readonly temporadaId?: UUID;
}

/**
 * Vista del Pedido devuelta por `getOrder`: estado del Pedido e información de
 * seguimiento que se MUESTRA sólo tras el despacho (Req 15.4).
 */
export interface OrderView {
  /** Temporada del Pedido. */
  readonly temporadaId: UUID;
  /** Estado actual del Pedido (Req 15.4). */
  readonly estado: EstadoPedido;
  /** `true` si el kit ya fue despachado (`estado === 'ENVIADA'`). */
  readonly despachado: boolean;
  /**
   * Información de seguimiento. `null` mientras el Pedido no esté despachado; el
   * tracking del proveedor logístico se muestra al despacharse (Req 15.4).
   */
  readonly tracking: string | null;
}

/** Dependencias inyectadas del Servicio_Envío. */
export interface ShippingServiceDeps {
  /** Direcciones de envío: se crean/actualizan y se marcan `validada` (Req 15.1, 15.2). */
  readonly direcciones: DireccionEnvioRepository;
  /** Pedidos: fuente del estado y tracking mostrados (Req 15.4). */
  readonly pedidos: PedidoRepository;
  /** Temporadas: aportan la Fecha_Límite_Cierre que acota el registro (Req 15.2). */
  readonly temporadas: TemporadaRepository;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  readonly newId?: IdGenerator;
  /** Reloj; por defecto `Date.now`. */
  readonly now?: Clock;
}

// ---------------------------------------------------------------------------
// Validación de la Dirección_Envío (Req 15.2)
// ---------------------------------------------------------------------------

/** Longitud máxima defensiva para campos de texto libre (evita basura desbordada). */
const MAX_LONGITUD_CAMPO = 200;

/** Normaliza recortando espacios; los `undefined` se tratan como cadena vacía. */
function limpiar(valor: string | undefined): string {
  return (valor ?? '').trim();
}

/**
 * Valida los campos de una Dirección_Envío (Req 15.2). Devuelve la lista de
 * errores (vacía si la dirección es válida). Reglas:
 *   - Campos obligatorios presentes y no vacíos: nombre, linea1, ciudad,
 *     region, codigoPostal, pais.
 *   - Ningún campo excede `MAX_LONGITUD_CAMPO`.
 *   - `pais`: código de país ISO 3166-1 alpha-2 (dos letras).
 *   - `codigoPostal`: alfanumérico (con espacios/guiones), 3–10 caracteres.
 *   - `telefono` (si viene): dígitos con `+`, espacios, guiones o paréntesis.
 */
export function validarCamposDireccion(campos: CamposDireccion): string[] {
  const errores: string[] = [];

  const obligatorios: ReadonlyArray<[keyof CamposDireccion, string]> = [
    ['nombre', 'El nombre es obligatorio'],
    ['linea1', 'La línea 1 de la dirección es obligatoria'],
    ['ciudad', 'La ciudad es obligatoria'],
    ['region', 'La región/estado es obligatoria'],
    ['codigoPostal', 'El código postal es obligatorio'],
    ['pais', 'El país es obligatorio'],
  ];
  for (const [campo, mensaje] of obligatorios) {
    if (limpiar(campos[campo]) === '') {
      errores.push(mensaje);
    }
  }

  // Longitud máxima defensiva de todos los campos de texto presentes.
  const textos: ReadonlyArray<[keyof CamposDireccion, string]> = [
    ['nombre', 'nombre'],
    ['linea1', 'linea1'],
    ['linea2', 'linea2'],
    ['ciudad', 'ciudad'],
    ['region', 'region'],
    ['codigoPostal', 'codigoPostal'],
    ['pais', 'pais'],
    ['telefono', 'telefono'],
  ];
  for (const [campo, etiqueta] of textos) {
    if (limpiar(campos[campo]).length > MAX_LONGITUD_CAMPO) {
      errores.push(`El campo ${etiqueta} excede ${MAX_LONGITUD_CAMPO} caracteres`);
    }
  }

  const pais = limpiar(campos.pais);
  if (pais !== '' && !/^[A-Za-z]{2}$/.test(pais)) {
    errores.push('El país debe ser un código ISO 3166-1 alpha-2 (dos letras)');
  }

  const codigoPostal = limpiar(campos.codigoPostal);
  if (codigoPostal !== '' && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/.test(codigoPostal)) {
    errores.push('El código postal debe tener entre 3 y 10 caracteres alfanuméricos');
  }

  const telefono = limpiar(campos.telefono);
  if (telefono !== '' && !/^[+0-9()\-\s]{5,}$/.test(telefono)) {
    errores.push('El teléfono contiene caracteres no válidos');
  }

  return errores;
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/**
 * Servicio_Envío. Depende únicamente de las interfaces de repositorio y del
 * reloj, no de implementaciones concretas, para ser testeable con los dobles en
 * memoria.
 */
export class ShippingService {
  private readonly direcciones: DireccionEnvioRepository;
  private readonly pedidos: PedidoRepository;
  private readonly temporadas: TemporadaRepository;
  private readonly newId: IdGenerator;
  private readonly clock: Clock;

  constructor(deps: ShippingServiceDeps) {
    this.direcciones = deps.direcciones;
    this.pedidos = deps.pedidos;
    this.temporadas = deps.temporadas;
    this.newId = deps.newId ?? ((): UUID => crypto.randomUUID());
    this.clock = deps.now ?? ((): number => Date.now());
  }

  /**
   * Registra o actualiza la Dirección_Envío del usuario y la valida ANTES de la
   * Fecha_Límite_Cierre (Req 15.1, 15.2).
   *
   * - Valida los campos con `validarCamposDireccion`; si hay errores lanza
   *   `DireccionInvalidaError` y no persiste nada (no se crea/actualiza una
   *   dirección inválida).
   * - Si se proporciona `temporadaId`, resuelve su `fechaLimiteCierre` y rechaza
   *   el registro cuando el instante actual la alcanzó
   *   (`FechaLimiteCierreAlcanzadaError`).
   * - Es idempotente respecto al usuario: si ya existe una Dirección_Envío para
   *   `usuarioId`, la actualiza (upsert 1:1); si no, la crea.
   * - Marca `validada = true` sólo cuando la validación pasó y estamos dentro de
   *   plazo.
   *
   * @throws {DireccionInvalidaError} si los campos no superan la validación.
   * @throws {TemporadaNoEncontradaError} si `temporadaId` no existe.
   * @throws {FechaLimiteCierreAlcanzadaError} si `now >= fechaLimiteCierre`.
   */
  async registerAddress(input: RegisterAddressInput): Promise<DireccionEnvio> {
    const { usuarioId, campos } = input;
    const ahora = input.now ?? this.clock();

    // 1. Validar los campos (Req 15.2). No se persiste una dirección inválida.
    const errores = validarCamposDireccion(campos);
    if (errores.length > 0) {
      throw new DireccionInvalidaError(errores);
    }

    // 2. Imponer la ventana de registro si hay Temporada asociada (Req 15.2).
    if (input.temporadaId !== undefined) {
      await this.asegurarDentroDePlazo(input.temporadaId, ahora);
    }

    // 3. Upsert 1:1 por usuario, marcando la dirección como validada.
    const existente = await this.direcciones.findByUsuarioId(usuarioId);
    if (existente !== null) {
      return this.direcciones.update(existente.id, { campos, validada: true });
    }
    return this.direcciones.create({
      id: this.newId(),
      usuarioId,
      campos,
      validada: true,
    });
  }

  /**
   * Devuelve el estado del Pedido de la Temporada y su información de
   * seguimiento (Req 15.4). El tracking sólo se muestra cuando el Pedido está
   * despachado (`estado === 'ENVIADA'`); antes del despacho se reporta `null`.
   *
   * @throws {PedidoNoEncontradoError} si la Temporada aún no tiene Pedido.
   */
  async getOrder(temporadaId: UUID): Promise<OrderView> {
    const pedido = await this.pedidos.findByTemporadaId(temporadaId);
    if (pedido === null) {
      throw new PedidoNoEncontradoError(temporadaId);
    }

    const despachado = pedido.estado === ESTADO_DESPACHADO;
    return {
      temporadaId: pedido.temporadaId,
      estado: pedido.estado,
      despachado,
      // El seguimiento se muestra al despacharse (Req 15.4).
      tracking: despachado ? pedido.tracking : null,
    };
  }

  /**
   * Verifica que el instante actual sea ANTERIOR a la Fecha_Límite_Cierre de la
   * Temporada (Req 15.2). Si la fecha no es parseable, no impone la ventana
   * (fail-open sobre datos malformados de fecha, coherente con el cierre).
   */
  private async asegurarDentroDePlazo(temporadaId: UUID, ahora: number): Promise<Temporada> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada === null) {
      throw new TemporadaNoEncontradaError(temporadaId);
    }
    const limite = Date.parse(temporada.fechaLimiteCierre);
    // Registro sólo ANTES de la fecha límite: `ahora >= limite` ⇒ fuera de plazo.
    if (!Number.isNaN(limite) && ahora >= limite) {
      throw new FechaLimiteCierreAlcanzadaError(
        temporadaId,
        temporada.fechaLimiteCierre,
        new Date(ahora).toISOString(),
      );
    }
    return temporada;
  }
}
