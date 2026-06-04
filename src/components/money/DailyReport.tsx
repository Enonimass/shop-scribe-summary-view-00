import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Shop { shop_id: string; shop_name: string; }

import { toBagEquivalent, formatBags } from '@/lib/units';

const DailyReport = ({ shops, defaultShop, allowAll = false }: { shops: Shop[]; defaultShop?: string; allowAll?: boolean }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shopId, setShopId] = useState<string>(defaultShop || (allowAll ? 'all' : (shops[0]?.shop_id || '')));
  const [tx, setTx] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);

  useEffect(() => {
    if (!shopId) return;
    const load = async () => {
      let txQ = supabase.from('sales_transactions').select('*').eq('sale_date', date);
      let dbQ = supabase.from('debt_payments').select('*').eq('payment_date', date);
      if (shopId !== 'all') { txQ = txQ.eq('shop_id', shopId); dbQ = dbQ.eq('shop_id', shopId); }
      const [{ data: t }, { data: d }] = await Promise.all([txQ, dbQ]);
      setTx(t || []); setDebts(d || []);
      const ids = (t || []).map(x => x.id);
      let allItems: any[] = [];
      const chunk = 200;
      for (let i = 0; i < ids.length; i += chunk) {
        const { data: it } = await supabase.from('sales_items').select('*').in('transaction_id', ids.slice(i, i + chunk));
        allItems = allItems.concat(it || []);
      }
      setItems(allItems);
    };
    load();
  }, [shopId, date]);

  // Per-product per-unit pivot, with bag-equivalent total
  const pivot = useMemo(() => {
    const products = new Map<string, Map<string, number>>();
    const unitSet = new Set<string>();
    items.forEach(it => {
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
    const totals: Record<string, number> = {};
    units.forEach(u => { totals[u] = rows.reduce((s, r) => s + (r.byUnit[u] || 0), 0); });
    const grandBags = rows.reduce((s, r) => s + r.bagEq, 0);
    return { units, rows, totals, grandBags };
  }, [items]);

  const totalBags = pivot.grandBags;

  // Money by payment method
  const moneyByMethod = useMemo(() => {
    const map: Record<string, { sales: number; debts: number }> = {};
    tx.forEach(t => {
      const name = t.payment_method_name || (t.is_credit ? 'Credit' : 'Unspecified');
      if (!map[name]) map[name] = { sales: 0, debts: 0 };
      // For credit, amount_paid may be 0; record as credit issued separately
      map[name].sales += Number(t.amount_paid || 0);
    });
    debts.forEach(d => {
      const name = d.payment_method_name || 'Unspecified';
      if (!map[name]) map[name] = { sales: 0, debts: 0 };
      map[name].debts += Number(d.amount || 0);
    });
    return Object.entries(map).sort();
  }, [tx, debts]);

  const creditIssued = tx.filter(t => t.is_credit).reduce((s, t) => s + (Number(t.total_amount || 0) - Number(t.amount_paid || 0)), 0);
  const totalDebtPayments = debts.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalCash = tx.reduce((s, t) => s + Number(t.amount_paid || 0), 0) + totalDebtPayments;
  const totalSalesValue = tx.reduce((s, t) => s + Number(t.total_amount || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Daily Report</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Shop</Label>
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowAll && <SelectItem value="all">All Shops</SelectItem>}
                  {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Bags Sold (70kg eq)</p><p className="text-2xl font-bold">{formatBags(totalBags)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Sales Value</p><p className="text-2xl font-bold">{totalSalesValue.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Money Collected</p><p className="text-2xl font-bold">{totalCash.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Credit Issued</p><p className="text-2xl font-bold text-orange-600">{creditIssued.toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Products sold — per unit + bag equivalents</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
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
                {pivot.rows.length === 0 && <TableRow><TableCell colSpan={pivot.units.length + 2} className="text-center text-muted-foreground">No sales for this day.</TableCell></TableRow>}
                {pivot.rows.length > 0 && (
                  <TableRow className="font-semibold bg-muted/40">
                    <TableCell>Total</TableCell>
                    {pivot.units.map(u => <TableCell key={u} className="text-right">{pivot.totals[u]}</TableCell>)}
                    <TableCell className="text-right">{formatBags(totalBags)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Money by Payment Method</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Debt Paid</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {moneyByMethod.map(([name, v]) => (
                  <TableRow key={name}>
                    <TableCell>{name}</TableCell>
                    <TableCell className="text-right">{v.sales.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{v.debts.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">{(v.sales + v.debts).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {moneyByMethod.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No money activity.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DailyReport;