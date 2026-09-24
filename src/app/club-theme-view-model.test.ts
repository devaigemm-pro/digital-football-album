/**
 * Pruebas unitarias del ClubThemeViewModel (Task 21.1 — Requirements: 2.1, 2.2).
 *
 * Cubren:
 *  - Mapeo de la `IdentidadVisual` del backend a un `ClubTheme` para la UI:
 *    paleta → colores, escudo, assets de estadio y camisetas (Req 2.1).
 *  - Caída del color de acento al primario cuando el Club no define acento.
 *  - Aplicación del tema al seleccionar un Club y notificación a los oyentes,
 *    de modo que al actualizar el Club la UI refleje el nuevo tema (Req 2.2).
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type { UUID } from '../domain/types.js';
import type { ClubClient, IdentidadVisual } from './backend-clients.js';
import {
  ClubThemeViewModel,
  mapIdentidadVisualToTheme,
  type ClubTheme,
} from './club-theme-view-model.js';

const CLUB_A = '11111111-1111-4111-8111-111111111111' as UUID;
const CLUB_B = '22222222-2222-4222-8222-222222222222' as UUID;
const USUARIO_ID = '99999999-9999-4999-8999-999999999999' as UUID;

/** Cliente doble que devuelve identidades visuales predefinidas por `clubId`. */
class FakeClubClient implements ClubClient {
  llamadas: Array<{ usuarioId: UUID; clubId: UUID }> = [];

  constructor(private readonly identidades: Map<UUID, IdentidadVisual>) {}

  asignarClub(usuarioId: UUID, clubId: UUID): Promise<IdentidadVisual> {
    this.llamadas.push({ usuarioId, clubId });
    const identidad = this.identidades.get(clubId);
    if (identidad === undefined) {
      return Promise.reject(new Error(`sin identidad para ${clubId}`));
    }
    return Promise.resolve(identidad);
  }
}

const identidadA: IdentidadVisual = {
  clubId: CLUB_A,
  nombre: 'Club A',
  paletaColores: { primario: '#0033A0', secundario: '#FFFFFF', acento: '#FFD100' },
  escudoUrl: 'https://cdn.example/a/escudo.png',
  activosVisuales: {
    estadioUrls: ['https://cdn.example/a/estadio1.jpg'],
    camisetaUrls: ['https://cdn.example/a/local.png', 'https://cdn.example/a/visita.png'],
  },
};

const identidadB: IdentidadVisual = {
  clubId: CLUB_B,
  nombre: 'Club B',
  // Sin acento: debe caer al primario.
  paletaColores: { primario: '#C8102E', secundario: '#000000' },
  escudoUrl: 'https://cdn.example/b/escudo.png',
  activosVisuales: {
    estadioUrls: [],
    camisetaUrls: ['https://cdn.example/b/local.png'],
  },
};

describe('mapIdentidadVisualToTheme (Req 2.1)', () => {
  it('mapea paleta, escudo y assets al descriptor de tema', () => {
    const theme = mapIdentidadVisualToTheme(identidadA);

    expect(theme).toEqual<ClubTheme>({
      clubId: CLUB_A,
      clubNombre: 'Club A',
      colors: { primary: '#0033A0', secondary: '#FFFFFF', accent: '#FFD100' },
      crestUrl: 'https://cdn.example/a/escudo.png',
      assets: {
        stadiumUrls: ['https://cdn.example/a/estadio1.jpg'],
        kitUrls: ['https://cdn.example/a/local.png', 'https://cdn.example/a/visita.png'],
      },
    });
  });

  it('cae el acento al primario cuando el Club no define acento', () => {
    const theme = mapIdentidadVisualToTheme(identidadB);
    expect(theme.colors.accent).toBe('#C8102E');
    expect(theme.colors.accent).toBe(theme.colors.primary);
  });

  it('el acento siempre queda definido para cualquier identidad (Req 2.1)', () => {
    // Feature: digital-football-album, mapeo de identidad visual a tema (Req 2.1)
    fc.assert(
      fc.property(
        fc.record({
          primario: fc.hexaString({ minLength: 6, maxLength: 6 }).map((s) => `#${s}`),
          secundario: fc.hexaString({ minLength: 6, maxLength: 6 }).map((s) => `#${s}`),
          acento: fc.option(
            fc.hexaString({ minLength: 6, maxLength: 6 }).map((s) => `#${s}`),
            { nil: undefined },
          ),
        }),
        (paleta) => {
          const identidad: IdentidadVisual = {
            clubId: CLUB_A,
            nombre: 'X',
            paletaColores:
              paleta.acento === undefined
                ? { primario: paleta.primario, secundario: paleta.secundario }
                : {
                    primario: paleta.primario,
                    secundario: paleta.secundario,
                    acento: paleta.acento,
                  },
            escudoUrl: 'https://cdn.example/x.png',
            activosVisuales: { estadioUrls: [], camisetaUrls: [] },
          };
          const theme = mapIdentidadVisualToTheme(identidad);
          const esperado = paleta.acento ?? paleta.primario;
          return theme.colors.accent === esperado;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('ClubThemeViewModel.selectClub (Req 2.1, 2.2)', () => {
  it('aplica el tema del Club seleccionado y lo expone', async () => {
    const client = new FakeClubClient(new Map([[CLUB_A, identidadA]]));
    const vm = new ClubThemeViewModel(client);

    expect(vm.theme).toBeNull();
    const theme = await vm.selectClub(USUARIO_ID, CLUB_A);

    expect(client.llamadas).toEqual([{ usuarioId: USUARIO_ID, clubId: CLUB_A }]);
    expect(theme.clubId).toBe(CLUB_A);
    expect(vm.theme).toEqual(theme);
  });

  it('notifica a los oyentes al seleccionar y al actualizar el Club (Req 2.2)', async () => {
    const client = new FakeClubClient(
      new Map([
        [CLUB_A, identidadA],
        [CLUB_B, identidadB],
      ]),
    );
    const vm = new ClubThemeViewModel(client);
    const listener = vi.fn();
    vm.subscribe(listener);

    await vm.selectClub(USUARIO_ID, CLUB_A);
    await vm.selectClub(USUARIO_ID, CLUB_B);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ clubId: CLUB_A });
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ clubId: CLUB_B });
    expect(vm.theme?.clubId).toBe(CLUB_B);
  });

  it('emite el tema actual de inmediato al suscribirse si ya hay uno', async () => {
    const client = new FakeClubClient(new Map([[CLUB_A, identidadA]]));
    const vm = new ClubThemeViewModel(client);
    await vm.selectClub(USUARIO_ID, CLUB_A);

    const listener = vi.fn();
    vm.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ clubId: CLUB_A });
  });

  it('cancela la suscripción y deja de notificar', async () => {
    const client = new FakeClubClient(
      new Map([
        [CLUB_A, identidadA],
        [CLUB_B, identidadB],
      ]),
    );
    const vm = new ClubThemeViewModel(client);
    const listener = vi.fn();
    const unsubscribe = vm.subscribe(listener);

    await vm.selectClub(USUARIO_ID, CLUB_A);
    unsubscribe();
    await vm.selectClub(USUARIO_ID, CLUB_B);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
