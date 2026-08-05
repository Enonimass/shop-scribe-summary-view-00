CREATE OR REPLACE FUNCTION public.forbid_negative_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity IS NOT NULL AND NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative (got %)', NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.inventory;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.factory_inventory;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.factory_inventory
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.shop_returns;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.shop_returns
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.delivery_note_items;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.delivery_note_items
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.factory_intake_log;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.factory_intake_log
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

DROP TRIGGER IF EXISTS trg_no_negative_qty ON public.trip_returns;
CREATE TRIGGER trg_no_negative_qty BEFORE INSERT OR UPDATE ON public.trip_returns
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_quantity();

CREATE OR REPLACE FUNCTION public.forbid_negative_sales_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity IS NOT NULL AND NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative (got %)', NEW.quantity;
  END IF;
  IF NEW.unit_price IS NOT NULL AND NEW.unit_price < 0 THEN
    RAISE EXCEPTION 'Unit price cannot be negative';
  END IF;
  IF NEW.line_total IS NOT NULL AND NEW.line_total < 0 THEN
    RAISE EXCEPTION 'Line total cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_negative_sales_item ON public.sales_items;
CREATE TRIGGER trg_no_negative_sales_item BEFORE INSERT OR UPDATE ON public.sales_items
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_sales_item();

CREATE OR REPLACE FUNCTION public.forbid_negative_trip_stop_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dispatched_qty IS NOT NULL AND NEW.dispatched_qty < 0 THEN
    RAISE EXCEPTION 'Dispatched quantity cannot be negative';
  END IF;
  IF NEW.received_qty IS NOT NULL AND NEW.received_qty < 0 THEN
    RAISE EXCEPTION 'Received quantity cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_negative_trip_stop_item ON public.trip_stop_items;
CREATE TRIGGER trg_no_negative_trip_stop_item BEFORE INSERT OR UPDATE ON public.trip_stop_items
FOR EACH ROW EXECUTE FUNCTION public.forbid_negative_trip_stop_item();

REVOKE EXECUTE ON FUNCTION public.forbid_negative_quantity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.forbid_negative_sales_item() FROM anon;
REVOKE EXECUTE ON FUNCTION public.forbid_negative_trip_stop_item() FROM anon;