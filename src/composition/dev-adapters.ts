// Adaptadores de DESARROLLO para los puertos externos del backend.
//
// ⚠️  NO APTOS PARA PRODUCCIÓN. Estas implementaciones cubren, con dobles
// deterministas, los puertos que aún no tienen un adaptador real (proveedores de
// auth, IAP, composición de imagen, push, API deportiva, render de PDF, etc.).
// Permiten arrancar el backend end-to-end en local para explorar el flujo, pero
// NO hablan con Apple/Google/APNs/FCM/S3 ni renderizan PDFs reales.
//
// Cada adaptador es explícito sobre su naturaleza: registra en consola lo que
// haría, o lanza `NotImplementedInDevError` cuando fingir un resultado sería
// engañoso (p. ej. validar una credencial real). Al reemplazarlos por
// adaptadores de producción, este archivo desaparece del composition root.

import type { ProveedorAuth, UUID } from '../domain/types.js';
import type { ProviderVerificationResult, ProviderVerifier } from '../services/auth/providers.js';
import type {
  IAPReceipt,
  IAPReceiptValidator,
  IAPValidationResult,
} from '../services/subscription/iap-receipt-validator.js';
import type {
  CardArtefacto,
  CardComposer,
  CardContenido,
} from '../services/cards/card-composer.js';
import type { NotificacionPush, PushNotifier } from '../services/notifications/push-notifier.js';
import type { SportsApiTransport } from '../services/sports/types.js';
import type { AvisoAsociacionPendiente, Notifier } from '../services/sports/notifier.js';
import type {
  OperatorAlerta,
  OperatorNotifier,
  PdfArtefacto,
  PdfLibroSpec,
  PdfRenderer,
  PdfStickersSpec,
  PublishResult,
  TempStorage,
} from '../services/print-engine/renderer.js';

/** Se lanza cuando un puerto no puede simularse sin engañar (p. ej. verificar credenciales reales). */
export class NotImplementedInDevError extends Error {
  constructor(puerto: string) {
    super(
      `[dev] El puerto "${puerto}" no tiene adaptador real. ` +
        'Provee una implementación de producción antes de usar este flujo.',
    );
    this.name = 'NotImplementedInDevError';
  }
}

function log(port: string, detail: string): void {
  // eslint-disable-next-line no-console
  console.info(`[dev-adapter] ${port}: ${detail}`);
}

/**
 * Verificador de credenciales de dev. Acepta credenciales con el formato
 * `email:<correo>` para poder ejercitar registro/login localmente; cualquier
 * otra credencial se rechaza. NO valida tokens de Apple/Google reales.
 */
export class DevProviderVerifier implements ProviderVerifier {
  verify(provider: ProveedorAuth, credential: string): Promise<ProviderVerificationResult> {
    // Convención de dev: la credencial es "email:<correo>".
    const match = /^email:(.+@.+)$/.exec(credential.trim());
    if (!match) {
      log('ProviderVerifier', `credencial rechazada para proveedor ${provider}`);
      return Promise.resolve({ ok: false });
    }
    const email = match[1] as string;
    log('ProviderVerifier', `identidad de dev aceptada para ${email}`);
    return Promise.resolve({
      ok: true,
      identity: { proveedor: provider, email },
    });
  }
}

/** Validador IAP de dev: rechaza siempre, porque validar recibos reales es I/O de tienda. */
export class DevIAPReceiptValidator implements IAPReceiptValidator {
  validar(receipt: IAPReceipt): Promise<IAPValidationResult> {
    log('IAPReceiptValidator', `recibo ${receipt.plataforma} no validable en dev`);
    return Promise.resolve({
      ok: false,
      motivo: 'Validación de recibos IAP no disponible en el entorno de desarrollo.',
    });
  }
}

/** Compositor de cards de dev: no renderiza píxeles; devuelve una clave determinista. */
export class DevCardComposer implements CardComposer {
  componer(contenido: CardContenido): Promise<CardArtefacto> {
    log('CardComposer', `card simulada para marcador ${contenido.marcador}`);
    return Promise.resolve({
      objectKey: `dev/cards/${encodeURIComponent(contenido.marcador)}.png`,
      formato: 'PNG',
    });
  }
}

/** Notificador push de dev: registra en consola en vez de entregar por APNs/FCM. */
export class DevPushNotifier implements PushNotifier {
  enviar(notificacion: NotificacionPush): Promise<void> {
    log('PushNotifier', `push ${notificacion.tipo} -> usuario ${notificacion.usuarioId}`);
    return Promise.resolve();
  }
}

/** Notificador de asociación pendiente de dev (flujos de sports). */
export class DevSportsNotifier implements Notifier {
  notificarAsociacionPendiente(aviso: AvisoAsociacionPendiente): Promise<void> {
    log(
      'sports.Notifier',
      `foto ${aviso.fotoId} pendiente (${aviso.motivo}, ${aviso.candidatos} candidatos)`,
    );
    return Promise.resolve();
  }
}

/** Transporte de la API deportiva de dev: sin red; lanza para no inventar datos. */
export class DevSportsApiTransport implements SportsApiTransport {
  get<T>(path: string, _signal: AbortSignal): Promise<T> {
    log('SportsApiTransport', `GET ${path} no disponible en dev`);
    return Promise.reject(new NotImplementedInDevError('SportsApiTransport'));
  }
}

/** Renderer de PDF de dev: no materializa bytes; lanza al intentar renderizar. */
export class DevPdfRenderer implements PdfRenderer {
  renderLibro(_spec: PdfLibroSpec): Promise<PdfArtefacto> {
    return Promise.reject(new NotImplementedInDevError('PdfRenderer.renderLibro'));
  }
  renderStickers(_spec: PdfStickersSpec): Promise<PdfArtefacto> {
    return Promise.reject(new NotImplementedInDevError('PdfRenderer.renderStickers'));
  }
}

/** Almacenamiento temporal de dev para el Print_Engine. */
export class DevTempStorage implements TempStorage {
  publish(temporadaId: UUID, _artefactos: readonly PdfArtefacto[]): Promise<PublishResult> {
    return Promise.resolve({
      temporadaId,
      libroKey: `dev/print/${temporadaId}/libro.pdf`,
      stickersKey: `dev/print/${temporadaId}/stickers.pdf`,
    });
  }
  discard(_artefactos: readonly PdfArtefacto[]): Promise<void> {
    return Promise.resolve();
  }
}

/** Notificador al operador de dev: registra alertas en consola. */
export class DevOperatorNotifier implements OperatorNotifier {
  alertarOperador(alerta: OperatorAlerta): Promise<void> {
    log(
      'OperatorNotifier',
      `ALERTA temporada ${alerta.temporadaId}: ${alerta.motivo} (${alerta.intentos} intentos)`,
    );
    return Promise.resolve();
  }
  notificarUsuario(temporadaId: UUID, mensaje: string): Promise<void> {
    log('OperatorNotifier', `usuario de temporada ${temporadaId}: ${mensaje}`);
    return Promise.resolve();
  }
}
