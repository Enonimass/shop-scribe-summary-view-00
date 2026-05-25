ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS trip_id uuid;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS trip_stop_id uuid;
CREATE INDEX IF NOT EXISTS idx_delivery_notes_trip_id ON public.delivery_notes(trip_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_trip_stop_id ON public.delivery_notes(trip_stop_id);