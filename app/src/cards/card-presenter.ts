// CardPresenter — núcleo framework-agnóstico de la generación de una Digital
// Card y su gating visible en el cliente.
//
// Task 29.2 — Requirements: 5.1, 5.2, 5.3, 5.4
// (backend Req 12.1/12.2/12.3/12.4 — Generador_Cards `POST /cards`;
//  cliente Req 27.3 — mapeo del rechazo por gating al mensaje
//  "requiere Plan_Premium" SIN decidir el gating en el cliente).
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `DigitalCardScreen.tsx` enlaza. Orquesta la generación de la Digital_Card a
// través del contrato `CardsClient` inyectable (adaptador HTTP en producción,
// doble en memoria en pruebas) y expone un estado observable listo para pintar:
//
//   idle → generating → generated(card) | error
//
// PRINCIPIO CLAVE (Req 5.3, 5.4): el gating por plan lo decide EL BACKEND. El
// cliente NO evalúa el plan ni recalcula derechos: solo invoca
// `CardsClient.generateCard` (`POST /cards`) y, si el backend rechaza por
// gating, refleja ese rechazo como un mensaje de usuario distinto
// ("requiere Plan_Premium"). Cualquier otro fallo se refleja como un error
// genérico. Nunca se re-deriva el plan localmente.
//
// Toda la lógica sensible a la corrección (transiciones de estado, distinción
// del rechazo por gating frente a un error genérico, tolerancia a fallos) vive
// aquí y es unit-testable; el `.tsx` de la pantalla es una envoltura delgada.

import type { CardsClient, DigitalCard } from '../viewmodels';
import {
  PremiumRequiredError,
  PREMIUM_REQUIRED_MESSAGE,
  classifyResponse,
} from '../net/errors';
import type { HttpResponse } from '../net/http-client';

/**
 * Mensaje de usuario canónico cuando la generación falla por gating de plan
 * (Req 5.4 / cliente Req 27.3). Se reexporta el valor central de `net/errors`
 * para que la UI y las pruebas usen exactamente el mismo texto sin duplicarlo.
 */
export const PREMIUM_REQUIRED_CARD_MESSAGE = PREMIUM_REQUIRED_MESSAGE;

/** Mensaje genérico ante un fallo de generación que NO es gating (Req 5.4). */
export const CARD_GENERIC_ERROR_MESSAGE =
  'No se pudo generar la Digital Card. Intenta de nuevo.';

/** Fase de la generación no bloqueante de la Digital_Card (Req 5.3). */
export type CardStatus = 'idle' | 'generating' | 'generated' | 'error';

/**
 * Naturaleza del error reflejado cuando `status === 'error'`:
 *   - `'gating'`  → el backend rechazó por plan insuficiente (Req 5.4);
 *   - `'generic'` → cualquier otro fallo (red, backend, entorno) (Req 5.4).
 * Permite a la UI distinguir el caso de gating (ofrecer upgrade) del genérico
 * (ofrecer reintento) SIN que el cliente haya decidido el gating él mismo.
 */
export type CardErrorKind = 'gating' | 'generic';

/**
 * Estado observable listo para pintar que expone el presentador. La UI se enlaza
 * a él vía `getState`/`subscribe` sin conocer al cliente ni bloquearse.
 */
export interface CardState {
  /** Fase actual de la generación (Req 5.3). */
  readonly status: CardStatus;
  /**
   * La Digital_Card generada cuando `status === 'generated'`, o `null` en otro
   * caso. Contiene `objectKey` (binario a mostrar) y `formato` (Req 5.1, 5.2).
   */
  readonly card: DigitalCard | null;
  /**
   * Mensaje legible cuando `status === 'error'`, o `null` en otro caso. Ante
   * gating es exactamente "requiere Plan_Premium" (Req 5.4).
   */
  readonly error: string | null;
  /**
   * Naturaleza del error (`'gating'` | `'generic'`) cuando `status === 'error'`,
   * o `null` en otro caso. La UI decide la acción a ofrecer según este valor.
   */
  readonly errorKind: CardErrorKind | null;
}

/** Oyente del estado de la card; recibe el estado actual completo. */
export type CardStateListener = (state: CardState) => void;

/** Estado inicial: nada generado aún, sin bloquear la UI (Req 5.3). */
const INITIAL_STATE: CardState = {
  status: 'idle',
  card: null,
  error: null,
  errorKind: null,
};

/**
 * ¿El error lanzado por el `CardsClient` corresponde a un rechazo por gating de
 * plan del BACKEND? (Req 5.4). Reconoce dos formas SIN evaluar el plan:
 *   1. un `PremiumRequiredError` ya tipado (lo normal si el adaptador HTTP usa
 *      el `classifyResponse` de `net/errors`);
 *   2. un objeto tipo `HttpResponse` (o `{ response }`) que `classifyResponse`
 *      clasifica como gating (tolera adaptadores que propaguen la respuesta
 *      cruda del backend).
 * En ambos casos la DECISIÓN de gating proviene del backend; el cliente solo la
 * reconoce para elegir el mensaje a mostrar.
 */
function isGatingRejection(err: unknown): boolean {
  if (err instanceof PremiumRequiredError) {
    return true;
  }
  const response = extractHttpResponse(err);
  if (response !== null) {
    return classifyResponse(response) instanceof PremiumRequiredError;
  }
  return false;
}

/**
 * Extrae una `HttpResponse` de un error de transporte que la exponga
 * directamente o bajo la propiedad `response`, o `null` si no la lleva. No
 * inventa datos: solo lee lo que el backend/adaptador ya adjuntó.
 */
function extractHttpResponse(err: unknown): HttpResponse | null {
  if (!err || typeof err !== 'object') {
    return null;
  }
  const candidate = 'response' in err ? (err as { response: unknown }).response : err;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { status?: unknown }).status === 'number'
  ) {
    return candidate as HttpResponse;
  }
  return null;
}

/**
 * Presentador de la generación de la Digital_Card: fuente de verdad observable
 * que la pantalla `DigitalCardScreen` enlaza. Orquesta la generación a través
 * del `CardsClient` inyectado y expone `getState`/`subscribe` estables más
 * `generate(usuarioId, momentoId)`.
 */
export class CardPresenter {
  private state: CardState = INITIAL_STATE;
  private readonly listeners = new Set<CardStateListener>();
  /**
   * Marca de la generación en curso: solo la última `generate` invocada aplica
   * su resultado. Evita condiciones de carrera si el usuario reintenta o cambia
   * de Momento mientras una petición previa sigue en vuelo (Req 5.3).
   */
  private generateToken = 0;

  /**
   * @param client Contrato del Generador_Cards (`POST /cards`). Se inyecta para
   *   permitir un doble en memoria en pruebas y un adaptador HTTP en producción.
   *   El cliente encapsula la llamada al backend, que es quien decide el gating.
   */
  constructor(private readonly client: CardsClient) {}

  /** Estado actual listo para pintar (Req 5.1, 5.2, 5.3, 5.4). */
  getState(): CardState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: CardStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Genera la Digital_Card de un Momento para el usuario sin bloquear la UI
   * (Req 5.3):
   *   1. transiciona a `generating`;
   *   2. invoca `client.generateCard(usuarioId, momentoId)` (`POST /cards`) —
   *      el cliente NO decide el gating, solo llama al backend (Req 5.3, 5.4);
   *   3. al resolver, transiciona a `generated` exponiendo la card (Req 5.1, 5.2);
   *   4. si el cliente rechaza:
   *        - por gating (backend) → estado `error` con "requiere Plan_Premium"
   *          y `errorKind: 'gating'` (Req 5.4), SIN re-derivar el plan;
   *        - por cualquier otro fallo → estado `error` con mensaje genérico y
   *          `errorKind: 'generic'` (Req 5.4).
   *
   * Es idempotente ante reintentos: solo el resultado de la última invocación
   * aplica (protección contra carreras).
   *
   * @returns una promesa que siempre resuelve (nunca rechaza), para que la UI
   *   pueda `await` sin envolver en try/catch.
   */
  async generate(usuarioId: string, momentoId: string): Promise<void> {
    const token = ++this.generateToken;
    this.emit({
      status: 'generating',
      // Conserva la card previa mientras regenera (UI operable — Req 5.3).
      card: this.state.card,
      error: null,
      errorKind: null,
    });

    try {
      const card = await this.client.generateCard(usuarioId, momentoId);
      if (token !== this.generateToken) {
        // Una generación más reciente la reemplazó: descartar este resultado.
        return;
      }
      this.emit({
        status: 'generated',
        card,
        error: null,
        errorKind: null,
      });
    } catch (err) {
      if (token !== this.generateToken) {
        return;
      }
      // El gating lo decidió el backend; aquí solo se reconoce para el mensaje.
      if (isGatingRejection(err)) {
        this.emit({
          status: 'error',
          card: this.state.card,
          error: PREMIUM_REQUIRED_CARD_MESSAGE,
          errorKind: 'gating',
        });
        return;
      }
      // Fallo no bloqueante genérico: se refleja como estado, no como excepción.
      this.emit({
        status: 'error',
        card: this.state.card,
        error: CARD_GENERIC_ERROR_MESSAGE,
        errorKind: 'generic',
      });
    }
  }

  private emit(state: CardState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
