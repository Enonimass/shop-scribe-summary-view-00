ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS sale_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS allocated_amount numeric;

CREATE INDEX IF NOT EXISTS idx_debt_payments_sale_transaction_id
  ON public.debt_payments(sale_transaction_id);