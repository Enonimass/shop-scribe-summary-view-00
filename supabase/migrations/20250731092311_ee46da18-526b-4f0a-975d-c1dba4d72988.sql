-- Add customer_name column to sales table if it doesn't exist
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS customer_name TEXT;