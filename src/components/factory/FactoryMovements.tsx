import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownCircle, ArrowUpCircle, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatBags } from '@/lib/units';
import { HQ_SHOP_ID } from '@/lib/hq';

type Source = 'production' | 'return' | 'sale' | 'delivery';

interface Movement {
  id: string;
  date: string;
  product: string;
  unit: string;
  qty: number;
  direction: 'in' | 'out';
  source: Source;
  detail: string;
}

const SOURCE_LABEL: Record<Source, string> = {
  production: 'Production intake',
  return: 'Return from shop',
  sale: 'Sale — HQ shop',
  delivery: 'Delivery out',
};

const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const FactoryMovements: React.FC<{
  categories: { id: string; name: string }[];
  productToCategory: Record<string, string>;
}> = ({ categories, productToCategory }) => {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const out: Movement[] = [];

    // 1. Production intake (in)
    const { data: intake } = await supabase
      .from('factory_intake_log')
      .select('*')
      .gte('intake_date', from)
      .lte('intake_date', to);
    (intake || []).forEach((r: any) => out.push({
      id: `i-${r.id}`, date: r.intake_date, product: r.product, unit: r.unit,
      qty: Number(r.quantity || 0), direction: 'in', source: 'production',
      detail: r.note || r.recorded_by || '—',
    }));

    // 2. Returns from shops (in)
    const { data: returns } = await supabase
      .from('shop_returns')
      .select('*')
      .gte('return_date', from)
      .lte('return_date', to);
    (returns || []).forEach((r: any) => out.push({
      id: `r-${r.id}`, date: r.return_date, product: r.product, unit: r.unit,
      qty: Number(r.quantity || 0), direction: 'in', source: 'return',
      detail: `${r.shop_id} — ${r.reason || ''}`.trim(),
    }));

    // 3. Sales on the HQ shop account (out)
    const { data: txs } = await supabase
      .from('sales_transactions')
      .select('id, customer_name, sale_date')
      .eq('shop_id', HQ_SHOP_ID)
      .gte('sale_date', from)
      .lte('sale_date', to);
    const txIds = (txs || []).map((t: any) => t.id);
    const txMap = new Map<string, any>((txs || []).map((t: any) => [t.id, t]));
    for (let i = 0; i < txIds.length; i += 200) {
      const chunk = txIds.slice(i, i + 200);
      if (!chunk.length) break;
      const { data: items } = await supabase
        .from('sales_items')
        .select('id, transaction_id, product, unit, quantity')
        .in('transaction_id', chunk);
      (items || []).forEach((it: any) => {
        const tx = txMap.get(it.transaction_id);
        out.push({
          id: `s-${it.id}`, date: tx?.sale_date || from, product: it.product, unit: it.unit,
          qty: Number(it.quantity || 0), direction: 'out', source: 'sale',
          detail: tx?.customer_name || '—',
        });
      });
    }

    // 4. Deliveries dispatched out of the factory (out)
    const { data: notes } = await supabase
      .from('delivery_notes')
      .select('id, delivery_note_no, shop_id, delivery_date, status')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .in('status', ['dispatched', 'approved', 'rejected', 'confirmed', 'added_to_inventory']);
    const noteIds = (notes || []).map((n: any) => n.id);
    const noteMap = new Map<string, any>((notes || []).map((n: any) => [n.id, n]));
    for (let i = 0; i < noteIds.length; i += 200) {
      const chunk = noteIds.slice(i, i + 200);
      if (!chunk.length) break;
      const { data: items } = await supabase
        .from('delivery_note_items')
        .select('id, delivery_note_id, product, unit, quantity')
        .in('delivery_note_id', chunk);
      (items || []).forEach((it: any) => {
        const n = noteMap.get(it.delivery_note_id);
        out.push({
          id: `d-${it.id}`, date: n?.delivery_date || from, product: it.product, unit: it.unit,
          qty: Number(it.quantity || 0), direction: 'out', source: 'delivery',
          detail: `${n?.shop_id || ''} (${n?.delivery_note_no || ''})`,
        });
      });
    }

    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    setRows(out);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [from, to]);

  const filtered = useMemo(() => rows.filter(r => {
    if (category !== 'all' && productToCategory[r.product] !== category) return false;
    if (search && !r.product.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, category, search, productToCategory]);

  const totals = useMemo(() => {
    let tin = 0, tout = 0;
    filtered.forEach(r => { if (r.direction === 'in') tin += r.qty; else tout += r.qty; });
    return { tin, tout };
  }, [filtered]);

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Factory stock movements</CardTitle>
        <p className="text-sm text-muted-foreground">Every increase and decrease in the shared factory/HQ pool, and what caused it.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Product</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="px-2 py-1 rounded-md bg-muted/60">
            <span className="font-semibold">In:</span> {formatBags(totals.tin)}
          </span>
          <span className="px-2 py-1 rounded-md bg-muted/60">
            <span className="font-semibold">Out:</span> {formatBags(totals.tout)}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No movements for this selection.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{r.product}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">
                      {r.direction === 'in' ? formatBags(r.qty) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {r.direction === 'out' ? formatBags(r.qty) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.direction === 'in' ? 'secondary' : 'outline'} className="flex w-fit items-center gap-1">
                        {r.direction === 'in' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                        {SOURCE_LABEL[r.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.detail}>{r.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FactoryMovements;