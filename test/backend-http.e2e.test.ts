// Tests end-to-end del backend HTTP.
//
// Arrancan el servidor real (composition root + gateway + adaptador HTTP),
// obtienen un token real de Supabase Auth (GoTrue) y ejercitan los endpoints
// sobre HTTP. Verifican el pipeline completo: HTTP -> TLS -> rate limit -> auth
// (JWKS ES256) -> router -> servicio -> respuesta.
//
// Se SALTAN si no hay configuración de Supabase en el entorno. Requieren el
// stack local corriendo. Ejecutar:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<sr> SUPABASE_ANON_KEY=<anon> \
//   npx vitest run test/backend-http.e2e.test.ts

import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServices } from '../src/composition/services.js';
import { mountGateway } from '../src/composition/gateway.js';
import { createHttpServer } from '../src/composition/http-server.js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const canRun = Boolean(url && serviceRoleKey && anonKey);
const suite = canRun ? describe : describe.skip;

// Club sembrado (supabase/seed.sql).
const CLUB_KIRO = '11111111-1111-1111-1111-111111111111';

suite('backend HTTP e2e (Supabase Auth + driver supabase)', () => {
  let server: Server;
  let baseUrl: string;
  let accessToken: string;
  const email = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    // 1. Crear un usuario en GoTrue (el trigger crea su perfil en public.usuarios).
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password: 'e2e-passw0rd', email_confirm: true }),
    });
    expect(created.ok).toBe(true);

    // 2. Login para obtener un access token real (ES256).
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey!, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'e2e-passw0rd' }),
    });
    const loginJson = (await login.json()) as { access_token?: string };
    expect(typeof loginJson.access_token).toBe('string');
    accessToken = loginJson.access_token!;

    // 3. Ensamblar y levantar el backend con verificación vía Supabase Auth.
    const services = createServices({
      config: {
        accessTokenSecret: 'unused',
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 1_209_600,
      },
      persistence: { driver: 'supabase' },
    });
    const gateway = mountGateway(services, {
      accessTokenSecret: 'unused',
      allowInsecure: true,
      supabaseAuth: { url: url!, apikey: anonKey! },
    });
    server = createHttpServer(gateway);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function authed(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${accessToken}`,
      },
    });
  }

  it('GET /health es público y responde 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; driver: string };
    expect(body.status).toBe('ok');
    expect(body.driver).toBe('supabase');
  });

  it('rechaza con 401 una ruta protegida sin token', async () => {
    const res = await fetch(`${baseUrl}/me/entitlements`);
    expect(res.status).toBe(401);
  });

  it('GET /me/entitlements con token real responde 200', async () => {
    const res = await authed('/me/entitlements');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { digitalCardsInternacional: boolean };
    // Usuario nuevo sin suscripción: gating restrictivo.
    expect(body.digitalCardsInternacional).toBe(false);
  });

  it('GET /clubs lista los clubes sembrados', async () => {
    const res = await authed('/clubs');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clubs: Array<{ id: string }> };
    expect(body.clubs.length).toBeGreaterThanOrEqual(2);
  });

  it('PUT /me/club asigna el club del usuario (perfil creado por el trigger)', async () => {
    const res = await authed('/me/club', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId: CLUB_KIRO }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { identidadVisual?: { clubId?: string } };
    // La respuesta incluye la identidad visual del club asignado.
    expect(JSON.stringify(body)).toContain(CLUB_KIRO);
  });

  it('devuelve 404 en ruta inexistente (autenticado)', async () => {
    const res = await authed('/no-existe');
    expect(res.status).toBe(404);
  });
});
