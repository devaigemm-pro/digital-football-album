#!/usr/bin/env bash
# Regenera el Gradle Wrapper de este proyecto Android a Gradle 8.8.
#
# El wrapper ya está incluido y versionado en el repo (gradlew, gradlew.bat y
# gradle/wrapper/gradle-wrapper.jar; el .jar se copió del wrapper oficial de
# Gradle 8.8 que empaqueta `@react-native/gradle-plugin`). Este script SOLO es
# necesario si quieres regenerarlo con una instalación local de Gradle, o si el
# .jar se perdiera.
#
# Requisitos: tener `gradle` instalado en el PATH (p. ej. `brew install gradle`
# o SDKMAN). Ejecuta este script UNA vez desde el directorio `app/android`:
#
#   cd app/android && ./generate-wrapper.sh
#
set -euo pipefail

if ! command -v gradle >/dev/null 2>&1; then
  echo "ERROR: 'gradle' no está en el PATH. Instálalo (brew install gradle o SDKMAN) y reintenta." >&2
  echo "Alternativamente, el wrapper ya viene incluido en el repo; normalmente no necesitas ejecutar esto." >&2
  exit 1
fi

gradle wrapper --gradle-version 8.8 --distribution-type all
echo "Gradle Wrapper regenerado a 8.8. Verifica con: ./gradlew --version"
