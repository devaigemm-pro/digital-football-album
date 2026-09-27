#!/usr/bin/env bash
#
# distribute.sh — Compila el APK de release y lo sube a Firebase App
# Distribution, para instalarlo en el teléfono por link/notificación SIN cable.
#
# Uso:
#   ./distribute.sh                      # compila + sube al grupo 'testers'
#   ./distribute.sh "nota de la versión" # con notas de la release
#   TESTERS="a@x.com,b@y.com" ./distribute.sh   # a testers concretos (por email)
#   GROUPS="testers,qa" ./distribute.sh         # a grupos concretos
#   SKIP_BUILD=1 ./distribute.sh          # sube el APK ya compilado (no recompila)
#
# Requisitos (una sola vez):
#   1) Iniciar sesión en Firebase:   ./node_modules/.bin/firebase login
#      (o exportar FIREBASE_TOKEN con un token de CI:  firebase login:ci)
#   2) En la consola de Firebase (Project: digital-football-album) > App
#      Distribution: crear el grupo de testers (por defecto 'testers') y añadir
#      los correos de quienes probarán. Cada tester recibe un email/QR con el
#      enlace de instalación.

set -euo pipefail

# --- Config (del google-services.json de este proyecto) ---------------------
APP_ID="1:939665703335:android:85e7e843d7ba71a6dfb682"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIREBASE="$SCRIPT_DIR/node_modules/.bin/firebase"
APK="$SCRIPT_DIR/android/app/build/outputs/apk/release/app-release.apk"

NOTES="${1:-Build de prueba $(date '+%Y-%m-%d %H:%M')}"
GROUPS="${GROUPS:-testers}"

# --- Validaciones -----------------------------------------------------------
if [ ! -x "$FIREBASE" ]; then
  echo "ERROR: firebase CLI no encontrada. Instala:  npm install --save-dev firebase-tools" >&2
  exit 1
fi

# --- 1) Compilar el APK de release (salvo SKIP_BUILD) -----------------------
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo ">> Compilando APK de release..."
  "$SCRIPT_DIR/build-release.sh" apk
fi

if [ ! -f "$APK" ]; then
  echo "ERROR: no existe el APK en $APK (¿falló la compilación?)" >&2
  exit 1
fi

# --- 2) Subir a Firebase App Distribution -----------------------------------
echo ">> Subiendo a Firebase App Distribution (app $APP_ID)..."

# Autenticación: FIREBASE_TOKEN (CI) si está definido; si no, sesión interactiva.
AUTH_ARGS=()
if [ -n "${FIREBASE_TOKEN:-}" ]; then
  AUTH_ARGS+=(--token "$FIREBASE_TOKEN")
fi

DEST_ARGS=()
if [ -n "${TESTERS:-}" ]; then
  DEST_ARGS+=(--testers "$TESTERS")
else
  DEST_ARGS+=(--groups "$GROUPS")
fi

"$FIREBASE" appdistribution:distribute "$APK" \
  --app "$APP_ID" \
  --release-notes "$NOTES" \
  ${DEST_ARGS[@]+"${DEST_ARGS[@]}"} \
  ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}

echo ""
echo "Listo. Los testers del grupo/lista recibirán el enlace de instalación."
echo "APK: $APK"
