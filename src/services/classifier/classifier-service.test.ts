/**
 * Pruebas unitarias del Clasificador de Partidos (Task 9.1 — Requirements:
 * 10.1, 10.2, 10.3, 10.4).
 *
 * Cubren, tanto para la función pura `clasificar` como para el
 * `ClassifierService` inyectable con `RivalidadRepository`:
 *  - Rival en la lista de rivalidades → Clásico.
 *  - Rival fuera de la lista → no Clásico.
 *  - Competición internacional → Internacional.
 *  - Competición no internacional (LIGA/COPA_NACIONAL) → no Internacional.
 *  - Combinaciones (Clásico internacional, ninguno, etc.).
 *  - Normalización de nombres: coincidencia case-insensitive y con recorte de
 *    espacios de borde; sin coincidencia por espacios internos distintos.
 *  - `aplicarClasificacion` fija los campos sin mutar el partido de entrada.
 */
import { describe, it, expect } from 'vitest';
import type { PartidoOficial, Rivalidad, UUID } from '../../domain/types.js';
import { InMemoryRivalidadRepository } from '../../persistence/in-memory/repositories.js';
import { ClassifierService, aplicarClasificacion, clasificar } from './classifier-service.js';

const CLUB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;

function makePartido(overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    temporadaId: '22222222-2222-4222-8222-222222222222',
    partidoExternoId: 'ext-1',
    competicion: 'Liga Profesional',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'PROGRAMADO',
    esClasico: false,
    esInternacional: false,
    resultado: null,
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

function makeRivalidad(id: string, rivalNombre: string): Rivalidad {
  return { id, clubId: CLUB_ID, rivalNombre };
}

describe('clasificar (función pura)', () => {
  it('marca esClasico=true cuando el rival está en la lista de rivalidades', () => {
    const partido = makePartido({ rival: 'Eterno Rival' });

    const resultado = clasificar(partido, ['Eterno Rival', 'Otro Clásico']);

    expect(resultado.esClasico).toBe(true);
  });

  it('marca esClasico=false cuando el rival NO está en la lista de rivalidades', () => {
    const partido = makePartido({ rival: 'Equipo Cualquiera' });

    const resultado = clasificar(partido, ['Eterno Rival', 'Otro Clásico']);

    expect(resultado.esClasico).toBe(false);
  });

  it('marca esClasico=false cuando la lista de rivalidades está vacía', () => {
    const partido = makePartido({ rival: 'Eterno Rival' });

    const resultado = clasificar(partido, []);

    expect(resultado.esClasico).toBe(false);
  });

  it('marca esInternacional=true cuando tipoCompeticion es INTERNACIONAL', () => {
    const partido = makePartido({ tipoCompeticion: 'INTERNACIONAL' });

    const resultado = clasificar(partido, []);

    expect(resultado.esInternacional).toBe(true);
  });

  it('marca esInternacional=false para LIGA', () => {
    const partido = makePartido({ tipoCompeticion: 'LIGA' });

    expect(clasificar(partido, []).esInternacional).toBe(false);
  });

  it('marca esInternacional=false para COPA_NACIONAL', () => {
    const partido = makePartido({ tipoCompeticion: 'COPA_NACIONAL' });

    expect(clasificar(partido, []).esInternacional).toBe(false);
  });

  it('clasifica un Clásico internacional con ambos indicadores en true', () => {
    const partido = makePartido({
      rival: 'Eterno Rival',
      tipoCompeticion: 'INTERNACIONAL',
    });

    const resultado = clasificar(partido, ['Eterno Rival']);

    expect(resultado).toEqual({ esClasico: true, esInternacional: true });
  });

  it('empareja rivalidades de forma case-insensitive y con recorte de bordes', () => {
    const partido = makePartido({ rival: '  eterno RIVAL  ' });

    const resultado = clasificar(partido, ['Eterno Rival']);

    expect(resultado.esClasico).toBe(true);
  });

  it('NO empareja cuando difieren los espacios internos (no se colapsan)', () => {
    const partido = makePartido({ rival: 'River  Plate' });

    const resultado = clasificar(partido, ['River Plate']);

    expect(resultado.esClasico).toBe(false);
  });
});

describe('aplicarClasificacion', () => {
  it('fija los campos esClasico/esInternacional sin mutar el partido original', () => {
    const partido = makePartido({ esClasico: false, esInternacional: false });

    const actualizado = aplicarClasificacion(partido, {
      esClasico: true,
      esInternacional: true,
    });

    expect(actualizado.esClasico).toBe(true);
    expect(actualizado.esInternacional).toBe(true);
    // El partido de entrada no se muta.
    expect(partido.esClasico).toBe(false);
    expect(partido.esInternacional).toBe(false);
  });
});

describe('ClassifierService (inyectable con RivalidadRepository)', () => {
  function makeService(rivalidades: readonly Rivalidad[]): ClassifierService {
    return new ClassifierService(new InMemoryRivalidadRepository(rivalidades));
  }

  it('clasifica como Clásico si el rival figura en las rivalidades del Club', async () => {
    const service = makeService([
      makeRivalidad('r0000000-0000-4000-8000-000000000001', 'Eterno Rival'),
    ]);

    const resultado = await service.clasificar(makePartido({ rival: 'Eterno Rival' }), {
      id: CLUB_ID,
    });

    expect(resultado.esClasico).toBe(true);
  });

  it('no clasifica como Clásico si el rival no figura en las rivalidades del Club', async () => {
    const service = makeService([
      makeRivalidad('r0000000-0000-4000-8000-000000000001', 'Eterno Rival'),
    ]);

    const resultado = await service.clasificar(makePartido({ rival: 'Equipo Cualquiera' }), {
      id: CLUB_ID,
    });

    expect(resultado.esClasico).toBe(false);
  });

  it('ignora rivalidades de otros Clubes al clasificar', async () => {
    const otroClub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID;
    const service = makeService([{ id: 'r1', clubId: otroClub, rivalNombre: 'Eterno Rival' }]);

    const resultado = await service.clasificar(makePartido({ rival: 'Eterno Rival' }), {
      id: CLUB_ID,
    });

    expect(resultado.esClasico).toBe(false);
  });

  it('marca esInternacional según el tipo de competición', async () => {
    const service = makeService([]);

    const internacional = await service.clasificar(
      makePartido({ tipoCompeticion: 'INTERNACIONAL' }),
      { id: CLUB_ID },
    );
    const liga = await service.clasificar(makePartido({ tipoCompeticion: 'LIGA' }), {
      id: CLUB_ID,
    });

    expect(internacional.esInternacional).toBe(true);
    expect(liga.esInternacional).toBe(false);
  });

  it('clasificarYAplicar devuelve un Partido_Oficial con los campos fijados', async () => {
    const service = makeService([
      makeRivalidad('r0000000-0000-4000-8000-000000000001', 'Eterno Rival'),
    ]);

    const partido = makePartido({
      rival: 'Eterno Rival',
      tipoCompeticion: 'INTERNACIONAL',
    });
    const actualizado = await service.clasificarYAplicar(partido, {
      id: CLUB_ID,
    });

    expect(actualizado.esClasico).toBe(true);
    expect(actualizado.esInternacional).toBe(true);
    expect(actualizado.id).toBe(partido.id);
  });
});
