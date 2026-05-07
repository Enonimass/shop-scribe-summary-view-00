-- Product prices: per shop, product, unit
CREATE TABLE public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id text NOT NULL,
  product text NOT NULL,
  unit text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, product, unit)
);
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to product_prices" ON public.product_prices FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_product_prices_updated_at BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payment methods (admin managed, dynamic)
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'cash', -- cash | mobile | bank | credit | other
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to payment_methods" ON public.payment_methods FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed common payment methods
INSERT INTO public.payment_methods (name, kind) VALUES
  ('Cash','cash'),
  ('Equity','bank'),
  ('Mpesa','mobile'),
  ('Credit','credit')
ON CONFLICT (name) DO NOTHING;

-- Add payment + totals to sales_transactions
ALTER TABLE public.sales_transactions
  ADD COLUMN IF NOT EXISTS payment_method_id uuid,
  ADD COLUMN IF NOT EXISTS payment_method_name text,
  ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

-- Add per-line pricing to sales_items
ALTER TABLE public.sales_items
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_price numeric,
  ADD COLUMN IF NOT EXISTS price_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS line_total numeric NOT NULL DEFAULT 0;

-- Debt payments (when a debtor pays off credit)
CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id text NOT NULL,
  customer_name text NOT NULL,
  amount numeric NOT NULL,
  payment_method_id uuid,
  payment_method_name text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to debt_payments" ON public.debt_payments FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_debt_payments_updated_at BEFORE UPDATE ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_debt_payments_shop_date ON public.debt_payments(shop_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_product_prices_shop ON public.product_prices(shop_id);