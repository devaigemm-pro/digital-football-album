# Implementation Plan: Álbum de Fútbol Digital

## Overview

Este plan traduce el diseño en una serie de tareas de codificación incrementales para un **backend en TypeScript** (Node.js) expuesto vía API Gateway, con PostgreSQL como base relacional, object storage para binarios, y una app móvil delgada (React Native + TypeScript) para presentación y captura. Cada tarea construye sobre las anteriores: primero los cimientos (estructura, tipos, persistencia), luego autenticación y sesión, después los servicios de negocio, la integración deportiva, el Motor_Album y el Print_Engine (lógica sensible a la corrección), y finalmente notificaciones, envío y las capas de la app móvil.

Se prioriza la lógica de backend sensible a la corrección: biunivocidad Recuadro↔Sticker (numeración heredada y tolerante a huecos), escala mínima de 300 DPI, atomicidad de la generación de PDF, clasificación de partidos y gating por plan.

**Testing:** las 31 Correctness Properties del diseño se implementan con **property-based testing usando `fast-check`**, con un mínimo de **100 iteraciones** por propiedad y cada test etiquetado con el comentario `// Feature: digital-football-album, Property {n}: {texto}`. El resto de criterios se cubre con pruebas por ejemplo, edge, integración y humo. Los sub-tasks de pruebas están marcados con `*` (opcionales para un MVP más rápido).

## Tasks

- [x] 1. Preparar estructura del proyecto backend y contratos base
  - Crear la estructura de carpetas del monorepo/servicio: `src/domain`, `src/services`, `src/persistence`, `src/api`, `src/jobs`, `test`.
  - Configurar TypeScript (tsconfig estricto), linter/formatter y el runner de pruebas (Vitest o Jest) con `fast-check` como dependencia de desarrollo.
  - Definir un helper de PBT compartido (`test/pbt.ts`) que fije `numRuns: 100` por defecto y exponga generadores base reutilizables.
  - _Requirements: 21.1, 21.2_

- [x] 2. Modelo de dominio, tipos y esquema de persistencia
  - [x] 2.1 Definir tipos e interfaces del dominio
    - Escribir interfaces/enums TypeScript para `Usuario`, `RefreshToken`, `ConfigAdmin`, `PlantillaAlbum`, `Club`, `Rivalidad`, `Suscripcion`, `Temporada`, `PartidoOficial`, `Album`, `Recuadro`, `Momento`, `Foto`, `DireccionEnvio`, `Pedido`.
    - Incluir enums de estado: `Temporada.estado`, `PartidoOficial.estado`, `PartidoOficial.tipoCompeticion`, `Suscripcion.plan/estado`, `Recuadro.estadoRecordatorio`, `Foto.estadoAsociacion`, `Pedido.estado`.
    - _Requirements: 4.1, 4.2, 5.5, 9.5, 14.5_

  - [x] 2.2 Implementar el esquema PostgreSQL y las migraciones
    - Escribir migraciones que reflejen el diagrama ER (claves foráneas, restricción de a lo sumo una `fotoPrincipalId` por Recuadro, unicidad Partido↔Recuadro).
    - Añadir columnas para dimensiones físicas del Recuadro/Plantilla (`recuadroAnchoMm`, `recuadroAltoMm`) y dimensiones de píxeles de la Foto (`anchoPx`, `altoPx`).
    - _Requirements: 4.1, 19.1_

  - [x] 2.3 Implementar repositorios de acceso a datos (capa de persistencia)
    - Escribir repositorios tipados para cada entidad con operaciones CRUD e interfaces que permitan mockearlos en pruebas de dominio puro.
    - _Requirements: 5.4, 7.2, 8.2_

  - [ ]* 2.4 Escribir pruebas unitarias de repositorios y validaciones de modelo
    - Verificar restricciones de unicidad y validaciones de campos con casos de borde.
    - _Requirements: 4.1, 5.5_

- [x] 3. Servicio_Autenticación y gestión de sesión por tokens
  - [x] 3.1 Implementar emisión de tokens (access JWT corto + refresh con rotación)
    - Escribir la lógica de `register`/`login` multiproveedor (Apple/Google/email) que emite `{ accessToken, refreshToken }` y crea cuenta nueva por email.
    - Implementar `refresh` con rotación de refresh token y familia de tokens; `logout` que invalida el refresh vigente.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implementar borrado de cuenta (derecho al olvido GDPR/CCPA)
    - Escribir `DELETE /cuenta`: elimina fotos (object storage), momentos, recuadros y datos personales; revoca refresh tokens; conserva `Pedido.datosFiscalesMinimos`. Idempotente y reintentable ante fallo parcial.
    - _Requirements: 20 (borrado de cuenta)_

  - [ ]* 3.3 Escribir property test del borrado de cuenta
    - **Property 31: El borrado de cuenta elimina todo dato personal salvo el mínimo legal/fiscal**
    - **Validates: Requirements 20**

  - [ ]* 3.4 Escribir pruebas de integración del ciclo de tokens
    - Cubrir login → refresh (rotación) → logout y rechazo de reutilización de refresh token ya rotado; credenciales inválidas → 401; registro por email.
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 4. API Gateway: autenticación de peticiones y TLS
  - [x] 4.1 Implementar middleware de autenticación y enrutado
    - Validar el access token (JWT) en el borde, aplicar límites de tasa y enrutar a los servicios; terminar TLS.
    - _Requirements: 1.2, 20.1_

  - [ ]* 4.2 Escribir pruebas de integración del gateway
    - Verificar rechazo sin TLS, 401 con token ausente/expirado y enrutado correcto.
    - _Requirements: 20.1_

- [x] 5. Checkpoint - Asegurar que las pruebas pasan
  - Ejecutar `npm test` y confirmar que dominio, persistencia y autenticación pasan. Ante dudas, consultar al usuario.

- [x] 6. Servicio_Suscripción, entitlements y webhooks de RevenueCat
  - [x] 6.1 Implementar catálogo de planes y compra/upgrade vía IAP
    - Escribir `GET /subscription`, `POST /subscription/purchase`, `POST /subscription/upgrade` procesando el recibo IAP (App Store / Google Play) y activando/renovando el plan.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.2 Implementar el manejador de webhooks de RevenueCat
    - Verificar firma del webhook y rechazar eventos no válidos; procesar de forma idempotente por `eventId`; resolver estado por marca de tiempo (tolerancia a orden). En fallo de pago conservar estado previo y notificar.
    - _Requirements: 3.3, 3.5_

  - [x] 6.3 Implementar el punto único de entitlements (gating)
    - Escribir `GET /entitlements` que deriva `{ digitalCardsInternacional, holograma }` exclusivamente del plan (Premium habilita, Básico deshabilita).
    - _Requirements: 3.6, 3.7_

  - [ ]* 6.4 Escribir property test de preservación de estado ante fallo de pago
    - **Property 1: Fallo de pago preserva el estado de suscripción**
    - **Validates: Requirements 3.5**

  - [ ]* 6.5 Escribir property test de entitlements determinados por el plan
    - **Property 2: Derechos (entitlements) determinados exclusivamente por el plan**
    - **Validates: Requirements 3.6, 3.7**

  - [ ]* 6.6 Escribir pruebas de integración de IAP y webhook
    - Cubrir compra IAP sandbox (3.2), webhook de pago OK (3.3), verificación de firma, deduplicación por `eventId` y tolerancia a eventos fuera de orden.
    - _Requirements: 3.2, 3.3, 3.5_

- [x] 7. Servicio de Personalización / Selección de Club
  - [x] 7.1 Implementar asignación y cambio de Club con regla de bloqueo
    - Escribir `PUT /usuario/club`: aplica identidad visual (paleta, escudo, activos). El cambio a un `clubId` distinto solo procede si el usuario no tiene Temporada en estado `ACTIVA`; si la hay, rechazar con `409 Conflict` sin modificar el `clubId`.
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 7.2 Escribir property test de bloqueo de cambio de Club
    - **Property 30: Cambio de Club bloqueado con Temporada Activa**
    - **Validates: Requirements 2.3**

- [x] 8. Servicio_Datos_Deportivos y derivación del álbum
  - [x] 8.1 Implementar cliente de la API deportiva con timeout y reintentos
    - Escribir el cliente con timeout de 30s y política de reintentos (≤3, backoff creciente) que no bloquea al usuario; abstraer detrás de una interfaz mockeable.
    - _Requirements: 9.1, 9.6_

  - [x] 8.2 Implementar `syncFixture` con saneamiento de registros
    - Obtener fixtures/fechas/horarios; descartar solo registros inválidos (fecha/horario/id ausente o inválido) conservando los válidos y registrando el motivo de cada descarte.
    - _Requirements: 9.1, 9.2_

  - [x] 8.3 Implementar la derivación y re-derivación del álbum desde el fixture
    - Derivar exactamente un Recuadro por Partido_Oficial (liga/copa/internacional), excluyendo amistosos; en actualizaciones del fixture re-derivar manteniendo la biyección y conservando la Foto_Principal de los partidos que persisten.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 8.4 Implementar `syncPartidoFinalizado` y `linkFoto`
    - Al finalizar un partido, obtener resultado, alineación y eventos (≤5 min). Enlazar foto↔partido solo con coincidencia única; con cero o múltiples coincidencias marcar `PENDIENTE_ASOCIACION` y notificar.
    - _Requirements: 9.3, 9.4, 9.5_

  - [ ]* 8.5 Escribir property test de biyección álbum↔fixture
    - **Property 3: Un Recuadro por Partido_Oficial (biyección con el fixture)**
    - **Validates: Requirements 4.1, 4.3**

  - [ ]* 8.6 Escribir property test de exclusión de amistosos
    - **Property 4: Solo los partidos oficiales generan Recuadro**
    - **Validates: Requirements 4.2**

  - [ ]* 8.7 Escribir property test de re-derivación
    - **Property 5: La re-derivación tras cambio de fixture mantiene la biyección**
    - **Validates: Requirements 4.4**

  - [ ]* 8.8 Escribir property test de saneamiento de sincronización
    - **Property 13: La sincronización conserva los válidos y descarta solo los inválidos**
    - **Validates: Requirements 9.2**

  - [ ]* 8.9 Escribir property test de enlace foto↔partido
    - **Property 14: El enlace foto↔partido solo procede con coincidencia única**
    - **Validates: Requirements 9.4, 9.5**

  - [ ]* 8.10 Escribir property test de la política de reintentos
    - **Property 15: La política de reintentos está acotada y no bloquea al usuario**
    - **Validates: Requirements 9.6**

  - [ ]* 8.11 Escribir pruebas de integración de sincronización deportiva
    - Sincronización con timeout de 30s (9.1) y obtención post-finalización ≤5 min (9.3) contra la API mockeada.
    - _Requirements: 9.1, 9.3_

- [x] 9. Clasificador de Partidos
  - [x] 9.1 Implementar la clasificación de cada Partido_Oficial
    - Escribir `clasificar(partido, club)` que fija `esClasico` (rival en la lista de rivalidades) y `esInternacional` (competición internacional según la API); la clasificación alimenta holograma y Digital Cards premium.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 9.2 Escribir property test de clasificación total
    - **Property 16: Todo Partido_Oficial queda clasificado**
    - **Validates: Requirements 10.1**

  - [ ]* 9.3 Escribir property test de clásico ⇔ rivalidad
    - **Property 17: Clásico si y solo si el rival está en la lista de rivalidades**
    - **Validates: Requirements 10.2**

  - [ ]* 9.4 Escribir property test de internacional ⇔ competición internacional
    - **Property 18: Internacional si y solo si la competición es internacional**
    - **Validates: Requirements 10.3**

- [x] 10. Checkpoint - Asegurar que las pruebas pasan
  - Ejecutar la suite completa y confirmar cimientos + suscripción + club + datos deportivos + clasificación. Ante dudas, consultar al usuario.

- [x] 11. Motor_Momentos: fotos, contexto, notas y votación
  - [x] 11.1 Implementar carga/captura y agrupación de fotos en el Momento
    - Escribir `POST /momentos/{partidoId}/fotos` que sube a object storage y asocia cada foto al Momento del partido; permitir múltiples fotos por partido.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 11.2 Implementar selección de Foto_Principal y regla de edición por cierre
    - Escribir `PUT /recuadros/{recuadroId}/foto-principal`: registra una única Foto_Principal (a lo sumo una). Permitir cambiar Foto_Principal y agregar/reemplazar fotos solo si la Temporada está `ACTIVA` y antes de `Fecha_Límite_Cierre`. Conservar fotos no principales sin incluirlas en impresión.
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 11.3 Implementar contexto de asistencia, sub-modalidad, notas y jugador
    - Escribir `PATCH /momentos/{momentoId}`: contexto (En Vivo Local/Visita/Transmisión), sub-modalidad solo válida en Transmisión, notas persistidas, y `Jugador_del_Partido` limitado a la alineación disponible.
    - _Requirements: 6.1, 6.4, 7.1, 7.2, 8.1, 8.2_

  - [ ]* 11.4 Escribir property test de agrupación de fotos en el Momento
    - **Property 6: Todas las fotos cargadas quedan agrupadas en el Momento del partido**
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 11.5 Escribir property test de Foto_Principal única
    - **Property 7: A lo sumo una Foto_Principal por Recuadro**
    - **Validates: Requirements 5.5**

  - [ ]* 11.6 Escribir property test de imprimibilidad exclusiva de la Foto_Principal
    - **Property 8: Solo la Foto_Principal es imprimible**
    - **Validates: Requirements 5.6**

  - [ ]* 11.7 Escribir property test de edición permitida solo antes del cierre
    - **Property 9: La edición de Foto_Principal solo se permite antes del cierre**
    - **Validates: Requirements 5.7**

  - [ ]* 11.8 Escribir property test de sub-modalidad ⇔ Transmisión
    - **Property 10: La sub-modalidad requiere contexto Transmisión**
    - **Validates: Requirements 6.4**

  - [ ]* 11.9 Escribir property test de round-trip de notas
    - **Property 11: Round-trip de bitácora personal**
    - **Validates: Requirements 7.2**

  - [ ]* 11.10 Escribir property test de Jugador_del_Partido en la alineación
    - **Property 12: El Jugador_del_Partido pertenece a la alineación**
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 11.11 Escribir pruebas por ejemplo de captura y contexto
    - Carga desde galería (5.1), captura (5.2), marcado de contexto (6.1), ingreso de notas (7.1).
    - _Requirements: 5.1, 5.2, 6.1, 7.1_

- [x] 12. Motor_Album: previsualización del álbum coleccionable
  - [x] 12.1 Implementar la previsualización de Recuadros
    - Escribir `GET /album/{temporadaId}/preview`: monta la Foto_Principal en su Recuadro numerado o muestra silueta punteada en los vacíos, e indica el conjunto de Recuadros sin Foto_Principal. Usar miniaturas optimizadas.
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 12.2 Escribir property test de fidelidad de la previsualización
    - **Property 19: La previsualización refleja fielmente el estado de los Recuadros**
    - **Validates: Requirements 11.1, 11.2, 11.3, 16.2**

  - [ ]* 12.3 Escribir prueba de integración de rendimiento de previsualización
    - Render <2s en red móvil simulada.
    - _Requirements: 19.2_

- [x] 13. Generador_Cards: Digital Cards y gating premium
  - [x] 13.1 Implementar la generación de Digital Cards con gating
    - Escribir `POST /cards`: compone foto del usuario + marcador + escudo en formato compatible. Consultar entitlements: rechazar cards de Partidos_Internacionales para Básico ("requiere Plan_Premium") y permitirlas para Premium.
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 13.2 Escribir property test de contenido de la Digital_Card
    - **Property 20: La Digital_Card contiene los elementos requeridos**
    - **Validates: Requirements 12.1**

  - [ ]* 13.3 Escribir property test de gating de Digital Cards internacionales
    - **Property 21: Gating de Digital Cards de Partidos_Internacionales**
    - **Validates: Requirements 12.3, 12.4**

- [x] 14. Checkpoint - Asegurar que las pruebas pasan
  - Ejecutar la suite y confirmar Motor_Momentos, Motor_Album y Generador_Cards. Ante dudas, consultar al usuario.

- [x] 15. Print_Engine: numeración, DPI, biunivocidad y atomicidad
  - [x] 15.1 Implementar el escalado a 300 DPI y su validación
    - Escribir la rutina de escalado que, dadas las dimensiones físicas del Recuadro/Plantilla y los píxeles de la foto, garantiza `px / (mm / 25,4) ≥ 300` en ambas dimensiones antes de imprimir.
    - _Requirements: 19.1_

  - [x] 15.2 Implementar la generación del PDF_Libro
    - Componer páginas con fondos del Club, estadísticas, plantillas y Recuadros numerados; montar Foto_Principal con guías de pegado numeradas; representar Recuadros vacíos con silueta punteada y guías numeradas; numerar de forma que corresponda al PDF_Stickers.
    - _Requirements: 16.5, 17.1, 17.2, 17.3, 17.4_

  - [x] 15.3 Implementar la generación del PDF_Stickers con numeración heredada
    - Generar un sticker numerado por cada Recuadro con Foto_Principal (numero heredado del Recuadro, secuencia posiblemente no contigua, sin renumeración densa), omitir vacíos, incluir guías de corte/troquelado con desviación ≤0,5 mm, y aplicar holograma según plan y clasificación.
    - _Requirements: 18.1, 18.2, 18.3, 18.5, 18.6_

  - [x] 15.4 Implementar la validación de biunivocidad y la generación atómica
    - Generar contra almacenamiento temporal; validar biunivocidad (conteo, sin faltantes ni duplicados) y DPI antes de publicar; ante discrepancia/fallo abortar sin PDF parcial y notificar.
    - _Requirements: 18.4, 18.7, 18.8_

  - [x] 15.5 Implementar la recuperación de impresión fallida
    - Tras abortar, reintentar de forma automática y acotada (≤3, backoff, contando `Pedido.intentosImpresion`); si persiste, pasar la Temporada/Pedido a `FALLIDA` y emitir alerta al operador, permitiendo relanzar la generación.
    - _Requirements: 18.7, 18.8_

  - [ ]* 15.6 Escribir property test de montaje/silueta en el PDF_Libro
    - **Property 24: Montaje o silueta según presencia de Foto_Principal en el PDF_Libro**
    - **Validates: Requirements 17.2, 17.3, 16.5**

  - [ ]* 15.7 Escribir property test de biunivocidad Recuadro↔Sticker
    - **Property 25: Correspondencia biunívoca "Recuadros con Foto_Principal" ↔ stickers generados**
    - **Validates: Requirements 17.4, 18.1, 18.2, 18.4**

  - [ ]* 15.8 Escribir property test de tolerancia de troquelado
    - **Property 26: Tolerancia de troquelado ≤ 0,5 mm**
    - **Validates: Requirements 18.3**

  - [ ]* 15.9 Escribir property test de efecto holograma por plan y clasificación
    - **Property 27: Efecto holograma por plan y clasificación**
    - **Validates: Requirements 18.5, 18.6**

  - [ ]* 15.10 Escribir property test de atomicidad de la generación de PDF
    - **Property 28: Atomicidad de la generación de PDF (nunca un PDF parcial)**
    - **Validates: Requirements 18.7, 18.8**

  - [ ]* 15.11 Escribir property test de escala mínima de 300 DPI
    - **Property 29: Escala mínima de 300 DPI para imprenta**
    - **Validates: Requirements 19.1**

  - [ ]* 15.12 Escribir pruebas de integración de recuperación de impresión
    - Reintento acotado, transición a `FALLIDA` y alerta al operador tras agotar reintentos, con el motor de PDF mockeado.
    - _Requirements: 18.7, 18.8_

  - [ ]* 15.13 Escribir prueba de snapshot del PDF_Libro
    - Verificar secciones: fondos, estadísticas, plantillas y recuadros numerados.
    - _Requirements: 17.1_

- [x] 16. Configuración administrativa y cierre de Temporada
  - [x] 16.1 Implementar la configuración de Fecha_Límite_Cierre (Config_Admin)
    - Escribir el flujo back-office para que el operador/administrador fije `fechaLimiteCierre` por Temporada/liga; la `Temporada.fechaLimiteCierre` refleja este valor y no lo calcula el sistema ni el usuario final.
    - _Requirements: 14.5, 16 (config admin)_

  - [x] 16.2 Implementar el cierre de Temporada y disparo del Print_Engine
    - Escribir el job de cierre automático en la Fecha_Límite_Cierre (sin confirmación) y el flujo de cierre anticipado confirmado; informar Recuadros sin Foto_Principal antes del cierre anticipado; proceder con impresión manteniendo vacíos.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 16.3 Escribir pruebas por ejemplo del cierre
    - Confirmación anticipada (16.1), disparo automático (16.3), disparo anticipado (16.4).
    - _Requirements: 16.1, 16.3, 16.4_

- [x] 17. Checkpoint - Asegurar que las pruebas pasan
  - Ejecutar la suite y confirmar Print_Engine + cierre + configuración administrativa (la lógica sensible a la corrección). Ante dudas, consultar al usuario.

- [x] 18. Servicio_Notificaciones anclado a hora local
  - [x] 18.1 Implementar recordatorios recurrentes de Recuadro vacío
    - Escribir la lógica basada en estado: recordatorio inicial al finalizar sin foto y reenvío ~cada 24h a la hora de envío en la zona horaria del usuario mientras el Recuadro siga vacío y no silenciado; detener al asignar Foto_Principal o al silenciar/descartar.
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 18.2 Implementar recordatorios de cierre escalonados en offsets locales
    - Emitir recordatorios cuando falten 30/15/7/1 día para la Fecha_Límite_Cierre, evaluados a la hora de envío en la zona horaria del usuario; notificar si falta Dirección_Envío válida al aproximarse el cierre.
    - _Requirements: 14.6, 15.3_

  - [ ]* 18.3 Escribir property test de recordatorio recurrente con condiciones de paro
    - **Property 22: Recordatorio recurrente de Recuadro con condiciones de paro**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

  - [ ]* 18.4 Escribir property test de offsets de cierre en hora local
    - **Property 23: Recordatorios de cierre en los offsets exactos (hora local del usuario)**
    - **Validates: Requirements 14.6**

- [x] 19. Servicio_Envío: dirección, pedido y tracking
  - [x] 19.1 Implementar registro/validación de dirección y estado del pedido
    - Escribir `PUT /envio/direccion` (registro y validación antes de la Fecha_Límite_Cierre) y `GET /pedido/{temporadaId}` (estado del Pedido e información de seguimiento tras el despacho).
    - _Requirements: 15.1, 15.2, 15.4_

  - [ ]* 19.2 Escribir pruebas por ejemplo/integración de envío
    - Registro y validación de dirección (15.1, 15.2), notificación por dirección faltante (15.3), estado del Pedido y tracking (15.4).
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 20. Seguridad y privacidad transversales
  - [x] 20.1 Implementar cifrado en reposo y solicitud/revocación de permisos en la app
    - Configurar cifrado AES-256 de objetos en reposo y el flujo de la App_Móvil para solicitar permisos (cámara/almacenamiento/geolocalización) conforme a GDPR/CCPA y cesar el uso del recurso al revocarse el permiso.
    - _Requirements: 5.8, 6.2, 6.3, 20.2, 20.3, 20.4_

  - [ ]* 20.2 Escribir pruebas por ejemplo de permisos y seguridad
    - Solicitud de permisos (5.8, 6.3, 20.3), cese de uso al revocar (20.4), humo de TLS habilitado (20.1) y AES-256 (20.2).
    - _Requirements: 5.8, 6.3, 20.1, 20.2, 20.3, 20.4_

- [x] 21. Capa de app móvil: personalización, captura y compartición
  - [x] 21.1 Implementar la UI personalizada por Club y la captura de momentos
    - Construir las pantallas que aplican la identidad visual del Club (paleta/escudo/estadio/camisetas), la carga/captura de fotos y la selección de Foto_Principal, consumiendo los endpoints del backend.
    - _Requirements: 2.1, 2.2, 5.1, 5.2, 6.1_

  - [x] 21.2 Implementar la compartición nativa a redes sociales
    - Ofrecer publicación directa en Instagram Stories, WhatsApp, X y TikTok e invocar la integración nativa con la Digital_Card seleccionada.
    - _Requirements: 13.1, 13.2_

  - [ ]* 21.3 Escribir pruebas de snapshot del tema visual por Club
    - Aplicación de paleta/escudo/activos al seleccionar y actualizar el Club (2.1, 2.2), y formato compatible de Digital_Card (12.2).
    - _Requirements: 2.1, 2.2, 12.2_

  - [ ]* 21.4 Escribir prueba de integración de compartición nativa
    - Invocación de la integración nativa por plataforma.
    - _Requirements: 13.2_

- [x] 22. Wiring del Programador de Jobs y compatibilidad de plataforma
  - [x] 22.1 Cablear el Programador de Jobs con los servicios
    - Conectar los jobs de sincronización deportiva (6h), recordatorios (recurrentes y de cierre) y cierre automático con `Servicio_Datos_Deportivos`, `Servicio_Notificaciones` y `Print_Engine`.
    - _Requirements: 9.1, 14.2, 14.6, 16.3_

  - [ ]* 22.2 Escribir pruebas de humo de compatibilidad de plataforma
    - Ejecución en iOS 15+ (21.1) y Android 8.0 API 26+ (21.2) sobre emuladores de referencia.
    - _Requirements: 21.1, 21.2_

- [x] 23. Checkpoint final - Asegurar que todas las pruebas pasan
  - Ejecutar la suite completa (unit, PBT, integración, snapshot, humo) y confirmar la integración extremo a extremo. Ante dudas, consultar al usuario.

- [x] 24. Preparar el proyecto de la App_Móvil (React Native + TypeScript)
  - Inicializar un proyecto React Native con TypeScript en `app/`, con estructura `src/screens`, `src/navigation`, `src/theme`, `src/net`, `src/adapters`, `src/viewmodels`, `src/storage`.
  - Configurar linter/formatter y el runner de pruebas del cliente (Jest + React Native Testing Library) y un config de e2e (Detox) para emuladores iOS 15+/Android 8.0+.
  - Reutilizar (re-exportar) los view-models framework-agnósticos existentes del repositorio (`src/app`: `ClubThemeViewModel`, `CaptureViewModel`, `ShareViewModel`) desde `app/src/viewmodels` sin reimplementarlos.
  - Nota: la ejecución/compilación requiere toolchain de React Native (Node, Metro, Xcode/Android SDK) y las pruebas e2e requieren emuladores.
  - _Requirements: 21.1, 21.2_

- [x] 25. Módulo de red y sesión del cliente
  - [x] 25.1 Implementar el cliente HTTP con TLS obligatorio y adjunto de Access_Token
    - Crear en `app/src/net` un cliente HTTP que imponga TLS (rechazar no-TLS) y adjunte el Access_Token vigente a cada petición autenticada.
    - _Requirements: 22.3, 28.1_
  - [x] 25.2 Implementar el refresh single-flight con rotación y reintento
    - Ante 401 por expiración, ejecutar un refresh único (deduplicado) vía `POST /auth/refresh`, rotar el Refresh_Token y reintentar la petición original; si el refresh responde 401, purgar el Almacenamiento_Seguro y enrutar al login.
    - _Requirements: 22.4, 22.5, 27.1_
  - [x] 25.3 Implementar el almacenamiento seguro de tokens
    - Guardar el Refresh_Token en Keychain (iOS) / Keystore (Android) y eliminarlo al cerrar sesión o borrar cuenta.
    - _Requirements: 28.2, 28.3, 28.4_
  - [x] 25.4 Implementar el mapeo de errores del backend y la resiliencia de red
    - Mapear 401 (refresh/relogin), 409 (conflicto de Club, mostrar mensaje) y rechazo por gating ("requiere Plan_Premium") a manejo visible; aplicar timeouts y reintentos acotados para GET idempotentes sin bloquear la UI.
    - _Requirements: 27.2, 27.3, 27.4, 27.5_
  - [ ]* 25.5 Escribir pruebas del módulo de red
    - Refresh transparente con rotación y reintento, single-flight de refresh concurrente, refresh 401 → logout, rechazo de no-TLS, timeout con reintento sin bloquear.
    - _Requirements: 22.4, 22.5, 27.1, 27.4, 28.1_

- [x] 26. Autenticación, sesión y ajustes de cuenta en el cliente
  - [x] 26.1 Implementar las pantallas de login multiproveedor y logout
    - Pantalla de login/registro con Apple/Google/email contra el Servicio_Autenticación; al recibir el par de tokens, almacenar el Refresh_Token y dar acceso; logout que invalida el refresh y limpia tokens.
    - _Requirements: 22.1, 22.2, 22.6_
  - [x] 26.2 Implementar el borrado de cuenta con confirmación
    - Flujo de Ajustes que requiere confirmación explícita de que el borrado es permanente, invoca `DELETE /cuenta`, borra tokens y redirige al login.
    - _Requirements: 22.7, 22.8_
  - [ ]* 26.3 Escribir pruebas de los flujos de sesión y borrado de cuenta
    - Login válido/ inválido, almacenamiento seguro del token, confirmación y borrado de cuenta.
    - _Requirements: 22.1, 22.2, 22.7, 22.8_

- [x] 27. Tema del Club y navegación
  - [x] 27.1 Implementar el provider de Tema_Club
    - Enlazar `ClubThemeViewModel` a un context/provider de React que aplique paleta/escudo/activos a la UI; invocar `PUT /usuario/club` al seleccionar Club y actualizar el tema; manejar el 409 por Temporada activa mostrando el mensaje y conservando el Club actual.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_
  - [x] 27.2 Implementar la navegación y el grafo de pantallas
    - Configurar React Navigation (stack + tabs) con las pantallas: Login, Selección de Club, Home/Álbum, Captura, Detalle/Card, Suscripción, Envío/Pedido, Ajustes.
    - _Requirements: 21.1, 21.2_
  - [ ]* 27.3 Escribir pruebas de aplicación del tema y contraste
    - Mapeo de IdentidadVisual a tema y contraste ≥ 4.5:1; actualización de tema al cambiar de Club.
    - _Requirements: 23.2, 23.4, 29.1_

- [x] 28. Captura de momentos y permisos en el cliente
  - [x] 28.1 Implementar la pantalla de captura y agrupación de fotos
    - Cargar desde galería / tomar con cámara y subir múltiples fotos por partido vía `POST /momentos/{partidoId}/fotos`, enlazando el `CaptureViewModel`.
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 28.2 Implementar la selección de Foto_Principal y el contexto del Momento
    - `PUT /recuadros/{recuadroId}/foto-principal` y `PATCH /momentos/{momentoId}` con contexto (En Vivo Local/Visita/Transmisión), sub-modalidad solo en Transmisión, notas y Jugador_del_Partido; reflejar los errores de negocio del backend.
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.13_
  - [x] 28.3 Implementar el flujo de permisos del dispositivo (GDPR/CCPA)
    - Solicitar cámara/almacenamiento/geolocalización antes de usar el recurso, explicar el motivo y cesar el uso al revocarse el permiso.
    - _Requirements: 24.1, 24.2, 24.3, 24.4_
  - [ ]* 28.4 Escribir pruebas de captura y permisos
    - Carga/captura, múltiples fotos, selección de Foto_Principal y contexto; solicitud/revocación de permisos.
    - _Requirements: 3.3, 3.4, 24.2, 24.4_

- [x] 29. Previsualización del álbum, Digital Cards y compartición
  - [x] 29.1 Implementar la pantalla de previsualización del álbum
    - Consumir `GET /album/{temporadaId}/preview` y renderizar Recuadros montados con miniaturas optimizadas, siluetas para vacíos e indicación de faltantes, sin bloquear la UI.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 29.2 Implementar la generación de Digital Card y su gating visible
    - `POST /cards` y presentación de la card; ante rechazo por gating, mostrar el mensaje "requiere Plan_Premium" sin decidir el gating en el cliente.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 29.3 Implementar la compartición nativa a redes
    - Ofrecer Instagram Stories, WhatsApp, X y TikTok e invocar la integración nativa vía un adaptador de `NativeShareBridge`, capturando el resultado.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 29.4 Escribir pruebas de previsualización, gating y compartición
    - Estados montada/silueta/faltantes, mensaje de gating, y despacho por plataforma del share.
    - _Requirements: 4.2, 4.3, 5.3, 6.2_

- [x] 30. Suscripción (IAP), envío y notificaciones en el cliente
  - [x] 30.1 Implementar la pantalla de suscripción con compra y upgrade vía IAP
    - `GET /subscription` para plan/estado/catálogo; compra y upgrade con IAP de App Store/Google Play enviando el comprobante (`POST /subscription/purchase`, `POST /subscription/upgrade`); reflejar `GET /entitlements` sin recalcular derechos.
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6_
  - [x] 30.2 Implementar el registro y envío del Pedido
    - `PUT /envio/direccion` (con manejo de error de validación / cierre alcanzado) y `GET /pedido/{temporadaId}` para estado y tracking.
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 30.3 Implementar el registro de notificaciones push y su renderizado
    - Obtener permiso y Token_Push (APNs/FCM) y registrarlo en el backend; mostrar recordatorios de Recuadro vacío y de cierre escalonado; permitir silenciar; operar sin permiso.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_
  - [x] 30.4 Implementar el cierre anticipado de Temporada desde el cliente
    - Mostrar los Recuadros sin Foto_Principal, requerir confirmación explícita, enviar la solicitud de cierre y reflejar el estado devuelto.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [ ]* 30.5 Escribir pruebas de suscripción, envío y notificaciones
    - Compra/upgrade IAP en sandbox, estado/tracking del pedido, registro de Token_Push, cierre anticipado con confirmación.
    - _Requirements: 25.2, 25.3, 8.4, 26.1, 10.2_

- [x] 31. Checkpoint del cliente móvil - Accesibilidad, compatibilidad y e2e
  - Verificar accesibilidad (etiquetas para lectores de pantalla, contraste ≥ 4.5:1, escalado de fuente del SO) y compatibilidad iOS 15+/Android 8.0+.
  - [ ]* 31.1 Escribir pruebas e2e del cliente (Detox) en emuladores
    - Flujos: login, selección de Club, captura+Foto_Principal+contexto, previsualización, compra/upgrade IAP en sandbox, compartición nativa, registro de Token_Push.
    - _Requirements: 21.1, 21.2, 29.2, 29.3_

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido; corresponden a pruebas (unit, propiedades, integración, snapshot, humo).
- Cada tarea referencia requerimientos específicos para trazabilidad; cada property test referencia su propiedad del diseño.
- Los tests de propiedades usan `fast-check` con mínimo 100 iteraciones y la etiqueta `// Feature: digital-football-album, Property {n}: {texto}`.
- Los generadores de PBT deben cubrir edge cases: fixtures con amistosos y campos inválidos, álbumes con 0/N recuadros con/sin Foto_Principal (incluyendo numeración de stickers no contigua), fotos de dimensiones extremas contra distintas dimensiones físicas de Recuadro, clasificaciones mixtas para holograma, usuarios con Temporadas en todos los estados, zonas horarias diversas y estados de usuario con múltiples fotos/momentos/recuadros/pedidos.
- Los checkpoints aseguran validación incremental de la lógica sensible a la corrección antes de avanzar.
- La lógica de I/O (API deportiva, IAP, webhooks, PDFs binarios, push, borrado en object storage) se aísla con mocks para permitir 100+ iteraciones de PBT a bajo costo.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "4.1", "6.1", "7.2", "8.2", "9.1"] },
    { "id": 4, "tasks": ["3.3", "4.2", "6.2", "6.3", "8.3", "8.4", "9.2", "9.3", "9.4"] },
    { "id": 5, "tasks": ["6.4", "6.5", "6.6", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11"] },
    { "id": 6, "tasks": ["11.1", "13.1", "16.1"] },
    { "id": 7, "tasks": ["11.2", "11.3", "12.1", "13.2", "13.3", "16.2"] },
    { "id": 8, "tasks": ["11.4", "11.5", "11.6", "11.7", "11.8", "11.9", "11.10", "11.11", "12.2", "12.3", "16.3"] },
    { "id": 9, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 10, "tasks": ["15.4", "15.6", "15.7", "15.8", "15.9", "15.11", "15.13"] },
    { "id": 11, "tasks": ["15.5", "15.10", "15.12"] },
    { "id": 12, "tasks": ["18.1", "18.2", "19.1", "20.1"] },
    { "id": 13, "tasks": ["18.3", "18.4", "19.2", "20.2", "21.1", "21.2"] },
    { "id": 14, "tasks": ["21.3", "21.4", "22.1"] },
    { "id": 15, "tasks": ["22.2"] },
    { "id": 16, "tasks": ["24"] },
    { "id": 17, "tasks": ["25.1", "25.3"] },
    { "id": 18, "tasks": ["25.2", "25.4", "25.5", "27.1", "27.2"] },
    { "id": 19, "tasks": ["26.1", "26.2", "26.3", "27.3", "28.1", "28.3", "29.1"] },
    { "id": 20, "tasks": ["28.2", "28.4", "29.2", "29.3", "29.4", "30.1", "30.2", "30.3", "30.4"] },
    { "id": 21, "tasks": ["30.5", "31", "31.1"] }
  ]
}
```
