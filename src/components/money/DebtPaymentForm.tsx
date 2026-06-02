import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '../AuthProvider';

const DebtPaymentForm = ({ shopId }: { shopId: string }) => {
  const { profile } = useAuth();
  const [methods, setMethods] = useState<any[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [methodId, setMethodId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [openCredits, setOpenCredits] = useState<any[]>([]);
  const [saleTxId, setSaleTxId] = useState<string>('');

  const load = async () => {
    const [{ data: m }, { data: cust }, { data: r }] = await Promise.all([
      supabase.from('payment_methods').select('*').eq('is_active', true).neq('kind', 'credit').order('name'),
      supabase.from('customers').select('name').eq('shop_id', shopId).order('name'),
      supabase.from('debt_payments').select('*').eq('shop_id', shopId).order('payment_date', { ascending: false }).limit(20),
    ]);
    setMethods(m || []);
    setCustomers([...new Set((cust || []).map(c => c.name))]);
    setRecent(r || []);
    if (m && m.length && !methodId) setMethodId(m[0].id);
  };
  useEffect(() => { if (shopId) load(); }, [shopId]);

  // When customer changes, fetch their open credit sales for this shop.
  useEffect(() => {
    (async () => {
      setSaleTxId('');
      setOpenCredits([]);
      if (!shopId || !customerName) return;
      const { data: credits } = await supabase
        .from('sales_transactions')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_credit', true)
        .ilike('customer_name', customerName)
        .order('sale_date', { ascending: false });
      const ids = (credits || []).map(c => c.id);
      let pays: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('debt_payments').select('sale_transaction_id, amount').in('sale_transaction_id', ids.slice(i, i + 200));
        pays = pays.concat(data || []);
      }
      const paidById = new Map<string, number>();
      pays.forEach(p => paidById.set(p.sale_transaction_id, (paidById.get(p.sale_transaction_id) || 0) + Number(p.amount || 0)));
      const open = (credits || [])
        .map(c => {
          const extra = paidById.get(c.id) || 0;
          const paid = Number(c.amount_paid || 0) + extra;
          const balance = Number(c.total_amount || 0) - paid;
          return { ...c, _paid: paid, _balance: balance };
        })
        .filter(c => c._balance > 0.01);
      setOpenCredits(open);
    })();
  }, [shopId, customerName]);

  // Default amount to selected sale's remaining balance.
  useEffect(() => {
    if (!saleTxId) return;
    const s = openCredits.find(c => c.id === saleTxId);
    if (s) setAmount(String(s._balance.toFixed(2)));
  }, [saleTxId]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!customerName || !amt || amt <= 0 || !methodId || !saleTxId) {
      toast({ title: 'Missing fields', description: 'Customer, credit sale, amount and method required', variant: 'destructive' });
      return;
    }
    const sale = openCredits.find(c => c.id === saleTxId);
    if (sale && amt > sale._balance + 0.01) {
      toast({ title: 'Amount exceeds balance', description: `Balance is ${sale._balance.toFixed(2)}`, variant: 'destructive' });
      return;
    }
    const method = methods.find(m => m.id === methodId);
    const { error } = await supabase.from('debt_payments').insert({
      shop_id: shopId, customer_name: customerName, amount: amt,
      payment_method_id: methodId, payment_method_name: method?.name,
      payment_date: paymentDate, recorded_by: profile?.username, notes,
      sale_transaction_id: saleTxId,
      allocated_amount: amt,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Debt payment recorded', description: `${customerName} paid ${amt}` });
    setAmount(''); setCustomerName(''); setNotes(''); setSaleTxId('');
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Record Debt Payment</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <Input list="debt-customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <datalist id="debt-customers">
                {customers.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Credit sale to pay</Label>
              <Select value={saleTxId} onValueChange={setSaleTxId} disabled={!openCredits.length}>
                <SelectTrigger>
                  <SelectValue placeholder={customerName ? (openCredits.length ? 'Pick a credit sale' : 'No open credit sales') : 'Pick a customer first'} />
                </SelectTrigger>
                <SelectContent>
                  {openCredits.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {new Date(c.sale_date).toLocaleDateString()} · Total {Number(c.total_amount).toLocaleString()} · Paid {Math.round(c._paid).toLocaleString()} · Balance {c._balance.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={methodId} onValueChange={setMethodId}>
                <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  {methods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <Button className="mt-4" onClick={submit}>Record Payment</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Debt Payments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Linked sale</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell>{Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell>{r.payment_method_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.sale_transaction_id ? r.sale_transaction_id.slice(0, 8) : <span className="italic">unallocated</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.notes}</TableCell>
                </TableRow>
              ))}
              {recent.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No debt payments yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebtPaymentForm;