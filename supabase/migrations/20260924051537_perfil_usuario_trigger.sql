-- Migration: creación automática del perfil de usuario
-- Purpose: cuando alguien se registra en Supabase Auth (auth.users), crear
--          automáticamente su fila de dominio en public.usuarios, de modo que
--          un usuario autenticado siempre tenga su perfil disponible.
--
-- El proveedor se deriva de app_metadata.provider (email/google/apple); si no
-- reconoce el valor, cae a 'email'. La zona horaria arranca en 'UTC' y el
-- usuario la ajusta después (Req 14). El club_id queda null hasta que el usuario
-- selecciona su club (Req 2).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proveedor public.proveedor_auth;
  proveedor_raw text;
begin
  proveedor_raw := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  proveedor := case proveedor_raw
    when 'google' then 'google'::public.proveedor_auth
    when 'apple' then 'apple'::public.proveedor_auth
    else 'email'::public.proveedor_auth
  end;

  insert into public.usuarios (id, proveedor_auth, email, club_id, zona_horaria)
  values (
    new.id,
    proveedor,
    coalesce(new.email, new.id::text || '@sin-email.local'),
    null,
    'UTC'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- El trigger se dispara tras insertar en auth.users (registro/alta).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
