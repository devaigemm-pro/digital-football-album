// Pantalla de Ajustes: cerrar sesión y borrar cuenta con confirmación explícita
// (React Native).
//
// Task 26.1 — Requirements: 22.6 (logout)
// Task 26.2 — Requirements: 22.7, 22.8 (borrado de cuenta con confirmación)
// (requirements.md · "Requerimiento 22": BEFORE invocar DELETE /cuenta, solicitar
//  una confirmación explícita del usuario que indique que el borrado es permanente;
//  WHEN el usuario confirma, invocar DELETE /cuenta, eliminar tokens y redirigir
//  al login.)
//
// Pantalla DELGADA: delega TODO en el presenter puro `AuthSessionPresenter`. La
// confirmación se materializa con un diálogo nativo (`Alert`) cuyo botón
// destructivo llama a `deleteAccount({ confirmed: true })`. Sin ese tap, el
// presenter devuelve 'confirmation-required' y NO se contacta el backend.
// Excluido del typecheck de `app/tsconfig.json` (RN no instalado en este entorno).

import React, { useCallback, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

import type { AuthSessionPresenter } from '../session';

export interface AjustesScreenProps {
  /** Presenter de sesión inyectado por la navegación/composición raíz. */
  readonly presenter: AuthSessionPresenter;
  /**
   * Callback de navegación al login. La navegación lo enlaza para redirigir tras
   * logout o tras un borrado de cuenta confirmado (Req 22.6/22.8). Como respaldo,
   * el presenter también emite `onSessionChange('unauthenticated')`.
   */
  readonly onRedirectToLogin?: () => void;
}

/**
 * Ajustes de cuenta: botón de cerrar sesión y botón de borrado permanente con
 * confirmación explícita en dos pasos (diálogo destructivo).
 */
export function AjustesScreen({
  presenter,
  onRedirectToLogin,
}: AjustesScreenProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const onLogout = useCallback(async () => {
    setBusy(true);
    try {
      await presenter.logout(); // Invalida el refresh y purga tokens (Req 22.6).
      onRedirectToLogin?.();
    } catch {
      // El presenter purga los tokens locales aunque falle el backend; igual
      // redirigimos al login para no dejar al usuario en un estado ambiguo.
      onRedirectToLogin?.();
    } finally {
      setBusy(false);
    }
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
      Alert.alert(
        'Borrado de cuenta',
        'No se pudo borrar la cuenta. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }, [presenter, onRedirectToLogin]);

  const onDeletePress = useCallback(() => {
    // Confirmación explícita de que el borrado es PERMANENTE (Req 22.7).
    Alert.alert(
      'Borrar cuenta',
      'Esta acción es permanente e irreversible. Se eliminarán tu cuenta y tus datos. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar permanentemente',
          style: 'destructive',
          onPress: () => {
            void confirmDelete();
          },
        },
      ],
      { cancelable: true },
    );
  }, [confirmDelete]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ajustes</Text>

      <Button title="Cerrar sesión" onPress={onLogout} disabled={busy} />

      <View style={styles.divider} />

      <Text style={styles.dangerLabel}>Zona de peligro</Text>
      <Button
        title="Borrar cuenta"
        color="#c0392b"
        onPress={onDeletePress}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 24 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 24 },
  dangerLabel: { fontSize: 14, color: '#c0392b', marginBottom: 8 },
});
