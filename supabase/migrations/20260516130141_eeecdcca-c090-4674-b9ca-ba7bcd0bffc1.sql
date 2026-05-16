-- Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role checker
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles: only super admins manage
DROP POLICY IF EXISTS "super_admin_select_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_select_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin_insert_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_insert_user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin_update_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_update_user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin_delete_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_delete_user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text,
  actor_role text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  shop_id text,
  before jsonb,
  after jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_shop ON public.audit_logs (shop_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon app users) can write audit rows
DROP POLICY IF EXISTS "anyone_insert_audit_logs" ON public.audit_logs;
CREATE POLICY "anyone_insert_audit_logs" ON public.audit_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only super admins can read
DROP POLICY IF EXISTS "super_admin_select_audit_logs" ON public.audit_logs;
CREATE POLICY "super_admin_select_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));