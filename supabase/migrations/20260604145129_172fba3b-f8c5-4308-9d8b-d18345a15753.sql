ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.rename_customer(p_old text, p_new text, p_shop_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c1 int := 0; c2 int := 0; c3 int := 0; c4 int := 0; c5 int := 0;
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR length(trim(p_new)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid arguments');
  END IF;

  UPDATE public.customers SET name = p_new, updated_at = now()
  WHERE shop_id = p_shop_id AND lower(name) = lower(p_old);
  GET DIAGNOSTICS c1 = ROW_COUNT;

  UPDATE public.sales_transactions SET customer_name = p_new
  WHERE shop_id = p_shop_id AND lower(customer_name) = lower(p_old);
  GET DIAGNOSTICS c2 = ROW_COUNT;

  UPDATE public.sales SET customer_name = p_new
  WHERE shop_id = p_shop_id AND lower(coalesce(customer_name, '')) = lower(p_old);
  GET DIAGNOSTICS c3 = ROW_COUNT;

  UPDATE public.debt_payments SET customer_name = p_new
  WHERE shop_id = p_shop_id AND lower(customer_name) = lower(p_old);
  GET DIAGNOSTICS c4 = ROW_COUNT;

  UPDATE public.trip_stops SET customer_name = p_new
  WHERE lower(coalesce(customer_name, '')) = lower(p_old);
  GET DIAGNOSTICS c5 = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'customers', c1, 'sales_transactions', c2, 'sales', c3, 'debt_payments', c4, 'trip_stops', c5);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_customer(text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_customers_from_sales(p_shop_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int := 0; updated int := 0;
BEGIN
  WITH agg AS (
    SELECT customer_name AS name, shop_id, min(sale_date) AS first_d, max(sale_date) AS last_d
    FROM public.sales_transactions
    WHERE (p_shop_id IS NULL OR shop_id = p_shop_id) AND customer_name IS NOT NULL AND length(trim(customer_name)) > 0
    GROUP BY customer_name, shop_id
  ),
  ins AS (
    INSERT INTO public.customers (name, shop_id, first_purchase_date, last_purchase_date)
    SELECT a.name, a.shop_id, a.first_d, a.last_d
    FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.shop_id = a.shop_id AND lower(c.name) = lower(a.name)
    )
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;

  WITH agg AS (
    SELECT customer_name AS name, shop_id, min(sale_date) AS first_d, max(sale_date) AS last_d
    FROM public.sales_transactions
    WHERE (p_shop_id IS NULL OR shop_id = p_shop_id) AND customer_name IS NOT NULL AND length(trim(customer_name)) > 0
    GROUP BY customer_name, shop_id
  ),
  upd AS (
    UPDATE public.customers c
    SET first_purchase_date = a.first_d,
        last_purchase_date = a.last_d,
        updated_at = now()
    FROM agg a
    WHERE c.shop_id = a.shop_id
      AND lower(c.name) = lower(a.name)
      AND (c.first_purchase_date IS DISTINCT FROM a.first_d
        OR c.last_purchase_date IS DISTINCT FROM a.last_d)
    RETURNING 1
  )
  SELECT count(*) INTO updated FROM upd;

  RETURN jsonb_build_object('inserted', inserted, 'updated', updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_customers_from_sales(text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_customers_shop_lower_name ON public.customers (shop_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_sales_tx_shop_customer ON public.sales_transactions (shop_id, lower(customer_name));