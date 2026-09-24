#!/usr/bin/env bash
#
# build-release.sh — Compila el APK y el AAB de RELEASE de la App_Móvil.
#
# Exporta el toolchain local (JDK 17 + Android SDK instalados en ~) y ejecuta
# assembleRelease + bundleRelease. Pensado para no repetir los exports a mano.
#
# Uso:
#   ./build-release.sh            # compila APK + AAB de release
#   ./build-release.sh apk        # solo el APK de release
#   ./build-release.sh aab        # solo el AAB (Play Store)
#   ./build-release.sh debug      # APK de debug (usa .env.development)
#
# Requisitos (ya instalados en este equipo bajo ~):
#   - JDK 17 en   ~/.local/jdk17
#   - Android SDK en ~/Library/Android/sdk
#   - Credenciales de firma release en ~/.gradle/gradle.properties
#     (RELEASE_STORE_FILE / RELEASE_KEY_ALIAS / RELEASE_STORE_PASSWORD / RELEASE_KEY_PASSWORD)
#
# NOTA: la URL del backend se toma del .env correspondiente
#       (.env.production para release, .env.development para debug).
#       Cámbiala ANTES de compilar. Ver CONFIGURAR_BACKEND.md.

set -euo pipefail

# --- Rutas del toolchain (ajusta si instalaste en otro sitio) ---------------
JDK_HOME="${JAVA_HOME:-$HOME/.local/jdk17}"
SDK_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

# Directorio del script -> carpeta android/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android"

# --- Validaciones -----------------------------------------------------------
if [ ! -x "$JDK_HOME/bin/java" ]; then
  echo "ERROR: no se encontró JDK 17 en $JDK_HOME" >&2
  echo "       Instálalo o exporta JAVA_HOME apuntando a un JDK 17." >&2
  exit 1
fi
if [ ! -d "$SDK_HOME/platform-tools" ]; then
  echo "ERROR: no se encontró el Android SDK en $SDK_HOME" >&2
  echo "       Instálalo o exporta ANDROID_HOME." >&2
  exit 1
fi
if [ ! -d "$ANDROID_DIR" ]; then
  echo "ERROR: no existe $ANDROID_DIR (¿ejecutas el script desde app/?)" >&2
  exit 1
fi

# --- Exports ----------------------------------------------------------------
export JAVA_HOME="$JDK_HOME"
export ANDROID_HOME="$SDK_HOME"
export ANDROID_SDK_ROOT="$SDK_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Aviso si la URL del backend sigue en el placeholder.
ENV_FILE="$SCRIPT_DIR/.env.production"
[ "${1:-}" = "debug" ] && ENV_FILE="$SCRIPT_DIR/.env.development"
if [ -f "$ENV_FILE" ] && grep -q "api.example.com" "$ENV_FILE"; then
  echo "AVISO: API_BASE_URL en $(basename "$ENV_FILE") sigue en el placeholder"
  echo "       (https://api.example.com). La app compilará pero no hablará con"
  echo "       un backend real. Ver CONFIGURAR_BACKEND.md."
  echo ""
fi

echo "JDK:  $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "SDK:  $ANDROID_HOME"
echo ""

cd "$ANDROID_DIR"
TARGET="${1:-all}"

case "$TARGET" in
  apk)
    echo ">> assembleRelease (APK)"
    ./gradlew assembleRelease --no-daemon
    ;;
  aab)
    echo ">> bundleRelease (AAB)"
    ./gradlew bundleRelease --no-daemon
    ;;
  debug)
    echo ">> assembleDebug (APK debug)"
    ./gradlew assembleDebug --no-daemon
    ;;
  all)
    echo ">> assembleRelease + bundleRelease"
    ./gradlew assembleRelease bundleRelease --no-daemon
    ;;
  *)
    echo "Uso: $0 [apk|aab|debug|all]" >&2
    exit 2
    ;;
esac

echo ""
echo "=== Artefactos generados ==="
find app/build/outputs -type f \( -name "*.apk" -o -name "*.aab" \) \
  -exec ls -lh {} \; 2>/dev/null | awk '{print $5"\t"$NF}'
