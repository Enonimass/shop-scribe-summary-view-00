import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { printCreditInvoice } from '@/lib/receipts';

export const GOOD_DAYS = 30;
export const LONG_DAYS = 90;

const fmtKes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;

interface Props { shopId?: string; shops?: { shop_id: string; shop_name: string }[]; }

type Bucket = 'good' | 'long' | 'bad';

const bucketOf = (sale: any): Bucket => {
  const ref = sale.due_date ? new Date(sale.due_date) : new Date(sale.sale_date);
  const days = Math.floor((Date.now() - ref.getTime()) / 86400000);
  if (sale.due_date) {
    if (days <= GOOD_DAYS) return 'good';
    if (days <= LONG_DAYS) return 'long';
    return 'bad';
  }
  if (days <= GOOD_DAYS) return 'good';
  if (days <= LONG_DAYS) return 'long';
  return 'bad';
};

const bucketLabel: Record<Bucket, string> = { good: 'Good', long: 'Long', bad: 'Bad' };
const bucketVariant: Record<Bucket, 'outline' | 'secondary' | 'destructive'> = { good: 'outline', long: 'secondary', bad: 'destructive' };

const DebtorsList: React.FC<Props> = ({ shopId, shops = [] }) => {
  const [credits, setCredits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [bucket, setBucket] = useState<'all' | Bucket>('all');
  const [sortBy, setSortBy] = useState<'balance' | 'age' | 'due'>('age');

  const load = async () => {
    setLoading(true);
    let q = supabase.from('sales_transactions').select('*').eq('is_credit', true);
    if (shopId) q = q.eq('shop_id', shopId);
    const { data: cr } = await q;
    const ids = (cr || []).map(c => c.id);
    let pays: any[] = []; let its: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const [{ data: p }, { data: it }] = await Promise.all([
        supabase.from('debt_payments').select('*').in('sale_transaction_id', slice),
        supabase.from('sales_items').select('*').in('transaction_id', slice),
      ]);
      pays = pays.concat(p || []);
      its = its.concat(it || []);
    }
    setCredits(cr || []); setPayments(pays); setItems(its);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [shopId]);

  const enriched = useMemo(() => {
    return (credits || []).map(c => {
      const linkedPays = payments.filter(p => p.sale_transaction_id === c.id);
      const extra = linkedPays.reduce((s, p) => s + Number(p.amount || 0), 0);
      const paid = Number(c.amount_paid || 0) + extra;
      const balance = Number(c.total_amount || 0) - paid;
      const ageDays = Math.floor((Date.now() - new Date(c.sale_date).getTime()) / 86400000);
      const dueIn = c.due_date ? Math.floor((new Date(c.due_date).getTime() - Date.now()) / 86400000) : null;
      const b = bucketOf(c);
      return { ...c, _paid: paid, _balance: balance, _age: ageDays, _dueIn: dueIn, _bucket: b, _items: items.filter(i => i.transaction_id === c.id) };
    }).filter(c => c._balance > 0.01);
  }, [credits, payments, items]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r => (r.customer_name || '').toLowerCase().includes(s));
    }
    if (minAmt) rows = rows.filter(r => r._balance >= Number(minAmt));
    if (maxAmt) rows = rows.filter(r => r._balance <= Number(maxAmt));
    if (minAge) rows = rows.filter(r => r._age >= Number(minAge));
    if (maxAge) rows = rows.filter(r => r._age <= Number(maxAge));
    if (bucket !== 'all') rows = rows.filter(r => r._bucket === bucket);
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'balance') return b._balance - a._balance;
      if (sortBy === 'due') {
        const av = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bv = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return av - bv;
      }
      return b._age - a._age;
    });
    return rows;
  }, [enriched, search, minAmt, maxAmt, minAge, maxAge, bucket, sortBy]);

  const totals = useMemo(() => {
    const acc = { good: { c: 0, t: 0 }, long: { c: 0, t: 0 }, bad: { c: 0, t: 0 } } as Record<Bucket, { c: number; t: number }>;
    enriched.forEach(r => { acc[r._bucket as Bucket].c++; acc[r._bucket as Bucket].t += r._balance; });
    return acc;
  }, [enriched]);

  const shopName = (id: string) => shops.find(s => s.shop_id === id)?.shop_name || id;

  const reprint = (sale: any) => {
    printCreditInvoice({
      shopName: shopName(sale.shop_id),
      invoiceNo: sale.id,
      date: sale.sale_date,
      dueDate: sale.due_date,
      customerName: sale.customer_name,
      items: (sale._items || []).map((i: any) => ({
        product: i.product, quantity: Number(i.quantity), unit: i.unit,
        unit_price: Number(i.unit_price || 0), line_total: Number(i.line_total || 0),
      })),
      total: Number(sale.total_amount || 0),
      paid: sale._paid,
      balance: sale._balance,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(['good','long','bad'] as Bucket[]).map(b => (
          <Card key={b}><CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{bucketLabel[b]} debts</div>
                <div className="text-xl font-bold">{totals[b].c}</div>
                <div className="text-xs">{fmtKes(totals[b].t)}</div>
              </div>
              <Badge variant={bucketVariant[b]}>{b === 'good' ? `≤${GOOD_DAYS}d` : b === 'long' ? `≤${LONG_DAYS}d` : `>${LONG_DAYS}d`}</Badge>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
          <div><Label className="text-xs">Customer</Label><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" /></div>
          <div><Label className="text-xs">Min balance</Label><Input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} /></div>
          <div><Label className="text-xs">Max balance</Label><Input type="number" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} /></div>
          <div><Label className="text-xs">Min age (days)</Label><Input type="number" value={minAge} onChange={e => setMinAge(e.target.value)} /></div>
          <div><Label className="text-xs">Max age (days)</Label><Input type="number" value={maxAge} onChange={e => setMaxAge(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Bucket</Label>
            <Select value={bucket} onValueChange={(v: any) => setBucket(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="bad">Bad</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sort by</Label>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="age">Age</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Debtors ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Customer</TableHead><TableHead>Sale date</TableHead><TableHead>Due</TableHead>
                  <TableHead>Age</TableHead><TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.customer_name}</TableCell>
                      <TableCell>{new Date(r.sale_date).toLocaleDateString()}</TableCell>
                      <TableCell>{r.due_date ? new Date(r.due_date).toLocaleDateString() : <span className="text-xs italic text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{r._age}d</TableCell>
                      <TableCell><Badge variant={bucketVariant[r._bucket as Bucket]}>{bucketLabel[r._bucket as Bucket]}</Badge></TableCell>
                      <TableCell className="text-right">{fmtKes(r.total_amount)}</TableCell>
                      <TableCell className="text-right">{fmtKes(r._paid)}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{fmtKes(r._balance)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => reprint(r)} title="Reprint invoice">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matching debtors.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DebtorsList;