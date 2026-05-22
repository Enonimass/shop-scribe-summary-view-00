CREATE TABLE IF NOT EXISTS public.factory_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  threshold numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, unit)
);
ALTER TABLE public.factory_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_factory_inventory" ON public.factory_inventory;
CREATE POLICY "allow_all_factory_inventory" ON public.factory_inventory FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_no text NOT NULL,
  trip_date date NOT NULL DEFAULT CURRENT_DATE,
  vehicle text,
  driver text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_trips" ON public.trips;
CREATE POLICY "allow_all_trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_type text NOT NULL CHECK (stop_type IN ('outlet','customer')),
  shop_id text,
  shop_name text,
  customer_name text,
  place text,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by text,
  confirmed_at timestamptz,
  billed_sale_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON public.trip_stops (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_shop ON public.trip_stops (shop_id);
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_trip_stops" ON public.trip_stops;
CREATE POLICY "allow_all_trip_stops" ON public.trip_stops FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.trip_stop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id uuid NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  product text NOT NULL,
  unit text NOT NULL,
  dispatched_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric,
  discrepancy_qty numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_stop_items_stop ON public.trip_stop_items (stop_id);
ALTER TABLE public.trip_stop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_trip_stop_items" ON public.trip_stop_items;
CREATE POLICY "allow_all_trip_stop_items" ON public.trip_stop_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.trip_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  product text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_returns_trip ON public.trip_returns (trip_id);
ALTER TABLE public.trip_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_trip_returns" ON public.trip_returns;
CREATE POLICY "allow_all_trip_returns" ON public.trip_returns FOR ALL USING (true) WITH CHECK (true);