// Pruebas de UserProfileService — actualización de datos de perfil.

import { describe, expect, it } from 'vitest';

import { createInMemoryRepositories } from '../../persistence/in-memory/index.js';
import {
  PerfilInvalidoError,
  PerfilUsuarioNoEncontradoError,
  UserProfileService,
} from './user-profile-service.js';

async function setup() {
  const repos = createInMemoryRepositories();
  await repos.usuarios.create({
    id: 'u1',
    proveedorAuth: 'email',
    email: 'u@x.com',
    clubId: null,
    zonaHoraria: 'UTC',
  });
  return { repos, svc: new UserProfileService(repos.usuarios) };
}

describe('UserProfileService.actualizar', () => {
  it('aplica un parche parcial con los datos de perfil', async () => {
    const { svc } = await setup();
    const u = await svc.actualizar('u1', {
      nombre: '  Camila  ',
      alias: 'cami',
      fechaNacimiento: '1995-06-15',
      sexo: 'FEMENINO',
      avatarUrl: 'avatars/u1.png',
      zonaHoraria: 'America/Santiago',
    });
    expect(u.nombre).toBe('Camila'); // recortado
    expect(u.alias).toBe('cami');
    expect(u.fechaNacimiento).toBe('1995-06-15');
    expect(u.sexo).toBe('FEMENINO');
    expect(u.avatarUrl).toBe('avatars/u1.png');
    expect(u.zonaHoraria).toBe('America/Santiago');
  });

  it('rechaza fecha de nacimiento inválida o futura', async () => {
    const { svc } = await setup();
    await expect(svc.actualizar('u1', { fechaNacimiento: '15-06-1995' })).rejects.toBeInstanceOf(
      PerfilInvalidoError,
    );
    await expect(svc.actualizar('u1', { fechaNacimiento: '2999-01-01' })).rejects.toBeInstanceOf(
      PerfilInvalidoError,
    );
  });

  it('rechaza sexo inválido', async () => {
    const { svc } = await setup();
    await expect(svc.actualizar('u1', { sexo: 'X' as unknown as 'OTRO' })).rejects.toBeInstanceOf(
      PerfilInvalidoError,
    );
  });

  it('falla si el usuario no existe', async () => {
    const { svc } = await setup();
    await expect(svc.actualizar('otro', { nombre: 'x' })).rejects.toBeInstanceOf(
      PerfilUsuarioNoEncontradoError,
    );
  });
});
