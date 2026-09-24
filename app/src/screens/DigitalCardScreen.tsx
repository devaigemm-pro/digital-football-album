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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Digital Card</Text>
        {state.status === 'generating' ? (
          <ActivityIndicator accessibilityLabel="Generando la Digital Card" />
        ) : null}
      </View>

      {/* Card generada: se muestra el binario compuesto por el backend (Req 5.1, 5.2). */}
      {state.status === 'generated' && state.card !== null ? (
        <View style={styles.cardBox}>
          <Image
            style={styles.cardImage}
            source={cardSource(state.card.objectKey)}
            accessibilityRole="image"
            accessibilityLabel="Digital Card generada"
          />
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Generar la Digital Card"
        disabled={state.status === 'generating'}
        onPress={generar}
      >
        <Text style={styles.generar}>
          {state.status === 'generated' ? 'Regenerar' : 'Generar'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '600' },
  cardBox: { marginBottom: 16, alignItems: 'center' },
  cardImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    resizeMode: 'contain',
    backgroundColor: '#f2f2f2',
  },
  formato: { marginTop: 6, fontSize: 12, color: '#666666' },
  gatingBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ffb74d',
  },
  // #bf360c sobre #fff3e0 alcanza ~5.11:1 de contraste (≥ 4.5:1, WCAG AA);
  // el naranja previo (#e65100) quedaba en ~3.46:1.
  gatingText: { color: '#bf360c', fontWeight: '600' },
  errorBox: { marginBottom: 16 },
  errorText: { color: '#b00020', marginBottom: 4 },
  retry: { color: '#1565c0', fontWeight: '600' },
  generar: { color: '#1565c0', fontWeight: '700', fontSize: 16, marginTop: 8 },
});

export default DigitalCardScreen;
