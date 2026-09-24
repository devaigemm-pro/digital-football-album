// Test de integración del driver de persistencia Supabase contra la base local.
//
// Ejercita el CRUD genérico y las consultas por relación contra un stack de
// Supabase real (el que levanta `supabase start`). Se SALTA automáticamente si
// no hay configuración de Supabase en el entorno, para no romper `npm test` en
// entornos sin stack (CI sin base, contribuidores sin Docker).
//
// Cómo ejecutarlo contra la base local:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   npx vitest run test/supabase-repository.integration.test.ts
//
// Usa la service_role key para el smoke test (omite RLS). El aislamiento por
// RLS se verifica por separado a nivel de base de datos.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Club } from '../src/domain/types.js';
import type { Repositories } from '../src/persistence/index.js';
import {
  createSupabaseClient,
  createSupabaseRepositories,
  supabaseConfigFromEnv,
} from '../src/persistence/index.js';

// IDs del seed (supabase/seed.sql).
const CLUB_KIRO = '11111111-1111-1111-1111-111111111111';
const USUARIO_DEMO = '99999999-9999-9999-9999-999999999999';
const TEMPORADA_DEMO = 'dddd1111-0000-0000-0000-000000000001';

let config: ReturnType<typeof supabaseConfigFromEnv> | null = null;
try {
  config = supabaseConfigFromEnv();
} catch {
  config = null;
}

const suite = config ? describe : describe.skip;

suite('SupabaseRepositories (integración contra base local)', () => {
  // El cliente se crea en beforeAll (no se evalúa en describe.skip), evitando
  // instanciar con `config` nulo cuando la suite está saltada.
  let repos: Repositories;

  // Club efímero creado por las pruebas de CRUD, para limpiarlo al final.
  const clubEfimeroId = '5eed0000-0000-4000-8000-0000000000ab';

  beforeAll(() => {
    repos = createSupabaseRepositories(createSupabaseClient(config!));
  });

  afterAll(async () => {
    await repos.clubes.delete(clubEfimeroId);
  });

  it('lee los clubes sembrados (findAll / findById)', async () => {
    const todos = await repos.clubes.findAll();
    expect(todos.length).toBeGreaterThanOrEqual(2);

    const kiro = await repos.clubes.findById(CLUB_KIRO);
    expect(kiro).not.toBeNull();
    expect(kiro?.nombre).toBe('Atlético Kiro');
    // El campo jsonb se mapea a objeto tipado del dominio.
    expect(kiro?.paletaColores.primario).toBe('#C8102E');
  });

  it('crea, actualiza y borra un club (CRUD completo con mapeo camelCase↔snake_case)', async () => {
    const nuevo: Club = {
      id: clubEfimeroId,
      nombre: 'Club Efímero',
      paletaColores: { primario: '#123456', secundario: '#ffffff' },
      escudoUrl: 'https://cdn.example.com/efimero.png',
      activosVisuales: { estadioUrls: [], camisetaUrls: [] },
    };

    const creado = await repos.clubes.create(nuevo);
    expect(creado.nombre).toBe('Club Efímero');

    const actualizado = await repos.clubes.update(clubEfimeroId, {
      nombre: 'Club Renombrado',
    });
    expect(actualizado.nombre).toBe('Club Renombrado');
    // El resto de campos se preservan.
    expect(actualizado.paletaColores.primario).toBe('#123456');

    const borrado = await repos.clubes.delete(clubEfimeroId);
    expect(borrado).toBe(true);
    // Borrado idempotente: volver a borrar devuelve false.
    expect(await repos.clubes.delete(clubEfimeroId)).toBe(false);
    expect(await repos.clubes.findById(clubEfimeroId)).toBeNull();
  });

  it('recorre las relaciones del usuario demo (consultas por relación)', async () => {
    const usuario = await repos.usuarios.findById(USUARIO_DEMO);
    expect(usuario?.email).toBe('hincha.demo@example.com');
    expect(usuario?.clubId).toBe(CLUB_KIRO);

    // findByEmail
    const porEmail = await repos.usuarios.findByEmail('hincha.demo@example.com');
    expect(porEmail?.id).toBe(USUARIO_DEMO);

    // Temporadas activas del usuario
    const activas = await repos.temporadas.findActivasByUsuarioId(USUARIO_DEMO);
    expect(activas.map((t) => t.id)).toContain(TEMPORADA_DEMO);

    // Álbum de la temporada -> recuadros con foto principal
    const album = await repos.albumes.findByTemporadaId(TEMPORADA_DEMO);
    expect(album).not.toBeNull();

    const conFoto = await repos.recuadros.findConFotoPrincipalByAlbumId(album!.id);
    expect(conFoto.length).toBe(1);
    expect(conFoto[0]?.numero).toBe(1);
    expect(conFoto[0]?.fotoPrincipalId).not.toBeNull();

    // El partido de la temporada es el clásico 2-1
    const partidos = await repos.partidos.findByTemporadaId(TEMPORADA_DEMO);
    expect(partidos.length).toBe(1);
    expect(partidos[0]?.esClasico).toBe(true);
    expect(partidos[0]?.resultado).toEqual({ golesLocal: 2, golesVisita: 1 });
    // Los arrays jsonb se mapean a arreglos tipados.
    expect(Array.isArray(partidos[0]?.alineacion)).toBe(true);
    expect(partidos[0]?.eventos.length).toBe(2);
  });

  it('devuelve null cuando no existe (findById / findMaybe)', async () => {
    expect(await repos.clubes.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await repos.suscripciones.findByRevenueCatId('no-existe')).toBeNull();
  });
});
