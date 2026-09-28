// Pantalla de Ajustes — cuenta, permisos, plan, privacidad y cuenta (React Native).
//
// Rediseño según el prototipo (public/mockups/prototipo.html · pantalla #17
// "Ajustes y privacidad"): filas con icono + etiqueta y, según el caso, un
// toggle (permisos) o un chevron (navegación/acción). Se cablea SOLO lo que el
// backend/entorno expone de verdad; lo que no está disponible se muestra
// deshabilitado con la etiqueta "No disponible" (preferencia del proyecto: no
// fingir funcionalidad).
//
// Mapeo de filas → disponibilidad real:
//   👤 Cuenta               → navega a Perfil (edición de datos vive allí).      REAL
//   📷 Permiso de cámara     → PermissionGate(Permiso.CAMARA).                    REAL
//   📍 Geolocalización       → PermissionGate(Permiso.GEOLOCALIZACION).          REAL
//   🔔 Notificaciones push   → backend en desarrollo (§7).                        NO DISP.
//   ✦ Plan                   → GET /me/entitlements (solo lectura; sin compra).   LECTURA
//   🔒 Privacidad (GDPR)     → el derecho al olvido se ejerce con el borrado.    INFO
//   ↩︎ Cerrar sesión         → AuthSessionPresenter.logout (Req 22.6).           REAL
//   🗑️ Eliminar cuenta       → AuthSessionPresenter.deleteAccount (Req 22.7/8).  REAL
//
// Pantalla DELGADA: delega la sesión en `AuthSessionPresenter` y los permisos en
// `PermissionGate`; no reimplementa reglas. Excluida del typecheck de
// `app/tsconfig.json` (RN no instalado en este entorno).

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { AuthSessionPresenter } from '../session';
import type { PermissionGate } from '../permissions';
import { Permiso } from '../permissions';
import type { Entitlements } from '../subscription';
import { Hero, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface AjustesScreenProps {
  /** Presenter de sesión inyectado por la navegación/composición raíz. */
  readonly presenter: AuthSessionPresenter;
  /**
   * Callback de navegación al login. La navegación lo enlaza para redirigir tras
   * logout o tras un borrado de cuenta confirmado (Req 22.6/22.8). Como respaldo,
   * el presenter también emite `onSessionChange('unauthenticated')`.
   */
  readonly onRedirectToLogin?: () => void;
  /** Navega al Perfil (fila "Cuenta"), donde se editan los datos del usuario. */
  readonly onCuenta?: () => void;
  /** Puerta de permisos del dispositivo (cámara/geolocalización). */
  readonly permissionGate?: PermissionGate;
  /** Lee los derechos del plan (`GET /me/entitlements`) para mostrar el plan. */
  readonly getEntitlements?: () => Promise<Entitlements>;
}

/** Fila de ajustes: icono + etiqueta + control a la derecha (toggle o chevron). */
function SettingRow({
  icon,
  label,
  sublabel,
  right,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const contenido = (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger ? styles.rowLabelDanger : null]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
      {right}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.rowPressable, pressed ? styles.rowPressed : null]}
      >
        {contenido}
      </Pressable>
    );
  }
  return <View style={styles.rowPressable}>{contenido}</View>;
}

/** Chevron ">" para filas navegables. */
function Chevron(): React.ReactElement {
  return <Text style={styles.chevron}>›</Text>;
}

/** Etiqueta "No disponible" para filas cuya función el backend no expone. */
function NoDispTag(): React.ReactElement {
  return <Text style={styles.noDispTag}>No disponible</Text>;
}

/**
 * Ajustes de cuenta, permisos, plan y privacidad. Cablea lo real (permisos de
 * cámara/geo, plan de solo lectura, logout y borrado) y marca lo no disponible.
 */
export function AjustesScreen({
  presenter,
  onRedirectToLogin,
  onCuenta,
  permissionGate,
  getEntitlements,
}: AjustesScreenProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  // Estado de los toggles de permisos (reflejan el estado real del gate).
  const [camaraOn, setCamaraOn] = useState<boolean>(
    () => permissionGate?.isConcedido(Permiso.CAMARA) ?? false,
  );
  const [geoOn, setGeoOn] = useState<boolean>(
    () => permissionGate?.isConcedido(Permiso.GEOLOCALIZACION) ?? false,
  );

  // Plan actual derivado de los entitlements (solo lectura; sin compra).
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [planError, setPlanError] = useState(false);

  useEffect(() => {
    let activo = true;
    if (getEntitlements) {
      getEntitlements()
        .then((e) => {
          if (activo) {
            setEntitlements(e);
          }
        })
        .catch(() => {
          if (activo) {
            setPlanError(true);
          }
        });
    }
    return () => {
      activo = false;
    };
  }, [getEntitlements]);

  const planLabel = ((): string => {
    if (planError) {
      return 'No se pudo cargar';
    }
    if (!entitlements) {
      return 'Cargando…';
    }
    // Premium habilita cards internacionales + holograma (docs §6/§gating).
    return entitlements.digitalCardsInternacional && entitlements.holograma
      ? 'Plan Premium'
      : 'Plan Básico';
  })();

  const togglePermiso = useCallback(
    async (
      permiso: Permiso,
      encendido: boolean,
      setLocal: (v: boolean) => void,
    ): Promise<void> => {
      if (!permissionGate) {
        return;
      }
      if (encendido) {
        // Solicita el permiso al SO (explica el motivo y muestra el prompt).
        const { concedido } = await permissionGate.ensure(permiso);
        setLocal(concedido);
        if (!concedido) {
          Alert.alert(
            'Permiso no concedido',
            'Puedes habilitarlo más tarde desde los ajustes del sistema si lo denegaste.',
          );
        }
      } else {
        // Revoca localmente el permiso: la app deja de usar el recurso (Req 24.4).
        permissionGate.revoke(permiso);
        setLocal(false);
      }
    },
    [permissionGate],
  );

  const onLogout = useCallback(() => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void presenter
            .logout() // Invalida el refresh y purga tokens (Req 22.6).
            .catch(() => undefined)
            .finally(() => {
              setBusy(false);
              onRedirectToLogin?.();
            });
        },
      },
    ]);
  }, [presenter, onRedirectToLogin]);

  const confirmDelete = useCallback(async () => {
    setBusy(true);
    try {
      // Confirmación explícita del usuario (Req 22.7) → borrado permanente (Req 22.8).
      const result = await presenter.deleteAccount({ confirmed: true });
      if (result.outcome === 'account-deleted' && result.redirectToLogin) {
        onRedirectToLogin?.();
      }
    } catch {
      Alert.alert('Borrado de cuenta', 'No se pudo borrar la cuenta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [presenter, onRedirectToLogin]);

  const onDeletePress = useCallback(() => {
    // Confirmación explícita de que el borrado es PERMANENTE (Req 22.7).
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente e irreversible. Se eliminarán tu cuenta, fotos, momentos y datos personales (solo se conserva el mínimo fiscal de los pedidos). ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar permanentemente',
          style: 'destructive',
          onPress: () => {
            void confirmDelete();
          },
        },
      ],
      { cancelable: true },
    );
  }, [confirmDelete]);

  const trackColor = { false: palette.borderOnDark, true: palette.accent };

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Preferencias" title="Ajustes" />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          {/* Cuenta → Perfil */}
          <SettingRow
            icon="👤"
            label="Cuenta"
            sublabel="Nombre, alias y correo"
            right={<Chevron />}
            onPress={onCuenta}
            disabled={!onCuenta}
          />

          {/* Permiso de cámara (real) */}
          <SettingRow
            icon="📷"
            label="Permiso de cámara"
            sublabel={permissionGate ? undefined : 'No disponible'}
            right={
              <Switch
                value={camaraOn}
                onValueChange={(v) => {
                  void togglePermiso(Permiso.CAMARA, v, setCamaraOn);
                }}
                disabled={!permissionGate}
                trackColor={trackColor}
                thumbColor={palette.textOnDark}
                accessibilityLabel="Permiso de cámara"
              />
            }
          />

          {/* Geolocalización (real) */}
          <SettingRow
            icon="📍"
            label="Geolocalización"
            sublabel={permissionGate ? 'Para verificar asistencia En Vivo' : 'No disponible'}
            right={
              <Switch
                value={geoOn}
                onValueChange={(v) => {
                  void togglePermiso(Permiso.GEOLOCALIZACION, v, setGeoOn);
                }}
                disabled={!permissionGate}
                trackColor={trackColor}
                thumbColor={palette.textOnDark}
                accessibilityLabel="Geolocalización"
              />
            }
          />

          {/* Notificaciones push (no disponible: backend en desarrollo) */}
          <SettingRow
            icon="🔔"
            label="Notificaciones push"
            right={
              <Switch
                value={false}
                disabled
                trackColor={trackColor}
                thumbColor={palette.textMutedOnDark}
                accessibilityLabel="Notificaciones push (no disponible)"
              />
            }
          />

          {/* Plan (solo lectura de entitlements; sin compra) */}
          <SettingRow
            icon="✦"
            label="Plan"
            sublabel={planLabel}
            right={<NoDispTag />}
          />

          {/* Privacidad (GDPR/CCPA): el olvido se ejerce con el borrado */}
          <SettingRow
            icon="🔒"
            label="Privacidad (GDPR/CCPA)"
            sublabel="El derecho al olvido se ejerce eliminando la cuenta"
          />

          {/* Cerrar sesión (real) */}
          <SettingRow
            icon="↩︎"
            label="Cerrar sesión"
            right={<Chevron />}
            onPress={onLogout}
            disabled={busy}
          />

          {/* Eliminar cuenta (real, danger) */}
          <SettingRow
            icon="🗑️"
            label="Eliminar cuenta (permanente)"
            right={<Chevron />}
            onPress={onDeletePress}
            danger
            disabled={busy}
          />
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Eliminar la cuenta borra fotos, momentos y datos personales; solo se conserva el
            mínimo fiscal de los pedidos.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg },
  card: {
    backgroundColor: palette.glassFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    overflow: 'hidden',
  },
  rowPressable: {
    borderBottomWidth: 1,
    borderBottomColor: palette.borderOnDark,
  },
  rowPressed: { backgroundColor: palette.glassFillSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  rowText: { flex: 1 },
  rowLabel: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  rowLabelDanger: { color: palette.danger },
  rowSub: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: 2,
  },
  chevron: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  noDispTag: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  note: { marginTop: spacing.md },
  noteText: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    lineHeight: 20,
    backgroundColor: palette.glassFillSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});

export default AjustesScreen;
