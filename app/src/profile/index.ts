// Barrel del módulo de perfil del cliente.
//
// Expone el presentador puro (framework-agnóstico) que enlazan las pantallas de
// Perfil y de lista de partidos (láminas), junto con sus tipos de estado.

export {
  ProfilePresenter,
  PROFILE_ERROR_MESSAGE,
  PARTIDOS_ERROR_MESSAGE,
} from './profile-presenter';
export type {
  LoadStatus,
  ProfileState,
  PartidosState,
  ProfileStateListener,
  PartidosStateListener,
} from './profile-presenter';
