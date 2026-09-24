// Pruebas del store de rate limiting distribuido (caché local + backend async).

import { describe, expect, it, vi } from 'vitest';
import {
  DistributedRateLimiterStore,
  type KeyValueClient,
} from './distributed-rate-limiter-store.js';
import type { BucketState } from './rate-limiter.js';

/** Cliente KV en memoria que simula un backend async (Redis-like). */
class FakeKV implements KeyValueClient {
  readonly store = new Map<string, string>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}

const state = (tokens: number): BucketState => ({ tokens, lastRefillMs: 1000 });

describe('DistributedRateLimiterStore', () => {
  it('set actualiza la caché local de inmediato (síncrono)', () => {
    const kv = new FakeKV();
    const store = new DistributedRateLimiterStore(kv);
    store.set('c1', state(5));
    expect(store.get('c1')).toEqual(state(5));
  });

  it('escribe al backend (write-through) tras un set', async () => {
    const kv = new FakeKV();
    const store = new DistributedRateLimiterStore(kv, { keyPrefix: 'rl:' });
    store.set('c1', state(3));
    // La escritura es asíncrona; esperar al microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(kv.store.get('rl:c1')).toBe(JSON.stringify(state(3)));
  });

  it('hidrata desde el backend ante un miss local', async () => {
    const kv = new FakeKV();
    kv.store.set('ratelimit:c2', JSON.stringify(state(7)));
    const store = new DistributedRateLimiterStore(kv);

    // Primer get: miss local, dispara hidratación en segundo plano.
    expect(store.get('c2')).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    // Tras hidratar, el valor remoto está disponible localmente.
    expect(store.get('c2')).toEqual(state(7));
  });

  it('degrada con elegancia si el backend falla (no lanza)', async () => {
    const failing: KeyValueClient = {
      get: () => Promise.reject(new Error('backend down')),
      set: () => Promise.reject(new Error('backend down')),
    };
    const onError = vi.fn();
    const store = new DistributedRateLimiterStore(failing, { onError });

    // Ni get ni set lanzan; el limitador sigue operando con la caché local.
    expect(() => store.set('c3', state(2))).not.toThrow();
    expect(store.get('c3')).toEqual(state(2));
    // El error del backend se reporta por el callback (sin romper el flujo).
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
  });
});
