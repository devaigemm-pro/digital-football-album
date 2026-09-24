-- Seed: datos de ejemplo para desarrollo local del álbum digital de fútbol.
--
-- Se ejecuta automáticamente tras las migraciones en cada `supabase db reset`.
-- Es idempotente: usa UUIDs fijos + ON CONFLICT DO NOTHING para poder re-sembrar
-- sin duplicar filas. NO usar estos datos en producción.
--
-- Contenido:
--   1. Catálogo: dos clubes con su paleta, plantilla de álbum y rivalidades.
--   2. Un usuario de prueba (auth.users + perfil) con una temporada completa:
--      partido oficial -> álbum -> recuadro -> momento -> foto.

-- ===========================================================================
-- 1. Catálogo (no depende de autenticación)
-- ===========================================================================

-- Clubes
insert into public.clubs (id, nombre, paleta_colores, escudo_url, activos_visuales)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Atlético Kiro',
    '{"primario":"#C8102E","secundario":"#FFFFFF","acento":"#000000"}'::jsonb,
    'https://cdn.example.com/escudos/atletico-kiro.png',
    '{"estadioUrls":["https://cdn.example.com/estadios/kiro-1.jpg"],"camisetaUrls":["https://cdn.example.com/camisetas/kiro-home.png"]}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Deportivo Supabase',
    '{"primario":"#3ECF8E","secundario":"#1F1F1F","acento":"#FFFFFF"}'::jsonb,
    'https://cdn.example.com/escudos/deportivo-supabase.png',
    '{"estadioUrls":["https://cdn.example.com/estadios/supabase-1.jpg"],"camisetaUrls":["https://cdn.example.com/camisetas/supabase-home.png"]}'::jsonb
  )
on conflict (id) do nothing;

-- Rivalidades (para clasificar clásicos)
insert into public.rivalidades (id, club_id, rival_nombre)
values
  ('aaaa1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Deportivo Supabase'),
  ('aaaa2222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Atlético Kiro')
on conflict (id) do nothing;

-- Plantillas de álbum (dimensiones físicas del recuadro, para el cálculo de DPI)
insert into public.plantillas_album (id, club_id, recuadro_ancho_mm, recuadro_alto_mm)
values
  ('bbbb1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 60.00, 85.00),
  ('bbbb2222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 60.00, 85.00)
on conflict (id) do nothing;

-- ===========================================================================
-- 2. Usuario de prueba + temporada completa
-- ===========================================================================
-- La FK usuarios.id -> auth.users(id) obliga a crear primero el usuario de auth.
-- Se inserta un registro mínimo en auth.users (solo para desarrollo local).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '99999999-9999-9999-9999-999999999999',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'hincha.demo@example.com',
  crypt('password-demo', gen_salt('bf')),
  now(), now(), now()
)
on conflict (id) do nothing;

-- Perfil de dominio del usuario.
-- Nota: el trigger on_auth_user_created ya creó una fila básica al insertar en
-- auth.users (club_id null, zona UTC). Aquí se completan los datos específicos
-- del usuario demo (club y zona horaria) con ON CONFLICT DO UPDATE.
insert into public.usuarios (id, proveedor_auth, email, club_id, zona_horaria)
values (
  '99999999-9999-9999-9999-999999999999',
  'email',
  'hincha.demo@example.com',
  '11111111-1111-1111-1111-111111111111',
  'America/Bogota'
)
on conflict (id) do update
  set club_id = excluded.club_id,
      zona_horaria = excluded.zona_horaria;

-- Suscripción del usuario
insert into public.suscripciones (id, usuario_id, plan, estado, vigencia_hasta, revenue_cat_id)
values (
  'cccc1111-0000-0000-0000-000000000001',
  '99999999-9999-9999-9999-999999999999',
  'PREMIUM', 'ACTIVA', date '2026-12-31', 'rc_demo_99999999'
)
on conflict (id) do nothing;

-- Temporada activa
insert into public.temporadas (id, usuario_id, club_id, temporada_externa, estado, fecha_limite_cierre)
values (
  'dddd1111-0000-0000-0000-000000000001',
  '99999999-9999-9999-9999-999999999999',
  '11111111-1111-1111-1111-111111111111',
  '2026', 'ACTIVA', timestamptz '2026-12-15 23:59:00+00'
)
on conflict (id) do nothing;

-- Config admin de la temporada
insert into public.config_admin (id, temporada_id, liga, fecha_limite_cierre, operador_id)
values (
  'eeee1111-0000-0000-0000-000000000001',
  'dddd1111-0000-0000-0000-000000000001',
  'Liga Kiro', timestamptz '2026-12-15 23:59:00+00',
  '99999999-9999-9999-9999-999999999999'
)
on conflict (id) do nothing;

-- Partido oficial (un clásico contra el rival)
insert into public.partidos_oficiales (
  id, temporada_id, partido_externo_id, competicion, tipo_competicion, rival,
  fecha_hora, estado, es_clasico, es_internacional, resultado, alineacion, eventos
)
values (
  'ffff1111-0000-0000-0000-000000000001',
  'dddd1111-0000-0000-0000-000000000001',
  'ext-2026-J1', 'Liga Kiro', 'LIGA', 'Deportivo Supabase',
  timestamptz '2026-03-10 20:00:00+00', 'FINALIZADO', true, false,
  '{"golesLocal":2,"golesVisita":1}'::jsonb,
  '[{"id":"j1","nombre":"A. Portero"},{"id":"j2","nombre":"C. Delantero"}]'::jsonb,
  '[{"minuto":23,"tipo":"gol","descripcion":"C. Delantero"},{"minuto":67,"tipo":"gol","descripcion":"C. Delantero"}]'::jsonb
)
on conflict (id) do nothing;

-- Álbum de la temporada
insert into public.albums (id, temporada_id)
values ('a1b10001-0000-0000-0000-000000000001', 'dddd1111-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Recuadro del partido (numero 1)
insert into public.recuadros (
  id, album_id, partido_oficial_id, plantilla_id, numero, ancho_mm, alto_mm, estado_recordatorio
)
values (
  'a1b10002-0000-0000-0000-000000000001',
  'a1b10001-0000-0000-0000-000000000001',
  'ffff1111-0000-0000-0000-000000000001',
  'bbbb1111-0000-0000-0000-000000000001',
  1, 60.00, 85.00, 'ACTIVO'
)
on conflict (id) do nothing;

-- Momento del partido (en vivo, local)
insert into public.momentos (
  id, partido_oficial_id, contexto_asistencia, sub_modalidad, geo_verificado, notas, jugador_del_partido
)
values (
  'a1b10003-0000-0000-0000-000000000001',
  'ffff1111-0000-0000-0000-000000000001',
  'EN_VIVO_LOCAL', null, true,
  'Clásico inolvidable, doblete en el estadio.', 'C. Delantero'
)
on conflict (id) do nothing;

-- Foto asociada al momento
insert into public.fotos (id, momento_id, object_key, ancho_px, alto_px, estado_asociacion)
values (
  'a1b10004-0000-0000-0000-000000000001',
  'a1b10003-0000-0000-0000-000000000001',
  'fotos/99999999/clasico-j1.jpg', 2400, 3400, 'ASOCIADA'
)
on conflict (id) do nothing;

-- Marcar esa foto como la foto principal del recuadro
update public.recuadros
set foto_principal_id = 'a1b10004-0000-0000-0000-000000000001',
    estado_recordatorio = 'DETENIDO_POR_FOTO'
where id = 'a1b10002-0000-0000-0000-000000000001'
  and foto_principal_id is null;
