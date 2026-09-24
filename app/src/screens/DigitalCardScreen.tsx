// DigitalCardScreen — pantalla de generación y presentación de una Digital Card
// con su gating visible.
//
// Task 29.2 — Requirements: 5.1, 5.2, 5.3, 5.4
// (backend Req 12.1/12.2/12.3/12.4 — Generador_Cards `POST /cards`;
//  cliente Req 27.3 — mostrar "requiere Plan_Premium" ante rechazo por gating).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO
// están instaladas en este entorno, por lo que este archivo `.tsx` está
// EXCLUIDO del typecheck de `app/tsconfig.json` (ver "exclude"). Es código real,
// listo para compilar cuando se instale el toolchain RN/React; hasta entonces no
// participa en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección y —crucialmente— NO decide el gating por plan (Req 5.3, 5.4). Toda
// la lógica (invocar `POST /cards`, la máquina de estados de generación y la
// distinción del rechazo por gating frente a un error genérico) vive en
// `CardPresenter` (TypeScript puro, unit-testado en `cards/card-presenter.test.ts`).
// Aquí solo se enlaza ese presentador a React y se pinta:
//   - la card generada por su `objectKey` (imagen compuesta por el backend) (Req 5.1, 5.2);
//   - el mensaje "requiere Plan_Premium" cuando el backend rechaza por gating (Req 5.4);
//   - un error genérico con reintento en cualquier otro fallo (Req 5.4);
// manteniendo la UI operable mientras la petición está en curso (Req 5.3).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CardPresenter, type CardState } from '../cards';
import type { CardsClient } from '../viewmodels';
import { Hero, PrimaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, shadow, spacing } from '../theme/design-tokens';

export interface DigitalCardScreenProps {
  /** Usuario para el que se genera la Digital_Card. */
  readonly usuarioId: string;
  /** Momento (partido) cuya Digital_Card se genera. */
  readonly momentoId: string;
  /** Adaptador HTTP del `CardsClient` (`POST /cards`). El backend decide el gating. */
  readonly client: CardsClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: CardPresenter;
  /**
   * Si es `true`, dispara la generación al montar. Por defecto `false`: la
   * generación se inicia al pulsar el botón "Generar" (acción explícita del
   * usuario).
   */
  readonly autoGenerate?: boolean;
}

/** Resuelve la clave del binario de la card a una fuente de `Image` de RN. */
function cardSource(objectKey: string): { uri: string } {
  return { uri: objectKey };
}

/**
 * Pantalla de la Digital_Card. Enlaza el `CardPresenter` al árbol de React y
 * re-renderiza cuando su estado cambia, sin bloquear la UI (Req 5.3).
 */
export function DigitalCardScreen({
  usuarioId,
  momentoId,
  client,
  presenter,
  autoGenerate = false,
}: DigitalCardScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new CardPresenter(client),
    [presenter, client],
  );

  const [state, setState] = useState<CardState>(() => pres.getState());

  useEffect(() => {
    const unsubscribe = pres.subscribe(setState);
    if (autoGenerate) {
      void pres.generate(usuarioId, momentoId);
    }
    return unsubscribe;
  }, [pres, usuarioId, momentoId, autoGenerate]);

  const generar = (): void => {
    void pres.generate(usuarioId, momentoId);
  };

  return (
    <Screen tone="dark" flush>
      <Hero eyebrow="Compartir" title="Digital Card">
        {state.status === 'generating' ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Generando la Digital Card"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <View style={styles.body}>
        {/* Card generada: se muestra el binario compuesto por el backend (Req 5.1, 5.2). */}
        {state.status === 'generated' && state.card !== null ? (
          <View style={styles.cardBox}>
            <View style={styles.cardFrame}>
              <Image
                style={styles.cardImage}
                source={cardSource(state.card.objectKey)}
                accessibilityRole="image"
                accessibilityLabel="Digital Card generada"
              />
            </View>
            <Text style={styles.formato}>Formato: {state.card.formato}</Text>
          </View>
        ) : null}

        {/* Rechazo por gating: mensaje "requiere Plan_Premium" (Req 5.4). La
            decisión de gating la tomó el backend; aquí solo se muestra. */}
        {state.status === 'error' && state.errorKind === 'gating' ? (
          <View style={styles.gatingBox}>
            <Text style={styles.gatingText} accessibilityRole="text">
              {state.error}
            </Text>
          </View>
        ) : null}

        {/* Error genérico con reintento (Req 5.4). */}
        {state.status === 'error' && state.errorKind === 'generic' ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar generar la Digital Card"
              onPress={generar}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Acción explícita para generar (no se decide gating en el cliente). */}
        <PrimaryButton
          title={state.status === 'generated' ? 'Regenerar' : 'Generar'}
          accessibilityLabel="Generar la Digital Card"
          disabled={state.status === 'generating'}
          onPress={generar}
          style={styles.generar}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { flex: 1, padding: spacing.lg },
  cardBox: { marginBottom: spacing.lg, alignItems: 'center' },
  // Marco tipo "cromo": borde de acento sobre la tinta, como en el mockup.
  cardFrame: {
    width: '80%',
    borderRadius: radius.card,
    borderWidth: 3,
    borderColor: palette.accent,
    backgroundColor: palette.inkSoft,
    padding: spacing.sm,
    ...shadow.card,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.sm,
    resizeMode: 'contain',
    backgroundColor: palette.inkSoft,
  },
  formato: { marginTop: spacing.sm, fontFamily: fonts.body, fontSize: fontSize.caption, color: palette.textMutedOnDark },
  gatingBox: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.warningBg,
    borderWidth: 1,
    borderColor: palette.gold,
  },
  gatingText: { color: palette.warning, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  errorBox: { marginBottom: spacing.lg },
  errorText: { color: '#FF8A80', fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.textOnDark, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  generar: { marginTop: spacing.sm },
});

export default DigitalCardScreen;
