-- Create a new sales_transactions table for the main transaction
CREATE TABLE public.sales_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales_items table for individual products in a transaction
CREATE TABLE public.sales_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.sales_transactions(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY;

-- Create policies for sales_transactions
CREATE POLICY "Allow all access to sales_transactions" 
ON public.sales_transactions 
FOR ALL 
USING (true);

-- Create policies for sales_items
CREATE POLICY "Allow all access to sales_items" 
ON public.sales_items 
FOR ALL 
USING (true);

-- Create trigger for automatic timestamp updates on sales_transactions
CREATE TRIGGER update_sales_transactions_updated_at
BEFORE UPDATE ON public.sales_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();