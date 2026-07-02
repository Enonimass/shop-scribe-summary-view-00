
-- =====================================================================
-- 1) Case-insensitive customer name normalization
-- =====================================================================

-- Helper: pick canonical casing per (shop, lower(name)) based on most-used
CREATE OR REPLACE FUNCTION public.canonical_customer_name(p_shop_id text, p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT name FROM public.customers
      WHERE shop_id = p_shop_id AND lower(name) = lower(p_name)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1),
    p_name
  )
$$;

-- Trigger: normalize customer_name on write
CREATE OR REPLACE FUNCTION public.normalize_customer_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canon text;
BEGIN
  IF NEW.customer_name IS NULL OR length(trim(NEW.customer_name)) = 0 THEN
    RETURN NEW;
  END IF;
  v_canon := public.canonical_customer_name(NEW.shop_id, NEW.customer_name);
  IF v_canon IS NOT NULL AND v_canon <> NEW.customer_name THEN
    NEW.customer_name := v_canon;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_customer_name_st ON public.sales_transactions;
CREATE TRIGGER trg_normalize_customer_name_st
BEFORE INSERT OR UPDATE OF customer_name, shop_id ON public.sales_transactions
FOR EACH ROW EXECUTE FUNCTION public.normalize_customer_name();

DROP TRIGGER IF EXISTS trg_normalize_customer_name_dp ON public.debt_payments;
CREATE TRIGGER trg_normalize_customer_name_dp
BEFORE INSERT OR UPDATE OF customer_name, shop_id ON public.debt_payments
FOR EACH ROW EXECUTE FUNCTION public.normalize_customer_name();

-- Backfill: pick canonical casing = the spelling with the most sales
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH counts AS (
      SELECT shop_id, customer_name AS name, count(*) AS c
      FROM public.sales_transactions
      WHERE customer_name IS NOT NULL
      GROUP BY shop_id, customer_name
    ),
    ranked AS (
      SELECT shop_id, lower(name) AS lname, name,
             row_number() OVER (PARTITION BY shop_id, lower(name) ORDER BY c DESC, name ASC) rn
      FROM counts
    )
    SELECT shop_id, lname, name AS canonical FROM ranked WHERE rn = 1
  LOOP
    UPDATE public.sales_transactions
    SET customer_name = r.canonical
    WHERE shop_id = r.shop_id
      AND lower(customer_name) = r.lname
      AND customer_name <> r.canonical;

    UPDATE public.debt_payments
    SET customer_name = r.canonical
    WHERE shop_id = r.shop_id
      AND lower(customer_name) = r.lname
      AND customer_name <> r.canonical;

    UPDATE public.customers
    SET name = r.canonical
    WHERE shop_id = r.shop_id
      AND lower(name) = r.lname
      AND name <> r.canonical;
  END LOOP;
END $$;

-- Merge duplicate customers created before normalization
DELETE FROM public.customers c
USING public.customers c2
WHERE c.shop_id = c2.shop_id
  AND lower(c.name) = lower(c2.name)
  AND c.name = c2.name
  AND c.id > c2.id;

-- =====================================================================
-- 2) FPS (factory_inventory) <-> Kiambu shared stock mirror
--    When a Kiambu sales_item is written, mirror the change onto
--    factory_inventory for the matching product+unit.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.mirror_kiambu_sale_to_factory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop text;
  v_prod text;
  v_unit text;
  v_delta numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT shop_id INTO v_shop FROM public.sales_transactions WHERE id = NEW.transaction_id;
    IF v_shop IS DISTINCT FROM 'kiambu_shop' THEN RETURN NEW; END IF;
    v_prod := NEW.product; v_unit := NEW.unit; v_delta := -COALESCE(NEW.quantity,0);
  ELSIF TG_OP = 'DELETE' THEN
    SELECT shop_id INTO v_shop FROM public.sales_transactions WHERE id = OLD.transaction_id;
    IF v_shop IS DISTINCT FROM 'kiambu_shop' THEN RETURN OLD; END IF;
    v_prod := OLD.product; v_unit := OLD.unit; v_delta := COALESCE(OLD.quantity,0);
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT shop_id INTO v_shop FROM public.sales_transactions WHERE id = NEW.transaction_id;
    IF v_shop IS DISTINCT FROM 'kiambu_shop' THEN RETURN NEW; END IF;
    -- If product/unit unchanged, adjust delta only
    IF OLD.product = NEW.product AND OLD.unit = NEW.unit THEN
      v_prod := NEW.product; v_unit := NEW.unit;
      v_delta := COALESCE(OLD.quantity,0) - COALESCE(NEW.quantity,0);
    ELSE
      -- Restore old row, deduct new row separately
      UPDATE public.factory_inventory
        SET quantity = quantity + COALESCE(OLD.quantity,0), updated_at = now()
        WHERE product = OLD.product AND unit = OLD.unit;
      v_prod := NEW.product; v_unit := NEW.unit; v_delta := -COALESCE(NEW.quantity,0);
    END IF;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.factory_inventory
      SET quantity = quantity + v_delta, updated_at = now()
      WHERE product = v_prod AND unit = v_unit;
    -- Do NOT auto-create a factory row if none exists (unit mismatch = silent skip)
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_kiambu_sale ON public.sales_items;
CREATE TRIGGER trg_mirror_kiambu_sale
AFTER INSERT OR UPDATE OR DELETE ON public.sales_items
FOR EACH ROW EXECUTE FUNCTION public.mirror_kiambu_sale_to_factory();

-- =====================================================================
-- 3) Factory intake log (production -> factory store)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.factory_intake_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_date date NOT NULL DEFAULT CURRENT_DATE,
  product text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL,
  note text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_intake_log TO authenticated;
GRANT SELECT ON public.factory_intake_log TO anon;
GRANT ALL ON public.factory_intake_log TO service_role;

ALTER TABLE public.factory_intake_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factory_intake_log_all" ON public.factory_intake_log;
CREATE POLICY "factory_intake_log_all"
ON public.factory_intake_log
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_factory_intake_log_date ON public.factory_intake_log(intake_date);
CREATE INDEX IF NOT EXISTS idx_factory_intake_log_product ON public.factory_intake_log(product, unit);
