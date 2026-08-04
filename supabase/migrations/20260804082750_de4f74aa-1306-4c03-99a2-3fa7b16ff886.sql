ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE public.delivery_notes
  SET status = 'approved',
      approved_at = COALESCE(approved_at, added_to_inventory_at, seller_confirmed_at, created_at),
      approved_by = COALESCE(approved_by, seller_confirmed_by, 'legacy'),
      dispatched_at = COALESCE(dispatched_at, logistics_confirmed_at, created_at),
      dispatched_by = COALESCE(dispatched_by, logistics_confirmed_by, created_by)
  WHERE status IN ('added_to_inventory', 'seller_confirmed', 'logistics_confirmed');

CREATE TABLE IF NOT EXISTS public.shop_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id text NOT NULL,
  product text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text,
  status text NOT NULL DEFAULT 'received',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_returns TO anon, authenticated;
GRANT ALL ON public.shop_returns TO service_role;

ALTER TABLE public.shop_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to shop_returns" ON public.shop_returns
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_shop_returns_updated_at
  BEFORE UPDATE ON public.shop_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_shop_returns_shop_date ON public.shop_returns (shop_id, return_date DESC);