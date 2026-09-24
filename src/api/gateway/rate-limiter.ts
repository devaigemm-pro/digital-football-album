// Limitador de tasa del API Gateway (borde).
//
// Diseño (design.md · "API Gateway (borde)"): el gateway "aplica límites de
// tasa" antes de enrutar a los servicios. Implementamos un **token bucket**
// (cubo de fichas) por clave de cliente/usuario:
//   - cada clave tiene un cubo con capacidad `burst` (ráfaga máxima) que se
//     rellena a `refillPerSecond` fichas por segundo hasta la capacidad;
//   - cada petición consume una ficha; si no hay fichas disponibles la petición
//     se rechaza (`429 Too Many Requests`) con la cabecera `Retry-After`.
//
// El token bucket permite ráfagas cortas (hasta `burst`) manteniendo una tasa
// media sostenida (`refillPerSecond`), lo que encaja con un gateway de API.
//
// Todo es determinista y agnóstico del framework: el reloj (`nowMs`) y el
// almacén (`RateLimiterStore`) se inyectan, de modo que las pruebas controlan el
// tiempo y no dependen de temporizadores reales. El almacén por defecto es
// en memoria; en producción puede respaldarse en Redis manteniendo la misma
// interfaz.
//
// Task 4.1 — Requirements: 1.2, 20.1 (borde del gateway)

/** Reloj inyectable en milisegundos epoch. */
export type ClockMs = () => number;

/** Estado persistido de un cubo de fichas para una clave. */
export interface BucketState {
  /** Fichas disponibles (puede ser fraccionario por el rellenado continuo). */
  tokens: number;
  /** Marca de tiempo (ms) del último rellenado/actualización. */
  lastRefillMs: number;
}

/**
 * Almacén de estado de cubos por clave. Se abstrae para poder respaldarlo en
 * memoria (por defecto) o en un almacén distribuido (Redis) sin cambiar la
 * lógica del limitador.
 */
export interface RateLimiterStore {
  get(key: string): BucketState | undefined;
  set(key: string, state: BucketState): void;
}

/** Almacén en memoria por defecto (un `Map`). Suficiente para un solo proceso. */
export class InMemoryRateLimiterStore implements RateLimiterStore {
  private readonly buckets = new Map<string, BucketState>();

  get(key: string): BucketState | undefined {
    return this.buckets.get(key);
  }

  set(key: string, state: BucketState): void {
    this.buckets.set(key, state);
  }
}

/** Configuración del limitador token bucket. */
export interface RateLimiterConfig {
  /** Capacidad máxima del cubo: tamaño de ráfaga permitido. Debe ser ≥ 1. */
  readonly burst: number;
  /** Fichas repuestas por segundo: tasa media sostenida. Debe ser > 0. */
  readonly refillPerSecond: number;
  /** Reloj en ms. Por defecto `Date.now`. Inyectable para pruebas. */
  readonly now?: ClockMs;
  /** Almacén de cubos. Por defecto en memoria. Inyectable para pruebas/Redis. */
  readonly store?: RateLimiterStore;
}

/** Resultado de evaluar una petición contra el limitador. */
export interface RateLimitResult {
  /** `true` si la petición se admite (había una ficha disponible). */
  readonly allowed: boolean;
  /** Fichas restantes tras la evaluación (enteras, hacia abajo). */
  readonly remaining: number;
  /**
   * Segundos sugeridos para reintentar cuando `allowed` es `false`; `0` cuando
   * se admitió. Alimenta la cabecera `Retry-After`.
   */
  readonly retryAfterSeconds: number;
}

/**
 * Limitador de tasa token bucket, por clave de cliente/usuario. Determinista e
 * inyectable (reloj + almacén).
 */
export class TokenBucketRateLimiter {
  private readonly burst: number;
  private readonly refillPerSecond: number;
  private readonly now: ClockMs;
  private readonly store: RateLimiterStore;

  constructor(config: RateLimiterConfig) {
    if (!Number.isFinite(config.burst) || config.burst < 1) {
      throw new Error(`burst debe ser ≥ 1, recibido: ${config.burst}`);
    }
    if (!Number.isFinite(config.refillPerSecond) || config.refillPerSecond <= 0) {
      throw new Error(`refillPerSecond debe ser > 0, recibido: ${config.refillPerSecond}`);
    }
    this.burst = config.burst;
    this.refillPerSecond = config.refillPerSecond;
    this.now = config.now ?? ((): number => Date.now());
    this.store = config.store ?? new InMemoryRateLimiterStore();
  }

  /**
   * Consume una ficha para `key`. Rellena el cubo según el tiempo transcurrido,
   * consume una ficha si hay disponible y persiste el nuevo estado.
   */
  consume(key: string): RateLimitResult {
    const nowMs = this.now();
    const state = this.refill(key, nowMs);

    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.store.set(key, state);
      return {
        allowed: true,
        remaining: Math.floor(state.tokens),
        retryAfterSeconds: 0,
      };
    }

    // Sin fichas: persiste el estado rellenado y calcula cuándo habrá una.
    this.store.set(key, state);
    const deficit = 1 - state.tokens;
    const retryAfterSeconds = Math.max(1, Math.ceil(deficit / this.refillPerSecond));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  /**
   * Rellena el cubo de `key` en función del tiempo transcurrido desde el último
   * rellenado, sin exceder la capacidad `burst`. Un cubo nuevo arranca lleno.
   */
  private refill(key: string, nowMs: number): BucketState {
    const existing = this.store.get(key);
    if (existing === undefined) {
      return { tokens: this.burst, lastRefillMs: nowMs };
    }
    // Protege contra relojes que retroceden: nunca resta fichas por tiempo negativo.
    const elapsedMs = Math.max(0, nowMs - existing.lastRefillMs);
    const refilled = (elapsedMs / 1000) * this.refillPerSecond;
    return {
      tokens: Math.min(this.burst, existing.tokens + refilled),
      lastRefillMs: nowMs,
    };
  }
}
