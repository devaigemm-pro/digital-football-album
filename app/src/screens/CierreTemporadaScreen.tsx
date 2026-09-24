// CierreTemporadaScreen — pantalla de cierre anticipado de la Temporada.
//
// Task 30.4 — Requirements: 10.1, 10.2, 10.3, 10.4
// (SRS Req 16 — cierre de Temporada: confirmación opcional de fotos listas
//  (16.1), informe de Recuadros sin Foto_Principal antes del cierre (16.2),
//  cierre anticipado confirmado con disparo de impresión (16.4) y Recuadros
//  vacíos mantenidos en la impresión (16.5)).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO están
// instaladas en este entorno, por lo que este archivo `.tsx` está EXCLUIDO del
// typecheck de `app/tsconfig.json` (ver "exclude"). Es código real, listo para
// compilar cuando se instale el toolchain RN/React; hasta entonces no participa
// en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (informar los Recuadros sin Foto_Principal antes de
// confirmar, imponer la confirmación explícita del cierre, reenviar la
// confirmación opcional de "fotos listas", solicitar el cierre y espejar el
// estado de la Temporada devuelto) vive en `EarlyClosePresenter` (TypeScript
// puro, unit-testado en `season/early-close-presenter.test.ts`). Aquí solo se
// enlaza ese presentador a React y se pinta.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  EarlyClosePresenter,
  type EarlyCloseState,
  type SeasonCloseClient,
} from '../season';
import { DangerButton, SectionTitle } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface CierreTemporadaScreenProps {
  /** Temporada a cerrar de forma anticipada. */
  readonly temporadaId: string;
  /** Adaptador HTTP del `SeasonCloseClient`. */
  readonly client: SeasonCloseClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: EarlyClosePresenter;
}

/**
 * Pantalla de cierre anticipado. Enlaza el `EarlyClosePresenter` al árbol de
 * React y re-renderiza cuando su estado cambia, sin bloquear la UI.
 */
export function CierreTemporadaScreen({
  temporadaId,
  client,
  presenter,
}: CierreTemporadaScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new EarlyClosePresenter(client),
    [presenter, client],
  );

  const [state, setState] = useState<EarlyCloseState>(() => pres.getState());
  // Confirmación OPCIONAL de "fotos listas para imprenta" (Req 10.1 / SRS 16.1).
  const [fotosListas, setFotosListas] = useState(false);
  // Confirmación EXPLÍCITA del cierre: compuerta previa a contactar el backend.
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    const unsubscribe = pres.subscribe(setState);
    // Informa los Recuadros sin Foto_Principal antes de cualquier confirmación
    // (Req 10.2 / SRS 16.2). Carga no bloqueante.
    void pres.loadRecuadrosFaltantes(temporadaId);
    return unsubscribe;
  }, [pres, temporadaId]);

  const cerrando = state.cierreStatus === 'submitting';
  const cerrada = state.cierreStatus === 'closed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionTitle>Cierre anticipado de la temporada</SectionTitle>

      {/* ---------- Recuadros sin Foto_Principal (Req 10.2 / SRS 16.2) ---------- */}
      {state.faltantesStatus === 'loading' ? (
        <ActivityIndicator accessibilityLabel="Cargando recuadros pendientes" />
      ) : null}

      {state.faltantesStatus === 'loaded' && state.hayFaltantes ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo} accessibilityRole="text">
            Tienes {state.faltantesCount} recuadro(s) sin foto principal
          </Text>
          <Text style={styles.avisoTexto}>
            Si cierras ahora, estos recuadros se imprimirán vacíos:
          </Text>
          <Text style={styles.avisoNumeros} accessibilityRole="text">
            {state.recuadrosFaltantes.join(', ')}
          </Text>
        </View>
      ) : null}

      {state.faltantesStatus === 'loaded' && !state.hayFaltantes ? (
        <Text style={styles.ok} accessibilityRole="text">
          Todos los recuadros tienen foto principal.
        </Text>
      ) : null}

      {state.faltantesStatus === 'error' && state.faltantesError !== null ? (
        <View>
          <Text style={styles.error}>{state.faltantesError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar recuadros pendientes"
            onPress={() => {
              void pres.loadRecuadrosFaltantes(temporadaId);
            }}
          >
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ---------- Confirmaciones y cierre (Req 10.1, 10.4) ---------- */}
      {!cerrada ? (
        <View>
          {/* Confirmación OPCIONAL de fotos listas para imprenta (Req 10.1). */}
          <View style={styles.fila}>
            <Switch
              value={fotosListas}
              onValueChange={setFotosListas}
              accessibilityLabel="Confirmar que las fotografías están listas para imprenta"
            />
            <Text style={styles.filaTexto}>
              Confirmo que mis fotografías están listas para imprenta (opcional)
            </Text>
          </View>

          {/* Confirmación EXPLÍCITA del cierre: obligatoria para proceder. */}
          <View style={styles.fila}>
            <Switch
              value={confirmado}
              onValueChange={setConfirmado}
              accessibilityLabel="Confirmar el cierre anticipado de la temporada"
            />
            <Text style={styles.filaTexto}>
              Entiendo que el cierre es definitivo y dispara la impresión
            </Text>
          </View>

          <DangerButton
            title={cerrando ? 'Cerrando…' : 'Cerrar temporada ahora'}
            accessibilityLabel="Cerrar temporada ahora"
            disabled={!confirmado || cerrando}
            onPress={() => {
              void pres.requestClose(temporadaId, {
                confirmed: confirmado,
                fotosListas,
              });
            }}
            style={styles.botonCerrar}
          />

          {cerrando ? (
            <ActivityIndicator accessibilityLabel="Cerrando la temporada" />
          ) : null}

          {/* Error del backend ESPEJADO (Req 10.4). */}
          {state.cierreStatus === 'error' && state.cierreError !== null ? (
            <Text style={styles.error} accessibilityRole="text">
              {state.cierreError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ---------- Estado de la Temporada devuelto (Req 10.3, 10.4) ---------- */}
      {cerrada && state.temporadaEstado !== null ? (
        <View style={styles.resultado}>
          <Text style={styles.resultadoTitulo} accessibilityRole="text">
            Temporada {state.temporadaEstado}
          </Text>
          {state.recuadrosVacios !== null && state.recuadrosVacios.length > 0 ? (
            <Text style={styles.resultadoTexto} accessibilityRole="text">
              Recuadros impresos vacíos: {state.recuadrosVacios.join(', ')}
            </Text>
          ) : (
            <Text style={styles.resultadoTexto} accessibilityRole="text">
              Todos los recuadros se imprimieron con foto principal.
            </Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: spacing.lg },
  aviso: {
    backgroundColor: palette.warningBg,
    borderColor: palette.gold,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avisoTitulo: { color: palette.warning, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  avisoTexto: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small },
  avisoNumeros: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small, fontWeight: fontWeight.semibold, marginTop: spacing.xs },
  ok: { color: palette.success, fontFamily: fonts.body, marginBottom: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  filaTexto: { flex: 1, marginLeft: spacing.sm, color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small },
  botonCerrar: { marginTop: spacing.xs, marginBottom: spacing.sm },
  error: { color: palette.danger, fontFamily: fonts.body, marginTop: spacing.xs, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  resultado: {
    backgroundColor: palette.successBg,
    borderColor: palette.success,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultadoTitulo: { color: palette.success, fontFamily: fonts.body, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  resultadoTexto: { color: palette.success, fontFamily: fonts.body, fontSize: fontSize.small },
});

export default CierreTemporadaScreen;
