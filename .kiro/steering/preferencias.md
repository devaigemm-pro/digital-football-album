---
inclusion: always
---

# Preferencias del usuario y estilo de solicitudes

Este documento captura cómo el usuario pide el trabajo, para que un agente pueda
representarlo con fidelidad. Es un documento **vivo**: se actualiza cada vez que
el usuario expresa una preferencia nueva o corrige una anterior.

> Cómo mantenerlo: cuando el usuario diga algo como "en adelante hazlo así",
> "prefiero X sobre Y" o corrija un enfoque, añade o ajusta una entrada aquí.

## Idioma y comunicación

- Toda la documentación, specs, comentarios y respuestas: **en español**.
- Respuestas directas y concisas; explicar el porqué de las decisiones técnicas.
- Preferir texto plano y viñetas sobre bloques con mucho formato.

## Cómo formular las solicitudes al agente desarrollador

Cuando este agente pida trabajo en nombre del usuario, debe:

1. Anclar cada solicitud a los requerimientos y reglas de negocio del producto
   (ver `producto.md`), citando el número de requerimiento (Req N) cuando aplique.
2. Ser explícito sobre las **invariantes** que no se deben romper (biyección
   Recuadro↔Partido, foto principal única, biunivocidad Recuadro↔Sticker, 300 DPI,
   Print_Engine atómico, gating por plan). Señalar si algo las pone en riesgo.
3. Definir criterios de aceptación verificables (qué salida, qué formato, qué
   valores), no solo la intención general.
4. Pedir que se ejecute la verificación del proyecto antes de dar algo por hecho:
   `typecheck`, `test` (vitest run) y `lint`.
5. Preferir cambios pequeños y acotados; no ampliar el alcance sin acordarlo.
6. Mantener el backend como fuente de verdad; no mover lógica sensible al cliente.

## Preferencias técnicas

- TypeScript ESM, dominio puro (UUID como string, fechas ISO 8601, uniones de
  literales de string en lugar de `enum`).
- Tests con Vitest; usar property-based testing (fast-check) donde aporte.
- Respetar la estructura por capas: `api`, `app`, `domain`, `jobs`,
  `persistence`, `services`.
- Escribir tests para features nuevas y correcciones de bugs cuando sea razonable.
- Seguir las convenciones de eslint/prettier ya configuradas.

## Límites y seguridad

- Confirmar antes de acciones destructivas o de amplio impacto (borrados masivos,
  cambios de esquema en producción, migraciones irreversibles).
- No commitear archivos con secretos. Preferir staging de archivos específicos.

## Preferencias específicas del usuario (ir completando)

- [2026-09-24] Persistencia con Supabase local (CLI + Docker); dominio en camelCase mapeado a snake_case en la capa de persistencia.
- [2026-09-24] Selección de driver de persistencia por `PERSISTENCE_DRIVER` (memory | supabase); nada de lógica sensible en el cliente.
- [2026-09-24] Autenticación delegada en Supabase Auth (GoTrue): el gateway valida JWT ES256 contra el JWKS; el JWT HMAC propio queda solo como fallback.
- [2026-09-24] Interés por lo "más profesional": preferir la decisión de arquitectura correcta sobre el atajo, aunque implique más trabajo.
- [2026-09-24] Los adaptadores de puertos externos sin implementación real deben marcarse explícitamente como no-producción (stubs que registran o lanzan, nunca fingir éxito).
- [2026-09-24] Verificación end-to-end real antes de dar algo por hecho: arrancar el proceso/servidor y probar contra la base/HTTP reales, no solo compilar.
- [2026-09-24] Objetivo de despliegue completo del backend: config fail-fast, Docker, logging estructurado (JSON en prod), secretos fuera del repo y CI/CD.
- [2026-09-24] Cliente móvil en React Native + TypeScript (no Flutter), para reutilizar los view-models TS de `src/app`; cliente delgado.
- [2026-09-24] Separación estricta en el cliente: lógica testeable en `.ts` puros (typecheck) tras puertos inyectables; UI y adaptadores nativos/Supabase en `.tsx` (excluidos del typecheck).
- [2026-09-24] Adaptadores nativos reales de producción (Firebase/FCM, IAP, permisos, share, image-picker, keychain), no stubs.
- [2026-09-24] Autenticación del cliente móvil DIRECTA contra Supabase Auth con `@supabase/supabase-js` (email/password); el token de Supabase se envía al backend como `Bearer`; el backend no expone login/registro/refresh.
- [2026-09-24] `docs/FRONTEND_INTEGRATION.md` es la fuente de verdad del contrato backend↔app; ante conflicto con lo cableado, se ajusta el cliente al doc.
- [2026-09-24] Backend desplegado: negocio en Render (`https://album-backend-smr4.onrender.com`), auth en Supabase; API en camelCase, errores `{error,message}`, negocio en HTTP 400.
- [2026-09-24] Config del cliente por entorno con `react-native-config`/`.env`; `API_BASE_URL` y `SUPABASE_URL` con TLS obligatorio; solo la anon key va en la app (NUNCA la `service_role`; si se expone, rotarla).
- [2026-09-24] Ocultar en la UI las funciones que el backend aún no expone (suscripción/IAP, envío, push, cierre, edición de contexto) con placeholder "No disponible"; los métodos lanzan `NotAvailableError`.
- [2026-09-24] Builds Android reales: JDK 17 + Android SDK instalados en `~` (sin sudo), keystore fuera del repo; generar APK debug/release y AAB con el script `app/build-release.sh`.
- [2026-09-24] Metro configurado para monorepo: `watchFolders` a la raíz + resolver que mapea imports `.js` explícitos del backend a `.ts`.
- [2026-09-24] Mantener este archivo automáticamente: al final de cada sesión, detectar preferencias/decisiones nuevas y añadirlas aquí SIN preguntar (hook `SessionEnd`/`Stop`).
- [2026-09-24] Distribución de builds de prueba vía Firebase App Distribution (sin cable): firebase-tools local + `app/distribute.sh` (compila APK release y sube al grupo `testers`); alternativas de instalación: `adb install -r` por cable/WiFi o Google Play (canal interno) para lanzamiento real.
- [2026-09-24] Firebase App Distribution operativo: proyecto `digital-football-album`, app Android `1:939665703335:android:85e7e843d7ba71a6dfb682`, CLI logueada como devaigemm@gmail.com; distribuir por email de tester con `TESTERS="..." ./distribute.sh` (los grupos requieren alias exacto en la consola).
- [2026-09-24] UI del cliente con colores EXPLÍCITOS y contraste WCAG AA (>=4.5:1), sin depender del tema claro/oscuro del SO (evita texto ilegible en MIUI oscuro); fijar `color`, `backgroundColor` y `placeholderTextColor` en pantallas.
- [2026-09-24] Entorno de pruebas Supabase: desactivar confirmación por email (Auth > Providers > Email > Confirm email OFF) para poder crear/usar usuarios de prueba de inmediato; usuario de prueba devaigemm@gmail.com.
- [2026-09-24] Campos de login RN robustos: `autoCapitalize="none"` + `autoCorrect={false}` en email y contraseña, y normalizar email (`trim().toLowerCase()`) para evitar credenciales alteradas por el teclado (causa de falsos "invalid login credentials").
- [2026-09-24] Al distribuir builds nuevas por App Distribution, subir `versionCode` (y `versionName`) en `app/android/app/build.gradle` para que App Tester reconozca la versión como nueva y fuerce la actualización.
