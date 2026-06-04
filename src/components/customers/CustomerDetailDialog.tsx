import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Phone, MapPin, Mail, Calendar, Wallet, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent, formatBags } from '@/lib/units';
import PeriodPicker, { buildPreset, type Period } from '@/components/PeriodPicker';

interface Customer {
  id: string; name: string; phone: string | null; place: string | null;
  email?: string | null; shop_id: string;
  first_purchase_date: string | null; last_purchase_date: string | null;
  status?: string | null;
}

const fmtKes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;

const CustomerDetailDialog: React.FC<{ customer: Customer | null; onClose: () => void; shopName?: string }> = ({ customer, onClose, shopName }) => {
  const [period, setPeriod] = useState<Period>(() => buildPreset('year'));
  const [tx, setTx] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      setLoading(true);
      // Pull ALL tx for credit/lifetime stats, then filter by period for product breakdown
      const { data: allTx } = await supabase
        .from('sales_transactions').select('*')
        .eq('shop_id', customer.shop_id)
        .ilike('customer_name', customer.name);
      const ids = (allTx || []).map((t: any) => t.id);
      let its: any[] = []; let pays: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const [{ data: it }, { data: p }] = await Promise.all([
          supabase.from('sales_items').select('*').in('transaction_id', slice),
          supabase.from('debt_payments').select('*').in('sale_transaction_id', slice),
        ]);
        its = its.concat(it || []); pays = pays.concat(p || []);
      }
      setTx(allTx || []); setItems(its); setPayments(pays); setLoading(false);
    })();
  }, [customer?.id]);

  const startStr = period.start.toISOString().split('T')[0];
  const endStr = period.end.toISOString().split('T')[0];

  const periodTx = useMemo(() => tx.filter(t => t.sale_date >= startStr && t.sale_date <= endStr), [tx, startStr, endStr]);
  const periodIds = useMemo(() => new Set(periodTx.map(t => t.id)), [periodTx]);
  const periodItems = useMemo(() => items.filter(i => periodIds.has(i.transaction_id)), [items, periodIds]);

  // product/unit pivot for the period
  const pivot = useMemo(() => {
    const products = new Map<string, Map<string, number>>();
    const unitSet = new Set<string>();
    periodItems.forEach(it => {
      unitSet.add(it.unit);
      if (!products.has(it.product)) products.set(it.product, new Map());
      const m = products.get(it.product)!;
      m.set(it.unit, (m.get(it.unit) || 0) + Number(it.quantity || 0));
    });
    const units = Array.from(unitSet).sort();
    const rows = Array.from(products.entries()).map(([product, m]) => {
      const byUnit: Record<string, number> = {};
      let bagEq = 0;
      units.forEach(u => { byUnit[u] = m.get(u) || 0; bagEq += toBagEquivalent(byUnit[u], u); });
      return { product, byUnit, bagEq };
    }).sort((a, b) => b.bagEq - a.bagEq);
    return { units, rows };
  }, [periodItems]);

  const lifetime = useMemo(() => {
    const totalSpend = tx.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const totalBags = items.reduce((s, it) => s + toBagEquivalent(Number(it.quantity), it.unit), 0);
    return { totalSpend, totalBags, txCount: tx.length };
  }, [tx, items]);

  const credit = useMemo(() => {
    const creditTx = tx.filter(t => t.is_credit);
    let billed = 0, paid = 0, openCount = 0, oldestDays = 0;
    const open: any[] = [];
    creditTx.forEach(t => {
      const extra = payments.filter(p => p.sale_transaction_id === t.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      const p = Number(t.amount_paid || 0) + extra;
      const b = Number(t.total_amount || 0) - p;
      billed += Number(t.total_amount || 0);
      paid += p;
      if (b > 0.01) {
        openCount++;
        open.push({ ...t, _paid: p, _balance: b });
        const age = Math.floor((Date.now() - new Date(t.sale_date).getTime()) / 86400000);
        if (age > oldestDays) oldestDays = age;
      }
    });
    return { hasCredit: creditTx.length > 0, billed, paid, balance: billed - paid, openCount, oldestDays, open };
  }, [tx, payments]);

  if (!customer) return null;

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{customer.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone || <span className="text-muted-foreground italic">no phone</span>}</div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {customer.email || <span className="text-muted-foreground italic">no email</span>}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {customer.place || <span className="text-muted-foreground italic">no area</span>}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><span>Shop: {shopName || customer.shop_id}</span></div>
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> First: {customer.first_purchase_date || '—'}</div>
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> Last: {customer.last_purchase_date || '—'}</div>
          </CardContent></Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Lifetime transactions</div><div className="text-xl font-bold">{lifetime.txCount}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Lifetime bags (70kg eq)</div><div className="text-xl font-bold">{formatBags(lifetime.totalBags)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Lifetime spend</div><div className="text-xl font-bold">{fmtKes(lifetime.totalSpend)}</div></CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Payment style</div>
              {credit.hasCredit
                ? <Badge variant="destructive" className="mt-1"><CreditCard className="h-3 w-3 mr-1" /> Credit customer</Badge>
                : <Badge className="bg-green-600 text-white mt-1"><Wallet className="h-3 w-3 mr-1" /> Cash only</Badge>}
            </CardContent></Card>
          </div>

          {credit.hasCredit && (
            <Card><CardContent className="p-4 space-y-3">
              <div className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Credit analysis</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Ever billed on credit</div><div className="font-semibold">{fmtKes(credit.billed)}</div></div>
                <div><div className="text-xs text-muted-foreground">Paid towards credit</div><div className="font-semibold">{fmtKes(credit.paid)}</div></div>
                <div><div className="text-xs text-muted-foreground">Outstanding now</div><div className={`font-semibold ${credit.balance > 0 ? 'text-destructive' : ''}`}>{fmtKes(credit.balance)}</div></div>
                <div><div className="text-xs text-muted-foreground">Open sales / oldest</div><div className="font-semibold">{credit.openCount} · {credit.oldestDays}d</div></div>
              </div>
              {credit.open.length > 0 && (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {credit.open.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.sale_date}</TableCell>
                        <TableCell>{s.due_date || '—'}</TableCell>
                        <TableCell className="text-right">{fmtKes(s.total_amount)}</TableCell>
                        <TableCell className="text-right">{fmtKes(s._paid)}</TableCell>
                        <TableCell className="text-right text-destructive font-semibold">{fmtKes(s._balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          )}

          <Card><CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">Products bought — {period.label}</div>
              <PeriodPicker value={period} onChange={setPeriod} />
            </div>
            {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : pivot.rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No purchases in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead>
                    {pivot.units.map(u => <TableHead key={u} className="text-right">{u}</TableHead>)}
                    <TableHead className="text-right">Total (bags eq)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {pivot.rows.map(r => (
                      <TableRow key={r.product}>
                        <TableCell className="font-medium">{r.product}</TableCell>
                        {pivot.units.map(u => <TableCell key={u} className="text-right">{r.byUnit[u] || ''}</TableCell>)}
                        <TableCell className="text-right font-semibold">{formatBags(r.bagEq)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>Total</TableCell>
                      {pivot.units.map(u => <TableCell key={u} className="text-right">{pivot.rows.reduce((s, r) => s + (r.byUnit[u] || 0), 0)}</TableCell>)}
                      <TableCell className="text-right">{formatBags(pivot.rows.reduce((s, r) => s + r.bagEq, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent></Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDetailDialog;