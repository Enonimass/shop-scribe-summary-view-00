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

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const list: { product: string; unit: string }[] = [];
    (inventory || []).forEach(i => {
      const k = `${i.product}|${i.unit}`;
      if (!seen.has(k)) { seen.add(k); list.push({ product: i.product, unit: i.unit }); }
    });
    return list.sort((a, b) => a.product.localeCompare(b.product));
  }, [inventory]);

  const getPrice = (product: string, unit: string) => {
    return prices.find(p => p.product === product && p.unit === unit)?.price ?? '';
  };

  const save = async (product: string, unit: string) => {
    const k = `${product}|${unit}`;
    const val = parseFloat(drafts[k] ?? `${getPrice(product, unit)}`);
    if (isNaN(val) || val < 0) { toast({ title: 'Invalid price', variant: 'destructive' }); return; }
    const existing = prices.find(p => p.product === product && p.unit === unit);
    if (existing) {
      await supabase.from('product_prices').update({ price: val }).eq('id', existing.id);
    } else {
      await supabase.from('product_prices').insert({ shop_id: selectedShop, product, unit, price: val });
    }
    toast({ title: 'Saved', description: `${product} (${unit}) = ${val}` });
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Price</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const k = `${r.product}|${r.unit}`;
              const current = drafts[k] ?? `${getPrice(r.product, r.unit)}`;
              return (
                <TableRow key={k}>
                  <TableCell className="font-medium">{r.product}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={current}
                      onChange={(e) => setDrafts(d => ({ ...d, [k]: e.target.value }))}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => save(r.product, r.unit)}>
                      <Save className="w-4 h-4 mr-1" /> Save
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No inventory items for this shop yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PriceManager;