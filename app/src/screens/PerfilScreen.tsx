// PerfilScreen — perfil del usuario (club actual, temporada activa, datos).
//
// Consume `GET /me` a través del `ProfilePresenter` (TypeScript puro,
// unit-testado). Es una pantalla DELGADA: no contiene lógica sensible; solo
// enlaza el presentador a React y pinta el estado con el kit de UI del mockup.
//
// Edición de perfil:
//   - Nombre y alias se guardan vía `PATCH /me` (ProfilePresenter.updateProfile).
//   - El correo es un dato de Supabase Auth (no del backend): se cambia con
//     `onCambiarCorreo` (envuelve `supabase.auth.updateUser`) y REQUIERE que el
//     usuario confirme desde el email que Supabase le envía.
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO están
// instaladas; este `.tsx` está EXCLUIDO del typecheck de `app/tsconfig.json`. Es
// código real para cuando se instale el toolchain del cliente.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ProfilePresenter,
  añoDeTemporada,
  type EditState,
  type ProfileState,
} from '../profile';
import type { ProfileClient } from '../adapters';
import { Crest, DangerButton, Hero, PrimaryButton, SecondaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface PerfilScreenProps {
  /** Cliente de perfil (`GET /me`). */
  readonly client: ProfileClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: ProfilePresenter;
  /** Navega a Ajustes (privacidad, cerrar sesión, borrar cuenta). */
  readonly onAjustes?: () => void;
  /** Navega a la selección/cambio de club. */
  readonly onCambiarClub?: () => void;
  /** Cierra la sesión del usuario (logout de Supabase) de forma directa. */
  readonly onLogout?: () => void | Promise<void>;
  /**
   * Cambia el correo de la cuenta (Supabase Auth). Resuelve cuando Supabase
   * aceptó la solicitud; el cambio se confirma desde el email que el usuario
   * recibe. Rechaza con un `Error` legible si el correo es inválido/duplicado.
   */
  readonly onCambiarCorreo?: (email: string) => Promise<void>;
}

/** Fila etiqueta/valor del perfil. */
function Fila({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaLabel}>{label}</Text>
      <Text style={styles.filaValue}>{value}</Text>
    </View>
  );
}

/**
 * Pantalla de perfil. Carga `GET /me` al montar (no bloqueante) y muestra el
 * club, la temporada activa y los datos del usuario. Permite editar nombre,
 * alias y correo desde un modal.
 */
export function PerfilScreen({
  client,
  presenter,
  onAjustes,
  onCambiarClub,
  onLogout,
  onCambiarCorreo,
}: PerfilScreenProps): React.ReactElement {
  const pres = useMemo(() => presenter ?? new ProfilePresenter(client), [presenter, client]);
  const [state, setState] = useState<ProfileState>(() => pres.getProfileState());
  const [editState, setEditState] = useState<EditState>(() => pres.getEditState());
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = pres.subscribeProfile(setState);
    const unsubscribeEdit = pres.subscribeEdit(setEditState);
    // Solo dispara la carga si aún está `idle`. El presentador es COMPARTIDO con
    // el OnboardingGate; re-lanzar `loadProfile` cuando ya está cargado lo pondría
    // en `loading` y el gate ocultaría las pestañas (bucle de parpadeo).
    if (pres.getProfileState().status === 'idle') {
      void pres.loadProfile();
    }
    return () => {
      unsubscribe();
      unsubscribeEdit();
    };
  }, [pres]);

  const perfil = state.perfil;
  const club = perfil?.club ?? null;
  const temporada = perfil?.temporadaActiva ?? null;

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Perfil" title={club?.nombre ?? 'Tu perfil'}>
        {state.status === 'loading' ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Cargando perfil"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Club actual */}
        <View style={styles.clubRow}>
          <Crest
            url={club?.escudoUrl}
            monogram={(club?.nombre ?? 'CLB').slice(0, 3).toUpperCase()}
            size={56}
          />
          <View style={styles.clubInfo}>
            <Text style={styles.clubNombre}>
              {perfil?.usuario.nombre ?? club?.nombre ?? 'Tu perfil'}
            </Text>
            <Text style={styles.clubSub}>
              {perfil?.usuario.alias
                ? `@${perfil.usuario.alias}`
                : perfil?.usuario.email ?? '—'}
            </Text>
          </View>
        </View>

        {/* Datos del usuario y temporada */}
        <View style={styles.card}>
          <Fila label="Nombre" value={perfil?.usuario.nombre ?? '—'} />
          <Fila label="Alias" value={perfil?.usuario.alias ?? '—'} />
          <Fila label="Correo" value={perfil?.usuario.email ?? '—'} />
          <Fila label="Club" value={club?.nombre ?? 'Sin club seleccionado'} />
          <Fila
            label="Temporada"
            value={temporada ? añoDeTemporada(temporada.temporadaExterna) : 'Sin temporada activa'}
          />
        </View>

        {/* Error no bloqueante con reintento */}
        {state.status === 'error' && state.error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar cargar el perfil"
              onPress={() => {
                void pres.loadProfile();
              }}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Acción principal: editar datos */}
        <PrimaryButton
          title="Editar datos"
          onPress={() => {
            pres.resetEdit();
            setModalVisible(true);
          }}
          disabled={perfil === null}
          style={styles.accion}
        />

        <SecondaryButton
          title="Cambiar de club"
          tone="dark"
          onPress={onCambiarClub}
          style={styles.accion}
        />
        <SecondaryButton
          title="Ajustes y privacidad"
          tone="dark"
          onPress={onAjustes}
          style={styles.accion}
        />
        {onLogout ? (
          <DangerButton
            title="Cerrar sesión"
            onPress={() => {
              Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Cerrar sesión',
                  style: 'destructive',
                  onPress: () => {
                    void onLogout();
                  },
                },
              ]);
            }}
            style={styles.accion}
          />
        ) : null}
      </ScrollView>

      {perfil ? (
        <EditarPerfilModal
          visible={modalVisible}
          nombreActual={perfil.usuario.nombre ?? ''}
          aliasActual={perfil.usuario.alias ?? ''}
          correoActual={perfil.usuario.email}
          editState={editState}
          onGuardarDatos={(nombre, alias) => pres.updateProfile({ nombre, alias })}
          onCambiarCorreo={onCambiarCorreo}
          onClose={() => {
            pres.resetEdit();
            setModalVisible(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

interface EditarPerfilModalProps {
  readonly visible: boolean;
  readonly nombreActual: string;
  readonly aliasActual: string;
  readonly correoActual: string;
  readonly editState: EditState;
  /** Guarda nombre/alias vía PATCH /me. Devuelve `true` si tuvo éxito. */
  readonly onGuardarDatos: (nombre: string, alias: string) => Promise<boolean>;
  /** Cambia el correo (Supabase Auth), o `undefined` si no está disponible. */
  readonly onCambiarCorreo?: (email: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * Modal de edición de datos del perfil. Nombre y alias se guardan juntos vía
 * `PATCH /me`; el correo se cambia por separado contra Supabase Auth (con aviso
 * de confirmación por email). Colores explícitos con contraste AA.
 */
function EditarPerfilModal({
  visible,
  nombreActual,
  aliasActual,
  correoActual,
  editState,
  onGuardarDatos,
  onCambiarCorreo,
  onClose,
}: EditarPerfilModalProps): React.ReactElement {
  const [nombre, setNombre] = useState(nombreActual);
  const [alias, setAlias] = useState(aliasActual);
  const [correo, setCorreo] = useState(correoActual);
  const [correoBusy, setCorreoBusy] = useState(false);

  // Al (re)abrir el modal, re-sincroniza los campos con los valores actuales.
  useEffect(() => {
    if (visible) {
      setNombre(nombreActual);
      setAlias(aliasActual);
      setCorreo(correoActual);
    }
  }, [visible, nombreActual, aliasActual, correoActual]);

  const guardando = editState.status === 'saving';

  const guardarDatos = async (): Promise<void> => {
    const ok = await onGuardarDatos(nombre.trim(), alias.trim());
    if (ok) {
      onClose();
    }
  };

  const cambiarCorreo = async (): Promise<void> => {
    if (!onCambiarCorreo) {
      return;
    }
    const nuevo = correo.trim().toLowerCase();
    if (nuevo === correoActual.trim().toLowerCase()) {
      Alert.alert('Correo', 'Ese ya es tu correo actual.');
      return;
    }
    setCorreoBusy(true);
    try {
      await onCambiarCorreo(nuevo);
      Alert.alert(
        'Revisa tu correo',
        'Te enviamos un enlace para confirmar el cambio. El correo nuevo se activará cuando lo confirmes.',
      );
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo cambiar el correo.';
      Alert.alert('No se pudo cambiar el correo', mensaje);
    } finally {
      setCorreoBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Editar datos</Text>

          <Text style={styles.inputLabel}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            placeholderTextColor={palette.textMutedOnDark}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Nombre"
          />

          <Text style={styles.inputLabel}>Alias</Text>
          <TextInput
            style={styles.input}
            value={alias}
            onChangeText={setAlias}
            placeholder="Tu alias"
            placeholderTextColor={palette.textMutedOnDark}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Alias"
          />

          {editState.status === 'error' && editState.error ? (
            <Text style={styles.modalError}>{editState.error}</Text>
          ) : null}

          <PrimaryButton
            title={guardando ? 'Guardando…' : 'Guardar nombre y alias'}
            onPress={() => {
              void guardarDatos();
            }}
            disabled={guardando}
            style={styles.modalAccion}
          />

          <View style={styles.modalDivider} />

          <Text style={styles.inputLabel}>Correo</Text>
          <TextInput
            style={styles.input}
            value={correo}
            onChangeText={setCorreo}
            placeholder="tu@correo.com"
            placeholderTextColor={palette.textMutedOnDark}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={onCambiarCorreo != null && !correoBusy}
            accessibilityLabel="Correo"
          />
          {onCambiarCorreo ? (
            <>
              <Text style={styles.inputHint}>
                Cambiar el correo requiere confirmarlo desde el enlace que te enviaremos.
              </Text>
              <SecondaryButton
                title={correoBusy ? 'Enviando…' : 'Cambiar correo'}
                tone="dark"
                onPress={() => {
                  void cambiarCorreo();
                }}
                disabled={correoBusy}
                style={styles.modalAccion}
              />
            </>
          ) : (
            <Text style={styles.inputHint}>La edición de correo no está disponible.</Text>
          )}

          <SecondaryButton
            title="Cerrar"
            tone="dark"
            onPress={onClose}
            disabled={guardando || correoBusy}
            style={styles.modalAccion}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { padding: spacing.lg },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  clubInfo: { flex: 1 },
  clubNombre: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  clubSub: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: 2 },
  card: {
    backgroundColor: palette.glassFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderOnDark,
  },
  filaLabel: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small },
  filaValue: { color: palette.textOnDark, fontFamily: fonts.body, fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  errorBox: { marginBottom: spacing.md },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  accion: { marginTop: spacing.sm },

  // --- Modal de edición ---
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000B3',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: palette.inkSoft,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  inputLabel: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  inputHint: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  input: {
    color: palette.textOnDark,
    backgroundColor: palette.glassFill,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalError: {
    color: palette.danger,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: spacing.sm,
  },
  modalDivider: {
    height: 1,
    backgroundColor: palette.borderOnDark,
    marginVertical: spacing.md,
  },
  modalAccion: { marginTop: spacing.sm },
});

export default PerfilScreen;
