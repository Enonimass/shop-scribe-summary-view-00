-- Drop existing foreign key constraint and recreate table structure
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Create new profiles table without foreign key to auth.users
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  display_name TEXT NOT NULL,
  shop_id TEXT,
  shop_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Simple RLS policy - allow all operations for now since we'll handle auth in the app
CREATE POLICY "Allow all access to profiles" 
ON public.profiles 
FOR ALL 
USING (true);

-- Insert pre-configured accounts
INSERT INTO public.profiles (username, password, role, display_name, shop_id, shop_name) 
VALUES 
('admin', 'admin123', 'admin', 'Administrator', NULL, NULL),
('shop1', 'shop123', 'seller', 'Downtown Store', 'shop1', 'Downtown Store'),
('shop2', 'shop456', 'seller', 'Mall Outlet', 'shop2', 'Mall Outlet'),
('shop3', 'shop789', 'seller', 'West Side Branch', 'shop3', 'West Side Branch');

-- Update inventory and sales policies to work with our new system
DROP POLICY IF EXISTS "Shop users can manage their inventory" ON public.inventory;
DROP POLICY IF EXISTS "Shop users can manage their sales" ON public.sales;

CREATE POLICY "Allow all inventory access" 
ON public.inventory 
FOR ALL 
USING (true);

CREATE POLICY "Allow all sales access" 
ON public.sales 
FOR ALL 
USING (true);