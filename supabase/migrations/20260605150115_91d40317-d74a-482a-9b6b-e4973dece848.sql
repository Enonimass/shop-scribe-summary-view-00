
-- 1. Profiles: remove blanket public RLS and direct write grants
DROP POLICY IF EXISTS "Allow all access to profiles" ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE SELECT (password) ON public.profiles FROM anon, authenticated, PUBLIC;
-- Allow non-password columns to still be selected by the app's anon-key client
GRANT SELECT (id, username, display_name, role, shop_id, shop_name, created_at, updated_at)
  ON public.profiles TO anon, authenticated;

-- Replace the blanket policy with read-only access; writes are now blocked
-- at the grant layer and must go through the admin-action edge function.
CREATE POLICY "profiles_read_safe_columns" ON public.profiles
  FOR SELECT USING (true);

-- 2. Remove profiles from the realtime publication so password hashes are
--    never broadcast to subscribers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END $$;

-- 3. Sensitive RPCs: revoke anon EXECUTE; only authenticated/service_role
--    can call directly (and the edge function uses service_role).
REVOKE EXECUTE ON FUNCTION public.rename_customer(text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_customers_from_sales(text) FROM anon, PUBLIC;

-- 4. Audit logs: lock direct INSERT to service_role; the admin-action edge
--    function records audit rows after verifying the caller's session token.
DROP POLICY IF EXISTS anyone_insert_audit_logs ON public.audit_logs;
REVOKE INSERT ON public.audit_logs FROM anon, authenticated;
