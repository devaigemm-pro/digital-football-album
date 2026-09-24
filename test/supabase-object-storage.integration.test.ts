// Test de integración del adaptador de Object Storage contra Supabase Storage local.
//
// Ejercita upload/delete contra el bucket `fotos` real. Se SALTA si no hay
// configuración de Supabase en el entorno (igual que el test de repositorios).
//
// Ejecutar contra la base local:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   npx vitest run test/supabase-object-storage.integration.test.ts

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSupabaseClient,
  supabaseConfigFromEnv,
  SupabaseObjectStorage,
  type TypedSupabaseClient,
} from '../src/persistence/index.js';

let config: ReturnType<typeof supabaseConfigFromEnv> | null = null;
try {
  config = supabaseConfigFromEnv();
} catch {
  config = null;
}

const suite = config ? describe : describe.skip;

suite('SupabaseObjectStorage (integración contra Storage local)', () => {
  let client: TypedSupabaseClient;
  let storage: SupabaseObjectStorage;
  const prefix = '99999999-9999-9999-9999-999999999999';
  const subidas: string[] = [];

  beforeAll(() => {
    client = createSupabaseClient(config!);
    storage = new SupabaseObjectStorage(client, { prefix, bucket: 'fotos' });
  });

  afterAll(async () => {
    // Limpieza: borra cualquier objeto subido durante las pruebas.
    for (const key of subidas) {
      await storage.delete(key);
    }
  });

  it('sube un binario y devuelve una objectKey con el prefijo del usuario', async () => {
    const bytes = new TextEncoder().encode('foto-de-prueba-bytes');
    const key = await storage.upload(bytes);
    subidas.push(key);

    expect(key.startsWith(`${prefix}/`)).toBe(true);

    // El objeto existe en el bucket: se puede descargar y coincide el contenido.
    const { data, error } = await client.storage.from('fotos').download(key);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const texto = await data!.text();
    expect(texto).toBe('foto-de-prueba-bytes');
  });

  it('borra un objeto y es idempotente', async () => {
    const bytes = new TextEncoder().encode('para-borrar');
    const key = await storage.upload(bytes);

    // Primer borrado: elimina el objeto existente.
    const primero = await storage.delete(key);
    expect(primero).toBe(true);

    // Segundo borrado de la misma clave: no falla (idempotente).
    const segundo = await storage.delete(key);
    expect(segundo).toBe(false);

    // Ya no se puede descargar.
    const { error } = await client.storage.from('fotos').download(key);
    expect(error).not.toBeNull();
  });

  it('genera claves únicas en subidas sucesivas', async () => {
    const a = await storage.upload(new TextEncoder().encode('a'));
    const b = await storage.upload(new TextEncoder().encode('b'));
    subidas.push(a, b);
    expect(a).not.toBe(b);
  });
});
