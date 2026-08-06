import { supabase } from '@/integrations/supabase/client';

export interface PrepaymentRow {
  id: string;
  shop_id: string;
  customer_name: string;
  amount: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_date: string;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  prepayment_id: string;
  transaction_id: string | null;
  amount: number;
  created_at: string;
}

/** Sum of prepayments received minus amounts already applied, for one customer. */
export async function getPrepaidBalance(shopId: string, customerName: string): Promise<{ balance: number; rows: (PrepaymentRow & { used: number; available: number })[] }> {
  if (!shopId || !customerName) return { balance: 0, rows: [] };
  const { data: pre } = await supabase
    .from('customer_prepayments')
    .select('*')
    .eq('shop_id', shopId)
    .ilike('customer_name', customerName)
    .order('payment_date', { ascending: true });
  const ids = (pre || []).map((p: any) => p.id);
  let apps: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('prepayment_applications')
      .select('prepayment_id, amount')
      .in('prepayment_id', ids.slice(i, i + 200));
    apps = apps.concat(data || []);
  }
  const usedBy = new Map<string, number>();
  apps.forEach(a => usedBy.set(a.prepayment_id, (usedBy.get(a.prepayment_id) || 0) + Number(a.amount || 0)));
  const rows = (pre || []).map((p: any) => {
    const used = usedBy.get(p.id) || 0;
    return { ...p, used, available: Math.max(0, Number(p.amount || 0) - used) };
  });
  const balance = rows.reduce((s, r) => s + r.available, 0);
  return { balance: Math.round(balance * 100) / 100, rows };
}

/**
 * Consume a customer's prepaid balance against a sale (oldest prepayment first).
 * Returns the total amount actually applied.
 */
export async function applyPrepaidToSale(
  shopId: string,
  customerName: string,
  transactionId: string,
  amountNeeded: number,
): Promise<number> {
  if (!(amountNeeded > 0)) return 0;
  const { rows } = await getPrepaidBalance(shopId, customerName);
  let remaining = amountNeeded;
  let applied = 0;
  for (const r of rows) {
    if (remaining <= 0.01) break;
    const take = Math.min(r.available, remaining);
    if (take <= 0) continue;
    const { error } = await supabase.from('prepayment_applications').insert({
      prepayment_id: r.id,
      transaction_id: transactionId,
      amount: Math.round(take * 100) / 100,
    });
    if (error) { console.error('prepayment apply failed', error); break; }
    remaining -= take;
    applied += take;
  }
  return Math.round(applied * 100) / 100;
}

/**
 * Money movements for a period: prepayments received (income on receipt date)
 * and prepayments applied to sales (already counted, must be netted out of the
 * sale-date money-in so nothing is double counted).
 */
export async function getPrepaymentFlows(
  shopId: string | null,
  startDate: string,
  endDate: string,
): Promise<{ received: number; applied: number; receivedRows: PrepaymentRow[] }> {
  let q = supabase.from('customer_prepayments').select('*').gte('payment_date', startDate).lte('payment_date', endDate);
  if (shopId && shopId !== 'all') q = q.eq('shop_id', shopId);
  const { data: received } = await q;

  const { data: apps } = await supabase
    .from('prepayment_applications')
    .select('amount, transaction_id, sales_transactions(sale_date, shop_id)');
  const applied = (apps || []).reduce((s: number, a: any) => {
    const tx = a.sales_transactions;
    if (!tx?.sale_date) return s;
    if (tx.sale_date < startDate || tx.sale_date > endDate) return s;
    if (shopId && shopId !== 'all' && tx.shop_id !== shopId) return s;
    return s + Number(a.amount || 0);
  }, 0);

  return {
    received: (received || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
    applied,
    receivedRows: (received || []) as PrepaymentRow[],
  };
}
