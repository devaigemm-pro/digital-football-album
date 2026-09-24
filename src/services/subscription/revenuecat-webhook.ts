// Manejador de webhooks de RevenueCat (Req 3.3, 3.5).
//
// RevenueCat notifica los cambios de suscripción (renovación, cancelación,
// fallo de cobro, etc.) mediante webhooks HTTP. Este manejador implementa los
// contratos de design.md ("Servicio_Suscripción" → `webhook RevenueCat`):
//
//   - **Verifica la firma** del webhook (secreto compartido / HMAC) y rechaza
//     cualquier evento cuya firma no valide, sin efecto sobre el estado.
//   - Es **idempotente por `eventId`**: cada evento se procesa a lo sumo una
//     vez; los reintentos/duplicados de RevenueCat se deduplican registrando los
//     `eventId` ya aplicados en un `ProcessedEventStore`.
//   - **Tolera eventos fuera de orden**: el estado se resuelve a partir del
//     evento más reciente por marca de tiempo (`eventTimestamp`), de modo que un
//     evento antiguo que llega tarde no revierte un estado más nuevo ya aplicado.
//     La marca del último evento aplicado se persiste por suscripción en un
//     `LastEventTimestampStore`.
//   - En **pago recurrente OK** activa/renueva la suscripción (Req 3.3).
//   - En **fallo de pago** conserva el estado de suscripción previo y notifica al
//     usuario (Req 3.5).
//
// Toda dependencia con I/O o no determinismo (repositorio de suscripciones,
// verificación de firma, almacén de eventos procesados, almacén de marcas de
// tiempo, notificador) se inyecta para poder ejercitar el manejador con dobles
// en memoria. El seguimiento de `lastEventTimestamp` se mantiene en un almacén
// propio de este módulo (indexado por `revenueCatId`) para no acoplarlo al
// esquema de la entidad `Suscripcion`.
//
// Task 6.2 — Requirements: 3.3, 3.5

import type { ISODateTime, Suscripcion } from '../../domain/types.js';
import type { SuscripcionRepository } from '../../persistence/repositories.js';

/**
 * Tipo de evento de RevenueCat que este manejador interpreta. Los eventos de
 * renovación/compra inicial acreditan un pago correcto (Req 3.3); los de fallo
 * de cobro disparan la conservación de estado + notificación (Req 3.5). El resto
 * se ignora de forma segura (idempotente, sin efecto sobre el plan/estado).
 */
export type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'PRODUCT_CHANGE'
  | 'BILLING_ISSUE'
  | 'CANCELLATION'
  | 'EXPIRATION';

/**
 * Evento de webhook de RevenueCat ya deserializado (el payload interno de un
 * webhook de RevenueCat vive bajo la clave `event`). El manejador no parsea el
 * transporte HTTP; recibe el evento tipado y su firma por separado.
 */
export interface RevenueCatEvent {
  /** Identificador único del evento; clave de idempotencia (Req 3.3). */
  eventId: string;
  type: RevenueCatEventType;
  /** Identificador de la suscripción en RevenueCat; concilia con `Suscripcion.revenueCatId`. */
  revenueCatId: string;
  /**
   * Marca de tiempo del evento en el origen. Resuelve el orden real de los
   * eventos con independencia del orden de llegada (tolerancia a orden).
   */
  eventTimestamp: ISODateTime;
  /** Nueva vigencia acreditada por un pago correcto (Req 3.3). Ausente en fallos. */
  vigenciaHasta?: string;
}

/**
 * Verificador de firma del webhook. La implementación de producción calcula un
 * HMAC del cuerpo crudo con el secreto compartido de RevenueCat y lo compara en
 * tiempo constante con la firma recibida; en pruebas se inyecta un doble.
 */
export interface WebhookSignatureVerifier {
  /**
   * Devuelve `true` si `signature` es una firma válida del `rawBody`. El
   * manejador rechaza el evento cuando devuelve `false`.
   */
  verificar(rawBody: string, signature: string): boolean;
}

/**
 * Almacén de `eventId` ya aplicados, base de la idempotencia (Req 3.3). La
 * implementación de producción lo respalda en una tabla de eventos procesados;
 * en pruebas se usa un doble en memoria.
 */
export interface ProcessedEventStore {
  /** Indica si el evento ya fue aplicado. */
  fueProcesado(eventId: string): Promise<boolean>;
  /** Registra el evento como aplicado. */
  marcarProcesado(eventId: string): Promise<void>;
}

/**
 * Almacén de la marca de tiempo del último evento aplicado por suscripción
 * (clave: `revenueCatId`). Sostiene la tolerancia a eventos fuera de orden: un
 * evento cuya marca no sea posterior a la registrada no revierte el estado.
 */
export interface LastEventTimestampStore {
  /** Marca del último evento aplicado a la suscripción, o `null` si no hay. */
  obtener(revenueCatId: string): Promise<ISODateTime | null>;
  /** Registra la marca del último evento aplicado a la suscripción. */
  registrar(revenueCatId: string, timestamp: ISODateTime): Promise<void>;
}

/**
 * Notificador al usuario ante fallo de pago (Req 3.5). La implementación de
 * producción emite un push/email; en pruebas se inyecta un doble que registra
 * las notificaciones emitidas.
 */
export interface Notifier {
  /** Notifica al usuario el fallo de cobro de su suscripción (Req 3.5). */
  notificarFalloPago(suscripcion: Suscripcion, evento: RevenueCatEvent): Promise<void>;
}

/** Códigos de resultado del procesamiento de un webhook. */
export type WebhookOutcome =
  | 'INVALID_SIGNATURE'
  | 'DUPLICATE'
  | 'STALE'
  | 'NO_SUBSCRIPTION'
  | 'RENEWED'
  | 'PAYMENT_FAILED'
  | 'IGNORED';

/** Resultado del procesamiento de un webhook, con el estado resultante si aplica. */
export interface WebhookResult {
  outcome: WebhookOutcome;
  /** Suscripción tras el procesamiento (o su estado preservado); `null` si no existe. */
  suscripcion: Suscripcion | null;
}

/** Dependencias inyectadas del manejador de webhooks. */
export interface RevenueCatWebhookHandlerDeps {
  suscripciones: SuscripcionRepository;
  signatureVerifier: WebhookSignatureVerifier;
  processedEvents: ProcessedEventStore;
  lastEventTimestamps: LastEventTimestampStore;
  notifier: Notifier;
}

/** Tipos de evento que acreditan un pago correcto y activan/renuevan (Req 3.3). */
const EVENTOS_PAGO_OK: ReadonlySet<RevenueCatEventType> = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
]);

/** Tipos de evento que representan un fallo de cobro (Req 3.5). */
const EVENTOS_FALLO_PAGO: ReadonlySet<RevenueCatEventType> = new Set(['BILLING_ISSUE']);

/**
 * Manejador del webhook de RevenueCat. Verifica la firma, deduplica por
 * `eventId`, resuelve el estado por marca de tiempo (tolerancia a orden) y
 * aplica el efecto según el tipo de evento (Req 3.3, 3.5).
 */
export class RevenueCatWebhookHandler {
  private readonly suscripciones: SuscripcionRepository;
  private readonly signatureVerifier: WebhookSignatureVerifier;
  private readonly processedEvents: ProcessedEventStore;
  private readonly lastEventTimestamps: LastEventTimestampStore;
  private readonly notifier: Notifier;

  constructor(deps: RevenueCatWebhookHandlerDeps) {
    this.suscripciones = deps.suscripciones;
    this.signatureVerifier = deps.signatureVerifier;
    this.processedEvents = deps.processedEvents;
    this.lastEventTimestamps = deps.lastEventTimestamps;
    this.notifier = deps.notifier;
  }

  /**
   * Procesa un webhook de RevenueCat.
   *
   * @param rawBody   Cuerpo crudo del webhook (sobre el que se verifica la firma).
   * @param signature Firma recibida en la cabecera de autorización de RevenueCat.
   * @param evento    Evento ya deserializado a partir de `rawBody`.
   *
   * Orden de decisión:
   *  1. Firma inválida → `INVALID_SIGNATURE`, sin efecto.
   *  2. `eventId` ya aplicado → `DUPLICATE`, sin reaplicar (idempotencia).
   *  3. Sin suscripción conciliable → `NO_SUBSCRIPTION` (se registra como
   *     procesado para no reintentar indefinidamente).
   *  4. Evento no posterior al último aplicado → `STALE`, sin revertir estado
   *     (tolerancia a orden); se marca procesado.
   *  5. Pago OK → activa/renueva (`RENEWED`); fallo de pago → conserva estado y
   *     notifica (`PAYMENT_FAILED`); otro → `IGNORED`.
   */
  async handle(
    rawBody: string,
    signature: string,
    evento: RevenueCatEvent,
  ): Promise<WebhookResult> {
    // 1. Verificación de firma: rechazar sin efecto los eventos no verificados.
    if (!this.signatureVerifier.verificar(rawBody, signature)) {
      return { outcome: 'INVALID_SIGNATURE', suscripcion: null };
    }

    // 2. Idempotencia: los reintentos/duplicados no reaplican el cambio.
    if (await this.processedEvents.fueProcesado(evento.eventId)) {
      const actual = await this.suscripciones.findByRevenueCatId(evento.revenueCatId);
      return { outcome: 'DUPLICATE', suscripcion: actual };
    }

    const suscripcion = await this.suscripciones.findByRevenueCatId(evento.revenueCatId);
    if (suscripcion === null) {
      // No hay suscripción que conciliar: se registra el evento para no
      // reprocesarlo y se termina sin efecto.
      await this.processedEvents.marcarProcesado(evento.eventId);
      return { outcome: 'NO_SUBSCRIPTION', suscripcion: null };
    }

    // 4. Tolerancia a orden: un evento no posterior al último aplicado no
    // revierte el estado más nuevo. Se resuelve por marca de tiempo del evento.
    if (await this.esObsoleto(evento)) {
      await this.processedEvents.marcarProcesado(evento.eventId);
      return { outcome: 'STALE', suscripcion };
    }

    // 5. Efecto según el tipo de evento.
    const resultado = await this.aplicarEvento(suscripcion, evento);
    await this.lastEventTimestamps.registrar(evento.revenueCatId, evento.eventTimestamp);
    await this.processedEvents.marcarProcesado(evento.eventId);
    return resultado;
  }

  /**
   * Un evento es obsoleto si su marca de tiempo no es posterior a la del último
   * evento aplicado a la suscripción. El primer evento (sin marca previa) nunca
   * es obsoleto.
   */
  private async esObsoleto(evento: RevenueCatEvent): Promise<boolean> {
    const ultimo = await this.lastEventTimestamps.obtener(evento.revenueCatId);
    if (ultimo === null) {
      return false;
    }
    return evento.eventTimestamp <= ultimo;
  }

  /** Aplica el efecto del evento sobre una suscripción ya conciliada y vigente. */
  private async aplicarEvento(
    suscripcion: Suscripcion,
    evento: RevenueCatEvent,
  ): Promise<WebhookResult> {
    if (EVENTOS_PAGO_OK.has(evento.type)) {
      // Pago recurrente OK → activar/renovar (Req 3.3).
      const renovada = await this.suscripciones.update(suscripcion.id, {
        estado: 'ACTIVA',
        vigenciaHasta: evento.vigenciaHasta ?? suscripcion.vigenciaHasta,
      });
      return { outcome: 'RENEWED', suscripcion: renovada };
    }

    if (EVENTOS_FALLO_PAGO.has(evento.type)) {
      // Fallo de pago → conservar el estado de suscripción previo y notificar
      // (Req 3.5). No se modifica `plan`, `estado` ni `vigenciaHasta`.
      await this.notifier.notificarFalloPago(suscripcion, evento);
      return { outcome: 'PAYMENT_FAILED', suscripcion };
    }

    // Otros eventos (cancelación/expiración) no alteran el estado en esta tarea.
    return { outcome: 'IGNORED', suscripcion };
  }
}

/**
 * `ProcessedEventStore` en memoria: registra los `eventId` aplicados en un
 * `Set`. Test double para pruebas de dominio puro; no persiste entre procesos.
 */
export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly aplicados = new Set<string>();

  fueProcesado(eventId: string): Promise<boolean> {
    return Promise.resolve(this.aplicados.has(eventId));
  }

  marcarProcesado(eventId: string): Promise<void> {
    this.aplicados.add(eventId);
    return Promise.resolve();
  }
}

/**
 * `LastEventTimestampStore` en memoria: guarda la marca del último evento
 * aplicado por `revenueCatId` en un `Map`. Test double para pruebas de dominio
 * puro; no persiste entre procesos.
 */
export class InMemoryLastEventTimestampStore implements LastEventTimestampStore {
  private readonly marcas = new Map<string, ISODateTime>();

  obtener(revenueCatId: string): Promise<ISODateTime | null> {
    return Promise.resolve(this.marcas.get(revenueCatId) ?? null);
  }

  registrar(revenueCatId: string, timestamp: ISODateTime): Promise<void> {
    this.marcas.set(revenueCatId, timestamp);
    return Promise.resolve();
  }
}
