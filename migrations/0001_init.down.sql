-- ===========================================================================
-- Rollback de la migración 0001: elimina el esquema inicial.
-- ===========================================================================
-- Orden inverso a la creación. DROP TABLE ... CASCADE limpia las FKs; los tipos
-- enumerados se eliminan al final una vez que ninguna tabla los referencia.
-- ===========================================================================

BEGIN;

DROP TABLE IF EXISTS pedido CASCADE;
DROP TABLE IF EXISTS direccion_envio CASCADE;
DROP TABLE IF EXISTS recuadro CASCADE;
DROP TABLE IF EXISTS foto CASCADE;
DROP TABLE IF EXISTS momento CASCADE;
DROP TABLE IF EXISTS album CASCADE;
DROP TABLE IF EXISTS partido_oficial CASCADE;
DROP TABLE IF EXISTS config_admin CASCADE;
DROP TABLE IF EXISTS temporada CASCADE;
DROP TABLE IF EXISTS suscripcion CASCADE;
DROP TABLE IF EXISTS rivalidad CASCADE;
DROP TABLE IF EXISTS plantilla_album CASCADE;
DROP TABLE IF EXISTS refresh_token CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;
DROP TABLE IF EXISTS club CASCADE;

DROP TYPE IF EXISTS sub_modalidad_transmision;
DROP TYPE IF EXISTS contexto_asistencia;
DROP TYPE IF EXISTS estado_pedido;
DROP TYPE IF EXISTS estado_asociacion_foto;
DROP TYPE IF EXISTS estado_recordatorio;
DROP TYPE IF EXISTS estado_suscripcion;
DROP TYPE IF EXISTS plan_suscripcion;
DROP TYPE IF EXISTS tipo_competicion;
DROP TYPE IF EXISTS estado_partido;
DROP TYPE IF EXISTS estado_temporada;
DROP TYPE IF EXISTS proveedor_auth;

COMMIT;
