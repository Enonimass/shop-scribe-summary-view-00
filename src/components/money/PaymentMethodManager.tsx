import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

const KINDS = ['cash', 'mobile', 'bank', 'credit', 'other'];

const PaymentMethodManager = () => {
  const [methods, setMethods] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cash');

  const load = async () => {
    const { data } = await supabase.from('payment_methods').select('*').order('name');
    setMethods(data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('payment_methods').insert({ name: name.trim(), kind });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setName(''); setKind('cash'); load();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await supabase.from('payment_methods').update({ is_active }).eq('id', id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this payment method?')) return;
    await supabase.from('payment_methods').delete().eq('id', id);
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mpesa" />
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map(m => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.kind}</TableCell>
                <TableCell>
                  <Switch checked={m.is_active} onCheckedChange={(v) => toggleActive(m.id, v)} />
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="icon" onClick={() => remove(m.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodManager;