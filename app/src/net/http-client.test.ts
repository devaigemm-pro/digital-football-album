// Pruebas del cliente HTTP (Task 25.1) — Requirements: 22.3, 28.1
//
// TypeScript puro con un `fetch` fake inyectado: NO requieren dependencias
// nativas de React Native ni red real. Cubren:
//   - Rechazo de transporte no-TLS (URL http://) — Req 28.1.
//   - Adjunto de `Authorization: Bearer <token>` cuando hay Access_Token
//     vigente y su ausencia cuando el proveedor devuelve null — Req 22.3.
//   - Composición correcta de método, URL (base + ruta) y cuerpo.

import {
  HttpClient,
  InsecureTransportError,
  type FetchLike,
  type FetchLikeResponse,
} from './http-client';

/** Registro de la última llamada capturada por el fetch fake. */
interface CapturedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Construye un fetch fake que registra la llamada y devuelve una respuesta
 * configurable. No realiza I/O real.
 */
function makeFakeFetch(
  responseBody: unknown = { ok: true },
  status = 200,
): { fetchImpl: FetchLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
    });
    const response: FetchLikeResponse = {
      status,
      text: async () =>
        responseBody === undefined ? '' : JSON.stringify(responseBody),
    };
    return response;
  };
  return { fetchImpl, calls };
}

describe('HttpClient — TLS obligatorio (Req 28.1)', () => {
  it('rechaza una baseUrl no-TLS al construir el cliente', () => {
    const { fetchImpl } = makeFakeFetch();
    expect(
      () => new HttpClient({ baseUrl: 'http://api.example.com', fetchImpl }),
    ).toThrow(InsecureTransportError);
  });

  it('rechaza una ruta absoluta http:// en tiempo de petición', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await expect(client.get('http://insecure.example.com/data')).rejects.toBeInstanceOf(
      InsecureTransportError,
    );
    // No debe haberse invocado fetch al rechazar antes del envío.
    expect(calls).toHaveLength(0);
  });

  it('acepta URLs https:// y realiza la petición', async () => {
    const { fetchImpl, calls } = makeFakeFetch({ value: 42 });
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    const res = await client.get<{ value: number }>('/data');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ value: 42 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/data');
  });
});

describe('HttpClient — adjunto de Access_Token (Req 22.3)', () => {
  it('adjunta Authorization: Bearer <token> cuando existe token', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'tok-123',
      fetchImpl,
    });

    await client.get('/perfil');

    expect(calls[0].headers?.['Authorization']).toBe('Bearer tok-123');
  });

  it('omite Authorization cuando el proveedor devuelve null', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => null,
      fetchImpl,
    });

    await client.get('/perfil');

    expect(calls[0].headers?.['Authorization']).toBeUndefined();
  });

  it('omite Authorization en peticiones marcadas como no autenticadas', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'tok-123',
      fetchImpl,
    });

    await client.post('/auth/login', { email: 'a@b.co' }, { authenticated: false });

    expect(calls[0].headers?.['Authorization']).toBeUndefined();
  });

  it('lee el token vigente en cada petición (no lo cachea)', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    let current: string | null = 'tok-a';
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => current,
      fetchImpl,
    });

    await client.get('/a');
    current = 'tok-b';
    await client.get('/b');

    expect(calls[0].headers?.['Authorization']).toBe('Bearer tok-a');
    expect(calls[1].headers?.['Authorization']).toBe('Bearer tok-b');
  });
});

describe('HttpClient — composición de método, URL y cuerpo', () => {
  it('compone base + ruta normalizando barras', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/',
      fetchImpl,
    });

    await client.get('/v1/clubs');

    expect(calls[0].url).toBe('https://api.example.com/v1/clubs');
  });

  it('serializa el cuerpo como JSON y fija Content-Type en POST', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await client.post('/momentos', { titulo: 'Gol' });

    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toBe(JSON.stringify({ titulo: 'Gol' }));
    expect(calls[0].headers?.['Content-Type']).toBe('application/json');
  });

  it('usa el método correcto en put/patch/delete', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await client.put('/a', { x: 1 });
    await client.patch('/b', { y: 2 });
    await client.delete('/c');

    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PATCH', 'DELETE']);
  });

  it('devuelve body null ante respuesta sin contenido', async () => {
    const { fetchImpl } = makeFakeFetch(undefined, 204);
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    const res = await client.delete('/recurso');

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('permite fusionar cabeceras personalizadas', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'tok-1',
      fetchImpl,
    });

    await client.get('/data', { headers: { 'X-Custom': 'v' } });

    expect(calls[0].headers?.['X-Custom']).toBe('v');
    expect(calls[0].headers?.['Authorization']).toBe('Bearer tok-1');
  });
});
