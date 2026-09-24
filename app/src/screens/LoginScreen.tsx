// Pantalla de login/registro multiproveedor (React Native).
//
// Task 26.1 — Requirements: 22.1, 22.2, 22.6
// (requirements.md · "Requerimiento 22": inicio de sesión y registro mediante
//  Apple ID, cuenta de Google y correo electrónico contra el Servicio_Autenticación.)
//
// Pantalla DELGADA: no contiene lógica de negocio. Delega TODO en el presenter
// puro `AuthSessionPresenter` (app/src/session/auth-session.ts), que es lo que
// se prueba unitariamente. Este `.tsx` está excluido del typecheck de
// `app/tsconfig.json` (React Native no está instalado en este entorno) y es
// código real para cuando se instalen las dependencias del cliente.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AuthenticationError,
  type AuthCredential,
  type AuthProvider,
  type AuthSessionPresenter,
} from '../session';
// Adaptadores NATIVOS de autenticación (Apple/Google). Se importan directamente
// aquí porque este `.tsx` está EXCLUIDO del typecheck de `app/tsconfig.json` y
// se compila con Metro; obtienen el `identityToken`/`idToken` real que el
// backend valida (Req 22.1) antes de delegar en el presenter.
import {
  signInWithApple,
  signInWithGoogle,
} from '../adapters/native';

export interface LoginScreenProps {
  /** Presenter de sesión inyectado por la navegación/composición raíz. */
  readonly presenter: AuthSessionPresenter;
  /** Modo inicial: iniciar sesión o registrarse (por defecto login). */
  readonly initialMode?: 'login' | 'register';
}

/**
 * Pantalla de autenticación con botones para Apple, Google y correo. Al éxito,
 * el presenter persiste el Refresh_Token y marca la sesión autenticada; la
 * navegación reacciona vía `onSessionChange` (Req 22.2).
 */
export function LoginScreen({
  presenter,
  initialMode = 'login',
}: LoginScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const authenticate = useCallback(
    async (credential: AuthCredential) => {
      setBusy(true);
      try {
        if (mode === 'register') {
          await presenter.register(credential);
        } else {
          await presenter.login(credential);
        }
      } catch (error) {
        // Mensaje descriptivo ante credenciales inválidas o error de red (Req 22.3).
        const message =
          error instanceof AuthenticationError
            ? error.message
            : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
        Alert.alert('Autenticación', message);
      } finally {
        setBusy(false);
      }
    },
    [mode, presenter],
  );

  const onProvider = useCallback(
    (provider: Exclude<AuthProvider, 'email'>) => {
      void (async () => {
        setBusy(true);
        let identityToken: string;
        try {
          // Obtiene el token real del SDK nativo del proveedor (Req 22.1).
          identityToken =
            provider === 'apple'
              ? await signInWithApple()
              : await signInWithGoogle();
        } catch (error) {
          // Cancelación del usuario: no es un error, no se hace nada. Los
          // adaptadores nativos lanzan con un mensaje que menciona "cancel".
          const message = error instanceof Error ? error.message : '';
          if (/cancel/i.test(message)) {
            setBusy(false);
            return;
          }
          // Cualquier otro fallo del SDK nativo se muestra por la vía habitual.
          Alert.alert(
            'Autenticación',
            message || 'No se pudo iniciar sesión. Inténtalo de nuevo.',
          );
          setBusy(false);
          return;
        }
        setBusy(false);
        // Con el token real, se delega en el presenter (que gestiona su propio
        // estado `busy` y la traducción de errores del backend).
        await authenticate({ provider, identityToken });
      })();
    },
    [authenticate],
  );

  const onEmail = useCallback(() => {
    void authenticate({ provider: 'email', email, password });
  }, [authenticate, email, password]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
      </Text>

      <Button
        title="Continuar con Apple"
        onPress={() => onProvider('apple')}
        disabled={busy}
      />
      <View style={styles.spacer} />
      <Button
        title="Continuar con Google"
        onPress={() => onProvider('google')}
        disabled={busy}
      />

      <View style={styles.divider} />

      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
        accessibilityLabel="Correo electrónico"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        accessibilityLabel="Contraseña"
      />
      <Button
        title={mode === 'register' ? 'Registrarse' : 'Entrar'}
        onPress={onEmail}
        disabled={busy}
      />

      <View style={styles.spacer} />
      <Button
        title={
          mode === 'register'
            ? '¿Ya tienes cuenta? Inicia sesión'
            : '¿Nuevo? Crea una cuenta'
        }
        onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
        disabled={busy}
      />

      {busy ? <ActivityIndicator style={styles.spacer} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 24 },
  spacer: { height: 12 },
});
