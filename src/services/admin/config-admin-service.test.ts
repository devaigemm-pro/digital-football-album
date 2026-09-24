/**
 * Pruebas unitarias del ConfigAdminService (Task 16.1 — Requirements: 14.5, 16).
 *
 * Cubren el flujo back-office de la Fecha_Límite_Cierre:
 *  - Fijarla por primera vez crea la Config_Admin (1:1) y sincroniza
 *    Temporada.fechaLimiteCierre con el valor administrativo.
 *  - Fijarla de nuevo reemplaza el valor en AMBOS (Config_Admin y Temporada),
 *    sin crear una segunda Config_Admin.
 *  - La fecha inválida (no ISO / no futura) se rechaza sin escribir nada.
 *  - La Temporada inexistente se rechaza.
 */
import { describe, it, expect } from 'vitest';
import type { ConfigAdmin, Temporada, UUID } from '../../domain/types.js';
import {
  InMemoryConfigAdminRepository,
  InMemoryTemporadaRepository,
} from '../../persistence/in-memory/repositories.js';
import {
  ConfigAdminService,
  FechaLimiteInvalidaError,
  TemporadaNoEncontradaError,
} from './config-admin-service.js';

const OPERADOR_ID = '0perad00-0000-4000-8000-000000000001' as UUID;
const TEMPORADA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const CLUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID;

// Reloj fijo para validar "fecha futura" de forma determinista.
const AHORA = Date.parse('2025-01-01T00:00:00.000Z');
const FECHA_FUTURA = '2025-06-30T23:59:59.000Z';
const FECHA_FUTURA_2 = '2025-08-15T23:59:59.000Z';

function makeTemporada(fechaLimiteCierre = '2099-12-31T23:59:59.000Z'): Temporada {
  return {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: CLUB_ID,
    temporadaExterna: '2024-2025',
    estado: 'ACTIVA',
    fechaLimiteCierre,
  };
}

function makeService(
  temporadas: readonly Temporada[],
  configAdmins: readonly ConfigAdmin[] = [],
): {
  service: ConfigAdminService;
  configRepo: InMemoryConfigAdminRepository;
  temporadaRepo: InMemoryTemporadaRepository;
} {
  const configRepo = new InMemoryConfigAdminRepository(configAdmins);
  const temporadaRepo = new InMemoryTemporadaRepository(temporadas);
  const service = new ConfigAdminService({
    configAdmins: configRepo,
    temporadas: temporadaRepo,
    newId: () => 'cfgadmin-0000-4000-8000-000000000001',
    now: () => AHORA,
  });
  return { service, configRepo, temporadaRepo };
}

describe('ConfigAdminService.setFechaLimiteCierre', () => {
  it('crea la Config_Admin y sincroniza Temporada.fechaLimiteCierre al fijarla por primera vez', async () => {
    const { service, configRepo, temporadaRepo } = makeService([makeTemporada()]);

    const resultado = await service.setFechaLimiteCierre(
      OPERADOR_ID,
      TEMPORADA_ID,
      'Liga MX',
      FECHA_FUTURA,
    );

    expect(resultado.creada).toBe(true);
    expect(resultado.configAdmin).toMatchObject({
      temporadaId: TEMPORADA_ID,
      liga: 'Liga MX',
      fechaLimiteCierre: FECHA_FUTURA,
      operadorId: OPERADOR_ID,
    });
    // La Temporada refleja el valor administrativo.
    expect(resultado.temporada.fechaLimiteCierre).toBe(FECHA_FUTURA);

    // Persistencia: existe exactamente una Config_Admin y la Temporada quedó sincronizada.
    expect(await configRepo.count()).toBe(1);
    const configPersistida = await configRepo.findByTemporadaId(TEMPORADA_ID);
    expect(configPersistida?.fechaLimiteCierre).toBe(FECHA_FUTURA);
    const temporadaPersistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(temporadaPersistida?.fechaLimiteCierre).toBe(FECHA_FUTURA);
  });

  it('actualiza (reemplaza) el valor en Config_Admin y Temporada sin crear una segunda Config_Admin', async () => {
    const configExistente: ConfigAdmin = {
      id: 'existing0-0000-4000-8000-000000000009',
      temporadaId: TEMPORADA_ID,
      liga: 'Liga MX',
      fechaLimiteCierre: FECHA_FUTURA,
      operadorId: OPERADOR_ID,
    };
    const { service, configRepo, temporadaRepo } = makeService(
      [makeTemporada(FECHA_FUTURA)],
      [configExistente],
    );

    const otroOperador = '0perad00-0000-4000-8000-000000000002' as UUID;
    const resultado = await service.setFechaLimiteCierre(
      otroOperador,
      TEMPORADA_ID,
      'Liga MX Femenil',
      FECHA_FUTURA_2,
    );

    expect(resultado.creada).toBe(false);
    // Se conserva el id de la Config_Admin existente (upsert, no duplicado).
    expect(resultado.configAdmin.id).toBe(configExistente.id);
    expect(resultado.configAdmin).toMatchObject({
      liga: 'Liga MX Femenil',
      fechaLimiteCierre: FECHA_FUTURA_2,
      operadorId: otroOperador,
    });
    // Ambos reflejan el nuevo valor.
    expect(resultado.temporada.fechaLimiteCierre).toBe(FECHA_FUTURA_2);
    expect(await configRepo.count()).toBe(1);
    const temporadaPersistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(temporadaPersistida?.fechaLimiteCierre).toBe(FECHA_FUTURA_2);
  });

  it('rechaza una fecha que no es ISO 8601 válida sin escribir nada', async () => {
    const { service, configRepo, temporadaRepo } = makeService([
      makeTemporada('2099-12-31T23:59:59.000Z'),
    ]);

    await expect(
      service.setFechaLimiteCierre(OPERADOR_ID, TEMPORADA_ID, 'Liga MX', 'no-es-fecha'),
    ).rejects.toBeInstanceOf(FechaLimiteInvalidaError);

    // No se creó Config_Admin ni se tocó la Temporada.
    expect(await configRepo.count()).toBe(0);
    const temporadaPersistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(temporadaPersistida?.fechaLimiteCierre).toBe('2099-12-31T23:59:59.000Z');
  });

  it('rechaza una fecha en el pasado (no futura) sin escribir nada', async () => {
    const { service, configRepo } = makeService([makeTemporada()]);

    await expect(
      service.setFechaLimiteCierre(
        OPERADOR_ID,
        TEMPORADA_ID,
        'Liga MX',
        '2024-01-01T00:00:00.000Z',
      ),
    ).rejects.toMatchObject({ motivo: 'NO_ES_FUTURA' });

    expect(await configRepo.count()).toBe(0);
  });

  it('lanza TemporadaNoEncontradaError cuando la Temporada no existe', async () => {
    const { service } = makeService([]);

    await expect(
      service.setFechaLimiteCierre(OPERADOR_ID, TEMPORADA_ID, 'Liga MX', FECHA_FUTURA),
    ).rejects.toBeInstanceOf(TemporadaNoEncontradaError);
  });
});
