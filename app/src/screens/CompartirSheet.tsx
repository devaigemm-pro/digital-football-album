// CompartirSheet — hoja de compartición nativa de la Digital_Card a redes.
//
// Task 29.3 — Requirements: 6.1, 6.2, 6.3, 6.4
// (backend Req 13.1/13.2 — ofrecer Instagram Stories, WhatsApp, X y TikTok e
//  invocar la integración nativa con la card seleccionada).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO
// están instaladas, por lo que este archivo `.tsx` está EXCLUIDO del typecheck
// de `app/tsconfig.json` (ver "exclude"). Es código real, listo para compilar
// cuando se instale el toolchain RN/React; hasta entonces no participa en
// `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (ofrecer las plataformas, invocar la integración
// nativa vía el `NativeShareBridge` y capturar el resultado éxito/error) vive en
// `SharePresenter` (TypeScript puro, unit-testado en `share/*.test.ts`). Aquí
// solo se enlaza ese presentador a React y se pinta:
//   - un botón por cada plataforma ofrecida (Req 6.1);
//   - el estado del último intento: compartiendo / éxito / error (Req 6.2, 6.3).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SharePresenter, type ShareState } from '../share';
import type { DigitalCard, SharePlatform } from '../viewmodels';

/** Etiqueta legible de cada plataforma para el botón de compartir (Req 6.1). */
const ETIQUETA_PLATAFORMA: Record<SharePlatform, string> = {
  INSTAGRAM_STORIES: 'Instagram Stories',
  WHATSAPP: 'WhatsApp',
  X: 'X (Twitter)',
  TIKTOK: 'TikTok',
};

export interface CompartirSheetProps {
  /** Digital_Card seleccionada a compartir. */
  readonly card: DigitalCard;
  /** Presentador de compartición ya construido con su `NativeShareBridge`. */
  readonly presenter: SharePresenter;
}

/**
 * Hoja de compartición. Ofrece un botón por plataforma soportada (Req 6.1) y, al
 * pulsarlo, delega en el `SharePresenter` que invoca la integración nativa y
 * captura el resultado; la vista refleja el estado observable (Req 6.2, 6.3).
 */
export function CompartirSheet({
  card,
  presenter,
}: CompartirSheetProps): React.ReactElement {
  const [state, setState] = useState<ShareState>(() => presenter.getState());

  useEffect(() => {
    // `subscribe` emite el estado actual de inmediato y en cada cambio.
    return presenter.subscribe(setState);
  }, [presenter]);

  const plataformas = useMemo(
    () => presenter.plataformasDisponibles,
    [presenter],
  );

  const compartir = (plataforma: SharePlatform): void => {
    // `share` captura el desenlace en el estado; una plataforma soportada nunca
    // rechaza (el estado refleja éxito/error). Se ignora la promesa con seguridad.
    void presenter.share(card, plataforma).catch(() => {
      // Solo una plataforma no soportada rechaza (Req 6.4); la UI únicamente
      // ofrece `plataformasDisponibles`, así que este caso no debería ocurrir.
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compartir tu cromo</Text>

      <View style={styles.acciones}>
        {plataformas.map((plataforma) => (
          <Pressable
            key={plataforma}
            accessibilityRole="button"
            accessibilityLabel={`Compartir en ${ETIQUETA_PLATAFORMA[plataforma]}`}
            style={styles.boton}
            disabled={state.status === 'sharing'}
            onPress={() => compartir(plataforma)}
          >
            <Text style={styles.botonTexto}>{ETIQUETA_PLATAFORMA[plataforma]}</Text>
          </Pressable>
        ))}
      </View>

      {/* Estado del intento capturado por el presentador (Req 6.2, 6.3). */}
      {state.status === 'sharing' ? (
        <View style={styles.estado}>
          <ActivityIndicator accessibilityLabel="Compartiendo" />
          <Text style={styles.estadoTexto}>Compartiendo…</Text>
        </View>
      ) : null}

      {state.status === 'success' && state.plataforma !== null ? (
        <Text style={[styles.estadoTexto, styles.exito]}>
          Compartido en {ETIQUETA_PLATAFORMA[state.plataforma]}.
        </Text>
      ) : null}

      {state.status === 'error' && state.error !== null ? (
        <Text style={[styles.estadoTexto, styles.error]}>{state.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  acciones: { gap: 8 },
  boton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1565c0',
    alignItems: 'center',
  },
  botonTexto: { color: '#ffffff', fontWeight: '600' },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  estadoTexto: { marginTop: 12, fontSize: 14 },
  exito: { color: '#2e7d32' },
  error: { color: '#b00020' },
});

export default CompartirSheet;
