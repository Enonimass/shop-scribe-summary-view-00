
-- Customers table for storing customer details
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  place text,
  shop_id text NOT NULL,
  first_purchase_date date,
  last_purchase_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint on name + shop_id to avoid duplicates per shop
CREATE UNIQUE INDEX customers_name_shop_idx ON public.customers (LOWER(name), shop_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to customers" ON public.customers
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Product categories table (admin-managed)
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to product_categories" ON public.product_categories
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Product-to-category mapping
CREATE TABLE public.product_category_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (category_id, product_name)
);

ALTER TABLE public.product_category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to product_category_items" ON public.product_category_items
  FOR ALL TO public USING (true) WITH CHECK (true);
