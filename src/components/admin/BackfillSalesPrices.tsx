import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getEffectiveUnitPrice, canonicalUnitKey } from '@/lib/units';
import { Wrench, Loader2, Download } from 'lucide-react';

interface Props {
  shops: { shop_id: string; shop_name: string }[];
}

interface Summary {
  itemsScanned: number;
  itemsUpdated: number;
  itemsUnresolved: number;
  txUpdated: number;
  unresolved: { product: string; unit: string; count: number }[];
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const BackfillSalesPrices: React.FC<Props> = ({ shops }) => {
  const [shopId, setShopId] = useState<string>(shops[0]?.shop_id || '');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);

  const run = async () => {
    if (!shopId) return;
    setRunning(true);
    setSummary(null);
    setProgress('Loading prices…');

    // 1. Load prices for this shop.
    const { data: prices } = await supabase.from('product_prices').select('product, unit, price').eq('shop_id', shopId);
    const priceRows = (prices as any[]) || [];

    // 2. Load every transaction for this shop.
    setProgress('Loading transactions…');
    const { data: tx } = await supabase.from('sales_transactions').select('id, total_amount, amount_paid, is_credit').eq('shop_id', shopId);
    const txById = new Map<string, any>();
    (tx || []).forEach((t: any) => txById.set(t.id, t));
    const txIds = Array.from(txById.keys());

    // 3. Stream items in chunks.
    let itemsScanned = 0;
    let itemsUpdated = 0;
    let itemsUnresolved = 0;
    const unresolvedMap = new Map<string, number>();
    const touchedTx = new Set<string>();

    for (const batch of chunk(txIds, 200)) {
      const { data: items } = await supabase.from('sales_items').select('*').in('transaction_id', batch);
      const rows = (items as any[]) || [];
      itemsScanned += rows.length;
      setProgress(`Scanned ${itemsScanned} items…`);

      for (const it of rows) {
        const hasPrice = Number(it.unit_price || 0) > 0;
        if (hasPrice) continue;

        const k = canonicalUnitKey(it.unit);
        const eff = k ? getEffectiveUnitPrice(priceRows as any, it.product, k) : null;
        const price = eff && eff.value > 0 ? eff.value : 0;

        if (price <= 0) {
          itemsUnresolved++;
          const key = `${it.product}||${it.unit}`;
          unresolvedMap.set(key, (unresolvedMap.get(key) || 0) + 1);
          continue;
        }

        const qty = Number(it.quantity || 0);
        const line = price * qty;
        const { error } = await supabase.from('sales_items').update({
          unit_price: price,
          original_price: price,
          price_overridden: false,
          line_total: line,
        } as any).eq('id', it.id);
        if (!error) {
          itemsUpdated++;
          touchedTx.add(it.transaction_id);
        }
      }
    }

    // 4. Recompute totals for touched transactions.
    let txUpdated = 0;
    const touched = Array.from(touchedTx);
    setProgress(`Recomputing ${touched.length} transaction totals…`);
    for (const batch of chunk(touched, 200)) {
      const { data: items } = await supabase.from('sales_items').select('transaction_id, line_total').in('transaction_id', batch);
      const totals = new Map<string, number>();
      ((items as any[]) || []).forEach(it => {
        totals.set(it.transaction_id, (totals.get(it.transaction_id) || 0) + Number(it.line_total || 0));
      });
      for (const [id, total] of totals.entries()) {
        const t = txById.get(id);
        const patch: any = { total_amount: total };
        // Non-credit: money in = full total. Credit: leave amount_paid as-is.
        if (!t?.is_credit) patch.amount_paid = total;
        const { error } = await supabase.from('sales_transactions').update(patch).eq('id', id);
        if (!error) txUpdated++;
      }
    }

    const unresolved = Array.from(unresolvedMap.entries())
      .map(([k, count]) => {
        const [product, unit] = k.split('||');
        return { product, unit, count };
      })
      .sort((a, b) => b.count - a.count);

    setSummary({ itemsScanned, itemsUpdated, itemsUnresolved, txUpdated, unresolved });
    setProgress('');
    setRunning(false);
    toast({
      title: 'Backfill complete',
      description: `${itemsUpdated} items priced, ${txUpdated} transactions updated${itemsUnresolved ? `, ${itemsUnresolved} still missing price` : ''}.`,
    });
  };

  const downloadUnresolved = () => {
    if (!summary || !summary.unresolved.length) return;
    const csv = ['product,unit,rows_missing_price']
      .concat(summary.unresolved.map(r => `"${r.product.replace(/"/g, '""')}","${r.unit}",${r.count}`))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unresolved-prices-${shopId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Backfill sale prices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Fills in the money on existing sales that were recorded with quantity only. Uses each shop's price list — e.g. if 1 bag = 3,050 then 0.5 bag becomes 1,525. Transactions paid in cash also get their money-in set to match.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label>Shop</Label>
            <Select value={shopId} onValueChange={setShopId} disabled={running}>
              <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
              <SelectContent>
                {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={run} disabled={!shopId || running} className="w-full">
              {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : 'Run backfill'}
            </Button>
          </div>
        </div>
        {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
        {summary && (
          <div className="text-sm space-y-1 rounded-md border p-3 bg-muted/20">
            <div>Items scanned: <b>{summary.itemsScanned}</b></div>
            <div>Items priced: <b className="text-green-700">{summary.itemsUpdated}</b></div>
            <div>Transactions updated: <b>{summary.txUpdated}</b></div>
            {summary.itemsUnresolved > 0 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-destructive">Still missing price: <b>{summary.itemsUnresolved}</b></span>
                <Button variant="outline" size="sm" onClick={downloadUnresolved}>
                  <Download className="h-3 w-3 mr-1" /> CSV
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BackfillSalesPrices;