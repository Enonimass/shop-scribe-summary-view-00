import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent } from '@/lib/units';

interface Shop { shop_id: string; shop_name: string }
interface Props {
  shops: Shop[];
  /** 'all' or specific shop_id. If undefined, internal selector is shown. */
  shopFilter?: string;
  /** Hide internal shop selector. */
  hideShopSelect?: boolean;
  title?: string;
}

type TierKey = 'gte100' | '10to99' | '1to9' | 'lt1';
const TIERS: { key: TierKey; label: string; test: (v: number) => boolean }[] = [
  { key: 'gte100', label: '≥100',  test: v => v >= 100 },
  { key: '10to99', label: '10-99', test: v => v >= 10 && v < 100 },
  { key: '1to9',   label: '1-9',   test: v => v >= 1  && v < 10 },
  { key: 'lt1',    label: '<1',    test: v => v > 0   && v < 1 },
];

const fmt = (n: number) => n === 0 ? '-' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = (part: number, total: number) => total === 0 ? '0%' : `${((part / total) * 100).toFixed(2)}%`;

const PurchasingPower: React.FC<Props> = ({ shops, shopFilter: externalShop, hideShopSelect, title = 'Purchasing Power' }) => {
  const [mode, setMode] = useState<'month' | 'all' | 'custom'>('month');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [internalShop, setInternalShop] = useState<string>('all');
  const shopFilter = externalShop ?? internalShop;

  const [tx, setTx] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    if (mode === 'all') return { start: '', end: '' };
    if (mode === 'month') {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
    return { start: from, end: to };
  }, [mode, month, from, to]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode, month, from, to, shopFilter]);

  const load = async () => {
    setLoading(true);
    let txQ = supabase.from('sales_transactions').select('id, shop_id, customer_name, sale_date');
    if (range.start) txQ = txQ.gte('sale_date', range.start);
    if (range.end) txQ = txQ.lte('sale_date', range.end);
    if (shopFilter && shopFilter !== 'all') txQ = txQ.eq('shop_id', shopFilter);

    let allTx: any[] = [];
    const PAGE = 1000;
    let page = 0;
    while (true) {
      const { data } = await txQ.range(page * PAGE, page * PAGE + PAGE - 1);
      if (!data || data.length === 0) break;
      allTx = allTx.concat(data);
      if (data.length < PAGE) break;
      page++;
    }

    const ids = allTx.map(t => t.id);
    let allItems: any[] = [];
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: it } = await supabase.from('sales_items').select('transaction_id, product, quantity, unit').in('transaction_id', ids.slice(i, i + CHUNK));
      allItems = allItems.concat(it || []);
    }
    setTx(allTx); setItems(allItems); setLoading(false);
  };

  // Compute per (shop, customer) bag-equivalent total
  const computed = useMemo(() => {
    const txById = new Map<string, any>();
    tx.forEach(t => txById.set(t.id, t));
    // key = shop_id|customer_name
    const perCustomer = new Map<string, { shop_id: string; customer: string; bags: number }>();
    items.forEach(it => {
      const t = txById.get(it.transaction_id);
      if (!t) return;
      const customer = (t.customer_name || '').trim();
      if (!customer) return;
      const key = `${t.shop_id}|${customer.toLowerCase()}`;
      const cur = perCustomer.get(key) || { shop_id: t.shop_id, customer, bags: 0 };
      cur.bags += toBagEquivalent(Number(it.quantity) || 0, it.unit);
      perCustomer.set(key, cur);
    });

    // Visible shops based on filter
    const visibleShops = (shopFilter && shopFilter !== 'all')
      ? shops.filter(s => s.shop_id === shopFilter)
      : shops;

    // shop_id -> { tier counts, tier qty }
    const perShop = new Map<string, { name: string; count: Record<TierKey, number>; qty: Record<TierKey, number> }>();
    visibleShops.forEach(s => {
      perShop.set(s.shop_id, {
        name: s.shop_name,
        count: { gte100: 0, '10to99': 0, '1to9': 0, lt1: 0 },
        qty:   { gte100: 0, '10to99': 0, '1to9': 0, lt1: 0 },
      });
    });

    perCustomer.forEach(({ shop_id, bags }) => {
      const row = perShop.get(shop_id);
      if (!row) return;
      const tier = TIERS.find(t => t.test(bags));
      if (!tier) return;
      row.count[tier.key] += 1;
      row.qty[tier.key] += bags;
    });

    // Column totals
    const colCount: Record<TierKey, number> = { gte100: 0, '10to99': 0, '1to9': 0, lt1: 0 };
    const colQty:   Record<TierKey, number> = { gte100: 0, '10to99': 0, '1to9': 0, lt1: 0 };
    perShop.forEach(r => {
      TIERS.forEach(t => { colCount[t.key] += r.count[t.key]; colQty[t.key] += r.qty[t.key]; });
    });
    const grandCount = Object.values(colCount).reduce((a, b) => a + b, 0);
    const grandQty = Object.values(colQty).reduce((a, b) => a + b, 0);

    return {
      rows: [...perShop.entries()].map(([shop_id, r]) => ({ shop_id, ...r })),
      colCount, colQty, grandCount, grandQty,
    };
  }, [tx, items, shops, shopFilter]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push('Number of customers per purchasing category');
    lines.push(['Outlet', ...TIERS.map(t => t.label), 'Total'].join(','));
    computed.rows.forEach(r => {
      const rowTotal = TIERS.reduce((s, t) => s + r.count[t.key], 0);
      lines.push([r.name, ...TIERS.map(t => r.count[t.key]), rowTotal].join(','));
    });
    lines.push(['T.Count', ...TIERS.map(t => computed.colCount[t.key]), computed.grandCount].join(','));
    lines.push('');
    lines.push('Quantity per purchasing category (70kg bag equivalents)');
    lines.push(['Outlet', ...TIERS.map(t => t.label), 'Total'].join(','));
    computed.rows.forEach(r => {
      const rowTotal = TIERS.reduce((s, t) => s + r.qty[t.key], 0);
      lines.push([r.name, ...TIERS.map(t => r.qty[t.key].toFixed(2)), rowTotal.toFixed(2)].join(','));
    });
    lines.push(['T.Quantity', ...TIERS.map(t => computed.colQty[t.key].toFixed(2)), computed.grandQty.toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `purchasing-power-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> {title}</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Scope</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Selected Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'month' && (
            <div><Label>Month</Label><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
          )}
          {mode === 'custom' && (
            <>
              <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </>
          )}
          {!hideShopSelect && externalShop === undefined && (
            <div>
              <Label>Shop</Label>
              <Select value={internalShop} onValueChange={setInternalShop}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {loading ? <div className="text-muted-foreground text-sm">Loading…</div> : (
          <div className="space-y-6">
            {/* Percentage strips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-muted-foreground mb-1">CUSTOMER % per tier</div>
                <div className="grid grid-cols-4 gap-1 text-sm">
                  {TIERS.map(t => (
                    <div key={t.key} className="text-center">
                      <div className="font-medium">{computed.colCount[t.key]}</div>
                      <div className="text-xs text-muted-foreground">{pct(computed.colCount[t.key], computed.grandCount)}</div>
                      <div className="text-xs">{t.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-muted-foreground mb-1">QUANTITY % per tier (bag-eq)</div>
                <div className="grid grid-cols-4 gap-1 text-sm">
                  {TIERS.map(t => (
                    <div key={t.key} className="text-center">
                      <div className="font-medium">{fmt(computed.colQty[t.key])}</div>
                      <div className="text-xs text-muted-foreground">{pct(computed.colQty[t.key], computed.grandQty)}</div>
                      <div className="text-xs">{t.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Counts table */}
            <div>
              <div className="text-sm font-semibold mb-1">Number of customers per purchasing category</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    {TIERS.map(t => <TableHead key={t.key} className="text-right">{t.label}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computed.rows.map(r => {
                    const rowTotal = TIERS.reduce((s, t) => s + r.count[t.key], 0);
                    return (
                      <TableRow key={r.shop_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        {TIERS.map(t => <TableCell key={t.key} className="text-right">{r.count[t.key] || '-'}</TableCell>)}
                        <TableCell className="text-right font-semibold">{rowTotal || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">T.Count</TableCell>
                    {TIERS.map(t => <TableCell key={t.key} className="text-right font-semibold">{computed.colCount[t.key] || '-'}</TableCell>)}
                    <TableCell className="text-right font-bold">{computed.grandCount}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="text-xs text-muted-foreground mt-1">GRAND TOTAL: {computed.grandCount} customers</div>
            </div>

            {/* Quantity table */}
            <div>
              <div className="text-sm font-semibold mb-1">Quantity per purchasing category (70kg bag-equivalents)</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    {TIERS.map(t => <TableHead key={t.key} className="text-right">{t.label}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computed.rows.map(r => {
                    const rowTotal = TIERS.reduce((s, t) => s + r.qty[t.key], 0);
                    return (
                      <TableRow key={r.shop_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        {TIERS.map(t => <TableCell key={t.key} className="text-right">{fmt(r.qty[t.key])}</TableCell>)}
                        <TableCell className="text-right font-semibold">{fmt(rowTotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">T.Quantity</TableCell>
                    {TIERS.map(t => <TableCell key={t.key} className="text-right font-semibold">{fmt(computed.colQty[t.key])}</TableCell>)}
                    <TableCell className="text-right font-bold">{fmt(computed.grandQty)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="text-xs text-muted-foreground mt-1">GRAND TOTAL: {fmt(computed.grandQty)} bags (70kg eq)</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PurchasingPower;