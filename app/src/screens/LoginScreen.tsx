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
  Pressable,
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
import { Hero, PrimaryButton, SecondaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';
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
  /**
   * Si es `true`, oculta los botones sociales (Apple/Google) y deja SOLO el
   * flujo de correo/contraseña. Para la build de prod-test con Supabase Auth,
   * el flujo documentado (docs/FRONTEND_INTEGRATION.md §2) es email/password;
   * el login social necesitaría configuración extra en Supabase/OAuth. Por
   * defecto `true` (solo email/password).
   */
  readonly emailOnly?: boolean;
}

/**
 * Pantalla de autenticación con botones para Apple, Google y correo. Al éxito,
 * el presenter persiste el Refresh_Token y marca la sesión autenticada; la
 * navegación reacciona vía `onSessionChange` (Req 22.2).
 */
export function LoginScreen({
  presenter,
  initialMode = 'login',
  emailOnly = true,
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
    // Normaliza el correo (sin espacios ni mayúsculas accidentales del teclado);
    // la contraseña se envía tal cual (distingue mayúsculas).
    const emailNorm = email.trim().toLowerCase();
    void authenticate({ provider: 'email', email: emailNorm, password });
  }, [authenticate, email, password]);

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Álbum del hincha" title={mode === 'register' ? 'Crea tu cuenta' : 'Inicia sesión'} />

      <View style={styles.body}>
        {/* Botones sociales ocultos en la build de prod-test (email/password
            únicamente). Se conservan detrás de `emailOnly=false` para cuando se
            configure el login social contra Supabase/OAuth. */}
        {emailOnly ? null : (
          <>
            <SecondaryButton
              title="Continuar con Apple"
              tone="light"
              onPress={() => onProvider('apple')}
              disabled={busy}
              style={styles.spacer}
            />
            <SecondaryButton
              title="Continuar con Google"
              tone="light"
              onPress={() => onProvider('google')}
              disabled={busy}
              style={styles.spacer}
            />
            <View style={styles.divider} />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
          placeholderTextColor={palette.textMutedOnLight}
          accessibilityLabel="Correo electrónico"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          placeholderTextColor={palette.textMutedOnLight}
          accessibilityLabel="Contraseña"
        />

        <PrimaryButton
          title={mode === 'register' ? 'Registrarse' : 'Entrar'}
          onPress={onEmail}
          disabled={busy}
          style={styles.spacer}
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
          style={styles.switchMode}
        >
          <Text style={styles.switchModeText}>
            {mode === 'register'
              ? '¿Ya tienes cuenta? Inicia sesión'
              : '¿Nuevo? Crea una cuenta'}
          </Text>
        </Pressable>

        {busy ? <ActivityIndicator color={palette.accent} style={styles.spacer} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Colores EXPLÍCITOS (no dependientes del tema claro/oscuro del SO) para
  // garantizar contraste legible (WCAG AA >= 4.5:1) sobre el fondo definido.
  body: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    color: palette.textOnLight, // texto que escribe el usuario, legible sobre blanco
    backgroundColor: palette.surface,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
  },
  divider: { height: 1, backgroundColor: palette.borderOnLight, marginVertical: spacing.xl },
  spacer: { marginTop: spacing.md },
  switchMode: { marginTop: spacing.lg, alignItems: 'center' },
  switchModeText: {
    color: palette.accent,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
});
