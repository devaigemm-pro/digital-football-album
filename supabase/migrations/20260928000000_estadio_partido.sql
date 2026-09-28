-- Añade el estadio donde se jugó el partido, para mostrarlo bajo el marcador.
-- Nullable: los partidos existentes quedan sin estadio hasta la próxima
-- sincronización con la API deportiva (que ya lo captura desde fixture.venue).
alter table public.partidos_oficiales
  add column if not exists estadio text;
