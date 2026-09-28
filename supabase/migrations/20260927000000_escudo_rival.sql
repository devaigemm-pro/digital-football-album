-- Añade la URL del escudo/insignia del equipo rival a los partidos oficiales,
-- para mostrar las insignias de ambos equipos en el marcador y la lista.
-- Nullable: los partidos existentes quedan sin escudo hasta la próxima
-- sincronización con la API deportiva (que ya lo captura).
alter table public.partidos_oficiales
  add column if not exists escudo_rival_url text;
