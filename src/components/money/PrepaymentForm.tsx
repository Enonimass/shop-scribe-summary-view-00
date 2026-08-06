import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '../AuthProvider';
import { printPaymentReceipt, getPreferredFormat, setPreferredFormat, type ReceiptFormat } from '@/lib/receipts';
import { FileText, Wallet } from 'lucide-react';

interface Shop { shop_id: string; shop_name: string }

const fmt = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Prepayment = customer pays now and collects goods later.
 * Money is income on the day it is received; the unused part stays as a
 * prepaid balance the shop still owes in goods, and is auto-applied on the
 * customer's next sale.
 */
const PrepaymentForm: React.FC<{ shopId?: string; shops?: Shop[] }> = ({ shopId, shops = [] }) => {
  const { profile } = useAuth();
  const [activeShop, setActiveShop] = useState<string>(shopId || shops[0]?.shop_id || '');
  const [methods, setMethods] = useState<any[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [shopName, setShopName] = useState('');
  const [receiptFormat, setReceiptFormat] = useState<ReceiptFormat>(getPreferredFormat());

  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [methodId, setMethodId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => { if (shopId) setActiveShop(shopId); }, [shopId]);

  const load = async () => {
    if (!activeShop) return;
    const [{ data: m }, { data: cust }, { data: pre }, { data: sp }] = await Promise.all([
      supabase.from('payment_methods').select('*').eq('is_active', true).neq('kind', 'credit').order('name'),
      supabase.from('customers').select('name').eq('shop_id', activeShop).order('name'),
      supabase.from('customer_prepayments').select('*').eq('shop_id', activeShop).order('payment_date', { ascending: false }),
      supabase.from('profiles').select('shop_name').eq('shop_id', activeShop).limit(1).maybeSingle(),
    ]);
    setMethods(m || []);
    setCustomers([...new Set((cust || []).map((c: any) => c.name))]);
    setRows(pre || []);
    setShopName((sp as any)?.shop_name || activeShop);
    if (m && m.length && !methodId) setMethodId(m[0].id);
    const ids = (pre || []).map((p: any) => p.id);
    let all: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('prepayment_applications').select('*').in('prepayment_id', ids.slice(i, i + 200));
      all = all.concat(data || []);
    }
    setApps(all);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeShop]);

  const enriched = useMemo(() => rows.map(r => {
    const used = apps.filter(a => a.prepayment_id === r.id).reduce((s, a) => s + Number(a.amount || 0), 0);
    return { ...r, used, available: Math.max(0, Number(r.amount || 0) - used) };
  }), [rows, apps]);

  const balancesByCustomer = useMemo(() => {
    const map = new Map<string, { customer: string; available: number; received: number }>();
    enriched.forEach(r => {
      const key = (r.customer_name || '').toLowerCase();
      const cur = map.get(key) || { customer: r.customer_name, available: 0, received: 0 };
      cur.available += r.available; cur.received += Number(r.amount || 0);
      map.set(key, cur);
    });
    return [...map.values()].filter(v => v.available > 0.01).sort((a, b) => b.available - a.available);
  }, [enriched]);

  const totalOutstanding = balancesByCustomer.reduce((s, b) => s + b.available, 0);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!activeShop || !customerName.trim() || !(amt > 0) || !methodId) {
      toast({ title: 'Missing fields', description: 'Shop, customer, amount and payment method are required', variant: 'destructive' });
      return;
    }
    const method = methods.find(m => m.id === methodId);
    const { data: inserted, error } = await supabase.from('customer_prepayments').insert({
      shop_id: activeShop,
      customer_name: customerName.trim(),
      amount: amt,
      payment_method_id: methodId,
      payment_method_name: method?.name,
      payment_date: paymentDate,
      recorded_by: profile?.username,
      notes,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Prepayment recorded', description: `${customerName} prepaid ${amt.toLocaleString()}` });
    try {
      printPaymentReceipt({
        shopName,
        receiptNo: inserted.id,
        date: paymentDate,
        customerName: customerName.trim(),
        saleNo: 'PREPAYMENT (goods to collect)',
        saleTotal: amt,
        amountPaidNow: amt,
        totalPaidToDate: amt,
        outstanding: 0,
        method: method?.name,
        recordedBy: profile?.display_name || profile?.username,
      }, receiptFormat);
    } catch (e) { console.error('Print prepayment receipt failed', e); }
    setAmount(''); setCustomerName(''); setNotes('');
    load();
  };

  const reprint = (p: any) => {
    printPaymentReceipt({
      shopName,
      receiptNo: p.id,
      date: p.payment_date,
      customerName: p.customer_name,
      saleNo: 'PREPAYMENT (goods to collect)',
      saleTotal: Number(p.amount || 0),
      amountPaidNow: Number(p.amount || 0),
      totalPaidToDate: Number(p.amount || 0),
      outstanding: 0,
      method: p.payment_method_name,
      recordedBy: p.recorded_by,
    }, receiptFormat);
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Record Prepayment (pay now, collect later)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {!shopId && shops.length > 0 && (
              <div className="space-y-1">
                <Label>Shop</Label>
                <Select value={activeShop} onValueChange={setActiveShop}>
                  <SelectTrigger><SelectValue placeholder="Shop" /></SelectTrigger>
                  <SelectContent>
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Customer</Label>
              <Input list="prepay-customers" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <datalist id="prepay-customers">{customers.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" inputMode="decimal" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={methodId} onValueChange={setMethodId}>
                <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>{methods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Receipt format</Label>
              <Select value={receiptFormat} onValueChange={(v: ReceiptFormat) => { setReceiptFormat(v); setPreferredFormat(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 PDF</SelectItem>
                  <SelectItem value="thermal">80mm thermal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={submit}>Record Prepayment</Button>
          <p className="text-xs text-muted-foreground mt-2">
            Counted as money in on the date received. The unused part stays as a prepaid balance and is automatically used on the customer's next sale.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prepaid balances — we owe goods worth KES {fmt(totalOutstanding).toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5">
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Prepaid received</TableHead><TableHead className="text-right">Unused balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {balancesByCustomer.map(b => (
                <TableRow key={b.customer}>
                  <TableCell className="font-medium">{b.customer}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(b.received).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">{fmt(b.available).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {balancesByCustomer.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No unused prepaid balances.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent prepayments</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5">
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Used</TableHead><TableHead className="text-right">Left</TableHead>
              <TableHead>Method</TableHead><TableHead>Notes</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {enriched.slice(0, 40).map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.payment_date}</TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.used).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.available > 0.01
                      ? <Badge variant="secondary">{fmt(r.available).toLocaleString()}</Badge>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell>{r.payment_method_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.notes}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => reprint(r)} title="Reprint receipt"><FileText className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {enriched.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No prepayments yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrepaymentForm;
