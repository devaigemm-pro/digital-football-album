# App_Móvil — Cliente React Native + TypeScript

Cliente delgado del **Álbum de Fútbol Digital** (React Native + TypeScript). Consume el
backend por HTTP a través del API_Gateway y **reutiliza los view-models
framework-agnósticos** del repositorio (`src/app`) sin reimplementarlos. Toda la
lógica de negocio sensible a la corrección (biyección Recuadro↔Sticker, gating,
DPI, biunivocidad, cierre de Temporada) vive en el backend.

Ver el diseño en
`.kiro/specs/digital-football-album/design.md` · sección
**"Arquitectura de la App_Móvil (cliente React Native)"** (Req 21–29).

## Alcance de esta tarea (Task 24)

Esta tarea **solo prepara la estructura y la configuración de tooling** del
proyecto cliente. **No** ejecuta instalación de dependencias, build nativo,
Metro ni pruebas e2e, porque este entorno no dispone del toolchain nativo
completo.

Lo que se ha dejado listo:

- `package.json` con las dependencias del cliente declaradas (versiones fijadas):
  React Native, React Navigation (stack + tabs), `@tanstack/react-query`,
  `react-native-keychain`, y devDependencies de tooling (Jest,
  `@testing-library/react-native`, Detox, ESLint, TypeScript, Babel presets).
  **No se ha corrido `npm install`.**
- `tsconfig.json` (independiente del backend; `moduleResolution: bundler`,
  `jsx: react-native`).
- `jest.config.js` (preset `react-native` + React Native Testing Library).
- `.detoxrc.js` y `e2e/jest.config.js` (config e2e para simulador iOS 15+ y
  emulador Android 8.0+ / API 26+). Config únicamente; no se ejecuta.
- `metro.config.js`, `babel.config.js`, `app.json`, `index.js` (placeholders).
- `.eslintrc.js` / `.prettierrc.js` propios del cliente (`root: true`, no heredan
  del ESLint del backend).
- Estructura de carpetas con barrels: `src/screens`, `src/navigation`,
  `src/theme`, `src/net`, `src/adapters`, `src/viewmodels`, `src/storage`.

## Reutilización de view-models

`src/viewmodels/index.ts` **re-exporta** los view-models framework-agnósticos que
ya existen en el repositorio en `src/app` (son TypeScript puro, sin dependencias
de React Native):

- `ClubThemeViewModel`, `mapIdentidadVisualToTheme` (+ tipos `ClubTheme`,
  `ThemeListener`)
- `CaptureViewModel` (+ tipos `CaptureMomentInput`, `CaptureMomentResult`)
- `ShareViewModel`, `SHARE_PLATFORMS`, `PlataformaNoSoportadaError` (+ tipos
  `NativeShareBridge`, `SharePlatform`)
- Contratos de cliente del backend: `ClubClient`, `CaptureClient`, `CardsClient`,
  `DigitalCard`, `IdentidadVisual`, `UploadFotoInput`, `MomentoContextoInput`,
  `FuenteFoto`

Ruta de re-export desde `app/src/viewmodels/`: `../../../src/app` (el barrel
`src/app/index.ts` en la raíz del repositorio). No se copian ni reimplementan.

## Prerrequisitos para compilar/ejecutar de verdad

Este scaffold NO se puede compilar/ejecutar sin instalar el toolchain de React
Native. Para levantarlo en una máquina de desarrollo:

1. Node 18+ y `npm install` **dentro de `app/`**.
2. **Watchman** (recomendado por Metro):
   `brew install watchman`.
3. **iOS**: Xcode + simuladores iOS (15+), **CocoaPods**
   (`sudo gem install cocoapods`) y `pod install` en `ios/`.
   Detox además requiere `applesimutils` (`brew tap wix/brew && brew install applesimutils`).
4. **Android**: Android SDK + Platform Tools (`adb`), un emulador (AVD, API 26+)
   y JDK.
5. Generar los proyectos nativos (`ios/`, `android/`) con la CLI de React Native
   (p. ej. `npx @react-native-community/cli init` sobre esta base, o añadiéndolos
   manualmente), ya que aquí solo se ha dejado la capa TypeScript y la config.

## Comandos (una vez instalado el toolchain)

```bash
npm install          # instala dependencias del cliente (en app/)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . --ext .ts,.tsx
npm test             # jest (unit + React Native Testing Library)

# iOS (simulador)
npm run ios
npm run e2e:build:ios && npm run e2e:test:ios

# Android (emulador API 26+)
npm run android
npm run e2e:build:android && npm run e2e:test:android
```

> Nota: `npm install`, el build nativo, Metro y las pruebas e2e de Detox
> requieren el toolchain descrito arriba y quedan **fuera del alcance de este
> entorno**.

## Configuración por entorno (react-native-config)

La configuración por entorno se resuelve con
[`react-native-config`](https://github.com/lugg/react-native-config) y una capa
pura y validada:

- `src/config/env.ts` (**TypeScript puro**, typechea con `tsc`): define
  `AppConfig` y la función pura `resolveConfig(raw)`, que valida que
  `API_BASE_URL` viaje sobre **TLS (`https://`)** (Req 28.1) y aplica defaults.
- `src/config/index.tsx` (**nativo**): importa `Config` de `react-native-config`
  y exporta `appConfig = resolveConfig(Config)`.
- Archivos `.env`: copia `.env.example` a `.env`, `.env.development` y
  `.env.production` y rellena los valores. **No se versionan** (ver
  `.gitignore`); solo `.env.example` sí. Claves: `APP_ENV`, `API_BASE_URL`
  (obligatoria, https), `GOOGLE_WEB_CLIENT_ID`, `IOS_URL_SCHEME`.
- En Android, `android/app/build.gradle` aplica `dotenv.gradle` y selecciona el
  `.env` por variante mediante `project.ext.envConfigFiles` (release →
  `.env.production`, debug → `.env.development`).

## Adaptadores nativos (`src/adapters/native/`)

Implementaciones reales de los puertos puros, en `.tsx` (excluidos del typecheck;
compilan con Metro):

- `image-picker-capture-bridge.tsx` — `CaptureNativeBridge` con
  `react-native-image-picker`.
- `permissions-prompt.tsx` — `PermissionPrompt` con `react-native-permissions`.
- `share-port.tsx` — `NativeSharePort` con `react-native-share`.
- `push-port.tsx` — `NativePushPort` con `@react-native-firebase/messaging` +
  `@notifee/react-native`.
- `iap-purchaser.tsx` — `IapPurchaser` con `react-native-iap`.
- `apple-google-auth.tsx` — `signInWithApple()` / `signInWithGoogle()`.

Llama a `initNativeModules()` (barrel `src/adapters/native/index.tsx`) una vez al
arrancar la app para configurar Google Sign-In e iniciar la conexión de IAP.

## Build de producción (Android)

Pasos profesionales para generar un release firmado:

1. **Requisitos**: **JDK 17**, **Android SDK** (Platform 34 + build-tools) con
   `ANDROID_HOME`/`ANDROID_SDK_ROOT` exportados, y Node 18+.
2. **Configuración**: copia `.env.example` a `.env.production` y rellena
   `API_BASE_URL` (https), `GOOGLE_WEB_CLIENT_ID`, etc.
3. **Dependencias JS**: en `app/`, `npm install`.
4. **Gradle Wrapper**: ya está incluido (`android/gradlew`, `gradlew.bat` y
   `gradle/wrapper/gradle-wrapper.jar`, Gradle **8.8**). Verifícalo con
   `cd android && ./gradlew --version`. Si necesitaras regenerarlo, ejecuta
   `android/generate-wrapper.sh` (requiere `gradle` en el PATH).
5. **Keystore de release**: genera tu propio almacén de claves (una vez):

   ```bash
   keytool -genkeypair -v \
     -keystore release.keystore \
     -alias album-release \
     -keyalg RSA -keysize 2048 -validity 10000
   # Guarda release.keystore FUERA del control de versiones (p. ej. en android/app/).
   ```

6. **Credenciales de firma** en `~/.gradle/gradle.properties` (recomendado, para
   no versionarlas) o en `android/gradle.properties`:

   ```properties
   RELEASE_STORE_FILE=release.keystore
   RELEASE_KEY_ALIAS=album-release
   RELEASE_STORE_PASSWORD=********
   RELEASE_KEY_PASSWORD=********
   ```

   `android/app/build.gradle` usa `signingConfigs.release` cuando
   `RELEASE_STORE_FILE` está definido; en caso contrario cae al keystore de debug
   (solo para pruebas locales).

7. **Compilar**:

   ```bash
   cd android
   ./gradlew assembleRelease      # APK  -> app/build/outputs/apk/release/
   ./gradlew bundleRelease        # AAB  -> app/build/outputs/bundle/release/ (Play)
   ```

### Firebase (notificaciones push)

Las dependencias JS (`@react-native-firebase/app` y
`@react-native-firebase/messaging`) **ya están instaladas** y el toolchain de
Gradle está preparado (plugin `com.google.gms:google-services` y Firebase BoM
declarados). Para habilitar push falta únicamente añadir el archivo de
configuración de tu proyecto de Firebase:

1. Crea un proyecto en la [Firebase console](https://console.firebase.google.com/).
2. Dentro del proyecto, añade una **app Android** con el nombre de paquete
   `com.digitalfootballalbum`.
3. Descarga el `google-services.json` que genera la consola y colócalo en
   `app/android/app/google-services.json`. Usa
   `app/android/app/google-services.example.json` como referencia de la
   estructura esperada. El archivo real **no se versiona** (está en
   `.gitignore`); solo se versiona el `.example.json`.
4. **iOS**: añade una app iOS en el mismo proyecto de Firebase con el bundle id
   `com.digitalfootballalbum` y coloca su `GoogleService-Info.plist` en `app/ios/`
   (arrastrándolo al target en Xcode). El archivo está gitignored. Ver la sección
   **"Build de iOS"** más abajo.

El plugin `com.google.gms.google-services` se **aplica automáticamente** en
`android/app/build.gradle` solo cuando `google-services.json` está presente, de
modo que el proyecto compila igualmente antes de añadir tu configuración de
Firebase. Con el archivo presente quedan habilitados
`@react-native-firebase/app` y `@react-native-firebase/messaging` (Cloud
Messaging, push).

## Iconos del launcher (Android)

El icono del launcher usa **adaptive-icons definidos por XML** (sin PNG raster):

- `res/mipmap-anydpi-v26/ic_launcher.xml` y `ic_launcher_round.xml`
  (adaptive-icon, API 26+) componen dos capas vectoriales:
  `res/drawable/ic_launcher_background.xml` y `ic_launcher_foreground.xml`.
- `res/mipmap/ic_launcher.xml` y `ic_launcher_round.xml` son el **fallback**
  vectorial para API < 26, de modo que `@mipmap/ic_launcher(_round)` resuelva en
  todas las versiones y densidades y el build no falle por iconos raster
  faltantes.
- El color de fondo está en `res/values/ic_launcher_colors.xml`.

## Navegación (Task 27.2) — modelo puro vs. cableado `.tsx`

El grafo de pantallas se implementa en dos capas para poder verificarlo en este
entorno sin instalar `@react-navigation/*`:

- **Modelo agnóstico del framework** (`src/navigation/route-model.ts`,
  TypeScript puro): registro tipado de las 8 rutas (Login, Selección de Club,
  Home/Álbum, Captura, Detalle/Card, Suscripción, Envío/Pedido, Ajustes), su
  partición entre el stack de autenticación y el navegador de pestañas, los
  tipos de parámetros por ruta y la validación de objetivos de navegación. Es la
  única fuente de verdad del grafo y typechea con `tsc` + Jest sin dependencias
  nativas. Se exporta desde `src/navigation/index.ts`.
- **Cableado real de React Navigation** (`src/navigation/RootNavigator.tsx`,
  stack + tabs): monta las pantallas usando los tipos del modelo. Como importa
  React, React Native y `@react-navigation/*`, los archivos `.tsx` están
  **excluidos** del typecheck en `tsconfig.json` (`"src/**/*.tsx"`). Estos
  `.tsx` **typechean y se ejecutan una vez instaladas las dependencias del
  cliente** (`npm install` en `app/`); hasta entonces solo el modelo `.ts` se
  valida aquí.

## Tema del Club (Task 27.1) — controlador puro vs. provider `.tsx`

El provider de Tema_Club sigue el mismo patrón de dos capas que la navegación,
para poder verificar la lógica en este entorno sin instalar React/React Native:

- **Núcleo agnóstico del framework** (`src/theme/club-theme-controller.ts`,
  TypeScript puro): `ClubThemeController` envuelve el `ClubThemeViewModel`
  reutilizado de `src/app`, expone el `ClubTheme | null` actual con una API
  `getState`/`subscribe`, invoca `PUT /usuario/club` al seleccionar Club (vía el
  `ClubClient` inyectado), deriva y aplica el Tema_Club desde la
  `IdentidadVisual`, y maneja el `409` por Temporada activa **conservando el Club
  actual** y devolviendo un resultado tipado con el mensaje explicativo
  (`{ ok:false, code:'CLUB_CHANGE_CONFLICT', message }`). Incluye también
  `contrastingTextColor` (texto con contraste seguro sobre los colores del tema,
  Req 29). Toda la lógica sensible a la corrección vive aquí y se cubre con
  `src/theme/club-theme-controller.test.ts`. Se exporta desde
  `src/theme/index.ts`. (Req 23.1–23.5)
- **Provider real de React** (`src/theme/ClubThemeProvider.tsx`): cablea el
  controlador a un React Context (`ClubThemeProvider` + hook `useClubTheme`) y
  re-renderiza al cambiar el estado. Como importa `react`, este `.tsx` está
  **excluido** del typecheck en `tsconfig.json` (`"src/**/*.tsx"`) mientras el
  toolchain RN/React no esté instalado; **typechea y se ejecuta una vez
  instaladas las dependencias del cliente** (`npm install` en `app/`). Es una
  envoltura delgada: no contiene lógica de negocio.

## Build de iOS

El proyecto nativo iOS vive en `app/ios/` (target y esquema
`DigitalFootballAlbum`, bundle id `com.digitalfootballalbum`, iOS mínimo **15.1**,
Hermes activado, New Architecture desactivada — coherente con Android). Se generó
siguiendo la plantilla de React Native 0.75.4.

> Importante: este scaffold **no** se ha abierto en Xcode ni se ha ejecutado
> `pod install` en este entorno. `pod install` es el **siguiente paso obligatorio**
> en macOS: genera `DigitalFootballAlbum.xcworkspace` (que es lo que se abre en
> Xcode, no el `.xcodeproj`). El `.xcworkspace` y `ios/Pods/` están gitignored.

### Requisitos

1. **macOS** con **Xcode 15+** y las Command Line Tools instaladas.
2. **CocoaPods**: `sudo gem install cocoapods` (o vía Homebrew/rbenv).
3. **Node 18+** y, en `app/`, `npm install` (instala las dependencias JS y sus
   pods autolinkeados).

### Pasos

```bash
cd app
npm install

cd ios
pod install            # genera DigitalFootballAlbum.xcworkspace + Pods/
open DigitalFootballAlbum.xcworkspace   # abre en Xcode (NO el .xcodeproj)
```

En Xcode, en **Signing & Capabilities** del target `DigitalFootballAlbum`:

1. Selecciona tu **Development Team** y deja el firmado automático (o configura
   el perfil manual). El bundle id debe ser `com.digitalfootballalbum`.
2. Habilita las capabilities (deben existir también en el **App ID** del Apple
   Developer portal):
   - **Push Notifications** — para APNs / Firebase Cloud Messaging. El
     `aps-environment` ya está en `DigitalFootballAlbum.entitlements`
     (`development`; Archive lo promociona a `production` según el perfil).
   - **Sign In with Apple** — usada por
     `@invertase/react-native-apple-authentication` (ya declarada en el
     entitlements como `Default`).
3. Añade tu `GoogleService-Info.plist` (de la app iOS de Firebase con bundle id
   `com.digitalfootballalbum`) arrastrándolo al proyecto en Xcode. Está
   gitignored. Con él presente y el pod de Firebase instalado, `[FIRApp configure]`
   se ejecuta en `AppDelegate.mm` (está guardado con `__has_include` para compilar
   aunque aún no esté).
4. Define **`IOS_URL_SCHEME`** (el *reversed client id* de tu cliente OAuth de iOS,
   p. ej. `com.googleusercontent.apps.1234567890-abcdef`) en tu `.env`
   correspondiente. `Info.plist` lo referencia como `$(IOS_URL_SCHEME)` en
   `CFBundleURLTypes` para el login con Google. (Ver `.env.example`.)

Ejecutar / empaquetar:

```bash
# desde app/
npm run ios            # compila y lanza en el simulador (Debug)
# Release: Product > Archive en Xcode con el esquema DigitalFootballAlbum
```

### Icono de la app

`app/ios/DigitalFootballAlbum/Images.xcassets/AppIcon.appiconset/Contents.json`
referencia un único icono universal `AppIcon.png` de **1024x1024** (convención de
la plantilla RN 0.75). El PNG **no** se incluye (no se versionan binarios):
añádelo en esa carpeta o arrastra tu set de iconos sobre el AppIcon en Xcode.

### Fallback de linkeo de Firebase (frameworks estáticos)

Si al ejecutar `pod install` o al compilar aparecen errores de linkeo del SDK de
Firebase, edita `app/ios/Podfile` y **descomenta** el bloque guía que hay al
principio, colocándolo antes del `target`:

```ruby
$RNFirebaseAsStaticFramework = true
use_frameworks! :linkage => :static
```

Vuelve a ejecutar `pod install`. Se deja **comentado por defecto** para conservar
el build estándar (linkeo dinámico), que funciona en la mayoría de los casos.

### Manifiesto de privacidad

`app/ios/DigitalFootballAlbum/PrivacyInfo.xcprivacy` incluye las *required-reason
APIs* de la plantilla RN 0.75 (FileTimestamp `C617.1`, UserDefaults `CA92.1`). Si
añades SDKs que accedan a más APIs de motivo obligatorio, amplía este manifiesto.
