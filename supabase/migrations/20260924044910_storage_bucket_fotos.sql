-- Migration: bucket de Storage para las fotos de usuarios
-- Purpose: crea el bucket privado `fotos` donde el Motor_Momentos sube los
--          binarios originales de las fotografías (Req 5, 19, 20). El bucket es
--          privado: el acceso se hace con la service_role (backend) o con URLs
--          firmadas; no se sirve públicamente.

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

-- Políticas RLS sobre storage.objects para el bucket `fotos`.
-- Un usuario autenticado solo puede operar sobre objetos cuyo primer segmento
-- de ruta sea su propio id (convención de ruta: "<usuarioId>/<...>").
-- La service_role omite RLS, así que el backend de confianza no se ve afectado.

create policy "fotos_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "fotos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "fotos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'fotos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "fotos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
