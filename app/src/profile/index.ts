// Barrel del módulo de perfil del cliente.
//
// Expone el presentador puro (framework-agnóstico) que enlazan las pantallas de
// Perfil y de lista de partidos (láminas), junto con sus tipos de estado.

export {
  ProfilePresenter,
  añoDeTemporada,
  PROFILE_ERROR_MESSAGE,
  PARTIDOS_ERROR_MESSAGE,
  SYNC_ERROR_MESSAGE,
  EDIT_ERROR_MESSAGE,
} from './profile-presenter';
export type {
  LoadStatus,
  ProfileState,
  PartidosState,
  SyncStatus,
  SyncState,
  EditStatus,
  EditState,
  ProfileStateListener,
  PartidosStateListener,
  SyncStateListener,
  EditStateListener,
} from './profile-presenter';
