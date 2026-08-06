CREATE TABLE public.customer_prepayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id text NOT NULL,
  customer_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method_id uuid,
  payment_method_name text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_prepayments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_prepayments TO authenticated;
GRANT ALL ON public.customer_prepayments TO service_role;
ALTER TABLE public.customer_prepayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to customer_prepayments" ON public.customer_prepayments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.prepayment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prepayment_id uuid NOT NULL REFERENCES public.customer_prepayments(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.sales_transactions(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepayment_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepayment_applications TO authenticated;
GRANT ALL ON public.prepayment_applications TO service_role;
ALTER TABLE public.prepayment_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to prepayment_applications" ON public.prepayment_applications FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_customer_prepayments_updated_at BEFORE UPDATE ON public.customer_prepayments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prepayment_applications_updated_at BEFORE UPDATE ON public.prepayment_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.forbid_negative_prepayment()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount < 0 THEN
    RAISE EXCEPTION 'Amount cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_no_negative_prepayment BEFORE INSERT OR UPDATE ON public.customer_prepayments
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_prepayment();

CREATE OR REPLACE FUNCTION public.check_prepayment_application()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_total numeric;
  v_used numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount < 0 THEN
    RAISE EXCEPTION 'Applied amount cannot be negative';
  END IF;
  SELECT amount INTO v_total FROM public.customer_prepayments WHERE id = NEW.prepayment_id;
  SELECT COALESCE(sum(amount), 0) INTO v_used FROM public.prepayment_applications
    WHERE prepayment_id = NEW.prepayment_id AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF v_used + NEW.amount > COALESCE(v_total, 0) + 0.01 THEN
    RAISE EXCEPTION 'Applied amount exceeds prepayment balance (available %)', COALESCE(v_total,0) - v_used;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_prepayment_application BEFORE INSERT OR UPDATE ON public.prepayment_applications
FOR EACH ROW EXECUTE FUNCTION public.check_prepayment_application();

CREATE INDEX idx_prepayments_shop_customer ON public.customer_prepayments (shop_id, lower(customer_name));
CREATE INDEX idx_prepayment_apps_prepayment ON public.prepayment_applications (prepayment_id);