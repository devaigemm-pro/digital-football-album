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
