import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Shop { shop_id: string; shop_name: string; }

const toBagEq = (q: number, unit: string) => (unit === '50kg' || unit === '50kg Bags') ? q * (5/7) : q;

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

  // Bags sold per product (in bag equivalents)
  const bagsByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(it => {
      const eq = toBagEq(Number(it.quantity), it.unit);
      map[it.product] = (map[it.product] || 0) + eq;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const totalBags = bagsByProduct.reduce((s, [, v]) => s + v, 0);

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
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Bags Sold</p><p className="text-2xl font-bold">{totalBags.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Sales Value</p><p className="text-2xl font-bold">{totalSalesValue.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Money Collected</p><p className="text-2xl font-bold">{totalCash.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Credit Issued</p><p className="text-2xl font-bold text-orange-600">{creditIssued.toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Bags Sold by Product</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Bag Equivalents</TableHead></TableRow></TableHeader>
              <TableBody>
                {bagsByProduct.map(([p, v]) => (
                  <TableRow key={p}><TableCell>{p}</TableCell><TableCell className="text-right">{v.toFixed(2)}</TableCell></TableRow>
                ))}
                {bagsByProduct.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No sales for this day.</TableCell></TableRow>}
                {bagsByProduct.length > 0 && <TableRow className="font-semibold"><TableCell>Total</TableCell><TableCell className="text-right">{totalBags.toFixed(2)}</TableCell></TableRow>}
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