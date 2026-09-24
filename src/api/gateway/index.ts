// API Gateway (borde) — barrel del módulo.
//
// Expone las piezas del gateway: pipeline compuesto, middleware de
// autenticación, limitador de tasa, enrutador, helpers de terminación TLS y los
// tipos de petición/respuesta agnósticos del framework.
//
// Task 4.1 — Requirements: 1.2, 20.1

export { ApiGateway, type GatewayConfig } from './gateway.js';

export {
  authenticate,
  authenticateRequest,
  type AuthMiddlewareConfig,
  type AuthResult,
  type AuthRejectionReason,
  type ClockSeconds,
} from './auth-middleware.js';

export {
  TokenBucketRateLimiter,
  InMemoryRateLimiterStore,
  type RateLimiterConfig,
  type RateLimiterStore,
  type RateLimitResult,
  type BucketState,
  type ClockMs,
} from './rate-limiter.js';

export {
  DistributedRateLimiterStore,
  type KeyValueClient,
  type DistributedStoreOptions,
} from './distributed-rate-limiter-store.js';

export {
  buildSecurityHeaders,
  handlePreflight,
  type EdgeSecurityConfig,
} from './security-headers.js';

export { createSupabaseAuthVerifier, type SupabaseAuthVerifierOptions } from './supabase-auth.js';

export { type TokenVerifier, type TokenVerifyResult } from './auth-middleware.js';

export { GatewayRouter, type RouteMatch } from './router.js';

export {
  createTlsTerminationConfig,
  enforceTls,
  isRequestOverTls,
  DEFAULT_TLS_CONFIG,
  type TlsTerminationConfig,
} from './tls.js';

export type {
  GatewayContext,
  GatewayRequest,
  GatewayResponse,
  HttpMethod,
  ServiceHandler,
} from './types.js';
