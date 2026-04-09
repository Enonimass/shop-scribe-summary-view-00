ALTER TABLE public.customers ADD COLUMN status text DEFAULT 'active';
COMMENT ON COLUMN public.customers.status IS 'Customer status: active, inactive, dead';