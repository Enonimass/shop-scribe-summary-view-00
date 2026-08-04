import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Undo2, Plus, Trash2, Factory } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { logAudit } from '@/lib/audit';
import { CANONICAL_UNITS, canonicalUnitKey, normalizeUnit, formatBags } from '@/lib/units';

interface Shop { shop_id: string; shop_name: string }

interface Props {
  shops: Shop[];
  /** Restrict the view and new returns to a single shop (seller usage). */
  scopedShopId?: string;
  /** Show the "Return to factory" button. */
  canCreate?: boolean;
}

interface ReturnRow {
  id: string;
  shop_id: string;
  product: string;
  unit: string;
  quantity: number;
  reason: string;
  return_date: string;
  recorded_by: string | null;
  status: string;
}

const ShopReturns: React.FC<Props> = ({ shops, scopedShopId, canCreate = false }) => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterShop, setFilterShop] = useState<string>(scopedShopId || 'all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    shop_id: scopedShopId || '',
    product: '',
    unit: 'bags',
    quantity: '',
    return_date: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const fetchRows = async () => {
    setLoading(true);
    let q = supabase.from('shop_returns').select('*').order('return_date', { ascending: false });
    if (scopedShopId) q = q.eq('shop_id', scopedShopId);
    else if (filterShop !== 'all') q = q.eq('shop_id', filterShop);
    if (from) q = q.gte('return_date', from);
    if (to) q = q.lte('return_date', to);
    const { data, error } = await q;
    if (error) console.error(error);
    setRows((data as ReturnRow[]) || []);
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('product_category_items').select('product_name').order('product_name');
    if (data) setProducts([...new Set(data.map((d: any) => d.product_name))]);
  };

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => { fetchRows(); }, [scopedShopId, filterShop, from, to]);

  const shopName = (id: string) => shops.find(s => s.shop_id === id)?.shop_name || id;

  const resetForm = () => setForm({
    shop_id: scopedShopId || '',
    product: '',
    unit: 'bags',
    quantity: '',
    return_date: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const submit = async () => {
    const qty = Number(form.quantity);
    if (!form.shop_id || !form.product || !form.unit || !qty || qty <= 0 || !form.reason.trim()) {
      toast({ title: 'Missing information', description: 'Shop, product, unit, a positive quantity and a reason are all required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const unit = normalizeUnit(form.unit);

    // 1. Deduct from the shop inventory (only if the shop holds that product/unit)
    const { data: inv } = await supabase
      .from('inventory')
      .select('*')
      .eq('shop_id', form.shop_id)
      .eq('product', form.product)
      .eq('unit', unit)
      .maybeSingle();

    if (!inv) {
      setSaving(false);
      toast({ title: 'Not in stock', description: `${form.product} (${unit}) is not in this shop's inventory`, variant: 'destructive' });
      return;
    }
    if (Number(inv.quantity) < qty) {
      setSaving(false);
      toast({ title: 'Not enough stock', description: `Only ${formatBags(Number(inv.quantity))} ${unit} available`, variant: 'destructive' });
      return;
    }
    await supabase.from('inventory').update({ quantity: Number(inv.quantity) - qty }).eq('id', inv.id);

    // 2. Add back to factory stock (match unit case-insensitively via canonical key)
    const key = canonicalUnitKey(unit);
    const { data: factoryRows } = await supabase.from('factory_inventory').select('*').eq('product', form.product);
    const fRow = (factoryRows || []).find((r: any) => (key ? canonicalUnitKey(r.unit) === key : r.unit === unit));
    if (fRow) {
      await supabase.from('factory_inventory').update({ quantity: Number(fRow.quantity) + qty }).eq('id', fRow.id);
    } else {
      await supabase.from('factory_inventory').insert({ product: form.product, unit, quantity: qty, threshold: 0 });
    }

    // 3. Record the return
    const { data: inserted, error } = await supabase.from('shop_returns').insert({
      shop_id: form.shop_id,
      product: form.product,
      unit,
      quantity: qty,
      reason: form.reason.trim(),
      return_date: form.return_date,
      recorded_by: profile?.username || null,
      status: 'received',
    }).select().single();

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    logAudit({
      action: 'shop_return.create',
      entity: 'shop_returns',
      entity_id: (inserted as any)?.id,
      shop_id: form.shop_id,
      after: { product: form.product, unit, quantity: qty, reason: form.reason },
    });
    toast({ title: 'Returned to factory', description: `${formatBags(qty)} ${unit} of ${form.product} moved back to factory stock` });
    setShowForm(false);
    resetForm();
    fetchRows();
  };

  const remove = async (r: ReturnRow) => {
    if (!confirm(`Delete this return record (${r.product} ${r.quantity} ${r.unit})? Stock is not reversed automatically.`)) return;
    const { error } = await supabase.from('shop_returns').delete().eq('id', r.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({ action: 'shop_return.delete', entity: 'shop_returns', entity_id: r.id, shop_id: r.shop_id, before: r });
    fetchRows();
  };

  const totals = useMemo(() => {
    const byUnit: Record<string, number> = {};
    rows.forEach(r => { byUnit[r.unit] = (byUnit[r.unit] || 0) + Number(r.quantity || 0); });
    return Object.entries(byUnit).map(([u, q]) => `${formatBags(q)} ${u}`).join('  •  ');
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" /> Returns to Factory
            </CardTitle>
            {canCreate && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Return to factory
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!scopedShopId && (
              <div className="space-y-1">
                <Label className="text-xs">Shop</Label>
                <Select value={filterShop} onValueChange={setFilterShop}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shops</SelectItem>
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          {totals && (
            <div className="p-2 rounded-md bg-muted/60 text-sm">
              <span className="font-semibold">Total returned:</span> {totals}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No returns recorded for this selection.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {!scopedShopId && <TableHead>Shop</TableHead>}
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{new Date(r.return_date).toLocaleDateString()}</TableCell>
                      {!scopedShopId && <TableCell>{shopName(r.shop_id)}</TableCell>}
                      <TableCell className="font-medium">{r.product}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBags(Number(r.quantity))}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={r.reason}>{r.reason}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.recorded_by || '—'}</TableCell>
                      <TableCell className="text-right">
                        {(profile?.role === 'admin' || profile?.role === 'logistics') && (
                          <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Return stock to factory</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!scopedShopId && (
              <div className="space-y-1">
                <Label>Shop</Label>
                <Select value={form.shop_id} onValueChange={v => setForm({ ...form, shop_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                  <SelectContent>
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Product</Label>
              <Select value={form.product} onValueChange={v => setForm({ ...form, product: v })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANONICAL_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Reason for return</Label>
              <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. wrong product delivered, damaged bags, slow moving stock" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record return'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShopReturns;
