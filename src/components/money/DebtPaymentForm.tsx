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

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!customerName || !amt || amt <= 0 || !methodId) {
      toast({ title: 'Missing fields', description: 'Customer, amount and method required', variant: 'destructive' });
      return;
    }
    const method = methods.find(m => m.id === methodId);
    const { error } = await supabase.from('debt_payments').insert({
      shop_id: shopId, customer_name: customerName, amount: amt,
      payment_method_id: methodId, payment_method_name: method?.name,
      payment_date: paymentDate, recorded_by: profile?.username, notes,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Debt payment recorded', description: `${customerName} paid ${amt}` });
    setAmount(''); setCustomerName(''); setNotes('');
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
                  <TableCell className="text-sm text-muted-foreground">{r.notes}</TableCell>
                </TableRow>
              ))}
              {recent.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No debt payments yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebtPaymentForm;