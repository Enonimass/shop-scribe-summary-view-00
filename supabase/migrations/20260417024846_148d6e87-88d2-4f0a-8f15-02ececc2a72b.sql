-- Delivery notes header
CREATE TABLE public.delivery_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_note_no text NOT NULL,
  shop_id text NOT NULL,
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  delivered_by text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  -- status values: draft | logistics_confirmed | seller_confirmed | added_to_inventory
  logistics_confirmed_at timestamptz,
  logistics_confirmed_by text,
  seller_confirmed_at timestamptz,
  seller_confirmed_by text,
  added_to_inventory_at timestamptz,
  created_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_notes_shop_date ON public.delivery_notes (shop_id, delivery_date);
CREATE INDEX idx_delivery_notes_status ON public.delivery_notes (status);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to delivery_notes"
  ON public.delivery_notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Delivery note line items
CREATE TABLE public.delivery_note_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  product text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_note_items_note ON public.delivery_note_items (delivery_note_id);

ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to delivery_note_items"
  ON public.delivery_note_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_delivery_note_items_updated_at
  BEFORE UPDATE ON public.delivery_note_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();