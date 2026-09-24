// NotificacionesScreen — pantalla de notificaciones push (Servicio_Notificaciones).
//
// Task 30.3 — Requirements: 26.1, 26.2, 26.3, 26.4, 26.5
// (design.md · "Permisos, IAP, Push y Compartición (Req 24, 25, 26, 6/13)" →
//  "Push (Req 26): registro del Token_Push (APNs/FCM) en el backend y renderizado
//  de los recordatorios recibidos").
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO están
// instaladas en este entorno, por lo que este archivo `.tsx` está EXCLUIDO del
// typecheck de `app/tsconfig.json` (ver "exclude"). Es código real, listo para
// compilar cuando se instale el toolchain RN/React; hasta entonces no participa
// en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (solicitar permiso, obtener y registrar el
// Token_Push, renderizar los recordatorios de Recuadro vacío y de cierre
// escalonado, silenciar por Recuadro y operar sin permiso) vive en
// `PushRegistrationPresenter` (TypeScript puro). Aquí solo se enlaza ese
// presentador a React y se pinta el estado.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  PushRegistrationPresenter,
  type NativeNotificationBridge,
  type PushPlatform,
  type PushRegistrationClient,
  type PushRegistrationState,
  type RenderedReminder,
} from '../notifications';
import { Hero, PrimaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface NotificacionesScreenProps {
  /** Puerto a las capacidades nativas de notificaciones (APNs/FCM). */
  readonly bridge: NativeNotificationBridge;
  /** Adaptador HTTP del `PushRegistrationClient` (Servicio_Notificaciones). */
  readonly client: PushRegistrationClient;
  /** Plataforma de push del dispositivo (`apns` en iOS, `fcm` en Android). */
  readonly platform: PushPlatform;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: PushRegistrationPresenter;
}

/** Texto de estado del registro, legible para el usuario (Req 26.1, 26.5). */
function estadoTexto(state: PushRegistrationState): string {
  switch (state.registroStatus) {
    case 'idle':
      return 'Activa las notificaciones para recibir recordatorios.';
    case 'requesting':
      return 'Solicitando permiso…';
    case 'registered':
      return 'Notificaciones activadas.';
    case 'denied':
      // Operar sin permiso (Req 26.5): la app sigue usable.
      return 'Notificaciones desactivadas. La app funciona igual; puedes activarlas cuando quieras.';
    case 'unavailable':
      return 'No fue posible obtener un token de notificaciones en este dispositivo.';
    case 'error':
      return state.error ?? 'No se pudo activar las notificaciones.';
    default:
      return '';
  }
}

/** Fila de un recordatorio recibido (Req 26.2, 26.3), con acción de silenciar. */
function RecordatorioItem({
  reminder,
  silenciado,
  onSilenciar,
}: {
  reminder: RenderedReminder;
  silenciado: boolean;
  onSilenciar: (recuadroId: string) => void;
}): React.ReactElement {
  return (
    <View style={styles.item} accessibilityRole="text">
      <Text style={styles.itemTitulo}>{reminder.titulo}</Text>
      <Text style={styles.itemCuerpo}>{reminder.cuerpo}</Text>
      {/* Silenciar aplica solo a los recordatorios de Recuadro (Req 26.4). */}
      {reminder.recuadroId !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            silenciado
              ? 'Recordatorio silenciado'
              : 'Silenciar recordatorios de este recuadro'
          }
          disabled={silenciado}
          onPress={() => onSilenciar(reminder.recuadroId as string)}
        >
          <Text style={silenciado ? styles.silenciado : styles.silenciar}>
            {silenciado ? 'Silenciado' : 'Silenciar recordatorios'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Pantalla de notificaciones. Enlaza el `PushRegistrationPresenter` al árbol de
 * React, dispara el registro al montar y re-renderiza cuando su estado cambia,
 * sin bloquear la UI.
 */
export function NotificacionesScreen({
  bridge,
  client,
  platform,
  presenter,
}: NotificacionesScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new PushRegistrationPresenter({ bridge, client, platform }),
    [presenter, bridge, client, platform],
  );

  const [state, setState] = useState<PushRegistrationState>(() =>
    pres.getState(),
  );

  useEffect(() => {
    const unsubscribe = pres.subscribe(setState);
    // Intento de registro al montar (permiso → token → backend), no bloqueante.
    void pres.register();
    return unsubscribe;
  }, [pres]);

  const silenciados = new Set(state.recuadrosSilenciados);

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Temporada 2026" title="Notificaciones" />

      <View style={styles.body}>
      <Text style={styles.estado} accessibilityRole="text">
        {estadoTexto(state)}
      </Text>

      {state.registroStatus === 'requesting' ? (
        <ActivityIndicator color={palette.accent} accessibilityLabel="Activando notificaciones" />
      ) : null}

      {/* Reintento cuando el permiso quedó denegado o hubo error (Req 26.1, 26.5). */}
      {state.registroStatus === 'denied' ||
      state.registroStatus === 'error' ||
      state.registroStatus === 'unavailable' ? (
        <PrimaryButton
          title="Activar notificaciones"
          accessibilityLabel="Activar notificaciones"
          onPress={() => {
            void pres.register();
          }}
        />
      ) : null}

      {/* Recordatorios recibidos: Recuadro vacío y cierre escalonado (Req 26.2, 26.3). */}
      <View style={styles.separador} />
      <Text style={styles.subtitulo}>Recordatorios</Text>

      {state.recordatorios.length === 0 ? (
        <Text style={styles.vacio}>Aún no hay recordatorios.</Text>
      ) : (
        <FlatList
          data={state.recordatorios}
          keyExtractor={(_item, index) => String(index)}
          renderItem={({ item }) => (
            <RecordatorioItem
              reminder={item}
              silenciado={
                item.recuadroId !== null && silenciados.has(item.recuadroId)
              }
              onSilenciar={(recuadroId) => {
                void pres.silenciarRecuadro(recuadroId);
              }}
            />
          )}
        />
      )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: spacing.lg },
  subtitulo: { color: palette.textOnLight, fontFamily: fonts.display, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, letterSpacing: 0.5, marginBottom: spacing.sm },
  estado: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.body, marginBottom: spacing.md },
  separador: { height: 1, backgroundColor: palette.borderOnLight, marginVertical: spacing.xl },
  vacio: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small },
  item: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemTitulo: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  itemCuerpo: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.sm },
  silenciar: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  // #5B6472 sobre fondo claro cumple AA (≥ 4.5:1).
  silenciado: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
});

export default NotificacionesScreen;
