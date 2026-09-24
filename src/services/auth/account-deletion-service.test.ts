/**
 * Pruebas del borrado de cuenta (Task 3.2 — Requirements: 20, derecho al olvido).
 *
 * Cubren, con los dobles en memoria de la persistencia y un ObjectStorage
 * en memoria:
 *  - El borrado elimina fotos (object storage + metadatos), momentos, recuadros,
 *    álbumes, temporadas, partidos, dirección de envío, suscripción, refresh
 *    tokens y el propio Usuario.
 *  - Se CONSERVA el Pedido con solo su `datosFiscalesMinimos` (mínimo legal),
 *    despersonalizado (sin `tracking`).
 *  - Idempotencia: reejecutar el borrado sobre una cuenta ya borrada no falla ni
 *    altera el mínimo fiscal.
 *  - Reintentabilidad ante fallo parcial: si el object storage falla a mitad de
 *    camino, un reintento deja el sistema en el estado objetivo.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Album,
  DatosFiscalesMinimos,
  DireccionEnvio,
  Foto,
  Momento,
  PartidoOficial,
  Pedido,
  Recuadro,
  RefreshToken,
  Suscripcion,
  Temporada,
  Usuario,
} from '../../domain/types.js';
import { createInMemoryRepositories } from '../../persistence/in-memory/factory.js';
import type { Repositories } from '../../persistence/unit-of-work.js';
import { AccountDeletionService } from './account-deletion-service.js';
import { InMemoryObjectStorage, type ObjectStorage } from './object-storage.js';

const USUARIO_ID = '00000000-0000-4000-8000-000000000001';
const OTRO_USUARIO_ID = '00000000-0000-4000-8000-0000000000ff';
const TEMPORADA_ID = '00000000-0000-4000-8000-000000000002';
const ALBUM_ID = '00000000-0000-4000-8000-000000000003';
const PARTIDO_ID = '00000000-0000-4000-8000-000000000004';
const MOMENTO_ID = '00000000-0000-4000-8000-000000000005';
const RECUADRO_ID = '00000000-0000-4000-8000-000000000006';
const FOTO_A_ID = '00000000-0000-4000-8000-000000000007';
const FOTO_B_ID = '00000000-0000-4000-8000-000000000008';
const PEDIDO_ID = '00000000-0000-4000-8000-000000000009';
const DIRECCION_ID = '00000000-0000-4000-8000-00000000000a';
const SUSCRIPCION_ID = '00000000-0000-4000-8000-00000000000b';
const TOKEN_ID = '00000000-0000-4000-8000-00000000000c';

const FISCAL: DatosFiscalesMinimos = {
  numeroFactura: 'F-2025-0001',
  fechaEmision: '2025-05-01',
  totalPagado: 79.99,
  moneda: 'USD',
};

const FOTO_A_KEY = 'usuarios/1/fotos/a.jpg';
const FOTO_B_KEY = 'usuarios/1/fotos/b.jpg';

interface Seeded {
  repos: Repositories;
  storage: InMemoryObjectStorage;
  service: AccountDeletionService;
}

/** Siembra una cuenta completa de un usuario con datos personales y un Pedido. */
async function seedCuentaCompleta(
  storage: ObjectStorage = new InMemoryObjectStorage([FOTO_A_KEY, FOTO_B_KEY]),
): Promise<Seeded> {
  const repos = createInMemoryRepositories();

  const usuario: Usuario = {
    id: USUARIO_ID,
    proveedorAuth: 'email',
    email: 'hincha@example.com',
    clubId: null,
    zonaHoraria: 'America/Bogota',
  };
  await repos.usuarios.create(usuario);

  // Un segundo usuario cuyos datos NO deben tocarse.
  await repos.usuarios.create({
    id: OTRO_USUARIO_ID,
    proveedorAuth: 'google',
    email: 'otro@example.com',
    clubId: null,
    zonaHoraria: 'UTC',
  });

  const temporada: Temporada = {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: '00000000-0000-4000-8000-0000000000c1',
    temporadaExterna: '2024-2025',
    estado: 'CERRADA',
    fechaLimiteCierre: '2025-06-01T00:00:00.000Z',
  };
  await repos.temporadas.create(temporada);

  const album: Album = { id: ALBUM_ID, temporadaId: TEMPORADA_ID };
  await repos.albumes.create(album);

  const partido: PartidoOficial = {
    id: PARTIDO_ID,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-03-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: { golesLocal: 2, golesVisita: 1 },
    alineacion: [],
    eventos: [],
  };
  await repos.partidos.create(partido);

  const momento: Momento = {
    id: MOMENTO_ID,
    partidoOficialId: PARTIDO_ID,
    contextoAsistencia: 'EN_VIVO_LOCAL',
    subModalidad: null,
    geoVerificado: true,
    notas: 'Qué partidazo',
    jugadorDelPartido: null,
  };
  await repos.momentos.create(momento);

  const fotoA: Foto = {
    id: FOTO_A_ID,
    momentoId: MOMENTO_ID,
    objectKey: FOTO_A_KEY,
    anchoPx: 3000,
    altoPx: 2000,
    estadoAsociacion: 'ASOCIADA',
  };
  const fotoB: Foto = {
    id: FOTO_B_ID,
    momentoId: MOMENTO_ID,
    objectKey: FOTO_B_KEY,
    anchoPx: 3000,
    altoPx: 2000,
    estadoAsociacion: 'ASOCIADA',
  };
  await repos.fotos.create(fotoA);
  await repos.fotos.create(fotoB);

  const recuadro: Recuadro = {
    id: RECUADRO_ID,
    albumId: ALBUM_ID,
    partidoOficialId: PARTIDO_ID,
    plantillaId: '00000000-0000-4000-8000-0000000000d1',
    numero: 1,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: FOTO_A_ID,
    estadoRecordatorio: 'DETENIDO_POR_FOTO',
  };
  await repos.recuadros.create(recuadro);

  const pedido: Pedido = {
    id: PEDIDO_ID,
    temporadaId: TEMPORADA_ID,
    estado: 'ENVIADA',
    tracking: 'TRK-123',
    datosFiscalesMinimos: FISCAL,
    intentosImpresion: 1,
  };
  await repos.pedidos.create(pedido);

  const direccion: DireccionEnvio = {
    id: DIRECCION_ID,
    usuarioId: USUARIO_ID,
    campos: {
      nombre: 'Hincha',
      linea1: 'Calle 1',
      ciudad: 'Bogotá',
      region: 'Cundinamarca',
      codigoPostal: '110111',
      pais: 'CO',
    },
    validada: true,
  };
  await repos.direcciones.create(direccion);

  const suscripcion: Suscripcion = {
    id: SUSCRIPCION_ID,
    usuarioId: USUARIO_ID,
    plan: 'PREMIUM',
    estado: 'ACTIVA',
    vigenciaHasta: '2026-01-01',
    revenueCatId: 'rc-1',
  };
  await repos.suscripciones.create(suscripcion);

  const token: RefreshToken = {
    id: TOKEN_ID,
    usuarioId: USUARIO_ID,
    tokenHash: 'hash-1',
    familiaId: '00000000-0000-4000-8000-0000000000e1',
    expiraEn: '2025-12-31T00:00:00.000Z',
    rotado: false,
    revocado: false,
  };
  await repos.refreshTokens.create(token);

  const service = new AccountDeletionService({ repositories: repos, objectStorage: storage });
  return { repos, storage: storage as InMemoryObjectStorage, service };
}

/** Verifica que no queda ningún dato personal del usuario borrado. */
async function assertSinDatosPersonales(repos: Repositories): Promise<void> {
  expect(await repos.usuarios.findById(USUARIO_ID)).toBeNull();
  expect(await repos.temporadas.findByUsuarioId(USUARIO_ID)).toHaveLength(0);
  expect(await repos.albumes.findById(ALBUM_ID)).toBeNull();
  expect(await repos.partidos.findById(PARTIDO_ID)).toBeNull();
  expect(await repos.momentos.findById(MOMENTO_ID)).toBeNull();
  expect(await repos.recuadros.findById(RECUADRO_ID)).toBeNull();
  expect(await repos.fotos.findById(FOTO_A_ID)).toBeNull();
  expect(await repos.fotos.findById(FOTO_B_ID)).toBeNull();
  expect(await repos.direcciones.findByUsuarioId(USUARIO_ID)).toBeNull();
  expect(await repos.suscripciones.findByUsuarioId(USUARIO_ID)).toBeNull();
  expect(await repos.refreshTokens.findByUsuarioId(USUARIO_ID)).toHaveLength(0);
}

describe('AccountDeletionService — borrado de cuenta (Req 20)', () => {
  let seeded: Seeded;
  beforeEach(async () => {
    seeded = await seedCuentaCompleta();
  });

  it('elimina todo dato personal del usuario', async () => {
    const result = await seeded.service.deleteAccount(USUARIO_ID);

    expect(result.usuarioExistia).toBe(true);
    await assertSinDatosPersonales(seeded.repos);
  });

  it('elimina los binarios de las fotos del object storage', async () => {
    await seeded.service.deleteAccount(USUARIO_ID);

    expect(seeded.storage.has(FOTO_A_KEY)).toBe(false);
    expect(seeded.storage.has(FOTO_B_KEY)).toBe(false);
    expect(seeded.storage.size).toBe(0);
    expect(seeded.storage.borradosSolicitados).toEqual(
      expect.arrayContaining([FOTO_A_KEY, FOTO_B_KEY]),
    );
  });

  it('conserva el Pedido con solo el mínimo legal/fiscal, despersonalizado', async () => {
    await seeded.service.deleteAccount(USUARIO_ID);

    const pedido = await seeded.repos.pedidos.findById(PEDIDO_ID);
    expect(pedido).not.toBeNull();
    // El mínimo fiscal sobrevive intacto.
    expect(pedido?.datosFiscalesMinimos).toEqual(FISCAL);
    // El dato de envío (tracking) se despersonaliza.
    expect(pedido?.tracking).toBeNull();
  });

  it('no toca los datos de otros usuarios', async () => {
    await seeded.service.deleteAccount(USUARIO_ID);
    expect(await seeded.repos.usuarios.findById(OTRO_USUARIO_ID)).not.toBeNull();
  });

  it('es idempotente: reejecutar sobre una cuenta ya borrada no falla ni deja residuos', async () => {
    await seeded.service.deleteAccount(USUARIO_ID);

    const segundo = await seeded.service.deleteAccount(USUARIO_ID);

    expect(segundo.usuarioExistia).toBe(false);
    expect(segundo.fotosEliminadas).toBe(0);
    expect(segundo.momentosEliminados).toBe(0);
    expect(segundo.recuadrosEliminados).toBe(0);
    await assertSinDatosPersonales(seeded.repos);

    // El mínimo fiscal permanece intacto tras el segundo borrado.
    const pedido = await seeded.repos.pedidos.findById(PEDIDO_ID);
    expect(pedido?.datosFiscalesMinimos).toEqual(FISCAL);
  });

  it('es reintentable ante un fallo parcial del object storage', async () => {
    // Object storage que falla la primera vez que borra una clave y luego
    // se comporta normalmente (simula un error transitorio a mitad del borrado).
    let fallar = true;
    const almacen = new InMemoryObjectStorage([FOTO_A_KEY, FOTO_B_KEY]);
    const flaky: ObjectStorage = {
      delete: (key: string) => {
        if (fallar) {
          fallar = false;
          return Promise.reject(new Error('fallo transitorio de object storage'));
        }
        return almacen.delete(key);
      },
    };

    const parcial = await seedCuentaCompleta(flaky);
    // Re-inyecta el mismo servicio pero con el object storage flaky y sus repos.
    const service = new AccountDeletionService({
      repositories: parcial.repos,
      objectStorage: flaky,
    });

    // Primera ejecución: aborta por el fallo del object storage.
    await expect(service.deleteAccount(USUARIO_ID)).rejects.toThrow(/fallo transitorio/);

    // Reintento: completa el borrado hasta el estado objetivo.
    await service.deleteAccount(USUARIO_ID);

    await assertSinDatosPersonales(parcial.repos);
    expect(almacen.size).toBe(0);
    const pedido = await parcial.repos.pedidos.findById(PEDIDO_ID);
    expect(pedido?.datosFiscalesMinimos).toEqual(FISCAL);
  });
});
