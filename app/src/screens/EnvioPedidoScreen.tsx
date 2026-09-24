// EnvioPedidoScreen — pantalla de Envío/Pedido (Servicio_Envío).
//
// Task 30.2 — Requirements: 8.1, 8.2, 8.3, 8.4
// (Requerimiento 15 del SRS — registro/validación de la Dirección_Envío y estado
//  del Pedido con tracking tras el despacho).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO están
// instaladas en este entorno, por lo que este archivo `.tsx` está EXCLUIDO del
// typecheck de `app/tsconfig.json` (ver "exclude"). Es código real, listo para
// compilar cuando se instale el toolchain RN/React; hasta entonces no participa
// en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (registrar/validar la Dirección_Envío vía
// `PUT /envio/direccion`, espejar los errores del backend de validación o de
// Fecha_Límite_Cierre alcanzada, cargar el estado del Pedido y mostrar el
// tracking solo tras el despacho) vive en `ShippingPresenter` (TypeScript puro,
// unit-testado en `shipping/shipping-presenter.test.ts`). Aquí solo se enlaza ese
// presentador a React y se pinta:
//   - un formulario de Dirección_Envío con confirmación/errores (Req 8.1–8.3);
//   - la vista de estado del Pedido con tracking condicional (Req 8.4).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ShippingPresenter,
  type DireccionEnvioCampos,
  type ShippingClient,
  type ShippingState,
} from '../shipping';
import { PrimaryButton, SectionTitle } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface EnvioPedidoScreenProps {
  /** Temporada cuyo Pedido se consulta (`GET /pedido/{temporadaId}`). */
  readonly temporadaId: string;
  /** Adaptador HTTP del `ShippingClient` (Servicio_Envío). */
  readonly client: ShippingClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: ShippingPresenter;
}

/** Estado local del formulario de dirección; el presentador no lo posee. */
type FormState = {
  nombreDestinatario: string;
  linea1: string;
  linea2: string;
  ciudad: string;
  region: string;
  codigoPostal: string;
  pais: string;
  telefono: string;
};

const EMPTY_FORM: FormState = {
  nombreDestinatario: '',
  linea1: '',
  linea2: '',
  ciudad: '',
  region: '',
  codigoPostal: '',
  pais: '',
  telefono: '',
};

/** Convierte el estado del formulario en los campos que consume el cliente. */
function toCampos(form: FormState): DireccionEnvioCampos {
  return {
    nombreDestinatario: form.nombreDestinatario,
    linea1: form.linea1,
    linea2: form.linea2.trim().length > 0 ? form.linea2 : undefined,
    ciudad: form.ciudad,
    region: form.region,
    codigoPostal: form.codigoPostal,
    pais: form.pais,
    telefono: form.telefono.trim().length > 0 ? form.telefono : undefined,
  };
}

/** Campo de texto etiquetado y accesible del formulario de dirección. */
function Campo({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
}): React.ReactElement {
  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={palette.textMutedOnLight}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * Pantalla de Envío/Pedido. Enlaza el `ShippingPresenter` al árbol de React y
 * re-renderiza cuando su estado cambia, sin bloquear la UI.
 */
export function EnvioPedidoScreen({
  temporadaId,
  client,
  presenter,
}: EnvioPedidoScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new ShippingPresenter(client),
    [presenter, client],
  );

  const [state, setState] = useState<ShippingState>(() => pres.getState());
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    const unsubscribe = pres.subscribe(setState);
    // Carga inicial del estado del Pedido (no bloqueante).
    void pres.getOrder(temporadaId);
    return unsubscribe;
  }, [pres, temporadaId]);

  const setField =
    (key: keyof FormState) =>
    (t: string): void =>
      setForm((prev) => ({ ...prev, [key]: t }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ---------- Formulario de Dirección_Envío (Req 8.1, 8.2, 8.3) ---------- */}
      <SectionTitle>Dirección de envío</SectionTitle>

      <Campo
        label="Nombre del destinatario"
        value={form.nombreDestinatario}
        onChangeText={setField('nombreDestinatario')}
      />
      <Campo label="Dirección" value={form.linea1} onChangeText={setField('linea1')} />
      <Campo
        label="Dirección (línea 2)"
        value={form.linea2}
        onChangeText={setField('linea2')}
      />
      <Campo label="Ciudad" value={form.ciudad} onChangeText={setField('ciudad')} />
      <Campo label="Región/Estado" value={form.region} onChangeText={setField('region')} />
      <Campo
        label="Código postal"
        value={form.codigoPostal}
        onChangeText={setField('codigoPostal')}
      />
      <Campo label="País" value={form.pais} onChangeText={setField('pais')} />
      <Campo label="Teléfono" value={form.telefono} onChangeText={setField('telefono')} />

      <PrimaryButton
        title={state.registroStatus === 'submitting' ? 'Guardando…' : 'Guardar dirección'}
        accessibilityLabel="Guardar dirección de envío"
        disabled={state.registroStatus === 'submitting'}
        onPress={() => {
          void pres.registerAddress(toCampos(form));
        }}
        style={styles.guardar}
      />

      {state.registroStatus === 'submitting' ? (
        <ActivityIndicator accessibilityLabel="Registrando dirección" />
      ) : null}

      {/* Confirmación de registro (Req 8.1, 8.2). */}
      {state.registroStatus === 'registered' &&
      state.registroConfirmacion !== null ? (
        <Text style={styles.confirmacion} accessibilityRole="text">
          {state.registroConfirmacion}
        </Text>
      ) : null}

      {/* Error del backend ESPEJADO: validación o cierre alcanzado (Req 8.3). */}
      {state.registroStatus === 'error' && state.registroError !== null ? (
        <Text style={styles.error} accessibilityRole="text">
          {state.registroError}
        </Text>
      ) : null}

      {/* ---------- Estado del Pedido y tracking (Req 8.4) ---------- */}
      <View style={styles.separador} />
      <SectionTitle>Estado del pedido</SectionTitle>

      {state.pedidoStatus === 'loading' ? (
        <ActivityIndicator accessibilityLabel="Cargando estado del pedido" />
      ) : null}

      {state.pedidoStatus === 'loaded' && state.pedidoEstado !== null ? (
        <View>
          <Text style={styles.estado} accessibilityRole="text">
            Estado: {state.pedidoEstado}
          </Text>
          {/* El tracking solo aparece cuando el kit fue despachado (Req 8.4). */}
          {state.despachado && state.tracking !== null ? (
            <Text style={styles.tracking} accessibilityRole="text">
              Seguimiento: {state.tracking}
            </Text>
          ) : (
            <Text style={styles.sinTracking} accessibilityRole="text">
              Aún no despachado. El seguimiento aparecerá al enviarse.
            </Text>
          )}
        </View>
      ) : null}

      {state.pedidoStatus === 'error' && state.pedidoError !== null ? (
        <View>
          <Text style={styles.error}>{state.pedidoError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar el estado del pedido"
            onPress={() => {
              void pres.getOrder(temporadaId);
            }}
          >
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: spacing.lg },
  campo: { marginBottom: spacing.md },
  label: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
    color: palette.textOnLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
  },
  guardar: { marginTop: spacing.xs, marginBottom: spacing.sm },
  confirmacion: { color: palette.success, fontFamily: fonts.body, marginTop: spacing.xs },
  error: { color: palette.danger, fontFamily: fonts.body, marginTop: spacing.xs, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  separador: { height: 1, backgroundColor: palette.borderOnLight, marginVertical: spacing.xl },
  estado: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, marginBottom: spacing.sm },
  tracking: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  sinTracking: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small },
});

export default EnvioPedidoScreen;
