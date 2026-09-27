// UserProfileService — actualización de los datos de perfil del usuario.
//
// Permite completar/editar los datos personales del hincha (nombre, alias,
// fecha de nacimiento, sexo, avatar) sobre la entidad `Usuario`. Es lógica pura
// sobre el `UsuarioRepository` inyectado; valida las entradas y aplica un parche
// parcial (solo los campos provistos).
//
// No gestiona el binario del avatar: recibe una `avatarUrl` ya subida (la carga
// del binario al object storage la hace el flujo de subida correspondiente).

import type { ISODate, Sexo, Usuario, UUID } from '../../domain/types.js';
import type { UsuarioRepository } from '../../persistence/repositories.js';

/** Se lanza cuando el usuario no existe. */
export class PerfilUsuarioNoEncontradoError extends Error {
  readonly code = 'PERFIL_NO_ENCONTRADO';
  constructor(usuarioId: UUID) {
    super(`No se encontró el perfil del usuario "${usuarioId}".`);
    this.name = 'PerfilUsuarioNoEncontradoError';
  }
}

/** Se lanza ante un dato de perfil inválido. */
export class PerfilInvalidoError extends Error {
  readonly code = 'PERFIL_INVALIDO';
  constructor(message: string) {
    super(message);
    this.name = 'PerfilInvalidoError';
  }
}

/** Campos de perfil actualizables (todos opcionales; parche parcial). */
export interface ActualizarPerfilInput {
  readonly nombre?: string;
  readonly alias?: string;
  readonly fechaNacimiento?: ISODate;
  readonly sexo?: Sexo;
  readonly avatarUrl?: string;
  readonly zonaHoraria?: string;
}

const SEXOS_VALIDOS: readonly Sexo[] = ['MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERO_NO_DECIR'];

/** ¿`v` es una fecha ISO (YYYY-MM-DD) válida y no futura? */
function esFechaNacimientoValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return false;
  }
  const t = Date.parse(v);
  return !Number.isNaN(t) && t <= Date.now();
}

/** Servicio de actualización del perfil del usuario. */
export class UserProfileService {
  constructor(private readonly usuarios: UsuarioRepository) {}

  /**
   * Aplica un parche parcial al perfil del usuario y devuelve el `Usuario`
   * actualizado. Solo se escriben los campos presentes en `input`. Valida el
   * sexo (enum) y la fecha de nacimiento (formato y no futura).
   *
   * @throws {PerfilUsuarioNoEncontradoError} si el usuario no existe.
   * @throws {PerfilInvalidoError} si algún dato provisto es inválido.
   */
  async actualizar(usuarioId: UUID, input: ActualizarPerfilInput): Promise<Usuario> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (usuario === null) {
      throw new PerfilUsuarioNoEncontradoError(usuarioId);
    }

    const patch: Partial<Usuario> = {};

    if (input.nombre !== undefined) {
      patch.nombre = input.nombre.trim();
    }
    if (input.alias !== undefined) {
      patch.alias = input.alias.trim();
    }
    if (input.fechaNacimiento !== undefined) {
      if (!esFechaNacimientoValida(input.fechaNacimiento)) {
        throw new PerfilInvalidoError(
          'fechaNacimiento debe ser una fecha ISO (YYYY-MM-DD) no futura.',
        );
      }
      patch.fechaNacimiento = input.fechaNacimiento;
    }
    if (input.sexo !== undefined) {
      if (!SEXOS_VALIDOS.includes(input.sexo)) {
        throw new PerfilInvalidoError(`sexo inválido; use uno de: ${SEXOS_VALIDOS.join(', ')}.`);
      }
      patch.sexo = input.sexo;
    }
    if (input.avatarUrl !== undefined) {
      patch.avatarUrl = input.avatarUrl;
    }
    if (input.zonaHoraria !== undefined && input.zonaHoraria.trim().length > 0) {
      patch.zonaHoraria = input.zonaHoraria.trim();
    }

    return this.usuarios.update(usuarioId, patch);
  }
}
