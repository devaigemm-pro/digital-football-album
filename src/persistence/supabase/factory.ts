// Factoría del conjunto completo de repositorios respaldados por Supabase.
//
// Una sola llamada devuelve todos los repositorios (Unit of Work) listos para
// inyectar en los servicios de dominio, implementando las mismas interfaces que
// la factoría en memoria. Cambiar de driver es sustituir esta factoría.

import type { Repositories } from '../unit-of-work.js';
import type { TypedSupabaseClient } from './client.js';
import {
  SupabaseAlbumRepository,
  SupabaseClubRepository,
  SupabaseConfigAdminRepository,
  SupabaseDireccionEnvioRepository,
  SupabaseFotoRepository,
  SupabaseMomentoRepository,
  SupabasePartidoOficialRepository,
  SupabasePedidoRepository,
  SupabasePlantillaAlbumRepository,
  SupabaseRecuadroRepository,
  SupabaseRefreshTokenRepository,
  SupabaseRivalidadRepository,
  SupabaseSuscripcionRepository,
  SupabaseTemporadaRepository,
  SupabaseUsuarioRepository,
} from './repositories.js';

/**
 * Crea un `Repositories` respaldado por Supabase sobre el cliente dado. El
 * cliente determina el contexto de seguridad: con la `service_role` se omite
 * RLS (backend de confianza); con la clave pública + JWT del usuario aplican las
 * políticas RLS por usuario.
 */
export function createSupabaseRepositories(client: TypedSupabaseClient): Repositories {
  return {
    usuarios: new SupabaseUsuarioRepository(client),
    refreshTokens: new SupabaseRefreshTokenRepository(client),
    configAdmin: new SupabaseConfigAdminRepository(client),
    plantillas: new SupabasePlantillaAlbumRepository(client),
    clubes: new SupabaseClubRepository(client),
    rivalidades: new SupabaseRivalidadRepository(client),
    suscripciones: new SupabaseSuscripcionRepository(client),
    temporadas: new SupabaseTemporadaRepository(client),
    partidos: new SupabasePartidoOficialRepository(client),
    albumes: new SupabaseAlbumRepository(client),
    recuadros: new SupabaseRecuadroRepository(client),
    momentos: new SupabaseMomentoRepository(client),
    fotos: new SupabaseFotoRepository(client),
    direcciones: new SupabaseDireccionEnvioRepository(client),
    pedidos: new SupabasePedidoRepository(client),
  };
}
