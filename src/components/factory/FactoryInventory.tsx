import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, AlertTriangle, Factory } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

interface Row {
  id: string;
  product: string;
  unit: string;
  quantity: number;
  threshold: number;
}

const UNITS = ['bags', '50kg Bags', 'kg'];

const FactoryInventory: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ product: '', unit: 'bags', quantity: '0', threshold: '0' });

  const fetchAll = async () => {
    const { data } = await supabase.from('factory_inventory').select('*').order('product');
    setRows((data as Row[]) || []);
  };
  const fetchProducts = async () => {
    const { data } = await supabase.from('product_category_items').select('product_name').order('product_name');
    if (data) setProducts([...new Set(data.map((d: any) => d.product_name))]);
  };
  useEffect(() => { fetchAll(); fetchProducts(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ product: '', unit: 'bags', quantity: '0', threshold: '0' });
    setShowForm(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ product: r.product, unit: r.unit, quantity: String(r.quantity), threshold: String(r.threshold) });
    setShowForm(true);
  };

  const save = async () => {
    const payload = {
      product: form.product.trim(),
      unit: form.unit,
      quantity: Number(form.quantity) || 0,
      threshold: Number(form.threshold) || 0,
    };
    if (!payload.product) { toast({ title: 'Product required', variant: 'destructive' }); return; }
    if (editing) {
      const { error } = await supabase.from('factory_inventory').update(payload).eq('id', editing.id);
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
      logAudit({ action: 'factory_inventory.update', entity: 'factory_inventory', entity_id: editing.id, before: editing, after: payload });
    } else {
      const { error, data } = await supabase.from('factory_inventory').upsert(payload, { onConflict: 'product,unit' }).select().single();
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
      logAudit({ action: 'factory_inventory.create', entity: 'factory_inventory', entity_id: (data as any)?.id, after: payload });
    }
    toast({ title: 'Saved' });
    setShowForm(false);
    fetchAll();
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.product} (${r.unit}) from factory inventory?`)) return;
    const { error } = await supabase.from('factory_inventory').delete().eq('id', r.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({ action: 'factory_inventory.delete', entity: 'factory_inventory', entity_id: r.id, before: r });
    fetchAll();
  };

  const lowCount = rows.filter(r => r.quantity <= r.threshold).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Factory Inventory</CardTitle>
        <div className="flex items-center gap-3">
          {lowCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {lowCount} low
            </Badge>
          )}
          <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const low = r.quantity <= r.threshold;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.product}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="text-right">{r.quantity}</TableCell>
                  <TableCell className="text-right">{r.threshold}</TableCell>
                  <TableCell>{low ? <Badge variant="destructive">Low</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No factory stock yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Factory Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product</Label>
              <Input list="factory-products" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Product name" />
              <datalist id="factory-products">
                {products.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label>Threshold</Label>
                <Input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default FactoryInventory;