---
inclusion: always
---

# Conocimiento del producto: Álbum de Fútbol Digital

Este documento resume el negocio, las reglas y las funcionalidades del proyecto.
Es la fuente de contexto para cualquier agente que trabaje o hable en nombre del
usuario. La fuente de verdad detallada vive en
`.kiro/specs/digital-football-album/` (requirements.md, design.md, tasks.md);
este archivo es el resumen operativo.

## Qué es

App móvil multiplataforma (iOS 15+ / Android 8.0 API 26+) para hinchas de fútbol.
Permite documentar cada partido oficial de la temporada del club (fotos, notas,
contexto de asistencia, votación de jugador del partido) y, al cierre de la
temporada, genera automáticamente un kit físico impreso: un libro maquetado con
recuadros numerados y planchas de stickers coleccionables.

Este repositorio es el **backend en TypeScript**. La app móvil (React Native +
TypeScript) es un cliente delgado que consume el backend por HTTP vía API Gateway
y **no reimplementa** la lógica de negocio sensible.

## Arquitectura (resumen)

- Cliente-servidor orientado a servicios. El **backend es la fuente de verdad**
  del álbum y del Print_Engine.
- Servicios: Autenticación, Suscripción, Motor_Momentos, Datos_Deportivos,
  Clasificador, Motor_Album, Generador_Cards, Notificaciones, Envío, Print_Engine
  y un Programador de Jobs (sync 6h / cierre / recordatorios).
- Datos: PostgreSQL (metadatos y relaciones) + Object Storage S3/Firebase (fotos
  y PDFs, cifrados en reposo AES-256).
- Externos: API deportiva (Sportmonks / API-Football), RevenueCat/Stripe, IAP de
  App Store / Google Play, APNs / FCM, redes sociales.
- Estructura del código: `src/api`, `src/app`, `src/domain`, `src/jobs`,
  `src/persistence`, `src/services`.

## Reglas de negocio clave (invariantes que no se rompen)

1. **Biyección Recuadro ↔ Partido_Oficial**: exactamente un Recuadro por cada
   partido oficial de la temporada. La cantidad de recuadros se deriva del fixture
   oficial. Se excluyen los amistosos (solo liga, copa nacional e internacional).
2. **Foto_Principal única por Recuadro**: a lo sumo una foto principal por
   recuadro; solo esa foto se imprime. Las demás fotos se guardan pero no van a
   los archivos de impresión.
3. **Correspondencia biunívoca Recuadro ↔ Sticker**: el número del sticker es el
   número de su recuadro. Numeración tolerante a huecos (si un recuadro queda sin
   foto principal, no se genera su sticker; NO se renumera densamente).
4. **Print_Engine atómico**: si la cantidad de stickers no cuadra con los recuadros
   con foto principal, o hay un número faltante/duplicado, se **aborta** la
   generación sin producir PDF parcial y se notifica la discrepancia.
5. **300 DPI mínimo** al escalar imágenes para imprenta; guías de troquelado con
   desviación máxima de 0,5 mm.
6. **Fecha_Límite_Cierre es configuración administrativa**: la fija un operador
   por temporada/liga (Config_Admin), no el sistema ni el usuario final. Dispara
   cierre automático y recordatorios escalonados (30/15/7/1 día).
7. **Gating por plan centralizado** (validado contra RevenueCat en un único punto):
   - Plan_Básico ($39.99/año): funciones digitales limitadas.
   - Plan_Premium ($79.99/año): Digital Cards de partidos internacionales +
     stickers con efecto holograma para Clásicos e Internacionales.
8. **Clasificación de partidos**: Clásico si el rival está en la lista de
   rivalidades del club; Internacional según la competición de la API deportiva.
9. **Sesión JWT**: access token corto + refresh token con rotación por familia.
   401 por token expirado → `POST /auth/refresh`, rotar y reintentar.
10. **Cambio de Club restringido** si existe una Temporada ACTIVA (409).
11. **Recordatorios basados en estado** y anclados a la zona horaria del usuario,
    no en disparos sueltos ni en UTC crudo.
12. **Derecho al olvido (GDPR/CCPA)**: el borrado de cuenta elimina fotos,
    momentos, recuadros y datos personales, conservando solo el mínimo fiscal de
    los Pedidos.

## Ciclo de vida de la Temporada

`CONFIGURACION → ACTIVA → CERRADA → IMPRESION → LISTA → ENVIADA` (o `FALLIDA`).

## Convenciones técnicas del repo

- TypeScript ESM (`"type": "module"`), Node >= 18.
- Dominio puro: IDs como UUID (alias de string), fechas ISO 8601. Uniones de
  literales de string en vez de `enum`.
- Scripts: `build` (tsc), `typecheck`, `test` (vitest run), `lint` (eslint),
  `format` (prettier), `verify:sql`.
- Tests con Vitest y property-based testing con fast-check.
- Documentación y specs en español.

## Al proponer o pedir trabajo

- Respetar las invariantes de arriba; señalar explícitamente si una petición
  las pondría en riesgo.
- Referenciar el número de requerimiento (Req N) cuando aplique.
- Mantener el backend como fuente de verdad; no mover lógica sensible al cliente.
