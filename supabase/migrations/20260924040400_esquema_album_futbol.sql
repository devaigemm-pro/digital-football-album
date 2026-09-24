-- Migration: esquema del álbum digital de fútbol
-- Purpose: modela el dominio completo (SRS v2.0) descrito en src/domain/types.ts:
--          usuarios, clubes, temporadas, partidos, álbum, recuadros, momentos,
--          fotos, suscripciones, pedidos y envíos. Incluye enums de estado,
--          integridad referencial (diagrama ER) y RLS por usuario.
--
-- Notas de diseño:
--   * `public.usuarios.id` referencia `auth.users(id)`: el perfil de dominio se
--     ancla a la identidad de Supabase Auth para que RLS use `auth.uid()`.
--   * Relaciones 1:1 se modelan con UNIQUE en la FK (album↔temporada,
--     recuadro↔partido, momento↔partido, suscripción/dirección/pedido↔dueño).
--   * Los catálogos (clubs, rivalidades, plantillas) son de lectura pública;
--     el resto de los datos son privados por usuario.

-- ===========================================================================
-- 1. Enums de estado
-- ===========================================================================
create type proveedor_auth as enum ('apple', 'google', 'email');
create type estado_temporada as enum (
  'CONFIGURACION', 'ACTIVA', 'CERRADA', 'IMPRESION', 'LISTA', 'ENVIADA', 'FALLIDA'
);
create type estado_partido as enum ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO');
create type tipo_competicion as enum ('LIGA', 'COPA_NACIONAL', 'INTERNACIONAL');
create type plan_suscripcion as enum ('BASICO', 'PREMIUM');
create type estado_suscripcion as enum ('ACTIVA', 'EN_GRACIA', 'VENCIDA');
create type estado_recordatorio as enum ('ACTIVO', 'DETENIDO_POR_FOTO', 'SILENCIADO');
create type estado_asociacion_foto as enum ('ASOCIADA', 'PENDIENTE_ASOCIACION');
create type estado_pedido as enum ('PENDIENTE', 'EN_IMPRESION', 'LISTA', 'FALLIDA', 'ENVIADA');
create type contexto_asistencia as enum ('EN_VIVO_LOCAL', 'EN_VIVO_VISITA', 'TRANSMISION');
create type sub_modalidad_transmision as enum ('TELEVISION', 'BAR', 'STREAMING');

-- ===========================================================================
-- 2. Catálogos / identidad (lectura pública)
-- ===========================================================================
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  paleta_colores jsonb not null,
  escudo_url text not null,
  activos_visuales jsonb not null default '{"estadioUrls":[],"camisetaUrls":[]}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rivalidades (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  rival_nombre text not null,
  created_at timestamptz not null default now()
);
create index idx_rivalidades_club on public.rivalidades(club_id);

create table public.plantillas_album (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  recuadro_ancho_mm numeric(6,2) not null check (recuadro_ancho_mm > 0),
  recuadro_alto_mm numeric(6,2) not null check (recuadro_alto_mm > 0),
  created_at timestamptz not null default now()
);
create index idx_plantillas_club on public.plantillas_album(club_id);

-- ===========================================================================
-- 3. Usuario y sesión
-- ===========================================================================
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  proveedor_auth proveedor_auth not null,
  email text not null unique,
  club_id uuid references public.clubs(id) on delete set null,
  zona_horaria text not null default 'UTC',
  created_at timestamptz not null default now()
);
create index idx_usuarios_club on public.usuarios(club_id);

create table public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  token_hash text not null unique,
  familia_id uuid not null,
  expira_en timestamptz not null,
  rotado boolean not null default false,
  revocado boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_refresh_tokens_usuario on public.refresh_tokens(usuario_id);
create index idx_refresh_tokens_familia on public.refresh_tokens(familia_id);

create table public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.usuarios(id) on delete cascade,
  plan plan_suscripcion not null,
  estado estado_suscripcion not null,
  vigencia_hasta date not null,
  revenue_cat_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.direcciones_envio (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.usuarios(id) on delete cascade,
  campos jsonb not null,
  validada boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 4. Temporada y álbum
-- ===========================================================================
create table public.temporadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  club_id uuid not null references public.clubs(id),
  temporada_externa text not null,
  estado estado_temporada not null default 'CONFIGURACION',
  fecha_limite_cierre timestamptz not null,
  created_at timestamptz not null default now()
);
create index idx_temporadas_usuario on public.temporadas(usuario_id);
create index idx_temporadas_estado on public.temporadas(estado);
create index idx_temporadas_club on public.temporadas(club_id);

create table public.config_admin (
  id uuid primary key default gen_random_uuid(),
  temporada_id uuid not null unique references public.temporadas(id) on delete cascade,
  liga text not null,
  fecha_limite_cierre timestamptz not null,
  operador_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.partidos_oficiales (
  id uuid primary key default gen_random_uuid(),
  temporada_id uuid not null references public.temporadas(id) on delete cascade,
  partido_externo_id text not null,
  competicion text not null,
  tipo_competicion tipo_competicion not null,
  rival text not null,
  fecha_hora timestamptz not null,
  estado estado_partido not null default 'PROGRAMADO',
  es_clasico boolean not null default false,
  es_internacional boolean not null default false,
  resultado jsonb,
  alineacion jsonb not null default '[]'::jsonb,
  eventos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (temporada_id, partido_externo_id)
);
create index idx_partidos_temporada on public.partidos_oficiales(temporada_id);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  temporada_id uuid not null unique references public.temporadas(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Recuadro: 1:1 con partido, numero único por álbum (biunivocidad con el sticker).
-- foto_principal_id se enlaza a fotos más abajo (la tabla fotos se crea después).
create table public.recuadros (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  partido_oficial_id uuid not null unique references public.partidos_oficiales(id) on delete cascade,
  plantilla_id uuid not null references public.plantillas_album(id),
  numero integer not null check (numero > 0),
  ancho_mm numeric(6,2) not null check (ancho_mm > 0),
  alto_mm numeric(6,2) not null check (alto_mm > 0),
  foto_principal_id uuid,
  estado_recordatorio estado_recordatorio not null default 'ACTIVO',
  created_at timestamptz not null default now(),
  unique (album_id, numero)
);
create index idx_recuadros_album on public.recuadros(album_id);
create index idx_recuadros_plantilla on public.recuadros(plantilla_id);

-- ===========================================================================
-- 5. Momentos y fotos
-- ===========================================================================
create table public.momentos (
  id uuid primary key default gen_random_uuid(),
  partido_oficial_id uuid not null unique references public.partidos_oficiales(id) on delete cascade,
  contexto_asistencia contexto_asistencia not null,
  sub_modalidad sub_modalidad_transmision,
  geo_verificado boolean not null default false,
  notas text not null default '',
  jugador_del_partido text,
  created_at timestamptz not null default now(),
  -- sub_modalidad solo es válida cuando el contexto es TRANSMISION (Req 6.4)
  constraint chk_submodalidad_solo_transmision check (
    (contexto_asistencia = 'TRANSMISION' and sub_modalidad is not null)
    or (contexto_asistencia <> 'TRANSMISION' and sub_modalidad is null)
  )
);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  momento_id uuid not null references public.momentos(id) on delete cascade,
  object_key text not null,
  ancho_px integer not null check (ancho_px > 0),
  alto_px integer not null check (alto_px > 0),
  estado_asociacion estado_asociacion_foto not null default 'PENDIENTE_ASOCIACION',
  created_at timestamptz not null default now()
);
create index idx_fotos_momento on public.fotos(momento_id);
create index idx_fotos_estado on public.fotos(estado_asociacion);

-- Enlace diferido: foto principal del recuadro (a lo sumo una — Req 5.5)
alter table public.recuadros
  add constraint recuadros_foto_principal_fk
  foreign key (foto_principal_id) references public.fotos(id) on delete set null;
create index idx_recuadros_foto_principal on public.recuadros(foto_principal_id);

-- ===========================================================================
-- 6. Pedido (kit físico)
-- ===========================================================================
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  temporada_id uuid not null unique references public.temporadas(id) on delete cascade,
  estado estado_pedido not null default 'PENDIENTE',
  tracking text,
  datos_fiscales_minimos jsonb,
  intentos_impresion integer not null default 0 check (intentos_impresion >= 0),
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 7. Row Level Security
-- ===========================================================================

-- Helper: ¿la temporada pertenece al usuario autenticado?
-- Vive en el schema `private` (no expuesto por PostgREST) para que NO sea
-- invocable como endpoint RPC, pero `authenticated` sí puede ejecutarla porque
-- las políticas RLS la llaman en su nombre. SECURITY DEFINER para evaluar
-- `temporadas` sin que el llamador necesite verla directamente.
create schema if not exists private;

create function private.owns_temporada(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.temporadas t
    where t.id = t_id and t.usuario_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_temporada(uuid) from public;
grant execute on function private.owns_temporada(uuid) to authenticated;

alter table public.clubs enable row level security;
alter table public.rivalidades enable row level security;
alter table public.plantillas_album enable row level security;
alter table public.usuarios enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.suscripciones enable row level security;
alter table public.direcciones_envio enable row level security;
alter table public.temporadas enable row level security;
alter table public.config_admin enable row level security;
alter table public.partidos_oficiales enable row level security;
alter table public.albums enable row level security;
alter table public.recuadros enable row level security;
alter table public.momentos enable row level security;
alter table public.fotos enable row level security;
alter table public.pedidos enable row level security;

-- Catálogos: lectura pública (anon + authenticated)
create policy "clubs_select_public" on public.clubs
  for select to anon, authenticated using (true);
create policy "rivalidades_select_public" on public.rivalidades
  for select to anon, authenticated using (true);
create policy "plantillas_select_public" on public.plantillas_album
  for select to anon, authenticated using (true);

-- Usuarios: cada quien su propia fila
create policy "usuarios_select_own" on public.usuarios
  for select to authenticated using ((select auth.uid()) = id);
create policy "usuarios_insert_own" on public.usuarios
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "usuarios_update_own" on public.usuarios
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "usuarios_delete_own" on public.usuarios
  for delete to authenticated using ((select auth.uid()) = id);

-- Tokens / suscripción / dirección: solo el dueño
create policy "refresh_tokens_all_own" on public.refresh_tokens
  for all to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "suscripciones_all_own" on public.suscripciones
  for all to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "direcciones_all_own" on public.direcciones_envio
  for all to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);

-- Datos por temporada
create policy "temporadas_all_own" on public.temporadas
  for all to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "config_admin_all_own" on public.config_admin
  for all to authenticated using (private.owns_temporada(temporada_id)) with check (private.owns_temporada(temporada_id));
create policy "partidos_all_own" on public.partidos_oficiales
  for all to authenticated using (private.owns_temporada(temporada_id)) with check (private.owns_temporada(temporada_id));
create policy "albums_all_own" on public.albums
  for all to authenticated using (private.owns_temporada(temporada_id)) with check (private.owns_temporada(temporada_id));
create policy "pedidos_all_own" on public.pedidos
  for all to authenticated using (private.owns_temporada(temporada_id)) with check (private.owns_temporada(temporada_id));

-- Recuadros: a través de album → temporada
create policy "recuadros_all_own" on public.recuadros
  for all to authenticated
  using (exists (select 1 from public.albums a where a.id = album_id and private.owns_temporada(a.temporada_id)))
  with check (exists (select 1 from public.albums a where a.id = album_id and private.owns_temporada(a.temporada_id)));

-- Momentos: a través de partido → temporada
create policy "momentos_all_own" on public.momentos
  for all to authenticated
  using (exists (select 1 from public.partidos_oficiales p where p.id = partido_oficial_id and private.owns_temporada(p.temporada_id)))
  with check (exists (select 1 from public.partidos_oficiales p where p.id = partido_oficial_id and private.owns_temporada(p.temporada_id)));

-- Fotos: a través de momento → partido → temporada
create policy "fotos_all_own" on public.fotos
  for all to authenticated
  using (exists (
    select 1 from public.momentos m
    join public.partidos_oficiales p on p.id = m.partido_oficial_id
    where m.id = momento_id and private.owns_temporada(p.temporada_id)
  ))
  with check (exists (
    select 1 from public.momentos m
    join public.partidos_oficiales p on p.id = m.partido_oficial_id
    where m.id = momento_id and private.owns_temporada(p.temporada_id)
  ));
