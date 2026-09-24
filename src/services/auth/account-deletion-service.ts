// Borrado de cuenta (derecho al olvido, GDPR/CCPA) del Servicio_Autenticación.
//
// Implementa el flujo `DELETE /cuenta` descrito en design.md
// ("Servicio_Autenticación" y "Seguridad y privacidad", Req 20):
//
//   Elimina de forma permanente las fotos (object storage), los momentos, los
//   recuadros, los álbumes, las temporadas, los partidos, la dirección de envío,
//   la suscripción y los datos personales del usuario; revoca todos sus refresh
//   tokens; y elimina el propio registro de Usuario. Conserva ÚNICAMENTE el
//   `Pedido.datosFiscalesMinimos` (facturación/registro requeridos por ley):
//   cada Pedido del usuario se despersonaliza (se anula el tracking y se
//   desliga de la Temporada) manteniendo solo el mínimo fiscal.
//
// Garantías (design.md, Property 31):
//   - IDEMPOTENTE: una solicitud repetida sobre una cuenta ya borrada no falla
//     ni deja residuos. Cada borrado subyacente (repositorios y object storage)
//     es idempotente por diseño; una segunda ejecución no encuentra datos que
//     borrar y termina sin efecto.
//   - REINTENTABLE ANTE FALLO PARCIAL: si una ejecución falla a mitad de camino
//     (p. ej. error transitorio del object storage), volver a ejecutarla lleva
//     el sistema al estado objetivo sin corromper lo ya borrado. El orden de
//     borrado va de las hojas hacia la raíz para que un reintento pueda
//     recomponer el recorrido desde cualquier punto.
//
// Toda dependencia con I/O (repositorios y object storage) se inyecta para poder
// ejercitar el servicio con los dobles en memoria de la capa de persistencia.
//
// Task 3.2 — Requirements: 20 (borrado de cuenta)

import type { Pedido, UUID } from '../../domain/types.js';
import type { Repositories } from '../../persistence/unit-of-work.js';
import type { ObjectStorage } from './object-storage.js';

/** Dependencias inyectadas del servicio de borrado. */
export interface AccountDeletionDeps {
  /** Agregado de repositorios (Unit of Work) de la capa de persistencia. */
  repositories: Repositories;
  /** Almacenamiento de objetos donde viven los binarios de las fotos. */
  objectStorage: ObjectStorage;
}

/** Resumen de lo eliminado en una ejecución (útil para auditoría/pruebas). */
export interface AccountDeletionResult {
  /** ¿Existía el usuario al inicio de esta ejecución? (idempotencia). */
  usuarioExistia: boolean;
  /** Cantidad de objetos de object storage cuyo borrado se solicitó. */
  fotosEliminadas: number;
  /** Cantidad de momentos eliminados. */
  momentosEliminados: number;
  /** Cantidad de recuadros eliminados. */
  recuadrosEliminados: number;
  /** Cantidad de refresh tokens revocados en esta ejecución. */
  tokensRevocados: number;
  /** Cantidad de Pedidos despersonalizados conservando el mínimo fiscal. */
  pedidosConservados: number;
}

/**
 * Servicio de borrado de cuenta. Orquesta la eliminación en cascada de todos los
 * datos personales del usuario a través de los repositorios inyectados y el
 * object storage, conservando solo el mínimo legal/fiscal de los Pedidos.
 */
export class AccountDeletionService {
  private readonly repos: Repositories;
  private readonly objectStorage: ObjectStorage;

  constructor(deps: AccountDeletionDeps) {
    this.repos = deps.repositories;
    this.objectStorage = deps.objectStorage;
  }

  /**
   * Borra la cuenta del usuario `usuarioId` y todos sus datos personales,
   * conservando solo `Pedido.datosFiscalesMinimos`. Idempotente y reintentable
   * ante fallo parcial (Req 20, Property 31).
   */
  async deleteAccount(usuarioId: UUID): Promise<AccountDeletionResult> {
    const usuario = await this.repos.usuarios.findById(usuarioId);

    let fotosEliminadas = 0;
    let momentosEliminados = 0;
    let recuadrosEliminados = 0;
    let pedidosConservados = 0;

    const temporadas = await this.repos.temporadas.findByUsuarioId(usuarioId);
    for (const temporada of temporadas) {
      // Álbum y sus Recuadros (metadatos de impresión / vacíos).
      const album = await this.repos.albumes.findByTemporadaId(temporada.id);
      if (album) {
        const recuadros = await this.repos.recuadros.findByAlbumId(album.id);
        for (const recuadro of recuadros) {
          if (await this.repos.recuadros.delete(recuadro.id)) {
            recuadrosEliminados += 1;
          }
        }
        await this.repos.albumes.delete(album.id);
      }

      // Partidos de la Temporada y, por cada uno, su Momento y sus Fotos.
      const partidos = await this.repos.partidos.findByTemporadaId(temporada.id);
      for (const partido of partidos) {
        const momento = await this.repos.momentos.findByPartidoOficialId(partido.id);
        if (momento) {
          const fotos = await this.repos.fotos.findByMomentoId(momento.id);
          for (const foto of fotos) {
            // Binario en object storage primero; su borrado es idempotente, así
            // que un reintento tras fallo parcial no rompe.
            await this.objectStorage.delete(foto.objectKey);
            if (await this.repos.fotos.delete(foto.id)) {
              fotosEliminadas += 1;
            }
          }
          if (await this.repos.momentos.delete(momento.id)) {
            momentosEliminados += 1;
          }
        }
        await this.repos.partidos.delete(partido.id);
      }

      // Pedido: NO se elimina; es el ancla del mínimo legal/fiscal. Se
      // despersonaliza anulando el `tracking` (dato de envío) y conservando
      // intacto `datosFiscalesMinimos`. El `temporadaId` que queda es un
      // identificador opaco (no revela identidad ni dato personal): la
      // Temporada, el Usuario y el resto de datos personales sí se eliminan.
      // Reencontrar el Pedido por ese id en un reintento es idempotente.
      const pedido = await this.repos.pedidos.findByTemporadaId(temporada.id);
      if (pedido) {
        await this.despersonalizarPedido(pedido);
        pedidosConservados += 1;
      }

      // Finalmente la propia Temporada (dato personal: usuarioId, clubId).
      await this.repos.temporadas.delete(temporada.id);
    }

    // Dirección de envío (dato personal).
    const direccion = await this.repos.direcciones.findByUsuarioId(usuarioId);
    if (direccion) {
      await this.repos.direcciones.delete(direccion.id);
    }

    // Suscripción (dato personal / comercial ligado al usuario).
    const suscripcion = await this.repos.suscripciones.findByUsuarioId(usuarioId);
    if (suscripcion) {
      await this.repos.suscripciones.delete(suscripcion.id);
    }

    // Revoca y elimina todos los refresh tokens de la cuenta (cierre de sesión).
    const tokens = await this.repos.refreshTokens.findByUsuarioId(usuarioId);
    let tokensRevocados = 0;
    for (const token of tokens) {
      if (await this.repos.refreshTokens.delete(token.id)) {
        tokensRevocados += 1;
      }
    }

    // Registro de Usuario (raíz de los datos personales).
    await this.repos.usuarios.delete(usuarioId);

    return {
      usuarioExistia: usuario !== null,
      fotosEliminadas,
      momentosEliminados,
      recuadrosEliminados,
      tokensRevocados,
      pedidosConservados,
    };
  }

  /**
   * Despersonaliza un Pedido conservando `datosFiscalesMinimos`: anula el
   * `tracking` (información de seguimiento del envío, dato personal) y deja el
   * mínimo fiscal intacto. Idempotente: reejecutarlo sobre un Pedido ya
   * despersonalizado (tracking ya nulo) no altera el mínimo fiscal.
   */
  private async despersonalizarPedido(pedido: Pedido): Promise<void> {
    await this.repos.pedidos.update(pedido.id, { tracking: null });
  }
}
