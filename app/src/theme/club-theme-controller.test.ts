// Pruebas del ClubThemeController — núcleo puro del provider de Tema_Club.
//
// Task 27.1 — Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
//
// TypeScript puro (sin React): usan el shim central de globales de Jest
// (app/src/testing/jest-globals.d.ts) y un `ClubClient` falso en memoria. Cubren:
//   - Seleccionar un Club fija el tema derivado de la IdentidadVisual (23.1, 23.2).
//   - Cambiar de Club actualiza el tema y notifica a los suscriptores (23.3, 23.4).
//   - Un conflicto 409 conserva el Club/tema actual y expone el mensaje (23.5).

import type { ClubClient, IdentidadVisual } from '../viewmodels';
import {
  CLUB_CHANGE_CONFLICT,
  CLUB_CHANGE_CONFLICT_MESSAGE,
  ClubThemeController,
  contrastingTextColor,
} from './club-theme-controller';

const USUARIO = 'usuario-1';
const CLUB_A = 'club-a';
const CLUB_B = 'club-b';

function identidad(clubId: string, nombre: string, primario: string): IdentidadVisual {
  return {
    clubId,
    nombre,
    paletaColores: { primario, secundario: '#FFFFFF' },
    escudoUrl: `https://cdn.example/${clubId}/escudo.png`,
    activosVisuales: {
      estadioUrls: [`https://cdn.example/${clubId}/estadio.jpg`],
      camisetaUrls: [`https://cdn.example/${clubId}/camiseta.png`],
    },
  };
}

/** Cliente en memoria que devuelve identidades por Club y puede simular el 409. */
class FakeClubClient implements ClubClient {
  private readonly identidades = new Map<string, IdentidadVisual>();
  /** Clubs que, al asignarse, disparan un conflicto 409 por Temporada activa. */
  conflictClubs = new Set<string>();
  /** Registro de llamadas para verificar que se invocó (o no) el endpoint. */
  calls: Array<{ usuarioId: string; clubId: string }> = [];

  register(id: IdentidadVisual): void {
    this.identidades.set(id.clubId, id);
  }

  async asignarClub(usuarioId: string, clubId: string): Promise<IdentidadVisual> {
    this.calls.push({ usuarioId, clubId });
    if (this.conflictClubs.has(clubId)) {
      // Emula el error 409 tal como podría lanzarlo el adaptador HTTP.
      throw { status: 409, message: CLUB_CHANGE_CONFLICT_MESSAGE };
    }
    const found = this.identidades.get(clubId);
    if (!found) {
      throw new Error(`Club desconocido: ${clubId}`);
    }
    return found;
  }
}

describe('ClubThemeController', () => {
  it('parte sin tema aplicado hasta seleccionar un Club (Req 23.3)', () => {
    const client = new FakeClubClient();
    const controller = new ClubThemeController(client);
    expect(controller.getState()).toBeNull();
  });

  it('al seleccionar un Club fija el tema derivado de la IdentidadVisual (Req 23.1, 23.2)', async () => {
    const client = new FakeClubClient();
    client.register(identidad(CLUB_A, 'Club A', '#123456'));
    const controller = new ClubThemeController(client);

    const result = await controller.selectClub(USUARIO, CLUB_A);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.clubId).toBe(CLUB_A);
      expect(result.theme.clubNombre).toBe('Club A');
      expect(result.theme.colors.primary).toBe('#123456');
      // Sin acento definido, cae al primario.
      expect(result.theme.colors.accent).toBe('#123456');
      expect(result.theme.crestUrl).toBe(`https://cdn.example/${CLUB_A}/escudo.png`);
    }
    expect(controller.getState()).toEqual(result.ok ? result.theme : null);
    expect(client.calls).toHaveLength(1);
  });

  it('emite el estado actual al suscribirse y notifica al cambiar de Club (Req 23.2, 23.4)', async () => {
    const client = new FakeClubClient();
    client.register(identidad(CLUB_A, 'Club A', '#111111'));
    client.register(identidad(CLUB_B, 'Club B', '#222222'));
    const controller = new ClubThemeController(client);

    const seen: Array<string | null> = [];
    const unsubscribe = controller.subscribe((theme) => {
      seen.push(theme === null ? null : theme.clubId);
    });

    // Suscripción inicial: aún no hay tema.
    expect(seen).toEqual([null]);

    await controller.selectClub(USUARIO, CLUB_A);
    await controller.selectClub(USUARIO, CLUB_B);

    expect(seen).toEqual([null, CLUB_A, CLUB_B]);
    expect(controller.getState()?.colors.primary).toBe('#222222');

    // Tras cancelar la suscripción ya no se reciben notificaciones.
    unsubscribe();
    await controller.selectClub(USUARIO, CLUB_A);
    expect(seen).toEqual([null, CLUB_A, CLUB_B]);
  });

  it('ante un 409 por Temporada activa conserva el Club actual y expone el mensaje (Req 23.5)', async () => {
    const client = new FakeClubClient();
    client.register(identidad(CLUB_A, 'Club A', '#0A0A0A'));
    client.conflictClubs.add(CLUB_B);
    const controller = new ClubThemeController(client);

    // Estado inicial válido con Club A.
    await controller.selectClub(USUARIO, CLUB_A);
    const themeAntes = controller.getState();

    const seen: Array<string | null> = [];
    controller.subscribe((theme) => {
      seen.push(theme === null ? null : theme.clubId);
    });

    const result = await controller.selectClub(USUARIO, CLUB_B);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CLUB_CHANGE_CONFLICT);
      expect(result.message).toBe(CLUB_CHANGE_CONFLICT_MESSAGE);
    }
    // El Club/tema actual permanece sin cambios (Property 30 en el cliente).
    expect(controller.getState()).toEqual(themeAntes);
    expect(controller.getState()?.clubId).toBe(CLUB_A);
    // No se emitió ningún cambio adicional tras el conflicto (solo el estado inicial).
    expect(seen).toEqual([CLUB_A]);
  });

  it('propaga errores que no son el conflicto 409 sin alterar el estado', async () => {
    const client = new FakeClubClient();
    client.register(identidad(CLUB_A, 'Club A', '#0A0A0A'));
    const controller = new ClubThemeController(client);
    await controller.selectClub(USUARIO, CLUB_A);
    const themeAntes = controller.getState();

    // CLUB_B no está registrado: el fake lanza un Error genérico.
    await expect(controller.selectClub(USUARIO, CLUB_B)).rejects.toThrow();
    expect(controller.getState()).toEqual(themeAntes);
  });
});

describe('contrastingTextColor', () => {
  it('devuelve texto oscuro sobre fondos claros y claro sobre fondos oscuros (Req 29)', () => {
    expect(contrastingTextColor('#FFFFFF')).toBe('#000000');
    expect(contrastingTextColor('#000000')).toBe('#FFFFFF');
    // Formato corto #RGB.
    expect(contrastingTextColor('#FFF')).toBe('#000000');
    expect(contrastingTextColor('#000')).toBe('#FFFFFF');
  });

  it('rechaza colores hex inválidos', () => {
    expect(() => contrastingTextColor('rojo')).toThrow();
    expect(() => contrastingTextColor('#12')).toThrow();
  });
});
