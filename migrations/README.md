# Migraciones PostgreSQL

Migraciones en SQL plano para el backend del Álbum de Fútbol Digital. Reflejan el
diagrama ER de `.kiro/specs/digital-football-album/design.md` y los tipos del
dominio en `src/domain/types.ts`.

## Convención de archivos

- `NNNN_nombre.sql` — migración hacia adelante (up).
- `NNNN_nombre.down.sql` — rollback (down), en orden inverso.

Las migraciones se aplican en orden numérico ascendente. Cada archivo está
envuelto en `BEGIN` / `COMMIT` para ser atómico.

## Aplicar / revertir manualmente

```bash
# Aplicar
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_init.sql

# Revertir
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_init.down.sql
```

## Invariantes forzadas en la base (trazabilidad)

| Invariante | Mecanismo | Requerimiento / Property |
|---|---|---|
| Exactamente un Recuadro por Partido_Oficial | `UNIQUE (partido_oficial_id)` en `recuadro` | Req 4.1 / Property 3 |
| A lo sumo una Foto_Principal por Recuadro | `foto_principal_id` NULLABLE + FK a `foto` | Req 5.5 / Property 7 |
| Momento 1:1 con Partido_Oficial | `UNIQUE (partido_oficial_id)` en `momento` | Req 5.4 |
| Album 1:1 con Temporada | `UNIQUE (temporada_id)` en `album` | Req 4 |
| Config_Admin 1:1 con Temporada | `UNIQUE (temporada_id)` en `config_admin` | Req 14.5 |
| Pedido 1:1 con Temporada | `UNIQUE (temporada_id)` en `pedido` | Req 15 |
| sub_modalidad solo en Transmisión | `CHECK` en `momento` | Req 6.4 / Property 10 |
| Solo partidos oficiales (sin amistosos) | enum `tipo_competicion` | Req 4.2 / Property 4 |
| Dimensiones para 300 DPI | `plantilla_album.recuadro_ancho_mm/alto_mm`, `recuadro.ancho_mm/alto_mm`, `foto.ancho_px/alto_px` | Req 19.1 / Property 29 |

## Notas

- Los campos JSON del ER (`paleta_colores`, `activos_visuales`, `resultado`,
  `alineacion`, `eventos`, `campos`, `datos_fiscales_minimos`) usan `jsonb`.
- Los enums de estado del dominio se modelan como tipos `ENUM` de PostgreSQL.
- Los identificadores usan `uuid` con `gen_random_uuid()` (extensión `pgcrypto`).
- Las columnas de tiempo usan `timestamptz` (los recordatorios se anclan a la
  zona horaria del usuario en la capa de aplicación, Req 14).
- `datos_fiscales_minimos` en `pedido` se conserva tras el borrado de cuenta
  (Req 20); por eso las FKs de datos personales hacia `pedido` usan
  `ON DELETE SET NULL` en lugar de `CASCADE`.
