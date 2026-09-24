// Store de rate limiting distribuido con caché local (write-through).
//
// El `RateLimiterStore` del gateway es síncrono (el `consume` del token bucket
// no es async). Para respaldar el estado en un almacén distribuido (Redis) sin
// cambiar esa firma, este adaptador mantiene una caché local síncrona y
// sincroniza con el backend de forma asíncrona (best-effort):
//   - `get` devuelve el estado de la caché local (rápido, síncrono).
//   - `set` actualiza la caché y dispara una escritura asíncrona al backend.
//   - al arrancar (o ante un miss), hidrata la caché desde el backend en
//     segundo plano, de modo que instancias nuevas convergen al estado global.
//
// Es "best-effort": si el backend falla, el limitador sigue funcionando con la
// caché local (degradación elegante, nunca bloquea el borde). Con varias
// instancias, el estado converge; para límites estrictos exactos se necesitaría
// un algoritmo atómico en el backend (script Lua), fuera del alcance de este
// adaptador base.

import type { BucketState, RateLimiterStore } from './rate-limiter.js';

/**
 * Cliente mínimo tipo Redis que este store necesita. Se inyecta para no acoplar
 * el gateway a una librería concreta; un adaptador real (ioredis, node-redis)
 * cumple esta forma con un wrapper delgado.
 */
export interface KeyValueClient {
  /** Devuelve el valor almacenado bajo `key`, o `null` si no existe. */
  get(key: string): Promise<string | null>;
  /** Almacena `value` bajo `key`, opcionalmente con expiración en segundos. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export interface DistributedStoreOptions {
  /** Prefijo de las claves en el backend. Por defecto `ratelimit:`. */
  readonly keyPrefix?: string;
  /** TTL de las entradas en el backend (segundos). Por defecto 3600. */
  readonly ttlSeconds?: number;
  /** Callback de errores del backend (para logging). Por defecto, se ignoran. */
  readonly onError?: (err: unknown) => void;
}

/**
 * `RateLimiterStore` respaldado por un `KeyValueClient` distribuido, con caché
 * local write-through y degradación elegante ante fallos del backend.
 */
export class DistributedRateLimiterStore implements RateLimiterStore {
  private readonly local = new Map<string, BucketState>();
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;
  private readonly onError: (err: unknown) => void;

  constructor(
    private readonly client: KeyValueClient,
    options: DistributedStoreOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'ratelimit:';
    this.ttlSeconds = options.ttlSeconds ?? 3600;
    this.onError = options.onError ?? ((): void => {});
  }

  get(key: string): BucketState | undefined {
    const cached = this.local.get(key);
    if (cached !== undefined) return cached;
    // Miss local: hidrata desde el backend en segundo plano para futuras lecturas.
    void this.hydrate(key);
    return undefined;
  }

  set(key: string, state: BucketState): void {
    this.local.set(key, state);
    // Escritura asíncrona best-effort al backend.
    void this.persist(key, state);
  }

  private backendKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async hydrate(key: string): Promise<void> {
    try {
      const raw = await this.client.get(this.backendKey(key));
      if (raw === null) return;
      // Solo adopta el valor remoto si aún no hay uno local más reciente.
      if (!this.local.has(key)) {
        const parsed = JSON.parse(raw) as BucketState;
        if (typeof parsed.tokens === 'number' && typeof parsed.lastRefillMs === 'number') {
          this.local.set(key, parsed);
        }
      }
    } catch (err) {
      this.onError(err);
    }
  }

  private async persist(key: string, state: BucketState): Promise<void> {
    try {
      await this.client.set(this.backendKey(key), JSON.stringify(state), this.ttlSeconds);
    } catch (err) {
      this.onError(err);
    }
  }
}
