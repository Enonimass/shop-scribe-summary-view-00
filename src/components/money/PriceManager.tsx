import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Save } from 'lucide-react';
import { PIVOT_UNITS, canonicalUnitKey, dbUnitForKey, getEffectiveUnitPrice } from '@/lib/units';

interface Shop { shop_id: string; shop_name: string; }

const PriceManager = ({ shops }: { shops: Shop[] }) => {
  const [selectedShop, setSelectedShop] = useState<string>(shops[0]?.shop_id || '');
  const [inventory, setInventory] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedShop && shops.length) setSelectedShop(shops[0].shop_id);
  }, [shops]);

  const load = async () => {
    if (!selectedShop) return;
    const [{ data: inv }, { data: pr }] = await Promise.all([
      supabase.from('inventory').select('product, unit').eq('shop_id', selectedShop),
      supabase.from('product_prices').select('*').eq('shop_id', selectedShop),
    ]);
    setInventory(inv || []);
    setPrices(pr || []);
  };
  useEffect(() => { load(); }, [selectedShop]);

  const products = useMemo(() => {
    const set = new Set<string>();
    (inventory || []).forEach(i => set.add(i.product));
    (prices || []).forEach(p => set.add(p.product));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [inventory, prices]);

  const explicitPrice = (product: string, unitKey: string) => {
    const row = prices.find(p => p.product === product && canonicalUnitKey(p.unit) === unitKey);
    return row ? String(row.price) : '';
  };

  const save = async (product: string, unitKey: string) => {
    const k = `${product}|${unitKey}`;
    const raw = drafts[k];
    if (raw === undefined) return;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) { toast({ title: 'Invalid price', variant: 'destructive' }); return; }
    const existing = prices.find(p => p.product === product && canonicalUnitKey(p.unit) === unitKey);
    const dbUnit = dbUnitForKey(unitKey);
    if (existing) {
      await supabase.from('product_prices').update({ price: val, unit: dbUnit }).eq('id', existing.id);
    } else {
      await supabase.from('product_prices').insert({ shop_id: selectedShop, product, unit: dbUnit, price: val });
    }
    toast({ title: 'Saved', description: `${product} (${unitKey}) = ${val}` });
    setDrafts(d => { const n = { ...d }; delete n[k]; return n; });
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Product Prices (per shop)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1">
          <Label>Shop</Label>
          <Select value={selectedShop} onValueChange={setSelectedShop}>
            <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
            <SelectContent>
              {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground">
          Tip: leave a cell blank and it will be derived (kg = 10kg/10, 10kg = kg×10).
          Edit a cell and click Save to persist it.
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              {PIVOT_UNITS.map(u => <TableHead key={u.key} className="text-right">{u.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map(product => (
              <TableRow key={product}>
                <TableCell className="font-medium">{product}</TableCell>
                {PIVOT_UNITS.map(u => {
                  const k = `${product}|${u.key}`;
                  const explicit = explicitPrice(product, u.key);
                  const derived = !explicit ? getEffectiveUnitPrice(prices, product, u.key) : null;
                  const draft = drafts[k];
                  const value = draft ?? explicit;
                  const dirty = draft !== undefined && draft !== explicit;
                  return (
                    <TableCell key={u.key} className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={value}
                          placeholder={derived ? `≈ ${derived.value.toFixed(2)}` : '—'}
                          onChange={(e) => setDrafts(d => ({ ...d, [k]: e.target.value }))}
                          className="w-24 text-right"
                        />
                        {dirty && (
                          <Button size="icon" variant="ghost" onClick={() => save(product, u.key)} title="Save">
                            <Save className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow><TableCell colSpan={PIVOT_UNITS.length + 1} className="text-center text-muted-foreground">No products for this shop yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PriceManager;