// Módulo de red del cliente (cliente HTTP, interceptores auth/refresh, TLS).
//
// Task 24 (scaffold) — Requirements: 21.1, 21.2
// Task 25.1 — Requirements: 22.3, 28.1 (cliente HTTP con TLS obligatorio y
// adjunto del Access_Token). El refresh single-flight con rotación (Task 25.2),
// el almacenamiento seguro (Task 25.3) y el mapeo de errores/resiliencia
// (Task 25.4) se añadirán a este barrel al implementarse.

// Task 25.1 — cliente HTTP con TLS obligatorio y adjunto de Access_Token.
export { HttpClient, InsecureTransportError } from './http-client';
export type {
  AccessTokenProvider,
  FetchLike,
  FetchLikeResponse,
  HttpClientConfig,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  RequestOptions,
} from './http-client';

// Task 25.2 — refresh single-flight con rotación y reintento (Req 22.4, 22.5, 27.1).
export {
  SessionHttpClient,
  InMemoryAccessTokenHolder,
  RefreshUnauthorizedError,
  SessionExpiredError,
  makeAuthRefreshFn,
} from './session-client';
export type {
  AccessTokenHolder,
  RefreshFn,
  SendFn,
  SessionHttpClientConfig,
  TokenPair,
} from './session-client';

// Task 25.4 — mapeo de errores del backend y resiliencia de red (Req 27.2–27.5).
export {
  ClientNetworkError,
  ApiError,
  ClubChangeConflictError,
  PremiumRequiredError,
  NetworkError,
  TimeoutError,
  PREMIUM_REQUIRED_MESSAGE,
  classifyResponse,
  classifyTransportError,
  backoffDelay,
  isRetriableMethod,
  withRetry,
  withTimeout,
} from './errors';
export type { Sleep, Now, RetryPolicy } from './errors';
