// Adaptador HTTP del catálogo de clubes (`GET /clubs`).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md · `GET /clubs`): devuelve el
// catálogo de clubes disponibles para que el usuario elija el suyo antes de
// llamar a `PUT /me/club`. Requiere autenticación (Bearer del JWT de Supabase).
//
//   `GET /clubs` → `{ clubs: [{ id, nombre, paletaColores, escudoUrl,
//                              activosVisuales }] }`
//
// Es un cliente NUEVO: la flujo de selección de Club (SeleccionClub /
// ClubThemeProvider) necesita la lista real de clubes; antes no había endpoint
// de catálogo.
//
// TypeScript PURO: no importa `react-native`.

import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Paleta de colores de un Club (misma forma que `IdentidadVisual.paletaColores`).
 */
export interface ClubPaletaColores {
  readonly primario: string;
  readonly secundario: string;
  readonly acento?: string;
}

/**
 * Activos visuales opcionales del Club (estadios/camisetas).
 */
export interface ClubActivosVisuales {
  readonly estadioUrls: readonly string[];
  readonly camisetaUrls: readonly string[];
}

/**
 * Entrada del catálogo de clubes (`GET /clubs`). Nótese que el catálogo usa `id`
 * (no `clubId`), a diferencia de `IdentidadVisual`.
 */
export interface ClubCatalogEntry {
  readonly id: string;
  readonly nombre: string;
  readonly paletaColores: ClubPaletaColores;
  readonly escudoUrl: string;
  readonly activosVisuales: ClubActivosVisuales;
}

/** Respuesta de `GET /clubs`. */
interface ClubsCatalogResponse {
  readonly clubs: readonly ClubCatalogEntry[];
}

/**
 * Contrato del cliente de catálogo de clubes. Inyectable en la UI de selección
 * de Club (para listar y elegir antes de `asignarClub`).
 */
export interface ClubsCatalogClient {
  /** `GET /clubs`: lista de clubes disponibles para elegir. */
  listClubs(): Promise<readonly ClubCatalogEntry[]>;
}

/**
 * Adaptador HTTP concreto del catálogo de clubes. Autenticado.
 */
export class HttpClubsCatalogClient implements ClubsCatalogClient {
  constructor(private readonly send: SendFn) {}

  /** `GET /clubs` → `{ clubs: [...] }`; devuelve el arreglo de clubes. */
  async listClubs(): Promise<readonly ClubCatalogEntry[]> {
    const response = await this.send<ClubsCatalogResponse>(
      buildRequest('GET', '/clubs'),
    );
    const body = readOkBody(response, 'GET /clubs');
    return body.clubs;
  }
}
