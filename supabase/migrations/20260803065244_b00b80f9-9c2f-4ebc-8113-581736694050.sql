CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester text NOT NULL,
  requester_role text NOT NULL,
  shop_id text,
  entity text NOT NULL,
  entity_id text,
  entity_label text,
  requested_change text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO authenticated;
GRANT ALL ON public.change_requests TO service_role;

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to change_requests" ON public.change_requests
FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER change_requests_set_updated_at
BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX change_requests_status_idx ON public.change_requests (status, created_at DESC);