/**
 * Pruebas unitarias del Generador_Cards (Task 13.1 — Requirements: 12.1, 12.2,
 * 12.3, 12.4).
 *
 * Cubren:
 *  - Contenido de la Digital_Card: se compone con la fotografía del usuario, el
 *    marcador del partido y el escudo del Club, en formato compatible (Req 12.1,
 *    12.2).
 *  - Gating de Partidos_Internacionales (Req 12.3, 12.4):
 *      · Internacional + Básico (sin `digitalCardsInternacional`) → rechazo con
 *        mensaje que informa que requiere Plan_Premium.
 *      · Internacional + Premium → permitido.
 *  - Card no internacional permitida a Plan_Básico (Req 12.1, 12.2).
 */
import { describe, it, expect } from 'vitest';
import type { Club, Foto, Momento, PartidoOficial, Recuadro, UUID } from '../../domain/types.js';
import type { Entitlements } from '../subscription/entitlements.js';
import { entitlementsForPlan } from '../subscription/entitlements.js';
import {
  InMemoryClubRepository,
  InMemoryFotoRepository,
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
  InMemoryRecuadroRepository,
} from '../../persistence/in-memory/repositories.js';
import type { CardArtefacto, CardComposer, CardContenido } from './card-composer.js';
import { CardsError, CardsService } from './cards-service.js';
import type { EntitlementsSource } from './cards-service.js';

const MOMENTO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const PARTIDO_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const TEMPORADA_ID = '33333333-3333-4333-8333-333333333333' as UUID;
const ALBUM_ID = '44444444-4444-4444-8444-444444444444' as UUID;
const RECUADRO_ID = '55555555-5555-4555-8555-555555555555' as UUID;
const PLANTILLA_ID = '66666666-6666-4666-8666-666666666666' as UUID;
const FOTO_ID = '77777777-7777-4777-8777-777777777777' as UUID;
const CLUB_ID = '88888888-8888-4888-8888-888888888888' as UUID;
const USUARIO_ID = '99999999-9999-4999-8999-999999999999' as UUID;

const FOTO_OBJECT_KEY = 'fotos/momento-1/principal.jpg';
const ESCUDO_URL = 'https://cdn.example/club/escudo.png';

/** Compositor doble que registra el contenido recibido y devuelve un artefacto fijo. */
class FakeCardComposer implements CardComposer {
  llamadas: CardContenido[] = [];

  componer(contenido: CardContenido): Promise<CardArtefacto> {
    this.llamadas.push(contenido);
    return Promise.resolve({
      objectKey: `cards/${contenido.fotoObjectKey}.png`,
      formato: 'PNG',
    });
  }
}

/** Fuente de entitlements que responde según un plan fijo. */
function entitlementsDe(entitlements: Entitlements): EntitlementsSource {
  return {
    getEntitlements: () => Promise.resolve(entitlements),
  };
}

function makePartido(overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: PARTIDO_ID,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Copa Libertadores',
    tipoCompeticion: 'INTERNACIONAL',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: true,
    resultado: { golesLocal: 2, golesVisita: 1 },
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

function makeMomento(overrides: Partial<Momento> = {}): Momento {
  return {
    id: MOMENTO_ID,
    partidoOficialId: PARTIDO_ID,
    contextoAsistencia: 'EN_VIVO_LOCAL',
    subModalidad: null,
    geoVerificado: false,
    notas: '',
    jugadorDelPartido: null,
    ...overrides,
  };
}

function makeRecuadro(overrides: Partial<Recuadro> = {}): Recuadro {
  return {
    id: RECUADRO_ID,
    albumId: ALBUM_ID,
    partidoOficialId: PARTIDO_ID,
    plantillaId: PLANTILLA_ID,
    numero: 1,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: FOTO_ID,
    estadoRecordatorio: 'DETENIDO_POR_FOTO',
    ...overrides,
  };
}

function makeFoto(overrides: Partial<Foto> = {}): Foto {
  return {
    id: FOTO_ID,
    momentoId: MOMENTO_ID,
    objectKey: FOTO_OBJECT_KEY,
    anchoPx: 2000,
    altoPx: 2800,
    estadoAsociacion: 'ASOCIADA',
    ...overrides,
  };
}

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: CLUB_ID,
    nombre: 'Club Central',
    paletaColores: { primario: '#000000', secundario: '#ffffff' },
    escudoUrl: ESCUDO_URL,
    activosVisuales: { estadioUrls: [], camisetaUrls: [] },
    ...overrides,
  };
}

interface HarnessOverrides {
  partido?: Partial<PartidoOficial>;
  momento?: Partial<Momento>;
  recuadro?: Partial<Recuadro>;
  foto?: Partial<Foto>;
  club?: Partial<Club>;
  entitlements: Entitlements;
}

function makeHarness(overrides: HarnessOverrides): {
  service: CardsService;
  composer: FakeCardComposer;
} {
  const momentos = new InMemoryMomentoRepository([makeMomento(overrides.momento)]);
  const partidos = new InMemoryPartidoOficialRepository([makePartido(overrides.partido)]);
  const recuadros = new InMemoryRecuadroRepository([makeRecuadro(overrides.recuadro)]);
  const fotos = new InMemoryFotoRepository([makeFoto(overrides.foto)]);
  const clubs = new InMemoryClubRepository([makeClub(overrides.club)]);
  const composer = new FakeCardComposer();

  const service = new CardsService({
    momentos,
    partidos,
    recuadros,
    fotos,
    clubs,
    entitlements: entitlementsDe(overrides.entitlements),
    composer,
    resolverClubId: () => Promise.resolve(CLUB_ID),
  });

  return { service, composer };
}

describe('CardsService.generateCard — contenido de la Digital_Card (Req 12.1, 12.2)', () => {
  it('compone la card con foto del usuario, marcador y escudo del Club en formato compatible', async () => {
    const { service, composer } = makeHarness({
      partido: { esInternacional: false, tipoCompeticion: 'LIGA' },
      entitlements: entitlementsForPlan('PREMIUM'),
    });

    const artefacto = await service.generateCard(USUARIO_ID, MOMENTO_ID);

    // El compositor recibió las tres piezas requeridas (Req 12.1).
    expect(composer.llamadas).toHaveLength(1);
    expect(composer.llamadas[0]).toEqual({
      fotoObjectKey: FOTO_OBJECT_KEY,
      marcador: '2-1',
      escudoUrl: ESCUDO_URL,
    });
    // Artefacto en formato compatible con las plataformas de destino (Req 12.2).
    expect(artefacto.formato).toBe('PNG');
    expect(artefacto.objectKey).toContain(FOTO_OBJECT_KEY);
  });
});

describe('CardsService.generateCard — gating de Partidos_Internacionales (Req 12.3, 12.4)', () => {
  it('rechaza card internacional para Plan_Básico informando que requiere Plan_Premium (Req 12.4)', async () => {
    const { service, composer } = makeHarness({
      partido: { esInternacional: true },
      entitlements: entitlementsForPlan('BASICO'),
    });

    await expect(service.generateCard(USUARIO_ID, MOMENTO_ID)).rejects.toMatchObject({
      name: 'CardsError',
      code: 'REQUIERE_PLAN_PREMIUM',
    });

    // No se compuso ninguna imagen tras el rechazo por gating.
    expect(composer.llamadas).toHaveLength(0);

    // El mensaje informa explícitamente que requiere Plan_Premium (Req 12.4).
    try {
      await service.generateCard(USUARIO_ID, MOMENTO_ID);
      expect.unreachable('debería haber rechazado');
    } catch (error) {
      expect(error).toBeInstanceOf(CardsError);
      expect((error as CardsError).message).toContain('Plan_Premium');
    }
  });

  it('permite card internacional para Plan_Premium (Req 12.3)', async () => {
    const { service, composer } = makeHarness({
      partido: { esInternacional: true },
      entitlements: entitlementsForPlan('PREMIUM'),
    });

    const artefacto = await service.generateCard(USUARIO_ID, MOMENTO_ID);

    expect(artefacto.formato).toBe('PNG');
    expect(composer.llamadas).toHaveLength(1);
  });
});

describe('CardsService.generateCard — cards no internacionales (Req 12.1)', () => {
  it('permite card de partido no internacional a Plan_Básico', async () => {
    const { service, composer } = makeHarness({
      partido: { esInternacional: false, tipoCompeticion: 'LIGA' },
      entitlements: entitlementsForPlan('BASICO'),
    });

    const artefacto = await service.generateCard(USUARIO_ID, MOMENTO_ID);

    expect(artefacto.formato).toBe('PNG');
    expect(composer.llamadas).toHaveLength(1);
    expect(composer.llamadas[0]?.escudoUrl).toBe(ESCUDO_URL);
  });
});
