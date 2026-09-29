-- Logo de la liga/competición por partido (provisto por la API deportiva en el
-- fixture: `league.logo`). Nullable: tolerante a partidos ya existentes sin logo
-- y a competiciones cuya fuente no lo reporte.
alter table public.partidos_oficiales
  add column if not exists competicion_logo_url text null;
