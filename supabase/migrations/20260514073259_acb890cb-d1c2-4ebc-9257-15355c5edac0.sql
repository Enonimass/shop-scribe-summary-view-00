ALTER TABLE public.sales_transactions
  ADD COLUMN IF NOT EXISTS fulfilled_by_shop_id text,
  ADD COLUMN IF NOT EXISTS fulfilled_by_shop_name text;