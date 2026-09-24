/**
 * Pruebas unitarias del ClubService (Task 7.1 — Requirements: 2.1, 2.2, 2.3).
 *
 * Cubren:
 *  - Primera asignación de Club (usuario sin clubId) aplica identidad visual.
 *  - Re-asignación del mismo Club aplica identidad visual sin marcar cambio.
 *  - Cambio a Club distinto sin Temporada ACTIVA procede y actualiza clubId.
 *  - Cambio a Club distinto CON Temporada ACTIVA se rechaza (conflicto) sin
 *    modificar el clubId.
 *  - Errores de usuario/Club inexistente.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Club, Temporada, Usuario, UUID } from '../../domain/types.js';
import {
  InMemoryClubRepository,
  InMemoryTemporadaRepository,
  InMemoryUsuarioRepository,
} from '../../persistence/in-memory/repositories.js';
import {
  ClubService,
  ClubNoEncontradoError,
  TemporadaActivaConflictError,
  UsuarioNoEncontradoError,
} from './club-service.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID;

function makeClub(id: UUID, nombre: string): Club {
  return {
    id,
    nombre,
    paletaColores: { primario: '#001122', secundario: '#334455' },
    escudoUrl: `https://cdn.example/${nombre}.png`,
    activosVisuales: {
      estadioUrls: [`https://cdn.example/${nombre}-estadio.jpg`],
      camisetaUrls: [`https://cdn.example/${nombre}-camiseta.jpg`],
    },
  };
}

function makeUsuario(clubId: UUID | null): Usuario {
  return {
    id: USUARIO_ID,
    proveedorAuth: 'email',
    email: 'hincha@example.com',
    clubId,
    zonaHoraria: 'America/Bogota',
  };
}

function makeTemporada(id: UUID, estado: Temporada['estado']): Temporada {
  return {
    id,
    usuarioId: USUARIO_ID,
    clubId: CLUB_A,
    temporadaExterna: '2024-2025',
    estado,
    fechaLimiteCierre: '2025-06-30T23:59:59.000Z',
  };
}

function makeService(
  usuario: Usuario,
  temporadas: readonly Temporada[],
  clubes: readonly Club[],
): ClubService {
  const usuarios = new InMemoryUsuarioRepository([usuario]);
  const temporadaRepo = new InMemoryTemporadaRepository(temporadas);
  const clubRepo = new InMemoryClubRepository(clubes);
  return new ClubService(usuarios, temporadaRepo, clubRepo);
}

describe('ClubService.asignarClub', () => {
  let clubes: Club[];

  beforeEach(() => {
    clubes = [makeClub(CLUB_A, 'ClubA'), makeClub(CLUB_B, 'ClubB')];
  });

  it('primera asignación (usuario sin Club) aplica identidad visual y persiste el clubId', async () => {
    const service = makeService(makeUsuario(null), [], clubes);

    const resultado = await service.asignarClub(USUARIO_ID, CLUB_A);

    expect(resultado.cambiado).toBe(true);
    expect(resultado.usuario.clubId).toBe(CLUB_A);
    expect(resultado.identidadVisual).toEqual({
      clubId: CLUB_A,
      nombre: 'ClubA',
      paletaColores: { primario: '#001122', secundario: '#334455' },
      escudoUrl: 'https://cdn.example/ClubA.png',
      activosVisuales: {
        estadioUrls: ['https://cdn.example/ClubA-estadio.jpg'],
        camisetaUrls: ['https://cdn.example/ClubA-camiseta.jpg'],
      },
    });
  });

  it('re-asignar el mismo Club aplica identidad visual y no marca cambio', async () => {
    const service = makeService(makeUsuario(CLUB_A), [], clubes);

    const resultado = await service.asignarClub(USUARIO_ID, CLUB_A);

    expect(resultado.cambiado).toBe(false);
    expect(resultado.usuario.clubId).toBe(CLUB_A);
    expect(resultado.identidadVisual.clubId).toBe(CLUB_A);
  });

  it('cambia a un Club distinto cuando NO hay Temporada ACTIVA', async () => {
    const service = makeService(
      makeUsuario(CLUB_A),
      [makeTemporada('c0000000-0000-4000-8000-000000000001', 'CERRADA')],
      clubes,
    );

    const resultado = await service.asignarClub(USUARIO_ID, CLUB_B);

    expect(resultado.cambiado).toBe(true);
    expect(resultado.usuario.clubId).toBe(CLUB_B);
    expect(resultado.identidadVisual.clubId).toBe(CLUB_B);
  });

  it('permite el cambio cuando el usuario no tiene ninguna Temporada', async () => {
    const service = makeService(makeUsuario(CLUB_A), [], clubes);

    const resultado = await service.asignarClub(USUARIO_ID, CLUB_B);

    expect(resultado.cambiado).toBe(true);
    expect(resultado.usuario.clubId).toBe(CLUB_B);
  });

  it('rechaza el cambio con 409 (conflicto) cuando hay una Temporada ACTIVA y NO modifica el clubId', async () => {
    const temporadaActivaId = 'c0000000-0000-4000-8000-0000000000ac' as UUID;
    const usuarios = new InMemoryUsuarioRepository([makeUsuario(CLUB_A)]);
    const temporadaRepo = new InMemoryTemporadaRepository([
      makeTemporada(temporadaActivaId, 'ACTIVA'),
    ]);
    const clubRepo = new InMemoryClubRepository(clubes);
    const service = new ClubService(usuarios, temporadaRepo, clubRepo);

    await expect(service.asignarClub(USUARIO_ID, CLUB_B)).rejects.toBeInstanceOf(
      TemporadaActivaConflictError,
    );

    // El clubId NO debe haberse modificado (Req 2.3).
    const usuarioPersistido = await usuarios.findById(USUARIO_ID);
    expect(usuarioPersistido?.clubId).toBe(CLUB_A);
  });

  it('el error de conflicto expone el contexto (club actual, solicitado y temporadas activas)', async () => {
    const temporadaActivaId = 'c0000000-0000-4000-8000-0000000000ac' as UUID;
    const service = makeService(
      makeUsuario(CLUB_A),
      [makeTemporada(temporadaActivaId, 'ACTIVA')],
      clubes,
    );

    await expect(service.asignarClub(USUARIO_ID, CLUB_B)).rejects.toMatchObject({
      clubActualId: CLUB_A,
      clubSolicitadoId: CLUB_B,
      temporadasActivasIds: [temporadaActivaId],
    });
  });

  it('permite re-aplicar el mismo Club aun con Temporada ACTIVA (no es un cambio)', async () => {
    const service = makeService(
      makeUsuario(CLUB_A),
      [makeTemporada('c0000000-0000-4000-8000-0000000000ac', 'ACTIVA')],
      clubes,
    );

    const resultado = await service.asignarClub(USUARIO_ID, CLUB_A);

    expect(resultado.cambiado).toBe(false);
    expect(resultado.usuario.clubId).toBe(CLUB_A);
  });

  it('lanza UsuarioNoEncontradoError si el usuario no existe', async () => {
    const usuarios = new InMemoryUsuarioRepository([]);
    const service = new ClubService(
      usuarios,
      new InMemoryTemporadaRepository([]),
      new InMemoryClubRepository(clubes),
    );

    await expect(service.asignarClub(USUARIO_ID, CLUB_A)).rejects.toBeInstanceOf(
      UsuarioNoEncontradoError,
    );
  });

  it('lanza ClubNoEncontradoError si el Club solicitado no existe', async () => {
    const service = makeService(makeUsuario(null), [], clubes);

    await expect(
      service.asignarClub(USUARIO_ID, 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
    ).rejects.toBeInstanceOf(ClubNoEncontradoError);
  });
});
