import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Edit, Plus, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

const GOOD_DAYS = 30;
const LONG_DAYS = 90;

/** Marker used on sales_transactions rows created manually as an opening-balance debt. */
export const OPENING_BALANCE_TYPE = 'opening_balance';

const fmtKes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

type Bucket = 'good' | 'long' | 'bad';
const bucketOf = (days: number): Bucket => (days <= GOOD_DAYS ? 'good' : days <= LONG_DAYS ? 'long' : 'bad');
const bucketLabel: Record<Bucket, string> = { good: 'Good', long: 'Long', bad: 'Bad' };
const bucketVariant: Record<Bucket, 'outline' | 'secondary' | 'destructive'> = { good: 'outline', long: 'secondary', bad: 'destructive' };

interface Props {
  /** Shop ids available for assignment; falls back to shops seen on existing rows. */
  shops?: string[];
}

interface FormState {
  id?: string;
  customer_name: string;
  shop_id: string;
  amount: string;
  amount_paid: string;
  sale_date: string;
  due_date: string;
  notes: string;
  manual?: boolean;
}

const emptyForm = (): FormState => ({ customer_name: '', shop_id: '', amount: '', amount_paid: '0', sale_date: today(), due_date: '', notes: '', manual: true });

/**
 * Admin CRUD over debtors. Manual entries are stored as credit sales_transactions
 * flagged with sale_type = 'opening_balance' so every existing debt query,
 * aging bucket and debt-payment flow works on them unchanged.
 */
const DebtorsManager: React.FC<Props> = ({ shops = [] }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<{ name: string; shop_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'sale'>('all');
  const [bucketFilter, setBucketFilter] = useState<'all' | Bucket>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: tx }, { data: cust }] = await Promise.all([
      supabase.from('sales_transactions').select('*').eq('is_credit', true).order('sale_date', { ascending: false }),
      supabase.from('customers').select('name, shop_id').order('name'),
    ]);
    const ids = (tx || []).map((t: any) => t.id);
    let pays: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: p } = await supabase
        .from('debt_payments')
        .select('sale_transaction_id, amount, payment_date')
        .in('sale_transaction_id', ids.slice(i, i + 200));
      pays = pays.concat(p || []);
    }
    setRows(tx || []);
    setPayments(pays);
    setCustomers((cust as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const shopOptions = useMemo(() => {
    const set = new Set<string>(shops.filter(Boolean));
    rows.forEach((r) => r.shop_id && set.add(r.shop_id));
    customers.forEach((c) => c.shop_id && set.add(c.shop_id));
    return [...set].sort();
  }, [shops, rows, customers]);

  const enriched = useMemo(() => {
    return rows
      .map((r) => {
        const extra = payments
          .filter((p) => p.sale_transaction_id === r.id)
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const paid = Number(r.amount_paid || 0) + extra;
        const balance = Number(r.total_amount || 0) - paid;
        const age = Math.floor((Date.now() - new Date(r.sale_date).getTime()) / 86400000);
        return {
          ...r,
          _paid: paid,
          _balance: balance,
          _age: age,
          _bucket: bucketOf(age),
          _manual: r.sale_type === OPENING_BALANCE_TYPE,
        };
      })
      .filter((r) => r._balance > 0.01);
  }, [rows, payments]);

  const filtered = useMemo(() => {
    let out = enriched;
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((r) => (r.customer_name || '').toLowerCase().includes(s));
    }
    if (shopFilter !== 'all') out = out.filter((r) => r.shop_id === shopFilter);
    if (sourceFilter !== 'all') out = out.filter((r) => (sourceFilter === 'manual' ? r._manual : !r._manual));
    if (bucketFilter !== 'all') out = out.filter((r) => r._bucket === bucketFilter);
    return [...out].sort((a, b) => b._age - a._age);
  }, [enriched, search, shopFilter, sourceFilter, bucketFilter]);

  const totals = useMemo(() => ({
    balance: filtered.reduce((s, r) => s + r._balance, 0),
    debtors: new Set(filtered.map((r) => (r.customer_name || '').trim().toLowerCase())).size,
  }), [filtered]);

  const customerNames = useMemo(() => {
    const set = new Set<string>(customers.map((c) => c.name).filter(Boolean));
    enriched.forEach((r) => r.customer_name && set.add(r.customer_name));
    return [...set].sort();
  }, [customers, enriched]);

  const openCreate = () => { setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: any) => {
    setForm({
      id: r.id,
      customer_name: r.customer_name || '',
      shop_id: r.shop_id || '',
      amount: String(Number(r.total_amount || 0)),
      amount_paid: String(Number(r.amount_paid || 0)),
      sale_date: r.sale_date || today(),
      due_date: r.due_date || '',
      notes: r.product || '',
      manual: !!r._manual,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.customer_name.trim();
    const amount = Number(form.amount);
    if (!name) return toast({ title: 'Customer required', variant: 'destructive' });
    if (!form.shop_id) return toast({ title: 'Shop required', variant: 'destructive' });
    if (!amount || Number.isNaN(amount) || amount <= 0) return toast({ title: 'Amount must be greater than zero', variant: 'destructive' });

    setSaving(true);
    const paid = Number(form.amount_paid || 0);
    const payload: any = {
      customer_name: name,
      shop_id: form.shop_id,
      sale_date: form.sale_date || today(),
      due_date: form.due_date || null,
      total_amount: amount,
      amount_paid: Number.isNaN(paid) ? 0 : paid,
      is_credit: true,
    };
    if (form.manual !== false) {
      // Only manual entries carry the opening-balance marker and free-text note.
      payload.sale_type = OPENING_BALANCE_TYPE;
      payload.product = form.notes || null;
    }

    if (form.id) {
      const before = rows.find((r) => r.id === form.id);
      const { error } = await supabase.from('sales_transactions').update(payload).eq('id', form.id);
      setSaving(false);
      if (error) return toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      logAudit({
        action: 'update',
        entity: 'debtor',
        entity_id: form.id,
        shop_id: form.shop_id,
        before,
        after: payload,
        notes: form.manual === false ? 'Edited a sale-generated debt from the Debtors tab' : 'Edited a manual debt entry',
      });
      toast({ title: 'Debtor updated' });
    } else {
      const { data, error } = await supabase
        .from('sales_transactions')
        .insert({ ...payload, amount_paid: 0 })
        .select('id')
        .single();
      setSaving(false);
      if (error) return toast({ title: 'Could not add debtor', description: error.message, variant: 'destructive' });
      logAudit({ action: 'create', entity: 'debtor', entity_id: data?.id, shop_id: form.shop_id, after: payload });
      // Keep the customer directory in sync so the new debtor is searchable there too.
      const exists = customers.some((c) => c.shop_id === form.shop_id && c.name.toLowerCase() === name.toLowerCase());
      if (!exists) {
        await supabase.from('customers').insert({ name, shop_id: form.shop_id });
      }
      toast({ title: 'Debtor added' });
    }
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    const r = deleteTarget;
    setDeleteTarget(null);
    if (!r) return;
    const { error } = await supabase.from('sales_transactions').delete().eq('id', r.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      logAudit({
        action: 'delete',
        entity: 'debtor',
        entity_id: r.id,
        shop_id: r.shop_id,
        before: r,
        notes: r._manual ? 'Deleted a manual debt entry' : 'Deleted a sale-generated debt (its sale items were removed too)',
      });
    toast({ title: 'Debt entry deleted' });
    load();
  };

  return (
    <Card className="border-green-200">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">Debtors ({filtered.length} entries · {totals.debtors} debtors)</CardTitle>
          <div className="text-xs text-muted-foreground">Outstanding shown: <span className="font-semibold text-destructive">{fmtKes(totals.balance)}</span></div>
        </div>
        <Button size="sm" onClick={openCreate}><UserPlus className="w-4 h-4 mr-1" /> Add debtor</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><Label className="text-xs">Customer</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" /></div>
          <div>
            <Label className="text-xs">Shop</Label>
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                {shopOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="sale">From sale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={bucketFilter} onValueChange={(v: any) => setBucketFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="bad">Bad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="w-[90px]">Shop</TableHead>
                <TableHead className="w-[80px]">Issued</TableHead>
                <TableHead className="w-[80px]">Due</TableHead>
                <TableHead className="text-right w-[90px]">Billed</TableHead>
                <TableHead className="text-right w-[90px]">Paid</TableHead>
                <TableHead className="text-right w-[90px]">Balance</TableHead>
                <TableHead className="text-right w-[56px]">Age</TableHead>
                <TableHead className="w-[70px]">Status</TableHead>
                <TableHead className="w-[74px]">Source</TableHead>
                <TableHead className="w-[86px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell>{r.shop_id}</TableCell>
                  <TableCell>{new Date(r.sale_date).toLocaleDateString()}</TableCell>
                  <TableCell>{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKes(r.total_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKes(r._paid)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-destructive">{fmtKes(r._balance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r._age}d</TableCell>
                  <TableCell><Badge variant={bucketVariant[r._bucket as Bucket]}>{bucketLabel[r._bucket as Bucket]}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r._manual ? 'secondary' : 'outline'}>{r._manual ? 'Manual' : 'Sale'}</Badge>
                  </TableCell>
                  <TableCell>
                    {r._manual ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Edit in Sales</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && !filtered.length && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No debtors match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Edit debtor' : 'Add debtor'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Customer name</Label>
              <Input
                list="debtor-customer-names"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Pick existing or type a new name"
              />
              <datalist id="debtor-customer-names">
                {customerNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label>Shop</Label>
              <Select value={form.shop_id} onValueChange={(v) => setForm({ ...form, shop_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                <SelectContent>
                  {shopOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount owed (KES)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Date issued</Label>
                <Input type="date" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              <Plus className="w-4 h-4 mr-1" /> {form.id ? 'Save changes' : 'Add debtor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this debt entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${deleteTarget.customer_name} — ${fmtKes(deleteTarget._balance)} outstanding. This cannot be undone.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default DebtorsManager;