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
    <View style={styles.container}>
      <Text style={styles.title}>Notificaciones</Text>

      <Text style={styles.estado} accessibilityRole="text">
        {estadoTexto(state)}
      </Text>

      {state.registroStatus === 'requesting' ? (
        <ActivityIndicator accessibilityLabel="Activando notificaciones" />
      ) : null}

      {/* Reintento cuando el permiso quedó denegado o hubo error (Req 26.1, 26.5). */}
      {state.registroStatus === 'denied' ||
      state.registroStatus === 'error' ||
      state.registroStatus === 'unavailable' ? (
        <Pressable
          style={styles.boton}
          accessibilityRole="button"
          accessibilityLabel="Activar notificaciones"
          onPress={() => {
            void pres.register();
          }}
        >
          <Text style={styles.botonTexto}>Activar notificaciones</Text>
        </Pressable>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  subtitulo: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  estado: { fontSize: 15, marginBottom: 12, color: '#444' },
  boton: {
    backgroundColor: '#1565c0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  botonTexto: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  separador: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 20 },
  vacio: { fontSize: 14, color: '#666' },
  item: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  itemTitulo: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  itemCuerpo: { fontSize: 14, color: '#333', marginBottom: 8 },
  silenciar: { color: '#1565c0', fontWeight: '600' },
  // #616161 sobre fondo claro alcanza ~6.19:1 (≥ 4.5:1, WCAG AA); #999 daba ~2.85:1.
  silenciado: { color: '#616161', fontWeight: '600' },
});

export default NotificacionesScreen;
