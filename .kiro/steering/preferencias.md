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
- [2026-09-24] Onboarding jerárquico: país (con bandera) → 2 divisiones principales (solo `tipo==='league'`, slice(0,2); NUNCA copas/torneos) → equipo con logo.
- [2026-09-24] Perfil ampliado: avatar, nombre, alias, fecha de nacimiento (AAAA-MM-DD, no futura) y sexo (MASCULINO|FEMENINO|OTRO|PREFIERO_NO_DECIR); paso de perfil en el onboarding vía `PATCH /me`; columnas nullable en `usuarios` (no tabla nueva).
- [2026-09-24] Detalle de partido: al abrir se ve resultado + goleadores; botón "Detalles" muestra formaciones junto a la lámina, con adjuntar Foto_Principal y reseña (guardada como `notas` del Momento). Ficha viva desde API-Football (fixtures+events+lineups); backend fuente de verdad.
- [2026-09-24] El detalle de partido expone `recuadroId` explícito (además de `numeroRecuadro`) para fijar la Foto_Principal desde el cliente sin fabricar ids.
- [2026-09-24] "Cerrar sesión" visible y directo en Perfil (con confirmación) y en Onboarding, además de Ajustes.
- [2026-09-24] Verificación de deploy end-to-end REAL: usuario Supabase throwaway (signup con anon key → JWT → probar endpoints del backend desplegado), no solo compilar ni asumir por `/health`.
- [2026-09-24] Pantalla de aterrizaje al entrar = perfil del usuario en formato "lámina/figurita" (PRIMERA pestaña): foto en modo sticker, nombre, insignia del equipo y como dato atractivo el progreso real del álbum ("X de Y láminas · temporada Z"), sin inventar estadísticas.
- [2026-09-27] Mockups/prototipos de UI en `public/mockups/` (prototipo navegable HTML + imágenes por vista en `img/` + doc de propuesta). `public/album.html` = referencia del kit físico impreso; `public/mockups/prototipo.html` = referencia de la app.
- [2026-09-27] Lenguaje visual de la app: "Stadium Night" (canvas oscuro azul-medianoche con destellos del color del club, glassmorphism, marcadores tipo transmisión, home en bento grid, gamificación con progreso/racha/XP) sobre la herencia de álbum de figuritas; color explícito y contraste AA sin depender del tema del SO. El look editorial de papel/cromos se reserva para el kit impreso.
- [2026-09-27] Los rediseños de pantallas se entregan primero como imágenes/prototipo para aprobación ANTES de tocar el código; al aplicar, se cambia SOLO la capa visual (design-tokens.ts + ui/kit.tsx + StyleSheets de screens + TabBar del RootNavigator), sin alterar presenters/clients .ts, props ni handlers. En `design-tokens.ts` mantener los nombres/firmas exportados (tests importan `palette`, `buildTheme`); añadir claves nuevas es seguro, renombrar/quitar rompe tests.
- [2026-09-27] Para capturas de vistas usar `agent-browser`; recordar que los arreglos en zsh son 1-indexed (evitar desalineación de nombres al iterar).
- [2026-09-27] En "Mi álbum" no se muestra aviso/recuadro de recuerdos faltantes; las láminas vacías (silueta punteada) ya lo comunican (Req 11.2).
- [2026-09-27] Cada recuerdo/lámina es un partido y SIEMPRE va asociado al encuentro (biyección Recuadro↔Partido, Req 4.1); la Foto_Principal de la lámina se monta desde el detalle del partido.
- [2026-09-27] En el detalle de un partido, la lámina del hincha va ARRIBA (con acción de montar/cambiar foto) y DEBAJO la información del encuentro (marcador, goleadores, alineación, reseña), siempre visible (sin toggle "Detalles").
- [2026-09-27] El Carné del hincha permite agregar la foto a la lámina; su acción principal "Agregar foto a mi lámina" lleva a elegir el partido donde se monta la Foto_Principal.
- [2026-09-27] Cargar fotos desde galería NO requiere permiso de almacenamiento: se usa el Photo Picker del sistema (Android 13+/iOS). El gate de permisos aplica solo a cámara, que sí se declara en el AndroidManifest (`android.permission.CAMERA`); `permisoParaFuente('galeria')` devuelve `null`.
- [2026-09-27] En el marcador del detalle de partido, el escudo del club propio sale de `GET /me` (`club.escudoUrl`); el escudo del rival aún NO lo expone el backend en `GET /partidos/:id` (pendiente exponerlo para poder pintarlo; hasta entonces se muestra monograma).
- [2026-09-27] Estados de partido válidos: `PROGRAMADO | EN_CURSO | FINALIZADO` (no existe `EN_JUEGO`). Si un partido está FINALIZADO sin resultado de la API deportiva, mostrar "– / –" en vez de "VS".
- [2026-09-27] Despliegue de la app móvil: subir `versionCode`/`versionName` en cada build; compilar con `app/build-release.sh apk` y distribuir con Firebase App Distribution por email directo (`--testers`), ya que el grupo `testers` no existe en la consola (da 404). Última versión distribuida: 1.2.2 (16), apuntando al backend de Render + Supabase.
- [2026-09-27] Sincronización de temporada POR EQUIPO en todas las competiciones: `temporadaExterna` con formato `team:<teamId>:<season>` (API-Football `fixtures?team=&season=` sin `league=`), para incluir liga + Copa Chile + internacional (Req 4.2). El cliente lo construye así en el onboarding.
- [2026-09-27] Mapeo de estado de partido: solo FT/AET/PEN/WO → FINALIZADO; en juego → EN_CURSO; NS/TBD/PST/CANC/SUSP/INT/etc y desconocidos → PROGRAMADO. Un partido no jugado NUNCA debe quedar FINALIZADO.
- [2026-09-27] Al sincronizar la temporada, hacer backfill del resultado de los partidos ya FINALIZADOS (llamar a `syncPartidoFinalizado` en `syncSeason`, tolerante a fallos por partido) para que el detalle no muestre "– / –".
- [2026-09-27] El Momento se crea con contexto por defecto `EN_VIVO_LOCAL` (no `TRANSMISION`): TRANSMISION exige `sub_modalidad` no nula (CHECK `chk_submodalidad_solo_transmision`); crear con TRANSMISION+null viola la restricción al subir la primera foto.
- [2026-09-27] El Carné del hincha tiene un "+" sobre la lámina del avatar para agregar/cambiar la foto de perfil del hincha; por ahora navega a Perfil (no hay endpoint de subida de avatar; si se agrega, cablear picker + `actualizarPerfil({ avatarUrl })`).
- [2026-09-27] Al eliminar una opción del menú, quitar solo el tab y su cableado de navegación (RootNavigator/screen-bindings/route-model); conservar pantallas y exports que otros flujos aún usan (p. ej. `DetallePartido` accesible desde Partidos, y el `type CaptureNativeBridge`) en vez de borrar código del que se depende.
- [2026-09-27] Commits acotados por ronda: hacer staging específico de los archivos de la solicitud actual (no `git add -A`) y no mezclar en el mismo commit trabajo previo sin commitear ni artefactos generados/regenerables (p. ej. `app/android/build/generated/**`, que además no debería estar rastreado).
- [2026-09-27] La pantalla de Ajustes sigue el prototipo (`public/mockups/prototipo.html` #17) como referencia de diseño: filas con icono + etiqueta y control (toggle o chevron) agrupadas en una card. Cablear solo lo que el backend/entorno expone de verdad (Cuenta→Perfil, permisos cámara/geo vía `PermissionGate`, logout, borrado) y marcar el resto como "No disponible" (push, gestión de plan, pantalla de privacidad) en vez de fingir funcionalidad.
- [2026-09-27] En Perfil: la Temporada se muestra solo con el AÑO (helper `añoDeTemporada` extrae el año de formatos como "2026", "265:2023:2315", "team:33:2023"); no se muestra la zona horaria; se editan nombre y alias vía `PATCH /me` y el correo vía Supabase Auth (`updateEmail`), avisando que el cambio de correo requiere confirmación por email y no es inmediato.
- [2026-09-27] Los botones de una pantalla usan el tono del kit acorde al fondo real (canvas oscuro Stadium Night → `SecondaryButton tone="dark"` / `PrimaryButton`), nunca `tone="light"` sobre fondo oscuro, para no romper el contraste ni verse distintos al resto de la app.
- [2026-09-27] La lista de Partidos se agrupa por competición (encabezado con ícono por tipo: 🏆 Liga, 🏅 Copa nacional, 🌎 Internacional; el backend NO expone logo de competición, solo `competicion` texto + `tipoCompeticion`) y dentro de cada grupo se ordena por fecha ascendente (jornada 1 → x). Orden de grupos: Liga → Copa nacional → Internacional.
- [2026-09-27] Perfil sin botones "Cambiar de club" ni "Ajustes y privacidad" (Ajustes es pestaña propia del menú y su fila "Cuenta" lleva a Perfil); el botón "Cerrar sesión" va en rojo igual que "Editar datos" (PrimaryButton).
- [2026-09-27] El nombre del hincha en el Carné se resuelve con `nombreVisible(profile.perfil)` (no pasar el objeto de estado completo, cuyo `.usuario` es undefined y caía en "Sin nombre"); `GET /me` y el mapeo de persistencia ya devuelven nombre/alias correctamente.
- [2026-09-27] El hincha puede elegir el COLOR DE FONDO de la app entre una paleta curada (8 fondos oscuros con contraste AA para el texto claro), desde Ajustes (swatches). Es preferencia de UI LOCAL: se persiste en AsyncStorage vía puerto inyectable (`BackgroundPreferenceStore`), NO en el backend. Lógica pura en `app/src/theme/background-preference.ts` (testeada); provider `BackgroundProvider.tsx` + `useBackgroundColor()` que el `Screen` del kit aplica como override de `backgroundColor`.
- [2026-09-27] En el Carné: el conteo de láminas (ej. 2/30) lleva un ícono de lámina (recuadro con borde punteado + estrella dorada `palette.gold`); la lámina del avatar es 1.5x más grande (stickerWrap 108→162); la temporada se muestra solo con el AÑO (`añoDeTemporada`).
- [2026-09-27] Ícono de lámina reutilizable en el kit (`LaminaIcon`): recuadro con borde punteado y un glifo dentro — estrella dorada (`palette.gold`) = montada, signo de interrogación ROJO (`palette.danger`) = falta. Prop `corner` ancla el glifo en el vértice inferior derecho (uso del carné). En el Carné la estrella va en la esquina inferior derecha.
- [2026-09-27] En la lista de Partidos, la numeración de cada partido es el número de FECHA/jornada (posición dentro de su competición, index+1 del SectionList) mostrado ENCIMA de un ícono de balón ⚽, no el número de recuadro. El estado de cada lámina se muestra con `LaminaIcon` (estrella dorada = montada, "?" rojo = falta) en vez de los badges "Montada"/"Falta".
- [2026-09-27] En `LaminaIcon` con `corner`, el glifo (estrella/"?") se dibuja como BADGE circular superpuesto en el vértice inferior derecho de la lámina (mitad dentro/mitad fuera), igual que el botón "+" del avatar del hincha; la lámina puede llevar un `numero` DENTRO. En el conteo del Carné: la lámina muestra las montadas dentro (ej. "2") con la estrella en el vértice, y "/30" al lado.
- [2026-09-27] En la lista de Partidos, el número de fecha va SUPERPUESTO sobre el balón (⚽ como fondo, número encima) y en AMARILLO (`palette.gold`) con sombra oscura para resaltar sobre el balón.
- [2026-09-27] En la lista de Partidos NO se muestra ícono de balón; solo el número de fecha en una cajita simple.
- [2026-09-27] En "Mi álbum", tocar una lámina (montada o vacía "Pega aquí") navega al detalle del partido asociado. Como el preview del álbum (`GET /album/:id/preview`) NO trae `partidoId`, el cliente mapea `numeroRecuadro → partidoId` desde la lista de partidos (`GET /temporadas/:id/partidos`) vía el ProfilePresenter compartido.
- [2026-09-27] El marco del escudo (`Crest`) va en dorado intenso (`palette.goldStrong` = #F5B301) y levemente más grueso (borderWidth 4).
- [2026-09-27] Eliminada la pestaña Suscripción del menú (ruta `Suscripcion` fuera del grafo de navegación); el `subscriptionClient`/`getEntitlements` se conserva solo para mostrar el plan (lectura) en Ajustes.
- [2026-09-27] En la foto del avatar del Carné no se muestra el badge de número superior derecho (StickerSlot con `hideNumero`).