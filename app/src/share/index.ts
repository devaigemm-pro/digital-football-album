// Barrel de la capa de compartición nativa a redes sociales del cliente.
//
// Task 29.3 — Requirements: 6.1, 6.2, 6.3, 6.4
// Expone el presentador framework-agnóstico, el adaptador del `NativeShareBridge`
// y sus tipos para que la pantalla `CompartirSheet.tsx` y el wiring del cliente
// los consuman. El view-model reutilizado (`ShareViewModel`) y su contrato
// (`NativeShareBridge`, `SharePlatform`, `SHARE_PLATFORMS`,
// `PlataformaNoSoportadaError`) viven en `app/src/viewmodels`.
export { SHARE_ERROR_MESSAGE, SharePresenter } from './share-presenter';
export type {
  ShareState,
  ShareStateListener,
  ShareStatus,
} from './share-presenter';

export { NativeShareBridgeAdapter } from './native-share-bridge-adapter';
export type { NativeSharePort } from './native-share-bridge-adapter';
