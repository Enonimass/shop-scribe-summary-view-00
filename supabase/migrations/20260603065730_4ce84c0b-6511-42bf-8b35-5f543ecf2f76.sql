
-- Restrict reading of the password column on profiles to service_role only.
-- Anon/authenticated can still read/write all other profile columns and can still insert/update the password column (the DB trigger hashes it).
REVOKE SELECT ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, username, display_name, role, shop_id, shop_name, created_at, updated_at) ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Lock down verify_password: only the service_role (used by the login edge function) can execute it.
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_password(text, text) TO service_role;

-- Revoke has_role from anon (no anon RLS policy uses it); authenticated keeps EXECUTE for RLS.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
