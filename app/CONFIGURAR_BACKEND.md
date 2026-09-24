# Conectar la app al backend (API_BASE_URL)

La app está compilada, pero apunta a un placeholder (`https://api.example.com`).
Cuando el backend esté desplegado, sigue estos pasos para conectarla.

## 1. Obtén la URL del backend

El backend se despliega en **Supabase**. La URL base es la del proyecto:

- Supabase Dashboard → **Project Settings → API → Project URL**
- Tendrá la forma: `https://<TU-PROYECTO>.supabase.co`
- Si usas Edge Functions, la base podría ser
  `https://<TU-PROYECTO>.supabase.co/functions/v1`

> Debe ser **https://** (la app rechaza transporte no cifrado; se valida al
> arrancar en `src/config/env.ts`).

## 2. Pon la URL en el `.env` correcto

- Para **release/producción**: edita `app/.env.production`
- Para **desarrollo**: edita `app/.env.development`

Cambia solo esta línea:

```env
API_BASE_URL=https://TU-PROYECTO.supabase.co
```

(Opcional) rellena también `GOOGLE_WEB_CLIENT_ID` (login con Google) e
`IOS_URL_SCHEME` (Google Sign-In en iOS) si los vas a usar.

## 3. Recompila

El valor se "hornea" en el binario al compilar, así que hay que reconstruir:

```bash
cd app/android

# Requiere JDK 17 + Android SDK (ver README, sección Build)
export JAVA_HOME="$HOME/.local/jdk17"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

./gradlew assembleRelease     # APK release  -> app/build/outputs/apk/release/
./gradlew bundleRelease       # AAB (Play)   -> app/build/outputs/bundle/release/
# o ./gradlew assembleDebug   # usa .env.development
```

## 4. Verifica

Instala el APK y prueba el login / la carga del álbum. Si las llamadas siguen
fallando, revisa:

- que la URL sea exactamente la del proyecto (sin barra final, sin `http://`);
- que el backend en Supabase esté accesible públicamente por https;
- que CORS / políticas del backend permitan al cliente móvil.

## Cómo funciona por dentro (referencia)

- `src/config/env.ts` — función pura `resolveConfig()` que valida la URL (TLS).
- `src/config/index.tsx` — lee `react-native-config` y expone `appConfig`.
- `App.tsx` — construye el `HttpClient` con `appConfig.apiBaseUrl`.

Ningún otro archivo lee la URL directamente: cambiar el `.env` y recompilar es
todo lo necesario.
