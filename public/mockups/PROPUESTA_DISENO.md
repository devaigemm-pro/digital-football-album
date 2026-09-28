# Propuesta de rediseño de pantallas · Álbum de Fútbol Digital (2026)

Documento de revisión. Contiene el rediseño de **todas las vistas de la app**,
las innovaciones propuestas y los reemplazos sugeridos. El objetivo es que
revises las imágenes y decidas qué se aplica y desarrolla.

## Cómo revisar

- **Prototipo navegable:** `public/mockups/prototipo.html` (ábrelo en un
  navegador). Cambia el club en la barra superior para ver la identidad visual
  dinámica en todas las pantallas.
- **Imágenes por vista:** `public/mockups/img/01..17-*.png`.
- **Vista general (todas juntas):** `public/mockups/img/_overview.png`.

Fotos, resultados y jugadores son ficticios; los escudos son marcadores hasta
cargar los oficiales con licencia.

## Dirección de diseño

Se mantiene la identidad de **álbum de figuritas** ya establecida en
`public/album.html` y en los tokens de `app/src/theme/design-tokens.ts` (papel,
rojo de marca, tipografía condensada Bebas Neue, cromos y stickers), y se le
suma un lenguaje de app moderno **“Stadium Night”**:

- **Canvas oscuro azul-medianoche** con destellos del color del club. Reduce la
  fatiga y hace resaltar las fotos y los cromos (contraste tipo transmisión).
- **Glassmorphism** en tarjetas y hojas inferiores para dar profundidad por
  capas sin abusar de bordes.
- **Bento grid** en el inicio: celdas autónomas (progreso, racha, próximo
  partido, actividad) con jerarquía propia y densidad sin desorden.
- **Marcador tipo transmisión**: resultado gigante flanqueado por escudos, con
  píldora de estado (FINAL / EN VIVO) y cronología de eventos.
- **Gamificación con propósito**: anillo de progreso del álbum, racha, XP al
  desbloquear recuadros, insignias. Premia completar el álbum antes del cierre.
- **Thumb-zone first**: las acciones primarias van abajo, al alcance del pulgar.
- **Color explícito y contraste AA** (preferencia del usuario 2026-09-24): no se
  depende del tema claro/oscuro del SO; se fijan color y fondo en cada superficie.

Fuentes consultadas (contenido reformulado para cumplir licencias): tendencias
de bento grids ([serp.co](https://blocks.serp.co/blog/web-design-trends-2026),
[dev.to](https://dev.to/studiomeyer_io/web-design-trends-2026-what-actually-held-up-after-six-months-23p8)),
dark glassmorphism ([medium](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)),
estética “Stadium Night” para deportes ([sleek.design](https://sleek.design/es/templates/sports-app)),
gamificación ([strivecloud](https://www.strivecloud.io/blog/app-gamification-playbook-optimized)),
UX de apps deportivas ([humbleteam](https://humbleteam.com/blog/sports-app-design-best-practices-ux-patterns-that-keep-fans-engaged),
[softjourn](https://softjourn.com/insights/building-fan-engagement-apps-technology-stack-and-best-practices-for-sports-team)).

## Catálogo de vistas (17)

| # | Vista | Qué muestra | Req / origen |
|---|-------|-------------|--------------|
| 1 | Acceso (Login) | Apple / Google / Correo | Req 22.1, 1.1 |
| 2 | Selección de club | Grid con tema, escudo y colores automáticos | Req 23.1, 2.1 |
| 3 | Onboarding | El valor de la app en 3 pasos (**nuevo**) | UX / retención |
| 4 | Inicio de temporada | Dashboard **bento**: progreso, racha, próximo partido, actividad | Req 4, 11 |
| 5 | Álbum digital | Simulador de páginas con siluetas y faltantes | Req 11.1–11.3 |
| 6 | Partidos · Fixture | Lista con estado, resultado y clasificación (Clásico/Intl) | Req 9, 10 |
| 7 | Ficha del partido | Marcador tipo transmisión, cronología, alineación | Req 9.3, 10 |
| 8 | Registrar momento | Foto, contexto de asistencia, bitácora, jugador del partido | Req 5, 6, 7, 8 |
| 9 | Desbloqueo de lámina | Celebración con holograma + XP (**nuevo**) | Gamificación / Req 11 |
| 10 | Digital Card | Generador de cromo con marcador y escudo | Req 12 |
| 11 | Compartir | Hoja: Instagram, WhatsApp, X, TikTok | Req 13.1, 13.2 |
| 12 | Suscripción · Planes | Básico vs Premium (IAP con upgrade) | Req 3.1, 3.6, 3.7 |
| 13 | Cierre de temporada | Checklist previo al Print Engine | Req 16, 17, 18 |
| 14 | Envío y seguimiento | Dirección validada y tracking del pedido | Req 15 |
| 15 | Perfil e insignias | Estadísticas, logros, plan | Req 22 |
| 16 | Notificaciones | Recordatorios de foto y de cierre | Req 14 |
| 17 | Ajustes y privacidad | Cuenta, permisos, plan, borrado (GDPR/CCPA) | Req 22, 24, 20 |

## Innovaciones propuestas (nuevas o mejoradas)

1. **Onboarding de 3 pasos (vista 3, nueva).** Explica la invariante central
   —“un recuadro por partido” y “foto principal única”— antes de entrar. Mejora
   retención en el primer minuto sin tocar reglas de negocio.
2. **Home como bento (vista 4, rediseño).** Reemplaza la lista vertical por un
   tablero: anillo de progreso del álbum, racha, próximo partido con su
   clasificación (Clásico/Internacional) y actividad reciente con estados
   (LISTA / FALTA). Un toque en “FALTA” lleva a capturar la foto que falta.
3. **Desbloqueo de lámina (vista 9, nueva).** Momento de recompensa con efecto
   holograma y XP al asignar la foto principal de un recuadro. Refuerza el hábito
   de completar el álbum (apoya Req 11 y los recordatorios del Req 14).
4. **Ficha de partido tipo transmisión (vista 7, rediseño).** Marcador gigante
   entre escudos, píldora de estado y cronología de eventos, alimentada por la
   API deportiva (Req 9). Enlaza directo a “Registrar / editar mi momento”.
5. **Fixture con clasificación visible (vista 6).** Chips de Clásico e
   Internacional en cada partido, que es lo que decide holograma y cards premium
   (Req 10). Filtro por “Faltantes” para cerrar huecos rápido.
6. **Cierre de temporada con checklist de invariantes (vista 13).** Antes de
   disparar el Print Engine muestra recuadros con foto, recuadros que quedarán
   vacíos, dirección validada y la verificación de correspondencia
   recuadro ↔ sticker (Req 18.4/18.7). Deja claro que el cierre es atómico.
7. **Seguimiento de pedido con línea de tiempo (vista 14).** Estados del ciclo
   `CERRADA → IMPRESIÓN → EN CAMINO → ENTREGADO` con la guía de envío (Req 15).

## Reemplazos sugeridos (respecto de `public/album.html`)

- El mockup actual mezcla el **kit físico** (libro, tapa de cuero, planchas) con
  las **vistas de la app**. Propongo separar: `album.html` sigue siendo la
  referencia del producto impreso; `prototipo.html` es la referencia de la app.
- Cambiar el fondo claro de las vistas por el canvas oscuro “Stadium Night”
  para que las fotos y cromos resalten (mejor contraste en pantallas móviles y
  en modo oscuro del SO, sin depender del tema del sistema).
- Home lista → **home bento**.
- Añadir Onboarding, Desbloqueo, Notificaciones y Ajustes, que no estaban como
  vistas de app en el mockup original.

## Invariantes de negocio respetadas en el diseño

- **Biyección recuadro ↔ partido:** “38 partidos oficiales” = 38 recuadros; el
  álbum se deriva del fixture (Req 4). No se inventan recuadros.
- **Foto principal única:** en “Registrar momento” se marca una sola foto como
  principal (★) entre varias; es la que se imprime (Req 5.5, 5.6).
- **Numeración tolerante a huecos:** los recuadros sin foto se muestran como
  silueta punteada con su número; no se renumera (Req 11.2, 18.2).
- **Gating por plan:** el holograma en Clásicos/Internacionales y las cards de
  partidos internacionales se muestran como Premium (Req 3.6/3.7, 12.4, 18.5).
- **Cierre atómico:** el checklist previo comunica que el Print Engine aborta si
  la correspondencia recuadro ↔ sticker no cuadra (Req 18.7).
- **Privacidad / borrado:** Ajustes incluye permisos revocables y borrado de
  cuenta con la nota de conservar solo el mínimo fiscal de pedidos (Req 20, 24, 12/GDPR).

## Notas de accesibilidad

- Paleta con contraste objetivo AA (≥ 4.5:1) sobre los fondos previstos, en
  línea con los tokens actuales. La validación WCAG completa requiere pruebas
  manuales con tecnología asistiva y revisión experta.

## Siguientes pasos sugeridos (tras tu revisión)

1. Marcar qué vistas se aprueban tal cual y cuáles ajustar.
2. Si el lenguaje “Stadium Night” se aprueba, actualizar
   `app/src/theme/design-tokens.ts` (añadir superficies oscuras y tokens de
   glass) y llevar el rediseño a los `.tsx` de `app/src/screens`.
3. Preparar los assets reales (escudos con licencia, fotos) para reemplazar los
   marcadores del prototipo.
