import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Edit, Save, Trash2, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

const money = (n: any) => (Math.round(Number(n || 0) * 100) / 100).toLocaleString();

/**
 * Admin-only editor for every money-in record: debt payments and prepayments
 * (plus how much of each prepayment has been used on sales). Every change is
 * written to the audit log.
 */
const PaymentsManager: React.FC<{ shops?: string[] }> = ({ shops = [] }) => {
  const [debtPayments, setDebtPayments] = useState<any[]>([]);
  const [prepayments, setPrepayments] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [shopFilter, setShopFilter] = useState('all');
  const [editing, setEditing] = useState<{ kind: 'debt' | 'prepay' | 'app'; id: string } | null>(null);
  const [values, setValues] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'debt' | 'prepay' | 'app'; row: any } | null>(null);

  const load = async () => {
    const [{ data: dp }, { data: pre }, { data: m }, { data: tx }] = await Promise.all([
      supabase.from('debt_payments').select('*').order('payment_date', { ascending: false }).limit(500),
      supabase.from('customer_prepayments').select('*').order('payment_date', { ascending: false }).limit(500),
      supabase.from('payment_methods').select('*').eq('is_active', true).order('name'),
      supabase.from('sales_transactions').select('id, customer_name, sale_date, shop_id, total_amount, is_credit').order('sale_date', { ascending: false }).limit(500),
    ]);
    setDebtPayments(dp || []); setPrepayments(pre || []); setMethods(m || []); setTransactions(tx || []);
    const ids = (pre || []).map((p: any) => p.id);
    let apps: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('prepayment_applications').select('*').in('prepayment_id', ids.slice(i, i + 200));
      apps = apps.concat(data || []);
    }
    setApplications(apps);
  };
  useEffect(() => { load(); }, []);

  const filteredDebts = useMemo(
    () => debtPayments.filter(d => shopFilter === 'all' || d.shop_id === shopFilter),
    [debtPayments, shopFilter],
  );
  const filteredPre = useMemo(
    () => prepayments.filter(p => shopFilter === 'all' || p.shop_id === shopFilter),
    [prepayments, shopFilter],
  );

  const startEdit = (kind: 'debt' | 'prepay' | 'app', row: any) => {
    setEditing({ kind, id: row.id });
    setValues({ ...row });
  };
  const cancelEdit = () => { setEditing(null); setValues({}); };

  const table = (kind: 'debt' | 'prepay' | 'app') =>
    kind === 'debt' ? 'debt_payments' : kind === 'prepay' ? 'customer_prepayments' : 'prepayment_applications';

  const save = async () => {
    if (!editing) return;
    const before = (editing.kind === 'debt' ? debtPayments : editing.kind === 'prepay' ? prepayments : applications)
      .find(r => r.id === editing.id);
    const patch: any = {};
    if (editing.kind === 'app') {
      patch.amount = Number(values.amount || 0);
      patch.transaction_id = values.transaction_id || null;
    } else {
      patch.customer_name = String(values.customer_name || '').trim();
      patch.shop_id = values.shop_id;
      patch.amount = Number(values.amount || 0);
      patch.payment_date = values.payment_date;
      patch.payment_method_id = values.payment_method_id || null;
      patch.payment_method_name = methods.find(m => m.id === values.payment_method_id)?.name || values.payment_method_name || null;
      patch.notes = values.notes || null;
      if (editing.kind === 'debt') patch.sale_transaction_id = values.sale_transaction_id || null;
    }
    if (patch.amount < 0) { toast({ title: 'Amount cannot be negative', variant: 'destructive' }); return; }
    const { error } = await supabase.from(table(editing.kind) as any).update(patch).eq('id', editing.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit({
      action: 'update', entity: table(editing.kind), entity_id: editing.id,
      shop_id: patch.shop_id ?? before?.shop_id ?? null, before, after: { ...before, ...patch },
      notes: 'Edited from Database Management → Payments',
    });
    toast({ title: 'Saved' });
    cancelEdit(); load();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { kind, row } = confirmDelete;
    const { error } = await supabase.from(table(kind) as any).delete().eq('id', row.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit({
      action: 'delete', entity: table(kind), entity_id: row.id,
      shop_id: row.shop_id ?? null, before: row, after: null,
      notes: 'Deleted from Database Management → Payments',
    });
    toast({ title: 'Deleted' });
    setConfirmDelete(null); load();
  };

  const usedFor = (prepaymentId: string) =>
    applications.filter(a => a.prepayment_id === prepaymentId).reduce((s, a) => s + Number(a.amount || 0), 0);

  const txLabel = (id: string | null) => {
    if (!id) return '—';
    const t = transactions.find(x => x.id === id);
    return t ? `${t.sale_date} · ${t.customer_name} · ${money(t.total_amount)}` : String(id).slice(0, 8);
  };

  const EditableMoneyRow = ({ kind, row }: { kind: 'debt' | 'prepay'; row: any }) => {
    const isEditing = editing?.kind === kind && editing.id === row.id;
    return (
      <TableRow className={isEditing ? 'bg-primary/5' : ''}>
        <TableCell>{isEditing ? <Input type="date" className="h-8" value={values.payment_date || ''} onChange={e => setValues({ ...values, payment_date: e.target.value })} /> : row.payment_date}</TableCell>
        <TableCell>{isEditing ? <Input className="h-8" value={values.customer_name || ''} onChange={e => setValues({ ...values, customer_name: e.target.value })} /> : row.customer_name}</TableCell>
        <TableCell>
          {isEditing ? (
            <Select value={values.shop_id} onValueChange={v => setValues({ ...values, shop_id: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{shops.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          ) : row.shop_id}
        </TableCell>
        <TableCell className="text-right">
          {isEditing
            ? <Input type="number" min="0" inputMode="decimal" step="0.01" className="h-8 text-right" value={values.amount ?? ''} onChange={e => setValues({ ...values, amount: e.target.value })} />
            : money(row.amount)}
        </TableCell>
        <TableCell>
          {isEditing ? (
            <Select value={values.payment_method_id || ''} onValueChange={v => setValues({ ...values, payment_method_id: v })}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>{methods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : (row.payment_method_name || '—')}
        </TableCell>
        {kind === 'debt' ? (
          <TableCell className="max-w-[220px] truncate">
            {isEditing ? (
              <Select value={values.sale_transaction_id || 'none'} onValueChange={v => setValues({ ...values, sale_transaction_id: v === 'none' ? null : v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Linked sale" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unallocated</SelectItem>
                  {transactions.filter(t => t.is_credit).slice(0, 200).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.sale_date} · {t.customer_name} · {money(t.total_amount)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : txLabel(row.sale_transaction_id)}
          </TableCell>
        ) : (
          <TableCell className="text-right">{money(usedFor(row.id))} / {money(row.amount)}</TableCell>
        )}
        <TableCell>{isEditing ? <Input className="h-8" value={values.notes || ''} onChange={e => setValues({ ...values, notes: e.target.value })} /> : (row.notes || '—')}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            {isEditing ? (
              <>
                <Button size="sm" onClick={save}><Save className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}><X className="w-3.5 h-3.5" /></Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => startEdit(kind, row)}><Edit className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmDelete({ kind, row })}><Trash2 className="w-3.5 h-3.5" /></Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardContent className="p-3 flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Shop</Label>
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                {shops.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Admin can edit or delete any payment. Every change is recorded in the audit log.</p>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardHeader><CardTitle className="text-base">Debt payments ({filteredDebts.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap">
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Shop</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead>
              <TableHead>Linked sale</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredDebts.map(row => <EditableMoneyRow key={row.id} kind="debt" row={row} />)}
              {filteredDebts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No debt payments.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardHeader><CardTitle className="text-base">Prepayments ({filteredPre.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap">
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Shop</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead>
              <TableHead className="text-right">Used / total</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredPre.map(row => <EditableMoneyRow key={row.id} kind="prepay" row={row} />)}
              {filteredPre.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No prepayments.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardHeader><CardTitle className="text-base">Prepaid amounts used on sales ({applications.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap">
            <TableHeader><TableRow>
              <TableHead>Prepayment</TableHead><TableHead>Sale</TableHead>
              <TableHead className="text-right">Amount used</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {applications.map(a => {
                const isEditing = editing?.kind === 'app' && editing.id === a.id;
                const pre = prepayments.find(p => p.id === a.prepayment_id);
                return (
                  <TableRow key={a.id} className={isEditing ? 'bg-primary/5' : ''}>
                    <TableCell>{pre ? `${pre.payment_date} · ${pre.customer_name}` : String(a.prepayment_id).slice(0, 8)}</TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      {isEditing ? (
                        <Select value={values.transaction_id || 'none'} onValueChange={v => setValues({ ...values, transaction_id: v === 'none' ? null : v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not linked</SelectItem>
                            {transactions.slice(0, 200).map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.sale_date} · {t.customer_name} · {money(t.total_amount)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : txLabel(a.transaction_id)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing
                        ? <Input type="number" min="0" inputMode="decimal" step="0.01" className="h-8 text-right" value={values.amount ?? ''} onChange={e => setValues({ ...values, amount: e.target.value })} />
                        : money(a.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={save}><Save className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}><X className="w-3.5 h-3.5" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit('app', a)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete({ kind: 'app', row: a })}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {applications.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No prepaid amounts used yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record and changes the customer's balance. The deletion is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PaymentsManager;
