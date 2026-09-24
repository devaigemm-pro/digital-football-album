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
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SharePresenter, type ShareState } from '../share';
import type { DigitalCard, SharePlatform } from '../viewmodels';
import { PrimaryButton } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

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
      <View style={styles.grabber} />
      <Text style={styles.title}>Compartir tu cromo</Text>

      <View style={styles.acciones}>
        {plataformas.map((plataforma) => (
          <PrimaryButton
            key={plataforma}
            title={ETIQUETA_PLATAFORMA[plataforma]}
            accessibilityLabel={`Compartir en ${ETIQUETA_PLATAFORMA[plataforma]}`}
            disabled={state.status === 'sharing'}
            onPress={() => compartir(plataforma)}
          />
        ))}
      </View>

      {/* Estado del intento capturado por el presentador (Req 6.2, 6.3). */}
      {state.status === 'sharing' ? (
        <View style={styles.estado}>
          <ActivityIndicator color={palette.accent} accessibilityLabel="Compartiendo" />
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
  container: {
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.borderOnLight,
    marginBottom: spacing.md,
  },
  title: {
    color: palette.textOnLight,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  acciones: { gap: spacing.sm },
  estado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  estadoTexto: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: spacing.md },
  exito: { color: palette.success },
  error: { color: palette.danger },
});

export default CompartirSheet;
