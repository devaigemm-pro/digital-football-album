# Mockups de la app · Álbum de Fútbol Digital

Vistas de cada funcionalidad de la app móvil (frame 390×844). Cada mockup existe
en dos formatos:

- **`.svg`** — vectorial, editable (colores del club parametrizables).
- **`.png`** — rasterizado a 2x (780×1688), listo para presentaciones/Figma.

Anclados a los requerimientos del spec `.kiro/specs/digital-football-album/` y al
contrato `docs/FRONTEND_INTEGRATION.md`. Paleta de ejemplo (Atlético Kiro):
primario `#C8102E`, oscuro `#8A0B20`.

| # | Archivo | Funcionalidad | Requerimientos |
|---|---------|---------------|----------------|
| 1 | `01-login` | Auth email + Apple + Google (Supabase) | Req 1, Req 22 |
| 2 | `02-seleccion-club` | Elegir club, tema visual, bloqueo por temporada activa | Req 2, Req 23 |
| 3 | `03-album-preview` | Grid de recuadros montados/vacíos, faltantes | Req 4, Req 11 |
| 4 | `04-detalle-momento` | Fotos, contexto, notas, jugador del partido | Req 5, 6, 7, 8 |
| 5 | `05-foto-principal` | Marcar la única foto que se imprime | Req 5 (invariante) |
| 6 | `06-digital-card` | Cromo con marcador/escudo, holograma, share | Req 12, Req 13 |
| 7 | `07-suscripcion-planes` | Básico vs Premium, gating por plan | Req 3 |
| 8 | `08-notificaciones` | Recordatorios por estado (24h) y escalado 30/15/7/1 | Req 14 |
| 9 | `09-envio-kit` | Dirección validada, estado del pedido y tracking | Req 15 |
| 10 | `10-cierre-impresion` | Cierre anticipado, PDF_Libro + PDF_Stickers | Req 16, 17, 18 |

## Regenerar los PNG desde los SVG

```bash
node docs/mockups/convert.mjs
```

Requiere `sharp` (devDependency). Renderiza a 2x; ajusta `SCALE` en el script para
cambiar la resolución.

## Notas de alcance

Las vistas 8 (push), 9 (envío/tracking), 7 (IAP) y parte de la 10 (Print Engine real)
representan funcionalidad que el backend aún no expone o usa adaptadores de
desarrollo. En la app se muestran con placeholder "No disponible" hasta que el
backend las exponga (ver `docs/FRONTEND_INTEGRATION.md`).
