-- ===========================================================================
-- Migración 0001: Esquema inicial del Álbum de Fútbol Digital (PostgreSQL)
-- ===========================================================================
--
-- Refleja el diagrama ER y las reglas de entidad de design.md ("Data Models")
-- y los tipos del dominio en src/domain/types.ts.
--
-- Invariantes clave forzadas a nivel de base de datos:
--   * Exactamente un Recuadro por Partido_Oficial  -> UNIQUE(partido_oficial_id)
--     en recuadro (Req 4.1; Property 3).
--   * A lo sumo una Foto_Principal por Recuadro     -> foto_principal_id NULLABLE
--     con FK a foto (Req 5.5; Property 7).
--   * Momento 1:1 con Partido_Oficial               -> UNIQUE(partido_oficial_id)
--     en momento.
--   * Album 1:1 con Temporada                        -> UNIQUE(temporada_id) en album.
--
-- Dimensiones para el cálculo de 300 DPI (Req 19.1; Property 29):
--   * plantilla_album.recuadro_ancho_mm / recuadro_alto_mm
--   * recuadro.ancho_mm / alto_mm  (heredados de la plantilla o específicos)
--   * foto.ancho_px / alto_px
--
-- Migración en SQL plano, idempotente donde es razonable (IF NOT EXISTS).
-- Requirements: 4.1, 4.2, 5.5, 9.5, 14.5, 19.1
-- ===========================================================================

BEGIN;

-- Extensión para gen_random_uuid() (PostgreSQL 13+ incluye pgcrypto).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos enumerados (espejo de las uniones de literales de string del dominio)
-- ---------------------------------------------------------------------------

-- ProveedorAuth (Req 1.1)
CREATE TYPE proveedor_auth AS ENUM ('apple', 'google', 'email');

-- EstadoTemporada (Req 16)
CREATE TYPE estado_temporada AS ENUM (
    'CONFIGURACION',
    'ACTIVA',
    'CERRADA',
    'IMPRESION',
    'LISTA',
    'ENVIADA',
    'FALLIDA'
);

-- EstadoPartido (Req 9)
CREATE TYPE estado_partido AS ENUM ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO');

-- TipoCompeticion: excluye amistosos (Req 4.2)
CREATE TYPE tipo_competicion AS ENUM ('LIGA', 'COPA_NACIONAL', 'INTERNACIONAL');

-- PlanSuscripcion (Req 3.1)
CREATE TYPE plan_suscripcion AS ENUM ('BASICO', 'PREMIUM');

-- EstadoSuscripcion (Req 3.5)
CREATE TYPE estado_suscripcion AS ENUM ('ACTIVA', 'EN_GRACIA', 'VENCIDA');

-- EstadoRecordatorio (Req 14)
CREATE TYPE estado_recordatorio AS ENUM ('ACTIVO', 'DETENIDO_POR_FOTO', 'SILENCIADO');

-- EstadoAsociacionFoto (Req 9.5)
CREATE TYPE estado_asociacion_foto AS ENUM ('ASOCIADA', 'PENDIENTE_ASOCIACION');

-- EstadoPedido (Req 15, 18)
CREATE TYPE estado_pedido AS ENUM (
    'PENDIENTE',
    'EN_IMPRESION',
    'LISTA',
    'FALLIDA',
    'ENVIADA'
);

-- ContextoAsistencia (Req 6.1)
CREATE TYPE contexto_asistencia AS ENUM ('EN_VIVO_LOCAL', 'EN_VIVO_VISITA', 'TRANSMISION');

-- SubModalidadTransmision (Req 6.4)
CREATE TYPE sub_modalidad_transmision AS ENUM ('TELEVISION', 'BAR', 'STREAMING');

-- ---------------------------------------------------------------------------
-- CLUB (Req 2). Base de la personalización visual y de las rivalidades.
-- ---------------------------------------------------------------------------
CREATE TABLE club (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre           text NOT NULL,
    paleta_colores   jsonb NOT NULL,
    escudo_url       text NOT NULL,
    activos_visuales jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- USUARIO (Req 1, 2, 14). clubId puede ser NULL hasta que se selecciona Club.
-- ---------------------------------------------------------------------------
CREATE TABLE usuario (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_auth proveedor_auth NOT NULL,
    email          text NOT NULL UNIQUE,
    club_id        uuid REFERENCES club (id) ON DELETE SET NULL,
    zona_horaria   text NOT NULL
);

-- ---------------------------------------------------------------------------
-- REFRESH_TOKEN (Req 1, 20). Rotación y familia de tokens.
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_token (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    token_hash  text NOT NULL,
    familia_id  uuid NOT NULL,
    expira_en   timestamptz NOT NULL,
    rotado      boolean NOT NULL DEFAULT false,
    revocado    boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_refresh_token_usuario ON refresh_token (usuario_id);
CREATE INDEX idx_refresh_token_familia ON refresh_token (familia_id);

-- ---------------------------------------------------------------------------
-- PLANTILLA_ALBUM (Req 19.1). Dimensiones físicas del Recuadro por Club.
-- ---------------------------------------------------------------------------
CREATE TABLE plantilla_album (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id            uuid NOT NULL REFERENCES club (id) ON DELETE CASCADE,
    recuadro_ancho_mm  integer NOT NULL CHECK (recuadro_ancho_mm > 0),
    recuadro_alto_mm   integer NOT NULL CHECK (recuadro_alto_mm > 0)
);

CREATE INDEX idx_plantilla_album_club ON plantilla_album (club_id);

-- ---------------------------------------------------------------------------
-- RIVALIDAD (Req 10.2). Lista predefinida de rivales por Club.
-- ---------------------------------------------------------------------------
CREATE TABLE rivalidad (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      uuid NOT NULL REFERENCES club (id) ON DELETE CASCADE,
    rival_nombre text NOT NULL,
    UNIQUE (club_id, rival_nombre)
);

CREATE INDEX idx_rivalidad_club ON rivalidad (club_id);

-- ---------------------------------------------------------------------------
-- SUSCRIPCION (Req 3).
-- ---------------------------------------------------------------------------
CREATE TABLE suscripcion (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id     uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    plan           plan_suscripcion NOT NULL,
    estado         estado_suscripcion NOT NULL,
    vigencia_hasta date NOT NULL,
    revenue_cat_id text NOT NULL
);

CREATE INDEX idx_suscripcion_usuario ON suscripcion (usuario_id);

-- ---------------------------------------------------------------------------
-- TEMPORADA (Req 16, 14.6). fecha_limite_cierre proviene de Config_Admin.
-- ---------------------------------------------------------------------------
CREATE TABLE temporada (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    club_id             uuid NOT NULL REFERENCES club (id) ON DELETE RESTRICT,
    temporada_externa   text NOT NULL,
    estado              estado_temporada NOT NULL DEFAULT 'CONFIGURACION',
    fecha_limite_cierre timestamptz NOT NULL
);

CREATE INDEX idx_temporada_usuario ON temporada (usuario_id);
CREATE INDEX idx_temporada_club ON temporada (club_id);

-- ---------------------------------------------------------------------------
-- CONFIG_ADMIN (Req 14.5, 16). 1:1 con Temporada; la fija un operador.
-- ---------------------------------------------------------------------------
CREATE TABLE config_admin (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    temporada_id        uuid NOT NULL UNIQUE REFERENCES temporada (id) ON DELETE CASCADE,
    liga                text NOT NULL,
    fecha_limite_cierre timestamptz NOT NULL,
    operador_id         uuid NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- PARTIDO_OFICIAL (Req 4, 9, 10). tipo_competicion excluye amistosos.
-- ---------------------------------------------------------------------------
CREATE TABLE partido_oficial (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    temporada_id       uuid NOT NULL REFERENCES temporada (id) ON DELETE CASCADE,
    partido_externo_id text NOT NULL,
    competicion        text NOT NULL,
    tipo_competicion   tipo_competicion NOT NULL,
    rival              text NOT NULL,
    fecha_hora         timestamptz NOT NULL,
    estado             estado_partido NOT NULL DEFAULT 'PROGRAMADO',
    es_clasico         boolean NOT NULL DEFAULT false,
    es_internacional   boolean NOT NULL DEFAULT false,
    resultado          jsonb,
    alineacion         jsonb NOT NULL DEFAULT '[]'::jsonb,
    eventos            jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Identificador externo único dentro de la Temporada (idempotencia de sync).
    UNIQUE (temporada_id, partido_externo_id)
);

CREATE INDEX idx_partido_oficial_temporada ON partido_oficial (temporada_id);

-- ---------------------------------------------------------------------------
-- ALBUM (Req 4). 1:1 con Temporada.
-- ---------------------------------------------------------------------------
CREATE TABLE album (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    temporada_id uuid NOT NULL UNIQUE REFERENCES temporada (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- MOMENTO (Req 6, 7, 8). 1:1 con Partido_Oficial.
-- sub_modalidad solo válida cuando contexto = TRANSMISION (Req 6.4; Property 10).
-- ---------------------------------------------------------------------------
CREATE TABLE momento (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partido_oficial_id   uuid NOT NULL UNIQUE REFERENCES partido_oficial (id) ON DELETE CASCADE,
    contexto_asistencia  contexto_asistencia NOT NULL,
    sub_modalidad        sub_modalidad_transmision,
    geo_verificado       boolean NOT NULL DEFAULT false,
    notas                text NOT NULL DEFAULT '',
    jugador_del_partido  text,
    CONSTRAINT chk_sub_modalidad_solo_transmision CHECK (
        sub_modalidad IS NULL OR contexto_asistencia = 'TRANSMISION'
    )
);

-- ---------------------------------------------------------------------------
-- FOTO (Req 5, 9.5, 19.1). ancho_px/alto_px para el cálculo de DPI.
-- ---------------------------------------------------------------------------
CREATE TABLE foto (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    momento_id        uuid NOT NULL REFERENCES momento (id) ON DELETE CASCADE,
    object_key        text NOT NULL,
    ancho_px          integer NOT NULL CHECK (ancho_px > 0),
    alto_px           integer NOT NULL CHECK (alto_px > 0),
    estado_asociacion estado_asociacion_foto NOT NULL DEFAULT 'PENDIENTE_ASOCIACION'
);

CREATE INDEX idx_foto_momento ON foto (momento_id);

-- ---------------------------------------------------------------------------
-- RECUADRO (Req 4.1, 5.5, 19.1).
--   * UNIQUE(partido_oficial_id): exactamente un Recuadro por Partido_Oficial.
--   * foto_principal_id NULLABLE con FK a foto: a lo sumo una Foto_Principal.
--   * numero único dentro del álbum (correspondencia con el sticker).
--   * ancho_mm/alto_mm: dimensiones físicas objetivo (heredadas o específicas).
-- ---------------------------------------------------------------------------
CREATE TABLE recuadro (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id            uuid NOT NULL REFERENCES album (id) ON DELETE CASCADE,
    partido_oficial_id  uuid NOT NULL UNIQUE REFERENCES partido_oficial (id) ON DELETE CASCADE,
    plantilla_id        uuid NOT NULL REFERENCES plantilla_album (id) ON DELETE RESTRICT,
    numero              integer NOT NULL CHECK (numero > 0),
    ancho_mm            integer NOT NULL CHECK (ancho_mm > 0),
    alto_mm             integer NOT NULL CHECK (alto_mm > 0),
    -- FK a foto: a lo sumo una Foto_Principal por Recuadro (Req 5.5; Property 7).
    -- ON DELETE SET NULL: si se borra la foto marcada, el Recuadro queda vacío.
    foto_principal_id   uuid REFERENCES foto (id) ON DELETE SET NULL,
    estado_recordatorio estado_recordatorio NOT NULL DEFAULT 'ACTIVO',
    -- El numero de Recuadro es único dentro de cada álbum.
    UNIQUE (album_id, numero)
);

CREATE INDEX idx_recuadro_album ON recuadro (album_id);
CREATE INDEX idx_recuadro_foto_principal ON recuadro (foto_principal_id);

-- ---------------------------------------------------------------------------
-- DIRECCION_ENVIO (Req 15).
-- ---------------------------------------------------------------------------
CREATE TABLE direccion_envio (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    campos     jsonb NOT NULL,
    validada   boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_direccion_envio_usuario ON direccion_envio (usuario_id);

-- ---------------------------------------------------------------------------
-- PEDIDO (Req 15, 18, 20).
--   * 1:1 con Temporada (un kit por Temporada al cierre).
--   * datos_fiscales_minimos se conserva tras borrado de cuenta (Req 20).
--   * direccion_envio_id ON DELETE SET NULL: preserva el mínimo fiscal aunque
--     se elimine la dirección personal.
-- ---------------------------------------------------------------------------
CREATE TABLE pedido (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    temporada_id             uuid NOT NULL UNIQUE REFERENCES temporada (id) ON DELETE CASCADE,
    direccion_envio_id       uuid REFERENCES direccion_envio (id) ON DELETE SET NULL,
    estado                   estado_pedido NOT NULL DEFAULT 'PENDIENTE',
    tracking                 text,
    datos_fiscales_minimos   jsonb,
    intentos_impresion       integer NOT NULL DEFAULT 0 CHECK (intentos_impresion >= 0)
);

CREATE INDEX idx_pedido_direccion ON pedido (direccion_envio_id);

COMMIT;
