-- Migration: no exponer la función del trigger como RPC
-- Purpose: public.handle_new_auth_user() es SECURITY DEFINER y PostgREST la
--          expone como endpoint /rest/v1/rpc. Solo debe invocarla el trigger
--          on_auth_user_created, así que se revoca el EXECUTE a los roles de la
--          API (public/anon/authenticated). Detectado por get_advisors en hosted.

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
