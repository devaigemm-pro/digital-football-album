# Requirements Document

## Introduction

Álbum de Fútbol Digital es una aplicación móvil multiplataforma (iOS y Android) para fanáticos del fútbol que permite registrar la experiencia de cada partido oficial de la temporada, ya sea en el estadio o por transmisión, guardando fotografías, notas personales y datos estadísticos oficiales. El álbum tiene exactamente un recuadro por cada partido oficial de la temporada del club seleccionado, y su tamaño se deriva del fixture oficial obtenido de la API deportiva. Al alcanzarse la fecha límite de cierre, la plataforma cierra la temporada automáticamente y genera un kit de álbum impreso: un libro físico maquetado con recuadros numerados y un paquete de fotografías impresas en formato sticker coleccionable para pegar manualmente.

El sistema integra autenticación multiproveedor, personalización visual según el club seleccionado, un motor de captura de momentos con selección de foto principal por recuadro, sincronización con una API deportiva externa, clasificación de partidos por tipo, previsualización del álbum coleccionable, exportación a redes sociales, notificaciones y recordatorios, gestión del envío del kit físico, diferenciación de funciones por plan de suscripción y un motor de generación de archivos de impresión (Print Engine) que produce dos PDFs listos para imprenta con alineación milimétrica.

Este documento define los requerimientos funcionales y no funcionales derivados del SRS v2.0 y de las decisiones aclaradas con el usuario.

## Glossary

- **Sistema**: La plataforma completa del Álbum de Fútbol Digital, incluyendo la app móvil y los servicios de respaldo.
- **App_Móvil**: La aplicación cliente ejecutada en dispositivos iOS y Android.
- **Servicio_Autenticación**: Componente responsable del registro e inicio de sesión de usuarios.
- **Motor_Momentos**: Componente (Moments Engine) que gestiona la captura y el registro de fotos, contexto, notas y votaciones de cada partido.
- **Servicio_Suscripción**: Componente que gestiona planes, pagos recurrentes y upgrades mediante compras dentro de la app.
- **Servicio_Datos_Deportivos**: Componente que consume la API deportiva externa (por ejemplo Sportmonks o API-Football) para obtener fixtures, resultados, alineaciones, competiciones y eventos.
- **Motor_Album**: Componente que renderiza la previsualización del álbum coleccionable digital.
- **Generador_Cards**: Componente que crea imágenes con estética de cromos para compartir en redes sociales.
- **Servicio_Notificaciones**: Componente que gestiona el envío de notificaciones push y recordatorios al usuario.
- **Servicio_Envío**: Componente que gestiona la captura y validación de la dirección de envío, el estado del pedido y la información de seguimiento del kit físico.
- **Print_Engine**: Motor de generación de archivos de impresión que produce los PDFs del libro y de las planchas de stickers.
- **Temporada**: Conjunto de partidos oficiales del Club dentro del año calendario o temporada correspondiente.
- **Partido_Oficial**: Partido del Club correspondiente a la liga doméstica, copas nacionales o competiciones internacionales; excluye los partidos amistosos.
- **Clásico**: Partido_Oficial disputado contra un rival identificado en una lista predefinida de rivalidades por Club.
- **Partido_Internacional**: Partido_Oficial correspondiente a una competición o torneo internacional según la clasificación obtenida de la API deportiva externa.
- **Recuadro**: Espacio numerado del álbum correspondiente a un único Partido_Oficial de la Temporada, donde se monta la Foto_Principal.
- **Foto_Principal**: Fotografía seleccionada por el usuario para un Recuadro, que es la que se monta e imprime en ese Recuadro.
- **Momento**: Registro de un Partido_Oficial que incluye una o más fotos, contexto de asistencia, notas y votación opcional.
- **Contexto_Asistencia**: Marcado que indica la modalidad de vivencia del partido (En Vivo Local, En Vivo Visita, o Transmisión).
- **Jugador_del_Partido**: Selección del usuario del mejor jugador de un partido (Man of the Match).
- **Digital_Card**: Imagen generada con estética de cromo que combina foto del usuario, marcador y escudo del club.
- **PDF_Libro**: Archivo de impresión del libro del álbum con páginas, fondos, estadísticas y recuadros numerados.
- **PDF_Stickers**: Archivo de impresión de las planchas de stickers numerados con guías de corte y troquelado.
- **Fecha_Límite_Cierre**: Fecha definida por el Sistema en la que la Temporada se cierra automáticamente y se dispara la generación de los archivos de impresión.
- **Dirección_Envío**: Dirección física registrada por el usuario a la que se despacha el kit de álbum impreso.
- **Pedido**: Registro del kit físico solicitado tras el cierre de la Temporada, con su estado e información de seguimiento del envío.
- **Club**: Equipo de fútbol principal seleccionado por el usuario, que determina la personalización visual.
- **Plan_Básico**: Suscripción anual de $39.99 con funciones digitales limitadas.
- **Plan_Premium**: Suscripción anual de $79.99 que desbloquea la generación de Digital Cards de encuentros internacionales y stickers con efecto holograma para Clásicos y Partidos_Internacionales.
- **API_Gateway**: Punto de borde que termina TLS, autentica peticiones con el access token y enruta a los servicios de respaldo.
- **Access_Token**: Token de sesión de corta duración que la App_Móvil envía en cada petición autenticada.
- **Refresh_Token**: Token de larga duración que la App_Móvil usa para renovar el Access_Token; se rota en cada renovación.
- **IdentidadVisual**: Conjunto de recursos visuales del Club (paleta de colores, escudo, imágenes de estadio y camisetas) que el Sistema devuelve al asignar Club.
- **Tema_Club**: Descriptor de tema visual que la App_Móvil deriva de la IdentidadVisual y aplica a la interfaz.
- **Entitlements**: Derechos del usuario derivados de su plan (Digital Cards internacionales y holograma), decididos por el Sistema.
- **Token_Push**: Identificador del dispositivo para recibir notificaciones push (APNs / FCM), registrado en el Sistema.
- **Almacenamiento_Seguro**: Mecanismo del sistema operativo para guardar credenciales sensibles cifradas (llavero de iOS / Keystore de Android).

## Requirements

### Requerimiento 1: Registro e Inicio de Sesión

**Historia de Usuario:** Como fanático del fútbol, quiero registrarme e iniciar sesión con distintos proveedores, para acceder a mi cuenta de forma rápida y segura.

#### Criterios de Aceptación

1. THE Servicio_Autenticación SHALL ofrecer registro e inicio de sesión mediante Apple ID, cuenta de Google y correo electrónico.
2. WHEN un usuario completa el inicio de sesión con credenciales válidas, THE Servicio_Autenticación SHALL crear una sesión autenticada y dar acceso a la App_Móvil.
3. IF las credenciales proporcionadas son inválidas, THEN THE Servicio_Autenticación SHALL rechazar el acceso y mostrar un mensaje de error descriptivo.
4. WHEN un usuario se registra por primera vez con correo electrónico, THE Servicio_Autenticación SHALL crear una cuenta nueva asociada a ese correo.

### Requerimiento 2: Selección de Club y Personalización Dinámica

**Historia de Usuario:** Como hincha, quiero seleccionar mi club principal, para que la interfaz refleje la identidad visual de mi equipo.

#### Criterios de Aceptación

1. WHEN un usuario selecciona un Club, THE Sistema SHALL aplicar la paleta de colores, el escudo, las imágenes de estadio y las camisetas asociadas a ese Club.
2. WHILE un Club está seleccionado, THE App_Móvil SHALL mostrar la interfaz personalizada con la identidad visual de ese Club.
3. WHEN un usuario cambia el Club seleccionado, THE Sistema SHALL actualizar la personalización visual para reflejar el nuevo Club.

### Requerimiento 3: Gestión de Suscripción y Diferenciación de Planes

**Historia de Usuario:** Como usuario, quiero suscribirme y actualizar mi plan mediante compras dentro de la app, para acceder a las funciones según mi nivel de pago.

#### Criterios de Aceptación

1. THE Servicio_Suscripción SHALL ofrecer un Plan_Básico a $39.99 por año y un Plan_Premium a $79.99 por año.
2. WHEN un usuario inicia una compra de suscripción, THE Servicio_Suscripción SHALL procesar el pago mediante las compras dentro de la app de App Store o Google Play.
3. WHEN un pago recurrente se completa correctamente, THE Servicio_Suscripción SHALL activar o renovar el plan del usuario.
4. WHEN un usuario solicita un upgrade de Plan_Básico a Plan_Premium, THE Servicio_Suscripción SHALL aplicar el cambio de plan tras confirmar el pago.
5. IF un pago recurrente falla, THEN THE Servicio_Suscripción SHALL notificar al usuario y mantener el estado de suscripción previo hasta que el pago se resuelva.
6. WHERE el usuario tiene Plan_Básico, THE Sistema SHALL restringir la generación de Digital Cards de Partidos_Internacionales y los stickers con efecto holograma para Clásicos y Partidos_Internacionales.
7. WHERE el usuario tiene Plan_Premium, THE Sistema SHALL habilitar la generación de Digital Cards de Partidos_Internacionales y los stickers con efecto holograma para Clásicos y Partidos_Internacionales.

### Requerimiento 4: Definición y Estructura del Álbum

**Historia de Usuario:** Como coleccionista, quiero que el álbum represente todos los partidos oficiales de la temporada de mi club, para tener un recuadro por cada partido oficial disputado.

#### Criterios de Aceptación

1. THE Sistema SHALL incluir en el álbum de la Temporada exactamente un Recuadro por cada Partido_Oficial del Club seleccionado.
2. THE Sistema SHALL considerar como Partidos_Oficiales los partidos del Club correspondientes a la liga doméstica, las copas nacionales y las competiciones internacionales, excluyendo los partidos amistosos.
3. WHEN el Servicio_Datos_Deportivos obtiene el fixture oficial de la Temporada desde la API deportiva externa, THE Sistema SHALL derivar la cantidad de Recuadros del álbum a partir de la cantidad de Partidos_Oficiales de ese fixture.
4. WHEN el fixture oficial de la Temporada se actualiza con partidos oficiales adicionales o retirados, THE Sistema SHALL actualizar la cantidad de Recuadros del álbum para mantener la correspondencia de exactamente un Recuadro por Partido_Oficial.

### Requerimiento 5: Captura, Registro y Selección de Fotos

**Historia de Usuario:** Como hincha, quiero cargar varias fotos de cada partido y elegir la que se imprimirá, para controlar qué imagen representa cada recuadro.

#### Criterios de Aceptación

1. THE Motor_Momentos SHALL permitir la carga de fotografías desde la galería del dispositivo.
2. THE Motor_Momentos SHALL permitir la captura directa de fotografías dentro de la App_Móvil.
3. THE Motor_Momentos SHALL permitir cargar o capturar varias fotografías para un mismo Partido_Oficial.
4. WHEN un usuario carga o captura una fotografía, THE Motor_Momentos SHALL asociar esa fotografía al Momento del Partido_Oficial correspondiente.
5. WHEN un usuario marca una fotografía como Foto_Principal de un Recuadro, THE Motor_Momentos SHALL registrar esa fotografía como la única Foto_Principal de ese Recuadro.
6. THE Motor_Momentos SHALL almacenar las fotografías que no son Foto_Principal sin incluirlas en los archivos de impresión.
7. WHILE la Temporada no haya alcanzado la Fecha_Límite_Cierre, THE Motor_Momentos SHALL permitir al usuario cambiar la Foto_Principal de un Recuadro y agregar o reemplazar fotografías de un Partido_Oficial.
8. IF el usuario no ha otorgado permiso de cámara o almacenamiento al intentar capturar o cargar una foto, THEN THE App_Móvil SHALL solicitar el permiso correspondiente antes de continuar.

### Requerimiento 6: Contexto de Asistencia

**Historia de Usuario:** Como hincha, quiero marcar cómo viví cada partido, para registrar el contexto de mi asistencia.

#### Criterios de Aceptación

1. WHEN un usuario registra un Momento, THE Motor_Momentos SHALL permitir marcar el Contexto_Asistencia como En Vivo Local, En Vivo Visita o Transmisión.
2. WHERE el Contexto_Asistencia es En Vivo, THE Motor_Momentos SHALL ofrecer verificación opcional por geolocalización.
3. IF el usuario no ha otorgado permiso de geolocalización al solicitar la verificación por ubicación, THEN THE App_Móvil SHALL solicitar el permiso de geolocalización antes de continuar.
4. WHERE el Contexto_Asistencia es Transmisión, THE Motor_Momentos SHALL permitir especificar la sub-modalidad Televisión, Bar o Streaming.

### Requerimiento 7: Bitácora Personal

**Historia de Usuario:** Como hincha, quiero escribir notas y anécdotas de cada partido, para conservar mis reflexiones de la jornada.

#### Criterios de Aceptación

1. WHEN un usuario registra un Momento, THE Motor_Momentos SHALL permitir ingresar notas de texto con reflexiones o anécdotas de la jornada.
2. THE Motor_Momentos SHALL almacenar las notas ingresadas asociadas al Momento correspondiente.

### Requerimiento 8: Votación de Jugador del Partido

**Historia de Usuario:** Como hincha, quiero elegir al Jugador del Partido, para dejar registrada mi opinión de la jornada.

#### Criterios de Aceptación

1. WHEN un usuario registra un Momento, THE Motor_Momentos SHALL permitir seleccionar un Jugador_del_Partido entre los jugadores de la alineación disponible.
2. THE Motor_Momentos SHALL almacenar la selección de Jugador_del_Partido asociada al Momento correspondiente.

### Requerimiento 9: Integración de Datos Deportivos

**Historia de Usuario:** Como usuario, quiero que la app sincronice datos oficiales de los partidos, para que mis registros tengan información deportiva precisa.

#### Criterios de Aceptación

1. WHEN se cumpla el intervalo de sincronización de 6 horas o el usuario inicie una sincronización manual, THE Servicio_Datos_Deportivos SHALL obtener los fixtures, fechas y horarios de los partidos desde la API deportiva externa dentro de un plazo máximo de 30 segundos.
2. IF la API deportiva externa retorna fixtures con campos obligatorios ausentes o inválidos (fecha, horario o identificador de partido), THEN THE Servicio_Datos_Deportivos SHALL descartar únicamente los registros inválidos, conservar los registros válidos y registrar el error con una indicación del motivo del descarte.
3. WHEN un Partido_Oficial cambie su estado a finalizado en la API deportiva externa, THE Servicio_Datos_Deportivos SHALL obtener el resultado final, la alineación inicial y los eventos clave del partido dentro de un plazo máximo de 5 minutos tras la finalización.
4. WHEN un usuario cargue una fotografía asociada a un partido, THE Servicio_Datos_Deportivos SHALL enlazar esa fotografía con la ficha técnica oficial del Partido_Oficial correspondiente identificado de forma unívoca.
5. IF una fotografía cargada no puede asociarse a un partido con identificador único (ninguna coincidencia o múltiples coincidencias posibles), THEN THE Servicio_Datos_Deportivos SHALL conservar la fotografía sin enlace, marcarla como pendiente de asociación y notificar al usuario que el enlace automático no fue posible.
6. IF la API deportiva externa no responde dentro de 30 segundos o retorna un error, THEN THE Servicio_Datos_Deportivos SHALL registrar el error, reintentar la sincronización hasta un máximo de 3 intentos con intervalos crecientes, y permitir que el usuario continúe registrando el Momento sin bloqueo.

### Requerimiento 10: Clasificación de Partidos

**Historia de Usuario:** Como hincha, quiero que la app clasifique cada partido por tipo, para aplicar las funciones premium correspondientes a clásicos y partidos internacionales.

#### Criterios de Aceptación

1. WHEN el Servicio_Datos_Deportivos obtiene un Partido_Oficial desde la API deportiva externa, THE Sistema SHALL clasificar ese Partido_Oficial por tipo.
2. WHEN el rival de un Partido_Oficial figura en la lista predefinida de rivalidades del Club, THE Sistema SHALL clasificar ese Partido_Oficial como Clásico.
3. WHEN la competición o torneo de un Partido_Oficial obtenido de la API deportiva externa corresponde a una competición internacional, THE Sistema SHALL clasificar ese Partido_Oficial como Partido_Internacional.
4. THE Sistema SHALL utilizar la clasificación de cada Partido_Oficial para determinar la aplicación de las reglas de holograma en stickers y de generación de Digital Cards premium.

### Requerimiento 11: Previsualización del Álbum Coleccionable

**Historia de Usuario:** Como coleccionista, quiero ver una simulación del álbum físico, para saber qué recuadros ya tengo y cuáles me faltan.

#### Criterios de Aceptación

1. THE Motor_Album SHALL mostrar una vista previa del álbum físico donde la Foto_Principal de cada Recuadro aparece montada en su Recuadro numerado correspondiente.
2. WHERE un Recuadro no tiene Foto_Principal asignada, THE Motor_Album SHALL mostrar una silueta punteada vacía que indica un Recuadro faltante.
3. WHEN el usuario consulta la previsualización antes de la Fecha_Límite_Cierre, THE Motor_Album SHALL indicar cuáles Recuadros están sin Foto_Principal.

### Requerimiento 12: Generación de Digital Cards

**Historia de Usuario:** Como hincha, quiero generar cromos digitales de mis momentos, para compartirlos con estética de colección.

#### Criterios de Aceptación

1. WHEN un usuario solicita generar una Digital_Card a partir de un Momento, THE Generador_Cards SHALL crear una imagen con estética de cromo que incluya la fotografía del usuario, el marcador del partido y el escudo del Club.
2. THE Generador_Cards SHALL producir la Digital_Card en un formato de imagen compatible con las plataformas de destino.
3. WHERE el usuario tiene Plan_Premium, THE Generador_Cards SHALL permitir generar Digital Cards a partir de Momentos de Partidos_Internacionales.
4. IF un usuario con Plan_Básico solicita generar una Digital_Card de un Partido_Internacional, THEN THE Generador_Cards SHALL rechazar la solicitud e informar que esa función requiere Plan_Premium.

### Requerimiento 13: Publicación en Redes Sociales

**Historia de Usuario:** Como hincha, quiero compartir mis cromos digitales en redes sociales, para mostrar mi experiencia a otros.

#### Criterios de Aceptación

1. WHEN un usuario solicita compartir una Digital_Card, THE App_Móvil SHALL ofrecer la publicación directa en Instagram Stories, WhatsApp, X (Twitter) y TikTok.
2. WHEN un usuario confirma compartir en una plataforma de destino, THE App_Móvil SHALL invocar la integración nativa de esa plataforma con la Digital_Card seleccionada.

### Requerimiento 14: Notificaciones y Recordatorios

**Historia de Usuario:** Como hincha, quiero recibir recordatorios sobre fotos pendientes y el cierre de temporada, para completar mi álbum antes de la impresión.

#### Criterios de Aceptación

1. WHEN un Partido_Oficial cambia a finalizado y su Recuadro no tiene Foto_Principal, THE Servicio_Notificaciones SHALL enviar una notificación push recordando al usuario subir la fotografía de ese Recuadro.
2. WHILE un Recuadro de un Partido_Oficial finalizado permanezca sin Foto_Principal y el usuario no haya descartado ni silenciado el recordatorio, THE Servicio_Notificaciones SHALL reenviar la notificación push del recordatorio cada 24 horas.
3. WHEN el usuario asigna una Foto_Principal al Recuadro, THE Servicio_Notificaciones SHALL detener el recordatorio recurrente de ese Recuadro.
4. WHEN el usuario descarta o silencia el recordatorio de un Recuadro, THE Servicio_Notificaciones SHALL detener el recordatorio recurrente de ese Recuadro.
5. THE Sistema SHALL definir una Fecha_Límite_Cierre para la Temporada.
6. WHEN falten 30, 15, 7 y 1 día para la Fecha_Límite_Cierre, THE Servicio_Notificaciones SHALL enviar un recordatorio avisando al usuario que el álbum debe completarse antes de la impresión.

### Requerimiento 15: Envío del Kit Físico

**Historia de Usuario:** Como usuario, quiero registrar mi dirección de envío y seguir mi pedido, para recibir el kit de álbum impreso.

#### Criterios de Aceptación

1. THE Servicio_Envío SHALL permitir al usuario registrar una Dirección_Envío para la recepción del kit de álbum impreso.
2. WHEN un usuario registra o modifica la Dirección_Envío, THE Servicio_Envío SHALL validar la Dirección_Envío antes de la Fecha_Límite_Cierre.
3. IF no existe una Dirección_Envío válida al aproximarse la Fecha_Límite_Cierre, THEN THE Servicio_Notificaciones SHALL notificar al usuario que registre una Dirección_Envío válida.
4. WHEN el kit de álbum impreso se despacha, THE Servicio_Envío SHALL mostrar el estado del Pedido y la información de seguimiento del envío.

### Requerimiento 16: Cierre de Temporada e Impresión Automática

**Historia de Usuario:** Como usuario, quiero que la temporada se cierre y se genere la impresión automáticamente en la fecha límite, para recibir mi álbum sin depender de una confirmación manual.

#### Criterios de Aceptación

1. WHEN un usuario inicia el flujo de cierre anticipado de temporada, THE Sistema SHALL permitir de forma opcional que el usuario confirme que las fotografías están listas para imprenta.
2. WHILE existan Recuadros sin Foto_Principal en el álbum, THE Sistema SHALL informar al usuario cuáles Recuadros están sin Foto_Principal antes de una confirmación de cierre anticipado.
3. WHEN se alcanza la Fecha_Límite_Cierre, THE Sistema SHALL cerrar la Temporada automáticamente sin requerir confirmación del usuario y disparar la generación de los archivos de impresión mediante el Print_Engine.
4. WHEN el usuario confirma el cierre anticipado de temporada, THE Sistema SHALL cerrar la Temporada y disparar la generación de los archivos de impresión mediante el Print_Engine antes de la Fecha_Límite_Cierre.
5. IF existen Recuadros sin Foto_Principal al momento del cierre, THEN THE Sistema SHALL proceder con la generación de los archivos de impresión y mantener esos Recuadros vacíos.

### Requerimiento 17: Generación de PDF del Libro del Álbum

**Historia de Usuario:** Como usuario, quiero que la app genere el PDF del libro del álbum, para imprimir el libro físico coleccionable.

#### Criterios de Aceptación

1. WHEN el Print_Engine genera el PDF_Libro, THE Print_Engine SHALL incluir las páginas con los fondos del Club, las estadísticas, las plantillas y los Recuadros numerados.
2. WHEN el Print_Engine genera el PDF_Libro para un Recuadro con Foto_Principal, THE Print_Engine SHALL montar la Foto_Principal de ese Recuadro con sus guías de pegado numeradas.
3. IF un Recuadro no tiene Foto_Principal al momento del cierre, THEN THE Print_Engine SHALL representar ese Recuadro vacío en el PDF_Libro con su silueta punteada y sus guías de pegado numeradas.
4. WHEN el Print_Engine produce el PDF_Libro, THE Print_Engine SHALL numerar cada Recuadro de forma que corresponda con el sticker numerado del PDF_Stickers.

### Requerimiento 18: Generación de PDF de Planchas de Stickers

**Historia de Usuario:** Como usuario, quiero que la app genere el PDF de las planchas de stickers, para imprimir las láminas coleccionables recortables.

#### Criterios de Aceptación

1. WHEN el Print_Engine genera el PDF_Stickers, THE Print_Engine SHALL producir un sticker numerado por cada Recuadro con Foto_Principal, de forma que cada sticker muestre el mismo número que su Recuadro equivalente en el PDF_Libro.
2. IF un Recuadro no tiene Foto_Principal al momento del cierre, THEN THE Print_Engine SHALL omitir la generación del sticker de foto para ese Recuadro en el PDF_Stickers.
3. THE Print_Engine SHALL incluir en el PDF_Stickers el trazado de corte y las guías de troquelado con una desviación máxima de 0,5 mm respecto a la posición nominal de cada sticker.
4. FOR ALL los Recuadros con Foto_Principal del PDF_Libro, THE Print_Engine SHALL generar exactamente un sticker numerado equivalente en el PDF_Stickers, de modo que la cantidad de stickers sea igual a la cantidad de Recuadros con Foto_Principal y cada número aparezca una sola vez (correspondencia biunívoca).
5. WHERE el usuario tiene Plan_Premium, THE Print_Engine SHALL aplicar efecto holograma a los stickers de los Recuadros clasificados como Clásico o Partido_Internacional.
6. WHERE el usuario tiene Plan_Básico, THE Print_Engine SHALL generar los stickers de los Recuadros clasificados como Clásico o Partido_Internacional sin efecto holograma.
7. IF la cantidad de stickers generados difiere de la cantidad de Recuadros con Foto_Principal del PDF_Libro, o existe algún número faltante o duplicado, THEN THE Print_Engine SHALL abortar la generación del PDF_Stickers, no producir ningún PDF parcial y notificar al usuario un mensaje de error que indique la discrepancia de correspondencia detectada.
8. IF ocurre un fallo durante el procesamiento del PDF_Stickers, THEN THE Print_Engine SHALL detener la generación, no producir ningún PDF_Stickers incompleto y notificar al usuario un mensaje de error que indique que la generación no se completó.

### Requerimiento 19: Rendimiento y Precisión de Impresión

**Historia de Usuario:** Como usuario, quiero que las imágenes tengan calidad de imprenta y la app responda rápido, para obtener un álbum físico de alta calidad con buena experiencia de uso.

#### Criterios de Aceptación

1. WHEN una fotografía se procesa para envío a imprenta, THE Print_Engine SHALL escalar la imagen a un mínimo de 300 DPI.
2. WHEN un usuario abre el álbum interactivo en una red móvil, THE Motor_Album SHALL renderizar la previsualización en menos de 2 segundos.

### Requerimiento 20: Seguridad y Privacidad

**Historia de Usuario:** Como usuario, quiero que mis datos e imágenes estén protegidos, para preservar mi privacidad.

#### Criterios de Aceptación

1. WHEN datos o imágenes se transmiten entre la App_Móvil y los servicios de respaldo, THE Sistema SHALL cifrar la comunicación mediante SSL/TLS.
2. WHILE los datos e imágenes estén almacenados en reposo, THE Sistema SHALL cifrarlos mediante AES-256.
3. WHEN la App_Móvil requiere acceso a cámara, almacenamiento o geolocalización, THE App_Móvil SHALL solicitar el permiso correspondiente conforme a GDPR y CCPA.
4. WHEN un usuario revoca un permiso previamente otorgado, THE App_Móvil SHALL dejar de utilizar el recurso asociado a ese permiso.

### Requerimiento 21: Compatibilidad de Plataforma

**Historia de Usuario:** Como usuario, quiero ejecutar la app en mi dispositivo, para usar la plataforma en versiones de sistema operativo soportadas.

#### Criterios de Aceptación

1. THE App_Móvil SHALL funcionar en dispositivos con iOS 15.0 o superior.
2. THE App_Móvil SHALL funcionar en dispositivos con Android 8.0 (API Level 26) o superior.

Los siguientes requerimientos (22 en adelante) especifican el comportamiento de la App_Móvil como cliente delgado del backend ya especificado en los Requerimientos 1–21. La App_Móvil consume el backend por HTTP a través del API_Gateway y refleja las decisiones del Sistema (gating por plan, biyección Recuadro↔Partido_Oficial, DPI, biunivocidad y cierre de Temporada) sin reimplementar sus reglas de negocio. La elección del framework de la App_Móvil (por ejemplo Flutter o React Native) queda diferida a la fase de diseño.

### Requerimiento 22: Sesión y Manejo de Tokens en el Cliente

**Historia de Usuario:** Como hincha, quiero iniciar sesión y mantener la sesión de forma segura en la app, para acceder a mi cuenta sin fricción.

#### Criterios de Aceptación

1. THE App_Móvil SHALL ofrecer inicio de sesión y registro mediante Apple ID, cuenta de Google y correo electrónico contra el Servicio_Autenticación.
2. WHEN el Servicio_Autenticación responde con un Access_Token y un Refresh_Token válidos, THE App_Móvil SHALL almacenar el Refresh_Token en el Almacenamiento_Seguro y dar acceso a las pantallas autenticadas.
3. WHILE la App_Móvil tiene una sesión activa, THE App_Móvil SHALL adjuntar el Access_Token vigente en cada petición autenticada al Sistema.
4. IF una petición autenticada responde con código de estado 401 por Access_Token expirado, THEN THE App_Móvil SHALL renovar la sesión invocando `POST /auth/refresh`, rotar el Refresh_Token almacenado y reintentar la petición original.
5. IF `POST /auth/refresh` responde con código de estado 401, THEN THE App_Móvil SHALL descartar los tokens del Almacenamiento_Seguro y redirigir al usuario al inicio de sesión.
6. WHEN el usuario cierra sesión, THE App_Móvil SHALL invocar el logout del Servicio_Autenticación y eliminar los tokens del Almacenamiento_Seguro.
7. BEFORE invocar `DELETE /cuenta`, THE App_Móvil SHALL solicitar una confirmación explícita del usuario que indique que el borrado de cuenta es permanente.
8. WHEN el usuario confirma el borrado de cuenta, THE App_Móvil SHALL invocar `DELETE /cuenta`, eliminar los tokens del Almacenamiento_Seguro y redirigir al usuario al inicio de sesión.

### Requerimiento 23: Aplicación del Tema Visual del Club en el Cliente

**Historia de Usuario:** Como hincha, quiero que la app aplique la identidad visual de mi Club, para reconocer mi equipo en la interfaz.

#### Criterios de Aceptación

1. WHEN el usuario selecciona un Club, THE App_Móvil SHALL invocar `PUT /usuario/club` y recibir la IdentidadVisual del Sistema.
2. WHEN la App_Móvil recibe la IdentidadVisual, THE App_Móvil SHALL derivar un Tema_Club a partir de la paleta de colores, el escudo, las imágenes de estadio y las camisetas, y aplicarlo a la interfaz.
3. WHILE un Club está seleccionado, THE App_Móvil SHALL presentar la interfaz con el Tema_Club del Club seleccionado.
4. WHEN el Sistema confirma un cambio de Club, THE App_Móvil SHALL actualizar el Tema_Club aplicado para reflejar el nuevo Club.
5. IF `PUT /usuario/club` responde con código de estado 409 por existir una Temporada activa, THEN THE App_Móvil SHALL mantener el Club actual y mostrar un mensaje que indique que debe cerrarse la Temporada activa antes de cambiar de Club.

### Requerimiento 24: Permisos del Dispositivo en el Cliente

**Historia de Usuario:** Como usuario, quiero controlar los permisos de cámara, almacenamiento y geolocalización, para preservar mi privacidad conforme a GDPR y CCPA.

#### Criterios de Aceptación

1. WHEN la App_Móvil solicita un permiso del dispositivo, THE App_Móvil SHALL explicar al usuario el motivo del acceso conforme a GDPR y CCPA.
2. IF el usuario intenta capturar o cargar una fotografía sin haber otorgado el permiso de cámara o de almacenamiento, THEN THE App_Móvil SHALL solicitar el permiso correspondiente antes de continuar.
3. IF el usuario solicita la verificación por geolocalización sin haber otorgado el permiso de ubicación, THEN THE App_Móvil SHALL solicitar el permiso de geolocalización antes de continuar.
4. WHEN el usuario revoca un permiso previamente otorgado, THE App_Móvil SHALL dejar de utilizar el recurso asociado a ese permiso.

### Requerimiento 25: Compra y Upgrade de Suscripción vía IAP en el Cliente

**Historia de Usuario:** Como usuario, quiero ver mi plan y comprar o mejorar mi suscripción desde la app, para acceder a las funciones según mi plan.

#### Criterios de Aceptación

1. WHEN el usuario abre la pantalla de suscripción, THE App_Móvil SHALL invocar `GET /subscription` y presentar el plan actual, su estado y el catálogo de planes disponibles.
2. WHEN el usuario inicia una compra de suscripción, THE App_Móvil SHALL ejecutar el flujo de compra dentro de la app de App Store o Google Play y enviar el comprobante al Sistema mediante `POST /subscription/purchase`.
3. WHEN el usuario solicita un upgrade a Plan_Premium, THE App_Móvil SHALL ejecutar el flujo de compra dentro de la app y enviar el comprobante al Sistema mediante `POST /subscription/upgrade`.
4. WHEN el usuario consulta sus derechos, THE App_Móvil SHALL invocar `GET /entitlements` y reflejar los Entitlements devueltos por el Sistema.
5. THE App_Móvil SHALL reflejar el estado de suscripción y los Entitlements según lo devuelto por el Sistema sin recalcular los derechos del plan en el cliente.
6. IF una llamada de compra o upgrade responde con un error del Sistema, THEN THE App_Móvil SHALL mostrar el mensaje de error devuelto y mantener el estado de suscripción mostrado previamente.

### Requerimiento 26: Registro de Notificaciones Push en el Cliente

**Historia de Usuario:** Como hincha, quiero recibir y gestionar los recordatorios push, para completar mi álbum a tiempo.

#### Criterios de Aceptación

1. WHEN la App_Móvil obtiene el permiso de notificaciones y un Token_Push del sistema operativo, THE App_Móvil SHALL registrar el Token_Push en el Sistema.
2. WHEN la App_Móvil recibe una notificación push de Recuadro vacío, THE App_Móvil SHALL mostrar el recordatorio de subir la Foto_Principal del Recuadro indicado.
3. WHEN la App_Móvil recibe una notificación push de cierre escalonado, THE App_Móvil SHALL mostrar el recordatorio de completar el álbum antes de la Fecha_Límite_Cierre.
4. WHEN el usuario silencia los recordatorios de un Recuadro, THE App_Móvil SHALL comunicar al Sistema la solicitud de silenciar ese recordatorio.
5. IF el usuario no otorga el permiso de notificaciones, THEN THE App_Móvil SHALL continuar operando sin registrar el Token_Push.

### Requerimiento 27: Resiliencia de Red y Manejo de Errores en el Cliente

**Historia de Usuario:** Como usuario, quiero que la app maneje bien los errores de red y del backend, para no quedar bloqueado cuando el Sistema falla o tarda.

#### Criterios de Aceptación

1. IF una petición al Sistema responde con código de estado 401 por Access_Token expirado, THEN THE App_Móvil SHALL intentar una renovación transparente de sesión antes de solicitar un nuevo inicio de sesión.
2. IF una petición al Sistema responde con código de estado 409 por conflicto de cambio de Club, THEN THE App_Móvil SHALL mostrar el mensaje de conflicto devuelto y mantener el estado anterior.
3. IF una petición al Sistema responde con un rechazo por gating de plan, THEN THE App_Móvil SHALL mostrar el mensaje que indica que la función requiere Plan_Premium sin bloquear el resto de las funciones.
4. IF una petición al Sistema no obtiene respuesta dentro del tiempo de espera de red o falla la conexión, THEN THE App_Móvil SHALL informar el fallo de red y permitir reintentar la operación sin cerrar la sesión del usuario.
5. WHILE una petición al Sistema está en curso, THE App_Móvil SHALL mantener la interfaz operable de modo que el usuario pueda cancelar o navegar a otra pantalla.

### Requerimiento 28: Seguridad en el Cliente

**Historia de Usuario:** Como usuario, quiero que la app proteja mis credenciales y datos en el dispositivo, para preservar mi privacidad.

#### Criterios de Aceptación

1. WHEN la App_Móvil se comunica con el Sistema, THE App_Móvil SHALL usar conexiones cifradas mediante TLS y rechazar las conexiones que no sean TLS.
2. WHEN la App_Móvil persiste el Refresh_Token, THE App_Móvil SHALL almacenarlo en el Almacenamiento_Seguro del sistema operativo.
3. WHERE la App_Móvil almacena datos sensibles en el dispositivo, THE App_Móvil SHALL cifrar esos datos en reposo.
4. WHEN la sesión del usuario termina por logout o borrado de cuenta, THE App_Móvil SHALL eliminar del dispositivo el Refresh_Token y los datos sensibles almacenados en caché.

### Requerimiento 29: Accesibilidad del Cliente

**Historia de Usuario:** Como usuario, quiero una app accesible, para usarla con apoyo de accesibilidad.

#### Criterios de Aceptación

1. WHEN la App_Móvil aplica el Tema_Club de un Club, THE App_Móvil SHALL presentar el texto sobre los colores del Tema_Club con una relación de contraste de al menos 4.5:1 para texto normal.
2. THE App_Móvil SHALL asociar etiquetas descriptivas de accesibilidad a los controles interactivos y a las imágenes informativas para su lectura por lectores de pantalla.
3. THE App_Móvil SHALL soportar el escalado de tamaño de fuente del sistema operativo sin pérdida de contenido ni de funcionalidad.
