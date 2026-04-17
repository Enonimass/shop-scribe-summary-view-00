import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ExportButtons from '@/components/ExportButtons';

interface Shop { shop_id: string; shop_name: string }
interface Props { shops: Shop[] }

interface Row {
  product: string;
  unit: string;
  opening: number;
  delivered: number;
  sold: number;
  closing: number;
}

const MovementReport: React.FC<Props> = ({ shops }) => {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [shopId, setShopId] = useState<string>(shops[0]?.shop_id || 'all');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, [shopId, date, fromDate, toDate, mode]);

  const fetchAll = async () => {
    setLoading(true);
    const [dn, st, inv] = await Promise.all([
      (async () => {
        let q = supabase.from('delivery_notes').select('*, delivery_note_items(*)').eq('status', 'added_to_inventory');
        if (shopId !== 'all') q = q.eq('shop_id', shopId);
        const { data } = await q;
        return data || [];
      })(),
      (async () => {
        // Fetch all sales then chunk-fetch items
        let q = supabase.from('sales_transactions').select('*');
        if (shopId !== 'all') q = q.eq('shop_id', shopId);
        const { data: tx } = await q;
        const ids = (tx || []).map((t: any) => t.id);
        const items: any[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data } = await supabase.from('sales_items').select('*').in('transaction_id', chunk);
          items.push(...(data || []));
        }
        return (tx || []).map((t: any) => ({ ...t, items: items.filter(it => it.transaction_id === t.id) }));
      })(),
      (async () => {
        let q = supabase.from('inventory').select('*');
        if (shopId !== 'all') q = q.eq('shop_id', shopId);
        const { data } = await q;
        return data || [];
      })(),
    ]);
    setDeliveries(dn);
    setSales(st);
    setInventory(inv);
    setLoading(false);
  };

  const rows = useMemo<Row[]>(() => {
    // Build map per product+unit
    const periodStart = mode === 'single' ? date : fromDate;
    const periodEnd = mode === 'single' ? date : toDate;
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    endDate.setHours(23, 59, 59);

    // products+units universe from inventory + deliveries + sales
    const keys = new Set<string>();
    inventory.forEach(i => keys.add(`${i.product}|${i.unit}`));
    deliveries.forEach(d => (d.delivery_note_items || []).forEach((it: any) => keys.add(`${it.product}|${it.unit}`)));
    sales.forEach(s => (s.items || []).forEach((it: any) => keys.add(`${it.product}|${it.unit}`)));

    const result: Row[] = [];
    keys.forEach(k => {
      const [product, unit] = k.split('|');

      // current closing stock from inventory (as of "now")
      const currentStock = inventory
        .filter(i => i.product === product && i.unit === unit)
        .reduce((s, i) => s + Number(i.quantity), 0);

      // Deliveries in period
      let delivered = 0;
      // Deliveries after period (to subtract from current to roll back)
      let deliveredAfter = 0;
      // Deliveries before period start (to find opening)
      deliveries.forEach(d => {
        const dDate = new Date(d.delivery_date);
        (d.delivery_note_items || []).forEach((it: any) => {
          if (it.product !== product || it.unit !== unit) return;
          const qty = Number(it.quantity);
          if (dDate >= startDate && dDate <= endDate) delivered += qty;
          else if (dDate > endDate) deliveredAfter += qty;
        });
      });

      // Sales in period & after
      let sold = 0;
      let soldAfter = 0;
      sales.forEach(s => {
        const sDate = new Date(s.sale_date);
        (s.items || []).forEach((it: any) => {
          if (it.product !== product || it.unit !== unit) return;
          const qty = Number(it.quantity);
          if (sDate >= startDate && sDate <= endDate) sold += qty;
          else if (sDate > endDate) soldAfter += qty;
        });
      });

      // closing for end of period = currentStock - deliveredAfter + soldAfter
      const closing = currentStock - deliveredAfter + soldAfter;
      // opening = closing - delivered + sold
      const opening = closing - delivered + sold;

      if (opening === 0 && delivered === 0 && sold === 0 && closing === 0) return;
      result.push({
        product,
        unit,
        opening: Math.round(opening * 100) / 100,
        delivered: Math.round(delivered * 100) / 100,
        sold: Math.round(sold * 100) / 100,
        closing: Math.round(closing * 100) / 100,
      });
    });

    return result.sort((a, b) => a.product.localeCompare(b.product) || a.unit.localeCompare(b.unit));
  }, [inventory, deliveries, sales, date, fromDate, toDate, mode]);

  const totals = useMemo(() => ({
    opening: rows.reduce((s, r) => s + r.opening, 0),
    delivered: rows.reduce((s, r) => s + r.delivered, 0),
    sold: rows.reduce((s, r) => s + r.sold, 0),
    closing: rows.reduce((s, r) => s + r.closing, 0),
  }), [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Stock Movement Report</CardTitle>
            <ExportButtons
              filename={`movement-${shopId}-${mode === 'single' ? date : `${fromDate}_${toDate}`}`}
              getData={() => ({
                title: `Stock Movement (${mode === 'single' ? date : `${fromDate} → ${toDate}`})`,
                headers: ['Product', 'Unit', 'Opening', 'Delivered', 'Sold', 'Closing'],
                rows: rows.map(r => [r.product, r.unit, r.opening, r.delivered, r.sold, r.closing]),
                summary: {
                  Shop: shopId,
                  'Total Opening': totals.opening,
                  'Total Delivered': totals.delivered,
                  'Total Sold': totals.sold,
                  'Total Closing': totals.closing,
                },
              })}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Day</SelectItem>
                  <SelectItem value="range">Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Shop</Label>
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {mode === 'single' ? (
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Opening</p><p className="text-2xl font-bold">{totals.opening.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Delivered</p><p className="text-2xl font-bold text-green-600">+{totals.delivered.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Sold</p><p className="text-2xl font-bold text-orange-600">-{totals.sold.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Closing</p><p className="text-2xl font-bold">{totals.closing.toFixed(2)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Per-Product Movement</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No movement in this period</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.product}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right">{r.opening.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-green-600">+{r.delivered.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-orange-600">-{r.sold.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">{r.closing.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MovementReport;
